import { expect, test } from "@playwright/test";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";
import { findLaunchTemplateMaster, LAUNCH_TEMPLATE_MASTERS, LAUNCH_TEMPLATE_MASTER_ENTRIES } from "../src/page-builder/template-creation/launchTemplateSet";
import { creationGridLeadSpanId, partitionMobileWorkUnits, type MobileWorkNode } from "../src/page-builder/template-definition/mobileWorkGrid";
import { CANVAS_PRESETS, CONTENTS, LAYOUTS, MEDIA_PRESETS, SECTION_ROLES, STYLES, changeRecipeSectionRole, createContentSlot, createMediaSlots, createRecommendedRecipe, styleFor } from "../src/page-builder/template-creation/presets";
import { validateDynamicTemplateDefinition, validateDynamicTemplatePublishDefinition } from "../src/page-builder/template-definition/validateTemplateDefinition";
import { collectTemplatePublishGeometryIssues } from "../src/page-builder/template-definition/publishGeometry";
import { choosePeerImageSplit, pairedCanvasContentBox } from "../src/page-builder/template-definition/pairedCanvas";
import { getEffectiveTemplateRootRules, resolvePairedMobileCanvas, resolveTemplateDesignFrame, setTemplateDesignHeightMode, splitCopyShouldStack } from "../src/page-builder/template-definition/templateDimensions";
import { arrangeMedia } from "../src/page-builder/template-creation/mediaGeometry";
import { createTemplateRecipePreviewContent } from "../src/page-builder/template-creation/previewContent";
import { compileDynamicTemplateRenderPlan, type DynamicTemplateRenderPlanNode } from "../src/page-builder/template-definition/renderPlan";
import { resolveTemplateNodeRules, resolveTemplateSlotRules } from "../src/page-builder/template-definition/responsive";
import { describeEffectiveImageFrames } from "../src/page-builder/template-definition/mobileWorkGrid";
import { createNeutralTemplateCatalogPreview, resolveTemplatePreviewViewport, withNeutralTemplateImages } from "../src/page-builder/template-editor/templatePreviewModel";
import { catalogStoredName } from "../src/page-builder/template-editor/catalogCardName";
import { editingGeometryDiverged, previewExitGeometry } from "../src/page-builder/template-editor/templateEditingGeometry";

function asLegacy<T extends { metadata: { geometryPolicy?: string } }>(definition: T): T {
  const copy = structuredClone(definition);
  delete copy.metadata.geometryPolicy;
  return copy;
}

function workNode(nodeId: string, slot?: MobileWorkNode["slot"], children: MobileWorkNode[] = []): MobileWorkNode {
  return { nodeId, type: slot ? "ImageSlot" : "Container", slot, children };
}

test("左右图文在文字列窄于 24em 时改为上下排列，自由坐标和其他角色不改", () => {
  expect(splitCopyShouldStack({
    sectionRole: "editorial-split",
    containerWidth: 768,
    fontSizePx: 16,
    columns: 2,
    gapPx: 16,
    layoutMode: "flow",
  })).toBe(true);
  expect(splitCopyShouldStack({
    sectionRole: "editorial-split",
    containerWidth: 1440,
    fontSizePx: 16,
    columns: 2,
    gapPx: 24,
    layoutMode: "flow",
  })).toBe(false);
  expect(splitCopyShouldStack({
    sectionRole: "editorial-split",
    containerWidth: 900,
    fontSizePx: 16,
    columns: 2,
    gapPx: 16,
    layoutMode: "free",
  })).toBe(false);
  expect(splitCopyShouldStack({
    sectionRole: "editorial-split",
    containerWidth: 900,
    fontSizePx: 16,
    columns: 2,
    gapPx: 16,
    layoutMode: "free",
    copyColumnWidth: 230,
  })).toBe(true);
  expect(splitCopyShouldStack({
    sectionRole: "page-hero",
    containerWidth: 768,
    fontSizePx: 16,
    columns: 2,
    gapPx: 16,
  })).toBe(false);
  expect(splitCopyShouldStack({
    sectionRole: "collection-story",
    containerWidth: 900,
    fontSizePx: 22,
    columns: 2,
    gapPx: 16,
    layoutMode: "flow",
  })).toBe(true);
});

test("连续三张作品卡在手机上收成同一组，主图和两张叙事图保持分开", () => {
  const image = (id: string, role?: string) => workNode(id, { type: "image", semanticRole: role });
  const cards = [1, 2, 3].map((index) => workNode(`card-${index}`, undefined, [image(`img-${index}`)]));
  const grouped = partitionMobileWorkUnits(cards, { device: "mobile", layoutMode: "flow" });
  expect(grouped.map((group) => group.kind)).toEqual(["works"]);
  const direct = partitionMobileWorkUnits(
    [image("a"), image("b"), image("c")],
    { device: "mobile", layoutMode: "flow", sectionRole: "creation-grid" },
  );
  expect(direct[0]?.kind).toBe("works");
  const narrative = partitionMobileWorkUnits(
    [image("hero", "heroImage"), image("one"), image("two")],
    { device: "mobile", layoutMode: "flow" },
  );
  expect(narrative.every((group) => group.kind === "node")).toBe(true);
  const desktop = partitionMobileWorkUnits(cards, { device: "desktop", layoutMode: "flow" });
  expect(desktop.every((group) => group.kind === "node")).toBe(true);
});

test("两列作品网格的奇数张只标出首张跨列，不改写成内层网格", () => {
  const image = (id: string) => workNode(id, { type: "image" });
  const images = (count: number) => Array.from({ length: count }, (_, index) => image(`work-${index + 1}`));
  const twoColumns = {
    device: "mobile" as const,
    layoutMode: "flow" as const,
    sectionRole: "creation-grid",
    display: "grid" as const,
    columnCount: 2,
  };
  const three = images(3);
  const snapshot = JSON.stringify(three);
  expect(partitionMobileWorkUnits(three, twoColumns).every((group) => group.kind === "node")).toBe(true);
  expect(creationGridLeadSpanId(three, twoColumns)).toBe("work-1");
  expect(JSON.stringify(three)).toBe(snapshot);
  expect(creationGridLeadSpanId(images(1), twoColumns)).toBe("work-1");
  expect(creationGridLeadSpanId(images(6), twoColumns)).toBeNull();
  expect(creationGridLeadSpanId(three, { ...twoColumns, device: "desktop" })).toBeNull();
  expect(creationGridLeadSpanId(three, { ...twoColumns, layoutMode: "free" })).toBeNull();
  expect(creationGridLeadSpanId(three, { ...twoColumns, columnCount: 1 })).toBeNull();
  expect(creationGridLeadSpanId(three, { ...twoColumns, columnCount: 3 })).toBeNull();
  expect(creationGridLeadSpanId(three, { ...twoColumns, sectionRole: "page-hero" })).toBeNull();
});

test("首发七块已写手机字号，固定宽度不超过手机预览", () => {
  const textTypes = new Set(["heading", "text", "richText", "button", "link"]);
  const problems: string[] = [];
  for (const definition of LAUNCH_TEMPLATE_MASTERS) {
    for (const slot of Object.values(definition.slots)) {
      if (!textTypes.has(slot.type)) continue;
      const mobileSize = resolveTemplateSlotRules(definition, slot.slotId, "mobile").fontSize;
      const written = slot.mobileRules?.fontSize;
      if (!written || !mobileSize) problems.push(`${definition.name} / ${slot.label} 没有手机字号`);
    }
    const mobileWidth = definition.metadata.previewMobileWidth ?? 390;
    for (const node of Object.values(definition.nodes)) {
      const rules = resolveTemplateNodeRules(definition, node.nodeId, "mobile");
      const width = typeof rules.width === "object" && rules.width.unit === "px" ? rules.width.value : 0;
      const minHeight = rules.minHeight?.unit === "px" ? rules.minHeight.value : 0;
      if (width > mobileWidth) problems.push(`${definition.name} / ${node.name} 手机宽 ${width}px`);
      if (minHeight > 0) problems.push(`${definition.name} / ${node.name} 手机最小高 ${minHeight}px`);
    }
  }
  expect(problems).toEqual([]);
});

