import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiError } from '../../common/errors/api-error';
import { CustomerAvatarService } from './customer-avatar.service';

const sharp = require('sharp');

function avatarFile(buffer: Buffer, mimetype = 'image/png'): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: '../../不要信任原文件名.png',
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
    destination: '',
    filename: '',
    path: '',
    stream: null as never,
  };
}

async function withAvatarRoot(
  prisma: object,
  action: (service: CustomerAvatarService, root: string) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'hc-avatar-'));
  const service = new CustomerAvatarService(prisma as never);
  Object.defineProperty(service, 'root', { value: root });
  try {
    await action(service, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('头像忽略原文件名并重新编码为随机命名的 512px WebP', async () => {
  const input = await sharp({
    create: { width: 24, height: 12, channels: 4, background: '#b68d40' },
  }).png().toBuffer();
  let storedKey = '';
  const tx = {
    customer: {
      updateMany: async (query: { data: { avatarStorageKey: string } }) => {
        storedKey = query.data.avatarStorageKey;
        return { count: 1 };
      },
    },
    customerSecurityEvent: { create: async () => ({ id: 1 }) },
  };
  await withAvatarRoot({
    customer: { findUnique: async () => ({ avatarStorageKey: null }) },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  }, async (service, root) => {
    const result = await service.replace(7, avatarFile(input));
    assert.equal(result.avatarUrl, '/api/customers/me/avatar');
    assert.match(storedKey, /^7\/[0-9a-f-]{36}\.webp$/);
    assert.equal(storedKey.includes('不要信任原文件名'), false);

    const output = await readFile(join(root, ...storedKey.split('/')));
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 512);
    assert.equal(metadata.height, 512);
  });
});

test('头像并发更新竞争失败时删除新文件且不覆盖已变化的数据库引用', async () => {
  const input = await sharp({
    create: { width: 8, height: 8, channels: 4, background: '#ffffff' },
  }).png().toBuffer();
  const tx = {
    customer: {
      updateMany: async () => ({ count: 0 }),
    },
    customerSecurityEvent: { create: async () => ({ id: 1 }) },
  };
  await withAvatarRoot({
    customer: { findUnique: async () => ({ avatarStorageKey: null }) },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  }, async (service, root) => {
    await assert.rejects(
      service.replace(7, avatarFile(input)),
      (error: unknown) => error instanceof ApiError && error.errorCode === 'AVATAR_UPDATE_CONFLICT',
    );
    assert.deepEqual(await readdir(join(root, '7')), []);
  });
});

test('头像读取拒绝跨客户存储键和伪造图片声明', async () => {
  const foreignKey = '8/123e4567-e89b-42d3-a456-426614174000.webp';
  await withAvatarRoot({
    customer: { findUnique: async () => ({ avatarStorageKey: foreignKey }) },
  }, async (service) => {
    await assert.rejects(
      service.read(7),
      (error: unknown) => error instanceof ApiError && error.errorCode === 'AVATAR_NOT_FOUND',
    );
  });

  const input = await sharp({
    create: { width: 8, height: 8, channels: 4, background: '#ffffff' },
  }).png().toBuffer();
  const service = new CustomerAvatarService({} as never);
  await assert.rejects(
    service.replace(7, avatarFile(input, 'image/jpeg')),
    (error: unknown) => error instanceof ApiError && error.errorCode === 'AVATAR_CONTENT_INVALID',
  );
});

test('替换头像不会删除数据库中误指向的其他客户私有文件', async () => {
  const foreignKey = '8/123e4567-e89b-42d3-a456-426614174000.webp';
  const input = await sharp({
    create: { width: 8, height: 8, channels: 4, background: '#ffffff' },
  }).png().toBuffer();
  const tx = {
    customer: { updateMany: async () => ({ count: 1 }) },
    customerSecurityEvent: { create: async () => ({ id: 1 }) },
  };
  await withAvatarRoot({
    customer: { findUnique: async () => ({ avatarStorageKey: foreignKey }) },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  }, async (service, root) => {
    const foreignPath = join(root, ...foreignKey.split('/'));
    await mkdir(join(root, '8'), { recursive: true });
    await writeFile(foreignPath, Buffer.from('foreign-avatar'));

    await service.replace(7, avatarFile(input));

    assert.equal((await readFile(foreignPath)).toString(), 'foreign-avatar');
  });
});

test('删除头像只清空当前客户引用、记录脱敏审计并删除本人文件', async () => {
  const storageKey = '7/123e4567-e89b-42d3-a456-426614174000.webp';
  let currentStorageKey: string | null = storageKey;
  const writes: Array<{ area: string; query: any }> = [];
  const tx = {
    customer: {
      updateMany: async (query: any) => {
        writes.push({ area: 'customer', query });
        currentStorageKey = null;
        return { count: 1 };
      },
    },
    customerSecurityEvent: {
      create: async (query: any) => {
        writes.push({ area: 'event', query });
        return { id: 1 };
      },
    },
  };
  await withAvatarRoot({
    customer: { findUnique: async () => ({ avatarStorageKey: currentStorageKey }) },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  }, async (service, root) => {
    const target = join(root, ...storageKey.split('/'));
    await mkdir(join(root, '7'), { recursive: true });
    await writeFile(target, Buffer.from('avatar'));

    const result = await service.delete(7, {
      ip: '127.0.0.1',
      userAgent: 'avatar-delete-test',
    });

    assert.equal(result.avatarUrl, null);
    assert.deepEqual(writes.map((write) => write.area), ['customer', 'event']);
    assert.deepEqual(writes[0].query.where, { id: 7, avatarStorageKey: storageKey });
    assert.equal(writes[0].query.data.avatarStorageKey, null);
    assert.equal(writes[1].query.data.eventType, 'AVATAR_REMOVED');
    assert.match(writes[1].query.data.ipHash, /^[0-9a-f]{64}$/);
    assert.match(writes[1].query.data.userAgentHash, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(writes).includes('127.0.0.1'), false);
    assert.equal(JSON.stringify(writes).includes('avatar-delete-test'), false);
    await assert.rejects(readFile(target), (error: unknown) => (
      error instanceof Error && 'code' in error && error.code === 'ENOENT'
    ));
  });
});

test('删除头像遇到跨客户存储键时只清引用，不删除他人文件', async () => {
  const foreignKey = '8/123e4567-e89b-42d3-a456-426614174000.webp';
  const tx = {
    customer: { updateMany: async () => ({ count: 1 }) },
    customerSecurityEvent: { create: async () => ({ id: 1 }) },
  };
  await withAvatarRoot({
    customer: { findUnique: async () => ({ avatarStorageKey: foreignKey }) },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  }, async (service, root) => {
    const foreignPath = join(root, ...foreignKey.split('/'));
    await mkdir(join(root, '8'), { recursive: true });
    await writeFile(foreignPath, Buffer.from('foreign-avatar'));

    const result = await service.delete(7, {});

    assert.equal(result.avatarUrl, null);
    assert.equal((await readFile(foreignPath)).toString(), 'foreign-avatar');
  });
});

test('删除头像审计事务失败时恢复删除任务并保留原文件', async () => {
  const storageKey = '7/123e4567-e89b-42d3-a456-426614174000.webp';
  await withAvatarRoot({
    customer: { findUnique: async () => ({ avatarStorageKey: storageKey }) },
    $transaction: async () => { throw new Error('forced audit failure'); },
  }, async (service, root) => {
    const target = join(root, ...storageKey.split('/'));
    await mkdir(join(root, '7'), { recursive: true });
    await writeFile(target, Buffer.from('avatar'));

    await assert.rejects(service.delete(7, {}), /forced audit failure/);

    assert.equal((await readFile(target)).toString(), 'avatar');
    assert.deepEqual(await readdir(join(root, '.pending-delete')), []);
  });
});

test('注销头像删除失败会写入持久化队列并可在后续启动重试', async () => {
  const storageKey = '7/123e4567-e89b-42d3-a456-426614174000.webp';
  await withAvatarRoot({ customer: { findUnique: async () => null } }, async (service, root) => {
    const target = join(root, ...storageKey.split('/'));
    // 以目录占据目标路径，稳定触发 unlink 失败，同时不依赖平台文件锁语义。
    await mkdir(target, { recursive: true });

    await service.remove(storageKey);

    const pendingRoot = join(root, '.pending-delete');
    const markers = await readdir(pendingRoot);
    assert.equal(markers.length, 1);
    assert.match(markers[0], /^[a-f0-9]{64}\.json$/);
    const queued = JSON.parse(await readFile(join(pendingRoot, markers[0]), 'utf8'));
    assert.equal(queued.customerId, 7);
    assert.equal(queued.storageKey, storageKey);

    await rm(target, { recursive: true, force: true });
    await service.retryPendingRemovals();
    assert.deepEqual(await readdir(pendingRoot), []);
  });
});

test('删除重试按当前数据库引用决定保留或删除头像，避免崩溃窗口误删和遗留', async () => {
  const storageKey = '7/123e4567-e89b-42d3-a456-426614174000.webp';
  let currentStorageKey: string | null = storageKey;
  await withAvatarRoot({
    customer: {
      findUnique: async () => ({ avatarStorageKey: currentStorageKey }),
    },
  }, async (service, root) => {
    const target = join(root, ...storageKey.split('/'));
    await mkdir(join(root, '7'), { recursive: true });
    await writeFile(target, Buffer.from('avatar'));

    await service.prepareRemoval(storageKey);
    await service.retryPendingRemovals();
    assert.equal((await readFile(target)).toString(), 'avatar');
    assert.deepEqual(await readdir(join(root, '.pending-delete')), []);

    currentStorageKey = null;
    await service.prepareRemoval(storageKey);
    await service.retryPendingRemovals();
    await assert.rejects(readFile(target), (error: unknown) => (
      error instanceof Error && 'code' in error && error.code === 'ENOENT'
    ));
    assert.deepEqual(await readdir(join(root, '.pending-delete')), []);
  });
});
