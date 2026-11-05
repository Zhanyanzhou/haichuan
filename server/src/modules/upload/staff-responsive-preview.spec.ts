import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { MediaAsset } from '@prisma/client';
import type { Response } from 'express';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
const sharp = require('sharp');

async function fixture() {
  const temporaryRoot = join(process.cwd(), '../.codex-tmp');
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(join(temporaryRoot, 'staff-preview-'));
  const storageKey = 'page-assets/synthetic.png';
  const buffer = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#123456' } }).png().toBuffer();
  const sourcePath = join(root, 'public', storageKey);
  await mkdir(join(root, 'public/page-assets'), { recursive: true });
  await writeFile(sourcePath, buffer);
  const asset = {
    id: 7, storageKey, status: 'READY', accessLevel: 'PUBLIC', mimeType: 'image/png',
    checksumSha256: createHash('sha256').update(buffer).digest('hex'), lifecycleRevision: 1,
  } as MediaAsset;
  const actors = new Set([1, 2]);
  const families = new Set(['session-1', 'session-2']);
  let authorizationReads = 0;
  const prisma = {
    mediaAsset: {
      findUnique: async () => asset,
      findFirst: async () => ({ ...asset, authorization: null }),
      update: async ({ data }: { data: Partial<MediaAsset> }) => Object.assign(asset, data),
    },
    product: { updateMany: async () => ({ count: 0 }) },
    $queryRaw: async (query: { strings?: readonly string[]; values?: unknown[] } | TemplateStringsArray) => {
      const text = (Array.isArray(query) ? query : (query as { strings?: readonly string[] }).strings)?.join('?') ?? '';
      const values = 'values' in query && typeof query.values !== 'function' ? query.values : [];
      if (text.includes('FROM users')) {
        authorizationReads += 1;
        return actors.has(Number(values?.[0])) ? [{ id: Number(values?.[0]), role: 'EDITOR' }] : [];
      }
      if (text.includes('admin_refresh_sessions')) return families.has(String(values?.[1])) ? [{ id: 1 }] : [];
      return [{ id: asset.id }];
    },
  };
  const database = Object.assign(prisma, { $transaction: async (operation: (db: typeof prisma) => Promise<unknown>) => operation(prisma) });
  const makeService = () => {
    const service = new UploadService(database as never, {} as never);
    Object.defineProperties(service, {
      uploadDir: { value: join(root, 'public') },
      archivedPageMediaRoot: { value: join(root, 'private/archive') },
      responsivePublicDiskRoot: { value: join(root, 'private/responsive-public') },
    });
    return service;
  };
  return { root, sourcePath, storageKey, buffer, asset, actors, families, makeService, authorizationReads: () => authorizationReads };
}

