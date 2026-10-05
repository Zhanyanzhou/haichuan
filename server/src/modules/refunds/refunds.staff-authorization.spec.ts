import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';

const admin = {
  id: 41,
  username: 'refund-admin',
  realName: '退款管理员',
  role: 'ADMIN',
  status: 'ACTIVE',
  sessionFamilyId: 'refund-admin-session-family',
} as StaffPrincipal;

const customerService = {
  id: 42,
  username: 'refund-support',
  realName: '退款客服',
  role: 'CUSTOMER_SERVICE',
  status: 'ACTIVE',
  sessionFamilyId: 'refund-support-session-family',
} as StaffPrincipal;

function buildRevokedHarness() {
  const state = { domainReads: 0, domainWrites: 0, gatewayCalls: 0 };
  const forbiddenRead = async () => {
    state.domainReads += 1;
    return null;
  };
  const tx: any = {
    $queryRaw: async () => [],
    refund: {
      findUnique: forbiddenRead,
      findFirst: forbiddenRead,
      findMany: forbiddenRead,
      count: forbiddenRead,
      create: async () => {
        state.domainWrites += 1;
        return null;
      },
      update: async () => {
        state.domainWrites += 1;
        return null;
      },
      updateMany: async () => {
        state.domainWrites += 1;
        return { count: 0 };
      },
    },
    order: { findUnique: forbiddenRead },
    payment: { findMany: forbiddenRead, findFirst: forbiddenRead },
  };
  const prisma: any = {
    ...tx,
    $transaction: async (callback: (client: any) => Promise<unknown>) => callback(tx),
  };
  const gateway: any = {
    isRefundCreationEnabled: () => true,
    isRefundAvailable: () => true,
    createRefund: async () => {
      state.gatewayCalls += 1;
      return null;
    },
    queryRefund: async () => {
      state.gatewayCalls += 1;
      return null;
    },
  };
  const service = new RefundsService(
    prisma as PrismaService,
    { record: async () => undefined } as never,
    gateway,
    { get: () => 'https://shop.example.test' } as never,
  );
  return { service, state };
}

function buildLoggedOutHarness() {
  const state = { domainReads: 0, domainWrites: 0, gatewayCalls: 0 };
  const forbiddenRead = async () => {
    state.domainReads += 1;
    return null;
  };
  const tx: any = {
    $queryRaw: async (query: any) => {
      const sql = Array.isArray(query?.strings) ? query.strings.join('') : String(query);
      return sql.includes('FROM users')
        ? [{ id: admin.id, username: admin.username, realName: admin.realName }]
        : [];
    },
    refund: {
      findUnique: forbiddenRead,
      findFirst: forbiddenRead,
      findMany: forbiddenRead,
      count: forbiddenRead,
      create: async () => {
        state.domainWrites += 1;
        return null;
      },
      update: async () => {
        state.domainWrites += 1;
        return null;
      },
      updateMany: async () => {
        state.domainWrites += 1;
        return { count: 0 };
      },
    },
    order: { findUnique: forbiddenRead },
    payment: { findMany: forbiddenRead, findFirst: forbiddenRead },
  };
  const prisma: any = {
    ...tx,
    $transaction: async (callback: (client: any) => Promise<unknown>) => callback(tx),
  };
  const gateway: any = {
    isRefundCreationEnabled: () => true,
    isRefundAvailable: () => true,
    createRefund: async () => {
      state.gatewayCalls += 1;
      return null;
    },
    queryRefund: async () => {
      state.gatewayCalls += 1;
      return null;
    },
  };
  const service = new RefundsService(
    prisma as PrismaService,
    { record: async () => undefined } as never,
    gateway,
    { get: () => 'https://shop.example.test' } as never,
  );
  return { service, state };
}

test('退款人工写入与渠道动作在首个领域读取前复核当前员工', async () => {
  const attempts: Array<(service: RefundsService) => Promise<unknown>> = [
    (service) => service.create({
      orderId: 9,
      paymentId: 7,
      amount: 10,
      reason: '客户退货',
      idempotencyKey: 'refund-auth-create',
      operator: admin,
    }),
    (service) => service.review(3, 'APPROVED', '同意', admin),
    (service) => service.execute(3, 'COMPLETED', 'BANK-3', admin),
    (service) => service.startOnlineRefund(3, admin),
    (service) => service.queryOnlineRefund(3, admin),
  ];

  for (const attempt of attempts) {
    const { service, state } = buildRevokedHarness();
    await assert.rejects(() => attempt(service), ForbiddenException);
    assert.equal(state.domainReads, 0);
    assert.equal(state.domainWrites, 0);
    assert.equal(state.gatewayCalls, 0);
  }
});

