import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { OrdersService } from './orders.service';
import { hashBusinessSnapshot } from '../quotations/quotation-snapshot';

test('CUSTOM 报价订单使用 quotedLines 和资源预占且不写 Payment 或零售 Inventory', async () => {
  const captured: { orderData?: Record<string, unknown> } = {};
  let inventoryReads = 0;
  let paymentWrites = 0;
  const resourceWrites: unknown[] = [];
  const tx = {
    $queryRaw: async () => [{ max_sequence: null }],
    productSKU: { findMany: async () => { inventoryReads += 1; return []; } },
    inventory: { findMany: async () => { inventoryReads += 1; return []; } },
    payment: { create: async () => { paymentWrites += 1; } },
    order: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        captured.orderData = data;
        return {
          id: 10,
          totalAmount: new Prisma.Decimal(100),
          items: [],
          quotedLines: [{ id: 1 }],
        };
      },
    },
    tradeResourceBucket: {
      findUnique: async () => ({
        channel: 'CUSTOM',
        isActive: true,
        availableQuantity: new Prisma.Decimal(10),
        reservedQuantity: new Prisma.Decimal(0),
        version: 6,
      }),
      updateMany: async (args: unknown) => { resourceWrites.push(args); return { count: 1 }; },
    },
    orderResourceReservation: {
      create: async (args: unknown) => { resourceWrites.push(args); return { id: 1 }; },
    },
  };
  const tradeEvents = { record: async () => undefined };
  const service = new OrdersService(
    {} as never,
    tradeEvents as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  await service.createOrderFromQuotationInTx(tx as never, {
    quotationId: 1,
    quotationVersionId: 2,
    channel: 'CUSTOM',
    customerId: 7,
    customerAccountTypeSnapshot: 'MEMBER',
    confirmedAt: new Date(),
    customerName: '客户',
    customerPhone: '13800000000',
    address: '上海市测试路 1 号',
    totalAmount: '100.00',
    feeAmount: '0.00',
    finalAmount: '100.00',
    transactionSnapshot: { schemaVersion: 2 },
    transactionSnapshotHash: 'a'.repeat(64),
    items: [{
      quotationVersionItemId: 3,
      skuId: null,
      productId: null,
      productName: '高级定制',
      description: '高级定制',
      quantity: 1,
      unitPrice: '100.00',
      subtotal: '100.00',
      pricingSnapshot: { method: 'QUOTED' },
    }],
    resourceRequirements: [{
      quotationRequirementId: 4,
      resourceBucketId: 5,
      resourceBucketVersion: 6,
      quantity: '1.000',
    }],
  }, {
    operator: { type: 'CUSTOMER', id: 7 },
    customer: { customerName: '客户', customerPhone: '13800000000', address: '上海市测试路 1 号' },
    reservedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    latestGoldPrice: null,
  });

  assert.equal(captured.orderData?.paymentMethod, null);
  assert.equal(captured.orderData?.status, 'PENDING_PAYMENT');
  assert.equal('items' in (captured.orderData ?? {}), false);
  assert.equal('quotedLines' in (captured.orderData ?? {}), true);
  assert.equal(inventoryReads, 0);
  assert.equal(paymentWrites, 0);
  assert.equal(resourceWrites.length, 2);
});

type TradeResourceLifecycle = {
  releaseTradeResourceReservations(tx: unknown, orderId: number, at: Date): Promise<number>;
  consumeTradeResourceReservations(tx: unknown, orderId: number, at: Date): Promise<number>;
  applyConfirmedPaymentToOrder(
    tx: unknown,
    order: {
      id: number;
      status: 'PENDING_PAYMENT';
      quoteChannel: 'CUSTOM' | 'PARTNER_WAX';
      finalAmount: Prisma.Decimal;
      items: [];
    },
    paymentMethod: string,
    now: Date,
    operator: { type: 'ADMIN'; id: number },
    stockReason: string,
  ): Promise<unknown>;
};

function createService() {
  return new OrdersService(
    {} as never,
    { record: async () => undefined } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  ) as unknown as TradeResourceLifecycle;
}

test('取消定制订单按桶稳定顺序释放资源，重复执行保持幂等且 reserved 不会扣成负数', async () => {
  const lockOrder: number[] = [];
  let reservationStatus = 'RESERVED';
  let reservedQuantity = new Prisma.Decimal('2.000');
  const tx = {
    orderResourceReservation: {
      findMany: async (args: Record<string, unknown>) => {
        assert.deepEqual(args.orderBy, [{ resourceBucketId: 'asc' }, { id: 'asc' }]);
        return reservationStatus === 'RESERVED'
          ? [{ id: 1, resourceBucketId: 7, quantity: new Prisma.Decimal('1.250') }]
          : [];
      },
      updateMany: async () => {
        if (reservationStatus !== 'RESERVED') return { count: 0 };
        reservationStatus = 'RELEASED';
        return { count: 1 };
      },
    },
    $queryRaw: async (query: { values?: readonly unknown[] }) => {
      lockOrder.push(Number(query.values?.[0]));
      return [{ id: 7 }];
    },
    tradeResourceBucket: {
      updateMany: async ({ where }: { where: { reservedQuantity: { gte: Prisma.Decimal } } }) => {
        if (reservedQuantity.lt(where.reservedQuantity.gte)) return { count: 0 };
        reservedQuantity = reservedQuantity.minus(where.reservedQuantity.gte);
        return { count: 1 };
      },
    },
  };
  const lifecycle = createService();
  const first = await lifecycle.releaseTradeResourceReservations(tx, 9, new Date());
  const second = await lifecycle.releaseTradeResourceReservations(tx, 9, new Date());

  assert.equal(first, 1);
  assert.equal(second, 0);
  assert.equal(reservationStatus, 'RELEASED');
  assert.equal(reservedQuantity.toFixed(3), '0.750');
  assert.deepEqual(lockOrder, [7]);
});