test("发布几何检查只提醒，不改定义，也不阻断已排好的作品网格", () => {
  const works = findLaunchTemplateMaster("creation-grid");
  expect(works).toBeTruthy();
  const before = JSON.stringify(works);
  const worksIssues = collectTemplatePublishGeometryIssues(works!);
  expect(JSON.stringify(works)).toBe(before);
  expect(worksIssues.some((issue) => issue.code === "PUBLISH_GEOMETRY_ODD_WORK_ORPHAN")).toBe(false);
  expect(validateDynamicTemplatePublishDefinition(works!).issues.filter((issue) => issue.level === "error")).toEqual([]);

  const orphan = structuredClone(works!);
  orphan.metadata.sectionRole = "page-hero";
  const orphanGrid = Object.values(orphan.nodes).find((node) => node.type === "Grid" && node.name === "作品卡组");
  orphanGrid!.childIds = orphanGrid!.childIds.slice(0, 3);
  expect(collectTemplatePublishGeometryIssues(orphan).some((issue) => issue.code === "PUBLISH_GEOMETRY_ODD_WORK_ORPHAN")).toBe(true);

  const clipped = structuredClone(works!);
  const title = Object.values(clipped.nodes).find((node) => node.name === "主标题");
  expect(title).toBeTruthy();
  title!.responsive.mobile = {
    ...title!.responsive.mobile,
    height: { mode: "fixed", value: { value: 4, unit: "px" } },
    overflow: "hidden",
  };
  expect(collectTemplatePublishGeometryIssues(clipped).some((issue) => issue.code === "PUBLISH_GEOMETRY_TEXT_CLIPPED")).toBe(true);

  const wide = structuredClone(works!);
  const description = Object.values(wide.nodes).find((node) => node.name === "描述");
  description!.responsive.mobile = {
    ...description!.responsive.mobile,
    width: { value: 800, unit: "px" },
  };
  expect(collectTemplatePublishGeometryIssues(wide).some((issue) => issue.code === "PUBLISH_GEOMETRY_HORIZONTAL_OVERFLOW")).toBe(true);

  const unlinked = structuredClone(works!);
  const heading = Object.values(unlinked.slots).find((slot) => slot.type === "heading");
  const buttonId = `${unlinked.templateId}_slot_orphan_action`;
  unlinked.slots[buttonId] = { ...structuredClone(heading!), slotId: buttonId, type: "button", key: "orphanAction", label: "无链接按钮" };
  unlinked.defaultContent[buttonId] = { label: "了解", targetType: "none" };
  expect(collectTemplatePublishGeometryIssues(unlinked).some((issue) => issue.code === "PUBLISH_GEOMETRY_UNLINKED_ACTION")).toBe(true);

  const frameless = structuredClone(works!);
  const image = Object.values(frameless.slots).find((slot) => slot.type === "image");
  image!.desktopRules = { ...image!.desktopRules, aspectRatio: undefined };
  image!.mobileRules = { ...image!.mobileRules, aspectRatio: undefined };
  expect(collectTemplatePublishGeometryIssues(frameless).some((issue) => issue.code === "PUBLISH_GEOMETRY_MISSING_IMAGE")).toBe(true);

  const hero = findLaunchTemplateMaster("page-hero");
  const heroIssues = collectTemplatePublishGeometryIssues(hero!);
  expect(heroIssues.some((issue) => issue.code === "PUBLISH_GEOMETRY_FREE_LAYOUT")).toBe(true);
  expect(heroIssues.some((issue) => issue.code === "PUBLISH_GEOMETRY_DECORATIVE_OVERLAY")).toBe(true);
  expect(heroIssues.every((issue) => issue.level === "warning")).toBe(true);
  expect(validateDynamicTemplatePublishDefinition(hero!).valid).toBe(true);
});

test("首发作品网格仍只保存手机两列，跨列不写进定义", () => {
  const definition = findLaunchTemplateMaster("creation-grid");
  expect(definition).toBeTruthy();
  const grid = Object.values(definition!.nodes).find((node) => node.type === "Grid" && node.name === "作品卡组");
  expect(grid?.responsive.mobile).toMatchObject({ columns: [1, 1] });
  expect(grid && resolveTemplateNodeRules(definition!, grid.nodeId, "mobile").columns).toEqual([1, 1]);
  expect(grid && resolveTemplateNodeRules(definition!, grid.nodeId, "desktop").columns).toEqual([1, 1, 1, 1]);
  expect(LAUNCH_TEMPLATE_MASTER_ENTRIES.find((entry) => entry.role === "creation-grid")?.description).toContain("两列两行");
});

function planNodes(root: DynamicTemplateRenderPlanNode): DynamicTemplateRenderPlanNode[] {
  return [root, ...root.children.flatMap(planNodes)];
}

test("作品网格的标题与说明默认不显示，显式打开后才出现", () => {
  const definition = findLaunchTemplateMaster("creation-grid");
  expect(definition).toBeTruthy();
  const hiddenPlan = compileDynamicTemplateRenderPlan(definition, { device: "mobile", showEmptySlots: true });
  expect(hiddenPlan.ok).toBe(true);
  if (!hiddenPlan.ok) return;
  const hiddenNodes = planNodes(hiddenPlan.plan.root);
  expect(hiddenNodes.find((node) => node.slot?.key === "title")?.hidden).toBe(true);
  expect(hiddenNodes.find((node) => node.slot?.key === "description")?.hidden).toBe(true);
  expect(hiddenNodes.find((node) => node.slot?.key === "workA")?.hidden).toBe(false);

  const shown = structuredClone(definition!);
  for (const node of Object.values(shown.nodes)) {
    const slot = node.slotId ? shown.slots[node.slotId] : undefined;
    if (slot?.key === "title" || slot?.key === "description") node.responsive.desktop.hidden = false;
  }
  const shownPlan = compileDynamicTemplateRenderPlan(shown, { device: "desktop", showEmptySlots: true });
  expect(shownPlan.ok).toBe(true);
  if (!shownPlan.ok) return;
  const shownNodes = planNodes(shownPlan.plan.root);
  expect(shownNodes.find((node) => node.slot?.key === "title")?.hidden).toBe(false);
  expect(shownNodes.find((node) => node.slot?.key === "description")?.hidden).toBe(false);

  const hero = findLaunchTemplateMaster("page-hero");
  const heroPlan = compileDynamicTemplateRenderPlan(hero, { device: "desktop", showEmptySlots: true });
  expect(heroPlan.ok).toBe(true);
  if (!heroPlan.ok) return;
  expect(planNodes(heroPlan.plan.root).find((node) => node.slot?.key === "title")?.hidden).toBe(false);
});

test("作品网格的作品卡在手机上保持 4:5，并带上区块角色", () => {
  const recipe = createRecommendedRecipe("creation-grid");
  const definition = generateTemplateFromRecipe(recipe, { name: "作品网格验收" });
  expect(definition.metadata.sectionRole).toBe("creation-grid");
  const images = Object.values(definition.nodes)
    .map((node) => definition.slots[node.slotId ?? ""])
    .filter((slot) => slot?.type === "image" && slot.semanticRole !== "backgroundImage" && slot.semanticRole !== "logo");
  expect(images.length).toBeGreaterThanOrEqual(2);
  for (const slot of images) expect(slot.mobileRules?.aspectRatio).toBe("4:5");
  expect(validateDynamicTemplatePublishDefinition(definition).issues.filter((issue) => issue.level === "error")).toEqual([]);
});

test("三图自由布局的已有外框通过客户端发布校验，未命名仍须补填", () => {
  const recipe = createRecommendedRecipe("editorial-media");
  recipe.canvas = { width: 1920, height: 1080, aspectRatio: 16 / 9 };
  recipe.layout = "leftImageRightContent";
  recipe.media = createMediaSlots(["custom", "custom", "custom"]);
  const definition = generateTemplateFromRecipe(recipe);
  expect(validateDynamicTemplatePublishDefinition(definition).issues.some((issue) => issue.code === "PUBLISH_REQUIRES_TEMPLATE_NAME")).toBe(true);
  definition.name = "三图资讯模板";
  const original = structuredClone(definition);
  const result = validateDynamicTemplatePublishDefinition(definition);
  expect(result.issues.filter((issue) => issue.level === "error")).toEqual([]);
  expect(result.issues.some((issue) => issue.code === "IMAGE_SLOT_AUTO_HEIGHT_OVERFLOWS_BOUNDED_PARENT")).toBe(false);
  expect(result.valid).toBe(true);
  expect(definition).toEqual(original);
});

test("1200×900 左文右图的双图充分展开，保留方形和同级关系", () => {
  const recipe = createRecommendedRecipe("maison-fact");
  recipe.canvas = { width: 1200, height: 900, aspectRatio: 4 / 3 };
  recipe.layout = "leftContentRightImage";
  recipe.media = createMediaSlots(["custom", "custom"]);
  const original = structuredClone(recipe);
  const definition = generateTemplateFromRecipe(recipe);
  const images = Object.values(definition.nodes).filter((node) => definition.slots[node.slotId!]?.type === "image").map((node) => node.responsive.desktop.placement!);
  const content = definition.nodes[`${definition.templateId}_content`].responsive.desktop.placement!;
  expect(images).toHaveLength(2);
  expect(images[0].width * 1200).toBeGreaterThan(350);
  expect(images[0].width * 1200).toBeCloseTo(images[0].height * 900, 5);
  expect(images[1].width).toBeCloseTo(images[0].width, 5);
  expect(images[1].y).toBeGreaterThan(images[0].y + images[0].height);
  expect(images[0].x).toBeGreaterThan(content.x + content.width);
  expect(recipe).toEqual(original);
});

test("多图随区域横竖排列，混合比例和一至六图保持间距、身份与边界", () => {
  for (const area of [{ x: 35, y: 42, width: 600, height: 900 }, { x: 35, y: 42, width: 1200, height: 350 }]) {
    for (let count = 1; count <= 6; count += 1) for (const mixed of [false, true, "free"] as const) {
      const media = createMediaSlots(Array.from({ length: count }, () => "custom"));
      if (mixed) media.forEach((item, index) => { item.aspectRatio = [1, .75, 16 / 9][index % 3]; });
      if (mixed === "free") media[0].freeRatio = true;
      const frames = arrangeMedia(area, media, 24);
      expect(frames).toHaveLength(count);
      frames.forEach((frame, index) => {
        if (!media[index].freeRatio) expect(frame.width / frame.height).toBeCloseTo(media[index].aspectRatio, 5);
        expect(frame.x).toBeGreaterThanOrEqual(area.x - .00001);
        expect(frame.y).toBeGreaterThanOrEqual(area.y - .00001);
        expect(frame.x + frame.width).toBeLessThanOrEqual(area.x + area.width + .00001);
        expect(frame.y + frame.height).toBeLessThanOrEqual(area.y + area.height + .00001);
        frames.slice(index + 1).forEach((other) => expect(
          frame.x + frame.width + 23.999 <= other.x || other.x + other.width + 23.999 <= frame.x
          || frame.y + frame.height + 23.999 <= other.y || other.y + other.height + 23.999 <= frame.y,
        ).toBe(true));
      });
      if (count === 2 && !mixed) {
        const portrait = area.height > area.width;
        expect(portrait ? frames[1].y : frames[1].x).toBeGreaterThan(portrait ? frames[0].y : frames[0].x);
        expect(portrait ? frames[1].x : frames[1].y).toBeCloseTo(portrait ? frames[0].x : frames[0].y, 5);
      }
    }
  }
});