test('退款私有读取在首个领域读取前复核当前员工', async () => {
  const attempts: Array<(service: RefundsService) => Promise<unknown>> = [
    (service) => service.findAll({}, admin),
    (service) => service.findById(3, admin),
    (service) => service.getCreateEligibility(9, admin),
  ];

  for (const attempt of attempts) {
    const { service, state } = buildRevokedHarness();
    await assert.rejects(() => attempt(service), ForbiddenException);
    assert.equal(state.domainReads, 0);
    assert.equal(state.domainWrites, 0);
    assert.equal(state.gatewayCalls, 0);
  }
});

test('当前设备登出后八条退款私有路径在领域访问和渠道调用前失败关闭', async () => {
  const attempts: Array<(service: RefundsService) => Promise<unknown>> = [
    (service) => service.findAll({}, admin),
    (service) => service.findById(3, admin),
    (service) => service.getCreateEligibility(9, admin),
    (service) => service.create({
      orderId: 9,
      paymentId: 7,
      amount: 10,
      reason: '客户退货',
      idempotencyKey: 'refund-session-create',
      operator: admin,
    }),
    (service) => service.review(3, 'APPROVED', '同意', admin),
    (service) => service.execute(3, 'COMPLETED', 'BANK-3', admin),
    (service) => service.startOnlineRefund(3, admin),
    (service) => service.queryOnlineRefund(3, admin),
  ];

  for (const attempt of attempts) {
    const { service, state } = buildLoggedOutHarness();
    await assert.rejects(() => attempt(service), ForbiddenException);
    assert.equal(state.domainReads, 0);
    assert.equal(state.domainWrites, 0);
    assert.equal(state.gatewayCalls, 0);
  }
});

test('获准员工在员工锁内读取退款列表、详情和创建资格', async () => {
  const sequence: string[] = [];
  const refund = { id: 3, refundNo: 'RFD-3' };
  const tx: any = {
    $queryRaw: async (query: any) => {
      const sql = Array.isArray(query?.strings) ? query.strings.join('') : String(query);
      if (sql.includes('admin_refresh_sessions')) {
        sequence.push('session-lock');
        return [{ id: 501 }];
      }
      sequence.push('staff-lock');
      return [{ id: admin.id, username: admin.username, realName: admin.realName }];
    },
    refund: {
      findMany: async () => {
        sequence.push('list-read');
        return [refund];
      },
      count: async () => {
        sequence.push('count-read');
        return 1;
      },
      findUnique: async () => {
        sequence.push('detail-read');
        return refund;
      },
    },
    order: {
      findUnique: async () => {
        sequence.push('eligibility-read');
        return {
          id: 9,
          orderNo: 'ORD-9',
          status: 'SHIPPED',
          orderType: 'SPOT',
          currency: 'CNY',
          quotationVersionId: null,
          paymentPlans: [],
          payments: [],
          refunds: [],
        };
      },
    },
  };
  const service = new RefundsService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );

  const list = await service.findAll({}, admin);
  const detail = await service.findById(3, admin);
  const eligibility = await service.getCreateEligibility(9, admin);

  assert.deepEqual(list, { list: [refund], total: 1, page: 1, pageSize: 20 });
  assert.equal(detail, refund);
  assert.equal(eligibility.order.id, 9);
  assert.deepEqual(sequence, [
    'staff-lock',
    'session-lock',
    'list-read',
    'count-read',
    'staff-lock',
    'session-lock',
    'detail-read',
    'staff-lock',
    'session-lock',
    'eligibility-read',
  ]);
});

test('客服仅可查询退款，不能进入管理员创建资格预检', async () => {
  let orderReads = 0;
  const tx: any = {
    $queryRaw: async (query: any) => {
      const sql = Array.isArray(query?.strings)
        ? query.strings.join('')
        : String(query);
      if (sql.includes('admin_refresh_sessions')) return [{ id: 502 }];
      return sql.includes("'CUSTOMER_SERVICE'")
        ? [{ id: customerService.id, username: customerService.username }]
        : [];
    },
    refund: {
      findMany: async () => [],
      count: async () => 0,
    },
    order: {
      findUnique: async () => {
        orderReads += 1;
        return null;
      },
    },
  };
  const service = new RefundsService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );

  const list = await service.findAll({}, customerService);
  await assert.rejects(
    () => service.getCreateEligibility(9, customerService),
    ForbiddenException,
  );

  assert.deepEqual(list, { list: [], total: 0, page: 1, pageSize: 20 });
  assert.equal(orderReads, 0);
});

