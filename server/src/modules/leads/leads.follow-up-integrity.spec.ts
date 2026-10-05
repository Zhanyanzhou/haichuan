import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';

test('跟进控制器把当前登录员工及会话族交给服务层', async () => {
  const calls: unknown[] = [];
  const service = {
    addFollowUp: async (input: unknown) => {
      calls.push(input);
      return { id: 1 };
    },
  };
  const controller = new LeadsController(service as never);

  const actor = {
    id: 7,
    sessionFamilyId: '00000000-0000-4000-8000-000000000001',
  };
  await controller.addFollowUp(
    'inquiry',
    17,
    { content: '已电话确认', contactMethod: 'phone' },
    'follow-up-controller-0017',
    actor,
  );

  assert.deepEqual(calls, [
    {
      leadType: 'inquiry',
      leadId: 17,
      content: '已电话确认',
      contactMethod: 'phone',
      idempotencyKey: 'follow-up-controller-0017',
      actor,
    },
  ]);
});

test('跟进记录只为现存线索写入并使用服务端提供的员工 ID', async () => {
  const activityWrites: unknown[] = [];
  const legacyWrites: unknown[] = [];
  const prisma = {
    $queryRaw: async () => [{ id: 7 }],
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma),
    lead: {
      findFirst: async () => ({
        id: 41,
        sourceType: 'INQUIRY',
        inquiryId: 17,
        selectionInquiryId: null,
        updatedAt: new Date('2026-09-12T00:00:00.000Z'),
        privacyDisposedAt: null,
      }),
      updateMany: async () => ({ count: 1 }),
    },
    leadActivity: {
      findUnique: async () => null,
      create: async (args: unknown) => {
        activityWrites.push(args);
        return { id: 1 };
      },
    },
    leadFollowUp: {
      create: async (args: unknown) => {
        legacyWrites.push(args);
        return { id: 2 };
      },
    },
  };
  const service = new LeadsService(prisma as never, {} as never);

  await service.addFollowUp({
    leadType: 'inquiry',
    leadId: 17,
    content: '已电话确认',
    contactMethod: 'phone',
    idempotencyKey: 'follow-up-write-0017',
    createdBy: 7,
  });

  const activityData = (activityWrites[0] as { data: Record<string, unknown> }).data;
  assert.ok(activityData.createdAt instanceof Date);
  assert.match(String(activityData.idempotencyKeyHash), /^[a-f0-9]{64}$/);
  assert.equal(
    (activityData.metadata as Record<string, unknown>).operation,
    'FOLLOW_UP',
  );
  assert.match(
    String((activityData.metadata as Record<string, unknown>).operationFingerprint),
    /^[a-f0-9]{64}$/,
  );
  assert.deepEqual({ ...activityData, createdAt: undefined }, {
    leadId: 41,
    type: 'FOLLOW_UP',
    content: '已电话确认',
    contactMethod: 'phone',
    nextFollowUpAt: null,
    createdBy: 7,
    idempotencyKeyHash: String(activityData.idempotencyKeyHash),
    metadata: {
      operation: 'FOLLOW_UP',
      operationFingerprint: String(
        (activityData.metadata as Record<string, unknown>).operationFingerprint,
      ),
    },
    createdAt: undefined,
  });
  const legacyData = (legacyWrites[0] as { data: Record<string, unknown> }).data;
  assert.equal(legacyData.createdAt, activityData.createdAt);
  assert.deepEqual({ ...legacyData, createdAt: undefined }, {
    leadType: 'inquiry',
    leadId: 17,
    content: '已电话确认',
    contactMethod: 'phone',
    nextFollowUpAt: null,
    createdBy: 7,
    createdAt: undefined,
  });
});

test('跟进记录拒绝不存在的线索且不会形成孤立写入', async () => {
  let createCalls = 0;
  const prisma = {
    $queryRaw: async () => [{ id: 7 }],
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma),
    lead: { findFirst: async () => null },
    leadFollowUp: {
      create: async () => {
        createCalls += 1;
      },
    },
  };
  const service = new LeadsService(prisma as never, {} as never);

  await assert.rejects(
    service.addFollowUp({
      leadType: 'selection',
      leadId: 88,
      content: '不应写入',
      idempotencyKey: 'follow-up-missing-lead-0088',
      createdBy: 7,
    }),
    NotFoundException,
  );
  assert.equal(createCalls, 0);
});

