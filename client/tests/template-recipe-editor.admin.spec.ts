import { expect, test, type Page } from "@playwright/test";
import { CHECKSUM, makeResource, installNewTemplateServer, openTemplateDesignWithoutDraft, readSession, saveTemplate } from "./fixtures/template-authoring-main-route";

async function openInsertionScenario(page: Page, scenario: "space" | "full" | "background" | "legacy" | "anchored") {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTemplateDesignWithoutDraft(page);
  const ids = await page.evaluate(async (scenario) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { createRecommendedRecipe } = await load("/src/page-builder/template-creation/presets.ts");
    const { generateTemplateFromRecipe } = await load("/src/page-builder/template-creation/generateTemplateFromRecipe.ts");
    const { useTemplateEditorSession } = await load("/src/page-builder/template-editor/templateEditorSession.ts");
    const definition = generateTemplateFromRecipe(createRecommendedRecipe("productPromotion"), { templateId: "qa-placement", name: "新增放置验证" });
    const parent = Object.values(definition.nodes).find((node: any) => node.type === "Stack" && node.responsive.desktop.layoutMode === "free") as any;
    parent.childIds.forEach((id: string, index: number) => {
      definition.nodes[id].responsive.desktop.placement = { x: 0, y: index * .47, width: .45, height: .45, zIndex: 1 };
      definition.nodes[id].responsive.tablet = { placement: { x: index * .47, y: 0, width: .45, height: .45, zIndex: 1 } };
    });
    if (scenario === "full" || scenario === "legacy") {
      const container = parent.childIds.find((id: string) => !definition.nodes[id].slotId);
      definition.nodes[container].responsive.desktop.placement = { x: 0, y: 0, width: 1, height: 1, zIndex: 2 };
    }
    if (scenario === "background") {
      const image = parent.childIds.find((id: string) => definition.nodes[id].slotId);
      definition.nodes[image].responsive.desktop.placement = { x: 0, y: 0, width: 1, height: 1, zIndex: 0 };
      definition.nodes[image].responsive.tablet = {};
    }
    if (scenario === "anchored") definition.nodes[parent.childIds[0]].responsive.desktop.anchor = {
      horizontal: "right", vertical: "bottom", offsetX: { value: 0, unit: "px" }, offsetY: { value: 0, unit: "px" },
    };
    if (scenario === "legacy") { definition.schemaVersion = 2; delete definition.templateRecipe; }
    const session = useTemplateEditorSession.getState();
    session.open({ format: "dynamic", sourceType: "local", localDraftId: definition.templateId, definition, versionNote: "" }, { isNew: true });
    session.selectObject(parent.nodeId);
    session.enterEditingScope(parent.nodeId);
    return { parentId: parent.nodeId, siblings: [...parent.childIds] as string[] };
  }, scenario);
  return { server, ...ids };
}

test("新增图片按各设备寻找空位，保留旧元素和流式手机，预览及撤销一致（Mock）", async ({ page }) => {
  const { server, siblings } = await openInsertionScenario(page, "space");
  const before = await readSession(page);
  await page.locator(".template-editor__canvas-add > summary").click();
  await page.getByRole("button", { name: "添加图片槽位", exact: true }).click();
  const after = await readSession(page);
  const node = after.definition!.nodes[after.selectedObjectId!];
  expect(node.responsive.desktop.placement).toMatchObject({ y: 0, width: .5, height: .5 });
  expect(node.responsive.desktop.placement!.x).toBeCloseTo(.47, 6);
  expect(node.responsive.tablet!.placement).toMatchObject({ width: .5, height: .5 });
  expect(node.responsive.tablet!.placement!.x).toBeCloseTo(.47, 6);
  expect(node.responsive.tablet!.placement!.y).toBeCloseTo(.47, 6);
  expect(node.responsive.mobile.placement).toBeNull();
  for (const id of siblings) expect(after.definition!.nodes[id]).toEqual(before.definition!.nodes[id]);
  const frame = page.frameLocator("iframe.template-editor__viewport-frame");
  const fresh = frame.locator(`[data-template-node-id="${node.nodeId}"]`);
  await expect(fresh).toBeVisible();
  const box = (await fresh.boundingBox())!;
  for (const id of siblings) {
    const previous = (await frame.locator(`[data-template-node-id="${id}"]`).boundingBox())!;
    expect(box.x).toBeGreaterThan(previous.x + previous.width);
  }
  expect(after.historyPast).toHaveLength(before.historyPast.length + 1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await readSession(page)).definition).toEqual(before.definition);
  expect(server.writes).toEqual([]);
});

