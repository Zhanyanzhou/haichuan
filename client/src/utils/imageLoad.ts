export function hasRenderableImageDimensions(image: {
  naturalWidth: number;
  naturalHeight: number;
}): boolean {
  return image.naturalWidth > 0 && image.naturalHeight > 0;
}
