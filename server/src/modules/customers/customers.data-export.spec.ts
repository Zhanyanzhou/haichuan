import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { CustomersService } from './customers.service';

test('我的数据导出补齐客户可见售后与偏好，并维持敏感字段白名单', async () => {
  let orderQuery: any;
  let favoriteQuery: any;
  let notificationQuery: any;
  let preferenceQuery: any;
  let reviewQuery: any;
  let productAccessQuery: any;
  let lockQuery: any;
  let transactionOptions: any;
  const createdAt = new Date('2026-09-19T08:00:00.000Z');
  const updatedAt = new Date('2026-09-20T08:00:00.000Z');
  const replyAt = new Date('2026-09-20T09:00:00.000Z');
  const emptyFindMany = { findMany: async () => [] };
  const prisma: any = {
    $queryRaw: async (query: any) => {
      lockQuery = query;
      return [{ id: 7 }];
    },
    $transaction: async (callback: (transaction: any) => Promise<unknown>, options: unknown) => {
      transactionOptions = options;
      return callback(prisma);
    },
    customer: { findUnique: async () => ({ phone: '13800138000', status: 'ACTIVE' }) },
    customerAddress: emptyFindMany,
    order: {
      findMany: async (args: any) => {
        orderQuery = args;
        return [{
          id: 11,
          orderNo: 'ORD-EXPORT-1',
          status: 'SHIPPED',
          customerName: '历史收件人',
          customerPhone: '13900139000',
          customerEmail: 'historic-order@example.com',
          address: '上海市黄浦区历史订单路 18 号',
          afterSalesCases: [{
            id: 31,
            caseNo: 'AS-1',
            status: 'REQUESTED',
            reason: '尺寸不合适',
          }],
          fulfillments: [{ id: 41, status: 'SHIPPED', trackingNo: 'SF123' }],
          refunds: [{ id: 51, refundNo: 'RF-1', status: 'PROCESSING' }],
          payments: [{ id: 61, paymentNo: 'PAY-1', status: 'PAID' }],
          items: [],
          quotedLines: [],
        }];
      },
    },
    inquiry: {
      findMany: async () => [{
        id: 71,
        message: '希望周末到店',
        reply: '旧回复',
        status: 'PENDING',
        createdAt,
        updatedAt,
        consultationType: 'STORE_VISIT',
        preferredContact: 'PHONE',
        preferredTime: 'WEEKEND',
        budgetRange: '10000_30000',
        product: { name: '海浪戒指' },
        lead: {
          id: 81,
          status: 'REPLIED',
          updatedAt: replyAt,
          activities: [{ id: 91, content: '已为您预约', createdAt: replyAt }],
        },
      }],
    },
    selectionInquiry: {
      findMany: async () => [{
        id: 72,
        message: '请比较这两款',
        status: 'PENDING',
        createdAt,
        updatedAt,
        items: [{ productNameSnapshot: '海浪戒指' }],
        lead: {
          id: 82,
          status: 'REPLIED',
          updatedAt: replyAt,
          activities: [{ id: 92, content: '已整理对比', createdAt: replyAt }],
        },
      }],
    },
    customerFavorite: {
      findMany: async (args: any) => {
        favoriteQuery = args;
        return [];
      },
    },
    productReview: {
      findMany: async (args: any) => {
        reviewQuery = args;
        return [{
          id: 73,
          product: { id: 3, name: '海浪戒指' },
          rating: 5,
          content: '佩戴舒适',
          images: [
            `review-image:v1:7:${'a'.repeat(64)}`,
            '/uploads/legacy/review.jpg',
            `review-image:v1:8:${'b'.repeat(64)}`,
            'https://tracker.example/review.png',
          ],
          status: 'APPROVED',
          createdAt,
        }];
      },
    },
    notification: {
      findMany: async (args: any) => {
        notificationQuery = args;
        return [];
      },
    },
    notificationPreference: {
      findMany: async (args: any) => {
        preferenceQuery = args;
        return [{
          channel: 'EMAIL',
          topic: 'SERVICE_ORDER_SHIPPED',
          enabled: false,
          createdAt,
          updatedAt,
        }];
      },
    },
    consentRecord: emptyFindMany,
    productAccessLog: {
      findMany: async (args: any) => {
        productAccessQuery = args;
        return [{
          productId: 3,
          eventType: 'DETAIL_VIEW',
          source: 'product_detail',
          occurredAt: updatedAt,
        }];
      },
    },
    partnerApplication: emptyFindMany,
  };
  const service = new CustomersService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const exported = await service.exportMyData({ id: 7, authVersion: 4 });

  assert.equal(transactionOptions.isolationLevel, 'Serializable');
  assert.match(lockQuery.sql, /status = 'ACTIVE'/);
  assert.match(lockQuery.sql, /auth_version = \?/);
  assert.match(lockQuery.sql, /FOR SHARE/);
  assert.deepEqual(lockQuery.values, [7, 4]);
  assert.equal(orderQuery.where.customerId, 7);
  assert.equal(orderQuery.include, undefined);
  assert.equal(orderQuery.select.internalNote, undefined);
  assert.equal(orderQuery.select.pricingSnapshot, undefined);
  assert.equal(orderQuery.select.userId, undefined);
  assert.equal(orderQuery.select.salesConsultantId, undefined);
  assert.equal(orderQuery.select.source, undefined);
  assert.equal(orderQuery.select.paymentProof, undefined);
  assert.equal(orderQuery.select.shippingAddressSnapshot, undefined);
  assert.equal(orderQuery.select.customerName, true);
  assert.equal(orderQuery.select.customerPhone, true);
  assert.equal(orderQuery.select.customerEmail, true);
  assert.equal(orderQuery.select.address, true);
  assert.equal(orderQuery.select.payments.select.proofUrl, undefined);
  assert.equal(orderQuery.select.refunds.select.reason, undefined);
  assert.equal(orderQuery.select.refunds.select.reviewNote, undefined);
  assert.equal(orderQuery.select.refunds.select.gatewayRefundNo, undefined);
  assert.equal(orderQuery.select.afterSalesCases.select.adminNote, undefined);
  assert.equal(orderQuery.select.afterSalesCases.select.evidenceUrls, undefined);
  assert.equal(orderQuery.select.afterSalesCases.select.handledBy, undefined);
  assert.equal(favoriteQuery.where.customerId, 7);
  assert.deepEqual(favoriteQuery.where.product.visibility.in, ['PUBLIC', 'MEMBER']);
  assert.equal(notificationQuery.where.customerId, 7);
  assert.deepEqual(notificationQuery.where.status.in, ['AVAILABLE', 'READ']);
  assert.ok(notificationQuery.where.availableAt.lte instanceof Date);
  assert.equal(preferenceQuery.where.customerId, 7);
  assert.deepEqual(preferenceQuery.where.channel.in, ['EMAIL', 'SMS']);
  assert.equal(preferenceQuery.where.topic.in.includes('MARKETING_GENERAL'), true);
  assert.deepEqual(
    Object.keys(preferenceQuery.select),
    ['channel', 'topic', 'enabled', 'createdAt', 'updatedAt'],
  );
  assert.equal(reviewQuery.where.customerId, 7);
  assert.equal(reviewQuery.select.id, true);
  assert.equal(reviewQuery.select.images, true);
  assert.deepEqual(productAccessQuery.where, { customerId: 7 });
  assert.deepEqual(Object.keys(productAccessQuery.select), [
    'productId',
    'eventType',
    'source',
    'occurredAt',
  ]);
  assert.equal(productAccessQuery.select.metadata, undefined);

  assert.equal(exported.orders[0].afterSalesCases[0].caseNo, 'AS-1');
  assert.equal(exported.orders[0].customerName, '历史收件人');
  assert.equal(exported.orders[0].customerPhone, '13900139000');
  assert.equal(exported.orders[0].customerEmail, 'historic-order@example.com');
  assert.equal(exported.orders[0].address, '上海市黄浦区历史订单路 18 号');
  assert.equal(exported.orders[0].fulfillments[0].trackingNo, 'SF123');
  assert.equal(exported.orders[0].refunds[0].refundNo, 'RF-1');
  assert.equal(exported.inquiries[0].reply, '已为您预约');
  assert.equal(exported.inquiries[0].preferredTime, 'WEEKEND');
  assert.equal(exported.selectionInquiries[0].reply, '已整理对比');
  assert.equal(exported.selectionInquiries[0].items[0].productNameSnapshot, '海浪戒指');
  assert.equal(exported.notificationPreferences[0].enabled, false);
  assert.equal(exported.productAccessEvents[0].productId, 3);
  assert.equal(exported.productAccessEvents[0].eventType, 'DETAIL_VIEW');
  assert.deepEqual(exported.reviews[0].images, [
    '/reviews/me/73/media/0',
    '/uploads/legacy/review.jpg',
  ]);
  assert.equal(JSON.stringify(exported.reviews).includes('review-image:v1:'), false);
});

