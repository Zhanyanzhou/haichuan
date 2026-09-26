import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiError } from '../../common/errors/api-error';
import { IdempotencyService } from '../../common/idempotency/idempotency-key';
import { CustomerAvatarService } from './customer-avatar.service';

const sharp = require('sharp');

const avatarCustomer = (authVersion = 1) => ({ id: 7, authVersion });

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
  const service = new CustomerAvatarService(prisma as never, new IdempotencyService());
  Object.defineProperty(service, 'root', { value: root });
  try {
    await action(service, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('头像忽略原文件名并按幂等凭据重新编码为稳定命名的 512px WebP', async () => {
  const input = await sharp({
    create: { width: 24, height: 12, channels: 4, background: '#b68d40' },
  }).png().toBuffer();
  let storedKey = '';
  const tx = {
    $queryRaw: async () => [{ id: 7 }],
    customer: {
      findUnique: async () => ({ avatarStorageKey: null, status: 'ACTIVE', authVersion: 1 }),
      updateMany: async (query: { data: { avatarStorageKey: string } }) => {
        storedKey = query.data.avatarStorageKey;
        return { count: 1 };
      },
    },
    customerSecurityEvent: { create: async () => ({ id: 1 }) },
  };
  await withAvatarRoot({
    customer: { findUnique: async () => ({ avatarStorageKey: null, status: 'ACTIVE', authVersion: 1 }) },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  }, async (service, root) => {
    const result = await service.replace(avatarCustomer(), avatarFile(input), 'avatar-upload-0001');
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

test('同一头像上传凭据只提交一次并可只读核验当前状态', async () => {
  const input = await sharp({
    create: { width: 16, height: 16, channels: 4, background: '#111111' },
  }).png().toBuffer();
  const differentInput = await sharp({
    create: { width: 16, height: 16, channels: 4, background: '#eeeeee' },
  }).png().toBuffer();
  let currentStorageKey: string | null = null;
  let transactionCalls = 0;
  let eventCalls = 0;
  const tx = {
    $queryRaw: async () => [{ id: 7 }],
    customer: {
      findUnique: async () => ({
        avatarStorageKey: currentStorageKey,
        status: 'ACTIVE',
        authVersion: 1,
      }),
      updateMany: async (query: { data: { avatarStorageKey: string } }) => {
        currentStorageKey = query.data.avatarStorageKey;
        return { count: 1 };
      },
    },
    customerSecurityEvent: {
      create: async () => {
        eventCalls += 1;
        return { id: 1 };
      },
    },
  };
  await withAvatarRoot({
    customer: {
      findUnique: async () => ({
        avatarStorageKey: currentStorageKey,
        status: 'ACTIVE',
        authVersion: 1,
      }),
    },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => {
      transactionCalls += 1;
      return action(tx);
    },
  }, async (service) => {
    const key = 'avatar-upload-replay-0001';
    await service.replace(avatarCustomer(), avatarFile(input), key);
    await service.replace(avatarCustomer(), avatarFile(input), key);
    await assert.rejects(
      service.replace(avatarCustomer(), avatarFile(differentInput), key),
      (error: unknown) => (
        error instanceof ApiError && error.errorCode === 'AVATAR_IDEMPOTENCY_KEY_REUSED'
      ),
    );

    assert.equal(transactionCalls, 1);
    assert.equal(eventCalls, 1);
    assert.deepEqual(await service.replaceStatus(avatarCustomer(), key), { status: 'CURRENT' });
    assert.deepEqual(
      await service.replaceStatus(avatarCustomer(), 'avatar-upload-other-0001'),
      { status: 'NOT_CURRENT' },
    );
  });
});

test('头像并发更新竞争失败时保留可恢复删除标记且不覆盖已变化的数据库引用', async () => {
  const input = await sharp({
    create: { width: 8, height: 8, channels: 4, background: '#ffffff' },
  }).png().toBuffer();
  const tx = {
    $queryRaw: async () => [{ id: 7 }],
    customer: {
      findUnique: async () => ({ avatarStorageKey: null, status: 'ACTIVE', authVersion: 1 }),
      updateMany: async () => ({ count: 0 }),
    },
    customerSecurityEvent: { create: async () => ({ id: 1 }) },
  };
  await withAvatarRoot({
    customer: { findUnique: async () => ({ avatarStorageKey: null, status: 'ACTIVE', authVersion: 1 }) },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  }, async (service, root) => {
    await assert.rejects(
      service.replace(avatarCustomer(), avatarFile(input), 'avatar-upload-0002'),
      (error: unknown) => error instanceof ApiError && error.errorCode === 'AVATAR_UPDATE_CONFLICT',
    );
    assert.equal((await readdir(join(root, '7'))).filter((name) => name.endsWith('.webp')).length, 1);
    await service.retryPendingRemovals();
    assert.deepEqual(await readdir(join(root, '7')), []);
  });
});

test('注销已先取得客户行锁时拒绝头像写入并由启动恢复清理新对象', async () => {
  const input = await sharp({
    create: { width: 8, height: 8, channels: 4, background: '#ffffff' },
  }).png().toBuffer();
  let updateCalled = false;
  const tx = {
    $queryRaw: async () => [{ id: 7 }],
    customer: {
      findUnique: async () => ({ avatarStorageKey: null, status: 'DISABLED', authVersion: 1 }),
      updateMany: async () => {
        updateCalled = true;
        return { count: 1 };
      },
    },
  };
  await withAvatarRoot({
    customer: { findUnique: async () => ({ avatarStorageKey: null, status: 'ACTIVE', authVersion: 1 }) },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  }, async (service, root) => {
    await assert.rejects(
      service.replace(avatarCustomer(), avatarFile(input), 'avatar-upload-0003'),
      (error: unknown) => error instanceof ApiError && error.errorCode === 'CUSTOMER_AUTH_CHANGED',
    );
    assert.equal(updateCalled, false);
    assert.equal((await readdir(join(root, '7'))).filter((name) => name.endsWith('.webp')).length, 1);
    await service.retryPendingRemovals();
    assert.deepEqual(await readdir(join(root, '7')), []);
  });
});

test('头像读取拒绝跨客户存储键和伪造图片声明', async () => {
  const foreignKey = '8/123e4567-e89b-42d3-a456-426614174000.webp';
  const tx = {
    $queryRaw: async () => [{ id: 7 }],
    customer: { findUnique: async () => ({ avatarStorageKey: foreignKey }) },
  };
  await withAvatarRoot({
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  }, async (service) => {
    await assert.rejects(
      service.read(avatarCustomer()),
      (error: unknown) => error instanceof ApiError && error.errorCode === 'AVATAR_NOT_FOUND',
    );
  });

  const input = await sharp({
    create: { width: 8, height: 8, channels: 4, background: '#ffffff' },
  }).png().toBuffer();
  const service = new CustomerAvatarService({} as never, new IdempotencyService());
  await assert.rejects(
    service.replace(avatarCustomer(), avatarFile(input, 'image/jpeg'), 'avatar-upload-0004'),
    (error: unknown) => error instanceof ApiError && error.errorCode === 'AVATAR_CONTENT_INVALID',
  );
});

test('头像读取在认证版本失效后不读取头像引用', async () => {
  let avatarReferenceRead = false;
  const tx = {
    $queryRaw: async () => [],
    customer: {
      findUnique: async () => {
        avatarReferenceRead = true;
        return { avatarStorageKey: null };
      },
    },
  };
  await withAvatarRoot({
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  }, async (service) => {
    await assert.rejects(service.read(avatarCustomer(2)), /重新登录/);
  });
  assert.equal(avatarReferenceRead, false);
});

test('头像读取在共享锁内复核认证版本并返回本人文件', async () => {
  const storageKey = '7/123e4567-e89b-42d3-a456-426614174000.webp';
  const expected = Buffer.from('avatar-bytes');
  let lockQuery: { sql?: string; values?: unknown[] } | undefined;
  const tx = {
    $queryRaw: async (query: { sql?: string; values?: unknown[] }) => {
      lockQuery = query;
      return [{ id: 7 }];
    },
    customer: { findUnique: async () => ({ avatarStorageKey: storageKey }) },
  };
  await withAvatarRoot({
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  }, async (service, root) => {
    await mkdir(join(root, '7'), { recursive: true });
    await writeFile(join(root, ...storageKey.split('/')), expected);
    assert.deepEqual(await service.read(avatarCustomer()), expected);
  });
  assert.match(lockQuery?.sql ?? '', /FOR SHARE/);
  assert.deepEqual(lockQuery?.values, [7, 1]);
});

test('替换头像不会删除数据库中误指向的其他客户私有文件', async () => {
  const foreignKey = '8/123e4567-e89b-42d3-a456-426614174000.webp';
  const input = await sharp({
    create: { width: 8, height: 8, channels: 4, background: '#ffffff' },
  }).png().toBuffer();
  const tx = {
    $queryRaw: async () => [{ id: 7 }],
    customer: {
      findUnique: async () => ({ avatarStorageKey: foreignKey, status: 'ACTIVE', authVersion: 1 }),
      updateMany: async () => ({ count: 1 }),
    },
    customerSecurityEvent: { create: async () => ({ id: 1 }) },
  };
  await withAvatarRoot({
    customer: { findUnique: async () => ({ avatarStorageKey: foreignKey, status: 'ACTIVE', authVersion: 1 }) },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  }, async (service, root) => {
    const foreignPath = join(root, ...foreignKey.split('/'));
    await mkdir(join(root, '8'), { recursive: true });
    await writeFile(foreignPath, Buffer.from('foreign-avatar'));

    await service.replace(avatarCustomer(), avatarFile(input), 'avatar-upload-0005');

    assert.equal((await readFile(foreignPath)).toString(), 'foreign-avatar');
  });
});

test('删除头像只清空当前客户引用、记录脱敏审计并删除本人文件', async () => {
  const storageKey = '7/123e4567-e89b-42d3-a456-426614174000.webp';
  let currentStorageKey: string | null = storageKey;
  const writes: Array<{ area: string; query: any }> = [];
  const tx = {
    $queryRaw: async () => [{ id: 7 }],
    customer: {
      findUnique: async () => ({ avatarStorageKey: currentStorageKey, status: 'ACTIVE', authVersion: 1 }),
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
    customer: { findUnique: async () => ({ avatarStorageKey: currentStorageKey, status: 'ACTIVE', authVersion: 1 }) },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  }, async (service, root) => {
    const target = join(root, ...storageKey.split('/'));
    await mkdir(join(root, '7'), { recursive: true });
    await writeFile(target, Buffer.from('avatar'));

    const result = await service.delete(avatarCustomer(), {
      ip: '127.0.0.1',
      userAgent: 'avatar-delete-test',
    });

    assert.equal(result.avatarUrl, null);
    assert.deepEqual(writes.map((write) => write.area), ['customer', 'event']);
    assert.deepEqual(writes[0].query.where, {
      id: 7,
      status: 'ACTIVE',
      authVersion: 1,
      avatarStorageKey: storageKey,
    });
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
    $queryRaw: async () => [{ id: 7 }],
    customer: {
      findUnique: async () => ({ avatarStorageKey: foreignKey, status: 'ACTIVE', authVersion: 1 }),
      updateMany: async () => ({ count: 1 }),
    },
    customerSecurityEvent: { create: async () => ({ id: 1 }) },
  };
  await withAvatarRoot({
    customer: { findUnique: async () => ({ avatarStorageKey: foreignKey, status: 'ACTIVE', authVersion: 1 }) },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  }, async (service, root) => {
    const foreignPath = join(root, ...foreignKey.split('/'));
    await mkdir(join(root, '8'), { recursive: true });
    await writeFile(foreignPath, Buffer.from('foreign-avatar'));

    const result = await service.delete(avatarCustomer(), {});

    assert.equal(result.avatarUrl, null);
    assert.equal((await readFile(foreignPath)).toString(), 'foreign-avatar');
  });
});

test('删除头像审计事务失败时恢复删除任务并保留原文件', async () => {
  const storageKey = '7/123e4567-e89b-42d3-a456-426614174000.webp';
  await withAvatarRoot({
    customer: { findUnique: async () => ({ avatarStorageKey: storageKey, status: 'ACTIVE', authVersion: 1 }) },
    $transaction: async () => { throw new Error('forced audit failure'); },
  }, async (service, root) => {
    const target = join(root, ...storageKey.split('/'));
    await mkdir(join(root, '7'), { recursive: true });
    await writeFile(target, Buffer.from('avatar'));

    await assert.rejects(service.delete(avatarCustomer(), {}), /forced audit failure/);

    assert.equal((await readFile(target)).toString(), 'avatar');
    assert.deepEqual(await readdir(join(root, '.pending-delete')), []);
  });
});

test('旧 authVersion 删除头像在客户行锁后失败关闭且恢复删除任务', async () => {
  const storageKey = '7/123e4567-e89b-42d3-a456-426614174000.webp';
  let updateCalled = false;
  let eventCalled = false;
  const tx = {
    $queryRaw: async () => [{ id: 7 }],
    customer: {
      findUnique: async () => ({
        avatarStorageKey: storageKey,
        status: 'ACTIVE',
        authVersion: 4,
      }),
      updateMany: async () => {
        updateCalled = true;
        return { count: 1 };
      },
    },
    customerSecurityEvent: {
      create: async () => {
        eventCalled = true;
        return { id: 1 };
      },
    },
  };
  await withAvatarRoot({
    customer: {
      findUnique: async () => ({
        avatarStorageKey: storageKey,
        status: 'ACTIVE',
        authVersion: 3,
      }),
    },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  }, async (service, root) => {
    const target = join(root, ...storageKey.split('/'));
    await mkdir(join(root, '7'), { recursive: true });
    await writeFile(target, Buffer.from('avatar'));

    await assert.rejects(
      service.delete(avatarCustomer(3), {}),
      (error: unknown) => error instanceof ApiError && error.getStatus() === 401,
    );

    assert.equal(updateCalled, false);
    assert.equal(eventCalled, false);
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
