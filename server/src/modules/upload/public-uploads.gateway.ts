import { HttpAdapterHost } from '@nestjs/core';
import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { resolveMediaStorageRoots } from './media-storage-paths';
import { UploadService } from './upload.service';
import { parseResponsivePublicImageRequest } from './responsive-public-media';

type StaticHandler = (request: Request, response: Response, next: NextFunction) => void;

// @nestjs/serve-static 本身也通过这个已安装运行时实现 express.static。
// 这里增加路由分流后再复用同一实现，避免改变其他历史 /uploads 路径的静态行为。
const serveStatic = require('serve-static') as (
  root: string,
  options: Record<string, unknown>,
) => StaticHandler;

export type PublicPageAssetPath =
  | { kind: 'OTHER_UPLOAD' }
  | { kind: 'INVALID_PAGE_ASSET' }
  | { kind: 'PAGE_ASSET'; storageKey: string };

type MediaResponse = { buffer: Buffer; mimeType: string };

function parseSingleByteRange(value: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(requestedEnd)
    || start < 0
    || start >= size
    || requestedEnd < start
  ) return null;
  return { start, end: Math.min(requestedEnd, size - 1) };
}

export function sendPublicMedia(
  request: Pick<Request, 'method' | 'headers'>,
  response: Response,
  media: MediaResponse,
  cacheControl = 'public, no-store',
) {
  const size = media.buffer.byteLength;
  response.setHeader('Cache-Control', cacheControl);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Accept-Ranges', 'bytes');
  response.type(media.mimeType);

  const rangeValue = request.headers.range;
  if (rangeValue) {
    const range = parseSingleByteRange(rangeValue, size);
    if (!range) {
      response.status(416).setHeader('Content-Range', `bytes */${size}`);
      return response.end();
    }
    const chunk = media.buffer.subarray(range.start, range.end + 1);
    response.status(206);
    response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    response.setHeader('Content-Length', String(chunk.byteLength));
    return request.method === 'HEAD' ? response.end() : response.send(chunk);
  }

  response.setHeader('Content-Length', String(size));
  return request.method === 'HEAD' ? response.end() : response.send(media.buffer);
}

/**
 * 只解析原始 request URL，避免在 Windows 路径归一化或 Nginx 转发前后把编码分隔符当成安全文件名。
 * page-assets 下仅允许非空普通段；任一模糊、畸形或遍历形式都失败关闭。
 */
export function classifyPublicPageAssetPath(requestUrl: string): PublicPageAssetPath {
  const rawPath = requestUrl.split('?', 1)[0] || '';
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return /^\/?page-assets(?:\/|%|$)/i.test(rawPath)
      ? { kind: 'INVALID_PAGE_ASSET' }
      : { kind: 'OTHER_UPLOAD' };
  }

  const withoutLeadingSlash = decodedPath.replace(/^\/+/, '');
  const segments = withoutLeadingSlash.split('/');
  if (segments[0]?.toLowerCase() !== 'page-assets') return { kind: 'OTHER_UPLOAD' };
  if (
    segments[0] !== 'page-assets'
    || segments.length < 2
    || segments.some((segment) => !segment || segment === '.' || segment === '..')
    || decodedPath.includes('\\')
    || /[\u0000-\u001f\u007f]/u.test(decodedPath)
  ) {
    return { kind: 'INVALID_PAGE_ASSET' };
  }
  return { kind: 'PAGE_ASSET', storageKey: segments.join('/') };
}

export function parsePublicUploadStorageKey(requestUrl: string): string | null {
  const rawPath = requestUrl.split('?', 1)[0] || '';
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  const withoutLeadingSlash = decodedPath.replace(/^\/+/, '');
  const segments = withoutLeadingSlash.split('/');
  if (
    segments.length < 1
    || segments.some((segment) => !segment || segment === '.' || segment === '..')
    || decodedPath.includes('\\')
    || /[\u0000-\u001f\u007f]/u.test(decodedPath)
  ) return null;
  return segments.join('/');
}

@Injectable()
export class PublicUploadsGateway implements OnModuleInit {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly uploadService: UploadService,
  ) {}

  onModuleInit() {
    const app = this.httpAdapterHost.httpAdapter.getInstance();
    const staticHandler = serveStatic(resolveMediaStorageRoots().publicRoot, {
      index: false,
      setHeaders: (response: Response) => {
        response.setHeader('X-Content-Type-Options', 'nosniff');
      },
    });

    app.use('/uploads', (request: Request, response: Response, next: NextFunction) => {
      const responsiveImage = parseResponsivePublicImageRequest(request.url);
      if (responsiveImage.kind === 'INVALID') {
        return next(new NotFoundException('素材不存在'));
      }
      if (responsiveImage.kind === 'IMAGE') {
        if (!['GET', 'HEAD'].includes(request.method)) {
          return next(new NotFoundException('素材不存在'));
        }
        const requirePublicAuthorization = responsiveImage.storageKey.startsWith('page-assets/');
        void this.uploadService.isLegacyProductMediaStorageKey(responsiveImage.storageKey)
          .then((blocked) => {
            if (blocked) throw new NotFoundException('素材不存在');
            return this.uploadService.getResponsivePublicImage(
              responsiveImage.storageKey,
              responsiveImage.width,
              requirePublicAuthorization,
            );
          })
          .then((media) => sendPublicMedia(
            request,
            response,
            media,
            requirePublicAuthorization
              ? 'public, no-store'
              : 'public, max-age=604800, stale-while-revalidate=86400',
          ))
          .catch(next);
        return;
      }

      const pageAsset = classifyPublicPageAssetPath(request.url);
      if (pageAsset.kind === 'OTHER_UPLOAD') {
        const storageKey = parsePublicUploadStorageKey(request.url);
        if (!storageKey || !['GET', 'HEAD'].includes(request.method)) {
          return next(new NotFoundException('素材不存在'));
        }
        void this.uploadService.isLegacyProductMediaStorageKey(storageKey)
          .then((blocked) => {
            if (blocked) throw new NotFoundException('素材不存在');
            return staticHandler(request, response, next);
          })
          .catch(next);
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method) || pageAsset.kind === 'INVALID_PAGE_ASSET') {
        return next(new NotFoundException('素材不存在'));
      }

      void this.uploadService.isLegacyProductMediaStorageKey(pageAsset.storageKey)
        .then((blocked) => {
          if (blocked) throw new NotFoundException('素材不存在');
          return this.uploadService.getPageMediaContentByStorageKey(pageAsset.storageKey, true);
        })
        .then((media) => sendPublicMedia(request, response, media))
        .catch(next);
    });
  }
}
