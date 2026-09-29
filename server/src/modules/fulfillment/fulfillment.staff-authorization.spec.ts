import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';
import { FulfillmentController } from './fulfillment.controller';
import { FulfillmentService } from './fulfillment.service';

const warehouse = {
  id: 91,
  username: 'fulfillment-warehouse',
  realName: '履约仓储',
  role: 'WAREHOUSE',
  status: 'ACTIVE',
} as StaffPrincipal;

const customerService = {
  id: 92,
  username: 'fulfillment-support',
  realName: '履约客服',
  role: 'CUSTOMER_SERVICE',
  status: 'ACTIVE',
} as StaffPrincipal;

function createService(
  prisma: PrismaService,
  tradeEvents: object = {},
  notifications: object = {},
) {
  return new FulfillmentService(
    prisma,
    tradeEvents as never,
    notifications as never,
  );
}

test('员工撤权后履约列表、详情、发货和状态写入均在首个领域读取前失败关闭', async () => {
  const attempts: Array<(service: FulfillmentService) => Promise<unknown>> = [
    (service) => service.findAll({}, warehouse),
    (service) => service.findById(7, warehouse),
    (service) => service.dispatch(7, { carrier: '顺丰', trackingNo: 'SF-7' }, warehouse),
    (service) => service.updateStatus(7, { status: 'DELIVERED' }, warehouse),
  ];

  for (const attempt of attempts) {
    const state = { reads: 0, writes: 0 };
    const domainRead = async () => {
      state.reads += 1;
      return null;
    };
    const tx: any = {
      $queryRaw: async () => [],
      fulfillment: {
        findMany: domainRead,
        count: domainRead,
        findUnique: domainRead,
        updateMany: async () => {
          state.writes += 1;
          return { count: 0 };
        },
      },
      order: { updateMany: async () => { state.writes += 1; return { count: 0 }; } },
      refund: { findFirst: domainRead },
      afterSalesCase: { findFirst: domainRead },
    };
    const service = createService({
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as PrismaService);

    await assert.rejects(() => attempt(service), ForbiddenException);
    assert.deepEqual(state, { reads: 0, writes: 0 });
  }
});

test('履约写入在预读后再次复核员工，撤权时零领域写入', async () => {
  let transactionCount = 0;
  let reads = 0;
  let writes = 0;
  const tx: any = {
    $queryRaw: async (query: { strings?: readonly string[] }) => {
      if (query.strings?.join('').includes('FROM users')) {
        return transactionCount === 2
          ? []
          : [{ id: warehouse.id, username: warehouse.username }];
      }
      return [{ id: 9 }];
    },
    fulfillment: {
      findUnique: async () => {
        reads += 1;
        return { orderId: 9 };
      },
      updateMany: async () => { writes += 1; return { count: 1 }; },
    },
  };
  const service = createService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      transactionCount += 1;
      return callback(tx);
    },
  } as PrismaService);

  await assert.rejects(
    () => service.dispatch(7, { carrier: '顺丰', trackingNo: 'SF-7' }, warehouse),
    ForbiddenException,
  );
  assert.equal(reads, 1);
  assert.equal(writes, 0);
});

test('仓储角色可读取履约，客服角色在领域读取前被拒绝', async () => {
  let reads = 0;
  const tx: any = {
    $queryRaw: async (query: { strings?: readonly string[]; values?: readonly unknown[] }) => {
      const sql = query.strings?.join('') ?? '';
      const actorId = Number(query.values?.[0]);
      if (actorId === warehouse.id && sql.includes("'WAREHOUSE'")) {
        return [{ id: warehouse.id, username: warehouse.username }];
      }
      return [];
    },
    fulfillment: {
      findMany: async () => { reads += 1; return []; },
      count: async () => { reads += 1; return 0; },
    },
  };
  const service = createService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as PrismaService);

  const result = await service.findAll({}, warehouse);
  const readsAfterWarehouse = reads;
  await assert.rejects(() => service.findAll({}, customerService), ForbiddenException);

  assert.deepEqual(result, { list: [], total: 0, page: 1, pageSize: 20 });
  assert.equal(readsAfterWarehouse, 2);
  assert.equal(reads, readsAfterWarehouse);
});

