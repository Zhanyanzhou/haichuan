import { useEffect, useState } from "react";
import api, { requestStatus } from "@/services/httpClient";
import { currentSessionEpoch } from "@/services/sessionEpoch";
import { useAuthStore } from "@/store/authStore";

const MANAGED_PAGE_ASSET_PREFIX = "/uploads/page-assets/";
const STAFF_MEDIA_PREVIEW_PATH = "/api/upload/media/preview-by-storage-key?";

const objectUrlByPreviewUrl = new Map<string, string>();
const inflightByPreviewUrl = new Map<string, Promise<string>>();

function sessionCacheKey(requestUrl: string): string {
  // 同一浏览器切换后台身份后，不得沿用上一个身份取回的私有 blob。
  return `${currentSessionEpoch("admin")}|${requestUrl}`;
}

/**
 * 模板保存的始终是受治理的正式素材引用；后台编辑与预览改走
 * 需登录的预览端点，避免尚未完成公开授权的素材被误判为失效。
 * 公开 Renderer 不调用此转换，仍由 `/uploads/page-assets/*` 强制授权门禁。
 */
export function resolveManagedTemplateMediaPreviewUrl(value: string | undefined): string {
  if (!value?.startsWith(MANAGED_PAGE_ASSET_PREFIX)) return value ?? "";
  const path = value.split(/[?#]/, 1)[0];
  const storageKey = path.slice("/uploads/".length);
  const segments = storageKey.split("/");
  if (
    segments.length < 2
    || segments.some((segment) => !segment || segment === "." || segment === "..")
    || storageKey.includes("\\")
  ) return value;
  return `${STAFF_MEDIA_PREVIEW_PATH}storageKey=${encodeURIComponent(storageKey)}`;
}

export function isStaffManagedMediaPreviewUrl(value: string | undefined): boolean {
  return Boolean(value?.startsWith(STAFF_MEDIA_PREVIEW_PATH));
}

/**
 * srcDoc iframe 的文档地址是 about:srcdoc，图片/CSS 子资源可能带不上登录 Cookie。
 * 由宿主的后台 API 客户端取图后转成 blob: URL，请求发生在父文档，iframe 只负责显示。
 * 客户端统一处理访问 Cookie 过期后的会话刷新，避免已登录编辑器直接显示 401。
 */
export async function loadManagedTemplateMediaObjectUrl(source: string): Promise<string> {
  const requestUrl = resolveManagedTemplateMediaPreviewUrl(source);
  if (!isStaffManagedMediaPreviewUrl(requestUrl)) return requestUrl;
  const key = sessionCacheKey(requestUrl);
  const cached = objectUrlByPreviewUrl.get(key);
  if (cached) return cached;
  const inflight = inflightByPreviewUrl.get(key);
  if (inflight) return inflight;
  const pending = api.get<Blob>(requestUrl.slice("/api".length), {
    responseType: "blob",
    sessionDomain: "admin",
    headers: { "X-Session-Domain": "admin" },
    suppressGlobalError: true,
  }).then(({ data: blob }) => {
    if (!(blob instanceof Blob)) throw new Error("managed-media-preview:invalid");
    if (blob.size <= 0) throw new Error("managed-media-preview:empty");
    const objectUrl = URL.createObjectURL(blob);
    objectUrlByPreviewUrl.set(sessionCacheKey(requestUrl), objectUrl);
    return objectUrl;
  }).catch((error: unknown) => {
    const status = requestStatus(error);
    if (status) throw new Error(`managed-media-preview:${status}`);
    throw error;
  }).finally(() => {
    inflightByPreviewUrl.delete(key);
  });
  inflightByPreviewUrl.set(key, pending);
  return pending;
}

export function resetManagedTemplateMediaObjectUrlCacheForTests(): void {
  objectUrlByPreviewUrl.clear();
  inflightByPreviewUrl.clear();
}

export type ManagedTemplateMediaDisplayStatus = "idle" | "loading" | "ready" | "error";

export function useManagedTemplateMediaDisplayUrl(
  src: string | undefined,
  hostFetch: boolean,
): { displaySrc: string; status: ManagedTemplateMediaDisplayStatus } {
  // 登录、登出和刷新都会推进代次；已挂载的画布也必须随身份变化丢弃旧 blob。
  const sessionEpoch = useAuthStore(() => currentSessionEpoch("admin"));
  const raw = src?.trim() ?? "";
  const requestUrl = raw ? resolveManagedTemplateMediaPreviewUrl(raw) : "";
  const shouldHostFetch = hostFetch && isStaffManagedMediaPreviewUrl(requestUrl);
  const cached = shouldHostFetch ? objectUrlByPreviewUrl.get(sessionCacheKey(requestUrl)) : undefined;
  const [displaySrc, setDisplaySrc] = useState(() => {
    if (!shouldHostFetch) return requestUrl;
    return cached ?? "";
  });
  const [status, setStatus] = useState<ManagedTemplateMediaDisplayStatus>(() => {
    if (!raw) return "idle";
    if (!shouldHostFetch) return "ready";
    return cached ? "ready" : "loading";
  });
  const [resolvedEpoch, setResolvedEpoch] = useState(sessionEpoch);

  useEffect(() => {
    setResolvedEpoch(sessionEpoch);
    if (!raw) {
      setDisplaySrc("");
      setStatus("idle");
      return;
    }
    if (!shouldHostFetch) {
      setDisplaySrc(requestUrl);
      setStatus("ready");
      return;
    }
    const hit = objectUrlByPreviewUrl.get(sessionCacheKey(requestUrl));
    if (hit) {
      setDisplaySrc(hit);
      setStatus("ready");
      return;
    }
    let cancelled = false;
    setDisplaySrc("");
    setStatus("loading");
    void loadManagedTemplateMediaObjectUrl(requestUrl).then(
      (url) => {
        if (!cancelled) {
          setDisplaySrc(url);
          setStatus("ready");
        }
      },
      () => {
        if (!cancelled) {
          setDisplaySrc("");
          setStatus("error");
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [raw, requestUrl, shouldHostFetch, sessionEpoch]);

  return resolvedEpoch !== sessionEpoch && shouldHostFetch
    ? { displaySrc: "", status: "loading" }
    : { displaySrc, status };
}
