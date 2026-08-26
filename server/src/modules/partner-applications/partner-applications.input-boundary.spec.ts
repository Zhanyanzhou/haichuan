import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata, Type } from '@nestjs/common';
import { CreatePartnerApplicationDto } from './dto/create-partner-application.dto';
import { PartnerApplicationQueryDto } from './dto/partner-application-query.dto';
import { ReviewPartnerApplicationDto } from './dto/review-partner-application.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

function validate<T>(metatype: Type<T>, value: unknown, type: 'body' | 'query'): Promise<T> {
  return pipe.transform(value, { type, metatype } as ArgumentMetadata) as Promise<T>;
}

test('合作申请正文会先规范化并剥离客户不可写字段', async () => {
  const result = await validate(CreatePartnerApplicationDto, {
    applicantName: '  测试客户  ',
    applicantPhone: '  13800138000  ',
    companyName: '  测试商户  ',
    businessDescription: '  主营珠宝蜡模  ',
    agreementAccepted: true,
    status: 'APPROVED',
    accountType: 'PARTNER',
  }, 'body');

  assert.deepEqual({ ...result }, {
    applicantName: '测试客户',
    applicantPhone: '13800138000',
    companyName: '测试商户',
    businessDescription: '主营珠宝蜡模',
    agreementAccepted: true,
  });
});

test('合作申请拒绝空姓名、伪布尔协议值和超长业务说明', async () => {
  await assert.rejects(
    validate(CreatePartnerApplicationDto, {
      applicantName: '   ',
      applicantPhone: '13800138000',
      agreementAccepted: true,
    }, 'body'),
    BadRequestException,
  );
  await assert.rejects(
    validate(CreatePartnerApplicationDto, {
      applicantName: '测试客户',
      applicantPhone: '13800138000',
      agreementAccepted: 'false',
    }, 'body'),
    BadRequestException,
  );
  await assert.rejects(
    validate(CreatePartnerApplicationDto, {
      applicantName: '测试客户',
      applicantPhone: '13800138000',
      agreementAccepted: true,
      businessDescription: 'x'.repeat(2001),
    }, 'body'),
    BadRequestException,
  );
});

test('合作申请列表查询只接受白名单状态、分页和有界关键词', async () => {
  const result = await validate(PartnerApplicationQueryDto, {
    page: '2',
    pageSize: '50',
    status: 'PENDING',
    keyword: '  测试客户  ',
    internalOnly: 'drop-me',
  }, 'query');

  assert.deepEqual({ ...result }, {
    page: 2,
    pageSize: 50,
    status: 'PENDING',
    keyword: '测试客户',
  });

  await assert.rejects(
    validate(PartnerApplicationQueryDto, { status: 'UNKNOWN' }, 'query'),
    BadRequestException,
  );
  await assert.rejects(
    validate(PartnerApplicationQueryDto, { page: '0', pageSize: '101' }, 'query'),
    BadRequestException,
  );
  await assert.rejects(
    validate(PartnerApplicationQueryDto, { keyword: 'x'.repeat(101) }, 'query'),
    BadRequestException,
  );
});

test('审核正文只允许合法动作并限制说明长度', async () => {
  const result = await validate(ReviewPartnerApplicationDto, {
    action: 'APPROVED',
    reviewNote: '  资料完整  ',
    partnerStatus: 'APPROVED',
  }, 'body');
  assert.deepEqual({ ...result }, { action: 'APPROVED', reviewNote: '资料完整' });

  await assert.rejects(
    validate(ReviewPartnerApplicationDto, { action: 'RESTORE' }, 'body'),
    BadRequestException,
  );
  await assert.rejects(
    validate(ReviewPartnerApplicationDto, {
      action: 'REJECTED',
      reviewNote: 'x'.repeat(2001),
    }, 'body'),
    BadRequestException,
  );
});
