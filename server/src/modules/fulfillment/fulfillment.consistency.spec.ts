import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FulfillmentService } from './fulfillment.service';

test('仓储履约列表只查询最小订单投影并脱敏手机号', async () => {
  let query: any;
  const service = new FulfillmentService(
    {
      fulfillment: {
        findMany: async (args: any) => {
          query = args;
          return [{
            id: 1,
            fulfillmentNo: 'F001',
            orderId: 9,
            status: 'PENDING_SHIP',
            carrier: null,
            trackingNo: null,
            shippedAt: null,
            deliveredAt: null,
            abnormalReason: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            order: {
              id: 9,
              orderNo: 'O001',
              status: 'PENDING_SHIP',
              deliveryStatus: 'PENDING_SHIP',
              customerName: '测试客户',
              customerPhone: '13812345678',
            },
          }];
        },
        count: async () => 1,
      },
    } as unknown as PrismaService,
    { record: async () => undefined } as never,
  );

  const result = await service.findAll({});
  assert.equal(result.list[0]?.order.customerPhone, '138****5678');
  assert.equal(query.include, undefined);
  assert.equal(query.select.order.select.finalAmount, undefined);
  assert.equal(query.select.order.select.customerEmail, undefined);
  assert.equal(query.select.order.select.payments, undefined);
  assert.equal(query.select.order.select.refunds, undefined);
  assert.equal(query.select.order.select.internalNote, undefined);
});

test('仓储履约详情不查询金额支付字段，终态隐藏完整联系方式', async () => {
  let query: any;
  const service = new FulfillmentService(
    {
      fulfillment: {
        findUnique: async (args: any) => {
          query = args;
          return {
            id: 1,
            fulfillmentNo: 'F001',
            orderId: 9,
            status: 'DELIVERED',
            carrier: '顺丰',
            trackingNo: 'SF001',
            shippedAt: new Date(),
            deliveredAt: new Date(),
            abnormalReason: null,
            internalNote: '已复核证书',
            createdAt: new Date(),
            updatedAt: new Date(),
            order: {
              id: 9,
              orderNo: 'O001',
              status: 'SHIPPED',
              deliveryStatus: 'RECEIVED',
              customerName: '测试客户',
              customerPhone: '13812345678',
              address: '隔离测试地址',
              items: [{
                id: 1,
                quantity: 1,
                productNameSnapshot: '测试商品',
                productImageSnapshot: null,
                productCodeSnapshot: 'P001',
                skuSnapshot: 'S001',
                actualWeight: null,
                certNumber: null,
              }],
            },
          };
        },
      },
    } as unknown as PrismaService,
    { record: async () => undefined } as never,
  );

  const result = await service.findById(1);
  assert.equal(result.order.customerPhone, '138****5678');
  assert.equal(result.order.address, null);
  assert.equal(result.warehouseNote, '已复核证书');
  assert.equal('internalNote' in result, false);
  assert.equal(query.include, undefined);
  for (const field of ['finalAmount', 'totalAmount', 'paidAmount', 'refundedAmount', 'customerEmail', 'payments', 'refunds', 'internalNote']) {
    assert.equal(query.select.order.select[field], undefined, `履约详情不可查询 ${field}`);
  }
  assert.equal(query.select.order.select.items.select.unitPrice, undefined);
  assert.equal(query.select.order.select.items.select.subtotal, undefined);
});

