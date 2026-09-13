import assert from 'node:assert/strict';
import test from 'node:test';
import type { Response } from 'express';
import { classifyPublicPageAssetPath, sendPublicMedia } from './public-uploads.gateway';

function responseDouble() {
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
      return response;
    },
    end() {
      state.ended = true;
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
