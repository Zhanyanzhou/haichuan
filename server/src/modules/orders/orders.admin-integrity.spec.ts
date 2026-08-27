import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from './orders.service';

function createHarness() {
  const order: any = {
    id: 1,
    orderNo: 'ORD-1',
    status: 'PENDING_PAYMENT',
    deliveryStatus: 'NONE',
    receivedAt: null,
    totalAmount: new Prisma.Decimal(100),
    discountAmount: new Prisma.Decimal(0),
    adjustmentAmount: new Prisma.Decimal(0),
    finalAmount: new Prisma.Decimal(100),
    depositAmount: new Prisma.Decimal(0),
    balanceAmount: new Prisma.Decimal(0),
    paidAmount: new Prisma.Decimal(0),
    updatedAt: new Date('2026-08-26T00:00:00.000Z'),
    customerEmail: null,
    customerName: '测试客户',
  };
  const fulfillment: any = {
    id: 5,
    orderId: 1,
    status: 'SHIPPED',
    deliveredAt: null,
  };
  const events: Array<Record<string, unknown>> = [];
  const operationLogs: Array<Record<string, unknown>> = [];
  let blockingPayment: { paymentNo: string; status: string } | null = null;

  const matches = (actual: string, expected: any) =>
    typeof expected === 'string'
      ? actual === expected
      : expected?.in
        ? expected.in.includes(actual)
        : true;
  const tx: any = {
    $queryRaw: async () => [{ id: order.id }],
    order: {
      fields: { finalAmount: Symbol('finalAmount') },
      findUnique: async () => order,
      findMany: async () => [{ orderNo: order.orderNo }],
      update: async ({ data }: any) => Object.assign(order, data),
      updateMany: async ({ where, data }: any) => {
        if (
          (where.status && !matches(order.status, where.status)) ||
          (where.deliveryStatus && !matches(order.deliveryStatus, where.deliveryStatus)) ||
          (where.updatedAt && where.updatedAt !== order.updatedAt)
        ) return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
      },
    },
    payment: {
      findFirst: async () => blockingPayment,
    },
    fulfillment: {
      findFirst: async () => fulfillment,
      findMany: async () => [fulfillment],
      updateMany: async ({ where, data }: any) => {
        if (!matches(fulfillment.status, where.status)) return { count: 0 };
        Object.assign(fulfillment, data);
        return { count: 1 };
      },
    },
    operationLog: {
      create: async ({ data }: any) => {
        operationLogs.push(data);
        return data;
      },
    },
  };
  const prisma: any = {
    ...tx,
    $transaction: async (callback: (client: any) => Promise<unknown>) => callback(tx),
  };
  const service = new OrdersService(
    prisma as PrismaService,
    {
      record: async (_tx: unknown, event: Record<string, unknown>) => {
        events.push(event);
      },
    } as never,
    { send: async () => undefined, renderShell: (v: string) => v, getSiteBaseUrl: () => '' } as never,
    {} as never,
    {} as never,
  );
  return {
    service,
    order,
    fulfillment,
    events,
    operationLogs,
    setBlockingPayment(value: typeof blockingPayment) {
      blockingPayment = value;
    },
  };
}

const admin = { type: 'ADMIN' as const, id: 7, name: '审核员' };

test('订单金额只能在无待处理或已确认付款时修改，并保持金额公式一致', async () => {
  const harness = createHarness();
  harness.setBlockingPayment({ paymentNo: 'PAY-1', status: 'PENDING' });
  await assert.rejects(
    () => harness.service.updateAmount(1, { finalAmount: 90, reason: '议价' }, admin),
    ConflictException,
  );

  harness.setBlockingPayment(null);
  await harness.service.updateAmount(1, { finalAmount: 90, reason: '议价' }, admin);
  assert.equal(Number(harness.order.finalAmount), 90);
  assert.equal(Number(harness.order.adjustmentAmount), -10);
  assert.equal(harness.events.at(-1)?.eventType, 'ORDER_AMOUNT_EDITED');

  await assert.rejects(
    () => harness.service.updateAmount(
      1,
      { finalAmount: 80, adjustmentAmount: 0, reason: '不一致输入' },
      admin,
    ),
    BadRequestException,
  );
});

test('订单中心签收同步履约单，完成订单必须以送达事实为前置', async () => {
  const harness = createHarness();
  harness.order.status = 'SHIPPED';
  harness.order.deliveryStatus = 'SHIPPED';

  await assert.rejects(
    () => harness.service.updateStatus(1, { status: 'COMPLETED', operator: admin }),
    BadRequestException,
  );

  await harness.service.confirmReceive(1, admin);
  assert.equal(harness.order.deliveryStatus, 'RECEIVED');
  assert.equal(harness.fulfillment.status, 'DELIVERED');

  await harness.service.updateStatus(1, { status: 'COMPLETED', operator: admin });
  assert.equal(harness.order.status, 'COMPLETED');
  assert.equal(harness.events.at(-1)?.eventType, 'ORDER_COMPLETED');
});

test('订单导出与操作日志同一事务，并拒绝缺少审计操作人', async () => {
  const harness = createHarness();
  const rows = await harness.service.findAllForExport({}, admin);
  assert.equal(rows.length, 1);
  assert.equal(harness.operationLogs[0]?.action, 'export');
  assert.equal(harness.operationLogs[0]?.module, 'orders');

  await assert.rejects(
    () => harness.service.findAllForExport({}, { type: 'ADMIN' }),
    BadRequestException,
  );
});
