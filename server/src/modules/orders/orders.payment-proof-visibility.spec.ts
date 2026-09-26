import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from './orders.service';
import { TradeEventsService } from '../trade-events/trade-events.service';

const CUSTOMER = { id: 7, authVersion: 1 };

const ORDER = {
  id: 9,
  orderNo: 'ORD-TEST-9',
  customerId: 7,
  status: 'PENDING_PAYMENT',
  paidAmount: 0,
  finalAmount: 100,
};

const TEN_MIB = 10 * 1024 * 1024;

// 模拟 Prisma create 返回的完整 Payment 行：
// 私有凭证路径、审核字段与渠道原始数据都必须在响应前被剔除。
const PAYMENT_FULL = {
  id: 31,
  orderId: 9,
  paymentNo: 'PAY-TEST-31',
  amount: '100.00',
  method: 'bank_transfer',
  type: 'FULL',
  status: 'PENDING',
  proofUrl: '7/2026/09/03/01234567-89ab-cdef-0123-456789abcdef.png',
  gatewayTradeNo: 'gateway-trade-no-should-not-leak',
  gatewayNotify: { raw: 'gateway-notify-should-not-leak' },
  reviewedBy: 42,
  reviewNote: 'review-note-should-not-leak',
};

function buildTx(existingAsset: {
  id: number;
  storageKey: string;
  customerId: number;
  orderId: number | null;
  paymentId: number | null;
  submissionOrderId: number | null;
  fileSize: number | null;
  status: 'UPLOADED' | 'ATTACHED' | 'DELETING';
} = {
  id: 51,
  storageKey: PAYMENT_FULL.proofUrl,
  customerId: 7,
  orderId: null,
  paymentId: null,
  submissionOrderId: 9,
  fileSize: TEN_MIB,
  status: 'UPLOADED',
}) {
  let asset = existingAsset;
  let paymentCreates = 0;
  return {
    $queryRaw: async (_query?: any) => [{ id: 9 }],
    order: {
      // 同一 mock 同时服务归属校验（select id）与 expireReservationIfNeeded（include payments）。
      findFirst: async () => ({
        ...ORDER,
        reservedAt: null,
        payments: [],
      }),
      findUnique: async () => ORDER,
      count: async (_args?: any) => 0,
      update: async () => ({}),
    },
    payment: {
      findFirst: async (_args?: any): Promise<any> => null,
      findUnique: async ({ where }: any) => where.id === PAYMENT_FULL.id ? PAYMENT_FULL : null,
      update: async ({ data }: any) => ({ ...PAYMENT_FULL, ...data }),
      create: async () => {
        paymentCreates += 1;
        return PAYMENT_FULL;
      },
    },
    paymentProofAsset: {
      count: async (_args?: any) => 0,
      aggregate: async (_args?: any) => ({ _sum: { fileSize: 0 } }),
      findUniqueOrThrow: async () => asset,
      updateMany: async ({ data }: any) => {
        if (data.status === 'ATTACHED') {
          if (asset.status !== 'UPLOADED' || asset.orderId !== null) return { count: 0 };
          asset = { ...asset, status: 'ATTACHED', orderId: 9 };
          return { count: 1 };
        }
        if (data.paymentId !== undefined) {
          if (asset.status !== 'ATTACHED' || asset.paymentId !== null) return { count: 0 };
          asset = { ...asset, paymentId: data.paymentId };
          return { count: 1 };
        }
        return { count: 1 };
      },
      findUnique: async () => asset,
    },
    inventoryReservation: { findMany: async () => [] },
    getPaymentCreates: () => paymentCreates,
  };
}

test('客户提交付款凭证的响应不包含私有路径、审核字段或渠道原始数据', async () => {
  const prisma = {
    $transaction: async (callback: (tx: ReturnType<typeof buildTx>) => Promise<unknown>) =>
      callback(buildTx()),
  };
  const tradeEvents = { record: async () => {} };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    tradeEvents as unknown as TradeEventsService,
    {} as never,
    {} as never,
  );
  Object.defineProperty(service, 'storedPaymentProofExists', { value: async () => true });

  const result = (await service.submitOfflinePaymentProof(
    CUSTOMER,
    9,
    51,
    '7/2026/09/03/01234567-89ab-cdef-0123-456789abcdef.png',
  )) as Record<string, unknown>;

  assert.equal(result.paymentNo, 'PAY-TEST-31');
  assert.equal(result.status, 'PENDING');
  assert.equal(result.hasProof, true);
  assert.equal('proofUrl' in result, false);
  assert.equal('gatewayTradeNo' in result, false);
  assert.equal('gatewayNotify' in result, false);
  assert.equal('reviewedBy' in result, false);
  assert.equal('reviewNote' in result, false);
});

