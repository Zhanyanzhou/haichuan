import { isCancel } from "axios";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import api, { requestStatus } from "@/services/httpClient";
import { currentSessionEpoch, isCurrentSessionEpoch, isStaleSessionResponseError, StaleSessionResponseError } from "@/services/sessionEpoch";
import { useAuthStore } from "@/store/authStore";
import { RESPONSIVE_UPLOADS_IMAGE_WIDTHS } from "@/utils/responsiveUploadsImage";

const MANAGED_PAGE_ASSET_PREFIX = "/uploads/page-assets/";
const STAFF_MEDIA_PREVIEW_PATH = "/api/upload/media/preview-by-storage-key?";

const blobByPreviewUrl = new Map<string, Blob>();
const derivedBlobs = new Map<string, Blob>();
const MAX_DERIVED_BLOBS = 24;
const MAX_DERIVED_BYTES = 24 * 1024 * 1024;
let derivedBytes = 0;
const objectUrlByPreviewUrl = new Map<string, string>();
const inflightByPreviewUrl = new Map<string, Promise<Blob>>();
const viewIds = new WeakMap<object, number>();
let nextViewId = 1;

/** 画布图片所在窗口。Puck 把节点画进 iframe，blob 必须由那个文档创建才显示得出来。 */
export type ManagedMediaObjectUrlSource = Pick<typeof globalThis, "URL">;

function sessionCacheKey(requestUrl: string, epoch = currentSessionEpoch("admin")): string {
  // 同一浏览器切换后台身份后，不得沿用上一个身份取回的私有 blob。
  return `${epoch}|${requestUrl}`;
}

/**
 * 模板保存的始终是受治理的正式素材引用；后台编辑与预览改走
 * 需登录的预览端点，避免尚未完成公开授权的素材被误判为失效。
 * 公开 Renderer 不调用此转换，仍由 `/uploads/page-assets/*` 强制授权门禁。
 */
