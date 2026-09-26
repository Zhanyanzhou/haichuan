import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

const admin = {
  id: 71,
  username: 'order-admin',
  realName: '订单管理员',
  role: 'ADMIN',
  status: 'ACTIVE',
} as StaffPrincipal;

const customerService = {
  id: 72,
  username: 'order-support',
  realName: '订单客服',
  role: 'CUSTOMER_SERVICE',
  status: 'ACTIVE',
} as StaffPrincipal;

const finance = {
  id: 73,
  username: 'order-finance',
  realName: '订单财务',
  role: 'FINANCE',
  status: 'ACTIVE',
} as StaffPrincipal;

function createService(prisma: PrismaService) {
  return new OrdersService(
    prisma,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

function revokedHarness() {
  const state = { domainReads: 0, domainWrites: 0 };
  const domainRead = async () => {
    state.domainReads += 1;
    return null;
  };
  const tx: any = {
    $queryRaw: async () => [],
    order: {
      findMany: domainRead,
      count: domainRead,
      findUnique: domainRead,
      aggregate: domainRead,
      groupBy: domainRead,
    },
    operationLog: {
      create: async () => {
        state.domainWrites += 1;
        return null;
      },
    },
  };
  const service = createService({
    order: { fields: { finalAmount: Symbol('finalAmount') } },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService);
  return { service, state };
}

test('员工撤权后五条订单后台读取在首个领域读取前失败关闭', async () => {
  const attempts: Array<(service: OrdersService) => Promise<unknown>> = [
    (service) => service.findAll({}, customerService),
    (service) => service.findById(7, customerService),
    (service) => service.findAnomalies(finance),
    (service) => service.getTradeOverview(finance),
    (service) => service.findAllForExport({}, admin),
  ];

  for (const attempt of attempts) {
    const { service, state } = revokedHarness();
    await assert.rejects(() => attempt(service), ForbiddenException);
    assert.equal(state.domainReads, 0);
    assert.equal(state.domainWrites, 0);
  }
});

test('订单列表和详情只在当前员工锁建立后读取私有订单', async () => {
  const sequence: string[] = [];
  const order = { id: 7, orderNo: 'ORD-7', transactionSnapshot: null };
  const tx: any = {
    $queryRaw: async () => {
      sequence.push('staff-lock');
      return [{ id: customerService.id, username: customerService.username }];
    },
    order: {
      findMany: async () => {
        sequence.push('list-read');
        return [order];
      },
      count: async () => {
        sequence.push('count-read');
        return 1;
      },
      findUnique: async () => {
        sequence.push('detail-read');
        return order;
      },
    },
  };
  const service = createService({
    order: { fields: { finalAmount: Symbol('finalAmount') } },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService);

  const list = await service.findAll({}, customerService);
  const detail = await service.findById(7, customerService);

  assert.deepEqual(list, { list: [order], total: 1, page: 1, pageSize: 20 });
  assert.equal(detail, order);
  assert.deepEqual(sequence, [
    'staff-lock',
    'list-read',
    'count-read',
    'staff-lock',
    'detail-read',
  ]);
});

test('订单读取角色边界由事务内当前数据库角色决定', async () => {
  const roles = new Map<number, string>([
    [customerService.id, 'CUSTOMER_SERVICE'],
    [finance.id, 'FINANCE'],
    [admin.id, 'ADMIN'],
  ]);
  let domainReads = 0;
  const operationLogs: Array<Record<string, unknown>> = [];
  const tx: any = {
    $queryRaw: async (query: { strings?: readonly string[]; values?: readonly unknown[] }) => {
      const actorId = Number(query.values?.[0]);
      const role = roles.get(actorId);
      const sql = query.strings?.join('') ?? '';
      return role && sql.includes(`'${role}'`)
        ? [{ id: actorId, username: `staff-${actorId}` }]
        : [];
    },
    order: {
      findMany: async () => {
        domainReads += 1;
        return [];
      },
      count: async () => {
        domainReads += 1;
        return 0;
      },
      aggregate: async () => {
        domainReads += 1;
        return { _sum: { finalAmount: 0, paidAmount: 0, refundedAmount: 0 } };
      },
      groupBy: async () => {
        domainReads += 1;
        return [];
      },
    },
    operationLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        operationLogs.push(data);
        return data;
      },
    },
  };
  const service = createService({
    order: { fields: { finalAmount: Symbol('finalAmount') } },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService);

  await service.findAll({}, customerService);
  const afterCustomerList = domainReads;
  await assert.rejects(() => service.findAnomalies(customerService), ForbiddenException);
  await assert.rejects(() => service.findAllForExport({}, customerService), ForbiddenException);
  assert.equal(domainReads, afterCustomerList);

  await service.findAnomalies(finance);
  await service.getTradeOverview(finance);
  const afterFinanceReads = domainReads;
  await assert.rejects(() => service.findAll({}, finance), ForbiddenException);
  await assert.rejects(() => service.findAllForExport({}, finance), ForbiddenException);
  assert.equal(domainReads, afterFinanceReads);

  await service.findAllForExport({}, admin);
  assert.equal(operationLogs.length, 1);
  assert.equal(operationLogs[0]?.userId, admin.id);
});

test('订单导出审计只使用事务内重新确认的员工身份', async () => {
  const operationLogs: Array<Record<string, unknown>> = [];
  const lockedStaffId = 701;
  const tx: any = {
    $queryRaw: async () => [{ id: lockedStaffId, username: 'current-order-admin' }],
    order: { findMany: async () => [] },
    operationLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        operationLogs.push(data);
        return data;
      },
    },
  };
  const service = createService({
    order: { fields: { finalAmount: Symbol('finalAmount') } },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService);

  await service.findAllForExport({}, admin);

  assert.equal(operationLogs[0]?.userId, lockedStaffId);
});

test('订单控制器把完整员工 principal 传给全部后台读取', async () => {
  const received: unknown[] = [];
  const controller = new OrdersController({
    findAll: async (...args: any[]) => received.push(args[1]),
    findAnomalies: async (...args: any[]) => received.push(args[0]),
    getTradeOverview: async (...args: any[]) => received.push(args[0]),
    findAllForExport: async (...args: any[]) => received.push(args[1]),
    findById: async (...args: any[]) => received.push(args[1]),
  } as any);

  await controller.findAll({} as any, admin);
  await controller.findAnomalies(admin);
  await controller.getTradeOverview(admin);
  await controller.exportOrders({} as any, admin);
  await controller.findById(7, admin);

  assert.deepEqual(received, [admin, admin, admin, admin, admin]);
});
