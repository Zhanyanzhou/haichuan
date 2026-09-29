import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import { IdempotencyService } from '../../common/idempotency/idempotency-key';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';
import { AfterSalesController } from './after-sales.controller';
import { AfterSalesService } from './after-sales.service';

const staff = {
  id: 31,
  username: 'after-sales-staff',
  realName: '售后客服',
  role: 'CUSTOMER_SERVICE',
  status: 'ACTIVE',
  sessionFamilyId: '00000000-0000-4000-8000-000000000031',
} as StaffPrincipal;

function revokedHarness() {
  const state = { domainReads: 0, domainWrites: 0 };
  const domainRead = async () => {
    state.domainReads += 1;
    return null;
  };
  const tx: any = {
    $queryRaw: async () => [],
    afterSalesCase: {
      findMany: domainRead,
      count: domainRead,
      findUnique: domainRead,
      findFirst: domainRead,
      create: async () => {
        state.domainWrites += 1;
        return null;
      },
      updateMany: async () => {
        state.domainWrites += 1;
        return { count: 0 };
      },
    },
    order: { findFirst: domainRead },
    refund: { findFirst: domainRead },
  };
  const service = new AfterSalesService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as PrismaService,
    { record: async () => { state.domainWrites += 1; } } as never,
    new IdempotencyService(),
  );
  return { service, state };
}

test('员工撤权后五条后台售后路径在首个领域读取前失败关闭', async () => {
  const attempts: Array<(service: AfterSalesService) => Promise<unknown>> = [
    (service) => service.findAll({}, staff),
    (service) => service.findById(7, staff),
    (service) => service.create({
      orderId: 9,
      orderItemId: 21,
      customerId: 7,
      type: 'REPAIR',
      reason: '需要检修',
      operator: staff,
    }, 'after-sales-staff-revoked'),
    (service) => service.review(7, 'APPROVED', undefined, undefined, staff),
    (service) => service.updateStatus(7, 'RETURNING', undefined, staff),
  ];

  for (const attempt of attempts) {
    const { service, state } = revokedHarness();
    await assert.rejects(() => attempt(service), ForbiddenException);
    assert.equal(state.domainReads, 0);
    assert.equal(state.domainWrites, 0);
  }
});

test('当前设备登出后五条后台售后路径在首个领域读取前失败关闭', async () => {
  const attempts: Array<(service: AfterSalesService) => Promise<unknown>> = [
    (service) => service.findAll({}, staff),
    (service) => service.findById(7, staff),
    (service) => service.create({
      orderId: 9,
      orderItemId: 21,
      customerId: 7,
      type: 'REPAIR',
      reason: '需要检修',
      operator: staff,
    }, 'after-sales-session-revoked'),
    (service) => service.review(7, 'APPROVED', undefined, undefined, staff),
    (service) => service.updateStatus(7, 'RETURNING', undefined, staff),
  ];

  for (const [index, attempt] of attempts.entries()) {
    const { service, state } = revokedHarness();
    const queries: string[] = [];
    const tx = (service as any).prisma;
    tx.$transaction = async (callback: (client: any) => Promise<unknown>) => callback({
      $queryRaw: async (query: any) => {
        const sql = (query?.strings ?? []).join(' ');
        queries.push(sql);
        return sql.includes('FROM users')
          ? [{ id: staff.id, username: staff.username, realName: staff.realName }]
          : [];
      },
      afterSalesCase: {
        findMany: async () => { state.domainReads += 1; return []; },
        count: async () => { state.domainReads += 1; return 0; },
        findUnique: async () => { state.domainReads += 1; return null; },
        findFirst: async () => { state.domainReads += 1; return null; },
        create: async () => { state.domainWrites += 1; return null; },
        updateMany: async () => { state.domainWrites += 1; return { count: 0 }; },
      },
      order: { findFirst: async () => { state.domainReads += 1; return null; } },
      refund: { findFirst: async () => { state.domainReads += 1; return null; } },
    });

    await assert.rejects(() => attempt(service), ForbiddenException);
    assert.equal(queries.length, 2);
    assert.match(queries[0], index < 2 ? /FOR SHARE/ : /FOR UPDATE/);
    assert.match(queries[1], /FROM admin_refresh_sessions/);
    assert.match(queries[1], index < 2 ? /FOR SHARE/ : /FOR UPDATE/);
    assert.equal(state.domainReads, 0);
    assert.equal(state.domainWrites, 0);
  }
});

test('获准员工在员工锁内读取售后列表和详情', async () => {
  const sequence: string[] = [];
  const record = { id: 7, caseNo: 'AS-7' };
  const tx: any = {
    $queryRaw: async (query: any) => {
      const sql = (query?.strings ?? []).join(' ');
      sequence.push(sql.includes('admin_refresh_sessions') ? 'session-lock' : 'staff-lock');
      return [{ id: staff.id, username: staff.username, realName: staff.realName }];
    },
    afterSalesCase: {
      findMany: async () => {
        sequence.push('list-read');
        return [record];
      },
      count: async () => {
        sequence.push('count-read');
        return 1;
      },
      findUnique: async () => {
        sequence.push('detail-read');
        return record;
      },
    },
  };
  const service = new AfterSalesService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as PrismaService,
    {} as never,
    new IdempotencyService(),
  );

  const list = await service.findAll({}, staff);
  const detail = await service.findById(7, staff);

  assert.deepEqual(list, { list: [record], total: 1, page: 1, pageSize: 20 });
  assert.equal(detail, record);
  assert.deepEqual(sequence, [
    'staff-lock',
    'session-lock',
    'list-read',
    'count-read',
    'staff-lock',
    'session-lock',
    'detail-read',
  ]);
});

test('售后控制器把完整员工 principal 传给全部后台路径', async () => {
  const received: unknown[] = [];
  const controller = new AfterSalesController({
    findAll: async (...args: any[]) => received.push(args[1]),
    findById: async (...args: any[]) => received.push(args[1]),
    create: async (...args: any[]) => received.push(args[0]?.operator),
    review: async (...args: any[]) => received.push(args[4]),
    updateStatus: async (...args: any[]) => received.push(args[3]),
  } as any);

  await controller.findAll({} as any, staff);
  await controller.findById(7, staff);
  await controller.create({} as any, staff, 'after-sales-controller');
  await controller.review(7, {} as any, staff);
  await controller.updateStatus(7, {} as any, staff);

  assert.deepEqual(received, [staff, staff, staff, staff, staff]);

  for (const methodName of ['findAll', 'findById'] as const) {
    const headers = Reflect.getMetadata(
      HEADERS_METADATA,
      AfterSalesController.prototype[methodName],
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