test("主副图按最终面积保持层级，支持混合比例与横竖区域", () => {
  for (const [width, height] of [[600, 900], [1200, 350]]) for (const count of [1, 2]) {
    const media = createMediaSlots(["heroImage", ...Array.from({ length: count }, () => "secondaryImage" as const)]);
    media[0].aspectRatio = .75;
    media[1].aspectRatio = 16 / 9;
    const frames = arrangeMedia({ x: 0, y: 0, width, height }, media, 24);
    expect(frames).toHaveLength(media.length);
    for (const frame of frames.slice(1)) expect(frames[0].width * frames[0].height).toBeGreaterThan(frame.width * frame.height * 2);
  }
});

test("长文扩大文字区而不缩字号，同级分栏仍保持等宽", () => {
  const recipe = createRecommendedRecipe();
  recipe.canvas = { width: 1200, height: 900, aspectRatio: 4 / 3 };
  recipe.layout = "leftContentRightImage";
  recipe.media = createMediaSlots(["custom", "custom"]);
  // 字号改从 UI_GUIDE 第 2.3 节取固定层级后，300 字的两段描述在 40% 分栏里仍放得下；
  // 这里把描述写到 360 字：正文行高 1.75 时 40%、45% 分栏放不下，50% 放得下——验证的是分栏机制，不是某个字号。
  recipe.content = [createContentSlot("title"), ...["description-one", "description-two"].map((id) => ({
    ...createContentSlot("description", id), defaultContent: "图".repeat(360), maxLength: 2000,
  }))];
  const definition = generateTemplateFromRecipe(recipe);
  const contentWidth = definition.nodes[`${definition.templateId}_content`].responsive.desktop.placement!.width * 1200;
  expect(contentWidth).toBeGreaterThan((1200 - 108 - 32) * .4);
  const title = Object.values(definition.slots).find((slot) => slot.semanticRole === "title")!;
  expect(title.desktopRules.fontSize).toEqual({ value: 40, unit: "px" });
  recipe.layout = "splitColumns";
  const columns = generateTemplateFromRecipe(recipe);
  expect(columns.nodes[`${columns.templateId}_content`].responsive.desktop.placement!.width * 1200).toBeCloseTo((1200 - 108 - 32) / 2, 5);
});

test("Recipe 独立生成稳定身份，预览和创建可复用同一定义", () => {
  // 价格已退出九个区块角色的默认推荐，这里显式加一个价格槽，验证的是身份稳定而不是推荐内容。
  const recipe = createRecommendedRecipe("collection-story");
  recipe.content = [...recipe.content, createContentSlot("price")];
  const original = structuredClone(recipe);
  const definition = generateTemplateFromRecipe(recipe, { templateId: "tpl_recipe_stable" });
  expect(generateTemplateFromRecipe(recipe, { templateId: "tpl_recipe_stable" })).toEqual(definition);
  expect(recipe).toEqual(original);
  expect(definition.schemaVersion).toBe(3);
  expect(definition.templateRecipe).toEqual(recipe);
  expect(Object.values(definition.slots).map((slot) => slot.semanticRole)).toContain("price");
  expect(definition.defaultContent).toEqual({});
  expect(definition.previewContent).toEqual({});
  expect(recipe.content.every((item) => item.defaultContent === "")).toBe(true);
});

test("所有新预设及重复自定义文字的系统样例不进入正式内容", () => {
  for (const [sectionRole] of SECTION_ROLES) {
    const recipe = createRecommendedRecipe(sectionRole);
    expect(recipe.content.every((item) => item.defaultContent === "")).toBe(true);
    const definition = generateTemplateFromRecipe(recipe);
    const beforePreview = structuredClone(definition);
    createTemplateRecipePreviewContent(definition);
    expect(definition).toEqual(beforePreview);
    expect(definition.defaultContent).toEqual({});
    expect(definition.previewContent).toEqual({});
    expect(definition.templateRecipe?.content.every((item) => item.defaultContent === "")).toBe(true);
  }
  const recipe = createRecommendedRecipe();
  recipe.canvas = { width: 1080, height: 4096, aspectRatio: 1080 / 4096 };
  recipe.content = [...CONTENTS.map(([role]) => createContentSlot(role)),
    { ...createContentSlot("customText", "second-custom"), name: "另一个自定义字段" }];
  const definition = generateTemplateFromRecipe(recipe);
  const preview = createTemplateRecipePreviewContent(definition);
  expect(Object.keys(preview)).toHaveLength(recipe.content.length);
  expect(Object.values(preview)).toContain("另一个自定义字段待填写");
  expect(definition.defaultContent).toEqual({});
  expect(definition.previewContent).toEqual({});
});

test("向导样例保持桌面与手机文字层级和几何，序列化重开后的公开内容仍为空", () => {
  const recipe = createRecommendedRecipe();
  recipe.canvas = { width: 1920, height: 1080, aspectRatio: 16 / 9 };
  recipe.layout = "leftImageRightContent";
  recipe.media = createMediaSlots(["heroImage"]);
  recipe.content = [createContentSlot("title"), createContentSlot("description"), createContentSlot("cta")];
  const definition = generateTemplateFromRecipe(recipe);
  const beforePreview = JSON.stringify(definition);
  const flatten = (node: DynamicTemplateRenderPlanNode): DynamicTemplateRenderPlanNode[] => [node, ...node.children.flatMap(flatten)];
  for (const breakpoint of ["desktop", "mobile"] as const) {
    const device = breakpoint === "mobile" ? "mobile" : "desktop";
    const preview = compileDynamicTemplateRenderPlan(definition, {
      device, breakpoint, contentBySlotId: createTemplateRecipePreviewContent(definition), showEmptySlots: true,
    });
    const published = compileDynamicTemplateRenderPlan(JSON.parse(beforePreview), { device, breakpoint });
    expect(preview.ok).toBe(true);
    expect(published.ok).toBe(true);
    if (!preview.ok || !published.ok) throw new Error("渲染计划无效");
    const previewText = flatten(preview.plan.root).filter((node) => node.slot && node.slot.type !== "image");
    expect(previewText).toHaveLength(3);
    expect(previewText.every((node) => !node.hidden && node.content)).toBe(true);
    expect(previewText.find((node) => node.slot?.semanticRole === "description")?.content).toBe("描述待填写");
    expect(flatten(published.plan.root).filter((node) => node.slot).every((node) => node.hidden && node.content === undefined)).toBe(true);
    expect(flatten(preview.plan.root).map((node) => node.rules)).toEqual(flatten(published.plan.root).map((node) => node.rules));
  }
  expect(JSON.stringify(definition)).toBe(beforePreview);
});

test("旧显式配方与编辑后的正式默认内容保持原样，包括与系统样例相同的文字", () => {
  for (const presetVersion of [1, 2]) {
    const recipe = createRecommendedRecipe();
    recipe.presetVersion = presetVersion;
    recipe.content = [
      { ...createContentSlot("title"), defaultContent: "主标题待填写" },
      { ...createContentSlot("description"), defaultContent: "经确认的作品说明" },
      { ...createContentSlot("cta"), defaultContent: "了解详情" },
    ];
    recipe.media = [{ ...createMediaSlots(["heroImage"])[0], defaultImage: "/images/approved.jpg" }];
    const source = structuredClone(recipe);
    const definition = generateTemplateFromRecipe(recipe);
    expect(recipe).toEqual(source);
    expect(definition.templateRecipe).toEqual(source);
    const slotFor = (role: string) => Object.values(definition.slots).find((slot) => slot.semanticRole === role)!;
    expect(definition.defaultContent[slotFor("title").slotId]).toBe("主标题待填写");
    expect(definition.defaultContent[slotFor("description").slotId]).toBe("经确认的作品说明");
    expect(definition.defaultContent[slotFor("cta").slotId]).toEqual({ label: "了解详情", targetType: "none" });
    expect(definition.defaultContent[slotFor("heroImage").slotId]).toEqual({ src: "/images/approved.jpg", alt: "主图" });
    expect(createTemplateRecipePreviewContent(definition)).toEqual({});
    definition.defaultContent[slotFor("description").slotId] = "编辑后保存的真实说明";
    const reopened = JSON.parse(JSON.stringify(definition));
    const result = compileDynamicTemplateRenderPlan(reopened, { device: "desktop" });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).toContain("编辑后保存的真实说明");
    expect(reopened.defaultContent).toEqual(definition.defaultContent);
  }
});

