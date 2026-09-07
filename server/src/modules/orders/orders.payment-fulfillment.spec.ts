import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from './orders.service';

type FakePayment = {
  id: number;
  orderId: number;
  amount: Prisma.Decimal;
  method: string;
  type: string;
  status: string;
  paymentNo: string;
};

function createHarness(finalAmount = 100) {
  const state = {
    order: {
      id: 1,
      orderNo: 'ORD-1',
      customerId: 7,
      status: 'PENDING_PAYMENT',
      finalAmount: new Prisma.Decimal(finalAmount),
      paidAmount: new Prisma.Decimal(0),
      paidDeposit: new Prisma.Decimal(0),
      paidBalance: new Prisma.Decimal(0),
      paymentMethod: null as string | null,
      deliveryStatus: 'NONE',
      logisticsCompany: null as string | null,
      logisticsNo: null as string | null,
      customerEmail: null,
      customerName: '测试客户',
      items: [{ id: 1000, productId: 10, skuId: 100, quantity: 1 }],
    },
    payments: [] as FakePayment[],
    fulfillments: [] as Array<{
      id: number;
      fulfillmentNo: string;
      orderId: number;
      status: string;
      internalNote: string | null;
      carrier?: string;
      trackingNo?: string;
      warehouseId: number;
    }>,
    reservationConsumes: 0,
    transactionCalls: 0,
    events: [] as Array<Record<string, unknown>>,
    notifications: [] as Array<Record<string, unknown>>,
    fulfillmentAuthorityCalls: [] as Array<Record<string, unknown>>,
  };

  const applyOrderData = (data: Record<string, any>) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'increment' in value) {
        (state.order as any)[key] = new Prisma.Decimal(
          Number((state.order as any)[key] ?? 0) + Number(value.increment),
        );
      } else {
        (state.order as any)[key] = value;
      }
    }
  };

  const tx: any = {
    $queryRaw: async () => [{ id: state.order.id }],
    order: {
      findUnique: async () => state.order,
      update: async ({ data }: any) => {
        applyOrderData(data);
        return state.order;
      },
      updateMany: async ({ where, data }: any) => {
        if (where.status && state.order.status !== where.status) return { count: 0 };
        applyOrderData(data);
        return { count: 1 };
      },
    },
    payment: {
      findFirst: async ({ where }: any) =>
        state.payments.find(
          (payment) =>
            payment.orderId === where.orderId &&
            (!where.status || payment.status === where.status),
        ) ?? null,
      create: async ({ data }: any) => {
        const payment: FakePayment = {
          id: state.payments.length + 1,
          orderId: data.orderId,
          amount: new Prisma.Decimal(data.amount),
          method: data.method,
          type: data.type,
          status: data.status,
          paymentNo: data.paymentNo,
        };
        state.payments.push(payment);
        return payment;
      },
      findMany: async ({ where }: any) =>
        state.payments.filter(
          (payment) =>
            payment.orderId === where.orderId &&
            (!where.status?.in || where.status.in.includes(payment.status)),
        ),
    },
    fulfillment: {
      findMany: async ({ where }: any) =>
        state.fulfillments.filter((item) => item.orderId === where.orderId),
      findFirst: async ({ where }: any) =>
        state.fulfillments.find((item) => item.orderId === where.orderId) ?? null,
      create: async ({ data }: any) => {
        const fulfillment = {
          id: state.fulfillments.length + 1,
          fulfillmentNo: data.fulfillmentNo,
          orderId: data.orderId,
          warehouseId: data.warehouseId,
          status: data.status,
          internalNote: null,
        };
        state.fulfillments.push(fulfillment);
        return fulfillment;
      },
      updateMany: async ({ where, data }: any) => {
        const fulfillment = state.fulfillments.find((item) => item.id === where.id);
        if (!fulfillment || !where.status.in.includes(fulfillment.status)) return { count: 0 };
        Object.assign(fulfillment, data);
        return { count: 1 };
      },
      count: async ({ where }: any) =>
        state.fulfillments.filter(
          (item) =>
            item.orderId === where.orderId &&
            item.id !== where.id?.not &&
            !where.status.notIn.includes(item.status),
        ).length,
    },
    inventoryReservation: {
      findMany: async () => [
        {
          id: 501,
          skuId: 100,
          quantity: 1,
          inventory: { warehouseId: 1 },
        },
      ],
      updateMany: async () => {
        state.reservationConsumes += 1;
        return { count: 1 };
      },
    },
  };
  const prisma = {
    ...tx,
    $transaction: async (callback: (client: any) => Promise<unknown>) => {
      state.transactionCalls += 1;
      return callback(tx);
    },
  } as unknown as PrismaService;
  const service = new OrdersService(
    prisma,
    { record: async (_tx: unknown, event: Record<string, unknown>) => state.events.push(event) } as never,
    {} as never,
    {} as never,
    {
      enqueuePaymentConfirmed: async (_tx: unknown, input: Record<string, unknown>) => {
        state.notifications.push(input);
      },
      enqueueOrderLifecycle: async (_tx: unknown, input: Record<string, unknown>) => {
        state.notifications.push(input);
      },
    } as never,
    {
      dispatch: async (
        fulfillmentId: number,
        data: { carrier: string; trackingNo: string; internalNote?: string },
        operator: Record<string, unknown>,
        options: Record<string, unknown>,
      ) => {
        state.fulfillmentAuthorityCalls.push({ fulfillmentId, data, operator, options });
        const fulfillment = state.fulfillments.find((item) => item.id === fulfillmentId);
        if (!fulfillment) throw new Error('履约单不存在');
        Object.assign(fulfillment, {
          status: 'SHIPPED',
          carrier: data.carrier,
          trackingNo: data.trackingNo,
        });
        state.order.status = 'SHIPPED';
        state.order.deliveryStatus = 'SHIPPED';
        return fulfillment;
      },
    } as never,
  );
  return { service, state };
}

