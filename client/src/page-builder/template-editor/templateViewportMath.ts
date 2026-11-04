const DEFAULT_CANVAS_SCALE = 1;

/** 运营界面用整数 CSS 像素读数；底层比例计算保留浏览器的子像素精度。 */
export function formatCanvasDimension(value: number) {
  return Number.isFinite(value) ? String(Math.round(value)) : "—";
}

export function parseFiniteCanvasPadding(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveFiniteCanvasScale(
  value: number | null | undefined,
  fallback = DEFAULT_CANVAS_SCALE,
) {
  const safeFallback = Number.isFinite(fallback) && fallback > 0
    ? fallback
    : DEFAULT_CANVAS_SCALE;
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : safeFallback;
}
