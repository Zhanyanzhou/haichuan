import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { hashBusinessSnapshot } from './quotation-snapshot';
import { QuotationTransactionService } from './quotation-transaction.service';

type Channel = 'RETAIL' | 'CUSTOM' | 'PARTNER_WAX';

const hasErrorCode = (code: string) => (error: unknown) =>
  error instanceof ApiError && error.errorCode === code;

function createHarness(channel: Channel, options?: {
  orderFailure?: Error;
  tamperItemDescription?: boolean;
  activeAgreement?: { id: number; redWaxRate: Prisma.Decimal; purpleWaxRate: Prisma.Decimal };
  activeAgreements?: Array<{ id: number; redWaxRate: Prisma.Decimal; purpleWaxRate: Prisma.Decimal }>;
  reverseRows?: boolean;
  tamperPlanSplit?: boolean;
}) {
  const customerId = 7;
  const snapshot = {
    schemaVersion: 2,
    customer: { customerId, customerName: '客户', customerPhone: '13800000000', depositAmount: '0' },
    pricing: channel === 'PARTNER_WAX'
      ? { method: 'WAX_WEIGHT_RATE', waxType: 'RED', confirmedWaxWeight: '4.000', rate: '25.00', rateSource: 'SYSTEM_DEFAULT_D19_V1' }
      : { method: channel === 'RETAIL' ? 'SKU_FIXED' : 'QUOTED' },
    internalDesign: channel === 'PARTNER_WAX' ? {
      designFileVersionId: 81,
      designFileVersion: 1,
      referenceNo: 'D1',
      mediaAssetId: 91,
      originalName: 'design.3dm',
      byteSize: 128,
      mimeType: 'application/octet-stream',
      checksumSha256: 'a'.repeat(64),
      targetGoldWeight: '40.000',
    } : null,
    items: [{
      productId: channel === 'CUSTOM' ? null : 61,
      skuId: channel === 'RETAIL' ? 71 : null,
      waxType: channel === 'PARTNER_WAX' ? 'RED' : null,
      description: options?.tamperItemDescription ? '被改写的报价行' : '报价行',
      quantity: 1,
      unitPrice: '100.00',
      subtotal: '100.00',
      pricingSnapshot: { version: 2, productName: '报价行' },
    }],
    fees: [],
    resources: channel === 'RETAIL' ? [] : [
      { resourceBucketId: 41, channel, kind: 'CAPACITY', code: 'CAPACITY_A', bucketKey: 'CURRENT', displayName: 'CAPACITY', unit: 'GRAM', requiredQuantity: '1.000' },
      { resourceBucketId: 42, channel, kind: 'MATERIAL', code: 'MATERIAL_A', bucketKey: 'CURRENT', displayName: 'MATERIAL', unit: 'GRAM', requiredQuantity: '2.000' },
    ],
    amounts: { subtotalAmount: '100.00', discountAmount: '0.00', feeAmount: '0.00', totalAmount: '100.00' },
  } as Prisma.JsonObject;
  const resourceRequirements = channel === 'RETAIL' ? [] : [
    {
      id: 31,
      resourceBucketId: 41,
      requiredQuantity: new Prisma.Decimal(1),
      resourceSnapshot: { version: 1, channel, kind: 'CAPACITY', code: 'CAPACITY_A', bucketKey: 'CURRENT', displayName: 'CAPACITY', unit: 'GRAM' },
      resourceBucket: {
        id: 41, channel, kind: 'CAPACITY', isActive: true,
        availableQuantity: new Prisma.Decimal(10), reservedQuantity: new Prisma.Decimal(2), version: 3,
      },
    },
    {
      id: 32,
      resourceBucketId: 42,
      requiredQuantity: new Prisma.Decimal(2),
      resourceSnapshot: { version: 1, channel, kind: 'MATERIAL', code: 'MATERIAL_A', bucketKey: 'CURRENT', displayName: 'MATERIAL', unit: 'GRAM' },
      resourceBucket: {
        id: 42, channel, kind: 'MATERIAL', isActive: true,
        availableQuantity: new Prisma.Decimal(10), reservedQuantity: new Prisma.Decimal(1), version: 4,
      },
    },
  ];
  if (options?.reverseRows) resourceRequirements.reverse();
  const version = {
    id: 21,
    version: 2,
    channel,
    status: 'ISSUED',
    currency: 'CNY',
    subtotalAmount: new Prisma.Decimal(100),
    discountAmount: new Prisma.Decimal(0),
    feeAmount: new Prisma.Decimal(0),
    totalAmount: new Prisma.Decimal(100),
    validUntil: new Date(Date.now() + 60_000),
    snapshotSchemaVersion: 2,
    businessSnapshot: snapshot,
    contentHash: hashBusinessSnapshot(snapshot),
    items: [{
      id: 51,
      productId: channel === 'CUSTOM' ? null : 61,
      skuId: channel === 'RETAIL' ? 71 : null,
      waxType: channel === 'PARTNER_WAX' ? 'RED' : null,
      description: '报价行',
      quantity: 1,
      unitPrice: new Prisma.Decimal(100),
      subtotal: new Prisma.Decimal(100),
      pricingSnapshot: { version: 2, productName: '报价行' },
    }],
    feeLines: [],
    resourceRequirements,
    designFileVersion: channel === 'PARTNER_WAX' ? {
      id: 81,
      version: 1,
      status: 'CONFIRMED',
      confirmedByCustomerId: customerId,
      checksumSha256: 'a'.repeat(64),
      targetGoldWeight: new Prisma.Decimal(40),
      redWaxWeight: new Prisma.Decimal(4),
      purpleWaxWeight: null,
      designFile: { customerId, currentVersion: 1 },
      mediaAsset: {
        id: 91,
        storageKey: 'design-assets/test/design.3dm',
        originalName: 'design.3dm',
        mimeType: 'application/octet-stream',
        byteSize: 128,
        checksumSha256: 'a'.repeat(64),
        accessLevel: 'PRIVATE',
        status: 'READY',
      },
    } : null,
    partnerPriceAgreement: null,
    paymentPlans: [{
      id: 91,
      status: 'DRAFT',
      totalAmount: new Prisma.Decimal(100),
      installments: options?.tamperPlanSplit
        ? [
            { sequence: 1, label: '定金', amount: new Prisma.Decimal(50), status: 'PENDING', paymentId: null },
            { sequence: 2, label: '尾款', amount: new Prisma.Decimal(50), status: 'PENDING', paymentId: null },
          ]
        : [{ sequence: 1, label: '全款', amount: new Prisma.Decimal(100), status: 'PENDING', paymentId: null }],
    }],
    conversion: null,
  };
  const writes: string[] = [];
  let orderInput: Record<string, unknown> | null = null;
  const tx = {
    quotationConversion: {
      findUnique: async () => null,
      create: async () => { writes.push('conversion'); return { id: 1 }; },
    },
    $queryRaw: async () => [{ id: 1 }],
    quotation: {
      findFirst: async () => ({
        id: 11,
        quoteNo: 'QT1',
        status: 'PENDING_CONFIRM',
        channel,
        currentVersion: 2,
        convertedOrderId: null,
        customer: {
          id: customerId,
          name: '客户',
          phone: '13800000000',
          email: null,
          status: 'ACTIVE',
          accountType: channel === 'PARTNER_WAX' ? 'PARTNER' : 'MEMBER',
          partnerStatus: channel === 'PARTNER_WAX' ? 'APPROVED' : 'NONE',
        },
        versions: [version],
      }),
      updateMany: async () => { writes.push('quotation'); return { count: 1 }; },
    },
    customer: {
      findUnique: async () => ({
        id: customerId,
        name: '客户',
        phone: '13800000000',
        email: null,
        status: 'ACTIVE',
        accountType: channel === 'PARTNER_WAX' ? 'PARTNER' : 'MEMBER',
        partnerStatus: channel === 'PARTNER_WAX' ? 'APPROVED' : 'NONE',
      }),
    },
    cooperationDesignFileVersion: {
      findUnique: async () => channel === 'PARTNER_WAX' ? version.designFileVersion : null,
    },
    productSKU: {
      findMany: async () => [{
        id: 71,
        productId: 61,
        price: new Prisma.Decimal(100),
        product: { salesMode: 'DIRECT_PURCHASE', status: 'PUBLISHED' },
      }],
    },
    tradeResourceBucket: {
      findUnique: async ({ where }: { where: { id: number } }) => {
        const item = resourceRequirements.find((entry) => entry.resourceBucketId === where.id);
        return item?.resourceBucket ?? null;
      },
    },
    partnerPriceAgreement: {
      findMany: async () => options?.activeAgreements
        ?? (options?.activeAgreement ? [options.activeAgreement] : []),
    },
    customerAddress: { findFirst: async () => null },
    quotationVersion: { updateMany: async () => { writes.push('version'); return { count: 1 }; } },
    paymentPlan: { updateMany: async () => { writes.push('plan'); return { count: 1 }; } },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      writes.push('transaction');
      return callback(tx);
    },
  };
  const orders = {
    createOrderFromQuotationInTx: async (_tx: unknown, data: Record<string, unknown>) => {
      if (options?.orderFailure) throw options.orderFailure;
      writes.push('order');
      orderInput = data;
      return { id: 101, orderNo: 'ORD1', status: 'PENDING_PAYMENT', finalAmount: new Prisma.Decimal(100) };
    },
  };
  return {
    service: new QuotationTransactionService(
      prisma as unknown as PrismaService,
      orders as unknown as OrdersService,
      {
        readVerifiedDesignFile: async (asset: { checksumSha256: string }) => ({
          buffer: Buffer.alloc(128),
          mimeType: 'application/octet-stream',
          originalName: 'design.3dm',
          byteSize: 128,
          checksumSha256: asset.checksumSha256,
        }),
      } as never,
    ),
    writes,
    orderInput: () => orderInput,
  };
}

