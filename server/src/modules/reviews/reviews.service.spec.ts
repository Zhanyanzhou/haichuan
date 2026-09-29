import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReviewListQueryDto } from './dto/review.dto';
import { reviewSubmissionFingerprint } from './review-submission-fingerprint';
import { ReviewsService } from './reviews.service';

const reviewMedia = {
  assertOwnedReferences: async () => undefined,
  projectPublic: (_reviewId: number, images: unknown) => Array.isArray(images) ? images : [],
  projectStaff: (_reviewId: number, images: unknown) => Array.isArray(images) ? images : [],
};

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
    $queryRaw: async () => [{ id: 7 }],
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
    $transaction: async (action: (transaction: unknown) => Promise<unknown>) => action(prisma),
  };
  const service = new ReviewsService(prisma as never, reviewMedia as never);

  await service.submit({ id: 7, authVersion: 1 }, {
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
    service.submit({ id: 7, authVersion: 1 }, {
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
    service.submit({ id: 7, authVersion: 1 }, {
      orderId: 11,
      productId: 21,
      rating: 5,
      content: '做工细致，佩戴舒适',
    }),
    /该商品不在订单内/,
  );
  assert.equal(createCount, 1);
});

test('评价唯一冲突只对同一客户的同内容重放恢复原记录', async () => {
  const existing = {
    id: 31,
    orderId: 11,
    productId: 21,
    customerId: 7,
    rating: 5,
    content: '做工细致，佩戴舒适',
    images: ['/uploads/review.jpg'],
    status: 'PENDING',
  };
  const uniqueError = new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'test',
  });
  const tx = {
    $queryRaw: async () => [{ id: 7 }],
    order: {
      findFirst: async () => ({
        id: 11,
        status: 'COMPLETED',
        items: [{ productId: 21 }],
      }),
    },
    productReview: { create: async () => { throw uniqueError; } },
  };
  const prisma = {
    productReview: { findUnique: async () => existing },
    $transaction: async (action: (transaction: typeof tx) => Promise<unknown>) => action(tx),
  };
  const service = new ReviewsService(prisma as never, reviewMedia as never);
  const payload = {
    orderId: 11,
    productId: 21,
    rating: 5,
    content: '  做工细致，佩戴舒适  ',
    imageUrls: ['/uploads/review.jpg'],
  };

  assert.deepEqual(
    await service.submit({ id: 7, authVersion: 1 }, payload),
    existing,
  );
  await assert.rejects(
    service.submit(
      { id: 7, authVersion: 1 },
      { ...payload, content: '这是一条不同的评价内容' },
    ),
    /已评价过/,
  );
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
  const service = new ReviewsService(prisma as never, reviewMedia as never);

  const result = await service.listForProduct(21, { page: 1, pageSize: 10 });

  assert.deepEqual(capturedWhere, [
    { productId: 21, status: 'APPROVED' },
    { productId: 21, status: 'APPROVED' },
    { productId: 21, status: 'APPROVED' },
  ]);
  assert.equal(result.list[0]?.reviewer, '王**');
  assert.equal(result.averageRating, 5);
});

test('我的评价在同一 Serializable 事务内先复核完整客户身份', async () => {
  const events: string[] = [];
  let isolationLevel: unknown;
  const tx = {
    $queryRaw: async () => {
      events.push('customer-lock');
      return [{ id: 7 }];
    },
    productReview: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        events.push('review-read');
        assert.deepEqual(where, { customerId: 7 });
        return [{
          id: 41,
          product: { id: 21, name: '合成作品' },
          rating: 5,
          content: '本人私有评价',
          orderId: 11,
          images: [
            `review-image:v1:7:${'a'.repeat(64)}`,
            'https://untrusted.example/review.jpg',
          ],
          reply: null,
          status: 'PENDING',
          createdAt: new Date('2026-09-24T00:00:00.000Z'),
        }];
      },
    },
  };
  const service = new ReviewsService({
    $transaction: async (
      action: (transaction: typeof tx) => Promise<unknown>,
      options: { isolationLevel?: unknown },
    ) => {
      isolationLevel = options.isolationLevel;
      return action(tx);
    },
  } as never, reviewMedia as never);

  const result = await service.listMine({ id: 7, authVersion: 3 });

  assert.deepEqual(events, ['customer-lock', 'review-read']);
  assert.equal(isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
  assert.equal(result[0]?.content, '本人私有评价');
  assert.equal(result[0]?.status, 'PENDING');
  assert.deepEqual(result[0]?.images, ['/reviews/me/41/media/0']);
  assert.equal(
    result[0]?.submissionFingerprint,
    reviewSubmissionFingerprint({
      orderId: 11,
      productId: 21,
      rating: 5,
      content: '本人私有评价',
      images: [
        `review-image:v1:7:${'a'.repeat(64)}`,
        'https://untrusted.example/review.jpg',
      ],
    }),
  );
  assert.equal(JSON.stringify(result).includes('review-image:v1:'), false);
});

test('评价提交摘要绑定完整字段与图片顺序且不包含原始私有引用', () => {
  const imageA = `review-image:v1:7:${'a'.repeat(64)}`;
  const imageB = `review-image:v1:7:${'b'.repeat(64)}`;
  const base = {
    orderId: 11,
    productId: 21,
    rating: 5,
    content: '  完整评价意图  ',
    images: [imageA, imageB],
  };
  const fingerprint = reviewSubmissionFingerprint(base);

  assert.match(fingerprint, /^review-submission:v1:[a-f0-9]{64}$/);
  assert.equal(fingerprint.includes(imageA), false);
  assert.equal(
    fingerprint,
    reviewSubmissionFingerprint({ ...base, content: '完整评价意图' }),
  );
  assert.notEqual(
    fingerprint,
    reviewSubmissionFingerprint({ ...base, images: [imageB, imageA] }),
  );
  assert.notEqual(
    fingerprint,
    reviewSubmissionFingerprint({ ...base, rating: 4 }),
  );
});

test('旧 authVersion 的本人评价读取在任何评价正文查询前失败关闭', async () => {
  let reviewReads = 0;
  const tx = {
    $queryRaw: async () => [],
    productReview: {
      findMany: async () => {
        reviewReads += 1;
        return [];
      },
    },
  };
  const service = new ReviewsService({
    $transaction: async (action: (transaction: typeof tx) => Promise<unknown>) => action(tx),
  } as never, reviewMedia as never);

  await assert.rejects(
    service.listMine({ id: 7, authVersion: 2 }),
    /重新登录/,
  );
  assert.equal(reviewReads, 0);
});
