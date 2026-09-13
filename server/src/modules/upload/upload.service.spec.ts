import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import type { MediaAsset } from '@prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { UploadService } from './upload.service';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function uploadFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'synthetic.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: PNG.length,
    buffer: PNG,
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
    ...overrides,
  };
}

function createPrismaDouble() {
  const rows = new Map<number, MediaAsset>();
  let nextId = 1;
  const matchingRows = (where: Record<string, unknown>) => [...rows.values()]
    .filter((row) => row.accessLevel === 'PUBLIC' && row.storageKey.startsWith('page-assets/'))
    .filter((row) => {
      const status = where.status as string | { in: string[] };
      return typeof status === 'string' ? row.status === status : status.in.includes(row.status);
    })
    .filter((row) => {
      const mimeType = where.mimeType as { startsWith: string } | undefined;
      return !mimeType || row.mimeType.startsWith(mimeType.startsWith);
    })
    .filter((row) => {
      const originalName = where.originalName as { contains: string } | undefined;
      return !originalName || (row.originalName || '').includes(originalName.contains);
    });
  const mediaAsset = {
    findUnique: async ({ where }: { where: { storageKey?: string; id?: number } }) =>
      (where.id ? rows.get(where.id) : [...rows.values()].find((row) => row.storageKey === where.storageKey)) ?? null,
    findFirst: async ({ where }: { where: { id: number; accessLevel?: string; storageKey: string | { startsWith: string } } }) => {
      const row = rows.get(where.id);
      const storageMatches = typeof where.storageKey === 'string'
        ? row?.storageKey === where.storageKey
        : row?.storageKey.startsWith(where.storageKey.startsWith);
      return row && (!where.accessLevel || row.accessLevel === where.accessLevel) && storageMatches
        ? { ...row, authorization: null }
        : null;
    },
    findMany: async ({ where, skip = 0, take = Number.MAX_SAFE_INTEGER }: { where: Record<string, unknown>; skip?: number; take?: number }) =>
      matchingRows(where)
        .sort((left, right) => right.id - left.id)
        .slice(skip, skip + take),
    count: async ({ where }: { where: Record<string, unknown> }) => matchingRows(where).length,
    create: async ({ data }: {
      data: Omit<MediaAsset, 'id' | 'createdAt' | 'updatedAt' | 'durationMs' | 'altText' | 'locale'>;
    }) => {
      const now = new Date();
      const created = {
        id: nextId++,
        durationMs: null,
        altText: null,
        locale: null,
        createdAt: now,
        updatedAt: now,
        ...data,
        lifecycleRevision: data.lifecycleRevision ?? 1,
        integrityCheckedAt: data.integrityCheckedAt ?? null,
        quarantineReason: data.quarantineReason ?? null,
        width: data.width ?? null,
        height: data.height ?? null,
        uploadedBy: data.uploadedBy ?? null,
      } as MediaAsset;
      rows.set(created.id, created);
      return created;
    },
    update: async ({ where, data }: { where: { id: number }; data: Partial<MediaAsset> & { lifecycleRevision?: unknown } }) => {
      const current = rows.get(where.id);
      if (!current) throw new Error('missing row');
      const lifecycleRevision = data.lifecycleRevision && typeof data.lifecycleRevision === 'object' && 'increment' in data.lifecycleRevision
        ? current.lifecycleRevision + Number((data.lifecycleRevision as { increment: unknown }).increment)
        : data.lifecycleRevision ?? current.lifecycleRevision;
      const updated = { ...current, ...data, lifecycleRevision, updatedAt: new Date() } as MediaAsset;
      rows.set(current.id, updated);
      return updated;
    },
  };
  let transactionTail = Promise.resolve();
  const prisma: Record<string, unknown> = {
    mediaAsset,
    $queryRaw: async (strings: TemplateStringsArray) => strings[0]?.includes('RELEASE_LOCK')
      ? [{ released: 1 }]
      : [{ acquired: 1 }],
  };
  prisma.$transaction = async (input: Array<Promise<unknown>> | ((client: unknown) => Promise<unknown>)) => {
    if (Array.isArray(input)) return Promise.all(input);
    const previous = transactionTail;
    let release: () => void = () => {};
    transactionTail = new Promise<void>((resolvePromise) => { release = resolvePromise; });
    await previous;
    try {
      return await input(prisma);
    } finally {
      release();
    }
  };
  return { prisma: prisma as unknown as PrismaService, rows };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'haichuan-page-media-'));
  const { prisma, rows } = createPrismaDouble();
  const service = new UploadService(prisma, {
    ensureLegacyDraft: async () => undefined,
  } as never);
  Object.defineProperty(service, 'uploadDir', { value: join(root, 'uploads') });
  Object.defineProperty(service, 'archivedPageMediaRoot', { value: join(root, 'private-media', 'page-assets-archive') });
  return { root, rows, service };
}

