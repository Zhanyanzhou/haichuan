import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { MediaAsset } from '@prisma/client';
import { UploadService, type PageMediaItem } from './upload.service';

const sharp = require('sharp');

function serviceAt(root: string) {
  const service = Object.create(UploadService.prototype) as {
    uploadDir: string;
    withDisplayFacts(item: PageMediaItem, asset: MediaAsset): Promise<PageMediaItem>;
  };
  service.uploadDir = root;
  return service;
}

function item(): PageMediaItem {
  return {
    id: 1,
    url: '/uploads/page-assets/fact.jpg',
    name: 'fact',
    type: 'image',
    mimeType: 'image/jpeg',
    size: 10,
    width: 3840,
    height: 2160,
    createdAt: new Date('2026-11-04T00:00:00.000Z'),
    status: 'READY',
    available: true,
    previewUrl: '/uploads/page-assets/fact.jpg',
    publicUrl: '/uploads/page-assets/fact.jpg',
    authorization: null,
    publicEligibility: 'PUBLIC',
  } as unknown as PageMediaItem;
}

function asset(storageKey: string, checksum: string): MediaAsset {
  return {
    storageKey,
    status: 'READY',
    mimeType: 'image/jpeg',
    checksumSha256: checksum,
    lifecycleRevision: 4,
    accessLevel: 'PUBLIC',
  } as MediaAsset;
}

test('文件缺失或读失败时不把数据库宽高写成已测量展示尺寸', async () => {
  const root = await mkdtemp(join(tmpdir(), 'haichuan-media-facts-'));
  try {
    const service = serviceAt(root);
    const missing = await service.withDisplayFacts(item(), asset('page-assets/missing.jpg', 'missing'));
    assert.equal(missing.metadataStatus, 'unknown');
    assert.equal(missing.displayWidth, undefined);
    assert.equal(missing.width, 3840);
    assert.equal(missing.height, 2160);

    await writeFile(join(root, 'broken.jpg'), 'not-an-image');
    const broken = await service.withDisplayFacts(
      { ...item(), url: '/uploads/broken.jpg' },
      asset('broken.jpg', 'broken'),
    );
    assert.equal(broken.metadataStatus, 'unknown');
    assert.equal(broken.displayWidth, undefined);
    assert.equal(broken.width, 3840);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('读到文件头后使用显示方向尺寸，方向 6 不沿用传感器宽高', async () => {
  const root = await mkdtemp(join(tmpdir(), 'haichuan-media-facts-'));
  try {
    const file = join(root, 'turned.jpg');
    await sharp({
      create: { width: 200, height: 100, channels: 3, background: { r: 20, g: 20, b: 20 } },
    }).jpeg().withMetadata({ orientation: 6 }).toFile(file);
    const service = serviceAt(root);
    const measured = await service.withDisplayFacts(item(), asset('turned.jpg', 'turned-orientation-6'));
    assert.equal(measured.metadataStatus, 'measured');
    assert.equal(measured.displayWidth, 100);
    assert.equal(measured.displayHeight, 200);
    assert.equal(measured.width, 100);
    assert.equal(measured.height, 200);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
