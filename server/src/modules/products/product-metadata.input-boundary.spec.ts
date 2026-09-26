import assert from "node:assert/strict";
import test from "node:test";
import {
  BadRequestException,
  ParseIntPipe,
  ValidationPipe,
} from "@nestjs/common";
import type { ArgumentMetadata, Type } from "@nestjs/common";
import {
  SetProductImagePointerDto,
  UpdateProductAttributesDto,
  UpdateProductTagsDto,
} from "./dto/product-metadata.dto";

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

test("商品图片指针只接受正整数且 imageId 必填", async () => {
  const result = await validateBody(SetProductImagePointerDto, { imageId: "12" });
  assert.equal(result.imageId, 12);

  for (const payload of [{}, { imageId: 0 }, { imageId: 1.5 }, { imageId: "invalid" }]) {
    await assert.rejects(
      validateBody(SetProductImagePointerDto, payload),
      BadRequestException,
    );
  }
});

test("商品标签允许显式空数组清空并规范化标签", async () => {
  const cleared = await validateBody(UpdateProductTagsDto, { tags: [] });
  assert.deepEqual(cleared.tags, []);

  const normalized = await validateBody(UpdateProductTagsDto, {
    tags: ["  节日赠礼  ", "古法工艺"],
  });
  assert.deepEqual(normalized.tags, ["节日赠礼", "古法工艺"]);
});

test("商品标签拒绝缺失字段、重复值、空值、超长值和超量数组", async () => {
  for (const payload of [
    {},
    { tags: ["同名", " 同名 "] },
    { tags: ["   "] },
    { tags: ["x".repeat(51)] },
    { tags: Array.from({ length: 51 }, (_, index) => `标签-${index}`) },
  ]) {
    await assert.rejects(
      validateBody(UpdateProductTagsDto, payload),
      BadRequestException,
    );
  }
});

test("商品属性允许显式空数组清空并把数字字符串规范化为正整数", async () => {
  const cleared = await validateBody(UpdateProductAttributesDto, {
    attributeValueIds: [],
  });
  assert.deepEqual(cleared.attributeValueIds, []);

  const normalized = await validateBody(UpdateProductAttributesDto, {
    attributeValueIds: ["1", "2"],
  });
  assert.deepEqual(normalized.attributeValueIds, [1, 2]);
});

test("商品属性拒绝缺失字段、非正整数、重复值和超量数组", async () => {
  for (const payload of [
    {},
    { attributeValueIds: [0] },
    { attributeValueIds: [1.5] },
    { attributeValueIds: [1, "1"] },
    { attributeValueIds: Array.from({ length: 51 }, (_, index) => index + 1) },
  ]) {
    await assert.rejects(
      validateBody(UpdateProductAttributesDto, payload),
      BadRequestException,
    );
  }
});

test("商品元数据端点的 product id 使用正十进制整数路径参数", async () => {
  const productIdPipe = new ParseIntPipe();
  assert.equal(await productIdPipe.transform("42", { type: "param" }), 42);
  await assert.rejects(
    productIdPipe.transform("invalid", { type: "param" }),
    BadRequestException,
  );
});