test("自由区域无空位时明确提示且不改变草稿、选择或历史（Mock）", async ({ page }) => {
  const { server } = await openInsertionScenario(page, "full");
  const before = await readSession(page);
  await page.locator(".template-editor__canvas-add > summary").click();
  await page.getByRole("button", { name: "添加标题槽位", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "没有足够空位" })).toContainText("选择其他区域添加");
  const after = await readSession(page);
  expect(after.definition).toEqual(before.definition);
  expect(after.selectedObjectId).toBe(before.selectedObjectId);
  expect(after.historyPast).toEqual(before.historyPast);
  expect(server.writes).toEqual([]);
});

test("锚定对象不能被误判为空位，添加失败保留原草稿（Mock）", async ({ page }) => {
  const { server } = await openInsertionScenario(page, "anchored");
  const before = await readSession(page);
  await page.locator(".template-editor__canvas-add > summary").click();
  await page.getByRole("button", { name: "添加标题槽位", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "使用锚定或其他独立定位" })).toBeVisible();
  const after = await readSession(page);
  expect(after.definition).toEqual(before.definition);
  expect(after.historyPast).toEqual(before.historyPast);
  expect(server.writes).toEqual([]);
});

test("结构区添加槽位共用空位检查，失败后可以更换目标继续添加（Mock）", async ({ page }) => {
  const { server } = await openInsertionScenario(page, "full");
  const before = await readSession(page);
  await page.getByRole("button", { name: "添加槽位", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "添加槽位", exact: true });
  await palette.getByRole("button", { name: "添加标题槽位", exact: true }).click();
  await expect(page.locator(".ant-alert-description").filter({ hasText: "没有足够空位" })).toContainText("未写入草稿");
  expect((await readSession(page)).definition).toEqual(before.definition);
  expect((await readSession(page)).historyPast).toEqual(before.historyPast);
  const flow = Object.values(before.definition!.nodes).find((node) => node.name === "内容区域")!;
  await palette.getByRole("combobox", { name: "添加目标", exact: true }).selectOption(flow.nodeId);
  await palette.getByRole("button", { name: "添加标题槽位", exact: true }).click();
  await expect.poll(async () => (await readSession(page)).historyPast.length).toBe(before.historyPast.length + 1);
  const after = await readSession(page);
  expect(after.definition!.nodes[flow.nodeId].childIds).toContain(after.selectedObjectId);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await readSession(page)).definition).toEqual(before.definition);
  expect(server.writes).toEqual([]);
});

for (const scenario of ["background", "legacy"] as const) test(`新增放置保留${scenario === "background" ? "全幅背景前景叠加" : "旧模板原添加规则"}（Mock）`, async ({ page }) => {
  const { server } = await openInsertionScenario(page, scenario);
  const before = await readSession(page);
  await page.locator(".template-editor__canvas-add > summary").click();
  await page.getByRole("button", { name: "添加标题槽位", exact: true }).click();
  const after = await readSession(page);
  expect(after.historyPast).toHaveLength(before.historyPast.length + 1);
  expect(Object.keys(after.definition!.nodes)).toHaveLength(Object.keys(before.definition!.nodes).length + 1);
  expect(after.definition!.schemaVersion).toBe(before.definition!.schemaVersion);
  expect(server.writes).toEqual([]);
});

async function configure(page: Page) {
  await page.getByRole("button", { name: "顶部新建模板", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "创建模板", exact: true });
  await dialog.getByRole("button", { name: "商品促销", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: /竖版 4:5/ }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: /上图下文/ }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: "前往确认（未配置项用推荐值）", exact: true }).click();
  return dialog;
}

