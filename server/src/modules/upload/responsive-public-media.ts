import { createHash } from 'crypto';
import { extname } from 'path';
import { resolveDisplayImageMetadata } from '../../common/media/display-image-metadata';

const sharp = require('sharp');

/**
 * 请求宽度是允许档位的上限。实际输出宽度不会超过原图展示宽度，也不放大。
 * 策略版本进入内存键、ETag、磁盘名和新的公开候选 URL，避免旧派生字节继续冒充新策略。
 */
export const RESPONSIVE_PUBLIC_IMAGE_STRATEGY_VERSION = 2;
export const RESPONSIVE_PUBLIC_IMAGE_WIDTHS = [480, 800, 1200, 1680, 2400, 2880, 3840] as const;

export type ResponsivePublicImageRequest =
  | { kind: 'NONE' }
  | { kind: 'INVALID' }
  | { kind: 'IMAGE'; storageKey: string; width: number; strategyVersion: number | null };

export type ResponsivePublicImageResult =
  | {
    ok: true;
    buffer: Buffer;
    mimeType: 'image/webp';
    outputWidth: number;
    outputHeight: number;
  }
  | { ok: false; reason: 'animated' | 'decode' | 'invalid-width' };

const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_WIDTHS = new Set<number>(RESPONSIVE_PUBLIC_IMAGE_WIDTHS);
const MAX_INPUT_PIXELS = 25_000_000;

export function isResponsivePublicImageWidth(width: number): boolean {
  return Number.isInteger(width) && ALLOWED_WIDTHS.has(width);
}

export function responsivePublicImageEtag(width: number, fingerprint: string): string {
  const hash = createHash('sha1').update(fingerprint).digest('hex').slice(0, 16);
  return `w${width}-v${RESPONSIVE_PUBLIC_IMAGE_STRATEGY_VERSION}-${hash}`;
}

export function responsivePublicImageMemoryKey(
  storageKey: string,
  width: number,
  fingerprint: string,
): string {
  return `${storageKey}:w${width}:v${RESPONSIVE_PUBLIC_IMAGE_STRATEGY_VERSION}:${fingerprint}`;
}

/** 只清理同一策略版本下的旧指纹。没有版本号的历史文件不批量删除。 */
export function responsivePublicImagePrunePrefix(width: number): string {
  return `w${width}-v${RESPONSIVE_PUBLIC_IMAGE_STRATEGY_VERSION}-`;
}

/**
 * 转码必须保住目标几何。字节变大也保留该几何的 WebP，不再退回另一套尺寸的原图。
 * 动画不能收成一帧；失败返回明确原因，由调用方拒绝派生，不写入缓存。
 */
export async function resizePublicImageBuffer(
  buffer: Buffer,
  width: number,
  _mimeType: string,
): Promise<ResponsivePublicImageResult> {
  if (!isResponsivePublicImageWidth(width)) return { ok: false, reason: 'invalid-width' };
  try {
    const header = await sharp(buffer, {
      animated: true,
      failOn: 'none',
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
    const display = resolveDisplayImageMetadata(header);
    if (!display) return { ok: false, reason: 'decode' };
    if (display.animated) return { ok: false, reason: 'animated' };
    const targetWidth = Math.min(width, display.displayWidth);
    const output = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
      animated: false,
    })
      .rotate()
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality: width >= 2400 ? 86 : 82 })
      .toBuffer();
    const decoded = await sharp(output).metadata();
    if (decoded.width !== targetWidth || !decoded.height) return { ok: false, reason: 'decode' };
    return {
      ok: true,
      buffer: output,
      mimeType: 'image/webp',
      outputWidth: decoded.width,
      outputHeight: decoded.height,
    };
  } catch {
    return { ok: false, reason: 'decode' };
  }
}

/**
 * 只接受同源 /uploads 下的普通图片路径和固定宽度。
 * 带 rv 时必须等于当前策略版本，错误版本直接拒绝，避免无界缓存变体。
 * 不带 rv 的旧链接仍可生成，但使用当前策略，不再复用旧几何的派生字节。
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

  const versionValues = query.getAll('rv');
  let strategyVersion: number | null = null;
  if (versionValues.length > 1) return { kind: 'INVALID' };
  if (versionValues.length === 1) {
    if (versionValues[0] !== String(RESPONSIVE_PUBLIC_IMAGE_STRATEGY_VERSION)) {
      return { kind: 'INVALID' };
    }
    strategyVersion = RESPONSIVE_PUBLIC_IMAGE_STRATEGY_VERSION;
  }

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

  return { kind: 'IMAGE', storageKey, width, strategyVersion };
}
