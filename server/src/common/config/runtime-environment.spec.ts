import * as assert from "node:assert/strict";
import { test } from "node:test";
import { resolveJwtSecret, validateRuntimeEnvironment } from "./runtime-environment";

const validProduction = {
  NODE_ENV: "production",
  JWT_SECRET: "94f235b06f33449a8bdeac543679ef71",
  DATABASE_URL: "mysql://app:strong-password@mysql:3306/jewelry_db",
  CORS_ORIGIN: "https://shop.haichuan-jewelry.com",
};

test("生产启动拒绝缺失、过短和示例 JWT 密钥且不在错误中回显输入", () => {
  for (const secret of [
    undefined,
    "short-secret",
    "change-me-change-me-change-me-change-me",
    "example-secret-example-secret-0000",
  ]) {
    assert.throws(
      () => validateRuntimeEnvironment({ ...validProduction, JWT_SECRET: secret }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /JWT_SECRET/);
        if (typeof secret === "string") assert.equal(error.message.includes(secret), false);
        return true;
      },
    );
  }
});

test("生产启动拒绝数据库和 CORS 示例值，但不回显配置内容", () => {
  for (const candidate of [
    { ...validProduction, DATABASE_URL: "mysql://app:请设置应用密码@mysql:3306/jewelry_db" },
    { ...validProduction, CORS_ORIGIN: "https://你的域名" },
  ]) {
    assert.throws(
      () => validateRuntimeEnvironment(candidate),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes("请设置应用密码"), false);
        assert.equal(error.message.includes("https://你的域名"), false);
        return true;
      },
    );
  }
});

test("生产启动拒绝明文 HTTP CORS 来源", () => {
  assert.throws(
    () =>
      validateRuntimeEnvironment({
        ...validProduction,
        CORS_ORIGIN: "http://shop.haichuan-jewelry.com",
      }),
    /CORS_ORIGIN.*HTTPS/,
  );
});

test("合法生产配置通过并保留规范化后的必要值", () => {
  const result = validateRuntimeEnvironment(validProduction);
  assert.equal(result.NODE_ENV, "production");
  assert.equal(result.JWT_SECRET, validProduction.JWT_SECRET);
  assert.equal(result.DATABASE_URL, validProduction.DATABASE_URL);
  assert.equal(result.CORS_ORIGIN, validProduction.CORS_ORIGIN);
  assert.equal(result.RELEASE_PROFILE, "lead-generation");
});

test("运行时发布档位只接受权威枚举并对负向值失败关闭", () => {
  for (const releaseProfile of ["lead-generation", "commerce"]) {
    assert.equal(
      validateRuntimeEnvironment({ ...validProduction, RELEASE_PROFILE: releaseProfile }).RELEASE_PROFILE,
      releaseProfile,
    );
  }
  for (const releaseProfile of ["content-only", "transactional", "Commerce", "unknown"]) {
    assert.throws(
      () => validateRuntimeEnvironment({ ...validProduction, RELEASE_PROFILE: releaseProfile }),
      { message: "unsupported release profile" },
    );
  }
});

test("非生产仍要求 JWT 存在，但不把生产强度门禁强加给本地测试", () => {
  assert.equal(resolveJwtSecret(" local-test-secret ", "test"), "local-test-secret");
  assert.throws(() => resolveJwtSecret("   ", "development"), /JWT_SECRET/);
});
