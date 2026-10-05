import assert from 'node:assert/strict';
import test from 'node:test';
import type { Response } from 'express';
import {
  classifyPublicPageAssetPath,
  parsePublicUploadStorageKey,
  PublicUploadsGateway,
  sendPublicMedia,
} from './public-uploads.gateway';
import {
  parseResponsivePublicImageRequest,
  resizePublicImageBuffer,
} from './responsive-public-media';

const sharp = require('sharp');

function responseDouble(onDone?: () => void) {
  const state: { status: number; headers: Map<string, string>; body?: Buffer; ended: boolean } = {
    status: 200,
    headers: new Map(),
    ended: false,
  };
  const response = {
    setHeader(name: string, value: string) {
      state.headers.set(name.toLowerCase(), value);
      return response;
    },
    status(value: number) {
      state.status = value;
      return response;
    },
    type(value: string) {
      state.headers.set('content-type', value);
      return response;
    },
    send(value: Buffer) {
      state.body = value;
      state.ended = true;
      onDone?.();
      return response;
    },
    end() {
      state.ended = true;
      onDone?.();
      return response;
    },
  } as unknown as Response;
  return { response, state };
}

test('页面素材兼容 URL 解析为受控 storageKey，并保留其他 uploads 静态路径', () => {
  assert.deepEqual(classifyPublicPageAssetPath('/page-assets/abc.png'), {
    kind: 'PAGE_ASSET',
    storageKey: 'page-assets/abc.png',
  });
  assert.deepEqual(classifyPublicPageAssetPath('/page-assets/nested/abc.webp?revision=2'), {
    kind: 'PAGE_ASSET',
    storageKey: 'page-assets/nested/abc.webp',
  });
  assert.deepEqual(classifyPublicPageAssetPath('/2026/09/legacy.jpg'), { kind: 'OTHER_UPLOAD' });
});

test('页面素材路径的遍历、编码分隔符、反斜杠、畸形转义和大小写别名全部失败关闭', () => {
  for (const url of [
    '/page-assets/../secret.png',
    '/page-assets/%2e%2e/secret.png',
    '/page-assets%2f..%2fsecret.png',
    '/page-assets/%5cescape.png',
    '/page-assets/%00control.png',
    '/page-assets/bad%.png',
    '/PAGE-ASSETS/alias.png',
    '/page-assets/',
  ]) {
    assert.deepEqual(classifyPublicPageAssetPath(url), { kind: 'INVALID_PAGE_ASSET' }, url);
  }
});

test('普通 uploads 路径只解析无歧义的相对 storageKey', () => {
  assert.equal(parsePublicUploadStorageKey('/legacy/member.mp4'), 'legacy/member.mp4');
  assert.equal(parsePublicUploadStorageKey('/legacy/member.mp4?width=480'), 'legacy/member.mp4');
  for (const url of ['/../secret', '/%2e%2e/secret', '/bad%5cpath', '/bad%00path', '/bad%']) {
    assert.equal(parsePublicUploadStorageKey(url), null, url);
  }
});

test('公开 uploads 图片只接受固定响应式宽度与安全图片路径', () => {
  assert.deepEqual(
    parseResponsivePublicImageRequest('/2026/09/01/hero.png?width=480'),
    { kind: 'IMAGE', storageKey: '2026/09/01/hero.png', width: 480 },
  );
  assert.deepEqual(
    parseResponsivePublicImageRequest('/page-assets/hero.jpg?revision=2&width=1680'),
    { kind: 'IMAGE', storageKey: 'page-assets/hero.jpg', width: 1680 },
  );
  assert.deepEqual(parseResponsivePublicImageRequest('/2026/09/01/hero.png'), { kind: 'NONE' });

  for (const url of [
    '/2026/09/01/hero.png?width=481',
    '/2026/09/01/hero.svg?width=480',
    '/2026/09/../secret.png?width=480',
    '/2026/09/hero.png?width=480&width=800',
    '/2026/09/%5cescape.png?width=480',
  ]) {
    assert.deepEqual(parseResponsivePublicImageRequest(url), { kind: 'INVALID' }, url);
  }
});

test('响应式图片保持比例并输出明显更小的 WebP', async () => {
  const input = await sharp({
    create: {
      width: 1672,
      height: 941,
      channels: 3,
      background: { r: 28, g: 31, b: 33 },
    },
  }).png().toBuffer();
  const output = await resizePublicImageBuffer(input, 480, 'image/png');
  const metadata = await sharp(output.buffer).metadata();

  assert.equal(output.mimeType, 'image/webp');
  assert.equal(metadata.width, 480);
  assert.equal(metadata.height, 270);
  assert.ok(output.buffer.length < input.length);
});