for (const [layout, label] of LAYOUTS) {
  test(`${label} × 六种网页画幅 × 媒体数量均合法且保持手机阅读顺序`, () => {
    for (const canvas of CANVAS_PRESETS) for (const media of MEDIA_PRESETS) {
      const recipe = createRecommendedRecipe();
      recipe.layout = layout;
      recipe.canvas = { width: canvas.width, height: canvas.height, aspectRatio: canvas.width / canvas.height };
      recipe.media = createMediaSlots(media.roles);
      // 媒体组合里有「不要图片」一项，配方必须另有内容槽位才成立。
      recipe.content = [createContentSlot("title")];
      const definition = generateTemplateFromRecipe(recipe);
      expect(validateDynamicTemplateDefinition(definition).issues.filter((issue) => issue.level === "error")).toEqual([]);
      expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);
      const stage = Object.values(definition.nodes).find((node) => node.type === "Stack")!;
      expect(resolveTemplateNodeRules(definition, stage.nodeId, "mobile").layoutMode).toBe("flow");
      // 随内容增长的画布在桌面端也必须是流式：自由坐标没有高度分母，会把根容器压成 0。
      expect(resolveTemplateNodeRules(definition, stage.nodeId, "desktop").layoutMode).toBe(canvas.ratio === "auto" ? "flow" : "free");
      if (canvas.ratio === "auto") expect(resolveTemplateNodeRules(definition, definition.rootNodeId, "desktop").height.mode).toBe("auto");
      for (const node of Object.values(definition.nodes).filter((item) => item.slotId)) {
        expect(resolveTemplateNodeRules(definition, node.nodeId, "mobile").placement).toBeUndefined();
        const placement = node.responsive.desktop.placement;
        if (!placement) {
          // 没有自由坐标的槽位必须落在流式父级里：内容区容器，或 auto 画布下已转为 flow 的 Stack。
          const parent = Object.values(definition.nodes).find((item) => item.childIds.includes(node.nodeId)
            && (item.type === "Container" || resolveTemplateNodeRules(definition, item.nodeId, "desktop").layoutMode === "flow"));
          expect(Boolean(parent), `${label} / ${canvas.name} / ${media.name}：无坐标槽位缺少流式父级`).toBe(true);
          continue;
        }
        expect(placement.width).toBeGreaterThan(0);
        expect(placement.height).toBeGreaterThan(0);
        expect(placement.x + placement.width).toBeLessThanOrEqual(1.00001);
        expect(placement.y + placement.height).toBeLessThanOrEqual(1.00001);
      }
    }
  });
}

test("不同区块角色与风格可生成纯图片、纯文字，充足空间容纳全部内容", () => {
  for (const [sectionRole] of SECTION_ROLES) for (const [variant] of STYLES) {
    const recipe = createRecommendedRecipe(sectionRole);
    recipe.style = styleFor(variant);
    recipe.content = [];
    recipe.media = createMediaSlots(["heroImage"]);
    expect(validateDynamicTemplateDefinition(generateTemplateFromRecipe(recipe)).valid).toBe(true);
    recipe.media = [];
    recipe.content = [createContentSlot("title")];
    expect(validateDynamicTemplateDefinition(generateTemplateFromRecipe(recipe)).valid).toBe(true);
    recipe.canvas = { width: 1080, height: 4096, aspectRatio: 1080 / 4096 };
    recipe.content = CONTENTS.map(([role]) => createContentSlot(role));
    expect(validateDynamicTemplateDefinition(generateTemplateFromRecipe(recipe)).valid).toBe(true);
  }
});

test("空方案与放不下的内容明确拒绝，保留完整配置", () => {
  const empty = createRecommendedRecipe();
  expect(() => generateTemplateFromRecipe(empty)).toThrow("至少选择一个");
  const crowded = createRecommendedRecipe();
  crowded.canvas = { width: 200, height: 200, aspectRatio: 1 };
  crowded.content = CONTENTS.map(([role]) => createContentSlot(role));
  const before = structuredClone(crowded);
  expect(() => generateTemplateFromRecipe(crowded)).toThrow("无法容纳");
  expect(crowded).toEqual(before);
});

test("新推荐准确，字号按 UI_GUIDE 排印层级，主副图有层级且卡片只有一组", () => {
  expect(createRecommendedRecipe("page-hero").media.map((item) => item.role)).toEqual(["backgroundImage", "logo"]);
  expect(createRecommendedRecipe("service-invitation").content.map((item) => item.role)).toEqual(["title", "time", "location", "cta"]);
  expect(createRecommendedRecipe("creation-grid").canvas).toEqual({ width: 1440, height: 1800, aspectRatio: .8 });
  expect(createRecommendedRecipe("editorial-media").layout).toBe("fullImageOverlay");
  expect(createRecommendedRecipe("editorial-split").presetVersion).toBe(3);
  const recipe = createRecommendedRecipe();
  recipe.canvas = { width: 1920, height: 1080, aspectRatio: 16 / 9 };
  recipe.layout = "cards";
  recipe.media = createMediaSlots(["heroImage", "secondaryImage", "secondaryImage"]);
  recipe.media[0].borderRadius = 0;
  recipe.content = [createContentSlot("title"), createContentSlot("subtitle"), createContentSlot("originalPrice"), createContentSlot("price")];
  const definition = generateTemplateFromRecipe(recipe);
  const role = (name: string) => Object.values(definition.slots).find((item) => item.semanticRole === name)!;
  expect(role("title").desktopRules.fontSize).toEqual({ value: 40, unit: "px" });
  expect(role("title").desktopRules.lineHeight).toBe(1.35);
  expect(role("subtitle").desktopRules.fontSize).toEqual({ value: 20, unit: "px" });
  expect(role("subtitle").mobileRules.fontSize).toEqual({ value: 18, unit: "px" });
  // 价格属于决策信息，划线原价也不降到辅助级（D.44）。
  expect(role("originalPrice").desktopRules.fontSize).toEqual({ value: 16, unit: "px" });
  expect(role("originalPrice").mobileRules.fontSize).toEqual({ value: 15, unit: "px" });
  expect(role("originalPrice").desktopRules.lineHeight).toBe(1.75);
  expect(role("price").desktopRules.fontSize).toEqual({ value: 40, unit: "px" });
  expect(Object.values(definition.nodes).filter((node) => node.name === "主内容卡片")).toHaveLength(1);
  const imageNode = (name: string) => Object.values(definition.nodes).find((node) => node.slotId === role(name).slotId)!;
  expect(imageNode("heroImage").responsive.desktop.radius).toEqual({ value: 0, unit: "px" });
  const hero = imageNode("heroImage").responsive.desktop.placement!;
  const secondary = imageNode("secondaryImage").responsive.desktop.placement!;
  expect(hero.width * hero.height).toBeGreaterThan(secondary.width * secondary.height * 2);
  expect(definition.templateRecipe?.presetVersion).toBe(3);
});

test("图片圆形、完整显示和自由比例使用最终生成参数，旧配方仍可读取", () => {
  const recipe = createRecommendedRecipe();
  recipe.media = createMediaSlots(["heroImage", "logo"]);
  Object.assign(recipe.media[0], { shape: "circle", fitMode: "contain" });
  const circle = generateTemplateFromRecipe(recipe);
  const image = Object.values(circle.nodes).find((node) => circle.slots[node.slotId!]?.semanticRole === "heroImage")!;
  expect(image.responsive.desktop.radius).toEqual({ value: 50, unit: "%" });
  expect(circle.slots[image.slotId!].desktopRules.objectFit).toBe("contain");
  recipe.presetVersion = 1;
  Object.assign(recipe.media[0], { shape: "rectangle", freeRatio: true });
  expect(validateDynamicTemplateDefinition(generateTemplateFromRecipe(recipe)).valid).toBe(true);
  recipe.media.push({ ...recipe.media[1], id: "duplicate-logo" });
  expect(() => generateTemplateFromRecipe(recipe)).toThrow("Logo 只需一个");
});

test("改区块角色只更新未手改段，返回上一步不重置内容", () => {
  const recipe = createRecommendedRecipe("editorial-split");
  recipe.content.find((item) => item.role === "title")!.defaultContent = "保留我的标题";
  recipe.layout = "free";
  const updated = changeRecipeSectionRole(recipe, "editorial-media", { content: true, layout: true });
  expect(updated.content).toEqual(recipe.content);
  expect(updated.layout).toBe("free");
  expect(updated.canvas).toEqual(createRecommendedRecipe("editorial-media").canvas);
  expect(updated.sectionRole).toBe("editorial-media");
});

test("拒绝无效尺寸、重复身份和默认文字超限", () => {
  const recipe = createRecommendedRecipe();
  recipe.canvas.width = 0;
  expect(() => generateTemplateFromRecipe(recipe)).toThrow();
  const duplicate = createRecommendedRecipe("editorial-media");
  duplicate.media = createMediaSlots(["backgroundImage", "backgroundImage"]);
  expect(() => generateTemplateFromRecipe(duplicate)).toThrow();
  const long = createRecommendedRecipe("collection-story");
  long.content.find((item) => item.role === "title")!.defaultContent = "长".repeat(1000);
  expect(() => generateTemplateFromRecipe(long)).toThrow();
});

test("新配方的结构名称与首发母版同一套词", () => {
  const namesOf = (sectionRole: Parameters<typeof createRecommendedRecipe>[0]) =>
    Object.values(generateTemplateFromRecipe(createRecommendedRecipe(sectionRole)).nodes).map((node) => node.name);
  const hero = namesOf("page-hero");
  expect(hero).toEqual(expect.arrayContaining(["背景图", "Logo", "文字列", "主标题", "副标题", "主行动"]));
  expect(hero).not.toContain("按钮 / CTA");
  const split = namesOf("editorial-split");
  expect(split).toEqual(expect.arrayContaining(["主图", "副图 1", "副图 2", "文字列"]));
  const story = namesOf("collection-story");
  expect(story).toContain("次级链接");
  expect(story).not.toContain("主行动");
});

test("同类内容多次添加仍是独立槽位，中央标题只提取第一个", () => {
  // 中央标题只在中部/底部布局里被抽成页眉；角色的首推布局不含它，这里显式指定。
  const recipe = createRecommendedRecipe("collection-story");
  recipe.layout = "centerSubject";
  recipe.content = [createContentSlot("title", "first"), createContentSlot("title", "second"), createContentSlot("customText", "custom-one"), createContentSlot("customText", "custom-two")];
  const definition = generateTemplateFromRecipe(recipe);
  const titles = Object.values(definition.nodes).filter((node) => definition.slots[node.slotId!]?.semanticRole === "title");
  expect(titles).toHaveLength(2);
  expect(titles.filter((node) => node.responsive.desktop.placement)).toHaveLength(1);
  const group = Object.values(definition.nodes).find((node) => node.name === "文字列")!;
  expect(group.childIds).toHaveLength(3);
  expect(new Set(Object.keys(definition.slots)).size).toBe(6);
});

