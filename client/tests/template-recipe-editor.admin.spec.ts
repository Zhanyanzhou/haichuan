import { expect, test, type Page } from "@playwright/test";
import { CHECKSUM, makeResource, installNewTemplateServer, openTemplateDesignWithoutDraft, readSession, saveTemplate } from "./fixtures/template-authoring-main-route";
import { instantiateLaunchTemplateMaster } from "../src/page-builder/template-creation/launchTemplateSet";
import { seedLaunchMasterDraft } from "./fixtures/template-launch-master-entry";
import { addDynamicTemplateNode, type DynamicTemplateNodeType, type TemplateDefinitionV2 } from "../src/page-builder/template-definition";
import { placeInsertedTemplateNode } from "../src/page-builder/template-editor/templateInsertionPlacement";

async function openInsertionScenario(page: Page, scenario: "space" | "full" | "background" | "legacy" | "anchored") {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTemplateDesignWithoutDraft(page);
  const ids = await page.evaluate(async (scenario) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { createRecommendedRecipe } = await load("/src/page-builder/template-creation/presets.ts");
    const { generateTemplateFromRecipe } = await load("/src/page-builder/template-creation/generateTemplateFromRecipe.ts");
    const { useTemplateEditorSession } = await load("/src/page-builder/template-editor/templateEditorSession.ts");
    // 角色只决定槽位构成：图片槽（背景）在画布下方，内容槽归到「文字列」组，舞台恰好两个孩子。
    // 下面会把每个孩子的坐标整体覆写，所以角色自身的推荐布局不进断言；但必须选固定画幅的角色
    // ——「随内容增长」的画布走流式排版，舞台不是自由定位的 Stack，这一场景就没有空位可算了。
    const definition = generateTemplateFromRecipe(createRecommendedRecipe("editorial-media"), { templateId: "qa-placement", name: "历史自由区维护验证" });
    const parent = Object.values(definition.nodes).find((node: any) => node.type === "Stack" && node.responsive.desktop.layoutMode === "free") as any;
    parent.childIds.forEach((id: string, index: number) => {
      definition.nodes[id].responsive.desktop.placement = { x: 0, y: index * .47, width: .45, height: .45, zIndex: 1 };
    });
    if (scenario === "full" || scenario === "legacy") {
      const container = parent.childIds.find((id: string) => !definition.nodes[id].slotId);
      definition.nodes[container].responsive.desktop.placement = { x: 0, y: 0, width: 1, height: 1, zIndex: 2 };
    }
    if (scenario === "background") {
      const image = parent.childIds.find((id: string) => definition.nodes[id].slotId);
      definition.nodes[image].responsive.desktop.placement = { x: 0, y: 0, width: 1, height: 1, zIndex: 0 };
      definition.nodes[image].responsive.mobile = {};
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

function prepareInsertionCandidate(definition: TemplateDefinitionV2, parentId: string, type: DynamicTemplateNodeType) {
  const inserted = addDynamicTemplateNode(definition, parentId, type);
  placeInsertedTemplateNode(inserted.definition, parentId, inserted.nodeId);
  return inserted;
}

for (const scenario of ["space", "full", "anchored", "background", "legacy"] as const) {
  test(`历史自由区 ${scenario} 保持旧节点且不提供新增入口（Mock）`, async ({ page }) => {
    const { server, parentId, siblings } = await openInsertionScenario(page, scenario);
    await expect(page.getByRole("tree", { name: "模板区域与槽位" })
      .locator(`[data-selection-target-id="${parentId}"]`)).toBeVisible();
    if (scenario === "space" || scenario === "full") {
      await expect(page.frameLocator("iframe.template-editor__viewport-frame")
        .locator(`[data-template-node-id="${parentId}"]`)).toBeVisible();
    }
    const before = await readSession(page);
    await expect(page.locator(".template-editor__canvas-add")).toHaveCount(0);
    await expect(page.getByRole("button", {
      name: /^添加(?:子区域|槽位|图片槽位|标题槽位)$/,
      includeHidden: true,
    })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "添加槽位", includeHidden: true })).toHaveCount(0);

    // 继续在纯候选层验证原放置规则；旧操作不触及浏览器会话。
    const original = structuredClone(before.definition!);
    if (scenario === "space") {
      const inserted = prepareInsertionCandidate(before.definition!, parentId, "ImageSlot");
      const node = inserted.definition.nodes[inserted.nodeId];
      expect(node.responsive.desktop.placement).toMatchObject({ y: 0, width: .5, height: .5 });
      expect(node.responsive.desktop.placement!.x).toBeCloseTo(.47, 6);
      expect(node.responsive.mobile.placement).toBeNull();
      for (const id of siblings) expect(inserted.definition.nodes[id]).toEqual(original.nodes[id]);
    } else if (scenario === "full") {
      expect(() => prepareInsertionCandidate(before.definition!, parentId, "HeadingSlot")).toThrow(/没有足够空位/);
      const flow = Object.values(original.nodes).find((node) => node.name === "文字列")!;
      const inserted = prepareInsertionCandidate(before.definition!, flow.nodeId, "HeadingSlot");
      expect(inserted.definition.nodes[flow.nodeId].childIds).toContain(inserted.nodeId);
    } else if (scenario === "anchored") {
      expect(() => prepareInsertionCandidate(before.definition!, parentId, "HeadingSlot")).toThrow(/使用锚定或其他独立定位/);
    } else {
      const inserted = prepareInsertionCandidate(before.definition!, parentId, "HeadingSlot");
      expect(Object.keys(inserted.definition.nodes)).toHaveLength(Object.keys(original.nodes).length + 1);
      expect(inserted.definition.schemaVersion).toBe(original.schemaVersion);
    }
    expect(before.definition).toEqual(original);
    const after = await readSession(page);
    expect(after.definition).toEqual(original);
    expect(after.selectedObjectId).toBe(before.selectedObjectId);
    expect(after.historyPast).toEqual(before.historyPast);
    expect(server.writes).toEqual([]);
  });
}

async function openHistoricalRecipeDraft(page: Page) {
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { createRecommendedRecipe } = await load("/src/page-builder/template-creation/presets.ts");
    const { generateTemplateFromRecipe } = await load("/src/page-builder/template-creation/generateTemplateFromRecipe.ts");
    const { useTemplateEditorSession } = await load("/src/page-builder/template-editor/templateEditorSession.ts");
    // 保留历史配方的文字列与主行动槽，验证现有草稿仍可继续精修和保存。
    const recipe = createRecommendedRecipe("page-hero");
    recipe.canvas = { width: 1440, height: 1800, aspectRatio: 4 / 5 };
    recipe.layout = "topImageBottomContent";
    recipe.rules.mediaArrangement = "row";
    const definition = generateTemplateFromRecipe(recipe, { templateId: "tpl_historical_recipe_editor" });
    const session = useTemplateEditorSession.getState();
    session.open({ format: "dynamic", sourceType: "local", localDraftId: definition.templateId, definition, versionNote: "" }, { isNew: true });
    session.selectObject(definition.rootNodeId);
  });
  await expect(page.getByRole("region", { name: "空模板画布", exact: true })).toBeHidden();
}

