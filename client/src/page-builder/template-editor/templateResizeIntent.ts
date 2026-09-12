import type { FreePlacementResizeHandle } from "../template-definition/freePlacementGeometry";

export interface TemplateResizeLimits { minWidth: number; maxWidth: number; minHeight: number; maxHeight: number }

// em/rem/vw 等已经由浏览器计算为 px；百分比的包含块可能是网格区域或不确定高度，留给真实布局解析。
export function readTemplateResizeLimits(element: HTMLElement): TemplateResizeLimits {
  const style = element.ownerDocument.defaultView!.getComputedStyle(element);
  const resolve = (value: string, fallback: number) => {
    if (value.endsWith("px")) return Number.parseFloat(value);
    return fallback;
  };
  return {
    minWidth: Math.max(1, resolve(style.minWidth, 1)),
    maxWidth: resolve(style.maxWidth, Infinity),
    minHeight: Math.max(1, resolve(style.minHeight, 1)),
    maxHeight: resolve(style.maxHeight, Infinity),
  };
}

export function constrainTemplateResizeDelta(width: number, height: number, dx: number, dy: number, direction: FreePlacementResizeHandle | undefined, limits: TemplateResizeLimits) {
  const signX = direction?.includes("w") ? -1 : 1;
  const signY = direction?.includes("n") ? -1 : 1;
  const nextWidth = Math.max(limits.minWidth, Math.min(limits.maxWidth, width + dx * signX));
  const nextHeight = Math.max(limits.minHeight, Math.min(limits.maxHeight, height + dy * signY));
  const x = direction?.match(/[ew]/) ? (nextWidth - width) * signX : 0;
  const y = direction?.match(/[ns]/) ? (nextHeight - height) * signY : 0;
  return { x, y, limited: Math.abs(x - dx) > .01 || Math.abs(y - dy) > .01 };
}
