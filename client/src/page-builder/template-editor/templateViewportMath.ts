const DEFAULT_CANVAS_SCALE = 1;

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