test("全幅布局主图铺满画布并承载前景内容，显式背景优先", () => {
  const recipe = createRecommendedRecipe("video-story");
  recipe.layout = "fullImageOverlay";
  const definition = generateTemplateFromRecipe(recipe);
  const image = Object.values(definition.nodes).find((node) => node.type === "ImageSlot")!;
  expect(image.responsive.desktop.placement).toEqual({ x: 0, y: 0, width: 1, height: 1, zIndex: 0 });
  expect(definition.slots[image.slotId!].desktopRules.aspectRatio).toBe("16:9");
  const group = Object.values(definition.nodes).find((node) => node.name === "文字列")!;
  expect(group.responsive.desktop.backgroundColor).toBe(recipe.style.backgroundColor);
  expect(group.responsive.desktop.placement?.zIndex).toBeGreaterThan(0);
  recipe.media = createMediaSlots(["backgroundImage", "heroImage"]);
  const explicit = generateTemplateFromRecipe(recipe);
  const images = Object.values(explicit.nodes).filter((node) => node.type === "ImageSlot");
  expect(images.filter((node) => node.responsive.desktop.placement?.width === 1)).toHaveLength(1);
  expect(explicit.slots[images[0].slotId!].semanticRole).toBe("backgroundImage");
});

test("图片组合切换按角色保留身份和独立设置，新增图片不重用已有身份", async () => {
  const { selectRecipeMediaPreset } = await import("../src/page-builder/template-creation/mediaSelection");
  const media = createMediaSlots(["heroImage", "secondaryImage", "secondaryImage", "custom"]);
  Object.assign(media[0], { name: "保留主图", shape: "circle", fitMode: "contain", borderRadius: 8 });
  Object.assign(media[1], { name: "副图甲", aspectRatio: .75, borderRadius: 24 });
  Object.assign(media[2], { name: "副图乙", aspectRatio: 16 / 9, freeRatio: true });
  const original = structuredClone(media);
  const selected = selectRecipeMediaPreset(media, ["secondaryImage", "heroImage", "secondaryImage", "logo", "backgroundImage", "secondaryImage"], 32);
  expect(selected.slice(0, 3)).toEqual([media[1], media[0], media[2]]);
  expect(selected[3]).toMatchObject({ role: "logo", borderRadius: 0, fitMode: "contain" });
  expect(selected[4]).toMatchObject({ role: "backgroundImage", borderRadius: 0 });
  expect(selected[5]).toMatchObject({ role: "secondaryImage", borderRadius: 32 });
  expect(selected.slice(3).every((slot) => !media.some((existing) => existing.id === slot.id))).toBe(true);
  expect(new Set(selected.map((slot) => slot.id)).size).toBe(selected.length);
  expect(selectRecipeMediaPreset(media, [], 32)).toEqual([]);
  expect(selectRecipeMediaPreset(media, media.map((slot) => slot.role), 32)).toEqual(media);
  selected[0].name = "修改返回副本";
  expect(media).toEqual(original);
});

test("自定义图片删除后再添加不产生重名，圆角恢复与圆形约束保留独立设置", async () => {
  const { nextCustomMediaName, resolveMediaShapeChange } = await import("../src/page-builder/template-creation/mediaSelection");
  const media = createMediaSlots(["custom", "custom"]);
  media[0].name = "图片 1";
  media[1].name = " 图片 3 ";
  expect(nextCustomMediaName(media)).toBe("图片 2");
  expect(nextCustomMediaName([])).toBe("图片 1");
  Object.assign(media[0], { aspectRatio: .75, freeRatio: true, fitMode: "contain", borderRadius: 16 });
  const original = structuredClone(media[0]);
  const circle = { ...media[0], ...resolveMediaShapeChange(media[0], "circle") };
  expect(circle).toMatchObject({ shape: "circle", aspectRatio: 1, freeRatio: false, fitMode: "contain", borderRadius: 16 });
  const restored = { ...circle, ...resolveMediaShapeChange(circle, "inherited") };
  expect(restored).toMatchObject({ shape: "rectangle", borderRadius: 16, aspectRatio: 1, fitMode: "contain" });
  expect(resolveMediaShapeChange(media[0], "rounded")).toEqual({ shape: "rectangle", borderRadius: 24 });
  expect(resolveMediaShapeChange(media[0], "square")).toEqual({ shape: "rectangle", borderRadius: 0 });
  expect(media[0]).toEqual(original);
});

test("公开页上空文字容器不占高度，有图或有字的节点仍然留下", async () => {
  const { publicFlowNodeIsVisible } = await import("../src/page-builder/template-definition/publicFlow");
  const image = {
    type: "ImageSlot",
    slot: { type: "image" },
    content: { src: "/uploads/hero.png" },
    children: [],
  };
  const emptyCopy = {
    type: "Container",
    rules: { padding: { top: { value: 8, unit: "px" } } },
    children: [
      { type: "TextSlot", slot: { type: "text" }, content: "  ", children: [] },
      { type: "HeadingSlot", slot: { type: "heading" }, content: "", children: [] },
    ],
  };
  expect(publicFlowNodeIsVisible(image)).toBe(true);
  expect(publicFlowNodeIsVisible(emptyCopy)).toBe(false);
  expect(publicFlowNodeIsVisible({
    type: "Container",
    children: [emptyCopy, { type: "TextSlot", slot: { type: "text" }, content: "关于海川", children: [] }],
  })).toBe(true);
  expect(publicFlowNodeIsVisible({ type: "Spacer", children: [] })).toBe(true);
  expect(publicFlowNodeIsVisible({ type: "ImageSlot", slot: { type: "image" }, content: "", children: [] })).toBe(false);
  expect(publicFlowNodeIsVisible({
    type: "Container",
    rules: { backgroundColor: "#111315" },
    children: [],
  })).toBe(true);
  expect(publicFlowNodeIsVisible({
    type: "ButtonSlot",
    slot: { type: "button" },
    content: { label: "", targetType: "none" },
    rules: { backgroundColor: "#F7F8F8" },
    children: [],
  })).toBe(false);
  expect(publicFlowNodeIsVisible({
    type: "ButtonSlot",
    slot: { type: "button" },
    content: { label: "浏览手镯专题", targetType: "none" },
    rules: { backgroundColor: "#F7F8F8" },
    children: [],
  })).toBe(true);
  expect(publicFlowNodeIsVisible({
    type: "HeadingSlot",
    slot: { type: "heading" },
    content: "",
    rules: { backgroundColor: "#F7F8F8" },
    children: [],
  })).toBe(false);
  expect(publicFlowNodeIsVisible({
    type: "TextSlot",
    slot: { type: "text" },
    content: "花形，在腕间延展",
    rules: { backgroundColor: "#F7F8F8" },
    children: [],
  })).toBe(true);
});

test("页面画布收起没有文案的按钮，跳转占位和按钮底色都不算内容", () => {
  const definition = generateTemplateFromRecipe(createRecommendedRecipe("page-hero"));
  const button = Object.values(definition.nodes).find((node) => definition.slots[node.slotId!]?.type === "button");
  expect(button?.slotId).toBeTruthy();
  const slotId = button!.slotId!;
  definition.defaultContent[slotId] = { label: "", targetType: "none" };
  const hidden = compileDynamicTemplateRenderPlan(definition, {
    device: "mobile",
    showEmptySlots: false,
    contentBySlotId: { [slotId]: { label: " ", targetType: "none" } },
  });
  expect(hidden.ok).toBe(true);
  if (!hidden.ok) return;
  expect(planNodes(hidden.plan.root).find((node) => node.slotId === slotId)?.hidden).toBe(true);

  const shown = compileDynamicTemplateRenderPlan(definition, {
    device: "mobile",
    showEmptySlots: false,
    contentBySlotId: { [slotId]: { label: "浏览手镯专题", targetType: "none" } },
  });
  expect(shown.ok).toBe(true);
  if (!shown.ok) return;
  expect(planNodes(shown.plan.root).find((node) => node.slotId === slotId)?.hidden).toBe(false);

  const designer = compileDynamicTemplateRenderPlan(definition, { device: "mobile", showEmptySlots: true });
  expect(designer.ok).toBe(true);
  if (!designer.ok) return;
  expect(planNodes(designer.plan.root).find((node) => node.slotId === slotId)?.hidden).toBe(false);
});

