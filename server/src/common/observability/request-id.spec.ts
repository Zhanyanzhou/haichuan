import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRequestId, resolveRequestId } from "./request-id";

test("请求关联 ID 只接受受限字符和长度", () => {
  assert.equal(normalizeRequestId("checkout-20260824"), "checkout-20260824");
  assert.equal(normalizeRequestId(["admin-request-01"]), "admin-request-01");
  assert.equal(normalizeRequestId("short"), undefined);
  assert.equal(normalizeRequestId("line-break\nforged"), undefined);
  assert.equal(normalizeRequestId("a".repeat(65)), undefined);
});

test("缺失或非法请求 ID 时生成 UUID", () => {
  assert.match(resolveRequestId(undefined), /^[0-9a-f-]{36}$/);
  assert.match(resolveRequestId("bad value"), /^[0-9a-f-]{36}$/);
});
