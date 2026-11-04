import { expect, test } from "@playwright/test";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";
import { createRecommendedRecipe } from "../src/page-builder/template-creation/presets";
import { describeTemplateFrameProportion, displayStandardTemplateRatio, formatMeasuredTemplateRatio, formatTemplateRatio, resolveTemplateDesignFrame, setTemplateDesignHeightMode } from "../src/page-builder/template-definition/templateDimensions";
import { createDefaultDynamicTemplateResponsiveRules } from "../src/page-builder/template-definition/nodeRegistry";
import { createNewDynamicTemplateDraft } from "../src/page-builder/template-editor/dynamicTemplateDraftRepository";
import { useTemplateEditorSession } from "../src/page-builder/template-editor/templateEditorSession";
import { setTemplateLogicalDesignWidth } from "../src/page-builder/template-editor/templateDesignWidth";
import { getTemplateLayoutPresentation } from "../src/page-builder/template-editor/templateLayoutPresentation";

test("设计宽度修改保留原生节点、初始配方与设备独立设置，拒绝非法输入而不夹紧", () => {
  const recipe = createRecommendedRecipe("editorial-split");
  recipe.canvas = { width: 1200, height: 900, aspectRatio: 4 / 3 };
  const definition = generateTemplateFromRecipe(recipe);
  definition.metadata.previewTabletWidth = 820;
  definition.metadata.previewMobileWidth = 390;
  const original = structuredClone(definition);
  const changed = setTemplateLogicalDesignWidth(definition, 1600);
  expect(changed.metadata.canvasSize).toEqual({ width: 1600, height: 900, aspectRatio: 16 / 9 });
  expect(resolveTemplateDesignFrame(changed, "desktop").sourceWidth).toBe(1440);
  expect(changed.nodes).toEqual(original.nodes);
  expect(changed.slots).toEqual(original.slots);
  expect(changed.templateRecipe).toEqual(original.templateRecipe);
  expect(changed.metadata.previewTabletWidth).toBe(820);
  expect(changed.metadata.previewMobileWidth).toBe(390);
  for (const width of [0, -1, 4097, 1200.5, NaN, Infinity]) expect(() => setTemplateLogicalDesignWidth(definition, width)).toThrow("1–4096");
  for (const width of [1, 4096]) expect(setTemplateLogicalDesignWidth(definition, width).metadata.canvasSize?.width).toBe(width);
  expect(definition).toEqual(original);
});

test("设计宽度经统一事务预览不改草稿，提交只产生一次历史并可撤销重做", () => {
  const recipe = createRecommendedRecipe("editorial-split");
  recipe.canvas = { width: 1200, height: 900, aspectRatio: 4 / 3 };
  const draft = createNewDynamicTemplateDraft();
  draft.definition = generateTemplateFromRecipe(recipe);
  draft.localDraftId = draft.definition.templateId;
  const state = useTemplateEditorSession;
  state.getState().open(draft, { isNew: true });
  const before = structuredClone(state.getState().draft!.definition);
  const token = state.getState().beginInteraction("调整设计宽度", { source: "field" })!;
  expect(token).toBeTruthy();
  for (const width of [1400, 1600]) {
    expect(state.getState().previewInteraction(token, { type: "update-definition", label: "调整设计宽度", update: (next) => {
      next.metadata = setTemplateLogicalDesignWidth(next, width).metadata;
    } }).ok).toBe(true);
  }
  expect(state.getState().draft!.definition).toEqual(before);
  expect(state.getState().previewDocument!.metadata.canvasSize?.width).toBe(1600);
  expect(state.getState().historyPast).toHaveLength(0);
  expect(state.getState().commitInteraction(token).ok).toBe(true);
  expect(state.getState().historyPast).toHaveLength(1);
  const changed = structuredClone(state.getState().draft!.definition);
  state.getState().undo();
  expect(state.getState().draft!.definition).toEqual(before);
  state.getState().redo();
  expect(state.getState().draft!.definition).toEqual(changed);
  state.getState().setDevice("mobile");
  state.getState().setDevice("desktop");
  expect(state.getState().draft!.definition.metadata.canvasSize?.width).toBe(1600);
  expect(state.getState().draft!.definition.nodes).toEqual(before.nodes);
});

