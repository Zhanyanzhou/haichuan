import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';
import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';

const tokenAdmin = { id: 71 };
const sessionAdmin = {
  id: 71,
  sessionFamilyId: '00000000-0000-4000-8000-000000000071',
};

test('员工撤权后营销九条后台读写路径在领域访问前失败关闭', async () => {
  let domainReads = 0;
  let domainWrites = 0;
  let transactions = 0;
  const read = async () => {
    domainReads += 1;
    return [];
  };
  const write = async () => {
    domainWrites += 1;
    return { count: 1 };
  };
  const tx = {
    $queryRaw: async () => [],
    promotion: {
      findMany: read,
      create: write,
      update: write,
    },
    coupon: {
      findMany: read,
      findUnique: read,
      count: read,
      aggregate: read,
      create: write,
      update: write,
      updateMany: write,
    },
  };
  const service = new MarketingService({
    coupon: { fields: { totalCount: Symbol('totalCount') } },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      transactions += 1;
      return callback(tx);
    },
  } as unknown as PrismaService);

  const calls = [
    () => service.getPromotions(tokenAdmin),
    () => service.createPromotion({} as never, tokenAdmin),
    () => service.updatePromotion(1, {} as never, tokenAdmin),
    () => service.deletePromotion(1, tokenAdmin),
    () => service.getCoupons(tokenAdmin),
    () => service.listUsableCouponsForStaff(10000, tokenAdmin),
    () => service.getCouponStats(tokenAdmin),
    () => service.createCoupon({} as never, tokenAdmin),
    () => service.updateCoupon(1, {}, tokenAdmin),
  ];

  for (const call of calls) {
    await assert.rejects(call, ForbiddenException);
  }

  assert.equal(transactions, calls.length);
  assert.equal(domainReads, 0);
  assert.equal(domainWrites, 0);
});

test('当前设备登出后营销读取和写入均在领域访问前失败关闭', async () => {
  const events: string[] = [];
  let queryCount = 0;
  const tx = {
    $queryRaw: async () => {
      queryCount += 1;
      if (queryCount % 2 === 1) {
        events.push('staff-lock');
        return [{ id: 71 }];
      }
      events.push('session-lock');
      return [];
    },
    promotion: {
      findMany: async () => {
        events.push('promotion-read');
        return [];
      },
      create: async () => {
        events.push('promotion-write');
        return {};
      },
    },
  };
  const service = new MarketingService({
    coupon: { fields: { totalCount: Symbol('totalCount') } },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
  } as unknown as PrismaService);

  await assert.rejects(
    () => service.getPromotions(sessionAdmin),
    ForbiddenException,
  );
  await assert.rejects(
    () => service.createPromotion({} as never, sessionAdmin),
    ForbiddenException,
  );
  assert.deepEqual(events, [
    'staff-lock',
    'session-lock',
    'staff-lock',
    'session-lock',
  ]);
});

test('营销控制器把完整员工 principal 传给全部后台读写入口', async () => {
  const principal = {
    id: 71,
    username: 'marketing-admin-71',
    realName: '营销管理员',
    role: 'ADMIN',
    status: 'ACTIVE',
    sessionFamilyId: '00000000-0000-4000-8000-000000000071',
  } as StaffPrincipal;
  const received: unknown[] = [];
  const headers = new Map<string, string>();
  const response = {
    setHeader: (name: string, value: string) => {
      headers.set(name, value);
    },
  };
  const service = {
    getPromotions: async (actor: unknown) => received.push(actor),
    createPromotion: async (_dto: unknown, actor: unknown) => received.push(actor),
    updatePromotion: async (_id: number, _dto: unknown, actor: unknown) => received.push(actor),
    deletePromotion: async (_id: number, actor: unknown) => received.push(actor),
    getCoupons: async (actor: unknown) => received.push(actor),
    listUsableCouponsForStaff: async (_amount: number, actor: unknown) => received.push(actor),
    getCouponStats: async (actor: unknown) => received.push(actor),
    createCoupon: async (_dto: unknown, actor: unknown) => received.push(actor),
    updateCoupon: async (_id: number, _dto: unknown, actor: unknown) => received.push(actor),
  };
  const controller = new MarketingController(service as unknown as MarketingService);

  await controller.getPromotions(principal, response as never);
  await controller.createPromotion({} as never, principal);
  await controller.updatePromotion(1, {} as never, principal);
  await controller.deletePromotion(1, principal);
  await controller.getCoupons(principal, response as never);
  await controller.listUsableCoupons('10000', principal, response as never);
  await controller.getCouponStats(principal, response as never);
  await controller.createCoupon({} as never, principal);
  await controller.updateCoupon(1, {} as never, principal);

  assert.equal(received.length, 9);
  assert.ok(received.every((actor) => actor === principal));
  assert.equal(headers.get('Cache-Control'), 'private, no-store, max-age=0');
  assert.equal(headers.get('Vary'), 'Cookie, Authorization');
});

test('旧客户身份读取可用券时在优惠券查询前失败关闭', async () => {
  let couponReads = 0;
  const tx = {
    $queryRaw: async () => [],
    coupon: {
      findMany: async () => {
        couponReads += 1;
        return [];
      },
    },
  };
  const service = new MarketingService({
    coupon: { fields: { totalCount: Symbol('totalCount') } },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
  } as unknown as PrismaService);

  await assert.rejects(
    () => service.listUsableCoupons(10000, { id: 88, authVersion: 4 }),
    UnauthorizedException,
  );
  assert.equal(couponReads, 0);
});
