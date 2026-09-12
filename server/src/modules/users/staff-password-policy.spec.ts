import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { CreateUserDto, UpdateUserDto } from "./dto/user.dto";
import { RegisterDto } from "../auth/dto/register.dto";
import { UsersService } from "./users.service";
import {
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_PASSWORD_MIN_LENGTH,
  STAFF_PASSWORD_MAX_LENGTH,
  STAFF_PASSWORD_MIN_LENGTH,
  assertAccountPassword,
  assertStaffPassword,
} from "./staff-password-policy";

test("客户域新密码接受 6-18 位字母数字组合并拒绝纯数字、纯字母与弱口令", () => {
  assert.equal(ACCOUNT_PASSWORD_MIN_LENGTH, 6);
  assert.equal(ACCOUNT_PASSWORD_MAX_LENGTH, 18);
  for (const password of [
    "a1b2c3",
    `a1${"x".repeat(16)}`,
    "Haichuan2026!",
  ]) {
    assert.doesNotThrow(() => assertAccountPassword(password));
  }
  for (const password of ["123456", "abcdef", "password1", "qwerty1"]) {
    assert.throws(
      () => assertAccountPassword(password),
      (error: unknown) => error instanceof BadRequestException,
    );
  }
});

test("客户域拒绝非字符串、短于 6 位或长于 18 位的输入", () => {
  for (const password of [undefined, null, "12345", "a".repeat(19)]) {
    assert.throws(
      () => assertAccountPassword(password),
      (error: unknown) => error instanceof BadRequestException,
    );
  }
});

test("员工域新密码要求 6-18 位且拒绝常见弱口令", () => {
  assert.equal(STAFF_PASSWORD_MIN_LENGTH, 6);
  assert.equal(STAFF_PASSWORD_MAX_LENGTH, 18);
  for (const password of [
    "aB3!xy",
    "x".repeat(18),
    "zh3-Haichuan.Gold",
    "173#8502xkQP",
    "海川珠宝员工密码示例一号",
  ]) {
    assert.doesNotThrow(() => assertStaffPassword(password));
  }
  for (const weak of [
    "123456789012",
    "password2024!",
    "PASSWORD",
    "admin12345678",
    "haichuan123",
    "12345678901",
  ]) {
    assert.throws(
      () => assertStaffPassword(weak),
      (error: unknown) => error instanceof BadRequestException,
    );
  }
  // 长度不足直接拒绝
  for (const password of [undefined, null, "a".repeat(5), "a".repeat(19)]) {
    assert.throws(
      () => assertStaffPassword(password),
      (error: unknown) => error instanceof BadRequestException,
    );
  }
});

test("客户端账号密码配置与服务端 6-18 / 6-18 事实保持一致", () => {
  const clientPolicy = readFileSync(
    resolve(process.cwd(), "../client/src/config/accountPasswordPolicy.ts"),
    "utf8",
  );
  assert.match(clientPolicy, /ACCOUNT_PASSWORD_MIN_LENGTH = 6;/);
  assert.match(clientPolicy, /ACCOUNT_PASSWORD_MAX_LENGTH = 18;/);
  assert.match(clientPolicy, /STAFF_PASSWORD_MIN_LENGTH = 6;/);
  assert.match(clientPolicy, /STAFF_PASSWORD_MAX_LENGTH = 18;/);
});

test("员工注册、新建和改密 DTO 接受 6/18 位，拒绝 5/19 位", async () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  for (const metatype of [RegisterDto, CreateUserDto, UpdateUserDto]) {
    for (const length of [5, 6, 18, 19]) {
      const validation = pipe.transform(
        { username: "test-staff", password: "x".repeat(length) },
        { type: "body", metatype },
      );
      if (length === 6 || length === 18) await assert.doesNotReject(validation);
      else await assert.rejects(validation, BadRequestException);
    }
  }
});

test("员工新建和重置服务执行长度与弱口令检查，成功只保存哈希并撤销旧会话", async () => {
  const createdHashes: string[] = [];
  const updatedHashes: string[] = [];
  let revokedSessions = 0;
  const transaction = {
    user: {
      findUnique: async () => ({ id: 8, role: "EDITOR", status: "ACTIVE" }),
      update: async ({ data }: { data: { password: string } }) => {
        updatedHashes.push(data.password);
        return { id: 8 };
      },
    },
    adminRefreshSession: {
      updateMany: async () => { revokedSessions += 1; return { count: 1 }; },
    },
  };
  const service = new UsersService({
    user: {
      create: async ({ data }: { data: { password: string } }) => {
        createdHashes.push(data.password);
        return { id: 8 };
      },
    },
    $transaction: async (action: (tx: typeof transaction) => Promise<unknown>) => action(transaction),
  } as never);
  for (const password of ["x".repeat(5), "x".repeat(19), "password2024!"]) {
    await assert.rejects(service.create({ username: "test-staff", password }), BadRequestException);
    await assert.rejects(service.update(8, { password }, { id: 1, role: "SUPER_ADMIN" }), BadRequestException);
  }
  assert.equal(createdHashes.length + updatedHashes.length + revokedSessions, 0);
  for (const password of ["aB3!xy", "x".repeat(18)]) {
    await service.create({ username: "test-staff", password });
    await service.update(8, { password }, { id: 1, role: "SUPER_ADMIN" });
    assert.equal(await bcrypt.compare(password, createdHashes.at(-1)!), true);
    assert.equal(await bcrypt.compare(password, updatedHashes.at(-1)!), true);
  }
  assert.equal(revokedSessions, 2);
});