test("页面画布只显示属性面板填写过的标题、说明和按钮", () => {
  const definition = generateTemplateFromRecipe(createRecommendedRecipe("collection-story"));
  const slotId = (role: string) => Object.values(definition.slots).find((slot) => slot.semanticRole === role)?.slotId;
  const title = slotId("title");
  const subtitle = slotId("subtitle");
  const description = slotId("description");
  const cta = slotId("cta");
  expect(title && subtitle && description && cta).toBeTruthy();
  definition.defaultContent[title!] = "主标题待填写";
  definition.defaultContent[subtitle!] = "副标题待填写";
  definition.defaultContent[description!] = "描述待填写";
  definition.defaultContent[cta!] = { label: "主行动待填写", targetType: "none" };
  definition.slots[description!].emptyPolicy = "use-default";
  const pageSurface = { omitDefaultImages: true as const, omitDefaultContent: true as const };
  const hiddenOf = (
    plan: ReturnType<typeof compileDynamicTemplateRenderPlan>,
    id: string,
  ) => {
    expect(plan.ok).toBe(true);
    if (!plan.ok) return undefined;
    return planNodes(plan.plan.root).find((node) => node.slotId === id)?.hidden;
  };

  const untouched = compileDynamicTemplateRenderPlan(definition, {
    device: "mobile",
    showEmptySlots: false,
    publicSurface: pageSurface,
    contentBySlotId: {},
  });
  expect(hiddenOf(untouched, title!)).toBe(true);
  expect(hiddenOf(untouched, subtitle!)).toBe(true);
  expect(hiddenOf(untouched, description!)).toBe(true);
  expect(hiddenOf(untouched, cta!)).toBe(true);

  const filled = compileDynamicTemplateRenderPlan(definition, {
    device: "desktop",
    showEmptySlots: false,
    publicSurface: pageSurface,
    contentBySlotId: {
      [title!]: "花形，在腕间延展",
      [subtitle!]: "腕间的一线弧度",
      [description!]: "一段写在属性面板里的描述",
      [cta!]: { label: "浏览手镯专题", targetType: "none" },
    },
  });
  expect(hiddenOf(filled, title!)).toBe(false);
  expect(hiddenOf(filled, subtitle!)).toBe(false);
  expect(hiddenOf(filled, description!)).toBe(false);
  expect(hiddenOf(filled, cta!)).toBe(false);

  const cleared = compileDynamicTemplateRenderPlan(definition, {
    device: "mobile",
    showEmptySlots: false,
    publicSurface: pageSurface,
    contentBySlotId: {
      [title!]: "  ",
      [subtitle!]: "",
      [description!]: "",
      [cta!]: { label: "", targetType: "page", pagePath: "/bracelets" },
    },
  });
  expect(hiddenOf(cleared, title!)).toBe(true);
  expect(hiddenOf(cleared, subtitle!)).toBe(true);
  expect(hiddenOf(cleared, description!)).toBe(true);
  expect(hiddenOf(cleared, cta!)).toBe(true);

  const designer = compileDynamicTemplateRenderPlan(definition, { device: "mobile", showEmptySlots: true });
  expect(hiddenOf(designer, title!)).toBe(false);
  expect(hiddenOf(designer, cta!)).toBe(false);
});

test("手机深色画布上的通栏图贴边，浅色普通图和作品网格保留边距", async () => {
  const { extendMobileBleedInset, imageBleedsOnMobile, mobileBleedBox, mobileFreeFrameStyle } = await import("../src/page-builder/template-definition/mobileImageBleed");
  const image = (semanticRole: string, width: "fill" | { value: number; unit: "px" } = "fill") => ({
    slot: { type: "image" as const, semanticRole },
    rules: { width },
  });
  const dark = { device: "mobile" as const, constrainWorkCell: false, canvasColor: "#111315" };
  const light = { device: "mobile" as const, constrainWorkCell: false, canvasColor: "#FFFFFF", sectionRole: "collection-story" };
  expect(imageBleedsOnMobile(image("heroImage"), dark)).toBe(true);
  expect(imageBleedsOnMobile(image("heroImage"), light)).toBe(false);
  expect(imageBleedsOnMobile(image("heroImage"), { ...light, sectionRole: "page-hero" })).toBe(true);
  expect(imageBleedsOnMobile(image("backgroundImage"), light)).toBe(true);
  expect(imageBleedsOnMobile(image("logo", { value: 72, unit: "px" }), dark)).toBe(false);
  expect(imageBleedsOnMobile(image("heroImage"), { ...dark, sectionRole: "creation-grid" })).toBe(false);
  expect(imageBleedsOnMobile(image("heroImage"), { ...dark, device: "desktop" })).toBe(false);
  const inset = extendMobileBleedInset(
    { top: 0, right: 0, bottom: 0, left: 0 },
    { top: { value: 24, unit: "px" }, right: { value: 20, unit: "px" }, bottom: { value: 24, unit: "px" }, left: { value: 20, unit: "px" } },
    true,
  );
  expect(mobileBleedBox(inset, { top: true, bottom: false })).toMatchObject({
    marginTop: "-24px", marginLeft: "-20px", marginRight: "-20px", width: "calc(100% + 40px)", borderRadius: 0,
  });
  expect(mobileBleedBox(inset, { top: false, bottom: false })?.marginTop).toBeUndefined();
  expect(mobileFreeFrameStyle({ x: 0.06, y: 0.06, width: 0.88, height: 0.88 }, true, "heroImage")).toMatchObject({ left: 0, width: "100%" });
  expect(mobileFreeFrameStyle({ x: 0.04, y: 0.2, width: 0.9, height: 0.4 }, true, "heroImage")).toMatchObject({ left: 0, width: "100%" });
  expect(mobileFreeFrameStyle({ x: 0.04, y: 0.2, width: 0.9, height: 0.4 }, true, "heroImage")?.height).toBeUndefined();
  expect(mobileFreeFrameStyle({ x: 0.3, y: 0.3, width: 0.4, height: 0.4 }, true, "heroImage")).toBeUndefined();
  expect(mobileFreeFrameStyle({ x: 0.3, y: 0.3, width: 0.4, height: 0.4 }, true, "backgroundImage")).toMatchObject({ width: "100%", height: "100%" });
});

test("作品卡的品名跟到图片下面，横图在手机上改成 4:5", async () => {
  const { attachMobileWorkCaptions, pageHeroReusesDesktopFrame, paintDesktopOnlyHeroFrame, resolveMobileImageFrame, splitHeroMobileFrame } = await import("../src/page-builder/template-definition/mobileWorkGrid");
  const image = (nodeId: string) => ({ kind: "node" as const, node: { nodeId, type: "ImageSlot", slot: { type: "image", semanticRole: "custom" }, children: [] } });
  const name = (nodeId: string) => ({ kind: "node" as const, node: { nodeId, type: "TextSlot", slot: { type: "text", semanticRole: "productName" }, children: [] } });
  const title = { kind: "node" as const, node: { nodeId: "title", type: "HeadingSlot", slot: { type: "heading", semanticRole: "title" }, children: [] } };
  const attached = attachMobileWorkCaptions([
    title,
    { kind: "works", nodes: [image("a").node, image("b").node, image("c").node] },
    name("n1"),
    name("n2"),
    name("n3"),
  ]);
  expect(attached).toHaveLength(2);
  expect(attached[1]).toMatchObject({ kind: "works", captions: [{ nodeId: "n1" }, { nodeId: "n2" }, { nodeId: "n3" }] });
  const unmatched = attachMobileWorkCaptions([
    { kind: "works", nodes: [image("a").node, image("b").node, image("c").node] },
    name("only"),
  ]);
  expect(unmatched[1]).toMatchObject({ kind: "node", node: { nodeId: "only" } });
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: true, slotType: "image", semanticRole: "custom", ratio: 0.4 })).toBe("4 / 5");
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: false, slotType: "image", semanticRole: "heroImage", ratio: 4 / 3 })).toBe("4 / 5");
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: false, slotType: "image", semanticRole: "heroImage", sectionRole: "page-hero", ratio: 16 / 9 })).toBe("9 / 16");
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: false, slotType: "image", semanticRole: "heroImage", sectionRole: "page-hero", ratio: 4 / 5 })).toBe("9 / 16");
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: false, slotType: "image", semanticRole: "heroImage", sectionRole: "page-hero" })).toBe("9 / 16");
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: false, slotType: "image", semanticRole: "heroImage", sectionRole: "page-hero", ratio: 3 / 4 })).toBeUndefined();
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: false, slotType: "image", semanticRole: "heroImage", sectionRole: "page-hero", ratio: 1 })).toBeUndefined();
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: false, slotType: "image", semanticRole: "backgroundImage", sectionRole: "page-hero", ratio: 16 / 9 })).toBe("9 / 16");
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: false, slotType: "image", semanticRole: "backgroundImage", sectionRole: "page-hero" })).toBe("9 / 16");
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: false, slotType: "image", semanticRole: "backgroundImage", sectionRole: "page-hero", ratio: 4 / 5 })).toBe("9 / 16");
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: false, slotType: "image", semanticRole: "backgroundImage", sectionRole: "page-hero", ratio: 9 / 16 })).toBe("9 / 16");
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: false, slotType: "image", semanticRole: "backgroundImage", sectionRole: "page-hero", ratio: 3 / 4 })).toBeUndefined();
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: false, slotType: "image", semanticRole: "backgroundImage", ratio: 16 / 9 })).toBeUndefined();
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: false, slotType: "image", semanticRole: "backgroundImage", sectionRole: "editorial-media", ratio: 16 / 9 })).toBe("4 / 5");
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: false, slotType: "image", semanticRole: "backgroundImage", sectionRole: "video-story", ratio: 3 })).toBe("4 / 5");
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: false, slotType: "image", semanticRole: "heroImage", sectionRole: "editorial-split", ratio: 3 / 2 })).toBeUndefined();
  expect(splitHeroMobileFrame({ device: "mobile", sectionRole: "editorial-split", semanticRole: "heroImage", slotType: "image", mobileRatio: 4 / 5, desktopAspect: "3:2" })).toBe("3 / 2");
  expect(splitHeroMobileFrame({ device: "mobile", sectionRole: "editorial-split", semanticRole: "heroImage", slotType: "image", mobileRatio: 4 / 5, desktopAspect: "1347:1105" })).toBe("3 / 2");
  expect(splitHeroMobileFrame({ device: "mobile", sectionRole: "editorial-split", semanticRole: "heroImage", slotType: "image", mobileRatio: 4 / 5, desktopAspect: "16:9" })).toBe("16 / 9");
  expect(splitHeroMobileFrame({ device: "mobile", sectionRole: "editorial-split", semanticRole: "heroImage", slotType: "image", mobileRatio: 3 / 4, desktopAspect: "3:2" })).toBeUndefined();
  expect(splitHeroMobileFrame({ device: "mobile", sectionRole: "editorial-split", semanticRole: "secondaryImage", slotType: "image", mobileRatio: 4 / 5, desktopAspect: "4:5" })).toBeUndefined();
  expect(splitHeroMobileFrame({ device: "mobile", sectionRole: "creation-grid", semanticRole: "heroImage", slotType: "image", mobileRatio: 4 / 5, desktopAspect: "3:2" })).toBeUndefined();
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: false, slotType: "image", semanticRole: "custom", ratio: 0.8 })).toBeUndefined();
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: false, slotType: "image", semanticRole: "custom", ratio: 1 })).toBeUndefined();
  expect(resolveMobileImageFrame({ device: "mobile", inWorkGrid: false, slotType: "image", semanticRole: "logo", ratio: 3 })).toBeUndefined();
  expect(paintDesktopOnlyHeroFrame({ resolvedFrame: "9 / 16", desktopAspect: "16:9", hasMobileAsset: false })).toBe("16 / 9");
  expect(paintDesktopOnlyHeroFrame({ resolvedFrame: "9 / 16", desktopAspect: "16:9", hasMobileAsset: true })).toBe("9 / 16");
  expect(paintDesktopOnlyHeroFrame({ resolvedFrame: "9 / 16", desktopAspect: "16:9", hasMobileAsset: false, explicitObjectFit: "cover" })).toBe("9 / 16");
  expect(paintDesktopOnlyHeroFrame({ resolvedFrame: "9 / 16", desktopAspect: "16:9", hasMobileAsset: false, explicitObjectFit: "fill" })).toBe("9 / 16");
  expect(paintDesktopOnlyHeroFrame({ resolvedFrame: "9 / 16", desktopAspect: "16:9", hasMobileAsset: false, pairedCanvas: true })).toBe("9 / 16");
  expect(paintDesktopOnlyHeroFrame({ resolvedFrame: "16 / 9", desktopAspect: "16:9", hasMobileAsset: false })).toBe("16 / 9");
  expect(paintDesktopOnlyHeroFrame({ resolvedFrame: "3 / 4", desktopAspect: "16:9", hasMobileAsset: false })).toBe("3 / 4");
  const landscape = { desktopAspect: "16:9", hasMobileAsset: false };
  expect(pageHeroReusesDesktopFrame({ sectionRole: "page-hero", images: [landscape] })).toBe(true);
  expect(pageHeroReusesDesktopFrame({ sectionRole: "page-hero", images: [{ ...landscape, hasMobileAsset: true }] })).toBe(false);
  expect(pageHeroReusesDesktopFrame({ sectionRole: "page-hero", images: [{ ...landscape, explicitObjectFit: "cover" }] })).toBe(false);
  expect(pageHeroReusesDesktopFrame({ sectionRole: "page-hero", images: [{ ...landscape, explicitObjectFit: "fill" }] })).toBe(false);
  expect(pageHeroReusesDesktopFrame({ sectionRole: "page-hero", images: [{ desktopAspect: "3:4", hasMobileAsset: false }] })).toBe(false);
  expect(pageHeroReusesDesktopFrame({ sectionRole: "page-hero", images: [{ hasMobileAsset: false }] })).toBe(false);
  expect(pageHeroReusesDesktopFrame({ sectionRole: "creation-grid", images: [landscape] })).toBe(false);
  expect(pageHeroReusesDesktopFrame({ sectionRole: "page-hero", images: [] })).toBe(false);
  expect(resolveMobileImageFrame({ device: "desktop", inWorkGrid: true, slotType: "image", semanticRole: "custom", ratio: 0.4 })).toBeUndefined();
});

