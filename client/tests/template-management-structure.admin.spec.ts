import { expect, test, type Page } from "@playwright/test";
import { installNewTemplateServer, makeResource, openTemplateDesignWithoutDraft, readSession, saveTemplate } from "./fixtures/template-authoring-main-route";

async function sourceDefinition(page: Page, legacy = false) {
  return page.evaluate(async (old) => {
    const generatorPath = "/src/page-builder/template-creation/generateTemplateFromRecipe.ts";
    const presetsPath = "/src/page-builder/template-creation/presets.ts";
    const definitionPath = "/src/page-builder/template-definition/index.ts";
    const [{ generateTemplateFromRecipe }, { createRecommendedRecipe }, definitions] = await Promise.all([
      import(/* @vite-ignore */ generatorPath), import(/* @vite-ignore */ presetsPath), import(/* @vite-ignore */ definitionPath),
    ]);
    if (!old) return generateTemplateFromRecipe(createRecommendedRecipe(), { name: "管理验收" });
    let definition = definitions.createBlankDynamicTemplateDefinition("旧模板复制验收");
    const region = definitions.addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    const text = definitions.addDynamicTemplateNode(region.definition, region.nodeId, "HeadingSlot");
    definition = text.definition;
    definition.schemaVersion = 1;
    delete definition.metadata.previewTabletWidth;
    for (const node of Object.values(definition.nodes) as Array<{ responsive: { desktop: unknown; mobile: unknown } }>) node.responsive.mobile = structuredClone(node.responsive.desktop);
    definition.defaultContent[text.slotId] = "旧版默认内容";
    definition.slots[text.slotId].desktopRules.fontSize = { value: 48, unit: "px" };
    definition.slots[text.slotId].mobileRules = {};
    return definition;
  }, legacy);
}

async function openSource(page: Page, server: Awaited<ReturnType<typeof installNewTemplateServer>>, legacy = false) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTemplateDesignWithoutDraft(page);
  const definition = await sourceDefinition(page, legacy);
  server.persisted = makeResource(definition, 7);
  await openTemplateDesignWithoutDraft(page);
  const card = page.locator(`[data-template-name="${definition.templateId}"]`);
  await card.getByRole("button", { name: /^打开/ }).click();
  return { definition, card };
}

test("重命名只应用草稿命令，不夹带保存当前设计", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  const { card } = await openSource(page, server);
  await page.evaluate(async () => {
    const path = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ path);
    useTemplateEditorSession.getState().executeCommand({ type: "transform-definition", label: "测试精修", transform: (next: any) => { next.description = "尚未保存的设计"; return next; } });
  });
  const before = await readSession(page);
  await card.getByRole("button", { name: /操作/ }).click();
  await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "重命名模板", exact: true });
  await dialog.getByRole("textbox", { name: "模板名称", exact: true }).fill("已应用新名称");
  await dialog.getByRole("button", { name: "应用名称", exact: true }).click();
  await expect(dialog).toBeHidden();
  const renamed = await readSession(page);
  expect(server.writes).toEqual([]);
  expect(renamed.definition?.name).toBe("已应用新名称");
  expect(renamed.definition?.description).toBe(before.definition?.description);
  expect(renamed.historyPast.length).toBe(before.historyPast.length + 1);
  expect(renamed.dirty).toBe(true);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await readSession(page)).definition).toEqual(before.definition);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await saveTemplate(page);
  await expect.poll(() => server.saveResults.length).toBe(1);
  expect(server.persisted?.draft?.definition.name).toBe("已应用新名称");
});

test("旧副本先留内存，显式保存精修失败保留真实副本与历史，重试不重复创建", async ({ page }, testInfo) => {
  const server = await installNewTemplateServer(page);
  const { definition: source, card } = await openSource(page, server, true);
  await card.getByRole("button", { name: /操作/ }).click();
  await page.getByRole("menuitem", { name: "复制当前草稿", exact: true }).click();
  await expect.poll(async () => (await readSession(page)).definition?.templateId).not.toBe(source.templateId);
  const copied = await readSession(page);
  expect(server.writes).toEqual([]);
  expect(copied.remote).toBeNull();
  expect(copied.dirty).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("unsaved-legacy-copy-1600.png"), fullPage: false });
  await page.evaluate(async () => {
    const path = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ path);
    useTemplateEditorSession.getState().executeCommand({ type: "transform-definition", label: "副本精修", transform: (next: any) => { next.description = "副本独立精修"; return next; } });
  });
  const edited = await readSession(page);
  let failures = 0;
  await page.route("**/api/page-modules/dynamic-templates/*/draft", async (route) => {
    if (route.request().method() === "PATCH" && failures === 0) {
      failures += 1;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "模拟精修写入失败" }) });
    } else await route.fallback();
  });
  await saveTemplate(page);
  await expect.poll(async () => (await readSession(page)).saveStatus).toBe("error");
  const failed = await readSession(page);
  expect(failures).toBe(1);
  expect(failed.definition).toEqual(edited.definition);
  expect(failed.historyPast).toEqual(edited.historyPast);
  expect(failed.dirty).toBe(true);
  expect(failed.remote?.revision).toBe(1);
  const creates = server.writes.filter((write) => write.method === "POST");
  expect(creates).toHaveLength(1);
  const payload = creates[0].body as { definition: typeof source; copySource: { templateId: string; revision: number } };
  expect(payload.copySource).toMatchObject({ templateId: source.templateId, revision: 7 });
  expect({ ...payload.definition, templateId: source.templateId, name: source.name }).toEqual(source);
  await saveTemplate(page);
  await expect.poll(async () => (await readSession(page)).saveStatus).toBe("success");
  expect(server.writes.filter((write) => write.method === "POST")).toHaveLength(1);
  expect((await readSession(page)).definition).toEqual(edited.definition);
  expect((await readSession(page)).dirty).toBe(false);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  const undone = await readSession(page);
  expect(undone.remote?.revision).toBe(2);
  expect(undone.definition?.templateId).toBe(copied.definition?.templateId);
});