function buildQueryHarness(allowedStaffLocks: number) {
  const sequence: string[] = [];
  let staffLocks = 0;
  let domainWrites = 0;
  const payment = {
    id: 7,
    paymentNo: 'PAY-7',
    gatewayTradeNo: 'WX-TRADE-7',
    amount: 100,
    method: 'wechat',
    status: 'PAID',
  };
  const refund = {
    id: 3,
    orderId: 9,
    paymentId: 7,
    refundNo: 'RFD-3',
    amount: 40,
    reason: '客户退货',
    status: 'PROCESSING',
    gatewayRefundNo: 'WX-REFUND-3',
    payment,
  };
  const tx: any = {
    $queryRaw: async (query: any) => {
      const sql = Array.isArray(query?.strings) ? query.strings.join('') : String(query);
      if (sql.includes('FROM users')) {
        staffLocks += 1;
        sequence.push('staff-lock');
        return staffLocks <= allowedStaffLocks
          ? [{ id: admin.id, username: admin.username, realName: admin.realName }]
          : [];
      }
      if (sql.includes('admin_refresh_sessions')) {
        sequence.push('session-lock');
        return [{ id: 503 }];
      }
      sequence.push('order-lock');
      return [{ id: refund.orderId }];
    },
    refund: {
      findUnique: async () => {
        sequence.push('refund-read');
        return refund;
      },
      findFirst: async () => null,
      update: async () => {
        domainWrites += 1;
        return refund;
      },
      updateMany: async () => {
        domainWrites += 1;
        return { count: 1 };
      },
    },
  };
  const prisma: any = {
    refund: tx.refund,
    $transaction: async (callback: (client: any) => Promise<unknown>) => callback(tx),
  };
  const gateway: any = {
    queryRefund: async () => {
      sequence.push('gateway-query');
      return {
        provider: 'wechat',
        refundNo: refund.refundNo,
        gatewayRefundNo: refund.gatewayRefundNo,
        paymentNo: payment.paymentNo,
        gatewayTradeNo: payment.gatewayTradeNo,
        state: 'PROCESSING',
        refundAmountYuan: '40.00',
        totalAmountYuan: '100.00',
        raw: { status: 'PROCESSING' },
      };
    },
  };
  const service = new RefundsService(
    prisma as PrismaService,
    { record: async () => undefined } as never,
    gateway,
    { get: () => 'https://shop.example.test' } as never,
  );
  return { service, sequence, getDomainWrites: () => domainWrites };
}

test('人工渠道查单在读取、外调期间和事实落库前分别复核员工', async () => {
  const { service, sequence, getDomainWrites } = buildQueryHarness(3);

  const result = await service.queryOnlineRefund(3, admin);

  assert.equal(result.state, 'PROCESSING');
  assert.deepEqual(sequence.slice(0, 10), [
    'staff-lock',
    'session-lock',
    'refund-read',
    'staff-lock',
    'session-lock',
    'gateway-query',
    'staff-lock',
    'session-lock',
    'refund-read',
    'order-lock',
  ]);
  assert.equal(getDomainWrites(), 0);
});

test('渠道返回后员工若已撤权，人工查单不把渠道事实写入本地', async () => {
  const { service, sequence, getDomainWrites } = buildQueryHarness(2);

  await assert.rejects(() => service.queryOnlineRefund(3, admin), ForbiddenException);

  assert.equal(sequence.includes('gateway-query'), true);
  assert.equal(getDomainWrites(), 0);
});

test('退款控制器把完整员工 principal 传入全部私有读取与人工动作', async () => {
  const received: unknown[] = [];
  const controller = new RefundsController({
    findAll: async (...args: any[]) => received.push(args[1]),
    findById: async (...args: any[]) => received.push(args[1]),
    getCreateEligibility: async (...args: any[]) => received.push(args[1]),
    create: async (data: any) => received.push(data.operator),
    review: async (...args: any[]) => received.push(args[3]),
    execute: async (...args: any[]) => received.push(args[3]),
    startOnlineRefund: async (...args: any[]) => received.push(args[1]),
    queryOnlineRefund: async (...args: any[]) => received.push(args[1]),
  } as any);

  await controller.findAll({} as any, admin);
  await controller.findById(3, admin);
  await controller.getCreateEligibility(9, admin);
  await controller.create({} as any, admin);
  await controller.review(3, {} as any, admin);
  await controller.execute(3, {} as any, admin);
  await controller.startChannel(3, admin);
  await controller.queryChannel(3, admin);

  assert.deepEqual(received, [admin, admin, admin, admin, admin, admin, admin, admin]);

  for (const methodName of [
    'findAll',
    'getCreateEligibility',
    'findById',
    'queryChannel',
  ] as const) {
    const headers = Reflect.getMetadata(
      HEADERS_METADATA,
      RefundsController.prototype[methodName],
    ) as Array<{ name: string; value: string }>;
    assert.ok(headers.some(
      (header) => header.name === 'Cache-Control'
        && header.value === 'private, no-store, max-age=0',
    ));
    assert.ok(headers.some(
      (header) => header.name === 'Vary'
        && header.value === 'Cookie, Authorization',
    ));
  }
});