test('受控旧 URL 保留 HEAD、单区间 Range 与越界 416 语义', () => {
  const media = { buffer: Buffer.from('0123456789'), mimeType: 'video/mp4' };

  const ranged = responseDouble();
  sendPublicMedia({ method: 'GET', headers: { range: 'bytes=2-5' } }, ranged.response, media);
  assert.equal(ranged.state.status, 206);
  assert.equal(ranged.state.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(ranged.state.headers.get('cache-control'), 'public, no-store');
  assert.deepEqual(ranged.state.body, Buffer.from('2345'));

  const head = responseDouble();
  sendPublicMedia({ method: 'HEAD', headers: {} }, head.response, media);
  assert.equal(head.state.status, 200);
  assert.equal(head.state.headers.get('content-length'), '10');
  assert.equal(head.state.body, undefined);
  assert.equal(head.state.ended, true);

  const invalid = responseDouble();
  sendPublicMedia({ method: 'GET', headers: { range: 'bytes=99-' } }, invalid.response, media);
  assert.equal(invalid.state.status, 416);
  assert.equal(invalid.state.headers.get('content-range'), 'bytes */10');
  assert.equal(invalid.state.body, undefined);
});

test('历史 UUID 公开图可以按版本 URL 缓存，受控页面素材默认仍禁止缓存', () => {
  const media = { buffer: Buffer.from('image'), mimeType: 'image/webp' };
  const cached = responseDouble();
  sendPublicMedia(
    { method: 'GET', headers: {} },
    cached.response,
    media,
    'public, max-age=604800, stale-while-revalidate=86400',
  );
  assert.equal(
    cached.state.headers.get('cache-control'),
    'public, max-age=604800, stale-while-revalidate=86400',
  );

  const controlled = responseDouble();
  sendPublicMedia({ method: 'GET', headers: {} }, controlled.response, media);
  assert.equal(controlled.state.headers.get('cache-control'), 'public, no-store');
});

test('uploads 网关只缓存非页面素材的公开响应式图片，页面素材与历史商品媒体保持受控', async () => {
  let middleware: ((request: any, response: Response, next: (error?: unknown) => void) => void) | undefined;
  const app = {
    use(path: string, handler: typeof middleware) {
      assert.equal(path, '/uploads');
      middleware = handler;
    },
  };
  const responsiveCalls: Array<{ storageKey: string; width: number; requirePublicAuthorization: boolean }> = [];
  let blockLegacyProductMedia = false;
  const uploadService = {
    async isLegacyProductMediaStorageKey() {
      return blockLegacyProductMedia;
    },
    async getResponsivePublicImage(
      storageKey: string,
      width: number,
      requirePublicAuthorization: boolean,
    ) {
      responsiveCalls.push({ storageKey, width, requirePublicAuthorization });
      return { buffer: Buffer.from('responsive-image'), mimeType: 'image/webp' };
    },
  };
  new PublicUploadsGateway(
    { httpAdapter: { getInstance: () => app } } as any,
    uploadService as any,
  ).onModuleInit();
  assert.ok(middleware);

  async function request(url: string) {
    let forwardedError: unknown;
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    const result = responseDouble(finish);
    middleware!({ method: 'GET', headers: {}, url }, result.response, (error?: unknown) => {
      forwardedError = error;
      finish();
    });
    await finished;
    return { ...result, forwardedError };
  }

  const immutableLegacyImage = await request('/2026/09/01/hero.png?width=480');
  assert.equal(
    immutableLegacyImage.state.headers.get('cache-control'),
    'public, max-age=604800, stale-while-revalidate=86400',
  );
  assert.deepEqual(responsiveCalls.at(-1), {
    storageKey: '2026/09/01/hero.png',
    width: 480,
    requirePublicAuthorization: false,
  });

  const pageAsset = await request('/page-assets/hero.png?width=480');
  assert.equal(pageAsset.state.headers.get('cache-control'), 'public, no-store');
  assert.deepEqual(responsiveCalls.at(-1), {
    storageKey: 'page-assets/hero.png',
    width: 480,
    requirePublicAuthorization: true,
  });

  blockLegacyProductMedia = true;
  const responsiveCallCount = responsiveCalls.length;
  const productMedia = await request('/products/legacy.png?width=480');
  assert.equal((productMedia.forwardedError as { status?: number })?.status, 404);
  assert.equal(responsiveCalls.length, responsiveCallCount);
  assert.equal(productMedia.state.ended, false);
});
