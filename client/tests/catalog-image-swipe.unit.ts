import { expect, test } from "@playwright/test";

import {
  catalogImageSwipeDelta,
  nextCatalogImageIndex,
} from "../src/pages/public/Catalog/catalogImageSwipe";

test("水平滑动切换作品图，垂直滑动留给页面滚动", () => {
  expect(catalogImageSwipeDelta(-48, 6)).toBe(1);
  expect(catalogImageSwipeDelta(48, -4)).toBe(-1);
  expect(catalogImageSwipeDelta(-24, 0)).toBe(0);
  expect(catalogImageSwipeDelta(-60, 60)).toBe(0);
  expect(catalogImageSwipeDelta(20, 80)).toBe(0);
});

test("切换在多张图之间循环", () => {
  expect(nextCatalogImageIndex(0, 3, 1)).toBe(1);
  expect(nextCatalogImageIndex(2, 3, 1)).toBe(0);
  expect(nextCatalogImageIndex(0, 3, -1)).toBe(2);
  expect(nextCatalogImageIndex(1, 1, 1)).toBe(1);
});
