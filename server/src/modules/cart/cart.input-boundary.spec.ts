import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import type { ArgumentMetadata, Type } from "@nestjs/common";
import { AddCartItemDto, UpdateCartItemDto } from "./dto/cart-item.dto";
import { BindWechatDto } from "../wechat-auth/dto/bind-wechat.dto";

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

test("购物车新增 DTO 转换数值并剥离非白名单字段", async () => {
  const result = await validateBody(AddCartItemDto, {
    productId: "11",
    skuId: "22",
    quantity: "3",
    internalOnly: "must-not-reach-service",
  });

  assert.equal(result.productId, 11);
  assert.equal(result.skuId, 22);
  assert.equal(result.quantity, 3);
  assert.equal("internalOnly" in result, false);
});

test("购物车新增 DTO 在 service 之前拒绝缺字段和越界数量", async () => {
  await assert.rejects(
    validateBody(AddCartItemDto, { skuId: 22, quantity: 100 }),
    BadRequestException,
  );
});

test("购物车改量只允许 0 到 99 的整数", async () => {
  assert.equal((await validateBody(UpdateCartItemDto, { quantity: 0 })).quantity, 0);
  await assert.rejects(
    validateBody(UpdateCartItemDto, { quantity: -1 }),
    BadRequestException,
  );
  await assert.rejects(
    validateBody(UpdateCartItemDto, { quantity: 1.5 }),
    BadRequestException,
  );
});

test("微信绑定 DTO 限制一次性 token、手机号和强密码", async () => {
  const result = await validateBody(BindWechatDto, {
    bindToken: "a".repeat(48),
    phone: "13800138000",
    password: "Password123",
    name: "测试客户",
    role: "SUPER_ADMIN",
  });
  assert.equal("role" in result, false);

  await assert.rejects(
    validateBody(BindWechatDto, {
      bindToken: "not-a-token",
      phone: "123",
      password: "weak",
    }),
    BadRequestException,
  );
});