test('客户不能把同一付款凭证引用到另一个订单', async () => {
  const tx = buildTx({
    id: 51,
    storageKey: PAYMENT_FULL.proofUrl,
    customerId: 7,
    orderId: 8,
    paymentId: 31,
    submissionOrderId: 9,
    fileSize: TEN_MIB,
    status: 'ATTACHED',
  });
  const service = new OrdersService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    { record: async () => {} } as unknown as TradeEventsService,
    {} as never,
    {} as never,
  );
  Object.defineProperty(service, 'storedPaymentProofExists', { value: async () => true });

  await assert.rejects(
    service.submitOfflinePaymentProof(
      CUSTOMER,
      9,
      51,
      '7/2026/09/03/01234567-89ab-cdef-0123-456789abcdef.png',
    ),
    /已用于其他订单或正在清理/,
  );
});

test('同一凭证响应丢失后重放返回原付款，不创建第二笔付款', async () => {
  const tx = buildTx();
  const service = new OrdersService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    { record: async () => {} } as unknown as TradeEventsService,
    {} as never,
    {} as never,
  );
  Object.defineProperty(service, 'storedPaymentProofExists', { value: async () => true });

  const key = PAYMENT_FULL.proofUrl;
  const first = await service.submitOfflinePaymentProof(CUSTOMER, 9, 51, key);
  const replay = await service.submitOfflinePaymentProof(CUSTOMER, 9, 51, key);
  assert.equal(first.paymentNo, PAYMENT_FULL.paymentNo);
  assert.equal(replay.paymentNo, PAYMENT_FULL.paymentNo);
  assert.equal(tx.getPaymentCreates(), 1);
});

