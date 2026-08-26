import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RefundsService } from './refunds.service';

function matchesStatus(value: string, condition: any) {
  if (typeof condition === 'string') return value === condition;
  if (condition?.in) return condition.in.includes(value);
  return true;
}

function createOnlineHarness(options?: {
  refundStatus?: string;
  refundEnabled?: boolean;
}) {
  const payment = {
    id: 7,
    orderId: 9,
    paymentNo: 'PAY-WX-9',
    gatewayTradeNo: 'WX-TRADE-9',
    amount: new Prisma.Decimal(100),
    method: 'wechat',
    status: 'PAID',
    paidAt: new Date(),
    createdAt: new Date(),
  };
  const refund: any = {
    id: 3,
    orderId: 9,
    paymentId: 7,
    refundNo: 'RFD-WX-3',
    amount: new Prisma.Decimal(40),
    reason: '客户退货',
    status: options?.refundStatus ?? 'PENDING',
    gatewayRefundNo: null,
    idempotencyKey: 'refund-wx-3',
  };
  const state = {
    payment,
    refund,
    order: { id: 9, refundedAmount: new Prisma.Decimal(0) },
    events: [] as Array<Record<string, any>>,
    createCalls: [] as Array<Record<string, any>>,
  };

  const refundView = (includePayment = false) => ({
    ...state.refund,
    ...(includePayment ? { payment: state.payment } : {}),
  });
  const tx: any = {
    $queryRaw: async () => [{ id: 9 }],
    refund: {
      findUnique: async ({ where, include }: any) => {
        if (where.id !== undefined && where.id !== state.refund.id) return null;
        if (where.refundNo !== undefined && where.refundNo !== state.refund.refundNo) return null;
        return refundView(Boolean(include?.payment));
      },
      findMany: async ({ where }: any) => {
        const sameOrder = where.orderId === undefined || where.orderId === state.refund.orderId;
        const samePayment = where.paymentId === undefined || where.paymentId === state.refund.paymentId;
        const notExcluded = where.id?.not === undefined || where.id.not !== state.refund.id;
        return sameOrder && samePayment && notExcluded && matchesStatus(state.refund.status, where.status)
          ? [{ amount: state.refund.amount }]
          : [];
      },
      updateMany: async ({ where, data }: any) => {
        if (where.id !== state.refund.id || !matchesStatus(state.refund.status, where.status)) {
          return { count: 0 };
        }
        Object.assign(state.refund, data);
        return { count: 1 };
      },
      update: async ({ data }: any) => {
        Object.assign(state.refund, data);
        return refundView();
      },
    },
    payment: {
      findMany: async ({ where }: any) =>
        where.orderId === state.payment.orderId && matchesStatus(state.payment.status, where.status)
          ? [{ amount: state.payment.amount }]
          : [],
      findFirst: async ({ where }: any) =>
        where.id === state.payment.id && where.orderId === state.payment.orderId
          ? { amount: state.payment.amount }
          : null,
      update: async ({ data }: any) => {
        Object.assign(state.payment, data);
        return state.payment;
      },
    },
    order: {
      update: async ({ data }: any) => {
        Object.assign(state.order, data);
        return state.order;
      },
    },
  };
  const prisma: any = {
    ...tx,
    $transaction: async (callback: (client: any) => Promise<unknown>) => callback(tx),
  };
  const gateway: any = {
    isRefundCreationEnabled: () => options?.refundEnabled ?? true,
    isRefundAvailable: () => options?.refundEnabled ?? true,
    createRefund: async (_provider: string, params: Record<string, any>) => {
      state.createCalls.push(params);
      return {
        provider: 'wechat',
        refundNo: params.refundNo,
        gatewayRefundNo: 'WX-REFUND-3',
        paymentNo: params.paymentNo,
        gatewayTradeNo: params.gatewayTradeNo,
        state: 'PROCESSING',
        refundAmountYuan: params.refundAmountYuan,
        totalAmountYuan: params.totalAmountYuan,
        raw: { status: 'PROCESSING' },
      };
    },
  };
  const service = new RefundsService(
    prisma as PrismaService,
    {
      record: async (_client: unknown, event: Record<string, any>) => {
        state.events.push(event);
      },
    } as never,
    gateway,
    {
      get: (key: string) => key === 'SITE_BASE_URL' ? 'https://shop.example.test' : undefined,
    } as never,
  );
  return { service, state, gateway };
}