test("固定横图根在手机上对换成倒数画布：16:9 对 9:16，3:2 与 4:3 同样对换", () => {
  const wide = createRecommendedRecipe("creation-grid");
  wide.canvas = { width: 1440, height: 810, aspectRatio: 1440 / 810 };
  const definition = asLegacy(generateTemplateFromRecipe(wide, { templateId: "pair_wide", name: "宽幅" }));
  expect(getEffectiveTemplateRootRules(definition, "mobile").height.mode).toBe("auto");
  const mobile = resolveTemplateDesignFrame(definition, "mobile");
  expect(mobile.pairedCanvas).toBe(true);
  expect(mobile.heightMode).toBe("aspect-ratio");
  expect(mobile.ratioLabel).toBe("9:16");
  expect(mobile.fallbackHeight).toBeCloseTo(390 * 16 / 9, 5);
  expect(resolveTemplateDesignFrame(definition, "desktop").ratioLabel).toBe("16:9");
  expect(resolveTemplateDesignFrame(definition, "desktop").pairedCanvas).toBeFalsy();

  const classic = createRecommendedRecipe("creation-grid");
  classic.canvas = { width: 1440, height: 1080, aspectRatio: 1440 / 1080 };
  const classicDefinition = asLegacy(generateTemplateFromRecipe(classic, { templateId: "pair_classic", name: "均衡横版" }));
  const classicFrame = resolveTemplateDesignFrame(classicDefinition, "mobile");
  expect(classicFrame.pairedCanvas).toBe(true);
  expect(classicFrame.ratioLabel).toBe("3:4");
  expect(classicFrame.fallbackHeight).toBeCloseTo(390 * 4 / 3, 5);

  const overridden = setTemplateDesignHeightMode(classicDefinition, "mobile", "aspect-ratio", { width: 4, height: 5 });
  expect(resolvePairedMobileCanvas(overridden)).toBeNull();

  const portrait = asLegacy(generateTemplateFromRecipe(createRecommendedRecipe("creation-grid"), { templateId: "pair_portrait", name: "竖图" }));
  const portraitFrame = resolveTemplateDesignFrame(portrait, "mobile");
  expect(portraitFrame.pairedCanvas).toBe(true);
  expect(portraitFrame.ratioLabel).toBe("5:4");
  expect(portraitFrame.fallbackHeight).toBeCloseTo(390 * 4 / 5, 5);

  const tall = createRecommendedRecipe("creation-grid");
  tall.canvas = { width: 1440, height: 2880, aspectRatio: 1440 / 2880 };
  const tallFrame = resolveTemplateDesignFrame(asLegacy(generateTemplateFromRecipe(tall, { templateId: "pair_tall", name: "窄幅" })), "mobile");
  expect(tallFrame.ratioLabel).toBe("2:1");
  expect(tallFrame.fallbackHeight).toBeCloseTo(390 / 2, 5);

  const square = createRecommendedRecipe("creation-grid");
  square.canvas = { width: 1440, height: 1440, aspectRatio: 1 };
  const squareFrame = resolveTemplateDesignFrame(asLegacy(generateTemplateFromRecipe(square, { templateId: "pair_square", name: "方图" })), "mobile");
  expect(squareFrame.pairedCanvas).toBe(true);
  expect(squareFrame.ratioLabel).toBe("1:1");
  expect(squareFrame.fallbackHeight).toBeCloseTo(390, 5);

  const hero = asLegacy(findLaunchTemplateMaster("page-hero")!);
  const heroFrame = resolveTemplateDesignFrame(hero, "mobile");
  expect(getEffectiveTemplateRootRules(hero, "mobile").height.mode).toBe("auto");
  expect(heroFrame.pairedCanvas).toBe(true);
  expect(heroFrame.ratioLabel).toBe("9:16");
  expect(heroFrame.fallbackHeight).toBeCloseTo(390 * 16 / 9, 5);

  const box = pairedCanvasContentBox({ width: 9, height: 16 }, { reserveText: true, viewportWidth: 390 });
  expect(choosePeerImageSplit(3, box.innerWidth, box.innerHeight)).toMatchObject({ columns: 1, rows: 3, overflow: false });
  expect(choosePeerImageSplit(6, box.innerWidth, box.innerHeight).overflow).toBe(true);
  const classicBox = pairedCanvasContentBox({ width: 2, height: 3 }, { reserveText: true, viewportWidth: 390 });
  expect(choosePeerImageSplit(3, classicBox.innerWidth, classicBox.innerHeight)).toMatchObject({ columns: 1, rows: 3, overflow: true });

  const edit = createRecommendedRecipe("editorial-media");
  edit.canvas = { width: 1440, height: 960, aspectRatio: 1440 / 960 };
  expect(resolveTemplateDesignFrame(asLegacy(generateTemplateFromRecipe(edit, { templateId: "pair_edit", name: "编辑横版" })), "mobile").ratioLabel).toBe("2:3");

  const four = createRecommendedRecipe("creation-grid");
  four.media = createMediaSlots(["custom", "custom", "custom", "custom"]);
  four.canvas = { width: 1440, height: 720, aspectRatio: 2 };
  const fourFrame = resolveTemplateDesignFrame(asLegacy(generateTemplateFromRecipe(four, { templateId: "pair_four", name: "四图" })), "mobile");
  expect(fourFrame.pairedCanvas).toBe(true);
  expect(fourFrame.ratioLabel).toBe("1:2");
  expect(fourFrame.heightMode).toBe("aspect-ratio");

  const threeWide = createRecommendedRecipe("creation-grid");
  threeWide.canvas = { width: 1440, height: 720, aspectRatio: 2 };
  expect(resolvePairedMobileCanvas(asLegacy(generateTemplateFromRecipe(threeWide, { templateId: "pair_three_wide", name: "三图" })))).not.toBeNull();
});

