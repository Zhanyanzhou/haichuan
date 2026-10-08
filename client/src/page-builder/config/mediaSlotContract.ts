/**
 * 媒体槽契约 —— 把「零 CLS + 正确候选」从两处调用点约定固化为结构保证。
 *
 * 背景：首页 7 张全尺寸 PNG 的修复里，srcset 起初只靠 Hero 与
 * DynamicTemplateRenderer 两处各自调用派生 helper 强制。任何新增公开媒体槽
 * 一旦漏接派生图，或写错 sizes/固有尺寸，又会退回直出原图或产生抖动。
 *
 * 这里让每个槽声明「固有纵横比 + 优先级 + 视口」，由 resolveMediaSlotImage
 * 统一派生 srcset / sizes / width / height / loading / fetchpriority / decoding；
 * resolveMediaSlotVideo 统一派生视频运行时属性（poster/preload/autoplay/loop）。
 * 新槽只声明契约，不再手写这些属性。
 */

import {
  buildResponsiveUploadsDerivedUrl,
  buildResponsiveUploadsSrcSet,
} from "@/utils/responsiveUploadsImage";

export type MediaSlotViewport = "desktop" | "mobile";

/** 归一化比例："16 / 9"、"16:9"、"4:5" 均可；无法解析返回 null。 */
export function parseMediaSlotRatio(
  ratio: string | undefined,
): { width: number; height: number; css: string } | null {
  if (!ratio) return null;
  const match = /^(\d+(?:\.\d+)?)\s*(?::|\/)\s*(\d+(?:\.\d+)?)$/.exec(ratio.trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!(width > 0) || !(height > 0)) return null;
  return { width, height, css: `${width} / ${height}` };
}

export interface MediaSlotContract {
  /** 槽类型；video 槽额外声明 poster/preload（当前无公开视频块，见下方字段）。 */
  kind?: "image" | "video";
  /** 槽声明的固有纵横比；零 CLS 的根因保证。 */
  ratio: string;
  viewport: MediaSlotViewport;
  /** 首屏 LCP 主图：eager + fetchpriority=high，sizes 取全宽。 */
  priority?: boolean;
  /** 固有参考宽度（px），用于 width/height 属性；缺省桌面 1600 / 移动 750。 */
  referenceWidth?: number;
  /** sizes 覆盖；缺省 100vw（宁可高估不低估）。动态模板图片槽由几何推导传入精确值。 */
  sizes?: string;
  /** 视频槽：poster 首帧图（同样走 /uploads 响应式派生）。 */
  poster?: string;
  /** 视频槽：preload 策略，默认 none（点播、不自动播放），奢侈品牌惯例。 */
  preload?: "none" | "metadata";
  /** 视频槽：是否自动播放 / 循环。 */
  autoplay?: boolean;
  loop?: boolean;
}

export interface ResolvedMediaSlotImage {
  srcSet?: string;
  sizes?: string;
  width?: number;
  height?: number;
  /** CSS aspect-ratio 值（如 "16 / 9"）。 */
  aspectRatio?: string;
  loading: "eager" | "lazy";
  fetchPriority?: "high";
  decoding: "async";
}

/** 桌面/移动默认固有参考宽度（px）。移动按竖屏通栏常见宽度取 750。 */
const DEFAULT_REFERENCE_WIDTH: Record<MediaSlotViewport, number> = {
  desktop: 1600,
  mobile: 750,
};

export function resolveMediaSlotImage(
  contract: MediaSlotContract,
  src: string | undefined,
): ResolvedMediaSlotImage {
  const srcSet = buildResponsiveUploadsSrcSet(src);
  const ratio = parseMediaSlotRatio(contract.ratio);
  const width = ratio
    ? contract.referenceWidth ?? DEFAULT_REFERENCE_WIDTH[contract.viewport]
    : undefined;
  const height = ratio && width !== undefined
    ? Math.round((width * ratio.height) / ratio.width)
    : undefined;
  const priority = Boolean(contract.priority);
  // 缺省 100vw 是安全上界：宁可高估多下一点，也不让候选宽度小于实际渲染宽度而发虚。
  // 精确 sizes 由知道几何的调用方通过 contract.sizes 传入（如动态模板图片槽）。
  const sizes = contract.sizes ?? "100vw";
  return {
    srcSet,
    sizes: srcSet ? sizes : undefined,
    width,
    height,
    aspectRatio: ratio?.css,
    loading: priority ? "eager" : "lazy",
    fetchPriority: priority ? "high" : undefined,
    decoding: "async",
  };
}

export interface ResolvedMediaSlotVideo {
  src?: string;
  /** 派生后的单 URL（<video poster> 只接受单 URL，无法 srcset）。 */
  poster?: string;
  preload: "none" | "metadata";
  autoPlay: boolean;
  loop: boolean;
  muted: boolean;
  playsInline: boolean;
  controls: boolean;
  width?: number;
  height?: number;
  /** CSS aspect-ratio 值（如 "16 / 9"）。 */
  aspectRatio?: string;
}

/** 视频 poster 单候选派生宽度：桌面取 1200（通栏常见），移动取 480（竖屏通栏）。 */
const VIDEO_POSTER_DERIVED_WIDTH: Record<MediaSlotViewport, number> = {
  desktop: 1200,
  mobile: 480,
};

/**
 * 解析视频槽运行时属性，兑现契约预留的 poster/preload/autoplay/loop 字段。
 * 奢侈品牌惯例：默认点播（preload=none、不自动播放）、静音内联播放、显式控件；
 * poster 走 /uploads 响应式派生（单 URL），非 /uploads 外链回退原 URL。
 */
export function resolveMediaSlotVideo(
  contract: MediaSlotContract,
  src: string | undefined,
): ResolvedMediaSlotVideo {
  const ratio = parseMediaSlotRatio(contract.ratio);
  const width = ratio
    ? contract.referenceWidth ?? DEFAULT_REFERENCE_WIDTH[contract.viewport]
    : undefined;
  const height = ratio && width !== undefined
    ? Math.round((width * ratio.height) / ratio.width)
    : undefined;
  const derivedPoster = contract.poster
    ? buildResponsiveUploadsDerivedUrl(
        contract.poster,
        VIDEO_POSTER_DERIVED_WIDTH[contract.viewport],
      )
    : undefined;
  return {
    src,
    poster: derivedPoster ?? contract.poster,
    preload: contract.preload ?? "none",
    autoPlay: Boolean(contract.autoplay),
    loop: Boolean(contract.loop),
    muted: true,
    playsInline: true,
    controls: true,
    width,
    height,
    aspectRatio: ratio?.css,
  };
}
