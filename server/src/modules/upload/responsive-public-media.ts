import { extname } from 'path';

const sharp = require('sharp');

export const RESPONSIVE_PUBLIC_IMAGE_WIDTHS = [480, 800, 1200, 1680] as const;

export type ResponsivePublicImageRequest =
  | { kind: 'NONE' }
  | { kind: 'INVALID' }
  | { kind: 'IMAGE'; storageKey: string; width: number };

const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_WIDTHS = new Set<number>(RESPONSIVE_PUBLIC_IMAGE_WIDTHS);

export function isResponsivePublicImageWidth(width: number): boolean {
  return Number.isInteger(width) && ALLOWED_WIDTHS.has(width);
}

export async function resizePublicImageBuffer(
  buffer: Buffer,
  width: number,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (!isResponsivePublicImageWidth(width)) return { buffer, mimeType };
  try {
    const output = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: 25_000_000,
    })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return output.length < buffer.length
      ? { buffer: output, mimeType: 'image/webp' }
      : { buffer, mimeType };
  } catch {
    return { buffer, mimeType };
  }
}

/**
 * 只接受同源 /uploads 下的普通图片路径和固定宽度，避免把动态转码变成任意文件读取或 CPU 放大器。
 */
export function parseResponsivePublicImageRequest(requestUrl: string): ResponsivePublicImageRequest {
  const queryIndex = requestUrl.indexOf('?');
  if (queryIndex < 0) return { kind: 'NONE' };

  const rawPath = requestUrl.slice(0, queryIndex);
  const query = new URLSearchParams(requestUrl.slice(queryIndex + 1));
  const widthValues = query.getAll('width');
  if (widthValues.length === 0) return { kind: 'NONE' };
  if (widthValues.length !== 1 || !/^\d+$/.test(widthValues[0])) return { kind: 'INVALID' };

  const width = Number(widthValues[0]);
  if (!isResponsivePublicImageWidth(width)) return { kind: 'INVALID' };

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return { kind: 'INVALID' };
  }

  const storageKey = decodedPath.replace(/^\/+/, '');
  const segments = storageKey.split('/');
  if (
    !storageKey
    || segments.some((segment) => !segment || segment === '.' || segment === '..')
    || decodedPath.includes('\\')
    || /[\u0000-\u001f\u007f]/u.test(decodedPath)
    || !ALLOWED_IMAGE_EXTENSIONS.has(extname(storageKey).toLowerCase())
  ) {
    return { kind: 'INVALID' };
  }

  return { kind: 'IMAGE', storageKey, width };
}
