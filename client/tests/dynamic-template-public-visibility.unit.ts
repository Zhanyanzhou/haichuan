import { expect, test } from "@playwright/test";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";
import { createContentSlot, createRecommendedRecipe } from "../src/page-builder/template-creation/presets";
import { resolveDynamicTemplatePublicVisibility } from "../src/page-builder/dynamic-template-instance/publicVisibility";
import { validateDynamicTemplateDefinition } from "../src/page-builder/template-definition/validateTemplateDefinition";

function noticeText(definition: ReturnType<typeof textNotice>, content: Record<string, unknown>, pageKey?: string) {
  return resolveDynamicTemplatePublicVisibility({
    definition,
    contentBySlotId: content,
    breakpoint: "desktop",
    pageKey,
  });
}

function textNotice() {
  const recipe = createRecommendedRecipe("brand");
  recipe.media = [];
  recipe.layout = "free";
  recipe.content = [createContentSlot("title"), createContentSlot("description")];
  return generateTemplateFromRecipe(recipe, {
    name: "纯文字公告",
    templateId: "tpl_notice",
  });
}

test("纯文字公告按有效文字公开，明确清空后不回填", () => {
  const definition = textNotice();
  const title = Object.values(definition.slots).find((slot) => slot.semanticRole === "title");
  expect(title).toBeTruthy();
  definition.defaultContent[title!.slotId] = "春季养护说明";

  const fromDefault = noticeText(definition, {});
  expect(fromDefault.visible).toBe(true);

  const cleared = noticeText(definition, { [title!.slotId]: "" });
  expect(cleared.visible).toBe(false);
  expect(cleared.detail).toContain("没有可公开的文字");
});

test("可选图片缺失时保留文字，必填图片缺失时隐藏整个区块", () => {
  const definition = generateTemplateFromRecipe(createRecommendedRecipe("productPromotion"), {
    name: "图文",
    templateId: "tpl_figure",
  });
  const image = Object.values(definition.slots).find((slot) => slot.type === "image");
  const title = Object.values(definition.slots).find((slot) => slot.semanticRole === "title");
  expect(image && title).toBeTruthy();
  const content = { [title!.slotId]: "新品到店" };

  const optional = resolveDynamicTemplatePublicVisibility({
    definition,
    contentBySlotId: content,
    breakpoint: "desktop",
    pageKey: "catalog",
  });
  expect(optional.visible).toBe(true);
  expect(optional.notices.some((notice) => notice.message.includes("收起图片区"))).toBe(true);

  image!.required = true;
  const required = resolveDynamicTemplatePublicVisibility({
    definition,
    contentBySlotId: content,
    breakpoint: "desktop",
    pageKey: "catalog",
  });
  expect(required.visible).toBe(false);
  expect(required.detail).toContain("成立的前提");
});

test("手机端隐藏可选图片时保留文字", () => {
  const definition = generateTemplateFromRecipe(createRecommendedRecipe("news"), {
    name: "手机文字",
    templateId: "tpl_mobile_copy",
  });
  const image = Object.values(definition.nodes).find((node) => node.slotId && definition.slots[node.slotId]?.type === "image");
  const title = Object.values(definition.slots).find((slot) => slot.semanticRole === "title");
  expect(image && title).toBeTruthy();
  image!.responsive.mobile = { ...image!.responsive.mobile, display: "none" };

  const mobile = resolveDynamicTemplatePublicVisibility({
    definition,
    contentBySlotId: { [title!.slotId]: "店内公告" },
    breakpoint: "mobile",
    pageKey: "catalog",
  });
  expect(mobile.visible).toBe(true);
  expect(mobile.detail).not.toContain("成立的前提");
});

test("固定标题可以用模板文案满足公开要求，价格在品牌页不公开", () => {
  const definition = textNotice();
  const title = Object.values(definition.slots).find((slot) => slot.semanticRole === "title")!;
  title.required = true;
  title.editable = false;
  title.hideable = false;
  definition.defaultContent[title.slotId] = "海川珠宝";
  expect(validateDynamicTemplateDefinition(definition).issues.some(
    (issue) => issue.code === "REQUIRED_SLOT_NEEDS_FIXED_SOURCE",
  )).toBe(false);
  expect(noticeText(definition, {}).visible).toBe(true);

  const priced = generateTemplateFromRecipe(createRecommendedRecipe("productPromotion"), {
    name: "促销",
    templateId: "tpl_price",
  });
  const price = Object.values(priced.slots).find((slot) => slot.semanticRole === "price")!;
  const heading = Object.values(priced.slots).find((slot) => slot.semanticRole === "title")!;
  const home = resolveDynamicTemplatePublicVisibility({
    definition: priced,
    contentBySlotId: {
      [heading.slotId]: "系列介绍",
      [price.slotId]: "12800",
    },
    breakpoint: "desktop",
    pageKey: "home",
  });
  expect(home.visible).toBe(true);
  expect(home.notices.some((notice) => notice.message.includes("品牌叙事页不会公开"))).toBe(true);
});
