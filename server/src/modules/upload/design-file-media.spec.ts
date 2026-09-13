import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  assertSafeDesignFile,
  readVerifiedDesignMediaAsset,
  resolveDesignMediaPath,
  type DesignMediaAssetDescriptor,
} from './design-file-media';

test('3D 私有媒体只在真实字节、大小和 SHA-256 全部一致时可读', async () => {
  const runId = randomUUID();
  const storageKey = `design-assets/test-${runId}/design.3dm`;
  const filePath = resolveDesignMediaPath(storageKey);
  assert.ok(filePath);
  const bytes = Buffer.from('haichuan-design-file-integrity');
  const checksumSha256 = createHash('sha256').update(bytes).digest('hex');
  const asset: DesignMediaAssetDescriptor = {
    id: 1,
    storageKey,
    originalName: 'design.3dm',
    mimeType: 'application/octet-stream',
    byteSize: bytes.length,
    checksumSha256,
    accessLevel: 'PRIVATE',
    status: 'READY',
  };

  await mkdir(dirname(filePath), { recursive: true });
  try {
    await writeFile(filePath, bytes);
    const result = await readVerifiedDesignMediaAsset(asset, checksumSha256);
    assert.deepEqual(result.buffer, bytes);
    assert.equal(result.originalName, 'design.3dm');
    assert.equal(result.byteSize, bytes.length);

    await assert.rejects(
      readVerifiedDesignMediaAsset({ ...asset, byteSize: bytes.length + 1 }),
      ConflictException,
    );
    await assert.rejects(
      readVerifiedDesignMediaAsset({ ...asset, checksumSha256: '0'.repeat(64) }),
      ConflictException,
    );
    await rm(filePath);
    await assert.rejects(readVerifiedDesignMediaAsset(asset), NotFoundException);
  } finally {
    await rm(dirname(filePath), { recursive: true, force: true });
  }
});

test('3D 私有媒体解析拒绝公共、穿越和反斜杠存储键', () => {
  assert.equal(resolveDesignMediaPath('page-assets/design.3dm'), null);
  assert.equal(resolveDesignMediaPath('design-assets/../design.3dm'), null);
  assert.equal(resolveDesignMediaPath('design-assets\\design.3dm'), null);
});

test('3D 上传拒绝空字节、非白名单扩展名和跨平台路径名称', () => {
  const file = (name: string, bytes: Buffer) => ({
    originalname: name,
    mimetype: 'application/octet-stream',
    size: bytes.length,
    buffer: bytes,
  }) as Express.Multer.File;
  assert.equal(assertSafeDesignFile(file('design.3dm', Buffer.from('ok'))).extension, '.3dm');
  assert.throws(() => assertSafeDesignFile(file('design.png', Buffer.from('bad'))), BadRequestException);
  assert.throws(() => assertSafeDesignFile(file('../design.3dm', Buffer.from('bad'))), BadRequestException);
  assert.throws(() => assertSafeDesignFile(file('folder\\design.3dm', Buffer.from('bad'))), BadRequestException);
  assert.throws(() => assertSafeDesignFile(file('design.3dm', Buffer.alloc(0))), BadRequestException);
});
