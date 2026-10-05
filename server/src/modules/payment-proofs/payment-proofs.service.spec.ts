import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { IdempotencyService } from '../../common/idempotency/idempotency-key';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { OrdersService } from '../orders/orders.service';
import {
  MAX_PAYMENT_PROOF_LEGACY_DELETE_BATCH,
  MAX_PAYMENT_PROOF_LEGACY_SCAN_BATCH,
  MAX_UNATTACHED_PAYMENT_PROOFS_PER_CUSTOMER,
} from './payment-proof-policy';
import { PaymentProofsService } from './payment-proofs.service';

const CUSTOMER = { id: 7, authVersion: 1 };

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

type Asset = Record<string, any> & {
  id: number;
  storageKey: string;
  customerId: number;
  orderId: number | null;
  paymentId: number | null;
  status: 'UPLOADED' | 'ATTACHED' | 'DELETING';
  createdAt: Date;
};

function paymentProofFile(buffer = PNG): Express.Multer.File {
  return {
    fieldname: 'file', originalname: 'proof.png', encoding: '7bit', mimetype: 'image/png',
    size: buffer.length, buffer, destination: '', filename: '', path: '', stream: undefined as never,
  };
}

async function fixture(
  submit: (assetId: number, storageKey: string, assets: Map<number, Asset>) => Promise<unknown>,
  options: { activePrincipal?: boolean } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'haichuan-payment-proofs-'));
  const assets = new Map<number, Asset>();
  let nextId = 1;
  let scanOffset = 0;
  const matches = (asset: Asset, where: Record<string, any>) =>
    (where.id === undefined || asset.id === where.id)
    && (where.customerId === undefined || asset.customerId === where.customerId)
    && (where.storageKey === undefined || asset.storageKey === where.storageKey)
    && (where.submissionKeyHash === undefined || asset.submissionKeyHash === where.submissionKeyHash)
    && (where.status === undefined || asset.status === where.status)
    && (where.orderId === undefined || asset.orderId === where.orderId)
    && (where.createdAt?.lte === undefined || asset.createdAt <= where.createdAt.lte);
  const findUnique = async ({ where }: any) => {
    if (where.id !== undefined) return assets.get(where.id) ?? null;
    return [...assets.values()].find((asset) =>
      (where.storageKey === undefined || asset.storageKey === where.storageKey)
      && (where.submissionKeyHash === undefined || asset.submissionKeyHash === where.submissionKeyHash),
    ) ?? null;
  };
  const paymentProofAsset = {
    create: async ({ data }: any) => {
      const now = new Date();
      const asset = {
        id: nextId++,
        orderId: null,
        paymentId: null,
        attachedAt: null,
        deletingAt: null,
        submissionOrderId: null,
        submissionKeyHash: null,
        fileChecksumSha256: null,
        fileSize: null,
        mimeType: null,
        fileReadyAt: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      } as Asset;
      assets.set(asset.id, asset);
      return asset;
    },
    createMany: async ({ data }: any) => {
      let count = 0;
      for (const candidate of data) {
        if ([...assets.values()].some((asset) => asset.storageKey === candidate.storageKey)) continue;
        await paymentProofAsset.create({ data: candidate });
        count += 1;
      }
      return { count };
    },
    findUnique,
    count: async ({ where }: any) => [...assets.values()].filter((asset) => matches(asset, where)).length,
    findMany: async ({ where, take }: any) => [...assets.values()]
      .filter((asset) => matches(asset, where))
      .sort((left, right) => left.id - right.id)
      .slice(0, take),
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const asset of assets.values()) {
        if (!matches(asset, where)) continue;
        assets.set(asset.id, { ...asset, ...data, updatedAt: new Date() });
        count += 1;
      }
      return { count };
    },
    deleteMany: async ({ where }: any) => {
      let count = 0;
      for (const asset of [...assets.values()]) {
        if (!matches(asset, where)) continue;
        assets.delete(asset.id);
        count += 1;
      }
      return { count };
    },
  };
  const prisma = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback(prisma),
    $queryRaw: async () => options.activePrincipal === false ? [] : [{ id: 7 }],
    paymentProofAsset,
    paymentProofGcState: {
      upsert: async () => ({ scanOffset }),
      update: async ({ data }: any) => {
        scanOffset = data.scanOffset;
        return { id: 1, scanOffset };
      },
    },
    customer: {
      findUnique: async ({ where }: any) => where.id === 7 ? { id: 7 } : null,
    },
  } as unknown as PrismaService;
  const orders = {
    submitOfflinePaymentProof: async (
      _customer: { id: number; authVersion: number },
      _orderId: number,
      assetId: number,
      storageKey: string,
    ) => submit(assetId, storageKey, assets),
  } as unknown as OrdersService;
  const service = new PaymentProofsService(prisma, orders, new IdempotencyService());
  Object.defineProperty(service, 'paymentProofRoot', { value: root });
  return {
    root,
    service,
    assets,
    paymentProofAsset,
    getScanOffset: () => scanOffset,
  };
}

