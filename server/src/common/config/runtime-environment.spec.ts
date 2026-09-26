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
  assert.equal(result.PAYMENT_PROVIDER_MODE, "disabled");
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

test("分析采集开启时必须同时开启到期清理", () => {
  for (const retentionEnabled of [undefined, "", "false"]) {
    assert.throws(
      () => validateRuntimeEnvironment({
        ...validProduction,
        ANALYTICS_INGESTION_ENABLED: "true",
        ANALYTICS_RETENTION_ENABLED: retentionEnabled,
      }),
      /ANALYTICS_RETENTION_ENABLED.*ANALYTICS_INGESTION_ENABLED/,
    );
  }

  const enabled = validateRuntimeEnvironment({
    ...validProduction,
    ANALYTICS_INGESTION_ENABLED: "true",
    ANALYTICS_RETENTION_ENABLED: "true",
  });
  assert.equal(enabled.ANALYTICS_INGESTION_ENABLED, "true");
  assert.equal(enabled.ANALYTICS_RETENTION_ENABLED, "true");

  assert.doesNotThrow(() => validateRuntimeEnvironment({
    ...validProduction,
    ANALYTICS_INGESTION_ENABLED: "false",
    ANALYTICS_RETENTION_ENABLED: "false",
  }));

  assert.throws(
    () => validateRuntimeEnvironment({
      NODE_ENV: "development",
      JWT_SECRET: "local-test-secret",
      ANALYTICS_INGESTION_ENABLED: "true",
      ANALYTICS_RETENTION_ENABLED: "false",
    }),
    /ANALYTICS_RETENTION_ENABLED.*ANALYTICS_INGESTION_ENABLED/,
  );
});

test("合作申请写能力开启时必须绑定已发布的正式协议快照", () => {
  const base = {
    ...validProduction,
    PARTNER_APPLICATIONS_WRITE_ENABLED: "true",
  };
  for (const candidate of [
    base,
    { ...base, PARTNER_AGREEMENT_STATUS: "draft", PARTNER_AGREEMENT_VERSION: "partner-agreement-v1", PARTNER_AGREEMENT_SHA256: "a".repeat(64) },
    { ...base, PARTNER_AGREEMENT_STATUS: "published", PARTNER_AGREEMENT_VERSION: "partner-agreement-v0", PARTNER_AGREEMENT_SHA256: "a".repeat(64) },
    { ...base, PARTNER_AGREEMENT_STATUS: "published", PARTNER_AGREEMENT_VERSION: "partner-agreement-v1", PARTNER_AGREEMENT_SHA256: "short" },
  ]) {
    assert.throws(
      () => validateRuntimeEnvironment(candidate),
      /PARTNER_APPLICATIONS_WRITE_ENABLED.*PARTNER_AGREEMENT_VERSION.*PARTNER_AGREEMENT_SHA256/,
    );
  }

  assert.doesNotThrow(() => validateRuntimeEnvironment({
    ...base,
    PARTNER_AGREEMENT_STATUS: "published",
    PARTNER_AGREEMENT_VERSION: "partner-agreement-v1",
    PARTNER_AGREEMENT_SHA256: "A".repeat(64),
  }));
});

test("非生产仍要求 JWT 存在，但不把生产强度门禁强加给本地测试", () => {
  assert.equal(resolveJwtSecret(" local-test-secret ", "test"), "local-test-secret");
  assert.throws(() => resolveJwtSecret("   ", "development"), /JWT_SECRET/);
});

test("支付 provider mode 只接受显式枚举，生产环境拒绝 simulator", () => {
  for (const mode of ["disabled", "live"]) {
    assert.equal(
      validateRuntimeEnvironment({
        ...validProduction,
        PAYMENT_PROVIDER_MODE: mode,
      }).PAYMENT_PROVIDER_MODE,
      mode,
    );
  }
  assert.throws(
    () =>
      validateRuntimeEnvironment({
        ...validProduction,
        PAYMENT_PROVIDER_MODE: "simulator",
      }),
    /simulator.*生产环境/,
  );
  assert.throws(
    () =>
      validateRuntimeEnvironment({
        ...validProduction,
        PAYMENT_PROVIDER_MODE: "sandbox",
      }),
    /unsupported payment provider mode/,
  );
});

test("隔离 simulator 要求场景和独立签名密钥且拒绝真实渠道凭据", () => {
  const simulator = {
    NODE_ENV: "test",
    JWT_SECRET: "local-test-secret",
    RELEASE_PROFILE: "commerce",
    PAYMENT_PROVIDER_MODE: "simulator",
    PAYMENT_SIMULATOR_BASE_URL: "http://127.0.0.1:4319",
    PAYMENT_SIMULATOR_SCENARIO: "success",
    PAYMENT_SIMULATOR_SIGNING_SECRET:
      "local-simulator-signing-secret-32-bytes",
  };

  const validated = validateRuntimeEnvironment(simulator);
  assert.equal(validated.PAYMENT_PROVIDER_MODE, "simulator");
  assert.equal(
    validated.PAYMENT_SIMULATOR_BASE_URL,
    "http://127.0.0.1:4319",
  );
  assert.equal(validated.PAYMENT_SIMULATOR_SCENARIO, "success");

  for (const candidate of [
    { ...simulator, PAYMENT_SIMULATOR_SCENARIO: "unknown" },
    { ...simulator, PAYMENT_SIMULATOR_SIGNING_SECRET: "short" },
    { ...simulator, PAYMENT_SIMULATOR_SIGNING_SECRET: undefined },
    { ...simulator, PAYMENT_SIMULATOR_BASE_URL: undefined },
    { ...simulator, PAYMENT_SIMULATOR_BASE_URL: "https://127.0.0.1:4319" },
    { ...simulator, PAYMENT_SIMULATOR_BASE_URL: "http://example.com:4319" },
    { ...simulator, PAYMENT_SIMULATOR_BASE_URL: "http://127.0.0.1" },
    { ...simulator, WECHAT_MCH_ID: "synthetic-but-provider-shaped" },
    { ...simulator, ALIPAY_APP_ID: "synthetic-but-provider-shaped" },
  ]) {
    assert.throws(() => validateRuntimeEnvironment(candidate));
  }
});
