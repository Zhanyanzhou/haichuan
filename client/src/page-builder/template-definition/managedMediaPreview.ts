import { useEffect, useState } from "react";

const MANAGED_PAGE_ASSET_PREFIX = "/uploads/page-assets/";
const STAFF_MEDIA_PREVIEW_PATH = "/api/upload/media/preview-by-storage-key?";

const objectUrlByPreviewUrl = new Map<string, string>();
const inflightByPreviewUrl = new Map<string, Promise<string>>();

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
 * 由宿主 window.fetch 取图后转成 blob: URL，请求发生在父文档，iframe 只负责显示。
 */
export async function loadManagedTemplateMediaObjectUrl(source: string): Promise<string> {
  const requestUrl = resolveManagedTemplateMediaPreviewUrl(source);
  if (!isStaffManagedMediaPreviewUrl(requestUrl)) return requestUrl;
  const cached = objectUrlByPreviewUrl.get(requestUrl);
  if (cached) return cached;
  const inflight = inflightByPreviewUrl.get(requestUrl);
  if (inflight) return inflight;
  const pending = fetch(requestUrl, {
    credentials: "same-origin",
    headers: { "X-Session-Domain": "admin" },
  }).then(async (response) => {
    if (!response.ok) throw new Error(`managed-media-preview:${response.status}`);
    const blob = await response.blob();
    if (blob.size <= 0) throw new Error("managed-media-preview:empty");
    const objectUrl = URL.createObjectURL(blob);
    objectUrlByPreviewUrl.set(requestUrl, objectUrl);
    return objectUrl;
  }).finally(() => {
    inflightByPreviewUrl.delete(requestUrl);
  });
  inflightByPreviewUrl.set(requestUrl, pending);
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
  const raw = src?.trim() ?? "";
  const requestUrl = raw ? resolveManagedTemplateMediaPreviewUrl(raw) : "";
  const shouldHostFetch = hostFetch && isStaffManagedMediaPreviewUrl(requestUrl);
  const cached = shouldHostFetch ? objectUrlByPreviewUrl.get(requestUrl) : undefined;
  const [displaySrc, setDisplaySrc] = useState(() => {
    if (!shouldHostFetch) return requestUrl;
    return cached ?? "";
  });
  const [status, setStatus] = useState<ManagedTemplateMediaDisplayStatus>(() => {
    if (!raw) return "idle";
    if (!shouldHostFetch) return "ready";
    return cached ? "ready" : "loading";
  });

  useEffect(() => {
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
    const hit = objectUrlByPreviewUrl.get(requestUrl);
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
  }, [raw, requestUrl, shouldHostFetch]);

  return { displaySrc, status };
}
