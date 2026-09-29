import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from './orders.service';

const CUSTOMER = { id: 9, authVersion: 4 };

function withCustomerReadTransaction<T extends object>(
  delegates: T,
  options: { authorized?: boolean; operations?: string[] } = {},
) {
  const transaction = {
    ...delegates,
    $queryRaw: async () => {
      options.operations?.push('customer-lock');
      return options.authorized === false ? [] : [{ id: CUSTOMER.id }];
    },
  };
  return {
    ...delegates,
    $transaction: async (
      callback: (tx: typeof transaction) => Promise<unknown>,
      transactionOptions: unknown,
    ) => {
      assert.deepEqual(transactionOptions, { isolationLevel: 'Serializable' });
      return callback(transaction);
    },
  };
}

test('客户订单只返回安全的履约、售后、退款状态和白名单时间线', async () => {
  let query: any;
  const prisma = withCustomerReadTransaction({
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
            refunds: [{
              id: 4,
              status: 'PROCESSING',
              amount: '20.00',
              reason: '后台退款原因，不得外发',
              reviewNote: '退款审核备注，不得外发',
              gatewayRefundNo: 'PRIVATE-GATEWAY-REFUND-NO',
              requestedBy: 11,
              reviewedBy: 12,
              processedBy: 13,
            }],
            afterSalesCases: [{
              id: 5,
              type: 'REFUND',
              status: 'APPROVED',
              reason: '客户提交的售后原因',
              adminNote: '售后后台处理备注，不得外发',
              handledBy: 14,
            }],
            tradeEvents: [
              {
                id: 6,
                eventType: 'REFUND_PROCESSING',
                entityType: 'REFUND',
                fromStatus: 'APPROVED',
                toStatus: 'PROCESSING',
                reason: '渠道返回的内部异常详情，不得外发',
                operatorType: 'ADMIN',
                operatorId: 12,
                operatorName: '内部处理人',
                metadata: { privateReference: 'PRIVATE' },
                createdAt: new Date('2026-08-26T00:00:00.000Z'),
              },
              {
                id: 7,
                eventType: 'STOCK_RESERVED',
                entityType: 'INVENTORY',
                createdAt: new Date('2026-08-25T00:00:00.000Z'),
              },
              {
                id: 8,
                eventType: 'ORDER_CUSTOM_STAGE_CHANGED',
                entityType: 'ORDER',
                fromStatus: 'PENDING_BALANCE',
                toStatus: 'BALANCE_PAID',
                reason: '全额收款已确认，内部资源已核销',
                metadata: { consumedResources: 2 },
                createdAt: new Date('2026-08-26T00:10:00.000Z'),
              },
            ],
          },
        ];
      },
    },
  });
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );

  const result = await service.findForCustomer(CUSTOMER);

  assert.equal(query.where.customerId, 9);
  assert.equal(query.take, 100);
  // 查询层白名单：后台字段不得进入查询结果（顶层必须显式 select 而非 include）。
  assert.equal(query.include, undefined);
  assert.equal(query.select.internalNote, undefined);
  assert.equal(query.select.userId, undefined);
  assert.equal(query.select.salesConsultantId, undefined);
  assert.equal(query.select.source, undefined);
  assert.equal(query.select.paymentProof, undefined);
  assert.equal(query.select.items.include, undefined);
  assert.equal(query.select.items.select.orderId, undefined);
  assert.equal(query.select.items.select.productNameSnapshot, true);
  assert.equal(query.select.refunds.select.reason, undefined);
  assert.equal(query.select.refunds.select.reviewNote, undefined);
  assert.equal(query.select.refunds.select.gatewayRefundNo, undefined);
  assert.equal(query.select.afterSalesCases.select.adminNote, undefined);
  assert.equal(query.select.afterSalesCases.select.handledBy, undefined);
  assert.equal(query.select.tradeEvents.select.reason, undefined);
  assert.equal(query.select.tradeEvents.select.operatorName, undefined);
  assert.equal(
    query.select.tradeEvents.where.eventType.in.includes('ORDER_CUSTOM_STAGE_CHANGED'),
    true,
  );
  assert.equal(query.select.tradeEvents.where.eventType.in.includes('ORDER_NOTE_EDITED'), false);
  // 响应层：即使数据层意外带回后台字段，展开层也必须剔除。
  const order = result[0] as Record<string, unknown>;
  assert.equal('internalNote' in order, false);
  assert.equal('userId' in order, false);
  assert.equal('salesConsultantId' in order, false);
  assert.equal('source' in order, false);
  assert.equal('paymentProof' in order, false);
  assert.equal('proofUrl' in result[0].payments[0], false);
  assert.equal(result[0].payments[0].hasProof, true);
  assert.equal('reason' in result[0].refunds[0], false);
  assert.equal('reviewNote' in result[0].refunds[0], false);
  assert.equal('gatewayRefundNo' in result[0].refunds[0], false);
  assert.equal('requestedBy' in result[0].refunds[0], false);
  assert.equal('reviewedBy' in result[0].refunds[0], false);
  assert.equal('processedBy' in result[0].refunds[0], false);
  assert.equal(result[0].afterSalesCases[0].reason, '客户提交的售后原因');
  assert.equal('adminNote' in result[0].afterSalesCases[0], false);
  assert.equal('handledBy' in result[0].afterSalesCases[0], false);
  assert.equal((result[0] as any).tradeEvents, undefined);
  assert.deepEqual(
    result[0].timeline.map((event: { eventType: string }) => event.eventType),
    ['REFUND_PROCESSING', 'ORDER_CUSTOM_STAGE_CHANGED'],
  );
  for (const event of result[0].timeline) {
    assert.equal('reason' in event, false);
    assert.equal('operatorType' in event, false);
    assert.equal('operatorId' in event, false);
    assert.equal('operatorName' in event, false);
    assert.equal('metadata' in event, false);
  }
});

