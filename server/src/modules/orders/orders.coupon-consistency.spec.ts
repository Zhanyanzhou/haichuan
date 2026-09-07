import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from './orders.service';

function coupon(type: 'fixed' | 'percent', value: number) {
  return {
    id: 7,
    name: '交易一致性测试券',
    type,
    value: new Prisma.Decimal(value),
    minAmount: new Prisma.Decimal(0),
    totalCount: 20,
    usedCount: 0,
    startTime: new Date('2026-01-01T00:00:00.000Z'),
    endTime: new Date('2027-01-01T00:00:00.000Z'),
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function makeOrderHarness(
  preflightCoupon: ReturnType<typeof coupon>,
  transactionCoupon: ReturnType<typeof coupon>,
  orderNumberConflicts = 0,
) {
  let createdOrderData: any;
  let claimWhere: any;
  let orderCreated = false;
  let couponLocked = false;
  let orderCreateAttempts = 0;
  let couponClaims = 0;
  let reservations = 0;
  let events = 0;
  const tx = {
    $queryRaw: async () => {
      couponLocked = true;
      return [{ id: transactionCoupon.id }];
    },
    coupon: {
      findUnique: async () => transactionCoupon,
      updateMany: async ({ where }: any) => {
        claimWhere = where;
        couponClaims += 1;
        return { count: 1 };
      },
    },
    productSKU: {
      findMany: async () => [{
        id: 10,
        productId: 1,
        skuCode: 'SKU-10',
        price: new Prisma.Decimal(100),
        product: { inventoryPolicy: 'STANDARD' },
      }],
    },
    order: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        orderCreateAttempts += 1;
        if (orderCreateAttempts <= orderNumberConflicts) {
          throw new Prisma.PrismaClientKnownRequestError('synthetic orderNo conflict', {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: 'orders_order_no_key' },
          });
        }
        orderCreated = true;
        createdOrderData = data;
        return {
          id: 1,
          ...data,
          items: [{ productId: 1, skuId: 10, quantity: 1 }],
        };
      },
    },
  };
  const prisma = {
    productSKU: {
      findMany: async () => [{
        id: 10,
        productId: 1,
        skuCode: 'SKU-10',
        price: new Prisma.Decimal(100),
        material: 'GOLD_999',
        size: null,
        product: {
          id: 1,
          name: '测试商品',
          code: 'P-1',
          inventoryPolicy: 'STANDARD',
          primaryImage: null,
          images: [],
        },
      }],
    },
    inventory: {
      groupBy: async () => [{ skuId: 10, _sum: { quantity: 5 } }],
    },
    coupon: {
      findUnique: async () => preflightCoupon,
      fields: { totalCount: { name: 'totalCount' } },
    },
    $transaction: async (callback: (client: any) => Promise<any>) => callback(tx),
  };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    { record: async () => { events += 1; } } as never,
    {} as never,
    {} as never,
  );
  (service as any).reserveStock = async () => { reservations += 1; };

  return {
    service,
    state: () => ({
      createdOrderData,
      claimWhere,
      orderCreated,
      couponLocked,
      orderCreateAttempts,
      couponClaims,
      reservations,
      events,
    }),
  };
}

test('固定金额券与百分比券在事务重验后写入同一金额公式结果', async () => {
  for (const scenario of [
    { coupon: coupon('fixed', 20), discount: 20, final: 80 },
    { coupon: coupon('percent', 10), discount: 10, final: 90 },
  ]) {
    const harness = makeOrderHarness(scenario.coupon, scenario.coupon);
    await harness.service.create({
      customerId: 1,
      customerName: '合成客户',
      customerPhone: '13800000000',
      address: '合成地址',
      items: [{ skuId: 10, quantity: 1 }],
      couponId: scenario.coupon.id,
    });

    const state = harness.state();
    assert.equal(Number(state.createdOrderData.discountAmount), scenario.discount);
    assert.equal(Number(state.createdOrderData.finalAmount), scenario.final);
    assert.equal(state.couponLocked, true);
    assert.equal(state.claimWhere.name, scenario.coupon.name);
    assert.equal(state.claimWhere.type, scenario.coupon.type);
    assert.equal(Number(state.claimWhere.value), Number(scenario.coupon.value));
    assert.equal(Number(state.claimWhere.minAmount), Number(scenario.coupon.minAmount));
    assert.equal(state.claimWhere.totalCount, scenario.coupon.totalCount);
    assert.equal(
      state.claimWhere.startTime.equals.getTime(),
      scenario.coupon.startTime.getTime(),
    );
    assert.equal(
      state.claimWhere.endTime.equals.getTime(),
      scenario.coupon.endTime.getTime(),
    );
  }
});

test('试算后并发修改优惠券经济条款时不核销也不创建订单', async () => {
  const harness = makeOrderHarness(coupon('fixed', 20), coupon('fixed', 30));

  await assert.rejects(
    () => harness.service.create({
      customerId: 1,
      customerName: '合成客户',
      customerPhone: '13800000000',
      address: '合成地址',
      items: [{ skuId: 10, quantity: 1 }],
      couponId: 7,
    }),
    ConflictException,
  );
  assert.equal(harness.state().claimWhere, undefined);
  assert.equal(harness.state().orderCreated, false);
});