test('仓储履约详情仅在未送达时返回完成发货所需联系方式', async () => {
  const service = new FulfillmentService(
    {
      fulfillment: {
        findUnique: async () => ({
          id: 1,
          fulfillmentNo: 'F001',
          orderId: 9,
          status: 'PENDING_SHIP',
          carrier: null,
          trackingNo: null,
          shippedAt: null,
          deliveredAt: null,
          abnormalReason: null,
          internalNote: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          order: {
            id: 9,
            orderNo: 'O001',
            status: 'PENDING_SHIP',
            deliveryStatus: 'PENDING_SHIP',
            customerName: '测试客户',
            customerPhone: '13812345678',
            address: '隔离测试地址',
            items: [],
          },
        }),
      },
    } as unknown as PrismaService,
    { record: async () => undefined } as never,
  );

  const result = await service.findById(1);
  assert.equal(result.order.customerPhone, '13812345678');
  assert.equal(result.order.address, '隔离测试地址');
});

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
    $queryRaw: async () => [{ id: fulfillment.orderId }],
    fulfillment: {
      findUnique: async () => fulfillment,
      updateMany: async ({ where, data }: any) => {
        const allowedStatuses = Array.isArray(where.status?.in)
          ? where.status.in
          : [where.status];
        if (where.id !== fulfillment.id || !allowedStatuses.includes(fulfillment.status)) {
          return { count: 0 };
        }
        Object.assign(fulfillment, data);
        return { count: 1 };
      },
    },
    order: {
      updateMany: async ({ where, data }: any) => {
        if (where.id !== fulfillment.order.id || where.status !== fulfillment.order.status) {
          return { count: 0 };
        }
        Object.assign(orderUpdate, data);
        return { count: 1 };
      },
    },
  };
  const service = new FulfillmentService(
    {
      fulfillment: {
        findUnique: async () => ({ orderId: fulfillment.orderId }),
      },
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

test('并发发货抢占失败时拒绝继续更新订单', async () => {
  let orderUpdates = 0;
  const fulfillment = {
    id: 1,
    orderId: 9,
    status: 'PENDING_PICK',
    internalNote: null,
    order: { id: 9, status: 'PENDING_SHIP' },
  };
  const tx = {
    $queryRaw: async () => [{ id: fulfillment.orderId }],
    fulfillment: {
      findUnique: async () => fulfillment,
      updateMany: async () => ({ count: 0 }),
    },
    order: {
      updateMany: async () => {
        orderUpdates += 1;
        return { count: 1 };
      },
    },
  };
  const service = new FulfillmentService(
    {
      fulfillment: {
        findUnique: async () => ({ orderId: fulfillment.orderId }),
      },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    { record: async () => undefined } as never,
  );

  await assert.rejects(
    () => service.dispatch(
      1,
      { carrier: '顺丰', trackingNo: 'SF001' },
      { type: 'ADMIN', id: 1 },
    ),
    /履约单状态已变化/,
  );
  assert.equal(orderUpdates, 0);
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
        const allowed = Array.isArray(where.status?.in)
          ? where.status.in
          : [where.status];
        if (!allowed.includes(fulfillment.status)) return { count: 0 };
        Object.assign(fulfillment, data);
        return { count: 1 };
      },
    },
    order: {
      updateMany: async ({ where, data }: any) => {
        const allowedStatus = Array.isArray(where.status?.in)
          ? where.status.in
          : [where.status];
        const allowedDelivery = Array.isArray(where.deliveryStatus?.in)
          ? where.deliveryStatus.in
          : where.deliveryStatus === undefined
            ? [order.deliveryStatus]
            : [where.deliveryStatus];
        if (
          !allowedStatus.includes(order.status) ||
          !allowedDelivery.includes(order.deliveryStatus)
        ) return { count: 0 };
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

test('物流异常只能从已发货进入，且可在送达后恢复订单签收维度', async () => {
  const harness = createDeliveryHarness();

  await harness.service.updateStatus(
    1,
    { status: 'ABNORMAL', abnormalReason: '中转延误' },
    { type: 'ADMIN', id: 1 },
  );
  assert.equal(harness.fulfillment.status, 'ABNORMAL');
  assert.equal(harness.order.deliveryStatus, 'ABNORMAL');

  await harness.service.updateStatus(
    1,
    { status: 'DELIVERED' },
    { type: 'ADMIN', id: 1 },
  );
  assert.equal(harness.fulfillment.status, 'DELIVERED');
  assert.equal(harness.order.deliveryStatus, 'RECEIVED');
  assert.equal(harness.events.length, 2);
});
