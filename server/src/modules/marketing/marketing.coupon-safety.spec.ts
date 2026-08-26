import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  ConflictException,
  ValidationPipe,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';
import { MarketingService } from './marketing.service';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const baseCoupon = {
  id: 1,
  name: '新人礼遇',
  type: 'percent',
  value: 10,
  minAmount: 500,
  totalCount: 100,
  usedCount: 0,
  startTime: new Date('2026-08-25T00:00:00.000Z'),
  endTime: new Date('2026-09-25T00:00:00.000Z'),
  isActive: true,
  createdAt: new Date('2026-08-25T00:00:00.000Z'),
};

test('优惠券创建 DTO 固定白名单并拒绝伪造使用量', async () => {
  const result = await pipe.transform(
    {
      name: '  新人礼遇  ',
      type: 'percent',
      value: 10,
      minAmount: 500,
      totalCount: 100,
      startTime: '2026-08-25T00:00:00.000Z',
      endTime: '2026-09-25T00:00:00.000Z',
      isActive: true,
      usedCount: 99,
      id: 999,
      createdAt: 'forged',
    },
    { type: 'body', metatype: CreateCouponDto },
  );

  assert.deepEqual({ ...result }, {
    name: '新人礼遇',
    type: 'percent',
    value: 10,
    minAmount: 500,
    totalCount: 100,
    startTime: '2026-08-25T00:00:00.000Z',
    endTime: '2026-09-25T00:00:00.000Z',
    isActive: true,
  });
});

test('优惠券 DTO 拒绝非法比例 金额精度 数量 时间和布尔输入', async () => {
  const invalidBodies: Array<Record<string, unknown>> = [
    { type: 'percent', value: 9.5 },
    { type: 'percent', value: 100 },
    { type: 'fixed', value: 10.001 },
    { type: 'fixed', value: 10, totalCount: 0 },
    { type: 'fixed', value: 10, isActive: 'false' },
  ];

  for (const override of invalidBodies) {
    const body: Record<string, unknown> = {
      name: '测试券',
      type: 'fixed',
      value: 10,
      startTime: '2026-08-25T00:00:00.000Z',
      endTime: '2026-09-25T00:00:00.000Z',
    };
    Object.assign(body, override);
    await assert.rejects(
      pipe.transform(
        body,
        { type: 'body', metatype: CreateCouponDto },
      ),
    );
  }

  await assert.rejects(
    pipe.transform(
      {
        name: '倒置时间券',
        type: 'fixed',
        value: 10,
        startTime: '2026-09-25T00:00:00.000Z',
        endTime: '2026-08-25T00:00:00.000Z',
      },
      { type: 'body', metatype: CreateCouponDto },
    ),
  );
});

test('已使用优惠券冻结经济条款但仍允许显式停用', async () => {
  let updateData: unknown;
  const prisma = {
    coupon: {
      findUnique: async () => ({ ...baseCoupon, usedCount: 1 }),
      update: async ({ data }: { data: unknown }) => {
        updateData = data;
        return { ...baseCoupon, usedCount: 1, ...(data as Record<string, unknown>) };
      },
    },
  };
  const service = new MarketingService(prisma as unknown as PrismaService);

  await assert.rejects(
    () => service.updateCoupon(1, { name: '改名后的券' }),
    BadRequestException,
  );
  const result = await service.updateCoupon(1, { isActive: false });
  assert.deepEqual(updateData, { isActive: false });
  assert.equal(result.isActive, false);
});

test('未使用券编辑若并发出现核销则安全失败', async () => {
  let updateCalled = false;
  const prisma = {
    coupon: {
      findUnique: async () => baseCoupon,
      updateMany: async () => {
        updateCalled = true;
        return { count: 0 };
      },
    },
  };
  const service = new MarketingService(prisma as unknown as PrismaService);

  await assert.rejects(
    () => service.updateCoupon(1, { value: 20 }),
    ConflictException,
  );
  assert.equal(updateCalled, true);
});

test('更新 DTO 未携带类型时仍由服务端按存量 percent 语义复核', async () => {
  const prisma = {
    coupon: { findUnique: async () => baseCoupon },
  };
  const service = new MarketingService(prisma as unknown as PrismaService);
  const dto = await pipe.transform(
    { value: 9.5 },
    { type: 'body', metatype: UpdateCouponDto },
  );

  await assert.rejects(
    () => service.updateCoupon(1, dto),
    BadRequestException,
  );
});
