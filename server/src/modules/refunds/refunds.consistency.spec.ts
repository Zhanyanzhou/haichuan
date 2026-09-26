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
    operations: [] as string[],
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
    $queryRaw: async () => {
      state.operations.push('raw-lock');
      return [{ id: 1 }];
    },
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
        state.operations.push('refund-find');
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
    tradeEvent: {
      findFirst: async ({ where }: any) =>
        [...state.events].reverse().find(
          (event) =>
            event.entityType === where.entityType &&
            event.entityId === where.entityId &&
            event.eventType === where.eventType,
        ) ?? null,
    },
  };
  const prisma: any = {
    ...tx,
    $transaction: async (callback: (client: any) => Promise<unknown>) => callback(tx),
  };
  const service = new RefundsService(
    prisma as PrismaService,
    {
      record: async (_tx: unknown, event: Record<string, any>) => state.events.push({
        ...event,
        operatorId: event.operator?.id ?? null,
      }),
    } as never,
    { isRefundCreationEnabled: () => false } as never,
    { get: () => undefined } as never,
  );
  return { service, state };
}

const admin = {
  id: 1,
  username: 'admin',
  realName: '管理员',
  role: 'ADMIN',
  status: 'ACTIVE',
} as any;

test('分期退款预检按原付款扣除占用额度并标明定金与尾款', async () => {
  const prisma = {
    order: {
      findUnique: async () => ({
        id: 1,
        orderNo: 'ORD-INSTALLMENT-1',
        status: 'SHIPPED',
        orderType: 'CUSTOM',
        currency: 'CNY',
        quotationVersionId: 7,
        paymentPlans: [{ id: 10 }],
        payments: [
          {
            id: 11,
            paymentNo: 'PAY-DEPOSIT-30',
            amount: new Prisma.Decimal(30),
            method: 'wechat',
            status: 'PAID',
            type: 'DEPOSIT',
            paidAt: new Date('2026-09-01T00:00:00.000Z'),
            createdAt: new Date('2026-09-01T00:00:00.000Z'),
            installment: {
              label: '定金',
              sequence: 1,
              paymentPlan: {
                status: 'COMPLETED',
                installments: [{ status: 'PAID' }, { status: 'PAID' }],
              },
            },
          },
          {
            id: 12,
            paymentNo: 'PAY-BALANCE-70',
            amount: new Prisma.Decimal(70),
            method: 'bank_transfer',
            status: 'PARTIAL_REFUND',
            type: 'BALANCE',
            paidAt: new Date('2026-09-02T00:00:00.000Z'),
            createdAt: new Date('2026-09-02T00:00:00.000Z'),
            installment: {
              label: '尾款',
              sequence: 2,
              paymentPlan: {
                status: 'COMPLETED',
                installments: [{ status: 'PAID' }, { status: 'PAID' }],
              },
            },
          },
        ],
        refunds: [
          { paymentId: 11, amount: new Prisma.Decimal(5) },
          { paymentId: 12, amount: new Prisma.Decimal(20) },
        ],
      }),
    },
  };
  const tx = {
    ...prisma,
    $queryRaw: async () => [{ id: admin.id, username: 'admin' }],
  };
  const service = new RefundsService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );

  const result = await service.getCreateEligibility(1, admin);

  assert.equal(result.totalAvailableRefundAmount, '75.00');
  assert.deepEqual(
    result.payments.map((payment) => ({
      id: payment.id,
      label: payment.installmentLabel,
      available: payment.availableRefundAmount,
      eligible: payment.eligible,
    })),
    [
      { id: 11, label: '定金', available: '25.00', eligible: true },
      { id: 12, label: '尾款', available: '50.00', eligible: true },
    ],
  );
});

test('分期未全部实收或未发货时预检保留原付款事实但失败关闭退款选择', async () => {
  const prisma = {
    order: {
      findUnique: async () => ({
        id: 2,
        orderNo: 'ORD-INSTALLMENT-BLOCKED',
        status: 'PENDING_SHIP',
        orderType: 'CUSTOM',
        currency: 'CNY',
        quotationVersionId: 8,
        paymentPlans: [{ id: 20 }],
        payments: [{
          id: 21,
          paymentNo: 'PAY-DEPOSIT-BLOCKED',
          amount: new Prisma.Decimal(30),
          method: 'wechat',
          status: 'PAID',
          type: 'DEPOSIT',
          paidAt: new Date('2026-09-01T00:00:00.000Z'),
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          installment: {
            label: '定金',
            sequence: 1,
            paymentPlan: {
              status: 'ACTIVE',
              installments: [{ status: 'PAID' }, { status: 'PENDING' }],
            },
          },
        }],
        refunds: [],
      }),
    },
  };
  const tx = {
    ...prisma,
    $queryRaw: async () => [{ id: admin.id, username: 'admin' }],
  };
  const service = new RefundsService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );

  const result = await service.getCreateEligibility(2, admin);

  assert.equal(result.totalAvailableRefundAmount, '0.00');
  assert.equal(result.payments[0].eligible, false);
  assert.match(result.payments[0].reason ?? '', /尚未全部实收并进入已发货阶段/);
});

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
  assert.deepEqual(
    state.operations.slice(0, 3),
    ['raw-lock', 'raw-lock', 'refund-find'],
    '退款创建必须先锁员工与订单，再建立幂等及额度读取快照',
  );

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

