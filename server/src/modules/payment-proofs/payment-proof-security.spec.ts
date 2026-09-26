import assert from 'node:assert/strict';
import test from 'node:test';
import { validateImageContent } from '../../common/media/image-content-validation';

const sharp = require('sharp');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('付款凭证共享解码器拒绝超过总像素上限的图片', async () => {
  const oversized = await sharp({
    create: {
      width: 5_001,
      height: 5_000,
      channels: 3,
      background: '#ffffff',
    },
  }).png().toBuffer();
  await assert.rejects(validateImageContent(oversized, 'png'), /有效图片|像素|尺寸/);
});

test('付款凭证共享解码器完整解码并拒绝截断图片', async () => {
  await assert.rejects(validateImageContent(PNG.subarray(0, PNG.length - 20), 'png'), /有效图片/);
});