test('人工收款标为 FULL 但未收足时仍保持待付款且不创建履约单', async () => {
  const { service, state } = createHarness(100);

  await service.recordManualReceipt({
    orderId: 1,
    amount: 30,
    method: 'bank_transfer',
    type: 'FULL',
  });

  assert.equal(state.order.status, 'PENDING_PAYMENT');
  assert.equal(Number(state.order.paidAmount), 30);
  assert.equal(state.fulfillments.length, 0);
  assert.equal(state.reservationConsumes, 0);
});

test('累计线下实收精确达到应收后只创建一张待拣货履约单', async () => {
  const { service, state } = createHarness(100);

  await service.recordManualReceipt({
    orderId: 1,
    amount: 40,
    method: 'bank_transfer',
    type: 'DEPOSIT',
  });
  await service.recordManualReceipt({
    orderId: 1,
    amount: 60,
    method: 'store',
    type: 'BALANCE',
  });

  assert.equal(state.order.status, 'PENDING_SHIP');
  assert.equal(Number(state.order.paidAmount), 100);
  assert.equal(state.fulfillments.length, 1);
  assert.equal(state.fulfillments[0].status, 'PENDING_PICK');
  assert.equal(state.reservationConsumes, 1);
  assert.deepEqual(
    state.notifications.map((notification) => notification.cumulativePaidCents),
    [4000, 10000],
  );
  assert.deepEqual(
    state.notifications.map((notification) => notification.paymentId),
    [1, 2],
  );
});

test('线下实收超过剩余应收时整笔拒绝且不创建 Payment', async () => {
  const { service, state } = createHarness(100);
  await service.recordManualReceipt({
    orderId: 1,
    amount: 80,
    method: 'bank_transfer',
    type: 'DEPOSIT',
  });

  await assert.rejects(
    () =>
      service.recordManualReceipt({
        orderId: 1,
        amount: 30,
        method: 'store',
        type: 'BALANCE',
      }),
    BadRequestException,
  );
  assert.equal(state.payments.length, 1);
  assert.equal(Number(state.order.paidAmount), 80);
});

test('人工入口不能把微信或支付宝伪装成已到账', async () => {
  const { service, state } = createHarness(100);
  await assert.rejects(
    () =>
      service.recordManualReceipt({
        orderId: 1,
        amount: 100,
        method: 'wechat',
        type: 'FULL',
      } as never),
    BadRequestException,
  );
  assert.equal(state.transactionCalls, 0);
  assert.equal(state.payments.length, 0);
});

