import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from './orders.service';
import { TradeEventsService } from '../trade-events/trade-events.service';

const CUSTOMER = { id: 7, authVersion: 1 };
const OTHER_CUSTOMER = { id: 8, authVersion: 1 };

const ORDER = {
  id: 9,
  orderNo: 'ORD-TEST-9',
  customerId: 7,
  status: 'PENDING_PAYMENT',
  paidAmount: 0,
  couponId: null,
  customerEmail: null,
  customerName: null,
  // 模拟取消链路返回的完整 Order 行：后台字段必须在响应前被剔除。
  internalNote: '后台内部备注',
  userId: 42,
  salesConsultantId: 7,
  source: 'store',
  paymentProof: 'private/proof.png',
};

function buildService(options: {
  ownedByCustomer?: boolean;
  pendingPayment?: { paymentNo: string } | null;
  activePrincipal?: boolean;
} = {}) {
  const events: Array<{ eventType: string; reason?: string | null }> = [];
  const orderFindUniqueCalls: Array<Record<string, unknown>> = [];
  const order = { ...ORDER };
  let updateCalls = 0;
  const tx = {
    $queryRaw: async () => options.activePrincipal === false ? [] : [{ id: 9 }],
    order: {
      findUnique: async () => {
        orderFindUniqueCalls.push({});
        return order;
      },
      updateMany: async ({ where }: { where: { status: string; paidAmount: number } }) => {
        updateCalls += 1;
        orderFindUniqueCalls.push({ updateWhere: where });
        assert.equal(where.status, 'PENDING_PAYMENT');
        assert.equal(where.paidAmount, 0);
        order.status = 'CANCELLED';
        return { count: 1 };
      },
    },
    payment: {
      findFirst: async () => options.pendingPayment ?? null,
    },
    fulfillment: { findFirst: async () => null },
    inventoryReservation: { findMany: async () => [] },
  };
  const prisma = {
    order: {
      findFirst: async ({ where }: { where: { id: number; customerId?: number } }) =>
        options.ownedByCustomer === false ? null : { id: where.id },
    },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };
  const tradeEvents = {
    record: async (_tx: unknown, event: { eventType: string; reason?: string | null }) => {
      events.push(event);
    },
  };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    tradeEvents as unknown as TradeEventsService,
    {} as never,
    {} as never,
  );
  return {
    service,
    events,
    get updateCalls() {
      return updateCalls;
    },
  };
}

test('客户只能取消本人订单', async () => {
  const { service } = buildService({ ownedByCustomer: false });
  await assert.rejects(() => service.cancelForCustomer(OTHER_CUSTOMER, 9), NotFoundException);
});

test('存在待处理支付时拒绝取消，防止渠道扣款与取消竞态', async () => {
  const { service, events } = buildService({ pendingPayment: { paymentNo: 'PAY-1' } });
  await assert.rejects(() => service.cancelForCustomer(CUSTOMER, 9), ConflictException);
  assert.equal(events.length, 0);
});

test('客户取消未付款订单复用取消链路并记录审计事件', async () => {
  const harness = buildService();
  const { service, events } = harness;
  const cancelled = await service.cancelForCustomer(CUSTOMER, 9);
  const replayed = await service.cancelForCustomer(CUSTOMER, 9);
  assert.equal(cancelled?.id, 9);
  assert.equal(cancelled?.status, 'CANCELLED');
  assert.equal(replayed?.status, 'CANCELLED');
  const types = events.map((event) => event.eventType);
  assert.ok(types.includes('ORDER_CANCELLED'));
  const cancelledEvent = events.find((event) => event.eventType === 'ORDER_CANCELLED');
  assert.equal(cancelledEvent?.reason, '客户自助取消未付款订单');
  assert.equal(types.filter((type) => type === 'ORDER_CANCELLED').length, 1);
  assert.equal(harness.updateCalls, 1);
});

test('客户取消响应不返回后台内部字段', async () => {
  const { service } = buildService();
  const cancelled = (await service.cancelForCustomer(CUSTOMER, 9)) as Record<string, unknown>;
  assert.equal(cancelled.id, 9);
  assert.equal('internalNote' in cancelled, false);
  assert.equal('userId' in cancelled, false);
  assert.equal('salesConsultantId' in cancelled, false);
  assert.equal('source' in cancelled, false);
  assert.equal('paymentProof' in cancelled, false);
});

test('注销先提交后旧 principal 不能取消订单且不记录取消事件', async () => {
  const { service, events } = buildService({ activePrincipal: false });

  await assert.rejects(
    () => service.cancelForCustomer(CUSTOMER, 9),
    UnauthorizedException,
  );
  assert.equal(events.length, 0);
});
