import assert from "node:assert/strict";
import test from "node:test";
import {
  DemoSeedPolicyError,
  resolveDemoSeedConfig,
} from "./demo-seed-policy";

function assertPolicyError(
  environment: Parameters<typeof resolveDemoSeedConfig>[0],
  expectedCode: string,
) {
  assert.throws(
    () => resolveDemoSeedConfig(environment),
    (error: unknown) =>
      error instanceof DemoSeedPolicyError && error.code === expectedCode,
  );
}

test("Demo Seed 在生产环境始终拒绝，即使显式打开开关", () => {
  assertPolicyError(
    {
      NODE_ENV: "production",
      ALLOW_DEMO_SEED: "true",
      DEMO_ADMIN_PASSWORD: "DemoPass123",
    },
    "demo-seed-production-forbidden",
  );
});

test("Demo Seed 默认关闭，缺少显式开关时拒绝", () => {
  assertPolicyError(
    { NODE_ENV: "development", DEMO_ADMIN_PASSWORD: "DemoPass123" },
    "demo-seed-opt-in-required",
  );
});

test("Demo Seed 管理员密码与统一 6-18 位账号密码合同一致", () => {
  assertPolicyError(
    {
      NODE_ENV: "development",
      ALLOW_DEMO_SEED: "true",
      DEMO_ADMIN_PASSWORD: "12345",
    },
    "demo-seed-password-invalid",
  );
  assertPolicyError(
    {
      NODE_ENV: "development",
      ALLOW_DEMO_SEED: "true",
      DEMO_ADMIN_PASSWORD: "1".repeat(19),
    },
    "demo-seed-password-invalid",
  );

  for (const password of ["123456", "x".repeat(18)]) {
    assert.deepEqual(
      resolveDemoSeedConfig({
        NODE_ENV: "development",
        ALLOW_DEMO_SEED: "true",
        DEMO_ADMIN_PASSWORD: password,
      }),
      { adminPassword: password },
    );
  }
});