test('跟进记录拒绝未知类型和非正整数编号', async () => {
  const service = new LeadsService({} as never, {} as never);

  await assert.rejects(
    service.addFollowUp({ leadType: 'partner', leadId: 1, content: 'x', createdBy: 7 }),
    UnprocessableEntityException,
  );
  await assert.rejects(
    service.addFollowUp({ leadType: 'inquiry', leadId: 0, content: 'x', createdBy: 7 }),
    UnprocessableEntityException,
  );
});

test('跟进缺失认证员工或事务内 CAS 失败时不写入活动和兼容记录', async () => {
  const anonymous = new LeadsService({} as never, {} as never);
  await assert.rejects(
    anonymous.addFollowUp({ leadType: 'inquiry', leadId: 1, content: 'x' }),
    ForbiddenException,
  );

  const activities: unknown[] = [];
  const legacyWrites: unknown[] = [];
  let actorLockCalls = 0;
  const prisma = {
    $queryRaw: async () => {
      actorLockCalls += 1;
      return [{ id: 7 }];
    },
    lead: {
      findFirst: async () => ({
        id: 41,
        sourceType: 'INQUIRY',
        inquiryId: 17,
        selectionInquiryId: null,
        updatedAt: new Date('2026-09-12T00:00:00.000Z'),
        privacyDisposedAt: null,
      }),
      updateMany: async () => ({ count: 0 }),
    },
    leadActivity: {
      findUnique: async () => null,
      create: async (args: unknown) => activities.push(args),
    },
    leadFollowUp: { create: async (args: unknown) => legacyWrites.push(args) },
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma),
  };
  const service = new LeadsService(prisma as never, {} as never);
  await assert.rejects(
    service.addFollowUp({
      leadType: 'inquiry',
      leadId: 41,
      content: '并发期间不应写入',
      idempotencyKey: 'follow-up-cas-0041',
      createdBy: 7,
    }),
    ConflictException,
  );
  assert.equal(activities.length, 0);
  assert.equal(legacyWrites.length, 0);
  assert.equal(actorLockCalls, 2);
});

test('Guard 后被停用或撤权的员工不能读取既有跟进回放或写入领域记录', async () => {
  let leadReads = 0;
  let replayReads = 0;
  let domainWrites = 0;
  const prisma = {
    $queryRaw: async () => [],
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma),
    lead: {
      findFirst: async () => {
        leadReads += 1;
        return {
          id: 41,
          sourceType: 'INQUIRY',
          inquiryId: 17,
          selectionInquiryId: null,
          updatedAt: new Date('2026-09-12T00:00:00.000Z'),
          privacyDisposedAt: null,
        };
      },
      updateMany: async () => {
        domainWrites += 1;
        return { count: 1 };
      },
    },
    leadActivity: {
      findUnique: async () => {
        replayReads += 1;
        return {
          id: 91,
          leadId: 41,
          type: 'FOLLOW_UP',
          content: '既有私有跟进正文',
          contactMethod: 'phone',
          nextFollowUpAt: null,
          createdBy: 7,
          metadata: {},
          createdAt: new Date('2026-09-12T00:00:00.000Z'),
          lead: { privacyDisposedAt: null },
        };
      },
      create: async () => {
        domainWrites += 1;
      },
    },
    leadFollowUp: {
      create: async () => {
        domainWrites += 1;
      },
    },
  };
  const service = new LeadsService(prisma as never, {} as never);

  await assert.rejects(
    service.addFollowUp({
      leadType: 'inquiry',
      leadId: 41,
      content: '既有私有跟进正文',
      contactMethod: 'phone',
      idempotencyKey: 'follow-up-revoked-actor',
      createdBy: 7,
    }),
    ForbiddenException,
  );

  assert.equal(leadReads, 0);
  assert.equal(replayReads, 0);
  assert.equal(domainWrites, 0);
});

