import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ServiceUnavailableException, ValidationPipe } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import type { ArgumentMetadata, Type } from "@nestjs/common";
import {
  CustomerLoginDto,
  CustomerRegisterDto,
  ResetPasswordDto,
} from "./dto/customer-auth.dto";
import { WechatAuthService } from "../wechat-auth/wechat-auth.service";

const pipe = new ValidationPipe({ whitelist: true, transform: true });

function validateBody<T>(metatype: Type<T>, value: unknown): Promise<T> {
  return pipe.transform(value, {
    type: "body",
    metatype,
  } as ArgumentMetadata) as Promise<T>;
}

test("会员注册与密码重置只接受 8-64 位新密码", async () => {
  for (const password of ["12345678", "x".repeat(64)]) {
    await assert.doesNotReject(
      validateBody(CustomerRegisterDto, {
        phone: "13800138000",
        name: "测试会员",
        password,
      }),
    );
    await assert.doesNotReject(
      validateBody(ResetPasswordDto, {
        token: "a".repeat(64),
        password,
      }),
    );
  }

  for (const password of ["1234567", "x".repeat(65)]) {
    await assert.rejects(
      validateBody(CustomerRegisterDto, {
        phone: "13800138000",
        name: "测试会员",
        password,
      }),
      BadRequestException,
    );
    await assert.rejects(
      validateBody(ResetPasswordDto, {
        token: "a".repeat(64),
        password,
      }),
      BadRequestException,
    );
  }
});

test("会员登录保留历史密码兼容，但拒绝空值和异常超长输入", async () => {
  await assert.doesNotReject(
    validateBody(CustomerLoginDto, {
      phone: "13800138000",
      password: "x".repeat(64),
    }),
  );
  await assert.rejects(
    validateBody(CustomerLoginDto, {
      phone: "13800138000",
      password: "",
    }),
    BadRequestException,
  );
  await assert.rejects(
    validateBody(CustomerLoginDto, {
      phone: "13800138000",
      password: "x".repeat(129),
    }),
    BadRequestException,
  );
});

test("微信绑定创建新会员需短信验真并强制 8-64 位新密码", async () => {
  const createdPasswords: string[] = [];
  const service = new WechatAuthService(
    {
      customer: {
        findUnique: async () => null,
        create: async ({ data }: { data: { phone: string; passwordHash: string } }) => {
          createdPasswords.push(data.passwordHash);
          return {
            id: 9,
            phone: data.phone,
            name: null,
            email: null,
          };
        },
      },
      customerSmsCode: {
        findFirst: async () => ({ id: 1 }),
        updateMany: async () => ({ count: 1 }),
      },
    } as never,
    {
      verifyAsync: async () => ({
        type: "customer",
        tokenUse: "wechat-bind",
        openid: "wechat-openid",
        unionid: null,
      }),
      sign: () => "test-access-token",
    } as never,
    { isAvailable: () => true } as never,
  );

  // 缺少短信验证码：新号建账户被拒绝
  await assert.rejects(
    service.bindWechat({
      bindToken: "header.payload.signature",
      phone: "13800138000",
      password: "12345678",
    }),
    BadRequestException,
  );

  // 密码长度不足：短信验真通过后仍被长度合同拒绝
  await assert.rejects(
    service.bindWechat({
      bindToken: "header.payload.signature",
      phone: "13800138000",
      password: "1234567",
      smsCode: "123456",
    }),
    BadRequestException,
  );

  const result = await service.bindWechat({
    bindToken: "header.payload.signature",
    phone: "13800138000",
    password: "12345678",
    smsCode: "123456",
  });
  assert.equal(result.customer.id, 9);
  assert.equal(createdPasswords.length, 1);
  assert.notEqual(createdPasswords[0], "12345678");
});

test("短信通道未配置时微信绑定拒绝新建账户（不建无主权号）", async () => {
  const service = new WechatAuthService(
    {
      customer: {
        findUnique: async () => null,
        create: async () => {
          throw new Error("不应创建账户");
        },
      },
    } as never,
    {
      verifyAsync: async () => ({
        type: "customer",
        tokenUse: "wechat-bind",
        openid: "wechat-openid",
        unionid: null,
      }),
      sign: () => "test-access-token",
    } as never,
    { isAvailable: () => false } as never,
  );

  await assert.rejects(
    service.bindWechat({
      bindToken: "header.payload.signature",
      phone: "13800138000",
      password: "12345678",
      smsCode: "123456",
    }),
    ServiceUnavailableException,
  );
});

test("微信绑定既有手机号按历史哈希校验且不套用 18 位新密码上限", async () => {
  const historicalPassword = "historical-password-accepted-before-policy-change";
  const passwordHash = await bcrypt.hash(historicalPassword, 4);
  let updatedCustomerId: number | undefined;
  const service = new WechatAuthService(
    {
      customer: {
        findUnique: async () => ({
          id: 12,
          phone: "13800138000",
          name: "历史会员",
          email: null,
          status: "ACTIVE",
          passwordHash,
          wechatOpenId: null,
        }),
        update: async ({ where }: { where: { id: number } }) => {
          updatedCustomerId = where.id;
          return {
            id: where.id,
            phone: "13800138000",
            name: "历史会员",
            email: null,
          };
        },
      },
    } as never,
    {
      verifyAsync: async () => ({
        type: "customer",
        tokenUse: "wechat-bind",
        openid: "wechat-openid",
        unionid: null,
      }),
      sign: () => "test-access-token",
    } as never,
    { isAvailable: () => true } as never,
  );

  const result = await service.bindWechat({
    bindToken: "header.payload.signature",
    phone: "13800138000",
    password: historicalPassword,
  });
  assert.equal(result.customer.id, 12);
  assert.equal(updatedCustomerId, 12);
});
