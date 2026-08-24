import * as assert from "node:assert/strict";
import { test } from "node:test";
import { resolveCorsOrigins } from "./cors-origins";

test("开发环境未配置时保留现有本机端口白名单", () => {
  const origins = resolveCorsOrigins("development", undefined);
  assert.ok(origins.includes("http://127.0.0.1:5174"));
  assert.ok(origins.includes("http://localhost:5177"));
});

test("开发环境显式配置时只使用精确 loopback 来源", () => {
  assert.deepEqual(
    resolveCorsOrigins(
      "development",
      "http://127.0.0.1:5189,http://localhost:5189,http://[::1]:5189",
    ),
    [
      "http://127.0.0.1:5189",
      "http://localhost:5189",
      "http://[::1]:5189",
    ],
  );
});

for (const origin of [
  "*",
  "null",
  "http://0.0.0.0:5189",
  "http://192.168.1.10:5189",
  "https://example.com",
  "http://localhost:5189/",
  "http://localhost:5189/path",
  "http://localhost:5189?query=1",
  "http://localhost:5189#fragment",
  "http://localhost:5189,",
]) {
  test(`开发环境拒绝非精确本机来源：${origin}`, () => {
    assert.throws(() => resolveCorsOrigins("development", origin));
  });
}

test("生产环境仍要求显式来源并允许已确认的 HTTPS 域名", () => {
  assert.throws(
    () => resolveCorsOrigins("production", undefined),
    /生产环境为必填项/,
  );
  assert.deepEqual(
    resolveCorsOrigins("production", "https://confirmed.example.com"),
    ["https://confirmed.example.com"],
  );
});
