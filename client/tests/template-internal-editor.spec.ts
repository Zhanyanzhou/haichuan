import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";
import {
  CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX,
  CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE,
  getContentTemplateContract,
  getContentTemplatePageRule,
} from "../src/page-builder/generated/contentTemplates.generated";
import { RESPONSIVE_CANVAS } from "../src/page-builder/config/blockContracts";
import { TEMPLATE_CONTRACT_ROLE_LABELS } from "../src/page-builder/runtime/contentTemplateRolePresentation";
import {
  addDynamicTemplateNode,
  compileDynamicTemplateRenderPlan,
  createBlankDynamicTemplateDefinition,
  DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS,
  DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH,
  DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES,
  duplicateDynamicTemplateNode,
  getDynamicTemplateStructureLockViolation,
  moveDynamicTemplateNode,
  removeDynamicTemplateNode,
  reorderDynamicTemplateNode,
  setDynamicTemplateNodeStructureLocked,
  updateDynamicTemplateNodeRules,
  validateDynamicTemplateDefinition,
  validateDynamicTemplatePublishDefinition,
} from "../src/page-builder/template-definition";
import { parseCommaSeparatedValues } from "../src/page-builder/template-editor/dynamicTemplateEditorUtils";
import { applyTemplateComposition, getTemplateComposition, resetTemplateComposition } from "../src/page-builder/template-editor/templateCompositionPresets";
import { useTemplateEditorSession } from "../src/page-builder/template-editor/templateEditorSession";
import {
  TEMPLATE_INSPECTOR_CAPABILITIES,
  getTemplateInspectorCapabilities,
  getTemplateInspectorGroupSummary,
  getTemplateResponsiveSource,
  reconcileTemplatePublishIssueIndex,
  resolveTemplateInspectorIssueTarget,
} from "../src/page-builder/template-editor/templateInspectorCapabilities";
import {
  matchesTemplatePublicationFilter,
  resolveTemplatePublicationStatus,
} from "../src/page-builder/template-editor/templatePublicationStatus";

test.use({ channel: process.env.TEMPLATE_BROWSER_CHANNEL });

const templateEditorAcceptanceCount = CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.length;

async function readZ4Session(page: Page) {
  return page.evaluate(async () => {
    const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
    const state = store.getState();
    return { definition: structuredClone(state.draft.definition), selected: state.selectedObjectId, past: state.historyPast.length, future: state.historyFuture.length, dirty: state.dirty };
  });
}

test("简单模板保护必填后代及锁定的设计宽度", () => {
  const root = createBlankDynamicTemplateDefinition("删除保护");
  const region = addDynamicTemplateNode(root, root.rootNodeId, "Container");
  const image = addDynamicTemplateNode(region.definition, region.nodeId, "ImageSlot");
  image.definition.slots[image.slotId!].required = true;
  const baseline = structuredClone(image.definition);
  expect(() => removeDynamicTemplateNode(image.definition, image.nodeId)).toThrow("必填槽位");
  expect(() => removeDynamicTemplateNode(image.definition, region.nodeId)).toThrow("必填槽位");
  expect(image.definition).toEqual(baseline);
  image.definition.slots[image.slotId!].required = false;
  expect(Object.keys(removeDynamicTemplateNode(image.definition, region.nodeId).slots)).toHaveLength(0);
  const locked = setDynamicTemplateNodeStructureLocked(image.definition, root.rootNodeId, true);
  const resized = structuredClone(locked);
  resized.metadata.previewDesktopWidth = 1440;
  expect(getDynamicTemplateStructureLockViolation(locked, resized)).toContain("不能修改模板设计宽度");
});

test("方案二预设兼容清理、完整布局组合与祖先锁保护", () => {
  const root = createBlankDynamicTemplateDefinition("构图边界");
  const region = addDynamicTemplateNode(root, root.rootNodeId, "Container");
  const video = addDynamicTemplateNode(region.definition, region.nodeId, "Video");
  const baseline = video.definition;
  for (const device of ["desktop", "mobile"] as const) {
    for (const layout of ["text-left", "media-left", "media-top", "text-top"] as const) {
      for (const spacing of ["compact", "standard", "spacious"] as const) {
        const definition = structuredClone(baseline);
        applyTemplateComposition(definition, video.nodeId, device, { layout, spacing });
        expect(getTemplateComposition(definition, video.nodeId, device)?.layout).toBe(layout);
        expect(validateDynamicTemplateDefinition(definition).issues.filter((issue) => issue.level === "error")).toEqual([]);
      }
    }
  }
  const compatible = structuredClone(baseline);
  compatible.nodes[video.nodeId].props.contentTemplateLayoutData = { version: 2, nodes: { coverImage: {
    rectByViewport: { desktop: { x: 0.1, y: 0.1, width: 0.1, height: 0.5 }, mobile: { x: 0.1, y: 0.1, width: 0.8, height: 0.5 } },
    sizeCompatibilityByViewport: { desktop: { width: CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE } },
  } } };
  expect(validateDynamicTemplateDefinition(compatible).issues.filter((issue) => issue.level === "error")).toEqual([]);
  const mobileBefore = structuredClone((compatible.nodes[video.nodeId].props.contentTemplateLayoutData as any).nodes.coverImage.rectByViewport.mobile);
  applyTemplateComposition(compatible, video.nodeId, "desktop", { layout: "text-left" });
  expect(validateDynamicTemplateDefinition(compatible).issues.filter((issue) => issue.level === "error")).toEqual([]);
  resetTemplateComposition(compatible, video.nodeId, "desktop");
  expect(validateDynamicTemplateDefinition(compatible).issues.filter((issue) => issue.level === "error")).toEqual([]);
  expect((compatible.nodes[video.nodeId].props.contentTemplateLayoutData as any).nodes.coverImage.rectByViewport.mobile).toEqual(mobileBefore);
  const locked = setDynamicTemplateNodeStructureLocked(baseline, region.nodeId, true);
  const lockedBefore = structuredClone(locked);
  applyTemplateComposition(locked, video.nodeId, "desktop", { layout: "media-left" });
  resetTemplateComposition(locked, video.nodeId, "desktop");
  expect(locked).toEqual(lockedBefore);
});

test("方案二可视化构图：布局比例、撤销、双端隔离与保存回显（自有 API 夹具）", async ({ page }, testInfo) => {
  test.skip(appMode === "mock", "使用 development 前端与自有 API 夹具");
  const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, { role: "SUPER_ADMIN", viewport: { width: 1920, height: 960 } });
  await openTemplateFromCatalog(page, "视频");
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  const composition = inspector.getByRole("region", { name: "可视化构图" });
  await expect(composition).toBeVisible();
  const before = await readZ4Session(page);
  await page.screenshot({ path: testInfo.outputPath("option-two-before.png"), animations: "disabled" });
  await composition.getByRole("button", { name: "构图：左文右图", exact: true }).click();
  await expect(composition.getByRole("button", { name: "构图：左文右图", exact: true })).toHaveAttribute("aria-pressed", "true");
  const after = await readZ4Session(page);
  expect(after.past).toBe(before.past + 1);
  const targetId = await composition.getAttribute("data-composition-node");
  const layout = after.definition.nodes[targetId!].props.contentTemplateLayoutData.nodes;
  expect(layout.copy.rectByViewport.desktop.x + layout.copy.rectByViewport.desktop.width).toBeLessThan(layout.coverImage.rectByViewport.desktop.x);
  expect(layout.copy.rectByViewport.mobile).toBeUndefined();
  await composition.getByRole("button", { name: "构图：左文右图", exact: true }).click();
  expect((await readZ4Session(page)).past).toBe(after.past);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await readZ4Session(page)).definition).toEqual(before.definition);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await composition.getByRole("button", { name: "内容比例：1:2", exact: true }).click();
  await composition.getByRole("button", { name: "文案对齐：居中对齐", exact: true }).click();
  await composition.getByRole("button", { name: "构图留白：标准", exact: true }).click();
  await expect(composition.getByRole("button", { name: "内容比例：1:2", exact: true })).toHaveAttribute("aria-pressed", "true");
  const frame = page.frameLocator("iframe.template-editor__viewport-frame");
  const media = frame.locator('[data-content-role="coverImage"]').first();
  const copy = frame.locator('[data-content-role="copy"]').first();
  await expect(copy).toHaveCSS("color", "rgb(24, 26, 27)");
  await expect.poll(async () => {
    const a = await copy.boundingBox(); const b = await media.boundingBox();
    return Boolean(a && b && a.x + a.width < b.x);
  }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("option-two-desktop.png"), animations: "disabled" });
  const desktopBeforeMobile = (await readZ4Session(page)).definition.nodes[targetId!].props.contentTemplateLayoutData.nodes.copy.rectByViewport.desktop;
  await page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端模板布局/ }).click();
  await composition.getByRole("combobox", { name: "内容顺序" }).selectOption("text-top");
  const mobileSet = await readZ4Session(page);
  const savedLayout = mobileSet.definition.nodes[targetId!].props.contentTemplateLayoutData.nodes;
  expect(savedLayout.copy.rectByViewport.mobile.y).toBeLessThan(savedLayout.coverImage.rectByViewport.mobile.y);
  expect(savedLayout.copy.rectByViewport.desktop).toEqual(desktopBeforeMobile);
  await page.getByRole("button", { name: "保存模板", exact: true }).click();
  await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
  expect(dynamic.writes.at(-1)?.body.definition.nodes[targetId!].props.contentTemplateLayoutData).toEqual(mobileSet.definition.nodes[targetId!].props.contentTemplateLayoutData);
  await page.reload();
  await openTemplateFromCatalog(page, mobileSet.definition.name);
  await page.locator(".template-editor__toolbar").getByRole("button", { name: /桌面端模板布局/ }).click();
  await expect(page.getByRole("button", { name: "构图：左文右图", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "内容比例：1:2", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端模板布局/ }).click();
  await expect.poll(async () => {
    const a = await copy.boundingBox(); const b = await media.boundingBox();
    return Boolean(a && b && a.y + a.height < b.y);
  }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("option-two-mobile-canvas.png"), animations: "disabled" });
  await page.locator(".template-editor__toolbar").getByRole("button", { name: /桌面端模板布局/ }).click();
  const ready = await readZ4Session(page);
  for (const width of [1440, 1200, 1199, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const openInspector = page.getByRole("button", { name: "展开模板属性面板", exact: true });
    if (width <= 1199) await openInspector.click();
    else if (await openInspector.isVisible()) await openInspector.click();
    await expect(page.getByRole("button", { name: "构图：左文右图", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`option-two-workspace-${width}.png`), animations: "disabled" });
    if (width <= 1199) {
      await page.getByRole("button", { name: "收起模板属性面板", exact: true }).click();
      await openInspector.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog", { name: "模板属性工作区", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(openInspector).toBeFocused();
    }
  }
  expect((await readZ4Session(page)).definition).toEqual(ready.definition);
  expect(forbiddenPageWrites).toEqual([]);
});

test("方案二原生容器快捷布局生效且自由叠放禁用无效操作", async ({ page }) => {
  test.skip(appMode === "mock", "使用 development 前端与自有 API 夹具");
  await openWorkspaceShell(page, { role: "SUPER_ADMIN", viewport: { width: 1440, height: 960 } });
  await page.getByRole("button", { name: "模板设计", exact: true }).click();
  await page.getByRole("button", { name: "新建模板", exact: true }).click();
  const initial = await readZ4Session(page);
  const controls = page.getByRole("region", { name: "容器可视化布局" });
  await controls.getByRole("button", { name: "容器布局：网格布局", exact: true }).click();
  await controls.getByRole("button", { name: "容器列宽：1:2", exact: true }).click();
  await controls.getByRole("button", { name: "容器对齐：居中", exact: true }).click();
  await controls.getByRole("button", { name: "容器留白：标准", exact: true }).click();
  const state = await readZ4Session(page);
  const root = state.definition.nodes[state.definition.rootNodeId];
  expect(root.responsive.mobile).toEqual(initial.definition.nodes[initial.definition.rootNodeId].responsive.mobile);
  expect(root.responsive.desktop).toMatchObject({ display: "grid", columns: [1, 2], alignItems: "center", padding: { top: { value: 32, unit: "px" } } });
  const rendered = page.frameLocator("iframe.template-editor__viewport-frame").locator(`[data-template-node-id="${root.nodeId}"]`).first();
  await expect(rendered).toHaveCSS("display", "grid");
  await expect(rendered).toHaveCSS("align-items", "center");
  await expect(rendered).toHaveCSS("padding-top", "32px");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await readZ4Session(page)).past).toBe(state.past - 1);
  const empty = createBlankDynamicTemplateDefinition("自由叠放验证");
  const stack = addDynamicTemplateNode(empty, empty.rootNodeId, "Stack");
  const rules = stack.definition.nodes[stack.nodeId].responsive.desktop;
  rules.layoutMode = "free";
  rules.display = "grid";
  rules.columns = [1, 1];
  rules.height = { mode: "fixed", value: { value: 400, unit: "px" } };
  expect(validateDynamicTemplateDefinition(stack.definition).issues.filter((issue) => issue.level === "error")).toEqual([]);
  await page.evaluate(async ({ definition, nodeId }) => {
    const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
    store.getState().setDynamicDefinition(definition);
    store.getState().selectObject(nodeId);
  }, stack);
  await expect(controls.getByRole("button", { name: "容器对齐：居中", exact: true })).toBeDisabled();
  await expect(controls.getByRole("button", { name: "容器列宽：1:2", exact: true })).toBeDisabled();
  await expect(controls.getByRole("button", { name: "容器布局：横向排列", exact: true })).toBeDisabled();
});

test("Z4-02 页面目录精简文案并保留筛选重置和键盘禁用原因（Mock）", async ({ page }) => {
  const { forbiddenPageWrites } = await openWorkspaceShell(page);
  const library = page.getByRole("complementary", { name: "模板组件库" });
  await expect(page.locator(".template-editor__workspace-context"))
    .toHaveAttribute("data-active-mode", "page");
  await expect(page.locator(".template-editor__workspace-context")).toContainText("店铺首页");
  await expect(library.getByRole("heading", { name: "模板目录", exact: true })).toHaveCount(0);
  await expect(library.locator(".unified-template-library__primary-action")).toHaveCount(0);
  await expect(library.getByRole("heading", { name: /^品牌展示 ·/ })).toHaveCount(0);
  const blocked = library.locator('.homepage-editor__template-card-main[aria-disabled="true"]').first();
  await blocked.focus();
  await expect(blocked).toBeFocused();
  await expect(blocked).toHaveAccessibleName(/已有主舞台实例，不能再次添加$/);
  await expect(blocked).not.toContainText("主舞台不可重复");
  await blocked.press("Enter");
  await page.getByRole("button", { name: "模板设计", exact: true }).click();
  await expect(library.locator(".unified-template-library__primary-action").first()).toHaveText("编辑模板");
  const before = await readZ4Session(page);
  await library.getByRole("button", { name: "草稿", exact: true }).click();
  await library.getByRole("textbox", { name: "搜索模板" }).fill("不存在的 Z4 模板");
  await expect(library).toContainText("没有符合当前筛选条件的模板");
  await library.getByRole("button", { name: "重置筛选" }).click();
  await expect(library.getByRole("textbox", { name: "搜索模板" })).toHaveValue("");
  await expect(library.getByRole("button", { name: "全部", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await readZ4Session(page)).toEqual(before);
  expect(forbiddenPageWrites).toEqual([]);
});

test("Z4-02 精确插入位置、完整对象操作、删除影响与撤销（Mock）", async ({ page }, testInfo) => {
  await openWorkspaceShell(page);
  await page.getByRole("button", { name: "模板设计", exact: true }).click();
  await page.getByRole("button", { name: "新建模板", exact: true }).click();
  const add = await openTemplateStructureAddPanel(page);
  await add.panel.getByRole("button", { name: "图片槽位 内容槽位" }).click();
  const imageState = await readZ4Session(page);
  const imageId = imageState.selected;
  await add.panel.getByRole("combobox", { name: "插入位置" }).selectOption("before");
  await expect(add.panel).toContainText("仅显示当前位置允许的类型");
  await add.panel.getByRole("button", { name: "标题槽位 内容槽位" }).click();
  const beforeState = await readZ4Session(page);
  const parent = Object.values(beforeState.definition.nodes).find((node: any) => node.childIds.includes(imageId)) as any;
  expect(parent.childIds).toEqual([beforeState.selected, imageId]);
  await add.panel.getByRole("combobox", { name: "插入位置" }).selectOption("inside");
  await expect(add.panel.getByRole("button", { name: "图片槽位 内容槽位" })).toHaveCount(0);
  await add.panel.getByRole("combobox", { name: "插入位置" }).selectOption("after");
  await add.panel.getByRole("button", { name: "描述槽位 内容槽位" }).click();
  const inserted = await readZ4Session(page);
  expect(inserted.definition.nodes[parent.nodeId].childIds).toEqual([beforeState.selected, inserted.selected, imageId]);
  await add.trigger.click();
  const overlay = page.locator('[data-template-editor-overlay-root="template-definition"]');
  await expect(overlay.locator('[data-overlay-parent="true"]')).toHaveCount(1);
  // 仅改变隔离测试页的 DOM 测量，确认越界标记随布局更新，不产生模板历史。
  const measuredNode = page.frameLocator(".template-editor__viewport-frame")
    .locator(`[data-template-node-id="${inserted.selected}"]`);
  const measuredBox = overlay.locator(`[data-editable-target-id="node:${inserted.selected}"]`);
  const originalPosition = await measuredNode.evaluate((element) => {
    const style = (element as HTMLElement).style;
    const original = { position: style.position, left: style.left };
    style.position = "relative";
    style.left = "-10%";
    return original;
  });
  await expect(measuredBox).toHaveAttribute("data-overlay-out-of-bounds", "true");
  await measuredNode.evaluate((element, original) => {
    (element as HTMLElement).style.position = original.position;
    (element as HTMLElement).style.left = original.left;
  }, originalPosition);
  await expect(measuredBox).not.toHaveAttribute("data-overlay-out-of-bounds", "true");
  expect(await readZ4Session(page)).toEqual(inserted);
  const actions = overlay.locator("details.template-editor__editable-overlay-actions");
  await actions.getByText("对象操作", { exact: true }).click();
  await expect(actions.getByRole("button", { name: "复制节点", exact: true })).toHaveText("复制节点");
  await actions.getByRole("button", { name: "删除节点", exact: true }).click();
  const confirmation = page.getByRole("dialog");
  await expect(confirmation).toContainText("将删除 1 个节点，包含 1 个内容槽位");
  await confirmation.getByRole("button", { name: /^取\s*消$/ }).click();
  expect(await readZ4Session(page)).toEqual(inserted);
  await actions.getByRole("button", { name: "删除节点", exact: true }).click();
  await confirmation.getByRole("button", { name: "删除节点", exact: true }).click();
  expect((await readZ4Session(page)).definition.nodes[inserted.selected]).toBeUndefined();
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await readZ4Session(page)).definition).toEqual(inserted.definition);
  await page.screenshot({ path: testInfo.outputPath("z4-02-structure-canvas.png") });
});

test("Z4-02 Inspector 导航零历史、设备替换差异确认与预览场景隔离（Mock）", async ({ page }, testInfo) => {
  await openWorkspaceShell(page);
  await page.getByRole("button", { name: "模板设计", exact: true }).click();
  await page.getByRole("button", { name: "新建模板", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  await inspector.getByRole("textbox", { name: "模板名称", exact: true }).fill("Z4 内部交互验收");
  await openTemplateInspectorPanel(page, "规则");
  await expect(inspector.getByRole("textbox", { name: "模板名称", exact: true })).toBeVisible();
  const add = await openTemplateStructureAddPanel(page);
  await add.panel.getByRole("button", { name: "图片槽位 内容槽位" }).click();
  await openTemplateInspectorPanel(page, "布局");
  await inspector.getByRole("button", { name: "宽度策略：自定" }).click();
  await inspector.getByRole("spinbutton", { name: "自定义宽度" }).fill("62");
  const before = await readZ4Session(page);
  await inspector.getByRole("tab", { name: "显示样式", exact: true }).press("ArrowRight");
  await expect(inspector.getByRole("tab", { name: "页面可编辑", exact: true })).toBeFocused();
  await expect(inspector.getByRole("region", { name: "使用规则摘要" })).toContainText("结构未锁定");
  await expect(inspector.getByRole("tab", { name: "显示样式", exact: true })).toContainText(/[1-9]\d* 项修改/);
  await openTemplateInspectorPanel(page, "布局");
  await expect(inspector.getByRole("spinbutton", { name: "自定义宽度" })).toHaveValue("62");
  expect(await readZ4Session(page)).toEqual(before);
  await inspector.getByRole("button", { name: "复制当前画布到另一画布", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("当前值");
  await expect(dialog).toContainText("替换后");
  await expect(dialog).toContainText("62%");
  await dialog.getByRole("button", { name: /^取\s*消$/ }).click();
  expect(await readZ4Session(page)).toEqual(before);
  await inspector.getByRole("button", { name: "复制当前画布到另一画布", exact: true }).click();
  await dialog.getByRole("button", { name: "确认替换", exact: true }).click();
  const copied = await readZ4Session(page);
  expect(copied.past).toBe(before.past + 1);
  expect(copied.definition.nodes[before.selected].responsive.mobile).toEqual(copied.definition.nodes[before.selected].responsive.desktop);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await readZ4Session(page)).definition).toEqual(before.definition);
  const previewBefore = await readZ4Session(page);
  await page.getByRole("button", { name: "预览模板", exact: true }).click();
  for (const scenario of ["default", "empty", "long-text", "missing-image"]) {
    await page.getByRole("combobox", { name: "预览内容场景" }).selectOption(scenario);
    await expect(page.frameLocator(".template-editor__viewport-frame").locator("[data-preview-scenario]")).toHaveAttribute("data-preview-scenario", scenario);
  }
  await page.getByRole("button", { name: /移动端模板布局/ }).click();
  expect(await readZ4Session(page)).toEqual(previewBefore);
  await page.screenshot({ path: testInfo.outputPath("z4-02-inspector-preview.png") });
});

test("模板设计仅由顶部入口切换设备上下文（Mock）", async ({ page }, testInfo) => {
  await openWorkspaceShell(page);
  await openTemplateFromCatalog(page, "首屏");

  const toolbar = page.locator(".template-editor__toolbar");
  const desktopEntry = toolbar.getByRole("button", { name: /桌面端模板布局/ });
  const mobileEntry = toolbar.getByRole("button", { name: /移动端模板布局/ });
  const structure = page.getByRole("complementary", { name: "模板结构" });
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  const sizeTrigger = page.getByRole("button", { name: /^模板尺寸：/ });

  await expect(desktopEntry).toHaveCount(1);
  await expect(mobileEntry).toHaveCount(1);
  await expect(desktopEntry).toHaveAttribute("aria-pressed", "true");
  await expect(structure.getByRole("button", { name: /选择(?:桌面|移动)端槽位/ })).toHaveCount(0);
  await expect(inspector.locator(".homepage-editor__inspector-device")).toHaveCount(0);
  await expect(sizeTrigger).not.toContainText(/桌面端|移动端/);
  await page.screenshot({ path: testInfo.outputPath("device-entry-desktop.png"), animations: "disabled" });

  await mobileEntry.click();
  await expect(mobileEntry).toHaveAttribute("aria-pressed", "true");
  await expect(inspector).toHaveAttribute("data-template-inspector-device", "mobile");
  await expect(page.frameLocator(".template-editor__viewport-frame").locator("[data-dynamic-template-device]"))
    .toHaveAttribute("data-dynamic-template-device", "mobile");
  await expect(structure.getByRole("button", { name: /选择(?:桌面|移动)端槽位/ })).toHaveCount(0);
  await expect(inspector.locator(".homepage-editor__inspector-device")).toHaveCount(0);
  await expect(sizeTrigger).not.toContainText(/桌面端|移动端/);
  await page.screenshot({ path: testInfo.outputPath("device-entry-mobile.png"), animations: "disabled" });
});

test("Z4-02 合同角色恢复默认构图只清除当前设备矩形和层级（Mock）", async ({ page }) => {
  const { structure, inspector, overlay } = await openHeroDefinitionWorkspace(page);
  await selectHeroRole(structure, overlay, /标题与描述文字/, "copy");
  await setSelectedRoleGeometry(inspector, { 宽度: 40, 高度: 30 });
  await inspector.getByRole("button", { name: "复制到另一画布", exact: true }).click();
  const before = await readZ4Session(page);
  const roleBefore = before.definition.nodes[before.selected].props.contentTemplateLayoutData.nodes.copy;
  await inspector.getByRole("button", { name: "恢复默认构图", exact: true }).click();
  const after = await readZ4Session(page);
  const roleAfter = after.definition.nodes[after.selected].props.contentTemplateLayoutData.nodes.copy;
  expect(roleAfter.rectByViewport?.desktop).toBeUndefined();
  expect(roleAfter.zIndexByViewport?.desktop).toBeUndefined();
  expect(roleAfter.rectByViewport?.mobile).toEqual(roleBefore.rectByViewport.mobile);
  expect(after.past).toBe(before.past + 1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await readZ4Session(page)).definition).toEqual(before.definition);
});

test("Z4-02 成对合同角色复制到另一画布会写入对应角色（Mock）", async ({ page }) => {
  const { structure, inspector, overlay } = await openHeroDefinitionWorkspace(page);
  await selectHeroRole(structure, overlay, /主视觉图片/, "desktopImage");
  await setSelectedRoleGeometry(inspector, { 宽度: 70, 高度: 70 });
  await inspector.getByRole("button", { name: "复制到另一画布", exact: true }).click();

  let session = await readZ4Session(page);
  let nodes = session.definition.nodes[session.selected].props.contentTemplateLayoutData.nodes;
  expect(nodes.mobileImage.rectByViewport.mobile).toEqual(nodes.desktopImage.rectByViewport.desktop);
  expect(nodes.desktopImage.rectByViewport.mobile).toBeUndefined();

  await page.getByRole("button", { name: /移动端模板布局/ }).click();
  await expect(overlay.locator('[data-overlay-selection-for$=":mobileImage"]')).toBeVisible();
  await expect(inspector.getByRole("spinbutton", { name: "宽度", exact: true })).toHaveValue("70");
  await setSelectedRoleGeometry(inspector, { 横向位置: 10, 宽度: 60 });
  await inspector.getByRole("button", { name: "复制到另一画布", exact: true }).click();

  session = await readZ4Session(page);
  nodes = session.definition.nodes[session.selected].props.contentTemplateLayoutData.nodes;
  expect(nodes.desktopImage.rectByViewport.desktop).toEqual(nodes.mobileImage.rectByViewport.mobile);
  expect(nodes.mobileImage.rectByViewport.desktop).toBeUndefined();
});

test("Z4-02 分组修改提示按节点名称、布局与规则独立对照保存基线", () => {
  const root = createBlankDynamicTemplateDefinition("分组计数");
  const region = addDynamicTemplateNode(root, root.rootNodeId, "Container");
  const image = addDynamicTemplateNode(region.definition, region.nodeId, "ImageSlot");
  const baseline = image.definition;
  const next = structuredClone(baseline);
  next.nodes[image.nodeId].name = "新的对象名称";
  next.nodes[image.nodeId].responsive.desktop.width = { value: 62, unit: "%" };
  next.nodes[image.nodeId].authoring = { structureLocked: true };
  const summary = getTemplateInspectorGroupSummary(next, baseline, { scope: "slot", node: next.nodes[image.nodeId], slot: next.slots[image.slotId!] }, []);
  expect(summary).toEqual({ definition: { changed: 1, errors: 0 }, layout: { changed: 1, errors: 0 }, rules: { changed: 1, errors: 0 } });
});

test("Z4-02 目录初始空态与加载失败分别显示且无重复空态（Mock）", async ({ page }) => {
  await openWorkspaceShell(page);
  await page.route("**/api/page-modules/dynamic-templates/catalog**", (route) => route.fulfill({ json: { code: 200, data: [] } }));
  await page.evaluate(() => window.dispatchEvent(new Event("haichuan:dynamic-template-server-changed")));
  const library = page.getByRole("complementary", { name: "模板组件库" });
  await expect(library).toContainText("模板库中还没有模板");
  await expect(library.getByRole("alert")).toHaveCount(0);
  await page.route("**/api/page-modules/dynamic-templates/catalog**", (route) => route.fulfill({ status: 503, json: { message: "目录暂不可用" } }));
  await page.evaluate(() => window.dispatchEvent(new Event("haichuan:dynamic-template-server-changed")));
  await expect(library.getByRole("alert")).toBeVisible();
  await expect(library.getByText("模板库中还没有模板。", { exact: true })).toHaveCount(0);
  await expect(library.getByRole("button", { name: "重新读取", exact: true })).toBeVisible();
});

test("模板目录发布状态只由记录、草稿 checksum 与当前正式版本 checksum 派生", () => {
  const facts = {
    status: "ACTIVE" as const,
    publishedVersion: 0,
    draftDefinitionChecksum: "draft-a",
    publishedDefinitionChecksum: null,
  };
  expect(resolveTemplatePublicationStatus(facts)).toBe("draft");
  expect(resolveTemplatePublicationStatus({
    ...facts,
    publishedVersion: 3,
    publishedDefinitionChecksum: "draft-a",
  })).toBe("published-current");
  const modified = resolveTemplatePublicationStatus({
    ...facts,
    publishedVersion: 3,
    publishedDefinitionChecksum: "published-a",
  });
  expect(modified).toBe("published-with-unpublished-changes");
  expect(matchesTemplatePublicationFilter(modified, "published")).toBe(true);
  expect(matchesTemplatePublicationFilter(modified, "draft")).toBe(false);
  expect(resolveTemplatePublicationStatus({ ...facts, status: "ARCHIVED" }))
    .toBe("archived");
  expect(resolveTemplatePublicationStatus({
    ...facts,
    publishedVersion: 3,
    publishedDefinitionChecksum: null,
  })).toBeNull();
});

async function openPublishIssuesFixture(page: Page, width = 1600) {
  const shell = await openWorkspaceShell(page);
  await page.getByRole("button", { name: "模板设计", exact: true }).click();
  await page.getByRole("button", { name: "新建模板", exact: true }).click();
  let definition = createBlankDynamicTemplateDefinition("发布检查闭环");
  const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
  const image = addDynamicTemplateNode(region.definition, region.nodeId, "ImageSlot");
  const heading = addDynamicTemplateNode(image.definition, region.nodeId, "HeadingSlot");
  definition = heading.definition;
  for (const nodeId of [image.nodeId, heading.nodeId]) {
    const slot = definition.slots[definition.nodes[nodeId].slotId!];
    slot.required = true;
    slot.editable = true;
    slot.hideable = false;
  }
  definition.nodes[image.nodeId].responsive.mobile.display = "none";
  definition.slots[definition.nodes[heading.nodeId].slotId!].hideable = true;
  expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);
  expect(validateDynamicTemplatePublishDefinition(definition).issues.filter((issue) => issue.level === "error")).toHaveLength(2);
  await page.evaluate(async (next) => {
    const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
    store.getState().executeCommand({ type: "replace-definition", label: "双发布阻断夹具", definition: next });
  }, definition);
  await page.setViewportSize({ width, height: 1000 });
  return { ...shell, definition, regionId: region.nodeId, imageId: image.nodeId, headingId: heading.nodeId };
}

test("T4-B2 校验定位只提示顶部设备入口，不自动切换画布（自有 API 夹具）", async ({ page }) => {
  const { imageId } = await openPublishIssuesFixture(page, 1600);
  await page.getByRole("button", { name: /^发布模板新版本/ }).click();
  const checks = page.getByRole("region", { name: "本次发布检查" });
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  const toolbar = page.locator(".template-editor__toolbar");
  const desktopEntry = toolbar.getByRole("button", { name: /桌面端模板布局/ });
  const mobileEntry = toolbar.getByRole("button", { name: /移动端模板布局/ });
  const mobileIssue = checks.locator('[data-template-issue-device="mobile"]');

  await expect(desktopEntry).toHaveAttribute("aria-pressed", "true");
  await mobileIssue.getByRole("button", { name: "定位", exact: true }).click();
  await expect(inspector).toHaveAttribute("data-template-inspector-object-id", imageId);
  await expect(inspector).toHaveAttribute("data-template-inspector-device", "desktop");
  await expect(desktopEntry).toHaveAttribute("aria-pressed", "true");
  await expect(inspector.getByText("此问题位于另一画布，请通过顶部设备入口切换后再次定位。", { exact: true })).toBeVisible();

  await mobileEntry.click();
  await mobileIssue.getByRole("button", { name: "定位", exact: true }).click();
  await expect(mobileEntry).toHaveAttribute("aria-pressed", "true");
  const displayTarget = inspector.locator('[data-template-inspector-field="responsive.*.display"]');
  await expect(displayTarget).toHaveAttribute("data-template-inspector-located", "true");
  await expect(displayTarget.locator("button:not(:disabled)").first()).toBeFocused();
});

for (const width of [1600, 1024, 390]) test(`T4-B2 ${width}px 多发布阻断持续处理并显式重试（Mock）`, async ({ page }, testInfo) => {
  const { dynamic, forbiddenPageWrites, imageId, headingId } = await openPublishIssuesFixture(page, width);
  await page.getByRole("button", { name: /^发布模板新版本/ }).click();
  const publishWrites = () => dynamic.writes.filter((write) => write.pathname.endsWith("/publish"));
  const checks = page.getByRole("region", { name: "本次发布检查" });
  await expect(checks).toBeVisible();
  await expect(checks).toBeFocused();
  await expect(checks).toContainText("2 项错误");
  expect(publishWrites()).toHaveLength(0);
  expect(dynamic.writes).toHaveLength(0);
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  const toolbar = page.locator(".template-editor__toolbar");
  const desktopEntry = toolbar.getByRole("button", { name: /桌面端模板布局/ });
  const mobileEntry = toolbar.getByRole("button", { name: /移动端模板布局/ });
  const mobileIssue = checks.locator('[data-template-issue-device="mobile"]');
  const headingIssue = checks.locator('[data-template-issue-field="slot.hideable"]');
  await expect(desktopEntry).toHaveAttribute("aria-pressed", "true");
  await mobileIssue.getByRole("button", { name: "定位", exact: true }).click();
  await expect(inspector).toHaveAttribute("data-template-inspector-object-id", imageId);
  await expect(inspector).toHaveAttribute("data-template-inspector-device", "desktop");
  await expect(desktopEntry).toHaveAttribute("aria-pressed", "true");
  await expect(inspector.getByText("此问题位于另一画布，请通过顶部设备入口切换后再次定位。", { exact: true })).toBeVisible();
  await mobileEntry.click();
  await mobileIssue.getByRole("button", { name: "定位", exact: true }).click();
  await expect(inspector).toHaveAttribute("data-template-inspector-device", "mobile");
  const displayTarget = inspector.locator('[data-template-inspector-field="responsive.*.display"]');
  await expect(displayTarget).toHaveAttribute("data-template-inspector-located", "true");
  await expect(displayTarget.locator("input,button,select,textarea,[tabindex]").first()).toBeFocused();
  await expect(checks).toContainText("2 项错误");
  await checks.getByRole("button", { name: "下一个问题" }).focus();
  await page.keyboard.press("Enter");
  await expect(inspector).toHaveAttribute("data-template-inspector-object-id", headingId);
  await expect(inspector.getByRole("switch", { name: "页面可隐藏" })).toBeFocused();
  await expect(checks).toContainText("当前 2 / 2");
  await checks.getByRole("button", { name: "上一个问题" }).click();
  await expect(displayTarget.locator("input,button,select,textarea,[tabindex]").first()).toBeFocused();
  // 收放后通过稳定入口恢复完整工作流；普通设备切换不会清理结果。
  await page.getByRole("button", { name: "收起模板属性面板" }).click();
  const entry = page.getByRole("button", { name: /点击查看详情/ });
  await expect(entry).toBeVisible();
  await page.getByRole("button", { name: /^桌面端模板布局/ }).click();
  await entry.focus();
  await page.keyboard.press("Enter");
  await expect(checks).toContainText("2 项错误");
  await expect(checks).toBeFocused();
  if (width <= 1024) {
    await page.keyboard.press("Escape");
    await expect(entry).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(checks).toBeFocused();
  }
  await page.screenshot({ path: testInfo.outputPath(`publish-issues-${width}.png`), fullPage: true });
  await mobileIssue.getByRole("button", { name: "安全修复并重验" }).click();
  await expect(mobileIssue).toHaveCount(0);
  await expect(checks).toContainText("1 项错误");
  await expect(checks).toContainText("当前 1 / 1");
  await expect(inspector).toHaveAttribute("data-template-inspector-object-id", headingId);
  await headingIssue.getByRole("button", { name: "定位", exact: true }).click();
  const hideable = inspector.getByRole("switch", { name: "页面可隐藏" });
  await expect(hideable).toBeFocused();
  await page.keyboard.press("Space");
  await expect(checks).toContainText("已满足发布门禁");
  await expect(checks).toContainText("请再次点击发布");
  await expect(checks.locator("[data-template-issue-object]")).toHaveCount(0);
  expect(publishWrites()).toHaveLength(0);
  expect(dynamic.writes).toHaveLength(0);
  await page.getByRole("button", { name: "收起模板属性面板" }).click();
  await page.getByRole("button", { name: /^发布模板新版本/ }).click();
  await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本", { exact: true })).toBeVisible();
  expect(publishWrites()).toHaveLength(1);
  expect(dynamic.versionsByTemplateId.get(dynamic.records[0].templateId)).toHaveLength(1);
  await expect(page.getByRole("button", { name: /点击查看详情/ })).toHaveCount(0);
  expect(forbiddenPageWrites).toEqual([]);
});

for (const width of [1024, 390]) test(`T4-B2 ${width}px 结构问题自动展开且不在属性模态区外滞留焦点（Mock）`, async ({ page }) => {
  const { dynamic } = await openWorkspaceShell(page);
  await page.getByRole("button", { name: "模板设计", exact: true }).click();
  await page.getByRole("button", { name: "新建模板", exact: true }).click();
  await page.setViewportSize({ width, height: 1000 });
  await page.getByRole("button", { name: /^发布模板新版本/ }).click();
  const checks = page.getByRole("region", { name: "本次发布检查" });
  await expect(checks).toContainText("2 项错误");
  await checks.locator('[data-template-issue-destination="structure-region"]').getByRole("button", { name: "定位" }).click();
  const regionTarget = page.getByRole("button", { name: "添加区域", exact: true });
  await expect(regionTarget).toBeFocused();
  await expect(page.getByRole("dialog", { name: "模板属性工作区" })).toHaveCount(0);
  await regionTarget.click();
  await page.getByRole("button", { name: /点击查看详情/ }).click();
  await checks.locator('[data-template-issue-destination="structure-slot"]').getByRole("button", { name: "定位" }).click();
  await expect(page.getByRole("region", { name: "常用内容槽位" })).toBeFocused();
  await page.getByRole("button", { name: "添加标题槽位", exact: true }).click();
  await page.getByRole("button", { name: /点击查看详情/ }).click();
  await expect(checks).toContainText("已满足发布门禁");
  expect(dynamic.writes.filter((write) => write.pathname.endsWith("/publish"))).toHaveLength(0);
});

test("T4-B2 发布尝试保留只读字段说明和不同对象的全部错误（Mock）", async ({ page }) => {
  const { dynamic, imageId } = await openPublishIssuesFixture(page);
  await page.evaluate(async (nodeId) => {
    const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
    const next = structuredClone(store.getState().draft.definition);
    next.description = "长".repeat(501);
    next.slots[next.nodes[nodeId].slotId].key = "";
    store.getState().executeCommand({ type: "replace-definition", label: "只读错误夹具", definition: next });
  }, imageId);
  await page.getByRole("button", { name: /^发布模板新版本/ }).click();
  const checks = page.getByRole("region", { name: "本次发布检查" });
  // 结构校验失败时发布校验会短路，尚不会追加发布专用的两项错误。
  await expect(checks).toContainText("2 项错误");
  await checks.locator('[data-template-issue-field="description"]').getByRole("button", { name: "定位" }).click();
  await expect(page.getByRole("textbox", { name: "模板说明" })).toBeFocused();
  await page.getByRole("textbox", { name: "模板说明" }).fill("已修复说明");
  await expect(checks).toContainText("1 项错误");
  await checks.locator('[data-template-issue-field="slot.key"]').getByRole("button", { name: "定位" }).click();
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  await expect(inspector).toHaveAttribute("data-template-inspector-object-id", imageId);
  await expect(inspector.locator('[data-template-inspector-field="slot.key"]')).toBeFocused();
  await expect(inspector.getByText("页面实例按稳定键关联内容，不能在 Inspector 中改名。")).toBeVisible();
  await expect(checks).toContainText("1 项错误");
  expect(dynamic.writes).toHaveLength(0);
});

test("T4-B2 提醒不阻止发布且显式关闭会话清理旧发布尝试（Mock）", async ({ page }) => {
  const { dynamic, imageId, headingId } = await openPublishIssuesFixture(page);
  const warningDefinition = await page.evaluate(async ({ imageId: image, headingId: heading }) => {
    const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
    const next = structuredClone(store.getState().draft.definition);
    next.nodes[image].responsive.mobile.display = "block";
    next.slots[next.nodes[heading].slotId].hideable = false;
    next.nodes[heading].responsive.desktop.columns = [1];
    store.getState().executeCommand({ type: "replace-definition", label: "仅提醒夹具", definition: next });
    return next;
  }, { imageId, headingId });
  const warningCheck = validateDynamicTemplatePublishDefinition(warningDefinition);
  expect(warningCheck.valid).toBe(true);
  expect(warningCheck.issues.some((issue) => issue.level === "warning")).toBe(true);
  await page.getByRole("button", { name: /^发布模板新版本/ }).click();
  await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本", { exact: true })).toBeVisible();
  expect(dynamic.writes.filter((write) => write.pathname.endsWith("/publish"))).toHaveLength(1);
  await page.getByRole("button", { name: "新建模板", exact: true }).click();
  await page.getByRole("button", { name: /^发布模板新版本/ }).click();
  await expect(page.getByRole("region", { name: "本次发布检查" })).toContainText("2 项错误");
  await openTemplateMoreMenu(page);
  await page.getByRole("menuitem", { name: "关闭模板会话" }).click();
  await page.getByRole("dialog", { name: /关闭“未命名模板”的模板编辑会话/ })
    .getByRole("button", { name: "不保存并关闭" }).click();
  await expect(page.getByRole("button", { name: /点击查看详情/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "本次发布检查" })).toHaveCount(0);
});
test("T4-B2 重验按问题身份保留当前、下一项和前一项", () => {
  const issues = ["a", "b", "c", "d"].map((path) => ({ code: "BLOCK", path, message: path, level: "error" as const }));
  expect(reconcileTemplatePublishIssueIndex(issues, 1, issues.slice(2))).toBe(0);
  expect(reconcileTemplatePublishIssueIndex(issues, 2, [issues[1], issues[2], issues[3]])).toBe(1);
  expect(reconcileTemplatePublishIssueIndex(issues, 3, issues.slice(0, 2))).toBe(1);
  expect(reconcileTemplatePublishIssueIndex(issues, 2, [])).toBe(0);
});

test("T4-B2 一次清理多项后定位原列表下一项，修复其他项保留当前（Mock）", async ({ page }) => {
  const { dynamic, headingId, imageId } = await openPublishIssuesFixture(page);
  await page.evaluate(async (nodeId) => {
    const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
    const next = structuredClone(store.getState().draft.definition);
    const slotId = next.nodes[nodeId].slotId;
    next.defaultContent[slotId] = "历史标题";
    next.previewContent = { [slotId]: "历史预览" };
    store.getState().executeCommand({ type: "replace-definition", label: "多项清理夹具", definition: next });
  }, headingId);
  await page.getByRole("button", { name: /^发布模板新版本/ }).click();
  const checks = page.getByRole("region", { name: "本次发布检查" });
  await expect(checks).toContainText("4 项错误");
  const previewIssue = checks.locator('[data-template-issue-field="previewContent"]');
  await previewIssue.getByRole("button", { name: "定位", exact: true }).click();
  await expect(checks).toContainText("当前 2 / 4");
  await previewIssue.getByRole("button", { name: "安全修复并重验" }).click();
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  await expect(checks).toContainText("当前 1 / 2");
  await expect(inspector).toHaveAttribute("data-template-inspector-object-id", imageId);
  await expect(checks.locator('[aria-current="step"]')).toHaveAttribute("data-template-issue-device", "mobile");
  await checks.locator('[data-template-issue-field="slot.hideable"]').getByRole("button", { name: "安全修复并重验" }).click();
  await expect(checks).toContainText("当前 1 / 1");
  await expect(inspector).toHaveAttribute("data-template-inspector-object-id", imageId);
  expect(dynamic.writes).toHaveLength(0);
});

for (const width of [1600, 390]) test(`T4-B2 ${width}px 锁定问题提供可执行的解锁定位（Mock）`, async ({ page }) => {
  const { dynamic, imageId, regionId } = await openPublishIssuesFixture(page, width);
  const ownerId = width === 390 ? regionId : imageId;
  await page.evaluate(async ({ imageId: image, ownerId: owner }) => {
    const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
    const next = structuredClone(store.getState().draft.definition);
    next.nodes[image].hidden = true;
    next.nodes[image].responsive.mobile.display = "block";
    store.getState().executeCommand({ type: "replace-definition", label: "隐藏夹具", definition: next });
    const locked = structuredClone(store.getState().draft.definition);
    locked.nodes[owner].authoring = { structureLocked: true };
    store.getState().executeCommand({ type: "replace-definition", label: "锁定夹具", definition: locked });
  }, { imageId, ownerId });
  await page.getByRole("button", { name: /^发布模板新版本/ }).click();
  const checks = page.getByRole("region", { name: "本次发布检查" });
  const issue = checks.locator('[data-template-issue-field="hidden"]');
  await issue.getByRole("button", { name: "定位", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  await expect(inspector).toHaveAttribute("data-template-inspector-object-id", imageId);
  await expect(inspector.getByRole("switch", { name: "模板中隐藏节点" })).toBeDisabled();
  await expect(inspector.getByText(/的结构已锁定，请先定位并关闭/)).toBeVisible();
  await inspector.getByRole("button", { name: "定位解锁设置" }).click();
  await expect(inspector).toHaveAttribute("data-template-inspector-object-id", ownerId);
  const unlock = inspector.getByRole("switch", { name: "锁定位置、尺寸和层级" });
  await expect(unlock).toBeFocused();
  await page.keyboard.press("Space");
  await expect(unlock).not.toBeChecked();
  await issue.getByRole("button", { name: "定位", exact: true }).click();
  await expect(inspector.getByRole("switch", { name: "模板中隐藏节点" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(issue).toHaveCount(0);
  await expect(checks).toContainText("1 项错误");
  expect(dynamic.writes).toHaveLength(0);
});

test("T4-B2 自定义宽度问题定位唯一数值字段并自动重验（Mock）", async ({ page }) => {
  const { dynamic, imageId } = await openPublishIssuesFixture(page);
  await page.evaluate(async (nodeId) => {
    const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
    const next = structuredClone(store.getState().draft.definition);
    next.nodes[nodeId].responsive.desktop.width = { value: -1, unit: "px" };
    store.getState().executeCommand({ type: "replace-definition", label: "非法宽度夹具", definition: next });
  }, imageId);
  await page.getByRole("button", { name: /^发布模板新版本/ }).click();
  const checks = page.getByRole("region", { name: "本次发布检查" });
  const issue = checks.locator('[data-template-issue-field="responsive.*.width"]');
  await issue.getByRole("button", { name: "定位", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  await expect(inspector.locator('[data-template-inspector-field="responsive.*.width"]')).toHaveCount(1);
  const field = inspector.getByRole("spinbutton", { name: "自定义宽度", exact: true });
  await expect(field).toBeFocused();
  await field.fill("100");
  await expect(issue).toHaveCount(0);
  await expect(checks).toContainText("2 项错误");
  expect(dynamic.writes).toHaveLength(0);
});

const templateEditorNodeViewportCount = CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.reduce(
  (total, entry) => total + entry.objects.reduce(
    (objectTotal, object) => objectTotal
      + object.nodeIds.length
        * (["desktop", "mobile"] as const).filter((viewport) =>
          object.viewports[viewport].applicable).length,
    0,
  ),
  0,
);
if (templateEditorAcceptanceCount !== 24 || templateEditorNodeViewportCount !== 164) {
  throw new Error(
    `模板对象双端矩阵应为 24/164，实际为 ${templateEditorAcceptanceCount}/${templateEditorNodeViewportCount}`,
  );
}
const literalActionRoleCases = CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.flatMap((entry) => {
  const action = entry.objects.find((object) => object.kind === "action" && object.roleId === "action");
  const contract = getContentTemplateContract(entry.moduleType);
  return action && contract ? [{ entry, action, contract }] : [];
});
if (literalActionRoleCases.length !== 10) {
  throw new Error(`字面 action 角色合同应为 10 个，实际为 ${literalActionRoleCases.length}`);
}

const ALL_TEMPLATE_EDITOR_PAGE_GROUPS = (() => {
  const assigned = new Set<string>();
  const groups = (["products", "custom", "about"] as const).map((pageKey) => {
    const allowed = new Set(getContentTemplatePageRule(pageKey)?.allowedTemplateKeys ?? []);
    const entries = CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.filter((entry) =>
      allowed.has(entry.templateKey) && !assigned.has(entry.templateKey));
    entries.forEach((entry) => assigned.add(entry.templateKey));
    return { pageKey, entries };
  }).filter((group) => group.entries.length > 0);
  if (assigned.size !== CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.length) {
    throw new Error(`属性面板验收页面未覆盖全部模板：${assigned.size}/${CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.length}`);
  }
  return groups;
})();

const CONTENT_GROUP_ORDER_BY_PRIMARY: Record<string, readonly string[]> = {
  media: ["media", "content", "product", "link", "feature"],
  product: ["product", "media", "content", "link", "feature"],
  category: ["product", "media", "content", "link", "feature"],
  structured: ["feature", "content", "media", "link", "product"],
  text: ["content", "media", "link", "feature", "product"],
  action: ["link", "content", "media", "feature", "product"],
};

function getRenderedInspectorFieldKey(objectKind: string, fieldKey: string) {
  if (objectKind !== "action") return fieldKey;
  if (["productCode", "productId", "categorySlug", "linkUrl"].includes(fieldKey)) {
    return "targetType";
  }
  if ([
    "secondaryProductCode",
    "secondaryProductId",
    "secondaryCategorySlug",
    "secondaryLinkUrl",
  ].includes(fieldKey)) {
    return "secondaryLinkTarget";
  }
  if (fieldKey === "secondaryTargetType") return "secondaryLinkTarget";
  return fieldKey;
}

function getSemanticContentGroup(group: string | null) {
  if (group === "mainImage" || group === "detailImage") return "media";
  if (group === "copy") return "content";
  if (group === "action") return "link";
  return group;
}

type ContentTemplateEditorAcceptanceEntry =
  (typeof CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX)[number];

async function expectContinuousContentInspector({
  inspector,
  entry,
  viewport,
}: {
  inspector: Locator;
  entry: ContentTemplateEditorAcceptanceEntry;
  viewport: "desktop" | "mobile";
}) {
  await expect(
    inspector.getByRole("combobox", { name: "选择编辑对象" }),
    `${entry.templateKey} 内容模式不应再显示对象下拉`,
  ).toHaveCount(0);
  await expect(inspector.getByRole("region", { name: "当前编辑对象" })).toContainText("全部内容");

  const applicableObjects = entry.objects.filter((object) =>
    object.viewports[viewport].applicable,
  );
  const renderedFieldKeys = await inspector.locator("[data-inspector-field]").evaluateAll((fields) =>
    fields.map((field) => field.getAttribute("data-inspector-field")).filter(Boolean),
  );
  const duplicateFieldKeys = renderedFieldKeys.filter((fieldKey, index) =>
    fieldKey && renderedFieldKeys.indexOf(fieldKey) !== index,
  );
  expect(duplicateFieldKeys, `${entry.templateKey}.${viewport} 出现重复内容控件`).toEqual([]);
  for (const object of applicableObjects) {
    const objectFieldKeys = object.contentFieldKeys.map((fieldKey) =>
      getRenderedInspectorFieldKey(object.kind, fieldKey),
    );
    expect(
      objectFieldKeys.some((fieldKey) => renderedFieldKeys.includes(fieldKey)),
      `${entry.templateKey}.${viewport}.${object.roleId} 没有连续显示合同映射的内容控件`,
    ).toBe(true);
  }

  const primaryTask = getContentTemplateContract(entry.moduleType)!.editorCapabilities.primaryTask;
  const expectedGroupOrder = CONTENT_GROUP_ORDER_BY_PRIMARY[primaryTask];
  if (!expectedGroupOrder) {
    throw new Error(`${entry.templateKey} 缺少 primaryTask=${primaryTask} 的任务顺序`);
  }
  const semanticGroups = (await inspector.locator(".homepage-editor__task-group").evaluateAll((groups) =>
    groups.map((group) => group.getAttribute("data-task-group")),
  )).map(getSemanticContentGroup).filter((group): group is string => Boolean(group));
  const distinctSemanticGroups = semanticGroups.filter((group, index) =>
    semanticGroups.indexOf(group) === index,
  );
  expect(
    distinctSemanticGroups,
    `${entry.templateKey}.${viewport} 内容任务顺序与 primaryTask=${primaryTask} 不一致`,
  ).toEqual(expectedGroupOrder.filter((group) => distinctSemanticGroups.includes(group)));

  if (entry.templateKey === "doublePoster") {
    for (const fieldKey of [
      "mainImage",
      "mainAltText",
      "detailImage",
      "detailAltText",
      "title",
      "description",
      "number",
      "label",
      "actionText",
      "targetType",
    ]) {
      await expect(inspector.locator(`[data-inspector-field="${fieldKey}"]`)).toHaveCount(1);
    }
  }
}

const LEGACY_SYSTEM_SOURCE_REFERENCES = new Set(
  CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.map((entry) => `legacy_system_${entry.templateKey}`),
);

const appMode = process.env.PLAYWRIGHT_APP_MODE === "mock" ? "mock" : "development";

type TemplateDragEvent = { trusted: boolean; types: string[] };
type DragObserverWindow = Window & { __templateDragEvents?: TemplateDragEvent[] };

async function observeTrustedTemplateDrags(page: Page) {
  await page.evaluate(() => {
    const observedWindow = window as DragObserverWindow;
    observedWindow.__templateDragEvents = [];
    // 在 React 根之后只读观察真实拖拽，不合成事件或改写 DataTransfer。
    document.addEventListener("dragstart", (event) => {
      observedWindow.__templateDragEvents!.push({
        trusted: event.isTrusted,
        types: [...(event.dataTransfer?.types ?? [])],
      });
    });
  });
}

async function readTemplateDrags(page: Page) {
  return page.evaluate(() => (window as DragObserverWindow).__templateDragEvents);
}

async function dragTemplateCard(page: Page, card: Locator, canvas: Locator) {
  await card.scrollIntoViewIfNeeded();
  await card.hover();
  const [source, target] = await Promise.all([card.boundingBox(), canvas.boundingBox()]);
  if (!source || !target) throw new Error("模板卡或画布缺少拖拽尺寸");
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  if (await card.getAttribute("draggable") === "true") {
    await expect(canvas).toHaveClass(/is-dragging/);
  }
  await page.mouse.up();
}

async function clickDisabledTemplateCard(page: Page, card: Locator) {
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  if (!box) throw new Error("禁用模板卡缺少可点击尺寸");
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await expect.poll(() => card.evaluate((element, position) =>
    element.contains(document.elementFromPoint(position.x, position.y)), point)).toBe(true);
  // locator.click 会等待 aria-disabled 消失；真实鼠标用于验证禁用状态的命中行为。
  await page.mouse.click(point.x, point.y);
}

const fixtureSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
    <rect width="1600" height="900" fill="#d8d6d0"/>
    <circle cx="1120" cy="360" r="230" fill="#f7f5ef"/>
  </svg>
`;

function json(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data, message: "success" }),
  };
}

function isForbiddenEditorWrite(method: string, url: string) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method) &&
    /\/page-modules\/document(?:\/publish|\/draft)?$/.test(new URL(url).pathname);
}

function makeEmptyDraft() {
  return {
    id: 9601,
    pageKey: "home",
    puckData: { content: [], zones: {}, root: { props: {} } },
    metadata: {},
    editorVersion: "0.22.4",
    status: "DRAFT",
    version: 0,
    publishedAt: null,
    publishedBy: null,
    updatedAt: "2026-08-23T00:00:00.000Z",
  };
}

function makeHeroDraft() {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9602,
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "首屏主视觉",
          props: {
            id: "template-editor-history-hero",
            desktopImage: "/svg/template-hero.svg",
            mobileImage: "/svg/template-hero.svg",
            eyebrow: "",
            title: "",
            subtitle: "",
            actionText: "",
            targetType: "none",
          },
        },
      ],
    },
  };
}

function makeLegacyHeroOverrideDraft() {
  const draft = makeHeroDraft();
  const props = draft.puckData.content[0].props as Record<string, any>;
  props.__contentTemplate = { key: "hero", version: 2 };
  props.__instanceOverrides = {
    version: 2,
    nodes: {
      title: {
        rectByViewport: {
          desktop: { x: 0.12, y: 0.5, width: 0.6, height: 0.12 },
          mobile: { x: 0.2, y: 0.62, width: 0.6, height: 0.12 },
        },
      },
      mobileImage: {
        rectByViewport: {
          mobile: { x: 0, y: 0, width: 0.94, height: 1 },
        },
      },
    },
  };
  return draft;
}

function makeSinglePosterDraft({ emptyCopy = false }: { emptyCopy?: boolean } = {}) {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9604,
    pageKey: "products",
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "单图海报",
          props: {
            id: emptyCopy
              ? "template-editor-single-poster-empty-copy"
              : "template-editor-single-poster-copy",
            desktopImage: "/svg/template-hero.svg",
            mobileImage: "/svg/template-hero.svg",
            number: emptyCopy ? "" : "01",
            label: emptyCopy ? "" : "EDITORIAL",
            title: emptyCopy ? "" : "单图文布局标题",
            subtitle: emptyCopy ? "" : "验证完整编辑器中的文案区域拖动。",
            actionText: "",
            targetType: "none",
          },
        },
      ],
    },
  };
}

function makeFullBleedDraft() {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9605,
    pageKey: "products",
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "全屏出血图",
          props: {
            id: "template-editor-full-bleed-copy",
            image: "/svg/template-hero.svg",
            mobileImage: "/svg/template-hero.svg",
            eyebrow: "EDITORIAL",
            title: "通栏图下方说明",
            subtitle: "验证真实编辑器中的说明带首次微调。",
            buttonText: "",
            targetType: "none",
            altText: "通栏珠宝图片",
          },
        },
      ],
    },
  };
}

function makeDoublePosterDraft() {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9606,
    pageKey: "products",
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "双图海报",
          props: {
            id: "template-editor-double-poster-copy",
            number: "02",
            label: "EDITORIAL",
            title: "双图海报说明",
            description: "验证主图、说明与细节图固定骨架中的首次微调。",
            mainImage: "/svg/template-hero.svg",
            detailImage: "/svg/template-hero.svg",
            actionText: "",
            targetType: "none",
            mainAltText: "双图海报主图",
            detailAltText: "双图海报细节图",
          },
        },
      ],
    },
  };
}

function makeLimitedEventDraft() {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9607,
    pageKey: "products",
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "限时活动",
          props: {
            id: "template-editor-limited-event-copy",
            eventImage: "/svg/template-hero.svg",
            eyebrow: "CAMPAIGN",
            title: "限时活动说明",
            body: "验证活动视觉、倒计时与说明区域中的首次微调。",
            targetDate: "2030-12-31T23:59:59.000Z",
            benefits: [{ value: "预约优先" }],
            buttonText: "",
            linkUrl: "",
            bgColor: "#FFFFFF",
          },
        },
      ],
    },
  };
}

function makeHeroMovementDraft() {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9608,
    pageKey: "products",
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "首屏主视觉",
          props: {
            id: "template-editor-hero-movement",
            desktopImage: "/svg/template-hero.svg",
            mobileImage: "/svg/template-hero.svg",
            altText: "首屏珠宝主视觉",
            eyebrow: "THE HOUSE",
            title: "首屏叙事标题",
            subtitle: "验证桌面安全区与移动堆叠阅读顺序。",
            actionText: "探索作品",
            targetType: "page",
            linkUrl: "/products",
          },
        },
      ],
    },
  };
}

function makeTextBannerMovementDraft() {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9609,
    pageKey: "products",
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "文字横幅",
          props: {
            id: "template-editor-text-banner-movement",
            eyebrow: "EDITORIAL",
            title: "留白中的章节声明",
            body: "验证纯文字模板只使用受控对齐和留白预设。",
            buttonText: "了解更多",
            targetType: "page",
            linkUrl: "/about",
            template: "center",
            spacing: "normal",
          },
        },
      ],
    },
  };
}

function makeBookingMovementDraft() {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9610,
    pageKey: "products",
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "预约入口",
          props: {
            id: "template-editor-booking-movement",
            title: "预约鉴赏",
            subtitle: "由珠宝顾问安排一对一服务。",
            buttonText: "立即预约",
            targetType: "page",
            linkUrl: "/contact",
          },
        },
      ],
    },
  };
}

function makeCraftDetailsDraft() {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9603,
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "工艺细节",
          props: {
            id: "template-editor-craft-details",
            eyebrow: "CRAFT STUDY",
            title: "工艺细节闭环标题",
            body: "仅使用已核验的材质与制作说明。",
            leadImage: "/svg/template-hero.svg",
            leadAltText: "珠宝工艺主图",
            detailImageOne: "/svg/template-hero.svg",
            detailOneAltText: "珠宝材质细节一",
            detailImageTwo: "/svg/template-hero.svg",
            detailTwoAltText: "珠宝材质细节二",
            leadImageRatio: "3:2",
            detailOneRatio: "1:1",
            detailTwoRatio: "1:1",
            leadFocusX: 50,
            leadFocusY: 50,
            detailOneFocusX: 50,
            detailOneFocusY: 50,
            detailTwoFocusX: 50,
            detailTwoFocusY: 50,
            bgColor: "#FFFFFF",
          },
        },
      ],
    },
  };
}

function makeAllTemplateEditorDraft(
  entries = CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX,
  pageKey = "products",
) {
  const previewProduct = {
    id: 91001,
    code: "EDITOR-MATRIX",
    name: "页面模板验收作品",
    image: "/svg/template-hero.svg",
    price: 0,
    priceLabel: "",
    category: "",
    status: "PUBLISHED",
    visibility: "PUBLIC",
    eligible: true,
    reason: "AVAILABLE",
  };
  const broadProps = {
    eyebrow: "EDITOR MATRIX",
    title: "全模板属性面板验收",
    subtitle: "桌面与移动端使用同一合同驱动",
    body: "仅用于确定性编辑器验收。",
    actionText: "",
    buttonText: "",
    primaryText: "",
    secondaryText: "",
    targetType: "none",
    secondaryTargetType: "none",
    linkUrl: "",
    secondaryLinkUrl: "",
    productId: 0,
    secondaryProductId: 0,
    productCode: "",
    secondaryProductCode: "",
    categorySlug: "",
    secondaryCategorySlug: "",
    desktopImage: "/svg/template-hero.svg",
    mobileImage: "/svg/template-hero.svg",
    image: "/svg/template-hero.svg",
    mainImage: "/svg/template-hero.svg",
    detailImage: "/svg/template-hero.svg",
    leadImage: "/svg/template-hero.svg",
    detailImageOne: "/svg/template-hero.svg",
    detailImageTwo: "/svg/template-hero.svg",
    beforeImage: "/svg/template-hero.svg",
    afterImage: "/svg/template-hero.svg",
    backgroundImage: "/svg/template-hero.svg",
    bgImage: "/svg/template-hero.svg",
    eventImage: "/svg/template-hero.svg",
    posterUrl: "/svg/template-hero.svg",
    videoUrl: "",
    altText: "全模板验收替代文字",
    imageAlt: "全模板验收替代文字",
    mainAltText: "全模板验收主图替代文字",
    detailAltText: "全模板验收细节图替代文字",
    leadAltText: "全模板验收主图替代文字",
    detailOneAltText: "全模板验收细节一替代文字",
    detailTwoAltText: "全模板验收细节二替代文字",
    beforeAltText: "全模板验收改款前替代文字",
    afterAltText: "全模板验收改款后替代文字",
    items: [{
      image: "/svg/template-hero.svg",
      altText: "全模板验收画廊图",
      caption: "EDITOR MATRIX",
      link: "",
    }],
    images: [{ url: "/svg/template-hero.svg", alt: "全模板验收轮播图", link: "" }],
    cards: [{ icon: "", title: "验收信息", body: "确定性页面模板内容。" }],
    categories: [{
      name: "验收分类",
      description: "确定性页面模板内容。",
      image: "/svg/template-hero.svg",
      link: "/catalog",
      altText: "全模板验收分类图",
      focusX: 50,
      focusY: 50,
    }],
    steps: [{
      number: "01",
      en: "MATRIX",
      name: "验收步骤",
      desc: "确定性页面模板内容。",
      image: "",
    }],
    certificates: [{
      name: "验收资料",
      desc: "确定性页面模板内容。",
      imageUrl: "",
      verificationConfirmed: false,
    }],
    testimonials: [{
      name: "验收内容位置",
      meta: "确定性夹具",
      content: "全模板页面预览验收内容",
      image: "/svg/template-hero.svg",
      authorizationConfirmed: false,
    }],
    hotspots: [{ x: 50, y: 50, width: 10, height: 10, link: "/catalog", label: "验收热点" }],
    mobileHotspots: [{ x: 50, y: 50, width: 10, height: 10, link: "/catalog", label: "验收热点" }],
    productIds: [],
    productCodes: [],
    categorySlugs: [],
    benefits: [],
    targetDate: "2099-12-31T23:59:59.000Z",
    autoPlay: false,
    loop: false,
    muted: true,
    showControls: true,
    isVisible: true,
    __previewProduct: previewProduct,
    __previewProducts: [previewProduct],
  };
  return {
    ...makeEmptyDraft(),
    id: 9610,
    pageKey,
    puckData: {
      content: entries.map((entry) => ({
        type: entry.moduleType,
        props: {
          ...broadProps,
          id: `all-template-editor-${entry.templateKey}`,
        },
      })),
      zones: {},
      root: { props: {} },
    },
  };
}

async function authenticateAdmin(page: Page) {
  await installAdminSession(page, {
    username: "template-editor-ui-test",
    realName: "装修 UI 测试管理员",
  });
}

async function mockEditorApis(
  page: Page,
  draft: Record<string, any> = makeEmptyDraft(),
  forbiddenWrites: string[] = [],
  pageWrites?: Array<{
    method: string;
    pathname: string;
    body: Record<string, any>;
  }>,
) {
  let currentDraft = structuredClone(draft);
  let writeRevision = 0;
  await page.route("**/svg/template-hero.svg*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: fixtureSvg,
    }),
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = request.url();
    const pathname = new URL(url).pathname;
    if (pathname === "/api/auth/profile") return route.fallback();
    if (pathname === "/api/page-modules/dynamic-templates/catalog") {
      return route.fulfill(json({ items: [] }));
    }
    if (isForbiddenEditorWrite(request.method(), url) && pageWrites) {
      const body = (request.postDataJSON() ?? {}) as Record<string, any>;
      pageWrites.push({ method: request.method(), pathname, body });
      writeRevision += 1;
      const updatedAt = `2026-09-01T00:${String(writeRevision).padStart(2, "0")}:00.000Z`;
      if (pathname.endsWith("/publish")) {
        currentDraft = {
          ...currentDraft,
          status: "PUBLISHED",
          version: Math.max(1, Number(currentDraft.version) + 1),
          publishedAt: updatedAt,
          publishedBy: 1,
          updatedAt,
        };
      } else {
        currentDraft = {
          ...currentDraft,
          puckData: structuredClone(body.puckData ?? currentDraft.puckData),
          metadata: structuredClone(body.metadata ?? currentDraft.metadata ?? {}),
          editorVersion: body.editorVersion ?? currentDraft.editorVersion,
          status: "DRAFT",
          updatedAt,
        };
      }
      return route.fulfill(json(currentDraft));
    }
    if (isForbiddenEditorWrite(request.method(), url)) {
      forbiddenWrites.push(`${request.method()} ${pathname}`);
      return route.fulfill({ status: 409, contentType: "application/json", body: "{}" });
    }
    if (url.includes("/page-modules/document/validate")) {
      return route.fulfill(json({ valid: true, errors: [] }));
    }
    if (url.includes("/page-modules/document/revisions")) {
      return route.fulfill(json([]));
    }
    if (url.includes("/page-modules/document/published")) {
      return route.fulfill(json(null));
    }
    if (url.includes("/page-modules/document/admin")) {
      return route.fulfill(json(currentDraft));
    }
    return route.fulfill(json({}));
  });
}

async function setRangeValue(range: Locator, value: number) {
  if (await range.getAttribute("type") === "number") {
    await range.fill(String(value));
    await expect(range).toHaveValue(String(value));
    return;
  }
  let current = Number(await range.inputValue());
  const direction = value >= current ? 1 : -1;
  const key = direction > 0 ? "ArrowRight" : "ArrowLeft";
  while (current !== value) {
    const next = current + direction;
    await range.press(key);
    await expect(range).toHaveValue(String(next));
    current = next;
  }
  await expect(range).toHaveValue(String(value));
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshotPath, animations: "disabled" });
  await testInfo.attach(name, { path: screenshotPath, contentType: "image/png" });
}

async function pressWorkspaceHistory(page: Page, direction: "undo" | "redo") {
  const historyButton = page.getByRole("button", { name: direction === "undo" ? "撤销" : "重做" });
  await expect(historyButton).toBeEnabled();
  await historyButton.focus();
  await page.keyboard.press(direction === "undo" ? "Control+z" : "Control+Shift+z");
}

type PuckPerformanceWarning = {
  kind: "setData" | "set";
  text: string;
  location: { url: string; lineNumber: number; columnNumber: number };
};

function observePuckPerformanceWarnings(page: Page) {
  const warnings: PuckPerformanceWarning[] = [];
  page.on("console", (message) => {
    if (message.type() !== "warning") return;
    const text = message.text();
    if (!text.includes("expensive") || (!text.includes("`setData`") && !text.includes("`set`"))) {
      return;
    }
    warnings.push({
      kind: text.includes("`setData`") ? "setData" : "set",
      text,
      location: message.location(),
    });
  });

  return {
    drain() {
      const snapshot = warnings.splice(0, warnings.length);
      return snapshot;
    },
  };
}

function observeAntdStaticContextWarnings(page: Page) {
  const warnings: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes("Static function can not consume context")) warnings.push(text);
  });
  return warnings;
}

async function attachPuckWarningEvidence(
  testInfo: TestInfo,
  name: string,
  phases: Record<string, PuckPerformanceWarning[]>,
) {
  const summary = Object.fromEntries(
    Object.entries(phases).map(([phase, warnings]) => [
      phase,
      {
        setData: warnings.filter((warning) => warning.kind === "setData").length,
        set: warnings.filter((warning) => warning.kind === "set").length,
        warnings,
      },
    ]),
  );
  console.info(`[puck-performance] ${name} ${JSON.stringify(summary)}`);
  await testInfo.attach(`${name}.json`, {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json",
  });
  return summary;
}

async function expectInside(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
}

type BrowserBox = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

function expectBoxNear(actual: BrowserBox, expected: BrowserBox, precision = 0) {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
  expect(actual.width).toBeCloseTo(expected.width, precision);
  expect(actual.height).toBeCloseTo(expected.height, precision);
}

function maxBoxDelta(actual: BrowserBox, expected: BrowserBox) {
  return Math.max(
    Math.abs(actual.x - expected.x),
    Math.abs(actual.y - expected.y),
    Math.abs(actual.width - expected.width),
    Math.abs(actual.height - expected.height),
  );
}

async function dragOverlayControlBy(
  page: Page,
  control: Locator,
  deltaX: number,
  deltaY: number,
  release = true,
) {
  const box = await control.boundingBox();
  if (!box) throw new Error("宿主覆盖层控件没有可拖拽尺寸");
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const start = await control.evaluate((element, preferredPoint) => {
    const ownsHit = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return hit === element || (hit instanceof Node && element.contains(hit));
    };
    if (ownsHit(preferredPoint.x, preferredPoint.y)) return preferredPoint;
    const rect = element.getBoundingClientRect();
    for (let y = Math.ceil(rect.top) + 1; y < Math.floor(rect.bottom); y += 1) {
      for (let x = Math.ceil(rect.left) + 1; x < Math.floor(rect.right); x += 1) {
        if (ownsHit(x, y)) return { x, y };
      }
    }
    throw new Error("宿主覆盖层控件没有未被遮挡的 Pointer 命中点");
  }, center);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + deltaX, start.y + deltaY, { steps: 8 });
  if (release) await page.mouse.up();
  return start;
}

async function findMoveDeltaAwayFromSnapGuides(
  overlay: Locator,
  selection: Locator,
) {
  const overlayBox = await overlay.boundingBox();
  const selectionBox = await selection.boundingBox();
  const selectedTargetId = await selection.getAttribute("data-overlay-selection-for");
  if (!overlayBox || !selectionBox || !selectedTargetId) {
    throw new Error("无法计算无吸附点的宿主拖动位置");
  }
  const otherBoxes = await overlay.locator(".template-editor__editable-overlay-box").evaluateAll(
    (elements, currentTargetId) => elements.flatMap((element) => {
      if (element.getAttribute("data-editable-target-id") === currentTargetId) return [];
      const rect = element.getBoundingClientRect();
      return [{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }];
    }),
    selectedTargetId,
  );
  const xGuides = [
    overlayBox.x,
    overlayBox.x + overlayBox.width / 2,
    overlayBox.x + overlayBox.width,
    ...otherBoxes.flatMap((box) => [box.left, box.left + box.width / 2, box.left + box.width]),
  ];
  const yGuides = [
    overlayBox.y,
    overlayBox.y + overlayBox.height / 2,
    overlayBox.y + overlayBox.height,
    ...otherBoxes.flatMap((box) => [box.top, box.top + box.height / 2, box.top + box.height]),
  ];
  const clearsGuides = (anchors: number[], guides: number[]) =>
    anchors.every((anchor) => guides.every((guide) => Math.abs(anchor - guide) > 12));
  for (let y = overlayBox.y + 17; y + selectionBox.height < overlayBox.y + overlayBox.height - 17; y += 19) {
    for (let x = overlayBox.x + 17; x + selectionBox.width < overlayBox.x + overlayBox.width - 17; x += 23) {
      if (
        clearsGuides([x, x + selectionBox.width / 2, x + selectionBox.width], xGuides)
        && clearsGuides([y, y + selectionBox.height / 2, y + selectionBox.height], yGuides)
      ) {
        return { x: x - selectionBox.x, y: y - selectionBox.y };
      }
    }
  }
  throw new Error("当前宿主画布没有找到远离全部吸附点的可用位置");
}

async function openHeroDefinitionWorkspace(page: Page) {
  await openWorkspaceShell(page, {
    role: "SUPER_ADMIN",
    viewport: { width: 1600, height: 1000 },
  });
  await openTemplateFromCatalog(page, "首屏");
  const structure = page.getByRole("complementary", { name: "模板结构" });
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  const overlay = page.locator('[data-template-editor-overlay-root="template-definition"]');
  const frame = page.frameLocator(".template-editor__viewport-frame");
  await expect(overlay).toHaveCount(1);
  return { structure, inspector, overlay, frame };
}

async function selectHeroRole(
  structure: Locator,
  overlay: Locator,
  label: RegExp,
  roleId: string,
  visiblePointOnly = false,
) {
  const treeItem = structure.getByRole("treeitem", { name: label }).first();
  const hitTarget = overlay.locator(`[data-overlay-hit-for$=":${roleId}"]`);
  await expect(hitTarget).toBeVisible();
  if (visiblePointOnly) {
    const visiblePoint = await hitTarget.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const fractions = [0.15, 0.3, 0.5, 0.7, 0.85];
      for (const yFraction of fractions) {
        for (const xFraction of fractions) {
          const x = rect.left + rect.width * xFraction;
          const y = rect.top + rect.height * yFraction;
          if (document.elementFromPoint(x, y) === element) return { x, y };
        }
      }
      return null;
    });
    if (!visiblePoint) throw new Error(`${roleId} 的宿主命中区完全被其他目标遮挡`);
    await hitTarget.page().mouse.click(visiblePoint.x, visiblePoint.y);
  } else {
    await hitTarget.click();
  }
  await expect(treeItem).toHaveAttribute("aria-selected", "true");
  const selection = overlay.locator(`[data-overlay-selection-for$=":${roleId}"]`);
  await expect(selection).toBeVisible();
  return selection;
}

async function setSelectedRoleGeometry(
  inspector: Locator,
  geometry: Partial<Record<"横向位置" | "纵向位置" | "宽度" | "高度", number>>,
) {
  const tab = inspector.getByRole("tab", { name: "显示样式", exact: true });
  if (await tab.count()) await tab.click();
  const tabpanel = inspector.getByRole("tabpanel", { name: "显示样式" });
  const displayGroup = await tabpanel.count()
    ? tabpanel
    : inspector.getByRole("group", { name: "显示样式", exact: true });
  for (const [label, value] of Object.entries(geometry)) {
    const input = displayGroup.getByRole("spinbutton", { name: label, exact: true });
    await input.fill(String(value));
    await input.blur();
    await expect(input).toHaveValue(String(value));
  }
}

test.describe("模板内部编辑器（真实产品组件集成；不含后端持久化）", () => {
  let forbiddenWrites: string[];

  test.beforeEach(async ({ page }) => {
    forbiddenWrites = [];
    page.on("request", (request) => {
      if (isForbiddenEditorWrite(request.method(), request.url())) {
        forbiddenWrites.push(`${request.method()} ${new URL(request.url()).pathname}`);
      }
    });
  });

  test.afterEach(() => {
    expect(forbiddenWrites).toEqual([]);
  });

  test(`${templateEditorAcceptanceCount} 个模板的画布可编辑对象都有运营名称，不回退到内部 ID`, () => {
    const missingLabels = CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.flatMap((entry) => {
      const contract = getContentTemplateContract(entry.moduleType);
      if (!contract) return [`${entry.templateKey}:missing-contract`];
      return contract.editorCapabilities.editableObjects.flatMap((object) =>
        (object.nodeIds ?? [object.roleId])
          .filter((nodeId) => !TEMPLATE_CONTRACT_ROLE_LABELS[nodeId] && !TEMPLATE_CONTRACT_ROLE_LABELS[object.roleId])
          .map((nodeId) => `${entry.templateKey}:${nodeId}`),
      );
    });

    expect(missingLabels).toEqual([]);
  });

  test("图片与文字由宿主层直接选择，属性区随对象切换并写入构图", async ({ page }, testInfo) => {
    const { structure, inspector, overlay, frame } = await openHeroDefinitionWorkspace(page);
    const mediaSelection = await selectHeroRole(
      structure,
      overlay,
      /主视觉图片/,
      "desktopImage",
      true,
    );
    await expect(inspector.getByRole("region", { name: "模板属性功能区" })).toBeVisible();
    await openTemplateInspectorPanel(page, "布局");
    await expect(inspector.getByRole("tabpanel", { name: "显示样式" })).toBeVisible();
    const media = frame.locator('[data-content-role-desktop="desktopImage"]:visible').first();
    await setSelectedRoleGeometry(inspector, { 宽度: 70, 高度: 70 });
    const before = await media.boundingBox();
    if (!before) throw new Error("宿主主视觉选择层没有可验证尺寸");
    await setSelectedRoleGeometry(inspector, { 横向位置: 15 });
    await expect.poll(async () => (await media.boundingBox())?.x ?? 0).toBeGreaterThan(before.x + 1);
    await expect(mediaSelection.locator(".template-editor__editable-overlay-move")).toBeVisible();

    await selectHeroRole(structure, overlay, /标题与描述文字/, "copy");
    await expect(inspector).toContainText("文案");
    await expect(frame.locator([
      "[data-hc-node-hud]",
      "[data-hc-keyboard-node]",
      "[data-visual-selected-node]",
      "[data-visual-editor-mode]",
    ].join(","))).toHaveCount(0);
    await attachScreenshot(page, testInfo, "template-object-selection-and-media-focus");
  });

  test("宿主 move 真实拖动在固定画布中提交一次并可撤销", async ({ page }) => {
    const { structure, overlay, frame } = await openHeroDefinitionWorkspace(page);
    const selection = await selectHeroRole(structure, overlay, /行动入口/, "action");
    const root = frame.locator('[data-content-template-module="首屏主视觉"]').first();
    const copy = frame.locator('[data-content-role="action"]:visible').first();
    const rootBox = await root.boundingBox();
    const before = await copy.boundingBox();
    if (!rootBox || !before) throw new Error("宿主选择层或模板模块没有布局尺寸");
    const move = selection.locator(".template-editor__editable-overlay-move");
    const moveBox = await move.boundingBox();
    if (!moveBox) throw new Error("宿主移动控件没有可拖拽尺寸");
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
    await page.mouse.move(moveBox.x + moveBox.width / 2, moveBox.y + moveBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(moveBox.x + moveBox.width / 2 + 70, moveBox.y + moveBox.height / 2 + 35, {
      steps: 8,
    });
    const preview = await selection.boundingBox();
    if (!preview) throw new Error("pointerup 前宿主预览没有布局尺寸");
    expect(await copy.boundingBox()).toEqual(before);
    await page.mouse.up();
    const moved = await copy.boundingBox();
    if (!moved) throw new Error("写入后的标题与描述文字没有布局尺寸");
    const settledOverlay = await selection.boundingBox();
    if (!settledOverlay) throw new Error("pointerup 后宿主选区没有布局尺寸");
    await expectInside(rootBox, moved);
    expect(Math.abs(moved.x - before.x) + Math.abs(moved.y - before.y)).toBeGreaterThan(2);
    expect(moved.width).toBeCloseTo(before.width, 0);
    expect(moved.height).toBeCloseTo(before.height, 0);
    expectBoxNear(moved, preview);
    expectBoxNear(settledOverlay, preview);
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeEnabled();
    await pressWorkspaceHistory(page, "undo");
    await expect.poll(async () => await copy.boundingBox()).toEqual(before);
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
  });

  test("最小可见 action 的外置 move 命中区可真实 Pointer 拖动且不被 resize 手柄遮挡", async ({ page }) => {
    const { dynamic } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      viewport: { width: 1600, height: 1000 },
    });
    const heroContract = getContentTemplateContract("首屏主视觉");
    if (!heroContract) throw new Error("缺少首屏主视觉合同");
    await openTemplateFromCatalog(page, heroContract.displayName);
    const overlay = page.locator('[data-template-editor-overlay-root="template-definition"]');
    await overlay.locator('[data-overlay-hit-for$=":action"]').click();
    const selection = overlay.locator('[data-overlay-selection-for$=":action"]');
    const targetId = await selection.getAttribute("data-overlay-selection-for");
    const ownerNodeId = targetId?.match(/^role:(.+):action$/)?.[1];
    if (!ownerNodeId) throw new Error("最小 action 缺少所属定义节点");
    const readPersistedAction = async () => {
      if (appMode === "mock") {
        const save = page.getByRole("button").filter({ hasText: /^保存本机草稿$/ });
        await expect(save).toHaveCount(1);
        await save.click();
        const dialog = page.getByRole("dialog", { name: "保存本机测试草稿" });
        await dialog.getByRole("button", { name: "更新本机测试草稿" }).click();
        await expect(dialog).toBeHidden();
        await expect(page.getByText("已保存为本机测试草稿；未写入服务端模板").last()).toBeVisible();
        const action = await page.evaluate((nodeId) => {
          const stored = JSON.parse(
            window.localStorage.getItem("haichuan.dynamic-template-drafts.v1") ?? "null",
          );
          return stored?.drafts?.[0]?.definition?.nodes?.[nodeId]
            ?.props?.contentTemplateLayoutData?.nodes?.action ?? null;
        }, ownerNodeId);
        expect(action, "Pointer 调整必须写入当前本机草稿").toBeTruthy();
        expect(dynamic.writes, "本机草稿不得发起服务端模板写入").toEqual([]);
        return action;
      }
      const writesBeforeSave = dynamic.writes.length;
      await page.getByRole("button", { name: "保存模板", exact: true }).click();
      await expect.poll(() => dynamic.writes.length).toBe(writesBeforeSave + 1);
      return dynamic.writes.at(-1)!.body.definition.nodes[ownerNodeId]
        ?.props.contentTemplateLayoutData.nodes.action;
    };
    const move = selection.locator(".template-editor__editable-overlay-move");
    await expect(move).toHaveAttribute("data-overlay-move-external", "true");
    await expect(move).toBeVisible();
    const frame = page.frameLocator(".template-editor__viewport-frame");
    const role = frame.locator('[data-content-role="action"]:visible').first();
    await expect(selection).toBeVisible();
    await expect(role).toBeVisible();
    const [beforeRole, beforeSelection, moveBox] = await Promise.all([
      role.boundingBox(),
      selection.boundingBox(),
      move.boundingBox(),
    ]);
    if (!beforeRole || !beforeSelection || !moveBox) {
      throw new Error("最小 action 缺少真实角色、宿主选区或移动控件");
    }
    expect(moveBox.width).toBeGreaterThanOrEqual(28);
    expect(moveBox.height).toBeGreaterThanOrEqual(28);
    expect(beforeSelection.height).toBeLessThan(40);
    expect(await page.evaluate(({ x, y }) =>
      document.elementFromPoint(x, y)?.classList.contains("template-editor__editable-overlay-move") ?? false,
    { x: moveBox.x + moveBox.width / 2, y: moveBox.y + moveBox.height / 2 })).toBe(true);
    await page.keyboard.down("Alt");
    await page.mouse.move(moveBox.x + moveBox.width / 2, moveBox.y + moveBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(moveBox.x + moveBox.width / 2 + 24, moveBox.y + moveBox.height / 2 - 18, {
      steps: 6,
    });
    const preview = await selection.boundingBox();
    if (!preview) throw new Error("最小 action Pointer 预览缺少几何");
    expect(Math.abs(preview.x - beforeSelection.x) + Math.abs(preview.y - beforeSelection.y))
      .toBeGreaterThan(2);
    expect(Math.abs(preview.width - beforeSelection.width)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(preview.height - beforeSelection.height)).toBeLessThanOrEqual(0.5);
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await expect.poll(async () => {
      const [nextRole, nextSelection] = await Promise.all([
        role.boundingBox(),
        selection.boundingBox(),
      ]);
      return nextRole && nextSelection
        ? maxBoxDelta(nextRole, nextSelection)
        : Number.POSITIVE_INFINITY;
    }).toBeLessThanOrEqual(2);
    const movedRole = await role.boundingBox();
    if (!movedRole) throw new Error("最小 action Pointer 提交后真实角色消失");
    expect(Math.abs(movedRole.width - beforeRole.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(movedRole.height - beforeRole.height)).toBeLessThanOrEqual(2);
    await pressWorkspaceHistory(page, "undo");
    await expect.poll(async () => await role.boundingBox()).toEqual(beforeRole);
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
    await pressWorkspaceHistory(page, "redo");
    await expect.poll(async () => await role.boundingBox()).toEqual(movedRole);
    const storedAction = await readPersistedAction();
    expect(storedAction.sizeCompatibilityByViewport.desktop).toEqual({
      width: CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE,
      height: CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE,
    });
    expect(storedAction.rectByViewport.desktop.width).toBeLessThan(
      heroContract.editorCapabilities.editableObjects
        .find((object) => object.roleId === "action")!.constraints.minSize.width,
    );
    const beforeWidthSelection = await selection.boundingBox();
    if (!beforeWidthSelection) throw new Error("最小 action 横向调整前缺少宿主选区");
    const eastHandle = selection.locator('[data-resize-direction="e"]');
    await dragOverlayControlBy(
      page,
      eastHandle,
      -Math.max(80, beforeSelection.width * 2),
      0,
    );
    const widthResizedSelection = await selection.boundingBox();
    if (!widthResizedSelection) throw new Error("最小 action 横向调整后缺少宿主选区");
    expect(Math.abs(widthResizedSelection.width - beforeWidthSelection.width)).toBeGreaterThan(2);
    const widthResizedAction = await readPersistedAction();
    expect(widthResizedAction.rectByViewport.desktop.width).toBe(0.08);
    expect(widthResizedAction.rectByViewport.desktop.height).toBe(
      storedAction.rectByViewport.desktop.height,
    );
    expect(widthResizedAction.sizeCompatibilityByViewport.desktop).toEqual({
      height: CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE,
    });
    await pressWorkspaceHistory(page, "undo");
    await expect.poll(async () => {
      const box = await selection.boundingBox();
      return box ? maxBoxDelta(box, beforeWidthSelection) : Number.POSITIVE_INFINITY;
    }).toBeLessThanOrEqual(2);
    await pressWorkspaceHistory(page, "redo");
    await expect.poll(async () => {
      const box = await selection.boundingBox();
      return box ? maxBoxDelta(box, widthResizedSelection) : Number.POSITIVE_INFINITY;
    }).toBeLessThanOrEqual(2);

    const beforeHeightSelection = await selection.boundingBox();
    if (!beforeHeightSelection) throw new Error("最小 action 纵向调整前缺少宿主选区");
    const southHandle = selection.locator('[data-resize-direction="s"]');
    await dragOverlayControlBy(
      page,
      southHandle,
      0,
      -Math.max(80, beforeHeightSelection.height * 2),
    );
    const fullyResizedSelection = await selection.boundingBox();
    if (!fullyResizedSelection) throw new Error("最小 action 纵向调整后缺少宿主选区");
    expect(Math.abs(fullyResizedSelection.height - beforeHeightSelection.height)).toBeGreaterThan(1.5);
    const fullyResizedAction = await readPersistedAction();
    expect(fullyResizedAction.rectByViewport.desktop.height).toBe(0.04);
    expect(fullyResizedAction.rectByViewport.desktop.width).toBe(
      widthResizedAction.rectByViewport.desktop.width,
    );
    expect(fullyResizedAction.sizeCompatibilityByViewport).toBeUndefined();
    await pressWorkspaceHistory(page, "undo");
    await expect.poll(async () => {
      const box = await selection.boundingBox();
      return box ? maxBoxDelta(box, beforeHeightSelection) : Number.POSITIVE_INFINITY;
    }).toBeLessThanOrEqual(2);
    await pressWorkspaceHistory(page, "redo");
    await expect.poll(async () => {
      const box = await selection.boundingBox();
      return box ? maxBoxDelta(box, fullyResizedSelection) : Number.POSITIVE_INFINITY;
    }).toBeLessThanOrEqual(2);
  });

  for (const { entry, contract } of literalActionRoleCases) {
    test(`10 个 action 角色首次物化保尺寸并可精确撤销：${entry.templateKey}`, async ({ page }) => {
      await openWorkspaceShell(page, {
        role: "SUPER_ADMIN",
        viewport: { width: 1600, height: 1000 },
      });
      await openTemplateFromCatalog(page, contract.displayName);
      const overlay = page.locator('[data-template-editor-overlay-root="template-definition"]');
      const selection = overlay.locator('[data-overlay-selection-for$=":action"]');
      const hit = overlay.locator('[data-overlay-hit-for$=":action"]');
      await expect(hit).toBeVisible();
      await hit.click();
      await expect(selection).toBeVisible();
      const frame = page.frameLocator(".template-editor__viewport-frame");
      const role = frame.locator([
        '[data-content-role="action"]:visible',
        '[data-content-role-desktop="action"]:visible',
      ].join(",")).first();
      const moduleRoot = frame.locator(`[data-content-template-module="${entry.moduleType}"]`).first();
      const roleExists = await role.count() > 0;
      const [before, rootBox, selectionBefore] = await Promise.all([
        roleExists ? role.boundingBox() : Promise.resolve(null),
        moduleRoot.boundingBox(),
        selection.boundingBox(),
      ]);
      if (!rootBox || !selectionBefore) {
        throw new Error(`${entry.templateKey}.action 缺少模块框或宿主选区`);
      }
      const move = selection.locator(".template-editor__editable-overlay-move");
      await move.focus();
      await expect(move).toBeFocused();
      const key = selectionBefore.x - rootBox.x < rootBox.width / 2 ? "ArrowRight" : "ArrowLeft";
      await page.keyboard.press(key);
      await expect.poll(async () => {
        const next = await selection.boundingBox();
        return next ? Math.abs(next.x - selectionBefore.x) : 0;
      }).toBeGreaterThan(0.1);
      const movedSelection = await selection.boundingBox();
      if (!movedSelection) throw new Error(`${entry.templateKey}.action 缺少移动后宿主几何`);
      expect(Math.abs(movedSelection.width - selectionBefore.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(movedSelection.height - selectionBefore.height)).toBeLessThanOrEqual(2);
      if (before) {
        await expect.poll(async () => {
          const [nextRole, nextSelection] = await Promise.all([
            role.boundingBox(),
            selection.boundingBox(),
          ]);
          return nextRole && nextSelection
            ? maxBoxDelta(nextRole, nextSelection)
            : Number.POSITIVE_INFINITY;
        }).toBeLessThanOrEqual(2);
        const movedRole = await role.boundingBox();
        if (!movedRole) throw new Error(`${entry.templateKey}.action 移动后真实角色消失`);
        expect(Math.abs(movedRole.width - before.width)).toBeLessThanOrEqual(2);
        expect(Math.abs(movedRole.height - before.height)).toBeLessThanOrEqual(2);
      }
      await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeEnabled();
      await pressWorkspaceHistory(page, "undo");
      await expect.poll(async () => {
        const restored = await selection.boundingBox();
        return restored ? maxBoxDelta(restored, selectionBefore) : Number.POSITIVE_INFINITY;
      }).toBeLessThanOrEqual(2);
      const restoredSelection = await selection.boundingBox();
      if (!restoredSelection) throw new Error(`${entry.templateKey}.action 撤销后宿主选区消失`);
      if (before) await expect.poll(async () => await role.boundingBox()).toEqual(before);
      await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
    });
  }

  test("宿主 move 无位移不创建历史或 dirty", async ({ page }) => {
    const { structure, overlay } = await openHeroDefinitionWorkspace(page);
    const selection = await selectHeroRole(structure, overlay, /标题与描述文字/, "copy");
    const move = selection.locator(".template-editor__editable-overlay-move");
    const moveBox = await move.boundingBox();
    if (!moveBox) throw new Error("宿主移动控件没有可操作尺寸");
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
    await expect(page.getByRole("status", { name: "模板状态：有未保存修改" })).toHaveCount(0);
    await page.mouse.move(moveBox.x + moveBox.width / 2, moveBox.y + moveBox.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
    await expect(page.getByRole("status", { name: "模板状态：有未保存修改" })).toHaveCount(0);
  });

  test("宿主唯一选择层的 8 个方向把手各自提交正确边缘且每次可撤销", async ({ page }, testInfo) => {
    test.slow();
    const { structure, overlay, frame } = await openHeroDefinitionWorkspace(page);
    const selection = await selectHeroRole(structure, overlay, /标题与描述文字/, "copy");
    const root = frame.locator('[data-content-template-module="首屏主视觉"]').first();
    const copy = frame.locator('[data-content-role="copy"]:visible').first();
    const rootBox = await root.boundingBox();
    if (!rootBox) throw new Error("模块没有布局尺寸");
    const directions = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
    const handles = selection.locator(".template-editor__editable-overlay-resize");
    await expect(handles).toHaveCount(8);

    for (const direction of directions) {
      const handle = selection.locator(
        `.template-editor__editable-overlay-resize[data-resize-direction="${direction}"]`,
      );
      await expect(handle).toHaveCount(1);
      await expect(handle).toHaveAccessibleName(`调整文案大小：${direction}`);
      const before = await copy.boundingBox();
      if (!before) throw new Error(`${direction} 调整前没有文案尺寸`);
      const deltaX = direction.includes("w") ? -24 : direction.includes("e") ? 24 : 0;
      const deltaY = direction.includes("n") ? -18 : direction.includes("s") ? 18 : 0;
      await dragOverlayControlBy(page, handle, deltaX, deltaY);
      const after = await copy.boundingBox();
      if (!after) throw new Error(`${direction} 调整后没有文案尺寸`);
      if (direction.includes("w")) {
        expect(after.x).toBeLessThan(before.x - 2);
        expect(after.x + after.width).toBeCloseTo(before.x + before.width, 0);
      }
      if (direction.includes("e")) {
        expect(after.x).toBeCloseTo(before.x, 0);
        expect(after.width).toBeGreaterThan(before.width + 2);
      }
      if (direction.includes("n")) {
        expect(after.y).toBeLessThan(before.y - 2);
        expect(after.y + after.height).toBeCloseTo(before.y + before.height, 0);
      }
      if (direction.includes("s")) {
        expect(after.y).toBeCloseTo(before.y, 0);
        expect(after.height).toBeGreaterThan(before.height + 2);
      }
      await expectInside(rootBox, after);
      await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeEnabled();
      await pressWorkspaceHistory(page, "undo");
      const restored = await copy.boundingBox();
      if (!restored) throw new Error(`${direction} 撤销后没有文案尺寸`);
      expectBoxNear(restored, before);
      await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
      if (direction === "nw") {
        await attachScreenshot(page, testInfo, "template-eight-direction-resize");
      }
    }
  });

  test("文字框左右边把手真实改变对应边缘并保持模块边界", async ({ page }) => {
    const { structure, overlay, frame } = await openHeroDefinitionWorkspace(page);
    const selection = await selectHeroRole(structure, overlay, /标题与描述文字/, "copy");
    const root = frame.locator('[data-content-template-module="首屏主视觉"]').first();
    const copy = frame.locator('[data-content-role="copy"]:visible').first();
    const before = await copy.boundingBox();
    const rootBox = await root.boundingBox();
    if (!before || !rootBox) throw new Error("文字框或模块没有尺寸");
    const west = selection.locator('[data-resize-direction="w"]');
    await dragOverlayControlBy(page, west, 30, 0);
    const westAfter = await copy.boundingBox();
    if (!westAfter) throw new Error("左边调整后没有文案尺寸");
    expect(westAfter.x).toBeGreaterThan(before.x + 2);
    expect(westAfter.x + westAfter.width).toBeCloseTo(before.x + before.width, 0);
    await expectInside(rootBox, westAfter);
    await pressWorkspaceHistory(page, "undo");

    const restored = await copy.boundingBox();
    if (!restored) throw new Error("左边调整撤销后没有文案尺寸");
    expectBoxNear(restored, before);
    const east = selection.locator('[data-resize-direction="e"]');
    await dragOverlayControlBy(page, east, 30, 0);
    const eastAfter = await copy.boundingBox();
    if (!eastAfter) throw new Error("右边调整后没有文案尺寸");
    expect(eastAfter.x).toBeCloseTo(before.x, 0);
    expect(eastAfter.x + eastAfter.width).toBeGreaterThan(before.x + before.width + 2);
    await expectInside(rootBox, eastAfter);
  });

  test("宿主 resize 真实应用合同最小尺寸与模块边界且每次只产生一步历史", async ({ page }) => {
    const { structure, inspector, overlay, frame } = await openHeroDefinitionWorkspace(page);
    const selection = await selectHeroRole(structure, overlay, /标题与描述文字/, "copy");
    const root = frame.locator('[data-content-template-module="首屏主视觉"]').first();
    const copy = frame.locator('[data-content-role="copy"]:visible').first();
    const rootBox = await root.boundingBox();
    const before = await copy.boundingBox();
    if (!rootBox || !before) throw new Error("文案对象或模块没有初始尺寸");
    const east = selection.locator('[data-resize-direction="e"]');

    await dragOverlayControlBy(page, east, -Math.max(120, before.width * 2), 0);
    const minimum = await copy.boundingBox();
    if (!minimum) throw new Error("最小尺寸提交后没有文案尺寸");
    await openTemplateInspectorPanel(page, "布局");
    await expect(inspector.getByRole("spinbutton", { name: "宽度", exact: true })).toHaveValue("8");
    expect(minimum.width).toBeLessThan(before.width - 1);
    expect(minimum.height).toBeCloseTo(before.height, 0);
    await expectInside(rootBox, minimum);
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeEnabled();
    await pressWorkspaceHistory(page, "undo");
    expectBoxNear((await copy.boundingBox())!, before);
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();

    await dragOverlayControlBy(page, east, rootBox.width * 2, 0);
    const bounded = await copy.boundingBox();
    if (!bounded) throw new Error("模块边界提交后没有文案尺寸");
    expect(bounded.x).toBeCloseTo(before.x, 0);
    expect(bounded.x + bounded.width).toBeLessThanOrEqual(rootBox.x + rootBox.width + 1);
    await expectInside(rootBox, bounded);
    await pressWorkspaceHistory(page, "undo");
    expectBoxNear((await copy.boundingBox())!, before);
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
  });

  test("宿主吸附参考线遵循开关与 Alt 临时关闭，并在离开与 pointerup 后清理", async ({ page }) => {
    const { structure, overlay, frame } = await openHeroDefinitionWorkspace(page);
    const selection = await selectHeroRole(structure, overlay, /标题与描述文字/, "copy");
    const copy = frame.locator('[data-content-role="copy"]:visible').first();
    const move = selection.locator(".template-editor__editable-overlay-move");
    const selectionBox = await selection.boundingBox();
    const overlayBox = await overlay.boundingBox();
    const moveBox = await move.boundingBox();
    if (!selectionBox || !overlayBox || !moveBox) throw new Error("宿主吸附测试缺少几何尺寸");
    const start = { x: moveBox.x + moveBox.width / 2, y: moveBox.y + moveBox.height / 2 };
    const unsnappedDelta = await findMoveDeltaAwayFromSnapGuides(overlay, selection);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    const snapDeltaX = overlayBox.x + 3 - selectionBox.x;
    await page.mouse.move(start.x + snapDeltaX, start.y, { steps: 8 });
    const verticalGuide = overlay.locator('[data-overlay-snap-guide="vertical"]');
    await expect(verticalGuide).toBeVisible();
    const guideBox = await verticalGuide.boundingBox();
    if (!guideBox) throw new Error("宿主垂直吸附参考线没有尺寸");
    expect(Math.abs(guideBox.x - overlayBox.x)).toBeLessThanOrEqual(1.5);
    await page.mouse.move(start.x + unsnappedDelta.x, start.y + unsnappedDelta.y, { steps: 8 });
    await expect(overlay.locator("[data-overlay-snap-guide]")).toHaveCount(0);
    await page.mouse.move(start.x + snapDeltaX, start.y, { steps: 4 });
    await expect(verticalGuide).toBeVisible();
    await page.mouse.up();
    await expect(overlay.locator("[data-overlay-snap-guide]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeEnabled();
    await pressWorkspaceHistory(page, "undo");
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
    await expect(copy).toBeVisible();

    const { controls: viewTools } = await openTemplateViewTools(page);
    const snapToggle = viewTools.getByRole("button", { name: "吸附 10px", exact: true });
    await snapToggle.click();
    await expect(snapToggle).toHaveAttribute("aria-pressed", "false");
    let currentSelectionBox = await selection.boundingBox();
    let currentMoveBox = await move.boundingBox();
    if (!currentSelectionBox || !currentMoveBox) throw new Error("关闭吸附后缺少宿主几何尺寸");
    let currentStart = {
      x: currentMoveBox.x + currentMoveBox.width / 2,
      y: currentMoveBox.y + currentMoveBox.height / 2,
    };
    await page.mouse.move(currentStart.x, currentStart.y);
    await page.mouse.down();
    await page.mouse.move(
      currentStart.x + overlayBox.x + 3 - currentSelectionBox.x,
      currentStart.y,
      { steps: 8 },
    );
    await expect(overlay.locator("[data-overlay-snap-guide]")).toHaveCount(0);
    await page.mouse.up();
    await pressWorkspaceHistory(page, "undo");

    await snapToggle.click();
    await expect(snapToggle).toHaveAttribute("aria-pressed", "true");
    currentSelectionBox = await selection.boundingBox();
    currentMoveBox = await move.boundingBox();
    if (!currentSelectionBox || !currentMoveBox) throw new Error("恢复吸附后缺少宿主几何尺寸");
    currentStart = {
      x: currentMoveBox.x + currentMoveBox.width / 2,
      y: currentMoveBox.y + currentMoveBox.height / 2,
    };
    await page.mouse.move(currentStart.x, currentStart.y);
    await page.mouse.down();
    await page.keyboard.down("Alt");
    await page.mouse.move(
      currentStart.x + overlayBox.x + 3 - currentSelectionBox.x,
      currentStart.y,
      { steps: 8 },
    );
    await expect(overlay.locator("[data-overlay-snap-guide]")).toHaveCount(0);
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await pressWorkspaceHistory(page, "undo");
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
  });

  test("Esc 与真实 pointercancel 均取消预览并保持模板历史干净", async ({ page }) => {
    const { structure, overlay, frame } = await openHeroDefinitionWorkspace(page);
    const selection = await selectHeroRole(structure, overlay, /标题与描述文字/, "copy");
    const copy = frame.locator('[data-content-role="copy"]:visible').first();
    const move = selection.locator(".template-editor__editable-overlay-move");
    const initialBox = await copy.boundingBox();
    if (!initialBox) throw new Error("标题与描述文字没有初始尺寸");
    await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
    await dragOverlayControlBy(page, move, 80, 30, false);
    const previewBox = await selection.boundingBox();
    expect(previewBox).not.toEqual(initialBox);
    expect(await copy.boundingBox()).toEqual(initialBox);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect.poll(async () => await copy.boundingBox()).toEqual(initialBox);
    await expect(overlay.locator("[data-overlay-snap-guide]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();

    const moveBox = await move.boundingBox();
    if (!moveBox) throw new Error("宿主移动控件没有触摸取消尺寸");
    const client = await page.context().newCDPSession(page);
    const touch = { x: moveBox.x + moveBox.width / 2, y: moveBox.y + moveBox.height / 2 };
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...touch, id: 7, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: touch.x + 75, y: touch.y + 28, id: 7, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await expect.poll(async () => await selection.boundingBox()).not.toEqual(initialBox);
    await client.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await client.detach();
    await expect.poll(async () => {
      const box = await selection.boundingBox();
      return box ? Math.abs(box.x - initialBox.x) + Math.abs(box.y - initialBox.y) : Number.POSITIVE_INFINITY;
    }).toBeLessThanOrEqual(2.5);
    await expect.poll(async () => await copy.boundingBox()).toEqual(initialBox);
    await expect(overlay.locator("[data-overlay-snap-guide]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
  });

  test("设备与工作区切换会清理宿主临时手势且不写入模板历史", async ({ page }) => {
    const { structure, overlay, frame } = await openHeroDefinitionWorkspace(page);
    let selection = await selectHeroRole(structure, overlay, /标题与描述文字/, "copy");
    let move = selection.locator(".template-editor__editable-overlay-move");
    let moveBox = await move.boundingBox();
    if (!moveBox) throw new Error("桌面端宿主移动控件没有尺寸");
    const client = await page.context().newCDPSession(page);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: moveBox.x + 12, y: moveBox.y + 12, id: 11, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: moveBox.x + 62, y: moveBox.y + 32, id: 11, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await expect(overlay).toHaveAttribute("data-overlay-gesture-active", "true");
    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    await expect(overlay).not.toHaveAttribute("data-overlay-gesture-active", "true");
    await expect(overlay.locator("[data-overlay-snap-guide]")).toHaveCount(0);
    await client.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();

    await expect(overlay.locator('[data-overlay-hit-for$=":desktopImage"]')).toHaveCount(0);
    const mobileMediaSelection = await selectHeroRole(structure, overlay, /主视觉图片/, "mobileImage");
    await expect(mobileMediaSelection).toHaveAttribute("data-overlay-selection-for", /:mobileImage$/);
    selection = await selectHeroRole(structure, overlay, /标题与描述文字/, "copy", true);
    move = selection.locator(".template-editor__editable-overlay-move");
    moveBox = await move.boundingBox();
    if (!moveBox) throw new Error("移动端宿主移动控件没有尺寸");
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: moveBox.x + 12, y: moveBox.y + 12, id: 12, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: moveBox.x + 42, y: moveBox.y + 42, id: 12, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await expect(overlay).toHaveAttribute("data-overlay-gesture-active", "true");
    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(page.locator('[data-template-editor-overlay-root="template-definition"]')).toHaveCount(0);
    await client.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await client.detach();
    await expect(frame.locator("[data-hc-node-hud], [data-hc-snap-active]")).toHaveCount(0);
  });

  test("Hero 标题桌面与移动布局独立写入且互不覆盖", async ({ page }) => {
    const { structure, inspector, overlay, frame } = await openHeroDefinitionWorkspace(page);
    let selection = await selectHeroRole(structure, overlay, /标题与描述文字/, "copy");
    const copy = frame.locator('[data-content-role="copy"]:visible').first();
    await setSelectedRoleGeometry(inspector, { 横向位置: 35, 宽度: 40, 高度: 30 });
    const desktopEdited = await copy.boundingBox();
    if (!desktopEdited) throw new Error("桌面端写入后没有布局尺寸");
    await expect(inspector.getByRole("spinbutton", { name: "横向位置", exact: true })).toHaveValue("35");

    await page.getByRole("button", { name: /移动端.*布局/ }).click();
    await expect(page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端.*布局/ }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(inspector.locator(".homepage-editor__inspector-device")).toHaveCount(0);
    selection = overlay.locator('[data-overlay-selection-for$=":copy"]');
    await expect(selection).toBeVisible();
    await setSelectedRoleGeometry(inspector, { 横向位置: 10, 纵向位置: 50, 宽度: 40, 高度: 30 });
    await expect(inspector.getByRole("spinbutton", { name: "横向位置", exact: true })).toHaveValue("10");

    await page.getByRole("button", { name: /桌面端.*布局/ }).click();
    await expect(page.locator(".template-editor__toolbar").getByRole("button", { name: /桌面端.*布局/ }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(inspector.locator(".homepage-editor__inspector-device")).toHaveCount(0);
    await expect(inspector.getByRole("spinbutton", { name: "横向位置", exact: true })).toHaveValue("35");
    await expect.poll(async () => (await copy.boundingBox())?.x).toBeCloseTo(desktopEdited.x, 0);
  });

  test("键盘撤销、重做与顶部预览只操作当前模板会话", async ({ page }) => {
    const antdContextWarnings = observeAntdStaticContextWarnings(page);
    const { structure, inspector, overlay, frame } = await openHeroDefinitionWorkspace(page);
    const selection = await selectHeroRole(structure, overlay, /标题与描述文字/, "copy");
    const copy = frame.locator('[data-content-role="copy"]:visible').first();
    await setSelectedRoleGeometry(inspector, { 宽度: 40, 高度: 30 });
    const before = await copy.boundingBox();
    if (!before) throw new Error("标题与描述文字没有布局尺寸");
    await expect(selection.locator(".template-editor__editable-overlay-move")).toBeVisible();
    await setSelectedRoleGeometry(inspector, { 横向位置: 35 });
    const edited = await copy.boundingBox();
    if (!edited) throw new Error("键盘移动后没有布局尺寸");
    await pressWorkspaceHistory(page, "undo");
    await expect.poll(async () => (await copy.boundingBox())?.x).toBeCloseTo(before.x, 0);
    await pressWorkspaceHistory(page, "redo");
    await expect.poll(async () => (await copy.boundingBox())?.x).toBeCloseTo(edited.x, 0);

    await page.getByRole("button", { name: "预览模板" }).click();
    expect(antdContextWarnings).toEqual([]);
    await expect(page.getByRole("button", { name: "退出模板预览" })).toBeVisible();
    await expect(page.locator('[data-template-editor-overlay-root="template-definition"]')).toHaveCount(0);
    await expect(frame.locator([
      "[data-hc-node-hud]",
      "[data-hc-keyboard-node]",
      "[data-visual-selected-node]",
      "[data-visual-editor-mode]",
    ].join(","))).toHaveCount(0);
    await page.getByRole("button", { name: "退出模板预览" }).click();
    await expect(page.locator('[data-template-editor-overlay-root="template-definition"]')).toHaveCount(1);
  });
});

test.describe("Mock 模板保存边界", () => {
  test.skip(appMode !== "mock", "仅在 Vite mock 模式验证本机草稿语义");

  test("保存入口预先说明本机边界且不发起服务端模板写入", async ({ page }) => {
    await page.addInitScript(() => {
      if (window.top === window) {
        window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
      }
    });
    const serverWrites: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.includes("/page-modules/dynamic-templates") && request.method() !== "GET") {
        serverWrites.push(`${request.method()} ${pathname}`);
      }
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await installAdminSession(page, {
      username: "mock-template-local-only",
      realName: "Mock 本机草稿验收",
      role: "SUPER_ADMIN",
    });
    await page.goto("/admin/editor/home");
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await inspector.getByRole("textbox", { name: "模板名称" }).fill("Mock 本机测试模板");
    await expect(inspector.getByRole("region", { name: "模板属性功能区" })).toBeVisible();
    await openTemplateBasicInfo(page);
    await expect(inspector.getByRole("group", { name: "发布设置" })).toBeVisible();

    const save = page.getByRole("button", { name: "保存本机测试草稿", exact: true });
    await expect(save).toBeEnabled();
    await expect(save).toHaveAttribute("title", /不写入服务端模板/);
    await expect(page.getByRole("button", { name: /发布模板新版本/ })).toBeDisabled();
    await save.click();
    const dialog = page.getByRole("dialog", { name: "保存本机测试草稿" });
    await expect(dialog).toContainText("只写入当前浏览器本机存储，不创建服务端模板");
    await dialog.getByRole("button", { name: "更新本机测试草稿" }).click();
    await expect(page.getByText("已保存为本机测试草稿；未写入服务端模板")).toBeVisible();
    await expect(save).toBeDisabled();
    await expect(save).toHaveAttribute("title", "当前模板没有未保存修改");
    const templateLibrary = page.getByRole("complementary", { name: "模板组件库" });
    await expect(templateLibrary.getByRole("button", {
      name: "正在编辑Mock 本机测试模板，状态：草稿",
      exact: true,
    })).toBeVisible();
    await expect(templateLibrary.getByRole("button", { name: /模板模板/ })).toHaveCount(0);
    const publish = page.getByRole("button", { name: /发布模板新版本/ });
    await expect(publish).toContainText("不可发布");
    const storedDraftCount = await page.evaluate(() => {
      const stored = JSON.parse(window.localStorage.getItem("haichuan.dynamic-template-drafts.v1") ?? "null");
      return Array.isArray(stored?.drafts) ? stored.drafts.length : 0;
    });
    expect(storedDraftCount).toBe(1);
    expect(serverWrites).toEqual([]);
  });
});

type PersonalTemplateFixture = {
  id: number;
  name: string;
  moduleType: string;
  contractKey: string;
  contractVersion: number;
  revision: number;
  layoutData: Record<string, unknown>;
  contentDefaults: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

function makeTemplateWorkspaceLayerDraft() {
  const draft = makeHeroDraft();
  return {
    ...draft,
    puckData: {
      ...draft.puckData,
      content: [
        draft.puckData.content[0],
        ...Array.from({ length: 14 }, (_, index) => ({
          type: "文字横幅",
          props: {
            id: `template-workspace-layer-${index}`,
            title: `模板工作空间图层 ${index + 1}`,
            buttonText: "",
            targetType: "none",
          },
        })),
      ],
    },
  };
}

function personalTemplateFixture(
  overrides: Partial<PersonalTemplateFixture> = {},
): PersonalTemplateFixture {
  const contract = getContentTemplateContract("首屏主视觉");
  return {
    id: 71,
    name: "我的品牌首屏",
    moduleType: "首屏主视觉",
    contractKey: contract?.key ?? "hero",
    contractVersion: contract?.version ?? 1,
    revision: 1,
    layoutData: { version: 2 },
    contentDefaults: null,
    createdAt: "2026-08-28T08:00:00.000Z",
    updatedAt: "2026-08-28T08:00:00.000Z",
    ...overrides,
  };
}

async function mockPersonalTemplates(
  page: Page,
  initial: PersonalTemplateFixture[] = [],
  options: { failWrites?: boolean } = {},
) {
  const records = initial.map((record) => structuredClone(record));
  const writes: Array<{ method: string; pathname: string; body: Record<string, any> }> = [];
  await page.route(/\/api\/page-modules\/personal-content-templates(?:\/\d+)?(?:\?.*)?$/, async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    if (method === "GET") return route.fulfill(json(records));
    const body = request.postDataJSON() as Record<string, any>;
    writes.push({ method, pathname, body });
    if (options.failWrites) {
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ code: 500, message: "fixture write failure" }),
      });
    }
    if (method === "POST") {
      const contract = getContentTemplateContract(String(body.moduleType));
      const now = "2026-08-28T09:00:00.000Z";
      const created = personalTemplateFixture({
        id: Math.max(100, ...records.map((record) => record.id)) + 1,
        name: String(body.name),
        moduleType: String(body.moduleType),
        contractKey: contract?.key ?? String(body.moduleType),
        contractVersion: contract?.version ?? 1,
        layoutData: body.layoutData,
        contentDefaults: body.contentDefaults ?? null,
        createdAt: now,
        updatedAt: now,
      });
      records.unshift(created);
      return route.fulfill(json(created));
    }
    if (method === "PATCH") {
      const id = Number(pathname.split("/").at(-1));
      const index = records.findIndex((record) => record.id === id);
      if (index < 0) return route.fulfill({ status: 404, body: "{}" });
      if (body.expectedRevision !== records[index].revision) {
        return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "revision conflict" }) });
      }
      const changes = { ...body };
      delete changes.expectedRevision;
      records[index] = {
        ...records[index],
        ...changes,
        revision: records[index].revision + 1,
        contentDefaults: changes.layoutData !== undefined ? null : records[index].contentDefaults,
        updatedAt: "2026-08-28T09:05:00.000Z",
      };
      return route.fulfill(json(records[index]));
    }
    return route.fulfill(json({}));
  });
  return { records, writes };
}

async function mockSystemTemplates(page: Page) {
  const versions = new Map<string, Array<Record<string, any>>>();
  const activeVersions = new Map<string, number>();
  const writes: Array<{ method: string; pathname: string; body: Record<string, any> }> = [];
  const currentForModule = (moduleType: string) => {
    const contract = getContentTemplateContract(moduleType)!;
    const activeVersion = activeVersions.get(contract.key) ?? 0;
    const version = (versions.get(contract.key) ?? []).find((item) => item.version === activeVersion);
    return {
      contractKey: contract.key,
      moduleType,
      displayName: contract.displayName,
      contractVersion: version?.contractVersion ?? contract.version,
      activeVersion,
      layoutData: structuredClone(version?.layoutData ?? { version: 2 }),
      source: activeVersion > 0 ? "database" : "code",
      changeNote: version?.changeNote ?? null,
      updatedAt: version?.createdAt ?? null,
    };
  };
  const moduleByContractKey = (contractKey: string) => (
    CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.find((entry) => entry.templateKey === contractKey)?.moduleType
  );
  await page.route(/\/api\/page-modules\/system-content-templates(?:\/.*)?$/, async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const base = "/api/page-modules/system-content-templates";
    const parts = pathname.slice(base.length).split("/").filter(Boolean).map(decodeURIComponent);
    if (method === "GET" && parts.length === 0) {
      return route.fulfill(json(CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.map((entry) => currentForModule(entry.moduleType))));
    }
    const contractKey = parts[0];
    const moduleType = moduleByContractKey(contractKey);
    if (!moduleType) return route.fulfill({ status: 404, body: "{}" });
    if (method === "GET" && parts[1] === "history") {
      const current = activeVersions.get(contractKey) ?? 0;
      const history = (versions.get(contractKey) ?? []).slice().reverse().map((version) => ({
        ...structuredClone(version),
        active: version.version === current,
        source: "database",
      }));
      const contract = getContentTemplateContract(moduleType)!;
      history.push({
        version: 0,
        contractKey,
        moduleType,
        contractVersion: contract.version,
        layoutData: { version: 2 },
        changeNote: "代码机器合同基线",
        createdById: null,
        createdAt: null,
        active: current === 0,
        source: "code",
      });
      return route.fulfill(json(history));
    }
    if (method === "GET" && parts.length === 1) return route.fulfill(json(currentForModule(moduleType)));
    const body = request.postDataJSON() as Record<string, any>;
    writes.push({ method, pathname, body });
    if (method === "POST" && parts[1] === "versions") {
      const current = activeVersions.get(contractKey) ?? 0;
      if (body.expectedActiveVersion !== current) return route.fulfill({ status: 409, body: "{}" });
      const list = versions.get(contractKey) ?? [];
      const version = Math.max(0, ...list.map((item) => item.version)) + 1;
      const contract = getContentTemplateContract(moduleType)!;
      list.push({
        version,
        contractKey,
        moduleType,
        contractVersion: contract.version,
        layoutData: structuredClone(body.layoutData),
        changeNote: body.changeNote ?? null,
        createdById: 1,
        createdAt: "2026-08-29T10:00:00.000Z",
      });
      versions.set(contractKey, list);
      activeVersions.set(contractKey, version);
      return route.fulfill(json(currentForModule(moduleType)));
    }
    if (method === "POST" && parts[1] === "rollback") {
      const current = activeVersions.get(contractKey) ?? 0;
      if (body.expectedActiveVersion !== current) return route.fulfill({ status: 409, body: "{}" });
      activeVersions.set(contractKey, Number(body.targetVersion));
      return route.fulfill(json(currentForModule(moduleType)));
    }
    return route.fulfill({ status: 405, body: "{}" });
  });
  return { versions, activeVersions, writes };
}

async function mockDynamicTemplates(
  page: Page,
  options: {
    failWrites?: boolean;
    writeFailureStatuses?: Array<number | null>;
    publishFailures?: number;
    archiveFailures?: number;
    includeEditableCatalog?: boolean;
    unifiedCatalogUnavailable?: boolean;
    catalogResponseDelays?: number[];
    draftSaveResponseDelays?: number[];
    beforeCreateResponse?: () => Promise<void>;
    versionDetailFailureVersions?: number[];
    versionDetailFailureStatuses?: Record<number, number[]>;
    versionDetailResponseDelays?: Record<number, number>;
    getSystemCompatibility?: () => Array<Record<string, any>>;
    getPersonalCompatibility?: () => PersonalTemplateFixture[];
  } = {},
) {
  const records: Array<Record<string, any>> = [];
  const versionsByTemplateId = new Map<string, Array<Record<string, any>>>();
  const writes: Array<{ method: string; pathname: string; body: Record<string, any> }> = [];
  const catalogRequestsStarted: number[] = [];
  const catalogResponseCompletions: number[] = [];
  const draftSaveRequestsStarted: number[] = [];
  const draftSaveResponseCompletions: number[] = [];
  const writeAttempts: Array<{ method: string; pathname: string }> = [];
  const writeFailureStatuses = [...(options.writeFailureStatuses ?? [])];
  let catalogRequestIndex = 0;
  let draftSaveRequestIndex = 0;
  let remainingPublishFailures = options.publishFailures ?? 0;
  let remainingArchiveFailures = options.archiveFailures ?? 0;
  const versionDetailFailureVersions = new Set(options.versionDetailFailureVersions ?? []);
  const versionDetailFailureStatuses = new Map(
    Object.entries(options.versionDetailFailureStatuses ?? {})
      .map(([version, statuses]) => [Number(version), [...statuses]] as const),
  );
  let nextId = 800;
  const now = () => "2026-08-28T10:00:00.000Z";
  const syncDeleteCapability = (record: Record<string, any>) => {
    const deleteBlockers: Array<{ code: string; message: string }> = [];
    if (record.status !== "ARCHIVED") {
      deleteBlockers.push({ code: "NOT_IN_TRASH", message: "请先将模板移入回收站，再永久删除。" });
    }
    if (record.sourceType !== "CUSTOM") {
      deleteBlockers.push({
        code: "SYSTEM_TEMPLATE",
        message: "SYSTEM 模板属于共享治理资产，只能保留在回收站或恢复。",
      });
    }
    if (record.publishedVersion > 0) {
      deleteBlockers.push({
        code: "HAS_PUBLISHED_VERSION",
        message: "模板已生成正式版本，必须保留历史页面；只能留在回收站或恢复。",
      });
    }
    record.canDelete = deleteBlockers.length === 0;
    record.deleteBlockers = deleteBlockers;
  };
  const createResource = (
    definition: Record<string, any>,
    versionNote = "",
    sourceReference: string | null = null,
  ) => {
    const sourceType = sourceReference && LEGACY_SYSTEM_SOURCE_REFERENCES.has(sourceReference) ? "SYSTEM" : "CUSTOM";
    const resource = {
    id: nextId++,
    templateId: String(definition.templateId),
    ownerId: sourceReference && LEGACY_SYSTEM_SOURCE_REFERENCES.has(sourceReference) ? null : 1,
    sourceType,
    visibility: "PRIVATE",
    status: "ACTIVE",
    name: String(definition.name),
    category: String(definition.metadata.category),
    purpose: String(definition.metadata.purpose),
    layoutType: String(definition.metadata.layoutType),
    description: definition.description ?? null,
    slotSummary: String(definition.metadata.slotSummary),
    recommendedFor: structuredClone(definition.metadata.recommendedFor ?? []),
    tags: structuredClone(definition.metadata.tags ?? []),
    definitionSchemaVersion: Number(definition.schemaVersion),
    publishedVersion: 0,
    sourceReference,
    archivedAt: null,
    createdAt: now(),
    updatedAt: now(),
    draft: {
      id: nextId * 10,
      baseVersion: null,
      revision: 1,
      definition: structuredClone(definition),
      definitionChecksum: `draft-${definition.templateId}-r1`,
      versionNote: versionNote || null,
      updatedAt: now(),
    },
    };
    syncDeleteCapability(resource);
    return resource;
  };
  const listPublished = () => records.flatMap((record) => {
    const versions = versionsByTemplateId.get(record.templateId) ?? [];
    const latest = versions.at(-1);
    if (!latest || record.status !== "ACTIVE" || record.visibility !== "STAFF") return [];
    return [{
      templateId: record.templateId,
      name: record.name,
      category: record.category,
      purpose: record.purpose,
      layoutType: record.layoutType,
      description: record.description,
      slotSummary: record.slotSummary,
      recommendedFor: record.recommendedFor,
      tags: record.tags,
      sourceReference: record.sourceReference,
      version: latest.version,
      schemaVersion: latest.schemaVersion,
      definition: structuredClone(latest.definition),
      definitionChecksum: latest.definitionChecksum,
      versionNote: latest.versionNote,
      publishedAt: latest.publishedAt,
    }];
  });

  await page.route(/\/api\/page-modules\/dynamic-templates(?:\/.*)?$/, async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const base = "/api/page-modules/dynamic-templates";
    const suffix = pathname.slice(base.length);
    if (method === "GET" && suffix === "/catalog") {
      if (options.unifiedCatalogUnavailable) {
        return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      }
      const requestIndex = catalogRequestIndex;
      catalogRequestIndex += 1;
      catalogRequestsStarted.push(requestIndex);
      const payload = {
        items: [
          ...listPublished().map((template) => ({ kind: "published", template })),
          ...(options.includeEditableCatalog === false
            ? []
            : records.map((template) => ({ kind: "editable", template: structuredClone(template) }))),
          ...(options.getSystemCompatibility?.() ?? []).map((template) => ({
            kind: "system-compatibility",
            template: structuredClone(template),
          })),
          ...(options.getPersonalCompatibility?.() ?? []).map((template) => ({
            kind: "personal-compatibility",
            template: structuredClone(template),
          })),
        ],
      };
      const delay = options.catalogResponseDelays?.[requestIndex] ?? 0;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      catalogResponseCompletions.push(requestIndex);
      return route.fulfill(json(payload));
    }
    if (method === "GET" && suffix === "/published") {
      return route.fulfill(json(listPublished()));
    }
    if (method === "GET" && /^\/published\/[^/]+\/versions\/\d+$/.test(suffix)) {
      const [, templateId, , versionText] = suffix.split("/").filter(Boolean).map(decodeURIComponent);
      const requestedVersion = Number(versionText);
      const detailDelay = options.versionDetailResponseDelays?.[requestedVersion] ?? 0;
      if (detailDelay > 0) await new Promise((resolve) => setTimeout(resolve, detailDelay));
      const queuedStatuses = versionDetailFailureStatuses.get(requestedVersion);
      const failureStatus = queuedStatuses?.shift()
        ?? (versionDetailFailureVersions.delete(requestedVersion) ? 503 : null);
      if (failureStatus) {
        return route.fulfill({
          status: failureStatus,
          contentType: "application/json",
          body: JSON.stringify({ message: "fixture version detail failure" }),
        });
      }
      const record = records.find((candidate) => candidate.templateId === templateId);
      const version = (versionsByTemplateId.get(templateId) ?? [])
        .find((candidate) => candidate.version === requestedVersion);
      if (!record || !version) return route.fulfill({ status: 404, body: "{}" });
      return route.fulfill(json({
        templateId,
        name: record.name,
        category: record.category,
        status: record.status,
        sourceReference: record.sourceReference,
        ...structuredClone(version),
      }));
    }
    if (method === "GET" && suffix === "/mine") {
      return route.fulfill(json(structuredClone(records)));
    }
    const parts = suffix.split("/").filter(Boolean).map(decodeURIComponent);
    if (method === "POST" && parts.length === 0) {
      writeAttempts.push({ method, pathname });
      const failureStatus = writeFailureStatuses.shift();
      if (failureStatus) {
        return route.fulfill({
          status: failureStatus,
          contentType: "application/json",
          body: JSON.stringify({ message: `fixture template write ${failureStatus}` }),
        });
      }
      if (options.failWrites) {
        return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      }
      const body = request.postDataJSON() as Record<string, any>;
      writes.push({ method, pathname, body });
      const resource = createResource(
        body.definition,
        String(body.versionNote ?? ""),
        typeof body.sourceReference === "string" ? body.sourceReference : null,
      );
      records.unshift(resource);
      versionsByTemplateId.set(resource.templateId, []);
      await options.beforeCreateResponse?.();
      return route.fulfill(json(structuredClone(resource)));
    }
    const templateId = parts[0];
    const record = records.find((candidate) => candidate.templateId === templateId);
    if (!record) return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    if (method === "POST" && parts[1] === "archive") {
      if (remainingArchiveFailures > 0) {
        remainingArchiveFailures -= 1;
        return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      }
      writes.push({ method, pathname, body: {} });
      record.status = "ARCHIVED";
      record.archivedAt = now();
      syncDeleteCapability(record);
      return route.fulfill(json(structuredClone(record)));
    }
    if (method === "POST" && parts[1] === "restore") {
      writes.push({ method, pathname, body: {} });
      record.status = "ACTIVE";
      record.archivedAt = null;
      syncDeleteCapability(record);
      return route.fulfill(json(structuredClone(record)));
    }
    if (method === "PATCH" && parts[1] === "draft") {
      writeAttempts.push({ method, pathname });
      const failureStatus = writeFailureStatuses.shift();
      if (failureStatus) {
        return route.fulfill({
          status: failureStatus,
          contentType: "application/json",
          body: JSON.stringify({ message: `fixture template write ${failureStatus}` }),
        });
      }
      if (options.failWrites) {
        return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      }
      const body = request.postDataJSON() as Record<string, any>;
      const requestIndex = draftSaveRequestIndex;
      draftSaveRequestIndex += 1;
      draftSaveRequestsStarted.push(requestIndex);
      if (body.expectedRevision !== record.draft.revision) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ message: "revision conflict" }),
        });
      }
      writes.push({ method, pathname, body });
      record.name = String(body.definition.name);
      record.category = String(body.definition.metadata.category);
      record.purpose = String(body.definition.metadata.purpose);
      record.layoutType = String(body.definition.metadata.layoutType);
      record.description = body.definition.description ?? null;
      record.slotSummary = String(body.definition.metadata.slotSummary);
      record.recommendedFor = structuredClone(body.definition.metadata.recommendedFor ?? []);
      record.tags = structuredClone(body.definition.metadata.tags ?? []);
      record.draft = {
        ...record.draft,
        revision: record.draft.revision + 1,
        definition: structuredClone(body.definition),
        definitionChecksum: `draft-${templateId}-r${record.draft.revision + 1}`,
        versionNote: body.versionNote ?? null,
        updatedAt: now(),
      };
      const responsePayload = structuredClone(record);
      const delay = options.draftSaveResponseDelays?.[requestIndex] ?? 0;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      draftSaveResponseCompletions.push(requestIndex);
      return route.fulfill(json(responsePayload));
    }
    if (method === "POST" && parts[1] === "publish") {
      const body = request.postDataJSON() as Record<string, any>;
      writes.push({ method, pathname, body });
      if (remainingPublishFailures > 0) {
        remainingPublishFailures -= 1;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: 503, message: "fixture template publish failure" }),
        });
      }
      const list = versionsByTemplateId.get(templateId) ?? [];
      const version = list.length + 1;
      const published = {
        id: nextId++,
        dynamicTemplateId: record.id,
        version,
        schemaVersion: record.draft.definition.schemaVersion,
        definition: structuredClone(record.draft.definition),
        definitionChecksum: `published-${templateId}-v${version}`,
        versionNote: body.versionNote ?? record.draft.versionNote ?? null,
        publishedAt: now(),
      };
      list.push(published);
      versionsByTemplateId.set(templateId, list);
      record.publishedVersion = version;
      record.visibility = "STAFF";
      syncDeleteCapability(record);
      record.draft = {
        ...record.draft,
        baseVersion: version,
        revision: record.draft.revision + 1,
        definitionChecksum: published.definitionChecksum,
      };
      return route.fulfill(json({
        templateId,
        version,
        published: structuredClone(published),
        draft: structuredClone(record.draft),
      }));
    }
    if (method === "GET" && parts[1] === "versions") {
      const url = new URL(request.url());
      const beforeVersion = Number(url.searchParams.get("beforeVersion") || Number.POSITIVE_INFINITY);
      const limit = Math.min(Number(url.searchParams.get("limit") || 20), 50);
      const rows = (versionsByTemplateId.get(templateId) ?? [])
        .filter((candidate) => candidate.version < beforeVersion)
        .slice()
        .sort((left, right) => right.version - left.version);
      const items = rows.slice(0, limit).map(({ definition: _definition, ...summary }) => summary);
      return route.fulfill(json({
        items,
        nextBeforeVersion: rows.length > limit ? items.at(-1)?.version ?? null : null,
      }));
    }
    if (method === "POST" && parts[1] === "save-as") {
      if (options.failWrites) {
        return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      }
      const body = request.postDataJSON() as Record<string, any>;
      writes.push({ method, pathname, body });
      const definition = structuredClone(record.draft.definition);
      definition.templateId = `tpl_copy_${nextId}`;
      definition.name = String(body.name);
      definition.defaultContent = {};
      definition.previewContent = {};
      Object.values(definition.slots as Record<string, Record<string, unknown>>).forEach((slot) => {
        if (slot.emptyPolicy === "use-default") slot.emptyPolicy = "hide";
      });
      const copied = createResource(definition, String(body.versionNote ?? ""), templateId);
      records.unshift(copied);
      versionsByTemplateId.set(copied.templateId, []);
      return route.fulfill(json(structuredClone(copied)));
    }
    if (method === "DELETE" && parts.length === 1) {
      writes.push({ method, pathname, body: {} });
      if (record.status !== "ARCHIVED" || !record.canDelete) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ code: "DYNAMIC_TEMPLATE_DELETE_BLOCKED", message: record.deleteBlockers[0]?.message }),
        });
      }
      records.splice(records.indexOf(record), 1);
      versionsByTemplateId.delete(templateId);
      return route.fulfill(json({ templateId, deleted: true }));
    }
    return route.fulfill(json({}));
  });
  return {
    records,
    versionsByTemplateId,
    writes,
    writeAttempts,
    failNextPublish: () => { remainingPublishFailures += 1; },
    catalogRequestsStarted,
    catalogResponseCompletions,
    draftSaveRequestsStarted,
    draftSaveResponseCompletions,
  };
}

async function openWorkspaceShell(
  page: Page,
  options: {
    role?: "SUPER_ADMIN" | "ADMIN" | "EDITOR";
    draft?: Record<string, any>;
    personalTemplates?: PersonalTemplateFixture[];
    failTemplateWrites?: boolean;
    templateWriteFailureStatuses?: Array<number | null>;
    beforeCreateResponse?: () => Promise<void>;
    publishFailures?: number;
    archiveFailures?: number;
    unifiedCatalogUnavailable?: boolean;
    catalogResponseDelays?: number[];
    draftSaveResponseDelays?: number[];
    versionDetailFailureVersions?: number[];
    versionDetailFailureStatuses?: Record<number, number[]>;
    versionDetailResponseDelays?: Record<number, number>;
    viewport?: { width: number; height: number };
    allowPageWrites?: boolean;
  } = {},
) {
  const forbiddenPageWrites: string[] = [];
  const pageWrites: Array<{
    method: string;
    pathname: string;
    body: Record<string, any>;
  }> = [];
  await page.setViewportSize(options.viewport ?? { width: 1600, height: 1000 });
  await installAdminSession(page, {
    username: `template-workspace-${options.role ?? "admin"}`,
    realName: "模板工作空间验收",
    role: options.role ?? "SUPER_ADMIN",
  });
  await mockEditorApis(
    page,
    options.draft ?? makeHeroDraft(),
    forbiddenPageWrites,
    options.allowPageWrites ? pageWrites : undefined,
  );
  const personal = await mockPersonalTemplates(
    page,
    options.personalTemplates,
    { failWrites: options.failTemplateWrites },
  );
  const system = await mockSystemTemplates(page);
  const dynamic = await mockDynamicTemplates(page, {
    failWrites: options.failTemplateWrites,
    writeFailureStatuses: options.templateWriteFailureStatuses,
    beforeCreateResponse: options.beforeCreateResponse,
    publishFailures: options.publishFailures,
    archiveFailures: options.archiveFailures,
    unifiedCatalogUnavailable: options.unifiedCatalogUnavailable,
    catalogResponseDelays: options.catalogResponseDelays,
    draftSaveResponseDelays: options.draftSaveResponseDelays,
    versionDetailFailureVersions: options.versionDetailFailureVersions,
    versionDetailFailureStatuses: options.versionDetailFailureStatuses,
    versionDetailResponseDelays: options.versionDetailResponseDelays,
    includeEditableCatalog: options.role === undefined || options.role === "SUPER_ADMIN",
    getSystemCompatibility: () => CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.map((entry) => {
      const contract = getContentTemplateContract(entry.moduleType)!;
      const activeVersion = system.activeVersions.get(contract.key) ?? 0;
      const version = (system.versions.get(contract.key) ?? []).find((item) => item.version === activeVersion);
      return {
        contractKey: contract.key,
        moduleType: entry.moduleType,
        displayName: contract.displayName,
        contractVersion: version?.contractVersion ?? contract.version,
        activeVersion,
        layoutData: structuredClone(version?.layoutData ?? { version: 2 }),
        source: activeVersion > 0 ? "database" : "code",
        changeNote: version?.changeNote ?? null,
        updatedAt: version?.createdAt ?? null,
      };
    }),
    getPersonalCompatibility: () => personal.records,
  });
  await page.goto("/admin/editor/home");
  await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("complementary", { name: "模板组件库" }))
    .toBeVisible({ timeout: 15_000 });
  return { forbiddenPageWrites, pageWrites, ...personal, dynamic, system };
}

async function openTemplateFromCatalog(page: Page, name: string) {
  await page.getByRole("button", { name: "模板设计" }).click();
  const templateLibrary = page.getByRole("complementary", { name: "模板组件库" });
  await expect(templateLibrary).toBeVisible();
  await expect(templateLibrary.getByText("模板组件库", { exact: true })).toBeVisible();
  const cardControl = page.getByRole("button", { name: new RegExp(`(?:打开|正在编辑)${name}模板`) });
  await expect(cardControl).toBeVisible();
  await cardControl.click();
  await expect.poll(async () => {
    if (await cardControl.getAttribute("aria-pressed") === "true") return "opened";
    const notice = await page.locator(".ant-message-notice-content").last().textContent().catch(() => null);
    return notice ? `notice:${notice}` : "pending";
  }, { timeout: 15_000 }).toBe("opened");
  await expect(page.locator(".template-editor__toolbar")).toBeVisible();
  await expect(page.locator(".template-editor__viewport-frame")).toBeVisible();
}

async function openTemplateMoreMenu(page: Page) {
  await page.locator(".template-editor__toolbar")
    .getByRole("button", { name: "更多模板操作" })
    .click();
}

async function openTemplateCatalogMoreMenu(button: Locator) {
  await expect(button).toHaveCSS("pointer-events", "auto");
  await button.click();
}

async function openTemplateSizeControls(page: Page) {
  const trigger = page.getByRole("button", { name: /^模板尺寸：/ });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  const controls = page.getByRole("group", { name: "模板整体尺寸" });
  await expect(controls).toBeVisible();
  return { trigger, controls };
}

async function openTemplateViewTools(page: Page) {
  const trigger = page.getByRole("button", { name: /^视图辅助/ });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  const controls = page.getByRole("group", { name: "画布视图辅助" });
  await expect(controls).toBeVisible();
  return { trigger, controls };
}

async function openTemplateStructureAddPanel(page: Page) {
  const structure = page.getByRole("complementary", { name: "模板结构" });
  const trigger = structure.getByRole("button", { name: "添加槽位", exact: true });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  const panel = page.getByRole("dialog", { name: "添加槽位" });
  await expect(panel).toBeVisible();
  return { structure, trigger, panel };
}

async function addTemplateStructureNode(page: Page, accessibleName: string) {
  if (accessibleName.includes("区域")) {
    await page.getByRole("complementary", { name: "模板结构" })
      .getByRole("button", { name: "添加区域", exact: true })
      .click();
    return;
  }
  const { panel } = await openTemplateStructureAddPanel(page);
  const currentName = accessibleName.includes("标题槽位")
    ? "添加标题槽位"
    : accessibleName.includes("图片槽位")
      ? "添加图片槽位"
      : accessibleName.includes("正文槽位")
        ? "添加正文槽位"
        : accessibleName.includes("按钮槽位")
          ? "添加按钮槽位"
          : accessibleName.includes("商品槽位")
            ? "添加商品槽位"
            : accessibleName;
  await panel.getByRole("button", { name: currentName, exact: true }).click();
}

async function openTemplateInspectorPanel(page: Page, panel: "基本" | "布局" | "规则") {
  let inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  if (await inspector.count() === 0) {
    await page.getByRole("button", { name: "展开模板属性面板" }).click();
    inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  }
  // 当前 Inspector 是按所选对象连续呈现的任务面板；panel 参数仅保留为
  // 老用例的意图标记，不再驱动已经删除的页签层级。
  void panel;
  await expect(inspector).toBeVisible();
  return inspector;
}

async function openTemplateInspectorDisclosure(inspector: Locator, label: string) {
  const trigger = inspector.getByRole("button", { name: new RegExp(`^${label}`) });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  return trigger;
}

async function openTemplateBasicInfo(page: Page) {
  await page.getByRole("button", { name: "选择模板目标 模板根节点", exact: true })
    .evaluate((element: HTMLButtonElement) => element.click());
  await openTemplateMoreMenu(page);
  await page.getByRole("menuitem", { name: "模板资料与使用限制" }).click();
  const inspector = await openTemplateInspectorPanel(page, "基本");
  const templateInfo = inspector.getByRole("group", { name: "模板信息", exact: true });
  await expect(templateInfo.getByRole("textbox", { name: "模板名称", exact: true })).toBeVisible();
  return templateInfo;
}

async function fillTemplateName(page: Page, name: string) {
  const inspector = await openTemplateBasicInfo(page);
  await inspector.getByRole("textbox", { name: "模板名称", exact: true }).fill(name);
  return inspector;
}

/** 简洁根字段与“模板信息”面板字段绑定同一 definition.name；资料面板打开时二者并存，统一取首个。 */
function templateNameInput(page: Page) {
  return page.getByRole("textbox", { name: "模板名称", exact: true }).first();
}

const SHARED_TOOLBAR_SELECTORS = {
  device: ".homepage-editor__viewport-switcher",
  workspace: ".template-editor__workspace-context",
  history: ".homepage-editor__toolbar-history",
  preview: ".homepage-editor__toolbar-preview",
  save: ".homepage-editor__toolbar-secondary-actions .ant-btn",
  more: ".homepage-editor__toolbar-more",
  publish: ".homepage-editor__toolbar-publish",
} as const;

async function readSharedToolbarGeometry(page: Page) {
  const toolbar = page.locator(".admin-header__editor-slot .homepage-editor__toolbar:visible");
  await expect(toolbar).toHaveCount(1);
  const geometry = {} as Record<keyof typeof SHARED_TOOLBAR_SELECTORS, {
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  for (const [key, selector] of Object.entries(SHARED_TOOLBAR_SELECTORS) as Array<
    [keyof typeof SHARED_TOOLBAR_SELECTORS, string]
  >) {
    const box = await toolbar.locator(selector).boundingBox();
    if (!box) throw new Error(`共享顶部控件 ${key} 没有可测量尺寸`);
    geometry[key] = box;
  }
  return geometry;
}

async function readWorkspaceVerticalChrome(page: Page, rootSelector: string) {
  return page.locator(rootSelector).evaluate((root) => {
    const shell = root.matches(".homepage-editor__body")
      ? root
      : root.querySelector<HTMLElement>(":scope > .homepage-editor__body");
    const appHeader = document.querySelector<HTMLElement>(".admin-header--editor");
    const panelHeaders = shell?.querySelectorAll<HTMLElement>(
      ".homepage-editor__panel-header",
    );
    const canvasScroll = shell?.querySelector<HTMLElement>(
      ":scope > .homepage-editor__stage .homepage-editor__canvas-scroll",
    );
    if (!shell || !appHeader || !panelHeaders?.length || !canvasScroll) {
      throw new Error("双模式工作台缺少顶栏、面板标题栏或画布滚动区");
    }
    const rootRect = shell.getBoundingClientRect();
    const round = (value: number) => Math.round(value * 10) / 10;
    return {
      appHeaderHeight: round(appHeader.getBoundingClientRect().height),
      panelHeaderHeights: [...new Set(
        [...panelHeaders].map((header) => round(header.getBoundingClientRect().height)),
      )],
      canvasTopChromeHeight: round(canvasScroll.getBoundingClientRect().top - rootRect.top),
    };
  });
}

function expectSharedToolbarGeometryCompatible(
  pageMode: Awaited<ReturnType<typeof readSharedToolbarGeometry>>,
  templateMode: Awaited<ReturnType<typeof readSharedToolbarGeometry>>,
) {
  for (const key of Object.keys(SHARED_TOOLBAR_SELECTORS) as Array<
    keyof typeof SHARED_TOOLBAR_SELECTORS
  >) {
    for (const axis of ["y", "height"] as const) {
      expect(
        Math.abs(pageMode[key][axis] - templateMode[key][axis]),
        `${key}.${axis} 在页面装修与模板设计之间未保持同一工具栏基线`,
      ).toBeLessThanOrEqual(1);
    }
  }
  expect(Math.abs(pageMode.device.x - templateMode.device.x)).toBeLessThanOrEqual(1);
  for (const geometry of [pageMode, templateMode]) {
    const boxes = ["device", "workspace", "history", "preview", "save", "more", "publish"]
      .map((key) => geometry[key as keyof typeof SHARED_TOOLBAR_SELECTORS]);
    boxes.forEach((box, index) => boxes.slice(index + 1).forEach((other, otherIndex) => {
      const separated = box.x + box.width <= other.x + 1
        || other.x + other.width <= box.x + 1;
      expect(separated, `顶部控件 ${index} 与 ${index + otherIndex + 1} 重叠`).toBe(true);
    }));
  }
}

async function readTemplateCatalogLayout(library: Locator) {
  return library.evaluate((root) => {
    const tools = root.querySelector<HTMLElement>(".homepage-editor__library-tools");
    const scroll = root.querySelector<HTMLElement>(".unified-template-library__scroll");
    if (!tools || !scroll) throw new Error("模板目录缺少统一工具或滚动布局");
    const firstCard = scroll.querySelector<HTMLElement>("[data-template-catalog-card='shared']");
    if (!firstCard) throw new Error("模板目录缺少模板卡片");
    const rootRect = root.getBoundingClientRect();
    const toolsRect = tools.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const firstCardRect = firstCard.getBoundingClientRect();
    const round = (value: number) => Math.round(value * 10) / 10;
    return {
      toolsOffset: round(toolsRect.top - rootRect.top),
      toolsHeight: round(toolsRect.height),
      scrollOffset: round(scrollRect.top - rootRect.top),
      contentOffset: round(firstCardRect.top - scrollRect.top),
    };
  });
}

async function readCatalogPreviewGeometry(card: Locator) {
  await expect(card.locator('[data-preview-status="ready"]')).toHaveCount(1);
  return card.evaluate((root) => {
    const preview = root.querySelector<HTMLElement>("[data-preview-natural-height]");
    const frame = root.querySelector<HTMLIFrameElement>("iframe[data-template-catalog-viewport]");
    const renderer = frame?.contentDocument?.querySelector<HTMLElement>("[data-dynamic-template-id]");
    const templateRoot = renderer?.querySelector<HTMLElement>("[data-template-node-id]");
    const contractFrame = renderer?.querySelector<HTMLElement>("[data-content-template-renderer='real']");
    if (!preview || !frame || !renderer || !templateRoot || !contractFrame) {
      throw new Error("模板目录预览缺少画框、Renderer、根节点或合同框架");
    }
    const previewRect = preview.getBoundingClientRect();
    const round = (value: number) => Math.round(value * 10) / 10;
    return {
      viewport: preview.dataset.previewViewport,
      heightMode: preview.dataset.previewHeightMode,
      ratio: preview.dataset.previewRatio,
      naturalHeight: preview.dataset.previewNaturalHeight,
      previewWidth: round(previewRect.width),
      previewHeight: round(previewRect.height),
      frameWidth: frame.clientWidth,
      frameHeight: frame.clientHeight,
      rendererId: renderer.dataset.dynamicTemplateId,
      rendererDevice: renderer.dataset.dynamicTemplateDevice,
      rendererClientHeight: renderer.clientHeight,
      rendererScrollHeight: renderer.scrollHeight,
      rootClientHeight: templateRoot.clientHeight,
      contractClientHeight: contractFrame.clientHeight,
      contractScrollHeight: contractFrame.scrollHeight,
    };
  });
}

async function readDynamicTemplateRenderSignature(root: Locator) {
  await expect(root).toBeVisible();
  await expect(root.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });
  await root.evaluate(async (element) => {
    const styleLinks = [...element.ownerDocument.querySelectorAll<HTMLLinkElement>(
      'link[rel="stylesheet"]',
    )];
    await Promise.all(styleLinks.map((link) => link.sheet
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          const finish = () => resolve();
          link.addEventListener("load", finish, { once: true });
          link.addEventListener("error", finish, { once: true });
          element.ownerDocument.defaultView?.setTimeout(finish, 5_000);
        })));
    await element.ownerDocument.fonts?.ready;
    const ownerWindow = element.ownerDocument.defaultView;
    if (!ownerWindow) return;
    await new Promise<void>((resolve) => {
      ownerWindow.requestAnimationFrame(() => ownerWindow.requestAnimationFrame(() => resolve()));
    });
  });
  return root.evaluate((element) => {
    const root = element as HTMLElement;
    const rootRect = root.getBoundingClientRect();
    const round = (value: number) => Math.round(value * 10) / 10;
    const readRelativeRect = (node: HTMLElement) => {
      const rect = node.getBoundingClientRect();
      return {
        x: round(rect.left - rootRect.left),
        y: round(rect.top - rootRect.top),
        width: round(rect.width),
        height: round(rect.height),
      };
    };
    const readVisualStyles = (node: HTMLElement) => {
      const styles = getComputedStyle(node);
      return {
        display: styles.display,
        position: styles.position,
        flexDirection: styles.flexDirection,
        gridTemplateColumns: styles.gridTemplateColumns,
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        fontSize: styles.fontSize,
        textAlign: styles.textAlign,
        objectFit: styles.objectFit,
        gap: styles.gap,
        margin: styles.margin,
        padding: styles.padding,
        minHeight: styles.minHeight,
      };
    };
    const content = root.cloneNode(true) as HTMLElement;
    content.querySelectorAll("style, script, [data-hc-editor-overlay], [role='status']")
      .forEach((node) => node.remove());
    return {
      templateId: root.dataset.dynamicTemplateId,
      schemaVersion: root.dataset.dynamicTemplateSchemaVersion,
      device: root.dataset.dynamicTemplateDevice,
      compositionAuthority: root.dataset.templateCompositionAuthority,
      rootNodeId: root.dataset.templateRootNodeId,
      root: {
        rect: readRelativeRect(root),
        styles: readVisualStyles(root),
        clientHeight: root.clientHeight,
        scrollHeight: root.scrollHeight,
        overflow: getComputedStyle(root).overflow,
      },
      nodes: [...root.querySelectorAll<HTMLElement>("[data-template-node-id]")].map((node) => ({
        nodeId: node.dataset.templateNodeId,
        type: node.dataset.templateNodeType,
        slotId: node.dataset.templateSlotId,
        parentNodeId: node.parentElement
          ?.closest<HTMLElement>("[data-template-node-id]")
          ?.dataset.templateNodeId,
        rect: readRelativeRect(node),
        styles: readVisualStyles(node),
      })),
      contentRoles: [...root.querySelectorAll<HTMLElement>("[data-content-role]")].map((node) => ({
        role: node.dataset.contentRole,
        parentRole: node.parentElement
          ?.closest<HTMLElement>("[data-content-role]")
          ?.dataset.contentRole,
        parentNodeId: node.closest<HTMLElement>("[data-template-node-id]")
          ?.dataset.templateNodeId,
        tagName: node.tagName,
        rect: readRelativeRect(node),
        styles: readVisualStyles(node),
      })),
      contractFrames: [...root.querySelectorAll<HTMLElement>("[data-content-template-renderer='real']")]
        .map((frame) => {
          const styles = getComputedStyle(frame);
          return {
            contract: frame.dataset.contentTemplateContract,
            rect: readRelativeRect(frame),
            styles: {
              boxSizing: styles.boxSizing,
              margin: styles.margin,
              minHeight: styles.minHeight,
              padding: styles.padding,
              width: styles.width,
            },
          };
        }),
      instanceCss: [...root.querySelectorAll<HTMLStyleElement>("style[data-hc-instance-overrides]")]
        .map((style) => (style.textContent ?? "").replace(
          /\[data-hc-instance="[^"]+"\]/g,
          '[data-hc-instance="scope"]',
        )),
      visibleNodeCount: [...root.querySelectorAll<HTMLElement>(
        "[data-template-node-id], [data-content-role]",
      )].filter((node) => node.getClientRects().length > 0).length,
      imageCount: root.querySelectorAll("img").length,
      actionCount: root.querySelectorAll("a,button").length,
      text: (content.textContent ?? "").replace(/\s+/g, " ").trim(),
    };
  });
}

type DynamicTemplateRenderSignature = Awaited<ReturnType<typeof readDynamicTemplateRenderSignature>>;

function expectDynamicTemplateRenderSignaturesEqual(
  actual: DynamicTemplateRenderSignature,
  expected: DynamicTemplateRenderSignature,
  label: string,
  options: { templateStructureOnly?: boolean } = {},
) {
  expect(actual.instanceCss, `${label} 合同实例样式来源不一致`)
    .toEqual(expected.instanceCss);
  expect(actual.compositionAuthority, `${label} 必须由 TemplateDefinition 根组合驱动`)
    .toBe("template-definition-v2");
  expect(actual.rootNodeId, `${label} 根节点身份必须匹配首个 Definition 节点`)
    .toBe(actual.nodes[0]?.nodeId);
  const withoutGeometry = (signature: DynamicTemplateRenderSignature) => options.templateStructureOnly ? ({
    compositionAuthority: signature.compositionAuthority,
    device: signature.device,
    rootNodeId: signature.rootNodeId,
    schemaVersion: signature.schemaVersion,
    templateId: signature.templateId,
    nodes: signature.nodes.map(({ rect: _rect, ...node }) => node),
  }) : ({
    ...signature,
    root: {
      styles: signature.root.styles,
      overflow: signature.root.overflow,
    },
    nodes: signature.nodes.map(({ rect: _rect, ...node }) => node),
    contentRoles: signature.contentRoles.map(({ rect: _rect, ...role }) => role),
    contractFrames: signature.contractFrames.map(({ rect: _rect, ...frame }) => frame),
  });
  expect(withoutGeometry(actual), `${label} DOM、层级、顺序或视觉规则不一致`)
    .toEqual(withoutGeometry(expected));
  if (options.templateStructureOnly) return;
  const expectRectsEqual = (
    actualRects: Array<{ x: number; y: number; width: number; height: number }>,
    expectedRects: Array<{ x: number; y: number; width: number; height: number }>,
    scope: string,
    heightTolerance: number,
  ) => {
    expect(actualRects, `${label} ${scope}几何节点数量不一致`).toHaveLength(expectedRects.length);
    for (let index = 0; index < expectedRects.length; index += 1) {
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(
        Math.abs(actualRects[index]![key] - expectedRects[index]![key]),
          `${label} ${scope}第 ${index + 1} 个节点 ${key} 几何漂移：画布 ${JSON.stringify(actualRects[index])}，目录 ${JSON.stringify(expectedRects[index])}`,
        ).toBeLessThanOrEqual(key === "height" ? heightTolerance : 1);
      }
    }
  };
  // 目录以只读方式运行设计画布同一模式；编辑装饰为绝对层，不得改变几何。
  expectRectsEqual([actual.root.rect], [expected.root.rect], "根容器", 1);
  expectRectsEqual(
    actual.nodes.map((node) => node.rect),
    expected.nodes.map((node) => node.rect),
    "模板节点",
    1,
  );
  expectRectsEqual(
    actual.contentRoles.map((role) => role.rect),
    expected.contentRoles.map((role) => role.rect),
    "内容角色",
    1,
  );
  expect(
    Math.abs(actual.root.clientHeight - expected.root.clientHeight),
    `${label} 根容器可见高度漂移`,
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(actual.root.scrollHeight - expected.root.scrollHeight),
    `${label} 根容器自然高度漂移`,
  ).toBeLessThanOrEqual(1);
}

test.describe("独立模板工作空间（阶段 1）", () => {
  test.skip(
    appMode === "mock",
    "该层在 development 模式拦截自有 API，Mock 启动模式不用于证明接口方法语义",
  );

  test("页面装修模板卡只添加实例，超级管理员从独立入口进入模板设计", async ({ page }) => {
    const unifiedCatalogReads: string[] = [];
    const legacyCatalogReads: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (request.method() !== "GET") return;
      if (pathname.endsWith("/page-modules/dynamic-templates/catalog")) {
        unifiedCatalogReads.push(pathname);
      }
      if (
        pathname.endsWith("/page-modules/dynamic-templates/mine")
        || pathname.endsWith("/page-modules/dynamic-templates/published")
        || pathname.endsWith("/page-modules/personal-content-templates")
        || pathname.endsWith("/page-modules/system-content-templates")
      ) {
        legacyCatalogReads.push(pathname);
      }
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });
    await expect(page.getByText("基于此模板创建", { exact: true })).toHaveCount(0);

    const pageWorkspace = page.locator(".homepage-editor__page-workspace");
    const pageTemplateLibrary = page.getByRole("complementary", { name: "模板组件库" });
    await expect(pageTemplateLibrary).toHaveAttribute("data-unified-template-library", "page");
    await expect(pageTemplateLibrary.locator('[data-workspace-panel-header="shared"]')).toHaveCount(1);
    await pageTemplateLibrary.getByRole("button", { name: "单列查看" }).click();
    await expect(pageTemplateLibrary.getByRole("button", { name: "单列查看" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(pageTemplateLibrary.getByRole("heading", { name: "模板目录", exact: true })).toHaveCount(0);
    await expect(pageTemplateLibrary.getByRole("button", { name: "新建模板", exact: true })).toHaveCount(0);
    const pageCatalogLayout = await readTemplateCatalogLayout(pageTemplateLibrary);
    await expect(page.getByRole("complementary", { name: "图层面板" })
      .locator('[data-workspace-panel-header="shared"]')).toHaveCount(1);
    const templateEntry = page.getByRole("button", {
      name: "首屏：点击添加到页面末尾，也可拖到画布指定位置",
    });
    await expect(templateEntry.locator("xpath=ancestor::*[@data-template-catalog-card='shared']")).toHaveCount(1);
    await expect(templateEntry.locator("xpath=ancestor::*[@data-template-identity='source:legacy_system_hero']"))
      .toHaveCount(1);
    await expect(templateEntry.locator("xpath=ancestor::*[@data-template-catalog-card='shared']")
      .locator('[data-preview-art-direction="neutral-template-preview-v1"]'))
      .toHaveCount(1);
    const pageCatalogCard = templateEntry.locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    await expect(pageCatalogCard.locator('[data-preview-status="ready"]')).toHaveCount(1);
    await expect(pageCatalogCard.locator('[data-preview-styles-ready="true"][data-preview-renderer-ready="true"]'))
      .toHaveCount(1);
    await expect(pageCatalogCard.locator('iframe[data-template-catalog-viewport="desktop"]'))
      .toHaveJSProperty("clientWidth", RESPONSIVE_CANVAS.desktop.width);
    const pageCardAppearance = await pageCatalogCard.evaluate((card) => {
      const preview = card.querySelector<HTMLElement>(".homepage-editor__template-preview-wrap");
      if (!preview) throw new Error("模板卡缺少统一预览框");
      const cardRect = card.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      const cardStyles = getComputedStyle(card);
      const previewStyles = getComputedStyle(preview);
      const artboard = card.querySelector<HTMLElement>("[data-preview-natural-height]");
      const frame = card.querySelector<HTMLIFrameElement>("iframe");
      const renderer = frame?.contentDocument?.querySelector<HTMLElement>("[data-dynamic-template-id]");
      const round = (value: number) => Math.round(value * 10) / 10;
      return {
        cardWidth: round(cardRect.width),
        cardHeight: round(cardRect.height),
        cardRadius: cardStyles.borderRadius,
        cardPaddingBottom: cardStyles.paddingBottom,
        previewWidth: round(previewRect.width),
        previewHeight: round(previewRect.height),
        previewAspectRatio: previewStyles.aspectRatio,
        previewBackground: previewStyles.backgroundColor,
        naturalHeight: artboard?.dataset.previewNaturalHeight,
        rendererClientHeight: renderer?.clientHeight,
        rendererScrollHeight: renderer?.scrollHeight,
        slotBoxCount: card.querySelectorAll("[data-slot-kind]").length,
      };
    });
    const { cardHeight: _pageCardChromeHeight, ...pagePreviewAppearance } = pageCardAppearance;
    await expect(templateEntry).not.toHaveAttribute("aria-disabled", "true");
    await expect(pageCatalogCard.locator(
      ".homepage-editor__template-slot-summary, .homepage-editor__template-description, .homepage-editor__template-add",
    )).toHaveCount(0);
    await expect(pageCatalogCard.locator(".homepage-editor__template-name")).toHaveText("首屏");
    await templateEntry.click();
    const pageLayer = pageWorkspace.locator(".homepage-editor__layer-item").first();
    await expect(pageLayer).toBeVisible();
    await expect(pageLayer.getByRole("button", { name: /复制首屏/ })).toHaveCount(0);
    await expect(pageWorkspace).toBeVisible();
    await expect(page.getByText("正在编辑独立模板")).toHaveCount(0);
    await expect.poll(() => unifiedCatalogReads.length).toBeGreaterThan(0);
    const pageModeCatalogReadCount = unifiedCatalogReads.length;
    expect(legacyCatalogReads).toEqual([]);

    await openTemplateFromCatalog(page, "首屏");

    await expect(pageWorkspace).toBeHidden();
    const designTemplateLibrary = page.getByRole("complementary", { name: "模板组件库" });
    await expect(designTemplateLibrary).toHaveAttribute("data-unified-template-library", "design");
    await expect(designTemplateLibrary.getByRole("button", { name: "单列查看" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(designTemplateLibrary.getByRole("heading", { name: "模板目录", exact: true })).toHaveCount(0);
    await expect(designTemplateLibrary.getByRole("button", { name: "新建模板", exact: true })).toBeVisible();
    const designCatalogLayout = await readTemplateCatalogLayout(designTemplateLibrary);
    expect(designCatalogLayout).toMatchObject({
      toolsOffset: pageCatalogLayout.toolsOffset,
      contentOffset: pageCatalogLayout.contentOffset,
    });
    expect(designCatalogLayout.toolsHeight).toBeGreaterThan(pageCatalogLayout.toolsHeight);
    expect(designCatalogLayout.scrollOffset).toBeGreaterThan(pageCatalogLayout.scrollOffset);
    await expect(page.getByRole("button", { name: "正在编辑首屏模板" })
      .locator("xpath=ancestor::*[@data-template-catalog-card='shared']")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "正在编辑首屏模板" })
      .locator("xpath=ancestor::*[@data-template-identity='source:legacy_system_hero']"))
      .toHaveCount(1);
    const designCatalogCard = page.getByRole("button", { name: "正在编辑首屏模板" })
      .locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    await expect(designCatalogCard.locator('[data-preview-status="ready"]')).toHaveCount(1);
    await expect(designCatalogCard.locator('[data-preview-styles-ready="true"][data-preview-renderer-ready="true"]'))
      .toHaveCount(1);
    await expect(designCatalogCard.locator('iframe[data-template-catalog-viewport="desktop"]'))
      .toHaveJSProperty("clientWidth", RESPONSIVE_CANVAS.desktop.width);
    await expect.poll(() => designCatalogCard.evaluate((card) => {
      const preview = card.querySelector<HTMLElement>(".homepage-editor__template-preview-wrap");
      if (!preview) throw new Error("模板卡缺少统一预览框");
      const cardRect = card.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      const cardStyles = getComputedStyle(card);
      const previewStyles = getComputedStyle(preview);
      const artboard = card.querySelector<HTMLElement>("[data-preview-natural-height]");
      const frame = card.querySelector<HTMLIFrameElement>("iframe");
      const renderer = frame?.contentDocument?.querySelector<HTMLElement>("[data-dynamic-template-id]");
      const round = (value: number) => Math.round(value * 10) / 10;
      const appearance = {
        cardWidth: round(cardRect.width),
        cardHeight: round(cardRect.height),
        cardRadius: cardStyles.borderRadius,
        cardPaddingBottom: cardStyles.paddingBottom,
        previewWidth: round(previewRect.width),
        previewHeight: round(previewRect.height),
        previewAspectRatio: previewStyles.aspectRatio,
        previewBackground: previewStyles.backgroundColor,
        naturalHeight: artboard?.dataset.previewNaturalHeight,
        rendererClientHeight: renderer?.clientHeight,
        rendererScrollHeight: renderer?.scrollHeight,
        slotBoxCount: card.querySelectorAll("[data-slot-kind]").length,
      };
      const { cardHeight: _designCardChromeHeight, ...previewAppearance } = appearance;
      return previewAppearance;
    })).toEqual(pagePreviewAppearance);
    await expect(page.getByRole("region", { name: /模板(?:设计)?画布/ })).toBeVisible();
    const templateStructure = page.getByRole("complementary", { name: "模板结构" });
    await expect(templateStructure).toBeVisible();
    await expect(templateStructure.locator('[data-workspace-panel-header="shared"]')).toHaveCount(1);
    await expect.poll(() => unifiedCatalogReads.length).toBeGreaterThan(pageModeCatalogReadCount);
    expect(legacyCatalogReads).toEqual([]);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("非首屏比例模板的移动目录在页面装修与模板设计间复用同一权威画框", async ({ page }) => {
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });
    await page.getByRole("button", { name: /移动端.*布局/ }).click();
    const pageLibrary = page.getByRole("complementary", { name: "模板组件库" });
    const pageCard = pageLibrary.locator(
      '[data-template-catalog-card="shared"][data-template-identity="source:legacy_system_fullBleed"]',
    );
    await expect(pageCard.locator('iframe[data-template-catalog-viewport="mobile"]'))
      .toHaveJSProperty("clientWidth", RESPONSIVE_CANVAS.mobile.width);
    const pageGeometry = await readCatalogPreviewGeometry(pageCard);
    expect(pageGeometry.frameWidth).toBe(RESPONSIVE_CANVAS.mobile.width);
    expect(Number(pageGeometry.naturalHeight)).toBeGreaterThanOrEqual(RESPONSIVE_CANVAS.mobile.height);

    await openTemplateFromCatalog(page, "通栏图");
    await page.locator(".template-editor__toolbar")
      .getByRole("button", { name: /移动端模板布局/ })
      .click();
    const designLibrary = page.getByRole("complementary", { name: "模板组件库" });
    const designCard = designLibrary.locator(
      '[data-template-catalog-card="shared"][data-template-identity="source:legacy_system_fullBleed"]',
    );
    await expect(designCard.locator('iframe[data-template-catalog-viewport="mobile"]'))
      .toHaveJSProperty("clientWidth", RESPONSIVE_CANVAS.mobile.width);
    await expect.poll(() => readCatalogPreviewGeometry(designCard)).toEqual(pageGeometry);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("页面装修真实拖入系统与动态主舞台后均阻止重复点击、拖动和键盘插入", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });

    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    await fillTemplateName(page, "动态主舞台 QA");
    const basicInfo = await openTemplateBasicInfo(page);
    await basicInfo.getByRole("button", { name: "页面视觉职责：主舞台" }).click();
    await addTemplateStructureNode(page, "标题槽位 内容槽位");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();
    const templateLibrary = page.getByRole("complementary", { name: "模板组件库" });
    await expect(templateLibrary.getByRole("button", { name: /正在编辑动态主舞台 QA模板/ })
      .locator("xpath=ancestor::*[@data-template-catalog-card='shared']")
      .locator(".homepage-editor__template-card-status"))
      .toHaveText("已发布 · v1");
    await page.getByRole("button", { name: "页面装修" }).click();

    const systemControl = page.getByRole("button", {
      name: "首屏：点击添加到页面末尾，也可拖到画布指定位置",
    });
    const publishedControl = page.getByRole("button", { name: "添加动态主舞台 QA版本1" });
    await expect(systemControl).toHaveAttribute("draggable", "true");
    await expect(publishedControl).toHaveAttribute("draggable", "true");

    const canvas = page.locator(".homepage-editor__canvas-document");
    await observeTrustedTemplateDrags(page);
    await dragTemplateCard(page, publishedControl, canvas);
    await expect.poll(() => readTemplateDrags(page)).toEqual([
      { trusted: true, types: ["application/x-haichuan-published-template"] },
    ]);
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);

    const blockedSystem = page.getByRole("button", { name: "首屏已有主舞台实例，不能再次添加" });
    const blockedPublished = page.getByRole("button", {
      name: "动态主舞台 QA版本1已添加为主舞台，不能再次添加",
    });
    for (const [label, control] of [
      ["系统兼容卡", blockedSystem],
      ["已发布动态卡", blockedPublished],
    ] as const) {
      await expect(control).toBeVisible();
      await expect(control).toHaveAttribute("aria-disabled", "true");
      await expect(control).toHaveAttribute("draggable", "false");
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport();
      await expect(control.locator("..").locator('[data-preview-status="ready"]')).toHaveCount(1);
      await clickDisabledTemplateCard(page, control);
      await expect(page.locator(".homepage-editor__layer-item"), `${label} 鼠标点击不得插入`)
        .toHaveCount(1);
      await dragTemplateCard(page, control, canvas);
      await expect(page.locator(".homepage-editor__layer-item"), `${label} 拖动不得插入`)
        .toHaveCount(1);
      await control.press("Enter");
      await expect(page.locator(".homepage-editor__layer-item"), `${label} Enter 不得插入`)
        .toHaveCount(1);
    }

    expect(await readTemplateDrags(page)).toHaveLength(1);

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    const freshSystem = page.getByRole("button", {
      name: "首屏：点击添加到页面末尾，也可拖到画布指定位置",
    });
    const freshPublished = page.getByRole("button", { name: "添加动态主舞台 QA版本1" });
    await expect(freshPublished).toHaveAttribute("draggable", "true");
    await observeTrustedTemplateDrags(page);
    await dragTemplateCard(page, freshSystem, canvas);
    await expect.poll(() => readTemplateDrags(page)).toEqual([
      { trusted: true, types: ["application/x-haichuan-page-template"] },
    ]);
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);
    for (const control of [blockedSystem, blockedPublished]) {
      await expect(control).toHaveAttribute("aria-disabled", "true");
      await expect(control).toHaveAttribute("draggable", "false");
      await clickDisabledTemplateCard(page, control);
      await dragTemplateCard(page, control, canvas);
      await control.press("Enter");
      await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);
    }
    expect(await readTemplateDrags(page)).toHaveLength(1);
    expect(dynamic.versionsByTemplateId.get(dynamic.records[0].templateId)).toHaveLength(1);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("新建模板从草稿到发布自动同步页面目录，并始终锁定已发布版本", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });

    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    await fillTemplateName(page, "自动同步规则");
    await addTemplateStructureNode(page, "标题槽位 内容槽位");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    const templateId = dynamic.records[0].templateId as string;
    expect(dynamic.versionsByTemplateId.get(templateId)).toHaveLength(0);

    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(page.getByText("自动同步规则", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "店铺装修工作模式切换" }))
      .toHaveAttribute("data-active-mode", "page");
    await expect(page.locator(".template-editor__toolbar")).toHaveCount(0);

    await openTemplateFromCatalog(page, "自动同步规则");
    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();
    const publishedDesignCard = page.getByRole("button", { name: "正在编辑自动同步规则模板" })
      .locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    await expect(publishedDesignCard.locator(".homepage-editor__template-badge")).toHaveCount(0);
    await expect(publishedDesignCard).not.toContainText("草稿 · 已发布 v1");
    expect(dynamic.versionsByTemplateId.get(templateId)).toHaveLength(1);

    await page.getByRole("button", { name: "页面装修" }).click();
    const publishedControl = page.getByRole("button", { name: "添加自动同步规则版本1" });
    await expect(publishedControl).toHaveAttribute("draggable", "true");
    await publishedControl.click();
    await publishedControl.click();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(2);
    await expect(page.getByRole("group", { name: "店铺装修工作模式切换" }))
      .toHaveAttribute("data-active-mode", "page");
    await expect(page.locator(".template-editor__toolbar")).toHaveCount(0);

    await openTemplateFromCatalog(page, "自动同步规则");
    await page.getByRole("treeitem", { name: /自动同步规则 模板/ }).click();
    await openTemplateInspectorPanel(page, "规则");
    await page.getByLabel("版本说明").fill("下一版草稿，不能影响页面 v1");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    await page.getByRole("button", { name: "页面装修" }).click();
    const publishedWithDraft = page.getByRole("button", { name: "添加自动同步规则版本1" });
    const publishedCard = publishedWithDraft.locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    await expect(publishedCard.locator(".homepage-editor__template-badge")).toHaveCount(0);
    await expect(publishedCard).not.toContainText("有未发布修改");
    await publishedWithDraft.click();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(3);
    expect(dynamic.versionsByTemplateId.get(templateId)).toHaveLength(1);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("已发布母模板保存新草稿后目录与当前摘要明确显示未发布修改（Mock）", async ({ page }) => {
    test.slow();
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });

    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    await fillTemplateName(page, "发布状态辨识 QA");
    await addTemplateStructureNode(page, "标题槽位 内容槽位");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    const templateId = dynamic.records[0].templateId as string;
    const templateLibrary = page.getByRole("complementary", { name: "模板组件库" });
    const activeCard = () => templateLibrary.locator(
      `[data-template-catalog-card="shared"][data-template-identity="template:${templateId}"]`,
    );
    const lifecycle = () => activeCard().locator(".homepage-editor__template-card-status");

    await expect(lifecycle()).toHaveText("草稿");
    await templateLibrary.getByRole("button", { name: "已发布", exact: true }).click();
    await expect(activeCard()).toHaveCount(0);
    await templateLibrary.getByRole("button", { name: "草稿", exact: true }).click();
    await expect(activeCard()).toBeVisible();
    await templateLibrary.getByRole("button", { name: "全部", exact: true }).click();

    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();
    await expect(lifecycle()).toHaveText("已发布 · v1");
    await expect(page.getByLabel("模板状态：已发布，线上版本与模板草稿一致")).toBeVisible();

    await page.getByRole("treeitem", { name: /发布状态辨识 QA 模板/ }).click();
    await openTemplateInspectorPanel(page, "规则");
    await page.getByLabel("版本说明").fill("保存为尚未发布的新草稿");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    await expect(lifecycle()).toHaveText("已发布 · 有未发布修改 · v1");
    await expect(page.getByLabel("模板状态：已发布，有未发布修改")).toBeVisible();
    expect(dynamic.versionsByTemplateId.get(templateId)).toHaveLength(1);
    expect(dynamic.writes.filter((write) => write.pathname.endsWith("/publish"))).toHaveLength(1);

    await templateLibrary.getByRole("button", { name: "已发布", exact: true }).click();
    await expect(activeCard()).toBeVisible();
    await templateLibrary.getByRole("button", { name: "草稿", exact: true }).click();
    await expect(activeCard()).toHaveCount(0);
    await templateLibrary.getByRole("button", { name: "全部", exact: true }).click();
    await expect(activeCard()).toBeVisible();

    const activeDesignLibrary = page.locator(
      'aside[data-unified-template-library="design"]:not(.homepage-editor__library--collapsed)',
    );
    const responsiveCard = () => activeDesignLibrary.locator(
      `[data-template-catalog-card="shared"][data-template-identity="template:${templateId}"]`,
    );
    const ensureActiveDesignLibraryOpen = async (compact = false) => {
      const expand = page.getByRole("button", { name: "展开模板组件库" });
      if (compact) {
        await expect(expand).toBeVisible();
        await expand.click();
      } else if (await expand.isVisible().catch(() => false)) {
        await expand.click();
      }
      await expect(activeDesignLibrary).toBeVisible();
    };
    for (const viewport of [
      { width: 1600, height: 1000 },
      { width: 1280, height: 900 },
      { width: 1024, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await ensureActiveDesignLibraryOpen(viewport.width <= 1024);
      for (const viewName of ["单列查看", "双列查看"] as const) {
        await activeDesignLibrary.getByRole("button", { name: viewName }).click();
        await expect(responsiveCard().locator(".homepage-editor__template-card-status"))
          .toHaveText("已发布 · 有未发布修改 · v1");
        await expect(responsiveCard().locator(".homepage-editor__template-card-main"))
          .toHaveAccessibleName(/状态：已发布，有未发布修改/);
        const overlap = await responsiveCard().evaluate((card) => {
          const status = card.querySelector<HTMLElement>(".homepage-editor__template-card-status");
          const action = card.querySelector<HTMLElement>(".template-editor__catalog-card-action");
          if (!status || !action) return true;
          const a = status.getBoundingClientRect();
          const b = action.getBoundingClientRect();
          return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        });
        expect(overlap).toBe(false);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
          .toBe(true);
      }
      if (viewport.width <= 1024) {
        await expect(activeDesignLibrary).toHaveAttribute("role", "dialog");
        await page.keyboard.press("Escape");
        await expect(page.getByRole("button", { name: "展开模板组件库" })).toBeFocused();
      }
    }

    await page.setViewportSize({ width: 1600, height: 1000 });
    await ensureActiveDesignLibraryOpen();

    dynamic.failNextPublish();
    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await expect(page.getByText("模板发布失败，当前模板草稿和页面会话仍保留")).toBeVisible();
    await expect(lifecycle()).toHaveText("已发布 · 有未发布修改 · v1");
    await expect(page.getByLabel("模板状态：发布失败，已发布版本仍在线，有未发布修改，可以重试"))
      .toBeVisible();
    expect(dynamic.versionsByTemplateId.get(templateId)).toHaveLength(1);

    await page.getByRole("button", { name: "重试发布" }).click();
    await expect(page.getByText("模板 v2 已发布；现有页面仍保持原版本")).toBeVisible();
    await expect(lifecycle()).toHaveText("已发布 · v2");
    await expect(page.getByLabel("模板状态：已发布，线上版本与模板草稿一致")).toBeVisible();
    expect(dynamic.versionsByTemplateId.get(templateId)).toHaveLength(2);
    expect(dynamic.writes.filter((write) => write.pathname.endsWith("/publish"))).toHaveLength(3);

    for (const viewName of ["单列查看", "双列查看"] as const) {
      await templateLibrary.getByRole("button", { name: viewName }).click();
      await expect(lifecycle()).toHaveText("已发布 · v2");
      await expect(activeCard().locator(".homepage-editor__template-card-main"))
        .toHaveAccessibleName(/状态：已发布/);
    }

    const writeCountBeforeReload = dynamic.writes.length;
    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    const reloadedLibrary = page.locator(
      'aside[data-unified-template-library="design"]:not(.homepage-editor__library--collapsed)',
    );
    const ensureLibraryOpen = async (compact = false) => {
      const expand = page.getByRole("button", { name: "展开模板组件库" });
      if (compact) {
        await expect(expand).toBeVisible();
        await expand.click();
      } else if (await expand.isVisible().catch(() => false)) {
        await expand.click();
      }
      await expect(reloadedLibrary).toBeVisible();
      await reloadedLibrary.getByRole("textbox", { name: "搜索模板" }).fill("发布状态辨识 QA");
    };
    const reloadedCard = () => reloadedLibrary.locator(
      `[data-template-catalog-card="shared"][data-template-identity="template:${templateId}"]`,
    );

    for (const viewport of [
      { width: 1600, height: 1000 },
      { width: 1280, height: 900 },
      { width: 1024, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await ensureLibraryOpen(viewport.width <= 1024);
      await expect(reloadedCard().locator(".homepage-editor__template-card-status")).toHaveText("已发布 · v2");
      const overlap = await reloadedCard().evaluate((card) => {
        const status = card.querySelector<HTMLElement>(".homepage-editor__template-card-status");
        const action = card.querySelector<HTMLElement>(".template-editor__catalog-card-action");
        if (!status || !action) return true;
        const a = status.getBoundingClientRect();
        const b = action.getBoundingClientRect();
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      });
      expect(overlap).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
        .toBe(true);
      if (viewport.width <= 1024) {
        await expect(reloadedLibrary).toHaveAttribute("role", "dialog");
        await page.keyboard.press("Escape");
        await expect(page.getByRole("button", { name: "展开模板组件库" })).toBeFocused();
      }
    }

    await page.setViewportSize({ width: 1600, height: 1000 });
    await ensureLibraryOpen();
    const reloadedControl = reloadedCard().locator(".homepage-editor__template-card-main");
    await reloadedControl.focus();
    await reloadedControl.press("Enter");
    await expect(page.getByLabel("模板状态：已发布，线上版本与模板草稿一致")).toBeVisible();
    expect(dynamic.writes).toHaveLength(writeCountBeforeReload);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("模板保存响应迟到时保留保存期间的新修改，并用最新 revision 继续保存", async ({ page }) => {
    const draftSaveResponseDelays = [4_000];
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
      draftSaveResponseDelays,
    });

    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    await fillTemplateName(page, "保存基线模板");
    await addTemplateStructureNode(page, "标题槽位 内容槽位");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    await page.getByRole("treeitem", { name: /保存基线模板 模板/ }).click();
    await fillTemplateName(page, "正在保存的版本");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect.poll(() => dynamic.draftSaveRequestsStarted).toEqual([0]);
    await templateNameInput(page).fill("保存期间的新修改");
    expect(dynamic.draftSaveResponseCompletions).toEqual([]);

    await expect(page.getByText("模板草稿已保存；你还有新的未保存修改")).toBeVisible();
    await expect(templateNameInput(page))
      .toHaveValue("保存期间的新修改");
    await expect(page.getByLabel("模板状态：有未保存修改")).toBeVisible();
    expect(dynamic.draftSaveResponseCompletions).toEqual([0]);

    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    await expect(page.getByLabel("模板状态：模板草稿已保存")).toBeVisible();
    const draftWrites = dynamic.writes.filter((write) => write.method === "PATCH");
    expect(draftWrites.map((write) => write.body.expectedRevision)).toEqual([1, 2]);
    expect(draftWrites.map((write) => write.body.definition.name)).toEqual([
      "正在保存的版本",
      "保存期间的新修改",
    ]);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("模板目录并发刷新只接受最后一次结果，不被迟到的旧草稿响应覆盖", async ({ page }) => {
    const catalogResponseDelays: number[] = [];
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
      catalogResponseDelays,
    });

    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    await fillTemplateName(page, "目录乱序保护");
    await addTemplateStructureNode(page, "标题槽位 内容槽位");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(page.getByText("目录乱序保护", { exact: true })).toHaveCount(0);

    await expect.poll(() => (
      dynamic.catalogResponseCompletions.length === dynamic.catalogRequestsStarted.length
    )).toBe(true);
    const requestsBeforeStale = dynamic.catalogRequestsStarted.length;
    const staleRequestIndex = requestsBeforeStale;
    catalogResponseDelays[staleRequestIndex] = 1_500;
    await page.evaluate(() => window.dispatchEvent(new Event("haichuan:dynamic-template-server-changed")));
    await expect.poll(() => dynamic.catalogRequestsStarted.length).toBeGreaterThan(requestsBeforeStale);

    const record = dynamic.records[0];
    const checksum = `published-${record.templateId}-v1`;
    record.publishedVersion = 1;
    record.visibility = "STAFF";
    record.draft.baseVersion = 1;
    record.draft.definitionChecksum = checksum;
    dynamic.versionsByTemplateId.set(record.templateId, [{
      id: 9_901,
      dynamicTemplateId: record.id,
      version: 1,
      schemaVersion: record.draft.definition.schemaVersion,
      definition: structuredClone(record.draft.definition),
      definitionChecksum: checksum,
      versionNote: null,
      publishedAt: "2026-08-28T10:00:00.000Z",
    }]);
    const requestsBeforeFresh = dynamic.catalogRequestsStarted.length;
    await page.evaluate(() => window.dispatchEvent(new Event("haichuan:dynamic-template-server-changed")));

    await expect.poll(() => dynamic.catalogRequestsStarted.length).toBeGreaterThan(requestsBeforeFresh);
    const freshRequestIndexes = dynamic.catalogRequestsStarted.slice(requestsBeforeFresh);
    await expect.poll(() => freshRequestIndexes.every((requestIndex) => (
      dynamic.catalogResponseCompletions.includes(requestIndex)
    ))).toBe(true);
    const publishedControl = page.getByRole("button", { name: "添加目录乱序保护版本1" });
    await expect(publishedControl).toBeVisible();
    await expect.poll(() => dynamic.catalogResponseCompletions.includes(staleRequestIndex)).toBe(true);
    await expect(publishedControl).toBeVisible();
    await expect(page.getByText("目录乱序保护", { exact: true })).toBeVisible();
    expect(forbiddenPageWrites).toEqual([]);
  });

  test(`${templateEditorAcceptanceCount} 个系统模板存在未发布设计草稿时仍统一支持页面重复添加`, async ({ page }, testInfo) => {
    testInfo.setTimeout(90_000);
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });

    await openTemplateFromCatalog(page, "首屏");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    const seed = dynamic.records[0];
    for (const [index, entry] of CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.entries()) {
      if (entry.templateKey === "hero") continue;
      const contract = getContentTemplateContract(entry.moduleType)!;
      const record = structuredClone(seed);
      const templateId = `tpl_matrix_${entry.templateKey}`;
      record.id = 9_000 + index;
      record.templateId = templateId;
      record.name = contract.displayName;
      record.sourceReference = `legacy_system_${entry.templateKey}`;
      record.draft.id = 90_000 + index;
      record.draft.definition = {
        ...record.draft.definition,
        templateId,
        name: contract.displayName,
        sourceReference: record.sourceReference,
      };
      record.draft.definitionChecksum = `draft-${templateId}-r1`;
      dynamic.records.push(record);
    }

    await page.getByRole("button", { name: "页面装修" }).click();
    await page.evaluate(() => window.dispatchEvent(new Event("haichuan:dynamic-template-server-changed")));

    const pageLibrary = page.getByRole("complementary", { name: "模板组件库" });
    const cards = pageLibrary.locator('[data-template-catalog-card="shared"]');
    await expect(cards).toHaveCount(CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.length);
    const controls = cards.locator(".homepage-editor__template-card-main");
    await expect(controls).toHaveCount(CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.length);

    for (let index = 0; index < CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.length; index += 1) {
      const control = controls.nth(index);
      await expect(control).not.toHaveAttribute("aria-disabled", "true");
      await expect(control).toHaveAttribute("draggable", "true");
      await control.click();
    }

    await expect(page.locator(".homepage-editor__layer-item"))
      .toHaveCount(CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.length);
    await expect(page.getByRole("group", { name: "店铺装修工作模式切换" }))
      .toHaveAttribute("data-active-mode", "page");
    await expect(page.locator(".template-editor__toolbar")).toHaveCount(0);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("统一母模板移入回收站后从普通目录隐藏且只能在回收站恢复", async ({ page }) => {
    // 本用例只验目录生命周期；保持属性面板收起，避免跨工作区切换时让
    // Inspector 的 iframe 几何观察参与目录菜单结果。
    await page.addInitScript(() => {
      sessionStorage.setItem("template-editor-inspector-collapsed", "1");
    });
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });

    await openTemplateFromCatalog(page, "首屏");
    const templateLibrary = page.getByRole("complementary", { name: "模板组件库" });
    const inactiveControl = templateLibrary
      .locator('.homepage-editor__template-card-main[aria-pressed="false"]')
      .first();
    const inactiveMoreButton = inactiveControl.locator("xpath=..").getByRole("button", {
      name: /更多模板操作：/,
    });
    await inactiveMoreButton.click();
    await expect(page.getByRole("menuitem", { name: "首次保存后可移入回收站" }))
      .toBeVisible();
    await expect(inactiveControl).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("Escape");
    const initialMoreButton = templateLibrary.getByRole("button", { name: "更多模板操作：首屏" });
    const initialCard = page.getByRole("button", { name: "正在编辑首屏模板" })
      .locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    await expect(initialMoreButton).toHaveCSS("width", "32px");
    await expect(initialMoreButton).toHaveCSS("height", "32px");
    await expect(initialCard.locator(".homepage-editor__template-design-actions")).toHaveCount(0);
    await expect(initialCard).not.toContainText("首次保存后可移入回收站");
    await initialMoreButton.click();
    const initialArchiveGuidance = page.getByRole("menuitem", {
      name: "首次保存后可移入回收站",
    }).filter({ visible: true }).last();
    await expect(initialArchiveGuidance).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    const savedMoreButton = templateLibrary.getByRole("button", { name: "更多模板操作：首屏" });
    await savedMoreButton.focus();
    await savedMoreButton.press("Enter");
    await expect(page.getByRole("menuitem", { name: "移入回收站" }).filter({ visible: true }))
      .toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();

    await templateLibrary.getByRole("button", { name: "更多模板操作：首屏" }).click();
    await page.getByRole("menuitem", { name: "移入回收站" }).filter({ visible: true }).click();
    const archiveDialog = page.getByRole("dialog", { name: "将模板“首屏”移入回收站？" });
    await expect(archiveDialog).toContainText("模板将从组件库隐藏");
    await expect(archiveDialog).toContainText("已有页面和已发布版本保持不变");
    await archiveDialog.getByRole("button", { name: "移入回收站" }).click();
    await expect(page.getByText("模板“首屏”已移入回收站")).toBeVisible();

    const archived = dynamic.records[0];
    await expect(templateLibrary.getByRole("button", { name: /首屏模板/ })).toHaveCount(0);
    await templateLibrary.getByRole("button", { name: "打开模板回收站" }).click();
    await expect(templateLibrary.getByRole("heading", { name: "模板回收站" })).toBeVisible();
    const archivedControl = page.getByRole("button", { name: "回收站模板“首屏”，恢复后才能设计" });
    await expect(archivedControl).toHaveAttribute("aria-disabled", "true");
    await expect(archivedControl.locator("xpath=ancestor::*[@data-template-catalog-card='shared']")
      .locator(".homepage-editor__template-card-status"))
      .toHaveText("已移入回收站 · v1");
    const archivedMoreButton = templateLibrary.getByRole("button", { name: "更多模板操作：首屏" });
    await archivedMoreButton.focus();
    await archivedMoreButton.press("Enter");
    await expect(page.getByRole("menuitem", { name: "恢复模板" }).filter({ visible: true }))
      .toBeVisible();
    await expect(page.getByRole("menuitem", { name: "永久删除不可用" }).filter({ visible: true }))
      .toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
    expect(dynamic.versionsByTemplateId.get(archived.templateId)).toHaveLength(1);

    await page.getByRole("button", { name: "页面装修" }).click();
    const pageLibrary = page.getByRole("complementary", { name: "模板组件库" });
    await expect(pageLibrary.locator('[data-template-identity="source:legacy_system_hero"]')).toHaveCount(0);
    await expect(page.getByRole("button", {
      name: "首屏：点击添加到页面末尾，也可拖到画布指定位置",
    })).toHaveCount(0);
    await expect(page.getByRole("button", {
      name: "首屏模板草稿尚未发布，暂时不能添加到页面",
    })).toHaveCount(0);

    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "打开模板回收站" }).click();
    await page.getByRole("button", { name: "更多模板操作：首屏" }).click();
    await page.getByRole("menuitem", { name: "恢复模板" }).click();
    const restoreDialog = page.getByRole("dialog", { name: "恢复模板“首屏”？" });
    await expect(restoreDialog).toContainText("已有页面实例不会被修改");
    await restoreDialog.getByRole("button", { name: "恢复模板" }).click();
    await expect(page.getByText("模板“首屏”已恢复")).toBeVisible();
    await expect(page.getByRole("button", { name: "回收站模板“首屏”，恢复后才能设计" }))
      .toHaveCount(0);
    await page.getByRole("button", { name: "返回模板库" }).click();
    await expect(page.getByRole("button", { name: "正在编辑首屏模板" })).toBeVisible();
    await expect(page.getByRole("button", { name: /正在编辑首屏模板/ })
      .locator("xpath=ancestor::*[@data-template-catalog-card='shared']")
      .locator(".homepage-editor__template-card-status"))
      .toHaveText("已发布 · v1");

    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(page.getByRole("button", { name: "添加首屏版本1" })).toBeVisible();
    expect(dynamic.versionsByTemplateId.get(archived.templateId)).toHaveLength(1);
    expect(dynamic.writes.filter((write) => /\/(?:archive|restore)$/.test(write.pathname)))
      .toHaveLength(2);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("粗指针可直接打开首次保存前、已保存、已发布与回收站模板菜单", async ({ browser }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL;
    if (typeof baseURL !== "string") throw new Error("Playwright 项目缺少 baseURL");
    const touchContext = await browser.newContext({
      baseURL,
      hasTouch: true,
      viewport: { width: 1024, height: 900 },
    });
    const page = await touchContext.newPage();
    try {
      const { forbiddenPageWrites } = await openWorkspaceShell(page, {
        role: "SUPER_ADMIN",
        draft: makeEmptyDraft(),
      });
      await openTemplateFromCatalog(page, "首屏");
      const templateLibrary = page.getByRole("complementary", { name: "模板组件库" });

      const inactiveControl = templateLibrary
        .locator('.homepage-editor__template-card-main[aria-pressed="false"]')
        .first();
      const inactiveCard = inactiveControl.locator("xpath=..");
      const unsavedMoreButton = inactiveCard.getByRole("button", { name: /更多模板操作：/ });
      await expect(unsavedMoreButton).toHaveCSS("pointer-events", "auto");
      await expect(unsavedMoreButton).toHaveCSS("opacity", "0.96");
      await unsavedMoreButton.tap();
      await expect(page.getByRole("menuitem", { name: "首次保存后可移入回收站" }).filter({ visible: true }))
        .toBeVisible();
      await expect(inactiveControl).toHaveAttribute("aria-pressed", "false");
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "保存模板", exact: true }).click();
      await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
      const savedMoreButton = templateLibrary.getByRole("button", { name: "更多模板操作：首屏" });
      await savedMoreButton.tap();
      await expect(page.getByRole("menuitem", { name: "移入回收站" }).filter({ visible: true }))
        .toBeVisible();
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "发布模板新版本" }).click();
      await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();
      await savedMoreButton.tap();
      await page.getByRole("menuitem", { name: "移入回收站" }).filter({ visible: true }).click();
      const archiveDialog = page.getByRole("dialog", { name: "将模板“首屏”移入回收站？" });
      await archiveDialog.getByRole("button", { name: "移入回收站" }).click();
      await expect(page.getByText("模板“首屏”已移入回收站")).toBeVisible();

      await templateLibrary.getByRole("button", { name: "打开模板回收站" }).click();
      const archivedMoreButton = templateLibrary.getByRole("button", { name: "更多模板操作：首屏" });
      await archivedMoreButton.tap();
      await expect(page.getByRole("menuitem", { name: "恢复模板" }).filter({ visible: true }))
        .toBeVisible();
      await expect(page.getByRole("menuitem", { name: "永久删除不可用" }).filter({ visible: true }))
        .toHaveAttribute("aria-disabled", "true");
      expect(forbiddenPageWrites).toEqual([]);
    } finally {
      await touchContext.close();
    }
  });

  test("390 粗指针可创建 Product Slot，未显式保存前保持模板与页面零写入", async ({ browser }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL;
    if (typeof baseURL !== "string") throw new Error("Playwright 项目缺少 baseURL");
    const touchContext = await browser.newContext({
      baseURL,
      hasTouch: true,
      viewport: { width: 390, height: 844 },
    });
    const page = await touchContext.newPage();
    try {
      const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
        role: "SUPER_ADMIN",
        draft: makeEmptyDraft(),
      });
      await page.getByRole("button", { name: "模板设计", exact: true }).tap();
      const catalogEntry = page.getByRole("button", { name: "展开模板组件库", exact: true });
      if (await catalogEntry.isVisible()) await catalogEntry.tap();
      await page.getByRole("button", { name: "新建模板", exact: true }).tap();
      const structureEntry = page.getByRole("button", { name: "展开模板结构面板", exact: true });
      if (await structureEntry.isVisible()) await structureEntry.tap();
      const structure = page.getByRole("complementary", { name: "模板结构", exact: true });
      await structure.getByRole("button", { name: "添加槽位", exact: true }).tap();
      await page.getByRole("dialog", { name: "添加槽位", exact: true })
        .getByRole("button", { name: "添加商品槽位", exact: true })
        .tap();
      await expect(structure.getByRole("treeitem", { name: /商品槽位 商品内容 可选/ }))
        .toBeVisible();
      await expect(page.frameLocator(".template-editor__viewport-frame")
        .locator('[data-template-node-type="ProductSlot"]'))
        .toBeVisible();
      expect(dynamic.writes).toEqual([]);
      expect(forbiddenPageWrites).toEqual([]);
    } finally {
      await touchContext.close();
    }
  });

  test("CUSTOM 草稿必须先移入回收站，才能在回收站永久删除", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    await fillTemplateName(page, "待删除试验草稿");
    await addTemplateStructureNode(page, "标题槽位 内容槽位");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    expect(dynamic.records).toHaveLength(1);

    const templateLibrary = page.getByRole("complementary", { name: "模板组件库" });
    const templateMoreButton = templateLibrary.getByRole("button", {
      name: "更多模板操作：待删除试验草稿",
    });
    await expect(templateMoreButton).toBeVisible();
    await openTemplateInspectorPanel(page, "基本");
    await page.getByRole("textbox", { name: "节点名称" }).fill("尚未保存的标题槽位名称");
    await openTemplateCatalogMoreMenu(templateMoreButton);
    await page.getByRole("menuitem", { name: "移入回收站" }).click();
    const blockedTrashDialog = page.getByRole("dialog", {
      name: "将模板“待删除试验草稿”移入回收站？",
    });
    await blockedTrashDialog.getByRole("button", { name: "移入回收站" }).click();
    await expect(page.getByText("请先保存草稿或放弃未保存修改，再将当前模板移入回收站。"))
      .toBeVisible();
    await expect(blockedTrashDialog).toHaveCount(0);
    expect(dynamic.writes.filter((write) => write.method === "DELETE")).toEqual([]);

    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "放弃未保存修改" }).click();
    const discardDialog = page.getByRole("dialog", {
      name: "放弃“待删除试验草稿”的未保存修改？",
    });
    await discardDialog.getByRole("button", { name: "放弃未保存修改" }).click();
    await expect(discardDialog).toHaveCount(0);
    await expect.poll(async () => (await readZ4Session(page)).dirty).toBe(false);

    await openTemplateCatalogMoreMenu(templateMoreButton);
    await page.getByRole("menuitem", { name: "移入回收站" }).click();
    const trashDialog = page.getByRole("dialog", { name: "将模板“待删除试验草稿”移入回收站？" });
    const archivedResponse = page.waitForResponse((response) =>
      response.url().endsWith("/archive") && response.request().method() === "POST",
    );
    await trashDialog.getByRole("button", { name: "移入回收站" }).click();
    expect((await archivedResponse).status()).toBe(200);
    await expect(trashDialog).toHaveCount(0);
    await expect(page.getByText("模板“待删除试验草稿”已移入回收站")).toBeVisible();
    expect(dynamic.records[0].status).toBe("ARCHIVED");
    expect(dynamic.writes.filter((write) => write.method === "DELETE")).toEqual([]);
    await expect(templateLibrary.getByRole("button", { name: /待删除试验草稿模板/ })).toHaveCount(0);

    await templateLibrary.getByRole("button", { name: "打开模板回收站" }).click();
    await openTemplateCatalogMoreMenu(templateLibrary.getByRole("button", {
      name: "更多模板操作：待删除试验草稿",
    }));
    await page.getByRole("menuitem", { name: "永久删除模板" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "永久删除模板“待删除试验草稿”？" });
    await expect(deleteDialog).toContainText("永久删除后无法恢复");
    await expect(deleteDialog).toContainText("没有版本历史且未被页面引用");
    await deleteDialog.getByRole("button", { name: "永久删除模板" }).click();

    await expect(page.getByText("模板“待删除试验草稿”已永久删除")).toBeVisible();
    expect(dynamic.records).toHaveLength(0);
    expect(dynamic.writes.at(-1)).toMatchObject({
      method: "DELETE",
      pathname: expect.stringMatching(/\/api\/page-modules\/dynamic-templates\/tpl_/),
    });
    await expect(page.getByRole("button", { name: "回收站模板“待删除试验草稿”，恢复后才能设计" }))
      .toHaveCount(0);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("移入回收站失败时保留当前设计会话与可用状态", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
      archiveFailures: 1,
    });

    await openTemplateFromCatalog(page, "首屏");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    await page.getByRole("button", { name: "更多模板操作：首屏" }).click();
    await page.getByRole("menuitem", { name: "移入回收站" }).click();
    const archiveDialog = page.getByRole("dialog", { name: "将模板“首屏”移入回收站？" });
    await archiveDialog.getByRole("button", { name: "移入回收站" }).click();

    await expect(page.getByText("移入回收站失败，当前模板仍保留")).toBeVisible();
    await expect(archiveDialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "保存模板", exact: true })).toBeVisible();
    expect(dynamic.records[0].status).toBe("ACTIVE");
    expect(dynamic.writes.filter((write) => write.pathname.endsWith("/archive"))).toEqual([]);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("首屏预览素材失效时目录保留只读失败态，设计画布保留中性编辑空态", async ({ page }) => {
    const failedPreviewImages: string[] = [];
    await page.route("**/neutral-template-preview-v1/*.svg*", (route) => {
      // Vite 将这些 SVG 内联为 data URL；只替换素材模块的 URL，再让浏览器真实请求失败。
      if (route.request().resourceType() !== "image") {
        return route.fulfill({
          contentType: "application/javascript",
          body: 'export default "/__t3-preview-unavailable.svg";',
        });
      }
      return route.abort("failed");
    });
    await page.route("**/__t3-preview-unavailable.svg", (route) => {
      failedPreviewImages.push(new URL(route.request().url()).pathname);
      return route.abort("failed");
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, { role: "SUPER_ADMIN" });

    await page.getByRole("button", { name: "模板设计" }).click();
    const catalogCard = page.getByRole("button", { name: "正在编辑首屏模板" })
      .locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    const catalogHero = catalogCard
      .frameLocator('iframe[data-template-catalog-viewport="desktop"]')
      .locator('[data-content-template="hero"]');
    await expect.poll(() => failedPreviewImages.length).toBeGreaterThan(0);
    await expect(catalogHero.getByRole("img").filter({ hasText: "主视觉图片暂不可用" })).toBeVisible();
    await expect(catalogHero.locator('[data-asset-placeholder-status]')).toHaveCount(0);
    await expect.poll(() => catalogHero.evaluate((node) => getComputedStyle(node).backgroundColor))
      .toBe("rgb(247, 248, 248)");

    const frame = page.frameLocator(".template-editor__viewport-frame");
    const canvasHero = frame.locator('[data-content-template="hero"]');
    const canvasPlaceholder = canvasHero.locator(
      '[data-asset-placeholder-status="waiting-final-asset"]',
    );
    await expect(canvasPlaceholder).toBeVisible();
    await expect(canvasHero.locator(".hc-phase1-hero__copy-shade")).toHaveCount(0);
    await expect(canvasHero.locator('.hc-phase1-hero__copy[data-tone="dark"]')).toBeVisible();
    await expect.poll(() => canvasHero.evaluate((node) => getComputedStyle(node).backgroundColor))
      .toBe("rgb(247, 248, 248)");

    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    const mobileCatalogHero = catalogCard
      .frameLocator('iframe[data-template-catalog-viewport="mobile"]')
      .locator('[data-content-template="hero"]');
    await expect(mobileCatalogHero.getByRole("img").filter({ hasText: "主视觉图片暂不可用" })).toBeVisible();
    await expect(mobileCatalogHero.locator('[data-asset-placeholder-status]')).toHaveCount(0);
    const mobileCanvasHero = frame.locator('[data-content-template="hero"]');
    const mobileCanvasPlaceholder = mobileCanvasHero.locator(
      '[data-asset-placeholder-status="waiting-final-asset"]',
    );
    await expect(mobileCanvasPlaceholder).toBeVisible();
    await expect(mobileCanvasHero.locator(".hc-phase1-hero__copy-shade")).toHaveCount(0);
    await expect(mobileCanvasHero.locator('.hc-phase1-hero__copy[data-tone="dark"]')).toBeVisible();
    await expect.poll(() => mobileCanvasHero.evaluate((node) => getComputedStyle(node).backgroundColor))
      .toBe("rgb(247, 248, 248)");
    expect(failedPreviewImages.length).toBeGreaterThan(0);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("统一目录不可用时失败关闭且不读取旧目录", async ({ page }) => {
    const catalogReads: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") return;
      const pathname = new URL(request.url()).pathname;
      if (
        pathname.endsWith("/page-modules/dynamic-templates/catalog")
        || pathname.endsWith("/page-modules/dynamic-templates/mine")
        || pathname.endsWith("/page-modules/dynamic-templates/published")
        || pathname.endsWith("/page-modules/personal-content-templates")
        || pathname.endsWith("/page-modules/system-content-templates")
      ) catalogReads.push(pathname);
    });

    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      unifiedCatalogUnavailable: true,
    });
    await page.getByRole("button", { name: "模板设计" }).click();

    const library = page.getByRole("complementary", { name: "模板组件库" });
    await expect(library.locator(".unified-template-library__card"))
      .toHaveCount(0);
    await expect(library.getByText("模板目录暂时无法读取", { exact: false })).toBeVisible();
    await expect(library.getByRole("button", { name: "重新读取" })).toBeVisible();
    expect(catalogReads.some((path) => path.endsWith("/dynamic-templates/catalog"))).toBe(true);
    expect(catalogReads.some((path) => path.endsWith("/dynamic-templates/mine"))).toBe(false);
    expect(catalogReads.some((path) => path.endsWith("/dynamic-templates/published"))).toBe(false);
    expect(catalogReads.some((path) => path.endsWith("/personal-content-templates"))).toBe(false);
    expect(catalogReads.some((path) => path.endsWith("/system-content-templates"))).toBe(false);
  });

  test("页面装修与模板设计共用相同垂直工作台高度", async ({ page }) => {
    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      viewport: { width: 1920, height: 948 },
    });
    const pageVerticalChrome = await readWorkspaceVerticalChrome(
      page,
      ".homepage-editor__page-workspace",
    );

    await page.getByRole("button", { name: "模板设计" }).click();
    await expect(page.locator(".template-editor__body")).toBeVisible();
    const templateVerticalChrome = await readWorkspaceVerticalChrome(
      page,
      ".template-editor__body",
    );

    expect(pageVerticalChrome).toEqual({
      appHeaderHeight: 60,
      panelHeaderHeights: [44],
      canvasTopChromeHeight: 58,
    });
    expect(templateVerticalChrome).toEqual(pageVerticalChrome);
  });

  test("进入模板设计默认打开首屏，并复用相同顶部控件几何与状态规范", async ({ page }) => {
    const unifiedCatalogReads: string[] = [];
    const legacyCurrentTemplateReads: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (request.method() === "GET" && pathname.endsWith("/dynamic-templates/catalog")) {
        unifiedCatalogReads.push(pathname);
      }
      if (request.method() === "GET" && pathname.endsWith("/system-content-templates/hero")) {
        legacyCurrentTemplateReads.push(pathname);
      }
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
    const pageGeometry = await readSharedToolbarGeometry(page);
    const pageTabs = page.getByRole("group", { name: "店铺装修工作模式切换" });
    await expect(pageTabs).toHaveAttribute("data-active-mode", "page");
    await expect(pageTabs.getByRole("button")).toHaveText("进入模板设计");
    await expect(pageTabs.getByRole("button")).toHaveCount(1);

    await page.evaluate(() => {
      const observed: string[] = [];
      (window as any).__templateCanvasSizeSamples = observed;
      let remainingFrames = 120;
      const sample = () => {
        document.querySelectorAll<HTMLElement>('[aria-label^="画布尺寸 "]')
          .forEach((element) => observed.push(element.getAttribute("aria-label") ?? ""));
        remainingFrames -= 1;
        if (remainingFrames > 0) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    await pageTabs.getByRole("button", { name: "模板设计" }).click();
    await expect(page.getByRole("region", { name: /模板(?:设计)?画布/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "正在编辑首屏模板" })).toBeVisible();
    await expect(page.getByRole("region", { name: "空模板画布" })).toHaveCount(0);
    const templateGeometry = await readSharedToolbarGeometry(page);
    const templateTabs = page.getByRole("group", { name: "店铺装修工作模式切换" });
    await expect(templateTabs).toHaveAttribute("data-active-mode", "template");
    await expect(templateTabs.getByRole("button")).toHaveText("返回页面装修");
    await expect(templateTabs.getByRole("button")).toHaveCount(1);
    const initialSave = page.getByRole("button", { name: "保存模板", exact: true });
    await expect(initialSave).toBeEnabled();
    await expect(initialSave).toHaveAttribute("title", /首次保存后建立可管理的模板草稿/);
    const initialSaveStatus = page.getByRole("status", { name: "模板状态：尚未建立模板草稿" });
    await expect(initialSaveStatus).toContainText("首次保存后可管理");
    const initialPublish = page.getByRole("button", {
      name: "发布模板新版本（将先保存当前模板草稿）",
    });
    await expect(initialPublish).toBeEnabled();
    await expect(initialPublish).toHaveAttribute("title", /先保存当前模板草稿.*现有页面仍保持原版本/);
    await expect(page.locator('.template-editor__canvas-view-readout[aria-label^="画布尺寸 1920 × 1200，缩放 "]')).toBeVisible();
    const canvasSizeSamples = await page.evaluate(() => [
      ...new Set((window as any).__templateCanvasSizeSamples as string[]),
    ]);
    expect(canvasSizeSamples.some((label) => label.startsWith("画布尺寸 1920 × 240，"))).toBe(false);
    await expect.poll(() => unifiedCatalogReads.length).toBeGreaterThan(0);
    expect(legacyCurrentTemplateReads).toEqual([]);
    expectSharedToolbarGeometryCompatible(pageGeometry, templateGeometry);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("选择模板对象后持续显示对象、设备、保存目标和页面影响", async ({ page }) => {
    await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
    await page.getByRole("button", { name: "模板设计" }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await expect(inspector).toContainText("当前对象 · 模板容器");
    await expect(inspector.locator(".template-editor__inspector-breadcrumb")).toHaveText("母模板草稿");
    await expect(inspector.getByRole("region", { name: "模板属性功能区" })).toBeVisible();
    await openTemplateInspectorPanel(page, "规则");
    await expect(inspector.getByRole("tabpanel", { name: "发布设置" })).toBeVisible();

    const structure = page.getByRole("complementary", { name: "模板结构" });
    await structure.getByRole("treeitem", { name: /主视觉图片 图片槽位 必填/ }).click();
    await expect(inspector).toContainText("当前对象 · 图片槽位");
    await expect(inspector.locator(".homepage-editor__inspector-title")).toHaveText("桌面主图");
    await expect(inspector).toContainText("桌面端");
    await openTemplateInspectorPanel(page, "基本");
    await expect(inspector.getByRole("tabpanel", { name: "对象职责" })).toContainText("页面装修");

    await page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端模板布局/ }).click();
    await expect(inspector.locator(".homepage-editor__inspector-title")).toHaveText("移动端主图");
    await expect(inspector).toContainText("移动端");
    await expect(inspector.getByRole("tabpanel", { name: "对象职责" })
      .getByText("移动端", { exact: true })).toBeVisible();
  });

  test("桌面固定比例不继承折叠偏好，窄屏仍提供覆盖式面板", async ({ page }) => {
    await page.addInitScript(() => {
      if (window !== window.top) return;
      for (const key of [
        "homepage-editor-library-collapsed",
        "homepage-editor-inspector-collapsed",
        "template-editor-structure-collapsed",
        "template-editor-inspector-collapsed",
      ]) {
        sessionStorage.setItem(key, "1");
      }
    });
    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      viewport: { width: 1600, height: 900 },
    });

    const pageWorkspace = page.locator(".homepage-editor__page-workspace");
    await expect(pageWorkspace.locator(".admin-panel-collapse-toggle")).toHaveCount(0);
    await expect(pageWorkspace.locator(".homepage-editor__library")).not.toHaveClass(/homepage-editor__library--collapsed/);
    await expect(pageWorkspace.locator(".homepage-editor__structure-workspace")).not.toHaveClass(/is-collapsed/);
    await expect(pageWorkspace.locator(".homepage-editor__right-workspace")).not.toHaveClass(/is-inspector-collapsed/);

    await page.getByRole("button", { name: "模板设计" }).click();
    const templateWorkspace = page.locator(".template-editor__body");
    await expect(page.getByRole("region", { name: /模板(?:设计)?画布/ })).toBeVisible();
    await expect(templateWorkspace.locator(".admin-panel-collapse-toggle")).toHaveCount(0);
    await expect(templateWorkspace.locator(".homepage-editor__library")).not.toHaveClass(/homepage-editor__library--collapsed/);
    await expect(templateWorkspace.locator(".homepage-editor__structure-workspace")).not.toHaveClass(/is-collapsed/);
    await expect(templateWorkspace.locator(".homepage-editor__right-workspace")).not.toHaveClass(/is-inspector-collapsed/);
    await expect.poll(() => page.evaluate(() => ({
      structure: sessionStorage.getItem("template-editor-structure-collapsed"),
      inspector: sessionStorage.getItem("template-editor-inspector-collapsed"),
    }))).toEqual({ structure: "0", inspector: "0" });

    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(templateWorkspace.locator(".admin-panel-collapse-toggle").first()).toBeVisible();
  });

  test("1024 下模板目录与属性抽屉管理焦点，关闭后保留模板和页面各自选择", async ({ page }) => {
    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
    });
    await page.locator(".homepage-editor__page-workspace .homepage-editor__layer-select").first().click();
    await page.setViewportSize({ width: 1024, height: 768 });
    const pageInspectorEntry = page.getByRole("button", { name: "展开属性面板" });
    await expect(pageInspectorEntry).toContainText("属性");
    await pageInspectorEntry.click();
    const pageInspectorDrawer = page.getByRole("dialog", { name: "属性面板" });
    const selectedPageContext = pageInspectorDrawer
      .getByRole("region", { name: "当前编辑对象" });
    await expect(selectedPageContext).toBeVisible();
    const selectedPageModule = (await selectedPageContext
      .locator("strong")
      .first()
      .textContent())?.trim();
    if (!selectedPageModule) throw new Error("页面属性抽屉缺少当前选中模块");
    await page.keyboard.press("Escape");
    await expect(pageInspectorEntry).toBeFocused();

    await page.getByRole("button", { name: "模板设计" }).click();
    const catalogEntry = page.getByRole("button", { name: "展开模板组件库" });
    await expect(catalogEntry).toBeVisible();
    await catalogEntry.focus();
    await catalogEntry.click();
    const catalogDrawer = page.getByRole("dialog", { name: "模板设计模板目录" });
    await expect(catalogDrawer).toHaveAttribute("aria-modal", "true");
    await expect(catalogDrawer.getByRole("button", { name: "收起模板组件库" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(catalogEntry).toBeFocused();

    await catalogEntry.click();
    const firstTemplate = catalogDrawer.getByRole("button", { name: /(?:打开|正在编辑).+模板/ }).first();
    const templateName = (await firstTemplate.getAttribute("aria-label"))
      ?.replace(/^(?:打开|正在编辑)/, "")
      .replace(/模板.*$/, "")
      .trim();
    await firstTemplate.click();
    await expect(catalogEntry).toBeFocused();
    if (!templateName) throw new Error("模板目录卡片缺少可访问模板名称");
    await expect(page.getByLabel(`当前模板：${templateName}`)).toBeVisible();

    const templateInspectorEntry = page.getByRole("button", { name: "展开模板属性面板" });
    await expect(templateInspectorEntry).toContainText("属性");
    await templateInspectorEntry.click();
    const templateInspectorDrawer = page.getByRole("dialog", { name: "模板属性工作区" });
    await expect(templateInspectorDrawer).toHaveAttribute("aria-modal", "true");
    await expect(templateInspectorDrawer.getByRole("button", { name: "收起模板属性面板" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(templateInspectorEntry).toBeFocused();
    await expect(page.getByLabel(`当前模板：${templateName}`)).toBeVisible();

    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(pageInspectorEntry).toBeVisible();
    await pageInspectorEntry.click();
    await expect(pageInspectorDrawer.getByRole("region", { name: "当前编辑对象" }))
      .toContainText(selectedPageModule);
  });

  test("390 下持续显示工作区、切换入口、状态与完整模板名称且无横向溢出", async ({ page }) => {
    await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
    const workspace = page.getByRole("group", { name: "店铺装修工作模式切换" });
    await workspace.getByRole("button", { name: "模板设计" }).click();
    const desktopTemplate = page.locator(".template-editor__workspace-subject");
    await expect(desktopTemplate).toBeVisible();
    const desktopTemplateName = (await desktopTemplate.locator("strong").textContent())?.trim();
    if (!desktopTemplateName) throw new Error("桌面端模板工作区缺少当前模板名称");
    await expect(desktopTemplate).toHaveAttribute("aria-label", `当前模板：${desktopTemplateName}`);
    await workspace.getByRole("button", { name: "页面装修" }).click();
    await page.locator(".homepage-editor__page-workspace .homepage-editor__layer-select").first().click();
    await page.setViewportSize({ width: 390, height: 844 });

    await expect(workspace).toBeVisible();
    await expect(workspace.getByLabel("当前工作区：页面装修")).toBeVisible();
    await expect(workspace.getByRole("button", { name: "模板设计" })).toBeVisible();
    await expect(page.locator(".homepage-editor__workspace-status:visible")).toHaveCount(1);
    const pageInspectorEntry = page.getByRole("button", { name: "展开属性面板" });
    await pageInspectorEntry.click();
    await expect(page.getByRole("dialog", { name: "属性面板" })
      .getByRole("button", { name: "收起属性面板" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(pageInspectorEntry).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    await workspace.getByRole("button", { name: "模板设计" }).click();
    await expect(workspace.getByLabel("当前工作区：模板设计")).toBeVisible();
    await expect(workspace.getByRole("button", { name: "页面装修" })).toBeVisible();
    const currentTemplate = page.locator(".template-editor__workspace-subject");
    await expect(currentTemplate).toBeVisible();
    const fullName = await currentTemplate.locator("strong").textContent();
    if (!fullName) throw new Error("模板工作区缺少当前模板名称");
    await expect(currentTemplate).toHaveAttribute("aria-label", `当前模板：${fullName}`);
    await expect(page.locator(".template-editor__toolbar .homepage-editor__workspace-status")).toBeVisible();
    await expect(page.getByRole("button", { name: "展开模板组件库" })).toBeVisible();
    const templateInspectorEntry = page.getByRole("button", { name: "展开模板属性面板" });
    await expect(templateInspectorEntry).toBeVisible();
    await templateInspectorEntry.click();
    await expect(page.getByRole("dialog", { name: "模板属性工作区" })
      .getByRole("button", { name: "收起模板属性面板" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(templateInspectorEntry).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test("1024 下 clean、dirty、saving 状态持续可见且保存恢复动作可达", async ({ page }) => {
    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draftSaveResponseDelays: [700],
    });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "展开模板属性面板" }).click();
    const inspector = await openTemplateBasicInfo(page);
    const name = inspector.getByRole("textbox", { name: "模板名称", exact: true });
    await name.fill("窄屏状态可达模板");
    await expect(page.getByRole("status", { name: "模板状态：有未保存修改" })).toBeVisible();
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByRole("status", { name: "模板状态：模板草稿已保存" }))
      .toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "保存模板", exact: true })).toBeDisabled();

    await name.fill("窄屏状态可达模板 2");
    await expect(page.getByRole("status", { name: "模板状态：有未保存修改" })).toBeVisible();
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByRole("status", { name: "模板状态：正在保存模板" })).toBeVisible();
    await expect(page.getByRole("status", { name: "模板状态：模板草稿已保存" }))
      .toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "保存模板", exact: true })).toBeDisabled();
  });

  for (const mode of ["page", "template"] as const) {
    test(`T4-A ${mode} 最终 1px ResizeObserver 尺寸不能被 fit 阈值吞掉`, async ({ page }, testInfo) => {
      await openWorkspaceShell(page, { role: "SUPER_ADMIN", viewport: { width: 1500, height: 900 } });
      if (mode === "template") await page.getByRole("button", { name: "模板设计" }).click();
      const body = page.locator(".homepage-editor__body:visible").last();
      const read = () => body.evaluate((element, template) => {
        const stage = element.querySelector<HTMLElement>(".homepage-editor__canvas-scroll")!;
        const scaled = element.querySelector<HTMLElement>(template
          ? ".template-editor__viewport-frame" : ".homepage-editor__canvas-scale")!;
        return { width: stage.clientWidth, source: Number.parseFloat(scaled.style.width),
          scale: new DOMMatrixReadOnly(scaled.style.transform).a };
      }, mode === "template");
      await expect(body.locator(mode === "template" ? ".template-editor__viewport-frame" : ".homepage-editor__canvas-scale"))
        .toHaveCSS("transform", /matrix\(/);
      const before = await read();
      await body.locator(".homepage-editor__canvas-scroll").evaluate((element) => {
        const widths: number[] = [];
        const observer = new ResizeObserver(() => widths.push(element.clientWidth));
        observer.observe(element);
        Object.assign(window, { t4aFitObservation: { widths, observer } });
      });
      try {
        await page.setViewportSize({ width: 1501, height: 900 });
        await expect.poll(async () => (await read()).width).toBe(before.width + 1);
        await expect.poll(async () => {
          const value = await read();
          return Math.abs(value.scale * value.source - (value.width - 48));
        }).toBeLessThan(0.001);
      } finally {
        const observation = await page.evaluate(() => {
          const value = (window as unknown as { t4aFitObservation: { widths: number[]; observer: ResizeObserver } }).t4aFitObservation;
          value.observer.disconnect();
          return value.widths;
        });
        await testInfo.attach("final-resize-observation.json", {
          body: JSON.stringify({ mode, before, after: await read(), observedWidths: observation }),
          contentType: "application/json",
        });
      }
    });
  }

  for (const width of [1280, 1500, 1720]) {
    test(`T4-A ${width}px 两模式 dock 动画往返五次精确恢复实际缩放`, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      await openWorkspaceShell(page, { role: "SUPER_ADMIN", viewport: { width, height: 900 } });
      const evidence: unknown[] = [];
      for (const mode of ["page", "template"] as const) {
        if (mode === "template") {
          await page.getByRole("button", { name: "模板设计" }).click();
          await expect(page.getByRole("region", { name: /模板设计画布/ })).toBeVisible();
        }
        const body = page.locator(".homepage-editor__body:visible").last();
        const expand = body.getByRole("button", { name: "展开模板组件库", exact: true });
        if (await expand.isVisible()) await expand.click();
        const read = () => body.evaluate((element, template) => {
          const stage = element.querySelector<HTMLElement>(".homepage-editor__canvas-scroll")!;
          const scaled = element.querySelector<HTMLElement>(template
            ? ".template-editor__viewport-frame" : ".homepage-editor__canvas-scale")!;
          return { width: stage.clientWidth, outerWidth: stage.getBoundingClientRect().width, source: Number.parseFloat(scaled.style.width),
            scale: new DOMMatrixReadOnly(scaled.style.transform).a };
        }, mode === "template");
        const preciseFit = () => expect.poll(async () => {
          const value = await read();
          return Math.abs(value.scale * value.source - (value.width - 48));
        }).toBeLessThan(0.001);
        const expectedWidth = width * 0.6;
        await expect.poll(async () => (await read()).outerWidth).toBe(expectedWidth);
        await preciseFit();
        const baseline = await read();
        for (const name of ["模板组件库", mode === "page" ? "图层面板" : "模板结构面板"]) {
          const dock = body.locator(name === "模板组件库" ? ":scope > .homepage-editor__library" : ":scope > .homepage-editor__structure-workspace");
          const released = (await dock.boundingBox())!.width - (name === "模板组件库" ? 80 : 40);
          for (let cycle = 0; cycle < 5; cycle += 1) {
            await body.getByRole("button", { name: `收起${name}`, exact: true }).click();
            await expect.poll(async () => (await read()).outerWidth).toBe(baseline.outerWidth + released);
            await body.getByRole("button", { name: `展开${name}`, exact: true }).click();
            await expect.poll(async () => (await read()).outerWidth).toBe(baseline.outerWidth);
            await preciseFit();
            expect((await read()).scale).toBe(baseline.scale);
            for (const selection of (await body.locator(mode === "page" ? ".homepage-editor__layer-select" : ".template-editor__slot-select").all()).slice(0, 2)) {
              await selection.click();
              expect(await read()).toEqual(baseline);
            }
            evidence.push({ mode, name, cycle, ...await read() });
          }
        }
      }
      await testInfo.attach("dock-fit-cycles.json", { body: JSON.stringify(evidence), contentType: "application/json" });
    });
  }

  for (const width of [1024, 390]) {
    test(`T4-A ${width}px 模板窄屏结构与画布鼠标命中互不遮挡`, async ({ page }, testInfo) => {
      await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
      await page.getByRole("button", { name: "模板设计" }).click();
      await page.setViewportSize({ width, height: 900 });
      const body = page.locator(".template-editor__body");
      const expand = body.getByRole("button", { name: "展开模板结构面板", exact: true });
      await expand.focus();
      await page.keyboard.press("Enter");
      const panel = page.getByRole("complementary", { name: "模板结构", exact: true });
      const assertHit = async (target: Locator) => {
        await expect(target).toBeVisible();
        await expect(target).toBeInViewport();
        await expect.poll(() => target.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return hit === element || element.contains(hit);
        })).toBe(true);
      };
      const slot = panel.getByRole("treeitem", { name: /主视觉图片/ });
      await assertHit(slot);
      const panelBox = await panel.boundingBox();
      expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(900);
      await slot.click();
      await expect(slot).toHaveAttribute("aria-selected", "true");
      const collapse = panel.getByRole("button", { name: "收起模板结构面板", exact: true });
      await assertHit(collapse);
      const inspector = body.getByRole("button", { name: "展开模板属性面板", exact: true });
      await assertHit(inspector);
      const catalog = body.getByRole("button", { name: "展开模板组件库", exact: true });
      await catalog.click();
      await expect(page.getByRole("dialog", { name: "模板设计模板目录" })).toBeVisible();
      await expect.poll(() => panel.boundingBox()).toEqual(panelBox);
      await page.keyboard.press("Escape");
      await expect(catalog).toBeFocused();
      await assertHit(slot);
      await slot.click();
      await assertHit(collapse);
      await testInfo.attach("narrow-structure-open.png", { body: await page.screenshot(), contentType: "image/png" });
      await collapse.click();
      await expect(expand).toBeVisible();
      await assertHit(inspector);
      await inspector.click();
      const drawer = page.getByRole("dialog", { name: "模板属性工作区" });
      await expect(drawer).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(inspector).toBeFocused();
      const canvasTarget = body.getByRole("button", { name: "选择模板目标 标题", exact: true });
      await assertHit(canvasTarget);
      await canvasTarget.click();
      await expect(canvasTarget).toHaveAttribute("data-overlay-hit-selected", "true");
      await expect(body.locator(".template-editor__editable-overlay-selection")).toBeVisible();
      await testInfo.attach("narrow-structure-pointer.png", { body: await page.screenshot(), contentType: "image/png" });
    });
  }

  test("1280px 共享窄结构栏的嵌套名称、状态和节点操作可达", async ({ page }, testInfo) => {
    await openWorkspaceShell(page, { role: "SUPER_ADMIN", viewport: { width: 1280, height: 900 } });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    const structure = page.getByRole("complementary", { name: "模板结构" });
    // 新建模板自带内容区域与图片/标题/正文槽位，直接使用骨架中的正文槽位。
    const slot = structure.getByRole("treeitem", { name: /正文槽位 .* 可选/ });
    await expect(slot).toHaveAttribute("aria-level", "3");
    const row = structure.locator(".template-editor__slot-row")
      .filter({ has: page.locator('.template-editor__slot-select[aria-level="3"]') });
    await slot.click();
    const before = await row.boundingBox();
    expect(before).not.toBeNull();
    await expect(row.locator(".template-editor__slot-copy small")).toHaveText("可选");
    await expect.poll(() => structure.locator(".template-editor__structure-scroll")
      .evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
    const actions = row.locator(".template-editor__slot-actions");
    for (const button of await actions.getByRole("button").all()) {
      await expect(button).toBeInViewport();
      const box = await button.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(before!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(before!.x + before!.width);
    }
    const menu = row.getByRole("button", { name: "正文槽位节点操作" });
    await menu.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "重命名" })).toBeVisible();
    await page.keyboard.press("Escape");
    await menu.click();
    await page.getByRole("menuitem", { name: "重命名" }).click();
    const name = row.getByRole("textbox");
    await expect(name).toBeFocused();
    await name.fill("共享窄栏中仍可通过键盘查看完整的多层正文槽位名称");
    await name.press("Enter");
    await expect(row.getByRole("treeitem")).toHaveAccessibleName(/共享窄栏中仍可通过键盘查看完整的多层正文槽位名称/);
    expect(await row.boundingBox()).toEqual(before);
    const controlsOverlap = await row.evaluate((element) => {
      const boxes = [...element.querySelectorAll("button")].map((button) => button.getBoundingClientRect());
      return boxes.some((box, index) => boxes.slice(index + 1).some((other) =>
        Math.min(box.right, other.right) - Math.max(box.left, other.left) > 1
        && Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 1));
    });
    expect(controlsOverlap).toBe(false);
    await row.getByRole("treeitem").focus();
    await expect(row.getByRole("group", { name: "响应式版本" })).toHaveCount(0);
    await page.keyboard.press("Tab");
    await expect(actions.getByRole("button").first()).toBeFocused();
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: "锁定槽位", exact: true }).click();
    await expect(row.getByRole("treeitem")).toHaveAccessibleName(/已锁定/);
    expect(await row.boundingBox()).toEqual(before);
    await testInfo.attach("shared-narrow-structure.png", { body: await page.screenshot(), contentType: "image/png" });
  });

  for (const viewport of [
    { width: 1200, height: 900 },
    { width: 1600, height: 900 },
    { width: 1920, height: 1200 },
  ]) {
    test(`${viewport.width}px 页面装修与模板设计固定 12/8/60/20 比例`, async ({ page }, testInfo) => {
      await page.addInitScript(() => {
        if (window !== window.top) return;
        for (const key of [
          "homepage-editor-library-collapsed",
          "homepage-editor-inspector-collapsed",
          "template-editor-structure-collapsed",
          "template-editor-inspector-collapsed",
        ]) {
          sessionStorage.setItem(key, "1");
        }
      });
      await openWorkspaceShell(page, {
        role: "SUPER_ADMIN",
        viewport: { width: viewport.width, height: viewport.height },
      });
      for (const mode of ["page", "template"] as const) {
        if (mode === "template") {
          await page.getByRole("button", { name: "模板设计" }).click();
          await expect(page.getByRole("region", { name: /模板(?:设计)?画布/ })).toBeVisible();
        }
        const body = page.locator(".homepage-editor__body:visible").last();
        await expect(body.locator(".admin-panel-collapse-toggle")).toHaveCount(0);
        const geometry = await body.evaluate((element) => {
          const outer = element.getBoundingClientRect();
          const rect = (selector: string) => element.querySelector(selector)!.getBoundingClientRect();
          const library = rect(":scope > .homepage-editor__library");
          const structure = rect(":scope > .homepage-editor__structure-workspace");
          const canvas = rect(".homepage-editor__canvas-scroll");
          const inspector = rect(":scope > .homepage-editor__right-workspace");
          return {
            outer: { left: outer.left, width: outer.width },
            library: { left: library.left, width: library.width },
            structure: { left: structure.left, width: structure.width },
            canvas: { left: canvas.left, width: canvas.width },
            inspector: { left: inspector.left, width: inspector.width },
          };
        });
        const tolerance = 0.02;
        expect(Math.abs(geometry.library.width - geometry.outer.width * 0.12)).toBeLessThan(tolerance);
        expect(Math.abs(geometry.structure.width - geometry.outer.width * 0.08)).toBeLessThan(tolerance);
        expect(Math.abs(geometry.canvas.width - geometry.outer.width * 0.6)).toBeLessThan(tolerance);
        expect(Math.abs(geometry.inspector.width - geometry.outer.width * 0.2)).toBeLessThan(tolerance);
        expect(Math.abs(
          geometry.library.width + geometry.structure.width - geometry.inspector.width,
        )).toBeLessThan(tolerance);
        expect(Math.abs(
          geometry.canvas.left + geometry.canvas.width / 2
            - (geometry.outer.left + geometry.outer.width / 2),
        )).toBeLessThan(tolerance);
        if (viewport.width === 1920) {
          await testInfo.attach(`${mode}-fixed-dock-ratio.png`, {
            body: await page.screenshot({ animations: "disabled" }),
            contentType: "image/png",
          });
        }
      }
    });
  }

  for (const viewport of [
    { width: 1200, height: 900 },
    { width: 1280, height: 900 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1600, height: 900 },
    { width: 1920, height: 1200 },
  ]) {
    test(`${viewport.width}px 两种模式共享四区 DOM 宽度且交互不改变比例`, async ({ page }, testInfo) => {
      await openWorkspaceShell(page, {
        role: "SUPER_ADMIN",
        viewport: { width: viewport.width, height: viewport.height },
      });
      const body = () => page.locator(".homepage-editor__body:visible").last();
      const readFrames = () => body().evaluate((element) => {
        const box = (selector: string) => {
          const target = element.querySelector(selector);
          if (!target) throw new Error(`缺少四区节点：${selector}`);
          const rect = target.getBoundingClientRect();
          return { x: Math.round(rect.x), width: Math.round(rect.width) };
        };
        return {
          library: box(":scope > .homepage-editor__library"),
          structure: box(":scope > .homepage-editor__structure-workspace"),
          canvas: box(".homepage-editor__canvas-scroll"),
          inspector: box(":scope > .homepage-editor__right-workspace"),
        };
      });
      const samples: Record<string, Awaited<ReturnType<typeof readFrames>>> = {};
      for (const mode of ["page", "template"] as const) {
        if (mode === "template") {
          await page.getByRole("button", { name: "模板设计" }).click();
          await expect(page.getByRole("region", { name: /模板(?:设计)?画布/ })).toBeVisible();
        }
        await expect(body().locator(".admin-panel-collapse-toggle")).toHaveCount(0);
        const expected = [0.12, 0.08, 0.2].map((ratio) => Math.round(viewport.width * ratio));
        await expect.poll(async () => {
          const frames = await readFrames();
          return [frames.library.width, frames.structure.width, frames.inspector.width];
        }).toEqual(expected);
        const expanded = await readFrames();
        expect(expanded.canvas.x).toBe(expanded.structure.x + expanded.structure.width);
        expect(expanded.canvas.x + expanded.canvas.width).toBe(expanded.inspector.x);
        expect(expanded.library.width + expanded.structure.width).toBe(expanded.inspector.width);
        expect(expanded.canvas.width).toBe(Math.round(viewport.width * 0.6));
        samples[`${mode}-expanded`] = expanded;
        const selections = body().locator(mode === "page"
          ? ".homepage-editor__layer-select"
          : ".template-editor__slot-select");
        const canvasScale = body().locator(mode === "page"
          ? ".homepage-editor__canvas-scale" : ".template-editor__viewport-frame");
        await expect(canvasScale).toHaveCSS("transform", /matrix\(/);
        const transform = await canvasScale.evaluate((element) => getComputedStyle(element).transform);
        for (const selection of (await selections.all()).slice(0, 2)) {
          await selection.click();
          await expect.poll(readFrames).toEqual(expanded);
          await expect(canvasScale).toHaveCSS("transform", transform);
        }
        if (mode === "template") expect(expanded).toEqual(samples["page-expanded"]);
      }
      await testInfo.attach("shared-dock-dom.json", {
        body: JSON.stringify(samples, null, 2), contentType: "application/json",
      });
      const structurePanel = page.getByRole("complementary", { name: "模板结构" });
      const structureFrames = await readFrames();
      for (const row of await structurePanel.locator(".template-editor__slot-row").all()) {
        const select = row.getByRole("treeitem");
        await select.scrollIntoViewIfNeeded();
        await select.click();
        await expect(row.locator(".template-editor__slot-copy small")).toHaveText(/必填|可选/);
        await expect(select).toHaveAccessibleName(/必填|可选/);
        await expect(row.getByRole("group", { name: "响应式版本" })).toHaveCount(0);
        await expect.poll(readFrames).toEqual(structureFrames);
        const bounds = await row.evaluate((element) => {
          const panel = element.closest(".template-editor__structure-scroll")!;
          const outer = panel.getBoundingClientRect();
          return [...element.querySelectorAll("button, .template-editor__slot-copy small")]
            .filter((item) => item.getClientRects().length > 0)
            .map((item) => {
            const rect = item.getBoundingClientRect();
            return rect.left >= outer.left && rect.right <= outer.right && rect.width > 0;
          });
        });
        expect(bounds.every(Boolean)).toBe(true);
        const overlap = await row.evaluate((element) => {
          const boxes = [...element.querySelectorAll("button")].map((button) => button.getBoundingClientRect());
          return boxes.some((box, index) => boxes.slice(index + 1).some((other) =>
            Math.min(box.right, other.right) - Math.max(box.left, other.left) > 1
            && Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 1));
        });
        expect(overlap).toBe(false);
      }
      await expect.poll(() => structurePanel.locator(".template-editor__structure-scroll")
        .evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
      await testInfo.attach("shared-dock-expanded.png", {
        body: await page.screenshot({ path: testInfo.outputPath("shared-dock-expanded.png") }),
        contentType: "image/png",
      });
      const compactControls = body().locator(".template-editor__canvas-controls--editable");
      await expect(compactControls.getByRole("button", { name: "适应画布", exact: true }))
        .toHaveCSS("white-space", "nowrap");
      const internalGeometry = await body().evaluate((element) => {
        const inspect = (container: Element, items: Element[]) => {
          const outer = container.getBoundingClientRect();
          const boxes = items.map((item) => item.getBoundingClientRect())
            .filter((box) => box.width > 0 && box.height > 0);
          return {
            contained: boxes.every((box) => box.left >= outer.left - 1 && box.right <= outer.right + 1
              && box.top >= outer.top - 1 && box.bottom <= outer.bottom + 1),
            overlapping: boxes.some((box, index) => boxes.slice(index + 1).some((other) =>
              Math.min(box.right, other.right) - Math.max(box.left, other.left) > 1
              && Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 1)),
          };
        };
        const controls = element.querySelector(".template-editor__canvas-controls--editable")!;
        const heading = element.querySelector(".homepage-editor__library-search-row")!;
        const filters = element.querySelector(".template-editor__status-filters")!;
        const singleLine = [...filters.querySelectorAll("button")]
          .every((item) => getComputedStyle(item).whiteSpace === "nowrap" && item.scrollHeight <= item.clientHeight + 1);
        return {
          controls: inspect(controls, [...controls.children]),
          heading: inspect(heading, [...heading.children]),
          filters: inspect(filters, [...filters.children]),
          singleLine,
        };
      });
      expect(internalGeometry).toEqual({
        controls: { contained: true, overlapping: false },
        heading: { contained: true, overlapping: false },
        filters: { contained: true, overlapping: false },
        singleLine: true,
      });
      const addRegionTrigger = structurePanel.getByRole("button", { name: "添加区域", exact: true });
      const addSlotTrigger = structurePanel.getByRole("button", { name: "添加槽位", exact: true });
      await expect(addRegionTrigger).toBeVisible();
      await expect(addSlotTrigger).toBeVisible();
      await expect(addRegionTrigger).toBeInViewport();
      await expect(addSlotTrigger).toBeInViewport();
      const bottomGap = await Promise.all([
        structurePanel.boundingBox(),
        addSlotTrigger.boundingBox(),
      ]).then(([panelBox, triggerBox]) => {
        if (!panelBox || !triggerBox) return Number.POSITIVE_INFINITY;
        return panelBox.y + panelBox.height - triggerBox.y - triggerBox.height;
      });
      expect(bottomGap).toBeGreaterThanOrEqual(0);
      expect(bottomGap).toBeLessThanOrEqual(13);
      const canvasControls = page.locator(".template-editor__canvas-controls--editable");
      const canvasControlMetrics = await canvasControls.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(canvasControlMetrics.scrollWidth).toBeLessThanOrEqual(canvasControlMetrics.clientWidth + 1);
      await expect(canvasControls.getByRole("button", { name: /^模板尺寸：/ })).toBeInViewport();
      await expect(canvasControls.getByRole("button", { name: /^视图辅助/ })).toBeInViewport();

      if (viewport.width === 1366) {
        const toolbarActions = page.locator(".template-editor__toolbar .homepage-editor__toolbar-actions");
        await expect(toolbarActions).toBeVisible();
        const toolbarMetrics = await toolbarActions.evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }));
        expect(toolbarMetrics.scrollWidth).toBeLessThanOrEqual(toolbarMetrics.clientWidth + 1);
        for (const name of ["预览模板", "保存模板", "更多模板操作", /发布模板新版本/]) {
          await expect(toolbarActions.getByRole("button", { name })).toBeInViewport();
        }
      }

      const catalogCard = page.locator(
        '[data-unified-template-library="design"] [data-template-catalog-card="shared"][data-template-identity="source:legacy_system_hero"]',
      );
      await expect(catalogCard.locator('[data-preview-status="ready"]')).toHaveCount(1);
      await expect(catalogCard.locator(".homepage-editor__template-name")).toHaveText("首屏");
      await expect(catalogCard.locator(
        ".homepage-editor__template-slot-summary, .homepage-editor__template-description, .homepage-editor__template-add",
      )).toHaveCount(0);
    });
  }

  test("模板结构定稿状态保持四区比例、真实节点层级与可恢复弹层焦点", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      viewport: { width: 1920, height: 948 },
    });
    const pageWorkspaceGeometry = await page.locator(".homepage-editor__body:visible").evaluate((element) => {
      const selectors = [
        ":scope > .homepage-editor__library",
        ":scope > .homepage-editor__structure-workspace",
        ".homepage-editor__canvas-scroll",
        ":scope > .homepage-editor__right-workspace",
      ];
      const boxes = selectors.map((selector) => {
        const target = element.querySelector(selector);
        if (!target) throw new Error(`缺少四区节点：${selector}`);
        const rect = target.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      });
      return {
        viewportWidth: window.innerWidth,
        widths: boxes.map((box) => box.width),
        overlaps: boxes.slice(0, -1).map((box, index) => box.right - boxes[index + 1].left),
      };
    });
    expect(pageWorkspaceGeometry.widths.every((width) => width > 0)).toBe(true);
    expect(pageWorkspaceGeometry.widths.map((width) => Number((width / pageWorkspaceGeometry.viewportWidth).toFixed(3))))
      .toEqual([0.12, 0.08, 0.6, 0.2]);
    expect(pageWorkspaceGeometry.overlaps.every((overlap) => Math.abs(overlap) <= 1)).toBe(true);

    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    const structure = page.getByRole("complementary", { name: "模板结构" });
    await expect(structure.getByRole("region", { name: "模板结构问题" }))
      .toContainText("2 项待处理");
    await expect(structure.getByText("区", { exact: true })).toHaveCount(0);

    const { trigger, panel } = await openTemplateStructureAddPanel(page);
    await expect(trigger).toHaveText("添加槽位");
    await expect.poll(async () => (await panel.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(359);
    await expect.poll(async () => (await panel.boundingBox())?.width ?? Number.POSITIVE_INFINITY)
      .toBeLessThanOrEqual(361);
    const slotTools = panel.getByRole("region", { name: "常用内容槽位" });
    await expect(slotTools.getByRole("button")).toHaveCount(5);
    await expect(slotTools.getByRole("button", { name: "添加标题槽位", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();

    await structure.getByRole("button", { name: "添加区域", exact: true }).click();
    const region = structure.getByRole("treeitem", { name: /^内容区域 1/ });
    await expect(region).toBeVisible();
    await expect(region).toHaveAttribute("aria-level", "2");
    await expect(structure.locator(".template-editor__region-empty")).toHaveText("暂无内容");
    const { panel: reopenedPanel } = await openTemplateStructureAddPanel(page);
    await reopenedPanel.getByRole("button", { name: "添加标题槽位", exact: true }).click();
    const heading = structure.getByRole("treeitem", { name: /标题槽位 文字区域 可选/ });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveAttribute("aria-level", "3");
    await expect(trigger).toBeFocused();
    await expect(structure.getByRole("region", { name: "模板结构问题" })).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test("1920px 两种模式复用横向画布外壳，模板编辑层控制条独立占位", async ({ page }) => {
    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      viewport: { width: 1920, height: 948 },
    });

    const readCanvasGeometry = async (rootSelector: string, documentSelector: string) =>
      page.locator(rootSelector).evaluate((root, selector) => {
        const controls = root.querySelector<HTMLElement>(".homepage-editor__canvas-controls");
        const scroll = root.querySelector<HTMLElement>(".homepage-editor__canvas-scroll");
        const document = root.querySelector<HTMLElement>(selector);
        if (!controls || !scroll || !document) throw new Error("画布外壳未完整渲染");
        const round = (value: number) => Math.round(value * 10) / 10;
        const rect = (element: HTMLElement) => {
          const value = element.getBoundingClientRect();
          return {
            left: round(value.left),
            top: round(value.top),
            right: round(value.right),
            width: round(value.width),
          };
        };
        return {
          controls: rect(controls),
          scroll: rect(scroll),
          document: rect(document),
        };
      }, documentSelector);

    const readFourRegionGeometry = async (rootSelector: string) =>
      page.locator(rootSelector).evaluate((root) => {
        const shell = root.matches(".homepage-editor__body")
          ? root
          : root.querySelector<HTMLElement>(":scope > .homepage-editor__body");
        const library = shell?.querySelector<HTMLElement>(":scope > .homepage-editor__library");
        const structure = shell?.querySelector<HTMLElement>(":scope > .homepage-editor__structure-workspace");
        const stage = shell?.querySelector<HTMLElement>(":scope > .homepage-editor__stage");
        const inspector = shell?.querySelector<HTMLElement>(":scope > .homepage-editor__right-workspace");
        const canvas = stage?.querySelector<HTMLElement>(".homepage-editor__canvas-scroll");
        if (!library || !structure || !stage || !canvas || !inspector) {
          throw new Error("四区稳定骨架未完整渲染");
        }
        const rect = (element: HTMLElement) => {
          const value = element.getBoundingClientRect();
          return {
            left: Math.round(value.left * 10) / 10,
            right: Math.round(value.right * 10) / 10,
            width: Math.round(value.width * 10) / 10,
          };
        };
        return {
          library: rect(library),
          structure: rect(structure),
          canvas: rect(canvas),
          inspector: rect(inspector),
        };
      });

    const expectStableFourRegionGeometry = (
      regions: Awaited<ReturnType<typeof readFourRegionGeometry>>,
    ) => {
      const evidence = JSON.stringify(regions);
      expect(regions.library.left, evidence).toBeLessThan(regions.structure.left);
      expect(regions.structure.left, evidence).toBeLessThan(regions.canvas.left);
      expect(regions.canvas.left, evidence).toBeLessThan(regions.inspector.left);
      expect(Math.abs(regions.library.right - regions.structure.left), evidence).toBeLessThanOrEqual(1);
      expect(Math.abs(regions.structure.right - regions.canvas.left), evidence).toBeLessThanOrEqual(1);
      expect(Math.abs(regions.canvas.right - regions.inspector.left), evidence).toBeLessThanOrEqual(1);
      expect(regions.canvas.width, evidence).toBeGreaterThan(regions.library.width);
      expect(regions.canvas.width, evidence).toBeGreaterThan(regions.structure.width);
    };

    const pageDocument = page.locator(
      ".homepage-editor__page-workspace .homepage-editor__canvas-document",
    );
    await expect(pageDocument).toBeVisible();
    const pageGeometry = await readCanvasGeometry(
      ".homepage-editor__page-workspace",
      ".homepage-editor__canvas-document",
    );
    const pageRegions = await readFourRegionGeometry(".homepage-editor__page-workspace");
    expectStableFourRegionGeometry(pageRegions);

    await page.getByRole("button", { name: "模板设计" }).click();
    await expect(page.locator(".template-editor__preview-header")).toHaveCount(0);
    const templateDocument = page.locator(
      ".template-editor__body .template-editor__canvas-document",
    );
    await expect(templateDocument).toBeVisible();
    await expect(
      page.locator(".template-editor__body").getByLabel(/画布尺寸 1920 × \d+/),
    ).toBeVisible();
    const templateGeometry = await readCanvasGeometry(
      ".template-editor__body",
      ".template-editor__canvas-document",
    );
    const templateRegions = await readFourRegionGeometry(".template-editor__body");
    expectStableFourRegionGeometry(templateRegions);

    expect(templateGeometry.controls.right).toBe(pageGeometry.controls.right);
    expect(templateGeometry.controls.left).toBeLessThan(pageGeometry.controls.left);
    expect(templateGeometry.controls.width).toBeGreaterThan(pageGeometry.controls.width);
    expect(templateGeometry.scroll.right).toBe(pageGeometry.scroll.right);
    expect(templateGeometry.scroll.left).toBe(templateRegions.canvas.left);
    expect(templateGeometry.document.right).toBeLessThanOrEqual(templateGeometry.scroll.right);
    expect(templateGeometry.document.left).toBeGreaterThanOrEqual(templateGeometry.scroll.left);
    const controlsOffset = templateGeometry.controls.top - pageGeometry.controls.top;
    const scrollOffset = templateGeometry.scroll.top - pageGeometry.scroll.top;
    expect(controlsOffset).toBe(0);
    expect(scrollOffset).toBe(controlsOffset);
    expect(templateGeometry.document.top).toBeGreaterThan(templateGeometry.scroll.top);
    await expect(page.frameLocator(".template-editor__viewport-frame")
      .locator(".template-editor__dynamic-canvas-renderer"))
      .toBeVisible();
  });

  test("顾客分享母模板白色边界随内容收口，并可拖动边界调整当前设备整体比例", async ({ page }) => {
    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      viewport: { width: 1920, height: 948 },
    });
    await openTemplateFromCatalog(page, "顾客分享");

    const templateWorkspace = page.locator(".template-editor__body");
    const frameElement = templateWorkspace.locator(".template-editor__viewport-frame");
    const { trigger: sizeTrigger, controls: sizeControls } = await openTemplateSizeControls(page);
    const widthInput = sizeControls.getByRole("spinbutton", { name: "设计宽度" });
    const heightMode = sizeControls.getByRole("combobox", { name: "模板高度模式" });

    await expect(widthInput).toHaveValue("1920");
    await expect(templateWorkspace.getByText("模板边界", { exact: true })).toBeVisible();

    await heightMode.selectOption("fixed");
    const heightInput = sizeControls.getByRole("spinbutton", { name: "模板固定高度" });
    await heightInput.fill("640");
    await heightInput.press("Enter");
    await expect(heightMode).toHaveValue("fixed");
    await expect(heightInput).toHaveValue("640");
    await expect(frameElement).toHaveCSS("height", "640px");
    await expect(templateWorkspace.getByLabel(/画布尺寸 1920 × 640/)).toBeVisible();

    await widthInput.fill("1280");
    await widthInput.press("Enter");
    await expect(widthInput).toHaveValue("1280");
    await expect(heightInput).toHaveValue("640");
    await expect(frameElement).toHaveCSS("width", "1280px");
    await expect(templateWorkspace.getByLabel(/画布尺寸 1280 × 640/)).toBeVisible();

    // 固定高度模式下拖动底边只调整高度，不应悄悄改成固定比例。
    const fixedBottomHandle = templateWorkspace.getByRole("button", { name: /拖动调整模板高度与整体比例/ });
    await fixedBottomHandle.focus();
    await fixedBottomHandle.press("ArrowDown");
    await expect(heightMode).toHaveValue("fixed");
    await expect(heightInput).toHaveValue("650");
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await openTemplateSizeControls(page);
    await expect(heightInput).toHaveValue("640");

    await heightMode.selectOption("auto");
    await expect(heightMode).toHaveValue("auto");
    await expect(sizeControls.getByRole("spinbutton", { name: "模板固定高度" })).toHaveCount(0);
    await expect(sizeTrigger).toContainText("随内容");

    const cornerHandle = templateWorkspace.getByRole("button", { name: /拖动调整模板整体比例/ });
    const initialFrameBox = await frameElement.boundingBox();
    const cornerHandleBox = await cornerHandle.boundingBox();
    const initialNaturalHeight = Number.parseFloat(await frameElement.evaluate((element) => element.style.height));
    expect(initialFrameBox).toBeTruthy();
    expect(cornerHandleBox).toBeTruthy();
    const displayedScale = initialFrameBox!.width / 1280;
    const horizontalDrag = 72;
    const verticalDrag = 48;
    await page.mouse.move(
      cornerHandleBox!.x + cornerHandleBox!.width / 2,
      cornerHandleBox!.y + cornerHandleBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      cornerHandleBox!.x + cornerHandleBox!.width / 2 + horizontalDrag,
      cornerHandleBox!.y + cornerHandleBox!.height / 2 + verticalDrag,
      { steps: 6 },
    );
    await expect(templateWorkspace.locator(".template-editor__canvas-direct-resize-readout")).toBeVisible();
    await page.mouse.up();

    await openTemplateSizeControls(page);
    const resizedWidth = Number(await widthInput.inputValue());
    const resizedHeight = Number.parseFloat(await frameElement.evaluate((element) => element.style.height));
    const expectedSnappedWidth = Math.round((1280 + horizontalDrag / displayedScale) / 10) * 10;
    const expectedSnappedHeight = Math.round((initialNaturalHeight + verticalDrag / displayedScale) / 10) * 10;
    expect(Math.abs(resizedWidth - expectedSnappedWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(resizedHeight - expectedSnappedHeight)).toBeLessThanOrEqual(2);
    await expect(heightMode).toHaveValue("aspect-ratio");
    await expect(sizeTrigger).not.toContainText("随内容");
    await expect(templateWorkspace.locator(".template-editor__canvas-direct-resize-readout")).toHaveCount(0);

    // 一次拖动只能形成一个历史记录；撤销必须同时恢复宽度与高度模式。
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await openTemplateSizeControls(page);
    await expect(widthInput).toHaveValue("1280");
    await expect(heightMode).toHaveValue("auto");

    // 边界手柄保留键盘等价操作，底边方向键会从随内容切换为整体固定比例。
    const bottomHandle = templateWorkspace.getByRole("button", { name: /拖动调整模板高度与整体比例/ });
    const keyboardStartHeight = Number.parseFloat(await frameElement.evaluate((element) => element.style.height));
    await bottomHandle.focus();
    await bottomHandle.press("ArrowDown");
    await expect(heightMode).toHaveValue("aspect-ratio");
    await expect(widthInput).toHaveValue("1280");
    await expect.poll(async () => Number.parseFloat(await frameElement.evaluate((element) => element.style.height)))
      .toBeCloseTo(keyboardStartHeight + 10, 0);

    // 桌面与移动模板比例独立；移动端边界调整不得反写桌面尺寸。
    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    await openTemplateSizeControls(page);
    await expect(widthInput).toHaveValue("390");
    const mobileRightHandle = templateWorkspace.getByRole("button", { name: /拖动调整模板宽度/ });
    await mobileRightHandle.focus();
    await mobileRightHandle.press("ArrowRight");
    await expect(widthInput).toHaveValue("400");
    await page.getByRole("button", { name: /桌面端模板布局/ }).click();
    await openTemplateSizeControls(page);
    await expect(widthInput).toHaveValue("1280");

    // 常用比例直接进入受约束模式；在固定比例下改宽度会联动高度，比例保持不变。
    await openTemplateSizeControls(page);
    const ratioPreset = sizeControls.getByRole("combobox", { name: "常用模板比例" });
    await ratioPreset.selectOption("16:9");
    await expect(heightMode).toHaveValue("aspect-ratio");
    await expect(sizeTrigger).toContainText("桌面端 · 1280 · 16:9");
    await expect(templateWorkspace.getByRole("status", { name: "" }).filter({ hasText: "内容越界" }))
      .toContainText(/纵向 \d+px/);
    const ratioStartHeight = Number.parseFloat(await frameElement.evaluate((element) => element.style.height));
    const desktopRightHandle = templateWorkspace.getByRole("button", { name: /拖动调整模板宽度/ });
    await desktopRightHandle.focus();
    await desktopRightHandle.press("ArrowRight");
    await expect(widthInput).toHaveValue("1290");
    await expect.poll(async () => Number.parseFloat(await frameElement.evaluate((element) => element.style.height)))
      .toBeCloseTo(ratioStartHeight * 1290 / 1280, 0);
    await expect(sizeTrigger).toContainText("桌面端 · 1290 · 16:9");

    // 恢复只作用于当前设备并进入同一撤销栈，不覆盖移动端刚才的独立宽度。
    await openTemplateSizeControls(page);
    const restoreSize = sizeControls.getByRole("button", { name: "恢复已保存尺寸" });
    await expect(restoreSize).toBeEnabled();
    await restoreSize.click();
    await expect(widthInput).toHaveValue("1920");
    await expect(heightMode).toHaveValue("auto");
    await expect(restoreSize).toBeDisabled();
    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    await openTemplateSizeControls(page);
    await expect(widthInput).toHaveValue("400");
    await page.getByRole("button", { name: /桌面端模板布局/ }).click();
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await openTemplateSizeControls(page);
    await expect(widthInput).toHaveValue("1290");
    await expect(heightMode).toHaveValue("aspect-ratio");
  });

  test("模板设计画布固定在工作区且不随滚轮上下滑动", async ({ page }, testInfo) => {
    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      viewport: { width: 1920, height: 948 },
    });
    const pageCanvas = page.locator(
      ".homepage-editor__page-workspace .homepage-editor__canvas-scroll",
    );
    await expect(pageCanvas).toHaveCSS("overflow-y", "auto");

    await openTemplateFromCatalog(page, "双图文");
    const workspace = page.locator(".template-editor__body");
    const stage = workspace.locator(".template-editor__canvas-scroll");
    const board = workspace.locator(".template-editor__canvas-board");
    await workspace.getByRole("button", { name: "适应画布", exact: true }).click();
    await expect(stage).toHaveCSS("overflow-y", "hidden");
    await expect(stage).toHaveCSS("overscroll-behavior-y", "none");
    await expect.poll(async () => Promise.all([
      stage.boundingBox(),
      board.boundingBox(),
    ]).then(([stageBox, boardBox]) => Boolean(
      stageBox
      && boardBox
      && boardBox.x >= stageBox.x
      && boardBox.x + boardBox.width <= stageBox.x + stageBox.width
      && boardBox.y >= stageBox.y
      && boardBox.y + boardBox.height <= stageBox.y + stageBox.height,
    ))).toBe(true);
    await expect.poll(async () => Promise.all([
      stage.boundingBox(),
      board.boundingBox(),
    ]).then(([stageBox, boardBox]) => {
      if (!stageBox || !boardBox) return Number.POSITIVE_INFINITY;
      const horizontalDifference = Math.abs(
        (boardBox.x - stageBox.x) - (stageBox.x + stageBox.width - boardBox.x - boardBox.width),
      );
      const verticalDifference = Math.abs(
        (boardBox.y - stageBox.y) - (stageBox.y + stageBox.height - boardBox.y - boardBox.height),
      );
      return Math.max(horizontalDifference, verticalDifference);
    })).toBeLessThanOrEqual(1);

    const beforeWheel = await stage.evaluate((element) => ({
      left: element.scrollLeft,
      top: element.scrollTop,
    }));
    await stage.hover();
    await page.mouse.wheel(0, 720);
    await expect.poll(() => stage.evaluate((element) => ({
      left: element.scrollLeft,
      top: element.scrollTop,
    }))).toEqual(beforeWheel);
    await expect.poll(() => page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);

    await testInfo.attach("template-fixed-canvas-frame.png", {
      body: await page.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    });
    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(pageCanvas).toHaveCSS("overflow-y", "auto");
  });

  test("模板画布支持精确缩放、视图辅助、平移、选中定位和越界定位", async ({ page }) => {
    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      viewport: { width: 1920, height: 948 },
    });
    await openTemplateFromCatalog(page, "顾客分享");

    const workspace = page.locator(".template-editor__body");
    const stage = workspace.locator(".template-editor__canvas-scroll");
    const board = workspace.locator(".template-editor__canvas-board");
    const zoomInput = workspace.getByRole("spinbutton", { name: "画布缩放百分比" });

    await zoomInput.fill("125");
    await zoomInput.press("Enter");
    await expect(zoomInput).toHaveValue("125");
    await expect.poll(async () => Number.parseFloat(await board.evaluate((element) => element.style.width)))
      .toBeCloseTo(2400, 0);

    const { controls: sizeControls } = await openTemplateSizeControls(page);
    const widthInput = sizeControls.getByRole("spinbutton", { name: "设计宽度" });
    const widthPreset = sizeControls.getByRole("combobox", { name: "常用模板宽度" });
    await widthPreset.selectOption("1440");
    await expect(widthInput).toHaveValue("1440");
    await widthPreset.selectOption("1920");
    await expect(widthInput).toHaveValue("1920");
    await zoomInput.fill("125");
    await zoomInput.press("Enter");

    const { trigger: viewToolsTrigger, controls: viewTools } = await openTemplateViewTools(page);
    const gridToggle = viewTools.getByRole("button", { name: "网格", exact: true });
    const centerToggle = viewTools.getByRole("button", { name: "中心线", exact: true });
    const safeAreaToggle = viewTools.getByRole("button", { name: "安全区", exact: true });
    const snapToggle = viewTools.getByRole("button", { name: "吸附 10px", exact: true });
    await gridToggle.click();
    await centerToggle.click();
    await safeAreaToggle.click();
    await expect(gridToggle).toHaveAttribute("aria-pressed", "true");
    await expect(centerToggle).toHaveAttribute("aria-pressed", "true");
    await expect(safeAreaToggle).toHaveAttribute("aria-pressed", "true");
    await expect(snapToggle).toHaveAttribute("aria-pressed", "true");
    await expect(workspace.locator(".template-editor__canvas-grid")).toBeVisible();
    await expect(workspace.locator(".template-editor__canvas-center-guides")).toBeVisible();
    await expect(workspace.locator(".template-editor__canvas-safe-area")).toContainText("安全区 5%");

    const panToggle = viewTools.getByRole("button", { name: "手形平移", exact: true });
    await panToggle.click();
    await expect(panToggle).toHaveAttribute("aria-pressed", "true");
    await expect(stage).toHaveAttribute("aria-label", /模板画布平移区域/);
    await stage.evaluate((element) => {
      element.scrollLeft = 160;
      element.scrollTop = 120;
    });
    const keyboardPanStart = await stage.evaluate((element) => element.scrollLeft);
    await stage.focus();
    await stage.press("ArrowRight");
    await expect.poll(async () => stage.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(keyboardPanStart);

    const stageBox = await stage.boundingBox();
    expect(stageBox).toBeTruthy();
    const pointerPanStart = await stage.evaluate((element) => element.scrollLeft);
    await page.mouse.move(stageBox!.x + stageBox!.width / 2, stageBox!.y + stageBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(stageBox!.x + stageBox!.width / 2 - 80, stageBox!.y + stageBox!.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => stage.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(pointerPanStart + 50);
    await openTemplateViewTools(page);
    await panToggle.click();

    const frame = workspace.frameLocator(".template-editor__viewport-frame");
    const templateNodes = frame.locator("[data-template-node-id]");
    const structure = page.getByRole("complementary", { name: "模板结构" });
    const templateRoot = structure.getByRole("treeitem", { name: /授权实拍/ }).first();
    await templateRoot.click();
    await expect(templateRoot).toHaveAttribute("aria-selected", "true");
    await expect(frame.locator([
      "[data-hc-node-hud]",
      "[data-hc-selection-box]",
      "[data-hc-resize-handle]",
      "[data-visual-selected-node]",
      "[data-visual-editor-mode]",
    ].join(","))).toHaveCount(0);
    await expect(page.locator('[data-template-editor-overlay-root="template-definition"]')).toHaveCount(1);
    await structure.locator(".homepage-editor__panel-header").click();
    await expect(viewTools).toBeHidden();
    await expect(viewToolsTrigger).toHaveAttribute("aria-expanded", "false");
    await openTemplateViewTools(page);
    const locateSelection = viewTools.getByRole("button", { name: "定位选中", exact: true });
    const fitSelection = viewTools.getByRole("button", { name: "适应选中", exact: true });
    await expect(locateSelection).toBeEnabled();
    await expect(fitSelection).toBeEnabled();
    await zoomInput.fill("200");
    await zoomInput.press("Enter");
    await stage.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
      element.scrollTop = element.scrollHeight;
    });
    const farScroll = await stage.evaluate((element) => ({
      left: element.scrollLeft,
      top: element.scrollTop,
    }));
    await locateSelection.click();
    await expect.poll(async () => stage.evaluate((element) => ({
      left: element.scrollLeft,
      top: element.scrollTop,
    }))).not.toEqual(farScroll);
    await fitSelection.click();
    await expect.poll(async () => Number(await zoomInput.inputValue())).toBeLessThan(200);

    await openTemplateSizeControls(page);
    const heightMode = sizeControls.getByRole("combobox", { name: "模板高度模式" });
    await heightMode.selectOption("fixed");
    const heightInput = sizeControls.getByRole("spinbutton", { name: "模板固定高度" });
    await heightInput.fill("2000");
    await heightInput.press("Enter");
    await workspace.getByRole("button", { name: "适应画布", exact: true }).click();
    await expect.poll(async () => {
      const [stageSize, boardSize] = await Promise.all([
        stage.evaluate((element) => element.clientHeight),
        board.evaluate((element) => element.getBoundingClientRect().height),
      ]);
      return boardSize <= stageSize - 40;
    }).toBe(true);
    await heightInput.fill("240");
    await heightInput.press("Enter");
    // 用节点自身真实尺寸制造越界，避免把诊断测试绑在某个模板的文案或素材高度上。
    await templateNodes.last().evaluate((element) => {
      (element as HTMLElement).style.minHeight = "1200px";
    });
    const overflowWarning = workspace.getByRole("button", { name: /内容越界.*定位/ });
    await expect(overflowWarning).toBeEnabled();
    await overflowWarning.click();
    await expect(workspace.locator('[data-template-editor-overlay-root="template-definition"] [data-overlay-selection-for^="node:"]'))
      .toBeVisible();

    // 网格、中心线、平移和缩放仅属于视图状态，不应生成模板历史记录。
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await openTemplateSizeControls(page);
    await expect(heightInput).not.toHaveValue("240");
    await openTemplateViewTools(page);
    await expect(gridToggle).toHaveAttribute("aria-pressed", "true");
    await expect(centerToggle).toHaveAttribute("aria-pressed", "true");
  });

  test("选中节点可在画布中直接居中，并复制构图到另一设备", async ({ page }) => {
    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      viewport: { width: 1920, height: 948 },
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();

    const workspace = page.locator(".template-editor__body");
    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    await addPanel.getByText("布局", { exact: true }).click();
    await addPanel.getByRole("button", { name: "堆叠容器 结构节点" }).click();
    await addPanel.getByRole("button", { name: "图片槽位 内容槽位" }).click();
    await addPanel.getByRole("button", { name: "标题槽位 内容槽位" }).click();
    await workspace.getByRole("treeitem", { name: /堆叠容器/ }).click();
    await openTemplateInspectorPanel(page, "布局");
    await workspace.getByRole("button", { name: "自由叠放", exact: true }).click();
    await workspace.getByRole("treeitem", { name: /图片槽位/ }).click();
    const frame = workspace.frameLocator(".template-editor__viewport-frame");
    const toolbar = workspace.locator("details.template-editor__editable-overlay-actions");
    const selectedImage = frame.locator('[data-template-node-type="ImageSlot"]').first();
    await expect(workspace.locator('[data-template-editor-overlay-root="template-definition"] [data-overlay-selection-for^="node:"]'))
      .toBeVisible();
    await expect(toolbar).toBeVisible();
    await toolbar.getByText("对象操作", { exact: true }).click();

    await toolbar.getByRole("button", { name: "在父容器中水平居中" }).click();
    await toolbar.getByRole("button", { name: "在父容器中垂直居中" }).click();
    const centeredDesktopPlacement = await selectedImage.evaluate((node: HTMLElement) => {
      return {
        left: node.style.left,
        top: node.style.top,
        width: node.style.width,
        height: node.style.height,
      };
    });
    expect(Number.parseFloat(centeredDesktopPlacement.left)
      + Number.parseFloat(centeredDesktopPlacement.width) / 2).toBeCloseTo(50, 3);
    expect(Number.parseFloat(centeredDesktopPlacement.top)
      + Number.parseFloat(centeredDesktopPlacement.height) / 2).toBeCloseTo(50, 3);

    await toolbar.getByRole("button", { name: "复制当前自由布局到移动端" }).click();
    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    const mobileToolbar = workspace.locator("details.template-editor__editable-overlay-actions");
    await expect(mobileToolbar).toBeVisible();
    const mobilePlacement = await selectedImage.evaluate((node: HTMLElement) => {
      return {
        left: node.style.left,
        top: node.style.top,
        width: node.style.width,
        height: node.style.height,
      };
    });
    expect(mobilePlacement).toEqual(centeredDesktopPlacement);

    // 三个动作分别进入撤销栈；撤销复制后，桌面端刚完成的居中构图仍保留。
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await page.getByRole("button", { name: /桌面端模板布局/ }).click();
    const desktopPlacementAfterUndo = await selectedImage.evaluate((node: HTMLElement) => {
      return { left: node.style.left, top: node.style.top };
    });
    expect(desktopPlacementAfterUndo).toEqual({
      left: centeredDesktopPlacement.left,
      top: centeredDesktopPlacement.top,
    });
  });

  test("键盘可从模式切换按钮到达模板搜索、目录卡片、结构树、画布和属性", async ({ page }) => {
    await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
    const modeSwitch = page.getByRole("button", { name: "模板设计" });
    await modeSwitch.focus();
    await expect(modeSwitch).toBeFocused();
    await modeSwitch.press("Enter");
    await expect(page.getByRole("region", { name: /模板(?:设计)?画布/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "页面装修" })).toBeVisible();

    const search = page.getByRole("textbox", { name: "搜索模板" });
    await search.focus();
    await expect(search).toBeFocused();
    const card = page.getByRole("button", { name: "正在编辑首屏模板" });
    await card.focus();
    await expect(card).toBeFocused();
    await card.press("Enter");

    const templateNode = page.getByRole("complementary", { name: "模板结构" })
      .getByRole("treeitem")
      .first();
    await expect(templateNode).toHaveAttribute("aria-level", "2");
    await templateNode.focus();
    await expect(templateNode).toBeFocused();
    const canvasFrame = page.locator(".template-editor__viewport-frame");
    await canvasFrame.focus();
    await expect(canvasFrame).toBeFocused();
    const templateInfo = await openTemplateBasicInfo(page);
    const nameField = templateInfo.getByRole("textbox", { name: "模板名称", exact: true });
    await nameField.focus();
    await expect(nameField).toBeFocused();
  });

  test("同一四区外壳默认打开首屏母模板，并原样恢复页面状态", async ({ page }) => {
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    const pageWorkspace = page.locator(".homepage-editor__page-workspace");
    const layers = pageWorkspace.locator(".homepage-editor__layer-item");
    await layers.first().getByRole("button", { name: "隐藏首屏" }).click();
    await page.getByRole("button", { name: /移动端.*布局/ }).click();

    await page.getByRole("button", { name: "模板设计" }).click();
    await expect(page.getByRole("region", { name: /模板(?:设计)?画布/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "正在编辑首屏模板" })).toBeVisible();
    const templateCatalog = page.getByRole("complementary", { name: "模板组件库" });
    await expect(templateCatalog).not.toContainText("模板目录");
    await expect(templateCatalog).not.toContainText("系统基线");
    for (const purpose of ["品牌展示", "商品销售", "活动转化", "内容传播", "信任建立"]) {
      await expect(templateCatalog.getByRole("heading", { name: purpose, exact: true })).toHaveCount(0);
    }
    await expect(templateCatalog.getByRole("heading", { name: /系统模板|个人模板|动态模板/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "保存模板", exact: true })).toBeEnabled();
    await expect(pageWorkspace).toBeHidden();
    await expect(page.getByRole("region", { name: /模板(?:设计)?画布/ })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "模板结构" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "模板属性工作区" })).toBeVisible();
    await expect(page.locator(".template-editor__viewport-frame")).toHaveAttribute("title", /桌面模板隔离画布/);

    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(pageWorkspace).toBeVisible();
    await expect(layers.first()).toHaveAttribute("data-layer-visible", "false");
    await expect(page.getByRole("button", { name: /移动端.*布局/ })).toHaveAttribute("aria-pressed", "true");
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("切换母模板时要求显式保存后再打开目标模板", async ({ page }) => {
    const { forbiddenPageWrites, writes, dynamic } = await openWorkspaceShell(page);
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "正在编辑首屏模板" }).click();
    await fillTemplateName(page, "尚未保存的首屏构图");

    await page.getByRole("button", { name: "打开通栏图模板" }).click();
    const transitionDialog = page.getByRole("dialog", { name: "切换模板？" });
    await expect(transitionDialog).toContainText("模板“尚未保存的首屏构图”还有未保存修改");
    await expect(transitionDialog).toContainText("已发布模板和页面草稿不会受到影响");
    await expect(transitionDialog.getByRole("button", { name: "放弃修改并切换" })).toBeVisible();
    await expect(transitionDialog.getByRole("button", { name: "继续编辑" })).toBeFocused();
    await transitionDialog.getByRole("button", { name: "保存草稿并切换" }).click();
    await openTemplateBasicInfo(page);
    await expect(templateNameInput(page)).toHaveValue("通栏图");
    expect(dynamic.writes).toHaveLength(1);
    expect(dynamic.writes[0].body.definition.name).toBe("尚未保存的首屏构图");
    expect(writes).toEqual([]);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("打开已有母模板但未编辑时可直接返回页面装修", async ({ page }) => {
    const { forbiddenPageWrites, writes } = await openWorkspaceShell(page);
    await openTemplateFromCatalog(page, "通栏图");

    await page.getByRole("button", { name: "页面装修" }).click();

    await expect(page.getByRole("dialog", { name: "切换到页面装修？" })).toHaveCount(0);
    await expect(page.locator(".homepage-editor__page-workspace .homepage-editor__structure-workspace"))
      .toBeVisible();
    expect(writes).toEqual([]);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("无脏修改时可在 1024 直接关闭模板会话并留在模板目录", async ({ page }) => {
    const { dynamic, forbiddenPageWrites, writes } = await openWorkspaceShell(page);
    await openTemplateFromCatalog(page, "通栏图");
    await page.setViewportSize({ width: 1024, height: 768 });

    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "关闭模板会话" }).click();

    await expect(page.getByRole("dialog", { name: /关闭.*模板编辑会话/ })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "空模板画布" })).toBeVisible();
    await expect(page.getByText("已关闭“通栏图”的模板编辑会话", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "展开模板组件库" }).click();
    await expect(page.getByRole("button", { name: "打开通栏图模板" })).toBeVisible();
    expect(dynamic.writes).toEqual([]);
    expect(writes).toEqual([]);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("新建未保存模板只通过统一关闭决策清理会话", async ({ page }) => {
    const { dynamic, forbiddenPageWrites, writes } = await openWorkspaceShell(page);
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    await fillTemplateName(page, "尚未保存的新模板");

    await openTemplateMoreMenu(page);
    await expect(page.getByRole("menuitem", { name: "放弃未保存修改" })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "关闭模板会话" }).click();

    const closeDialog = page.getByRole("dialog", {
      name: "关闭“尚未保存的新模板”的模板编辑会话？",
    });
    await expect(closeDialog.getByRole("button", { name: "不保存并关闭" })).toBeVisible();
    await expect(closeDialog.getByRole("button", { name: "保存后关闭" })).toBeVisible();
    await expect(closeDialog.getByRole("button", { name: "继续编辑" })).toBeFocused();
    await closeDialog.getByRole("button", { name: "继续编辑" }).click();
    await expect(templateNameInput(page))
      .toHaveValue("尚未保存的新模板");

    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "关闭模板会话" }).click();
    await closeDialog.getByRole("button", { name: "不保存并关闭" }).click();
    await expect(page.getByRole("region", { name: "空模板画布" })).toBeVisible();
    expect(dynamic.writeAttempts).toEqual([]);
    expect(dynamic.writes).toEqual([]);
    expect(writes).toEqual([]);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("已保存模板放弃修改在原会话恢复 baseline、修复选择并清空历史且 API 为零", async ({ page }) => {
    const { dynamic, forbiddenPageWrites, writes } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      viewport: { width: 1600, height: 900 },
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    await fillTemplateName(page, "原位恢复基线测试");
    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    const baselineParentId = await page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      return store.getState().selectedObjectId;
    });
    expect(baselineParentId).toBeTruthy();
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    const writeAttemptsBeforeDiscard = dynamic.writeAttempts.length;

    await addTemplateStructureNode(page, "标题槽位 内容槽位");
    await page.locator(".template-editor__toolbar")
      .getByRole("button", { name: /移动端模板布局/ }).click();
    const zoomInput = page.locator(".template-editor__body")
      .getByRole("spinbutton", { name: "画布缩放百分比" });
    await zoomInput.fill("125");
    await zoomInput.press("Enter");
    await expect(zoomInput).toHaveValue("125");
    await page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      const state = store.getState();
      state.setContentLayer("default");
      state.setPreviewScenario("long-text");
    });
    const beforeDiscard = await page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      const state = store.getState();
      return {
        sessionId: state.sessionId,
        selectedObjectId: state.selectedObjectId,
        device: state.device,
        canvasZoom: state.canvasZoom,
        historyPast: state.historyPast.length,
      };
    });
    expect(beforeDiscard.selectedObjectId).not.toBe(baselineParentId);
    expect(beforeDiscard.historyPast).toBeGreaterThan(0);
    if (!beforeDiscard.sessionId || !beforeDiscard.selectedObjectId) {
      throw new Error("原位恢复几何测试缺少模板会话或待放弃节点");
    }
    const geometryKeys = {
      discarded: `template-editor:${beforeDiscard.sessionId}:${beforeDiscard.selectedObjectId}`,
      extraCurrent: `template-editor:${beforeDiscard.sessionId}:transient-stale-node`,
      similarSession: `template-editor:${beforeDiscard.sessionId}-similar:node`,
      otherTemplateSession: "template-editor:other-session:node",
      page: "page-editor:independent-block",
      baseline: `template-editor:${beforeDiscard.sessionId}:${baselineParentId}`,
    };
    await page.evaluate(async (keys) => {
      const modulePath = "/src/page-builder/visual-editor/visualEditorSession.ts";
      const { useVisualEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      const report = (blockId: string, marker: string) => store.getState().reportCanvasGeometry({
        blockId,
        moduleType: "Discard geometry boundary test",
        viewport: "desktop",
        frameAspectRatio: 1,
        nodes: { [marker]: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } },
      });
      report(keys.discarded, "stale-discarded-node");
      report(keys.extraCurrent, "second-current-session-node");
      report(keys.similarSession, "similar-session");
      report(keys.otherTemplateSession, "other-template-session");
      report(keys.page, "page");
    }, geometryKeys);

    const templateBody = page.locator(".template-editor__body");
    await templateBody.getByRole("button", { name: "收起模板结构面板" }).click();
    await templateBody.getByRole("button", { name: "收起模板属性面板" }).click();
    await expect.poll(() => page.evaluate(() => ({
      structure: sessionStorage.getItem("template-editor-structure-collapsed"),
      inspector: sessionStorage.getItem("template-editor-inspector-collapsed"),
    }))).toEqual({ structure: "1", inspector: "1" });

    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "放弃未保存修改" }).click();
    const discardDialog = page.getByRole("dialog", {
      name: "放弃“原位恢复基线测试”的未保存修改？",
    });
    await discardDialog.getByRole("button", { name: "放弃未保存修改" }).click();

    const afterInvalidSelectionDiscard = await page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      const state = store.getState();
      return {
        sessionId: state.sessionId,
        selectedObjectId: state.selectedObjectId,
        device: state.device,
        canvasZoom: state.canvasZoom,
        contentLayer: state.contentLayer,
        previewMode: state.previewMode,
        previewScenario: state.previewScenario,
        dirty: state.dirty,
        historyPast: state.historyPast.length,
        historyFuture: state.historyFuture.length,
        draftMatchesBaseline: JSON.stringify(state.draft) === JSON.stringify(state.baseline),
      };
    });
    expect(afterInvalidSelectionDiscard).toEqual({
      sessionId: beforeDiscard.sessionId,
      selectedObjectId: baselineParentId,
      device: "mobile",
      canvasZoom: 1.25,
      contentLayer: "preview",
      previewMode: false,
      previewScenario: "default",
      dirty: false,
      historyPast: 0,
      historyFuture: 0,
      draftMatchesBaseline: true,
    });
    await expect.poll(() => page.evaluate(async (keys) => {
      const modulePath = "/src/page-builder/visual-editor/visualEditorSession.ts";
      const { useVisualEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      const geometry = store.getState().canvasGeometryByBlock;
      return {
        discardedCleared: !(keys.discarded in geometry),
        extraCurrentCleared: !(keys.extraCurrent in geometry),
        similarSessionPreserved: keys.similarSession in geometry,
        otherTemplateSessionPreserved: keys.otherTemplateSession in geometry,
        pagePreserved: keys.page in geometry,
      };
    }, geometryKeys)).toEqual({
      discardedCleared: true,
      extraCurrentCleared: true,
      similarSessionPreserved: true,
      otherTemplateSessionPreserved: true,
      pagePreserved: true,
    });
    await page.evaluate(async (key) => {
      const modulePath = "/src/page-builder/visual-editor/visualEditorSession.ts";
      const { useVisualEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      store.getState().reportCanvasGeometry({
        blockId: key,
        moduleType: "Discard geometry boundary test",
        viewport: "desktop",
        frameAspectRatio: 1,
        nodes: { recreated: { x: 0.2, y: 0.3, width: 0.4, height: 0.5 } },
      });
    }, geometryKeys.baseline);
    await expect.poll(() => page.evaluate(async (key) => {
      const modulePath = "/src/page-builder/visual-editor/visualEditorSession.ts";
      const { useVisualEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      return Boolean(store.getState().canvasGeometryByBlock[key]?.desktop?.nodes.recreated);
    }, geometryKeys.baseline)).toBe(true);
    await expect(templateBody.locator(".template-editor__structure")).toHaveClass(/is-collapsed/);
    await expect(templateBody.locator(".template-editor__right-workspace"))
      .toHaveClass(/is-inspector-collapsed/);
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "重做", exact: true })).toBeDisabled();
    expect(dynamic.writeAttempts).toHaveLength(writeAttemptsBeforeDiscard);

    await page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      store.getState().setName("应被放弃但选择保持");
    });
    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "放弃未保存修改" }).click();
    await page.getByRole("dialog", { name: "放弃“应被放弃但选择保持”的未保存修改？" })
      .getByRole("button", { name: "放弃未保存修改" }).click();
    await expect.poll(() => page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      const state = store.getState();
      return {
        sessionId: state.sessionId,
        selectedObjectId: state.selectedObjectId,
        dirty: state.dirty,
        historyPast: state.historyPast.length,
        historyFuture: state.historyFuture.length,
      };
    })).toEqual({
      sessionId: beforeDiscard.sessionId,
      selectedObjectId: baselineParentId,
      dirty: false,
      historyPast: 0,
      historyFuture: 0,
    });
    expect(dynamic.writeAttempts).toHaveLength(writeAttemptsBeforeDiscard);
    expect(writes).toEqual([]);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("未保存模板临时返回后恢复会话、历史、选择、设备和缩放且不写入", async ({ page }) => {
    const { dynamic, forbiddenPageWrites, writes } = await openWorkspaceShell(page);
    await openTemplateFromCatalog(page, "首屏");
    await fillTemplateName(page, "临时返回前第一版");
    await fillTemplateName(page, "临时返回后应恢复");
    await page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      const state = store.getState();
      const target = Object.keys(state.draft.definition.nodes)
        .find((nodeId) => nodeId !== state.draft.definition.rootNodeId);
      if (!target) throw new Error("模板夹具缺少可选择节点");
      state.selectObject(target);
    });
    await page.locator(".template-editor__toolbar")
      .getByRole("button", { name: /移动端模板布局/ }).click();
    const zoomInput = page.locator(".template-editor__body")
      .getByRole("spinbutton", { name: "画布缩放百分比" });
    await zoomInput.fill("125");
    await zoomInput.press("Enter");
    await pressWorkspaceHistory(page, "undo");
    await expect.poll(() => page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      return store.getState().draft.definition.name;
    })).toBe("临时返回前第一版");
    const beforeReturn = await page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      const state = store.getState();
      return {
        sessionId: state.sessionId,
        templateId: state.draft.definition.templateId,
        selectedObjectId: state.selectedObjectId,
        historyPast: state.historyPast.length,
        historyFuture: state.historyFuture.length,
        dirty: state.dirty,
        device: state.device,
        canvasZoom: state.canvasZoom,
      };
    });

    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(page.getByRole("dialog", { name: "返回页面装修？" })).toHaveCount(0);
    await expect(page.locator(".homepage-editor__page-workspace .homepage-editor__structure-workspace"))
      .toBeVisible();
    await page.getByRole("button", { name: "展开一级导航" }).click();
    const navigation = page.getByRole("navigation", { name: "后台导航" });
    await navigation.getByRole("button", { name: /首页/ }).first().click();
    const leaveGuard = page.getByRole("dialog", { name: "保存后离开？" });
    await expect(leaveGuard).toContainText("当前模板有未保存修改");
    await leaveGuard.getByRole("button", { name: "继续编辑" }).click();
    await expect(page).toHaveURL(/\/admin\/editor\/home/);
    const pageAltText = page.getByRole("textbox", { name: "图片替代文字" });
    await pageAltText.fill("临时返回期间的页面替代文字");
    await expect(pageAltText).toHaveValue("临时返回期间的页面替代文字");
    expect(await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(true);

    await page.getByRole("button", { name: "模板设计" }).click();
    await expect.poll(() => page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      return store.getState().draft.definition.name;
    })).toBe("临时返回前第一版");
    await expect(page.locator(".template-editor__toolbar")
      .getByRole("button", { name: /移动端模板布局/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".template-editor__body")
      .getByRole("spinbutton", { name: "画布缩放百分比" })).toHaveValue("125");
    const afterReturn = await page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      const state = store.getState();
      return {
        sessionId: state.sessionId,
        templateId: state.draft.definition.templateId,
        selectedObjectId: state.selectedObjectId,
        historyPast: state.historyPast.length,
        historyFuture: state.historyFuture.length,
        dirty: state.dirty,
        device: state.device,
        canvasZoom: state.canvasZoom,
      };
    });
    expect(afterReturn).toEqual(beforeReturn);
    await pressWorkspaceHistory(page, "redo");
    await expect.poll(() => page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      return store.getState().draft.definition.name;
    })).toBe("临时返回后应恢复");

    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(page.getByRole("textbox", { name: "图片替代文字" }))
      .toHaveValue("临时返回期间的页面替代文字");
    expect(dynamic.writes).toEqual([]);
    expect(writes).toEqual([]);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("已有母模板直接进入统一编辑器，覆盖后发布到同一页面装修目录", async ({ page }) => {
    const { forbiddenPageWrites, dynamic } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
    });
    await openTemplateFromCatalog(page, "首屏");
    await expect(page.getByRole("region", { name: /首屏模板设计画布/ })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "模板结构" })
      .getByRole("treeitem").first()).toHaveAttribute("aria-level", "2");
    await expect(page.getByText(/转换为新版|固定模板|动态模板/)).toHaveCount(0);
    await fillTemplateName(page, "品牌首屏母模板");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "保存模板" })).toHaveCount(0);
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    const templateLibrary = page.getByRole("complementary", { name: "模板组件库" });
    const unifiedSourceCard = templateLibrary.locator('[data-template-identity="source:legacy_system_hero"]');
    await expect(unifiedSourceCard).toHaveCount(1);
    await expect(unifiedSourceCard).not.toContainText("草稿 · 发布后可用于页面");
    await expect(page.getByRole("button", { name: "打开首屏模板" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "正在编辑品牌首屏母模板" })).toBeVisible();
    const definition = dynamic.writes[0].body.definition as Record<string, any>;
    const matureNode = Object.values(definition.nodes).find((node: any) => node.type === "HeroTemplate") as any;
    expect(matureNode).toBeTruthy();
    expect(dynamic.writes[0].body.definition.name).toBe("品牌首屏母模板");
    expect(dynamic.writes[0].body.sourceReference).toBe("legacy_system_hero");

    const persisted = dynamic.records[0];
    expect(persisted).toMatchObject({
      ownerId: null,
      sourceType: "SYSTEM",
      sourceReference: "legacy_system_hero",
    });
    persisted.publishedVersion = 1;
    persisted.visibility = "STAFF";
    dynamic.versionsByTemplateId.set(persisted.templateId, [{
      id: 9001,
      dynamicTemplateId: persisted.id,
      version: 1,
      schemaVersion: persisted.draft.definition.schemaVersion,
      definition: structuredClone(persisted.draft.definition),
      definitionChecksum: `published-${persisted.templateId}-v1`,
      versionNote: null,
      publishedAt: "2026-08-29T10:00:00.000Z",
    }]);
    await page.evaluate(() => window.dispatchEvent(new Event("haichuan:dynamic-template-server-changed")));
    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(page.getByRole("button", {
      name: "首屏：点击添加到页面末尾，也可拖到画布指定位置",
    })).toHaveCount(0);
    const publishedTemplateCard = page.getByRole("button", {
      name: "品牌首屏母模板版本1已添加为主舞台，不能再次添加",
    });
    await expect(publishedTemplateCard).toBeVisible();
    await expect(publishedTemplateCard).toBeDisabled();
    const publishedTemplateContainer = publishedTemplateCard
      .locator("xpath=ancestor::*[@data-template-identity='source:legacy_system_hero']");
    await expect(publishedTemplateContainer).toHaveCount(1);
    await expect(publishedTemplateContainer.locator(".homepage-editor__template-badge")).toHaveCount(0);
    await expect(publishedTemplateContainer).not.toContainText("有未发布修改");
    await expect(templateLibrary.getByRole("heading", { name: "品牌展示", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "已发布模板", exact: true })).toHaveCount(0);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("过时系统草稿的修复方案可查看、取消、撤销重做、另存，并仅在显式确认后覆盖来源", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      templateWriteFailureStatuses: [null, 409],
    });
    await openTemplateFromCatalog(page, "首屏");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await expect(page.getByLabel("模板状态：模板草稿已保存")).toBeVisible();
    await expect(page.getByText(/服务端草稿缺少当前系统模板组件/)).toHaveCount(0);

    const persisted = dynamic.records[0];
    const blankDefinition = createBlankDynamicTemplateDefinition(persisted.name);
    blankDefinition.templateId = persisted.templateId;
    blankDefinition.metadata = structuredClone(persisted.draft.definition.metadata);
    const firstRegion = addDynamicTemplateNode(
      blankDefinition,
      blankDefinition.rootNodeId,
      "Container",
    );
    firstRegion.definition.nodes[firstRegion.nodeId].name = "响应式区域";
    const imageSlot = addDynamicTemplateNode(
      firstRegion.definition,
      firstRegion.nodeId,
      "ImageSlot",
    );
    imageSlot.definition.nodes[imageSlot.nodeId].name = "图片槽位";
    imageSlot.definition.slots[imageSlot.slotId!].label = "图片槽位";
    const secondRegion = addDynamicTemplateNode(
      imageSlot.definition,
      imageSlot.definition.rootNodeId,
      "Container",
    );
    secondRegion.definition.nodes[secondRegion.nodeId].name = "内容区域 2";
    const brokenDefinition = secondRegion.definition;
    brokenDefinition.metadata.slotSummary = "1 个已映射槽位";
    persisted.draft.definition = brokenDefinition;
    persisted.slotSummary = "1 个已映射槽位";
    await page.evaluate(() => window.dispatchEvent(new Event("haichuan:dynamic-template-server-changed")));
    await page.reload();
    await page.getByRole("button", { name: "模板设计", exact: true }).click();

    const library = page.locator('[data-unified-template-library="design"]');
    const card = library.locator('[data-template-identity="source:legacy_system_hero"]');
    await expect(card).toHaveCount(1);
    await expect(card.locator('[data-preview-status="ready"]')).toHaveCount(1);
    await expect(card.getByRole("button", { name: /首屏模板/ })).toBeVisible();
    await expect(card.locator("iframe")).toHaveCount(1);

    const recovery = page.getByRole("alert", { name: "修复方案尚未保存" });
    await expect(recovery).toContainText("修复方案尚未保存，原草稿未覆盖");
    await expect(recovery).toContainText("当前画布显示系统修复方案");
    await expect(page.getByRole("button", { name: "保存模板", exact: true })).toBeEnabled();
    await expect(page.getByRole("treeitem", { name: /主视觉图片 图片槽位 必填/ })).toBeVisible();
    await expect(page.locator('.template-editor__canvas-view-readout[aria-label^="画布尺寸 1920 × 1200，缩放 "]')).toBeVisible();
    await expect(page.getByText("PUBLISH_REQUIRES_SLOT")).toHaveCount(0);
    expect(dynamic.writes).toHaveLength(1);

    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const saveRecovery = page.getByRole("dialog", { name: /保存“首屏”的修复草稿/ });
    await expect(saveRecovery).toContainText(`这会覆盖模板 ID“${persisted.templateId}”当前保存的草稿定义`);
    await expect(saveRecovery).toContainText("不会发布模板、升级页面实例或修改任何页面草稿");
    await saveRecovery.getByRole("button", { name: "保存修复草稿" }).click();
    await expect(page.getByText("其他人已经保存了这个模板的新修改；当前工作仍完整保留，请另存为新模板。")).toBeVisible();
    await expect(recovery).toBeVisible();
    await expect(saveRecovery).toHaveCount(0);
    expect(dynamic.writeAttempts).toHaveLength(2);
    expect(dynamic.writes).toHaveLength(1);
    expect(persisted.draft.definition).toEqual(brokenDefinition);

    await recovery.getByRole("button", { name: "查看变化" }).click();
    const changes = page.getByRole("dialog", { name: "系统修复方案变化" });
    await expect(changes).toContainText("比较基线：服务端草稿 revision 1");
    await expect(changes).toContainText("查看变化不会保存、发布或修改任何页面");
    await changes.locator(".ant-modal-footer button").click();
    expect(dynamic.writes).toHaveLength(1);

    await recovery.getByRole("button", { name: "取消本次修复" }).click();
    await page.getByRole("dialog", { name: "取消本次修复？" })
      .getByRole("button", { name: "取消本次修复" }).click();
    await expect(page.getByRole("alert", { name: "修复方案尚未保存" })).toHaveCount(0);
    expect(dynamic.writes).toHaveLength(1);

    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(page.getByRole("alert", { name: "修复方案尚未保存" })).toBeVisible();
    await page.getByRole("button", { name: "重做", exact: true }).click();
    await expect(page.getByRole("alert", { name: "修复方案尚未保存" })).toHaveCount(0);
    await page.getByRole("button", { name: "撤销", exact: true }).click();

    const restoredRecovery = page.getByRole("alert", { name: "修复方案尚未保存" });
    await restoredRecovery.getByRole("button", { name: "另存为新模板" }).click();
    const saveCopy = page.getByRole("dialog", { name: "另存为模板" });
    await saveCopy.getByRole("textbox", { name: "新模板名称" }).fill("首屏修复副本");
    await saveCopy.getByRole("button", { name: "另存为模板" }).click();
    await expect(page.getByText("“首屏修复副本”副本已保存为新的账号模板")).toBeVisible();
    expect(dynamic.writes).toHaveLength(2);
    expect(dynamic.writes[1]).toMatchObject({
      method: "POST",
      pathname: "/api/page-modules/dynamic-templates",
    });
    expect(persisted.draft.definition).toEqual(brokenDefinition);
    await expect(page.getByRole("alert", { name: "修复方案尚未保存" })).toHaveCount(0);

    await card.getByRole("button", { name: /首屏模板/ }).click();
    const reopenedRecovery = page.getByRole("alert", { name: "修复方案尚未保存" });
    await expect(reopenedRecovery).toBeVisible();
    await reopenedRecovery.getByRole("button", { name: "保存修复草稿" }).click();
    const confirmOverwrite = page.getByRole("dialog", { name: /保存“首屏”的修复草稿/ });
    await confirmOverwrite.getByRole("button", { name: "保存修复草稿" }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    await expect(reopenedRecovery).toHaveCount(0);
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
    expect(dynamic.writeAttempts).toHaveLength(4);
    expect(dynamic.writes.at(-1)).toMatchObject({
      method: "PATCH",
      pathname: expect.stringMatching(/\/draft$/),
    });
    expect(Object.values(persisted.draft.definition.nodes).some(
      (node: any) => node.type === "HeroTemplate",
    )).toBe(true);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("模板设计发布后由页面装修同一目录直接插入精确版本", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });
    await openTemplateFromCatalog(page, "首屏");
    await fillTemplateName(page, "目录互通首屏");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();

    const persisted = dynamic.records[0];
    expect(persisted.sourceReference).toBe("legacy_system_hero");
    await page.getByRole("button", { name: "页面装修" }).click();
    const pageLibrary = page.getByRole("complementary", { name: "模板组件库" });
    const card = pageLibrary.getByRole("button", { name: "添加目录互通首屏版本1" });
    await expect(card).toBeVisible();
    await expect(card.locator("xpath=ancestor::*[@data-template-identity='source:legacy_system_hero']"))
      .toHaveCount(1);
    await card.click();
    await expect(page.getByText("已添加“目录互通首屏”v1，可在右侧填写页面内容")).toBeVisible();
    await expect(page.getByRole("region", { name: "模板实例属性" })).toContainText("目录互通首屏");
    await expect(page.getByRole("group", { name: "店铺装修工作模式切换" }))
      .toHaveAttribute("data-active-mode", "page");
    await expect(page.locator(".template-editor__toolbar")).toHaveCount(0);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("超级管理员编辑统一母模板时保持独立撤销与页面会话隔离", async ({ page }) => {
    const { writes, dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    const pageLayer = page.locator(".homepage-editor__page-workspace .homepage-editor__structure-workspace");
    const layers = page.locator(".homepage-editor__page-workspace .homepage-editor__layer-item");
    await layers.first().getByRole("button", { name: "隐藏首屏" }).click();
    const visibilityNotice = page.locator(".ant-message-notice-content").filter({ hasText: "已隐藏「首屏」" });
    await expect(visibilityNotice).toBeVisible();
    await expect(visibilityNotice).toHaveCSS("pointer-events", "none");
    await page.getByRole("button", { name: /移动端.*布局/ }).click();

    await openTemplateFromCatalog(page, "首屏");
    await expect(page.getByRole("region", { name: /模板设计画布/ })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "模板结构" })
      .getByRole("treeitem").first()).toHaveAttribute("aria-level", "2");
    await expect(pageLayer).toBeHidden();

    const name = (await openTemplateBasicInfo(page)).getByRole("textbox", { name: "模板名称", exact: true });
    const originalName = await name.inputValue();
    await name.fill("品牌首屏｜全宽主视觉");
    await pressWorkspaceHistory(page, "undo");
    await expect(name).toHaveValue(originalName);
    await pressWorkspaceHistory(page, "redo");
    await expect(name).toHaveValue("品牌首屏｜全宽主视觉");

    const mobileTemplateLayout = page.locator(".template-editor__toolbar")
      .getByRole("button", { name: /移动端模板布局/ });
    await mobileTemplateLayout.click();
    await expect(mobileTemplateLayout).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".template-editor__viewport-frame")).toHaveAttribute("title", /模板隔离画布/);
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    expect(writes).toEqual([]);
    expect(dynamic.writes).toHaveLength(1);
    expect(dynamic.writes[0]).toMatchObject({
      method: "POST",
      pathname: "/api/page-modules/dynamic-templates",
      body: { sourceReference: "legacy_system_hero" },
    });
    expect(dynamic.writes[0].body.definition.name).toBe("品牌首屏｜全宽主视觉");
    expect(JSON.stringify(dynamic.writes[0].body)).not.toContain("PageDocument");

    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(pageLayer).toBeVisible();
    await expect(layers.first()).toHaveAttribute("data-layer-visible", "false");
    await expect(page.getByRole("button", { name: /移动端.*布局/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("dialog", { name: "切换到页面装修？" })).toHaveCount(0);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("账号母模板直接进入统一编辑器，覆盖只写统一模板草稿", async ({ page }, testInfo) => {
    const personal = personalTemplateFixture();
    const { writes, dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      personalTemplates: [personal],
    });
    await openTemplateFromCatalog(page, personal.name);
    const name = (await openTemplateBasicInfo(page)).getByRole("textbox", { name: "模板名称", exact: true });
    await name.fill("我的品牌首屏｜调整版");

    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "关闭模板会话" }).click();
    const transitionDialog = page.getByRole("dialog", {
      name: "关闭“我的品牌首屏｜调整版”的模板编辑会话？",
    });
    await expect(transitionDialog).toContainText("当前模板还有未保存修改；不保存并关闭后，这些修改将丢失");
    await expect(transitionDialog.getByRole("button", { name: "不保存并关闭" })).toBeVisible();
    await expect(transitionDialog.getByRole("button", { name: "继续编辑" })).toBeFocused();
    await page.setViewportSize({ width: 1440, height: 900 });
    await attachScreenshot(page, testInfo, "template-unsaved-transition-desktop");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(transitionDialog).toBeInViewport();
    await expect(transitionDialog.getByRole("button", { name: "保存后关闭" })).toBeVisible();
    const footerMetrics = await transitionDialog
      .locator(".template-editor__transition-footer")
      .evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        children: Array.from(element.children).map((child) => ({
          clientWidth: (child as HTMLElement).clientWidth,
          scrollWidth: (child as HTMLElement).scrollWidth,
        })),
      }));
    expect(footerMetrics, JSON.stringify(footerMetrics)).toMatchObject({
      scrollWidth: footerMetrics.clientWidth,
    });
    await attachScreenshot(page, testInfo, "template-unsaved-transition-narrow");

    await page.setViewportSize({ width: 1280, height: 720 });
    await transitionDialog.getByRole("button", { name: "继续编辑" }).click();
    await expect(transitionDialog).toHaveCount(0);
    const resumedName = (await openTemplateBasicInfo(page))
      .getByRole("textbox", { name: "模板名称", exact: true });
    await expect(resumedName).toHaveValue("我的品牌首屏｜调整版");
    expect(dynamic.writes).toEqual([]);

    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "关闭模板会话" }).click();
    await page.getByRole("dialog", {
      name: "关闭“我的品牌首屏｜调整版”的模板编辑会话？",
    }).getByRole("button", { name: "保存后关闭" }).click();
    await expect(page.getByRole("region", { name: "空模板画布" })).toBeVisible();
    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(page.locator(".homepage-editor__page-workspace .homepage-editor__structure-workspace")).toBeVisible();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    expect(writes).toEqual([]);
    expect(dynamic.writes).toHaveLength(1);
    expect(dynamic.writes[0]).toMatchObject({
      method: "POST",
      pathname: "/api/page-modules/dynamic-templates",
      body: { sourceReference: `legacy_personal_${personal.id}` },
    });
    expect((dynamic.writes[0].body.definition as Record<string, any>).name).toBe("我的品牌首屏｜调整版");
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("打开页面时个人模板只提示可升级数量，不改写当前草稿或产生 dirty", async ({ page }) => {
    const draft = makeHeroDraft();
    (draft.puckData.content[0].props as Record<string, any>).__templateOrigin = {
      kind: "personal",
      templateId: 71,
      revision: 1,
    };
    draft.puckData.content[0].props.title = "必须保留的真实页面标题";
    const latest = personalTemplateFixture({
      revision: 2,
      layoutData: {
        version: 2,
        frame: { aspectRatioByViewport: { desktop: 0.5 } },
      },
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      draft,
      personalTemplates: [latest],
    });

    const hint = page.getByRole("status").filter({ hasText: "历史个人模板实例可升级" });
    await expect(hint).toContainText("1 个历史个人模板实例可升级");
    await expect(hint).toContainText("打开页面不会自动改写");
    await expect(page.getByText("修改已更新，尚未保存页面草稿", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
    await expect(page.getByText(/已将 1 个历史模板实例布局升级到最新版本/)).toHaveCount(0);
    await expect(
      page.frameLocator(".homepage-editor__canvas-scale iframe")
        .getByText("必须保留的真实页面标题"),
    ).toBeVisible();
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("系统母模板新版只显示提示，运营确认后才升级页面草稿且不自动发布", async ({ page }) => {
    const draft = makeHeroDraft();
    (draft.puckData.content[0].props as Record<string, any>).__templateOrigin = {
      kind: "system",
      contractKey: "hero",
      version: 1,
    };
    draft.puckData.content[0].props.title = "系统升级仍保留的页面标题";
    const { system, forbiddenPageWrites } = await openWorkspaceShell(page, { draft });
    const contract = getContentTemplateContract("首屏主视觉")!;
    system.versions.set("hero", [{
      version: 2,
      contractKey: "hero",
      moduleType: "首屏主视觉",
      contractVersion: contract.version,
      layoutData: {
        version: 2,
        frame: { aspectRatioByViewport: { desktop: 0.5 } },
      },
      changeNote: "新版构图",
      createdById: 1,
      createdAt: "2026-08-29T10:00:00.000Z",
    }]);
    system.activeVersions.set("hero", 2);
    await page.evaluate(() => window.dispatchEvent(new Event("haichuan:system-template-changed")));

    const cardControl = page.getByRole("button", {
      name: "首屏已有主舞台实例，不能再次添加",
    });
    await expect(cardControl).toBeVisible();
    await expect(cardControl).toHaveAttribute("aria-disabled", "true");
    await expect(cardControl).toHaveAttribute("draggable", "false");
    await expect(cardControl).toHaveAccessibleName("首屏已有主舞台实例，不能再次添加");
    await expect(cardControl.locator("..")).not.toContainText("已添加 · 主舞台不可重复");
    const layerCount = await page.locator(".homepage-editor__layer-item").count();
    await observeTrustedTemplateDrags(page);
    await dragTemplateCard(page, cardControl, page.locator(".homepage-editor__canvas-document"));
    expect(await readTemplateDrags(page)).toEqual([]);
    await clickDisabledTemplateCard(page, cardControl);
    await cardControl.press("Enter");
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(layerCount);

    const upgrade = page.getByRole("button", { name: /升级页面中的首屏模板/ });
    await expect(upgrade).toBeVisible();
    await expect(page.getByText("修改已更新，尚未保存页面草稿", { exact: true })).toHaveCount(0);
    await upgrade.click();
    const confirm = page.getByRole("dialog", { name: "升级“首屏”页面实例？" });
    await expect(confirm).toContainText("不会自动发布");
    await confirm.getByRole("button", { name: /取\s*消/ }).click();
    await upgrade.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "升级“首屏”页面实例？" }).last()).toBeVisible();
    await page.getByRole("dialog", { name: "升级“首屏”页面实例？" }).last()
      .getByRole("button", { name: "升级当前页面草稿" }).click();

    await expect(page.getByText("修改已更新，尚未保存页面草稿", { exact: true })).toBeVisible();
    await expect(
      page.frameLocator(".homepage-editor__canvas-scale iframe")
        .getByText("系统升级仍保留的页面标题"),
    ).toBeVisible();
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("系统主舞台卡无新版或新版布局非法时保持可发现且不开放升级", async ({ page }) => {
    const draft = makeHeroDraft();
    (draft.puckData.content[0].props as Record<string, any>).__templateOrigin = {
      kind: "system",
      contractKey: "hero",
      version: 1,
    };
    const { system, forbiddenPageWrites } = await openWorkspaceShell(page, { draft });
    const cardControl = page.getByRole("button", {
      name: "首屏已有主舞台实例，不能再次添加",
    });
    await expect(cardControl).toBeVisible();
    await expect(page.getByRole("button", { name: /升级页面中的首屏模板/ })).toHaveCount(0);

    const contract = getContentTemplateContract("首屏主视觉")!;
    system.versions.set("hero", [{
      version: 2,
      contractKey: "hero",
      moduleType: "首屏主视觉",
      contractVersion: contract.version,
      layoutData: { version: 999 },
      changeNote: "非法构图",
      createdById: 1,
      createdAt: "2026-08-29T10:00:00.000Z",
    }]);
    system.activeVersions.set("hero", 2);
    await page.evaluate(() => window.dispatchEvent(new Event("haichuan:system-template-changed")));

    await expect(cardControl).toBeVisible();
    await expect(page.getByRole("button", { name: /升级页面中的首屏模板/ })).toHaveCount(0);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("新模板 POST 保存被服务端 403 拒绝后关闭不再重复写入，显式重试成功可恢复", async ({ page }) => {
    const denied = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      templateWriteFailureStatuses: [403],
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    const deniedTemplateInfo = await fillTemplateName(page, "首次保存权限被拒绝");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();

    const permissionStatus = page.locator('.template-editor__toolbar-state[data-mode="error"]');
    await expect(permissionStatus).toHaveAttribute("data-mode", "error");
    await expect(permissionStatus).toContainText("权限不足");
    await expect(page.getByRole("button", { name: "重试保存模板草稿" }))
      .toHaveAttribute("title", /失败不会丢失修改/);
    expect(denied.dynamic.writeAttempts).toEqual([{
      method: "POST",
      pathname: "/api/page-modules/dynamic-templates",
    }]);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await openTemplateMoreMenu(page);
      await page.getByRole("menuitem", { name: "关闭模板会话" }).click();
      const closeDialog = page.getByRole("dialog", {
        name: "关闭“首次保存权限被拒绝”的模板编辑会话？",
      });
      await expect(closeDialog).toContainText("服务端已拒绝当前账号保存这个模板");
      await expect(closeDialog.getByRole("button", { name: "保存后关闭" })).toHaveCount(0);
      await expect(closeDialog.getByRole("button", { name: "不保存并关闭" })).toBeVisible();
      await closeDialog.getByRole("button", { name: "继续编辑" }).click();
    }
    expect(denied.dynamic.writeAttempts).toHaveLength(1);
    await expect(deniedTemplateInfo.getByRole("textbox", { name: "模板名称", exact: true }))
      .toHaveValue("首次保存权限被拒绝");

    await page.getByRole("button", { name: "重试保存模板草稿" }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    await expect(permissionStatus).toHaveCount(0);
    expect(denied.dynamic.writeAttempts).toHaveLength(2);
    expect(denied.dynamic.writes).toHaveLength(1);
    expect(denied.dynamic.writes[0]).toMatchObject({ method: "POST" });

    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "关闭模板会话" }).click();
    await expect(page.getByRole("region", { name: "空模板画布" })).toBeVisible();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    await expect(permissionStatus).toHaveCount(0);
    await expect(page.getByRole("button", { name: "保存模板", exact: true })).toBeEnabled();
    expect(denied.forbiddenPageWrites).toEqual([]);
  });

  test("已有模板 PATCH 保存被服务端 403 拒绝后继续编辑仍保持权限状态并可恢复", async ({ page }) => {
    const denied = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      templateWriteFailureStatuses: [null, 403],
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    await fillTemplateName(page, "已有模板权限恢复测试");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    await fillTemplateName(page, "已有模板权限被拒绝");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const permissionStatus = page.locator('.template-editor__toolbar-state[data-mode="error"]');
    await expect(permissionStatus).toBeVisible();
    await expect(page.getByRole("button", { name: "重试保存模板草稿" }))
      .toHaveAttribute("title", /失败不会丢失修改/);
    expect(denied.dynamic.writeAttempts.map((attempt) => attempt.method)).toEqual(["POST", "PATCH"]);

    await fillTemplateName(page, "权限拒绝后继续编辑仍保留");
    await expect(permissionStatus).toBeVisible();
    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "关闭模板会话" }).click();
    const closeDialog = page.getByRole("dialog", {
      name: "关闭“权限拒绝后继续编辑仍保留”的模板编辑会话？",
    });
    await expect(closeDialog.getByRole("button", { name: "保存后关闭" })).toHaveCount(0);
    await closeDialog.getByRole("button", { name: "继续编辑" }).click();
    expect(denied.dynamic.writeAttempts).toHaveLength(2);

    await page.getByRole("button", { name: "重试保存模板草稿" }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    await expect(permissionStatus).toHaveCount(0);
    expect(denied.dynamic.writeAttempts.map((attempt) => attempt.method)).toEqual(["POST", "PATCH", "PATCH"]);
    expect(denied.dynamic.writes).toHaveLength(2);
    expect(denied.dynamic.writes[1]).toMatchObject({ method: "PATCH" });
    expect(denied.forbiddenPageWrites).toEqual([]);
  });

  test("母模板保存失败保留脏草稿，EDITOR 只能使用模板且看不到设计入口", async ({ page }) => {
    const failed = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      failTemplateWrites: true,
    });
    await openTemplateFromCatalog(page, "首屏");
    await fillTemplateName(page, "失败仍保留的模板");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板保存失败，修改仍在", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 768 });
    const failedSaveStatus = page.locator('.template-editor__toolbar-state[data-mode="error"]');
    await expect(failedSaveStatus).toHaveAttribute("data-mode", "error");
    await expect(failedSaveStatus).toContainText("保存失败");
    const retrySave = page.getByRole("button", { name: "重试保存模板草稿" });
    await expect(retrySave).toBeEnabled();
    await expect(retrySave).toHaveAttribute("title", /失败不会丢失修改/);
    await page.getByRole("button", { name: "展开模板属性面板" }).click();
    await expect(templateNameInput(page)).toHaveValue("失败仍保留的模板");
    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "关闭模板会话" }).click();
    const transitionDialog = page.getByRole("dialog", {
      name: "关闭“失败仍保留的模板”的模板编辑会话？",
    });
    await transitionDialog.getByRole("button", { name: "保存后关闭" }).click();
    await expect(transitionDialog).toBeVisible();
    await expect(templateNameInput(page)).toHaveValue("失败仍保留的模板");
    expect(failed.writes).toEqual([]);
    expect(failed.dynamic.writeAttempts).toHaveLength(2);
    expect(failed.dynamic.writes).toEqual([]);
    expect(failed.forbiddenPageWrites).toEqual([]);

    await page.unrouteAll({ behavior: "wait" });
    const editor = await openWorkspaceShell(page, {
      role: "EDITOR",
      personalTemplates: [personalTemplateFixture()],
    });
    await expect(page.getByRole("button", { name: /^编辑.+模板；/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "编辑模板" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "重命名模板" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "复制模板" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "删除模板" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "模板设计" })).toBeDisabled();
    expect(editor.writes).toEqual([]);
    expect(editor.forbiddenPageWrites).toEqual([]);
  });

  test("母模板保存冲突时保留当前工作，并将本地修改安全另存为新模板", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    await fillTemplateName(page, "冲突来源模板");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    const sourceTemplate = dynamic.records[0];
    const sourceName = sourceTemplate.name;
    const sourceTemplateId = sourceTemplate.templateId;

    let historicalDefinition = createBlankDynamicTemplateDefinition(sourceName);
    historicalDefinition.templateId = sourceTemplateId;
    const historicalRegion = addDynamicTemplateNode(
      historicalDefinition,
      historicalDefinition.rootNodeId,
      "Container",
    );
    historicalDefinition = historicalRegion.definition;
    const historicalHeading = addDynamicTemplateNode(
      historicalDefinition,
      historicalRegion.nodeId,
      "HeadingSlot",
    );
    historicalDefinition = historicalHeading.definition;
    const historicalSlotId = historicalHeading.slotId!;
    historicalDefinition.defaultContent[historicalSlotId] = "来源模板保留的历史默认标题";
    historicalDefinition.previewContent ??= {};
    historicalDefinition.previewContent[historicalSlotId] = "来源模板保留的历史预览标题";
    historicalDefinition.slots[historicalSlotId].emptyPolicy = "use-default";
    sourceTemplate.draft.definition = structuredClone(historicalDefinition);
    sourceTemplate.draft.definitionChecksum = "historical-content-fixture";

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await openTemplateFromCatalog(page, sourceName);

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await expect(inspector.getByText("当前草稿包含历史默认内容或兼容规则", { exact: true })).toHaveCount(0);
    const compatibilityIssue = inspector.getByText(
      "模板正式版本不能保存运营内容；默认展示请使用槽位样式和空值规则。",
      { exact: true },
    );
    await expect(compatibilityIssue).toBeVisible();
    await compatibilityIssue.locator("..").getByRole("button", { name: "安全修复并重验" }).click();
    await expect(compatibilityIssue).toHaveCount(0);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(compatibilityIssue).toBeVisible();
    await compatibilityIssue.locator("..").getByRole("button", { name: "安全修复并重验" }).click();
    await expect(compatibilityIssue).toHaveCount(0);
    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "模板资料与使用限制" }).click();
    await inspector.getByRole("textbox", { name: "模板说明" }).fill("只在冲突副本中保留的构图说明");
    sourceTemplate.draft.revision += 1;
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await page.setViewportSize({ width: 1024, height: 768 });

    const conflictStatus = page.locator('.template-editor__toolbar-state[data-mode="warning"]');
    await expect(conflictStatus).toHaveAttribute("data-mode", "warning");
    await expect(conflictStatus).toContainText("保存冲突");
    await expect(page.getByText(
      "其他人已经保存了这个模板的新修改；当前工作仍完整保留，请另存为新模板。",
      { exact: true },
    )).toBeVisible();
    await page.getByRole("button", { name: "展开模板属性面板" }).click();
    const conflictInfo = await openTemplateBasicInfo(page);
    await expect(conflictInfo.getByRole("textbox", { name: "模板说明" }))
      .toHaveValue("只在冲突副本中保留的构图说明");
    await expect(conflictInfo.getByText("当前草稿包含历史默认内容或兼容规则", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", {
      name: /发布模板新版本（当前模板存在保存冲突，请先将修改另存为新模板）/,
    })).toBeDisabled();

    await conflictInfo.getByRole("textbox", { name: "模板说明" }).fill("冲突后继续编辑也必须保留的构图说明");
    await expect(conflictStatus).toBeVisible();
    await expect(conflictInfo.getByRole("textbox", { name: "模板说明" }))
      .toHaveValue("冲突后继续编辑也必须保留的构图说明");

    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "关闭模板会话" }).click();
    const conflictCloseDialog = page.getByRole("dialog", {
      name: `关闭“${sourceName}”的模板编辑会话？`,
    });
    await expect(conflictCloseDialog).toContainText("当前模板存在保存冲突");
    await expect(conflictCloseDialog.getByRole("button", { name: "保存后关闭" })).toHaveCount(0);
    await expect(conflictCloseDialog.getByRole("button", { name: "不保存并关闭" })).toBeVisible();
    await conflictCloseDialog.getByRole("button", { name: "继续编辑" }).click();
    await expect(conflictInfo.getByRole("textbox", { name: "模板说明" }))
      .toHaveValue("冲突后继续编辑也必须保留的构图说明");

    const preserveCopy = page.getByRole("button", { name: "另存当前冲突修改为新模板" });
    await expect(preserveCopy).toBeEnabled();
    await expect(preserveCopy).toHaveAttribute("title", /完整保留当前工作/);
    await preserveCopy.click();
    const saveDialog = page.getByRole("dialog", { name: "另存为模板" });
    await expect(saveDialog.getByText("副本不会包含历史默认内容或兼容规则", { exact: true })).toHaveCount(0);
    await saveDialog.getByRole("textbox", { name: "新模板名称" }).fill("冲突修改保留副本");
    await saveDialog.getByRole("button", { name: "另存为模板" }).click();

    await expect(page.getByText("“冲突修改保留副本”副本已保存为新的账号模板")).toBeVisible();
    const copied = dynamic.records.find((record) => record.name === "冲突修改保留副本");
    expect(copied?.templateId).not.toBe(sourceTemplateId);
    expect(copied?.sourceReference).toBe(sourceTemplateId);
    expect(copied?.draft.definition.description).toBe("冲突后继续编辑也必须保留的构图说明");
    expect(copied?.draft.definition.defaultContent).toEqual({});
    expect(copied?.draft.definition.previewContent).toEqual({});
    expect(copied?.draft.definition.slots[historicalSlotId].emptyPolicy).toBe("hide");
    const expandTemplateLibrary = page.getByRole("button", { name: "展开模板组件库" });
    if (await expandTemplateLibrary.isVisible().catch(() => false)) await expandTemplateLibrary.click();
    await expect(page.locator(
      `[data-template-catalog-card="shared"][data-template-identity="template:${copied?.templateId}"] .homepage-editor__template-card-status`,
    )).toHaveText("草稿");
    expect(sourceTemplate.name).toBe(sourceName);
    expect(sourceTemplate.draft.definition.defaultContent[historicalSlotId])
      .toBe("来源模板保留的历史默认标题");
    expect(sourceTemplate.draft.definition.previewContent[historicalSlotId])
      .toBe("来源模板保留的历史预览标题");
    expect(dynamic.writes).toHaveLength(2);
    expect(dynamic.writes[1]).toMatchObject({
      method: "POST",
      pathname: "/api/page-modules/dynamic-templates",
    });
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("模板历史选择零写入、单步撤销，并只在显式保存时提交可信来源", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      versionDetailFailureVersions: [1],
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    await fillTemplateName(page, "历史版本一");
    await addTemplateStructureNode(page, "标题槽位 内容槽位");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();

    await expect(page.getByRole("button", { name: /正在编辑历史版本一模板/ })).toBeVisible();
    await fillTemplateName(page, "历史版本二");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await expect(page.getByText("模板 v2 已发布；现有页面仍保持原版本")).toBeVisible();
    const writesBeforeHistory = dynamic.writes.length;

    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "版本历史" }).click();
    const historyDialog = page.getByRole("dialog", { name: "模板版本历史" });
    await expect(historyDialog.getByText("历史读取与载入都不会自动写入")).toBeVisible();
    await historyDialog.getByRole("button", { name: /^v1/ }).click();
    await expect(historyDialog.getByText("该版本详情读取或完整性校验失败，当前模板草稿未改变")).toBeVisible();
    expect(dynamic.writes).toHaveLength(writesBeforeHistory);
    await expect.poll(() => page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      return store.getState().draft?.definition.name;
    })).toBe("历史版本二");
    await historyDialog.getByRole("button", { name: /重\s*试/ }).click();
    await expect(historyDialog.getByRole("region", { name: "正式版本 1 预览" })).toContainText("与当前草稿比较");
    expect(dynamic.writes).toHaveLength(writesBeforeHistory);

    await historyDialog.getByRole("button", { name: "载入当前草稿" }).click();
    const restoreDialog = page.getByRole("dialog", { name: "将 v1 载入当前草稿？" });
    await expect(restoreDialog).toContainText("不会自动保存、发布或修改任何页面");
    await restoreDialog.getByRole("button", { name: "载入当前草稿" }).click();
    expect(dynamic.writes).toHaveLength(writesBeforeHistory);
    await expect(page.getByText("已将 v1 载入当前内存草稿，尚未保存或发布")).toBeVisible();
    const info = await openTemplateBasicInfo(page);
    await expect(info.getByRole("textbox", { name: "模板名称", exact: true })).toHaveValue("历史版本一");
    await expect.poll(() => page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      const state = store.getState();
      return {
        dirty: state.dirty,
        historyRestore: state.draft?.historyRestore,
      };
    })).toEqual({
      dirty: true,
      historyRestore: {
        sourceTemplateId: expect.stringMatching(/^tpl_/),
        sourceVersion: 1,
        sourceChecksum: expect.stringMatching(/^published-.+-v1$/),
      },
    });
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(info.getByRole("textbox", { name: "模板名称", exact: true })).toHaveValue("历史版本二");
    await expect.poll(() => page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      const state = store.getState();
      return {
        dirty: state.dirty,
        historyRestore: state.draft?.historyRestore ?? null,
      };
    })).toEqual({ dirty: false, historyRestore: null });
    await expect(page.getByRole("button", { name: "重做", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "重做", exact: true }).click();
    await expect(info.getByRole("textbox", { name: "模板名称", exact: true })).toHaveValue("历史版本一");
    await expect.poll(() => page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      const state = store.getState();
      return {
        dirty: state.dirty,
        name: state.draft?.definition.name,
        historyRestore: state.draft?.historyRestore,
      };
    })).toEqual({
      dirty: true,
      name: "历史版本一",
      historyRestore: {
        sourceTemplateId: expect.stringMatching(/^tpl_/),
        sourceVersion: 1,
        sourceChecksum: expect.stringMatching(/^published-.+-v1$/),
      },
    });

    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await info.getByRole("textbox", { name: "模板说明" }).fill("撤销恢复后的普通修改");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const normalSaveWrite = dynamic.writes.at(-1);
    expect(normalSaveWrite).toMatchObject({ method: "PATCH" });
    expect(normalSaveWrite?.body).not.toHaveProperty("restoreFromVersion");
    expect(normalSaveWrite?.body).not.toHaveProperty("restoreFromChecksum");

    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "版本历史" }).click();
    const secondHistoryDialog = page.getByRole("dialog", { name: "模板版本历史" });
    await secondHistoryDialog.getByRole("button", { name: /^v1/ }).click();
    await secondHistoryDialog.getByRole("button", { name: "载入当前草稿" }).click();
    await page.getByRole("dialog", { name: "将 v1 载入当前草稿？" })
      .getByRole("button", { name: "载入当前草稿" }).click();
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const restoreWrite = dynamic.writes.at(-1);
    expect(restoreWrite).toMatchObject({
      method: "PATCH",
      body: {
        expectedRevision: 5,
        restoreFromVersion: 1,
        restoreFromChecksum: expect.stringMatching(/^published-.+-v1$/),
      },
    });
    expect(forbiddenPageWrites).toEqual([]);

    const writesBeforeNewDraft = dynamic.writes.length;
    await page.setViewportSize({ width: 390, height: 844 });
    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "版本历史" }).click();
    const thirdHistoryDialog = page.getByRole("dialog", { name: "模板版本历史" });
    await expect(thirdHistoryDialog).toBeVisible();
    const compactHistoryLayout = await thirdHistoryDialog.locator(".template-editor__history-layout").evaluate((element) => ({
      columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
      fits: element.scrollWidth <= element.clientWidth + 1,
    }));
    expect(compactHistoryLayout).toEqual({ columns: 1, fits: true });
    await thirdHistoryDialog.getByRole("button", { name: /^v1/ }).click();
    await thirdHistoryDialog.getByRole("button", { name: "从此版本新建草稿" }).click();
    await page.getByRole("dialog", { name: "从 v1 新建草稿？" })
      .getByRole("button", { name: "新建内存草稿" }).click();
    expect(dynamic.writes).toHaveLength(writesBeforeNewDraft);
    const newDraft = await page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      const draft = store.getState().draft!;
      return {
        sourceType: draft.sourceType,
        templateId: draft.definition.templateId,
        sourceReference: draft.sourceReference,
        defaultContent: draft.definition.defaultContent,
        previewContent: draft.definition.previewContent,
      };
    });
    expect(newDraft.sourceType).toBe("local");
    expect(newDraft.templateId).not.toBe(dynamic.records[0].templateId);
    expect(newDraft.sourceReference).toBe(dynamic.records[0].templateId);
    expect(newDraft.defaultContent).toEqual({});
    expect(newDraft.previewContent).toEqual({});
  });

  test("模板历史恢复保存失败后仍保留完整内容、可信令牌与可重试脏状态", async ({ page }) => {
    const { dynamic } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      templateWriteFailureStatuses: [null, null, 503],
    });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    await fillTemplateName(page, "失败保留版本一");
    await addTemplateStructureNode(page, "标题槽位 内容槽位");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();
    await fillTemplateName(page, "失败保留版本二");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await expect(page.getByText("模板 v2 已发布；现有页面仍保持原版本")).toBeVisible();

    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "版本历史" }).click();
    const history = page.getByRole("dialog", { name: "模板版本历史" });
    await history.getByRole("button", { name: /^v1/ }).click();
    await history.getByRole("button", { name: "载入当前草稿" }).click();
    await page.getByRole("dialog", { name: "将 v1 载入当前草稿？" })
      .getByRole("button", { name: "载入当前草稿" }).click();
    const stateBeforeFailure = await page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      const state = store.getState();
      return {
        name: state.draft?.definition.name,
        dirty: state.dirty,
        historyRestore: state.draft?.historyRestore,
      };
    });
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板保存失败，修改仍在", { exact: true })).toBeVisible();
    const recoveryStatus = page.locator('.template-editor__toolbar-state[data-mode="error"]');
    await expect(recoveryStatus).toContainText("保存失败");
    await expect(page.getByRole("button", { name: "重试保存模板草稿" }))
      .toHaveAttribute("title", /失败不会丢失修改/);
    await expect.poll(() => page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      const state = store.getState();
      return {
        name: state.draft?.definition.name,
        dirty: state.dirty,
        historyRestore: state.draft?.historyRestore,
        saveStatus: state.saveStatus,
      };
    })).toEqual({ ...stateBeforeFailure, saveStatus: "error" });
    expect(dynamic.writeAttempts.at(-1)?.pathname).toMatch(/\/draft$/);
  });

  test("模板版本详情连续 404、500、503 都保留当前草稿且可原位重试", async ({ page }) => {
    const { dynamic } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      versionDetailFailureStatuses: { 1: [404, 500, 503] },
    });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    await fillTemplateName(page, "详情失败版本一");
    await addTemplateStructureNode(page, "标题槽位 内容槽位");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await page.getByRole("treeitem", { name: /详情失败版本一 模板/ }).click();
    await fillTemplateName(page, "详情失败版本二");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await page.getByRole("treeitem", { name: /详情失败版本二 模板/ }).click();
    await fillTemplateName(page, "详情失败当前草稿");
    const writesBeforeRead = dynamic.writes.length;

    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "版本历史" }).click();
    const history = page.getByRole("dialog", { name: "模板版本历史" });
    await history.getByRole("button", { name: /^v1/ }).click();
    for (let failureIndex = 0; failureIndex < 3; failureIndex += 1) {
      await expect(history.getByText("该版本详情读取或完整性校验失败，当前模板草稿未改变")).toBeVisible();
      await expect.poll(() => page.evaluate(async () => {
        const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
        const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
        return store.getState().draft?.definition.name;
      })).toBe("详情失败当前草稿");
      expect(dynamic.writes).toHaveLength(writesBeforeRead);
      await history.getByRole("button", { name: /重\s*试/ }).click();
    }
    await expect(history.getByRole("region", { name: "正式版本 1 预览" })).toBeVisible();
    await expect.poll(() => page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ modulePath);
      return store.getState().draft?.definition.name;
    })).toBe("详情失败当前草稿");
    expect(dynamic.writes).toHaveLength(writesBeforeRead);
  });

  test("延迟返回的模板 v1 详情不能覆盖后选择的 v2", async ({ page }) => {
    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      versionDetailResponseDelays: { 1: 300, 2: 10 },
    });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    await fillTemplateName(page, "延迟模板版本一");
    await addTemplateStructureNode(page, "标题槽位 内容槽位");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await page.getByRole("treeitem", { name: /延迟模板版本一 模板/ }).click();
    await fillTemplateName(page, "延迟模板版本二");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await page.getByRole("button", { name: "发布模板新版本" }).click();

    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "版本历史" }).click();
    const history = page.getByRole("dialog", { name: "模板版本历史" });
    await history.getByRole("button", { name: /^v1/ }).click();
    await history.getByRole("button", { name: /^v2/ }).click();
    await expect(history.getByRole("region", { name: "正式版本 2 预览" })).toBeVisible();
    await page.waitForTimeout(350);
    await expect(history.getByRole("region", { name: "正式版本 2 预览" })).toBeVisible();
    await expect(history.getByRole("region", { name: "正式版本 1 预览" })).toHaveCount(0);
  });

  test("ADMIN 可装修和发布页面，但不能进入或写入模板设计工作区", async ({ page }) => {
    const admin = await openWorkspaceShell(page, {
      role: "ADMIN",
      personalTemplates: [personalTemplateFixture()],
    });
    await expect(page.getByRole("button", { name: "模板设计" })).toBeDisabled();
    await expect(page.getByRole("group", { name: "店铺装修工作模式切换" }))
      .toHaveAttribute("data-active-mode", "page");
    await expect(page.getByRole("button", { name: "页面装修" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "新建模板", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^打开.+模板$/ })).toHaveCount(0);
    expect(admin.writes).toEqual([]);
    expect(admin.dynamic.writes).toEqual([]);
    expect(admin.system.writes).toEqual([]);
    expect(admin.forbiddenPageWrites).toEqual([]);
  });

  test("超级管理员新建统一模板，编辑稳定节点树、保存草稿并独立发布新版本", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites, dynamic } = await openWorkspaceShell(page, {
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    const pageLayer = page.locator(".homepage-editor__page-workspace .homepage-editor__structure-workspace");
    await expect(pageLayer).toBeVisible();
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();

    await expect(page.getByRole("complementary", { name: "模板组件库" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "模板结构" })).toBeVisible();
    await expect(page.getByRole("region", { name: /模板设计画布/ })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "模板属性", exact: true })).toBeVisible();
    await expect(pageLayer).toBeHidden();
    const { trigger: addTrigger, panel: addPanel } = await openTemplateStructureAddPanel(page);
    await expect(addPanel).toContainText("添加到");
    await expect(addPanel).toContainText("新内容区域");
    await expect(addPanel).toContainText("添加内容时会自动创建内容区域 1");
    await addTrigger.click();
    await expect(addPanel).toBeHidden();
    await expect(page.getByText("Slot 必须", { exact: false })).toHaveCount(0);

    await page.getByRole("textbox", { name: "模板名称" }).fill("品牌首屏｜左文右图动态版");
    await openTemplateInspectorPanel(page, "布局");
    await expect(page.getByRole("button", { name: "默认背景：白色" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: /^布局方式：/ })).toHaveCount(0);
    await expect(page.getByText("背景令牌", { exact: true })).toHaveCount(0);
    await expect(page.getByText("边框令牌", { exact: true })).toHaveCount(0);
    await openTemplateInspectorPanel(page, "规则");
    await page.getByLabel("版本说明").fill("建立首屏容器、网格与标题槽位");
    const { controls: sizeControls } = await openTemplateSizeControls(page);
    const designWidth = sizeControls.getByRole("spinbutton", { name: "设计宽度" });
    await expect(designWidth).toHaveValue("1920");
    await designWidth.fill("1280");
    await designWidth.press("Enter");
    await expect(page.getByLabel(/画布尺寸 1280 × \d+/)).toBeVisible();
    const { panel: regionCreationPanel } = await openTemplateStructureAddPanel(page);
    await regionCreationPanel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    await expect(addTrigger).toHaveAccessibleName("添加模板结构到内容区域 1");
    await expect(regionCreationPanel).toContainText("添加到：");
    await openTemplateInspectorPanel(page, "基本");
    await page.getByRole("textbox", { name: "节点名称" }).fill("首屏内容容器");
    await expect(addTrigger).toHaveAccessibleName("添加模板结构到首屏内容容器");
    const templateStructure = page.getByRole("complementary", { name: "模板结构" });
    await templateStructure.getByRole("treeitem", { name: /品牌首屏｜左文右图动态版 模板/ }).click();
    const { panel: rootAddPanel } = await openTemplateStructureAddPanel(page);
    await rootAddPanel.getByRole("button", { name: "图片槽位 内容槽位" }).click();
    await expect(page.getByText("已自动建立“内容区域 02”，并将槽位放入该区域。", { exact: true }))
      .toBeVisible();
    await expect(templateStructure.getByRole("treeitem", { name: /内容区域 2/ })).toBeVisible();
    await addTrigger.click();
    await templateStructure.getByRole("treeitem", { name: /首屏内容容器/ }).click();
    const { panel: regionAddPanel } = await openTemplateStructureAddPanel(page);
    await regionAddPanel.getByText("布局", { exact: true }).click();
    await expect(regionAddPanel.getByText("排列方式", { exact: true })).toBeVisible();
    await regionAddPanel.getByRole("button", { name: "网格 结构节点" }).click();
    await regionAddPanel.getByRole("button", { name: "标题槽位 内容槽位" }).click();
    await openTemplateInspectorPanel(page, "基本");
    await page.getByRole("textbox", { name: "节点名称" }).fill("首屏主标题");
    await openTemplateInspectorPanel(page, "布局");
    await page.getByRole("button", { name: "文字层级：展示" }).click();
    await page.getByLabel("最大行数").fill("2");
    await openTemplateInspectorPanel(page, "基本");
    await expect(page.getByText(/实际内容.*页面装修中配置/)).toBeVisible();

    const dynamicCanvas = page.frameLocator(".template-editor__viewport-frame");
    const headingOnCanvas = dynamicCanvas.locator('.template-editor__dynamic-canvas-renderer [data-template-node-type="HeadingSlot"]');
    await expect(dynamicCanvas.locator(".hc-dynamic-template")).toHaveAttribute(
      "data-dynamic-template-editor-surface",
      "template-definition",
    );
    await expect(page.locator('[data-template-editor-overlay-root="template-definition"]'))
      .toHaveCount(1);
    await expect(headingOnCanvas).toContainText("典藏新作");
    const inlineHeading = headingOnCanvas.locator('[data-template-inline-editor="true"]');
    await expect(inlineHeading).toHaveCount(0);
    const headingNodeId = await headingOnCanvas.getAttribute("data-template-node-id");
    expect(headingNodeId).toMatch(/^node_/);

    const headingTreeItem = page.getByRole("treeitem", { name: /首屏主标题/ });
    await expect(headingTreeItem).toBeVisible();
    await expect(page.getByRole("treeitem", { name: /首屏内容容器/ })).toBeVisible();
    await expect(page.getByRole("treeitem", { name: /网格/ })).toBeVisible();

    await expect(page.locator(".template-editor__canvas-edit-bar")).toHaveCount(0);
    await page.getByRole("button", { name: "预览模板" }).click();
    await expect(page.getByLabel("模板画布编辑状态")).toContainText("只读预览");
    const previewInspector = page.getByLabel("模板预览说明");
    await expect(previewInspector).toContainText("预览期间不可编辑");
    await expect(previewInspector.getByRole("textbox")).toHaveCount(0);
    await page.getByRole("combobox", { name: "预览内容场景" }).selectOption("long-text");
    await expect(headingOnCanvas).toContainText("这是用于验证超长标题");
    await expect(headingOnCanvas).toHaveCSS("outline-style", "none");
    await page.getByRole("button", { name: "退出模板预览" }).click();
    await expect(headingOnCanvas).toContainText("典藏新作");

    await page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端模板布局/ }).click();
    await expect(page.locator(".template-editor__canvas-edit-bar")).toHaveCount(0);
    await expect(page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端模板布局/ }))
      .toHaveAttribute("aria-pressed", "true");
    await headingTreeItem.click();
    await expect(page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端模板布局/ }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("complementary", { name: "模板属性", exact: true }))
      .toContainText("移动端");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    expect(dynamic.writes[0]).toMatchObject({ method: "POST", pathname: "/api/page-modules/dynamic-templates" });
    expect(dynamic.writes[0].body.versionNote).toBe("建立首屏容器、网格与标题槽位");
    expect(dynamic.writes[0].body.definition.metadata.previewDesktopWidth).toBe(1280);
    expect(dynamic.writes[0].body.definition.nodes[headingNodeId!]?.type).toBe("HeadingSlot");
    const storedNodes = dynamic.writes[0].body.definition.nodes as Record<string, { type: string; name: string; childIds: string[]; slotId?: string }>;
    const containerEntry = Object.entries(storedNodes).find(([, node]) => node.name === "首屏内容容器");
    const gridEntry = Object.entries(storedNodes).find(([, node]) => node.type === "Grid");
    expect(containerEntry?.[1].childIds).toContain(gridEntry?.[0]);
    expect(gridEntry?.[1].childIds).toContain(headingNodeId);
    const headingSlotId = storedNodes[headingNodeId!]?.slotId;
    expect(headingSlotId).toBeTruthy();
    expect(dynamic.writes[0].body.definition.previewContent).toEqual({});
    expect(dynamic.writes[0].body.definition.defaultContent).toEqual({});
    expect(dynamic.writes[0].body.definition.slots[headingSlotId!].desktopRules).toMatchObject({
      fontRole: "display",
      maxLines: 2,
    });
    expect(forbiddenPageWrites).toEqual([]);

    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();
    const publishWrite = dynamic.writes.find((write) => /\/publish$/.test(write.pathname));
    expect(publishWrite).toMatchObject({
      method: "POST",
      pathname: expect.stringMatching(/\/publish$/),
      body: {
      expectedRevision: 1,
      versionNote: "建立首屏容器、网格与标题槽位",
      },
    });
    expect(dynamic.versionsByTemplateId.get(dynamic.records[0].templateId)).toHaveLength(1);

    await page.getByRole("treeitem", { name: /品牌首屏｜左文右图动态版 模板/ }).click();
    await openTemplateInspectorPanel(page, "规则");
    await page.getByLabel("版本说明").fill("发布后的下一版草稿");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const postPublishSave = dynamic.writes.find((write) => write.method === "PATCH");
    expect(postPublishSave?.body.expectedRevision).toBe(2);
    expect(forbiddenPageWrites).toEqual([]);

    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(pageLayer).toBeVisible();
    await openTemplateFromCatalog(page, "品牌首屏｜左文右图动态版");
    await expect(page.frameLocator(".template-editor__viewport-frame").locator(`.template-editor__dynamic-canvas-renderer [data-template-node-id="${headingNodeId}"]`)).toContainText("典藏新作");
    await expect(page.getByRole("treeitem", { name: /首屏主标题/ })).toBeVisible();
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("新建模板与添加槽位保持同一紧凑高度", async ({ page }) => {
    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      viewport: { width: 1920, height: 960 },
    });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();

    const library = page.getByRole("complementary", { name: "模板组件库", exact: true });
    const createTemplateButton = library.getByRole("button", { name: "新建模板", exact: true });
    await createTemplateButton.click();

    const structure = page.getByRole("complementary", { name: "模板结构", exact: true });
    const addSlotButton = structure.getByRole("button", { name: "添加槽位", exact: true });
    await expect(addSlotButton).toBeVisible();

    const [createButtonBox, addSlotBox, libraryFooterBox, slotFooterBox] = await Promise.all([
      createTemplateButton.boundingBox(),
      addSlotButton.boundingBox(),
      library.locator(".template-editor__library-footer").boundingBox(),
      structure.locator(".template-editor__dynamic-node-palette").boundingBox(),
    ]);
    expect(createButtonBox).not.toBeNull();
    expect(addSlotBox).not.toBeNull();
    expect(libraryFooterBox).not.toBeNull();
    expect(slotFooterBox).not.toBeNull();
    expect(Math.abs(createButtonBox!.height - addSlotBox!.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(libraryFooterBox!.height - slotFooterBox!.height)).toBeLessThanOrEqual(1);
  });

  test("模板目录不显示分类筛选区", async ({ page }) => {
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      viewport: { width: 1920, height: 960 },
    });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();

    const library = page.getByRole("complementary", { name: "模板组件库", exact: true });
    await expect(library.getByRole("group", { name: "模板分类筛选" })).toHaveCount(0);
    await expect(library.getByRole("button", { name: /^打开证书展示模板/ })).toBeVisible();
    expect(forbiddenPageWrites).toEqual([]);
  });

  test.describe("简单模板 Edge 验收", () => {
    test("尺寸和多槽位可直接设计保存并用于页面", async ({ page }, testInfo) => {
      testInfo.setTimeout(90_000);
      const { dynamic, pageWrites, forbiddenPageWrites } = await openWorkspaceShell(page, {
        role: "SUPER_ADMIN", draft: makeEmptyDraft(), allowPageWrites: true,
        viewport: { width: 1920, height: 960 },
      });
      await page.getByRole("button", { name: "模板设计", exact: true }).click();
      const library = page.getByRole("complementary", { name: "模板组件库", exact: true });
      await expect(library.locator('[aria-label="模板列表"] button[aria-expanded]')).toHaveCount(0);
      await expect(library.locator('.homepage-editor__template-group-grid[hidden]')).toHaveCount(0);
      await expect(library.getByRole("button", { name: /打开视频模板/ })).toBeVisible();
      await page.getByRole("button", { name: "新建模板", exact: true }).click();
      const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
      await inspector.getByRole("textbox", { name: "模板名称", exact: true }).fill("简单图文模板");
      await inspector.getByRole("textbox", { name: "模板名称", exact: true }).press("Tab");
      const { controls: sizeControls } = await openTemplateSizeControls(page);
      const width = sizeControls.getByRole("spinbutton", { name: "设计宽度", exact: true });
      await expect(width).toHaveValue("1920");
      await sizeControls.getByRole("combobox", { name: "模板高度模式" }).selectOption("fixed");
      const height = sizeControls.getByRole("spinbutton", { name: "模板固定高度", exact: true });
      await height.fill("900"); await height.press("Enter");
      await expect(sizeControls.getByRole("combobox", { name: "模板高度模式" })).toHaveValue("fixed");
      const add = async (name: string) => {
        await page.getByRole("button", { name: "添加槽位", exact: true }).click();
        const palette = page.getByRole("dialog", { name: "添加槽位", exact: true });
        await expect(palette.getByRole("button")).toHaveCount(5);
        await palette.getByRole("button", { name: `添加${name}`, exact: true }).click();
        await expect(palette).not.toBeVisible();
      };
      await add("图片槽位");
      await inspector.getByRole("combobox", { name: "槽位高度方式" }).selectOption("fixed");
      await inspector.getByRole("spinbutton", { name: "槽位高度", exact: true }).fill("240");
      await inspector.getByRole("spinbutton", { name: "槽位高度", exact: true }).press("Enter");
      await inspector.getByRole("button", { name: "完整显示", exact: true }).click();
      await expect(inspector.getByRole("combobox", { name: "图片槽位比例" })).toHaveValue("fixed-height");
      await inspector.getByRole("combobox", { name: "图片槽位比例" }).selectOption("1:1");
      await expect(inspector.getByRole("combobox", { name: "槽位高度方式" })).toHaveValue("auto");
      await expect(page.frameLocator("iframe.template-editor__viewport-frame").locator('[data-template-node-type="ImageSlot"]')).toHaveCSS("aspect-ratio", "1 / 1");
      await inspector.getByRole("combobox", { name: "槽位高度方式" }).selectOption("fixed");
      await add("标题槽位");
      await inspector.getByRole("spinbutton", { name: "槽位字号" }).fill("36");
      await inspector.getByRole("spinbutton", { name: "槽位字号" }).press("Enter");
      await add("正文槽位");
      await add("正文槽位");
      await expect(inspector.getByRole("textbox", { name: "槽位名称" })).toHaveValue("正文槽位 2");
      await add("按钮槽位");
      const before = await readZ4Session(page);
      const definition = before.definition!;
      expect(Object.keys(definition.slots)).toHaveLength(5);
      expect(definition.nodes[definition.rootNodeId].childIds).toHaveLength(1);
      const regionId = definition.nodes[definition.rootNodeId].childIds[0];
      const structure = page.getByRole("complementary", { name: "模板结构", exact: true });
      const regionButton = structure.getByRole("treeitem", { name: "内容区域 1", exact: true });
      await expect(regionButton).toBeVisible();
      expect((await regionButton.boundingBox())!.width).toBeGreaterThan(100);
      await expect(structure.getByRole("tree", { name: "模板区域与槽位" })
        .locator("button[aria-expanded]"))
        .toHaveCount(0);
      await expect(inspector.locator("details, summary")).toHaveCount(0);
      await regionButton.click();
      await inspector.getByRole("button", { name: "容器布局：上下排列", exact: true }).click();
      await inspector.getByRole("spinbutton", { name: "槽位间距", exact: true }).fill("24");
      await inspector.getByRole("spinbutton", { name: "槽位间距", exact: true }).press("Enter");
      await inspector.getByRole("button", { name: "容器留白：标准", exact: true }).click();
      const canvas = page.frameLocator("iframe.template-editor__viewport-frame");
      await expect(canvas.locator(`[data-template-node-id="${regionId}"]`)).toHaveCSS("gap", "24px");
      await expect(canvas.locator('[data-template-node-type="Section"]')).toHaveCSS("height", "900px");
      await page.screenshot({ path: testInfo.outputPath("simple-template-desktop.png"), fullPage: true });
      await page.getByRole("button", { name: "保存模板", exact: true }).click();
      await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
      const saved = dynamic.writes[0].body.definition as Record<string, any>;
      expect(saved.metadata.previewDesktopWidth).toBe(1920);
      expect(saved.nodes[saved.rootNodeId].responsive.desktop.height).toEqual({ mode: "fixed", value: { value: 900, unit: "px" } });
      expect(saved.defaultContent).toEqual({}); expect(saved.previewContent).toEqual({});
      const slots = Object.fromEntries(Object.values(saved.slots as Record<string, any>).map((slot: any) => [slot.key, slot]));
      expect(Object.keys(slots)).toEqual(expect.arrayContaining(["image", "heading", "description", "description2", "button"]));
      expect(slots.heading.desktopRules.fontSize).toEqual({ value: 36, unit: "px" });
      expect(slots.image.desktopRules.objectFit).toBe("contain");
      // 独立浏览器和自有 API 夹具内回读，不触碰用户浏览器草稿。
      await page.reload();
      await page.getByRole("button", { name: "模板设计", exact: true }).click();
      await page.getByRole("textbox", { name: "搜索模板", exact: true }).fill("简单图文模板");
      await page.getByRole("button", { name: /打开简单图文模板|正在编辑简单图文模板/ }).click();
      const { controls: restoredSizeControls } = await openTemplateSizeControls(page);
      await expect(restoredSizeControls.getByRole("spinbutton", { name: "设计宽度" })).toHaveValue("1920");
      await expect(restoredSizeControls.getByRole("spinbutton", { name: "模板固定高度" })).toHaveValue("900");
      expect((await readZ4Session(page)).definition).toEqual(saved);
      await page.getByRole("button", { name: "发布模板新版本", exact: true }).click();
      await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();
      const templateId = dynamic.records[0].templateId as string;
      expect(dynamic.versionsByTemplateId.get(templateId)).toHaveLength(1);
      await page.getByRole("button", { name: "页面装修", exact: true }).click();
      await page.getByRole("button", { name: "添加简单图文模板版本1", exact: true }).click();
      const instanceInspector = page.getByRole("region", { name: "模板实例属性" });
      await instanceInspector.getByRole("textbox", { name: "标题槽位", exact: true }).fill("周年典藏系列");
      await instanceInspector.getByRole("textbox", { name: "正文槽位", exact: true }).fill("第一段正文");
      await instanceInspector.getByRole("textbox", { name: "正文槽位 2", exact: true }).fill("第二段正文");
      await instanceInspector.getByRole("textbox", { name: "按钮槽位文案", exact: true }).fill("查看系列");
      const imageField = instanceInspector.locator(`[data-slot-id="${slots.image.slotId}"]`);
      await imageField.getByRole("button", { name: /粘贴图片链接/ }).click();
      const imageUrl = imageField.getByPlaceholder("输入图片 URL；清空后确认 = 删除图片");
      await imageUrl.fill("/svg/template-hero.svg"); await imageUrl.press("Enter");
      await page.getByRole("button", { name: "保存当前装修草稿", exact: true }).click();
      await expect(page.getByText("页面草稿已保存", { exact: true }).last()).toBeVisible();
      const documentWrite = pageWrites.filter((write) => write.method === "PUT" && write.pathname === "/api/page-modules/document").at(-1)!;
      const instance = documentWrite.body.puckData.content[0];
      expect(instance.type).toBe("动态模板实例");
      expect(instance.props).toMatchObject({ templateId, templateVersion: 1, layoutOverridesByNodeId: {} });
      expect(instance.props.nodes).toBeUndefined(); expect(instance.props.slots).toBeUndefined();
      expect(instance.props.contentBySlotId).toMatchObject({
        [slots.heading.slotId]: "周年典藏系列", [slots.description.slotId]: "第一段正文", [slots.description2.slotId]: "第二段正文",
      });
      const pageCanvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
      await expect(pageCanvas.getByText("周年典藏系列", { exact: true })).toBeVisible();
      await expect(pageCanvas.getByText("第二段正文", { exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("simple-template-page-instance.png"), fullPage: true });
      expect(forbiddenPageWrites).toEqual([]);
    });
    test("双端槽位尺寸独立且锁定删除撤销可用", async ({ page }, testInfo) => {
      const { forbiddenPageWrites } = await openWorkspaceShell(page, { viewport: { width: 1600, height: 1000 } });
      await page.getByRole("button", { name: "模板设计", exact: true }).click();
      await page.getByRole("button", { name: "新建模板", exact: true }).click();
      await page.getByRole("button", { name: "添加槽位", exact: true }).click();
      await page.getByRole("button", { name: "添加标题槽位", exact: true }).click();
      const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
      const title = inspector.getByRole("textbox", { name: "槽位名称", exact: true });
      await title.fill("主标题"); await title.press("Tab");
      await inspector.getByRole("combobox", { name: "槽位宽度方式" }).selectOption("%");
      const slotWidth = inspector.getByRole("spinbutton", { name: "槽位宽度", exact: true });
      await slotWidth.fill("60"); await slotWidth.press("Enter");
      const desktop = await readZ4Session(page);
      const nodeId = desktop.selected;
      const slotId = desktop.definition.nodes[nodeId].slotId;
      expect(desktop.definition.slots[slotId].label).toBe("主标题");
      await page.getByRole("button", { name: /^移动端模板布局/ }).click();
      const canvasWidth = page.getByRole("spinbutton", { name: "模板设计宽度", exact: true });
      await canvasWidth.fill("375"); await canvasWidth.press("Enter");
      const canvasHeight = page.getByRole("spinbutton", { name: "模板固定高度", exact: true });
      await canvasHeight.fill("640"); await canvasHeight.press("Enter");
      await inspector.getByRole("combobox", { name: "槽位宽度方式" }).selectOption("%");
      await slotWidth.fill("90"); await slotWidth.press("Enter");
      await inspector.getByRole("spinbutton", { name: "槽位字号" }).fill("22");
      await inspector.getByRole("spinbutton", { name: "槽位字号" }).press("Enter");
      const mobile = await readZ4Session(page);
      expect(mobile.definition.nodes[nodeId].responsive.desktop).toEqual(desktop.definition.nodes[nodeId].responsive.desktop);
      expect(mobile.definition.nodes[nodeId].responsive.mobile.width).toEqual({ value: 90, unit: "%" });
      const canvas = page.frameLocator("iframe.template-editor__viewport-frame");
      await expect(canvas.locator(`[data-template-node-id="${nodeId}"]`).getByRole("heading")).toHaveCSS("font-size", "22px");
      await page.screenshot({ path: testInfo.outputPath("simple-template-mobile.png"), fullPage: true });
      await page.getByRole("checkbox", { name: "高度随内容变化" }).check();
      const auto = await readZ4Session(page);
      expect(auto.definition.nodes[auto.definition.rootNodeId].responsive.mobile.height.mode).toBe("auto");
      expect(auto.definition.metadata.mobileRatio).toBe("auto");
      await page.getByRole("button", { name: /^桌面端模板布局/ }).click();
      await expect(canvasWidth).toHaveValue("1920"); await expect(slotWidth).toHaveValue("60");
      const menu = page.getByRole("button", { name: "主标题节点操作", exact: true });
      await menu.click(); await page.getByRole("menuitem", { name: "锁定槽位", exact: true }).click();
      await expect(slotWidth).toBeDisabled();
      await page.getByRole("button", { name: "添加槽位", exact: true }).click();
      await expect(page.getByRole("button", { name: "添加图片槽位", exact: true })).toBeDisabled();
      await page.keyboard.press("Escape");
      await menu.click(); await page.getByRole("menuitem", { name: "解除锁定", exact: true }).click();
      await expect(slotWidth).toBeEnabled();
      await menu.click(); await page.getByRole("menuitem", { name: "删除槽位", exact: true }).click();
      const confirm = page.getByRole("dialog");
      if (await confirm.isVisible()) await confirm.getByRole("button", { name: /确认删除|删除/ }).click();
      await expect.poll(async () => Object.keys((await readZ4Session(page)).definition.slots).length).toBe(0);
      await page.getByRole("button", { name: "撤销", exact: true }).click();
      const restored = await readZ4Session(page);
      expect(restored.definition.nodes[nodeId].responsive).toEqual(auto.definition.nodes[nodeId].responsive);
      expect(restored.definition.slots[slotId].label).toBe("主标题");
      await page.evaluate(async ({ nodeId, slotId }) => {
        const path = "/src/page-builder/template-editor/templateEditorSession.ts";
        const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ path);
        store.getState().executeCommand({ type: "update-definition", label: "载入旧字号测试夹具", update: (next: any) => { next.slots[slotId].desktopRules.fontSize = { value: 1.5, unit: "rem" }; } });
        store.getState().selectObject(nodeId);
      }, { nodeId, slotId });
      const fontSize = inspector.getByRole("spinbutton", { name: "槽位字号" });
      await expect(fontSize).toHaveValue("1.5"); await fontSize.fill("2.5"); await fontSize.press("Enter");
      expect((await readZ4Session(page)).definition.slots[slotId].desktopRules.fontSize).toEqual({ value: 2.5, unit: "rem" });
      await page.evaluate(async () => {
        const path = "/src/page-builder/template-editor/templateEditorSession.ts";
        const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ path);
        store.getState().executeCommand({ type: "update-definition", label: "载入根锁定测试夹具", update: (next: any) => { next.nodes[next.rootNodeId].authoring = { structureLocked: true }; } });
      });
      await expect(canvasWidth).toBeDisabled(); await expect(canvasHeight).toBeDisabled();
      expect(forbiddenPageWrites).toEqual([]);
    });
  });

  test("V2 母模板复用布局控件，但不暴露页面真实媒体编辑", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await expect(inspector.getByRole("region", { name: "模板属性功能区" })).toBeVisible();
    await expect(inspector.getByRole("tab")).toHaveCount(3);
    await expect(inspector.getByRole("tabpanel", { name: "模板信息" })).toBeVisible();
    await expect(inspector.getByRole("tabpanel", { name: "模板尺寸" })).toBeHidden();
    await expect(inspector.getByRole("tabpanel", { name: "发布设置" })).toBeHidden();
    await expect(inspector.locator(".template-editor__inspector-context")).toHaveCount(0);
    await expect(inspector.locator("details, summary")).toHaveCount(0);
    await expect(inspector.getByText("模板基本信息", { exact: true })).toBeVisible();
    await expect(inspector.getByText("templateId", { exact: true })).toHaveCount(0);
    await openTemplateInspectorPanel(page, "布局");
    await expect(inspector.getByText("画布尺寸与响应式", { exact: true })).toBeVisible();
    await expect(inspector.getByText("跟随顶部选择，预览与公开展示保持一致", { exact: true })).toBeVisible();
    await expect(inspector.getByText(/Runtime|Canvas/)).toHaveCount(0);
    await openTemplateInspectorPanel(page, "规则");
    await expect(inspector.locator(".template-editor__publish-settings-section")).toBeVisible();
    await expect(inspector.getByText("发布检查", { exact: true })).toBeVisible();
    const recommendedPages = inspector.getByRole("combobox", { name: "推荐页面" });
    await recommendedPages.click();
    await recommendedPages.fill("关于海川");
    await recommendedPages.press("Enter");
    await page.keyboard.press("Escape");
    await expect(recommendedPages.locator("xpath=../../..")).toContainText("关于海川");
    const sizeTrigger = page.getByRole("button", { name: /^模板尺寸：/ });
    await expect(sizeTrigger).toContainText("1920 × 随内容");
    await expect(sizeTrigger).toHaveAttribute("aria-expanded", "false");
    const { controls: sizeControls } = await openTemplateSizeControls(page);
    await expect(sizeControls.getByRole("spinbutton", { name: "设计宽度" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sizeTrigger).toBeFocused();
    await expect(sizeControls).toBeHidden();
    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    await addPanel.getByRole("button", { name: "图片槽位 内容槽位" }).click();

    const structure = page.getByRole("complementary", { name: "模板结构" });
    const slotOperations = structure.getByRole("button", { name: "图片槽位节点操作" });
    await slotOperations.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: "重命名槽位" }).click();
    const structureName = structure.getByRole("textbox", { name: "结构名称" });
    await structureName.fill("新".repeat(110));
    await expect(structureName).toHaveValue("新".repeat(100));
    await structureName.fill("主视觉图片槽位");
    await structureName.press("Enter");
    await expect(structure.getByRole("treeitem", { name: /主视觉图片槽位/ })).toBeVisible();

    await openTemplateInspectorPanel(page, "基本");
    await expect(inspector.getByRole("tab")).toHaveCount(3);
    await expect(inspector.getByRole("tabpanel", { name: "槽位职责" })).toBeVisible();
    await expect(inspector.getByRole("tabpanel", { name: "显示样式" })).toBeHidden();
    await expect(inspector.getByRole("tabpanel", { name: "页面可编辑" })).toBeHidden();
    await expect(inspector.locator("[data-media-field]")).toHaveCount(0);
    await expect(inspector.getByText(/nodeId|slotId|slot key|内部对象标识/)).toHaveCount(0);
    await expect(inspector.getByRole("textbox", { name: "槽位名称" })).toBeVisible();
    await expect(inspector.getByText(/实际内容.*页面装修中配置/)).toBeVisible();
    await expect(inspector.getByText("系统预设 · 不可修改", { exact: true })).toHaveCount(0);
    await expect(inspector.getByText(/nodeId|slotId|slot key|内部对象标识/)).toHaveCount(0);
    await openTemplateInspectorPanel(page, "规则");
    await expect(inspector.getByRole("switch", { name: "锁定位置、尺寸和层级" })).toBeVisible();
    await expect(inspector.getByRole("switch", { name: "页面可编辑内容" })).toBeVisible();
    await expect(inspector.getByRole("spinbutton", { name: "建议图片宽" })).toBeVisible();
    await expect(inspector.getByRole("spinbutton", { name: "最大字数" })).toHaveCount(0);
    await expect(inspector.getByRole("textbox", { name: "内容字段标识" })).toHaveCount(0);
    await expect(inspector.getByText("空内容处理", { exact: true })).toBeVisible();
    await expect(inspector.locator('[data-workspace-field-control="switch"]').first())
      .toHaveAttribute("data-workspace-field-shared", "true");
    await expect(inspector.locator('[data-image-focus-field]'))
      .toHaveAttribute("data-workspace-field-control", "image-focus");
    const imageSlot = page.frameLocator(".template-editor__viewport-frame")
      .locator('[data-template-node-type="ImageSlot"]');
    await openTemplateInspectorPanel(page, "布局");
    await expect(inspector.getByRole("button", { name: "图片比例：16:9" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(imageSlot).toHaveCSS("aspect-ratio", "16 / 9");
    const viewportFrame = page.locator(".template-editor__viewport-frame");
    const wideImageBox = await imageSlot.boundingBox();
    const wideFrameHeight = await viewportFrame.evaluate((frame) => frame.getBoundingClientRect().height);
    await inspector.getByRole("button", { name: "图片比例：1:1" }).click();
    await expect(imageSlot).toHaveCSS("aspect-ratio", "1 / 1");
    const squareImageBox = await imageSlot.boundingBox();
    const squareFrameHeight = await viewportFrame.evaluate((frame) => frame.getBoundingClientRect().height);
    expect(wideImageBox).not.toBeNull();
    expect(squareImageBox).not.toBeNull();
    expect(squareImageBox!.height).toBeGreaterThan(wideImageBox!.height);
    expect(squareFrameHeight).toBeGreaterThan(wideFrameHeight);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(imageSlot).toHaveCSS("aspect-ratio", "16 / 9");
    await expect.poll(() => viewportFrame.evaluate((frame) => frame.getBoundingClientRect().height))
      .toBeLessThan(squareFrameHeight);
    await inspector.getByRole("group", { name: "画面焦点 · 桌面端常用位置" })
      .getByRole("button", { name: "左上", exact: true })
      .click();
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const definition = dynamic.writes.at(-1)?.body.definition;
    const imageNode = Object.values(definition.nodes as Record<string, { type: string; slotId?: string }>)
      .find((node) => node.type === "ImageSlot");
    expect(imageNode?.slotId).toBeTruthy();
    expect(definition.slots[imageNode!.slotId!].desktopRules.objectPosition).toBe("left top");
    expect(definition.defaultContent).toEqual({});
    expect(definition.previewContent).toEqual({});
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("模板工作区只生成占位预览，真实内容层始终保持为空", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    await addPanel.getByRole("button", { name: "描述槽位 内容槽位" }).click();
    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await openTemplateInspectorPanel(page, "规则");
    await expect(inspector.getByRole("spinbutton", { name: "最大字数" })).toBeVisible();
    await expect(inspector.getByRole("spinbutton", { name: "建议图片宽" })).toHaveCount(0);
    await expect(inspector.getByRole("textbox", { name: "内容字段标识" })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "预览示例" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /设为新实例默认|将全部样例设为默认/ })).toHaveCount(0);
    await openTemplateInspectorPanel(page, "基本");
    await expect(page.getByText(/实际内容.*页面装修中配置/)).toBeVisible();
    const canvas = page.frameLocator(".template-editor__viewport-frame");
    const textSlot = canvas.locator('[data-template-node-type="TextSlot"]');
    await expect(textSlot).not.toHaveAttribute("data-template-node-label", "描述槽位");
    await expect(textSlot)
      .toContainText("以克制线条呈现珠宝的光泽、比例与细节。");
    await expect(page.getByRole("button", { name: "选择模板目标 描述槽位" })).toBeVisible();
    await expect(canvas.locator('[data-template-inline-editor="true"]')).toHaveCount(0);
    const objectToolbar = page.locator("details.template-editor__editable-overlay-actions");
    await expect(objectToolbar).toBeVisible();
    await objectToolbar.getByText("对象操作", { exact: true }).click();
    await expect(objectToolbar.getByRole("button", { name: "复制节点" })).toBeVisible();
    await expect(objectToolbar.getByRole("button", { name: "隐藏节点" })).toBeVisible();
    await expect(objectToolbar.getByRole("button", { name: "删除节点" })).toBeVisible();
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const firstDefinition = dynamic.writes.at(-1)?.body.definition;
    const textSlotId = Object.values(firstDefinition.nodes as Record<string, { type: string; slotId?: string }>)
      .find((node) => node.type === "TextSlot")?.slotId;
    expect(textSlotId).toBeTruthy();
    expect(firstDefinition.previewContent).toEqual({});
    expect(firstDefinition.defaultContent).toEqual({});
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("空白母模板可一次建立主图加双图构图并用一次撤销完整移除", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();

    const structure = page.getByRole("complementary", { name: "模板结构" });
    const health = structure.getByRole("region", { name: "模板结构问题" });
    const undo = page.getByRole("button", { name: "撤销", exact: true });
    const redo = page.getByRole("button", { name: "重做", exact: true });
    await expect(health).toContainText("2 项待处理");
    await expect(health.getByRole("button", { name: "定位" })).toHaveCount(2);
    await expect(undo).toBeDisabled();

    const frame = page.frameLocator(".template-editor__viewport-frame");
    const emptyState = frame.getByRole("status");
    await expect(emptyState).toContainText("从一个清晰构图开始");
    await expect(emptyState).toContainText("主图 + 双图");

    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByText("组合模块", { exact: true }).click();
    const compositionButton = addPanel.getByRole("button", { name: "建立主图加双图布局" });
    await expect(compositionButton).toContainText("建立完整模板骨架");
    await compositionButton.click();
    await expect(page.getByText("已建立“三图主次叙事”模板骨架并补全构图信息：桌面均为 4:3，手机主图 4:3、双图 1:1 并排。"))
      .toBeVisible();
    await expect(health).toHaveCount(0);
    await expect(structure.locator(".template-editor__template-summary")).toContainText("结构完整");
    await expect(emptyState).toHaveCount(0);
    await expect(structure.getByRole("treeitem", { name: /三图展示区域 01/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /主图 \+ 双图布局/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /主图 图片槽位 必填/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /双图区域/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /细节图 01 图片槽位 必填/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /细节图 02 图片槽位 必填/ })).toBeVisible();

    const grid = frame.locator('[data-template-node-type="Grid"]').first();
    const mainImage = grid.locator(':scope > [data-template-node-type="ImageSlot"]').first();
    const detailColumn = grid.locator(':scope > [data-template-node-type="Column"]').first();
    const detailOne = detailColumn.locator('[data-template-node-type="ImageSlot"]').nth(0);
    const detailTwo = detailColumn.locator('[data-template-node-type="ImageSlot"]').nth(1);
    await expect(grid).toHaveCSS("display", "grid");
    const desktopMainBox = await mainImage.boundingBox();
    const desktopDetailsBox = await detailColumn.boundingBox();
    const desktopDetailOneBox = await detailOne.boundingBox();
    const desktopDetailTwoBox = await detailTwo.boundingBox();
    expect(desktopMainBox).not.toBeNull();
    expect(desktopDetailsBox).not.toBeNull();
    expect(desktopDetailOneBox).not.toBeNull();
    expect(desktopDetailTwoBox).not.toBeNull();
    expect(desktopMainBox!.width / desktopDetailsBox!.width).toBeGreaterThan(1.9);
    expect(desktopMainBox!.x).toBeLessThan(desktopDetailsBox!.x);
    expect(desktopDetailOneBox!.y).toBeLessThan(desktopDetailTwoBox!.y);

    const slotInspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await structure.getByRole("treeitem", { name: /主图 图片槽位 必填/ }).click();
    await openTemplateInspectorPanel(page, "布局");
    await expect(slotInspector.getByRole("button", { name: "图片比例：4:3" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(slotInspector.getByRole("group", { name: "图片比例自定义数值" })).toHaveCount(0);
    const requiredLayoutHide = slotInspector.getByRole("button", {
      name: "布局方式：隐藏（必填槽位不能隐藏）",
    });
    await expect(requiredLayoutHide).toBeDisabled();
    await expect(requiredLayoutHide).toHaveAttribute("title", "必填槽位不能隐藏");
    await expect(slotInspector.getByText(
      "必填槽位必须在桌面端和移动端保持显示；如需隐藏，先在“页面可编辑”中取消必填。",
      { exact: true },
    )).toBeVisible();
    await openTemplateInspectorPanel(page, "规则");
    await expect(slotInspector.getByRole("switch", { name: "页面必须填写" })).toBeChecked();
    const pageEditableSwitch = slotInspector.getByRole("switch", { name: "页面可编辑内容" });
    await expect(pageEditableSwitch).toBeChecked();
    await expect(pageEditableSwitch).toBeDisabled();
    await expect(slotInspector.getByText(
      "必填槽位必须允许页面填写；取消必填后才可关闭。",
      { exact: true },
    )).toBeVisible();
    const pageHideSwitch = slotInspector.getByRole("switch", { name: "页面可隐藏" });
    await expect(pageHideSwitch).not.toBeChecked();
    await expect(pageHideSwitch).toBeDisabled();
    await expect(slotInspector.getByText(
      "必填槽位不能在页面装修中隐藏；取消必填后才可开启。",
      { exact: true },
    )).toBeVisible();
    await expect(slotInspector.getByText("页面发布前必须填写", { exact: true })).toBeVisible();
    await expect(slotInspector.getByRole("spinbutton", { name: "建议图片宽" })).toHaveValue("2400");
    await expect(slotInspector.getByRole("spinbutton", { name: "建议图片高" })).toHaveValue("1800");
    const requiredHideAction = structure.getByRole("button", { name: "主图隐藏（必填槽位不可用）" });
    await expect(requiredHideAction).toBeDisabled();
    await expect(requiredHideAction).toHaveAttribute("title", "必填槽位不能隐藏");
    await structure.getByRole("button", { name: "主图节点操作" }).click();
    await expect(page.getByRole("menuitem", { name: "隐藏（必填槽位不可用）" })).toBeDisabled();
    await expect(page.getByRole("menuitem", { name: "删除槽位（必填槽位不可用）" })).toBeDisabled();
    await page.keyboard.press("Escape");
    const mainCanvasToolbar = page.locator("details.template-editor__editable-overlay-actions");
    await mainCanvasToolbar.getByText("对象操作", { exact: true }).click();
    const canvasHideAction = mainCanvasToolbar.getByRole("button", { name: "隐藏节点（必填槽位不可用）" });
    const canvasDeleteAction = mainCanvasToolbar.getByRole("button", { name: "删除节点（必填槽位不可用）" });
    await expect(canvasHideAction).toBeDisabled();
    await expect(canvasHideAction).toHaveAttribute("title", "必填槽位不能隐藏");
    await expect(canvasDeleteAction).toBeDisabled();
    await expect(canvasDeleteAction).toHaveAttribute("title", "必填槽位不能删除");

    await openTemplateInspectorPanel(page, "布局");
    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    await expect(slotInspector.getByRole("button", { name: "图片比例：4:3" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(grid).toHaveCSS("display", "flex");
    await expect(grid).toHaveCSS("flex-direction", "column");
    await expect(detailColumn).toHaveCSS("display", "grid");
    const mobileMainBox = await mainImage.boundingBox();
    const mobileDetailOneBox = await detailOne.boundingBox();
    const mobileDetailTwoBox = await detailTwo.boundingBox();
    expect(mobileMainBox).not.toBeNull();
    expect(mobileDetailOneBox).not.toBeNull();
    expect(mobileDetailTwoBox).not.toBeNull();
    expect(mobileMainBox!.width / mobileDetailOneBox!.width).toBeGreaterThan(1.9);
    expect(mobileMainBox!.y).toBeLessThan(mobileDetailOneBox!.y);
    expect(Math.abs(mobileDetailOneBox!.y - mobileDetailTwoBox!.y)).toBeLessThanOrEqual(1);
    expect(mobileDetailOneBox!.x).toBeLessThan(mobileDetailTwoBox!.x);
    await structure.getByRole("treeitem", { name: /细节图 01 图片槽位 必填/ }).click();
    await expect(slotInspector.getByRole("button", { name: "图片比例：1:1" }))
      .toHaveAttribute("aria-pressed", "true");
    await openTemplateInspectorPanel(page, "规则");
    await expect(slotInspector.getByRole("spinbutton", { name: "建议图片宽" })).toHaveValue("1600");
    await expect(slotInspector.getByRole("spinbutton", { name: "建议图片高" })).toHaveValue("1600");

    await structure.getByRole("treeitem", { name: /三图主次叙事 模板/ }).click();
    const basicInfo = await openTemplateBasicInfo(page);
    await expect(basicInfo.getByRole("textbox", { name: "模板名称", exact: true }))
      .toHaveValue("三图主次叙事");
    await expect(basicInfo.getByRole("textbox", { name: "分类", exact: true }))
      .toHaveValue("品牌展示");
    await expect(basicInfo.getByRole("textbox", { name: "用途", exact: true }))
      .toHaveValue("主视觉与细节并置");
    await expect(basicInfo.getByRole("textbox", { name: "构图类型", exact: true }))
      .toHaveValue("一大两小响应式构图");
    await expect(basicInfo.getByRole("textbox", { name: "模板说明", exact: true }))
      .toHaveValue("桌面端以主次分栏呈现三张 4:3 图片；移动端主图 4:3，双图 1:1 并排。");
    await expect(basicInfo.getByRole("button", { name: "页面视觉职责：重点区" }))
      .toHaveAttribute("aria-pressed", "true");

    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(health).toContainText("2 项待处理");
    await expect(emptyState).toBeVisible();
    await expect(frame.locator('[data-template-node-label="主图 + 双图布局"]')).toHaveCount(0);
    await expect((await openTemplateBasicInfo(page)).getByRole("textbox", { name: "模板名称", exact: true }))
      .toHaveValue("未命名模板");
    await expect(undo).toBeDisabled();
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect(health).toHaveCount(0);
    await expect(structure.locator(".template-editor__template-summary")).toContainText("结构完整");
    await expect(grid).toBeVisible();
    await expect((await openTemplateBasicInfo(page)).getByRole("textbox", { name: "模板名称", exact: true }))
      .toHaveValue("三图主次叙事");

    await page.getByRole("button", { name: /桌面端模板布局/ }).click();
    await structure.getByRole("treeitem", { name: /主图 \+ 双图布局/ }).click();
    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    const leftWidePreset = inspector.getByRole("button", { name: "列宽比例：左侧更宽 2:1" });
    await openTemplateInspectorPanel(page, "布局");
    await expect(leftWidePreset).toHaveAttribute("aria-pressed", "true");
    const gridColumnsGroup = inspector.getByRole("group", { name: "常用列宽比例" });
    const widthStrategyGroup = inspector.getByRole("group", { name: "宽度策略" });
    await expect(gridColumnsGroup).toBeVisible();
    const gridColumnsBox = await gridColumnsGroup.boundingBox();
    const widthStrategyBox = await widthStrategyGroup.boundingBox();
    expect(gridColumnsBox).not.toBeNull();
    expect(widthStrategyBox).not.toBeNull();
    expect(gridColumnsBox!.y).toBeLessThan(widthStrategyBox!.y);
    const preciseDisclosure = inspector.getByRole("button", { name: /^精细排列与尺寸 · 已设置 1 项/ });
    const appearanceDisclosure = inspector.getByRole("button", { name: "外观与边界", exact: true });
    await expect(preciseDisclosure).toHaveAttribute("aria-expanded", "false");
    await expect(appearanceDisclosure).toHaveAttribute("aria-expanded", "false");
    await expect(inspector.getByRole("group", { name: "交叉方向对齐" })).toBeHidden();
    await preciseDisclosure.click();
    await expect(inspector.getByRole("button", { name: "交叉方向对齐：居中" }))
      .toHaveAttribute("aria-pressed", "true");
    await appearanceDisclosure.click();
    await expect(inspector.getByRole("button", { name: "背景样式：透明" }))
      .toHaveAttribute("aria-pressed", "true");
    await inspector.getByText("自定义列宽", { exact: true }).click();
    const customColumns = inspector.getByRole("textbox", { name: "自定义列宽比例" });
    await customColumns.fill("1，1");
    await customColumns.blur();
    await expect(inspector.getByRole("button", { name: "列宽比例：均分双列 1:1" }))
      .toHaveAttribute("aria-pressed", "true");
    const equalMainBox = await mainImage.boundingBox();
    const equalDetailsBox = await detailColumn.boundingBox();
    expect(equalMainBox).not.toBeNull();
    expect(equalDetailsBox).not.toBeNull();
    expect(Math.abs(equalMainBox!.width / equalDetailsBox!.width - 1)).toBeLessThan(0.05);
    await customColumns.fill("2，0");
    await customColumns.blur();
    await expect(inspector.getByRole("alert")).toHaveText("请输入 1–12 个正数，例如 2，1。");
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("主图加双图快捷构图保留已填写的模板资料", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();

    const basicInfo = await openTemplateBasicInfo(page);
    await basicInfo.getByRole("textbox", { name: "模板名称", exact: true }).fill("自定义三图模板");
    await basicInfo.getByRole("textbox", { name: "分类", exact: true }).fill("自定义分类");
    await basicInfo.getByRole("textbox", { name: "用途", exact: true }).fill("自定义用途");
    await basicInfo.getByRole("textbox", { name: "构图类型", exact: true }).fill("自定义构图");
    await basicInfo.getByRole("textbox", { name: "模板说明", exact: true }).fill("保留这段自定义说明");
    await basicInfo.getByRole("button", { name: "页面视觉职责：主舞台" }).click();

    const structure = page.getByRole("complementary", { name: "模板结构" });
    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByText("组合模块", { exact: true }).click();
    await addPanel.getByRole("button", { name: "建立主图加双图布局" }).click();
    await expect(page.getByText("已建立“自定义三图模板”模板骨架并补全构图信息：桌面均为 4:3，手机主图 4:3、双图 1:1 并排。"))
      .toBeVisible();
    await structure.getByRole("treeitem", { name: /自定义三图模板 模板/ }).click();
    const updatedBasicInfo = await openTemplateBasicInfo(page);
    await expect(updatedBasicInfo.getByRole("textbox", { name: "模板名称", exact: true }))
      .toHaveValue("自定义三图模板");
    await expect(updatedBasicInfo.getByRole("textbox", { name: "分类", exact: true }))
      .toHaveValue("自定义分类");
    await expect(updatedBasicInfo.getByRole("textbox", { name: "用途", exact: true }))
      .toHaveValue("自定义用途");
    await expect(updatedBasicInfo.getByRole("textbox", { name: "构图类型", exact: true }))
      .toHaveValue("自定义构图");
    await expect(updatedBasicInfo.getByRole("textbox", { name: "模板说明", exact: true }))
      .toHaveValue("保留这段自定义说明");
    await expect(updatedBasicInfo.getByRole("button", { name: "页面视觉职责：主舞台" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("隐藏的必填槽位可从结构问题中直接恢复", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    const structure = page.getByRole("complementary", { name: "模板结构" });
    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByText("组合模块", { exact: true }).click();
    await addPanel.getByRole("button", { name: "建立主图加双图布局" }).click();
    await structure.getByRole("treeitem", { name: /主图 图片槽位 必填/ }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    const requiredSwitch = inspector.getByRole("switch", { name: "页面必须填写" });
    await openTemplateInspectorPanel(page, "规则");
    await requiredSwitch.click();
    await structure.getByRole("button", { name: "主图隐藏" }).click();
    await requiredSwitch.click();

    const health = structure.getByRole("region", { name: "模板结构问题" });
    await expect(health).toContainText("1 项待处理");
    const issue = health.getByRole("listitem").filter({ hasText: "必填槽位“主图”已隐藏" });
    await expect(issue.getByRole("button", { name: "修复" })).toBeVisible();
    await issue.getByRole("button", { name: "修复" }).click();

    await expect(health).toHaveCount(0);
    await expect(structure.locator(".template-editor__template-summary")).toContainText("结构完整");
    await expect(structure.getByRole("treeitem", { name: /主图 图片槽位 必填/ }))
      .not.toHaveAccessibleName(/已隐藏/);
    await expect(page.getByText("必填槽位已恢复显示。", { exact: true })).toBeVisible();
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("按设备隐藏的必填槽位可从结构问题中恢复到对应设备", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    const structure = page.getByRole("complementary", { name: "模板结构" });
    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByText("组合模块", { exact: true }).click();
    await addPanel.getByRole("button", { name: "建立主图加双图布局" }).click();
    await structure.getByRole("treeitem", { name: /主图 图片槽位 必填/ }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    const requiredSwitch = inspector.getByRole("switch", { name: "页面必须填写" });
    await openTemplateInspectorPanel(page, "规则");
    await requiredSwitch.click();
    const pageEditableSwitch = inspector.getByRole("switch", { name: "页面可编辑内容" });
    await expect(pageEditableSwitch).toBeEnabled();
    await pageEditableSwitch.click();
    await expect(pageEditableSwitch).not.toBeChecked();
    const pageHideSwitch = inspector.getByRole("switch", { name: "页面可隐藏" });
    await expect(pageHideSwitch).toBeEnabled();
    await pageHideSwitch.click();
    await expect(pageHideSwitch).toBeChecked();
    await openTemplateInspectorPanel(page, "布局");
    await inspector.getByRole("button", { name: "布局方式：隐藏" }).click();
    await openTemplateInspectorPanel(page, "规则");
    await requiredSwitch.click();
    await expect(pageEditableSwitch).toBeChecked();
    await expect(pageEditableSwitch).toBeDisabled();
    await expect(pageHideSwitch).not.toBeChecked();
    await expect(pageHideSwitch).toBeDisabled();

    const health = structure.getByRole("region", { name: "模板结构问题" });
    await expect(health).toContainText("1 项待处理");
    const issue = health.getByRole("listitem").filter({
      hasText: "必填槽位“主图”在对应画布布局中已隐藏",
    });
    await issue.getByRole("button", { name: "修复" }).click();

    await expect(health).toHaveCount(0);
    await expect(structure.locator(".template-editor__template-summary")).toContainText("结构完整");
    await openTemplateInspectorPanel(page, "布局");
    await expect(inspector.getByRole("button", { name: "布局方式：自然" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("必填槽位已恢复显示。", { exact: true })).toBeVisible();
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("成熟母模板的画布槽位可直接拖拽并写回当前模板定义", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await openTemplateFromCatalog(page, "双图文");

    const structure = page.getByRole("complementary", { name: "模板结构" });
    const regionItem = structure.getByRole("treeitem", { name: "内容区域", exact: true });
    await expect(regionItem).toHaveAttribute("aria-level", "2");
    const roleGroup = structure.getByRole("group", { name: "内容区域内容槽位" });
    const roleItems = roleGroup.getByRole("treeitem");
    await expect(roleItems).toHaveCount(4);
    expect(await roleItems.evaluateAll((items) => items.map((item) => item.getAttribute("aria-level"))))
      .toEqual(["3", "3", "3", "3"]);
    await expect(roleGroup.getByRole("treeitem", { name: /主海报/ })).toBeVisible();
    await expect(roleGroup.getByRole("treeitem", { name: /细节图/ })).toBeVisible();
    await expect(roleGroup.getByRole("treeitem", { name: /标题与描述文字/ })).toBeVisible();
    await expect(roleGroup.getByRole("treeitem", { name: /行动入口/ })).toBeVisible();
    await expect(structure.getByRole("button", { name: "添加区域", exact: true })).toBeVisible();
    const { trigger: addTrigger, panel: addPanel } = await openTemplateStructureAddPanel(page);
    await expect(addPanel.getByRole("region", { name: "常用内容槽位" }).getByRole("button"))
      .toHaveCount(5);
    await expect(addPanel.getByRole("button", { name: "添加图片槽位", exact: true })).toBeVisible();
    await addTrigger.click();
    await expect(structure).toContainText("系统必填内容受保护 · 可新增区域和槽位");

    const canvas = page.frameLocator(".template-editor__viewport-frame");
    const contractFrame = canvas.locator('[data-content-template-contract="doublePoster"]').first();
    await expect(contractFrame).toBeVisible();
    const overlayRoot = page.locator('[data-template-editor-overlay-root="template-definition"]');
    const componentTarget = overlayRoot.getByRole("button", {
      name: "选择模板目标 双图海报组件",
      exact: true,
    });
    const mainImage = contractFrame.locator('[data-content-role="mainImage"]:visible').first();
    const readMainImageRect = () => mainImage.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const frame = element.closest<HTMLElement>("[data-content-template-contract]")!
        .getBoundingClientRect();
      return { x: rect.left - frame.left, y: rect.top - frame.top, width: rect.width, height: rect.height };
    });
    const readDraftMainRect = () => page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: sessionStore } = await import(/* @vite-ignore */ modulePath);
      const definition = sessionStore.getState().draft.definition;
      const matureNode = Object.values(definition.nodes)
        .find((candidate) => candidate.type === "DoublePosterTemplate");
      return matureNode?.props?.contentTemplateLayoutData?.nodes?.mainImage?.rectByViewport?.desktop ?? null;
    });
    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await componentTarget.focus();
    await componentTarget.press("Enter");
    await openTemplateInspectorPanel(page, "布局");
    const lockSwitch = inspector.getByRole("switch", { name: "锁定位置、尺寸和层级" });
    await lockSwitch.click();
    await expect(lockSwitch).toHaveAttribute("aria-checked", "true");

    const mainImageTreeItem = roleGroup.getByRole("treeitem", { name: /主海报/ });
    await mainImageTreeItem.click();
    const selectionBox = overlayRoot.locator('[data-overlay-selection-for$=":mainImage"]');
    await expect(overlayRoot).toHaveCount(1);
    await expect(selectionBox).toHaveCount(1);
    await expect(selectionBox).toBeVisible();
    await expect(overlayRoot.locator('[data-overlay-selected="true"]')).toHaveAttribute("data-overlay-locked", "true");
    await expect(selectionBox.locator(".template-editor__editable-overlay-move, .template-editor__editable-overlay-resize"))
      .toHaveCount(0);
    await expect(contractFrame.locator([
      "[data-hc-editor-overlay]",
      "[data-hc-keyboard-node]",
      "[data-editor-block-id]",
      "[data-visual-selected-node]",
      "[data-visual-editor-mode]",
      "style[data-hc-visual-selection]",
    ].join(","))).toHaveCount(0);

    const lockedBefore = await readMainImageRect();
    const lockedPageBox = await mainImage.boundingBox();
    if (!lockedPageBox) throw new Error("双图文主海报槽位没有可验证尺寸");
    await page.mouse.move(lockedPageBox.x + lockedPageBox.width / 2, lockedPageBox.y + lockedPageBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(lockedPageBox.x + lockedPageBox.width / 2 + 36, lockedPageBox.y + lockedPageBox.height / 2 + 18, { steps: 4 });
    await page.mouse.up();
    const lockedAfter = await readMainImageRect();
    expect(lockedAfter.x).toBeCloseTo(lockedBefore.x, 1);
    expect(lockedAfter.y).toBeCloseTo(lockedBefore.y, 1);

    await componentTarget.focus();
    await componentTarget.press("Enter");
    await openTemplateInspectorPanel(page, "布局");
    await lockSwitch.click();
    await expect(lockSwitch).toHaveAttribute("aria-checked", "false");
    await mainImageTreeItem.click();
    await expect(selectionBox).toBeVisible();
    const moveControl = selectionBox.locator(".template-editor__editable-overlay-move");
    await expect(moveControl).toBeVisible();
    await moveControl.focus();
    const before = await readMainImageRect();
    const draftBefore = await readDraftMainRect();
    await moveControl.press("Shift+ArrowRight");
    await expect.poll(async () => (await readMainImageRect()).x)
      .toBeGreaterThan(before.x + 1);
    const moved = await readMainImageRect();
    const draftAfterMove = await readDraftMainRect();
    expect(draftAfterMove).not.toEqual(draftBefore);

    const resizeHandle = selectionBox
      .locator('.template-editor__editable-overlay-resize[data-resize-direction="e"]');
    await expect(resizeHandle).toBeVisible();
    await resizeHandle.focus();
    await resizeHandle.press("Shift+ArrowRight");
    await expect.poll(async () => (await readMainImageRect()).width)
      .toBeGreaterThan(moved.width + 1);
    const resized = await readMainImageRect();
    const draftAfterResize = await readDraftMainRect();
    expect(draftAfterResize).not.toEqual(draftAfterMove);
    const frameBox = await contractFrame.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(resized.x).toBeGreaterThanOrEqual(-1);
    expect(resized.y).toBeGreaterThanOrEqual(-1);
    expect(resized.x + resized.width).toBeLessThanOrEqual(frameBox.width + 1);
    expect(resized.y + resized.height).toBeLessThanOrEqual(frameBox.height + 1);

    await pressWorkspaceHistory(page, "undo");
    await expect.poll(async () => maxBoxDelta(await readMainImageRect(), moved)).toBeLessThanOrEqual(2);
    expect(await readDraftMainRect()).toEqual(draftAfterMove);
    await pressWorkspaceHistory(page, "undo");
    await expect.poll(async () => maxBoxDelta(await readMainImageRect(), before)).toBeLessThanOrEqual(2);
    expect(await readDraftMainRect()).toEqual(draftBefore);
    await pressWorkspaceHistory(page, "redo");
    await expect.poll(async () => maxBoxDelta(await readMainImageRect(), moved)).toBeLessThanOrEqual(2);
    expect(await readDraftMainRect()).toEqual(draftAfterMove);
    await pressWorkspaceHistory(page, "redo");
    await expect.poll(async () => maxBoxDelta(await readMainImageRect(), resized)).toBeLessThanOrEqual(2);
    expect(await readDraftMainRect()).toEqual(draftAfterResize);

    await expect(canvas.locator('[data-template-node-type="DoublePosterTemplate"]'))
      .not.toHaveAttribute("data-template-selected-contract-role", /.*/);
    await expect(mainImageTreeItem).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("complementary", { name: "模板属性", exact: true }))
      .toContainText("主海报");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    const savedDefinition = dynamic.writes.at(-1)?.body.definition as Record<string, any>;
    const matureNode = Object.values(savedDefinition.nodes as Record<string, any>)
      .find((candidate: any) => candidate.type === "DoublePosterTemplate");
    const savedMainRect = matureNode?.props?.contentTemplateLayoutData?.nodes?.mainImage?.rectByViewport?.desktop;
    expect(savedMainRect).toEqual(draftAfterResize);
    expect(savedDefinition.defaultContent).toEqual({});
    expect(savedDefinition.previewContent).toEqual({});
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("单品展示连续调整商品区域后保持位置并写回同一模板定义", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await expect(page.locator(".template-editor__toolbar")).toBeVisible();
    const productCardControl = page.getByRole("complementary", { name: "模板组件库" })
      .locator('[data-template-identity="source:legacy_system_featuredProduct"] .homepage-editor__template-card-main');
    await expect(productCardControl).toBeVisible();
    await expect(productCardControl.locator(".homepage-editor__template-preview-wrap"))
      .toHaveCSS("pointer-events", "none");
    await productCardControl.click();
    await expect(productCardControl).toHaveAttribute("aria-pressed", "true");

    const structure = page.getByRole("complementary", { name: "模板结构" });
    const roleGroup = structure.getByRole("group", { name: /响应式区域内容槽位/ });
    await expect(roleGroup.getByRole("treeitem", { name: /商品/ })).toBeVisible();
    await expect(roleGroup.getByRole("treeitem", { name: /标题与描述文字/ })).toBeVisible();
    await expect(roleGroup.getByRole("treeitem", { name: /列表内容/ })).toBeVisible();
    await expect(roleGroup.getByRole("treeitem", { name: /行动入口/ })).toBeVisible();

    const canvas = page.frameLocator(".template-editor__viewport-frame");
    const contractFrame = canvas.locator('[data-content-template-contract="featuredProduct"]').first();
    const product = contractFrame.locator('[data-content-role="product"]:visible').first();
    await expect(product).toBeVisible();
    await roleGroup.getByRole("treeitem", { name: /商品/ }).click();
    const overlayRoot = page.locator('[data-template-editor-overlay-root="template-definition"]');
    const selection = overlayRoot.locator('[data-overlay-selection-for$=":product"]');
    await expect(overlayRoot).toHaveCount(1);
    await expect(selection).toBeVisible();
    await expect(contractFrame.locator([
      "[data-hc-node-hud]",
      "[data-hc-keyboard-node]",
      "[data-visual-selected-node]",
      "[data-visual-editor-mode]",
    ].join(","))).toHaveCount(0);

    const dragProductBy = async (deltaX: number, deltaY: number) => {
      const before = await product.boundingBox();
      if (!before) throw new Error("单品展示商品区域没有可拖拽尺寸");
      const move = selection.locator(".template-editor__editable-overlay-move");
      await expect(move).toBeVisible();
      for (let horizontal = 0; horizontal < Math.max(1, Math.round(deltaX / 10)); horizontal += 1) {
        await move.press("Shift+ArrowRight");
      }
      for (let vertical = 0; vertical < Math.max(1, Math.round(deltaY / 10)); vertical += 1) {
        await move.press("Shift+ArrowDown");
      }
      await expect.poll(async () => (await product.boundingBox())?.x ?? 0)
        .toBeGreaterThan(before.x + 8);
      return before;
    };

    const firstStart = await dragProductBy(36, 16);
    const afterFirst = await product.boundingBox();
    if (!afterFirst) throw new Error("单品展示商品区域在第一次调整后丢失");
    expect(afterFirst.x).toBeGreaterThan(firstStart.x + 8);

    await dragProductBy(28, 12);
    const afterSecond = await product.boundingBox();
    if (!afterSecond) throw new Error("单品展示商品区域在第二次调整后丢失");
    expect(afterSecond.x).toBeGreaterThan(afterFirst.x + 8);
    const readOffsetParentPosition = (target: Locator) => target.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const parentRect = (element as HTMLElement).offsetParent?.getBoundingClientRect();
      if (!parentRect || parentRect.width <= 0 || parentRect.height <= 0) return null;
      return {
        x: (rect.x - parentRect.x) / parentRect.width,
        y: (rect.y - parentRect.y) / parentRect.height,
      };
    });
    const editorPosition = await readOffsetParentPosition(product);
    if (!editorPosition) throw new Error("单品展示商品区域缺少有效定位容器");

    await page.getByRole("button", { name: "预览模板" }).click();
    await expect(page.getByRole("button", { name: "退出模板预览" })).toBeVisible();
    await expect(page.locator('[data-template-editor-overlay-root="template-definition"]')).toHaveCount(0);
    const previewProduct = contractFrame.locator('[data-content-role="product"]:visible').first();
    const previewBox = await previewProduct.boundingBox();
    if (!previewBox) throw new Error("单品展示商品区域在预览中丢失");
    const previewPosition = await readOffsetParentPosition(previewProduct);
    if (!previewPosition) throw new Error("单品展示预览商品区域缺少有效定位容器");
    expect(Math.abs(previewPosition.x - editorPosition.x)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(previewPosition.y - editorPosition.y)).toBeLessThanOrEqual(0.002);
    await page.getByRole("button", { name: "退出模板预览" }).click();

    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    const savedDefinition = dynamic.writes.at(-1)?.body.definition as Record<string, any>;
    const productCardNode = Object.values(savedDefinition.nodes as Record<string, any>)
      .find((candidate: any) => candidate.type === "ProductCard");
    const savedProductRect = productCardNode?.props?.contentTemplateLayoutData
      ?.nodes?.product?.rectByViewport?.desktop;
    expect(savedProductRect).toMatchObject({
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      });
    expect(savedDefinition.defaultContent).toEqual({});
    expect(savedDefinition.previewContent).toEqual({});

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "模板设计" }).click();
    const reopenedCard = page.getByRole("complementary", { name: "模板组件库" })
      .locator('[data-template-identity="source:legacy_system_featuredProduct"] .homepage-editor__template-card-main');
    await expect(reopenedCard).toBeVisible();
    if (await reopenedCard.getAttribute("aria-pressed") !== "true") await reopenedCard.click();
    await expect(reopenedCard).toHaveAttribute("aria-pressed", "true");
    const reopenedFrame = page.frameLocator(".template-editor__viewport-frame")
      .locator('[data-content-template-contract="featuredProduct"]').first();
    const reopenedProduct = reopenedFrame.locator('[data-content-role="product"]:visible').first();
    await expect(reopenedProduct).toBeVisible();
    const reopenedPosition = await readOffsetParentPosition(reopenedProduct);
    if (!reopenedPosition || !savedProductRect) throw new Error("单品展示保存重开后缺少商品区域几何");
    expect(Math.abs(reopenedPosition.x - savedProductRect.x)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(reopenedPosition.y - savedProductRect.y)).toBeLessThanOrEqual(0.002);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("模板结构区显示真实布局层级并支持移入移出容器", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      draft: makeTemplateWorkspaceLayerDraft(),
      viewport: { width: 1912, height: 897 },
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    const structure = page.getByRole("complementary", { name: "模板结构" });
    const health = structure.getByRole("region", { name: "模板结构问题" });
    // 新建模板自带最小骨架（内容区域 + 图片/标题/正文槽位），不再出现缺结构待处理项。
    await expect(structure.getByRole("treeitem", { name: /内容区域 1/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /图片槽位.*可选/ })).toBeVisible();
    await expect(structure.locator(".template-editor__region-empty")).toHaveCount(0);
    await expect(health).toHaveCount(0);
    const collapseRegion = structure.getByRole("button", { name: "内容区域 1收起" });
    await collapseRegion.click();
    await expect(structure.getByRole("treeitem", { name: /图片槽位.*可选/ })).toBeHidden();
    await structure.getByRole("button", { name: "内容区域 1展开" }).click();
    await expect(structure.getByRole("treeitem", { name: /图片槽位.*可选/ })).toBeVisible();

    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByText("布局", { exact: true }).click();
    await addPanel.getByRole("button", { name: "横向行 结构节点" }).click();
    await addPanel.getByRole("button", { name: "描述槽位 内容槽位" }).click();

    const layout = structure.getByRole("treeitem", { name: /横向行 布局容器/ });
    const nestedSlot = structure.getByRole("treeitem", { name: /描述槽位 .* 可选/ });
    await expect(layout).toBeVisible();
    await expect(layout).toHaveAttribute("aria-level", "3");
    await expect(nestedSlot).toHaveAttribute("aria-level", "4");

    await structure.getByRole("button", { name: "描述槽位节点操作" }).click();
    await page.getByRole("menuitem", { name: "移出当前容器" }).click();
    await expect(nestedSlot).toHaveAttribute("aria-level", "3");
    await expect(health).toContainText("1 项待处理");
    await expect(health.getByRole("button", { name: "定位" }).first()).toBeVisible();
    const horizontalOverflow = await structure.locator(".template-editor__structure-scroll")
      .evaluate((element) => Math.max(0, element.scrollWidth - element.clientWidth));
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("F0-01 authoring 结构锁由命令层统一执行且不进入公开 Render Plan", () => {
    let definition = createBlankDynamicTemplateDefinition("锁定操作层验收");
    const primaryRegion = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = primaryRegion.definition;
    const firstSlot = addDynamicTemplateNode(definition, primaryRegion.nodeId, "TextSlot");
    definition = firstSlot.definition;
    const secondSlot = addDynamicTemplateNode(definition, primaryRegion.nodeId, "HeadingSlot");
    definition = secondSlot.definition;
    const secondaryRegion = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = secondaryRegion.definition;

    const legalDefinition = updateDynamicTemplateNodeRules(
      definition,
      firstSlot.nodeId,
      "desktop",
      (rules) => { rules.order = 1; },
    );
    expect(legalDefinition.nodes[firstSlot.nodeId].responsive.desktop.order).toBe(1);
    definition = setDynamicTemplateNodeStructureLocked(
      legalDefinition,
      firstSlot.nodeId,
      true,
    );
    expect(definition.nodes[firstSlot.nodeId].authoring).toEqual({ structureLocked: true });
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);

    const legacyLockField = structuredClone(legalDefinition);
    legacyLockField.nodes[firstSlot.nodeId].props.contentTemplateDesignProps = {
      structureLocked: true,
    };
    expect(validateDynamicTemplateDefinition(legacyLockField).issues.some(
      (issue) => issue.code === "UNEXPECTED_CONTENT_TEMPLATE_DESIGN_PROPS",
    )).toBe(true);

    expect(() => updateDynamicTemplateNodeRules(
      definition,
      firstSlot.nodeId,
      "desktop",
      (rules) => { rules.order = 2; },
    )).toThrow(/已锁定/);
    expect(() => moveDynamicTemplateNode(
      definition,
      firstSlot.nodeId,
      secondaryRegion.nodeId,
    )).toThrow(/已锁定/);
    expect(() => reorderDynamicTemplateNode(
      definition,
      secondSlot.nodeId,
      0,
    )).toThrow(/已锁定/);
    expect(() => removeDynamicTemplateNode(definition, primaryRegion.nodeId)).toThrow(/已锁定/);
    expect(() => duplicateDynamicTemplateNode(definition, firstSlot.nodeId)).toThrow(/已锁定/);

    const directLayoutMutation = structuredClone(definition);
    directLayoutMutation.nodes[firstSlot.nodeId].responsive.desktop.order = 9;
    expect(getDynamicTemplateStructureLockViolation(definition, directLayoutMutation))
      .toContain("位置或尺寸");

    const session = useTemplateEditorSession.getState();
    session.open({
      format: "dynamic",
      sourceType: "local",
      localDraftId: definition.templateId,
      versionNote: "",
      definition,
    }, { isNew: true });
    try {
      useTemplateEditorSession.getState().setDynamicDefinition(directLayoutMutation);
      expect(useTemplateEditorSession.getState().draft?.definition.nodes[firstSlot.nodeId]
        .responsive.desktop.order).toBe(1);
    } finally {
      useTemplateEditorSession.getState().close();
    }

    const combinedUnlockAndLayoutMutation = structuredClone(definition);
    delete combinedUnlockAndLayoutMutation.nodes[firstSlot.nodeId].authoring;
    combinedUnlockAndLayoutMutation.nodes[firstSlot.nodeId].responsive.desktop.order = 8;
    expect(getDynamicTemplateStructureLockViolation(definition, combinedUnlockAndLayoutMutation))
      .toContain("必须作为独立操作");

    const combinedLayoutMutationAndLock = structuredClone(legalDefinition);
    combinedLayoutMutationAndLock.nodes[firstSlot.nodeId].responsive.desktop.order = 8;
    combinedLayoutMutationAndLock.nodes[firstSlot.nodeId].authoring = { structureLocked: true };
    expect(getDynamicTemplateStructureLockViolation(legalDefinition, combinedLayoutMutationAndLock))
      .toContain("必须作为独立操作");

    const unlockedDefinition = setDynamicTemplateNodeStructureLocked(
      definition,
      firstSlot.nodeId,
      false,
    );
    expect(getDynamicTemplateStructureLockViolation(definition, unlockedDefinition)).toBeNull();
    expect(unlockedDefinition.nodes[firstSlot.nodeId].authoring).toBeUndefined();
    expect(updateDynamicTemplateNodeRules(
      unlockedDefinition,
      firstSlot.nodeId,
      "desktop",
      (rules) => { rules.order = 2; },
    ).nodes[firstSlot.nodeId].responsive.desktop.order).toBe(2);

    const lockedRegionDefinition = setDynamicTemplateNodeStructureLocked(
      unlockedDefinition,
      primaryRegion.nodeId,
      true,
    );
    expect(() => addDynamicTemplateNode(
      lockedRegionDefinition,
      primaryRegion.nodeId,
      "ImageSlot",
    )).toThrow(/不能改变子节点结构/);
    expect(() => updateDynamicTemplateNodeRules(
      lockedRegionDefinition,
      firstSlot.nodeId,
      "desktop",
      (rules) => { rules.order = 4; },
    )).toThrow(/已锁定/);
    expect(() => duplicateDynamicTemplateNode(
      lockedRegionDefinition,
      firstSlot.nodeId,
    )).toThrow(/已锁定/);
    expect(() => moveDynamicTemplateNode(
      lockedRegionDefinition,
      firstSlot.nodeId,
      secondaryRegion.nodeId,
    )).toThrow(/已锁定/);

    for (const surface of [
      { name: "目录与模板画布", showEmptySlots: true },
      { name: "页面画布、预览与公开 Renderer", showEmptySlots: false },
    ]) {
      for (const device of ["desktop", "mobile"] as const) {
        const unlockedPlan = compileDynamicTemplateRenderPlan(unlockedDefinition, {
          device,
          showEmptySlots: surface.showEmptySlots,
        });
        const lockedPlan = compileDynamicTemplateRenderPlan(lockedRegionDefinition, {
          device,
          showEmptySlots: surface.showEmptySlots,
        });
        expect(unlockedPlan.ok, `${surface.name} ${device} 未锁定定义应可编译`).toBe(true);
        expect(lockedPlan.ok, `${surface.name} ${device} 锁定定义应可编译`).toBe(true);
        if (unlockedPlan.ok && lockedPlan.ok) {
          expect(lockedPlan.plan, `${surface.name} ${device} 结构指纹不得消费 authoring`)
            .toEqual(unlockedPlan.plan);
        }
      }
    }
  });

  test("T3-01 Inspector 能力按节点与槽位类型分派并覆盖治理字段", () => {
    let definition = createBlankDynamicTemplateDefinition("能力注册表甲");
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const spacer = addDynamicTemplateNode(definition, region.nodeId, "Spacer");
    definition = spacer.definition;
    const divider = addDynamicTemplateNode(definition, region.nodeId, "Divider");
    definition = divider.definition;
    const collection = addDynamicTemplateNode(definition, region.nodeId, "CollectionSlot");
    definition = collection.definition;
    const link = addDynamicTemplateNode(definition, region.nodeId, "LinkSlot");
    definition = link.definition;

    const capabilitiesFor = (nodeId: string) => {
      const node = definition.nodes[nodeId];
      const slot = node.slotId ? definition.slots[node.slotId] : undefined;
      return getTemplateInspectorCapabilities(
        nodeId === definition.rootNodeId
          ? { scope: "root", node }
          : slot
            ? { scope: "slot", node, slot }
            : { scope: "node", node },
      );
    };
    const fieldsFor = (nodeId: string) => capabilitiesFor(nodeId).map((capability) => capability.field);
    expect(fieldsFor(definition.rootNodeId)).toContain("props.semanticTag");
    expect(fieldsFor(spacer.nodeId)).toContain("props.spacerSize");
    expect(fieldsFor(spacer.nodeId)).not.toContain("props.dividerStyle");
    expect(fieldsFor(divider.nodeId)).toContain("props.dividerStyle");
    expect(fieldsFor(collection.nodeId)).toEqual(expect.arrayContaining([
      "slot.validation.minItems",
      "slot.validation.maxItems",
    ]));
    expect(fieldsFor(link.nodeId)).toContain("slot.validation.allowedProtocols");
    const rootOnlyFields = [
      "schemaVersion", "templateId", "name", "description", "metadata.category",
      "metadata.purpose", "metadata.layoutType", "metadata.slotSummary",
      "metadata.recommendedFor", "metadata.desktopRatio", "metadata.mobileRatio",
      "metadata.previewDesktopWidth", "metadata.previewMobileWidth",
      "metadata.mobileBreakpoint", "metadata.minViewportWidth", "metadata.maxViewportWidth",
      "metadata.defaultBackgroundToken", "metadata.visualRole", "metadata.headerCompatibility",
      "metadata.tags", "rootNodeId", "nodes", "slots", "defaultContent", "previewContent",
    ];
    for (const nodeId of [region.nodeId, spacer.nodeId, collection.nodeId, link.nodeId]) {
      expect(fieldsFor(nodeId).filter((field) => rootOnlyFields.includes(field))).toEqual([]);
    }
    const roleFields = getTemplateInspectorCapabilities({
      scope: "role",
      node: definition.nodes[link.nodeId],
      slot: definition.slots[definition.nodes[link.nodeId].slotId!],
      roleId: "action",
    }).map((capability) => capability.field);
    expect(roleFields).toContain("props.contentTemplateLayoutData");
    expect(roleFields.filter((field) => rootOnlyFields.includes(field))).toEqual([]);
    expect(TEMPLATE_INSPECTOR_CAPABILITIES.every((capability) => capability.scopes.length > 0)).toBe(true);

    const governedFields = TEMPLATE_INSPECTOR_CAPABILITIES.map((capability) => capability.field);
    expect(governedFields).toEqual(expect.arrayContaining([
      "props.semanticTag",
      "props.dividerStyle",
      "props.spacerSize",
      "slot.validation.minItems",
      "slot.validation.maxItems",
      "slot.validation.allowedProtocols",
      "responsive.*.placement",
      "slot.*Rules.objectPosition",
    ]));

    const renamed = structuredClone(definition);
    renamed.name = "与任何内置模板名称无关";
    renamed.nodes[collection.nodeId].name = "任意集合";
    expect(getTemplateInspectorCapabilities({
      scope: "slot",
      node: renamed.nodes[collection.nodeId],
      slot: renamed.slots[renamed.nodes[collection.nodeId].slotId!],
    }).map((capability) => capability.field)).toEqual(fieldsFor(collection.nodeId));
  });

  test("T3-01 typed command 单步记史且锁拒绝不污染 dirty 与 history", () => {
    let definition = createBlankDynamicTemplateDefinition("命令事务验收");
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const slot = addDynamicTemplateNode(definition, region.nodeId, "TextSlot");
    definition = slot.definition;
    const session = useTemplateEditorSession.getState();
    session.open({
      format: "dynamic",
      sourceType: "local",
      localDraftId: definition.templateId,
      versionNote: "",
      definition,
    });
    try {
      const edited = useTemplateEditorSession.getState().executeCommand({
        type: "update-definition",
        label: "同时更新字段",
        update: (next) => {
          next.nodes[slot.nodeId].name = "新槽位名";
          next.nodes[slot.nodeId].responsive.desktop.order = 4;
        },
      });
      expect(edited).toMatchObject({ ok: true, changed: true, code: "APPLIED" });
      expect(useTemplateEditorSession.getState().historyPast).toHaveLength(1);
      expect(useTemplateEditorSession.getState().dirty).toBe(true);
      useTemplateEditorSession.getState().undo();
      expect(useTemplateEditorSession.getState().draft?.definition.nodes[slot.nodeId].name).not.toBe("新槽位名");
      useTemplateEditorSession.getState().redo();
      expect(useTemplateEditorSession.getState().draft?.definition.nodes[slot.nodeId].name).toBe("新槽位名");

      const beforeCopyHistory = useTemplateEditorSession.getState().historyPast.length;
      expect(getTemplateResponsiveSource(
        useTemplateEditorSession.getState().draft!.definition,
        slot.nodeId,
        "desktop",
      )).toBe("device-override");
      const copied = useTemplateEditorSession.getState().executeCommand({
        type: "copy-responsive",
        label: "复制到移动端",
        nodeId: slot.nodeId,
        sourceDevice: "desktop",
        targetDevice: "mobile",
        includeSlotRules: true,
      });
      expect(copied).toMatchObject({ ok: true, changed: true });
      expect(useTemplateEditorSession.getState().historyPast).toHaveLength(beforeCopyHistory + 1);
      expect(getTemplateResponsiveSource(
        useTemplateEditorSession.getState().draft!.definition,
        slot.nodeId,
        "mobile",
      )).toBe("shared");

      useTemplateEditorSession.getState().close();
      const locked = setDynamicTemplateNodeStructureLocked(definition, slot.nodeId, true);
      useTemplateEditorSession.getState().open({
        format: "dynamic",
        sourceType: "local",
        localDraftId: locked.templateId,
        versionNote: "",
        definition: locked,
      });
      const rejected = useTemplateEditorSession.getState().executeCommand({
        type: "update-definition",
        label: "修改锁定节点",
        update: (next) => { next.nodes[slot.nodeId].responsive.desktop.order = 9; },
      });
      expect(rejected).toMatchObject({ ok: false, changed: false, code: "STRUCTURE_LOCKED" });
      expect(useTemplateEditorSession.getState().historyPast).toHaveLength(0);
      expect(useTemplateEditorSession.getState().dirty).toBe(false);
      expect(useTemplateEditorSession.getState().lastCommandResult).toEqual(rejected);
    } finally {
      useTemplateEditorSession.getState().close();
    }
  });

  test("T3-01 发布问题协议稳定定位 object、group、field 与设备", () => {
    let definition = createBlankDynamicTemplateDefinition("发布定位验收");
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const slotResult = addDynamicTemplateNode(definition, region.nodeId, "ImageSlot");
    definition = slotResult.definition;
    const slotId = definition.nodes[slotResult.nodeId].slotId!;
    definition.slots[slotId].required = true;
    definition.slots[slotId].editable = true;
    definition.slots[slotId].hideable = false;
    definition.nodes[slotResult.nodeId].responsive.mobile.display = "none";

    const issue = validateDynamicTemplatePublishDefinition(definition).issues.find(
      (candidate) => candidate.code === "PUBLISH_REQUIRED_SLOT_DEVICE_HIDDEN",
    );
    expect(issue).toBeTruthy();
    expect(resolveTemplateInspectorIssueTarget(definition, issue!)).toEqual({
      objectId: slotResult.nodeId,
      group: "layout",
      field: "responsive.*.display",
      device: "mobile",
      destination: "inspector-field",
      access: "editable",
    });
    expect(resolveTemplateInspectorIssueTarget(definition, {
      level: "error",
      code: "INVALID_TEMPLATE_DESCRIPTION",
      path: "metadata.description",
      message: "模板描述无效。",
    })).toMatchObject({
      objectId: definition.rootNodeId,
      group: "definition",
      field: "description",
      destination: "inspector-field",
      access: "editable",
    });
    expect(resolveTemplateInspectorIssueTarget(definition, {
      level: "error",
      code: "INVALID_METADATA_WIDTH",
      path: "metadata.mobileBreakpoint",
      message: "断点无效。",
    })).toMatchObject({
      objectId: definition.rootNodeId,
      group: "rules",
      field: "metadata.mobileBreakpoint",
      destination: "inspector-field",
      access: "editable",
    });
    expect(resolveTemplateInspectorIssueTarget(definition, {
      level: "error",
      code: "INVALID_SLOT_KEY",
      path: `slots.${slotId}.key`,
      slotId,
      message: "槽位键无效。",
    })).toMatchObject({
      objectId: slotResult.nodeId,
      group: "definition",
      field: "slot.key",
      destination: "inspector-field",
      access: "read-only",
    });
    expect(resolveTemplateInspectorIssueTarget(definition, {
      level: "error",
      code: "PUBLISH_REQUIRES_SLOT",
      path: "slots",
      nodeId: definition.rootNodeId,
      message: "需要槽位。",
    })).toMatchObject({
      objectId: definition.rootNodeId,
      field: "structure.create.slot",
      destination: "structure-slot",
      access: "managed",
    });
  });

  test("F0-01 删除与历史导航会修复失效选区", () => {
    let definition = createBlankDynamicTemplateDefinition("选区修复验收");
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const slot = addDynamicTemplateNode(definition, region.nodeId, "TextSlot");
    definition = slot.definition;
    const session = useTemplateEditorSession.getState();

    session.open({
      format: "dynamic",
      sourceType: "local",
      localDraftId: definition.templateId,
      versionNote: "",
      definition,
    }, { isNew: true });
    try {
      useTemplateEditorSession.getState().selectObject(slot.nodeId);
      useTemplateEditorSession.getState().setDynamicDefinition(
        removeDynamicTemplateNode(definition, slot.nodeId),
      );
      expect(useTemplateEditorSession.getState().selectedObjectId).toBe(definition.rootNodeId);

      useTemplateEditorSession.getState().undo();
      expect(useTemplateEditorSession.getState().draft?.definition.nodes[slot.nodeId]).toBeTruthy();
      expect(useTemplateEditorSession.getState().selectedObjectId).toBe(definition.rootNodeId);

      useTemplateEditorSession.getState().selectObject(slot.nodeId);
      useTemplateEditorSession.getState().redo();
      expect(useTemplateEditorSession.getState().draft?.definition.nodes[slot.nodeId]).toBeUndefined();
      expect(useTemplateEditorSession.getState().selectedObjectId).toBe(definition.rootNodeId);
    } finally {
      useTemplateEditorSession.getState().close();
    }
  });

  test("F0-01 Inspector 结构锁和 Schema 输入可撤销、保存并在刷新后回显", async ({ page }) => {
    test.slow();
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    const layoutType = inspector.getByRole("textbox", { name: "构图类型" });
    await layoutType.fill("构".repeat(DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH.layoutType + 1));
    await expect(layoutType).toHaveValue("构".repeat(DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH.layoutType));

    const rawTags = Array.from(
      { length: DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS.tags.maxItems + 1 },
      (_, index) => `标签${String(index).padStart(2, "0")}${"长".repeat(40)}`,
    );
    const tags = inspector.getByRole("textbox", { name: "标签" });
    await openTemplateInspectorPanel(page, "规则");
    await tags.fill(rawTags.join("，"));
    await tags.press("Tab");
    const expectedTags = rawTags
      .slice(0, DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS.tags.maxItems)
      .map((tag) => tag.slice(0, DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS.tags.maxItemLength));
    await expect(tags).toHaveValue(expectedTags.join("，"));
    expect(parseCommaSeparatedValues(
      rawTags.join("，"),
      DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS.tags,
    )).toEqual(expectedTags);

    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    await addPanel.getByRole("button", { name: "描述槽位 内容槽位" }).click();
    await addPanel.getByRole("button", { name: "标题槽位 内容槽位" }).click();
    await openTemplateInspectorPanel(page, "基本");
    await inspector.getByRole("textbox", { name: "节点名称" }).fill("边界标题槽位");

    const maxLines = inspector.getByRole("spinbutton", { name: "最大行数" });
    await openTemplateInspectorPanel(page, "布局");
    await maxLines.fill(String(DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES + 1));
    await expect(maxLines).toHaveValue(String(DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES));
    await maxLines.fill(String(DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES));
    await expect(maxLines).toHaveValue(String(DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES));

    const lockSwitch = inspector.getByRole("switch", { name: "锁定位置、尺寸和层级" });
    await openTemplateInspectorPanel(page, "规则");
    await lockSwitch.click();
    await expect(lockSwitch).toHaveAttribute("aria-checked", "true");
    await expect(inspector.locator('[data-template-inspector-field="node.name"] input')).toHaveAttribute("readonly", "");
    await expect(inspector.getByRole("spinbutton", { name: "最大行数" })).toHaveCount(0);

    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(lockSwitch).toHaveAttribute("aria-checked", "false");
    await expect(inspector.locator('[data-template-inspector-field="node.name"] input')).not.toHaveAttribute("readonly", "");
    await page.getByRole("button", { name: "重做", exact: true }).click();
    await expect(lockSwitch).toHaveAttribute("aria-checked", "true");

    const structureActions = page.getByRole("button", { name: "边界标题槽位节点操作" });
    await structureActions.click();
    await expect(page.getByRole("menuitem", { name: "上移" }).last()).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("menuitem", { name: /删除槽位/ }).last()).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
    await expect(structureActions).toBeFocused();
    const templateFrame = page.frameLocator(".template-editor__viewport-frame");
    await expect(templateFrame.getByRole("toolbar", { name: /边界标题槽位快捷操作/ })).toHaveCount(0);
    await expect(page.locator(".template-editor__body")
      .getByRole("toolbar", { name: /边界标题槽位快捷操作/ })).toHaveCount(0);

    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    const savedDefinition = dynamic.writes.at(-1)?.body.definition;
    expect(savedDefinition.metadata.layoutType).toHaveLength(DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH.layoutType);
    expect(savedDefinition.metadata.tags).toEqual(expectedTags);
    const savedHeading = Object.values(savedDefinition.nodes as Record<string, {
      name: string;
      slotId?: string;
      authoring?: { structureLocked?: boolean };
      props: { contentTemplateDesignProps?: Record<string, unknown> };
    }>).find((node) => node.name === "边界标题槽位");
    expect(savedHeading?.slotId).toBeTruthy();
    expect(savedHeading?.authoring).toEqual({ structureLocked: true });
    expect(savedHeading?.props.contentTemplateDesignProps?.structureLocked).toBeUndefined();
    expect(savedDefinition.slots[savedHeading!.slotId!].desktopRules.maxLines)
      .toBe(DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES);
    const savedValidation = validateDynamicTemplateDefinition(savedDefinition);
    expect(savedValidation.issues.filter((issue) => issue.level === "error")).toEqual([]);

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await openTemplateFromCatalog(page, savedDefinition.name);

    const reloadedInspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await page.getByRole("treeitem", { name: new RegExp(`${savedDefinition.name} 模板`) }).click();
    await openTemplateInspectorPanel(page, "基本");
    await expect(reloadedInspector.getByRole("textbox", { name: "构图类型" }))
      .toHaveValue("构".repeat(DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH.layoutType));
    await openTemplateInspectorPanel(page, "规则");
    await expect(reloadedInspector.getByRole("textbox", { name: "标签" }))
      .toHaveValue(expectedTags.join("，"));

    await page.getByRole("treeitem", { name: /边界标题槽位.*已锁定/ }).click();
    const reloadedLockSwitch = reloadedInspector.getByRole("switch", { name: "锁定位置、尺寸和层级" });
    await expect(reloadedLockSwitch).toHaveAttribute("aria-checked", "true");
    await reloadedLockSwitch.click();
    await expect(reloadedLockSwitch).toHaveAttribute("aria-checked", "false");
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(reloadedLockSwitch).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "重做", exact: true }).click();
    await expect(reloadedLockSwitch).toHaveAttribute("aria-checked", "false");
    await openTemplateInspectorPanel(page, "布局");
    const reloadedMaxLines = reloadedInspector.getByRole("spinbutton", { name: "最大行数" });
    await expect(reloadedMaxLines)
      .toHaveValue(String(DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES));
    const changedMaxLines = DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES - 1;
    await reloadedMaxLines.fill(String(changedMaxLines));

    const writesBeforeCombinedSave = dynamic.writes.length;
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect.poll(() => dynamic.writes.length).toBe(writesBeforeCombinedSave + 1);
    const combinedSavedDefinition = dynamic.writes.at(-1)?.body.definition;
    const combinedSavedHeading = Object.values(combinedSavedDefinition.nodes as Record<string, {
      name: string;
      slotId?: string;
      authoring?: { structureLocked?: boolean };
    }>).find((node) => node.name === "边界标题槽位");
    expect(combinedSavedHeading?.authoring).toBeUndefined();
    expect(combinedSavedDefinition.slots[combinedSavedHeading!.slotId!].desktopRules.maxLines)
      .toBe(changedMaxLines);

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await openTemplateFromCatalog(page, savedDefinition.name);
    const combinedReloadedInspector = page.getByRole("complementary", {
      name: "模板属性",
      exact: true,
    });
    await page.getByRole("treeitem", { name: /边界标题槽位/ }).click();
    await openTemplateInspectorPanel(page, "规则");
    await expect(combinedReloadedInspector.getByRole("switch", {
      name: "锁定位置、尺寸和层级",
    })).toHaveAttribute("aria-checked", "false");
    await openTemplateInspectorPanel(page, "布局");
    await expect(combinedReloadedInspector.getByRole("spinbutton", { name: "最大行数" }))
      .toHaveValue(String(changedMaxLines));
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("T3-01 Inspector 显示类型字段、响应式来源并从发布问题安全修复重验", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await expect(inspector.getByRole("combobox", { name: "区域语义标签" })).toHaveValue("section");
    const getSessionSnapshot = () => page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: sessionStore } = await import(/* @vite-ignore */ modulePath);
      const state = sessionStore.getState();
      return {
        definition: JSON.stringify(state.draft?.definition),
        historyPast: state.historyPast.length,
        dirty: state.dirty,
      };
    });
    const blankSnapshot = await getSessionSnapshot();
    const requiresRegion = inspector.locator('[data-template-issue-destination="structure-region"]');
    const requiresSlot = inspector.locator('[data-template-issue-destination="structure-slot"]');
    await expect(requiresRegion).toContainText("由用户创建区域");
    await expect(requiresSlot).toContainText("选择父节点和内容槽位类型");
    await expect(requiresRegion.getByRole("button", { name: "安全修复并重验" })).toHaveCount(0);
    await expect(requiresSlot.getByRole("button", { name: "安全修复并重验" })).toHaveCount(0);
    await requiresRegion.getByRole("button", { name: "定位" }).click();
    const regionCreationTarget = page.getByRole("button", { name: "添加区域", exact: true });
    await expect(regionCreationTarget).toBeFocused();
    await page.getByRole("button", { name: /^添加模板结构到/ }).click();
    await requiresSlot.getByRole("button", { name: "定位" }).click();
    const slotCreationTarget = page.getByRole("region", { name: "常用内容槽位" });
    await expect(slotCreationTarget).toBeFocused();
    expect(await getSessionSnapshot()).toEqual(blankSnapshot);
    await page.getByRole("button", { name: /^添加模板结构到/ }).click();

    let add = await openTemplateStructureAddPanel(page);
    await add.panel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    add = await openTemplateStructureAddPanel(page);
    const firstLayoutDetails = add.panel.locator("details.template-editor__advanced-layout-tools");
    if (await firstLayoutDetails.getAttribute("open") === null) {
      await firstLayoutDetails.getByText("布局", { exact: true }).click();
    }
    await add.panel.getByRole("button", { name: "留白间距 结构节点" }).click();
    await openTemplateInspectorPanel(page, "布局");
    const spacerSize = inspector.getByRole("spinbutton", { name: "留白高度" });
    await expect(spacerSize).toBeVisible();
    await spacerSize.fill("48");
    await inspector.getByRole("button", { name: "宽度策略：自动" }).click();
    await expect(inspector.getByText("当前画布有独立值", { exact: true })).toBeVisible();
    await inspector.getByRole("button", { name: "复制当前画布到另一画布" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "确认替换" }).click();
    await expect(inspector.getByText("与另一画布一致", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(inspector.getByText("当前画布有独立值", { exact: true })).toBeVisible();

    add = await openTemplateStructureAddPanel(page);
    const secondLayoutDetails = add.panel.locator("details.template-editor__advanced-layout-tools");
    if (await secondLayoutDetails.getAttribute("open") === null) {
      await secondLayoutDetails.getByText("布局", { exact: true }).click();
    }
    await add.panel.getByRole("button", { name: "分隔线 结构节点" }).click();
    await expect(inspector.getByRole("button", { name: "分隔线样式：实线" })).toBeVisible();

    add = await openTemplateStructureAddPanel(page);
    const firstAdvancedDetails = add.panel.locator("details.template-editor__add-slot-tools");
    if (await firstAdvancedDetails.getAttribute("open") === null) {
      await firstAdvancedDetails.getByRole("button", { name: "高级内容" }).click();
    }
    await add.panel.getByRole("button", { name: "集合槽位 内容槽位" }).click();
    await openTemplateInspectorPanel(page, "规则");
    await expect(inspector.getByRole("spinbutton", { name: "最少项目数" })).toBeVisible();
    await expect(inspector.getByRole("spinbutton", { name: "最多项目数" })).toBeVisible();

    add = await openTemplateStructureAddPanel(page);
    const secondAdvancedDetails = add.panel.locator("details.template-editor__add-slot-tools");
    if (await secondAdvancedDetails.getAttribute("open") === null) {
      await secondAdvancedDetails.getByRole("button", { name: "高级内容" }).click();
    }
    await add.panel.getByRole("button", { name: "链接槽位 内容槽位" }).click();
    await expect(inspector.getByRole("combobox", { name: "允许跳转类型" })).toBeVisible();

    const structure = page.getByRole("complementary", { name: "模板结构" });
    await structure.getByRole("treeitem", { name: /链接槽位/ }).click();
    const requiredSwitch = inspector.getByRole("switch", { name: "页面必须填写" });
    await openTemplateInspectorPanel(page, "布局");
    await inspector.getByRole("button", { name: "布局方式：隐藏" }).click();
    await openTemplateInspectorPanel(page, "规则");
    await requiredSwitch.click();
    await structure.locator(".template-editor__template-summary").click();

    const publishIssue = inspector.locator(".template-editor__validation-list > div").filter({
      hasText: "在对应画布布局中已隐藏",
    });
    await expect(publishIssue).toHaveAttribute("data-template-issue-group", "layout");
    await expect(publishIssue).toHaveAttribute("data-template-issue-field", "responsive.*.display");
    await publishIssue.getByRole("button", { name: "定位" }).click();
    await expect(structure.getByRole("treeitem", { name: /链接槽位/, selected: true })).toBeVisible();
    await expect(inspector.locator(".homepage-editor__inspector-title")).toHaveText("链接槽位");
    await expect(inspector.locator(".homepage-editor__inspector-device")).toHaveCount(0);
    const responsiveTarget = inspector.getByRole("tabpanel", { name: "显示样式" })
      .getByRole("group", { name: "布局方式" });
    await expect.poll(() => responsiveTarget.evaluate((element) =>
      element.contains(document.activeElement))).toBe(true);
    await structure.locator(".template-editor__template-summary").click();
    await publishIssue.getByRole("button", { name: "安全修复并重验" }).click();
    await expect(publishIssue).toHaveCount(0);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await structure.locator(".template-editor__template-summary").click();
    await expect(publishIssue).toBeVisible();
    await page.getByRole("button", { name: "重做", exact: true }).click();
    await expect(publishIssue).toHaveCount(0);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("T3-01 发布问题定位命中字段、设备、滚动锚点与只读说明", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    const structurePanel = page.getByRole("complementary", { name: "模板结构", exact: true });
    await structurePanel.getByRole("button", { name: "添加区域", exact: true }).click();
    const add = await openTemplateStructureAddPanel(page);
    await add.panel.getByRole("button", { name: "添加正文槽位", exact: true }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    const textNode = page.getByRole("complementary", { name: "模板结构" })
      .getByRole("treeitem", { name: /正文槽位/ });
    await expect(textNode).toHaveAttribute("aria-selected", "true");
    await page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: sessionStore } = await import(/* @vite-ignore */ modulePath);
      const state = sessionStore.getState();
      const next = structuredClone(state.draft.definition);
      next.description = "长".repeat(501);
      next.metadata.mobileBreakpoint = 100;
      const textSlot = Object.values(next.slots).find((candidate) => candidate.type === "text");
      textSlot.validation.maxLength = 100001;
      textSlot.key = "";
      state.executeCommand({
        type: "replace-definition",
        label: "构造问题定位负路径",
        definition: next,
      });
    });
    const structure = page.getByRole("complementary", { name: "模板结构" });
    await page.frameLocator(".template-editor__viewport-frame")
      .locator(".template-editor__dynamic-canvas-renderer")
      .evaluate((element: HTMLElement) => element.click());

    const descriptionIssue = inspector.locator('[data-template-issue-field="description"]');
    await expect(descriptionIssue).toHaveAttribute("data-template-issue-group", "definition");
    await descriptionIssue.getByRole("button", { name: "定位" }).click();
    await expect(inspector.getByRole("alert")).toContainText("description");
    await expect(inspector.getByRole("alert")).toContainText("当前不可直接编辑");

    const breakpointIssue = inspector.locator('[data-template-issue-field="metadata.mobileBreakpoint"]');
    await expect(breakpointIssue).toHaveAttribute("data-template-issue-group", "rules");
    await breakpointIssue.getByRole("button", { name: "定位" }).click();
    await expect(inspector.getByRole("alert")).toContainText("metadata.mobileBreakpoint");
    await expect(inspector.getByRole("alert")).toContainText("当前不可直接编辑");

    const slotValidationIssue = inspector.locator('[data-template-issue-field="slot.validation.maxLength"]');
    await expect(slotValidationIssue).toHaveAttribute("data-template-issue-group", "rules");
    await slotValidationIssue.getByRole("button", { name: "定位" }).click();
    await expect(textNode).toHaveAttribute("aria-selected", "true");
    await expect(inspector.getByRole("alert")).toContainText("slot.validation.maxLength");
    await expect(inspector.getByRole("alert")).toContainText("当前不可直接编辑");

    const readOnlyIssue = inspector.locator('[data-template-issue-field="slot.key"]');
    await expect(readOnlyIssue).toHaveAttribute("data-template-issue-group", "definition");
    await readOnlyIssue.getByRole("button", { name: "定位" }).click();
    await expect(inspector.getByRole("alert")).toContainText(
      "页面实例按稳定键关联内容，不能在 Inspector 中改名。",
    );
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("统一模板结构树在真实工作区支持复制、显隐、排序、删除和独立撤销", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites, dynamic } = await openWorkspaceShell(page, {
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    await fillTemplateName(page, "结构操作验收模板");

    const structure = page.getByRole("complementary", { name: "模板结构" });
    await structure.getByRole("button", { name: "添加区域", exact: true }).click();
    await page.getByRole("textbox", { name: "节点名称" }).fill("运营内容容器");
    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByRole("button", { name: "添加正文槽位", exact: true }).click();
    await openTemplateInspectorPanel(page, "基本");
    await page.getByRole("region", { name: "槽位设置" })
      .getByRole("textbox", { name: "槽位名称" })
      .fill("第一段正文");
    await expect(page.getByText(/实际内容.*页面装修中配置/)).toBeVisible();
    await openTemplateInspectorPanel(page, "规则");
    await page.getByRole("switch", { name: "允许调整位置" }).click();
    await page.getByRole("switch", { name: "允许调整尺寸" }).click();
    await page.getByRole("switch", { name: "允许调整层级" }).click();
    await page.getByRole("switch", { name: "允许调整间距" }).click();
    await page.getByRole("switch", { name: "允许调整文字样式" }).click();
    await page.getByRole("spinbutton", { name: /最大位置偏移/ }).fill("20");
    await page.getByRole("spinbutton", { name: "最小宽度" }).fill("40");
    await page.getByRole("spinbutton", { name: "最大宽度" }).last().fill("160");
    await page.getByRole("spinbutton", { name: "最小字号" }).fill("14");
    await page.getByRole("spinbutton", { name: "最大字号" }).fill("64");
    await page.getByRole("spinbutton", { name: "最大上下间距" }).fill("80");

    await page.getByRole("treeitem", { name: /运营内容容器/ }).click();
    const { panel: reopenedAddPanel } = await openTemplateStructureAddPanel(page);
    await reopenedAddPanel.getByRole("button", { name: "添加标题槽位", exact: true }).click();
    await openTemplateInspectorPanel(page, "基本");
    await page.getByRole("region", { name: "槽位设置" })
      .getByRole("textbox", { name: "槽位名称" })
      .fill("第二段标题");

    await page.getByRole("treeitem", { name: /第一段正文/ }).click();
    const originalActions = page.getByRole("button", { name: "第一段正文节点操作" });
    await page.getByRole("treeitem", { name: /第一段正文/ }).dragTo(
      page.getByRole("treeitem", { name: /第二段标题/ }),
      { sourcePosition: { x: 36, y: 16 }, targetPosition: { x: 36, y: 30 } },
    );
    await originalActions.click();
    await page.getByRole("menuitem", { name: "复制" }).click();

    const copiedTreeItem = page.getByRole("treeitem", { name: /第一段正文 副本/ });
    await expect(copiedTreeItem).toBeVisible();
    const copiedActions = page.getByRole("button", { name: "第一段正文 副本节点操作" });
    const canvasTextSlots = page.frameLocator(".template-editor__viewport-frame")
      .locator('.template-editor__dynamic-canvas-renderer [data-template-node-type="TextSlot"]');
    await expect(canvasTextSlots).toHaveCount(2);

    await copiedActions.click();
    await page.getByRole("menuitem", { name: "隐藏" }).last().click();
    await expect(page.getByRole("treeitem", { name: /第一段正文 副本.*已隐藏/ })).toBeVisible();
    await expect(canvasTextSlots).toHaveCount(1);
    await copiedActions.click();
    await page.getByRole("menuitem", { name: "显示" }).last().click();
    await expect(canvasTextSlots).toHaveCount(2);

    await copiedActions.click();
    await page.getByRole("menuitem", { name: "锁定槽位" }).last().click();
    await expect(page.getByRole("treeitem", { name: /第一段正文 副本.*已锁定/ }))
      .toHaveAttribute("draggable", "false");
    await copiedActions.click();
    await page.getByRole("menuitem", { name: "解除锁定" }).last().click();

    await copiedActions.click();
    await page.getByRole("menuitem", { name: "删除" }).last().click();
    const deleteDialog = page.getByRole("dialog", { name: /删除“第一段正文 副本”/ });
    await deleteDialog.getByRole("button", { name: "删除节点" }).click();
    await expect(copiedTreeItem).toHaveCount(0);
    await pressWorkspaceHistory(page, "undo");
    await expect(copiedTreeItem).toBeVisible();
    await pressWorkspaceHistory(page, "redo");
    await expect(copiedTreeItem).toHaveCount(0);
    await pressWorkspaceHistory(page, "undo");
    await expect(copiedTreeItem).toBeVisible();

    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    const storedDefinition = dynamic.writes[0].body.definition as {
      nodes: Record<string, {
        name: string;
        childIds: string[];
        slotId?: string;
        instanceEditPolicy?: Record<string, unknown>;
      }>;
      previewContent: Record<string, unknown>;
    };
    const storedContainer = Object.values(storedDefinition.nodes)
      .find((node) => node.name === "运营内容容器");
    expect(storedContainer).toBeTruthy();
    const storedChildNames = storedContainer!.childIds.map((nodeId) => storedDefinition.nodes[nodeId].name);
    expect(storedChildNames).toEqual(["第二段标题", "第一段正文", "第一段正文 副本"]);
    expect(new Set(storedContainer!.childIds).size).toBe(storedContainer!.childIds.length);
    const copiedNode = Object.values(storedDefinition.nodes)
      .find((node) => node.name === "第一段正文 副本");
    const originalNode = Object.values(storedDefinition.nodes)
      .find((node) => node.name === "第一段正文");
    expect(copiedNode?.slotId).toBeTruthy();
    expect(copiedNode?.slotId).not.toBe(originalNode?.slotId);
    expect(originalNode?.instanceEditPolicy).toMatchObject({
      position: true,
      size: true,
      zIndex: true,
      typography: true,
      spacing: true,
      maxOffsetPercent: 20,
      minWidthPercent: 40,
      maxWidthPercent: 160,
      minFontSizePx: 14,
      maxFontSizePx: 64,
      maxSpacingPx: 80,
    });
    expect(copiedNode?.instanceEditPolicy).toEqual(originalNode?.instanceEditPolicy);
    expect(storedDefinition.previewContent).toEqual({});
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("独立模板发布失败保留草稿，再次显式发布只产生一个版本", async ({ page }) => {
    const { forbiddenPageWrites, dynamic } = await openWorkspaceShell(page, {
      draft: makeTemplateWorkspaceLayerDraft(),
      publishFailures: 1,
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    await fillTemplateName(page, "幂等发布重试模板");
    await addTemplateStructureNode(page, "标题槽位 内容槽位");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await expect(page.locator(".ant-message-error")).toBeVisible();
    const failedPublishStatus = page.getByRole("status", {
      name: "模板状态：发布失败，草稿仍在，可以重试",
    });
    await expect(failedPublishStatus).toHaveAttribute("data-mode", "error");
    await expect(failedPublishStatus).toContainText("发布失败");
    await expect(failedPublishStatus).toContainText("草稿仍在 · 可重试");
    expect(dynamic.versionsByTemplateId.get(dynamic.records[0].templateId)).toHaveLength(0);

    const retryPublish = page.getByRole("button", { name: "重试发布模板新版本（当前草稿仍保留）" });
    await expect(retryPublish).toBeEnabled();
    await expect(retryPublish).toHaveAttribute("title", /失败不会丢失模板草稿/);
    await retryPublish.click();
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();
    const publishedStatus = page.getByRole("status", {
      name: "模板状态：已发布，线上版本与模板草稿一致",
    });
    await expect(publishedStatus).toContainText("已发布");
    await expect(publishedStatus).toContainText("线上版本与模板草稿一致");
    await expect(publishedStatus).toContainText("已有页面保持原版本");
    expect(dynamic.versionsByTemplateId.get(dynamic.records[0].templateId)).toHaveLength(1);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("复杂节点在模板设计中只保留布局样式，不暴露页面内容与业务功能", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites, dynamic } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    await addPanel.getByText("高级内容", { exact: true }).click();
    await addPanel.getByRole("button", { name: "轮播组件 内容槽位" }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await openTemplateInspectorPanel(page, "布局");
    const complexFields = inspector.locator('[data-complex-content-type="carousel"]');
    await expect(complexFields).toHaveAttribute("data-complex-content-scope", "template");
    await expect(complexFields).toContainText("这里只定义组件的布局与样式");
    await expect(complexFields).not.toContainText("图片素材");
    await expect(complexFields).not.toContainText("模板专属功能");
    await expect(complexFields.getByRole("group", { name: "切换间隔" })).toHaveCount(0);
    await expect(complexFields.getByRole("switch", { name: "自动播放" })).toHaveCount(0);

    const { panel: businessAddPanel } = await openTemplateStructureAddPanel(page);
    await businessAddPanel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    await businessAddPanel.getByRole("button", { name: "商品集合组件 内容槽位" }).click();
    const businessFields = inspector.locator('[data-complex-content-type="productCollection"]');
    await expect(businessFields).toHaveAttribute("data-complex-content-scope", "template");
    await expect(businessFields.getByText("选择商品", { exact: true })).toHaveCount(0);
    await expect(businessFields.getByRole("textbox", { name: "标题" })).toHaveCount(0);
    await expect(businessFields).toContainText("这里只定义组件的布局与样式");
    await businessFields.getByRole("group", { name: "电脑端列数" })
      .getByRole("button", { name: "2 列" })
      .click();

    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    expect(dynamic.writes).toHaveLength(1);
    const storedDefinition = dynamic.writes[0].body.definition as {
      nodes: Record<string, {
        type: string;
        slotId?: string;
        props: { contentTemplateDesignProps?: Record<string, string | number | boolean> };
      }>;
      defaultContent: Record<string, unknown>;
      previewContent: Record<string, unknown>;
    };
    const carouselNode = Object.values(storedDefinition.nodes).find((node) => node.type === "Carousel");
    const productCollectionNode = Object.values(storedDefinition.nodes).find((node) => node.type === "ProductCollection");
    expect(carouselNode?.slotId).toBeTruthy();
    expect(productCollectionNode?.slotId).toBeTruthy();
    expect(storedDefinition.previewContent).toEqual({});
    expect(productCollectionNode?.props.contentTemplateDesignProps).toMatchObject({ layout: "grid-2" });
    expect(storedDefinition.defaultContent).toEqual({});
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("Z4-01 R1 保存结果更换身份时无须 asCopy 标记且迟到结果不覆盖新会话", async ({ page }) => {
    await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
    await openTemplateFromCatalog(page, "首屏");
    const results = await page.evaluate(async () => {
      const path = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ path);
      const original = structuredClone(store.getState().draft);
      const results = [];
      for (const mode of ["same-identity", "new-identity", "newer-changes", "stale-session"]) {
        store.getState().open(original);
        store.getState().setName("待保存的一步修改");
        store.getState().setName("待重做的修改");
        store.getState().undo();
        const state = store.getState();
        const requestedDraft = structuredClone(state.draft);
        const savedDraft = structuredClone(requestedDraft);
        if (mode !== "same-identity") {
          savedDraft.definition.templateId = "tpl_r1_new_identity";
          savedDraft.localDraftId = savedDraft.definition.templateId;
        }
        if (mode === "newer-changes") store.getState().setName("较新的本地修改");
        if (mode === "stale-session") store.getState().open(savedDraft);
        const before = store.getState();
        const result = store.getState().reconcileSaveResult({
          sessionId: state.sessionId,
          requestedDraft,
          savedDraft,
        });
        const after = store.getState();
        results.push({
          mode, result,
          templateId: after.draft.definition.templateId,
          localDraftId: after.draft.localDraftId,
          past: after.historyPast.length,
          future: after.historyFuture.length,
          preserved: JSON.stringify({ draft: before.draft, baseline: before.baseline, past: before.historyPast, future: before.historyFuture, dirty: before.dirty, sessionId: before.sessionId })
            === JSON.stringify({ draft: after.draft, baseline: after.baseline, past: after.historyPast, future: after.historyFuture, dirty: after.dirty, sessionId: after.sessionId }),
        });
      }
      return results;
    });
    expect(results[0]).toMatchObject({ mode: "same-identity", result: "saved", past: 1, future: 1 });
    expect(results[1]).toMatchObject({ mode: "new-identity", result: "saved", templateId: "tpl_r1_new_identity", localDraftId: "tpl_r1_new_identity", past: 0, future: 0 });
    expect(results[2]).toMatchObject({ mode: "newer-changes", result: "newer-changes", preserved: true });
    expect(results[3]).toMatchObject({ mode: "stale-session", result: "stale-session", preserved: true });
  });

  for (const recovery of [false, true]) {
    for (const newerChanges of [false, true]) {
      test(`Z4-01 R1 ${recovery ? "修复" : "普通"}另存${newerChanges ? "期间的新修改留在来源会话" : "后历史与再次保存只属于副本"}`, async ({ page }) => {
        let holdCopyResponse = false;
        let releaseCopyResponse = () => {};
        const copyResponseGate = new Promise<void>((resolve) => { releaseCopyResponse = resolve; });
        const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
          role: "SUPER_ADMIN",
          beforeCreateResponse: async () => {
            if (holdCopyResponse) await copyResponseGate;
          },
        });
        const readSession = () => page.evaluate(async () => {
          const path = "/src/page-builder/template-editor/templateEditorSession.ts";
          const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ path);
          const { sessionId, draft, baseline, historyPast, historyFuture, dirty } = store.getState();
          return { sessionId, draft, baseline, historyPast, historyFuture, dirty };
        });
        await openTemplateFromCatalog(page, "首屏");
        await page.getByRole("button", { name: "保存模板", exact: true }).click();
        await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
        const source = dynamic.records[0];
        const sourceId = source.templateId;
        if (recovery) {
          const outdated = createBlankDynamicTemplateDefinition(source.name);
          outdated.templateId = sourceId;
          outdated.metadata = structuredClone(source.draft.definition.metadata);
          source.draft.definition = outdated;
          await page.reload();
          await page.getByRole("button", { name: "模板设计", exact: true }).click();
          await expect(page.getByRole("alert", { name: "修复方案尚未保存" })).toBeVisible();
        }
        const originalDefinition = structuredClone(source.draft.definition);
        await fillTemplateName(page, "另存前修改一");
        await fillTemplateName(page, "另存前修改二");
        await page.getByRole("button", { name: "撤销", exact: true }).click();
        const requested = await readSession();
        expect(requested.historyPast.length).toBeGreaterThan(0);
        expect(requested.historyFuture.length).toBeGreaterThan(0);
        const attemptsBeforeCopy = dynamic.writeAttempts.length;
        holdCopyResponse = newerChanges;
        await openTemplateMoreMenu(page);
        await page.getByRole("menuitem", { name: "另存为模板" }).click();
        const dialog = page.getByRole("dialog", { name: "另存为模板" });
        await dialog.getByRole("textbox", { name: "新模板名称" }).fill("R1 身份副本");
        await dialog.getByRole("button", { name: "另存为模板" }).click();
        try {
          await expect.poll(() => dynamic.records.length).toBe(2);
          const copy = dynamic.records[0];
          const copyId = copy.templateId;
          expect(copyId).not.toBe(sourceId);
          if (newerChanges) {
            // 在可控未返回的保存请求中，经产品 Session 模拟后到的本地编辑。
            await page.evaluate(async () => {
              const path = "/src/page-builder/template-editor/templateEditorSession.ts";
              const { useTemplateEditorSession: store } = await import(/* @vite-ignore */ path);
              store.getState().setName("请求后仍留在来源的新修改");
            });
            const newer = await readSession();
            releaseCopyResponse();
            await expect(dialog).toHaveCount(0);
            await expect.poll(readSession).toEqual(newer);
            expect(newer.draft.definition.templateId).toBe(sourceId);
            expect(newer.draft.localDraftId).toBe(sourceId);
            expect(newer.draft.remote.databaseId).toBe(source.id);
            expect(newer.dirty).toBe(true);
            expect(Boolean(newer.draft.compatibilityRecovery)).toBe(recovery);
            expect(copy.draft.definition.name).toBe("R1 身份副本");
            await expect(page.getByText("当前仍在编辑来源模板，新的修改尚未保存", { exact: false })).toBeVisible();
            await page.getByRole("button", { name: "撤销", exact: true }).click();
            expect((await readSession()).draft).toEqual(requested.draft);
            await page.getByRole("button", { name: "重做", exact: true }).click();
            expect((await readSession()).draft).toEqual(newer.draft);
          } else {
            await expect(dialog).toHaveCount(0);
            const saved = await readSession();
            expect(saved.draft.definition.templateId).toBe(copyId);
            expect(saved.draft.localDraftId).toBe(copyId);
            expect(saved.draft.remote.databaseId).toBe(copy.id);
            expect(saved.draft.compatibilityRecovery).toBeUndefined();
            expect(saved.baseline).toEqual(saved.draft);
            expect(saved.historyPast).toEqual([]);
            expect(saved.historyFuture).toEqual([]);
            await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
            await expect(page.getByRole("button", { name: "重做", exact: true })).toBeDisabled();
            await fillTemplateName(page, "副本内的新修改");
            await page.getByRole("button", { name: "撤销", exact: true }).click();
            const undone = await readSession();
            expect(undone.draft).toEqual(saved.draft);
            expect(undone.dirty).toBe(false);
            await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
            await page.getByRole("button", { name: "重做", exact: true }).click();
            const redone = await readSession();
            expect(redone.draft.definition.templateId).toBe(copyId);
            expect(redone.draft.definition.name).toBe("副本内的新修改");
            for (const snapshot of [...redone.historyPast, ...redone.historyFuture]) {
              expect(snapshot.definition.templateId).toBe(copyId);
              expect(snapshot.localDraftId).toBe(copyId);
              expect(snapshot.remote.databaseId).toBe(copy.id);
              expect(snapshot.compatibilityRecovery).toBeUndefined();
            }
            await page.getByRole("button", { name: "保存模板", exact: true }).click();
            await expect.poll(() => copy.draft.definition.name).toBe("副本内的新修改");
            expect(dynamic.writes.at(-1)).toMatchObject({
              method: "PATCH",
              pathname: `/api/page-modules/dynamic-templates/${copyId}/draft`,
              body: { definition: { templateId: copyId } },
            });
          }
          expect(dynamic.writeAttempts.slice(attemptsBeforeCopy).filter(
            (attempt) => attempt.pathname.includes(`/${sourceId}/`),
          )).toEqual([]);
          expect(source.draft.definition).toEqual(originalDefinition);
          expect(forbiddenPageWrites).toEqual([]);
        } finally {
          releaseCopyResponse();
        }
      });
    }
  }

  test("同一母模板可选择覆盖或另存，另存创建新身份且不改写来源模板", async ({ page }) => {
    const { forbiddenPageWrites, dynamic } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await openTemplateFromCatalog(page, "首屏");
    await expect(page.getByRole("complementary", { name: "模板结构" })).toBeVisible();
    await expect(page.getByText(/转换为新版|固定模板|动态模板/)).toHaveCount(0);
    await page.getByRole("button", { name: "更多模板操作", exact: true }).click();
    await page.getByRole("menuitem", { name: "另存为模板" }).click();
    const saveDialog = page.getByRole("dialog", { name: "另存为模板" });
    await saveDialog.getByRole("textbox", { name: "新模板名称" }).fill("首屏特别版");
    await saveDialog.getByRole("button", { name: "另存为模板" }).click();
    await expect(page.getByText("“首屏特别版”副本已保存为新的账号模板")).toBeVisible();
    expect(dynamic.writes).toHaveLength(1);
    expect(dynamic.writes[0]).toMatchObject({ method: "POST", pathname: "/api/page-modules/dynamic-templates" });
    expect(dynamic.writes[0].body.sourceReference).toMatch(/^tpl_/);
    expect(dynamic.writes[0].body.definition.templateId).toMatch(/^tpl_/);
    expect(dynamic.writes[0].body.definition.name).toBe("首屏特别版");
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("双图文页面点击只保持模板级完整属性面板", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const entry = CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.find((item) =>
      item.templateKey === "doublePoster",
    );
    if (!entry) throw new Error("缺少 doublePoster 属性面板验收矩阵");
    const draft = makeDoublePosterDraft();
    draft.puckData.content[0].props.targetType = "page";
    draft.puckData.content[0].props.linkUrl = "/products";
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, draft, forbiddenWrites);
    await page.goto("/admin/editor/products");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const inspector = page.getByRole("region", { name: "属性面板" });
    await expectContinuousContentInspector({ inspector, entry, viewport: "desktop" });
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const root = canvas.locator('[data-content-template-contract="doublePoster"]').first();
    const mainImageField = inspector.locator('[data-inspector-field="mainImage"]');
    const detailImageField = inspector.locator('[data-inspector-field="detailImage"]');
    await page.evaluate(() => {
      const probeWindow = window as Window & { __inspectorFileInputClicks?: number };
      probeWindow.__inspectorFileInputClicks = 0;
      document.addEventListener("click", (event) => {
        if (event.target instanceof HTMLInputElement && event.target.type === "file") {
          probeWindow.__inspectorFileInputClicks = (probeWindow.__inspectorFileInputClicks ?? 0) + 1;
        }
      }, true);
    });

    await canvas.locator('[data-puck-component="template-editor-double-poster-copy"]')
      .click();
    await expect(inspector.locator(".is-visual-selected")).toHaveCount(0);
    await expect(mainImageField.locator("[data-media-field]")).not.toBeFocused();
    await expect(mainImageField.getByText("拖入图片，或点击选择文件")).toHaveCount(0);
    await expect(mainImageField.locator(".homepage-editor__instance-overrides.is-content-media"))
      .toHaveCount(1);
    await expect(inspector.locator(".homepage-editor__instance-overrides.is-content-media"))
      .toHaveCount(2);

    await canvas.locator('[data-puck-component="template-editor-double-poster-copy"]')
      .click();
    await expect(inspector.locator(".is-visual-selected")).toHaveCount(0);
    await expect(detailImageField.locator("[data-media-field]")).not.toBeFocused();
    await expect(detailImageField.getByText("拖入图片，或点击选择文件")).toHaveCount(0);
    await expect(detailImageField.locator(".homepage-editor__instance-overrides.is-content-media"))
      .toHaveCount(1);
    await expect(mainImageField.locator(".homepage-editor__instance-overrides.is-content-media"))
      .toHaveCount(1);
    await expect(mainImageField).toHaveCount(1);
    await page.evaluate(() => new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    }));
    expect(await page.evaluate(() => (
      window as Window & { __inspectorFileInputClicks?: number }
    ).__inspectorFileInputClicks ?? 0)).toBe(0);

    const titleField = inspector.locator('[data-inspector-field="title"]');
    await canvas.locator('[data-puck-component="template-editor-double-poster-copy"]')
      .click();
    await expect(inspector.locator(".is-visual-selected")).toHaveCount(0);
    await titleField.locator("input").fill("连续展开后的双图标题");
    await expect(root.locator('[data-content-role="copy"] h2')).toHaveText("连续展开后的双图标题");

    const actionTextField = inspector.locator('[data-inspector-field="actionText"]');
    await actionTextField.locator("input").fill("查看系列");
    const action = root.locator('[data-content-role="action"]:visible').first();
    await expect(action).toBeVisible();
    await canvas.locator('[data-puck-component="template-editor-double-poster-copy"]')
      .click();
    await expect(inspector.locator(".is-visual-selected")).toHaveCount(0);
    await expectContinuousContentInspector({ inspector, entry, viewport: "desktop" });
    expect(forbiddenWrites).toEqual([]);
  });

  test("成熟母模板结构区显示完整度并受控增删合同内容", async ({ page }) => {
    const { forbiddenPageWrites } = await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
    const contract = getContentTemplateContract("首屏主视觉")!;
    await openTemplateFromCatalog(page, contract.displayName);
    const canvas = page.frameLocator(".template-editor__viewport-frame");
    const contractFrame = canvas.locator('[data-content-template-module="首屏主视觉"]');
    await expect(contractFrame).toHaveClass(/hc-contract-frame--editor/);
    const overlayRoot = page.locator('[data-template-editor-overlay-root="template-definition"]');
    await expect(overlayRoot).toHaveCount(1);
    await expect(overlayRoot.getByRole("button", { name: /选择模板目标.*桌面/ })).toBeVisible();
    await expect(overlayRoot.getByRole("button", { name: "选择模板目标 文案", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "预览模板" }).click();
    await expect(contractFrame).toHaveClass(/hc-contract-frame--public/);
    await expect(page.locator('[data-template-editor-overlay-root="template-definition"]')).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(contractFrame).toHaveClass(/hc-contract-frame--editor/);
    await expect(page.locator('[data-template-editor-overlay-root="template-definition"]')).toHaveCount(1);
    await expect(page.getByText("内容容器", { exact: true })).toHaveCount(0);
    const structure = page.getByRole("complementary", { name: "模板结构" });
    await expect(structure.getByRole("region", { name: "模板结构问题" })).toHaveCount(0);
    const { trigger: addTrigger, panel: addPanel } = await openTemplateStructureAddPanel(page);
    await expect(structure.getByRole("button", { name: "添加区域", exact: true })).toBeVisible();
    await expect(addPanel.getByRole("button", { name: "添加图片槽位", exact: true })).toBeVisible();
    await addTrigger.click();
    const regionItem = structure.getByRole("treeitem", { name: "内容区域", exact: true });
    await expect(regionItem).toHaveAttribute("aria-level", "2");
    const roleGroup = structure.getByRole("group", { name: "内容区域内容槽位" });
    const roleItems = roleGroup.getByRole("treeitem");
    await expect(roleItems).toHaveCount(3);
    expect(await roleItems.evaluateAll((items) => items.map((item) => item.getAttribute("aria-level"))))
      .toEqual(["3", "3", "3"]);
    await expect(roleItems.first()).toHaveAccessibleName(/主视觉图片 图片槽位 必填/);
    await expect(structure.getByRole("button", { name: "主视觉图片移出模板" })).toHaveCount(0);
    await expect(roleGroup.getByRole("button", { name: /选择(?:桌面|移动)端槽位/ })).toHaveCount(0);

    // 结构树只负责选择当前模板对象，不能替用户重新定位整个画布工作区。
    const canvasScroll = page.locator(".template-editor__canvas-scroll");
    const zoomInput = page.locator(".template-editor__body")
      .getByRole("spinbutton", { name: "画布缩放百分比" });
    await zoomInput.fill("100");
    await zoomInput.press("Enter");
    const structureSelectionScroll = await canvasScroll.evaluate(async (element) => {
      const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);
      element.scrollTop = maxTop;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      return { top: element.scrollTop, maxTop };
    });
    expect(structureSelectionScroll.maxTop).toBeGreaterThan(0);
    await roleItems.first().click();
    // 旧行为使用 smooth scrollIntoView；等待已知平滑滚动窗口后再判断最终位置。
    await page.waitForTimeout(500);
    await expect.poll(() => canvasScroll.evaluate((element) => element.scrollTop))
      .toBe(structureSelectionScroll.top);

    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    await expect(roleItems.first()).toHaveAttribute("aria-selected", "true");
    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await expect(inspector.locator(".homepage-editor__inspector-title")).toContainText("主图");
    await expect(inspector.getByRole("region", { name: "模板属性功能区" })).toBeVisible();
    await expect(inspector.getByRole("group", { name: "显示样式" })).toBeVisible();
    await expect(inspector.getByRole("switch", { name: "页面可编辑内容" })).toHaveCount(0);
    const actionItem = roleGroup.getByRole("treeitem", { name: /行动入口 行动入口 可选/ });
    await actionItem.click();
    await expect(actionItem).toHaveAttribute("aria-selected", "true");
    const actionOverlay = page.locator(
      '[data-template-editor-overlay-root="template-definition"] [data-overlay-selection-for$=":action"]',
    );
    await expect(actionOverlay).toBeVisible();
    await structure.getByRole("button", { name: "行动入口移出模板" }).click();
    await expect(actionItem).toContainText("已移出");
    await expect(contractFrame.locator('[data-content-role="action"]:visible')).toHaveCount(0);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(actionItem).toContainText("可选");
    await expect(contractFrame.locator('[data-content-role="action"]:visible').first()).toBeVisible();
    await page.getByRole("button", { name: "重做", exact: true }).click();
    await expect(actionItem).toContainText("已移出");
    await structure.getByRole("button", { name: "行动入口恢复到模板" }).click();
    await expect(actionItem).toContainText("可选");
    await expect(contractFrame.locator('[data-content-role="action"]:visible').first()).toBeVisible();
    await actionItem.click();
    await expect(actionOverlay).toBeVisible();
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("T4-B1 结构命令拒绝不改变草稿事务并提供可恢复反馈", async ({ page }) => {
    const { forbiddenPageWrites } = await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
    const contract = getContentTemplateContract("首屏主视觉")!;
    await openTemplateFromCatalog(page, contract.displayName);

    const structure = page.getByRole("complementary", { name: "模板结构" });
    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    const roleGroup = structure.getByRole("group", { name: /响应式区域内容槽位/ });
    const primaryRole = roleGroup.getByRole("treeitem", { name: /主视觉图片 图片槽位 必填/ });
    const actionRole = roleGroup.getByRole("treeitem", { name: /行动入口 行动入口 可选/ });
    const actionRemove = structure.getByRole("button", { name: "行动入口移出模板" });
    const contractFrame = page.frameLocator(".template-editor__viewport-frame")
      .locator('[data-content-template-module="首屏主视觉"]');
    const readSessionSnapshot = () => page.evaluate(async () => {
      const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession: sessionStore } = await import(/* @vite-ignore */ modulePath);
      const state = sessionStore.getState();
      return {
        definition: JSON.stringify(state.draft?.definition),
        dirty: state.dirty,
        historyPast: state.historyPast.length,
        historyFuture: state.historyFuture.length,
        selectedObjectId: state.selectedObjectId,
        selectedContractRole: state.selectedContractRole,
      };
    });

    // 先锁定合同宿主节点，再保持另一个角色为当前选择，复现“拒绝后仍伪选择并提示成功”。
    await structure.locator(".template-editor__region-select").first().click();
    await openTemplateInspectorPanel(page, "规则");
    const lockSwitch = inspector.getByRole("switch", { name: "锁定位置、尺寸和层级" });
    await lockSwitch.click();
    await expect(lockSwitch).toHaveAttribute("aria-checked", "true");
    await primaryRole.click();
    const beforeLockedRemoval = await readSessionSnapshot();

    await actionRemove.click();

    expect(await readSessionSnapshot()).toEqual(beforeLockedRemoval);
    await expect(actionRole).toContainText("可选");
    await expect(contractFrame.locator('[data-content-role="action"]:visible').first()).toBeVisible();
    await expect(page.getByText("已将“行动入口”移出当前模板", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/已锁定.*解除.*重试/).last()).toBeVisible();

    // 解锁是独立命令；之后用键盘重试，成功只新增一个 history，并更新到目标角色。
    await structure.locator(".template-editor__region-select").first().click();
    await openTemplateInspectorPanel(page, "规则");
    await lockSwitch.click();
    await expect(lockSwitch).toHaveAttribute("aria-checked", "false");
    await primaryRole.click();
    const beforeSuccessfulRemoval = await readSessionSnapshot();
    await actionRemove.focus();
    await page.keyboard.press("Enter");

    const afterSuccessfulRemoval = await readSessionSnapshot();
    expect(afterSuccessfulRemoval.definition).not.toBe(beforeSuccessfulRemoval.definition);
    expect(afterSuccessfulRemoval.historyPast).toBe(beforeSuccessfulRemoval.historyPast + 1);
    expect(afterSuccessfulRemoval.historyFuture).toBe(0);
    expect(afterSuccessfulRemoval.dirty).toBe(true);
    expect(afterSuccessfulRemoval.selectedContractRole).toMatchObject({ roleId: "action" });
    await expect(actionRole).toContainText("已移出");
    await expect(contractFrame.locator('[data-content-role="action"]:visible')).toHaveCount(0);
    await expect(page.getByText("已将“行动入口”移出当前模板", { exact: true })).toBeVisible();

    // 合同必填角色提供可键盘触发的原因与替代动作，不把拒绝伪装成成功。
    const requiredBlockedAction = structure.getByRole("button", { name: "主视觉图片不能移出模板" });
    await primaryRole.click();
    const beforeContractRejection = await readSessionSnapshot();
    await requiredBlockedAction.focus();
    await page.keyboard.press("Enter");
    expect(await readSessionSnapshot()).toEqual(beforeContractRejection);
    await expect(page.getByText(/母模板合同必填内容.*不能移出.*布局或样式/).last()).toBeVisible();
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("复合母模板在设计画布显示合同图片与文字槽位", async ({ page }) => {
    const { forbiddenPageWrites } = await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
    const contract = getContentTemplateContract("改款对比")!;
    await openTemplateFromCatalog(page, contract.displayName);
    const contractFrame = page.frameLocator(".template-editor__viewport-frame")
      .locator('[data-content-template-module="改款对比"]');
    await expect(contractFrame).toHaveClass(/hc-contract-frame--editor/);
    await expect(contractFrame.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });
    await expect(contractFrame.locator('[data-content-role="before"]')).toBeVisible();
    await expect(contractFrame.locator('[data-content-role="copy"]')).toBeVisible();
    const overlayRoot = page.locator('[data-template-editor-overlay-root="template-definition"]');
    await expect(overlayRoot).toHaveCount(1);
    await expect(overlayRoot.getByRole("button", { name: /选择模板目标.*改造前/ })).toBeVisible();
    await expect(overlayRoot.getByRole("button", { name: /选择模板目标.*文案/ })).toBeVisible();
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("模板目录优先渲染可视卡片，滚动后再生成远端预览", async ({ page }) => {
    const { forbiddenPageWrites } = await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    const templateLibrary = page.locator('[data-unified-template-library="design"]');
    const cards = templateLibrary.locator('[data-template-catalog-card="shared"]');
    await expect.poll(() => cards.count()).toBeGreaterThan(10);
    const total = await cards.count();
    await expect.poll(() => templateLibrary.locator("iframe[data-template-catalog-viewport]").count())
      .toBeGreaterThan(0);
    const initiallyMounted = await templateLibrary.locator("iframe[data-template-catalog-viewport]").count();
    expect(initiallyMounted).toBeLessThan(total);

    const lastCard = cards.last();
    await expect(lastCard.locator('[data-preview-status="deferred"]')).toHaveCount(1);
    await lastCard.scrollIntoViewIfNeeded();
    await expect(lastCard.locator("iframe[data-template-catalog-viewport]"))
      .toHaveCount(1);
    await expect(lastCard.locator('[data-preview-status="ready"]')).toHaveCount(1);
    expect(forbiddenPageWrites).toEqual([]);
  });

  for (const previewCase of [
    {
      key: "hero",
      name: "首屏",
      moduleType: "首屏主视觉",
      expectedSlotKinds: ["media", "text"],
      expectedSlotLabels: ["图片", "文字"],
    },
    {
      key: "wearingInspiration",
      name: "佩戴展示",
      moduleType: "佩戴灵感",
      expectedSlotKinds: ["media"],
      expectedSlotLabels: ["图片"],
    },
    {
      key: "video",
      name: "视频",
      moduleType: "视频区块",
      expectedSlotKinds: ["media", "text", "button"],
      expectedSlotLabels: ["视频", "文字", "按钮"],
    },
  ] as const) {
    test(`${previewCase.name}目录缩略图与设计画布共享中性示例内容和双端构图`, async ({ page }, testInfo) => {
      const { forbiddenPageWrites } = await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
      await page.getByRole("button", { name: "模板设计", exact: true }).click();
      const templateLibrary = page.locator('[data-unified-template-library="design"]');
      const card = templateLibrary.locator(
        `[data-template-catalog-card="shared"][data-template-identity="source:legacy_system_${previewCase.key}"]`,
      );
      const control = card.locator(".homepage-editor__template-card-main");
      await expect(card).toHaveCount(1);
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator('iframe[data-template-catalog-viewport="desktop"]')).toHaveCount(1);
      const catalogPreview = card.locator("[data-template-catalog-preview-shell]");
      await expect(catalogPreview).toHaveAttribute("data-preview-status", "ready");
      await expect(card.locator("[data-template-catalog-dimension]")).toHaveCount(0);
      await expect(card.locator(
        ".homepage-editor__template-slot-summary, .homepage-editor__template-description, .homepage-editor__template-add",
      )).toHaveCount(0);
      await expect(card.locator(".homepage-editor__template-name")).toHaveText(previewCase.name);
      const catalogSlotOverlay = card.locator('[data-template-editor-overlay-root="catalog"]');
      await expect(catalogSlotOverlay).toHaveCSS("pointer-events", "none");
      const selectedBeforeHover = await control.getAttribute("aria-pressed") === "true";
      await expect(catalogSlotOverlay).toHaveCSS(
        "visibility",
        selectedBeforeHover ? "visible" : "hidden",
      );
      if (!selectedBeforeHover) {
        await card.hover();
        await expect(catalogSlotOverlay).toHaveCSS("visibility", "visible");
      }
      await expect(card.locator(".template-editor__editable-overlay-box").first()).toBeVisible();
      const catalogSlotKinds = await card.locator(".template-editor__editable-overlay-box")
        .evaluateAll((slots) => [...new Set(slots.map((slot) => slot.getAttribute("data-editable-target-kind")))]);
      const catalogSlotLabels = await card.locator(".template-editor__editable-overlay-label")
        .evaluateAll((labels) => [...new Set(labels.map((label) => label.textContent?.trim()))]);
      expect(catalogSlotKinds).toEqual(expect.arrayContaining(previewCase.expectedSlotKinds));
      expect(catalogSlotLabels).toEqual(expect.arrayContaining(previewCase.expectedSlotLabels));
      const catalogSlotLabel = card.locator(".template-editor__editable-overlay-label").first();
      if (await catalogSlotLabel.count()) await expect(catalogSlotLabel).toHaveCSS("font-size", "12px");
      const readOverlappingLabels = () => card.locator(".template-editor__editable-overlay-label")
        .evaluateAll((labels) => labels.flatMap((label, index) => {
          const bounds = label.getBoundingClientRect();
          return labels.slice(index + 1).flatMap((candidate) => {
            const candidateBounds = candidate.getBoundingClientRect();
            const overlaps = bounds.left < candidateBounds.right
              && bounds.right > candidateBounds.left
              && bounds.top < candidateBounds.bottom
              && bounds.bottom > candidateBounds.top;
            return overlaps
              ? [`${label.textContent?.trim()} / ${candidate.textContent?.trim()}`]
              : [];
          });
        }));
      const overlappingLabels = await readOverlappingLabels();
      expect(overlappingLabels, `${previewCase.key} 目录槽位标签不得互相遮挡`).toEqual([]);
      if (previewCase.key === "hero") {
        await expect(card.locator('[data-preview-status="ready"]')).toHaveCount(1);
        const more = card.getByRole("button", { name: /更多模板操作/ });
        await page.mouse.move(1, 1);
        await expect(more).toHaveCSS("opacity", "0");
        await expect(more).toHaveCSS("pointer-events", "auto");
        await card.hover();
        await expect(more).toHaveCSS("pointer-events", "auto");
        await more.focus();
        await expect(more).not.toHaveCSS("opacity", "0");
      }
      const catalogFrame = card.frameLocator("iframe[data-template-catalog-viewport]");
      const catalogRoot = catalogFrame.locator("[data-dynamic-template-id]");
      const desktopCatalogSignature = await readDynamicTemplateRenderSignature(catalogRoot);
      await expect(catalogFrame.locator('[data-content-template-renderer="real"]')).toHaveCount(1);
      const catalogContractFrame = catalogFrame.locator(
        `[data-content-template-module="${previewCase.moduleType}"]`,
      );
      await expect(catalogContractFrame).toBeVisible();
      await expect(catalogFrame.locator([
        ".hc-contract-frame--editor",
        "[data-hc-editor-overlay]",
        "[data-hc-node-hud]",
        "[data-hc-keyboard-node]",
        "[data-visual-editor-mode]",
      ].join(","))).toHaveCount(0);
      const catalogImageSources = await catalogFrame.locator("body").evaluate((body) => {
        const urls: string[] = [];
        for (const node of body.querySelectorAll<HTMLElement>("*")) {
          if (node instanceof HTMLImageElement && node.currentSrc) urls.push(node.currentSrc);
          const background = getComputedStyle(node).backgroundImage;
          for (const match of background.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
            if (match[1]) urls.push(match[1]);
          }
        }
        return urls;
      });
      expect(catalogImageSources.length).toBeGreaterThan(0);
      expect(catalogImageSources.some((source) => source.startsWith("data:image/svg+xml"))).toBe(true);
      expect(catalogImageSources.some((source) =>
        /\.(?:avif|jpe?g|png|webp)(?:[?#]|$)/i.test(source),
      )).toBe(false);

      if (await control.getAttribute("aria-pressed") !== "true") await control.click();
      await page.mouse.move(1, 1);
      await expect(catalogSlotOverlay).toHaveCSS("visibility", "visible");
      const canvasFrame = page.frameLocator(".template-editor__viewport-frame");
      const canvasRoot = canvasFrame.locator("[data-dynamic-template-id]");
      const desktopCanvasSignature = await readDynamicTemplateRenderSignature(canvasRoot);
      expectDynamicTemplateRenderSignaturesEqual(
        desktopCanvasSignature,
        desktopCatalogSignature,
        `${previewCase.key}.desktop`,
        { templateStructureOnly: true },
      );

      const contractFrame = canvasFrame.locator(`[data-content-template-module="${previewCase.moduleType}"]`);
      await expect(contractFrame).toHaveClass(/hc-contract-frame--editor/);
      await expect(contractFrame.locator("[data-hc-template-slot-box], [data-hc-editor-overlay]"))
        .toHaveCount(0);
      const sharedOverlay = page.locator('[data-template-editor-overlay-root="template-definition"]');
      await expect(sharedOverlay).toHaveCount(1);
      await expect(sharedOverlay.locator(".template-editor__editable-overlay-box").first())
        .toBeVisible();
      if (previewCase.key === "hero") {
        const copy = contractFrame.locator('[data-content-role="copy"]');
        await expect(catalogContractFrame.locator('[data-content-role="copy"]')).toContainText("光，沿线而生");
        await expect(copy).toContainText("光，沿线而生");
        await expect(copy).not.toHaveCSS("color", "rgba(0, 0, 0, 0)");
        await expect(contractFrame.locator('[data-content-role-desktop="desktopImage"]'))
          .toHaveCSS("opacity", "1");
      } else if (previewCase.key === "wearingInspiration") {
        await expect(catalogContractFrame.locator(".hc-lookbook__product-link")).toHaveCount(2);
        await expect(contractFrame.locator('[data-content-role="relatedProducts"]')).toBeVisible();
        await expect(contractFrame.locator(".hc-lookbook__product-link")).toHaveCount(2);
        await expect(contractFrame.locator('[data-content-role="wearingImage"]')).toHaveCSS("opacity", "1");
      } else {
        await expect(catalogContractFrame.locator('[data-editor-field="posterUrl"]'))
          .toHaveAttribute("src", /^data:image\/svg\+xml/i);
        await expect(contractFrame.locator('[data-editor-field="posterUrl"]'))
          .toHaveAttribute("src", /^data:image\/svg\+xml/i);
        await expect(contractFrame.locator('[data-content-role="copy"]'))
          .toContainText("一根金属线的旅程");
        await expect(catalogContractFrame.locator('a[data-content-role="action"]')).toHaveCount(1);
        await expect(catalogContractFrame.locator('span[data-content-role="action"]')).toHaveCount(0);
        await expect(contractFrame.locator('span[data-content-role="action"]')).toHaveCount(1);
      }
      await page.screenshot({
        path: testInfo.outputPath(`${previewCase.key}-catalog-canvas-desktop.png`),
        animations: "disabled",
      });

      await page.getByRole("button", { name: /移动端模板布局/ }).click();
      await expect(card.locator('iframe[data-template-catalog-viewport="mobile"]')).toHaveCount(1);
      await expect(catalogPreview).toHaveAttribute("data-preview-status", "ready");
      await expect(card.locator("[data-template-catalog-dimension]")).toHaveCount(0);
      await expect(card.locator("[data-preview-viewport]"))
        .toHaveAttribute("data-preview-viewport", "mobile");
      await expect(canvasRoot).toHaveAttribute("data-dynamic-template-device", "mobile");
      const mobileCatalogSignature = await readDynamicTemplateRenderSignature(catalogRoot);
      const mobileCanvasSignature = await readDynamicTemplateRenderSignature(canvasRoot);
      expectDynamicTemplateRenderSignaturesEqual(
        mobileCanvasSignature,
        mobileCatalogSignature,
        `${previewCase.key}.mobile`,
        { templateStructureOnly: true },
      );
      await page.screenshot({
        path: testInfo.outputPath(`${previewCase.key}-catalog-canvas-mobile.png`),
        animations: "disabled",
      });
      expect(forbiddenPageWrites).toEqual([]);
    });
  }

  test(`${templateEditorAcceptanceCount} 个活跃母模板目录保留 public 语义并与设计画布共享双端结构几何`, async ({ page }, testInfo) => {
    testInfo.setTimeout(180_000);
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    const { forbiddenPageWrites } = await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    const templateLibrary = page.locator('[data-unified-template-library="design"]');

    for (const viewport of ["desktop", "mobile"] as const) {
      await page.getByRole("button", {
        name: viewport === "desktop" ? /桌面端模板布局/ : /移动端模板布局/,
      }).click();
      for (const entry of CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX) {
        const card = templateLibrary.locator(
          `[data-template-catalog-card="shared"][data-template-identity="source:legacy_system_${entry.templateKey}"]`,
        );
        await expect(card, `${entry.templateKey} 应只有一张设计目录卡`).toHaveCount(1);
        await card.scrollIntoViewIfNeeded();
        await expect(card.locator(`iframe[data-template-catalog-viewport="${viewport}"]`))
          .toHaveCount(1);
        const catalogFrame = card.frameLocator(
          `iframe[data-template-catalog-viewport="${viewport}"]`,
        );
        const catalogRoot = catalogFrame.locator("[data-dynamic-template-id]");
        await expect(catalogFrame.locator('[data-content-template-renderer="real"]')).toHaveCount(1);
        await expect(catalogFrame.locator([
          ".hc-contract-frame--editor",
          "[data-hc-editor-overlay]",
          "[data-hc-node-hud]",
          "[data-hc-keyboard-node]",
          "[data-visual-editor-mode]",
        ].join(","))).toHaveCount(0);
        const catalogImageSources = await catalogFrame.locator("img").evaluateAll((images) =>
          images.map((image) => image.getAttribute("src") ?? ""),
        );
        expect(
          catalogImageSources.every((source) =>
            !/\.(?:avif|jpe?g|png|webp)(?:[?#]|$)/i.test(source),
          ),
          `${entry.templateKey}.${viewport} 模板预览不得加载真实摄影栅格图：${JSON.stringify(catalogImageSources)}`,
        ).toBe(true);
        const catalogTemplateId = await catalogRoot.getAttribute("data-dynamic-template-id");
        const control = card.locator(".homepage-editor__template-card-main");
        if (await control.getAttribute("aria-pressed") !== "true") await control.click();
        const canvasRoot = page.frameLocator(".template-editor__viewport-frame")
          .locator("[data-dynamic-template-id]");
        await expect(canvasRoot).toHaveAttribute("data-dynamic-template-device", viewport);
        if (!catalogTemplateId) throw new Error(`${entry.templateKey} 目录缺少稳定模板身份`);
        await expect(canvasRoot).toHaveAttribute("data-dynamic-template-id", catalogTemplateId);
        const [catalogSignature, canvasSignature] = await Promise.all([
          readDynamicTemplateRenderSignature(catalogRoot),
          readDynamicTemplateRenderSignature(canvasRoot),
        ]);
        expectDynamicTemplateRenderSignaturesEqual(
          canvasSignature,
          catalogSignature,
          `${entry.templateKey}.${viewport}`,
          { templateStructureOnly: true },
        );
      }
    }
    expect(runtimeErrors).toEqual([]);
    expect(forbiddenPageWrites).toEqual([]);
  });

  for (const entry of CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX) {
    const contract = getContentTemplateContract(entry.moduleType)!;
    test(`${templateEditorAcceptanceCount} 活跃母模板统一闭环：${contract.displayName}编辑、覆盖保存与双端预览`, async ({ page }, testInfo) => {
      testInfo.setTimeout(90_000);
      const { forbiddenPageWrites, dynamic } = await openWorkspaceShell(page, {
        role: "SUPER_ADMIN",
      });
      await openTemplateFromCatalog(page, contract.displayName);

      const frameElement = page.locator(".template-editor__viewport-frame");
      const frame = page.frameLocator(".template-editor__viewport-frame");
      for (const viewport of ["desktop", "mobile"] as const) {
        await page.getByRole("button", {
          name: viewport === "desktop" ? /桌面端模板布局/ : /移动端模板布局/,
        }).click();
        await page.getByRole("button", { name: "预览模板" }).click();
        await expect(page.getByRole("button", { name: "退出模板预览" })).toBeVisible();
        await expect(frame.locator("body")).toBeVisible();
        await expect.poll(() => frame.locator("html").evaluate((html) => ({
          clientWidth: html.clientWidth,
          scrollWidth: html.scrollWidth,
          scrollHeight: html.scrollHeight,
        }))).toMatchObject({
          clientWidth: RESPONSIVE_CANVAS[viewport].width,
          scrollWidth: RESPONSIVE_CANVAS[viewport].width,
        });
        await expect.poll(() => frame.locator("html").evaluate((html) => html.scrollHeight))
          .toBeGreaterThan(20);
        const previewMediaUrls = await frame.locator("body").evaluate((body) => {
          const urls: string[] = [];
          for (const node of body.querySelectorAll<HTMLElement>("*")) {
            if (node instanceof HTMLImageElement && node.currentSrc) urls.push(node.currentSrc);
            const background = getComputedStyle(node).backgroundImage;
            for (const match of background.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
              if (match[1]) urls.push(match[1]);
            }
          }
          return urls;
        });
        expect(
          previewMediaUrls.every((url) =>
            !/\.(?:avif|jpe?g|png|webp)(?:[?#]|$)/i.test(url),
          ),
          `${contract.displayName} ${viewport} 模板预览不得加载真实摄影栅格图`,
        ).toBe(true);
        await frameElement.screenshot({
          path: testInfo.outputPath(`${entry.templateKey}-${viewport}.png`),
          animations: "disabled",
        });
        await page.getByRole("button", { name: "退出模板预览" }).click();
      }

      const qaName = `${contract.displayName}｜${templateEditorAcceptanceCount}模板QA`;
      await fillTemplateName(page, qaName);
      await expect(templateNameInput(page)).toHaveValue(qaName);
      await page.getByRole("button", { name: "保存模板", exact: true }).click();
      await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

      expect(dynamic.writes).toHaveLength(1);
      expect(dynamic.writes[0]).toMatchObject({
        method: "POST",
        pathname: "/api/page-modules/dynamic-templates",
      });
      expect(dynamic.writes[0].body).toMatchObject({
        sourceReference: `legacy_system_${entry.templateKey}`,
      });
      expect(dynamic.writes[0].body.definition).toMatchObject({ name: qaName });
      expect(dynamic.writes[0].body.definition.templateId).toMatch(/^tpl_/);
      expect(forbiddenPageWrites).toEqual([]);
    });
  }

  for (const matrixPageGroup of ALL_TEMPLATE_EDITOR_PAGE_GROUPS) {
    test(`页面内容模式保存闭环：${matrixPageGroup.pageKey} 页逐一编辑适用模板并双端预览`, async ({ page }, testInfo) => {
      testInfo.setTimeout(180_000);
      const forbiddenWrites: string[] = [];
      let saved = makeAllTemplateEditorDraft(matrixPageGroup.entries, matrixPageGroup.pageKey);
      await page.setViewportSize({ width: 1600, height: 1000 });
      await authenticateAdmin(page);
      await mockEditorApis(page, saved, forbiddenWrites);
      await page.route(/\/api\/page-modules\/document\/admin(?:\?.*)?$/, (route) =>
        route.fulfill(json(saved)),
      );
      await page.route(/\/api\/page-modules\/document(?:\?.*)?$/, async (route) => {
        if (route.request().method() !== "PUT") return route.fallback();
        const body = route.request().postDataJSON() as Record<string, any>;
        saved = {
          ...saved,
          puckData: structuredClone(body.puckData),
          metadata: structuredClone(body.metadata),
          updatedAt: "2026-08-30T06:00:00.000Z",
        };
        return route.fulfill(json(saved));
      });

      await page.goto(`/admin/editor/${matrixPageGroup.pageKey}`);
      await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
      const inspector = page.getByRole("region", { name: "属性面板" });
      const edited: Array<{
        entry: typeof matrixPageGroup.entries[number];
        roleId: string;
        fieldKey: string;
        kind: "text" | "switch" | "visibility";
        value: string | boolean;
      }> = [];

      for (const [index, entry] of matrixPageGroup.entries.entries()) {
        const sourceBlock = saved.puckData.content.find((candidate: Record<string, any>) =>
          candidate.props?.id === `all-template-editor-${entry.templateKey}`,
        );
        expect(sourceBlock, `${entry.templateKey} 缺少页面实例夹具`).toBeTruthy();
        await page
          .locator(`.homepage-editor__layer-item[data-layer-id="all-template-editor-${entry.templateKey}"]`)
          .locator(".homepage-editor__layer-select")
          .click();
        await expect(inspector).toHaveAttribute("data-module-type", entry.moduleType);
        await expectContinuousContentInspector({
          inspector,
          entry,
          viewport: "desktop",
        });

        let selected: {
          roleId: string;
          fieldKey: string;
          kind: "text" | "switch" | "visibility";
          control: Locator;
        } | undefined;
        for (const object of entry.objects) {
          for (const fieldKey of object.contentFieldKeys) {
            if (typeof sourceBlock!.props?.[fieldKey] !== "string") continue;
            const control = inspector
              .locator(`[data-inspector-field="${fieldKey}"]`)
              .locator(
                'input[type="text"]:not([readonly]):not([disabled]):visible, '
                + 'input[type="url"]:not([readonly]):not([disabled]):visible, '
                + 'input:not([type]):not([readonly]):not([disabled]):visible, '
                + 'textarea:not([readonly]):not([disabled]):visible',
              )
              .first();
            if (await control.count()) {
              selected = { roleId: object.roleId, fieldKey, kind: "text", control };
              break;
            }
          }
          if (!selected) {
            for (const fieldKey of object.contentFieldKeys) {
              if (typeof sourceBlock!.props?.[fieldKey] !== "boolean") continue;
              const control = inspector.locator(
                `[data-inspector-field="${fieldKey}"] [role="switch"]:not([aria-disabled="true"]):visible`,
              ).first();
              if (await control.count()) {
                selected = { roleId: object.roleId, fieldKey, kind: "switch", control };
                break;
              }
            }
          }
          if (selected) break;
        }
        if (!selected) {
          const visibility = page
            .locator(`.homepage-editor__layer-item[data-layer-id="all-template-editor-${entry.templateKey}"]`)
            .getByRole("button", {
              name: `隐藏${getContentTemplateContract(entry.moduleType)!.displayName}`,
            });
          if (await visibility.count()) {
            selected = {
              roleId: "",
              fieldKey: "isVisible",
              kind: "visibility",
              control: visibility,
            };
          }
        }
        expect(selected, `${entry.templateKey} 没有可编辑内容字段或实例显隐入口`).toBeTruthy();
        const value = selected!.kind === "text"
          ? `验收${index + 1}`
          : selected!.kind === "switch"
            ? (await selected!.control.getAttribute("aria-checked")) !== "true"
            : false;
        if (selected!.kind === "text") {
          await selected!.control.fill(String(value));
          await expect(selected!.control).toHaveValue(String(value));
        } else if (selected!.kind === "switch") {
          await selected!.control.click();
          await expect(selected!.control).toHaveAttribute("aria-checked", String(value));
        } else {
          await selected!.control.click();
          await expect(page
            .locator(`.homepage-editor__layer-item[data-layer-id="all-template-editor-${entry.templateKey}"]`))
            .toHaveAttribute("data-layer-visible", "false");
        }
        edited.push({
          entry,
          roleId: selected!.roleId,
          fieldKey: selected!.fieldKey,
          kind: selected!.kind,
          value,
        });
      }

    await page.getByRole("button", { name: /移动端.*布局/ }).click();
      for (const entry of matrixPageGroup.entries) {
        const sourceBlock = saved.puckData.content.find((candidate: Record<string, any>) =>
          candidate.props?.id === `all-template-editor-${entry.templateKey}`,
        );
        expect(sourceBlock, `${entry.templateKey} 缺少移动端页面实例夹具`).toBeTruthy();
        await page
          .locator(`.homepage-editor__layer-item[data-layer-id="all-template-editor-${entry.templateKey}"]`)
          .locator(".homepage-editor__layer-select")
          .click();
        await expect(inspector).toHaveAttribute("data-module-type", entry.moduleType);
        await expectContinuousContentInspector({
          inspector,
          entry,
          viewport: "mobile",
        });
      }
      await page.getByRole("button", { name: /桌面端.*布局/ }).click();

      await page.getByRole("button", { name: "保存当前装修草稿" }).click();
      await expect(page.locator("span", { hasText: /^页面草稿已保存$/ }).last()).toBeVisible();
      expect(forbiddenWrites).toEqual([]);
      for (const item of edited) {
        const block = saved.puckData.content.find((candidate: Record<string, any>) =>
          candidate.props?.id === `all-template-editor-${item.entry.templateKey}`,
        );
        expect(block?.props?.[item.fieldKey], `${item.entry.templateKey}.${item.fieldKey} 未进入保存负载`)
          .toBe(item.value);
      }

      await page.reload();
      await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
      const restoredVisibilityItems: typeof edited = [];
      for (const item of edited) {
        const layer = page
          .locator(`.homepage-editor__layer-item[data-layer-id="all-template-editor-${item.entry.templateKey}"]`)
        await layer.locator(".homepage-editor__layer-select").click();
        if (item.kind === "visibility") {
          await expect(layer, `${item.entry.templateKey}.isVisible 刷新后未回显`)
            .toHaveAttribute("data-layer-visible", "false");
          const displayName = getContentTemplateContract(item.entry.moduleType)!.displayName;
          await layer.getByRole("button", { name: `显示${displayName}` }).click();
          await expect(layer).toHaveAttribute("data-layer-visible", "true");
          item.value = true;
          restoredVisibilityItems.push(item);
          continue;
        }
        const replayed = item.kind === "text"
          ? inspector
            .locator(`[data-inspector-field="${item.fieldKey}"]`)
            .locator(
              'input[type="text"]:visible, '
              + 'input[type="url"]:visible, '
              + 'input:not([type]):visible, '
              + 'textarea:visible',
            )
            .first()
          : inspector.locator(
            `[data-inspector-field="${item.fieldKey}"] [role="switch"]:visible`,
          ).first();
        if (item.kind === "text") {
          await expect(replayed, `${item.entry.templateKey}.${item.fieldKey} 刷新后未回显`)
            .toHaveValue(String(item.value));
        } else {
          await expect(replayed, `${item.entry.templateKey}.${item.fieldKey} 刷新后未回显`)
            .toHaveAttribute("aria-checked", String(item.value));
        }
      }

      if (restoredVisibilityItems.length > 0) {
        await page.getByRole("button", { name: "保存当前装修草稿" }).click();
        await expect(page.locator("span", { hasText: /^页面草稿已保存$/ }).last()).toBeVisible();
        for (const item of restoredVisibilityItems) {
          const block = saved.puckData.content.find((candidate: Record<string, any>) =>
            candidate.props?.id === `all-template-editor-${item.entry.templateKey}`,
          );
          expect(block?.props?.isVisible, `${item.entry.templateKey}.isVisible 恢复显示未保存`).toBe(true);
        }
        await page.reload();
        await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
      }

      for (const viewport of ["desktop", "mobile"] as const) {
        await page.getByRole("button", {
          name: viewport === "desktop" ? /桌面端.*布局/ : /移动端.*布局/,
        }).click();
        await page.getByRole("button", { name: "预览当前画布" }).click();
        const frameElement = page.locator(".homepage-editor__canvas-scale iframe");
        const frame = page.frameLocator(".homepage-editor__canvas-scale iframe");
        for (const item of edited) {
          const renderer = frame.locator(
            `[data-content-template-contract="${item.entry.templateKey}"]`,
          );
          await expect(renderer).toBeVisible();
          const bounds = await renderer.boundingBox();
          expect(bounds, `${item.entry.templateKey}.${viewport} 缺少可见矩形`).not.toBeNull();
          expect(bounds!.width, `${item.entry.templateKey}.${viewport} 宽度必须非零`).toBeGreaterThan(0);
          expect(bounds!.height, `${item.entry.templateKey}.${viewport} 高度必须非零`).toBeGreaterThan(0);
          expect(
            await renderer.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
            `${item.entry.templateKey}.${viewport} Renderer 不应横向溢出`,
          ).toBe(true);
        }
        await expect.poll(() => frame.locator("html").evaluate((html) =>
          html.scrollWidth <= html.clientWidth,
        )).toBe(true);
        await frameElement.screenshot({
          path: testInfo.outputPath(`${matrixPageGroup.pageKey}-${viewport}.png`),
          animations: "disabled",
        });
        await page.getByRole("button", { name: "退出当前画布预览" }).click();
      }
      expect(forbiddenWrites).toEqual([]);
    });
  }

  test("Z4-02 模板属性单任务切换保留输入并只提供对象适用的尺寸控件", async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await inspector.getByRole("textbox", { name: "模板名称", exact: true }).fill("数值属性测试模板");
    const structure = page.getByRole("complementary", { name: "模板结构" });
    const { trigger: addTrigger, panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByRole("button", { name: "图片槽位 内容槽位" }).click();
    await addTrigger.click();
    const measurement = inspector.getByLabel("当前画布数值");
    await expect(measurement).toContainText("横向位置 X");
    await expect(measurement).toContainText("纵向位置 Y");
    await expect(measurement).toContainText("实际宽度 W");
    await expect(measurement).toContainText("实际高度 H");
    await expect(measurement.locator("strong")).toHaveCount(4);
    await expect(measurement.locator("strong").nth(2)).toHaveText(/^\d+(?:\.\d)? px$/);
    await inspector.screenshot({
      path: testInfo.outputPath("template-inspector-default-values.png"),
      animations: "disabled",
    });
    await expect(inspector.getByRole("tab")).toHaveCount(3);
    await expect(inspector.getByRole("tabpanel", { name: "槽位职责" })).toBeVisible();
    await expect(inspector.getByRole("tabpanel", { name: "显示样式" })).toBeHidden();
    await expect(inspector.getByRole("tabpanel", { name: "页面可编辑" })).toBeHidden();
    await expect(inspector.locator(".template-editor__inspector-context")).toHaveCount(0);
    const inspectorScroll = inspector.locator(".homepage-editor__inspector-scroll");
    await openTemplateInspectorPanel(page, "规则");
    await inspectorScroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(inspector.locator(".template-editor__validation-section")).toBeInViewport();
    await openTemplateInspectorPanel(page, "基本");
    await inspectorScroll.evaluate((element) => { element.scrollTop = 0; });
    await expect(measurement).toBeInViewport();
    await openTemplateInspectorPanel(page, "布局");
    await expect(inspector.getByText("显示状态", { exact: true })).toBeVisible();
    await expect(inspector.getByRole("button", { name: "布局方式：弹性" })).toHaveCount(0);
    await expect(inspector.getByRole("button", { name: "布局方式：网格" })).toHaveCount(0);
    await expect(inspector.getByRole("spinbutton", { name: "子项间距" })).toHaveCount(0);

    await inspector.getByRole("button", { name: "宽度策略：自定" }).click();
    await inspector.getByRole("spinbutton", { name: "自定义宽度" }).fill("60");
    await openTemplateInspectorPanel(page, "规则");
    await expect(inspector.getByRole("tab", { name: "显示样式", exact: true })).toContainText(/\d+ 项修改/);
    await openTemplateInspectorPanel(page, "布局");
    await expect(inspector.getByRole("spinbutton", { name: "自定义宽度" })).toHaveValue("60");
    await expect.poll(async () => {
      const text = await measurement.locator("small").nth(2).textContent();
      return Number.parseFloat(text ?? "0");
    }).toBeGreaterThan(59);
    await expect.poll(async () => {
      const text = await measurement.locator("small").nth(2).textContent();
      return Number.parseFloat(text ?? "100");
    }).toBeLessThan(61);

    await openTemplateInspectorDisclosure(inspector, "精细排列与尺寸");
    await inspector.getByRole("spinbutton", { name: "统一内边距" }).fill("12");
    await inspector.getByRole("button", { name: "分别设置内边距" }).click();
    await inspector.getByRole("spinbutton", { name: "内边距左" }).fill("24");
    await expect(page.frameLocator("iframe.template-editor__viewport-frame")
      .locator('[data-template-node-type="ImageSlot"]'))
      .toHaveCSS("padding-left", "24px");
    await expect(inspector.getByRole("spinbutton", { name: "统一内边距" })).toHaveValue("");

    await page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端模板布局/ }).click();
    await expect.poll(async () => {
      const text = await measurement.locator("small").nth(2).textContent();
      return Number.parseFloat(text ?? "0");
    }).toBeGreaterThan(99);
    await expect(inspector.getByRole("spinbutton", { name: "统一内边距" })).toHaveValue("");
    await page.locator(".template-editor__toolbar").getByRole("button", { name: /桌面端模板布局/ }).click();
    await expect.poll(async () => {
      const text = await measurement.locator("small").nth(2).textContent();
      return Number.parseFloat(text ?? "100");
    }).toBeLessThan(61);
    await expect(page.frameLocator("iframe.template-editor__viewport-frame")
      .locator('[data-template-node-type="ImageSlot"]'))
      .toHaveCSS("padding-left", "24px");
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeEnabled();
    await inspector.locator(".homepage-editor__inspector-scroll").evaluate((element) => {
      element.scrollTop = 0;
    });
    await inspector.screenshot({
      path: testInfo.outputPath("template-inspector-numeric-controls.png"),
      animations: "disabled",
    });

    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    const savedImageSlot = Object.values(dynamic.writes.at(-1)?.body.definition.nodes ?? {})
      .find((candidate: any) => candidate.type === "ImageSlot") as any;
    expect(savedImageSlot.responsive.desktop.width).toEqual({ value: 60, unit: "%" });
    expect(savedImageSlot.responsive.desktop.padding).toEqual({
      top: { value: 12, unit: "px" },
      right: { value: 12, unit: "px" },
      bottom: { value: 12, unit: "px" },
      left: { value: 24, unit: "px" },
    });

    await page.reload();
    await openTemplateFromCatalog(page, "数值属性测试模板");
    const restoredStructure = page.getByRole("complementary", { name: "模板结构" });
    await restoredStructure.getByRole("treeitem", { name: /图片槽位/ }).click();
    const restoredInspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await openTemplateInspectorPanel(page, "布局");
    await expect(restoredInspector.getByRole("spinbutton", { name: "自定义宽度" })).toHaveValue("60");
    await openTemplateInspectorDisclosure(restoredInspector, "精细排列与尺寸");
    await restoredInspector.getByRole("button", { name: "分别设置内边距" }).click();
    await expect(restoredInspector.getByRole("spinbutton", { name: "内边距左" })).toHaveValue("24");
    expect(forbiddenPageWrites).toEqual([]);
  });
});

test.describe("模板设计流程改进（2026-09-07 修复批次）", () => {
  test("新建模板自带最小骨架且发布检查不再出现缺结构错误", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    await openWorkspaceShell(page);
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    const structure = page.getByRole("complementary", { name: "模板结构" });
    const contextualInspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await expect(contextualInspector.getByRole("textbox", { name: "模板名称" })).toBeVisible();
    await expect(contextualInspector.getByRole("textbox", { name: "槽位名称" })).toHaveCount(0);
    await expect(contextualInspector.getByRole("combobox", { name: "图片槽位比例" })).toHaveCount(0);
    await expect(contextualInspector.getByRole("combobox", { name: "字体角色" })).toHaveCount(0);
    await expect(contextualInspector.getByText("模板根节点", { exact: true }).first()).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /内容区域 1/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /图片槽位.*可选/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /标题槽位.*可选/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /正文槽位.*可选/ })).toBeVisible();
    const inspector = page.getByRole("complementary", { name: "模板属性工作区" });
    await expect(inspector).not.toContainText("发布前至少需要一个区域或容器");
    await expect(inspector).not.toContainText("发布前至少需要一个内容槽位");
    await expect(structure.getByRole("region", { name: "模板结构问题" })).toHaveCount(0);
  });

  test("属性面板随根节点、区域、图片和文字槽位切换且不混入无关控件", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    await openWorkspaceShell(page);
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    const structure = page.getByRole("complementary", { name: "模板结构" });
    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });

    await expect(inspector.getByRole("textbox", { name: "模板名称" })).toBeVisible();
    await expect(inspector.getByRole("region", { name: "槽位设置" })).toHaveCount(0);

    await structure.getByRole("treeitem", { name: /内容区域 1/ }).click();
    await expect(inspector.getByRole("textbox", { name: "节点名称" })).toHaveValue("内容区域 1");
    await expect(inspector.getByRole("group", { name: "布局方式" })).toBeVisible();
    await expect(inspector.getByRole("textbox", { name: "模板名称" })).toHaveCount(0);
    await expect(inspector.getByRole("region", { name: "槽位设置" })).toHaveCount(0);

    await structure.getByRole("treeitem", { name: /图片槽位.*可选/ }).click();
    await expect(inspector.getByRole("textbox", { name: "槽位名称" })).toHaveValue("图片槽位");
    await expect(inspector.getByRole("combobox", { name: "图片槽位比例" })).toBeVisible();
    await expect(inspector.getByRole("group", { name: "图片焦点" })).toBeVisible();
    await expect(inspector.getByRole("combobox", { name: "字体角色" })).toHaveCount(0);
    await expect(inspector.getByRole("textbox", { name: "模板名称" })).toHaveCount(0);

    await structure.getByRole("treeitem", { name: /标题槽位.*可选/ }).click();
    await expect(inspector.getByRole("textbox", { name: "槽位名称" })).toHaveValue("标题槽位");
    await expect(inspector.getByRole("combobox", { name: "字体角色" })).toBeVisible();
    await expect(inspector.getByRole("spinbutton", { name: "槽位行高" })).toBeVisible();
    await expect(inspector.getByRole("combobox", { name: "图片槽位比例" })).toHaveCount(0);
    await expect(inspector.getByRole("group", { name: "图片焦点" })).toHaveCount(0);
  });

  test("添加槽位弹层保持打开支持连续添加", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    await openWorkspaceShell(page);
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    const structure = page.getByRole("complementary", { name: "模板结构" });
    await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "添加槽位" });
    await panel.getByRole("button", { name: "添加图片槽位", exact: true }).click();
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "添加按钮槽位", exact: true }).click();
    await expect(panel).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /图片槽位 2/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /按钮槽位/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  test("图片槽位支持统一比例预设、自定义比例与九宫格焦点", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    await openWorkspaceShell(page);
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    const structure = page.getByRole("complementary", { name: "模板结构" });
    await structure.getByRole("treeitem", { name: /图片槽位.*可选/ }).click();
    const ratio = page.getByRole("combobox", { name: "图片槽位比例" });
    await expect(ratio.getByRole("option", { name: "4:5", exact: true })).toHaveCount(1);
    await ratio.selectOption("21:9").catch(() => {});
    const custom = page.getByRole("textbox", { name: "自定义图片比例" });
    await custom.fill("21:9");
    await custom.press("Enter");
    await expect(ratio).toHaveValue("21:9");
    await expect(page.getByRole("button", { name: "焦点左上" })).toBeVisible();
    await page.getByRole("button", { name: "焦点左上" }).click();
    await expect(page.getByRole("button", { name: "焦点左上" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(page.getByRole("button", { name: "焦点左上" })).toHaveAttribute("aria-pressed", "false");
  });

  test("文字槽位提供行高、字重、最大行数、溢出与字体角色控件", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    await openWorkspaceShell(page);
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    const structure = page.getByRole("complementary", { name: "模板结构" });
    await structure.getByRole("treeitem", { name: /标题槽位.*可选/ }).click();
    const lineHeight = page.getByRole("spinbutton", { name: "槽位行高" });
    await lineHeight.fill("1.8");
    await lineHeight.press("Enter");
    await expect(lineHeight).toHaveValue("1.8");
    await page.getByRole("combobox", { name: "文字字重" }).selectOption("700");
    await expect(page.getByRole("combobox", { name: "文字字重" })).toHaveValue("700");
    const maxLines = page.getByRole("spinbutton", { name: "槽位最大行数" });
    await maxLines.fill("4");
    await maxLines.press("Enter");
    await expect(maxLines).toHaveValue("4");
    await page.getByRole("combobox", { name: "文字溢出策略" }).selectOption("ellipsis");
    await expect(page.getByRole("combobox", { name: "文字溢出策略" })).toHaveValue("ellipsis");
    await page.getByRole("combobox", { name: "字体角色" }).selectOption("heading");
    await expect(page.getByRole("combobox", { name: "字体角色" })).toHaveValue("heading");
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "字体角色" })).toHaveValue("");
  });
});
