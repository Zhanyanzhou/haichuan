import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from './orders.service';

test('客户订单只返回安全的履约、售后、退款状态和白名单时间线', async () => {
  let query: any;
  const prisma = {
    order: {
      findMany: async (args: any) => {
        query = args;
        return [
          {
            id: 1,
            orderNo: 'ORD-CUSTOMER-1',
            // 模拟查询层被改回 include 或未来新增后台字段被带回：
            // 展开层必须继续剔除，后台内部事实不得进入客户响应。
            internalNote: '后台内部备注：该客户对价格敏感，注意话术',
            userId: 42,
            salesConsultantId: 7,
            source: 'store',
            paymentProof: 'private/payment-proof.png',
            payments: [
              {
                id: 2,
                status: 'PAID',
                proofUrl: 'private/payment-proof.png',
              },
            ],
            fulfillments: [{ id: 3, status: 'SHIPPED' }],
            refunds: [{ id: 4, status: 'PROCESSING', amount: '20.00' }],
            afterSalesCases: [{ id: 5, type: 'REFUND', status: 'APPROVED' }],
            tradeEvents: [
              {
                id: 6,
                eventType: 'REFUND_PROCESSING',
                entityType: 'REFUND',
                createdAt: new Date('2026-08-26T00:00:00.000Z'),
              },
              {
                id: 7,
                eventType: 'STOCK_RESERVED',
                entityType: 'INVENTORY',
                createdAt: new Date('2026-08-25T00:00:00.000Z'),
              },
            ],
          },
        ];
      },
    },
  };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );

  const result = await service.findForCustomer(9);

  assert.equal(query.where.customerId, 9);
  // 查询层白名单：后台字段不得进入查询结果（顶层必须显式 select 而非 include）。
  assert.equal(query.include, undefined);
  assert.equal(query.select.internalNote, undefined);
  assert.equal(query.select.userId, undefined);
  assert.equal(query.select.salesConsultantId, undefined);
  assert.equal(query.select.source, undefined);
  assert.equal(query.select.paymentProof, undefined);
  assert.equal(query.select.refunds.select.gatewayRefundNo, undefined);
  assert.equal(query.select.afterSalesCases.select.adminNote, undefined);
  assert.equal(query.select.tradeEvents.select.operatorName, undefined);
  // 响应层：即使数据层意外带回后台字段，展开层也必须剔除。
  const order = result[0] as Record<string, unknown>;
  assert.equal('internalNote' in order, false);
  assert.equal('userId' in order, false);
  assert.equal('salesConsultantId' in order, false);
  assert.equal('source' in order, false);
  assert.equal('paymentProof' in order, false);
  assert.equal('proofUrl' in result[0].payments[0], false);
  assert.equal(result[0].payments[0].hasProof, true);
  assert.equal((result[0] as any).tradeEvents, undefined);
  assert.deepEqual(
    result[0].timeline.map((event: { eventType: string }) => event.eventType),
    ['REFUND_PROCESSING'],
  );
});
