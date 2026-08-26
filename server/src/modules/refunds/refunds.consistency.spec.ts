import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RefundsService } from './refunds.service';

type FakePayment = {
  id: number;
  orderId: number;
  paymentNo: string;
  amount: Prisma.Decimal;
  method: string;
  status: string;
  paidAt: Date;
  createdAt: Date;
};

type FakeRefund = {
  id: number;
  orderId: number;
  paymentId: number | null;
  refundNo: string;
  amount: Prisma.Decimal;
  reason: string;
  status: string;
  idempotencyKey: string;
  gatewayRefundNo: string | null;
  afterSalesCaseId?: number | null;
  [key: string]: any;
};

type FakeAfterSalesCase = {
  id: number;
  orderId: number;
  type: string;
  status: string;
  approvedRefundAmount: Prisma.Decimal | null;
};

function createHarness(
  payments: Array<Pick<FakePayment, 'id' | 'amount' | 'method' | 'status'>>,
  refunds: FakeRefund[] = [],
  afterSalesCases: FakeAfterSalesCase[] = [],
) {
  const now = new Date('2026-08-25T00:00:00.000Z');
  const state = {
    payments: payments.map((payment, index) => ({
      ...payment,
      orderId: 1,
      paymentNo: `PAY-${payment.id}`,
      paidAt: new Date(now.getTime() - index * 1000),
      createdAt: new Date(now.getTime() - index * 1000),
    })) as FakePayment[],
    refunds,
    afterSalesCases,
    order: { id: 1, refundedAmount: new Prisma.Decimal(0) },
    events: [] as Array<Record<string, unknown>>,
    refundUpdates: 0,
  };

  const matchesStatus = (actual: string, expected: any) =>
    typeof expected === 'string'
      ? actual === expected
      : expected?.in
        ? expected.in.includes(actual)
        : true;
  const findRefund = (where: any) => {
    if (where.idempotencyKey !== undefined) {
      return state.refunds.find((refund) => refund.idempotencyKey === where.idempotencyKey) ?? null;
    }
    return state.refunds.find((refund) => refund.id === where.id) ?? null;
  };

  const tx: any = {
    $queryRaw: async () => [{ id: 1 }],
    payment: {
      findMany: async ({ where }: any) =>
        state.payments.filter(
          (payment) =>
            payment.orderId === where.orderId && matchesStatus(payment.status, where.status),
        ),
      findFirst: async ({ where }: any) =>
        state.payments.find(
          (payment) =>
            payment.id === where.id &&
            payment.orderId === where.orderId &&
            matchesStatus(payment.status, where.status),
        ) ?? null,
      update: async ({ where, data }: any) => {
        const payment = state.payments.find((item) => item.id === where.id)!;
        Object.assign(payment, data);
        return payment;
      },
    },
    refund: {
      findUnique: async ({ where, include }: any) => {
        const refund = findRefund(where);
        if (!refund) return null;
        if (include?.payment) {
          return {
            ...refund,
            payment: state.payments.find((payment) => payment.id === refund.paymentId) ?? null,
          };
        }
        return refund;
      },
      findMany: async ({ where }: any) =>
        state.refunds.filter((refund) => {
          if (where.orderId !== undefined && refund.orderId !== where.orderId) return false;
          if (where.paymentId !== undefined && refund.paymentId !== where.paymentId) return false;
          if (
            where.afterSalesCaseId !== undefined &&
            refund.afterSalesCaseId !== where.afterSalesCaseId
          ) return false;
          if (!matchesStatus(refund.status, where.status)) return false;
          if (where.id?.not !== undefined && refund.id === where.id.not) return false;
          return true;
        }),
      create: async ({ data }: any) => {
        const refund: FakeRefund = {
          id: state.refunds.length + 1,
          orderId: data.orderId,
          paymentId: data.paymentId,
          refundNo: data.refundNo,
          amount: new Prisma.Decimal(data.amount),
          reason: data.reason,
          status: data.status,
          idempotencyKey: data.idempotencyKey,
          gatewayRefundNo: null,
          afterSalesCaseId: data.afterSalesCaseId ?? null,
        };
        state.refunds.push(refund);
        return refund;
      },
      updateMany: async ({ where, data }: any) => {
        const refund = state.refunds.find((item) => item.id === where.id);
        if (!refund || !matchesStatus(refund.status, where.status)) return { count: 0 };
        Object.assign(refund, data);
        state.refundUpdates += 1;
        return { count: 1 };
      },
    },
    order: {
      update: async ({ data }: any) => {
        Object.assign(state.order, data);
        return state.order;
      },
    },
    afterSalesCase: {
      findFirst: async ({ where }: any) =>
        state.afterSalesCases.find(
          (item) =>
            item.id === where.id &&
            (where.orderId === undefined || item.orderId === where.orderId) &&
            (where.type === undefined || item.type === where.type),
        ) ?? null,
      updateMany: async ({ where, data }: any) => {
        const item = state.afterSalesCases.find((candidate) => candidate.id === where.id);
        if (!item || !matchesStatus(item.status, where.status)) return { count: 0 };
        Object.assign(item, data);
        return { count: 1 };
      },
    },
  };
  const prisma: any = {
    ...tx,
    $transaction: async (callback: (client: any) => Promise<unknown>) => callback(tx),
  };
  const service = new RefundsService(
    prisma as PrismaService,
    { record: async (_tx: unknown, event: Record<string, unknown>) => state.events.push(event) } as never,
    { isRefundCreationEnabled: () => false } as never,
    { get: () => undefined } as never,
  );
  return { service, state };
}