test('组合上传失败只删除仍为 UPLOADED 的资产，已提交资产与文件均保留', async () => {
  let failedKey = '';
  const failed = await fixture(async (_assetId, storageKey) => {
    failedKey = storageKey;
    throw new Error('订单状态已变化');
  });
  try {
    await assert.rejects(
      failed.service.uploadAndSubmit(CUSTOMER, 9, paymentProofFile(), 'payment-proof-failed-0001'),
      /订单状态已变化/,
    );
    assert.equal(failed.assets.size, 0);
    assert.equal(existsSync(join(failed.root, failedKey)), false);
  } finally {
    await rm(failed.root, { recursive: true, force: true });
  }

  let committedKey = '';
  const committed = await fixture(async (assetId, storageKey, assets) => {
    committedKey = storageKey;
    const asset = assets.get(assetId)!;
    assets.set(asset.id, {
      ...asset,
      status: 'ATTACHED',
      orderId: 9,
      paymentId: 31,
      attachedAt: new Date(),
    });
    throw new Error('响应在提交后中断');
  });
  try {
    await assert.rejects(
      committed.service.uploadAndSubmit(CUSTOMER, 9, paymentProofFile(), 'payment-proof-commit-0001'),
      /响应在提交后中断/,
    );
    assert.equal([...committed.assets.values()][0]?.status, 'ATTACHED');
    assert.equal(existsSync(join(committed.root, committedKey)), true);
  } finally {
    await rm(committed.root, { recursive: true, force: true });
  }
});

test('订单事务在资产认领后回滚时，新资产恢复为 UPLOADED 并进入可清理路径', async () => {
  let storageKey = '';
  const target = await fixture(async (assetId, key, assets) => {
    storageKey = key;
    const original = assets.get(assetId)!;
    assets.set(assetId, {
      ...original,
      status: 'ATTACHED',
      orderId: 9,
      paymentId: 31,
      attachedAt: new Date(),
    });
    // 模拟 Serializable 事务抛错后的数据库回滚结果。
    assets.set(assetId, original);
    throw new Error('付款记录并发变化导致事务回滚');
  });
  try {
    await assert.rejects(
      target.service.uploadAndSubmit(CUSTOMER, 9, paymentProofFile(), 'payment-proof-rollback-0001'),
      /事务回滚/,
    );
    assert.equal(target.assets.size, 0);
    assert.equal(existsSync(join(target.root, storageKey)), false);
  } finally {
    await rm(target.root, { recursive: true, force: true });
  }
});

test('同一幂等键与同一文件重放只复用一个资产且不消耗未绑定配额', async () => {
  let calls = 0;
  const target = await fixture(async (assetId, _storageKey, assets) => {
    calls += 1;
    const asset = assets.get(assetId)!;
    assets.set(asset.id, {
      ...asset,
      status: 'ATTACHED',
      orderId: 9,
      paymentId: 31,
      attachedAt: new Date(),
    });
    return { paymentNo: 'PAY-31', status: 'PENDING', hasProof: true };
  });
  try {
    const key = 'payment-proof-replay-0001';
    const first = await target.service.uploadAndSubmit(CUSTOMER, 9, paymentProofFile(), key);
    const second = await target.service.uploadAndSubmit(CUSTOMER, 9, paymentProofFile(), key);
    assert.deepEqual(second, first);
    assert.equal(target.assets.size, 1);
    assert.equal(calls, 2);
  } finally {
    await rm(target.root, { recursive: true, force: true });
  }
});

