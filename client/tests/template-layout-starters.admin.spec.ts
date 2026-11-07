import { expect, test, type Page } from "@playwright/test";
import { addTemplateLayoutStarter, getTemplateLayoutStarterUnavailableReason, TEMPLATE_LAYOUT_STARTERS } from "../src/page-builder/template-editor/templateLayoutStarters";
import { createNewDynamicTemplateDraft } from "../src/page-builder/template-editor/dynamicTemplateDraftRepository";
import { resolveTemplateNodeRules } from "../src/page-builder/template-definition/responsive";
import { useTemplateEditorSession } from "../src/page-builder/template-editor/templateEditorSession";
import { addFirstRegion, createBlankTemplate, installNewTemplateServer, readSession, stableAuthoringFacts, structurePanel } from "./fixtures/template-authoring-main-route";

test.afterEach(() => useTemplateEditorSession.getState().close());

function activeStructurePanel(page: Page) {
  return structurePanel(page).or(page.getByRole("dialog", { name: "模板结构", exact: true }));
}

for (const option of TEMPLATE_LAYOUT_STARTERS) {
  test(`常用布局 ${option.label}：同一事务维护结构、字段和双端规则`, () => {
    const draft = createNewDynamicTemplateDraft();
    const baseline = structuredClone(draft.definition);
    const session = useTemplateEditorSession.getState();
    session.open(draft, { isNew: true });
    let layoutId = "";
    const result = session.executeCommand({
      type: "transform-definition", label: `添加${option.label}`,
      transform: (current) => {
        const added = addTemplateLayoutStarter(current, current.rootNodeId, option.id);
        layoutId = added.nodeId;
        return added.definition;
      },
    });
    expect(result.ok).toBe(true);
    const state = useTemplateEditorSession.getState();
    const definition = state.draft!.definition;
    expect(state.historyPast).toHaveLength(1);
    expect(definition.templateId).toBe(baseline.templateId);
    expect(definition.nodes[definition.rootNodeId].responsive).toEqual(baseline.nodes[baseline.rootNodeId].responsive);
    expect(definition.nodes[layoutId].childIds).toHaveLength(option.id === "cards" ? 3 : 2);
    expect(Object.keys(definition.slots)).toHaveLength(option.id === "cards" ? 9 : option.id === "image-text" ? 4 : 0);
    for (const slot of Object.values(definition.slots)) {
      expect(Object.values(definition.nodes).filter((node) => node.slotId === slot.slotId)).toHaveLength(1);
      expect(slot).toMatchObject({ required: false, editable: true, hideable: true });
    }
    expect(definition.defaultContent).toEqual({});
    expect(definition.previewContent).toEqual({});
    if (option.id !== "stacked") {
      expect(resolveTemplateNodeRules(definition, layoutId, "mobile").columns).toEqual([1]);
      expect(resolveTemplateNodeRules(definition, layoutId, "desktop").columns).toEqual(option.id === "cards" ? [1, 1, 1] : [1, 1]);
    }
    state.undo();
    expect(useTemplateEditorSession.getState().draft!.definition).toEqual(baseline);
    useTemplateEditorSession.getState().redo();
    expect(useTemplateEditorSession.getState().draft!.definition).toEqual(definition);
  });
}

test("常用布局拒绝失效或锁定目标，失败不留下字段或包装层", () => {
  const draft = createNewDynamicTemplateDraft();
  const baseline = structuredClone(draft.definition);
  expect(() => addTemplateLayoutStarter(draft.definition, "missing", "cards")).toThrow("目标已不存在");
  expect(draft.definition).toEqual(baseline);
  draft.definition.nodes[draft.definition.rootNodeId].authoring = { structureLocked: true };
  expect(() => addTemplateLayoutStarter(draft.definition, draft.definition.rootNodeId, "cards")).toThrow("已锁定");
  expect(draft.definition.slots).toEqual({});
  expect(draft.definition.nodes[draft.definition.rootNodeId].childIds).toEqual([]);
});