test('相同跟进幂等键重试只形成一组活动与兼容记录且异内容冲突', async () => {
  let activityWrites = 0;
  let legacyWrites = 0;
  let storedActivity: Record<string, unknown> | null = null;
  const prisma = {
    $queryRaw: async () => [{ id: 7 }],
    lead: {
      findFirst: async () => ({
        id: 41,
        sourceType: 'INQUIRY',
        inquiryId: 17,
        selectionInquiryId: null,
        updatedAt: new Date('2026-09-12T00:00:00.000Z'),
        privacyDisposedAt: null,
      }),
      updateMany: async () => ({ count: 1 }),
    },
    leadActivity: {
      findUnique: async () => storedActivity,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        activityWrites += 1;
        storedActivity = {
          id: 91,
          ...data,
          lead: { privacyDisposedAt: null },
        };
        return { id: 91, ...data };
      },
    },
    leadFollowUp: {
      create: async () => {
        legacyWrites += 1;
        return { id: 92 };
      },
    },
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma),
  };
  const service = new LeadsService(prisma as never, {} as never);
  const input = {
    leadType: 'inquiry',
    leadId: 17,
    content: '已电话确认到店时间',
    contactMethod: 'phone',
    idempotencyKey: 'follow-up-replay-0017',
    createdBy: 7,
  };

  const first = await service.addFollowUp(input);
  const replay = await service.addFollowUp(input);

  assert.equal(first.id, 91);
  assert.equal(replay.id, 91);
  assert.equal(activityWrites, 1);
  assert.equal(legacyWrites, 1);
  await assert.rejects(
    service.addFollowUp({ ...input, content: '另一条跟进内容' }),
    ConflictException,
  );
  assert.equal(activityWrites, 1);
  assert.equal(legacyWrites, 1);
});

test('旧 Inquiry 回复入口在员工事务首锁后才按 source id 解析线索', async () => {
  const expected = new Error('stop after source lookup');
  const operations: string[] = [];
  const sourceQueries: unknown[] = [];
  const transaction = {
    $queryRaw: async () => {
      operations.push('actor-lock');
      return [{ id: 7 }];
    },
    lead: {
      findFirst: async ({ where }: { where: unknown }) => {
        operations.push('source-read');
        sourceQueries.push(where);
        throw expected;
      },
    },
  };
  const prisma = {
    ...transaction,
    $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction),
  };
  const service = new LeadsService(prisma as never, {} as never);
  const request = {
    reply: '请确认到店时间',
    expectedUpdatedAt: '2026-09-12T00:00:00.000Z',
  };

  await assert.rejects(
    service.replyToInquirySource(17, request, 'legacy-reply-0017', 7),
    (error: unknown) => error === expected,
  );

  assert.deepEqual(operations, ['actor-lock', 'source-read']);
  assert.deepEqual(sourceQueries, [{ sourceType: 'INQUIRY', inquiryId: 17 }]);
});

test('旧 Inquiry 回复入口不吞掉统一事务失败', async () => {
  const expected = new Error('notification unavailable');
  const prisma = {
    $transaction: async () => { throw expected; },
  };
  const service = new LeadsService(prisma as never, {} as never);

  await assert.rejects(
    service.replyToInquirySource(
      17,
      {
        reply: '不应静默成功',
        expectedUpdatedAt: '2026-09-12T00:00:00.000Z',
      },
      'legacy-reply-failure',
      7,
    ),
    (error: unknown) => error === expected,
  );
});

test('旧 Inquiry 回复找不到 source 记录时不会误调用 canonical 回复', async () => {
  const operations: string[] = [];
  const transaction = {
    $queryRaw: async () => {
      operations.push('actor-lock');
      return [{ id: 7 }];
    },
    lead: {
      findFirst: async () => {
        operations.push('source-read');
        return null;
      },
    },
  };
  const service = new LeadsService({
    ...transaction,
    $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction),
  } as never, {} as never);

  await assert.rejects(
    service.replyToInquirySource(
      41,
      {
        reply: '不应误命中同号 Lead',
        expectedUpdatedAt: '2026-09-12T00:00:00.000Z',
      },
      'legacy-reply-wrong-source',
      7,
    ),
    NotFoundException,
  );
  assert.deepEqual(operations, ['actor-lock', 'source-read']);
});
