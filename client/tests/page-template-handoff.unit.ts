import { expect, test } from "@playwright/test";
import { resolvePublishedTemplateInsertionIndex } from "../src/page-builder/template-editor/pageTemplateHandoff";

test("点击添加始终追加到页面末尾，拖拽保留指定落点", () => {
  expect(resolvePublishedTemplateInsertionIndex(0, null)).toBe(0);
  expect(resolvePublishedTemplateInsertionIndex(3, null)).toBe(3);
  expect(resolvePublishedTemplateInsertionIndex(3, 0)).toBe(3);
  expect(resolvePublishedTemplateInsertionIndex(3, 2)).toBe(3);
  expect(resolvePublishedTemplateInsertionIndex(3, 9)).toBe(3);
  expect(resolvePublishedTemplateInsertionIndex(3, 1, 0)).toBe(0);
});