for (const [label, field] of [["标题槽位", "默认文字"], ["按钮槽位", "默认按钮文字"], ["图片槽位", "默认图片说明"]] as const) {
  test(`生成后添加${label}立即进入空白默认内容属性且单次撤销（Mock）`, async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 900, height: 1000 });
    await openTemplateDesignWithoutDraft(page);
    const dialog = await configure(page);
    await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.evaluate(async (label) => {
      const path = "/src/page-builder/template-editor/templateEditorSession.ts";
      const state = (await import(/* @vite-ignore */ path)).useTemplateEditorSession.getState();
      const region = Object.values(state.draft.definition.nodes).find((node: any) => node.name === "内容区域") as any;
      state.enterEditingScope(region.nodeId);
      if (label === "按钮槽位") state.executeCommand({ type: "transform-definition", label: "设置来源按钮边界", transform: (definition: any) => {
        const slot = Object.values(definition.slots).find((item: any) => item.type === "button") as any;
        slot.editable = false;
        slot.hideable = false;
        definition.defaultContent[slot.slotId] = { label: "来源按钮文案", targetType: "none" };
        return definition;
      } });
    }, label);
    const before = await readSession(page);
    const add = page.locator(".template-editor__canvas-add");
    await add.locator(":scope > summary").click();
    await add.getByRole("button", { name: `添加${label}`, exact: true }).click();
    const after = await readSession(page);
    const node = after.definition!.nodes[after.selectedObjectId!];
    const slotId = node.slotId!;
    const defaults = page.locator(`[data-template-default-content="${slotId}"]`);
    await expect(defaults.getByRole("textbox", { name: field, exact: true })).toBeVisible();
    await expect(defaults.locator(":focus")).toBeVisible();
    expect(after.definition!.slots[slotId].editable).toBe(true);
    expect(after.definition!.slots[slotId].hideable).toBe(true);
    await expect(defaults.getByRole("textbox", { name: field, exact: true })).toHaveValue("");
    expect(after.definition!.defaultContent[slotId]).toBeUndefined();
    expect(after.historyPast).toHaveLength(before.historyPast.length + 1);
    await page.evaluate(async () => {
      const path = "/src/page-builder/template-editor/templateEditorSession.ts";
      (await import(/* @vite-ignore */ path)).useTemplateEditorSession.getState().undo();
    });
    expect((await readSession(page)).definition).toEqual(before.definition);
    expect(server.writes).toEqual([]);
  });
}

test("生成、结构选择、默认内容编辑、失败保护、保存重开与复制（自有API Mock）", async ({ page }, testInfo) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTemplateDesignWithoutDraft(page);
  const dialog = await configure(page);
  await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(server.writes).toEqual([]);
  const created = (await readSession(page)).definition!;
  expect(created.schemaVersion).toBe(3);
  expect(created.templateRecipe?.layout).toBe("topImageBottomContent");
  const title = Object.values(created.slots).find((slot) => slot.semanticRole === "title")!;
  const titleNode = Object.values(created.nodes).find((node) => node.slotId === title.slotId)!;
  const tree = page.getByRole("tree", { name: "模板区域与槽位" });
  await tree.getByRole("treeitem", { name: /^主标题 / }).click();
  await expect.poll(async () => (await readSession(page)).selectedObjectId).toBe(titleNode.nodeId);
  const defaults = page.locator(`[data-template-default-content="${title.slotId}"]`);
  await defaults.getByRole("textbox", { name: "默认文字", exact: true }).fill("保留这段精修标题");
  await defaults.getByRole("textbox", { name: "默认文字", exact: true }).press("Tab");
  await expect.poll(async () => (await readSession(page)).definition?.defaultContent[title.slotId]).toBe("保留这段精修标题");
  await page.getByRole("textbox", { name: "文字颜色", exact: true }).fill("#123456");
  await page.getByRole("textbox", { name: "文字颜色", exact: true }).press("Tab");
  await expect.poll(async () => (await readSession(page)).definition?.slots[title.slotId].desktopRules.color).toBe("#123456");
  await page.getByRole("textbox", { name: "文字颜色", exact: true }).fill("");
  await page.getByRole("textbox", { name: "文字颜色", exact: true }).press("Tab");
  await expect.poll(async () => (await readSession(page)).definition?.slots[title.slotId].desktopRules.color).toBeUndefined();
  await page.getByRole("textbox", { name: "文字颜色", exact: true }).fill("#123456");
  await page.getByRole("textbox", { name: "文字颜色", exact: true }).press("Tab");
  expect((await readSession(page)).definition?.templateRecipe).toEqual(created.templateRecipe);
  await page.screenshot({ path: testInfo.outputPath("recipe-editor-desktop.png"), fullPage: true });
  server.failNextSaveWith = 500;
  await saveTemplate(page);
  await expect.poll(async () => (await readSession(page)).saveStatus).toBe("error");
  expect((await readSession(page)).definition?.defaultContent[title.slotId]).toBe("保留这段精修标题");
  await saveTemplate(page);
  await expect.poll(() => server.saveResults.length).toBe(1);
  expect(server.persisted?.draft?.definition.defaultContent[title.slotId]).toBe("保留这段精修标题");
  expect(server.persisted?.draft?.definition.templateRecipe).toEqual(created.templateRecipe);
  await openTemplateDesignWithoutDraft(page);
  const card = page.locator(`[data-template-name="${created.templateId}"]`);
  await card.getByRole("button", { name: /^打开未命名模板/ }).click();
  await expect.poll(async () => (await readSession(page)).definition?.defaultContent[title.slotId]).toBe("保留这段精修标题");
  await card.getByRole("button", { name: /操作/ }).click();
  await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
  const renameDialog = page.getByRole("dialog", { name: "重命名模板", exact: true });
  await renameDialog.getByRole("textbox", { name: "模板名称", exact: true }).fill("精修模板");
  await renameDialog.getByRole("button", { name: "应用名称", exact: true }).click();
  await expect(renameDialog).toBeHidden();
  await saveTemplate(page);
  await expect.poll(async () => (await readSession(page)).saveStatus).toBe("success");
  expect(server.persisted?.name).toBe("精修模板");
  await card.getByRole("button", { name: /操作/ }).click();
  await page.getByRole("menuitem", { name: "复制当前草稿", exact: true }).click();
  await expect.poll(async () => (await readSession(page)).definition?.templateId).not.toBe(created.templateId);
  expect((await readSession(page)).definition?.defaultContent[title.slotId]).toBe("保留这段精修标题");
});

