import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from './orders.service';
import { TradeEventsService } from '../trade-events/trade-events.service';

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
} = {}) {
  const events: Array<{ eventType: string; reason?: string | null }> = [];
  const orderFindUniqueCalls: Array<Record<string, unknown>> = [];
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    order: {
      findUnique: async () => {
        orderFindUniqueCalls.push({});
        return ORDER;
      },
      updateMany: async ({ where }: { where: { status: string; paidAmount: number } }) => {
        orderFindUniqueCalls.push({ updateWhere: where });
        assert.equal(where.status, 'PENDING_PAYMENT');
        assert.equal(where.paidAmount, 0);
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
  return { service, events };
}

test('客户只能取消本人订单', async () => {
  const { service } = buildService({ ownedByCustomer: false });
  await assert.rejects(() => service.cancelForCustomer(8, 9), NotFoundException);
});

test('存在待处理支付时拒绝取消，防止渠道扣款与取消竞态', async () => {
  const { service, events } = buildService({ pendingPayment: { paymentNo: 'PAY-1' } });
  await assert.rejects(() => service.cancelForCustomer(7, 9), ConflictException);
  assert.equal(events.length, 0);
});

test('客户取消未付款订单复用取消链路并记录审计事件', async () => {
  const { service, events } = buildService();
  const cancelled = await service.cancelForCustomer(7, 9);
  assert.equal(cancelled?.id, 9);
  const types = events.map((event) => event.eventType);
  assert.ok(types.includes('ORDER_CANCELLED'));
  const cancelledEvent = events.find((event) => event.eventType === 'ORDER_CANCELLED');
  assert.equal(cancelledEvent?.reason, '客户自助取消未付款订单');
});

test('客户取消响应不返回后台内部字段', async () => {
  const { service } = buildService();
  const cancelled = (await service.cancelForCustomer(7, 9)) as Record<string, unknown>;
  assert.equal(cancelled.id, 9);
  assert.equal('internalNote' in cancelled, false);
  assert.equal('userId' in cancelled, false);
  assert.equal('salesConsultantId' in cancelled, false);
  assert.equal('source' in cancelled, false);
  assert.equal('paymentProof' in cancelled, false);
});