for (const channel of ['RETAIL', 'CUSTOM', 'PARTNER_WAX'] as const) {
  test(`${channel} 客户确认在单一事务内选择正确资源通道且不创建 Payment`, async () => {
    const harness = createHarness(channel);
    const order = await harness.service.confirmAndCreateOrder(
      7,
      11,
      `key-${channel}-12345678`,
      { quotationVersion: 2, address: '上海市测试路 1 号' },
    );
    assert.equal(order.order.status, 'PENDING_PAYMENT');
    assert.equal(harness.writes.filter((item) => item === 'transaction').length, 1);
    assert.deepEqual(
      (harness.orderInput()?.resourceRequirements as unknown[]).length,
      channel === 'RETAIL' ? 0 : 2,
    );
    assert.equal(harness.orderInput()?.channel, channel);
    assert.equal(harness.writes.includes('payment'), false);
    assert.deepEqual(harness.writes.slice(-5), ['order', 'conversion', 'version', 'quotation', 'plan']);
    assert.equal(harness.orderInput()?.snapshotSchemaVersion, undefined);
    assert.equal(typeof harness.orderInput()?.transactionSnapshotHash, 'string');
  });
}

test('同一幂等键和请求返回既有订单且不进入交易写链路', async () => {
  const existingOrder = { id: 101, orderNo: 'ORD1', status: 'PENDING_PAYMENT' };
  const key = 'stable-key-12345678';
  const requestHash = createHash('sha256').update(JSON.stringify({
    customerId: 7,
    quotationId: 11,
    quotationVersion: 2,
    addressId: null,
    address: '上海市测试路 1 号',
  })).digest('hex');
  const tx = {
    $queryRaw: async () => [{ id: 11 }],
    quotationConversion: {
      findUnique: async () => ({ customerId: 7, requestHash, quotationVersionId: 21, order: existingOrder }),
    },
  };
  let orderWrites = 0;
  const service = new QuotationTransactionService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService, {
    createOrderFromQuotationInTx: async () => { orderWrites += 1; },
  } as unknown as OrdersService);

  assert.deepEqual(
    (await service.confirmAndCreateOrder(7, 11, key, { quotationVersion: 2, address: '上海市测试路 1 号' })).order,
    { ...existingOrder, finalAmount: undefined, quoteChannel: null },
  );
  assert.equal(orderWrites, 0);
});

