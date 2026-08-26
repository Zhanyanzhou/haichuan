import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

test('分类创建 DTO 规范化当前管理端载荷并剥离非白名单字段', async () => {
  const result = await pipe.transform(
    {
      name: '  胸针  ',
      slug: '  brooches  ',
      parentId: '2',
      sortOrder: '3',
      isActive: false,
      icon: '  ◆  ',
      coverImage: '  /uploads/category.jpg  ',
      level: 3,
      internalOnly: true,
    },
    { type: 'body', metatype: CreateCategoryDto },
  );

  assert.deepEqual({ ...result }, {
    name: '胸针',
    slug: 'brooches',
    parentId: 2,
    sortOrder: 3,
    isActive: false,
    icon: '◆',
    coverImage: '/uploads/category.jpg',
  });
});

test('分类创建 DTO 拒绝空名称 非法 Slug 和越界排序', async () => {
  await assert.rejects(
    pipe.transform(
      { name: '  ', slug: 'Bad Slug', sortOrder: -1 },
      { type: 'body', metatype: CreateCategoryDto },
    ),
  );
});

test('分类更新 DTO 保留层级失败合同并拒绝字符串布尔值', async () => {
  const result = await pipe.transform(
    { name: '  戒指  ', level: '2', unknown: 'drop-me' },
    { type: 'body', metatype: UpdateCategoryDto },
  );
  assert.deepEqual({ ...result }, { name: '戒指', level: 2 });

  await assert.rejects(
    pipe.transform(
      { isActive: 'false' },
      { type: 'body', metatype: UpdateCategoryDto },
    ),
  );
});

test('分类更新 DTO 拒绝空字段 非法父级和超长媒体字段', async () => {
  await assert.rejects(
    pipe.transform(
      { slug: '', parentId: 0, coverImage: 'x'.repeat(501) },
      { type: 'body', metatype: UpdateCategoryDto },
    ),
  );
});
