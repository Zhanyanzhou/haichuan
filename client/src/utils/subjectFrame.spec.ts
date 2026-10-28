import assert from "node:assert/strict";
import test from "node:test";
import { frameLightBackdrop } from "./subjectFrame.ts";

function canvas(width: number, height: number, paint: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const index = (y * width + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 255;
    }
  }
  return data;
}

test("浅色留白过大时收紧到主体", () => {
  const data = canvas(100, 100, (x, y) => (
    x >= 40 && x < 60 && y >= 20 && y < 80 ? [196, 132, 42] : [250, 250, 250]
  ));
  const frame = frameLightBackdrop(data, 100, 100);
  assert.ok(frame);
  assert.ok(frame.aspectRatio < 0.6);
  assert.match(frame.objectViewBox, /^inset\(/);
});

test("主体已经铺满时不裁切", () => {
  const data = canvas(40, 40, (x, y) => (
    x < 2 || y < 2 || x > 37 || y > 37 ? [250, 250, 250] : [40, 40, 40]
  ));
  assert.equal(frameLightBackdrop(data, 40, 40), null);
});
