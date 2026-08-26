import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

test('记录型促销创建 DTO 保留当前管理端合同并剥离控制字段', async () => {
  const result = await pipe.transform(
    {
      name: '  七夕满减活动  ',
      type: 'FULL_REDUCTION',
      rule: { threshold: 5000, discount: 500 },
      startTime: '2026-08-27T00:00:00.000Z',
      endTime: '2026-08-31T00:00:00.000Z',
      description: '仅作运营记录',
      orderDiscountAmount: 999999,
      usedCount: 100,
    },
    { type: 'body', metatype: CreatePromotionDto },
  );

  assert.deepEqual({ ...result }, {
    name: '七夕满减活动',
    type: 'FULL_REDUCTION',
    rule: { threshold: 5000, discount: 500 },
    startTime: '2026-08-27T00:00:00.000Z',
    endTime: '2026-08-31T00:00:00.000Z',
    description: '仅作运营记录',
  });
});

test('记录型促销创建 DTO 拒绝空名称 未知类型 非对象规则和错误时间', async () => {
  await assert.rejects(
    pipe.transform(
      {
        name: '  ',
        type: 'FLASH_SALE',
        rule: [],
        startTime: 'tomorrow',
        endTime: 'later',
      },
      { type: 'body', metatype: CreatePromotionDto },
    ),
  );
});

test('记录型促销更新 DTO 只允许现有可编辑字段并严格校验布尔值', async () => {
  const result = await pipe.transform(
    { description: '更新说明', isActive: false, createdAt: 'forged' },
    { type: 'body', metatype: UpdatePromotionDto },
  );
  assert.deepEqual({ ...result }, { description: '更新说明', isActive: false });

  await assert.rejects(
    pipe.transform(
      { isActive: 'false' },
      { type: 'body', metatype: UpdatePromotionDto },
    ),
  );
});
