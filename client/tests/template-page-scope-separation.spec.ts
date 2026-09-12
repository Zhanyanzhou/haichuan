import { expect, test, type Page } from "@playwright/test";

test.use({ channel: process.env.TEMPLATE_BROWSER_CHANNEL });

type MountedFieldIds = {
  rootId: string;
  primaryRegionId: string;
  secondaryRegionId: string;
  emptyRegionId: string;
  imageNodeId: string;
  imageSlotId: string;
  textNodeId: string;
  textSlotId: string;
  actionNodeId: string;
  actionSlotId: string;
  productNodeId: string;
  productSlotId: string;
  structuredNodeId: string;
  structuredSlotId: string;
};

type MountedFixture = {
  ids: MountedFieldIds;
  dangerousRequests: string[];
};

type PairedRoleScenario = "ready" | "missing-modal" | "missing-pair" | "inapplicable" | "locked";

type MountedPairedRoleFixture = {
  heroNodeId: string;
  dangerousRequests: string[];
};

async function mountTemplateInspector(page: Page): Promise<MountedFixture> {
  const dangerousRequests: string[] = [];
  await page.route("**/api/**", (route) => {
    const method = route.request().method();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      dangerousRequests.push(method + " " + new URL(route.request().url()).pathname);
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const ids = await page.evaluate(async () => {
    document.body.innerHTML = '<div id="template-page-scope-test-root"></div>';
    const [React, ReactDom, antd, inspectorModule, definitionApi, repositoryModule, sessionModule] = await Promise.all([
      import("/@id/react"),
      import("/@id/react-dom/client"),
      import("/@id/antd"),
      import("/src/page-builder/template-editor/DynamicTemplateInspectorPanel.tsx"),
      import("/src/page-builder/template-definition/index.ts"),
      import("/src/page-builder/template-editor/dynamicTemplateDraftRepository.ts"),
      import("/src/page-builder/template-editor/templateEditorSession.ts"),
    ]);

    let definition = repositoryModule.createNewDynamicTemplateDraft("页面范围同源验收").definition;
    const primaryRegion = definitionApi.addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = primaryRegion.definition;
    definition.nodes[primaryRegion.nodeId].name = "主内容容器";
    const secondaryRegion = definitionApi.addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = secondaryRegion.definition;
    definition.nodes[secondaryRegion.nodeId].name = "行动与商品容器";
    const emptyRegion = definitionApi.addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = emptyRegion.definition;
    definition.nodes[emptyRegion.nodeId].name = "空容器";

    const image = definitionApi.addDynamicTemplateNode(definition, primaryRegion.nodeId, "ImageSlot");
    definition = image.definition;
    const text = definitionApi.addDynamicTemplateNode(definition, primaryRegion.nodeId, "HeadingSlot");
    definition = text.definition;
    const structured = definitionApi.addDynamicTemplateNode(definition, primaryRegion.nodeId, "HeroTemplate");
    definition = structured.definition;
    const action = definitionApi.addDynamicTemplateNode(definition, secondaryRegion.nodeId, "ButtonSlot");
    definition = action.definition;
    const product = definitionApi.addDynamicTemplateNode(definition, secondaryRegion.nodeId, "CollectionSlot");
    definition = product.definition;

    Object.assign(definition.slots[image.slotId!], {
      label: "工艺主图",
      required: true,
      editable: false,
      hideable: true,
      validation: { recommendedWidth: 1600, recommendedHeight: 1200 },
    });
    definition.nodes[image.nodeId].instanceEditPolicy = {
      position: false, size: true, zIndex: false, imageFit: true, imageFocus: false,
      typography: false, spacing: false, minWidthPercent: 35, maxWidthPercent: 140,
      maxOffsetPercent: 18, minFontSizePx: 12, maxFontSizePx: 96, maxSpacingPx: 120,
    };
    Object.assign(definition.slots[text.slotId!], {
      label: "工艺标题",
      required: false,
      editable: true,
      hideable: true,
      validation: { minLength: 2, maxLength: 36 },
    });
    definition.nodes[text.nodeId].instanceEditPolicy = {
      position: false, size: false, zIndex: false, imageFit: false, imageFocus: false,
      typography: true, spacing: true, minWidthPercent: 25, maxWidthPercent: 150,
      maxOffsetPercent: 30, minFontSizePx: 16, maxFontSizePx: 52, maxSpacingPx: 64,
    };
    Object.assign(definition.slots[structured.slotId!], {
      label: "工艺轮播",
      required: false,
      editable: true,
      hideable: true,
      validation: { minItems: 2, maxItems: 6 },
    });
    Object.assign(definition.slots[action.slotId!], {
      label: "预约行动",
      required: false,
      editable: true,
      hideable: true,
      validation: { allowedProtocols: ["https", "page"] },
    });
    definition.nodes[action.nodeId].instanceEditPolicy = {
      position: true, size: false, zIndex: false, imageFit: false, imageFocus: false,
      typography: false, spacing: false, minWidthPercent: 25, maxWidthPercent: 150,
      maxOffsetPercent: 24, minFontSizePx: 12, maxFontSizePx: 96, maxSpacingPx: 120,
    };
    Object.assign(definition.slots[product.slotId!], {
      label: "推荐商品",
      required: true,
      editable: true,
      hideable: false,
      validation: { minItems: 1, maxItems: 4 },
    });

    sessionModule.useTemplateEditorSession.getState().open({
      format: "dynamic",
      sourceType: "local",
      localDraftId: definition.templateId,
      versionNote: "",
      definition,
    }, { isNew: true });
    sessionModule.useTemplateEditorSession.getState().selectObject(image.nodeId);

    const react = React.default ?? React;
    const createRoot = ReactDom.createRoot ?? ReactDom.default.createRoot;
    createRoot(document.getElementById("template-page-scope-test-root")!).render(
      react.createElement(antd.App, null, react.createElement(inspectorModule.default, { localOnly: true })),
    );

    return {
      rootId: definition.rootNodeId,
      primaryRegionId: primaryRegion.nodeId,
      secondaryRegionId: secondaryRegion.nodeId,
      emptyRegionId: emptyRegion.nodeId,
      imageNodeId: image.nodeId,
      imageSlotId: image.slotId!,
      textNodeId: text.nodeId,
      textSlotId: text.slotId!,
      actionNodeId: action.nodeId,
      actionSlotId: action.slotId!,
      productNodeId: product.nodeId,
      productSlotId: product.slotId!,
      structuredNodeId: structured.nodeId,
      structuredSlotId: structured.slotId!,
    };
  });
  return { ids, dangerousRequests };
}

async function mountPairedRoleInspector(
  page: Page,
  scenario: PairedRoleScenario = "ready",
): Promise<MountedPairedRoleFixture> {
  const dangerousRequests: string[] = [];
  await page.route("**/api/**", (route) => {
    const method = route.request().method();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      dangerousRequests.push(method + " " + new URL(route.request().url()).pathname);
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const heroNodeId = await page.evaluate(async (fixtureScenario) => {
    document.body.innerHTML = '<div id="template-paired-role-test-root"></div>';
    const inspectorSource = await fetch("/src/page-builder/template-editor/DynamicTemplateInspectorPanel.tsx").then((response) => response.text());
    const antdImportPath = inspectorSource.match(/from\s+"(\/node_modules\/\.vite\/deps\/antd\.js[^"]*)"/)?.[1];
    if (!antdImportPath) throw new Error("无法定位 Inspector 使用的 AntD 模块实例");
    const [React, ReactDom, antd, inspectorModule, definitionApi, repositoryModule, sessionModule, contractsModule] = await Promise.all([
      import("/@id/react"),
      import("/@id/react-dom/client"),
      import(/* @vite-ignore */ antdImportPath),
      import("/src/page-builder/template-editor/DynamicTemplateInspectorPanel.tsx"),
      import("/src/page-builder/template-definition/index.ts"),
      import("/src/page-builder/template-editor/dynamicTemplateDraftRepository.ts"),
      import("/src/page-builder/template-editor/templateEditorSession.ts"),
      import("/src/page-builder/generated/contentTemplates.generated.ts"),
    ]);
    let definition = repositoryModule.createNewDynamicTemplateDraft("配对角色 Inspector 验收").definition;
    const region = definitionApi.addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const hero = definitionApi.addDynamicTemplateNode(definition, region.nodeId, "HeroTemplate");
    definition = hero.definition;
    definition.nodes[hero.nodeId].props.contentTemplateLayoutData = {
      version: 2,
      nodes: {
        desktopImage: {
          rectByViewport: { desktop: { x: 0.05, y: 0.1, width: 0.9, height: 0.7 } },
        },
        mobileImage: {
          rectByViewport: { mobile: { x: 0.15, y: 0.2, width: 0.7, height: 0.6 } },
        },
        copy: {
          rectByViewport: {
            desktop: { x: 0.2, y: 0.3, width: 0.4, height: 0.2 },
            mobile: { x: 0.1, y: 0.65, width: 0.8, height: 0.2 },
          },
        },
      },
    };

    if (fixtureScenario === "locked") {
      definition = definitionApi.setDynamicTemplateNodeStructureLocked(definition, region.nodeId, true);
    }
    if (fixtureScenario === "missing-pair") {
      const contract = contractsModule.getContentTemplateContract("首屏主视觉");
      const desktopRole = contract?.roles.find((role) => role.id === "desktopImage");
      if (!desktopRole) throw new Error("HeroTemplate desktopImage 合同角色不存在");
      (desktopRole as { fallbackRoleId?: string }).fallbackRoleId = undefined;
    }

    sessionModule.useTemplateEditorSession.getState().open({
      format: "dynamic",
      sourceType: "local",
      localDraftId: definition.templateId,
      versionNote: "",
      definition,
    }, { isNew: true });
    if (fixtureScenario === "inapplicable") {
      sessionModule.useTemplateEditorSession.getState().setDevice("mobile");
    }
    sessionModule.useTemplateEditorSession.getState().selectContractRole(hero.nodeId, "desktopImage");

    const originalExecuteCommand = sessionModule.useTemplateEditorSession.getState().executeCommand;
    sessionModule.useTemplateEditorSession.setState({
      executeCommand: (command) => {
        (window as typeof window & { __lastPairedRoleCommand?: unknown }).__lastPairedRoleCommand = structuredClone(command);
        return originalExecuteCommand(command);
      },
    });

    const react = React.default ?? React;
    const createRoot = ReactDom.createRoot ?? ReactDom.default.createRoot;
    const inspector = react.createElement(inspectorModule.default, { localOnly: true });
    createRoot(document.getElementById("template-paired-role-test-root")!).render(
      fixtureScenario === "missing-modal" ? inspector : react.createElement(antd.App, null, inspector),
    );
    return hero.nodeId;
  }, scenario);

  return { heroNodeId, dangerousRequests };
}

async function selectTemplateObject(page: Page, nodeId: string) {
  await page.evaluate(async (selectedNodeId) => {
    const { useTemplateEditorSession } = await import("/src/page-builder/template-editor/templateEditorSession.ts");
    useTemplateEditorSession.getState().selectObject(selectedNodeId);
  }, nodeId);
}

async function readImmutableSessionState(page: Page) {
  return page.evaluate(async () => {
    const { useTemplateEditorSession } = await import("/src/page-builder/template-editor/templateEditorSession.ts");
    const state = useTemplateEditorSession.getState();
    return {
      definition: JSON.stringify(state.draft!.definition),
      historyPast: state.historyPast.length,
      historyFuture: state.historyFuture.length,
      dirty: state.dirty,
      saveStatus: state.saveStatus,
    };
  });
}

async function readPairedRoleSessionState(page: Page, heroNodeId: string) {
  return page.evaluate(async (targetNodeId) => {
    const { useTemplateEditorSession } = await import("/src/page-builder/template-editor/templateEditorSession.ts");
    const state = useTemplateEditorSession.getState();
    const definition = state.draft!.definition;
    const definitionWithoutLayout = structuredClone(definition);
    delete definitionWithoutLayout.nodes[targetNodeId].props.contentTemplateLayoutData;
    return {
      definition: JSON.stringify(definition),
      definitionWithoutLayout: JSON.stringify(definitionWithoutLayout),
      layout: structuredClone(definition.nodes[targetNodeId].props.contentTemplateLayoutData),
      historyPast: state.historyPast.length,
      historyFuture: state.historyFuture.length,
      dirty: state.dirty,
      saveStatus: state.saveStatus,
      device: state.device,
      selectedContractRole: state.selectedContractRole,
      lastCommand: (window as typeof window & { __lastPairedRoleCommand?: unknown }).__lastPairedRoleCommand,
    };
  }, heroNodeId);
}

async function selectResponsiveCopyGroup(page: Page) {
  const checkbox = page.getByRole("checkbox", { name: "合同对象构图与媒体", exact: true });
  await expect(checkbox).toBeEnabled();
  await checkbox.check();
}

async function readFieldIdentity(page: Page, nodeId: string) {
  return page.evaluate(async (targetNodeId) => {
    const [{ useTemplateEditorSession }, descriptors] = await Promise.all([
      import("/src/page-builder/template-editor/templateEditorSession.ts"),
      import("/src/page-builder/dynamic-template-instance/pageFieldDescriptors.ts"),
    ]);
    const field = descriptors.getDynamicTemplatePageFieldDescriptors(
      useTemplateEditorSession.getState().draft!.definition,
    ).find((candidate) => candidate.nodeId === targetNodeId);
    if (!field) throw new Error("页面字段不存在");
    return { nodeId: field.nodeId, slotId: field.slotId, stableKey: field.stableKey, label: field.label };
  }, nodeId);
}

test("根与兄弟容器按 DFS 展示 descriptor 可见摘要，纯导航与返回保持零写", async ({ page }) => {
  const { ids, dangerousRequests } = await mountTemplateInspector(page);
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("tab", { name: "设计", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(inspector.getByText("图片槽位", { exact: true })).toBeVisible();
  await expect(inspector.getByLabel("页面字段名称")).toHaveCount(0);
  await expect(inspector.getByRole("switch", { name: "页面必须填写" })).toHaveCount(0);
  await expect(inspector.locator('[data-template-page-scope-field="label"]')).toHaveCount(0);

  const beforeNavigation = await readImmutableSessionState(page);
  await page.evaluate(() => window.dispatchEvent(new Event("template-editor:open-metadata")));
  await expect(inspector).toHaveAttribute("data-template-inspector-object-id", ids.rootId);
  await expect(inspector.getByRole("group", { name: "模板信息", exact: true })).toBeVisible();
  await expect(inspector.getByRole("tab", { name: "设计", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(inspector.locator('[data-template-inspector-field="slot.label"]')).toHaveCount(0);
  await expect(inspector.locator('[data-template-inspector-field="slot.declarations"]')).toHaveCount(0);
  await expect(inspector.locator('[data-template-inspector-field^="slot.validation"]')).toHaveCount(0);
  await expect(inspector.getByText("页面装修可调整范围", { exact: true })).toHaveCount(0);

  await inspector.getByRole("tab", { name: "页面开放范围", exact: true }).click();
  const list = inspector.getByRole("region", { name: "当前结构页面字段" });
  const fields = list.locator('[data-page-field-consumer="full"]');
  await expect(fields).toHaveCount(5);
  expect(await fields.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-page-field-label"))))
    .toEqual(["工艺主图", "工艺标题", "工艺轮播", "预约行动", "推荐商品"]);

  await expect(list.getByRole("button", { name: /工艺标题/ })).toContainText("控件：文字输入");
  await expect(list.getByRole("button", { name: /工艺标题/ })).toContainText("限制：最小 2 字；最大 36 字");
  await expect(list.getByRole("button", { name: /工艺标题/ })).toContainText("允许文字样式/间距覆盖");
  await expect(list.getByRole("button", { name: /工艺标题/ })).toContainText("字号 16–52 像素");
  await expect(list.getByRole("button", { name: /工艺主图/ })).toContainText("控件：图片选择");
  await expect(list.getByRole("button", { name: /工艺主图/ })).toContainText("建议 1600 × 1200 像素");
  await expect(list.getByRole("button", { name: /工艺主图/ })).toContainText("不开放设计覆盖");
  await expect(list.getByRole("button", { name: /预约行动/ })).toContainText("控件：行动与链接");
  await expect(list.getByRole("button", { name: /预约行动/ })).toContainText("跳转 https/page");
  await expect(list.getByRole("button", { name: /推荐商品/ })).toContainText("控件：业务引用");
  await expect(list.getByRole("button", { name: /工艺轮播/ })).toContainText("控件：结构化内容");

  await selectTemplateObject(page, ids.primaryRegionId);
  await expect(fields).toHaveCount(3);
  expect(await fields.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-page-field-label"))))
    .toEqual(["工艺主图", "工艺标题", "工艺轮播"]);

  await selectTemplateObject(page, ids.secondaryRegionId);
  await expect(fields).toHaveCount(2);
  expect(await fields.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-page-field-label"))))
    .toEqual(["预约行动", "推荐商品"]);

  await selectTemplateObject(page, ids.emptyRegionId);
  await expect(fields).toHaveCount(0);
  await expect(list.getByText("当前结构没有页面字段", { exact: true })).toBeVisible();
  expect(await readImmutableSessionState(page)).toEqual(beforeNavigation);
  expect(dangerousRequests).toEqual([]);
});

test("字段合法写入保持稳定身份，空值、返回、null capability 与结构锁定遵守写边界", async ({ page }) => {
  const { ids, dangerousRequests } = await mountTemplateInspector(page);
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  await inspector.getByRole("tab", { name: "页面开放范围", exact: true }).click();
  let field = inspector.locator('[data-page-field-consumer="full"]');
  await expect(field).toHaveAttribute("data-page-field-control-kind", "image");
  await expect(field).toHaveAttribute("data-page-field-policy", "null");

  const blockedSnapshot = await readImmutableSessionState(page);
  const imageFit = field.getByRole("switch", { name: "可调整图片适配" });
  await expect(imageFit).toBeDisabled();
  await imageFit.evaluate((element: HTMLButtonElement) => element.click());
  await field.getByLabel("页面字段名称").fill("");
  await field.getByLabel("页面字段名称").press("Escape");
  expect(await readImmutableSessionState(page)).toEqual(blockedSnapshot);
  expect(await readFieldIdentity(page, ids.imageNodeId)).toEqual({
    nodeId: ids.imageNodeId,
    slotId: ids.imageSlotId,
    stableKey: (await readFieldIdentity(page, ids.imageNodeId)).stableKey,
    label: "工艺主图",
  });

  await field.getByRole("button", { name: "允许填写并关闭隐藏", exact: true }).click();
  await expect(field).toHaveAttribute("data-page-field-editable", "true");
  await expect(field).toHaveAttribute("data-page-field-hideable", "false");
  await expect(field).toHaveAttribute("data-page-field-policy", /"size":true/);

  const identityBeforeRename = await readFieldIdentity(page, ids.imageNodeId);
  await field.getByLabel("页面字段名称").fill("工艺主图（页面）");
  await field.getByLabel("页面字段名称").press("Tab");
  await expect(field).toHaveAttribute("data-page-field-label", "工艺主图（页面）");
  const identityAfterRename = await readFieldIdentity(page, ids.imageNodeId);
  expect(identityAfterRename).toEqual({ ...identityBeforeRename, label: "工艺主图（页面）" });

  const sizeOverride = field.getByRole("switch", { name: "允许调整尺寸" });
  await expect(sizeOverride).toHaveAttribute("aria-checked", "true");
  await sizeOverride.click();
  await expect(field).toHaveAttribute("data-page-field-policy", /"size":false/);

  const beforeReturn = await readImmutableSessionState(page);
  await field.getByRole("button", { name: "返回当前结构全部字段", exact: true }).click();
  expect(await readImmutableSessionState(page)).toEqual(beforeReturn);

  await selectTemplateObject(page, ids.primaryRegionId);
  await inspector.getByRole("tab", { name: "设计", exact: true }).click();
  const structureLock = inspector.getByRole("switch", { name: "锁定位置、尺寸和层级" });
  await expect(structureLock).toBeVisible();
  await structureLock.click();
  await expect(structureLock).toHaveAttribute("aria-checked", "true");

  await selectTemplateObject(page, ids.textNodeId);
  await inspector.getByRole("tab", { name: "页面开放范围", exact: true }).click();
  field = inspector.locator('[data-page-field-consumer="full"]');
  await expect(field.getByText("当前字段随结构锁定", { exact: true })).toBeVisible();
  await expect(field.getByRole("switch", { name: "页面可隐藏" })).toBeDisabled();
  await expect(field.getByRole("spinbutton", { name: "最大字数" })).toBeDisabled();
  await field.getByRole("button", { name: "定位解锁设置", exact: true }).click();
  await expect(inspector).toHaveAttribute("data-template-inspector-object-id", ids.primaryRegionId);
  await expect(inspector.getByRole("tab", { name: "设计", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(inspector.getByRole("switch", { name: "锁定位置、尺寸和层级" })).toBeFocused();

  const beforeEmptyContainer = await readImmutableSessionState(page);
  await selectTemplateObject(page, ids.emptyRegionId);
  await inspector.getByRole("tab", { name: "页面开放范围", exact: true }).click();
  await expect(inspector.getByText("当前结构没有页面字段", { exact: true })).toBeVisible();
  expect(await readImmutableSessionState(page)).toEqual(beforeEmptyContainer);
  expect(dangerousRequests).toEqual([]);
});

test("配对合同角色双向复制共用 source-target 计划，确认只写目标角色并形成一步可撤销历史", async ({ page }) => {
  const { heroNodeId, dangerousRequests } = await mountPairedRoleInspector(page);
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  await expect(inspector).toBeVisible();
  await expect(inspector).toHaveAttribute("data-template-inspector-device", "desktop");
  await expect(inspector).toHaveAttribute("data-template-inspector-role", "true");
  await selectResponsiveCopyGroup(page);

  const initial = await readPairedRoleSessionState(page, heroNodeId);
  const copyCurrentToOther = inspector.getByRole("button", { name: "复制当前画布到另一画布", exact: true });
  await expect(copyCurrentToOther).toBeEnabled();
  await copyCurrentToOther.click();
  let dialog = page.getByRole("dialog", { name: "复制当前画布到另一画布" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-template-responsive-role-mapping="desktopImage:mobileImage"]')).toContainText(/对象映射：桌面端.+→ 移动端/);
  await expect(dialog.getByText("合同对象构图与媒体", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "确认替换", exact: true })).toBeEnabled();

  await dialog.getByRole("button", { name: /^取\s*消$/ }).click();
  await expect(dialog).toBeHidden();
  expect(await readPairedRoleSessionState(page, heroNodeId)).toEqual(initial);

  await copyCurrentToOther.click();
  dialog = page.getByRole("dialog", { name: "复制当前画布到另一画布" });
  await dialog.getByRole("button", { name: "确认替换", exact: true }).click();
  await expect(dialog).toBeHidden();
  const desktopToMobile = await readPairedRoleSessionState(page, heroNodeId);
  const expectedDesktopToMobile = structuredClone(initial.layout) as any;
  expectedDesktopToMobile.nodes.mobileImage.rectByViewport.mobile =
    expectedDesktopToMobile.nodes.desktopImage.rectByViewport.desktop;
  expect(desktopToMobile.layout).toEqual(expectedDesktopToMobile);
  expect(desktopToMobile.definitionWithoutLayout).toBe(initial.definitionWithoutLayout);
  expect(desktopToMobile.historyPast).toBe(initial.historyPast + 1);
  expect(desktopToMobile.lastCommand).toMatchObject({
    type: "copy-responsive-groups",
    sourceDevice: "desktop",
    targetDevice: "mobile",
    sourceRoleId: "desktopImage",
    targetRoleId: "mobileImage",
    groups: ["contract-composition-media"],
  });
  expect(desktopToMobile.lastCommand).not.toHaveProperty("roleId");

  await page.evaluate(async () => {
    const { useTemplateEditorSession } = await import("/src/page-builder/template-editor/templateEditorSession.ts");
    useTemplateEditorSession.getState().undo();
  });
  const afterFirstUndo = await readPairedRoleSessionState(page, heroNodeId);
  expect(afterFirstUndo.definition).toBe(initial.definition);
  expect(afterFirstUndo.historyPast).toBe(initial.historyPast);

  await page.evaluate(async () => {
    const { useTemplateEditorSession } = await import("/src/page-builder/template-editor/templateEditorSession.ts");
    useTemplateEditorSession.getState().setDevice("mobile");
  });
  await expect(inspector).toHaveAttribute("data-template-inspector-device", "mobile");
  expect((await readPairedRoleSessionState(page, heroNodeId)).selectedContractRole).toEqual({
    nodeId: heroNodeId,
    roleId: "mobileImage",
  });

  await copyCurrentToOther.click();
  dialog = page.getByRole("dialog", { name: "复制当前画布到另一画布" });
  await expect(dialog.locator('[data-template-responsive-role-mapping="mobileImage:desktopImage"]')).toContainText(/对象映射：移动端.+→ 桌面端/);
  await dialog.getByRole("button", { name: "确认替换", exact: true }).click();
  await expect(dialog).toBeHidden();
  const mobileToDesktop = await readPairedRoleSessionState(page, heroNodeId);
  const expectedMobileToDesktop = structuredClone(initial.layout) as any;
  expectedMobileToDesktop.nodes.desktopImage.rectByViewport.desktop =
    expectedMobileToDesktop.nodes.mobileImage.rectByViewport.mobile;
  expect(mobileToDesktop.layout).toEqual(expectedMobileToDesktop);
  expect(mobileToDesktop.definitionWithoutLayout).toBe(initial.definitionWithoutLayout);
  expect(mobileToDesktop.historyPast).toBe(initial.historyPast + 1);
  expect(mobileToDesktop.lastCommand).toMatchObject({
    type: "copy-responsive-groups",
    sourceDevice: "mobile",
    targetDevice: "desktop",
    sourceRoleId: "mobileImage",
    targetRoleId: "desktopImage",
    groups: ["contract-composition-media"],
  });
  expect(mobileToDesktop.lastCommand).not.toHaveProperty("roleId");

  await page.evaluate(async () => {
    const { useTemplateEditorSession } = await import("/src/page-builder/template-editor/templateEditorSession.ts");
    useTemplateEditorSession.getState().undo();
  });
  expect((await readPairedRoleSessionState(page, heroNodeId)).definition).toBe(initial.definition);

  await copyCurrentToOther.click();
  dialog = page.getByRole("dialog", { name: "复制当前画布到另一画布" });
  await page.evaluate(async (targetNodeId) => {
    const { useTemplateEditorSession } = await import("/src/page-builder/template-editor/templateEditorSession.ts");
    const definition = useTemplateEditorSession.getState().draft!.definition;
    const layout = definition.nodes[targetNodeId].props.contentTemplateLayoutData as any;
    layout.nodes.desktopImage.rectByViewport.desktop = { x: 0.01, y: 0.02, width: 0.8, height: 0.75 };
  }, heroNodeId);
  const staleSnapshot = await readPairedRoleSessionState(page, heroNodeId);
  await dialog.getByRole("button", { name: "确认替换", exact: true }).click();
  await expect(inspector.getByText("复制当前画布到另一画布未应用", { exact: true })).toBeVisible();
  expect(await readPairedRoleSessionState(page, heroNodeId)).toEqual({
    ...staleSnapshot,
    lastCommand: expect.objectContaining({
      sourceRoleId: "mobileImage",
      targetRoleId: "desktopImage",
    }),
  });
  expect(dangerousRequests).toEqual([]);
});

test("App modal 确认通道缺失时显示失败反馈且不执行复制或写入状态", async ({ page }) => {
  const { heroNodeId, dangerousRequests } = await mountPairedRoleInspector(page, "missing-modal");
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  await expect(inspector).toBeVisible();
  await selectResponsiveCopyGroup(page);
  const before = await readPairedRoleSessionState(page, heroNodeId);

  const copyButton = inspector.getByRole("button", { name: "复制当前画布到另一画布", exact: true });
  await expect(copyButton).toBeEnabled();
  await copyButton.click();

  await expect(inspector.getByText("无法打开复制确认窗口", { exact: true })).toBeVisible();
  await expect(inspector.getByText("确认窗口暂时不可用，请刷新编辑器后重试。未写入草稿。", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "复制当前画布到另一画布" })).toHaveCount(0);
  const after = await readPairedRoleSessionState(page, heroNodeId);
  expect(after).toEqual(before);
  expect(after.lastCommand).toBeUndefined();
  expect(dangerousRequests).toEqual([]);
});

for (const scenario of ["missing-pair", "inapplicable", "locked"] as const) {
  test(`配对角色在 ${scenario} 状态禁用复制并保持零写`, async ({ page }) => {
    const { heroNodeId, dangerousRequests } = await mountPairedRoleInspector(page, scenario);
    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await expect(inspector).toBeVisible();
    const before = await readPairedRoleSessionState(page, heroNodeId);
    const copyButton = inspector.getByRole("button", { name: "复制当前画布到另一画布", exact: true });
    await expect(copyButton).toBeDisabled();
    await copyButton.evaluate((button: HTMLButtonElement) => button.click());
    expect(await readPairedRoleSessionState(page, heroNodeId)).toEqual(before);
    await expect(page.getByRole("dialog", { name: "复制当前画布到另一画布" })).toHaveCount(0);
    expect(dangerousRequests).toEqual([]);
  });
}