test('页面图片上传会登记、按内容去重，并在并发后只保留一个稳定引用', async () => {
  const { root, rows, service } = await fixture();
  try {
    const [first, second] = await Promise.all([
      service.uploadFile(uploadFile(), 7),
      service.uploadFile(uploadFile({ originalname: 'same-content.png' }), 7),
    ]);
    assert.equal(first.url, second.url);
    assert.equal(rows.size, 1);
    assert.match(first.url, /^\/uploads\/page-assets\/[a-f0-9]{64}\.png$/);
    const diskPath = join(root, first.url.replace(/^\//, ''));
    assert.equal(existsSync(diskPath), true);
    assert.deepEqual(await readFile(diskPath), PNG);

    const listed = await service.listPageMedia({ page: 1, pageSize: 50, includeArchived: true });
    assert.equal(listed.total, 1);
    assert.equal(listed.list[0]?.available, true);
    const registeredName = listed.list[0]?.name;
    assert.ok(['synthetic.png', 'same-content.png'].includes(registeredName || ''));
    await service.uploadFile(uploadFile({ originalname: 'later-duplicate.png' }), 99);
    assert.equal(rows.get(first.id)?.originalName, registeredName, '后续重复上传不覆写首次登记来源');
    assert.equal(rows.get(first.id)?.uploadedBy, 7);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('商品图片上传会登记 MediaAsset 并以旧素材默认拒绝策略建立授权草稿', async () => {
  const root = await mkdtemp(join(tmpdir(), 'haichuan-product-media-'));
  const previousRoot = process.env.PRODUCT_MEDIA_ROOT;
  process.env.PRODUCT_MEDIA_ROOT = root;
  const { prisma, rows } = createPrismaDouble();
  const authorizationCalls: Array<{ assetId: number; uploadedBy?: number }> = [];
  const service = new UploadService(prisma, {
    ensureLegacyDraft: async (_transaction: unknown, assetId: number, uploadedBy?: number) => {
      authorizationCalls.push({ assetId, uploadedBy });
    },
  } as never);

  try {
    const uploaded = await service.uploadPrivateImage(uploadFile(), 77);
    const asset = rows.get(uploaded.mediaAssetId);
    assert.ok(asset);
    assert.match(uploaded.storageKey, /^product-assets\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9-]+\.png$/);
    assert.equal(asset.storageKey, uploaded.storageKey);
    assert.equal(asset.status, 'READY');
    assert.equal(asset.accessLevel, 'PUBLIC');
    assert.equal(asset.uploadedBy, 77);
    assert.deepEqual(authorizationCalls, [{ assetId: uploaded.mediaAssetId, uploadedBy: 77 }]);
    assert.equal(existsSync(join(root, uploaded.storageKey)), true);
  } finally {
    if (previousRoot === undefined) delete process.env.PRODUCT_MEDIA_ROOT;
    else process.env.PRODUCT_MEDIA_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  }
});

test('图片上传对内容、MIME、扩展名、大小和危险文件名失败关闭', async () => {
  const { root, service } = await fixture();
  try {
    await assert.rejects(
      service.uploadFile(uploadFile({ originalname: 'fake.jpg' })),
      /扩展名与声明类型不一致/,
    );
    await assert.rejects(
      service.uploadFile(uploadFile({ originalname: 'fake.jpg', mimetype: 'image/jpeg' })),
      /图片类型不一致/,
    );
    await assert.rejects(
      service.uploadFile(uploadFile({ originalname: '..\\escape.png' })),
      /不安全字符/,
    );
    await assert.rejects(
      service.uploadFile(uploadFile({ size: 10 * 1024 * 1024 + 1 })),
      /不能超过 10MB/,
    );
    await assert.rejects(
      service.uploadFile(uploadFile({ buffer: Buffer.from('<svg onload=alert(1)>'), size: 21 })),
      /不是有效图片/,
    );
    await assert.rejects(
      service.uploadFile(uploadFile({ buffer: PNG.subarray(0, PNG.length - 16), size: PNG.length - 16 })),
      /不是有效图片/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('启动恢复会把文件已移入归档但数据库仍为 READY 的中断状态安全降级并允许显式恢复', async () => {
  const { root, rows, service } = await fixture();
  try {
    const uploaded = await service.uploadFile(uploadFile(), 11);
    const publicPath = join(root, uploaded.url.replace(/^\//, ''));
    const archivedPath = join(root, 'private-media', 'page-assets-archive', uploaded.url.replace(/^\/uploads\//, ''));
    await mkdir(join(archivedPath, '..'), { recursive: true });
    await rename(publicPath, archivedPath);

    assert.equal(rows.get(uploaded.id)?.status, 'READY', '构造文件移动后、数据库提交前崩溃的分裂状态');
    await service.onModuleInit();
    assert.equal(rows.get(uploaded.id)?.status, 'ARCHIVED');
    assert.equal(rows.get(uploaded.id)?.quarantineReason, null);
    assert.ok(rows.get(uploaded.id)?.integrityCheckedAt instanceof Date);
    assert.equal(existsSync(publicPath), false);

    const restored = await service.restorePageMedia(uploaded.id);
    assert.equal(restored.status, 'READY');
    assert.equal(existsSync(publicPath), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('启动恢复会撤下哈希错配和无登记的公开文件，归档损坏文件不能恢复', async () => {
  const { root, rows, service } = await fixture();
  try {
    const uploaded = await service.uploadFile(uploadFile(), 12);
    const publicPath = join(root, uploaded.url.replace(/^\//, ''));
    await writeFile(publicPath, Buffer.from('tampered-public-content'));
    const orphanPath = join(root, 'uploads', 'page-assets', 'orphan.png');
    await writeFile(orphanPath, PNG);

    await service.onModuleInit();
    assert.equal(rows.get(uploaded.id)?.status, 'QUARANTINED');
    assert.equal(rows.get(uploaded.id)?.quarantineReason, 'CHECKSUM_MISMATCH');
    assert.ok(rows.get(uploaded.id)?.integrityCheckedAt instanceof Date);
    assert.equal(existsSync(publicPath), false, '哈希错配文件不得继续公开');
    assert.equal(existsSync(orphanPath), false, '无数据库登记的文件不得留在静态目录');
    const quarantine = await readdir(join(root, 'private-media', 'page-assets-archive', 'quarantine'));
    assert.equal(quarantine.length, 2, '错配与孤儿文件均保留在私有隔离区供取证');

    const differentPng = await require('sharp')({
      create: { width: 2, height: 1, channels: 4, background: { r: 20, g: 20, b: 20, alpha: 1 } },
    }).png().toBuffer();
    const second = await service.uploadFile(uploadFile({
      originalname: 'archive-corrupt.png',
      buffer: differentPng,
      size: differentPng.length,
    }), 12);
    await service.archivePageMedia(second.id);
    const archivedPath = join(root, 'private-media', 'page-assets-archive', second.url.replace(/^\/uploads\//, ''));
    await writeFile(archivedPath, Buffer.from('tampered-archive-content'));
    await assert.rejects(service.restorePageMedia(second.id), /完整性校验失败/);
    assert.equal(rows.get(second.id)?.status, 'QUARANTINED');
    assert.equal(rows.get(second.id)?.quarantineReason, 'CHECKSUM_MISMATCH');
    assert.equal(existsSync(join(root, second.url.replace(/^\//, ''))), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('受控读取发现 checksum 错配会在锁事务内撤下文件并持久化隔离状态', async () => {
  const { root, rows, service } = await fixture();
  try {
    const uploaded = await service.uploadFile(uploadFile(), 15);
    const publicPath = join(root, uploaded.url.replace(/^\//, ''));
    await writeFile(publicPath, Buffer.from('tampered-before-controlled-read'));

    await assert.rejects(service.getPageMediaContent(uploaded.id, false), /已隔离/);
    const quarantined = rows.get(uploaded.id);
    assert.equal(quarantined?.status, 'QUARANTINED');
    assert.equal(quarantined?.quarantineReason, 'CHECKSUM_MISMATCH');
    assert.ok(quarantined?.integrityCheckedAt instanceof Date);
    assert.equal(existsSync(publicPath), false);

    const ordinaryList = await service.listPageMedia({ page: 1, pageSize: 50 });
    assert.equal(ordinaryList.total, 0, '默认列表只展示 READY 素材');
    const operationalList = await service.listPageMedia({ page: 1, pageSize: 50, includeArchived: true });
    assert.equal(operationalList.total, 1);
    assert.equal(operationalList.list[0]?.status, 'QUARANTINED');
    const filtered = await service.listPageMedia({ page: 1, pageSize: 50, status: 'QUARANTINED' });
    assert.equal(filtered.total, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('旧 /uploads/page-assets URL 按 storageKey 进入集中读取且危险键失败关闭', async () => {
  const { root, service } = await fixture();
  try {
    const uploaded = await service.uploadFile(uploadFile(), 16);
    const storageKey = uploaded.url.replace(/^\/uploads\//, '');
    const preview = await service.getPageMediaContentByStorageKey(storageKey, false);
    assert.deepEqual(preview.buffer, PNG);
    await assert.rejects(
      service.getPageMediaContentByStorageKey(storageKey, true),
      /当前不可公开访问/,
      '没有已批准授权时，旧 URL 不能退回静态读取',
    );
    for (const dangerous of ['page-assets/../secret.png', 'page-assets\\escape.png', '../page-assets/secret.png']) {
      await assert.rejects(service.getPageMediaContentByStorageKey(dangerous, true), /素材不存在/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('归档会停止公开文件访问，恢复会回到原稳定地址；缺失文件可安全失效但不能伪恢复', async () => {
  const { root, rows, service } = await fixture();
  try {
    const uploaded = await service.uploadFile(uploadFile(), 9);
    const publicPath = join(root, uploaded.url.replace(/^\//, ''));
    const archived = await service.archivePageMedia(uploaded.id);
    assert.equal(archived.status, 'ARCHIVED');
    assert.equal(archived.available, false);
    assert.equal(existsSync(publicPath), false);

    const restored = await service.restorePageMedia(uploaded.id);
    assert.equal(restored.status, 'READY');
    assert.equal(restored.available, true);
    assert.equal(restored.url, uploaded.url);

    await unlink(publicPath);
    const missing = await service.listPageMedia({ page: 1, pageSize: 50 });
    assert.equal(missing.list[0]?.available, false);
    const safelyArchived = await service.archivePageMedia(uploaded.id);
    assert.equal(safelyArchived.status, 'ARCHIVED');
    assert.equal(rows.get(uploaded.id)?.status, 'ARCHIVED');
    await assert.rejects(service.uploadFile(uploadFile(), 10), /显式恢复/);
    await assert.rejects(service.restorePageMedia(uploaded.id), /素材文件不存在/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function mp4Box(type: string, payload: Buffer) {
  const box = Buffer.alloc(8 + payload.length);
  box.writeUInt32BE(box.length, 0);
  box.write(type, 4, 4, 'ascii');
  payload.copy(box, 8);
  return box;
}

test('视频声明类型必须匹配完整容器骨架，截断或跨类型伪装失败关闭', async () => {
  const { root, service } = await fixture();
  try {
    const validMp4 = Buffer.concat([
      mp4Box('ftyp', Buffer.from('isom\0\0\0\0isom', 'binary')),
      mp4Box('moov', mp4Box('mvhd', Buffer.alloc(4))),
      mp4Box('mdat', Buffer.from([0, 0, 0, 1])),
    ]);
    const stored = await service.registerStoredVideo(uploadFile({
      originalname: 'synthetic.mp4',
      mimetype: 'video/mp4',
      buffer: validMp4,
      size: validMp4.length,
    }), 7);
    assert.equal(stored.type, 'video');
    await assert.rejects(service.registerStoredVideo(uploadFile({
      originalname: 'truncated.mp4',
      mimetype: 'video/mp4',
      buffer: Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]),
      size: 8,
    })), /不是有效的 MP4/);
    await assert.rejects(service.registerStoredVideo(uploadFile({
      originalname: 'wrong.webm',
      mimetype: 'video/webm',
      buffer: validMp4,
      size: validMp4.length,
    })), /不是有效的 WebM/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('客户付款凭证只生成私有存储键，不生成或写入公开页面素材目录', async () => {
  const { root, rows, service } = await fixture();
  try {
    Object.defineProperty(service, 'paymentProofRoot', { value: join(root, 'private-media', 'payment-proofs') });
    const proof = await service.uploadPrivatePaymentProof(23, uploadFile({ originalname: 'proof.png' }));
    assert.doesNotMatch(proof.storageKey, /^\/uploads\//);
    assert.equal(existsSync(join(root, 'private-media', 'payment-proofs', proof.storageKey)), true);
    assert.equal(existsSync(join(root, 'uploads', proof.storageKey)), false);
    assert.equal(rows.size, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
