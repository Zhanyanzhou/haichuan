import * as assert from "node:assert/strict";
import { test } from "node:test";
import { HttpException } from "@nestjs/common";
import { IdempotencyService, parseIdempotencyKey } from "./idempotency-key";

test("Idempotency-Key 缺失返回 428，非法格式返回 400", () => {
  assert.throws(
    () => parseIdempotencyKey(undefined),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 428,
  );
  assert.throws(
    () => parseIdempotencyKey("short"),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 400,
  );
});
test("幂等键按业务作用域稳定散列且互不碰撞", () => {
  const service = new IdempotencyService();
  const key = "order:client-0001";
  assert.equal(service.scopedHash("order.create", key).length, 64);
  assert.equal(
    service.scopedHash("order.create", key),
    service.scopedHash("order.create", key),
  );
  assert.notEqual(
    service.scopedHash("order.create", key),
    service.scopedHash("quotation.accept", key),
  );
});
