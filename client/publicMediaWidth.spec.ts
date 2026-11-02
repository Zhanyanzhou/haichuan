import assert from "node:assert/strict";
import test from "node:test";
import { withPublicMediaWidth } from "./src/utils/publicMediaWidth.ts";
import { isStreamHandshake } from "./src/utils/streamHandshake.ts";

test("商品媒体地址追加白名单宽度，已有宽度和外链不动", () => {
  assert.equal(
    withPublicMediaWidth("/products/public/22/media/18", 800),
    "/products/public/22/media/18?width=800",
  );
  assert.equal(
    withPublicMediaWidth("/products/public/22/media/18?width=480", 800),
    "/products/public/22/media/18?width=480",
  );
  assert.equal(withPublicMediaWidth("/images/system/product-placeholder.svg", 800), "/images/system/product-placeholder.svg");
});

test("连接握手不触发商品重载", () => {
  assert.equal(isStreamHandshake(JSON.stringify({ type: "ready" })), true);
  assert.equal(isStreamHandshake(JSON.stringify({ data: { type: "heartbeat" } })), true);
  assert.equal(isStreamHandshake(JSON.stringify({ type: "products-changed", productId: 22 })), false);
  assert.equal(isStreamHandshake(undefined), false);
});
