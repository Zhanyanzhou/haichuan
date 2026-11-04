import assert from "node:assert/strict";
import test from "node:test";
import { cachedImageFactFields, trustedDisplaySize } from "./src/page-builder/fields/trustedMediaSize.ts";

test("unknown 带着旧宽高或旧展示尺寸时不能判断清晰度", () => {
  assert.equal(trustedDisplaySize({
    width: 3840,
    height: 2160,
    metadataStatus: "unknown",
  }), null);
  assert.equal(trustedDisplaySize({
    width: 3840,
    height: 2160,
    displayWidth: 3840,
    displayHeight: 2160,
    metadataStatus: "unknown",
  }), null);
  assert.deepEqual(cachedImageFactFields({
    width: 3840,
    height: 2160,
    metadataStatus: "unknown",
  }), { metadataStatus: "unknown" });
});

test("没有展示尺寸、以及缺省状态只有数据库宽高时保持未知", () => {
  assert.equal(trustedDisplaySize({ width: 3840, height: 2160 }), null);
  assert.equal(trustedDisplaySize({}), null);
  assert.deepEqual(cachedImageFactFields({ width: 941, height: 1672 }), {});
});

test("已测量和缺省的成对展示尺寸可以判断，EXIF 展示尺寸优先于原始宽高", () => {
  assert.deepEqual(trustedDisplaySize({
    width: 200,
    height: 100,
    displayWidth: 100,
    displayHeight: 200,
    metadataStatus: "measured",
  }), { displayWidth: 100, displayHeight: 200 });
  assert.deepEqual(trustedDisplaySize({
    displayWidth: 3840,
    displayHeight: 2160,
  }), { displayWidth: 3840, displayHeight: 2160 });
  assert.deepEqual(trustedDisplaySize({
    width: 100,
    height: 200,
    metadataStatus: "measured",
  }), { displayWidth: 100, displayHeight: 200 });
});
