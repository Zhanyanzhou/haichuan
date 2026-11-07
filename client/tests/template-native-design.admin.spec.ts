import { test, expect, type Page } from "@playwright/test";
import { executeDynamicTemplateDefinitionCommand, type TemplateDefinitionV2 } from "../src/page-builder/template-definition";
import { addFirstRegion, applyBasicSkeleton, createBlankTemplate, installNewTemplateServer, readSession, saveTemplate } from "./fixtures/template-authoring-main-route";
const nativeBrowserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  nativeBrowserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.exposeFunction("__recordNativeDesignError", (message: string) => errors.push(message));
  await page.addInitScript(() => {
    const target = window as unknown as { __nativeDesignErrors: string[]; __recordNativeDesignError: (message: string) => Promise<void> };
    target.__nativeDesignErrors = [];
    window.addEventListener("error", (event) => {
      if (!event.message) return;
      target.__nativeDesignErrors.push(event.message);
      void target.__recordNativeDesignError(event.message);
    });
  });
});
test.afterEach(async ({ page }) => {
  await page.evaluate(async () => {
    for (let index = 0; index < 2; index++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  const frames = await Promise.all(page.frames().map((frame) => frame.evaluate(() => (
    window as unknown as { __nativeDesignErrors?: string[] }
  ).__nativeDesignErrors ?? []).catch(() => [])));
  expect([...nativeBrowserErrors.get(page)!, ...frames.flat()], "属性编辑与 iframe 更换不得产生原生浏览器异常").toEqual([]);
});
async function mount(page: Page) {
  await page.route("**/__template-native-design", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div><script type="module" src="/tests/fixtures/template-native-design.tsx"></script></body></html>` }));
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/__template-native-design");
  await expect(page.getByRole("spinbutton", { name: "网格列数", exact: true })).toBeVisible();
}
const snapshot = async (page: Page) => JSON.parse(await page.getByTestId("state").textContent() ?? "{}");

async function selectStructureTarget(page: Page, targetId: string) {
  const structureTrigger = page.getByRole("button", { name: "展开模板结构面板", exact: true });
  if (await structureTrigger.isVisible()) await structureTrigger.click();
  await page.getByRole("tree", { name: "模板区域与槽位" })
    .locator(`[role="treeitem"][data-selection-target-id="${targetId}"]`)
    .click();
}

async function ensureMainRouteLayoutImages(page: Page, nodeId: string) {
  // 历史骨架的区域只有一个直接布局组；测试排列前明确补足并列图片，避免验证无视觉效果的目标。
  await page.evaluate(async (parentId) => {
    const definitionPath = "/src/page-builder/template-definition/index.ts";
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const [{ addDynamicTemplateNode }, { useTemplateEditorSession }] = await Promise.all([
      import(/* @vite-ignore */ definitionPath), import(/* @vite-ignore */ sessionPath),
    ]);
    const state = useTemplateEditorSession.getState();
    const current = state.draft!.definition;
    const imageCount = current.nodes[parentId].childIds.filter((id: string) => current.nodes[id].type === "ImageSlot" && !current.nodes[id].hidden).length;
    if (imageCount >= 2) return;
    const result = state.executeCommand({ type: "transform-definition", label: "补足排列测试并列图片", transform: (definition: TemplateDefinitionV2) => {
      let next = definition;
      for (let index = imageCount; index < 2; index++) {
        const added = addDynamicTemplateNode(next, parentId, "ImageSlot");
        next = added.definition;
        next.nodes[added.nodeId].responsive.desktop.height = { mode: "fixed", value: { value: 120, unit: "px" } };
        next.nodes[added.nodeId].responsive.mobile.height = { mode: "fixed", value: { value: 120, unit: "px" } };
      }
      return next;
    } });
    if (!result.ok) throw new Error(result.message);
  }, nodeId);
  const definition = (await readSession(page)).definition!;
  const images = definition.nodes[nodeId].childIds.filter((id) => definition.nodes[id].type === "ImageSlot" && !definition.nodes[id].hidden);
  expect(images.length).toBeGreaterThanOrEqual(2);
  for (const imageId of images) {
    await expect(page.frameLocator("iframe.template-editor__viewport-frame").locator(`[data-template-node-id="${imageId}"]`)).toBeVisible();
  }
}

test("属性可见性：显示操作恢复 display none，仅作用正在查看的设备", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "建立本端隐藏前置", exact: true }).click();
  const before = await snapshot(page);
  const id = before.ids.cards[0];
  const node = page.getByTestId("render").locator(`[data-template-node-id="${id}"]`);
  await expect(node).toBeHidden();
  await page.getByRole("combobox", { name: "修改作用域", exact: true }).selectOption("base");
  await page.getByRole("button", { name: "在当前设备显示", exact: true }).click();
  await expect(node).toBeVisible();
  const shown = await snapshot(page);
  expect(shown.definition.nodes[id].responsive.desktop).toEqual(before.definition.nodes[id].responsive.desktop);
  expect(shown.definition.nodes[id].responsive.mobile).toMatchObject({ hidden: false, display: "block" });
  expect(shown.history).toBe(before.history + 1);
  await page.getByRole("button", { name: "显示／隐藏当前断点", exact: true }).click();
  expect((await snapshot(page)).definition.nodes[id].responsive.desktop).toEqual(before.definition.nodes[id].responsive.desktop);
  await expect(node).toBeHidden();
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(node).toBeVisible();
});

test("属性可见性：结构隐藏有明确的全部设备恢复入口并可撤销", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "建立结构隐藏前置", exact: true }).click();
  const before = await snapshot(page);
  const node = page.getByTestId("render").locator(`[data-template-node-id="${before.ids.cards[0]}"]`);
  await expect(node).toBeHidden();
  await page.getByRole("button", { name: "取消结构隐藏（所有设备）", exact: true }).click();
  await expect(node).toBeVisible();
  expect((await snapshot(page)).history).toBe(before.history + 1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).definition).toEqual(before.definition);
});

test("主路由属性：非法节点名称保留纠错文本并阻止切换，Escape 恢复后可切换", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const server = await installNewTemplateServer(page);
  await createBlankTemplate(page);
  await applyBasicSkeleton(page);
  const before = await readSession(page);
  const regionId = Object.values(before.definition!.nodes).find((node) => node.type === "Container")!.nodeId;
  const imageId = Object.values(before.definition!.nodes).find((node) => node.type === "ImageSlot")!.nodeId;
  await selectStructureTarget(page, regionId);
  const name = page.getByRole("textbox", { name: "节点名称", exact: true });
  const originalName = await name.inputValue();
  const beforeEdit = await readSession(page);

  await name.fill("");
  await name.press("Enter");
  await expect(name).toHaveAttribute("data-committed-text-input", "true");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("节点名称不能为空。", { exact: true })).toBeVisible();
  await selectStructureTarget(page, imageId);
  await expect(name).toBeFocused();
  await expect(name).toHaveValue("");
  const blocked = await readSession(page);
  expect(blocked.selectedObjectId).toBe(regionId);
  expect(blocked.definition).toEqual(beforeEdit.definition);
  expect(blocked.historyPast).toEqual(beforeEdit.historyPast);

  await name.press("Escape");
  await expect(name).toHaveValue(originalName);
  await selectStructureTarget(page, imageId);
  await expect.poll(async () => (await readSession(page)).selectedObjectId).toBe(imageId);
  expect(server.writes).toEqual([]);
});

for (const viewportWidth of [1200, 1920]) test(`对象属性布局：${viewportWidth}px文字优先与低频分组重排`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: viewportWidth, height: 1000 });
  const server = await installNewTemplateServer(page);
  await createBlankTemplate(page);
  await applyBasicSkeleton(page);
  const state = await readSession(page);
  const headingId = Object.values(state.definition!.nodes).find((node) => node.type === "HeadingSlot")!.nodeId;
  await selectStructureTarget(page, headingId);
  const inspector = page.getByRole("region", { name: "对象设计属性", exact: true });
  const typography = inspector.getByRole("heading", { name: "文字排版", exact: true });
  const responsive = inspector.getByRole("heading", { name: "设备覆盖", exact: true });
  await expect(typography).toBeInViewport();
  expect((await typography.boundingBox())!.y).toBeLessThan((await inspector.getByRole("heading", { name: "尺寸与位置", exact: true }).boundingBox())!.y);
  expect((await typography.boundingBox())!.y).toBeLessThan((await responsive.boundingBox())!.y);
  await expect(inspector.getByRole("spinbutton", { name: "字号", exact: true })).toBeInViewport();
  await expect(inspector.getByRole("group", { name: "字重", exact: true })).toBeInViewport();
  await expect(inspector.getByRole("group", { name: "文字对齐", exact: true })).toBeInViewport();
  await expect(inspector.getByRole("group", { name: "对象外框比例预设" })).toHaveCount(0);
  await expect(inspector.locator('[data-template-property-group="尺寸限制"]')).toBeVisible();
  await expect(inspector.locator('[data-template-property-group="外观"]')).toBeVisible();
  await expect(inspector.locator('[data-template-property-group="文字细节"]')).toBeVisible();
  expect(await inspector.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath(`properties-text-${viewportWidth}.png`) });
  const imageId = Object.values(state.definition!.nodes).find((node) => node.type === "ImageSlot")!.nodeId;
  await selectStructureTarget(page, imageId);
  const imageControls = inspector.getByRole("heading", { name: "图片适配与焦点", exact: true });
  const imageDimensions = inspector.getByRole("heading", { name: "尺寸与位置", exact: true });
  await expect(imageControls).toBeInViewport();
  await expect(inspector.getByRole("group", { name: "图片适配", exact: true })).toBeInViewport();
  expect((await imageControls.boundingBox())!.y).toBeLessThan((await imageDimensions.boundingBox())!.y);
  expect((await imageControls.boundingBox())!.y).toBeLessThan((await inspector.getByRole("heading", { name: "设备覆盖", exact: true }).boundingBox())!.y);
  await expect(inspector.getByRole("heading", { name: "文字排版", exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("group", { name: "对象外框比例预设", exact: true })).toBeVisible();
  expect(await inspector.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath(`properties-image-${viewportWidth}.png`) });
  expect(server.writes).toEqual([]);
});

test("主路由属性：空白零高区域可以从最小固定高度开始，隐藏不伪造测量", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const server = await installNewTemplateServer(page);
  await createBlankTemplate(page);
  await addFirstRegion(page);
  await expect(page.locator(".template-editor__canvas-add")).toHaveCount(0);
  const before = await readSession(page);
  const region = before.selectedObjectId!;
  const heightMode = page.getByRole("combobox", { name: "高度方式", exact: true });
  await expect(page.getByLabel("当前画布对象外框尺寸")).toContainText("画布占位高 256 px（非输出高度）");
  await expect(page.getByText("当前为空，画布使用编辑占位；模板仍按所选高度规则输出，添加内容后按实际内容重测。", { exact: true })).toBeVisible();
  await expect(heightMode.locator('option[value="fixed"]')).toHaveJSProperty("disabled", false);
  await heightMode.selectOption("fixed");
  await expect(page.getByRole("spinbutton", { name: "高度", exact: true })).toHaveValue("1");
  const fixed = await readSession(page);
  expect(fixed.definition!.nodes[region].responsive.desktop.height).toEqual({ mode: "fixed", value: { value: 1, unit: "px" } });
  expect(fixed.historyPast.length).toBe(before.historyPast.length + 1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await readSession(page)).definition).toEqual(before.definition);
  await page.getByRole("button", { name: "显示／隐藏当前断点", exact: true }).click();
  await expect(page.getByLabel("当前画布对象外框尺寸")).toContainText("未呈现");
  await expect(heightMode.locator('option[value="fixed"]')).toHaveJSProperty("disabled", true);
  expect(server.writes).toEqual([]);
});

test("隔离属性：适应内容转固定逐对象保持当前外观，不回填任意320", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "选择标题", exact: true }).click();
  const state = await snapshot(page);
  const node = page.getByTestId("render").locator(`[data-template-node-id="${state.ids.heading}"]`);
  const before = await node.boundingBox();
  await expect(page.getByRole("combobox", { name: "宽度方式", exact: true }).locator('option[value="fixed"]')).toBeEnabled();
  await page.getByRole("combobox", { name: "宽度方式", exact: true }).selectOption("fixed");
  await page.getByRole("combobox", { name: "高度方式", exact: true }).selectOption("fixed");
  const after = await node.boundingBox();
  expect(Math.abs(after!.width - before!.width)).toBeLessThan(0.1);
  expect(Math.abs(after!.height - before!.height)).toBeLessThan(0.1);
  expect((await snapshot(page)).history).toBe(state.history + 2);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).definition).toEqual(state.definition);
});

test("隔离属性：多选不同外框宽度切固定保留每项尺寸，一次撤销", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  await page.getByRole("combobox", { name: "宽度方式", exact: true }).selectOption("fixed");
  const width = page.getByRole("spinbutton", { name: "宽度", exact: true });
  await width.fill("123"); await width.press("Enter");
  await page.getByRole("button", { name: "多选图片", exact: true }).click();
  const state = await snapshot(page);
  const bounds = await Promise.all(state.ids.cards.map((id: string) => page.getByTestId("render").locator(`[data-template-node-id="${id}"]`).boundingBox()));
  await page.getByRole("combobox", { name: "宽度方式", exact: true }).selectOption("fixed");
  const after = await snapshot(page);
  for (const [index, id] of state.ids.cards.entries()) {
    const bound = await page.getByTestId("render").locator(`[data-template-node-id="${id}"]`).boundingBox();
    expect(Math.abs(bound!.width - bounds[index]!.width)).toBeLessThan(0.1);
  }
  expect(after.history).toBe(state.history + 1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).definition).toEqual(state.definition);
});

for (const viewportWidth of [1200, 1600, 1920]) test(`主路由属性体验：${viewportWidth}px容器排列与尺寸首屏可达`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: viewportWidth, height: 1000 });
  const server = await installNewTemplateServer(page);
  await createBlankTemplate(page);
  await applyBasicSkeleton(page);
  const initial = await readSession(page);
  const region = initial.definition!.nodes[initial.definition!.rootNodeId].childIds[0];
  await ensureMainRouteLayoutImages(page, region);
  const state = await readSession(page);
  await selectStructureTarget(page, region);
  const inspector = page.getByRole("region", { name: "对象设计属性", exact: true });
  const dimensions = inspector.locator('[data-template-property-group="尺寸与位置"]');
  const sizeHeading = dimensions.getByRole("heading", { name: "尺寸与位置", exact: true });
  await expect(sizeHeading).toBeInViewport();
  const layout = inspector.getByRole("heading", { name: "排列与分栏", exact: true });
  expect((await layout.boundingBox())!.y).toBeLessThan((await sizeHeading.boundingBox())!.y);
  expect((await sizeHeading.boundingBox())!.y).toBeLessThan((await inspector.getByRole("heading", { name: "设备覆盖", exact: true }).boundingBox())!.y);
  expect((await sizeHeading.boundingBox())!.y).toBeLessThan(650);
  const heightMode = inspector.getByRole("combobox", { name: "高度方式", exact: true });
  await expect(heightMode).toBeInViewport();
  await expect(inspector.getByLabel("当前画布对象外框尺寸")).not.toContainText("未呈现");
  const horizontalPreview = inspector.getByRole("button", { name: "预览左右排列", exact: true });
  await expect(horizontalPreview).toHaveAttribute("aria-pressed", "false");
  await horizontalPreview.click();
  await expect(horizontalPreview).toHaveAttribute("aria-pressed", "true");
  await expect(inspector.getByRole("button", { name: "确认排列转换", exact: true })).toBeVisible();
  await inspector.getByRole("button", { name: "取消排列转换", exact: true }).click();
  await expect(horizontalPreview).toHaveAttribute("aria-pressed", "false");
  const afterCancel = await readSession(page);
  expect(afterCancel.definition).toEqual(state.definition);
  expect(afterCancel.historyPast.length).toBe(state.historyPast.length);
  const renderedRegion = page.frameLocator("iframe.template-editor__viewport-frame").locator(`[data-template-node-id="${region}"]`);
  const beforeBox = await renderedRegion.boundingBox();
  await heightMode.selectOption("fixed");
  const fixedBox = await renderedRegion.boundingBox();
  expect(Math.abs(fixedBox!.width - beforeBox!.width)).toBeLessThan(0.2);
  expect(Math.abs(fixedBox!.height - beforeBox!.height)).toBeLessThan(0.2);
  expect((await readSession(page)).historyPast.length).toBe(state.historyPast.length + 1);
  // 当前缩放 iframe 中的外框含内边距；切固定不得二次加 padding。
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await readSession(page)).definition).toEqual(state.definition);
  const overflow = await inspector.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  expect(overflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath(`inspector-${viewportWidth}.png`), fullPage: false });
  expect(server.writes).toEqual([]);
});
test("隔离属性：双端列数继承、即时预览、一次提交与恢复继承", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "mobile", exact: true }).click();
  const columns = page.getByRole("spinbutton", { name: "网格列数", exact: true });
  await expect(columns).toHaveValue("1");
  await columns.fill("4");
  expect((await snapshot(page)).history).toBe(0);
  expect((await snapshot(page)).preview).toBe(true);
  await columns.press("Enter");
  expect((await snapshot(page)).history).toBe(1);
  const state = await snapshot(page);
  expect(state.definition.nodes[state.ids.region].responsive.mobile.columns).toEqual([1, 1, 1, 1]);
  expect(state.definition.nodes[state.ids.region].responsive.desktop.columns).toEqual([1, 1, 1]);
  await page.locator('[data-template-design-property="node.columns"]').getByRole("button", { name: "恢复继承", exact: true }).click();
  await expect(columns).toHaveValue("3");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(columns).toHaveValue("4");
});
test("主路由属性：网格列数重输不改比例，增减只处理末尾列", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const server = await installNewTemplateServer(page);
  await createBlankTemplate(page);
  await applyBasicSkeleton(page);
  const initial = await readSession(page);
  const region = initial.definition!.nodes[initial.definition!.rootNodeId].childIds[0];
  await ensureMainRouteLayoutImages(page, region);
  await selectStructureTarget(page, region);
  const inspector = page.getByRole("region", { name: "对象设计属性", exact: true });
  await inspector.getByRole("button", { name: "预览网格排列", exact: true }).click();
  await inspector.getByRole("button", { name: "确认排列转换", exact: true }).click();
  const firstRatio = inspector.getByRole("spinbutton", { name: "第 1 列比例", exact: true });
  await firstRatio.fill("2");
  await firstRatio.press("Enter");
  const beforeSame = await readSession(page);
  expect(beforeSame.definition!.nodes[region].responsive.desktop.columns).toEqual([2, 1, 1]);
  const columns = inspector.getByRole("spinbutton", { name: "网格列数", exact: true });
  await expect(inspector.getByText("列数不变时保留全部列比例；增加列时在末尾补 1；减少列时从末尾移除，其余比例不变。", { exact: true })).toBeVisible();
  await columns.fill("3");
  await columns.press("Enter");
  const unchanged = await readSession(page);
  expect(unchanged.definition!.nodes[region].responsive.desktop.columns).toEqual([2, 1, 1]);
  expect(unchanged.historyPast.length).toBe(beforeSame.historyPast.length);
  await columns.fill("4");
  await columns.press("Enter");
  const increased = await readSession(page);
  expect(increased.definition!.nodes[region].responsive.desktop.columns).toEqual([2, 1, 1, 1]);
  expect(increased.historyPast.length).toBe(beforeSame.historyPast.length + 1);
  await columns.fill("2");
  await columns.press("Enter");
  const decreased = await readSession(page);
  expect(decreased.definition!.nodes[region].responsive.desktop.columns).toEqual([2, 1]);
  expect(decreased.historyPast.length).toBe(beforeSame.historyPast.length + 2);
  expect(server.writes).toEqual([]);
});

test("主路由属性：排列预览占用交互，其他属性不能替换预览", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const server = await installNewTemplateServer(page);
  await createBlankTemplate(page);
  await applyBasicSkeleton(page);
  const initial = await readSession(page);
  const region = initial.definition!.nodes[initial.definition!.rootNodeId].childIds[0];
  await ensureMainRouteLayoutImages(page, region);
  await selectStructureTarget(page, region);
  const inspector = page.getByRole("region", { name: "对象设计属性", exact: true });
  const before = await readSession(page);
  await inspector.getByRole("button", { name: "预览上下排列", exact: true }).click();
  const ratio = inspector.getByRole("group", { name: "对象外框比例预设", exact: true }).getByRole("button", { name: "1:1", exact: true });
  await expect(ratio).toBeDisabled();
  await expect(inspector.getByRole("combobox", { name: "高度方式", exact: true })).toBeDisabled();
  await expect(inspector.getByRole("button", { name: "确认排列转换", exact: true })).toBeVisible();
  const pending = await readSession(page);
  expect(pending.definition).toEqual(before.definition);
  expect(pending.historyPast.length).toBe(before.historyPast.length);
  await inspector.getByRole("button", { name: "取消排列转换", exact: true }).click();
  await expect(ratio).toBeEnabled();
  expect((await readSession(page)).definition).toEqual(before.definition);
  expect(server.writes).toEqual([]);
});

test("主路由属性：手机查看桌面基础时解释排列禁用并可切换目标画布", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const server = await installNewTemplateServer(page);
  await createBlankTemplate(page);
  await applyBasicSkeleton(page);
  await expect(page.getByLabel("模板设计设备：桌面端与移动端规则分别调整").getByRole("button")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^桌面端模板布局/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^移动端模板布局/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /平板/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /模板资料/ })).toBeVisible();
  await expect(page.getByText(/Tablet|平板端/)).toHaveCount(0);
  await expect(page.locator('[data-template-inspector-field="metadata.mobileBreakpoint"]')).toHaveCount(0);
  await expect(page.getByRole("spinbutton", { name: "小屏布局切换宽度", exact: true })).toHaveCount(0);
  const initial = await readSession(page);
  const region = initial.definition!.nodes[initial.definition!.rootNodeId].childIds[0];
  await ensureMainRouteLayoutImages(page, region);
  await selectStructureTarget(page, region);
  await page.getByRole("button", { name: /^移动端模板布局/ }).click();
  const inspector = page.getByRole("region", { name: "对象设计属性", exact: true });
  await inspector.getByRole("combobox", { name: "修改作用域", exact: true }).selectOption("base");
  const scopeNotice = inspector.getByRole("status").filter({ hasText: "当前查看手机画布，但修改范围是桌面基础。排列转换需要在目标画布预览。" });
  await expect(scopeNotice).toBeVisible();
  await expect(inspector.getByRole("button", { name: "预览左右排列", exact: true })).toBeDisabled();
  await inspector.getByRole("button", { name: "切换到桌面画布", exact: true }).click();
  await expect(page.getByRole("button", { name: /^桌面端模板布局/ })).toHaveAttribute("aria-pressed", "true");
  await expect(scopeNotice).toHaveCount(0);
  await expect(inspector.getByRole("button", { name: "预览左右排列", exact: true })).toBeEnabled();
  expect(server.writes).toEqual([]);
});
test("隔离属性：Esc取消间距预览、不污染草稿或历史", async ({ page }) => {
  await mount(page);
  const before = await snapshot(page);
  const gap = page.getByRole("spinbutton", { name: "对象间距", exact: true });
  await gap.fill("41");
  await gap.press("Escape");
  const after = await snapshot(page);
  expect(after.definition).toEqual(before.definition);
  expect(after.history).toBe(0);
  expect(after.preview).toBe(false);
});
test("隔离属性：间距快捷值复用当前设备事务并保留非预设精确值", async ({ page }) => {
  await mount(page);
  const shortcuts = page.getByRole("group", { name: "对象间距快捷值", exact: true });
  const gap = page.getByRole("spinbutton", { name: "对象间距", exact: true });
  const before = await snapshot(page);

  await shortcuts.getByRole("button", { name: "24 px", exact: true }).click();
  let state = await snapshot(page);
  expect(state.definition.nodes[state.ids.region].responsive.desktop.gap).toEqual({ value: 24, unit: "px" });
  expect(state.history).toBe(before.history + 1);
  await expect(shortcuts.getByRole("button", { name: "24 px", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).definition).toEqual(before.definition);

  await gap.fill("18");
  await gap.press("Enter");
  await expect(shortcuts.getByRole("button", { pressed: true })).toHaveCount(0);
  await page.getByRole("button", { name: "mobile", exact: true }).click();
  await shortcuts.getByRole("button", { name: "32 px", exact: true }).click();
  state = await snapshot(page);
  expect(state.definition.nodes[state.ids.region].responsive.desktop.gap).toEqual({ value: 18, unit: "px" });
  expect(state.definition.nodes[state.ids.region].responsive.mobile.gap).toEqual({ value: 32, unit: "px" });
  await expect(shortcuts.getByRole("button", { name: "32 px", exact: true })).toHaveAttribute("aria-pressed", "true");
});
test("隔离属性：图片形状只用直角，历史圆角保留且手机不改桌面", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  let shapes = page.getByRole("group", { name: "图片形状", exact: true });
  let radius = page.getByRole("spinbutton", { name: "圆角", exact: true });
  const before = await snapshot(page);

  await shapes.getByRole("button", { name: "直角", exact: true }).click();
  let state = await snapshot(page);
  expect(state.definition.nodes[state.ids.cards[0]].responsive.desktop.radius).toEqual({ value: 0, unit: "px" });
  expect(state.history).toBe(before.history + 1);
  await expect(shapes.getByRole("button", { name: "直角", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(shapes.getByRole("button", { name: "圆形", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "多选图片", exact: true }).click();
  shapes = page.getByRole("group", { name: "图片形状", exact: true });
  await expect(shapes.getByRole("button", { pressed: true })).toHaveCount(0);
  const beforeBatch = await snapshot(page);
  await shapes.getByRole("button", { name: "直角", exact: true }).click();
  state = await snapshot(page);
  expect(state.history).toBe(beforeBatch.history + 1);
  for (const id of state.ids.cards) expect(state.definition.nodes[id].responsive.desktop.radius).toEqual({ value: 0, unit: "px" });
  await expect(shapes.getByRole("button", { name: "直角", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).definition).toEqual(beforeBatch.definition);

  radius = page.getByRole("spinbutton", { name: "圆角", exact: true });
  await radius.fill("13");
  await radius.press("Enter");
  await expect(shapes.getByRole("button", { pressed: true })).toHaveCount(0);
  await expect(page.getByText("当前圆角不是现行推荐（直角或圆形）。历史值仍保留，不会自动改掉。")).toBeVisible();
  await page.getByRole("button", { name: "mobile", exact: true }).click();
  shapes = page.getByRole("group", { name: "图片形状", exact: true });
  await shapes.getByRole("button", { name: "直角", exact: true }).click();
  state = await snapshot(page);
  for (const id of state.ids.cards) {
    expect(state.definition.nodes[id].responsive.desktop.radius).toEqual({ value: 13, unit: "px" });
    expect(state.definition.nodes[id].responsive.mobile.radius).toEqual({ value: 0, unit: "px" });
  }
  await expect(shapes.getByRole("button", { name: "直角", exact: true })).toHaveAttribute("aria-pressed", "true");
});
test("隔离属性：精确图片焦点保存并被共同Renderer消费，多选一条历史", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "多选图片", exact: true }).click();
  const focus = page.getByRole("spinbutton", { name: "水平焦点", exact: true });
  await focus.fill("37.25");
  await focus.press("Enter");
  const state = await snapshot(page);
  expect(state.history).toBe(1);
  for (const id of state.ids.cards) expect(state.definition.slots[state.definition.nodes[id].slotId].desktopRules.objectPosition).toBe("37.25% 50%");
  await expect(page.getByTestId("render").locator("img").first()).toHaveCSS("object-position", "37.25% 50%");
});

test("隔离属性：约束冲突保留纠错输入，Escape恢复真实原值且不增加历史", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  await page.getByRole("spinbutton", { name: "最小宽度", exact: true }).fill("500");
  await page.getByRole("spinbutton", { name: "最小宽度", exact: true }).press("Enter");
  const maximum = page.getByRole("spinbutton", { name: "最大宽度", exact: true });
  await maximum.fill("100");
  await maximum.press("Enter");
  await expect(maximum).toHaveValue("100");
  await expect(maximum).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toBeVisible();
  expect((await snapshot(page)).history).toBe(1);
  await maximum.press("Escape");
  await expect(maximum).toHaveValue("");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("共同Renderer：锚点相对父内容框，实例焦点覆盖不改变绝对定位", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "建立锚点测试", exact: true }).click();
  const state = await snapshot(page);
  const parent = page.getByTestId("render").locator(`[data-template-node-id="${state.ids.region}"]`);
  const child = page.getByTestId("render").locator(`[data-template-node-id="${state.ids.cards[0]}"]`);
  await expect(child).toHaveCSS("position", "absolute");
  const parentBox = await parent.boundingBox();
  const childBox = await child.boundingBox();
  expect(childBox!.x - parentBox!.x).toBeCloseTo(40, 1);
  expect(childBox!.y - parentBox!.y).toBeCloseTo(40, 1);
  await expect(child.locator("img")).toHaveCSS("object-position", "27% 50%");
});

test("隔离属性：可选主值恢复系统行为，保留下级覆盖且不删除必填尺寸", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "mobile", exact: true }).click();
  const gap = page.getByRole("spinbutton", { name: "对象间距", exact: true });
  await gap.fill("27"); await gap.press("Enter");
  await page.getByRole("button", { name: "desktop", exact: true }).click();
  for (const [label, value, key] of [["最小宽度", "32", "minWidth"], ["最大宽度", "800", "maxWidth"], ["最小高度", "32", "minHeight"], ["最大高度", "800", "maxHeight"], ["圆角", "12", "radius"], ["对象间距", "41", "gap"]]) {
    const field = page.getByRole("spinbutton", { name: label, exact: true });
    await field.fill(value); await field.press("Enter");
    await page.getByRole("button", { name: `${label}恢复系统默认`, exact: true }).click();
    await expect(field).toHaveValue("");
    const state = await snapshot(page);
    expect(state.definition.nodes[state.ids.region].responsive.desktop).not.toHaveProperty(key);
  }
  for (const [label, value, key] of [["背景预设", "surface-muted", "backgroundToken"], ["边框预设", "strong", "borderToken"]]) {
    await page.getByRole("combobox", { name: label, exact: true }).selectOption(value);
    await page.getByRole("button", { name: `${label}恢复系统默认`, exact: true }).click();
    const state = await snapshot(page);
    expect(state.definition.nodes[state.ids.region].responsive.desktop).not.toHaveProperty(key);
  }
  const state = await snapshot(page);
  expect(state.definition.nodes[state.ids.region].responsive.mobile.gap).toEqual({ value: 27, unit: "px" });
  expect(state.definition.nodes[state.ids.region].responsive.desktop).toMatchObject({ width: expect.anything(), height: expect.anything(), display: "grid" });
  await page.getByRole("button", { name: "mobile", exact: true }).click();
  await expect(gap).toHaveValue("27");
  const gapRow = page.locator('[data-template-design-property="node.gap"]');
  await expect(gapRow.getByRole("button", { name: "恢复系统默认", exact: true })).toHaveCount(0);
  await gapRow.getByRole("button", { name: "恢复继承", exact: true }).click();
  await expect(gap).toHaveValue("");
});

test("隔离属性：对象外框比例预设可取消、批量单事务、不改变图片焦点", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "多选图片", exact: true }).click();
  const before = await snapshot(page);
  const presets = page.getByRole("group", { name: "对象外框比例预设", exact: true });
  const shape = presets.locator('[data-template-ratio-shape="4:5"]');
  await expect(shape).toBeVisible();
  const shapeBox = await shape.locator("rect").evaluate((element) => {
    const box = (element as SVGGraphicsElement).getBBox();
    return { width: box.width, height: box.height };
  });
  expect(shapeBox.width / shapeBox.height).toBeCloseTo(4 / 5, 2);
  await presets.getByRole("button", { name: "4:5", exact: true }).click();
  expect((await snapshot(page)).preview).toBe(true);
  expect((await snapshot(page)).history).toBe(0);
  await page.getByRole("button", { name: "取消比例预览", exact: true }).click();
  expect((await snapshot(page)).definition).toEqual(before.definition);
  await presets.getByRole("button", { name: "16:9", exact: true }).click();
  await page.keyboard.press("Escape");
  expect((await snapshot(page)).definition).toEqual(before.definition);
  expect((await snapshot(page)).preview).toBe(false);
  await presets.getByRole("button", { name: "1:1", exact: true }).click();
  await page.getByRole("button", { name: "确认对象比例", exact: true }).click();
  const after = await snapshot(page);
  expect(after.history).toBe(1);
  for (const id of after.ids.cards) expect(after.definition.nodes[id].responsive.desktop.height).toEqual({ mode: "aspect-ratio", ratio: { width: 1, height: 1 } });
  expect(after.definition.slots).toEqual(before.definition.slots);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).definition).toEqual(before.definition);
});

test("隔离属性：数值标签拖动经 Esc 或窗口失焦取消，松手不追加提交", async ({ page }) => {
  await mount(page);
  const gap = page.getByRole("spinbutton", { name: "对象间距", exact: true });
  const before = await snapshot(page);
  const original = await gap.inputValue();
  for (const cancellation of ["escape", "blur"]) {
    const label = page.locator('[data-template-design-property="node.gap"]').locator("label").first();
    await label.scrollIntoViewIfNeeded();
    const box = await label.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + 10, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + 40, box!.y + box!.height / 2, { steps: 3 });
    expect((await snapshot(page)).preview).toBe(true);
    if (cancellation === "escape") await page.keyboard.press("Escape");
    else await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.mouse.up();
    await expect(gap).toHaveValue(original);
    expect((await snapshot(page)).definition).toEqual(before.definition);
    expect((await snapshot(page)).history).toBe(0);
    expect((await snapshot(page)).preview).toBe(false);
  }
});

test("隔离属性：九宫格按物理方向映射 Grid 与纵向 Flex，一次撤销", async ({ page }) => {
  await mount(page);
  const before = await snapshot(page);
  await page.getByRole("button", { name: "下右对齐", exact: true }).click();
  const gridState = await snapshot(page);
  expect(gridState.history).toBe(1);
  expect(gridState.definition.nodes[gridState.ids.region].responsive.desktop).toMatchObject({ alignItems: "end", justifyContent: "end" });
  const grid = page.getByTestId("render").locator(`[data-template-node-id="${gridState.ids.region}"]`);
  await expect(grid).toHaveCSS("justify-items", "end");
  await expect(grid).toHaveCSS("align-items", "end");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).definition).toEqual(before.definition);
  await page.getByRole("button", { name: "纵向Flex测试", exact: true }).click();
  await expect(page.locator('[data-template-design-property="node.alignItems"]').getByRole("combobox", { name: "水平对齐", exact: true })).toBeVisible();
  await expect(page.locator('[data-template-design-property="node.justifyContent"]').getByRole("combobox", { name: "垂直对齐", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "上右对齐", exact: true }).click();
  const flexState = await snapshot(page);
  expect(flexState.definition.nodes[flexState.ids.region].responsive.desktop).toMatchObject({ alignItems: "end", justifyContent: "start", direction: "column" });
  await expect(grid).toHaveCSS("align-items", "end");
  await expect(grid).toHaveCSS("justify-content", "start");
});

test("隔离属性：填满与内容尺寸冲突提前禁用，保持原文档", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  const before = await snapshot(page);
  const height = page.getByRole("combobox", { name: "高度方式", exact: true });
  await expect(height.locator('option[value="fill"]')).toHaveJSProperty("disabled", true);
  await page.locator('[data-template-design-property="node.height"]').getByText("查看尺寸方式限制", { exact: true }).click();
  await expect(page.getByText("填满可用空间不可用：父容器高度随内容变化，不能同时让子对象填满；请先确定父容器高度", { exact: true })).toBeVisible();
  expect((await snapshot(page)).definition).toEqual(before.definition);
  await page.getByRole("button", { name: "选择网格", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "宽度方式", exact: true }).locator('option[value="fit"]')).toHaveJSProperty("disabled", true);
});

test("隔离属性：可选值为空而有效默认可解释，媒体默认与 Renderer 共用", async ({ page }) => {
  await mount(page);
  const maximum = page.locator('[data-template-design-property="node.maxWidth"]');
  await expect(maximum.getByRole("spinbutton", { name: "最大宽度", exact: true })).toHaveValue("");
  await expect(maximum.locator('[data-template-effective-value]')).toHaveText("实际生效：不限制");
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  const fit = page.locator('[data-template-design-property="slot.objectFit"]');
  await expect(fit.getByRole("button", { name: "裁切填满", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("render").locator("img").first()).toHaveCSS("object-fit", "cover");
});

test("隔离属性：非整数列数拒绝后保留纠错输入，Escape明确恢复", async ({ page }) => {
  await mount(page);
  const before = await snapshot(page);
  const columns = page.getByRole("spinbutton", { name: "网格列数", exact: true });
  await columns.fill("2.5");
  await columns.press("Enter");
  await expect(columns).toHaveValue("2.5");
  await expect(columns).toBeFocused();
  await expect(columns).toHaveAttribute("aria-invalid", "true");
  expect((await snapshot(page)).definition).toEqual(before.definition);
  expect((await snapshot(page)).history).toBe(0);
  await expect(page.getByText("网格列数必须是 1 至 12 的整数", { exact: true }).first()).toBeVisible();
  await columns.press("Escape");
  await expect(columns).toHaveValue("3");
  await expect(page.getByText("网格列数必须是 1 至 12 的整数", { exact: true })).toHaveCount(0);
  await columns.fill("4");
  await columns.press("Enter");
  await expect(columns).toHaveValue("4");
  await expect(page.getByText("网格列数必须是 1 至 12 的整数", { exact: true })).toHaveCount(0);
  expect((await snapshot(page)).history).toBe(before.history + 1);
});

test("隔离属性：混合值批量修改一条历史，不支持的属性明确排除", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  let radius = page.getByRole("spinbutton", { name: "圆角", exact: true });
  await radius.fill("12"); await radius.press("Enter");
  const before = await snapshot(page);
  await page.getByRole("button", { name: "多选图片", exact: true }).click();
  radius = page.getByRole("spinbutton", { name: "圆角", exact: true });
  await expect(radius).toHaveValue("");
  await expect(radius).toHaveAttribute("placeholder", "混合值");
  await radius.fill("20"); await radius.press("Enter");
  const after = await snapshot(page);
  expect(after.history).toBe(before.history + 1);
  for (const id of after.ids.cards) expect(after.definition.nodes[id].responsive.desktop.radius).toEqual({ value: 20, unit: "px" });
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).definition).toEqual(before.definition);
  await radius.fill("1"); await radius.press("Enter");
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  await page.getByRole("combobox", { name: "圆角单位", exact: true }).selectOption("rem");
  await page.getByRole("button", { name: "多选图片", exact: true }).click();
  await expect(radius).toHaveAttribute("placeholder", "混合值");
  await expect(radius).toHaveValue("");
  await page.getByRole("button", { name: "混选网格和图片", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "网格列数", exact: true })).toHaveCount(0);
  await page.getByText("不适用于全部所选对象的属性（不参与批量修改）", { exact: true }).click();
  await expect(page.getByText(/网格列数：.*不支持当前属性或布局上下文/)).toBeVisible();
  await expect(page.getByText(/图片适配：.*不支持当前属性或布局上下文/)).toBeVisible();
});

test("隔离属性：继承字体的原值保持空白，实际生效读取画布且预览可取消", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "选择标题", exact: true }).click();
  const row = page.locator('[data-template-design-property="slot.fontSize"]');
  const input = row.getByRole("spinbutton", { name: "字号", exact: true });
  const rendered = page.getByTestId("render").locator("h2");
  const computed = await rendered.evaluate((element) => getComputedStyle(element).fontSize);
  await expect(input).toHaveValue("");
  await expect(row.locator('[data-template-effective-value]')).toHaveText(`实际生效：${computed}（当前画布计算值）`);
  const before = await snapshot(page);
  await input.fill("42");
  await expect(rendered).toHaveCSS("font-size", "42px");
  await expect(row.locator('[data-template-effective-value]')).toContainText("42px（当前画布计算值）");
  expect((await snapshot(page)).history).toBe(0);
  await input.press("Escape");
  await expect(input).toHaveValue("");
  await expect(row.locator('[data-template-effective-value]')).toHaveText(`实际生效：${computed}（当前画布计算值）`);
  expect((await snapshot(page)).definition).toEqual(before.definition);

  const weights = page.getByRole("group", { name: "字重", exact: true });
  const alignments = page.getByRole("group", { name: "文字对齐", exact: true });
  await expect(weights.getByRole("button", { name: "细", exact: true })).toBeVisible();
  await expect(weights.getByRole("button", { name: "常规", exact: true })).toBeVisible();
  await expect(weights.getByRole("button", { name: "中等", exact: true })).toHaveCount(0);
  for (const name of ["左对齐", "居中", "右对齐"]) {
    await expect(alignments.getByRole("button", { name, exact: true })).toBeVisible();
  }
  const thin = weights.getByRole("button", { name: "细", exact: true });
  await thin.click();
  await expect(thin).toHaveAttribute("aria-pressed", "true");
  await expect(rendered).toHaveCSS("font-weight", "300");
  const afterWeight = await snapshot(page);
  const slotId = afterWeight.definition.nodes[afterWeight.ids.heading].slotId;
  expect(afterWeight.definition.slots[slotId].desktopRules.fontWeight).toBe(300);
  expect(afterWeight.history).toBe(before.history + 1);
  const centered = alignments.getByRole("button", { name: "居中", exact: true });
  await centered.click();
  await expect(centered).toHaveAttribute("aria-pressed", "true");
  await expect(rendered).toHaveCSS("text-align", "center");
  const afterAlignment = await snapshot(page);
  expect(afterAlignment.definition.slots[slotId].desktopRules.textAlign).toBe("center");
  expect(afterAlignment.history).toBe(afterWeight.history + 1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).definition).toEqual(afterWeight.definition);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).definition).toEqual(before.definition);
});

test("合同边界：只为 schema2 Grid 开放已消费的水平单元对齐", async ({ page }) => {
  await mount(page);
  const state = await snapshot(page);
  const apply = (definition: TemplateDefinitionV2) => executeDynamicTemplateDefinitionCommand(definition, { type: "update-definition", label: "网格对齐边界", update: (next) => { next.nodes[state.ids.region].responsive.desktop.justifyContent = "end"; } });
  expect(apply(state.definition).ok).toBe(true);
  const legacy = structuredClone(state.definition) as TemplateDefinitionV2;
  legacy.schemaVersion = 1;
  for (const node of Object.values(legacy.nodes)) { node.responsive.mobile = structuredClone(node.responsive.desktop); delete node.responsive.tablet; }
  for (const slot of Object.values(legacy.slots)) { slot.mobileRules = structuredClone(slot.desktopRules); delete slot.tabletRules; }
  const result = apply(legacy);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.message).toContain("主轴分布在当前布局下不适用");
});

test("隔离属性：空字号从计算值步进与标签拖动，不从零跳变也不伪填原值", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "选择标题", exact: true }).click();
  const row = page.locator('[data-template-design-property="slot.fontSize"]');
  const input = row.getByRole("spinbutton", { name: "字号", exact: true });
  const rendered = page.getByTestId("render").locator("h2");
  const baseline = Number.parseFloat(await rendered.evaluate((element) => getComputedStyle(element).fontSize));
  await expect(row.locator('[data-template-effective-value]')).toContainText(`${baseline}px（当前画布计算值）`);
  await expect(input).toHaveValue("");
  await input.focus(); await input.press("ArrowUp");
  await expect(input).toHaveValue(String(baseline + 1));
  await input.press("Escape");
  await expect(input).toHaveValue("");
  const label = row.locator("label").first();
  await label.scrollIntoViewIfNeeded();
  const box = (await label.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 3 });
  await expect(input).toHaveValue(String(baseline + 10));
  await expect(rendered).toHaveCSS("font-size", `${baseline + 10}px`);
  await page.keyboard.press("Escape"); await page.mouse.up();
  await expect(input).toHaveValue("");
  expect((await snapshot(page)).history).toBe(0);
  expect((await snapshot(page)).preview).toBe(false);
});

test("隔离属性：混合隐藏多选显式统一，单次历史可完整撤销", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  await page.getByRole("button", { name: "显示／隐藏当前断点", exact: true }).click();
  const before = await snapshot(page);
  await page.getByRole("button", { name: "多选图片", exact: true }).click();
  await page.getByRole("button", { name: "当前断点全部隐藏", exact: true }).click();
  let after = await snapshot(page);
  expect(after.history).toBe(before.history + 1);
  for (const id of after.ids.cards) expect(after.definition.nodes[id].responsive.desktop.hidden).toBe(true);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).definition).toEqual(before.definition);
  await page.getByRole("button", { name: "当前断点全部显示", exact: true }).click();
  after = await snapshot(page);
  for (const id of after.ids.cards) expect(after.definition.nodes[id].responsive.desktop.hidden).toBe(false);
});

test("隔离属性：流式外边距真实渲染，叠放不显示失效的外边距", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  const margin = page.getByRole("spinbutton", { name: "左外边距", exact: true });
  await margin.fill("12"); await margin.press("Enter");
  const state = await snapshot(page);
  const image = page.getByTestId("render").locator(`[data-template-node-id="${state.ids.cards[0]}"]`);
  await expect(image).toHaveCSS("margin-left", "12px");
  expect(state.definition.nodes[state.ids.cards[0]].responsive.desktop.margin.left).toEqual({ value: 12, unit: "px" });
  await page.getByRole("button", { name: "建立锚点测试", exact: true }).click();
  await expect(margin).toHaveCount(0);
  await expect(image).toHaveCSS("margin-left", "0px");
});

test("隔离属性：图片适配与整体焦点重置系统值，保留次断点覆盖", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  const fit = page.getByRole("group", { name: "图片适配", exact: true });
  const contain = fit.getByRole("button", { name: "完整显示", exact: true });
  const cover = fit.getByRole("button", { name: "裁切填满", exact: true });
  const rendered = page.getByTestId("render").locator("img").first();
  const initial = await snapshot(page);
  await expect(cover).toHaveAttribute("aria-pressed", "true");
  await contain.click();
  await expect(contain).toHaveAttribute("aria-pressed", "true");
  await expect(rendered).toHaveCSS("object-fit", "contain");
  expect((await snapshot(page)).history).toBe(initial.history + 1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(rendered).toHaveCSS("object-fit", "cover");
  expect((await snapshot(page)).definition).toEqual(initial.definition);
  await contain.click();
  await page.getByRole("button", { name: "图片适配恢复系统默认", exact: true }).click();
  await expect(cover).toHaveAttribute("aria-pressed", "true");
  let state = await snapshot(page);
  const slotId = state.definition.nodes[state.ids.cards[0]].slotId;
  expect(state.definition.slots[slotId].desktopRules.objectFit).toBeUndefined();
  await page.getByRole("button", { name: "mobile", exact: true }).click();
  await page.getByRole("spinbutton", { name: "水平焦点", exact: true }).fill("79");
  await page.getByRole("spinbutton", { name: "水平焦点", exact: true }).press("Enter");
  await page.getByRole("button", { name: "desktop", exact: true }).click();
  await page.getByRole("spinbutton", { name: "水平焦点", exact: true }).fill("23");
  await page.getByRole("spinbutton", { name: "水平焦点", exact: true }).press("Enter");
  await page.getByRole("spinbutton", { name: "垂直焦点", exact: true }).fill("64");
  await page.getByRole("spinbutton", { name: "垂直焦点", exact: true }).press("Enter");
  await page.getByRole("button", { name: "图片焦点恢复系统默认", exact: true }).click();
  state = await snapshot(page);
  expect(state.definition.slots[slotId].desktopRules.objectPosition).toBeUndefined();
  expect(state.definition.slots[slotId].mobileRules.objectPosition).toBe("79% 50%");
  await expect(page.getByTestId("render").locator("img").first()).toHaveCSS("object-position", "50% 50%");
});

test("隔离属性：没有父级分配空间的根容器不开放填满高度", async ({ page }) => {
  await mount(page);
  const before = await snapshot(page);
  await page.getByRole("button", { name: "选择根容器", exact: true }).click();
  const heightProperty = page.locator('[data-template-design-property="node.height"]');
  const fillOption = heightProperty.getByRole("combobox", { name: "高度方式", exact: true }).locator('option[value="fill"]');
  await expect(fillOption).toHaveJSProperty("disabled", true);
  await expect(fillOption).toContainText("模板根容器没有可分配的父级高度");
  await expect(heightProperty.getByText("查看尺寸方式限制", { exact: true })).toHaveCount(0);
  expect((await snapshot(page)).definition).toEqual(before.definition);
});

test("隔离属性：应用所有断点失败有原因且零写入，保留确认上下文", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  for (const [label, value] of [["最小宽度", "100"], ["最大宽度", "200"]]) {
    const input = page.getByRole("spinbutton", { name: label, exact: true }); await input.fill(value); await input.press("Enter");
  }
  await page.getByRole("button", { name: "mobile", exact: true }).click();
  for (const [label, value] of [["最小宽度", "50"], ["最大宽度", "80"]]) {
    const input = page.getByRole("spinbutton", { name: label, exact: true }); await input.fill(value); await input.press("Enter");
  }
  const before = await snapshot(page);
  const row = page.locator('[data-template-design-property="node.maxWidth"]');
  await row.getByRole("button", { name: "应用到电脑与手机", exact: true }).click();
  await row.getByRole("button", { name: "确认统一", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("最小尺寸不能大于最大尺寸");
  await expect(row.getByRole("group", { name: "确认统一最大宽度", exact: true })).toBeVisible();
  const after = await snapshot(page);
  expect(after.definition).toEqual(before.definition); expect(after.history).toBe(before.history);
});

test("隔离属性：全部恢复继承导致父子约束冲突时原子失败并解释", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "建立继承冲突前置", exact: true }).click();
  await page.getByRole("button", { name: "mobile", exact: true }).click();
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  const before = await snapshot(page);
  await page.getByRole("button", { name: "全部恢复继承", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("不能填满适应内容宽度的父容器");
  const after = await snapshot(page);
  expect(after.definition).toEqual(before.definition); expect(after.history).toBe(before.history);
});

test("隔离属性：同断点更换 iframe 后重新读取计算值，不采失效旧视口", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "选择标题", exact: true }).click();
  const row = page.locator('[data-template-design-property="slot.fontSize"]');
  const previous = await page.getByTestId("render").locator("h2").evaluate((element) => getComputedStyle(element).fontSize);
  await expect(row.locator('[data-template-effective-value]')).toContainText(`${previous}（当前画布计算值）`);
  const before = await snapshot(page);
  await page.getByRole("button", { name: "切换隔离画布", exact: true }).click();
  const framed = page.frameLocator('iframe[title="属性计算值隔离验收"]').locator("h2");
  await expect(framed).toBeVisible();
  const current = await framed.evaluate((element) => getComputedStyle(element).fontSize);
  expect(current).not.toBe(previous);
  await expect(row.locator('[data-template-effective-value]')).toContainText(`${current}（当前画布计算值）`);
  await page.getByRole("button", { name: "切换隔离画布", exact: true }).click();
  await expect(row.locator('[data-template-effective-value]')).toContainText(`${previous}（当前画布计算值）`);
  expect((await snapshot(page)).definition).toEqual(before.definition);
});

test("合同边界：直接命令也拒绝根容器填满高度，不绕过属性禁用", async ({ page }) => {
  await mount(page);
  const state = await snapshot(page);
  const result = executeDynamicTemplateDefinitionCommand(state.definition, { type: "update-definition", label: "根高度边界", update: (next) => { next.nodes[next.rootNodeId].responsive.desktop.height = { mode: "fill" }; } });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.message).toContain("模板根节点没有可分配高度的父容器");
  expect(result.definition).toEqual(state.definition);
});

test("合同边界：当前断点隐藏子项或父级不制造假尺寸循环，恢复显示须再校验", async ({ page }) => {
  await mount(page);
  const state = await snapshot(page);
  for (const hideParent of [false, true]) {
    const hidden = executeDynamicTemplateDefinitionCommand(state.definition, { type: "update-definition", label: "隐藏布局前置", update: (next) => {
      next.nodes[state.ids.region].responsive.mobile = { ...(next.nodes[state.ids.region].responsive.mobile ?? {}), width: "fit", ...(hideParent ? { hidden: true } : {}) };
      if (!hideParent) for (const id of state.ids.cards) next.nodes[id].responsive.mobile = { hidden: true };
    } });
    expect(hidden.ok).toBe(true);
    if (!hidden.ok) continue;
    const shown = executeDynamicTemplateDefinitionCommand(hidden.definition, { type: "update-definition", label: "恢复显示约束边界", update: (next) => {
      if (hideParent) next.nodes[state.ids.region].responsive.mobile!.hidden = false;
      else next.nodes[state.ids.cards[0]].responsive.mobile!.hidden = false;
    } });
    expect(shown.ok).toBe(false);
    if (!shown.ok) expect(shown.message).toContain("不能填满适应内容宽度的父容器");
    expect(shown.definition).toEqual(hidden.definition);
  }
});

test("隔离属性：既有合法 viewport 与分布策略准确回显，不伪装未设置", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "建立已有策略前置", exact: true }).click();
  const distribution = page.locator('[data-template-design-property="node.justifyContent"]').getByRole("combobox", { name: "水平对齐", exact: true });
  // 旧 Grid 改为 flex 后没有 direction，必须与 Renderer 默认的横向排列一致。
  await expect(distribution).toHaveValue("space-around");
  await expect(distribution.locator('option:checked')).toHaveText("当前值：space-around（保留）");
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  const heightMode = page.getByRole("combobox", { name: "高度方式", exact: true });
  await expect(heightMode).toHaveValue("viewport");
  await expect(heightMode.locator('option[value="viewport"]')).toHaveJSProperty("disabled", true);
  const height = page.getByRole("spinbutton", { name: "视口相对高度", exact: true });
  await expect(height).toHaveValue("50");
  const units = page.getByRole("combobox", { name: "视口相对高度单位", exact: true });
  await expect(units).toHaveValue("vh");
  await expect(units.locator("option")).toHaveText(["vh", "vw"]);
  const before = await snapshot(page);
  const renderedImage = page.getByTestId("render").locator(`[data-template-node-id="${before.ids.cards[0]}"]`);
  // 非画布 Renderer 没有模拟视口变量，vh 必须仍按所属窗口计算。
  await expect.poll(() => renderedImage.evaluate((element) => (
    element.getBoundingClientRect().height - element.ownerDocument.defaultView!.innerHeight * 0.5
  ))).toBe(0);
  await height.fill("60"); await height.press("Enter");
  const after = await snapshot(page);
  expect(after.history).toBe(before.history + 1);
  expect(after.definition.nodes[after.ids.cards[0]].responsive.desktop.height).toEqual({ mode: "viewport", value: { value: 60, unit: "vh" } });
  await expect.poll(() => renderedImage.evaluate((element) => (
    element.getBoundingClientRect().height - element.ownerDocument.defaultView!.innerHeight * 0.6
  ))).toBe(0);
});

test("隔离属性：多选焦点按轴显示共同和混合有效值，不借用首对象整对值", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  // 单选图片的精确百分比收在渐进披露里，先展开再填值。
  const y = page.getByRole("spinbutton", { name: "垂直焦点", exact: true });
  await y.fill("64"); await y.press("Enter");
  await page.getByRole("button", { name: "多选图片", exact: true }).click();
  await expect(page.locator('[data-template-design-property="focus.x"] [data-template-effective-value]')).toHaveText("实际生效：50%");
  await expect(page.locator('[data-template-design-property="focus.y"] [data-template-effective-value]')).toHaveText("实际生效：多个有效值");
});

test("隔离属性：手机画布标出继承桌面与手机覆盖，恢复继承不改桌面", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "mobile", exact: true }).click();
  const columns = page.locator('[data-template-design-property="node.columns"]');
  await expect(columns).toHaveAttribute("data-template-inheritance", "override");
  await expect(columns).toContainText("手机覆盖");
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  const height = page.locator('[data-template-design-property="node.height"]');
  await expect(height).toHaveAttribute("data-template-inheritance", "inherited");
  await expect(height).toContainText("继承桌面");
  await page.getByRole("button", { name: "选择网格", exact: true }).click();
  const before = await snapshot(page);
  await columns.getByRole("button", { name: "恢复继承", exact: true }).click();
  const after = await snapshot(page);
  expect(after.definition.nodes[after.ids.region].responsive.mobile.columns).toBeUndefined();
  expect(after.definition.nodes[after.ids.region].responsive.desktop.columns).toEqual(before.definition.nodes[before.ids.region].responsive.desktop.columns);
  await expect(columns).toHaveAttribute("data-template-inheritance", "inherited");
  await expect(columns).toContainText("继承桌面");
  await page.getByRole("button", { name: "desktop", exact: true }).click();
  const desktopColumns = page.locator('[data-template-design-property="node.columns"]');
  await expect(desktopColumns).not.toHaveAttribute("data-template-inheritance", /.+/);
  await expect(desktopColumns).toContainText("桌面基础");
});

test("确定性 UI：整体尺寸与外观分组，比例取消撤销及 Mock 保存重开保持设计", async ({ page }, testInfo) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await createBlankTemplate(page);
  await page.evaluate(async () => {
    const recipePath = "/src/page-builder/template-creation/presets.ts";
    const generatorPath = "/src/page-builder/template-creation/generateTemplateFromRecipe.ts";
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const [{ createRecommendedRecipe }, { generateTemplateFromRecipe }, { useTemplateEditorSession }] = await Promise.all([
      import(/* @vite-ignore */ recipePath), import(/* @vite-ignore */ generatorPath), import(/* @vite-ignore */ sessionPath),
    ]);
    const state = useTemplateEditorSession.getState();
    const definition = generateTemplateFromRecipe(createRecommendedRecipe("editorial-split"));
    // 保留主路由当前选中的草稿身份，让保存继续经过工作区控制器和模板 Repository。
    definition.templateId = state.draft!.definition.templateId;
    definition.name = "属性分组回读测试";
    const root = definition.nodes[definition.rootNodeId];
    root.responsive.desktop.padding = {
      top: { value: 2, unit: "rem" },
      right: { value: 16, unit: "px" },
      bottom: { value: 24, unit: "px" },
      left: { value: 32, unit: "px" },
    };
    root.responsive.mobile.padding = { left: { value: 8, unit: "px" } };
    root.responsive.mobile.margin = { top: { value: 8, unit: "px" } };
    const result = state.executeCommand({ type: "transform-definition", label: "建立属性分组验收模板", transform: () => definition });
    if (!result.ok) throw new Error(result.message);
    useTemplateEditorSession.getState().selectObject(definition.rootNodeId);
  });
  const inspector = page.getByRole("region", { name: "对象设计属性", exact: true });
  const dimensions = inspector.locator('[data-template-property-group="尺寸与位置"]');
  await expect(dimensions.getByRole("heading", { name: "模板整体尺寸与比例", exact: true })).toBeVisible();
  await expect(dimensions.getByRole("textbox", { name: "背景颜色", exact: true })).toHaveCount(0);
  await expect(dimensions.getByRole("button", { name: "按设计宽度查看", exact: true })).toHaveCount(0);
  const appearance = inspector.locator('[data-template-property-group="外观"]');
  await expect(appearance).toBeVisible();
  expect(await appearance.evaluate((element) => !element.closest("details:not([open])"))).toBe(true);
  await expect(appearance.getByRole("textbox", { name: "背景颜色", exact: true })).toBeVisible();
  await expect(inspector.getByRole("textbox", { name: "背景颜色", exact: true })).toHaveCount(1);
  const overallPadding = inspector.getByRole("group", { name: "整体留白", exact: true });
  await expect(overallPadding).toBeVisible();
  for (const value of [/上\s*2\s*rem/, /右\s*16\s*px/, /下\s*24\s*px/, /左\s*32\s*px/]) {
    await expect(overallPadding).toContainText(value);
  }
  const restorePadding = overallPadding.getByRole("button", { name: "恢复留白继承", exact: true });
  await expect(restorePadding).toHaveCount(0);
  const customPadding = inspector.getByRole("heading", { name: "自定义留白", exact: true });
  const paddingModel = inspector.locator('[data-template-spacing-model="padding"]');
  await expect(customPadding).toBeVisible();
  await expect(paddingModel).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("properties-overall.png"), animations: "disabled" });

  const paddingBefore = await readSession(page);
  const rootId = paddingBefore.definition!.rootNodeId;
  const rootBefore = paddingBefore.definition!.nodes[rootId];
  await inspector.getByRole("button", { name: "在画布调整留白", exact: true }).click();
  const doneSpacing = page.getByRole("button", { name: "完成间距调整", exact: true });
  const rightPadding = page.getByRole("button", { name: "拖动调整右内边距", exact: true });
  await expect(doneSpacing).toBeFocused();
  await expect(rightPadding).toBeVisible();
  expect((await readSession(page)).historyPast).toEqual(paddingBefore.historyPast);
  await rightPadding.press("ArrowLeft");
  const spacingEdit = await readSession(page);
  expect(spacingEdit.definition!.nodes[rootId].responsive.desktop.padding?.right).toEqual({ value: 17, unit: "px" });
  expect(spacingEdit.historyPast).toHaveLength(paddingBefore.historyPast.length + 1);
  await doneSpacing.press("Escape");
  await expect(rightPadding).toBeHidden();
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await readSession(page)).definition).toEqual(paddingBefore.definition);
  await expect(paddingModel).toBeVisible();
  const topPadding = paddingModel.getByRole("spinbutton", { name: "上内边距", exact: true });
  await expect(topPadding).toHaveValue("2");
  await expect(paddingModel.getByRole("combobox", { name: "上内边距单位", exact: true })).toHaveValue("rem");
  await paddingModel.screenshot({ path: testInfo.outputPath("properties-spacing-main.png"), animations: "disabled" });
  await topPadding.fill("-1");
  await topPadding.press("Enter");
  await expect(topPadding).toHaveAttribute("aria-invalid", "true");
  await expect(topPadding).toBeVisible();
  expect((await readSession(page)).definition).toEqual(paddingBefore.definition);
  await topPadding.press("Escape");
  await expect(topPadding).toHaveValue("2");
  await expect(paddingModel).toBeVisible();

  await page.getByRole("button", { name: /^移动端模板布局/ }).click();
  await expect(overallPadding).toContainText(/左\s*8\s*px/);
  await expect(restorePadding).toBeVisible();
  expect((await readSession(page)).definition).toEqual(paddingBefore.definition);
  expect((await readSession(page)).historyPast).toEqual(paddingBefore.historyPast);
  await restorePadding.click();
  await expect(overallPadding).toContainText(/左\s*32\s*px/);
  await expect(restorePadding).toHaveCount(0);
  const mobilePadding = await readSession(page);
  expect(mobilePadding.historyPast).toHaveLength(paddingBefore.historyPast.length + 1);
  const mobileRoot = mobilePadding.definition!.nodes[rootId];
  const expectedMobile = { ...rootBefore.responsive.mobile };
  delete expectedMobile.padding;
  expect(mobileRoot.responsive.mobile).toEqual(expectedMobile);
  expect(mobileRoot.responsive.desktop).toEqual(rootBefore.responsive.desktop);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(overallPadding).toContainText(/左\s*8\s*px/);
  await expect(restorePadding).toBeVisible();
  expect((await readSession(page)).definition).toEqual(paddingBefore.definition);
  await page.getByRole("button", { name: /^桌面端模板布局/ }).click();

  const designWidthSettings = dimensions.locator(".template-native__design-width");
  const designWidth = designWidthSettings.getByRole("spinbutton", { name: "设计宽度", exact: true });
  const widthBefore = await readSession(page);
  const savedWidth = await designWidth.inputValue();
  await designWidth.fill("0");
  await designWidth.press("Enter");
  await expect(designWidth).toHaveAttribute("aria-invalid", "true");
  await expect(designWidth).toBeVisible();
  await expect(designWidth).toHaveValue("0");
  expect((await readSession(page)).definition).toEqual(widthBefore.definition);
  expect((await readSession(page)).historyPast).toEqual(widthBefore.historyPast);
  await designWidth.press("Escape");
  await expect(designWidth).toHaveValue(savedWidth);
  await expect(designWidth).toBeVisible();

  const heightMode = dimensions.getByRole("combobox", { name: "高度方式", exact: true });
  const ratios = dimensions.getByRole("group", { name: "模板整体比例预设", exact: true });
  expect(await ratios.evaluate((element) => {
    const heightProperty = element.closest('[data-template-property-group="尺寸与位置"]')
      ?.querySelector('[data-template-design-property="node.height"]');
    return Boolean(heightProperty && (element.compareDocumentPosition(heightProperty) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
  await heightMode.selectOption("auto");
  const ratioOption = heightMode.locator('option[value="aspect-ratio"]');
  await expect(ratioOption).toHaveJSProperty("disabled", true);
  await expect(ratioOption).toContainText("请使用上方画幅预设");
  await expect(dimensions.getByText("比例来源", { exact: true })).toHaveCount(0);
  await expect(dimensions.getByText("尺寸与预览规则", { exact: true })).toHaveCount(0);
  const before = await readSession(page);
  await ratios.getByRole("button", { name: "4:3", exact: true }).click();
  await page.getByRole("button", { name: "取消比例预览", exact: true }).click();
  expect((await readSession(page)).definition).toEqual(before.definition);
  expect((await readSession(page)).historyPast).toHaveLength(before.historyPast.length);
  await ratios.getByRole("button", { name: "4:3", exact: true }).click();
  await page.getByRole("button", { name: "确认对象比例", exact: true }).click();
  const changed = await readSession(page);
  expect(changed.historyPast).toHaveLength(before.historyPast.length + 1);
  expect(changed.definition!.nodes[changed.definition!.rootNodeId].responsive.desktop.height).toEqual({ mode: "aspect-ratio", ratio: { width: 4, height: 3 } });
  await expect(heightMode).toHaveValue("aspect-ratio");
  await expect(dimensions.getByRole("spinbutton", { name: /^比例[宽高]$/ })).toHaveCount(0);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await readSession(page)).definition).toEqual(before.definition);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  expect((await readSession(page)).definition).toEqual(changed.definition);
  await saveTemplate(page);
  await expect.poll(() => server.saveResults.length).toBe(1);
  await expect.poll(async () => (await readSession(page)).dirty).toBe(false);
  expect(server.persisted!.draft!.definition).toEqual(changed.definition);
  await page.reload();
  await page.getByRole("button", { name: "模板设计", exact: true }).click();
  await page.getByRole("button", { name: /(?:打开|正在编辑)属性分组回读测试模板/ }).click();
  await expect.poll(async () => (await readSession(page)).definition).toEqual(changed.definition);
});

test("确定性 UI：手机随内容可明确转换为标准双端画幅，取消和撤销完整恢复", async ({ page }, testInfo) => {
  await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await createBlankTemplate(page);
  await page.evaluate(async () => {
    const recipePath = "/src/page-builder/template-creation/presets.ts";
    const generatorPath = "/src/page-builder/template-creation/generateTemplateFromRecipe.ts";
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const [{ createRecommendedRecipe }, { generateTemplateFromRecipe }, { useTemplateEditorSession }] = await Promise.all([
      import(/* @vite-ignore */ recipePath), import(/* @vite-ignore */ generatorPath), import(/* @vite-ignore */ sessionPath),
    ]);
    const state = useTemplateEditorSession.getState();
    const definition = generateTemplateFromRecipe(createRecommendedRecipe("editorial-split"));
    definition.templateId = state.draft!.definition.templateId;
    definition.metadata.geometryPolicy = "hero-media-frame";
    definition.nodes[definition.rootNodeId].responsive.mobile.height = { mode: "auto" };
    const result = state.executeCommand({ type: "transform-definition", label: "建立手机随内容尺寸场景", transform: () => definition });
    if (!result.ok) throw new Error(result.message);
    useTemplateEditorSession.getState().selectObject(definition.rootNodeId);
    useTemplateEditorSession.getState().setDevice("mobile");
  });
  const inspector = page.getByRole("region", { name: "对象设计属性", exact: true });
  const dimensions = inspector.locator('[data-template-property-group="尺寸与位置"]');
  const heightMode = dimensions.getByRole("combobox", { name: "高度方式", exact: true });
  const ratios = dimensions.getByRole("group", { name: "模板整体比例预设", exact: true });
  const measurement = dimensions.getByLabel("当前画布对象外框尺寸", { exact: true });
  const readout = page.locator(".template-editor__canvas-view-readout");
  await expect(heightMode).toHaveValue("auto");
  await expect(measurement).toContainText("本节当前尺寸 · 只读");
  await expect(measurement).toContainText("跟随桌面");
  await expect(measurement.getByText("比例来源", { exact: true })).toHaveCount(0);
  await expect(readout).toHaveText(/^本节尺寸 宽 390 px × 高 \d+ px · 标准比例 (?:21:9|2:1|16:9|3:2|4:3|5:4|1:1|1:2|4:5|3:4|2:3|9:16)$/);
  const standardRatio = ((await readout.innerText()).match(/标准比例 (\d+:\d+)/) ?? [])[1];
  await expect(measurement).toContainText(standardRatio);
  await expect(ratios.locator('button[aria-pressed="true"]')).toHaveCount(0);
  await expect(ratios).toContainText("确认后，桌面和手机一起应用所选画幅");
  const before = await readSession(page);
  await page.getByRole("spinbutton", { name: "画布缩放百分比", exact: true }).fill("80");
  await page.getByRole("spinbutton", { name: "画布缩放百分比", exact: true }).press("Enter");
  expect((await readSession(page)).definition).toEqual(before.definition);
  expect((await readSession(page)).historyPast).toEqual(before.historyPast);
  await ratios.getByRole("button", { name: "9:16", exact: true }).click();
  await expect(heightMode).toHaveValue("auto");
  await expect(measurement).toContainText("9:16");
  await expect(page.getByRole("group", { name: "确认对象比例", exact: true })).toContainText("桌面 16:9，手机 9:16");
  await expect(ratios.getByRole("button", { name: "9:16", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "取消比例预览", exact: true }).click();
  await expect(heightMode).toHaveValue("auto");
  expect((await readSession(page)).definition).toEqual(before.definition);
  expect((await readSession(page)).historyPast).toEqual(before.historyPast);
  await ratios.getByRole("button", { name: "9:16", exact: true }).click();
  await page.getByRole("button", { name: "确认对象比例", exact: true }).click();
  const changed = await readSession(page);
  const rootId = changed.definition!.rootNodeId;
  expect(changed.definition!.metadata.geometryPolicy).toBe("paired-canvas");
  expect(changed.definition!.nodes[rootId].responsive.mobile.height).toEqual({ mode: "auto" });
  expect(changed.definition!.nodes[rootId].responsive.desktop.height).toEqual({ mode: "aspect-ratio", ratio: { width: 16, height: 9 } });
  expect(changed.historyPast).toHaveLength(before.historyPast.length + 1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(heightMode).toHaveValue("auto");
  expect((await readSession(page)).definition).toEqual(before.definition);
  await page.screenshot({ path: testInfo.outputPath("mobile-auto-size.png"), animations: "disabled" });
  // 手机已有非标准独立比例时，桌面卡片不得误称整对画幅已应用。
  await page.evaluate(async () => {
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ sessionPath);
    const state = useTemplateEditorSession.getState();
    const result = state.executeCommand({ type: "update-definition", label: "建立独立手机比例场景", update: (definition: TemplateDefinitionV2) => {
      definition.metadata.geometryPolicy = "paired-canvas";
      const root = definition.nodes[definition.rootNodeId];
      root.responsive.desktop.height = { mode: "aspect-ratio", ratio: { width: 16, height: 9 } };
      root.responsive.mobile.height = { mode: "aspect-ratio", ratio: { width: 7, height: 11 } };
    } });
    if (!result.ok) throw new Error(result.message);
    useTemplateEditorSession.getState().setDevice("desktop");
  });
  await expect(ratios.getByRole("button", { name: "16:9", exact: true })).toHaveAttribute("aria-pressed", "false");
  const independent = await readSession(page);
  await page.getByRole("button", { name: /^移动端模板布局/ }).click();
  await expect(heightMode).toHaveValue("aspect-ratio");
  await expect(dimensions.getByRole("spinbutton", { name: /^比例[宽高]$/ })).toHaveCount(0);
  expect((await readSession(page)).definition).toEqual(independent.definition);
  expect((await readSession(page)).historyPast).toEqual(independent.historyPast);
  await ratios.getByRole("button", { name: "9:16", exact: true }).click();
  await page.getByRole("button", { name: "取消比例预览", exact: true }).click();
  expect((await readSession(page)).definition).toEqual(independent.definition);
  expect((await readSession(page)).historyPast).toEqual(independent.historyPast);
});

test("隔离属性：留白盒模型保留单位、四边联动单次撤销，手机覆盖可逐项恢复", async ({ page }, testInfo) => {
  await mount(page);
  await expect(page.getByRole("group", { name: "整体留白", exact: true })).toHaveCount(0);
  const model = page.locator('[data-template-spacing-model="padding"]');
  await expect(model).toBeVisible();
  const top = model.locator('[data-template-design-property="node.padding.top"]');
  const topInput = top.getByRole("spinbutton", { name: "上内边距", exact: true });
  await topInput.fill("7");
  await topInput.press("Enter");
  await top.getByRole("combobox", { name: "上内边距单位", exact: true }).selectOption("%");
  const baseline = await snapshot(page);
  expect(baseline.definition.nodes[baseline.ids.region].responsive.desktop.padding.top).toEqual({ value: 7, unit: "%" });
  await page.getByRole("checkbox", { name: "四边内边距联动", exact: true }).check();
  await topInput.fill("9");
  await topInput.press("Enter");
  let changed = await snapshot(page);
  for (const side of ["top", "right", "bottom", "left"]) {
    expect(changed.definition.nodes[changed.ids.region].responsive.desktop.padding[side]).toEqual({ value: 9, unit: "%" });
  }
  expect(changed.history).toBe(baseline.history + 1);
  await page.screenshot({ path: testInfo.outputPath("properties-spacing.png"), animations: "disabled" });
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).definition).toEqual(baseline.definition);
  await page.getByRole("button", { name: "mobile", exact: true }).click();
  await page.getByRole("checkbox", { name: "四边内边距联动", exact: true }).check();
  await topInput.fill("12");
  await topInput.press("Enter");
  changed = await snapshot(page);
  expect(changed.definition.nodes[changed.ids.region].responsive.desktop).toEqual(baseline.definition.nodes[baseline.ids.region].responsive.desktop);
  for (const side of ["top", "right", "bottom", "left"]) {
    expect(changed.definition.nodes[changed.ids.region].responsive.mobile.padding[side]).toEqual({ value: 12, unit: "%" });
  }
  await expect(top).toHaveAttribute("data-template-inheritance", "override");
  await top.getByRole("button", { name: "恢复继承", exact: true }).click();
  const restored = await snapshot(page);
  expect(restored.definition.nodes[restored.ids.region].responsive.mobile.padding.top).toBeUndefined();
  expect(restored.definition.nodes[restored.ids.region].responsive.desktop).toEqual(baseline.definition.nodes[baseline.ids.region].responsive.desktop);
  await expect(top).toHaveAttribute("data-template-inheritance", "inherited");
  await expect(topInput).toHaveValue("7");
});

test("确定性 UI：图片默认内容直接编辑，取景焦点只有一个完整入口", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await mount(page);
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  const before = await snapshot(page);
  await page.evaluate(async () => {
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ sessionPath);
    const state = useTemplateEditorSession.getState();
    const draft = structuredClone(state.draft);
    draft.definition.schemaVersion = 3;
    state.open(draft);
  });
  const content = page.locator('[data-template-default-content][data-template-default-content-kind="image"]');
  await expect(content).toHaveCount(1);
  await expect(content.locator(":scope > summary")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "图片适配", exact: true })).toBeVisible();
  await expect(page.locator("[data-image-focus-field]")).toHaveCount(1);
  const baseline = await snapshot(page);
  await expect(content.getByRole("textbox", { name: "默认图片说明", exact: true })).toBeVisible();
  await expect(content.locator("[data-image-focus-field]")).toHaveCount(0);
  await expect(page.locator("[data-image-focus-field]")).toHaveCount(1);
  expect((await snapshot(page)).definition).toEqual(baseline.definition);
  expect((await snapshot(page)).history).toBe(baseline.history);
  expect(baseline.definition.nodes).toEqual(before.definition.nodes);
});