test('在线 Payment 缺少验签渠道事实时不能由后台人工确认到账', async () => {
  let updates = 0;
  const onlinePayment = {
    id: 9,
    orderId: 1,
    paymentNo: 'PAY-WECHAT-9',
    amount: new Prisma.Decimal(100),
    method: 'wechat',
    type: 'FULL',
    status: 'PENDING',
    proofUrl: null,
    order: {
      id: 1,
      orderNo: 'ORD-1',
      status: 'PENDING_PAYMENT',
      finalAmount: new Prisma.Decimal(100),
      items: [],
    },
  };
  const tx = {
    $queryRaw: async () => [{ id: 1 }],
    payment: {
      findUnique: async ({ include }: { include?: unknown }) => include
        ? onlinePayment
        : { orderId: onlinePayment.orderId },
      updateMany: async () => {
        updates += 1;
        return { count: 1 };
      },
    },
  };
  const service = new OrdersService(
    {
      payment: {
        findUnique: async () => ({ orderId: onlinePayment.orderId }),
      },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(
    () => service.confirmPaymentSettlement(9, 1, undefined, { type: 'ADMIN', id: 1 }),
    /不满足确认收款条件/,
  );
  assert.equal(updates, 0);
});

test('订单中心发货复用付款时创建的履约单，不再新建第二张', async () => {
  const { service, state } = createHarness(100);
  await service.recordManualReceipt({
    orderId: 1,
    amount: 100,
    method: 'bank_transfer',
    type: 'FULL',
  });
  const fulfillmentId = state.fulfillments[0].id;

  await service.ship(1, { logisticsCompany: '顺丰', logisticsNo: 'SF001' });

  assert.equal(state.fulfillments.length, 1);
  assert.equal(state.fulfillments[0].id, fulfillmentId);
  assert.equal(state.fulfillments[0].status, 'SHIPPED');
  assert.equal(state.order.status, 'SHIPPED');
  assert.equal(state.order.deliveryStatus, 'SHIPPED');
  assert.equal(state.fulfillmentAuthorityCalls.length, 1);
  assert.deepEqual(state.fulfillmentAuthorityCalls[0]?.options, { requireSingleOrderId: 1 });
});

test('订单中心兼容入口对多包裹始终 409，显式传 fulfillmentId 也不能绕过', async () => {
  const { service, state } = createHarness(100);
  await service.recordManualReceipt({
    orderId: 1,
    amount: 100,
    method: 'bank_transfer',
    type: 'FULL',
  });
  state.fulfillments.push({
    id: 2,
    fulfillmentNo: 'FUL-WH-2',
    orderId: 1,
    warehouseId: 2,
    status: 'PENDING_PICK',
    internalNote: null,
  });

  await assert.rejects(
    () => service.ship(1, { logisticsCompany: '顺丰', logisticsNo: 'SF-MISSING' }),
    /前往履约中心逐包发货/,
  );

  await assert.rejects(
    () => service.ship(1, {
      fulfillmentId: 1,
      logisticsCompany: '顺丰',
      logisticsNo: 'SF-WH-1',
    }),
    /前往履约中心逐包发货/,
  );
  assert.equal(state.fulfillments[0].status, 'PENDING_PICK');
  assert.equal(state.fulfillments[1].status, 'PENDING_PICK');
  assert.equal(state.order.status, 'PENDING_SHIP');
  assert.equal(state.order.deliveryStatus, 'PENDING_SHIP');
  assert.equal(state.order.logisticsNo, null);
  assert.equal(state.fulfillmentAuthorityCalls.length, 0);
});

test('付款确认事务先锁订单再重读 Payment 和订单状态', async () => {
  const sequence: string[] = [];
  const payment = {
    id: 9,
    orderId: 1,
    paymentNo: 'PAY-LOCK-9',
    amount: new Prisma.Decimal(100),
    method: 'bank_transfer',
    type: 'FULL',
    status: 'PENDING',
    proofUrl: 'synthetic-proof.jpg',
    order: {
      id: 1,
      orderNo: 'ORD-LOCK-1',
      status: 'CANCELLED',
      finalAmount: new Prisma.Decimal(100),
      items: [],
    },
  };
  const tx = {
    $queryRaw: async () => {
      sequence.push('order-lock');
      return [{ id: 1 }];
    },
    payment: {
      findUnique: async () => {
        sequence.push('payment-reread');
        return payment;
      },
    },
  };
  const prisma = {
    payment: {
      findUnique: async () => {
        sequence.push('payment-locator');
        return { orderId: 1 };
      },
    },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      sequence.push('transaction');
      return callback(tx);
    },
  };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(
    () => service.confirmPaymentSettlement(9, 1),
    /订单状态已变化/,
  );
  assert.deepEqual(sequence, [
    'payment-locator',
    'transaction',
    'order-lock',
    'payment-reread',
  ]);
});

test('取消事务按 Order、Payment、Fulfillment、库存预占顺序处理', async () => {
  const sequence: string[] = [];
  const events: string[] = [];
  const order = {
    id: 1,
    orderNo: 'ORD-CANCEL-1',
    status: 'PENDING_PAYMENT',
    paidAmount: new Prisma.Decimal(0),
    customerEmail: null,
    customerName: '合成客户',
  };
  const tx = {
    $queryRaw: async () => {
      sequence.push('order-lock');
      return [{ id: 1 }];
    },
    order: {
      findUnique: async () => {
        sequence.push('order-reread');
        return order;
      },
      updateMany: async ({ data }: any) => {
        sequence.push('order-update');
        Object.assign(order, data);
        return { count: 1 };
      },
    },
    payment: {
      findFirst: async () => {
        sequence.push('payment-read');
        return null;
      },
    },
    fulfillment: {
      findFirst: async () => {
        sequence.push('fulfillment-read');
        return null;
      },
    },
  };
  const prisma = {
    order: {
      findUnique: async () => {
        throw new Error('取消不得在事务外读取订单状态');
      },
    },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    {
      record: async (_client: unknown, event: { eventType: string }) => {
        events.push(event.eventType);
      },
    } as never,
    {} as never,
    {} as never,
  );
  (service as any).releaseStockReservations = async () => {
    sequence.push('inventory-release');
    return 1;
  };

  const result = await service.updateStatus(1, { status: 'CANCELLED' });

  assert.equal(result?.status, 'CANCELLED');
  assert.deepEqual(sequence.slice(0, 7), [
    'order-lock',
    'order-reread',
    'payment-read',
    'payment-read',
    'fulfillment-read',
    'inventory-release',
    'order-update',
  ]);
  assert.deepEqual(events, ['STOCK_RELEASED', 'ORDER_CANCELLED']);
});

test('取消拿到订单锁后发现确认付款会拒绝且不释放库存', async () => {
  let released = false;
  const order = {
    id: 1,
    status: 'PENDING_PAYMENT',
    paidAmount: new Prisma.Decimal(100),
  };
  const tx = {
    $queryRaw: async () => [{ id: 1 }],
    order: { findUnique: async () => order },
    payment: { findFirst: async () => ({ id: 8 }) },
  };
  const service = new OrdersService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );
  (service as any).releaseStockReservations = async () => {
    released = true;
    return 1;
  };

  await assert.rejects(
    () => service.updateStatus(1, { status: 'CANCELLED' }),
    ConflictException,
  );
  assert.equal(released, false);
});

