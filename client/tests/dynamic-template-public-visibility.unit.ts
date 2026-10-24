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
  // 纯文字公告是手工配方：不选区块角色（画布随内容增长、布局自由、无图片），只给两个文字槽。
  const recipe = createRecommendedRecipe();
  recipe.content = [createContentSlot("title"), createContentSlot("description")];
  return generateTemplateFromRecipe(recipe, {
    name: "纯文字公告",
    templateId: "tpl_notice",
  });
}

test("Schema 3 纯文字公告只按页面值公开，模板默认文案不回填", () => {
  const definition = textNotice();
  const title = Object.values(definition.slots).find((slot) => slot.semanticRole === "title");
  expect(title).toBeTruthy();
  definition.defaultContent[title!.slotId] = "春季养护说明";

  const fromDefault = noticeText(definition, {});
  expect(fromDefault.visible).toBe(false);

  const fromPage = noticeText(definition, { [title!.slotId]: "春季养护说明" });
  expect(fromPage.visible).toBe(true);

  const cleared = noticeText(definition, { [title!.slotId]: "" });
  expect(cleared.visible).toBe(false);
  expect(cleared.detail).toContain("没有可公开的文字");
});

test("可选图片缺失时保留文字，必填图片缺失时隐藏整个区块", () => {
  const definition = generateTemplateFromRecipe(createRecommendedRecipe("collection-story"), {
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
  const definition = generateTemplateFromRecipe(createRecommendedRecipe("editorial-media"), {
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

test("Schema 3 锁定默认标题不能满足公开要求，价格在品牌页不公开", () => {
  const definition = textNotice();
  const title = Object.values(definition.slots).find((slot) => slot.semanticRole === "title")!;
  title.required = true;
  title.editable = false;
  title.hideable = false;
  definition.defaultContent[title.slotId] = "海川珠宝";
  expect(validateDynamicTemplateDefinition(definition).issues.some(
    (issue) => issue.code === "REQUIRED_SLOT_NEEDS_FIXED_SOURCE",
  )).toBe(true);
  expect(noticeText(definition, {}).visible).toBe(false);

  // 价格已退出九个区块角色的默认推荐，这里显式加一个价格槽来验证它在品牌页不公开。
  const priceRecipe = createRecommendedRecipe("collection-story");
  priceRecipe.content = [...priceRecipe.content, createContentSlot("price")];
  const priced = generateTemplateFromRecipe(priceRecipe, {
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