test('我的数据导出在客户锁内复核 ACTIVE，注销抢先完成后不读取混合快照', async () => {
  let childRead = false;
  const prisma: any = {
    $queryRaw: async () => [{ id: 7 }],
    $transaction: async (callback: (transaction: any) => Promise<unknown>) => callback(prisma),
    customer: {
      findUnique: async () => ({
        id: 7,
        phone: 'closed-7',
        status: 'DISABLED',
        accountType: 'MEMBER',
        partnerStatus: 'NONE',
      }),
    },
    customerAddress: { findMany: async () => { childRead = true; return []; } },
  };
  const service = new CustomersService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  await assert.rejects(
    () => service.exportMyData({ id: 7, authVersion: 4 }),
    (error: any) => error?.errorCode === 'ACCOUNT_DATA_EXPORT_STATE_CHANGED',
  );
  assert.equal(childRead, false);
});

test('我的数据导出在认证版本失效后不读取 profile 或任何子集合', async () => {
  let profileRead = false;
  let childRead = false;
  const prisma: any = {
    $queryRaw: async () => [],
    $transaction: async (callback: (transaction: any) => Promise<unknown>) => callback(prisma),
    customer: {
      findUnique: async () => {
        profileRead = true;
        return null;
      },
    },
    customerAddress: {
      findMany: async () => {
        childRead = true;
        return [];
      },
    },
  };
  const service = new CustomersService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  await assert.rejects(
    () => service.exportMyData({ id: 7, authVersion: 3 }),
    (error: any) => error?.errorCode === 'ACCOUNT_DATA_EXPORT_STATE_CHANGED',
  );
  assert.equal(profileRead, false);
  assert.equal(childRead, false);
});
