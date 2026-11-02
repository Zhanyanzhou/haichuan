/** 公开商品媒体的缩放宽白名单，与服务端 RESIZE_WIDTHS 一致。 */
export const PUBLIC_MEDIA_WIDTHS = [480, 800, 1200] as const;

export type PublicMediaWidth = (typeof PUBLIC_MEDIA_WIDTHS)[number];

/**
 * 给自有商品媒体端点加上 width。服务端会返回对应宽度的 WebP。
 * 已带 width、占位图和外链保持原样，避免重复参数或改写非媒体地址。
 */
export function withPublicMediaWidth(url: string, width: PublicMediaWidth): string {
  if (!url || !url.includes("/media/") || url.includes("width=")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}width=${width}`;
}
