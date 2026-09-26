import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { InquiriesService } from './inquiries.service';
import { ApiError } from '../../common/errors/api-error';
import { CUSTOMER_INQUIRY_SUBMISSION_SELECT } from './customer-inquiry.response';
import { PRIVACY_CONSENT_CONTENT_HASH } from '../../common/privacy/privacy-consent';
import { prepareLeadIdempotency } from '../leads/lead-submission';

const validInquiry = {
  customerName: '测试访客',
  customerPhone: '13800000000',
  consultationType: '选款建议',
  preferredContact: '电话',
  preferredTime: '下午 (14:00-18:00)',
  message: '希望围绕这件作品确认佩戴场景与咨询安排。',
  privacyConsent: true,
  privacyConsentVersion: 'privacy-v2',
  privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
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
  const missingContentHash = await validate(
    plainToInstance(CreateInquiryDto, {
      ...validInquiry,
      privacyConsentContentHash: undefined,
    }),
  );
  const missingVersion = await validate(
    plainToInstance(CreateInquiryDto, {
      ...validInquiry,
      privacyConsentVersion: undefined,
    }),
  );

  assert.equal(accepted.length, 0);
  assert.ok(zero.some((error) => error.property === 'productId'));
  assert.ok(stringId.some((error) => error.property === 'productId'));
  assert.ok(missingContentHash.some(
    (error) => error.property === 'privacyConsentContentHash',
  ));
  assert.ok(missingVersion.some(
    (error) => error.property === 'privacyConsentVersion',
  ));
});

function createService(
  visibleIds: number[],
  lockedCustomerIds = [7],
  lockedAccess = { accountType: 'MEMBER', partnerStatus: null as string | null },
) {
  let createdData: Record<string, unknown> | undefined;
  let consentData: Record<string, unknown> | undefined;
  let visibilityInput:
    | {
        productIds: number[];
        customer: Record<string, unknown> | undefined;
        transactionBound: boolean;
      }
    | undefined;
  const isolationLevels: unknown[] = [];
  const prisma = {
    $transaction: async (
      callback: (transaction: unknown) => unknown,
      options?: { isolationLevel?: unknown },
    ) => {
      isolationLevels.push(options?.isolationLevel);
      return callback(prisma);
    },
    $queryRaw: async () => lockedCustomerIds.map((id) => ({ id, ...lockedAccess })),
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
      transaction: unknown,
    ) => {
      visibilityInput = {
        productIds,
        customer,
        transactionBound: transaction === prisma,
      };
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
    isolationLevels,
  };
}

test('咨询服务按已认证客户可见范围复核并关联现有 Inquiry.productId', async () => {
  const harness = createService([42]);
  const customer = {
    id: 7,
    name: '会员访客',
    phone: '13800000001',
    email: null,
    authVersion: 3,
    accountType: 'MEMBER',
  };

  await harness.service.create({ ...validInquiry, productId: 42, customer });

  assert.deepEqual(harness.visibilityInput(), {
    productIds: [42],
    customer: { id: 7, accountType: 'MEMBER', partnerStatus: null },
    transactionBound: true,
  });
  assert.deepEqual(harness.isolationLevels, ['Serializable']);
  assert.equal(harness.createdData()?.productId, 42);
  assert.equal(harness.createdData()?.customerId, 7);
  assert.equal(
    harness.createdData()?.privacyConsentHash,
    PRIVACY_CONSENT_CONTENT_HASH,
  );
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
    policyContentHash: PRIVACY_CONSENT_CONTENT_HASH,
    locale: 'ZH_CN',
    source: 'inquiry:1',
    decidedAt: harness.createdData()?.privacyConsentedAt,
  });
});

test('合作资格在 Guard 后被暂停时使用锁内最新资格复核作品并保持零写入', async () => {
  const harness = createService(
    [],
    [7],
    { accountType: 'PARTNER', partnerStatus: 'SUSPENDED' },
  );

  await assert.rejects(
    () => harness.service.create({
      ...validInquiry,
      productId: 42,
      customer: {
        id: 7,
        name: '原合作客户',
        phone: '13800000001',
        email: null,
        authVersion: 3,
        accountType: 'PARTNER',
        partnerStatus: 'APPROVED',
      },
    }),
    (error: unknown) =>
      error instanceof ApiError
      && error.errorCode === 'INQUIRY_PRODUCT_NOT_AVAILABLE',
  );

  assert.deepEqual(harness.visibilityInput(), {
    productIds: [42],
    customer: { id: 7, accountType: 'PARTNER', partnerStatus: 'SUSPENDED' },
    transactionBound: true,
  });
  assert.equal(harness.createdData(), undefined);
  assert.equal(harness.consentData(), undefined);
});

