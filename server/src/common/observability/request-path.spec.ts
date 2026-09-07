import * as assert from "node:assert/strict";
import { test } from "node:test";
import { requestLogPath, requestPathOnly } from "./request-path";

test("请求日志路径移除密码重置和 OAuth 查询参数", () => {
  assert.equal(
    requestPathOnly("/customer/reset?%74oken=do-not-log&next=/customer"),
    "/customer/reset",
  );
  assert.equal(
    requestPathOnly("/api/customers/wechat/callback?code=do-not-log&state=do-not-log"),
    "/api/customers/wechat/callback",
  );
  assert.equal(
    requestPathOnly("https://shop.example.test/api/probe?futureCredential=do-not-log"),
    "/api/probe",
  );
});

test("普通路径保持可诊断且畸形输入安全退化", () => {
  assert.equal(requestPathOnly("/api/products/public"), "/api/products/public");
  assert.equal(requestPathOnly("not-a-request-target?token=x"), "/");
  assert.equal(requestPathOnly(undefined), "/");
});

test("访问日志路径折叠记录 ID 和高熵路径段", () => {
  assert.equal(requestLogPath("/api/orders/123/payment"), "/api/orders/:id/payment");
  assert.equal(
    requestLogPath("/api/assets/123e4567-e89b-12d3-a456-426614174000"),
    "/api/assets/:id",
  );
  assert.equal(
    requestLogPath(`/api/assets/${"a".repeat(64)}?token=secret`),
    "/api/assets/:value",
  );
  assert.equal(requestLogPath("/api/payments/PAY-20260906-001"), "/api/payments/:id");
  assert.equal(requestLogPath("/api/customer/buyer%40example.test"), "/api/customer/:value");
});
