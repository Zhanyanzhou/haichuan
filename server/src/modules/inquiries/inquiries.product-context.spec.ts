import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { InquiriesService } from './inquiries.service';
import { ApiError } from '../../common/errors/api-error';
import { CUSTOMER_INQUIRY_SUBMISSION_SELECT } from './customer-inquiry.response';

const validInquiry = {
  customerName: '测试访客',
  customerPhone: '13800000000',
  consultationType: '选款建议',
  preferredContact: '电话',
  preferredTime: '下午 (14:00-18:00)',
  message: '希望围绕这件作品确认佩戴场景与咨询安排。',
  privacyConsent: true,
};

test('公开咨询 DTO 只接受正整数作品 ID', async () => {
  const accepted = await validate(
    plainToInstance(CreateInquiryDto, { ...validInquiry, productId: 42 }),
  );
  const zero = await validate(
    plainToInstance(CreateInquiryDto, { ...validInquiry, productId: 0 }),
  );
  const stringId = await validate(
    plainToInstance(CreateInquiryDto, { ...validInquiry, productId: '42' }),
  );

  assert.equal(accepted.length, 0);
  assert.ok(zero.some((error) => error.property === 'productId'));
  assert.ok(stringId.some((error) => error.property === 'productId'));
});

function createService(visibleIds: number[]) {
  let createdData: Record<string, unknown> | undefined;
  let consentData: Record<string, unknown> | undefined;
  let visibilityInput:
    | { productIds: number[]; customer: Record<string, unknown> | undefined }
    | undefined;
  const prisma = {
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma),
    inquiry: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdData = data;
        return { id: 1, ...data };
      },
    },
    consentRecord: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        consentData = data;
        return { id: 1 };
      },
    },
  };
  const productsService = {
    filterVisibleProductIds: async (
      productIds: number[],
      customer: Record<string, unknown> | undefined,
    ) => {
      visibilityInput = { productIds, customer };
      return new Set(visibleIds);
    },
  };
  const service = new InquiriesService(
    prisma as never,
    productsService as never,
    {} as never,
  );
  return {
    service,
    createdData: () => createdData,
    visibilityInput: () => visibilityInput,
    consentData: () => consentData,
  };
}

