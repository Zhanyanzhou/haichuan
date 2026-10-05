import assert from 'node:assert/strict';
import test from 'node:test';
import { OrdersService } from './orders.service';

function createService(orders: Array<Record<string, unknown>>) {
  let capturedWhere: Record<string, unknown> | undefined;
  const tx = {
    $queryRaw: async () => [{ id: 7, username: 'finance-reader' }],
    order: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        capturedWhere = where;
        return orders;
      },
      count: async () => orders.length,
    },
  };
  const prisma = {
    ...tx,
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };
  const service = new OrdersService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, getWhere: () => capturedWhere };
}

test('异常订单只把真实待发货维度纳入 48 小时未发货条件', async () => {
  const old = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const { service, getWhere } = createService([
    {
      id: 1,
      status: 'PENDING_SHIP',
      deliveryStatus: 'PENDING_SHIP',
      orderType: 'SPOT',
      customStage: null,
      createdAt: old,
      paymentConfirmedAt: old,
      payments: [],
    },
  ]);

  const result = await service.findAnomalies({ id: 7 });
  const where = getWhere() as { OR: Array<Record<string, unknown>> };
  assert.equal(where.OR[2].status, 'PENDING_SHIP');
  assert.equal(where.OR[2].deliveryStatus, 'PENDING_SHIP');
  assert.ok((where.OR[2].paymentConfirmedAt as { lt: unknown }).lt instanceof Date);
  assert.deepEqual(result.list[0].anomalyReasons, ['超时未发货']);
});

test('定制或合作订单处于生产聚合状态但交付维度为 NONE 时不误报超时未发货', async () => {
  const oldPayment = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const recentOrder = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const { service } = createService([
    {
      id: 2,
      status: 'PENDING_SHIP',
      deliveryStatus: 'NONE',
      orderType: 'CUSTOM',
      quoteChannel: 'PARTNER_WAX',
      customStage: 'BALANCE_PAID',
      createdAt: recentOrder,
      paymentConfirmedAt: oldPayment,
      payments: [],
    },
  ]);

  const result = await service.findAnomalies({ id: 7 });
  assert.equal(result.list[0].anomalyReasons.includes('超时未发货'), false);
});

test('已绑定分期标签与 Payment.type 不一致时进入异常中心且不泄漏内部计划投影', async () => {
  const recent = new Date();
  const { service, getWhere } = createService([
    {
      id: 3,
      status: 'PENDING_PAYMENT',
      deliveryStatus: 'NONE',
      orderType: 'CUSTOM',
      customStage: 'PENDING_DEPOSIT',
      createdAt: recent,
      paymentConfirmedAt: null,
      payments: [],
      paymentPlans: [{
        installments: [{ label: '定金', payment: { type: 'FULL' } }],
      }],
    },
  ]);

  const result = await service.findAnomalies({ id: 7 });
  const where = getWhere() as { OR: Array<Record<string, unknown>> };

  assert.ok(where.OR.at(-1)?.paymentPlans);
  assert.deepEqual(result.list[0].anomalyReasons, ['付款角色与分期不一致']);
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.list[0], 'paymentPlans'),
    false,
  );
});
