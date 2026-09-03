import type {
  EditableTargetLocatorAttribute,
} from "../template-definition/editableTargets";

export interface GeometryPoint {
  x: number;
  y: number;
}

export interface GeometryRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SourceToHostTransform {
  sourceOrigin: GeometryPoint;
  hostOrigin: GeometryPoint;
  scaleX: number;
  scaleY: number;
}

export interface ExplicitEditableTargetLocator {
  attributes: readonly EditableTargetLocatorAttribute[];
  value: string;
}

export const MIN_EDITOR_HIT_SIZE = 24;
export const RECOMMENDED_EDITOR_HIT_SIZE = 32;
// 保留 1px 浮点余量，避免高 DPI / 移动模拟下 44 CSS px 被布局矩阵报告为 43.999px。
export const TOUCH_EDITOR_HIT_SIZE = 45;

export type GeometryResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export interface NormalizedGeometryRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedGeometryBounds extends NormalizedGeometryRect {}

export interface NormalizedGeometryConstraints {
  movementAxes: readonly ("x" | "y")[];
  minSize: { width: number; height: number };
  maxSize: { width: number; height: number };
}

function finitePositive(value: number, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function clampGeometryValue(value: number, minimum: number, maximum: number) {
  if (maximum < minimum) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampRoundedGeometryValue(value: number, minimum: number, maximum: number) {
  return clampGeometryValue(Math.round(value), minimum, maximum);
}

export function alignNormalizedRect<T extends NormalizedGeometryRect>(
  rect: T,
  axis: "horizontal" | "vertical",
): T {
  return {
    ...rect,
    x: axis === "horizontal"
      ? clampGeometryValue((1 - rect.width) / 2, 0, 1 - rect.width)
      : rect.x,
    y: axis === "vertical"
      ? clampGeometryValue((1 - rect.height) / 2, 0, 1 - rect.height)
      : rect.y,
  } as T;
}

export function getEditorHitSize(coarsePointer: boolean) {
  return coarsePointer ? TOUCH_EDITOR_HIT_SIZE : MIN_EDITOR_HIT_SIZE;
}

export function sourceDeltaToNormalized(
  deltaSourceX: number,
  deltaSourceY: number,
  parentSourceWidth: number,
  parentSourceHeight: number,
) {
  return {
    x: deltaSourceX / finitePositive(parentSourceWidth),
    y: deltaSourceY / finitePositive(parentSourceHeight),
  };
}

export function sourceRectRelativeToParentNormalized(
  targetRect: GeometryRect,
  parentRect: GeometryRect,
): NormalizedGeometryRect {
  const width = finitePositive(parentRect.width);
  const height = finitePositive(parentRect.height);
  return {
    x: (targetRect.left - parentRect.left) / width,
    y: (targetRect.top - parentRect.top) / height,
    width: targetRect.width / width,
    height: targetRect.height / height,
  };
}

export function applyHostRectGesture({
  rect,
  operation,
  direction,
  deltaX,
  deltaY,
  minimumSize = 2,
}: {
  rect: GeometryRect;
  operation: "move" | "resize";
  direction?: GeometryResizeHandle;
  deltaX: number;
  deltaY: number;
  minimumSize?: number;
}): GeometryRect {
  if (operation === "move") {
    return { ...rect, left: rect.left + deltaX, top: rect.top + deltaY };
  }
  let left = rect.left;
  let top = rect.top;
  let right = rect.left + rect.width;
  let bottom = rect.top + rect.height;
  if (direction?.includes("w")) left = Math.min(right - minimumSize, left + deltaX);
  if (direction?.includes("e")) right = Math.max(left + minimumSize, right + deltaX);
  if (direction?.includes("n")) top = Math.min(bottom - minimumSize, top + deltaY);
  if (direction?.includes("s")) bottom = Math.max(top + minimumSize, bottom + deltaY);
  return { left, top, width: right - left, height: bottom - top };
}

export function applyBoundedNormalizedRectGesture({
  rect,
  operation,
  direction,
  delta,
  constraints,
  bounds,
}: {
  rect: NormalizedGeometryRect;
  operation: "move" | "resize";
  direction?: GeometryResizeHandle;
  delta: GeometryPoint;
  constraints: NormalizedGeometryConstraints;
  bounds: NormalizedGeometryBounds;
}): NormalizedGeometryRect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  const boundRight = bounds.x + bounds.width;
  const boundBottom = bounds.y + bounds.height;

  if (operation === "move") {
    if (constraints.movementAxes.includes("x")) {
      left = clampGeometryValue(left + delta.x, bounds.x, boundRight - rect.width);
    }
    if (constraints.movementAxes.includes("y")) {
      top = clampGeometryValue(top + delta.y, bounds.y, boundBottom - rect.height);
    }
    return { x: left, y: top, width: rect.width, height: rect.height };
  }

  if (direction?.includes("w")) {
    left = clampGeometryValue(left + delta.x, bounds.x, right - constraints.minSize.width);
  }
  if (direction?.includes("e")) {
    right = clampGeometryValue(right + delta.x, left + constraints.minSize.width, boundRight);
  }
  if (direction?.includes("n")) {
    top = clampGeometryValue(top + delta.y, bounds.y, bottom - constraints.minSize.height);
  }
  if (direction?.includes("s")) {
    bottom = clampGeometryValue(bottom + delta.y, top + constraints.minSize.height, boundBottom);
  }
  if (right - left > constraints.maxSize.width) {
    if (direction?.includes("w")) left = right - constraints.maxSize.width;
    else right = left + constraints.maxSize.width;
  }
  if (bottom - top > constraints.maxSize.height) {
    if (direction?.includes("n")) top = bottom - constraints.maxSize.height;
    else bottom = top + constraints.maxSize.height;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function clampCanvasScale(value: number, minimum: number, maximum: number) {
  return clampGeometryValue(value, minimum, maximum);
}

export function calculateFitCanvasScale({
  viewportWidth,
  viewportHeight,
  contentWidth,
  contentHeight,
  inset,
  minimumAvailableSize = 1,
  minimumScale,
  maximumScale,
}: {
  viewportWidth: number;
  viewportHeight: number;
  contentWidth: number;
  contentHeight: number;
  inset: number;
  minimumAvailableSize?: number;
  minimumScale: number;
  maximumScale: number;
}) {
  const availableWidth = Math.max(minimumAvailableSize, viewportWidth - inset * 2);
  const availableHeight = Math.max(minimumAvailableSize, viewportHeight - inset * 2);
  return clampCanvasScale(
    Math.min(availableWidth / finitePositive(contentWidth), availableHeight / finitePositive(contentHeight)),
    minimumScale,
    maximumScale,
  );
}

export function canvasPointAtViewportCenter({
  scrollLeft,
  scrollTop,
  viewportWidth,
  viewportHeight,
  boardLeft,
  boardTop,
  scale,
}: {
  scrollLeft: number;
  scrollTop: number;
  viewportWidth: number;
  viewportHeight: number;
  boardLeft: number;
  boardTop: number;
  scale: number;
}): GeometryPoint {
  const safeScale = finitePositive(scale, 0.01);
  return {
    x: (scrollLeft + viewportWidth / 2 - boardLeft) / safeScale,
    y: (scrollTop + viewportHeight / 2 - boardTop) / safeScale,
  };
}

export function scrollPositionForCanvasPoint({
  point,
  viewportWidth,
  viewportHeight,
  boardLeft,
  boardTop,
  scale,
}: {
  point: GeometryPoint;
  viewportWidth: number;
  viewportHeight: number;
  boardLeft: number;
  boardTop: number;
  scale: number;
}): GeometryPoint {
  return {
    x: Math.max(0, boardLeft + point.x * scale - viewportWidth / 2),
    y: Math.max(0, boardTop + point.y * scale - viewportHeight / 2),
  };
}

export function rectCenter(rect: GeometryRect): GeometryPoint {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function rectFromDomRect(rect: Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">): GeometryRect {
  return {
    left: rect.left,
    top: rect.top,
    width: Math.max(0, rect.width),
    height: Math.max(0, rect.height),
  };
}

/**
 * 建立模板 source-space 到宿主 host-space 的唯一坐标变换。
 * source-space 使用 iframe 内模板根节点的 CSS 像素；host-space 使用承载
 * Overlay 的宿主元素 CSS 像素。iframe 的 transform、页面缩放和边框偏移
 * 都在这里折算，调用组件不再复制比例公式。
 */
export function createSourceToHostTransform({
  sourceRootRect,
  sourceFrameRect,
  sourceFrameViewport,
  hostRect,
}: {
  sourceRootRect: GeometryRect;
  sourceFrameRect: GeometryRect;
  sourceFrameViewport: { width: number; height: number };
  hostRect: GeometryRect;
}): SourceToHostTransform {
  const scaleX = finitePositive(
    sourceFrameRect.width / finitePositive(sourceFrameViewport.width),
  );
  const scaleY = finitePositive(
    sourceFrameRect.height / finitePositive(sourceFrameViewport.height),
    scaleX,
  );
  return {
    sourceOrigin: { x: sourceRootRect.left, y: sourceRootRect.top },
    hostOrigin: {
      x: sourceFrameRect.left - hostRect.left + sourceRootRect.left * scaleX,
      y: sourceFrameRect.top - hostRect.top + sourceRootRect.top * scaleY,
    },
    scaleX,
    scaleY,
  };
}

export function sourceRectRelativeToRoot(
  targetRect: GeometryRect,
  sourceRootRect: GeometryRect,
): GeometryRect {
  return {
    left: targetRect.left - sourceRootRect.left,
    top: targetRect.top - sourceRootRect.top,
    width: targetRect.width,
    height: targetRect.height,
  };
}

export function projectSourcePointToHost(
  point: GeometryPoint,
  transform: SourceToHostTransform,
): GeometryPoint {
  return {
    x: transform.hostOrigin.x + (point.x - transform.sourceOrigin.x) * transform.scaleX,
    y: transform.hostOrigin.y + (point.y - transform.sourceOrigin.y) * transform.scaleY,
  };
}

export function projectSourceRectToHost(
  rect: GeometryRect,
  transform: SourceToHostTransform,
): GeometryRect {
  const origin = projectSourcePointToHost(
    { x: transform.sourceOrigin.x + rect.left, y: transform.sourceOrigin.y + rect.top },
    transform,
  );
  return {
    left: origin.x,
    top: origin.y,
    width: rect.width * transform.scaleX,
    height: rect.height * transform.scaleY,
  };
}

export function clampHostRect(rect: GeometryRect, hostWidth: number, hostHeight: number): GeometryRect {
  const left = clampGeometryValue(rect.left, 0, Math.max(0, hostWidth));
  const top = clampGeometryValue(rect.top, 0, Math.max(0, hostHeight));
  const right = clampGeometryValue(rect.left + rect.width, left, Math.max(left, hostWidth));
  const bottom = clampGeometryValue(rect.top + rect.height, top, Math.max(top, hostHeight));
  return { left, top, width: right - left, height: bottom - top };
}

export function expandHostHitRect(
  rect: GeometryRect,
  hostWidth: number,
  hostHeight: number,
  minimumSize = MIN_EDITOR_HIT_SIZE,
): GeometryRect {
  const width = Math.min(hostWidth, Math.max(rect.width, minimumSize));
  const height = Math.min(hostHeight, Math.max(rect.height, minimumSize));
  return {
    left: clampGeometryValue(rect.left + rect.width / 2 - width / 2, 0, Math.max(0, hostWidth - width)),
    top: clampGeometryValue(rect.top + rect.height / 2 - height / 2, 0, Math.max(0, hostHeight - height)),
    width,
    height,
  };
}

export function placeHostLabel(
  rect: GeometryRect,
  hostWidth: number,
  hostHeight: number,
  labelSize: { width: number; height: number } = { width: 144, height: 24 },
): GeometryPoint {
  const gap = 4;
  const left = clampGeometryValue(rect.left, 0, Math.max(0, hostWidth - labelSize.width));
  const above = rect.top - labelSize.height - gap;
  const below = rect.top + rect.height + gap;
  const top = above >= 0
    ? above
    : below + labelSize.height <= hostHeight
      ? below
      : clampGeometryValue(rect.top + gap, 0, Math.max(0, hostHeight - labelSize.height));
  return { x: left, y: top };
}

export function findElementsByEditableTargetLocator(
  root: HTMLElement,
  locator: ExplicitEditableTargetLocator,
): HTMLElement[] {
  if (!locator.value || locator.attributes.length === 0) return [];
  const selector = locator.attributes.map((attribute) => `[${attribute}]`).join(",");
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((element) =>
    locator.attributes.some((attribute) => {
      const current = element.getAttribute(attribute);
      if (!current) return false;
      return attribute === "data-editor-field"
        ? current.split(/\s+/).includes(locator.value)
        : current === locator.value;
    }),
  );
}