test('履约事件操作者使用写事务内重新确认的员工身份', async () => {
  const sequence: string[] = [];
  const events: Array<Record<string, any>> = [];
  const fulfillment = {
    id: 7,
    fulfillmentNo: 'FUL-7',
    orderId: 9,
    warehouseId: 3,
    status: 'PENDING_SHIP',
    carrier: null as string | null,
    trackingNo: null as string | null,
    shippedAt: null as Date | null,
    deliveredAt: null as Date | null,
    internalNote: null,
    order: {
      id: 9,
      orderNo: 'ORD-9',
      customerId: 5,
      customerEmail: null,
      customerName: '测试客户',
      status: 'PENDING_SHIP',
      deliveryStatus: 'PENDING_SHIP',
      shippedAt: null,
      receivedAt: null,
      orderType: 'SPOT',
      customStage: null,
      paidAmount: new Prisma.Decimal(100),
      refundedAmount: new Prisma.Decimal(0),
      finalAmount: new Prisma.Decimal(100),
    },
  };
  const tx: any = {
    $queryRaw: async (query: { strings?: readonly string[] }) => {
      if (query.strings?.join('').includes('FROM users')) {
        sequence.push('staff-lock');
        return [{ id: 9100, username: 'current-warehouse' }];
      }
      sequence.push('order-lock');
      return [{ id: fulfillment.orderId }];
    },
    fulfillment: {
      findUnique: async (args: any) => {
        sequence.push(args.select?.orderId ? 'reference-read' : 'fulfillment-read');
        return args.select?.orderId ? { orderId: fulfillment.orderId } : fulfillment;
      },
      updateMany: async ({ data }: any) => {
        sequence.push('fulfillment-write');
        Object.assign(fulfillment, data);
        return { count: 1 };
      },
      findMany: async () => [{
        status: fulfillment.status,
        carrier: fulfillment.carrier,
        trackingNo: fulfillment.trackingNo,
        shippedAt: fulfillment.shippedAt,
        deliveredAt: fulfillment.deliveredAt,
      }],
    },
    order: {
      updateMany: async () => ({ count: 1 }),
      update: async ({ data }: any) => {
        Object.assign(fulfillment.order, data);
        return fulfillment.order;
      },
    },
    refund: { findFirst: async () => null },
    afterSalesCase: { findFirst: async () => null },
  };
  const service = createService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as PrismaService,
    {
      record: async (_client: unknown, event: Record<string, unknown>) => events.push(event),
    },
    { enqueueOrderLifecycle: async () => undefined },
  );

  await service.dispatch(7, { carrier: '顺丰', trackingNo: 'SF-7' }, warehouse);

  assert.deepEqual(sequence.slice(0, 4), [
    'staff-lock',
    'reference-read',
    'staff-lock',
    'order-lock',
  ]);
  assert.ok(events.length >= 1);
  assert.ok(events.every((event) => event.operator.id === 9100));
});

test('履约控制器把完整员工 principal 传给全部读写路径', async () => {
  const received: unknown[] = [];
  const controller = new FulfillmentController({
    findAll: async (...args: any[]) => received.push(args[1]),
    findById: async (...args: any[]) => received.push(args[1]),
    dispatch: async (...args: any[]) => received.push(args[2]),
    updateStatus: async (...args: any[]) => received.push(args[2]),
  } as any);

  await controller.findAll({} as any, warehouse);
  await controller.findById(7, warehouse);
  await controller.dispatch(7, {} as any, warehouse);
  await controller.updateStatus(7, {} as any, warehouse);

  assert.deepEqual(received, [warehouse, warehouse, warehouse, warehouse]);
});
