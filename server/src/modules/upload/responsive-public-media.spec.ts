import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { resolveDisplayImageMetadata } from '../../common/media/display-image-metadata';
import {
  parseResponsivePublicImageRequest,
  resizePublicImageBuffer,
  responsivePublicImageEtag,
  responsivePublicImageMemoryKey,
  responsivePublicImagePrunePrefix,
  RESPONSIVE_PUBLIC_IMAGE_STRATEGY_VERSION,
} from './responsive-public-media';

const sharp = require('sharp');

async function decodedWidth(buffer: Buffer): Promise<{ width?: number; height?: number; format?: string }> {
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'image/webp');
    response.end(buffer);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('测试服务没有端口');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/image.webp?width=probe`);
    const downloaded = Buffer.from(await response.arrayBuffer());
    return sharp(downloaded).metadata();
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('941 宽原图请求 1200 档时下载文件仍是 941 宽', async () => {
  const input = await sharp({
    create: { width: 941, height: 1672, channels: 3, background: 'navy' },
  }).jpeg({ quality: 70 }).toBuffer();
  const output = await resizePublicImageBuffer(input, 1200, 'image/jpeg');
  assert.equal(output.ok, true);
  if (!output.ok) return;
  const metadata = await decodedWidth(output.buffer);
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 941);
  assert.equal(metadata.height, 1672);
});

test('请求档位超过原图时下载文件保持原图宽度，不放大', async () => {
  const input = await sharp({
    create: { width: 200, height: 100, channels: 3, background: 'red' },
  }).png().toBuffer();
  const output = await resizePublicImageBuffer(input, 480, 'image/png');
  assert.equal(output.ok, true);
  if (!output.ok) return;
  const metadata = await decodedWidth(output.buffer);
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 200);
  assert.equal(metadata.height, 100);
});

test('噪声 JPEG 即使 WebP 更大也保持请求几何，不退回原图', async () => {
  let seed = 12345;
  const raw = Buffer.alloc(1000 * 500 * 3);
  for (let index = 0; index < raw.length; index += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    raw[index] = seed >>> 24;
  }
  const input = await sharp(raw, { raw: { width: 1000, height: 500, channels: 3 } })
    .jpeg({ quality: 5 })
    .toBuffer();
  const output = await resizePublicImageBuffer(input, 480, 'image/jpeg');
  assert.equal(output.ok, true);
  if (!output.ok) return;
  const metadata = await decodedWidth(output.buffer);
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 480);
  assert.equal(metadata.height, 240);
  assert.notEqual(output.mimeType, 'image/jpeg');
});

test('EXIF 方向 6 按展示尺寸输出，透明 PNG 保留透明', async () => {
  const oriented = await sharp({
    create: { width: 200, height: 100, channels: 3, background: 'blue' },
  }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const header = await sharp(oriented).metadata();
  const display = resolveDisplayImageMetadata(header);
  assert.equal(display?.displayWidth, 100);
  assert.equal(display?.displayHeight, 200);
  const output = await resizePublicImageBuffer(oriented, 480, 'image/jpeg');
  assert.equal(output.ok, true);
  if (!output.ok) return;
  const metadata = await decodedWidth(output.buffer);
  assert.equal(metadata.width, 100);
  assert.equal(metadata.height, 200);

  const alpha = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 4,
      background: { r: 1, g: 2, b: 3, alpha: 0.5 },
    },
  }).png().toBuffer();
  const transparent = await resizePublicImageBuffer(alpha, 480, 'image/png');
  assert.equal(transparent.ok, true);
  if (!transparent.ok) return;
  const alphaMeta = await sharp(transparent.buffer).metadata();
  assert.equal(alphaMeta.hasAlpha, true);
  assert.equal(alphaMeta.width, 32);
});

test('动画不能收成一帧，3840 档按真实宽度输出', async () => {
  const red = await sharp({
    create: { width: 8, height: 8, channels: 3, background: 'red' },
  }).png().toBuffer();
  const blue = await sharp({
    create: { width: 8, height: 8, channels: 3, background: 'blue' },
  }).png().toBuffer();
  const animated = await sharp([red, blue], { join: { animated: true } }).webp().toBuffer();
  const animatedMeta = await sharp(animated, { animated: true }).metadata();
  if ((animatedMeta.pages ?? 1) > 1) {
    const refused = await resizePublicImageBuffer(animated, 480, 'image/webp');
    assert.deepEqual(refused, { ok: false, reason: 'animated' });
  } else {
    assert.equal(resolveDisplayImageMetadata({
      width: 8,
      height: 16,
      pageHeight: 8,
      pages: 2,
    })?.animated, true);
  }

  const wide = await sharp({
    create: { width: 3840, height: 64, channels: 3, background: 'white' },
  }).jpeg({ quality: 60 }).toBuffer();
  const output = await resizePublicImageBuffer(wide, 3840, 'image/jpeg');
  assert.equal(output.ok, true);
  if (!output.ok) return;
  const metadata = await decodedWidth(output.buffer);
  assert.equal(metadata.width, 3840);
  assert.equal(metadata.height, 64);
});

test('策略版本进入 ETag 和内存键，清理前缀不匹配旧文件', () => {
  assert.equal(RESPONSIVE_PUBLIC_IMAGE_STRATEGY_VERSION, 2);
  const first = responsivePublicImageEtag(480, 'checksum-a');
  const second = responsivePublicImageEtag(480, 'checksum-b');
  assert.match(first, /^w480-v2-[a-f0-9]{16}$/);
  assert.notEqual(first, second);
  assert.match(responsivePublicImageMemoryKey('page-assets/a.jpg', 3840, 'checksum-a'), /:w3840:v2:checksum-a$/);
  assert.equal(responsivePublicImagePrunePrefix(480), 'w480-v2-');
  assert.equal('w480-oldhash.webp'.startsWith(responsivePublicImagePrunePrefix(480)), false);
});

test('rv 只接受当前策略版本，重复或错误版本不生成缓存变体', () => {
  assert.deepEqual(
    parseResponsivePublicImageRequest('/page-assets/hero.jpg?width=3840&rv=2'),
    { kind: 'IMAGE', storageKey: 'page-assets/hero.jpg', width: 3840, strategyVersion: 2 },
  );
  for (const url of [
    '/page-assets/hero.jpg?width=480&rv=9',
    '/page-assets/hero.jpg?width=480&rv=2&rv=2',
    '/page-assets/hero.jpg?width=480&rv=2.0',
    '/page-assets/hero.jpg?width=480&rv=',
  ]) {
    assert.deepEqual(parseResponsivePublicImageRequest(url), { kind: 'INVALID' }, url);
  }
});
