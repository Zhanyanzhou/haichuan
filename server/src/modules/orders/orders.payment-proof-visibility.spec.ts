import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from './orders.service';
import { TradeEventsService } from '../trade-events/trade-events.service';

const ORDER = {
  id: 9,
  orderNo: 'ORD-TEST-9',
  customerId: 7,
  status: 'PENDING_PAYMENT',
  paidAmount: 0,
  finalAmount: 100,
};

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

function buildTx() {
  return {
    $queryRaw: async () => [{ id: 9 }],
    order: {
      // 同一 mock 同时服务归属校验（select id）与 expireReservationIfNeeded（include payments）。
      findFirst: async () => ({
        ...ORDER,
        reservedAt: null,
        payments: [],
      }),
      findUnique: async () => ORDER,
      update: async () => ({}),
    },
    payment: {
      findFirst: async () => null,
      create: async () => PAYMENT_FULL,
    },
    inventoryReservation: { findMany: async () => [] },
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

  const result = (await service.submitOfflinePaymentProof(
    7,
    9,
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