test('客户时间线在 take 前过滤内部事件并只返回最近 20 条可见进度', async () => {
  let query: any;
  const internalEvents = Array.from({ length: 25 }, (_, index) => ({
    id: 100 + index,
    eventType: 'ORDER_NOTE_EDITED',
    entityType: 'ORDER',
    fromStatus: null,
    toStatus: null,
    createdAt: new Date(`2026-09-${String(25 - index).padStart(2, '0')}T12:00:00.000Z`),
  }));
  const visibleEvents = Array.from({ length: 21 }, (_, index) => ({
    id: index + 1,
    eventType: 'ORDER_CUSTOM_STAGE_CHANGED',
    entityType: 'ORDER',
    fromStatus: index === 0 ? 'DESIGN_CONFIRMED' : 'IN_PRODUCTION',
    toStatus: 'IN_PRODUCTION',
    createdAt: new Date(`2026-08-${String(21 - index).padStart(2, '0')}T12:00:00.000Z`),
  }));
  const prisma = withCustomerReadTransaction({
    order: {
      findMany: async (args: any) => {
        query = args;
        const relation = args.select.tradeEvents;
        const allowed = new Set(relation.where.eventType.in);
        const tradeEvents = [...internalEvents, ...visibleEvents]
          .filter((event) => allowed.has(event.eventType))
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .slice(0, relation.take);
        return [{
          id: 22,
          orderNo: 'ORD-CUSTOM-LONG-RUNNING',
          payments: [],
          refunds: [],
          afterSalesCases: [],
          tradeEvents,
        }];
      },
    },
  });
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );

  const result = await service.findForCustomer(CUSTOMER);

  assert.equal(query.select.tradeEvents.take, 20);
  assert.equal(query.select.tradeEvents.where.eventType.in.includes('ORDER_NOTE_EDITED'), false);
  assert.equal(result[0].timeline.length, 20);
  assert.equal(result[0].timeline.every((event: { eventType: string }) =>
    event.eventType === 'ORDER_CUSTOM_STAGE_CHANGED'), true);
  assert.equal(result[0].timeline.some((event: { id: number }) => event.id === 1), true);
  assert.equal(result[0].timeline.some((event: { id: number }) => event.id === 21), false);
});

