import assert from "node:assert/strict";
import test from "node:test";
import { businessDateKey } from "./business-date";

test("交易编号日期按 Asia/Shanghai 运营日生成", () => {
  assert.equal(businessDateKey(new Date("2026-08-24T18:55:40.000Z")), "20260825");
  assert.equal(businessDateKey(new Date("2026-08-24T15:59:59.000Z")), "20260824");
  assert.equal(businessDateKey(new Date("2026-08-24T16:00:00.000Z")), "20260825");
});