test('在线退款审核通过后自动按原退款单号发起，渠道受理只进入 PROCESSING', async () => {
  const { service, state } = createOnlineHarness();

  const result: any = await service.review(
    3,
    'APPROVED',
    '审核通过',
    { type: 'ADMIN', id: 1 },
  );

  assert.equal(state.createCalls.length, 1);
  assert.equal(state.createCalls[0].refundNo, 'RFD-WX-3');
  assert.equal(state.createCalls[0].gatewayTradeNo, 'WX-TRADE-9');
  assert.equal(state.createCalls[0].refundAmountYuan, '40.00');
  assert.equal(state.createCalls[0].totalAmountYuan, '100.00');
  assert.equal(state.refund.status, 'PROCESSING');
  assert.equal(state.refund.gatewayRefundNo, 'WX-REFUND-3');
  assert.equal(result.channelAction.state, 'PROCESSING');
  assert.equal(state.events.some((event) => event.eventType === 'REFUND_COMPLETED'), false);
});

test('真实退款门禁关闭时审核保留 APPROVED，且不调用渠道', async () => {
  const { service, state } = createOnlineHarness({ refundEnabled: false });

  const result: any = await service.review(
    3,
    'APPROVED',
    undefined,
    { type: 'ADMIN', id: 1 },
  );

  assert.equal(state.refund.status, 'APPROVED');
  assert.equal(state.createCalls.length, 0);
  assert.equal(result.channelAction.state, 'DISABLED');
  await assert.rejects(
    () => service.startOnlineRefund(3, { type: 'ADMIN', id: 1 }),
    ServiceUnavailableException,
  );
});

test('主动查询 SUCCESS 后才完成退款，并同步原 Payment 与订单累计退款额', async () => {
  const { service, state, gateway } = createOnlineHarness({ refundStatus: 'PROCESSING' });
  state.refund.gatewayRefundNo = 'WX-REFUND-3';
  gateway.queryRefund = async () => ({
    provider: 'wechat',
    refundNo: 'RFD-WX-3',
    gatewayRefundNo: 'WX-REFUND-3',
    paymentNo: 'PAY-WX-9',
    gatewayTradeNo: 'WX-TRADE-9',
    state: 'SUCCESS',
    refundAmountYuan: '40.00',
    totalAmountYuan: '100.00',
    raw: { status: 'SUCCESS' },
  });

  const result = await service.queryOnlineRefund(3);

  assert.equal(result.state, 'SUCCESS');
  assert.equal(state.refund.status, 'COMPLETED');
  assert.equal(state.payment.status, 'PARTIAL_REFUND');
  assert.equal(Number(state.order.refundedAmount), 40);
  assert.equal(state.events.filter((event) => event.eventType === 'REFUND_COMPLETED').length, 1);
});

test('重复成功退款通知保持幂等，金额不符的通知拒绝核销', async () => {
  const { service, state, gateway } = createOnlineHarness({ refundStatus: 'PROCESSING' });
  const verified = {
    verified: true,
    refundNo: 'RFD-WX-3',
    gatewayRefundNo: 'WX-REFUND-3',
    paymentNo: 'PAY-WX-9',
    gatewayTradeNo: 'WX-TRADE-9',
    state: 'SUCCESS',
    refundAmountYuan: '40.00',
    totalAmountYuan: '100.00',
    raw: { event_type: 'REFUND.SUCCESS' },
  };
  gateway.verifyRefundNotification = async () => verified;

  assert.deepEqual(
    await service.settleOnlineRefundNotification('wechat', {}, '{}'),
    { ok: true },
  );
  assert.deepEqual(
    await service.settleOnlineRefundNotification('wechat', {}, '{}'),
    { ok: true },
  );
  assert.equal(state.events.filter((event) => event.eventType === 'REFUND_COMPLETED').length, 1);

  const mismatch = createOnlineHarness({ refundStatus: 'PROCESSING' });
  mismatch.gateway.verifyRefundNotification = async () => ({
    ...verified,
    refundAmountYuan: '41.00',
  });
  assert.deepEqual(
    await mismatch.service.settleOnlineRefundNotification('wechat', {}, '{}'),
    { ok: false },
  );
  assert.equal(mismatch.state.refund.status, 'PROCESSING');
});