test('后台派生先验证员工和原文件，再命中内存/磁盘缓存；原始读取不变且指纹变化不串图', async () => {
  const f = await fixture();
  try {
    const service = f.makeService();
    const actor = { id: 1, sessionFamilyId: 'session-1' };
    const original = await service.getPageMediaContentByStorageKey(f.storageKey, false, actor);
    assert.deepEqual(original.buffer, f.buffer);
    const first = await service.getResponsiveStaffPageImage(f.storageKey, 480, actor);
    assert.equal(first.mimeType, 'image/webp');
    const metadata = await sharp(first.buffer).metadata();
    assert.equal(metadata.width, 480);
    assert.equal(metadata.height, 270);
    const previousReads = f.authorizationReads();
    const second = await service.getResponsiveStaffPageImage(f.storageKey, 480, { id: 2, sessionFamilyId: 'session-2' });
    assert.equal(second.buffer, first.buffer, '可复用同一派生内容，但不能复用员工授权');
    assert.ok(f.authorizationReads() > previousReads);
    const diskHit = await f.makeService().getResponsiveStaffPageImage(f.storageKey, 480, actor);
    assert.deepEqual(diskHit.buffer, first.buffer);
    f.actors.delete(2);
    await assert.rejects(() => service.getResponsiveStaffPageImage(f.storageKey, 480, { id: 2 }), ForbiddenException);
    f.families.delete('session-1');
    await assert.rejects(() => service.getResponsiveStaffPageImage(f.storageKey, 480, actor), ForbiddenException);
    f.families.add('session-1');
    const replacement = await sharp({ create: { width: 1000, height: 500, channels: 3, background: 'blue' } }).png().toBuffer();
    await writeFile(f.sourcePath, replacement);
    f.asset.checksumSha256 = createHash('sha256').update(replacement).digest('hex');
    const changed = await service.getResponsiveStaffPageImage(f.storageKey, 480, actor);
    assert.notEqual(changed.etag, first.etag);
    assert.equal((await sharp(changed.buffer).metadata()).height, 240);
    assert.deepEqual(await readFile(f.sourcePath), replacement, '派生不改写原文件');
    await writeFile(f.sourcePath, 'tampered');
    await assert.rejects(() => service.getResponsiveStaffPageImage(f.storageKey, 480, actor), ConflictException);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('后台派生拒绝非法档位、缺少员工及无法安全转换的动画，原图仍可读取', async () => {
  const f = await fixture();
  try {
    const service = f.makeService();
    await assert.rejects(() => service.getResponsiveStaffPageImage(f.storageKey, 500, 1), BadRequestException);
    await assert.rejects(() => service.getResponsiveStaffPageImage(f.storageKey, 480), ForbiddenException);
    const red = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'red' } }).png().toBuffer();
    const blue = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'blue' } }).png().toBuffer();
    const animated = await sharp([red, blue], { join: { animated: true } }).webp().toBuffer();
    assert.ok((await sharp(animated, { animated: true }).metadata()).pages > 1);
    await writeFile(f.sourcePath, animated);
    f.asset.checksumSha256 = createHash('sha256').update(animated).digest('hex');
    f.asset.mimeType = 'image/webp';
    await assert.rejects(() => service.getResponsiveStaffPageImage(f.storageKey, 480, 1), NotFoundException);
    assert.deepEqual((await service.getPageMediaContentByStorageKey(f.storageKey, false, 1)).buffer, animated);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('后台派生GET/HEAD响应头一致，无width读取原图，非法query不进入服务', async () => {
  const calls: unknown[][] = [];
  const controller = new UploadController({
    getPageMediaContentByStorageKey: async (...args: unknown[]) => { calls.push(['original', ...args]); return { buffer: Buffer.from('original'), mimeType: 'image/png' }; },
    getResponsiveStaffPageImage: async (...args: unknown[]) => { calls.push(['responsive', ...args]); return { buffer: Buffer.from('webp'), mimeType: 'image/webp', etag: 'private-derived' }; },
  } as never, {} as never);
  const responses: Array<{ headers: Record<string, string>; mime?: string; body?: Buffer; ended?: boolean }> = [];
  for (const method of ['GET', 'HEAD']) {
    const state: typeof responses[number] = { headers: {} }; responses.push(state);
    const response = {
      setHeader(key: string, value: string) { state.headers[key] = value; return this; },
      type(value: string) { state.mime = value; return this; },
      send(body: Buffer) { state.body = body; return this; }, end() { state.ended = true; return this; },
    } as unknown as Response;
    await controller.previewPageMediaByStorageKey('page-assets/synthetic.png', response, { method, user: { id: 1 } } as never, '480');
  }
  assert.deepEqual(responses[0].headers, responses[1].headers);
  assert.equal(responses[0].headers['Cache-Control'], 'private, max-age=60');
  assert.equal(responses[0].headers.Vary, 'Cookie, Authorization');
  assert.equal(responses[0].headers.ETag, '"private-derived"');
  assert.equal(responses[0].headers['Content-Length'], '4');
  assert.equal(responses[1].body, undefined); assert.equal(responses[1].ended, true);
  const originalResponse = { setHeader() {}, type() {}, send() {} } as unknown as Response;
  await controller.previewPageMediaByStorageKey('page-assets/synthetic.png', originalResponse, { user: { id: 1 } } as never);
  assert.equal(calls.at(-1)?.[0], 'original');
  const before = calls.length;
  for (const invalid of ['', '500', '480x', '4.8e2', ['480'] as unknown as string]) {
    await assert.rejects(() => controller.previewPageMediaByStorageKey('page-assets/synthetic.png', originalResponse, undefined, invalid), BadRequestException);
  }
  assert.equal(calls.length, before);
  const errorHeaders: Record<string, string> = {};
  const denied = new UploadController({
    getResponsiveStaffPageImage: async () => { throw new ForbiddenException(); },
  } as never, {} as never);
  await assert.rejects(() => denied.previewPageMediaByStorageKey('page-assets/synthetic.png', {
    setHeader(key: string, value: string) { errorHeaders[key] = value; },
  } as unknown as Response, { user: { id: 1 } } as never, '480'), ForbiddenException);
  assert.equal(errorHeaders['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(errorHeaders.Vary, 'Cookie, Authorization');
});
