const sharp = require('sharp');

/**
 * 展示尺寸：EXIF 方向 5–8 对调宽高；动画只取单帧高度，不用叠帧总高。
 * 只读文件头，不写回数据库，也不把像素抄进模板建议画布。
 */
export type DisplayImageMetadata = {
  displayWidth: number;
  displayHeight: number;
  animated: boolean;
};

export type RawImageHeader = {
  width?: number;
  height?: number;
  pageHeight?: number;
  pages?: number;
  orientation?: number;
};

const ORIENTATIONS_THAT_SWAP = new Set([5, 6, 7, 8]);
const displayMetadataCache = new Map<string, DisplayImageMetadata>();

export function resolveDisplayImageMetadata(metadata: RawImageHeader): DisplayImageMetadata | null {
  const rawWidth = metadata.width;
  const rawHeight = metadata.height;
  if (!rawWidth || !rawHeight || rawWidth <= 0 || rawHeight <= 0) return null;
  const pages = metadata.pages ?? 1;
  const animated = pages > 1;
  const frameHeight = animated && metadata.pageHeight && metadata.pageHeight > 0
    ? metadata.pageHeight
    : rawHeight;
  let displayWidth = rawWidth;
  let displayHeight = frameHeight;
  if (ORIENTATIONS_THAT_SWAP.has(metadata.orientation ?? 1)) {
    displayWidth = frameHeight;
    displayHeight = rawWidth;
  }
  return { displayWidth, displayHeight, animated };
}

/** 按原图校验和与生命周期缓存文件头。失败不缓存，避免把暂时读不到的文件钉死。 */
export async function readCachedDisplayImageMetadata(input: {
  absolutePath: string;
  checksum: string;
  lifecycleRevision: number;
}): Promise<DisplayImageMetadata | null> {
  if (!input.checksum) return null;
  const key = `${input.checksum}:${input.lifecycleRevision}`;
  const cached = displayMetadataCache.get(key);
  if (cached) return cached;
  try {
    const metadata = await sharp(input.absolutePath, {
      animated: true,
      failOn: 'none',
    }).metadata();
    const fact = resolveDisplayImageMetadata(metadata);
    if (!fact) return null;
    displayMetadataCache.set(key, fact);
    return fact;
  } catch {
    return null;
  }
}