test("显式固定画幅新建为比例配对，保存重开保持原比，随内容独立保留", () => {
  for (const canvas of CANVAS_PRESETS) {
    const recipe = createRecommendedRecipe();
    recipe.layout = "topImageBottomContent";
    recipe.content = [createContentSlot("title")];
    recipe.canvas = { width: canvas.width, height: canvas.height, aspectRatio: canvas.width / canvas.height };
    const definition = generateTemplateFromRecipe(recipe);
    const reopened = JSON.parse(JSON.stringify(definition));
    const desktopRoot = getEffectiveTemplateRootRules(reopened, "desktop");
    expect(getEffectiveTemplateRootRules(reopened, "mobile").height.mode).toBe("auto");
    if (canvas.ratio === "auto") {
      expect(desktopRoot.height.mode).toBe("auto");
      expect(resolvePairedMobileCanvas(reopened)).toBeNull();
      continue;
    }
    expect(reopened.metadata.geometryPolicy).toBe("paired-canvas");
    expect(desktopRoot.height.mode).toBe("aspect-ratio");
    expect(desktopRoot.height.ratio!.width / desktopRoot.height.ratio!.height).toBeCloseTo(canvas.width / canvas.height, 10);
    const desktop = resolveTemplateDesignFrame(reopened, "desktop");
    const mobile = resolveTemplateDesignFrame(reopened, "mobile");
    expect(desktop.fallbackHeight).toBeCloseTo(desktop.sourceWidth * canvas.height / canvas.width, 8);
    expect(mobile.pairedCanvas).toBe(true);
    expect(mobile.fallbackHeight).toBeCloseTo(mobile.sourceWidth * canvas.width / canvas.height, 8);
    expect(validateDynamicTemplateDefinition(reopened).valid).toBe(true);
  }
  const wide = createRecommendedRecipe("page-hero");
  wide.canvas = { width: 1920, height: 1080, aspectRatio: 16 / 9 };
  const normalized = generateTemplateFromRecipe(wide);
  expect(getEffectiveTemplateRootRules(normalized, "desktop").height).toEqual({ mode: "aspect-ratio", ratio: { width: 16, height: 9 } });
  expect(resolveTemplateDesignFrame(normalized, "desktop").fallbackHeight).toBe(810);
  expect(resolveTemplateDesignFrame(normalized, "mobile").fallbackHeight).toBeCloseTo(390 * 16 / 9, 8);
  for (const role of ["page-hero", "collection-story", "editorial-split", "craft-detail", "creation-grid", "service-invitation"] as const) {
    const recommended = generateTemplateFromRecipe(createRecommendedRecipe(role));
    expect(recommended.metadata.geometryPolicy, role).toBe("paired-canvas");
    expect(getEffectiveTemplateRootRules(recommended, "desktop").height.mode, role).toBe("aspect-ratio");
  }
});

test("已有 hero-media-frame 仍按桌面比例对换整节，保存值不被新建默认替换", async () => {
  const { resolveMobileImageFrame } = await import("../src/page-builder/template-definition/mobileWorkGrid");
  const generated = generateTemplateFromRecipe(createRecommendedRecipe("creation-grid"), { templateId: "hero_frame_grid", name: "新几何网格" });
  generated.metadata.geometryPolicy = "hero-media-frame";
  expect(generated.metadata.geometryPolicy).toBe("hero-media-frame");
  expect(resolvePairedMobileCanvas(generated)).toEqual({ width: 5, height: 4 });
  const expected = {
    "page-hero": { width: 9, height: 16 },
    "creation-grid": { width: 5, height: 4 },
    "service-invitation": { width: 9, height: 16 },
  } as const;
  for (const templateId of ["page-hero", "creation-grid", "service-invitation"] as const) {
    const master = findLaunchTemplateMaster(templateId);
    expect(master?.metadata.geometryPolicy).toBe("hero-media-frame");
    expect(resolvePairedMobileCanvas(master!)).toEqual(expected[templateId]);
  }
  const stripped = asLegacy(findLaunchTemplateMaster("creation-grid")!);
  expect(resolveTemplateDesignFrame(stripped, "mobile").ratioLabel).toBe("5:4");
  const frame = {
    device: "mobile" as const,
    inWorkGrid: false,
    slotType: "image",
    semanticRole: "backgroundImage",
    sectionRole: "page-hero",
    geometryPolicy: "hero-media-frame" as const,
    desktopRatio: 16 / 9,
  };
  expect(resolveMobileImageFrame({ ...frame, ratio: 9 / 16, heroPlacement: "primary" })).toBe("9 / 16");
  expect(resolveMobileImageFrame({ ...frame, ratio: 9 / 16 })).toBe("9 / 16");
  expect(resolveMobileImageFrame({ ...frame, ratio: 9 / 16, heroPlacement: "subsequent" })).toBe("16 / 9");
  expect(resolveMobileImageFrame({ ...frame, ratio: 3 / 4, heroPlacement: "primary" })).toBeUndefined();
  expect(resolveMobileImageFrame({ ...frame, ratio: 9 / 16, heroPlacement: "primary", authorLocked: true })).toBeUndefined();
  expect(resolveMobileImageFrame({ ...frame, ratio: 9 / 16, heroPlacement: "primary", desktopRatio: 4 / 5 })).toBeUndefined();
});

test("有效画幅、默认图和编辑范围与声明画幅分开", () => {
  const hero = structuredClone(findLaunchTemplateMaster("page-hero")!);
  const image = Object.values(hero.slots).find((slot) => slot.type === "image"
    && (slot.semanticRole === "backgroundImage" || slot.semanticRole === "heroImage"));
  expect(image).toBeTruthy();
  image!.desktopRules.aspectRatio = "16:9";
  if (image!.mobileRules) delete image!.mobileRules.objectFit;
  hero.defaultContent[image!.slotId] = { src: "/media/desktop.jpg", alt: "桌面" };
  const declared = resolveTemplateDesignFrame(asLegacy(hero), "mobile");
  expect(declared.ratioLabel).toBe("9:16");
  expect(declared.pairedCanvas).toBe(true);
  const preview = resolveTemplatePreviewViewport(hero, "mobile");
  expect(preview.frameNote).toBeUndefined();
  expect(preview.pairedCanvas).toBe(true);
  expect(preview.ratioLabel).toBe("9:16");
  const covered = structuredClone(hero);
  const coveredImage = Object.values(covered.slots).find((slot) => slot.slotId === image!.slotId);
  if (coveredImage?.mobileRules) coveredImage.mobileRules.objectFit = "cover";
  const coveredPreview = resolveTemplatePreviewViewport(covered, "mobile");
  expect(coveredPreview.frameNote).toBeUndefined();
  expect(coveredPreview.pairedCanvas).toBe(true);
  expect(coveredPreview.ratioLabel).toBe("9:16");
  const coveredFrames = describeEffectiveImageFrames({
    sectionRole: "page-hero",
    semanticRole: image!.semanticRole,
    desktopRatioLabel: "16:9",
    mobileRatioLabel: "9:16",
    hasMobileAsset: false,
    explicitObjectFit: "cover",
  });
  expect(coveredFrames.mobile).toBe("9:16");
  const frames = describeEffectiveImageFrames({
    sectionRole: "page-hero",
    semanticRole: image!.semanticRole,
    desktopRatioLabel: "16:9",
    mobileRatioLabel: "9:16",
    hasMobileAsset: false,
  });
  expect(frames.mobile).toBe("9:16");
  expect(frames.declaredMobile).toBe("9:16");
  expect(frames.note).toContain("9:16");
  const paired = structuredClone(hero);
  paired.metadata.geometryPolicy = "paired-canvas";
  const pairedPreview = resolveTemplatePreviewViewport(paired, "mobile");
  expect(pairedPreview.ratioLabel).toBe("9:16");
  expect(pairedPreview.pairedCanvas).toBe(true);
  expect(pairedPreview.frameNote).toBeUndefined();
  expect(pairedPreview.fallbackHeight / pairedPreview.sourceWidth).toBeCloseTo(16 / 9, 2);
  const pairedFrames = describeEffectiveImageFrames({
    sectionRole: "page-hero",
    semanticRole: image!.semanticRole,
    geometryPolicy: "paired-canvas",
    desktopRatioLabel: "16:9",
    mobileRatioLabel: "9:16",
    hasMobileAsset: false,
  });
  expect(pairedFrames.mobile).toBe("9:16");
  expect(pairedFrames.note).toContain("9:16");
  const split = describeEffectiveImageFrames({
    sectionRole: "editorial-split",
    semanticRole: "heroImage",
    desktopRatioLabel: "3:2",
    mobileRatioLabel: "4:5",
  });
  expect(split.mobile).toBe("3:2");
  expect(split.declaredMobile).toBe("4:5");
  const kept = withNeutralTemplateImages(hero, { [image!.slotId]: { src: "/media/desktop.jpg", alt: "桌面" } });
  expect((kept.contentBySlotId[image!.slotId] as { src: string }).src).toBe("/media/desktop.jpg");
  const sample = withNeutralTemplateImages(hero, {
    [image!.slotId]: { src: "/src/page-builder/preview-assets/neutral-template-preview-v1/template-preview-square.svg", alt: "样图" },
  });
  expect((sample.contentBySlotId[image!.slotId] as { src: string }).src).toContain("catalog-structure-media.svg");
  const forced = withNeutralTemplateImages(hero, { [image!.slotId]: { src: "/media/desktop.jpg", alt: "桌面" } }, { force: true });
  expect((forced.contentBySlotId[image!.slotId] as { src: string }).src).toContain("catalog-structure-media.svg");
  const thumbnail = createNeutralTemplateCatalogPreview(hero, { showPropertyImages: true });
  expect((thumbnail.contentBySlotId[image!.slotId] as { src: string }).src).toBe("/media/desktop.jpg");
  const structure = createNeutralTemplateCatalogPreview(hero);
  expect((structure.contentBySlotId[image!.slotId] as { src: string }).src).toContain("catalog-structure-media.svg");
  expect(catalogStoredName("editorial-split", "首页高级定制")).toBe("首页高级定制");
  expect(catalogStoredName("editorial-split", "左右图文")).toBe("");
  expect(editingGeometryDiverged("mobile", "desktop")).toBe(true);
  expect(editingGeometryDiverged("mobile", "mobile")).toBe(false);
  expect(previewExitGeometry({ device: "desktop", breakpoint: "desktop", previewWidth: 900 })).toEqual({
    device: "desktop",
    breakpoint: "desktop",
    previewWidth: 900,
  });
});