test('已核销首期的同一凭证重放不会读取或推进下一期', async () => {
  let planReads = 0;
  const paidPayment = { ...PAYMENT_FULL, id: 81, type: 'DEPOSIT', status: 'PAID' };
  const tx = buildTx({
    id: 51,
    storageKey: PAYMENT_FULL.proofUrl,
    customerId: 7,
    orderId: 9,
    paymentId: 81,
    submissionOrderId: 9,
    fileSize: TEN_MIB,
    status: 'ATTACHED',
  });
  tx.order.findUnique = async () => ({ ...ORDER, paymentPlans: [{ id: 60 }] });
  tx.payment.findUnique = async () => paidPayment;
  Object.assign(tx, {
    paymentPlan: {
      findUnique: async () => {
        planReads += 1;
        throw new Error('重放不应读取下一期');
      },
    },
  });
  const service = new OrdersService(
    { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaService,
    { record: async () => {} } as unknown as TradeEventsService,
    {} as never,
    {} as never,
  );
  Object.defineProperty(service, 'storedPaymentProofExists', { value: async () => true });

  const result = await service.submitOfflinePaymentProof(CUSTOMER, 9, 51, PAYMENT_FULL.proofUrl);
  assert.equal(result.paymentNo, PAYMENT_FULL.paymentNo);
  assert.equal(result.status, 'PAID');
  assert.equal(planReads, 0);
});

test('订单已保留十二张历史凭证时拒绝继续认领新凭证', async () => {
  const tx = buildTx();
  tx.paymentProofAsset.count = async ({ where }: any) => where.orderId === 9 ? 12 : 0;
  const service = new OrdersService(
    {} as PrismaService,
    {} as TradeEventsService,
    {} as never,
    {} as never,
  );
  const claim = (service as unknown as {
    claimPaymentProofAsset: (
      transaction: unknown,
      customerId: number,
      orderId: number,
      assetId: number,
      storageKey: string,
    ) => Promise<unknown>;
  }).claimPaymentProofAsset.bind(service);

  await assert.rejects(
    claim(tx, 7, 9, 51, PAYMENT_FULL.proofUrl),
    /12 张付款凭证/,
  );
});

test('客户跨订单累计二十四张 ATTACHED 凭证后拒绝继续认领', async () => {
  const tx = buildTx();
  tx.paymentProofAsset.count = async ({ where }: any) =>
    where.customerId === 7 && where.status === 'ATTACHED' ? 24 : 0;
  const service = new OrdersService(
    { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaService,
    { record: async () => {} } as unknown as TradeEventsService,
    {} as never,
    {} as never,
  );
  Object.defineProperty(service, 'storedPaymentProofExists', { value: async () => true });

  await assert.rejects(
    service.submitOfflinePaymentProof(CUSTOMER, 9, 51, PAYMENT_FULL.proofUrl),
    /24 张付款凭证/,
  );
  assert.equal(tx.getPaymentCreates(), 0);
});

test('客户 ATTACHED 凭证累计字节达到 240 MiB 后拒绝继续认领', async () => {
  const tx = buildTx();
  tx.paymentProofAsset.count = async ({ where }: any) =>
    where.customerId === 7 && where.status === 'ATTACHED' ? 23 : 0;
  tx.paymentProofAsset.aggregate = async () => ({
    _sum: { fileSize: 240 * 1024 * 1024 - TEN_MIB + 1 },
  });
  const service = new OrdersService(
    { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaService,
    { record: async () => {} } as unknown as TradeEventsService,
    {} as never,
    {} as never,
  );
  Object.defineProperty(service, 'storedPaymentProofExists', { value: async () => true });

  await assert.rejects(
    service.submitOfflinePaymentProof(CUSTOMER, 9, 51, PAYMENT_FULL.proofUrl),
    /240 MiB/,
  );
  assert.equal(tx.getPaymentCreates(), 0);
});

test('客户已有三笔活跃待审凭证订单时拒绝占用第四笔订单库存', async () => {
  const tx = buildTx();
  tx.order.count = async ({ where }: any) => {
    assert.deepEqual(where.id, { not: 9 });
    assert.equal(where.customerId, 7);
    assert.equal(where.status, 'PENDING_PAYMENT');
    assert.equal(where.payments.some.method, 'bank_transfer');
    assert.equal(where.payments.some.status, 'PENDING');
    assert.deepEqual(where.payments.some.proofUrl, { not: null });
    assert.equal(where.paymentProofAssets.some.status, 'ATTACHED');
    return 3;
  };
  const service = new OrdersService(
    { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaService,
    { record: async () => {} } as unknown as TradeEventsService,
    {} as never,
    {} as never,
  );
  Object.defineProperty(service, 'storedPaymentProofExists', { value: async () => true });

  await assert.rejects(
    service.submitOfflinePaymentProof(CUSTOMER, 9, 51, PAYMENT_FULL.proofUrl),
    /3 笔活跃待审凭证订单/,
  );
  assert.equal(tx.getPaymentCreates(), 0);
});

test('同一订单存在多张 ATTACHED 资产时不会挤占活跃待审订单计数窗口', async () => {
  const tx = buildTx();
  let activeOrderQueries = 0;
  tx.order.count = async () => {
    activeOrderQueries += 1;
    // 数据库直接按订单计数；同一订单的任意多张资产只贡献一笔订单。
    return 2;
  };
  const service = new OrdersService(
    { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaService,
    { record: async () => {} } as unknown as TradeEventsService,
    {} as never,
    {} as never,
  );
  Object.defineProperty(service, 'storedPaymentProofExists', { value: async () => true });

  const result = await service.submitOfflinePaymentProof(CUSTOMER, 9, 51, PAYMENT_FULL.proofUrl);

  assert.equal(result.status, 'PENDING');
  assert.equal(activeOrderQueries, 1);
  assert.equal(tx.getPaymentCreates(), 1);
});

test('同一 Payment 已有 PENDING 凭证时拒绝用新资产覆盖', async () => {
  const tx = buildTx();
  tx.payment.findFirst = async ({ where }: any) =>
    where.status === 'PENDING' && where.proofUrl?.not === null
      ? { id: 31, paymentNo: PAYMENT_FULL.paymentNo, proofUrl: PAYMENT_FULL.proofUrl }
      : null;
  const service = new OrdersService(
    { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaService,
    { record: async () => {} } as unknown as TradeEventsService,
    {} as never,
    {} as never,
  );
  Object.defineProperty(service, 'storedPaymentProofExists', { value: async () => true });

  await assert.rejects(
    service.submitOfflinePaymentProof(CUSTOMER, 9, 51, PAYMENT_FULL.proofUrl),
    /已有待审核付款凭证/,
  );
  assert.equal(tx.getPaymentCreates(), 0);
});

test('FAILED Payment 可重新提交且旧 ATTACHED 资产继续计入客户总额', async () => {
  const tx = buildTx();
  let customerCountQueries = 0;
  tx.paymentProofAsset.count = async ({ where }: any) => {
    if (where.customerId === 7 && where.status === 'ATTACHED') {
      customerCountQueries += 1;
      return 23;
    }
    return 0;
  };
  tx.paymentProofAsset.aggregate = async () => ({ _sum: { fileSize: 23 * TEN_MIB } });
  tx.payment.findFirst = async ({ where }: any) => {
    if (where.status?.in?.includes('FAILED')) return { ...PAYMENT_FULL, status: 'FAILED' };
    return null;
  };
  const service = new OrdersService(
    { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaService,
    { record: async () => {} } as unknown as TradeEventsService,
    {} as never,
    {} as never,
  );
  Object.defineProperty(service, 'storedPaymentProofExists', { value: async () => true });

  const result = await service.submitOfflinePaymentProof(CUSTOMER, 9, 51, PAYMENT_FULL.proofUrl);
  assert.equal(result.status, 'PENDING');
  assert.equal(customerCountQueries, 1);
});

test('凭证提交事务固定先锁客户再锁订单，并在锁后查询配额和执行资产 CAS', async () => {
  const tx = buildTx();
  const events: string[] = [];
  tx.$queryRaw = async (query: any) => {
    const sql = query?.strings?.join(' ') ?? '';
    events.push(sql.includes('customers') ? 'customer-lock' : 'order-lock');
    return [{ id: sql.includes('customers') ? 7 : 9 }];
  };
  tx.paymentProofAsset.count = async ({ where }: any) => {
    events.push(where.customerId === 7 ? 'customer-quota' : 'order-quota');
    return 0;
  };
  tx.paymentProofAsset.aggregate = async () => {
    events.push('customer-bytes');
    return { _sum: { fileSize: 0 } };
  };
  tx.order.count = async () => {
    events.push('active-order-quota');
    return 0;
  };
  const originalUpdateMany = tx.paymentProofAsset.updateMany;
  tx.paymentProofAsset.updateMany = async (args: any) => {
    if (args.data.status === 'ATTACHED') events.push('asset-cas');
    return originalUpdateMany(args);
  };
  const service = new OrdersService(
    { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaService,
    { record: async () => {} } as unknown as TradeEventsService,
    {} as never,
    {} as never,
  );
  Object.defineProperty(service, 'storedPaymentProofExists', { value: async () => true });

  await service.submitOfflinePaymentProof(CUSTOMER, 9, 51, PAYMENT_FULL.proofUrl);
  assert.deepEqual(events.slice(0, 7), [
    'customer-lock',
    'order-lock',
    'customer-quota',
    'customer-bytes',
    'active-order-quota',
    'order-quota',
    'asset-cas',
  ]);
});

test('同一客户的并发凭证入口共享客户行锁串行区', async () => {
  let tail = Promise.resolve();
  let activeCustomerLocks = 0;
  let maxActiveCustomerLocks = 0;
  let customerLockEntries = 0;
  const prisma = {
    $transaction: async (callback: (tx: ReturnType<typeof buildTx>) => Promise<unknown>) => {
      const previous = tail;
      let releaseTurn!: () => void;
      tail = new Promise<void>((resolve) => {
        releaseTurn = resolve;
      });
      const tx = buildTx();
      tx.$queryRaw = async (query: any) => {
        const sql = query?.strings?.join(' ') ?? '';
        if (sql.includes('customers')) {
          await previous;
          customerLockEntries += 1;
          activeCustomerLocks += 1;
          maxActiveCustomerLocks = Math.max(maxActiveCustomerLocks, activeCustomerLocks);
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
        return [{ id: sql.includes('customers') ? 7 : 9 }];
      };
      try {
        return await callback(tx);
      } finally {
        activeCustomerLocks -= 1;
        releaseTurn();
      }
    },
  };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    { record: async () => {} } as unknown as TradeEventsService,
    {} as never,
    {} as never,
  );
  Object.defineProperty(service, 'storedPaymentProofExists', { value: async () => true });

  await Promise.all([
    service.submitOfflinePaymentProof(CUSTOMER, 9, 51, PAYMENT_FULL.proofUrl),
    service.submitOfflinePaymentProof(CUSTOMER, 9, 51, PAYMENT_FULL.proofUrl),
  ]);
  assert.equal(customerLockEntries, 2);
  assert.equal(maxActiveCustomerLocks, 1);
});

test('客户不能提交只有合法外形但磁盘中不存在的付款凭证键', async () => {
  let transactions = 0;
  const service = new OrdersService(
    {
      $transaction: async () => {
        transactions += 1;
        throw new Error('不应进入事务');
      },
    } as unknown as PrismaService,
    {} as TradeEventsService,
    {} as never,
    {} as never,
  );
  Object.defineProperty(service, 'storedPaymentProofExists', { value: async () => false });

  await assert.rejects(
    service.submitOfflinePaymentProof(
      CUSTOMER,
      9,
      51,
      '7/2026/09/03/01234567-89ab-cdef-0123-456789abcdef.png',
    ),
    /不存在或已失效/,
  );
  assert.equal(transactions, 0);
});

test('注销先提交后旧 principal 不能提交付款凭证且订单付款零写回', async () => {
  let orderReads = 0;
  const prisma = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
      $queryRaw: async () => [],
      order: {
        findFirst: async () => {
          orderReads += 1;
          return null;
        },
      },
    }),
  };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    { record: async () => undefined } as unknown as TradeEventsService,
    {} as never,
    {} as never,
  );
  Object.defineProperty(service, 'storedPaymentProofExists', { value: async () => true });

  await assert.rejects(
    () => service.submitOfflinePaymentProof(
      CUSTOMER,
      9,
      51,
      PAYMENT_FULL.proofUrl,
    ),
    UnauthorizedException,
  );
  assert.equal(orderReads, 0);
});

test('同一订单可分别认领多张凭证，但同一 storageKey 不能跨订单复用', async () => {
  type Asset = {
    id: number;
    storageKey: string;
    customerId: number;
    orderId: number | null;
    paymentId: number | null;
    submissionOrderId: number;
    fileSize: number;
    status: string;
  };
  const assets = new Map<string, Asset>();
  const firstKey = '7/2026/09/03/00000000-0000-4000-8000-000000000001.png';
  const secondKey = '7/2026/09/03/00000000-0000-4000-8000-000000000002.png';
  assets.set(firstKey, { id: 1, storageKey: firstKey, customerId: 7, orderId: null, paymentId: null, submissionOrderId: 9, fileSize: TEN_MIB, status: 'UPLOADED' });
  assets.set(secondKey, { id: 2, storageKey: secondKey, customerId: 7, orderId: null, paymentId: null, submissionOrderId: 9, fileSize: TEN_MIB, status: 'UPLOADED' });
  const tx = {
    order: { count: async () => 0 },
    paymentProofAsset: {
      count: async () => 0,
      aggregate: async () => ({ _sum: { fileSize: 0 } }),
      findUniqueOrThrow: async ({ where }: any) => [...assets.values()].find((asset) => asset.id === where.id),
      updateMany: async ({ where, data }: any) => {
        const current = [...assets.values()].find((asset) => asset.id === where.id);
        if (!current || current.status !== 'UPLOADED' || current.orderId !== null) return { count: 0 };
        assets.set(current.storageKey, { ...current, ...data });
        return { count: 1 };
      },
      findUnique: async ({ where }: any) =>
        [...assets.values()].find((asset) => asset.id === where.id) ?? null,
    },
  };
  const service = new OrdersService(
    {} as PrismaService,
    {} as TradeEventsService,
    {} as never,
    {} as never,
  );
  const claim = (service as unknown as {
    claimPaymentProofAsset: (
      transaction: unknown,
      customerId: number,
      orderId: number,
      assetId: number,
      storageKey: string,
    ) => Promise<{ assetId: number }>;
  }).claimPaymentProofAsset.bind(service);

  await claim(tx, 7, 9, 1, firstKey);
  await claim(tx, 7, 9, 2, secondKey);
  assert.deepEqual([...assets.values()].map((asset) => asset.orderId), [9, 9]);
  await assert.rejects(claim(tx, 7, 10, 1, firstKey), /归属不一致|已用于其他订单/);
});
