import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { AiClassifyService } from './ai-classify.service';
import { AiClassifyListQueryDto, ConfirmClassifyDto } from './dto/ai-classify.dto';

test('AI 分类查询与人工分类 ID 在 DTO 边界拒绝非法值', async () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const queryMetadata = {
    type: 'query',
    metatype: AiClassifyListQueryDto,
  } as ArgumentMetadata;
  const bodyMetadata = {
    type: 'body',
    metatype: ConfirmClassifyDto,
  } as ArgumentMetadata;

  const query = await pipe.transform(
    { status: 'pending_review', page: '2', pageSize: '10' },
    queryMetadata,
  );
  assert.deepEqual({ ...query }, {
    page: 2,
    pageSize: 10,
    status: 'pending_review',
  });
  await assert.rejects(
    pipe.transform({ status: 'unknown' }, queryMetadata),
    BadRequestException,
  );
  await assert.rejects(
    pipe.transform(
      { status: 'confirmed', confirmedCategoryId: 0 },
      bodyMetadata,
    ),
    BadRequestException,
  );
});

test('AI 服务未配置时不写分类记录也不静默返回 Mock', async () => {
  let writes = 0;
  const service = new AiClassifyService(
    {
      category: { findMany: async () => [] },
      aIClassifyRecord: {
        create: async () => {
          writes += 1;
        },
      },
    } as never,
    { isAvailable: () => false } as never,
  );

  await assert.rejects(
    service.classifyImage('/uploads/test.jpg'),
    /AI 分类服务未配置/,
  );
  assert.equal(writes, 0);
});

test('人工确认在预测分类为空且未选择分类时 fail closed', async () => {
  let updates = 0;
  const service = new AiClassifyService(
    {
      aIClassifyRecord: {
        findUnique: async () => ({ predictedCategoryId: null }),
        update: async () => {
          updates += 1;
          return {};
        },
      },
    } as never,
    {} as never,
  );

  await assert.rejects(
    service.confirmClassification(7, {
      status: 'confirmed',
      operatorId: 3,
    }),
    BadRequestException,
  );
  assert.equal(updates, 0);
});
