/**
 * 公开 /uploads 素材的响应式派生图候选。
 *
 * 服务端 `/uploads/...?width=480|800|1200|1680` 会实时转 WebP（见
 * server/src/modules/upload/responsive-public-media.ts 的 RESPONSIVE_PUBLIC_IMAGE_WIDTHS）。
 * 这里只负责拼出 srcset；外链、blob:、后台预览端点以及已带 width 的 URL 一律不派生，
 * 避免把任意 URL 交给派生端点或覆盖既有缩放参数。
 */

export const RESPONSIVE_UPLOADS_IMAGE_WIDTHS = [480, 800, 1200, 1680] as const;

// 与服务端 ALLOWED_IMAGE_EXTENSIONS 对齐，避免给非图片路径生成会被拒绝的候选。
const UPLOAD_IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|webp)(?:[?#]|$)/i;

export function buildResponsiveUploadsSrcSet(src: string | undefined): string | undefined {
  if (!src || !src.startsWith("/uploads/")) return undefined;
  if (!UPLOAD_IMAGE_EXTENSION_PATTERN.test(src)) return undefined;
  try {
    const base = new URL(src, "https://public-media.local");
    if (base.searchParams.has("width")) return undefined;
    return RESPONSIVE_UPLOADS_IMAGE_WIDTHS.map((width) => {
      const candidate = new URL(src, "https://public-media.local");
      candidate.searchParams.set("width", String(width));
      return `${candidate.pathname}${candidate.search}${candidate.hash} ${width}w`;
    }).join(", ");
  } catch {
    return undefined;
  }
}

/**
 * 单宽度派生 URL，用于只接受单个 URL 的场合（如 `<video poster>`）。
 * 派生端点只接受 RESPONSIVE_UPLOADS_IMAGE_WIDTHS 内的宽度；调用方须传入集合内值。
 */
export function buildResponsiveUploadsDerivedUrl(
  src: string | undefined,
  width: number,
): string | undefined {
  if (!src || !src.startsWith("/uploads/")) return undefined;
  if (!UPLOAD_IMAGE_EXTENSION_PATTERN.test(src)) return undefined;
  if (!RESPONSIVE_UPLOADS_IMAGE_WIDTHS.includes(width as (typeof RESPONSIVE_UPLOADS_IMAGE_WIDTHS)[number])) {
    return undefined;
  }
  try {
    const candidate = new URL(src, "https://public-media.local");
    if (candidate.searchParams.has("width")) return src;
    candidate.searchParams.set("width", String(width));
    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return undefined;
  }
}