test('取消拿到订单锁后发现 PENDING 支付会拒绝且不释放库存', async () => {
  let released = false;
  const tx = {
    $queryRaw: async () => [{ id: 1 }],
    order: {
      findUnique: async () => ({
        id: 1,
        orderNo: 'ORD-CANCEL-RACE',
        status: 'PENDING_PAYMENT',
        paidAmount: new Prisma.Decimal(0),
      }),
    },
    payment: {
      findFirst: async ({ where }: any) =>
        where.status === 'PENDING' ? { paymentNo: 'PAY-RACE' } : null,
    },
  };
  const service = new OrdersService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );
  (service as any).releaseStockReservations = async () => {
    released = true;
    return 1;
  };

  await assert.rejects(
    () => service.updateStatus(1, { status: 'CANCELLED' }),
    /待处理的支付交易 PAY-RACE/,
  );
  assert.equal(released, false);
});

test('未付款报价订单取消时同步取消未绑定分期和 ACTIVE 付款计划', async () => {
  const order = {
    id: 1,
    orderNo: 'ORD-CANCEL-PLAN',
    status: 'PENDING_PAYMENT',
    paidAmount: new Prisma.Decimal(0),
    quotationVersionId: 30,
    customerEmail: null,
    customerName: '合成客户',
  };
  const plan = {
    id: 60,
    status: 'ACTIVE',
    installments: [
      { id: 61, status: 'PENDING', paymentId: null },
      { id: 62, status: 'PENDING', paymentId: null },
    ],
  };
  const tx = {
    $queryRaw: async () => [{ id: 1 }],
    order: {
      findUnique: async () => order,
      updateMany: async ({ data }: any) => {
        Object.assign(order, data);
        return { count: 1 };
      },
    },
    payment: { findFirst: async () => null },
    fulfillment: { findFirst: async () => null },
    paymentPlan: {
      findUnique: async () => plan,
      updateMany: async () => {
        plan.status = 'CANCELLED';
        return { count: 1 };
      },
    },
    paymentPlanInstallment: {
      updateMany: async () => {
        for (const installment of plan.installments) installment.status = 'CANCELLED';
        return { count: 2 };
      },
    },
  };
  const service = new OrdersService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    { record: async () => undefined } as never,
    {} as never,
    {} as never,
  );
  (service as any).releaseStockReservations = async () => 0;

  await service.updateStatus(1, { status: 'CANCELLED' });
  assert.equal(order.status, 'CANCELLED');
  assert.equal(plan.status, 'CANCELLED');
  assert.deepEqual(plan.installments.map((item) => item.status), [
    'CANCELLED',
    'CANCELLED',
  ]);
});
