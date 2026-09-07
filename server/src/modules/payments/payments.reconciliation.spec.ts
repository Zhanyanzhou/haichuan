import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from './payments.service';

const config = {
  get: (key: string) =>
    key === 'SITE_BASE_URL' ? 'https://shop.example.test' : undefined,
} as ConfigService;

function buildPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    paymentNo: 'PAY-9',
    orderId: 9,
    amount: 100,
    method: 'wechat',
    status: 'PENDING',
    ...overrides,
  };
}

test('掉单兜底 cron 对超时 PENDING 微信交易主动查单并复用核销管线', async () => {
  const payment = buildPayment();
  let settledPaymentId: number | null = null;
  let queriedPaymentNo: string | null = null;
  const service = new PaymentsService(
    {
      payment: {
        findMany: async () => [payment],
        findUnique: async () => payment,
        findFirst: async () => null,
        updateMany: async () => ({ count: 1 }),
      },
    } as unknown as PrismaService,
    {
      confirmPaymentSettlement: async (paymentId: number) => {
        settledPaymentId = paymentId;
      },
    } as unknown as OrdersService,
    {
      queryPayment: async (_provider: string, paymentNo: string) => {
        queriedPaymentNo = paymentNo;
        return {
          provider: 'wechat',
          paymentNo,
          gatewayTradeNo: 'WX-9',
          state: 'SUCCESS',
          amountYuan: '100.00',
          raw: { trade_state: 'SUCCESS' },
        };
      },
    } as never,
    config,
  );

  await service.reconcilePendingOnlinePayments();

  assert.equal(queriedPaymentNo, 'PAY-9');
  assert.equal(settledPaymentId, 3);
});

test('掉单兜底单笔查单异常不阻断同批其余交易', async () => {
  const payments = [buildPayment({ id: 1, paymentNo: 'PAY-BAD' }), buildPayment({ id: 2, paymentNo: 'PAY-OK' })];
  const settled: number[] = [];
  const service = new PaymentsService(
    {
      payment: {
        findMany: async () => payments,
        findFirst: async () => null,
        findUnique: async ({ where }: { where: { id?: number; paymentNo?: string } }) => {
          if (where.paymentNo) return payments.find((candidate) => candidate.paymentNo === where.paymentNo);
          return payments.find((candidate) => candidate.id === where.id);
        },
        updateMany: async () => ({ count: 1 }),
      },
    } as unknown as PrismaService,
    {
      confirmPaymentSettlement: async (paymentId: number) => {
        settled.push(paymentId);
      },
    } as unknown as OrdersService,
    {
      queryPayment: async (_provider: string, paymentNo: string) => {
        if (paymentNo === 'PAY-BAD') throw new Error('渠道网络异常');
        return {
          provider: 'wechat',
          paymentNo,
          gatewayTradeNo: `WX-${paymentNo}`,
          state: 'SUCCESS',
          amountYuan: '100.00',
          raw: { trade_state: 'SUCCESS' },
        };
      },
    } as never,
    config,
  );

  await service.reconcilePendingOnlinePayments();

  assert.deepEqual(settled, [2]);
});

test('人工查单拒绝线下付款与支付宝，微信 FAILED 交易仍可查单核销', async () => {
  const service = new PaymentsService(
    {
      payment: {
        findFirst: async () => null,
        findUnique: async ({ where }: { where: { id?: number; paymentNo?: string } }) => {
          if (where.id === 1) return buildPayment({ id: 1, method: 'bank_transfer' });
          if (where.id === 2) return buildPayment({ id: 2, method: 'alipay' });
          if (where.id === 3) return buildPayment({ id: 3, status: 'FAILED' });
          if (where.id === 4) return buildPayment({ id: 4, status: 'PAID' });
          if (where.paymentNo === 'PAY-9') return buildPayment({ id: 3, status: 'FAILED' });
          return null;
        },
        updateMany: async () => ({ count: 1 }),
      },
    } as unknown as PrismaService,
    {
      confirmPaymentSettlement: async () => undefined,
    } as unknown as OrdersService,
    {
      queryPayment: async () => ({
        provider: 'wechat',
        paymentNo: 'PAY-9',
        gatewayTradeNo: 'WX-9',
        state: 'SUCCESS',
        amountYuan: '100.00',
        raw: { trade_state: 'SUCCESS' },
      }),
    } as never,
    config,
  );

  await assert.rejects(() => service.queryChannelPayment(1), BadRequestException);
  await assert.rejects(() => service.queryChannelPayment(2), BadRequestException);
  await assert.rejects(() => service.queryChannelPayment(99), NotFoundException);

  const recovered = await service.queryChannelPayment(3);
  assert.equal(recovered.state, 'PAID');
  assert.equal(recovered.gatewayState, 'SUCCESS');

  const alreadyPaid = await service.queryChannelPayment(4);
  assert.equal(alreadyPaid.state, 'PAID');
  assert.equal(alreadyPaid.gatewayState, null);
});
