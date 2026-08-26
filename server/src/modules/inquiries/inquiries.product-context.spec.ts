import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { InquiriesService } from './inquiries.service';

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
  let visibilityInput:
    | { productIds: number[]; customer: Record<string, unknown> | undefined }
    | undefined;
  const prisma = {
    inquiry: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdData = data;
        return { id: 1, ...data };
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
    {} as never,
    productsService as never,
  );
  return {
    service,
    createdData: () => createdData,
    visibilityInput: () => visibilityInput,
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
});

test('咨询服务统一拒绝不存在、下架或越权作品且不写入', async () => {
  const harness = createService([]);

  await assert.rejects(
    () => harness.service.create({ ...validInquiry, productId: 42 }),
    (error: unknown) =>
      error instanceof BadRequestException
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