test('订单创建失败时不推进报价、版本、转换记录或付款计划', async () => {
  const harness = createHarness('CUSTOM', { orderFailure: new Error('injected rollback') });
  await assert.rejects(
    harness.service.confirmAndCreateOrder(
      7,
      11,
      'rollback-key-12345678',
      { quotationVersion: 2, address: '上海市测试路 1 号' },
    ),
    /injected rollback/,
  );
  assert.equal(harness.writes.includes('conversion'), false);
  assert.equal(harness.writes.includes('version'), false);
  assert.equal(harness.writes.includes('quotation'), false);
  assert.equal(harness.writes.includes('plan'), false);
});

test('数据库报价行即使总额不变但内容被改写也因快照不一致失败关闭', async () => {
  const harness = createHarness('CUSTOM', { tamperItemDescription: true });
  await assert.rejects(
    harness.service.confirmAndCreateOrder(
      7,
      11,
      'tampered-row-12345678',
      { quotationVersion: 2, address: '上海市测试路 1 号' },
    ),
    hasErrorCode('QUOTE_SNAPSHOT_MISMATCH'),
  );
  assert.equal(harness.writes.includes('order'), false);
});

test('资源关系返回顺序扰动不会误判不可变快照', async () => {
  const harness = createHarness('CUSTOM', { reverseRows: true });
  const result = await harness.service.confirmAndCreateOrder(
    7,
    11,
    'reordered-rows-12345678',
    { quotationVersion: 2, address: '上海市测试路 1 号' },
  );
  assert.equal(result.order.orderNo, 'ORD1');
});

test('默认价报价发出后客户专属价开始生效时要求重新报价', async () => {
  const harness = createHarness('PARTNER_WAX', {
    activeAgreement: {
      id: 99,
      redWaxRate: new Prisma.Decimal('26.00'),
      purpleWaxRate: new Prisma.Decimal('21.00'),
    },
  });
  await assert.rejects(
    harness.service.confirmAndCreateOrder(
      7,
      11,
      'new-agreement-12345678',
      { quotationVersion: 2, address: '上海市测试路 1 号' },
    ),
    hasErrorCode('RATE_AGREEMENT_CHANGED'),
  );
  assert.equal(harness.writes.includes('order'), false);
});

