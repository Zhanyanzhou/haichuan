import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { CreateLeadFollowUpDto, UpdateLeadDto } from './dto/lead.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

test('线索更新 DTO 只保留运营字段并转换负责人 ID', async () => {
  const result = await pipe.transform(
    {
      status: 'CONTACTED',
      internalNote: '等待客户确认尺寸',
      assignedTo: '7',
      nextFollowUpAt: '2026-08-27T03:00:00.000Z',
      customerPhone: '13800138000',
      privacyConsent: false,
    },
    { type: 'body', metatype: UpdateLeadDto },
  );

  assert.deepEqual({ ...result }, {
    status: 'CONTACTED',
    internalNote: '等待客户确认尺寸',
    assignedTo: 7,
    nextFollowUpAt: '2026-08-27T03:00:00.000Z',
  });
});

test('线索更新 DTO 拒绝未知状态 非法负责人和错误日期', async () => {
  await assert.rejects(
    pipe.transform(
      { status: 'PROCESSING', assignedTo: 0, nextFollowUpAt: 'tomorrow' },
      { type: 'body', metatype: UpdateLeadDto },
    ),
  );
});

test('跟进 DTO 规范化内容并剥离客户端伪造的创建人', async () => {
  const result = await pipe.transform(
    {
      content: '  已电话确认到店时间  ',
      contactMethod: 'phone',
      createdBy: 999,
      leadType: 'selection',
      leadId: 88,
    },
    { type: 'body', metatype: CreateLeadFollowUpDto },
  );

  assert.deepEqual({ ...result }, {
    content: '已电话确认到店时间',
    contactMethod: 'phone',
  });
});

test('跟进 DTO 拒绝空内容 未知方式和错误日期', async () => {
  await assert.rejects(
    pipe.transform(
      { content: '   ', contactMethod: 'sms', nextFollowUpAt: 'not-a-date' },
      { type: 'body', metatype: CreateLeadFollowUpDto },
    ),
  );
});
