import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from './payments.service';

const config = {
  get: (key: string) =>
    key === 'SITE_BASE_URL' ? 'https://shop.example.test' : undefined,
} as ConfigService;

test('客户不能为不属于自己的订单创建支付交易', async () => {
  let gatewayCalls = 0;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    order: {
      findUnique: async () => ({
        id: 9,
        customerId: 8,
        orderNo: 'ORD-9',
        status: 'PENDING_PAYMENT',
        finalAmount: 100,
      }),
    },
  };
  const service = new PaymentsService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    {} as OrdersService,
    {
      isTransactionCreationEnabled: () => true,
      isAvailable: () => true,
      createPayment: async () => {
        gatewayCalls += 1;
      },
    } as never,
    config,
  );

  await assert.rejects(
    () => service.createCustomerPayment(7, 9, { scene: 'native' }),
    NotFoundException,
  );
  assert.equal(gatewayCalls, 0);
});

test('手机客户复用同一待支付商户单号，并由服务端传递 H5 场景和真实 IP', async () => {
  let captured: Record<string, unknown> | undefined;
  let localCreates = 0;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    order: {
      findUnique: async () => ({
        id: 9,
        customerId: 7,
        orderNo: 'ORD-9',
        status: 'PENDING_PAYMENT',
        finalAmount: 100,
      }),
      update: async () => undefined,
    },
    payment: {
      findFirst: async () => ({
        id: 3,
        paymentNo: 'PAY-9',
        amount: 100,
        method: 'wechat',
        status: 'PENDING',
      }),
      findMany: async () => [],
      create: async () => {
        localCreates += 1;
      },
    },
    inventoryReservation: {
      findFirst: async () => ({ expiresAt: new Date(Date.now() + 60_000) }),
    },
  };
  const service = new PaymentsService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    {} as OrdersService,
    {
      isTransactionCreationEnabled: () => true,
      isAvailable: () => true,
      createPayment: async (_provider: string, params: Record<string, unknown>) => {
        captured = params;
        return {
          provider: 'wechat',
          scene: 'h5',
          payUrl: 'https://wx.example/h5?prepay=1',
        };
      },
    } as never,
    config,
  );

  const result = await service.createCustomerPayment(7, 9, {
    scene: 'h5',
    clientIp: '203.0.113.10',
    h5Type: 'Android',
  });

  assert.equal(captured?.paymentNo, 'PAY-9');
  assert.equal(captured?.scene, 'h5');
  assert.equal(captured?.clientIp, '203.0.113.10');
  assert.equal(localCreates, 0);
  assert.equal(result.reused, true);
  assert.match(result.payUrl || '', /redirect_url=/);
});

test('客户主动查单确认 SUCCESS 时复用回调核销管线', async () => {
  let approvedPaymentId: number | null = null;
  const payment = {
    id: 3,
    paymentNo: 'PAY-9',
    orderId: 9,
    amount: 100,
    method: 'wechat',
    status: 'PENDING',
  };
  const service = new PaymentsService(
    {
      order: {
        findFirst: async () => ({ id: 9, orderNo: 'ORD-9', status: 'PENDING_PAYMENT' }),
      },
      payment: {
        findFirst: async () => payment,
        findUnique: async () => payment,
      },
    } as unknown as PrismaService,
    {
      confirmPaymentSettlement: async (paymentId: number) => {
        approvedPaymentId = paymentId;
      },
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

  const result = await service.queryCustomerPayment(7, 9);
  assert.equal(result.state, 'PAID');
  assert.equal(approvedPaymentId, 3);
});

test('客户关单会先查单，只有 NOTPAY 才关闭渠道并把本地交易置为 FAILED', async () => {
  let closedPaymentNo: string | null = null;
  let failedPaymentId: number | null = null;
  const payment = {
    id: 3,
    paymentNo: 'PAY-9',
    orderId: 9,
    amount: 100,
    method: 'wechat',
    status: 'PENDING',
  };
  const service = new PaymentsService(
    {
      order: {
        findFirst: async () => ({ id: 9, orderNo: 'ORD-9', status: 'PENDING_PAYMENT' }),
      },
      payment: {
        findFirst: async () => payment,
        updateMany: async ({ where }: { where: { id: number } }) => {
          failedPaymentId = where.id;
          return { count: 1 };
        },
      },
    } as unknown as PrismaService,
    {} as OrdersService,
    {
      queryPayment: async () => ({
        provider: 'wechat',
        paymentNo: 'PAY-9',
        state: 'NOTPAY',
        raw: { trade_state: 'NOTPAY' },
      }),
      closePayment: async (_provider: string, paymentNo: string) => {
        closedPaymentNo = paymentNo;
      },
    } as never,
    config,
  );

  const result = await service.closeCustomerPayment(7, 9);
  assert.equal(result.state, 'FAILED');
  assert.equal(closedPaymentNo, 'PAY-9');
  assert.equal(failedPaymentId, 3);
});
