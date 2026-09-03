import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import {
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_PASSWORD_MIN_LENGTH,
  STAFF_PASSWORD_MAX_LENGTH,
  STAFF_PASSWORD_MIN_LENGTH,
  assertAccountPassword,
  assertStaffPassword,
} from "./staff-password-policy";

test("客户域新密码接受 8-64 位任意字符组合", () => {
  assert.equal(ACCOUNT_PASSWORD_MIN_LENGTH, 8);
  assert.equal(ACCOUNT_PASSWORD_MAX_LENGTH, 64);
  for (const password of [
    "12345678",
    "1234567890123456789012345678901234567890123456789012345678901234",
    "aaaaaaaa",
    "海川珠宝预览密码",
    "        ",
  ]) {
    assert.doesNotThrow(() => assertAccountPassword(password));
  }
});

test("客户域拒绝非字符串、短于 8 位或长于 64 位的输入", () => {
  for (const password of [undefined, null, "1234567", "a".repeat(65)]) {
    assert.throws(
      () => assertAccountPassword(password),
      (error: unknown) => error instanceof BadRequestException,
    );
  }
});

test("员工域新密码要求 12-64 位且拒绝常见弱口令", () => {
  assert.equal(STAFF_PASSWORD_MIN_LENGTH, 12);
  assert.equal(STAFF_PASSWORD_MAX_LENGTH, 64);
  for (const password of [
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
  for (const password of [undefined, null, "a".repeat(11), "a".repeat(65)]) {
    assert.throws(
      () => assertStaffPassword(password),
      (error: unknown) => error instanceof BadRequestException,
    );
  }
});

test("客户端账号密码配置与服务端 8-64 / 12-64 事实保持一致", () => {
  const clientPolicy = readFileSync(
    resolve(process.cwd(), "../client/src/config/accountPasswordPolicy.ts"),
    "utf8",
  );
  assert.match(clientPolicy, /ACCOUNT_PASSWORD_MIN_LENGTH = 8;/);
  assert.match(clientPolicy, /ACCOUNT_PASSWORD_MAX_LENGTH = 64;/);
  assert.match(clientPolicy, /STAFF_PASSWORD_MIN_LENGTH = 12;/);
  assert.match(clientPolicy, /STAFF_PASSWORD_MAX_LENGTH = 64;/);
});
