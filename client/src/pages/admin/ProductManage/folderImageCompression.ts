import { maxFolderImageBytes } from "./productFolderImport";

export function canCompressFolderImage(file: File) {
  return file.size > maxFolderImageBytes && /\.(png|jpe?g)$/i.test(file.name);
}

async function isAnimatedPng(file: File) {
  if (!/\.png$/i.test(file.name)) return false;
  // APNG 的动画控制块必须位于首个 IDAT 之前。
  for (let offset = 8; offset + 8 <= file.size;) {
    const header = new DataView(await file.slice(offset, offset + 8).arrayBuffer());
    const type = header.getUint32(4);
    if (type === 0x6163544c) return true; // acTL
    if (type === 0x49444154 || type === 0x49454e44) return false; // IDAT / IEND
    offset += header.getUint32(0) + 12;
  }
  return false;
}

export async function compressFolderImage(file: File) {
  if (!canCompressFolderImage(file) || await isAnimatedPng(file)) {
    throw new Error("请选择静态 PNG 或 JPG 图片");
  }
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  try {
    const original = { width: bitmap.width, height: bitmap.height };
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法处理图片");
    let scale = Math.min(1, 4096 / Math.max(original.width, original.height));
    for (const quality of [0.92, 0.86, 0.8, 0.8]) {
      canvas.width = Math.max(1, Math.round(original.width * scale));
      canvas.height = Math.max(1, Math.round(original.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (!blob || blob.type !== "image/webp") throw new Error("浏览器无法生成 WebP 图片");
      if (blob.size < maxFolderImageBytes) {
        return {
          file: new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: blob.type }),
          original,
          output: { width: canvas.width, height: canvas.height },
        };
      }
      scale *= 0.8;
    }
    throw new Error("图片压缩后仍然超限");
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}