test('每客户最多保留三个未关联上传，第四个新幂等请求返回清楚的 429', async () => {
  const target = await fixture(async () => ({ status: 'PENDING' }));
  try {
    for (let index = 0; index < MAX_UNATTACHED_PAYMENT_PROOFS_PER_CUSTOMER; index += 1) {
      await target.paymentProofAsset.create({
        data: {
          customerId: 7,
          storageKey: `7/2026/09/20/00000000-0000-4000-8000-${String(index).padStart(12, '0')}.png`,
          status: 'UPLOADED',
        },
      });
    }
    await assert.rejects(
      target.service.uploadAndSubmit(CUSTOMER, 9, paymentProofFile(), 'payment-proof-quota-0001'),
      (error: any) => error?.getStatus?.() === 429 && /3 个/.test(error.message),
    );
    assert.equal(target.assets.size, MAX_UNATTACHED_PAYMENT_PROOFS_PER_CUSTOMER);
  } finally {
    await rm(target.root, { recursive: true, force: true });
  }
});

test('组合接口在进入事务和写盘前拒绝截断图片', async () => {
  const target = await fixture(async () => ({ status: 'PENDING' }));
  try {
    const truncated = PNG.subarray(0, PNG.length - 20);
    await assert.rejects(
      target.service.uploadAndSubmit(
        CUSTOMER,
        9,
        paymentProofFile(truncated),
        'payment-proof-truncated-0001',
      ),
      /图片|image|png|corrupt|invalid|unexpected/i,
    );
    assert.equal(target.assets.size, 0);
  } finally {
    await rm(target.root, { recursive: true, force: true });
  }
});

test('注销先提交后旧 principal 上传凭证不写资产也不进入订单提交', async () => {
  let submitCalls = 0;
  const target = await fixture(async () => {
    submitCalls += 1;
    return {};
  }, { activePrincipal: false });

  try {
    await assert.rejects(
      () => target.service.uploadAndSubmit(
        CUSTOMER,
        9,
        paymentProofFile(),
        'payment-proof-closed-0001',
      ),
      UnauthorizedException,
    );
    assert.equal(target.assets.size, 0);
    assert.equal(submitCalls, 0);
  } finally {
    await rm(target.root, { recursive: true, force: true });
  }
});

test('GC 只删除超期 UPLOADED；ATTACHED 与近期资产保留', async () => {
  const target = await fixture(async () => ({ status: 'PENDING' }));
  try {
    const now = new Date('2026-09-20T12:00:00.000Z');
    const old = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const rows = [
      { storageKey: '7/2026/09/01/00000000-0000-4000-8000-000000000001.png', status: 'ATTACHED', orderId: 9, attachedAt: old, createdAt: old },
      { storageKey: '7/2026/09/01/00000000-0000-4000-8000-000000000002.png', status: 'UPLOADED', orderId: null, attachedAt: null, createdAt: old },
      { storageKey: '7/2026/09/20/00000000-0000-4000-8000-000000000003.png', status: 'UPLOADED', orderId: null, attachedAt: null, createdAt: now },
    ] as const;
    for (const row of rows) {
      const asset = await target.paymentProofAsset.create({
        data: { customerId: 7, deletingAt: null, ...row },
      });
      const absolutePath = join(target.root, asset.storageKey);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, PNG);
    }

    assert.equal(await target.service.purgeOrphans(now), 1);
    const remaining = [...target.assets.values()];
    assert.deepEqual(remaining.map((asset) => asset.status).sort(), ['ATTACHED', 'UPLOADED']);
    assert.equal(existsSync(join(target.root, rows[0].storageKey)), true);
    assert.equal(existsSync(join(target.root, rows[1].storageKey)), false);
    assert.equal(existsSync(join(target.root, rows[2].storageKey)), true);
  } finally {
    await rm(target.root, { recursive: true, force: true });
  }
});

test('legacy 扫描每轮有界并用持久 offset 越过已处理的前一批', async () => {
  const target = await fixture(async () => ({ status: 'PENDING' }));
  const files = Array.from({ length: MAX_PAYMENT_PROOF_LEGACY_SCAN_BATCH + 50 }, (_, index) => ({
    customerId: 7,
    storageKey: `7/2026/08/01/00000000-0000-4000-8000-${String(index).padStart(12, '0')}.png`,
  }));
  Object.defineProperty(target.service, 'walkPaymentProofFiles', {
    value: async function* () {
      yield* files;
    },
  });
  try {
    const now = new Date('2026-09-20T12:00:00.000Z');
    assert.equal(await target.service.purgeOrphans(now), MAX_PAYMENT_PROOF_LEGACY_DELETE_BATCH);
    assert.equal(target.getScanOffset(), MAX_PAYMENT_PROOF_LEGACY_SCAN_BATCH);
    assert.equal(await target.service.purgeOrphans(now), 50);
    assert.equal(target.getScanOffset(), 0);
  } finally {
    await rm(target.root, { recursive: true, force: true });
  }
});