export function resolveManagedTemplateMediaPreviewUrl(
  value: string | undefined,
  width?: typeof RESPONSIVE_UPLOADS_IMAGE_WIDTHS[number],
): string {
  if (!value?.startsWith(MANAGED_PAGE_ASSET_PREFIX)) return value ?? "";
  const path = value.split(/[?#]/, 1)[0];
  const storageKey = path.slice("/uploads/".length);
  const segments = storageKey.split("/");
  if (
    segments.length < 2
    || segments.some((segment) => !segment || segment === "." || segment === "..")
    || storageKey.includes("\\")
  ) return value;
  // 按显示尺寸选择派生档位；裁剪与像素检查仍可读取原图。
  const size = width !== undefined && RESPONSIVE_UPLOADS_IMAGE_WIDTHS.includes(width)
    ? `&width=${width}`
    : "";
  return `${STAFF_MEDIA_PREVIEW_PATH}storageKey=${encodeURIComponent(storageKey)}${size}`;
}

export function isStaffManagedMediaPreviewUrl(value: string | undefined): boolean {
  return Boolean(value?.startsWith(STAFF_MEDIA_PREVIEW_PATH));
}

function viewCacheId(view: object): number {
  const existing = viewIds.get(view);
  if (existing) return existing;
  const id = nextViewId;
  nextViewId += 1;
  viewIds.set(view, id);
  return id;
}

function objectUrlCacheKey(requestKey: string, view: object): string {
  return `${requestKey}\u0000${viewCacheId(view)}`;
}

function rememberDerivedBlob(key: string, blob: Blob) {
  if (blob.size > MAX_DERIVED_BYTES) return;
  const previous = derivedBlobs.get(key);
  if (previous) {
    derivedBlobs.delete(key);
    derivedBytes -= previous.size;
  }
  derivedBlobs.set(key, blob);
  derivedBytes += blob.size;
  while (derivedBlobs.size > MAX_DERIVED_BLOBS || derivedBytes > MAX_DERIVED_BYTES) {
    const oldest = derivedBlobs.entries().next().value;
    if (!oldest) break;
    derivedBlobs.delete(oldest[0]);
    derivedBytes -= oldest[1].size;
  }
}

async function loadManagedTemplateMediaBlob(requestUrl: string, epoch = currentSessionEpoch("admin")): Promise<Blob> {
  const key = sessionCacheKey(requestUrl, epoch);
  const derivative = new URLSearchParams(requestUrl.slice(STAFF_MEDIA_PREVIEW_PATH.length)).has("width");
  const cache = derivative ? derivedBlobs : blobByPreviewUrl;
  const cached = cache.get(key);
  if (cached) {
    if (derivative) {
      cache.delete(key);
      cache.set(key, cached);
    }
    return cached;
  }
  const inflight = inflightByPreviewUrl.get(key);
  if (inflight) return inflight;
  const pending = api.get<Blob>(requestUrl.slice("/api".length), {
    responseType: "blob",
    sessionDomain: "admin",
    headers: { "X-Session-Domain": "admin" },
    suppressGlobalError: true,
  }).then(({ data: blob }) => {
    if (!isCurrentSessionEpoch("admin", epoch)) throw new StaleSessionResponseError("admin");
    if (!(blob instanceof Blob)) throw new Error("managed-media-preview:invalid");
    if (blob.size <= 0) throw new Error("managed-media-preview:empty");
    if (derivative) rememberDerivedBlob(key, blob);
    else cache.set(key, blob);
    return blob;
  }).catch((error: unknown) => {
    const status = requestStatus(error);
    if (status) throw new Error(`managed-media-preview:${status}`);
    throw error;
  }).finally(() => {
    if (inflightByPreviewUrl.get(key) === pending) inflightByPreviewUrl.delete(key);
  });
  inflightByPreviewUrl.set(key, pending);
  return pending;
}

function getOrCreateOriginalObjectUrl(key: string, view: ManagedMediaObjectUrlSource, blob: Blob): string {
  const cached = objectUrlByPreviewUrl.get(key);
  if (cached) return cached;
  const url = view.URL.createObjectURL(blob);
  objectUrlByPreviewUrl.set(key, url);
  return url;
}

/**
 * srcDoc iframe 的文档地址是 about:srcdoc，图片子资源可能带不上登录 Cookie。
 * 由宿主的后台 API 客户端取回字节，再在实际显示图片的那个文档里生成 blob: URL。
 * 父文档创建的 blob 放进 Puck iframe 后，图片请求会失败，画布就只剩占位。
 * 客户端统一处理访问 Cookie 过期后的会话刷新，避免已登录编辑器直接显示 401。
 */
export async function loadManagedTemplateMediaObjectUrl(
  source: string,
  view: ManagedMediaObjectUrlSource = globalThis,
): Promise<string> {
  const requestUrl = resolveManagedTemplateMediaPreviewUrl(source);
  if (!isStaffManagedMediaPreviewUrl(requestUrl)) return requestUrl;
  const epoch = currentSessionEpoch("admin");
  const requestKey = sessionCacheKey(requestUrl, epoch);
  const urlKey = objectUrlCacheKey(requestKey, view);
  const cached = objectUrlByPreviewUrl.get(urlKey);
  if (cached) return cached;
  const blob = await loadManagedTemplateMediaBlob(requestUrl, epoch);
  if (!isCurrentSessionEpoch("admin", epoch)) throw new StaleSessionResponseError("admin");
  return getOrCreateOriginalObjectUrl(urlKey, view, blob);
}

export function resetManagedTemplateMediaObjectUrlCacheForTests(): void {
  blobByPreviewUrl.clear();
  derivedBlobs.clear();
  derivedBytes = 0;
  objectUrlByPreviewUrl.clear();
  inflightByPreviewUrl.clear();
}

export type ManagedTemplateMediaDisplayStatus = "idle" | "loading" | "ready" | "error";

type ManagedMediaDisplayOptions = {
  width?: typeof RESPONSIVE_UPLOADS_IMAGE_WIDTHS[number];
  defer?: boolean;
};

type DerivedDisplayUrl = {
  url: string;
  view: ManagedMediaObjectUrlSource;
  released: boolean;
};

function releaseDerivedDisplayUrl(display: DerivedDisplayUrl | undefined) {
  if (!display || display.released) return;
  display.released = true;
  display.view.URL.revokeObjectURL(display.url);
}

function readOwnerView(
  owner?: { readonly current: Element | null } | null,
): ManagedMediaObjectUrlSource {
  return owner?.current?.ownerDocument?.defaultView ?? globalThis;
}

export function useManagedTemplateMediaDisplayUrl(
  src: string | undefined,
  hostFetch: boolean,
  owner?: { readonly current: Element | null } | null,
  { width, defer = false }: ManagedMediaDisplayOptions = {},
): { displaySrc: string; status: ManagedTemplateMediaDisplayStatus } {
  // 登录、登出和刷新都会推进代次；已挂载的画布也必须随身份变化丢弃旧 blob。
  const sessionEpoch = useAuthStore(() => currentSessionEpoch("admin"));
  const raw = src?.trim() ?? "";
  const originalUrl = resolveManagedTemplateMediaPreviewUrl(raw);
  const shouldHostFetch = hostFetch && isStaffManagedMediaPreviewUrl(originalUrl);
  const requestUrl = shouldHostFetch ? resolveManagedTemplateMediaPreviewUrl(raw, width) : originalUrl;
  const useDerivative = requestUrl !== originalUrl;
  const requestKey = sessionCacheKey(requestUrl, sessionEpoch);
  const cached = shouldHostFetch && !defer && !useDerivative
    ? objectUrlByPreviewUrl.get(objectUrlCacheKey(requestKey, readOwnerView(owner)))
    : undefined;
  const [resolved, setResolved] = useState<{
    raw: string;
    epoch: number;
    key: string;
    url: string;
    derived?: DerivedDisplayUrl;
  } | null>(null);
  const [failed, setFailed] = useState<{ raw: string; key: string } | null>(null);
  const committedDerived = useRef<DerivedDisplayUrl>();

  const previous = resolved?.raw === raw && resolved.epoch === sessionEpoch
    && !resolved.derived?.released ? resolved : null;
  const displaySrc = shouldHostFetch ? cached ?? previous?.url ?? "" : originalUrl;
  const displayedDerived = shouldHostFetch && !cached ? previous?.derived : undefined;

  // DOM 提交后才释放上一次显示的地址，异步取得的新地址可能还在等 React 提交。
  useLayoutEffect(() => {
    const previousDisplay = committedDerived.current;
    committedDerived.current = displayedDerived;
    if (previousDisplay !== displayedDerived) releaseDerivedDisplayUrl(previousDisplay);
  }, [displayedDerived]);
  useEffect(() => () => releaseDerivedDisplayUrl(committedDerived.current), []);

  useEffect(() => {
    if (!shouldHostFetch || defer) return;
    let cancelled = false;
    let derived: DerivedDisplayUrl | undefined;
    const isActive = () => !cancelled && isCurrentSessionEpoch("admin", sessionEpoch);
    setFailed(null);
    void (async () => {
      let blob: Blob;
      try {
        blob = await loadManagedTemplateMediaBlob(requestUrl, sessionEpoch);
      } catch (error) {
        if (!isActive() || isCancel(error) || isStaleSessionResponseError(error) || !useDerivative) throw error;
        blob = await loadManagedTemplateMediaBlob(originalUrl, sessionEpoch);
      }
      if (!isActive()) return;
      // 请求期间 Puck 可能换画布文档，取到字节后才决定在哪个窗口创建 URL。
      const view = readOwnerView(owner);
      const url = useDerivative
        ? view.URL.createObjectURL(blob)
        : getOrCreateOriginalObjectUrl(objectUrlCacheKey(requestKey, view), view, blob);
      if (useDerivative) derived = { url, view, released: false };
      setResolved({ raw, epoch: sessionEpoch, key: requestKey, url, derived });
    })().catch((error: unknown) => {
      if (isActive() && !isCancel(error) && !isStaleSessionResponseError(error)) setFailed({ raw, key: requestKey });
    });
    return () => {
      cancelled = true;
      if (derived !== committedDerived.current) releaseDerivedDisplayUrl(derived);
    };
  }, [defer, originalUrl, owner, raw, requestKey, requestUrl, sessionEpoch, shouldHostFetch, useDerivative]);

  if (!raw) return { displaySrc, status: "idle" };
  if (!shouldHostFetch) return { displaySrc, status: "ready" };
  if (defer) return { displaySrc, status: "loading" };
  if (cached || previous?.key === requestKey) return { displaySrc, status: "ready" };
  if (failed?.raw === raw && failed.key === requestKey) return { displaySrc, status: "error" };
  return { displaySrc, status: "loading" };
}
