import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import {
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_PASSWORD_MIN_LENGTH,
  assertAccountPassword,
  assertStaffPassword,
} from "./staff-password-policy";

test("员工与会员的新密码统一接受 6-18 位任意字符组合", () => {
  assert.equal(ACCOUNT_PASSWORD_MIN_LENGTH, 6);
  assert.equal(ACCOUNT_PASSWORD_MAX_LENGTH, 18);
  for (const password of [
    "123456",
    "123456789012345678",
    "aaaaaa",
    "海川珠宝预览",
    "      ",
  ]) {
    assert.doesNotThrow(() => assertAccountPassword(password));
    assert.doesNotThrow(() => assertStaffPassword(password));
  }
});

test("统一密码合同拒绝非字符串、短于 6 位或长于 18 位的输入", () => {
  for (const password of [undefined, null, "12345", "1234567890123456789"]) {
    assert.throws(
      () => assertAccountPassword(password),
      (error: unknown) => error instanceof BadRequestException,
    );
  }
});

test("客户端账号密码配置与服务端 6-18 位事实保持一致", () => {
  const clientPolicy = readFileSync(
    resolve(process.cwd(), "../client/src/config/accountPasswordPolicy.ts"),
    "utf8",
  );
  assert.match(clientPolicy, /ACCOUNT_PASSWORD_MIN_LENGTH = 6;/);
  assert.match(clientPolicy, /ACCOUNT_PASSWORD_MAX_LENGTH = 18;/);
});
