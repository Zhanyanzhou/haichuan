import { expect, test } from "@playwright/test";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";
import { createContentSlot, createRecommendedRecipe } from "../src/page-builder/template-creation/presets";
import { planHasVisibleSlot, resolveDynamicTemplatePublicVisibility } from "../src/page-builder/dynamic-template-instance/publicVisibility";
import { validateDynamicTemplateDefinition } from "../src/page-builder/template-definition/validateTemplateDefinition";
import { compileDynamicTemplateRenderPlan } from "../src/page-builder/template-definition/renderPlan";
import type { DynamicTemplateRenderPlanNode } from "../src/page-builder/template-definition/renderPlan";
import { publicFlowNodeIsVisible } from "../src/page-builder/template-definition/publicFlow";
import { resolveTemplateImageSource } from "../src/page-builder/template-definition/imageContent";

function imageNodeInPlan(node: DynamicTemplateRenderPlanNode, slotId: string): DynamicTemplateRenderPlanNode | undefined {
  if (node.slotId === slotId) return node;
  return node.children.map((child) => imageNodeInPlan(child, slotId)).find(Boolean);
}

for (const scenario of [
  { name: "仅手机图", value: { src: "", mobileSrc: "/uploads/mobile.jpg" }, desktop: false, mobile: true },
  { name: "桌面图继承到手机", value: { src: "/uploads/desktop.jpg" }, desktop: true, mobile: true },
  { name: "桌面手机分别有图", value: { src: "/uploads/desktop.jpg", mobileSrc: "/uploads/mobile.jpg" }, desktop: true, mobile: true },
  // 当前图片字段清空手机图会移除 mobileSrc，恢复沿用桌面图；清空整个槽位才表示两端不要图片。
  { name: "手机图空串沿用桌面图", value: { src: "/uploads/desktop.jpg", mobileSrc: "" }, desktop: true, mobile: true },
  { name: "整个图片槽位显式清空", value: "", desktop: false, mobile: false },
  { name: "两端图片均为空", value: { src: "", mobileSrc: "", alt: "保留替代文字" }, desktop: false, mobile: false },
] as const) {
  test(`图片按当前设备判断页面内容：${scenario.name}`, () => {
    const definition = generateTemplateFromRecipe(createRecommendedRecipe("page-hero"), {
      name: "设备图片",
      templateId: "tpl_device_image",
    });
    const image = Object.values(definition.slots).find((slot) => slot.type === "image")!;
    definition.defaultContent[image.slotId] = { src: "/uploads/template-default.jpg" };
    const contentBySlotId = { [image.slotId]: scenario.value };

    for (const breakpoint of ["desktop", "mobile"] as const) {
      const expected = scenario[breakpoint];
      const compiled = compileDynamicTemplateRenderPlan(definition, {
        device: breakpoint,
        breakpoint,
        contentBySlotId,
        showEmptySlots: false,
        publicSurface: { omitDefaultImages: true, omitDefaultContent: true },
      });
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) throw new Error("设备图片测试定义必须有效");
      const node = imageNodeInPlan(compiled.plan.root, image.slotId)!;
      expect(node.hidden, `${breakpoint} 图片可见性`).toBe(!expected);
      if (expected) expect(node.content).toEqual(scenario.value);
      expect(planHasVisibleSlot(compiled.plan.root)).toBe(expected);
      const imageFlow = { type: "ImageSlot", slot: { type: "image" }, content: scenario.value };
      expect(publicFlowNodeIsVisible({ type: "Container", children: [imageFlow] }, breakpoint)).toBe(expected);

      for (const required of [false, true]) {
        image.required = required;
        const decision = resolveDynamicTemplatePublicVisibility({ definition, contentBySlotId, breakpoint });
        expect(decision.visible, `${breakpoint} required=${required}`).toBe(expected);
        if (expected) expect(decision.notices.some((notice) => notice.message.includes(`“${image.label}”没有页面图片`))).toBe(false);
      }
    }
  });
}

test("图片来源按设备选图，旧调用保留桌面默认且无效手机图回退桌面图", () => {
  const both = { src: "/uploads/desktop.jpg", mobileSrc: "/uploads/mobile.jpg" };
  expect(resolveTemplateImageSource(both)).toBe("/uploads/desktop.jpg");
  expect(resolveTemplateImageSource(both, "mobile")).toBe("/uploads/mobile.jpg");
  expect(resolveTemplateImageSource({ ...both, mobileSrc: "" }, "mobile")).toBe("/uploads/desktop.jpg");
  expect(resolveTemplateImageSource({ ...both, mobileSrc: "javascript:invalid" }, "mobile")).toBe("/uploads/desktop.jpg");
  expect(publicFlowNodeIsVisible({ type: "ImageSlot", slot: { type: "image" }, content: { mobileSrc: "/uploads/mobile.jpg" } })).toBe(false);
});

test("隐藏父节点下的槽位不算作画布可见内容", () => {
  const slot = { hidden: false, slotId: "heading", children: [] };
  expect(planHasVisibleSlot({ hidden: true, children: [slot] })).toBe(false);
  expect(planHasVisibleSlot({ hidden: false, children: [slot] })).toBe(true);
});

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
