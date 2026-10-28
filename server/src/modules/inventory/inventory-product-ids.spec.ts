import assert from "node:assert/strict";
import test from "node:test";
import { parseInventoryProductIds } from "./inventory-product-ids";

test("空白的商品编号不筛选库存", () => {
  assert.equal(parseInventoryProductIds(undefined), undefined);
  assert.equal(parseInventoryProductIds("  "), undefined);
});

test("商品编号去重、忽略无效值，并最多保留 50 个", () => {
  const raw = Array.from({ length: 60 }, (_, index) => index + 1).join(",");
  const ids = parseInventoryProductIds(`1, 1, x, ${raw}`);
  assert.deepEqual(ids?.slice(0, 3), [1, 2, 3]);
  assert.equal(ids?.length, 50);
});

test("查询里没有有效商品编号时返回空列表", () => {
  assert.deepEqual(parseInventoryProductIds("a,b"), []);
});