test('订单号冲突会重跑整笔事务且只在成功尝试核销券、预占库存和记录事件', async () => {
  const sameCoupon = coupon('fixed', 20);
  const harness = makeOrderHarness(sameCoupon, sameCoupon, 2);

  await harness.service.create({
    customerId: 1,
    customerName: '合成客户',
    customerPhone: '13800000000',
    address: '合成地址',
    items: [{ skuId: 10, quantity: 1 }],
    couponId: 7,
  });

  const state = harness.state();
  assert.equal(state.orderCreateAttempts, 3);
  assert.equal(state.couponClaims, 1);
  assert.equal(state.reservations, 1);
  assert.equal(state.events, 2);
});

function makeCouponReleaseHarness(options?: {
  paidAmount?: number;
  confirmedPayment?: boolean;
  expired?: boolean;
}) {
  const order = {
    id: 1,
    orderNo: 'ORD-COUPON-1',
    status: 'PENDING_PAYMENT',
    paidAmount: new Prisma.Decimal(options?.paidAmount ?? 0),
    couponId: 7,
    reservedAt: options?.expired
      ? new Date(Date.now() - 25 * 60 * 60 * 1000)
      : new Date(),
    customerEmail: null,
    customerName: '合成客户',
    payments: options?.confirmedPayment
      ? [{ status: 'PAID', proofUrl: null }]
      : [],
  };
  let usedCount = 1;
  let transactionTail = Promise.resolve();
  const events: Array<Record<string, unknown>> = [];
  const tx: any = {
    $queryRaw: async () => [{ id: 1, usedCount }],
    order: {
      findUnique: async () => order,
      findFirst: async ({ where }: any) =>
        where.id === order.id && order.status === 'PENDING_PAYMENT' ? order : null,
      updateMany: async ({ where, data }: any) => {
        if (where.status && order.status !== where.status) return { count: 0 };
        if (where.paidAmount !== undefined && Number(order.paidAmount) !== Number(where.paidAmount)) {
          return { count: 0 };
        }
        Object.assign(order, data);
        return { count: 1 };
      },
    },
    payment: {
      findFirst: async () => options?.confirmedPayment ? { id: 9 } : null,
    },
    fulfillment: { findFirst: async () => null },
    coupon: {
      updateMany: async () => {
        if (usedCount <= 0) return { count: 0 };
        usedCount -= 1;
        return { count: 1 };
      },
    },
  };
  const prisma = {
    coupon: { fields: { totalCount: { name: 'totalCount' } } },
    order: { findMany: async () => [{ id: order.id }] },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        return await callback(tx);
      } finally {
        release();
      }
    },
  };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    {
      record: async (_tx: unknown, event: Record<string, unknown>) => {
        events.push(event);
      },
    } as never,
    {} as never,
    {} as never,
  );
  (service as any).releaseStockReservations = async () => 1;
  return { service, order, events, get usedCount() { return usedCount; } };
}

test('未付款订单并发重复取消只归还一次优惠券容量并保留订单券关联', async () => {
  const harness = makeCouponReleaseHarness();

  const results = await Promise.allSettled([
    harness.service.updateStatus(1, { status: 'CANCELLED' }),
    harness.service.updateStatus(1, { status: 'CANCELLED' }),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(harness.usedCount, 0);
  assert.equal(harness.order.couponId, 7);
  assert.equal(
    harness.events.filter((event) => event.eventType === 'COUPON_RELEASED').length,
    1,
  );
  const couponEvent = harness.events.find((event) => event.eventType === 'COUPON_RELEASED');
  assert.deepEqual(couponEvent?.metadata, {
    couponId: 7,
    trigger: 'MANUAL_CANCEL',
    previousUsedCount: 1,
    currentUsedCount: 0,
  });
});

test('未付款超时并发扫描只归还一次优惠券且只取消一次订单', async () => {
  const harness = makeCouponReleaseHarness({ expired: true });

  await Promise.all([
    harness.service.releaseExpiredReservations(),
    harness.service.releaseExpiredReservations(),
  ]);

  assert.equal(harness.order.status, 'CANCELLED');
  assert.equal(harness.usedCount, 0);
  assert.equal(
    harness.events.filter((event) => event.eventType === 'COUPON_RELEASED').length,
    1,
  );
  const couponEvent = harness.events.find((event) => event.eventType === 'COUPON_RELEASED');
  assert.equal((couponEvent?.metadata as any)?.trigger, 'PAYMENT_TIMEOUT');
});

test('已有确认收款的订单拒绝取消且不返还优惠券', async () => {
  const harness = makeCouponReleaseHarness({ paidAmount: 100, confirmedPayment: true });

  await assert.rejects(
    () => harness.service.updateStatus(1, { status: 'CANCELLED' }),
    ConflictException,
  );

  assert.equal(harness.usedCount, 1);
  assert.equal(harness.order.status, 'PENDING_PAYMENT');
  assert.equal(
    harness.events.filter((event) => event.eventType === 'COUPON_RELEASED').length,
    0,
  );
});
