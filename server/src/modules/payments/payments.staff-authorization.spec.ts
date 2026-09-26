import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

const admin = {
  id: 51,
  username: 'payment-admin',
  realName: '付款管理员',
  role: 'ADMIN',
  status: 'ACTIVE',
} as StaffPrincipal;

function revokedOrdersHarness() {
  const state = { domainReads: 0, domainWrites: 0 };
  const domainRead = async () => {
    state.domainReads += 1;
    return null;
  };
  const tx: any = {
    $queryRaw: async () => [],
    payment: {
      findUnique: domainRead,
      findFirst: domainRead,
      findMany: domainRead,
      create: async () => {
        state.domainWrites += 1;
        return null;
      },
      updateMany: async () => {
        state.domainWrites += 1;
        return { count: 0 };
      },
    },
    order: { findUnique: domainRead },
  };
  const prisma: any = {
    ...tx,
    $transaction: async (callback: (client: any) => Promise<unknown>) => callback(tx),
  };
  const service = new OrdersService(
    prisma as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, state };
}

test('付款审核、驳回和手工收款在首个领域读取前复核当前员工', async () => {
  const attempts: Array<(service: OrdersService) => Promise<unknown>> = [
    (service) => service.confirmPaymentSettlement(
      7,
      admin.id,
      '确认到账',
      undefined,
      undefined,
      { staffPrincipal: admin, staffAuthorization: 'PAYMENT_ADMIN' },
    ),
    (service) => service.failPendingPaymentAttempt(
      7,
      '凭证不匹配',
      { type: 'ADMIN', id: admin.id },
      {
        reviewerId: admin.id,
        expectedMethod: 'bank_transfer',
        staffPrincipal: admin,
        staffAuthorization: 'PAYMENT_ADMIN',
      },
    ),
    (service) => service.recordManualReceipt({
      orderId: 9,
      amount: 30,
      method: 'bank_transfer',
      type: 'DEPOSIT',
      idempotencyKey: 'staff-receipt-authorization',
      staffPrincipal: admin,
    }),
  ];

  for (const attempt of attempts) {
    const { service, state } = revokedOrdersHarness();
    await assert.rejects(() => attempt(service), ForbiddenException);
    assert.equal(state.domainReads, 0);
    assert.equal(state.domainWrites, 0);
  }
});

function revokedPaymentsHarness() {
  const state = { domainReads: 0, gatewayCalls: 0 };
  const tx: any = {
    $queryRaw: async () => [],
    payment: {
      findUnique: async () => {
        state.domainReads += 1;
        return null;
      },
      findMany: async () => {
        state.domainReads += 1;
        return [];
      },
      count: async () => {
        state.domainReads += 1;
        return 0;
      },
    },
  };
  const prisma: any = {
    payment: tx.payment,
    $transaction: async (callback: (client: any) => Promise<unknown>) => callback(tx),
  };
  const gateway: any = {
    isTransactionCreationEnabled: () => true,
    isAvailable: () => true,
    createPayment: async () => {
      state.gatewayCalls += 1;
      return null;
    },
    queryPayment: async () => {
      state.gatewayCalls += 1;
      return null;
    },
  };
  const service = new PaymentsService(
    prisma as PrismaService,
    {} as OrdersService,
    gateway,
    { get: () => 'https://shop.example.test' } as never,
  );
  return { service, state };
}

test('后台预下单与人工查单在订单或付款读取前拒绝已撤权员工', async () => {
  for (const attempt of [
    (service: PaymentsService) => service.createChannelPayment(9, 'wechat', admin),
    (service: PaymentsService) => service.queryChannelPayment(7, admin),
  ]) {
    const { service, state } = revokedPaymentsHarness();
    await assert.rejects(() => attempt(service), ForbiddenException);
    assert.equal(state.domainReads, 0);
    assert.equal(state.gatewayCalls, 0);
  }
});

test('付款列表与详情在首个付款读取前拒绝已撤权员工', async () => {
  for (const attempt of [
    (service: PaymentsService) => service.findAll({}, admin),
    (service: PaymentsService) => service.findById(7, admin),
  ]) {
    const { service, state } = revokedPaymentsHarness();
    await assert.rejects(() => attempt(service), ForbiddenException);
    assert.equal(state.domainReads, 0);
    assert.equal(state.gatewayCalls, 0);
  }
});