test("既有网格按合法嵌套提供布局，拒绝直接网格套网格且保留现有内容", () => {
  const draft = createNewDynamicTemplateDraft();
  const created = addTemplateLayoutStarter(draft.definition, draft.definition.rootNodeId, "columns");
  const before = structuredClone(created.definition);
  expect(getTemplateLayoutStarterUnavailableReason(before, created.nodeId, "cards")).toContain("不接受此布局");
  expect(getTemplateLayoutStarterUnavailableReason(before, created.nodeId, "stacked")).toBeNull();
  expect(() => addTemplateLayoutStarter(created.definition, created.nodeId, "cards")).toThrow("不接受此布局");
  expect(created.definition).toEqual(before);
});

for (const width of [390, 1200, 1600]) {
  test(`确定性 UI ${width}px：模板结构区保留，常用布局新增入口已移除`, async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width, height: 1000 });
    await createBlankTemplate(page);
    const expand = page.getByRole("button", { name: "展开模板结构面板", exact: true });
    if (await expand.isVisible()) await expand.click();
    await expect(activeStructurePanel(page)).toBeVisible();
    await expect(page.getByRole("button", { name: /^(添加区域|添加槽位|选择常用布局)$/ })).toHaveCount(0);
    expect(server.writes).toEqual([]);
  });
}

test("确定性 UI：三张卡片实际呈现桌面三列和手机单列，设备查看不改草稿", async ({ page }, testInfo) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await createBlankTemplate(page);
  await addFirstRegion(page);
  // 用已存在的三列布局测试两个画布端点。
  await page.evaluate(async () => {
    const layoutModule = "/src/page-builder/template-editor/templateLayoutStarters.ts";
    const sessionModule = "/src/page-builder/template-editor/templateEditorSession.ts";
    const [{ addTemplateLayoutStarter, TEMPLATE_LAYOUT_STARTERS }, { useTemplateEditorSession }] = await Promise.all([
      import(/* @vite-ignore */ layoutModule), import(/* @vite-ignore */ sessionModule),
    ]);
    const state = useTemplateEditorSession.getState();
    const definition = state.draft.definition;
    const [regionId] = definition.nodes[definition.rootNodeId].childIds;
    const starter = TEMPLATE_LAYOUT_STARTERS.find((entry: { label: string }) => entry.label === "三列卡片");
    state.setDynamicDefinition(addTemplateLayoutStarter(definition, regionId, starter.id).definition);
  });
  const created = await readSession(page);
  const layout = Object.values(created.definition!.nodes).find((node) => node.name === "三列卡片")!;
  const groups = layout.childIds;
  const frame = page.frameLocator("iframe[title$='模板隔离画布']");
  const readPositions = async () => Promise.all(groups.map((id) => frame.locator(`[data-template-node-id="${id}"]`).evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width) };
  })));
  await expect.poll(async () => {
    const boxes = await readPositions();
    return boxes[0].y === boxes[1].y && boxes[1].y === boxes[2].y && boxes[0].x < boxes[1].x && boxes[1].x < boxes[2].x;
  }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("cards-desktop.png") });
  await page.getByRole("button", { name: /^移动端模板布局/ }).click();
  await expect.poll(async () => {
    const boxes = await readPositions();
    return boxes[0].x === boxes[1].x && boxes[1].x === boxes[2].x && boxes[0].y < boxes[1].y && boxes[1].y < boxes[2].y;
  }).toBe(true);
  expect(stableAuthoringFacts(await readSession(page))).toEqual(stableAuthoringFacts(created));
  expect(server.writes).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("cards-mobile.png") });
});

test("确定性 UI：已有结构的选中区域不显示新增控件", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await createBlankTemplate(page);
  await addFirstRegion(page);
  const before = await readSession(page);
  await expect(structurePanel(page).getByRole("treeitem", { name: /内容区域 1/ })).toBeVisible();
  await expect(structurePanel(page).getByRole("button", { name: /^(添加槽位|添加区域)$/ })).toHaveCount(0);
  expect(stableAuthoringFacts(await readSession(page))).toEqual(stableAuthoringFacts(before));
  expect(server.writes).toEqual([]);
});
