import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProductAccessService } from '../products/product-access.service';
import { RecommendationsService } from './recommendations.service';

const hiddenFields = [
  'craftFee',
  'status',
  'sortOrder',
  'multiDiscount',
  'visibility',
  'viewCount',
  'salesCount',
] as const;

function product(salesMode: 'DISPLAY_ONLY' | 'DIRECT_PURCHASE') {
  return {
    id: salesMode === 'DIRECT_PURCHASE' ? 2 : 1,
    code: salesMode === 'DIRECT_PURCHASE' ? 'HC-DIRECT-002' : 'HC-DISPLAY-001',
    name: salesMode === 'DIRECT_PURCHASE' ? '直购作品' : '展陈作品',
    categoryId: 9,
    shortDescription: '公开简介',
    materialType: 'AU750',
    goldWeight: 3.2,
    craftFee: 900,
    price: 16800,
    weight: 4.1,
    size: '圈号 13',
    status: 'PUBLISHED',
    salesMode,
    sortOrder: 88,
    isHot: false,
    isNew: true,
    isRecommended: true,
    isLimited: false,
    isCustom: false,
    multiDiscount: 0.9,
    visibility: 'PUBLIC',
    viewCount: 200,
    salesCount: 12,
    category: { id: 9, name: '戒指' },
    images: [],
    primaryImage: null,
    listingImage: null,
  };
}

function createService(loadedProduct: ReturnType<typeof product>) {
  const findManyCalls: Array<{ select?: Record<string, unknown> }> = [];
  const recordEventCalls: unknown[][] = [];
  const recentHistoryCalls: unknown[][] = [];
  const transaction = {
    $queryRaw: async () => [{
      id: 7,
      accountType: 'MEMBER',
      partnerStatus: 'NONE',
    }],
    product: {
      findMany: async (args: { select?: Record<string, unknown> }) => {
        findManyCalls.push(args);
        if (findManyCalls.length === 1) {
          return [{ id: loadedProduct.id, isHot: false, isRecommended: true }];
        }
        return [loadedProduct];
      },
    },
  };
  const prisma = {
    ...transaction,
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  };
  const productAccess = {
    getHotScores: async () => new Map<number, number>(),
    getRecentViewedProductIds: async (...args: unknown[]) => {
      recentHistoryCalls.push(args);
      return [];
    },
    recordEvent: async (...args: unknown[]) => {
      recordEventCalls.push(args);
    },
  };
  const service = new RecommendationsService(
    prisma as unknown as PrismaService,
    productAccess as unknown as ProductAccessService,
  );
  return { service, findManyCalls, recordEventCalls, recentHistoryCalls };
}

test('推荐响应对非直购作品隐藏价格并拒绝内部商品字段', async () => {
  const { service, findManyCalls } = createService(product('DISPLAY_ONLY'));
  const result = await service.getHot({ id: 7 } as never, 1);
  const item = result[0] as unknown as Record<string, unknown>;

  assert.equal(item.price, null);
  assert.equal(item.salesMode, 'DISPLAY_ONLY');
  assert.equal(item.name, '展陈作品');
  for (const field of hiddenFields) assert.equal(field in item, false, field);
  assert.equal('categoryId' in item, false);

  const publicSelect = findManyCalls[1]?.select ?? {};
  for (const field of hiddenFields) assert.equal(field in publicSelect, false, field);
  assert.equal('categoryId' in publicSelect, false);
});

test('推荐响应保留直购作品的有效公开价格', async () => {
  const { service } = createService(product('DIRECT_PURCHASE'));
  const result = await service.getHot({ id: 7 } as never, 1);
  const item = result[0] as unknown as Record<string, unknown>;

  assert.equal(Number(item.price), 16800);
  assert.equal(item.salesMode, 'DIRECT_PURCHASE');
  for (const field of hiddenFields) assert.equal(field in item, false, field);
});

test('推荐行为采集与个性化历史读取均传递完整客户 principal', async () => {
  const { service, recordEventCalls, recentHistoryCalls } = createService(product('DISPLAY_ONLY'));
  const principal = {
    id: 7,
    name: '测试客户',
    phone: '13800000007',
    email: null,
    authVersion: 3,
    accountType: 'MEMBER',
    partnerStatus: 'NONE',
  } as never;

  await service.getForYou(principal, 1);

  assert.equal(recentHistoryCalls[0]?.[0], principal);
  assert.equal(recordEventCalls[0]?.[0], principal);
  assert.equal(recordEventCalls[0]?.[2], 'RECOMMENDATION_IMPRESSION');
});

test('合作资格在 Guard 后暂停时推荐只使用共享锁内最新可见范围', async () => {
  let recommendationWhere: any;
  let isolationLevel: unknown;
  const transaction = {
    $queryRaw: async () => [{
      id: 12,
      accountType: 'PARTNER',
      partnerStatus: 'SUSPENDED',
    }],
    product: {
      findMany: async ({ where }: any) => {
        recommendationWhere = where;
        return [];
      },
    },
  };
  const prisma = {
    $transaction: async (
      callback: (tx: typeof transaction) => Promise<unknown>,
      options: { isolationLevel?: unknown },
    ) => {
      isolationLevel = options?.isolationLevel;
      return callback(transaction);
    },
  };
  const service = new RecommendationsService(
    prisma as unknown as PrismaService,
    {
      getHotScores: async () => new Map(),
      recordEvent: async () => undefined,
    } as unknown as ProductAccessService,
  );

  const result = await service.getHot({
    id: 12,
    name: '资格变化客户',
    phone: '13800000012',
    email: null,
    authVersion: 5,
    accountType: 'PARTNER',
    partnerStatus: 'APPROVED',
  }, 12);

  assert.deepEqual(result, []);
  assert.deepEqual(recommendationWhere.visibility, { in: ['PUBLIC', 'MEMBER'] });
  assert.equal(isolationLevel, 'Serializable');
});
