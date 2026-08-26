import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FulfillmentService } from './fulfillment.service';

test('履约中心发货同时同步订单主状态与发货维度', async () => {
  const orderUpdate: Record<string, unknown> = {};
  const fulfillment = {
    id: 1,
    orderId: 9,
    status: 'PENDING_PICK',
    internalNote: null,
    order: { id: 9, status: 'PENDING_SHIP' },
  };
  const tx = {
    fulfillment: {
      findUnique: async () => fulfillment,
      updateMany: async () => ({ count: 1 }),
    },
    order: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(orderUpdate, data);
      },
    },
  };
  const service = new FulfillmentService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    { record: async () => undefined } as never,
  );

  await service.dispatch(
    1,
    { carrier: '顺丰', trackingNo: 'SF001' },
    { type: 'ADMIN', id: 1 },
  );

  assert.equal(orderUpdate?.status, 'SHIPPED');
  assert.equal(orderUpdate?.deliveryStatus, 'SHIPPED');
  assert.equal(orderUpdate?.logisticsNo, 'SF001');
});

function createDeliveryHarness() {
  const fulfillment = {
    id: 1,
    orderId: 9,
    status: 'SHIPPED',
    deliveredAt: null as Date | null,
    order: { id: 9, status: 'SHIPPED' },
  };
  const order = {
    id: 9,
    status: 'SHIPPED',
    deliveryStatus: 'SHIPPED',
    receivedAt: null as Date | null,
  };
  const events: Array<Record<string, unknown>> = [];
  let transactionTail = Promise.resolve();
  const tx: any = {
    $queryRaw: async () => [{ id: order.id }],
    fulfillment: {
      findUnique: async () => fulfillment,
      updateMany: async ({ where, data }: any) => {
        if (where.status !== fulfillment.status) return { count: 0 };
        Object.assign(fulfillment, data);
        return { count: 1 };
      },
    },
    order: {
      updateMany: async ({ where, data }: any) => {
        if (where.status !== order.status) return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
      },
    },
  };
  const service = new FulfillmentService(
    {
      fulfillment: {
        findUnique: async () => ({ orderId: fulfillment.orderId }),
      },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
        const previous = transactionTail;
        let release!: () => void;
        transactionTail = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        try {
          return await callback(tx);
        } finally {
          release();
        }
      },
    } as unknown as PrismaService,
    {
      record: async (_tx: unknown, event: Record<string, unknown>) => {
        events.push(event);
      },
    } as never,
  );
  return { service, fulfillment, order, events };
}

test('履约送达在同一事务同步订单签收维度且不推进订单主状态', async () => {
  const harness = createDeliveryHarness();

  await harness.service.updateStatus(
    1,
    { status: 'DELIVERED' },
    { type: 'ADMIN', id: 1 },
  );

  assert.equal(harness.fulfillment.status, 'DELIVERED');
  assert.ok(harness.fulfillment.deliveredAt instanceof Date);
  assert.equal(harness.order.status, 'SHIPPED');
  assert.equal(harness.order.deliveryStatus, 'RECEIVED');
  assert.equal(
    harness.order.receivedAt?.getTime(),
    harness.fulfillment.deliveredAt?.getTime(),
  );
  assert.equal(harness.events.length, 1);
  assert.equal(harness.events[0]?.eventType, 'FULFILLMENT_DELIVERED');
});

test('并发或重复送达幂等且只记录一次送达事件', async () => {
  const harness = createDeliveryHarness();

  const results = await Promise.all([
    harness.service.updateStatus(1, { status: 'DELIVERED' }, { type: 'ADMIN', id: 1 }),
    harness.service.updateStatus(1, { status: 'DELIVERED' }, { type: 'ADMIN', id: 1 }),
  ]);

  assert.equal(results.length, 2);
  assert.equal(harness.fulfillment.status, 'DELIVERED');
  assert.equal(harness.order.deliveryStatus, 'RECEIVED');
  assert.equal(harness.order.status, 'SHIPPED');
  assert.equal(harness.events.length, 1);
});
