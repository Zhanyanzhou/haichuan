import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IdempotencyService } from '../../common/idempotency/idempotency-key';
import { ReviewsController } from './reviews.controller';
import { ReviewMediaService } from './review-media.service';
import { ReviewsService } from './reviews.service';

const actor = { id: 7, sessionFamilyId: 'review-family-7' };
const reviewMediaProjection = {
  assertOwnedReferences: async () => undefined,
  projectPublic: () => [],
  projectStaff: () => [],
};

function sqlText(query: unknown): string {
  return ((query as { strings?: readonly string[] }).strings || []).join(' ');
}

test('评价后台列表按员工、会话族、评价领域固定顺序复核', async () => {
  const events: string[] = [];
  let isolationLevel: unknown;
  const transaction = {
    $queryRaw: async (query: unknown) => {
      const sql = sqlText(query);
      if (sql.includes('FROM users')) events.push('staff-lock');
      if (sql.includes('FROM admin_refresh_sessions')) events.push('session-lock');
      return [{ id: 7 }];
    },
    productReview: {
      findMany: async () => {
        events.push('review-read');
        return [];
      },
      count: async () => {
        events.push('review-count');
        return 0;
      },
    },
  };
  const service = new ReviewsService({
    $transaction: async (
      operation: (tx: typeof transaction) => Promise<unknown>,
      options: { isolationLevel?: unknown },
    ) => {
      isolationLevel = options.isolationLevel;
      return operation(transaction);
    },
  } as never, reviewMediaProjection as never);

  assert.deepEqual(await service.listAll({}, actor), {
    list: [], total: 0, page: 1, pageSize: 20,
  });
  assert.deepEqual(events.slice(0, 2), ['staff-lock', 'session-lock']);
  assert.deepEqual(new Set(events.slice(2)), new Set(['review-read', 'review-count']));
  assert.equal(isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
});

test('员工撤权或设备登出后不读取评价、私有图片或写入审核结果', async () => {
  let reviewReads = 0;
  let reviewWrites = 0;
  let denyStaff = true;
  const deniedTransaction = {
    $queryRaw: async (query: unknown) => {
      const sql = sqlText(query);
      if (sql.includes('FROM users')) return denyStaff ? [] : [{ id: 7 }];
      return [];
    },
    productReview: {
      findMany: async () => { reviewReads += 1; return []; },
      count: async () => { reviewReads += 1; return 0; },
      findUnique: async () => { reviewReads += 1; return null; },
      update: async () => { reviewWrites += 1; return {}; },
    },
  };
  const deniedPrisma = {
    $transaction: async (operation: (tx: typeof deniedTransaction) => Promise<unknown>) => (
      operation(deniedTransaction)
    ),
  };
  const service = new ReviewsService(deniedPrisma as never, reviewMediaProjection as never);
  const media = new ReviewMediaService(deniedPrisma as never, new IdempotencyService());

  await assert.rejects(service.listAll({}, actor), ForbiddenException);
  denyStaff = false;
  await assert.rejects(
    service.moderate(11, { status: 'APPROVED' }, actor),
    ForbiddenException,
  );
  await assert.rejects(media.readForStaff(actor, 11, 0), ForbiddenException);
  assert.equal(reviewReads, 0);
  assert.equal(reviewWrites, 0);
});

test('评价审核使用写锁和当前管理员权限后才更新领域记录', async () => {
  const events: string[] = [];
  const queries: string[] = [];
  const transaction = {
    $queryRaw: async (query: unknown) => {
      const sql = sqlText(query);
      queries.push(sql);
      events.push(sql.includes('admin_refresh_sessions') ? 'session-lock' : 'staff-lock');
      return [{ id: 7 }];
    },
    productReview: {
      findUnique: async () => {
        events.push('review-read');
        return { id: 11, reply: null, repliedAt: null };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        events.push('review-update');
        return { id: 11, ...data };
      },
    },
  };
  const service = new ReviewsService({
    $transaction: async (operation: (tx: typeof transaction) => Promise<unknown>) => (
      operation(transaction)
    ),
  } as never, reviewMediaProjection as never);

  const result = await service.moderate(
    11,
    { status: 'APPROVED', reply: '  已核验  ' },
    actor,
  );

  assert.deepEqual(events, ['staff-lock', 'session-lock', 'review-read', 'review-update']);
  assert.match(queries[0] || '', /role IN \('SUPER_ADMIN', 'ADMIN'\).*FOR UPDATE/);
  assert.match(queries[1] || '', /admin_refresh_sessions.*FOR UPDATE/);
  assert.equal((result as { reply?: string }).reply, '已核验');
});

test('评价后台控制器逐条传递完整 principal 并禁止私有响应缓存', async () => {
  const received: unknown[] = [];
  const controller = Object.create(ReviewsController.prototype) as ReviewsController;
  Object.defineProperty(controller, 'reviewsService', {
    value: {
      listAll: async (_query: unknown, principal: unknown) => {
        received.push(principal);
        return { list: [], total: 0 };
      },
      moderate: async (_id: number, _dto: unknown, principal: unknown) => {
        received.push(principal);
        return { id: 11 };
      },
    },
  });
  Object.defineProperty(controller, 'reviewMedia', {
    value: {
      readForStaff: async (principal: unknown) => {
        received.push(principal);
        return Buffer.from('staff-review-image');
      },
    },
  });
  const headers = new Map<string, string>();
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    vary(name: string) {
      const current = headers.get('vary');
      headers.set('vary', current ? `${current}, ${name}` : name);
      return this;
    },
    set(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    type(value: string) {
      headers.set('content-type', value);
      return this;
    },
    send() { return this; },
  };

  await controller.listAll({} as never, actor as never, response as never);
  await controller.readStaffMedia(actor as never, 11, 0, response as never);
  await controller.moderate(actor as never, 11, { status: 'APPROVED' });

  assert.deepEqual(received, [actor, actor, actor]);
  assert.equal(headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(headers.get('vary'), 'Cookie, Authorization');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
});