test('获准员工在员工锁内读取付款列表与详情', async () => {
  const sequence: string[] = [];
  const payment = { id: 7, paymentNo: 'PAY-7' };
  const tx: any = {
    $queryRaw: async () => {
      sequence.push('staff-lock');
      return [{ id: admin.id, username: admin.username, realName: admin.realName }];
    },
    payment: {
      findMany: async () => {
        sequence.push('list-read');
        return [payment];
      },
      count: async () => {
        sequence.push('count-read');
        return 1;
      },
      findUnique: async () => {
        sequence.push('detail-read');
        return payment;
      },
    },
  };
  const service = new PaymentsService(
    {
      $transaction: async (callback: (client: any) => Promise<unknown>) => callback(tx),
    } as PrismaService,
    {} as OrdersService,
    {} as never,
    {} as never,
  );

  const list = await service.findAll({}, admin);
  const detail = await service.findById(7, admin);

  assert.deepEqual(list, { list: [payment], total: 1, page: 1, pageSize: 20 });
  assert.equal(detail, payment);
  assert.deepEqual(sequence, [
    'staff-lock',
    'list-read',
    'count-read',
    'staff-lock',
    'detail-read',
  ]);
});

test('人工查单外调返回后员工撤权时不核销或写对账备注', async () => {
  const sequence: string[] = [];
  let staffLocks = 0;
  let writes = 0;
  const payment = {
    id: 7,
    paymentNo: 'PAY-7',
    amount: 100,
    method: 'wechat',
    status: 'PENDING',
    gatewayTradeNo: null,
  };
  const tx: any = {
    $queryRaw: async () => {
      staffLocks += 1;
      sequence.push('staff-lock');
      return staffLocks <= 2
        ? [{ id: admin.id, username: admin.username, realName: admin.realName }]
        : [];
    },
    payment: {
      findUnique: async () => {
        sequence.push('payment-read');
        return payment;
      },
      updateMany: async () => {
        writes += 1;
        return { count: 1 };
      },
    },
  };
  const prisma: any = {
    payment: tx.payment,
    $transaction: async (callback: (client: any) => Promise<unknown>) => callback(tx),
  };
  let settlementCalls = 0;
  const service = new PaymentsService(
    prisma as PrismaService,
    {
      confirmPaymentSettlement: async () => {
        settlementCalls += 1;
      },
    } as unknown as OrdersService,
    {
      queryPayment: async () => {
        sequence.push('gateway-query');
        return {
          state: 'SUCCESS',
          gatewayTradeNo: 'WX-7',
          amountYuan: '100.00',
          raw: {},
        };
      },
    } as never,
    {} as never,
  );

  await assert.rejects(() => service.queryChannelPayment(7, admin), ForbiddenException);

  assert.deepEqual(sequence.slice(0, 5), [
    'staff-lock',
    'payment-read',
    'staff-lock',
    'gateway-query',
    'staff-lock',
  ]);
  assert.equal(settlementCalls, 0);
  assert.equal(writes, 0);
});

test('付款控制器把完整员工 principal 传入全部私有读取与后台动作', async () => {
  const received: unknown[] = [];
  const controller = new PaymentsController({
    findAll: async (...args: any[]) => received.push(args[1]),
    findById: async (...args: any[]) => received.push(args[1]),
    createChannelPayment: async (...args: any[]) => received.push(args[2]),
    queryChannelPayment: async (...args: any[]) => received.push(args[1]),
    approve: async (...args: any[]) => received.push(args[3]),
    reject: async (...args: any[]) => received.push(args[3]),
    createReceipt: async (...args: any[]) => received.push(args[2]),
  } as any, {
    getPaymentProofForStaff: async (...args: any[]) => {
      received.push(args[1]);
      return { buffer: Buffer.from('proof'), mimeType: 'image/png' };
    },
  } as any);

  const response = {
    setHeader() { return this; },
    type() { return this; },
    send() { return this; },
  } as any;

  await controller.findAll({} as any, admin);
  await controller.findById(7, admin);
  await controller.getProof(7, admin, response);
  await controller.createChannel(9, { method: 'wechat' } as any, admin);
  await controller.queryChannel(7, admin);
  await controller.approve(7, {} as any, admin);
  await controller.reject(7, {} as any, admin);
  await controller.createReceipt({} as any, admin, 'controller-key');

  assert.deepEqual(received, [admin, admin, admin, admin, admin, admin, admin, admin]);
});
