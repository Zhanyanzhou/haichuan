import { expect, test, type Page } from "@playwright/test";
import { addTemplateLayoutStarter, getTemplateLayoutStarterUnavailableReason, TEMPLATE_LAYOUT_STARTERS } from "../src/page-builder/template-editor/templateLayoutStarters";
import { createNewDynamicTemplateDraft } from "../src/page-builder/template-editor/dynamicTemplateDraftRepository";
import { resolveTemplateNodeRules } from "../src/page-builder/template-definition/responsive";
import { useTemplateEditorSession } from "../src/page-builder/template-editor/templateEditorSession";
import { addFirstRegion, createBlankTemplate, firstRegionAction, installNewTemplateServer, readSession, stableAuthoringFacts, structurePanel } from "./fixtures/template-authoring-main-route";

test.afterEach(() => useTemplateEditorSession.getState().close());

function activeStructurePanel(page: Page) {
  return structurePanel(page).or(page.getByRole("dialog", { name: "模板结构", exact: true }));
}

async function openLayoutStarterPicker(page: Page) {
  const palette = page.getByRole("dialog", { name: "添加槽位", exact: true });
  if (!await palette.isVisible()) {
    await activeStructurePanel(page).getByRole("button", { name: "添加槽位", exact: true }).click();
  }
  await palette.getByRole("button", { name: "选择常用布局", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "选择常用布局", exact: true });
  await expect(picker).toBeVisible();
  return picker;
}

async function addFirstRegionForCurrentViewport(page: Page) {
  if (await structurePanel(page).isVisible()) {
    await addFirstRegion(page);
    return;
  }
  await firstRegionAction(page).click();
  await page.getByRole("button", { name: "展开模板结构面板", exact: true }).click();
  await expect(activeStructurePanel(page).getByRole("treeitem", { name: /内容区域 1/ })).toBeVisible();
}

for (const option of TEMPLATE_LAYOUT_STARTERS) {
  test(`常用布局 ${option.label}：同一事务维护结构、字段和三端规则`, () => {
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
      expect(resolveTemplateNodeRules(definition, layoutId, "tablet").columns).toEqual([1, 1]);
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
  test(`确定性 UI ${width}px：空白先建区域后选择图文布局、取消零写入、一次撤销还原`, async ({ page }, testInfo) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width, height: 1000 });
    await createBlankTemplate(page);
    await addFirstRegionForCurrentViewport(page);
    const before = await readSession(page);
    const picker = await openLayoutStarterPicker(page);
    await expect(picker).toContainText("添加到：内容区域 1");
    await expect(page.locator(".ant-popover").filter({ has: picker })).toHaveCSS("opacity", "1");
    await page.screenshot({ path: testInfo.outputPath("layout-picker.png") });
    await picker.getByRole("button", { name: "取消选择布局", exact: true }).click();
    expect(stableAuthoringFacts(await readSession(page))).toEqual(stableAuthoringFacts(before));
    const reopenedPicker = await openLayoutStarterPicker(page);
    await reopenedPicker.getByRole("button", { name: /^左图右文/ }).click();
    await expect(reopenedPicker).toBeHidden();
    const created = await readSession(page);
    expect(created.historyPast).toHaveLength(before.historyPast.length + 1);
    expect(created.pageFields.map((field) => field.label)).toEqual(["主图", "主标题", "正文说明", "行动按钮"]);
    expect(created.definition!.nodes[created.selectedObjectId!].name).toBe("图片区域");
    expect(server.writes).toEqual([]);
    const frame = page.frameLocator("iframe[title$='模板隔离画布']");
    await expect(frame.locator(`[data-template-node-id="${created.selectedObjectId}"]`)).toBeVisible();
    await page.keyboard.press("Control+z");
    expect((await readSession(page)).definition).toEqual(before.definition);
    expect(server.writes).toEqual([]);
  });
}

test("确定性 UI：三张卡片实际呈现三列、平板两列和手机单列，设备查看不改草稿", async ({ page }, testInfo) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await createBlankTemplate(page);
  await addFirstRegion(page);
  const picker = await openLayoutStarterPicker(page);
  await picker.getByRole("button", { name: /^三列卡片/ }).click();
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
  await page.getByRole("button", { name: /^平板端模板布局/ }).click();
  await expect.poll(async () => {
    const boxes = await readPositions();
    return boxes[0].y === boxes[1].y && boxes[2].y > boxes[0].y;
  }).toBe(true);
  await page.getByRole("button", { name: /^移动端模板布局/ }).click();
  await expect.poll(async () => {
    const boxes = await readPositions();
    return boxes[0].x === boxes[1].x && boxes[1].x === boxes[2].x && boxes[0].y < boxes[1].y && boxes[1].y < boxes[2].y;
  }).toBe(true);
  expect(stableAuthoringFacts(await readSession(page))).toEqual(stableAuthoringFacts(created));
  expect(server.writes).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("cards-mobile.png") });
});

test("确定性 UI：从结构区建立两栏后，连续添加沿用首个待填区域", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await createBlankTemplate(page);
  await addFirstRegion(page);
  await structurePanel(page).getByRole("button", { name: "添加槽位", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "添加槽位", exact: true });
  await palette.getByRole("button", { name: "选择常用布局", exact: true }).click();
  await page.getByRole("dialog", { name: "选择常用布局", exact: true }).getByRole("button", { name: /^左右两栏/ }).click();
  const built = await readSession(page);
  const targetId = built.selectedObjectId!;
  expect(built.definition!.nodes[targetId].name).toBe("左侧区域");
  await expect(palette.getByRole("combobox", { name: "添加目标", exact: true })).toHaveValue(targetId);
  await palette.getByRole("button", { name: "添加标题槽位", exact: true }).click();
  await palette.getByRole("button", { name: "添加正文槽位", exact: true }).click();
  const after = await readSession(page);
  const children = after.definition!.nodes[targetId].childIds;
  expect(children.map((id) => after.definition!.nodes[id].type)).toEqual(["HeadingSlot", "TextSlot"]);
  expect(after.historyPast).toHaveLength(built.historyPast.length + 2);
  expect(Object.keys(after.definition!.slots)).toHaveLength(2);
  expect(server.writes).toEqual([]);
});
