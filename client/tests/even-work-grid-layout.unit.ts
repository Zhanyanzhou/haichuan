import { expect, test } from "@playwright/test";
import { arrangeEvenWorkFrames, evenWorkGridShape } from "../src/page-builder/template-definition/evenWorkGridLayout";

function pixelRatio(frame: { width: number; height: number }) {
  return (frame.width / frame.height) * 2;
}

test("四张作品在 2:1 画布里排成一行，六张排成上三下三", () => {
  expect(evenWorkGridShape(4)).toEqual({ columns: 4, rows: 1 });
  expect(evenWorkGridShape(6)).toEqual({ columns: 3, rows: 2 });
  expect(evenWorkGridShape(2)).toEqual({ columns: 2, rows: 1 });
  expect(evenWorkGridShape(8)).toEqual({ columns: 4, rows: 2 });

  const four = arrangeEvenWorkFrames(4);
  expect(four).toHaveLength(4);
  for (const frame of four) {
    expect(frame.image.y).toBeCloseTo(four[0].image.y, 5);
    expect(pixelRatio(frame.image)).toBeCloseTo(0.8, 5);
    expect(frame.image.x).toBeGreaterThanOrEqual(0);
    expect(frame.image.x + frame.image.width).toBeLessThanOrEqual(1);
    expect(frame.caption.y + frame.caption.height).toBeLessThanOrEqual(1);
  }
  expect(four[1].image.x).toBeGreaterThan(four[0].image.x);

  const six = arrangeEvenWorkFrames(6);
  expect(six[0].image.y).toBeCloseTo(six[1].image.y, 5);
  expect(six[3].image.y).toBeGreaterThan(six[0].image.y);
  expect(six[0].image.x).toBeCloseTo(six[3].image.x, 5);
  expect(six[2].image.x).toBeGreaterThan(six[1].image.x);
  for (const frame of six) {
    expect(pixelRatio(frame.image)).toBeCloseTo(0.8, 5);
    expect(frame.caption.y + frame.caption.height).toBeLessThanOrEqual(1);
  }
});
