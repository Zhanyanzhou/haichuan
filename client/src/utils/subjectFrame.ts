/** 浅色棚拍留白过大时，收紧到主体，避免方图把细长作品缩在空白中间。 */

export type SubjectFrame = {
  objectViewBox: string;
  /** 可见区域的宽 / 高 */
  aspectRatio: number;
};

const BACKGROUND_LUMA = 244;
const BACKGROUND_CHROMA = 14;
const MIN_SUBJECT_RATIO = 0.18;
const ALREADY_TIGHT = 0.88;
const SUBJECT_PAD = 0.12;

function isBackdrop(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max >= BACKGROUND_LUMA && max - min <= BACKGROUND_CHROMA;
}

export function frameLightBackdrop(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): SubjectFrame | null {
  if (width < 8 || height < 8 || data.length < width * height * 4) return null;

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (isBackdrop(data[index], data[index + 1], data[index + 2])) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX <= minX || maxY <= minY) return null;

  const subjectW = maxX - minX + 1;
  const subjectH = maxY - minY + 1;
  if (subjectW / width < MIN_SUBJECT_RATIO || subjectH / height < MIN_SUBJECT_RATIO) return null;
  if (subjectW / width >= ALREADY_TIGHT && subjectH / height >= ALREADY_TIGHT) return null;

  const padX = Math.round(subjectW * SUBJECT_PAD);
  const padY = Math.round(subjectH * SUBJECT_PAD);
  const left = Math.max(0, minX - padX);
  const top = Math.max(0, minY - padY);
  const right = Math.max(0, width - 1 - maxX - padX);
  const bottom = Math.max(0, height - 1 - maxY - padY);
  const cropW = width - left - right;
  const cropH = height - top - bottom;
  if (cropW < 8 || cropH < 8) return null;
  if (cropW / width > 0.94 && cropH / height > 0.94) return null;

  const pct = (value: number, total: number) => Number(((value / total) * 100).toFixed(2));
  return {
    objectViewBox: `inset(${pct(top, height)}% ${pct(right, width)}% ${pct(bottom, height)}% ${pct(left, width)}%)`,
    aspectRatio: cropW / cropH,
  };
}

export function mediaIdFromUrl(src: string): string {
  return src.match(/\/media\/(\d+)/)?.[1] ?? "";
}

export function measureSubjectFrame(img: HTMLImageElement): SubjectFrame | null {
  const naturalW = img.naturalWidth;
  const naturalH = img.naturalHeight;
  if (!naturalW || !naturalH) return null;
  if (typeof CSS !== "undefined" && !CSS.supports("object-view-box", "inset(0% 0% 0% 0%)")) return null;

  const scale = Math.min(1, 220 / Math.max(naturalW, naturalH));
  const width = Math.max(1, Math.round(naturalW * scale));
  const height = Math.max(1, Math.round(naturalH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(img, 0, 0, width, height);
    return frameLightBackdrop(context.getImageData(0, 0, width, height).data, width, height);
  } catch {
    return null;
  }
}
