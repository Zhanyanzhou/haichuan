import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { ReviewListQueryDto } from './dto/review.dto';
import { ReviewsService } from './reviews.service';

test('评价筛选只接受当前审核状态并转换分页边界', async () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const metadata = {
    type: 'query',
    metatype: ReviewListQueryDto,
  } as ArgumentMetadata;

  const result = await pipe.transform(
    { status: 'PENDING', page: '2', pageSize: '30', ignored: 'value' },
    metadata,
  );

  assert.deepEqual({ ...result }, {
    page: 2,
    pageSize: 30,
    status: 'PENDING',
  });
  await assert.rejects(
    pipe.transform({ status: 'UNKNOWN' }, metadata),
    BadRequestException,
  );
});

test('客户只能评价本人已完成订单中真实包含的作品', async () => {
  let created: Record<string, unknown> | undefined;
  let createCount = 0;
  let capturedOrderWhere: Record<string, unknown> | undefined;
  const prisma = {
    order: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        capturedOrderWhere = where;
        return {
        id: 11,
        status: 'COMPLETED',
        items: [{ productId: 21 }],
        };
      },
    },
    productReview: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createCount += 1;
        created = data;
        return { id: 31, ...data };
      },
    },
  };
  const service = new ReviewsService(prisma as never);

  await service.submit(7, {
    orderId: 11,
    productId: 21,
    rating: 5,
    content: '  做工细致，佩戴舒适  ',
    imageUrls: ['', '/uploads/review.jpg'],
  });

  assert.deepEqual(capturedOrderWhere, { id: 11, customerId: 7 });
  assert.deepEqual(created, {
    productId: 21,
    customerId: 7,
    orderId: 11,
    rating: 5,
    content: '做工细致，佩戴舒适',
    images: ['/uploads/review.jpg'],
    status: 'PENDING',
  });
  assert.equal(createCount, 1);

  prisma.order.findFirst = async () => ({
    id: 11,
    status: 'PAID',
    items: [{ productId: 21 }],
  });
  await assert.rejects(
    service.submit(7, {
      orderId: 11,
      productId: 21,
      rating: 5,
      content: '做工细致，佩戴舒适',
    }),
    /订单完成后才能评价/,
  );
  assert.equal(createCount, 1);

  prisma.order.findFirst = async () => ({
    id: 11,
    status: 'COMPLETED',
    items: [{ productId: 22 }],
  });
  await assert.rejects(
    service.submit(7, {
      orderId: 11,
      productId: 21,
      rating: 5,
      content: '做工细致，佩戴舒适',
    }),
    /该商品不在订单内/,
  );
  assert.equal(createCount, 1);
});

test('公开评价只读取 APPROVED 并返回脱敏身份', async () => {
  const capturedWhere: Record<string, unknown>[] = [];
  const prisma = {
    productReview: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        capturedWhere.push(where);
        return [{
          id: 41,
          rating: 5,
          content: '公开评价',
          images: [],
          reply: null,
          repliedAt: null,
          createdAt: new Date('2026-08-27T00:00:00Z'),
          customer: { name: '王女士', phone: '13800000000' },
        }];
      },
      count: async ({ where }: { where: Record<string, unknown> }) => {
        capturedWhere.push(where);
        return 1;
      },
      aggregate: async ({ where }: { where: Record<string, unknown> }) => {
        capturedWhere.push(where);
        return { _avg: { rating: 5 } };
      },
    },
  };
  const service = new ReviewsService(prisma as never);

  const result = await service.listForProduct(21, { page: 1, pageSize: 10 });

  assert.deepEqual(capturedWhere, [
    { productId: 21, status: 'APPROVED' },
    { productId: 21, status: 'APPROVED' },
    { productId: 21, status: 'APPROVED' },
  ]);
  assert.equal(result.list[0]?.reviewer, '王**');
  assert.equal(result.averageRating, 5);
});
