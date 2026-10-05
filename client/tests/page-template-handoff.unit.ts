import { expect, test } from "@playwright/test";
import { resolvePublishedTemplateInsertionIndex } from "../src/page-builder/template-editor/pageTemplateHandoff";

test("无选择时插入到页面末尾，有选择时插入到所选模块之后", () => {
  expect(resolvePublishedTemplateInsertionIndex(0, null)).toBe(0);
  expect(resolvePublishedTemplateInsertionIndex(3, null)).toBe(3);
  expect(resolvePublishedTemplateInsertionIndex(3, 0)).toBe(1);
  expect(resolvePublishedTemplateInsertionIndex(3, 2)).toBe(3);
  expect(resolvePublishedTemplateInsertionIndex(3, 9)).toBe(3);
  expect(resolvePublishedTemplateInsertionIndex(3, 1, 0)).toBe(0);
});