test('确认时发现两条同时生效的合作价协议必须失败关闭而不是静默择一', async () => {
  const agreements = [99, 100].map((id) => ({
    id,
    redWaxRate: new Prisma.Decimal('25.00'),
    purpleWaxRate: new Prisma.Decimal('20.00'),
  }));
  const harness = createHarness('PARTNER_WAX', { activeAgreements: agreements });
  await assert.rejects(
    harness.service.confirmAndCreateOrder(
      7,
      11,
      'overlap-agreement-12345678',
      { quotationVersion: 2, address: '上海市测试路 1 号' },
    ),
    hasErrorCode('RATE_AGREEMENT_OVERLAP'),
  );
  assert.equal(harness.writes.includes('order'), false);
});

test('付款计划即使合计未变但定金分拆被改写仍失败关闭', async () => {
  const harness = createHarness('CUSTOM', { tamperPlanSplit: true });
  await assert.rejects(
    harness.service.confirmAndCreateOrder(
      7,
      11,
      'tampered-plan-12345678',
      { quotationVersion: 2, address: '上海市测试路 1 号' },
    ),
    /付款计划与报价定金分拆不一致/,
  );
  assert.equal(harness.writes.includes('order'), false);
});

test('同一幂等键复用于不同请求时失败关闭', async () => {
  const tx = {
    $queryRaw: async () => [{ id: 11 }],
    quotationConversion: {
      findUnique: async () => ({ customerId: 7, requestHash: 'different', quotationVersionId: 21, order: { id: 1 } }),
    },
  };
  const service = new QuotationTransactionService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService, {} as OrdersService);
  await assert.rejects(
    service.confirmAndCreateOrder(7, 11, 'reused-key-12345678', { quotationVersion: 2, address: 'A' }),
    hasErrorCode('IDEMPOTENCY_KEY_REUSED'),
  );
});

test('其他客户不能读取或确认不属于自己的报价', async () => {
  let writes = 0;
  const tx = {
    quotationConversion: { findUnique: async () => null },
    $queryRaw: async () => [],
    quotation: { findFirst: async () => null },
  };
  const service = new QuotationTransactionService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService, {
    createOrderFromQuotationInTx: async () => { writes += 1; },
  } as unknown as OrdersService);
  await assert.rejects(
    service.confirmAndCreateOrder(8, 11, 'isolated-key-12345678', { quotationVersion: 2, address: 'A' }),
  );
  assert.equal(writes, 0);
});

test('客户只能确认本人当前 3D 文件版本且响应不含内部目标金重', async () => {
  const tx = {
    $queryRaw: async () => [{ id: 1 }],
    customer: {
      findFirst: async ({ where }: { where: { id: number } }) => where.id === 7 ? { id: 7 } : null,
    },
    cooperationDesignFile: {
      findFirst: async ({ where }: { where: { customerId: number } }) => where.customerId === 7 ? {
        id: 1,
        referenceNo: 'D1',
        currentVersion: 2,
        versions: [{
          id: 2,
          version: 2,
          status: 'SUBMITTED',
          checksumSha256: 'a'.repeat(64),
          redWaxWeight: new Prisma.Decimal(2),
          purpleWaxWeight: null,
          confirmedAt: null,
          confirmedByCustomerId: null,
          mediaAsset: {
            id: 91,
            storageKey: 'design-assets/test/design.3dm',
            originalName: 'design.3dm',
            mimeType: 'application/octet-stream',
            byteSize: 128,
            checksumSha256: 'a'.repeat(64),
            accessLevel: 'PRIVATE',
            status: 'READY',
          },
        }],
      } : null,
    },
    cooperationDesignFileVersion: {
      updateMany: async () => ({ count: 1 }),
      findUniqueOrThrow: async () => ({
        id: 2,
        version: 2,
        status: 'CONFIRMED',
        checksumSha256: 'a'.repeat(64),
        redWaxWeight: new Prisma.Decimal(2),
        purpleWaxWeight: null,
        confirmedAt: new Date(),
      }),
    },
  };
  const service = new QuotationTransactionService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService, {} as OrdersService, {
    readVerifiedDesignFile: async (asset: { checksumSha256: string }) => ({
      buffer: Buffer.alloc(128),
      mimeType: 'application/octet-stream',
      originalName: 'design.3dm',
      byteSize: 128,
      checksumSha256: asset.checksumSha256,
    }),
  } as never);
  const result = await service.confirmDesignFileVersion(7, 1, 2);
  assert.equal('targetGoldWeight' in result, false);
  await assert.rejects(service.confirmDesignFileVersion(8, 1, 2));
});