test('全额收款核销定制资源时同时扣减总可用额与已预占额', async () => {
  let reservationStatus = 'RESERVED';
  let availableQuantity = new Prisma.Decimal('10.000');
  let reservedQuantity = new Prisma.Decimal('3.000');
  const tx = {
    orderResourceReservation: {
      findMany: async () => reservationStatus === 'RESERVED'
        ? [{ id: 2, resourceBucketId: 8, quantity: new Prisma.Decimal('2.000') }]
        : [],
      updateMany: async () => {
        if (reservationStatus !== 'RESERVED') return { count: 0 };
        reservationStatus = 'CONSUMED';
        return { count: 1 };
      },
    },
    $queryRaw: async () => [{ id: 8 }],
    tradeResourceBucket: {
      updateMany: async ({ where }: { where: {
        availableQuantity: { gte: Prisma.Decimal };
        reservedQuantity: { gte: Prisma.Decimal };
      } }) => {
        const quantity = where.availableQuantity.gte;
        if (availableQuantity.lt(quantity) || reservedQuantity.lt(where.reservedQuantity.gte)) {
          return { count: 0 };
        }
        availableQuantity = availableQuantity.minus(quantity);
        reservedQuantity = reservedQuantity.minus(where.reservedQuantity.gte);
        return { count: 1 };
      },
    },
  };
  const consumed = await createService().consumeTradeResourceReservations(tx, 9, new Date());

  assert.equal(consumed, 1);
  assert.equal(reservationStatus, 'CONSUMED');
  assert.equal(availableQuantity.toFixed(3), '8.000');
  assert.equal(reservedQuantity.toFixed(3), '1.000');
});

for (const quoteChannel of ['CUSTOM', 'PARTNER_WAX'] as const) {
  test(`${quoteChannel} 全额收款在生产交付模型缺失时先失败关闭且不变更资源或订单`, async () => {
    const writes: string[] = [];
    const tx = {
      payment: {
        findMany: async () => [{ amount: new Prisma.Decimal('100.00') }],
      },
      order: {
        updateMany: async () => { writes.push('order'); return { count: 1 }; },
      },
      orderResourceReservation: {
        findMany: async () => { writes.push('resource-read'); return []; },
        updateMany: async () => { writes.push('resource-write'); return { count: 1 }; },
      },
      fulfillment: {
        create: async () => { writes.push('fulfillment'); return { id: 1 }; },
      },
    };

    await assert.rejects(
      createService().applyConfirmedPaymentToOrder(
        tx,
        {
          id: 9,
          status: 'PENDING_PAYMENT',
          quoteChannel,
          finalAmount: new Prisma.Decimal('100.00'),
          items: [],
        },
        'BANK_TRANSFER',
        new Date(),
        { type: 'ADMIN', id: 1 },
        'test',
      ),
      (error: unknown) => error instanceof ApiError
        && error.errorCode === 'NON_RETAIL_FULFILLMENT_MODEL_REQUIRED',
    );
    assert.deepEqual(writes, []);
  });
}

test('后台订单详情回读报价行、资源和双向关联并校验交易快照', async () => {
  const transactionSnapshot = { schemaVersion: 2, quotation: { id: 1, version: 2 } };
  let capturedInclude: Record<string, unknown> | undefined;
  const order = {
    id: 9,
    transactionSnapshot,
    transactionSnapshotHash: hashBusinessSnapshot(transactionSnapshot),
    snapshotSchemaVersion: 2,
    quotedLines: [{ id: 4, description: '高级定制' }],
    resourceReservations: [{ id: 5, quantity: new Prisma.Decimal(1) }],
    quotationVersion: { id: 2, quotationId: 1, version: 2 },
    quotationSource: { id: 1, quoteNo: 'Q1' },
    quotationConversion: { id: 3, quotationVersionId: 2 },
  };
  const service = new OrdersService(
    {
      order: {
        findUnique: async ({ include }: { include: Record<string, unknown> }) => {
          capturedInclude = include;
          return order;
        },
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const result = await service.findById(9);
  assert.ok(capturedInclude?.quotedLines);
  assert.ok(capturedInclude?.resourceReservations);
  assert.ok(capturedInclude?.quotationVersion);
  assert.ok(capturedInclude?.quotationSource);
  assert.ok(capturedInclude?.quotationConversion);
  assert.equal(result, order);
});

test('后台订单详情对被篡改的交易快照失败关闭', async () => {
  const service = new OrdersService(
    {
      order: {
        findUnique: async () => ({
          id: 9,
          transactionSnapshot: { schemaVersion: 2, quotation: { id: 99 } },
          transactionSnapshotHash: hashBusinessSnapshot({ schemaVersion: 2, quotation: { id: 1 } }),
          snapshotSchemaVersion: 2,
        }),
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  await assert.rejects(
    () => service.findById(9),
    /订单交易快照完整性校验失败/,
  );
});
