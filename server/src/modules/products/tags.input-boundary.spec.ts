import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { CreateTagDto, UpdateTagDto } from './dto/tag.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

test('标签创建 DTO 规范化管理端载荷并剥离非白名单字段', async () => {
  const result = await pipe.transform(
    {
      name: '  节日赠礼  ',
      group: '  场景  ',
      sortOrder: '3',
      slug: 'client-must-not-control',
      isActive: false,
    },
    { type: 'body', metatype: CreateTagDto },
  );

  assert.deepEqual({ ...result }, {
    name: '节日赠礼',
    group: '场景',
    sortOrder: 3,
  });
});

test('标签创建 DTO 拒绝空名称 超长分组和负排序', async () => {
  await assert.rejects(
    pipe.transform(
      { name: '  ', group: 'x'.repeat(51), sortOrder: -1 },
      { type: 'body', metatype: CreateTagDto },
    ),
  );
});

test('标签更新 DTO 接受当前状态载荷并拒绝字符串布尔值', async () => {
  const result = await pipe.transform(
    { name: '  古法工艺  ', isActive: false, unknown: true },
    { type: 'body', metatype: UpdateTagDto },
  );
  assert.deepEqual({ ...result }, { name: '古法工艺', isActive: false });

  await assert.rejects(
    pipe.transform(
      { isActive: 'false' },
      { type: 'body', metatype: UpdateTagDto },
    ),
  );
});