for (const [slotType, field] of [["heading", "默认文字"], ["button", "默认按钮文字"], ["image", "默认图片说明"]] as const) {
  test(`历史配方草稿可编辑既有${field}且单次撤销（Mock）`, async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 900, height: 1000 });
    await openTemplateDesignWithoutDraft(page);
    await openHistoricalRecipeDraft(page);
    const slotId = await page.evaluate(async (type) => {
      const path = "/src/page-builder/template-editor/templateEditorSession.ts";
      const state = (await import(/* @vite-ignore */ path)).useTemplateEditorSession.getState();
      const definition = state.draft.definition as TemplateDefinitionV2;
      const slot = Object.values(definition.slots).find((item) => item.type === type);
      if (!slot) throw new Error(`历史草稿缺少 ${type} 槽位`);
      const node = Object.values(definition.nodes).find((item) => item.slotId === slot.slotId);
      if (!node) throw new Error(`历史草稿缺少 ${type} 节点`);
      state.selectObject(node.nodeId);
      return slot.slotId;
    }, slotType);
    const inspectorTrigger = page.getByRole("button", { name: "展开模板属性面板", exact: true });
    if (await inspectorTrigger.isVisible()) await inspectorTrigger.click();
    const before = await readSession(page);
    const defaults = page.locator(`[data-template-default-content="${slotId}"]`);
    const input = defaults.getByRole("textbox", { name: field, exact: true });
    await expect(defaults).toBeVisible();
    await expect(input).toBeVisible();
    const next = "维护后的内容";
    await input.fill(next);
    await input.press("Tab");
    await expect.poll(async () => {
      const value = (await readSession(page)).definition?.defaultContent[slotId];
      return slotType === "image" ? (value as { alt?: string })?.alt
        : slotType === "button" ? (value as { label?: string })?.label : value;
    }).toBe(next);
    const after = await readSession(page);
    expect(after.historyPast).toHaveLength(before.historyPast.length + 1);
    expect(after.definition!.slots).toEqual(before.definition!.slots);
    await page.evaluate(async () => {
      const path = "/src/page-builder/template-editor/templateEditorSession.ts";
      (await import(/* @vite-ignore */ path)).useTemplateEditorSession.getState().undo();
    });
    expect((await readSession(page)).definition).toEqual(before.definition);
    expect(server.writes).toEqual([]);
  });
}

test("历史配方草稿的结构选择、默认内容编辑、失败保护、保存重开与复制（自有API Mock）", async ({ page }, testInfo) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTemplateDesignWithoutDraft(page);
  await openHistoricalRecipeDraft(page);
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
  await openHistoricalRecipeDraft(page);
  await page.getByRole("button", { name: "模板整体", exact: true }).click();
  const section = page.getByRole("region", { name: "对象设计属性", exact: true });
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
  await page.getByRole("menuitem", { name: /删除图片$/ }).click();
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

test("取消未保存切换后可再次打开已有模板，且旧草稿保留（自有 API Mock）", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  const target = instantiateLaunchTemplateMaster("editorial-split", "tpl_recipe_editor_switch");
  if (!target) throw new Error("找不到切换目标的模板定义");
  server.persisted = makeResource(target, 7);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTemplateDesignWithoutDraft(page);
  await seedLaunchMasterDraft(page);
  const old = (await readSession(page)).definition;
  const openTarget = page.locator(`[data-template-name="${target.templateId}"]`)
    .getByRole("button", { name: /^打开/ });
  const guard = page.getByRole("dialog", { name: "切换模板？", exact: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await openTarget.click();
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "继续编辑", exact: true }).click();
    await expect(guard).toBeHidden();
    await expect(openTarget).toBeEnabled();
    expect((await readSession(page)).definition).toEqual(old);
  }
  expect(server.writes).toEqual([]);
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
