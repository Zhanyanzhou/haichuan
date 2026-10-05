import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

const admin = {
  id: 81,
  username: 'order-write-admin',
  realName: '订单写入管理员',
  role: 'ADMIN',
  status: 'ACTIVE',
} as StaffPrincipal;

const customerService = {
  id: 82,
  username: 'order-write-support',
  realName: '订单写入客服',
  role: 'CUSTOMER_SERVICE',
  status: 'ACTIVE',
} as StaffPrincipal;

function createService(
  prisma: PrismaService,
  tradeEvents: object = {},
  fulfillment: object = {},
) {
  return new OrdersService(
    prisma,
    tradeEvents as never,
    {} as never,
    {} as never,
    {} as never,
    fulfillment as never,
  );
}

function revokedHarness() {
  const state = { domainReads: 0, domainWrites: 0, delegations: 0 };
  const domainRead = async () => {
    state.domainReads += 1;
    return null;
  };
  const domainWrite = async () => {
    state.domainWrites += 1;
    return { count: 0 };
  };
  const tx: any = {
    $queryRaw: async () => [],
    order: {
      findUnique: domainRead,
      findFirst: domainRead,
      create: domainWrite,
      update: domainWrite,
      updateMany: domainWrite,
    },
    fulfillment: { findMany: domainRead, findFirst: domainRead },
    productSKU: { findMany: domainRead },
    inventory: { groupBy: domainRead },
    coupon: { findUnique: domainRead },
    payment: { findFirst: domainRead },
    refund: { findFirst: domainRead },
    afterSalesCase: { findFirst: domainRead },
  };
  const service = createService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as PrismaService,
    { record: domainWrite },
    {
      dispatch: async () => { state.delegations += 1; },
      updateStatus: async () => { state.delegations += 1; },
    },
  );
  return { service, state };
}

test('员工撤权后九条订单后台写路径在首个领域读取前失败关闭', async () => {
  const attempts: Array<(service: OrdersService) => Promise<unknown>> = [
    (service) => service.create({
      customerName: '测试客户',
      customerPhone: '13800000000',
      address: '测试地址',
      items: [{ skuId: 1, quantity: 1 }],
      staffPrincipal: admin,
      adminCreation: { actorId: admin.id, idempotencyKey: 'revoked-admin-order-create' },
    }),
    (service) => service.ship(7, { logisticsCompany: '顺丰', logisticsNo: 'SF-7' }, admin),
    (service) => service.updateStatus(7, { status: 'CANCELLED' }, admin),
    (service) => service.updateAmount(7, { finalAmount: 100, reason: '人工议价' }, admin),
    (service) => service.updateAddress(7, '新地址', admin),
    (service) => service.updateNote(7, '内部备注', customerService),
    (service) => service.confirmReceive(7, admin),
    (service) => service.updateSalesConsultant(7, 9, admin),
    (service) => service.advanceCustomStage(7, 'IN_PRODUCTION', admin),
  ];

  for (const attempt of attempts) {
    const { service, state } = revokedHarness();
    await assert.rejects(() => attempt(service), ForbiddenException);
    assert.deepEqual(state, { domainReads: 0, domainWrites: 0, delegations: 0 });
  }
});

test('客服只可修改内部备注，且审计操作者来自锁内当前员工事实', async () => {
  const sequence: string[] = [];
  const events: Array<Record<string, any>> = [];
  let domainReads = 0;
  const order = {
    id: 7,
    status: 'PENDING_PAYMENT',
    internalNote: null as string | null,
    totalAmount: 100,
    discountAmount: 0,
    adjustmentAmount: 0,
    finalAmount: 100,
    depositAmount: 0,
    balanceAmount: 0,
    updatedAt: new Date(),
    quotationVersionId: null,
    quotationSource: null,
    paymentPlans: [],
  };
  const tx: any = {
    $queryRaw: async (query: { strings?: readonly string[]; values?: readonly unknown[] }) => {
      const sql = query.strings?.join('') ?? '';
      if (sql.includes('FROM users')) {
        sequence.push('staff-lock');
        return sql.includes("'CUSTOMER_SERVICE'")
          ? [{ id: 8200, username: 'current-support' }]
          : [];
      }
      sequence.push('order-lock');
      return [{ id: Number(query.values?.[0] ?? order.id) }];
    },
    order: {
      findUnique: async () => {
        sequence.push('order-read');
        domainReads += 1;
        return order;
      },
      update: async ({ data }: { data: { internalNote: string | null } }) => {
        sequence.push('order-write');
        order.internalNote = data.internalNote;
        return order;
      },
    },
    payment: { findFirst: async () => null },
  };
  const service = createService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as PrismaService,
    {
      record: async (_client: unknown, event: Record<string, unknown>) => {
        sequence.push('event-write');
        events.push(event);
      },
    },
  );

  await service.updateNote(7, '客服备注', customerService);
  const readsAfterNote = domainReads;
  await assert.rejects(
    () => service.updateAmount(7, { finalAmount: 90, reason: '无权改价' }, customerService),
    ForbiddenException,
  );

  assert.equal(domainReads, readsAfterNote);
  assert.equal(events[0]?.operator.id, 8200);
  assert.deepEqual(sequence.slice(0, 5), [
    'staff-lock',
    'order-lock',
    'order-read',
    'order-write',
    'event-write',
  ]);
});

test('订单控制器把完整员工 principal 传给全部后台写路径', async () => {
  const received: unknown[] = [];
  const controller = new OrdersController({
    create: async (data: any) => received.push(data.staffPrincipal),
    ship: async (...args: any[]) => received.push(args[2]),
    updateStatus: async (...args: any[]) => received.push(args[2]),
    updateAmount: async (...args: any[]) => received.push(args[2]),
    updateAddress: async (...args: any[]) => received.push(args[2]),
    updateNote: async (...args: any[]) => received.push(args[2]),
    confirmReceive: async (...args: any[]) => received.push(args[1]),
    updateSalesConsultant: async (...args: any[]) => received.push(args[2]),
    advanceCustomStage: async (...args: any[]) => received.push(args[2]),
  } as any);

  await controller.create({} as any, admin, 'controller-admin-create');
  await controller.ship(7, {} as any, admin);
  await controller.updateStatus(7, {} as any, admin);
  await controller.updateAmount(7, {} as any, admin);
  await controller.updateAddress(7, { address: '地址' } as any, admin);
  await controller.updateNote(7, { internalNote: '备注' } as any, admin);
  await controller.confirmReceive(7, admin);
  await controller.updateConsultant(7, {} as any, admin);
  await controller.advanceCustomStage(7, {} as any, admin);

  assert.deepEqual(received, [admin, admin, admin, admin, admin, admin, admin, admin, admin]);
});