test('列表上限外的本人订单使用 customerId 与 id 精确读取并复用客户白名单投影', async () => {
  let query: any;
  const prisma = withCustomerReadTransaction({
    order: {
      findMany: async (args: any) => {
        query = args;
        return [{
          id: 101,
          orderNo: 'ORD-HISTORY-101',
          payments: [],
          refunds: [],
          afterSalesCases: [],
          tradeEvents: [],
        }];
      },
    },
  });
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );

  const result = await service.findOneForCustomer(CUSTOMER, 101);

  assert.equal(result.id, 101);
  assert.deepEqual(query.where, { customerId: 9, id: 101 });
  assert.equal(query.take, 1);
  assert.equal(query.include, undefined);
  assert.equal(query.select.internalNote, undefined);
  assert.equal(query.select.paymentProof, undefined);
});

test('不存在与其他客户订单统一返回通用 404，非法编号在查询前拒绝', async () => {
  const queries: any[] = [];
  const storedOrders = [{
    id: 101,
    customerId: 8,
    orderNo: 'ORD-OTHER-CUSTOMER',
    payments: [],
    refunds: [],
    afterSalesCases: [],
    tradeEvents: [],
  }];
  const prisma = withCustomerReadTransaction({
    order: {
      findMany: async (args: any) => {
        queries.push(args);
        return storedOrders.filter((order) =>
          (args.where.id === undefined || order.id === args.where.id)
          && (args.where.customerId === undefined || order.customerId === args.where.customerId),
        );
      },
    },
  });
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );

  for (const orderId of [101, 202]) {
    await assert.rejects(
      service.findOneForCustomer(CUSTOMER, orderId),
      (error: unknown) => error instanceof NotFoundException
        && error.message === '订单不存在',
    );
  }
  assert.deepEqual(
    queries.map((query) => query.where),
    [{ customerId: 9, id: 101 }, { customerId: 9, id: 202 }],
  );

  const queryCount = queries.length;
  for (const orderId of [
    0,
    -1,
    Number.MAX_SAFE_INTEGER + 1,
    '01',
    '+1',
    '1e2',
    ' 1',
  ]) {
    await assert.rejects(
      service.findOneForCustomer(CUSTOMER, orderId),
      (error: unknown) => error instanceof BadRequestException
        && error.message === '订单编号无效',
    );
  }
  assert.equal(queries.length, queryCount);
});

test('旧 authVersion 的订单与物流读取在客户锁后失败且不读取领域正文', async () => {
  let orderListReads = 0;
  let orderTrackingReads = 0;
  let providerCalls = 0;
  const prisma = withCustomerReadTransaction({
    order: {
      findMany: async () => {
        orderListReads += 1;
        return [];
      },
      findFirst: async () => {
        orderTrackingReads += 1;
        return null;
      },
    },
  }, { authorized: false });
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {
      track: async () => {
        providerCalls += 1;
        return { traces: [] };
      },
    } as never,
  );

  await assert.rejects(service.findForCustomer(CUSTOMER), UnauthorizedException);
  await assert.rejects(service.findOneForCustomer(CUSTOMER, 101), UnauthorizedException);
  await assert.rejects(service.trackForCustomer(CUSTOMER, 101), UnauthorizedException);
  assert.equal(orderListReads, 0);
  assert.equal(orderTrackingReads, 0);
  assert.equal(providerCalls, 0);
});

test('物流读取在客户共享锁持有期间完成订单读取与渠道查询', async () => {
  const operations: string[] = [];
  const prisma = withCustomerReadTransaction({
    order: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        operations.push('order-read');
        assert.deepEqual(where, { id: 101, customerId: CUSTOMER.id });
        return {
          id: 101,
          orderNo: 'ORD-TRACK-101',
          status: 'SHIPPED',
          logisticsCompany: 'sf',
          logisticsNo: 'SF101',
        };
      },
    },
  }, { operations });
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {
      track: async (company: string, trackingNo: string) => {
        operations.push('provider-track');
        assert.equal(company, 'sf');
        assert.equal(trackingNo, 'SF101');
        return { traces: [{ context: '运输中' }] };
      },
    } as never,
  );

  const result = await service.trackForCustomer(CUSTOMER, 101);
  assert.deepEqual(operations, ['customer-lock', 'order-read', 'provider-track']);
  assert.deepEqual(result, { traces: [{ context: '运输中' }] });
});