test("背景可清空，手机可关闭继承的渐变并保存（自有API Mock）", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  await page.route("https://template.test/background.svg", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" />' }));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTemplateDesignWithoutDraft(page);
  const dialog = await configure(page);
  await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "模板整体", exact: true }).click();
  const section = page.getByRole("region", { name: "模板颜色与背景", exact: true });
  const color = section.getByRole("textbox", { name: "背景颜色", exact: true });
  await color.fill("#112233"); await color.press("Tab");
  await color.fill(""); await color.press("Tab");
  const rootId = (await readSession(page)).definition!.rootNodeId;
  await expect.poll(async () => (await readSession(page)).definition?.nodes[rootId].responsive.desktop.backgroundColor).toBeUndefined();
  await section.getByRole("button", { name: "或粘贴图片链接", exact: true }).click();
  await section.getByPlaceholder("输入图片 URL；清空后确认 = 删除图片").fill("https://template.test/background.svg");
  await section.getByRole("button", { name: /^确\s*认$/ }).click();
  await expect.poll(async () => (await readSession(page)).definition?.nodes[rootId].responsive.desktop.backgroundImage).toBe("https://template.test/background.svg");
  await section.getByLabel("更多图片操作").click();
  await section.getByRole("button", { name: /删除图片$/ }).click();
  await expect.poll(async () => (await readSession(page)).definition?.nodes[rootId].responsive.desktop.backgroundImage).toBe("");
  await section.getByRole("switch", { name: "背景渐变" }).click();
  await expect(section.getByRole("switch", { name: "背景渐变" })).toBeChecked();
  await page.evaluate(async () => {
    const path = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ path);
    useTemplateEditorSession.getState().setDevice("mobile");
  });
  await expect(section.getByRole("switch", { name: "背景渐变" })).toBeChecked();
  await section.getByRole("switch", { name: "背景渐变" }).click();
  await expect(section.getByRole("switch", { name: "背景渐变" })).not.toBeChecked();
  await expect.poll(async () => (await readSession(page)).definition?.nodes[rootId].responsive.mobile.backgroundGradient).toBeNull();
  await saveTemplate(page);
  await expect.poll(() => server.saveResults.length).toBe(1);
  expect(server.persisted?.draft?.definition.nodes[rootId].responsive.mobile.backgroundGradient).toBeNull();
  expect(server.persisted?.draft?.definition.nodes[rootId].responsive.desktop.backgroundGradient).toBeTruthy();
});