test("结构树反映本端与上级隐藏，折叠后画布选择自动展开定位", async ({ page }, testInfo) => {
  const server = await installNewTemplateServer(page);
  await openSource(page, server);
  const targets = await page.evaluate(async () => {
    const path = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ path);
    const state = useTemplateEditorSession.getState();
    const definition = state.draft.definition;
    const title = Object.values(definition.slots).find((slot: any) => slot.semanticRole === "title") as any;
    const node = Object.values(definition.nodes).find((candidate: any) => candidate.slotId === title.slotId) as any;
    const parent = Object.values(definition.nodes).find((candidate: any) => candidate.childIds.includes(node.nodeId)) as any;
    state.executeCommand({ type: "transform-definition", label: "手机显隐测试", transform: (next: any) => { next.nodes[node.nodeId].responsive.mobile.hidden = true; return next; } });
    state.setBreakpoint("mobile");
    return { nodeId: node.nodeId, parentId: parent.nodeId, parentName: parent.name };
  });
  const tree = page.getByRole("tree", { name: "模板区域与槽位", exact: true });
  await expect(tree.getByRole("treeitem", { name: /主标题.*本端隐藏/ })).toBeVisible();
  await page.evaluate(async ({ nodeId, parentId }) => {
    const path = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ path);
    useTemplateEditorSession.getState().executeCommand({ type: "transform-definition", label: "上级显隐测试", transform: (next: any) => { next.nodes[nodeId].responsive.mobile.hidden = false; next.nodes[parentId].responsive.mobile.hidden = true; return next; } });
  }, targets);
  await expect(tree.getByRole("treeitem", { name: /主标题.*上级隐藏/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("structure-visibility-1600.png"), fullPage: false });
  const parentTreeItem = tree.getByRole("treeitem").filter({ has: page.locator(".template-editor__tree-toggle") }).and(page.locator(`[data-selection-target-id="${targets.parentId}"]`));
  await parentTreeItem.locator(".template-editor__tree-toggle").click();
  await expect(parentTreeItem).toHaveAttribute("aria-expanded", "false");
  await expect(tree.getByRole("treeitem", { name: /^主标题 / })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("structure-collapsed-1600.png"), fullPage: false });
  await page.evaluate(async ({ nodeId }) => {
    const path = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ path);
    useTemplateEditorSession.getState().selectObject(nodeId);
  }, targets);
  await expect(tree.getByRole("treeitem", { name: /主标题.*上级隐藏/ })).toBeVisible();
  await expect(parentTreeItem).toHaveAttribute("aria-expanded", "true");
});

test("旧副本首次保存期间继续编辑，新内容保留未保存且不被源快照覆盖", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  const { card } = await openSource(page, server, true);
  await card.getByRole("button", { name: /操作/ }).click();
  await page.getByRole("menuitem", { name: "复制当前草稿", exact: true }).click();
  await expect.poll(async () => (await readSession(page)).remote).toBeNull();
  let pending = false;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/page-modules/dynamic-templates", async (route) => {
    if (route.request().method() === "POST") { pending = true; await held; }
    await route.fallback();
  });
  await saveTemplate(page);
  await expect.poll(() => pending).toBe(true);
  await page.evaluate(async () => {
    const path = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ path);
    useTemplateEditorSession.getState().executeCommand({ type: "transform-definition", label: "保存期间继续精修", transform: (next: any) => { next.description = "仍需保留的新修改"; return next; } });
  });
  const latest = await readSession(page);
  release();
  await expect.poll(async () => (await readSession(page)).remote?.revision).toBe(1);
  const after = await readSession(page);
  expect(after.definition).toEqual(latest.definition);
  expect(after.historyPast).toEqual(latest.historyPast);
  expect(after.dirty).toBe(true);
  expect(server.persisted?.draft?.definition.description).not.toBe("仍需保留的新修改");
  expect(server.writes.filter((write) => write.method === "POST")).toHaveLength(1);
  await expect(page.getByText("模板副本已保存；你还有新的未保存修改。", { exact: true })).toBeVisible();
});