test('咨询服务按已认证客户可见范围复核并关联现有 Inquiry.productId', async () => {
  const harness = createService([42]);
  const customer = {
    id: 7,
    name: '会员访客',
    phone: '13800000001',
    email: null,
    accountType: 'MEMBER',
  };

  await harness.service.create({ ...validInquiry, productId: 42, customer });

  assert.deepEqual(harness.visibilityInput(), { productIds: [42], customer });
  assert.equal(harness.createdData()?.productId, 42);
  assert.equal(harness.createdData()?.customerId, 7);
  const lead = harness.createdData()?.lead as {
    create: Record<string, unknown> & { submissionFingerprint: string };
  };
  assert.equal(lead.create.sourceType, 'INQUIRY');
  assert.equal(lead.create.customerId, 7);
  assert.equal(lead.create.customerName, '会员访客');
  assert.equal(lead.create.phone, '13800000001');
  assert.equal(lead.create.idempotencyKeyHash, null);
  assert.match(lead.create.submissionFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(lead.create.activities, {
    create: {
      type: 'CREATED',
      content: '公开咨询已提交',
      currentStatus: 'PENDING',
    },
  });
  assert.deepEqual(harness.consentData(), {
    customerId: 7,
    purpose: 'SERVICE_PRIVACY',
    decision: 'GRANTED',
    policyVersion: 'privacy-v2',
    locale: 'ZH_CN',
    source: 'inquiry:1',
    decidedAt: harness.createdData()?.privacyConsentedAt,
  });
});

test('咨询服务统一拒绝不存在、下架或越权作品且不写入', async () => {
  const harness = createService([]);

  await assert.rejects(
    () => harness.service.create({ ...validInquiry, productId: 42 }),
    (error: unknown) =>
      error instanceof ApiError
      && error.errorCode === 'INQUIRY_PRODUCT_NOT_AVAILABLE'
      && error.message === '作品当前不可咨询，请移除作品后提交普通咨询',
  );
  assert.equal(harness.createdData(), undefined);
});

test('普通咨询保持兼容，不触发商品解析并显式写入空关联', async () => {
  const harness = createService([]);

  await harness.service.create(validInquiry);

  assert.equal(harness.visibilityInput(), undefined);
  assert.equal(harness.createdData()?.productId, null);
});

test('服务终线拒绝绕过 DTO 传入的非法作品 ID', async () => {
  const harness = createService([42]);

  await assert.rejects(
    () => harness.service.create({ ...validInquiry, productId: -1 }),
    (error: unknown) =>
      error instanceof BadRequestException
      && error.message === '作品信息不正确，请返回作品页后重试',
  );
  assert.equal(harness.visibilityInput(), undefined);
  assert.equal(harness.createdData(), undefined);
});

test('相同幂等键与相同提交只创建一次来源记录和 Lead', async () => {
  let existingLead: {
    sourceType: string;
    submissionFingerprint: string;
    inquiryId: number;
  } | null = null;
  let createCount = 0;
  let createArgs: Record<string, unknown> | undefined;
  let replayArgs: Record<string, unknown> | undefined;
  const createdAt = new Date('2026-09-06T02:00:00.000Z');
  const source = {
    id: 77,
    status: 'PENDING',
    createdAt,
    assignedTo: 9,
    internalNote: '仅管理员可见',
    nextFollowUpAt: new Date('2026-09-07T02:00:00.000Z'),
  };
  const prisma = {
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma),
    lead: {
      findUnique: async () => existingLead,
    },
    inquiry: {
      create: async (args: { data: Record<string, any>; select?: unknown }) => {
        const { data } = args;
        createArgs = args;
        createCount += 1;
        existingLead = {
          sourceType: data.lead.create.sourceType,
          submissionFingerprint: data.lead.create.submissionFingerprint,
          inquiryId: source.id,
        };
        return source;
      },
      findUniqueOrThrow: async (args: Record<string, unknown>) => {
        replayArgs = args;
        return source;
      },
    },
    consentRecord: { create: async () => ({ id: 1 }) },
  };
  const service = new InquiriesService(
    prisma as never,
    { filterVisibleProductIds: async () => new Set<number>() } as never,
    {} as never,
  );

  const first = await service.create({
    ...validInquiry,
    idempotencyKey: 'same-intent-0001',
  });
  const retry = await service.create({
    ...validInquiry,
    idempotencyKey: 'same-intent-0001',
  });

  const expected = { id: 77, status: 'PENDING', createdAt };
  assert.deepEqual(first, expected);
  assert.deepEqual(retry, expected);
  assert.deepEqual(createArgs?.select, CUSTOMER_INQUIRY_SUBMISSION_SELECT);
  assert.deepEqual(replayArgs?.select, CUSTOMER_INQUIRY_SUBMISSION_SELECT);
  assert.equal('internalNote' in first, false);
  assert.equal('assignedTo' in retry, false);
  assert.equal('nextFollowUpAt' in retry, false);
  assert.equal(createCount, 1);
});

test('同一幂等键不能跨用到内容不同的提交', async () => {
  let existingLead: {
    sourceType: string;
    submissionFingerprint: string;
    inquiryId: number;
  } | null = null;
  const prisma = {
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma),
    lead: { findUnique: async () => existingLead },
    inquiry: {
      create: async ({ data }: { data: Record<string, any> }) => {
        existingLead = {
          sourceType: data.lead.create.sourceType,
          submissionFingerprint: data.lead.create.submissionFingerprint,
          inquiryId: 78,
        };
        return { id: 78 };
      },
      findUniqueOrThrow: async () => ({ id: 78 }),
    },
    consentRecord: { create: async () => ({ id: 1 }) },
  };
  const service = new InquiriesService(
    prisma as never,
    { filterVisibleProductIds: async () => new Set<number>() } as never,
    {} as never,
  );
  await service.create({ ...validInquiry, idempotencyKey: 'same-intent-0002' });

  await assert.rejects(
    service.create({
      ...validInquiry,
      message: '这是另一笔不同的咨询需求',
      idempotencyKey: 'same-intent-0002',
    }),
    ConflictException,
  );
});