test('公开咨询拒绝旧隐私正文哈希且在作品读取和个人信息写入前失败', async () => {
  const harness = createService([42]);

  await assert.rejects(
    () => harness.service.create({
      ...validInquiry,
      privacyConsentContentHash: '0'.repeat(64),
      productId: 42,
    }),
    (error: unknown) =>
      error instanceof BadRequestException
      && error.message === '隐私说明已更新，请刷新页面后重新提交',
  );

  assert.equal(harness.visibilityInput(), undefined);
  assert.equal(harness.createdData(), undefined);
  assert.equal(harness.consentData(), undefined);
});

test('注销事务先提交后，旧客户请求不得回写咨询、Lead 或同意记录', async () => {
  const harness = createService([42], []);

  await assert.rejects(
    () => harness.service.create({
      ...validInquiry,
      productId: 42,
      customer: {
        id: 7,
        name: '注销前姓名',
        phone: '13800000001',
        email: 'before-close@example.com',
        authVersion: 3,
        accountType: 'MEMBER',
      },
    }),
    UnauthorizedException,
  );

  assert.equal(harness.createdData(), undefined);
  assert.equal(harness.consentData(), undefined);
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

test('相同幂等键在作品状态变化后仍恢复原 canonical Lead 且不重复创建', async () => {
  let existingLead: {
    sourceType: string;
    submissionFingerprint: string;
    inquiryId: number;
  } | null = null;
  let createCount = 0;
  let visibilityCalls = 0;
  let productVisible = true;
  let createArgs: Record<string, unknown> | undefined;
  let replayArgs: Record<string, unknown> | undefined;
  const createdAt = new Date('2026-09-06T02:00:00.000Z');
  const source = {
    id: 77,
    status: 'PENDING',
    createdAt,
    lead: { id: 701 },
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
    {
      filterVisibleProductIds: async () => {
        visibilityCalls += 1;
        return productVisible ? new Set([42]) : new Set<number>();
      },
    } as never,
    {} as never,
  );

  const first = await service.create({
    ...validInquiry,
    productId: 42,
    idempotencyKey: 'same-intent-0001',
  });
  productVisible = false;
  source.status = 'REPLIED';
  const retry = await service.create({
    ...validInquiry,
    productId: 42,
    idempotencyKey: 'same-intent-0001',
  });

  const expected = {
    id: 77,
    sourceId: 77,
    leadId: 701,
    status: 'PENDING',
    createdAt,
  };
  assert.deepEqual(first, expected);
  assert.deepEqual(retry, expected);
  assert.deepEqual(createArgs?.select, CUSTOMER_INQUIRY_SUBMISSION_SELECT);
  assert.deepEqual(replayArgs?.select, CUSTOMER_INQUIRY_SUBMISSION_SELECT);
  assert.equal('internalNote' in first, false);
  assert.equal('assignedTo' in retry, false);
  assert.equal('nextFollowUpAt' in retry, false);
  assert.equal(createCount, 1);
  assert.equal(visibilityCalls, 1, '已提交请求的安全重放不得被后续作品状态阻断');
});

test('已提交旧隐私版本在政策更新后仍可用原幂等键恢复 canonical Lead', async () => {
  const idempotencyKey = 'old-policy-replay-0001';
  const oldVersion = 'privacy-v1';
  const oldContentHash = '1'.repeat(64);
  const fingerprint = prepareLeadIdempotency(idempotencyKey, {
    sourceType: 'INQUIRY',
    customerId: null,
    customerName: validInquiry.customerName,
    customerPhone: validInquiry.customerPhone,
    customerEmail: null,
    productId: null,
    consultationType: validInquiry.consultationType,
    preferredContact: validInquiry.preferredContact,
    preferredTime: validInquiry.preferredTime,
    budgetRange: null,
    message: validInquiry.message,
    privacyConsentVersion: oldVersion,
    privacyConsentContentHash: oldContentHash,
  });
  const createdAt = new Date('2026-09-01T00:00:00.000Z');
  let productReads = 0;
  let writes = 0;
  const prisma = {
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma),
    lead: {
      findUnique: async () => ({
        sourceType: 'INQUIRY',
        submissionFingerprint: fingerprint.submissionFingerprint,
        inquiryId: 88,
      }),
    },
    inquiry: {
      findUniqueOrThrow: async () => ({
        id: 88,
        status: 'PENDING',
        createdAt,
        lead: { id: 808 },
      }),
      create: async () => {
        writes += 1;
        throw new Error('旧提交恢复不得再次写入');
      },
    },
  };
  const service = new InquiriesService(
    prisma as never,
    {
      filterVisibleProductIds: async () => {
        productReads += 1;
        return new Set<number>();
      },
    } as never,
    {} as never,
  );

  const result = await service.create({
    ...validInquiry,
    privacyConsentVersion: oldVersion,
    privacyConsentContentHash: oldContentHash,
    idempotencyKey,
  });

  assert.deepEqual(result, {
    id: 88,
    sourceId: 88,
    leadId: 808,
    status: 'PENDING',
    createdAt,
  });
  assert.equal(productReads, 0);
  assert.equal(writes, 0);
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
