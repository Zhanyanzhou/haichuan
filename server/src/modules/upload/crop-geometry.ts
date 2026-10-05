export type NormalizedCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PixelCropRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function normalizedCropToPixels(
  crop: NormalizedCropRect,
  imageWidth: number,
  imageHeight: number,
): PixelCropRect | null {
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth < 1 || imageHeight < 1) {
    return null;
  }
  if (![crop.x, crop.y, crop.width, crop.height].every((value) => Number.isFinite(value))) {
    return null;
  }
  const left = Math.max(0, Math.round(crop.x * imageWidth));
  const top = Math.max(0, Math.round(crop.y * imageHeight));
  const width = Math.min(imageWidth - left, Math.round(crop.width * imageWidth));
  const height = Math.min(imageHeight - top, Math.round(crop.height * imageHeight));
  if (width < 1 || height < 1) return null;
  return { left, top, width, height };
}
