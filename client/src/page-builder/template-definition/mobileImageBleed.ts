import type { CSSProperties } from "react";
import type { DynamicTemplateRenderPlanNode } from "./renderPlan";

/**
 * 手机上照片贴边用的内缩量，单位是 px。
 * 深色画布的内边距会在照片四周露出黑框；全幅主图则本来就该贴齐这一节的边缘。
 * 文字不使用这份内缩，继续留在原来的边距里。
 */
export type MobileBleedInset = { top: number; right: number; bottom: number; left: number };

export const ZERO_MOBILE_BLEED: MobileBleedInset = { top: 0, right: 0, bottom: 0, left: 0 };

const FULL_BLEED_SECTIONS = new Set(["page-hero", "editorial-media", "video-story"]);

type LengthLike = { value: number; unit: string } | undefined;
type PaddingLike = { top?: LengthLike; right?: LengthLike; bottom?: LengthLike; left?: LengthLike } | undefined;

function paddingPx(length: LengthLike): number {
  if (!length || length.unit !== "px" || !Number.isFinite(length.value) || length.value <= 0) return 0;
  return length.value;
}

/** #111315、#181A1B 这类深色画布。浅灰和白色不算。 */
export function isDarkCanvasColor(color: string | undefined): boolean {
  if (!color || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)) return false;
  const hex = color.length === 4
    ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
    : color;
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) < 40;
}

function isFillWidth(width: DynamicTemplateRenderPlanNode["rules"]["width"] | undefined): boolean {
  return width === undefined || width === "fill" || width === "auto";
}

/**
 * 这张图在手机上应贴齐所在区块的边缘。
 * 背景图和三个全幅角色的主图始终贴边；深色画布上的通栏图也贴边，避免黑框。
 * 作品网格、Logo 和单独写了宽度的小图保持原来的边距。
 */
export function imageBleedsOnMobile(
  node: {
    slot?: { type?: string; semanticRole?: string };
    rules: { width?: DynamicTemplateRenderPlanNode["rules"]["width"] };
  },
  input: {
    device: "desktop" | "mobile";
    constrainWorkCell: boolean;
    sectionRole?: string;
    canvasColor?: string;
  },
): boolean {
  if (input.device !== "mobile" || input.constrainWorkCell) return false;
  if (input.sectionRole === "creation-grid") return false;
  if (node.slot?.type !== "image" || node.slot.semanticRole === "logo") return false;
  if (!isFillWidth(node.rules.width)) return false;
  if (node.slot.semanticRole === "backgroundImage") return true;
  if (node.slot.semanticRole === "heroImage" && FULL_BLEED_SECTIONS.has(input.sectionRole ?? "")) return true;
  return isDarkCanvasColor(input.canvasColor);
}

export function extendMobileBleedInset(
  current: MobileBleedInset,
  padding: PaddingLike,
  active: boolean,
): MobileBleedInset {
  if (!active) return current;
  const next = {
    top: current.top + paddingPx(padding?.top),
    right: current.right + paddingPx(padding?.right),
    bottom: current.bottom + paddingPx(padding?.bottom),
    left: current.left + paddingPx(padding?.left),
  };
  if (next.top === current.top && next.right === current.right && next.bottom === current.bottom && next.left === current.left) {
    return current;
  }
  return next;
}

/** 流式图片用负外边距退出祖先的内边距。上下只在它贴着这一节的头或尾时退出。 */
export function mobileBleedBox(
  inset: MobileBleedInset,
  edges: { top: boolean; bottom: boolean },
): CSSProperties | undefined {
  const left = inset.left;
  const right = inset.right;
  const top = edges.top ? inset.top : 0;
  const bottom = edges.bottom ? inset.bottom : 0;
  if (left + right + top + bottom === 0) return undefined;
  return {
    ...(top ? { marginTop: `${-top}px` } : {}),
    ...(right ? { marginRight: `${-right}px` } : {}),
    ...(bottom ? { marginBottom: `${-bottom}px` } : {}),
    ...(left ? { marginLeft: `${-left}px` } : {}),
    ...(left || right ? { width: `calc(100% + ${left + right}px)`, maxWidth: "none" as const } : {}),
    borderRadius: 0,
  };
}

/**
 * 自由叠放的大图如果只差一圈深色边，手机上铺满所在画布。
 * 故意留小的主体不改。
 */
export function mobileFreeFrameStyle(
  placement: { x: number; y: number; width: number; height: number },
  bleed: boolean,
  semanticRole: string | undefined,
): CSSProperties | undefined {
  if (!bleed) return undefined;
  const nearlyFull = placement.width >= 0.7 && placement.height >= 0.7 && placement.x <= 0.2 && placement.y <= 0.2;
  if (semanticRole !== "backgroundImage" && !nearlyFull) return undefined;
  return { left: 0, top: 0, width: "100%", height: "100%", margin: 0, borderRadius: 0 };
}

export function subtreeHasMobileBleedImage(
  node: DynamicTemplateRenderPlanNode,
  input: {
    device: "desktop" | "mobile";
    sectionRole?: string;
    canvasColor?: string;
  },
): boolean {
  if (node.hidden) return false;
  if (imageBleedsOnMobile(node, { ...input, constrainWorkCell: false })) return true;
  return node.children.some((child) => subtreeHasMobileBleedImage(child, input));
}
