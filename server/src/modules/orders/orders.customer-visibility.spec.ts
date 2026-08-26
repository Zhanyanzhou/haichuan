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
  assert.equal(query.include.refunds.select.gatewayRefundNo, undefined);
  assert.equal(query.include.afterSalesCases.select.adminNote, undefined);
  assert.equal(query.include.tradeEvents.select.operatorName, undefined);
  assert.equal('proofUrl' in result[0].payments[0], false);
  assert.equal(result[0].payments[0].hasProof, true);
  assert.equal((result[0] as any).tradeEvents, undefined);
  assert.deepEqual(
    result[0].timeline.map((event: { eventType: string }) => event.eventType),
    ['REFUND_PROCESSING'],
  );
});
