import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TradeEventsService } from '../trade-events/trade-events.service';
import { OrdersService } from './orders.service';
import { RefundsService } from '../refunds/refunds.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
const { validateTarget } = require('../../../scripts/run-real-mysql-tests.cjs');

const databaseUrl = process.env.TRADE_REAL_DB_URL;

test(
  '真实 MySQL：行锁串行化签收与退款额度，审计失败回滚金额修改',
  { skip: !databaseUrl },
  async () => {
    assert.equal(databaseUrl, validateTarget(process.env), '交易测试必须使用显式隔离库');
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    const prefix = `TRADE-${randomUUID().slice(0, 8)}`;
    const tradeEvents = new TradeEventsService(prisma as unknown as PrismaService);
    const mailer = {
      send: async () => undefined,
      renderShell: (value: string) => value,
      getSiteBaseUrl: () => '',
    };
    const fulfillment = new FulfillmentService(
      prisma as unknown as PrismaService,
      tradeEvents,
      { enqueueOrderLifecycle: async () => undefined } as never,
    );
    const orders = new OrdersService(
      prisma as unknown as PrismaService,
      tradeEvents,
      mailer as never,
      {} as never,
      {} as never,
      fulfillment,
    );
    const refunds = new RefundsService(
      prisma as unknown as PrismaService,
      tradeEvents,
      { isRefundCreationEnabled: () => false } as never,
      { get: () => undefined } as never,
    );

    await prisma.$connect();
    try {
      const warehouse = await prisma.warehouse.create({
        data: { name: `${prefix}-WAREHOUSE`, type: 'STORE', isActive: true },
      });
      const orderSnapshot = {
        shippingAddressSnapshot: {
          version: 1,
          recipientName: '隔离测试客户',
          recipientPhone: '13800000000',
          detail: '隔离测试地址',
        },
        pricingSnapshot: {
          version: 1,
          currency: 'CNY',
          itemSubtotalCents: 10000,
          discountCents: 0,
          shippingCents: 0,
          insuranceCents: 0,
          taxCents: 0,
          adjustmentCents: 0,
          finalCents: 10000,
        },
      };
      const actors = await Promise.all([
        prisma.user.create({
          data: {
            username: `${prefix}-actor-a`,
            password: 'isolated-test-only',
            role: 'ADMIN',
          },
        }),
        prisma.user.create({
          data: {
            username: `${prefix}-actor-b`,
            password: 'isolated-test-only',
            role: 'ADMIN',
          },
        }),
      ]);
      const shipped = await prisma.order.create({
        data: {
          orderNo: `${prefix}-SHIP`,
          customerName: '隔离测试客户',
          customerPhone: '13800000000',
          address: '隔离测试地址',
          totalAmount: 100,
          finalAmount: 100,
          paidAmount: 100,
          status: 'SHIPPED',
          deliveryStatus: 'SHIPPED',
          ...orderSnapshot,
        },
      });
      await prisma.fulfillment.create({
        data: {
          fulfillmentNo: `${prefix}-FUL`,
          orderId: shipped.id,
          warehouseId: warehouse.id,
          status: 'SHIPPED',
          carrier: 'TEST',
          trackingNo: `${prefix}-TRACK`,
          shippedAt: new Date(),
        },
      });

      const receiveResults = await Promise.all([
        orders.confirmReceive(shipped.id, { type: 'ADMIN', id: actors[0].id }),
        orders.confirmReceive(shipped.id, { type: 'ADMIN', id: actors[1].id }),
      ]);
      assert.equal(receiveResults.length, 2);
      const delivered = await prisma.fulfillment.findFirstOrThrow({
        where: { orderId: shipped.id },
      });
      const received = await prisma.order.findUniqueOrThrow({ where: { id: shipped.id } });
      assert.equal(delivered.status, 'DELIVERED');
      assert.equal(received.deliveryStatus, 'RECEIVED');
      assert.equal(
        await prisma.tradeEvent.count({ where: { orderId: shipped.id } }),
        2,
      );

      const refundable = await prisma.order.create({
        data: {
          orderNo: `${prefix}-REFUND`,
          customerName: '隔离测试客户',
          customerPhone: '13800000000',
          address: '隔离测试地址',
          totalAmount: 100,
          finalAmount: 100,
          paidAmount: 100,
          status: 'PENDING_SHIP',
          deliveryStatus: 'PENDING_SHIP',
          ...orderSnapshot,
        },
      });
      const payment = await prisma.payment.create({
        data: {
          orderId: refundable.id,
          paymentNo: `${prefix}-PAY`,
          amount: 100,
          method: 'bank_transfer',
          status: 'PAID',
          paidAt: new Date(),
        },
      });
      const refundResults = await Promise.allSettled([
        refunds.create({
          orderId: refundable.id,
          paymentId: payment.id,
          amount: 70,
          reason: '并发退款 A',
          idempotencyKey: `${prefix}-A`,
          operator: { type: 'ADMIN', id: actors[0].id },
        }),
        refunds.create({
          orderId: refundable.id,
          paymentId: payment.id,
          amount: 70,
          reason: '并发退款 B',
          idempotencyKey: `${prefix}-B`,
          operator: { type: 'ADMIN', id: actors[1].id },
        }),
      ]);
      assert.equal(refundResults.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(refundResults.filter((result) => result.status === 'rejected').length, 1);
      assert.equal(await prisma.refund.count({ where: { orderId: refundable.id } }), 1);

      const editable = await prisma.order.create({
        data: {
          orderNo: `${prefix}-ROLLBACK`,
          customerName: '隔离测试客户',
          customerPhone: '13800000000',
          address: '隔离测试地址',
          totalAmount: 100,
          finalAmount: 100,
          status: 'PENDING_PAYMENT',
          ...orderSnapshot,
        },
      });
      const failingOrders = new OrdersService(
        prisma as unknown as PrismaService,
        { record: async () => { throw new Error('forced audit failure'); } } as never,
        mailer as never,
        {} as never,
        {} as never,
      );
      await assert.rejects(
        () => failingOrders.updateAmount(
          editable.id,
          { finalAmount: 90, reason: '验证审计回滚' },
          { type: 'ADMIN', id: actors[0].id },
        ),
        /forced audit failure/,
      );
      const rolledBack = await prisma.order.findUniqueOrThrow({ where: { id: editable.id } });
      assert.equal(Number(rolledBack.finalAmount), 100);
      assert.equal(Number(rolledBack.adjustmentAmount), 0);
    } finally {
      await prisma.order.deleteMany({ where: { orderNo: { startsWith: prefix } } });
      await prisma.warehouse.deleteMany({ where: { name: { startsWith: prefix } } });
      await prisma.user.deleteMany({ where: { username: { startsWith: prefix } } });
      await prisma.$disconnect();
    }
  },
);
