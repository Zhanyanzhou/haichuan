/**
 * 公开 /uploads 素材的响应式派生图候选。
 *
 * 请求宽度是服务端允许档位的上限；srcset 描述符是实际输出宽度
 * min(档位, 原图展示宽度)。没有原图展示尺寸、动图、外链、blob 和已带 width
 * 的 URL 不生成 srcset。描述符不得写成请求档位，否则小图会被标成更大的 w。
 */

export const RESPONSIVE_UPLOADS_IMAGE_STRATEGY_VERSION = 2;
export const RESPONSIVE_UPLOADS_IMAGE_WIDTHS = [480, 800, 1200, 1680, 2400, 2880, 3840] as const;

const UPLOAD_IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|webp)(?:[?#]|$)/i;

export type PublicImageSourceFacts = {
  displayWidth: number;
  displayHeight: number;
  animated?: boolean;
  revision?: string;
};

function isUploadsImage(src: string): boolean {
  return src.startsWith("/uploads/") && UPLOAD_IMAGE_EXTENSION_PATTERN.test(src);
}

function withDerivativeParams(src: string, width: number): string | undefined {
  const candidate = new URL(src, "https://public-media.local");
  if (candidate.searchParams.has("width")) return undefined;
  candidate.searchParams.set("width", String(width));
  candidate.searchParams.set("rv", String(RESPONSIVE_UPLOADS_IMAGE_STRATEGY_VERSION));
  return `${candidate.pathname}${candidate.search}${candidate.hash}`;
}

export function buildResponsiveUploadsSrcSet(
  src: string | undefined,
  facts?: PublicImageSourceFacts | null,
): string | undefined {
  if (!src || !isUploadsImage(src) || !facts || facts.animated) return undefined;
  if (!Number.isInteger(facts.displayWidth) || facts.displayWidth <= 0) return undefined;
  if (!Number.isInteger(facts.displayHeight) || facts.displayHeight <= 0) return undefined;
  try {
    const base = new URL(src, "https://public-media.local");
    if (base.searchParams.has("width")) return undefined;
    const candidates: string[] = [];
    const seen = new Set<number>();
    for (const tier of RESPONSIVE_UPLOADS_IMAGE_WIDTHS) {
      const outputWidth = Math.min(tier, facts.displayWidth);
      if (seen.has(outputWidth)) continue;
      seen.add(outputWidth);
      const url = withDerivativeParams(src, tier);
      if (!url) return undefined;
      candidates.push(`${url} ${outputWidth}w`);
      if (facts.displayWidth <= tier) break;
    }
    return candidates.length > 0 ? candidates.join(", ") : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 单宽度派生 URL，用于只接受单个 URL 的场合（如 `<video poster>`）。
 * 派生端点只接受 RESPONSIVE_UPLOADS_IMAGE_WIDTHS 内的宽度。
 */
export function buildResponsiveUploadsDerivedUrl(
  src: string | undefined,
  width: number,
): string | undefined {
  if (!src || !isUploadsImage(src)) return undefined;
  if (!RESPONSIVE_UPLOADS_IMAGE_WIDTHS.includes(width as typeof RESPONSIVE_UPLOADS_IMAGE_WIDTHS[number])) {
    return undefined;
  }
  try {
    const candidate = new URL(src, "https://public-media.local");
    if (candidate.searchParams.has("width")) return src;
    return withDerivativeParams(src, width);
  } catch {
    return undefined;
  }
}
