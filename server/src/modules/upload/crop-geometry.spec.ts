import assert from "node:assert/strict";
import test from "node:test";
import { normalizedCropToPixels } from "./crop-geometry";

test("归一化裁切转为像素并夹紧到图片边界", () => {
  assert.deepEqual(
    normalizedCropToPixels({ x: 0.1, y: 0.2, width: 0.5, height: 0.4 }, 1000, 800),
    { left: 100, top: 160, width: 500, height: 320 },
  );
  assert.deepEqual(
    normalizedCropToPixels({ x: 0.9, y: 0.9, width: 0.3, height: 0.3 }, 100, 100),
    { left: 90, top: 90, width: 10, height: 10 },
  );
});

test("无效尺寸或空裁切返回空", () => {
  assert.equal(normalizedCropToPixels({ x: 0, y: 0, width: 1, height: 1 }, 0, 100), null);
  assert.equal(normalizedCropToPixels({ x: 0, y: 0, width: 0, height: 1 }, 100, 100), null);
  assert.equal(normalizedCropToPixels({ x: Number.NaN, y: 0, width: 1, height: 1 }, 100, 100), null);
});