const admin = { type: 'ADMIN' as const, id: 1 };

test('退款自动选择一笔足额原支付，不把一张退款跨多笔支付拆账', async () => {
  const { service, state } = createHarness([
    { id: 1, amount: new Prisma.Decimal(60), method: 'wechat', status: 'PAID' },
    { id: 2, amount: new Prisma.Decimal(100), method: 'wechat', status: 'PAID' },
  ], [
    {
      id: 1,
      orderId: 1,
      paymentId: 1,
      refundNo: 'RFD-OLD',
      amount: new Prisma.Decimal(20),
      reason: '旧退款',
      status: 'COMPLETED',
      idempotencyKey: 'old-refund',
      gatewayRefundNo: 'WX-OLD',
    },
  ]);

  const refund = await service.create({
    orderId: 1,
    amount: 80,
    reason: '退货',
    idempotencyKey: 'refund-new',
    operator: admin,
  });

  assert.equal(refund.paymentId, 2);
  assert.equal(state.refunds.length, 2);
});

test('退款同时受订单总额度和单笔原支付额度约束', async () => {
  const { service } = createHarness([
    { id: 1, amount: new Prisma.Decimal(60), method: 'wechat', status: 'PAID' },
    { id: 2, amount: new Prisma.Decimal(100), method: 'wechat', status: 'PAID' },
  ], [
    {
      id: 1,
      orderId: 1,
      paymentId: 1,
      refundNo: 'RFD-OLD',
      amount: new Prisma.Decimal(20),
      reason: '旧退款',
      status: 'COMPLETED',
      idempotencyKey: 'old-refund',
      gatewayRefundNo: 'WX-OLD',
    },
  ]);

  await assert.rejects(
    () => service.create({
      orderId: 1,
      paymentId: 1,
      amount: 50,
      reason: '超过该笔余额',
      idempotencyKey: 'refund-over-payment',
      operator: admin,
    }),
    BadRequestException,
  );
});

test('相同幂等键重复创建返回同一退款，不同金额复用该键则冲突', async () => {
  const existing: FakeRefund = {
    id: 7,
    orderId: 1,
    paymentId: 1,
    refundNo: 'RFD-IDEMPOTENT',
    amount: new Prisma.Decimal(20),
    reason: '重复请求',
    status: 'PENDING',
    idempotencyKey: 'refund-same',
    gatewayRefundNo: null,
  };
  const { service, state } = createHarness([
    { id: 1, amount: new Prisma.Decimal(100), method: 'wechat', status: 'PAID' },
  ], [existing]);

  const duplicate = await service.create({
    orderId: 1,
    amount: 20,
    reason: '重复请求',
    idempotencyKey: 'refund-same',
    operator: admin,
  });
  assert.equal(duplicate.id, 7);
  assert.equal(state.refunds.length, 1);

  await assert.rejects(
    () => service.create({
      orderId: 1,
      amount: 21,
      reason: '不同请求',
      idempotencyKey: 'refund-same',
      operator: admin,
    }),
    ConflictException,
  );
});

