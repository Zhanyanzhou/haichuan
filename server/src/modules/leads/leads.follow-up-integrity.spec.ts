import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
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
  const writes: unknown[] = [];
  const prisma = {
    inquiry: { findUnique: async () => ({ id: 17 }) },
    selectionInquiry: { findUnique: async () => null },
    leadFollowUp: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: 1 };
      },
    },
  };
  const service = new LeadsService(prisma as never);

  await service.addFollowUp({
    leadType: 'inquiry',
    leadId: 17,
    content: '已电话确认',
    contactMethod: 'phone',
    createdBy: 7,
  });

  assert.deepEqual(writes, [
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
    inquiry: { findUnique: async () => null },
    selectionInquiry: { findUnique: async () => null },
    leadFollowUp: {
      create: async () => {
        createCalls += 1;
      },
    },
  };
  const service = new LeadsService(prisma as never);

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
  const service = new LeadsService({} as never);

  await assert.rejects(
    service.addFollowUp({ leadType: 'partner', leadId: 1, content: 'x' }),
    UnprocessableEntityException,
  );
  await assert.rejects(
    service.addFollowUp({ leadType: 'inquiry', leadId: 0, content: 'x' }),
    UnprocessableEntityException,
  );
});
