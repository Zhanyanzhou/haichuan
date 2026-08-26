import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import type { ArgumentMetadata, Type } from "@nestjs/common";
import {
  CreateAttributeDto,
  CreateAttributeValueDto,
  UpdateAttributeDto,
  UpdateAttributeValueDto,
} from "./dto/attribute.dto";

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

function validateBody<T>(metatype: Type<T>, value: unknown): Promise<T> {
  return pipe.transform(value, {
    type: "body",
    metatype,
  } as ArgumentMetadata) as Promise<T>;
}

test("属性创建 DTO 规范化合法载荷并剥离后台控制字段", async () => {
  const result = await validateBody(CreateAttributeDto, {
    name: "  工艺  ",
    key: " Craft-Type ",
    sortOrder: "2",
    isFilterable: true,
    isActive: false,
    internalOnly: "must-not-reach-service",
  });

  assert.deepEqual({ ...result }, {
    name: "工艺",
    key: "craft-type",
    sortOrder: 2,
    isFilterable: true,
  });
});

test("属性创建 DTO 拒绝空名称 非法稳定键和负排序", async () => {
  await assert.rejects(
    validateBody(CreateAttributeDto, {
      name: "   ",
      key: "1 invalid key",
      sortOrder: -1,
    }),
    BadRequestException,
  );
});

test("属性更新 DTO 只允许当前可编辑字段并拒绝空名称", async () => {
  const result = await validateBody(UpdateAttributeDto, {
    name: "  场景  ",
    isFilterable: false,
    isActive: true,
    key: "must-not-change",
  });

  assert.deepEqual({ ...result }, {
    name: "场景",
    isFilterable: false,
    isActive: true,
  });
  await assert.rejects(
    validateBody(UpdateAttributeDto, { name: "   " }),
    BadRequestException,
  );
  await assert.rejects(
    validateBody(UpdateAttributeDto, { isFilterable: "false" }),
    BadRequestException,
  );
});

test("属性值 DTO 限制必填文本 长度和排序边界", async () => {
  const created = await validateBody(CreateAttributeValueDto, {
    value: "  足金999  ",
    sortOrder: "3",
    isActive: false,
  });
  const updated = await validateBody(UpdateAttributeValueDto, {
    value: "  18K金  ",
    isActive: false,
  });

  assert.deepEqual({ ...created }, { value: "足金999", sortOrder: 3 });
  assert.deepEqual(
    { ...updated },
    { value: "18K金", isActive: false },
  );
  await assert.rejects(
    validateBody(CreateAttributeValueDto, { value: "" }),
    BadRequestException,
  );
  await assert.rejects(
    validateBody(UpdateAttributeValueDto, { sortOrder: 1.5 }),
    BadRequestException,
  );
});