test('关联售后在退款审核前失效时拒绝继续推进', async () => {
  const refund: FakeRefund = {
    id: 1,
    orderId: 1,
    paymentId: 1,
    refundNo: 'RFD-AS-CANCELLED',
    amount: new Prisma.Decimal(30),
    reason: '售后退款',
    status: 'PENDING',
    idempotencyKey: 'refund-as-cancelled',
    gatewayRefundNo: null,
    afterSalesCaseId: 9,
  };
  const { service, state } = createHarness(
    [{ id: 1, amount: new Prisma.Decimal(100), method: 'bank_transfer', status: 'PAID' }],
    [refund],
    [{
      id: 9,
      orderId: 1,
      type: 'REFUND',
      status: 'CANCELLED',
      approvedRefundAmount: new Prisma.Decimal(30),
    }],
  );

  await assert.rejects(
    () => service.review(1, 'APPROVED', '同意', admin),
    BadRequestException,
  );
  assert.equal(state.refunds[0].status, 'PENDING');
});

test('退款审核响应丢失后同管理员同动作同备注重放为零写恢复', async () => {
  const refund: FakeRefund = {
    id: 1,
    orderId: 1,
    paymentId: 1,
    refundNo: 'RFD-REVIEW-REPLAY',
    amount: new Prisma.Decimal(20),
    reason: '审核恢复测试',
    status: 'PENDING',
    idempotencyKey: 'refund-review-replay',
    gatewayRefundNo: null,
  };
  const { service, state } = createHarness([
    { id: 1, amount: new Prisma.Decimal(100), method: 'bank_transfer', status: 'PAID' },
  ], [refund]);

  await service.review(1, 'APPROVED', '同意退款', admin);
  const updateCount = state.refundUpdates;
  const eventCount = state.events.length;

  const replayed = await service.review(1, 'APPROVED', ' 同意退款 ', admin);
  assert.equal((replayed as FakeRefund | null)?.status, 'APPROVED');
  assert.equal(state.refundUpdates, updateCount);
  assert.equal(state.events.length, eventCount);

  await assert.rejects(
    () => service.review(1, 'APPROVED', '改变备注', admin),
    BadRequestException,
  );
  await assert.rejects(
    () => service.review(1, 'REJECTED', '同意退款', admin),
    BadRequestException,
  );
});

test('退款拒绝审核同管理员同备注重放不重复写事件', async () => {
  const refund: FakeRefund = {
    id: 1,
    orderId: 1,
    paymentId: 1,
    refundNo: 'RFD-REJECT-REPLAY',
    amount: new Prisma.Decimal(20),
    reason: '拒绝恢复测试',
    status: 'PENDING',
    idempotencyKey: 'refund-reject-replay',
    gatewayRefundNo: null,
  };
  const { service, state } = createHarness([
    { id: 1, amount: new Prisma.Decimal(100), method: 'bank_transfer', status: 'PAID' },
  ], [refund]);

  await service.review(1, 'REJECTED', '资料不完整', admin);
  const updateCount = state.refundUpdates;
  const eventCount = state.events.length;
  const replayed = await service.review(1, 'REJECTED', '资料不完整', admin);

  assert.equal((replayed as FakeRefund | null)?.status, 'REJECTED');
  assert.equal(state.refundUpdates, updateCount);
  assert.equal(state.events.length, eventCount);
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

test('线下退款执行失败必须填写失败原因，且原因进入交易时间线而非冒充流水号', async () => {
  const refund: FakeRefund = {
    id: 1,
    orderId: 1,
    paymentId: 1,
    refundNo: 'RFD-FAILED',
    amount: new Prisma.Decimal(20),
    reason: '退款测试',
    status: 'APPROVED',
    idempotencyKey: 'refund-failed',
    gatewayRefundNo: null,
  };
  const { service, state } = createHarness([
    { id: 1, amount: new Prisma.Decimal(100), method: 'bank_transfer', status: 'PAID' },
  ], [refund]);

  await assert.rejects(
    () => service.execute(1, 'FAILED', undefined, admin),
    BadRequestException,
  );
  await service.execute(1, 'FAILED', undefined, admin, '银行退回请求超时');
  assert.equal(state.refunds[0].status, 'APPROVED');
  assert.equal(state.events.at(-1)?.reason, '银行退回请求超时');

  const updateCount = state.refundUpdates;
  const eventCount = state.events.length;
  await service.execute(1, 'FAILED', undefined, admin, ' 银行退回请求超时 ');
  assert.equal(state.refundUpdates, updateCount);
  assert.equal(state.events.length, eventCount);

  await service.execute(1, 'FAILED', undefined, admin, '银行账户信息有误');
  assert.equal(state.refundUpdates, updateCount + 1);
  assert.equal(state.events.length, eventCount + 1);
  assert.equal(state.events.at(-1)?.reason, '银行账户信息有误');
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
