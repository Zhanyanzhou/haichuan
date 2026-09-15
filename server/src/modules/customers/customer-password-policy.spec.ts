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
import { CustomersService } from "./customers.service";

const pipe = new ValidationPipe({ whitelist: true, transform: true });

function validateBody<T>(metatype: Type<T>, value: unknown): Promise<T> {
  return pipe.transform(value, {
    type: "body",
    metatype,
  } as ArgumentMetadata) as Promise<T>;
}

test("会员注册与密码重置只接受 6-18 位新密码", async () => {
  await assert.rejects(
    validateBody(CustomerRegisterDto, {
      phone: "13800138000",
      name: "测试会员",
      password: "a1b2c3",
    }),
    BadRequestException,
  );
  for (const password of ["123456", "x".repeat(18)]) {
    await assert.doesNotReject(
      validateBody(CustomerRegisterDto, {
        phone: "13800138000",
        name: "测试会员",
        password,
        smsCode: "123456",
      }),
    );
    await assert.doesNotReject(
      validateBody(ResetPasswordDto, {
        token: "a".repeat(64),
        password,
      }),
    );
  }

  for (const password of ["12345", "x".repeat(19)]) {
    await assert.rejects(
      validateBody(CustomerRegisterDto, {
        phone: "13800138000",
        name: "测试会员",
        password,
        smsCode: "123456",
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

test("会员注册和重置服务接受 6/18 位字母数字组合，拒绝越界和弱组合且不写入", async () => {
  const createdHashes: string[] = [];
  const updatedHashes: string[] = [];
  let claimedTokens = 0;
  let revokedSessions = 0;
  const transaction = {
    customer: {
      findUnique: async () => null,
      create: async ({ data }: { data: { passwordHash: string } }) => {
        createdHashes.push(data.passwordHash);
        return { id: 9, phone: "13800138000", name: "测试会员", email: null };
      },
      update: async ({ data }: { data: { passwordHash: string } }) => {
        updatedHashes.push(data.passwordHash);
        return { id: 9 };
      },
    },
    customerPasswordResetToken: {
      updateMany: async () => { claimedTokens += 1; return { count: 1 }; },
    },
    customerRefreshSession: {
      updateMany: async () => { revokedSessions += 1; return { count: 1 }; },
    },
    customerSmsCode: {
      findFirst: async () => ({ id: 1 }),
      updateMany: async () => ({ count: 1 }),
    },
  };
  const service = new CustomersService(
    {
      customerPasswordResetToken: {
        findUnique: async () => ({ id: 1, customerId: 9, usedAt: null, expiresAt: new Date(Date.now() + 60_000) }),
      },
      $transaction: async (action: (tx: typeof transaction) => Promise<unknown>) => action(transaction),
    } as never,
    {} as never,
    { sign: () => "test-access-token" } as never,
    {} as never,
    { isRegisterVerificationRequired: () => true } as never,
    {} as never,
  );
  for (const password of ["x".repeat(5), "x".repeat(19), "123456", "abcdef"] ) {
    await assert.rejects(service.register({ phone: "13800138000", name: "测试会员", password, smsCode: "123456" }), BadRequestException);
    await assert.rejects(service.resetPassword("a".repeat(64), password), BadRequestException);
  }
  assert.equal(createdHashes.length + updatedHashes.length + claimedTokens + revokedSessions, 0);
  for (const password of ["a1b2c3", `a1${"x".repeat(16)}`]) {
    await service.register({ phone: "13800138000", name: "测试会员", password, smsCode: "123456" });
    await service.resetPassword("a".repeat(64), password);
    assert.equal(await bcrypt.compare(password, createdHashes.at(-1)!), true);
    assert.equal(await bcrypt.compare(password, updatedHashes.at(-1)!), true);
  }
  assert.equal(claimedTokens, 2);
  assert.equal(revokedSessions, 2);
});

test("会员历史长密码仍能按原哈希登录", async () => {
  const password = "historical-valid-password";
  const service = new CustomersService(
    { customer: { findUnique: async () => ({ id: 9, phone: "13800138000", name: "测试会员", email: null, status: "ACTIVE", passwordHash: await bcrypt.hash(password, 4) }) } } as never,
    {} as never,
    { sign: () => "test-access-token" } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const result = await service.login({ phone: "13800138000", password });
  assert.equal(result.customer.id, 9);
  assert.equal("passwordHash" in result.customer, false);
});

test("微信绑定创建新会员需短信验真并强制 6-18 位新密码", async () => {
  const createdPasswords: string[] = [];
  const prisma = {
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
    };
  Object.assign(prisma, {
    $transaction: async (action: (tx: typeof prisma) => Promise<unknown>) => action(prisma),
  });
  const service = new WechatAuthService(
    prisma as never,
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

  // 短于或长于合同的输入均不得写入账户。
  for (const password of ["12345", "x".repeat(19)]) {
    await assert.rejects(
      service.bindWechat({
        bindToken: "header.payload.signature",
        phone: "13800138000",
        password,
        smsCode: "123456",
      }),
      BadRequestException,
    );
  }
  assert.equal(createdPasswords.length, 0);

  for (const password of ["a1b2c3", `a1${"x".repeat(16)}`]) {
    const result = await service.bindWechat({
      bindToken: "header.payload.signature",
      phone: "13800138000",
      password,
      smsCode: "123456",
    });
    assert.equal(result.customer.id, 9);
    assert.equal(await bcrypt.compare(password, createdPasswords.at(-1)!), true);
  }
  assert.equal(createdPasswords.length, 2);
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