test("取消未保存切换后向导可重试且旧草稿保留（自有API Mock）", async ({ page }) => {
  await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTemplateDesignWithoutDraft(page);
  let dialog = await configure(page);
  await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
  await expect(dialog).toBeHidden();
  const old = (await readSession(page)).definition;
  dialog = await configure(page);
  await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
  const guard = page.getByRole("dialog", { name: "新建模板？", exact: true });
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: /取消|继续编辑/ }).click();
  await expect(guard).toBeHidden();
  await expect(dialog.getByRole("button", { name: "创建模板", exact: true })).toBeEnabled();
  expect((await readSession(page)).definition).toEqual(old);
  await dialog.getByRole("button", { name: "上一步", exact: true }).click();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect((await readSession(page)).definition).toEqual(old);
});

test("旧模板可信复制保持未保存副本，首次保存失败保留副本，重试后可继续编辑（自有API Mock）", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTemplateDesignWithoutDraft(page);
  const source = await page.evaluate(async () => {
    const path = "/src/page-builder/template-definition/index.ts";
    const { createBlankDynamicTemplateDefinition, addDynamicTemplateNode, validateDynamicTemplateDefinition } = await import(/* @vite-ignore */ path);
    let definition = createBlankDynamicTemplateDefinition("兼容旧模板");
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const added = addDynamicTemplateNode(definition, region.nodeId, "HeadingSlot");
    definition = added.definition;
    definition.schemaVersion = 1;
    delete definition.metadata.previewTabletWidth;
    for (const node of Object.values(definition.nodes) as Array<{ responsive: { desktop: unknown; mobile: unknown } }>) {
      node.responsive.mobile = structuredClone(node.responsive.desktop);
    }
    const slotId = definition.nodes[added.nodeId].slotId;
    definition.defaultContent[slotId] = "旧默认内容";
    definition.slots[slotId].desktopRules.fontSize = { value: 48, unit: "px" };
    definition.slots[slotId].mobileRules = {};
    const validation = validateDynamicTemplateDefinition(definition);
    if (!validation.valid) throw new Error(JSON.stringify(validation.issues));
    return definition;
  });
  server.persisted = makeResource(source, 7);
  await openTemplateDesignWithoutDraft(page);
  const card = page.locator(`[data-template-name="${source.templateId}"]`);
  await card.getByRole("button", { name: /^打开兼容旧模板/ }).click();
  const before = (await readSession(page)).definition;
  await card.getByRole("button", { name: /操作/ }).click();
  await page.getByRole("menuitem", { name: "复制当前草稿", exact: true }).click();
  await expect.poll(async () => (await readSession(page)).definition?.templateId).not.toBe(source.templateId);
  const pending = (await readSession(page)).definition;
  expect(server.writes).toEqual([]);
  expect(server.persisted?.draft?.definition).toEqual(before);
  server.failNextSaveWith = 500;
  await saveTemplate(page);
  await expect.poll(async () => (await readSession(page)).saveStatus).toBe("error");
  expect((await readSession(page)).definition).toEqual(pending);
  expect((await readSession(page)).remote).toBeNull();
  await saveTemplate(page);
  await expect.poll(() => server.saveResults.length).toBe(1);
  await expect.poll(async () => (await readSession(page)).remote?.revision).toBe(1);
  const payload = server.writes.filter((write) => write.method === "POST").at(-1)!.body as { definition: typeof source; copySource: unknown };
  expect(payload.copySource).toEqual({ templateId: source.templateId, revision: 7, definitionChecksum: CHECKSUM });
  expect({ ...payload.definition, templateId: source.templateId, name: source.name }).toEqual(source);
  const copied = (await readSession(page)).definition!;
  expect(copied.schemaVersion).toBe(1);
  expect(copied.defaultContent).toEqual(source.defaultContent);
  expect((await readSession(page)).dirty).toBe(false);
  const copyCard = page.locator(`[data-template-name="${copied.templateId}"]`);
  await copyCard.getByRole("button", { name: /操作/ }).click();
  await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
  const renameDialog = page.getByRole("dialog", { name: "重命名模板", exact: true });
  await renameDialog.getByRole("textbox", { name: "模板名称", exact: true }).fill("旧模板副本精修");
  await renameDialog.getByRole("button", { name: "应用名称", exact: true }).click();
  await expect(renameDialog).toBeHidden();
  await saveTemplate(page);
  await expect.poll(async () => (await readSession(page)).saveStatus).toBe("success");
  expect(server.writes.at(-1)?.method).toBe("PATCH");
  expect(server.persisted?.draft?.definition.defaultContent).toEqual(source.defaultContent);
});
