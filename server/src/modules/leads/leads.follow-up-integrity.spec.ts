import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { OutboxService } from '../../common/outbox/outbox.service';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';

test('跟进控制器只把当前登录员工 ID 交给服务层', async () => {
  const calls: unknown[] = [];
  const service = {
    addFollowUp: async (input: unknown) => {
      calls.push(input);
      return { id: 1 };
    },
  };
  const controller = new LeadsController(service as never);

  await controller.addFollowUp(
    'inquiry',
    17,
    { content: '已电话确认', contactMethod: 'phone' },
    { id: 7 },
  );

  assert.deepEqual(calls, [
    {
      leadType: 'inquiry',
      leadId: 17,
      content: '已电话确认',
      contactMethod: 'phone',
      createdBy: 7,
    },
  ]);
});

test('跟进记录只为现存线索写入并使用服务端提供的员工 ID', async () => {
  const activityWrites: unknown[] = [];
  const legacyWrites: unknown[] = [];
  const prisma = {
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma),
    lead: {
      findFirst: async () => ({
        id: 41,
        sourceType: 'INQUIRY',
        inquiryId: 17,
        selectionInquiryId: null,
      }),
    },
    leadActivity: {
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
    createdBy: 7,
  });

  assert.deepEqual(activityWrites, [
    {
      data: {
        leadId: 41,
        type: 'FOLLOW_UP',
        content: '已电话确认',
        contactMethod: 'phone',
        nextFollowUpAt: null,
        createdBy: 7,
      },
    },
  ]);
  assert.deepEqual(legacyWrites, [
    {
      data: {
        leadType: 'inquiry',
        leadId: 17,
        content: '已电话确认',
        contactMethod: 'phone',
        nextFollowUpAt: null,
        createdBy: 7,
      },
    },
  ]);
});

test('跟进记录拒绝不存在的线索且不会形成孤立写入', async () => {
  let createCalls = 0;
  const prisma = {
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
    }),
    NotFoundException,
  );
  assert.equal(createCalls, 0);
});

test('跟进记录拒绝未知类型和非正整数编号', async () => {
  const service = new LeadsService({} as never, {} as never);

  await assert.rejects(
    service.addFollowUp({ leadType: 'partner', leadId: 1, content: 'x' }),
    UnprocessableEntityException,
  );
  await assert.rejects(
    service.addFollowUp({ leadType: 'inquiry', leadId: 0, content: 'x' }),
    UnprocessableEntityException,
  );
});

test('顾问回复与无 PII 通知意图在同一事务写入', async () => {
  const outboxEvents: Array<Record<string, unknown>> = [];
  const prisma = {
    lead: {
      findFirst: async () => ({
        id: 41,
        sourceType: 'INQUIRY',
        inquiryId: 17,
        selectionInquiryId: null,
      }),
    },
    inquiry: {
      update: async () => ({
        id: 17,
        customerId: null,
        customerName: '测试客户',
        customerEmail: 'customer@example.com',
      }),
    },
    leadActivity: {
      create: async () => ({ id: 91 }),
    },
    leadFollowUp: {
      create: async () => ({ id: 92 }),
    },
    outboxEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        outboxEvents.push(data);
        return { id: 93 };
      },
    },
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma),
  };
  const service = new LeadsService(prisma as never, new OutboxService());

  await service.recordInquiryReply(17, '请确认到店时间', 7);

  assert.equal(outboxEvents.length, 1);
  assert.equal(outboxEvents[0].eventType, 'lead.reply.notification.requested');
  assert.equal(outboxEvents[0].deduplicationKey, 'lead.reply:91');
  assert.deepEqual(outboxEvents[0].payload, { leadId: 41, activityId: 91 });
  assert.doesNotMatch(
    JSON.stringify(outboxEvents[0]),
    /customer@example\.com|测试客户|请确认到店时间/,
  );
});

test('顾问回复的通知意图写入失败时不静默成功', async () => {
  const prisma = {
    lead: {
      findFirst: async () => ({
        id: 41,
        sourceType: 'INQUIRY',
        inquiryId: 17,
        selectionInquiryId: null,
      }),
    },
    inquiry: {
      update: async () => ({
        id: 17,
        customerEmail: 'customer@example.com',
      }),
    },
    leadActivity: { create: async () => ({ id: 91 }) },
    leadFollowUp: { create: async () => ({ id: 92 }) },
    outboxEvent: {
      create: async () => {
        throw new Error('outbox unavailable');
      },
    },
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma),
  };
  const service = new LeadsService(prisma as never, new OutboxService());

  await assert.rejects(
    service.recordInquiryReply(17, '不应形成半完成回复', 7),
    /outbox unavailable/,
  );
});