test('关联售后退款必须属于同订单、类型正确且累计不超过审核额度', async () => {
  const linkedRefund: FakeRefund = {
    id: 1,
    orderId: 1,
    paymentId: 1,
    refundNo: 'RFD-AS-OLD',
    amount: new Prisma.Decimal(20),
    reason: '售后首笔退款',
    status: 'COMPLETED',
    idempotencyKey: 'refund-as-old',
    gatewayRefundNo: 'BANK-AS-OLD',
    afterSalesCaseId: 9,
  };
  const { service, state } = createHarness(
    [{ id: 1, amount: new Prisma.Decimal(100), method: 'bank_transfer', status: 'PAID' }],
    [linkedRefund],
    [
      {
        id: 9,
        orderId: 1,
        type: 'REFUND',
        status: 'APPROVED',
        approvedRefundAmount: new Prisma.Decimal(50),
      },
      {
        id: 10,
        orderId: 1,
        type: 'REPAIR',
        status: 'APPROVED',
        approvedRefundAmount: null,
      },
    ],
  );

  await assert.rejects(
    () => service.create({
      orderId: 1,
      amount: 31,
      reason: '超过售后剩余额度',
      idempotencyKey: 'refund-as-over',
      afterSalesCaseId: 9,
      operator: admin,
    }),
    BadRequestException,
  );
  await assert.rejects(
    () => service.create({
      orderId: 1,
      amount: 10,
      reason: '维修工单错误关联',
      idempotencyKey: 'refund-as-repair',
      afterSalesCaseId: 10,
      operator: admin,
    }),
    BadRequestException,
  );

  const accepted = await service.create({
    orderId: 1,
    amount: 30,
    reason: '售后剩余额度退款',
    idempotencyKey: 'refund-as-rest',
    afterSalesCaseId: 9,
    operator: admin,
  });
  assert.equal(accepted.afterSalesCaseId, 9);
  assert.equal(state.refunds.length, 2);
});

test('在线支付退款不能由后台人工标记完成', async () => {
  const refund: FakeRefund = {
    id: 1,
    orderId: 1,
    paymentId: 1,
    refundNo: 'RFD-WECHAT',
    amount: new Prisma.Decimal(20),
    reason: '线上退款',
    status: 'APPROVED',
    idempotencyKey: 'refund-wechat',
    gatewayRefundNo: null,
  };
  const { service, state } = createHarness([
    { id: 1, amount: new Prisma.Decimal(100), method: 'wechat', status: 'PAID' },
  ], [refund]);

  await assert.rejects(
    () => service.execute(1, 'COMPLETED', 'MANUAL-1', admin),
    BadRequestException,
  );
  assert.equal(state.refunds[0].status, 'APPROVED');
  assert.equal(state.refundUpdates, 0);
});

test('线下退款按原 Payment 更新部分/全退状态，重复完成不会重复累计', async () => {
  const refunds: FakeRefund[] = [
    {
      id: 1,
      orderId: 1,
      paymentId: 1,
      refundNo: 'RFD-OLD',
      amount: new Prisma.Decimal(60),
      reason: '第一笔',
      status: 'COMPLETED',
      idempotencyKey: 'refund-old',
      gatewayRefundNo: 'BANK-OLD',
    },
    {
      id: 2,
      orderId: 1,
      paymentId: 1,
      refundNo: 'RFD-NEW',
      amount: new Prisma.Decimal(40),
      reason: '第二笔',
      status: 'APPROVED',
      idempotencyKey: 'refund-new',
      gatewayRefundNo: null,
    },
  ];
  const { service, state } = createHarness([
    { id: 1, amount: new Prisma.Decimal(100), method: 'bank_transfer', status: 'PAID' },
  ], refunds);

  await service.execute(2, 'COMPLETED', 'BANK-NEW', admin);
  assert.equal(state.payments[0].status, 'REFUNDED');
  assert.equal(Number(state.order.refundedAmount), 100);
  const updateCount = state.refundUpdates;

  await service.execute(2, 'COMPLETED', 'BANK-NEW', admin);
  assert.equal(state.refundUpdates, updateCount);
  assert.equal(Number(state.order.refundedAmount), 100);
});

test('关联退款达到审核额度后在同一事务闭合退款类售后工单', async () => {
  const linkedRefund: FakeRefund = {
    id: 1,
    orderId: 1,
    paymentId: 1,
    refundNo: 'RFD-AS-COMPLETE',
    amount: new Prisma.Decimal(40),
    reason: '退货退款',
    status: 'APPROVED',
    idempotencyKey: 'refund-as-complete',
    gatewayRefundNo: null,
    afterSalesCaseId: 9,
  };
  const { service, state } = createHarness(
    [{ id: 1, amount: new Prisma.Decimal(100), method: 'bank_transfer', status: 'PAID' }],
    [linkedRefund],
    [{
      id: 9,
      orderId: 1,
      type: 'REFUND',
      status: 'APPROVED',
      approvedRefundAmount: new Prisma.Decimal(40),
    }],
  );

  await service.execute(1, 'COMPLETED', 'BANK-AS-COMPLETE', admin);

  assert.equal(state.afterSalesCases[0].status, 'COMPLETED');
  assert.equal(
    state.events.some(
      (event) =>
        event.eventType === 'AFTER_SALES_STATUS_CHANGED' &&
        event.toStatus === 'COMPLETED',
    ),
    true,
  );
});
