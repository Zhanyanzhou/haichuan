import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReliableNotificationIntentService } from '../../common/notifications/reliable-notification-intent.service';
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
    { enqueueOrderLifecycle: async () => undefined } as never,
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
    { enqueueOrderLifecycle: async () => undefined } as never,
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
    { enqueueOrderLifecycle: async () => undefined } as never,
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
    warehouseId: 3,
    status: 'PENDING_PICK',
    carrier: null as string | null,
    trackingNo: null as string | null,
    shippedAt: null as Date | null,
    deliveredAt: null as Date | null,
    internalNote: null,
    order: {
      id: 9,
      orderNo: 'ORD-9',
      customerId: 7,
      customerEmail: null,
      finalAmount: 100,
      status: 'PENDING_SHIP',
      deliveryStatus: 'PENDING_SHIP',
      shippedAt: null as Date | null,
      receivedAt: null as Date | null,
    },
  };
  const tx = {
    $queryRaw: async () => [{ id: fulfillment.orderId }],
    fulfillment: {
      findUnique: async () => fulfillment,
      findMany: async () => [fulfillment],
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
    refund: { findFirst: async () => null },
    afterSalesCase: { findFirst: async () => null },
    order: {
      update: async ({ data }: any) => {
        Object.assign(fulfillment.order, data);
        Object.assign(orderUpdate, data);
        return fulfillment.order;
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
    { enqueueOrderLifecycle: async () => undefined } as never,
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
    refund: { findFirst: async () => null },
    afterSalesCase: { findFirst: async () => null },
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
    { enqueueOrderLifecycle: async () => undefined } as never,
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
  const order = {
    id: 9,
    orderNo: 'ORD-9',
    customerId: 7,
    customerEmail: null,
    finalAmount: 100,
    status: 'SHIPPED',
    deliveryStatus: 'SHIPPED',
    shippedAt: new Date('2026-09-07T00:00:00.000Z'),
    receivedAt: null as Date | null,
    logisticsCompany: '顺丰',
    logisticsNo: 'SF001',
  };
  const fulfillment = {
    id: 1,
    orderId: 9,
    warehouseId: 1,
    status: 'SHIPPED',
    carrier: '顺丰',
    trackingNo: 'SF001',
    shippedAt: order.shippedAt,
    deliveredAt: null as Date | null,
    abnormalReason: null as string | null,
    internalNote: null as string | null,
  };
  const events: Array<Record<string, unknown>> = [];
  let transactionTail = Promise.resolve();
  const tx: any = {
    $queryRaw: async () => [{ id: order.id }],
    fulfillment: {
      findUnique: async () => ({ ...fulfillment, order }),
      findMany: async () => [fulfillment],
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
      update: async ({ data }: any) => {
        Object.assign(order, data);
        return order;
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
    { enqueueOrderLifecycle: async () => undefined } as never,
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
  assert.equal(harness.events.length, 2);
  assert.equal(harness.events[0]?.eventType, 'FULFILLMENT_DELIVERED');
  assert.equal(harness.events[1]?.eventType, 'ORDER_RECEIVED');
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
  assert.equal(harness.events.length, 2);
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
  assert.equal(harness.events.length, 3);
});

function createMultiPackageHarness(
  statuses: string[],
  options: {
    refundStatus?: string;
    afterSalesStatus?: string;
    failEvent?: boolean;
    failNotification?: boolean;
  } = {},
) {
  const hasPending = statuses.some((status) =>
    ['PENDING_PICK', 'PENDING_CHECK', 'PENDING_SHIP'].includes(status),
  );
  const hasAbnormal = statuses.includes('ABNORMAL');
  const allDelivered = statuses.every((status) => status === 'DELIVERED');
  const order: any = {
    id: 41,
    orderNo: 'ORD-MULTI-41',
    customerId: 7,
    customerEmail: 'customer@example.com',
    finalAmount: 300,
    status: hasPending ? 'PENDING_SHIP' : 'SHIPPED',
    deliveryStatus: hasAbnormal
      ? 'ABNORMAL'
      : allDelivered
        ? 'RECEIVED'
        : hasPending
          ? 'PENDING_SHIP'
          : 'SHIPPED',
    shippedAt: hasPending ? null : new Date('2026-09-07T00:00:00.000Z'),
    receivedAt: allDelivered ? new Date('2026-09-07T01:00:00.000Z') : null,
    logisticsCompany: null,
    logisticsNo: null,
  };
  const fulfillments = statuses.map((status, index) => ({
    id: index + 1,
    orderId: order.id,
    fulfillmentNo: `FUL-${index + 1}`,
    warehouseId: index + 1,
    status,
    carrier: ['SHIPPED', 'ABNORMAL', 'DELIVERED'].includes(status) ? '顺丰速运' : null,
    trackingNo: ['SHIPPED', 'ABNORMAL', 'DELIVERED'].includes(status) ? `SF-${index + 1}` : null,
    shippedAt: ['SHIPPED', 'ABNORMAL', 'DELIVERED'].includes(status)
      ? new Date(`2026-09-07T00:0${index}:00.000Z`)
      : null,
    deliveredAt: status === 'DELIVERED'
      ? new Date(`2026-09-07T01:0${index}:00.000Z`)
      : null,
    abnormalReason: status === 'ABNORMAL' ? '运输延误' : null,
    internalNote: null,
  }));
  const events: Array<Record<string, any>> = [];
  const notifications: Array<Record<string, any>> = [];
  const notificationDeliveries: Array<Record<string, any>> = [];
  const outboxEvents: Array<Record<string, any>> = [];
  let transactionTail = Promise.resolve();

  const tx: any = {
    $queryRaw: async () => [{ id: order.id }],
    refund: {
      findFirst: async ({ where }: any) =>
        options.refundStatus && where.status.in.includes(options.refundStatus)
          ? { id: 91 }
          : null,
    },
    afterSalesCase: {
      findFirst: async ({ where }: any) =>
        options.afterSalesStatus && where.status.in.includes(options.afterSalesStatus)
          ? { id: 92 }
          : null,
    },
    fulfillment: {
      findUnique: async ({ where }: any) => {
        const fulfillment = fulfillments.find((item) => item.id === where.id);
        return fulfillment ? { ...fulfillment, order: { ...order } } : null;
      },
      findMany: async () => fulfillments.map((item) => ({ ...item })),
      count: async () => fulfillments.length,
      updateMany: async ({ where, data }: any) => {
        const fulfillment = fulfillments.find((item) => item.id === where.id);
        const allowedStatuses = Array.isArray(where.status?.in)
          ? where.status.in
          : [where.status];
        if (!fulfillment || !allowedStatuses.includes(fulfillment.status)) {
          return { count: 0 };
        }
        Object.assign(fulfillment, data);
        return { count: 1 };
      },
    },
    order: {
      update: async ({ data }: any) => {
        Object.assign(order, data);
        return order;
      },
    },
    notification: {
      create: async ({ data }: any) => {
        const notification = { id: notifications.length + 1, ...data };
        notifications.push(notification);
        return notification;
      },
    },
    notificationDelivery: {
      create: async ({ data }: any) => {
        notificationDeliveries.push(data);
        return data;
      },
    },
  };
  const prisma = {
    fulfillment: {
      findUnique: async ({ where }: any) => {
        const fulfillment = fulfillments.find((item) => item.id === where.id);
        return fulfillment ? { orderId: fulfillment.orderId } : null;
      },
    },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      const orderBefore = { ...order };
      const fulfillmentBefore = fulfillments.map((item) => ({ ...item }));
      const eventCount = events.length;
      const notificationCount = notifications.length;
      const deliveryCount = notificationDeliveries.length;
      const outboxCount = outboxEvents.length;
      try {
        return await callback(tx);
      } catch (error) {
        Object.assign(order, orderBefore);
        fulfillments.forEach((item, index) => Object.assign(item, fulfillmentBefore[index]));
        events.length = eventCount;
        notifications.length = notificationCount;
        notificationDeliveries.length = deliveryCount;
        outboxEvents.length = outboxCount;
        throw error;
      } finally {
        release();
      }
    },
  } as unknown as PrismaService;
  const reliableNotifications = new ReliableNotificationIntentService({
    enqueue: async (_tx: unknown, input: Record<string, unknown>) => {
      if (options.failNotification) throw new Error('notification failed');
      outboxEvents.push(input);
      return input;
    },
  } as never);
  const service = new FulfillmentService(
    prisma,
    {
      record: async (_tx: unknown, event: Record<string, unknown>) => {
        if (options.failEvent) throw new Error('trade event failed');
        events.push(event);
      },
    } as never,
    reliableNotifications,
  );
  return {
    service,
    order,
    fulfillments,
    events,
    notifications,
    notificationDeliveries,
    outboxEvents,
  };
}

test('多包裹首包保持待发货且末包才提升整单，每包各产生一次通知', async () => {
  const harness = createMultiPackageHarness(['PENDING_PICK', 'PENDING_SHIP']);

  await harness.service.dispatch(
    1,
    { carrier: '顺丰速运', trackingNo: 'SF-1' },
    { type: 'ADMIN', id: 1 },
  );
  assert.equal(harness.order.status, 'PENDING_SHIP');
  assert.equal(harness.order.deliveryStatus, 'PENDING_SHIP');
  assert.equal(harness.order.shippedAt, null);
  assert.equal(harness.order.logisticsCompany, null);
  assert.equal(harness.order.logisticsNo, null);

  await harness.service.dispatch(
    2,
    { carrier: '京东物流', trackingNo: 'JD-2' },
    { type: 'ADMIN', id: 1 },
  );
  assert.equal(harness.order.status, 'SHIPPED');
  assert.equal(harness.order.deliveryStatus, 'SHIPPED');
  assert.ok(harness.order.shippedAt instanceof Date);
  assert.equal(harness.order.logisticsCompany, null);
  assert.equal(harness.order.logisticsNo, null);
  assert.deepEqual(
    harness.notifications.map((item) => item.payload.fulfillmentId),
    [1, 2],
  );
  assert.equal(harness.notificationDeliveries.length, 4);
  assert.deepEqual(
    harness.outboxEvents.map((item) => item.deduplicationKey),
    ['order.shipped:1', 'order.shipped:2'],
  );
  assert.equal(harness.events.filter((item) => item.eventType === 'SHIPMENT_DISPATCHED').length, 2);
});

test('相同物流信息重放零写', async () => {
  const harness = createMultiPackageHarness(['PENDING_PICK']);
  await harness.service.dispatch(
    1,
    { carrier: '顺丰速运', trackingNo: 'SF-1' },
    { type: 'ADMIN', id: 1 },
  );
  const shippedAt = harness.fulfillments[0].shippedAt;
  const eventCount = harness.events.length;
  const notificationCount = harness.notifications.length;
  const deliveryCount = harness.notificationDeliveries.length;
  const outboxCount = harness.outboxEvents.length;

  await harness.service.dispatch(
    1,
    { carrier: '顺丰速运', trackingNo: 'SF-1', internalNote: '重试不应写入' },
    { type: 'ADMIN', id: 1 },
  );
  assert.equal(harness.fulfillments[0].shippedAt, shippedAt);
  assert.equal(harness.events.length, eventCount);
  assert.equal(harness.notifications.length, notificationCount);
  assert.equal(harness.notificationDeliveries.length, deliveryCount);
  assert.equal(harness.outboxEvents.length, outboxCount);
});

for (const conflictCase of [
  {
    name: '仅承运商变化',
    carrier: '京东物流',
    trackingNo: 'SF-1',
  },
  {
    name: '仅运单号变化',
    carrier: '顺丰速运',
    trackingNo: 'SF-CHANGED',
  },
]) {
  test(`已发货包裹${conflictCase.name}时以 409 语义拒绝且零写`, async () => {
    const harness = createMultiPackageHarness(['PENDING_PICK']);
    await harness.service.dispatch(
      1,
      { carrier: '顺丰速运', trackingNo: 'SF-1' },
      { type: 'ADMIN', id: 1 },
    );
    const fulfillmentBefore = { ...harness.fulfillments[0] };
    const orderBefore = { ...harness.order };
    const eventCount = harness.events.length;
    const notificationCount = harness.notifications.length;
    const deliveryCount = harness.notificationDeliveries.length;
    const outboxCount = harness.outboxEvents.length;

    await assert.rejects(
      () => harness.service.dispatch(
        1,
        {
          carrier: conflictCase.carrier,
          trackingNo: conflictCase.trackingNo,
        },
        { type: 'ADMIN', id: 1 },
      ),
      /物流信息不一致/,
    );

    assert.deepEqual(harness.fulfillments[0], fulfillmentBefore);
    assert.deepEqual(harness.order, orderBefore);
    assert.equal(harness.events.length, eventCount);
    assert.equal(harness.notifications.length, notificationCount);
    assert.equal(harness.notificationDeliveries.length, deliveryCount);
    assert.equal(harness.outboxEvents.length, outboxCount);
  });
}

test('活动退款或售后只阻断新增发货', async () => {
  const activeCases = [
    ...['PENDING', 'APPROVED', 'PROCESSING'].map((refundStatus) => ({ refundStatus })),
    ...['REQUESTED', 'APPROVED', 'RETURNING', 'QC_PASSED', 'QC_FAILED']
      .map((afterSalesStatus) => ({ afterSalesStatus })),
  ];
  for (const options of activeCases) {
    const harness = createMultiPackageHarness(['PENDING_PICK'], options);
    await assert.rejects(
      () => harness.service.dispatch(
        1,
        { carrier: '顺丰速运', trackingNo: 'SF-1' },
        { type: 'ADMIN', id: 1 },
      ),
      /退款或售后/,
    );
    assert.equal(harness.fulfillments[0].status, 'PENDING_PICK');
    assert.equal(harness.events.length, 0);
    assert.equal(harness.notifications.length, 0);
  }

  for (const options of [
    { refundStatus: 'COMPLETED' },
    { refundStatus: 'REJECTED' },
    { refundStatus: 'FAILED' },
    { afterSalesStatus: 'REJECTED' },
    { afterSalesStatus: 'COMPLETED' },
    { afterSalesStatus: 'CANCELLED' },
  ]) {
    const terminal = createMultiPackageHarness(['PENDING_PICK'], options);
    await terminal.service.dispatch(
      1,
      { carrier: '顺丰速运', trackingNo: 'SF-1' },
      { type: 'ADMIN', id: 1 },
    );
    assert.equal(terminal.fulfillments[0].status, 'SHIPPED');
  }

  const inTransit = createMultiPackageHarness(['SHIPPED'], { refundStatus: 'PENDING' });
  await inTransit.service.updateStatus(
    1,
    { status: 'ABNORMAL', abnormalReason: '运输延误' },
    { type: 'ADMIN', id: 1 },
  );
  assert.equal(inTransit.fulfillments[0].status, 'ABNORMAL');
});

test('TradeEvent 或可靠通知失败时包裹与订单聚合一起回滚', async () => {
  for (const options of [{ failEvent: true }, { failNotification: true }]) {
    const harness = createMultiPackageHarness(['PENDING_PICK'], options);
    await assert.rejects(
      () => harness.service.dispatch(
        1,
        { carrier: '顺丰速运', trackingNo: 'SF-1' },
        { type: 'ADMIN', id: 1 },
      ),
    );
    assert.equal(harness.fulfillments[0].status, 'PENDING_PICK');
    assert.equal(harness.fulfillments[0].shippedAt, null);
    assert.equal(harness.order.status, 'PENDING_SHIP');
    assert.equal(harness.order.deliveryStatus, 'PENDING_SHIP');
    assert.equal(harness.events.length, 0);
    assert.equal(harness.notifications.length, 0);
  }
});

test('多包裹部分送达不签收，异常优先且全送达后订单主状态仍为已发货', async () => {
  const partial = createMultiPackageHarness(['SHIPPED', 'PENDING_SHIP']);
  await partial.service.updateStatus(
    1,
    { status: 'DELIVERED' },
    { type: 'ADMIN', id: 1 },
  );
  assert.equal(partial.order.status, 'PENDING_SHIP');
  assert.equal(partial.order.deliveryStatus, 'PENDING_SHIP');
  assert.equal(partial.order.receivedAt, null);

  const harness = createMultiPackageHarness(['SHIPPED', 'SHIPPED']);
  await harness.service.updateStatus(
    1,
    { status: 'ABNORMAL', abnormalReason: '运输延误' },
    { type: 'ADMIN', id: 1 },
  );
  await harness.service.updateStatus(
    2,
    { status: 'DELIVERED' },
    { type: 'ADMIN', id: 1 },
  );
  assert.equal(harness.order.deliveryStatus, 'ABNORMAL');
  assert.equal(harness.order.receivedAt, null);

  await harness.service.updateStatus(
    1,
    { status: 'DELIVERED' },
    { type: 'ADMIN', id: 1 },
  );
  assert.equal(harness.order.status, 'SHIPPED');
  assert.equal(harness.order.deliveryStatus, 'RECEIVED');
  assert.ok(harness.order.receivedAt instanceof Date);
  assert.equal(harness.events.filter((item) => item.eventType === 'ORDER_RECEIVED').length, 1);
});

test('并发发出不同包裹按订单锁串行聚合且每包通知一次', async () => {
  const harness = createMultiPackageHarness(['PENDING_PICK', 'PENDING_PICK']);
  await Promise.all([
    harness.service.dispatch(
      1,
      { carrier: '顺丰速运', trackingNo: 'SF-1' },
      { type: 'ADMIN', id: 1 },
    ),
    harness.service.dispatch(
      2,
      { carrier: '京东物流', trackingNo: 'JD-2' },
      { type: 'ADMIN', id: 2 },
    ),
  ]);
  assert.equal(harness.order.status, 'SHIPPED');
  assert.equal(harness.order.deliveryStatus, 'SHIPPED');
  assert.equal(harness.notifications.length, 2);
  assert.equal(harness.events.filter((item) => item.eventType === 'SHIPMENT_DISPATCHED').length, 2);
});

test('不同包裹并发送达与异常按订单锁串行聚合且异常胜出', async () => {
  const harness = createMultiPackageHarness(['SHIPPED', 'SHIPPED']);

  await Promise.all([
    harness.service.updateStatus(
      1,
      { status: 'DELIVERED' },
      { type: 'ADMIN', id: 1 },
    ),
    harness.service.updateStatus(
      2,
      { status: 'ABNORMAL', abnormalReason: '并发运输异常' },
      { type: 'ADMIN', id: 2 },
    ),
  ]);

  assert.equal(harness.fulfillments[0].status, 'DELIVERED');
  assert.equal(harness.fulfillments[1].status, 'ABNORMAL');
  assert.equal(harness.order.status, 'SHIPPED');
  assert.equal(harness.order.deliveryStatus, 'ABNORMAL');
  assert.equal(harness.order.receivedAt, null);
  assert.equal(
    harness.events.filter((item) => item.eventType === 'ORDER_RECEIVED').length,
    0,
  );
});
