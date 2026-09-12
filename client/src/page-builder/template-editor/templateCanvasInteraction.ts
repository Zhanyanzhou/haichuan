import type { OverlayTargetDescriptor } from "./EditableTargetOverlay";
import type { GeometryRect } from "./editableTargetGeometry";

/** 阈值使用宿主屏幕 CSS 像素，不随画布缩放而改变。 */
export const TEMPLATE_CANVAS_DRAG_THRESHOLD = 4;

export function crossesCanvasDragThreshold(dx: number, dy: number) {
  return Math.hypot(dx, dy) >= TEMPLATE_CANVAS_DRAG_THRESHOLD;
}

export function isCanvasTargetInScope(target: OverlayTargetDescriptor, scopeId?: string | null) {
  if (target.locked) return false;
  if (!scopeId) return true;
  return target.parentTargetId === `node:${scopeId}`;
}

export function canvasMarqueeRect(start: { x: number; y: number }, end: { x: number; y: number }): GeometryRect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function canvasRectIntersects(a: GeometryRect, b: GeometryRect) {
  return a.left < b.left + b.width && a.left + a.width > b.left
    && a.top < b.top + b.height && a.top + a.height > b.top;
}

/** 按屏幕上从上到下的顺序循环，避免 DOM 冒泡决定重叠命中。 */
export function cycleCanvasHit<T extends { target: OverlayTargetDescriptor; hitRect: GeometryRect }>(
  boxes: readonly T[], point: { x: number; y: number }, currentTargetId?: string | null,
) {
  const hits = [...boxes].reverse().filter(({ hitRect }) => point.x >= hitRect.left
    && point.x <= hitRect.left + hitRect.width && point.y >= hitRect.top
    && point.y <= hitRect.top + hitRect.height);
  if (!hits.length) return undefined;
  const current = hits.findIndex(({ target }) => target.targetId === currentTargetId);
  return hits[(current + 1) % hits.length];
}