test("画布比例只显示常用令牌，实测像素不再约成离谱分数", () => {
  expect(formatTemplateRatio(1440, 810)).toBe("16:9");
  expect(formatTemplateRatio(1440, 720)).toBe("2:1");
  expect(formatTemplateRatio(390, 693)).toBe("9:16");
  expect(formatTemplateRatio(390, 780)).toBe("1:2");
  expect(formatTemplateRatio(390, 819)).toBe("1:2");
  expect(formatTemplateRatio(20, 419)).toBe("1:2");
  expect(formatTemplateRatio(1440, 838)).toBe("16:9");
  expect(describeTemplateFrameProportion("auto", 390, 591.2)).toBe("随内容");
  expect(describeTemplateFrameProportion("auto", 390, 819)).toBe("随内容");
  expect(describeTemplateFrameProportion("auto", 1440, 810)).toBe("随内容");
  expect(describeTemplateFrameProportion("auto", 1440, 720)).toBe("随内容");
  expect(describeTemplateFrameProportion("fixed", 390, 819)).toBe("固定高度");
  expect(describeTemplateFrameProportion("min-height", 390, 819)).toBe("最小高度");
  expect(describeTemplateFrameProportion("fit", 390, 819)).toBe("适应内容");
  expect(describeTemplateFrameProportion("aspect-ratio", 390, 819, "9:16")).toBe("9:16");

  const recipe = createRecommendedRecipe("editorial-split");
  const definition = generateTemplateFromRecipe(recipe);
  const locked = setTemplateDesignHeightMode(definition, "mobile", "aspect-ratio", { width: 390, height: 819 });
  expect(resolveTemplateDesignFrame(locked, "mobile").ratioLabel).toBe("1:2");
  const wide = setTemplateDesignHeightMode(definition, "desktop", "aspect-ratio", { width: 1440, height: 810 });
  expect(resolveTemplateDesignFrame(wide, "desktop").ratioLabel).toBe("16:9");
});

test("实测比例和画布读数都写成最近的标准令牌", () => {
  expect(formatMeasuredTemplateRatio(1440, 810)).toBe("16:9");
  expect(formatMeasuredTemplateRatio(390, 632.5)).toBe("2:3");
  expect(formatMeasuredTemplateRatio(390, 591.2)).toBe("2:3");
  expect(formatMeasuredTemplateRatio(390, 693.328125)).toBe("9:16");
  expect(formatMeasuredTemplateRatio(169, 211.25)).toBe("4:5");
  expect(formatMeasuredTemplateRatio(1440, 838)).toBe("16:9");
  expect(formatMeasuredTemplateRatio(0, 810)).toBe("未测得");
  expect(formatMeasuredTemplateRatio(NaN, 810)).toBe("未测得");
  expect(displayStandardTemplateRatio(1440, 720)).toBe("2:1");
  expect(displayStandardTemplateRatio(390, 633)).toBe("2:3");
  expect(displayStandardTemplateRatio(390, 819)).toBe("1:2");
  expect(displayStandardTemplateRatio(900, 550)).toBe("3:2");
  expect(displayStandardTemplateRatio(1440, 720, "16:9")).toBe("16:9");
  expect(displayStandardTemplateRatio(1440, 890, "55:34")).toBe("3:2");
  expect(displayStandardTemplateRatio(390, 235, "9:16")).toBe("16:9");
});

test("根 Block、默认 Flex 与自由布局的导航和属性共用实际排列语义", () => {
  const block = createDefaultDynamicTemplateResponsiveRules("Section");
  expect(getTemplateLayoutPresentation(block)).toEqual({ layout: "vertical", label: "上下排列" });
  expect(getTemplateLayoutPresentation({ ...block, display: "flex" })).toEqual({ layout: "horizontal", label: "左右排列" });
  expect(getTemplateLayoutPresentation({ ...block, display: "flex", direction: "column" }).layout).toBe("vertical");
  expect(getTemplateLayoutPresentation({ ...block, display: "flex", wrap: "wrap" }).layout).toBe("wrap");
  expect(getTemplateLayoutPresentation({ ...block, display: "grid" }).layout).toBe("grid");
  expect(getTemplateLayoutPresentation({ ...block, layoutMode: "free" }).layout).toBe("free");
  expect(getTemplateLayoutPresentation({ ...block, display: "none" }).layout).toBeNull();
});
