import { test, expect, type Page } from "@playwright/test";
import { executeDynamicTemplateDefinitionCommand, type TemplateDefinitionV2 } from "../src/page-builder/template-definition";
import { applyBasicSkeleton, createBlankTemplate, installNewTemplateServer, readSession } from "./fixtures/template-authoring-main-route";
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
async function openPropertyGroup(page: Page, name: string) {
  const group = page.locator(`details[data-template-property-group="${name}"]`);
  if (await group.count() && !(await group.getAttribute("open") !== null)) await group.locator(":scope > summary").click();
}

async function selectStructureTarget(page: Page, targetId: string) {
  const structureTrigger = page.getByRole("button", { name: "展开模板结构面板", exact: true });
  if (await structureTrigger.isVisible()) await structureTrigger.click();
  await page.getByRole("tree", { name: "模板区域与槽位" })
    .locator(`[role="treeitem"][data-selection-target-id="${targetId}"]`)
    .click();
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
  await page.getByText("断点显示与继承", { exact: true }).click();
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
  const responsive = inspector.getByText("断点显示与继承", { exact: true });
  await expect(typography).toBeInViewport();
  expect((await typography.boundingBox())!.y).toBeLessThan((await inspector.getByRole("heading", { name: "尺寸与位置", exact: true }).boundingBox())!.y);
  expect((await typography.boundingBox())!.y).toBeLessThan((await responsive.boundingBox())!.y);
  await expect(inspector.getByRole("spinbutton", { name: "字号", exact: true })).toBeInViewport();
  await expect(inspector.locator('details[data-template-property-group="尺寸限制"]')).not.toHaveAttribute("open");
  await expect(inspector.locator('details[data-template-property-group="外观"]')).not.toHaveAttribute("open");
  expect(await inspector.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath(`properties-text-${viewportWidth}.png`) });
  const imageId = Object.values(state.definition!.nodes).find((node) => node.type === "ImageSlot")!.nodeId;
  await selectStructureTarget(page, imageId);
  const imageControls = inspector.getByRole("heading", { name: "图片适配与焦点", exact: true });
  const imageDimensions = inspector.getByRole("heading", { name: "尺寸与位置", exact: true });
  await expect(imageControls).toBeInViewport();
  await expect(inspector.getByRole("combobox", { name: "图片适配", exact: true })).toBeInViewport();
  expect((await imageControls.boundingBox())!.y).toBeLessThan((await imageDimensions.boundingBox())!.y);
  expect((await imageControls.boundingBox())!.y).toBeLessThan((await inspector.getByText("断点显示与继承", { exact: true }).boundingBox())!.y);
  await expect(inspector.getByRole("heading", { name: "文字排版", exact: true })).toHaveCount(0);
  expect(await inspector.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath(`properties-image-${viewportWidth}.png`) });
  expect(server.writes).toEqual([]);
});

test("主路由属性：空白零高区域可以从最小固定高度开始，隐藏不伪造测量", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const server = await installNewTemplateServer(page);
  await createBlankTemplate(page);
  const add = page.locator(".template-editor__canvas-add");
  await add.locator(":scope > summary").click();
  await add.getByText("布局区域与分组", { exact: true }).click();
  await add.getByRole("button", { name: "添加区域", exact: true }).click();
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
  await page.getByText("断点显示与继承", { exact: true }).click();
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
  const state = await readSession(page);
  const region = state.definition!.nodes[state.definition!.rootNodeId].childIds[0];
  await selectStructureTarget(page, region);
  const inspector = page.getByRole("region", { name: "对象设计属性", exact: true });
  const heightMode = inspector.getByRole("combobox", { name: "高度方式", exact: true });
  await expect(heightMode).toBeInViewport();
  const dimensions = inspector.getByRole("heading", { name: "尺寸与位置", exact: true });
  const layout = inspector.getByRole("heading", { name: "容器排列", exact: true });
  expect((await layout.boundingBox())!.y).toBeLessThan((await dimensions.boundingBox())!.y);
  expect((await dimensions.boundingBox())!.y).toBeLessThan((await inspector.getByText("断点显示与继承", { exact: true }).boundingBox())!.y);
  expect((await dimensions.boundingBox())!.y).toBeLessThan(650);
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
test("隔离属性：三断点列数继承、即时预览、一次提交与恢复继承", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "tablet", exact: true }).click();
  const columns = page.getByRole("spinbutton", { name: "网格列数", exact: true });
  await expect(columns).toHaveValue("2");
  await columns.fill("4");
  expect((await snapshot(page)).history).toBe(0);
  expect((await snapshot(page)).preview).toBe(true);
  await columns.press("Enter");
  expect((await snapshot(page)).history).toBe(1);
  const state = await snapshot(page);
  expect(state.definition.nodes[state.ids.region].responsive.tablet.columns).toEqual([1, 1, 1, 1]);
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
  const initial = await readSession(page);
  const region = initial.definition!.nodes[initial.definition!.rootNodeId].childIds[0];
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
  await openPropertyGroup(page, "尺寸限制");
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
  await openPropertyGroup(page, "尺寸限制");
  await openPropertyGroup(page, "外观");
  await page.getByRole("button", { name: "tablet", exact: true }).click();
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
  expect(state.definition.nodes[state.ids.region].responsive.tablet.gap).toEqual({ value: 27, unit: "px" });
  expect(state.definition.nodes[state.ids.region].responsive.desktop).toMatchObject({ width: expect.anything(), height: expect.anything(), display: "grid" });
  await page.getByRole("button", { name: "tablet", exact: true }).click();
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
  await openPropertyGroup(page, "尺寸限制");
  const maximum = page.locator('[data-template-design-property="node.maxWidth"]');
  await expect(maximum.getByRole("spinbutton", { name: "最大宽度", exact: true })).toHaveValue("");
  await expect(maximum.locator('[data-template-effective-value]')).toHaveText("实际生效：不限制");
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  const fit = page.locator('[data-template-design-property="slot.objectFit"]');
  await expect(fit.getByRole("combobox", { name: "图片适配", exact: true })).toHaveValue("cover");
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
  await openPropertyGroup(page, "外观");
  let radius = page.getByRole("spinbutton", { name: "圆角", exact: true });
  await radius.fill("12"); await radius.press("Enter");
  const before = await snapshot(page);
  await page.getByRole("button", { name: "多选图片", exact: true }).click();
  await openPropertyGroup(page, "外观");
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
  await openPropertyGroup(page, "外观");
  await page.getByRole("combobox", { name: "圆角单位", exact: true }).selectOption("rem");
  await page.getByRole("button", { name: "多选图片", exact: true }).click();
  await openPropertyGroup(page, "外观");
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
  await page.getByText("断点显示与继承", { exact: true }).click();
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
  await openPropertyGroup(page, "间距与对齐");
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
  await page.getByRole("combobox", { name: "图片适配", exact: true }).selectOption("contain");
  await page.getByRole("button", { name: "图片适配恢复系统默认", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "图片适配", exact: true })).toHaveValue("cover");
  let state = await snapshot(page);
  const slotId = state.definition.nodes[state.ids.cards[0]].slotId;
  expect(state.definition.slots[slotId].desktopRules.objectFit).toBeUndefined();
  await page.getByRole("button", { name: "tablet", exact: true }).click();
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
  expect(state.definition.slots[slotId].tabletRules.objectPosition).toBe("79% 50%");
  await expect(page.getByTestId("render").locator("img").first()).toHaveCSS("object-position", "50% 50%");
});

test("隔离属性：没有父级分配空间的根容器不开放填满高度", async ({ page }) => {
  await mount(page);
  const before = await snapshot(page);
  await page.getByRole("button", { name: "选择根容器", exact: true }).click();
  await page.locator('[data-template-design-property="node.height"]').getByText("查看尺寸方式限制", { exact: true }).click();
  await expect(page.getByRole("combobox", { name: "高度方式", exact: true }).locator('option[value="fill"]')).toHaveJSProperty("disabled", true);
  await expect(page.getByText("填满可用空间不可用：模板根容器没有可分配的父级高度，请使用固定、最小或比例高度", { exact: true })).toBeVisible();
  expect((await snapshot(page)).definition).toEqual(before.definition);
});

test("隔离属性：应用所有断点失败有原因且零写入，保留确认上下文", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  await openPropertyGroup(page, "尺寸限制");
  for (const [label, value] of [["最小宽度", "100"], ["最大宽度", "200"]]) {
    const input = page.getByRole("spinbutton", { name: label, exact: true }); await input.fill(value); await input.press("Enter");
  }
  await page.getByRole("button", { name: "tablet", exact: true }).click();
  for (const [label, value] of [["最小宽度", "50"], ["最大宽度", "80"]]) {
    const input = page.getByRole("spinbutton", { name: label, exact: true }); await input.fill(value); await input.press("Enter");
  }
  const before = await snapshot(page);
  const row = page.locator('[data-template-design-property="node.maxWidth"]');
  await row.locator(".template-native__property-metadata > summary").click();
  await row.getByRole("button", { name: "应用到所有断点", exact: true }).click();
  await row.getByRole("button", { name: "确认统一", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("最小尺寸不能大于最大尺寸");
  await expect(row.getByRole("group", { name: "确认统一最大宽度", exact: true })).toBeVisible();
  const after = await snapshot(page);
  expect(after.definition).toEqual(before.definition); expect(after.history).toBe(before.history);
});

test("隔离属性：全部恢复继承导致父子约束冲突时原子失败并解释", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "建立继承冲突前置", exact: true }).click();
  await page.getByRole("button", { name: "tablet", exact: true }).click();
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  const before = await snapshot(page);
  await page.getByText("断点显示与继承", { exact: true }).click();
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
      next.nodes[state.ids.region].responsive.tablet = { ...(next.nodes[state.ids.region].responsive.tablet ?? {}), width: "fit", ...(hideParent ? { hidden: true } : {}) };
      if (!hideParent) for (const id of state.ids.cards) next.nodes[id].responsive.tablet = { hidden: true };
    } });
    expect(hidden.ok).toBe(true);
    if (!hidden.ok) continue;
    const shown = executeDynamicTemplateDefinitionCommand(hidden.definition, { type: "update-definition", label: "恢复显示约束边界", update: (next) => {
      if (hideParent) next.nodes[state.ids.region].responsive.tablet!.hidden = false;
      else next.nodes[state.ids.cards[0]].responsive.tablet!.hidden = false;
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
  const y = page.getByRole("spinbutton", { name: "垂直焦点", exact: true });
  await y.fill("64"); await y.press("Enter");
  await page.getByRole("button", { name: "多选图片", exact: true }).click();
  await expect(page.locator('[data-template-design-property="focus.x"] [data-template-effective-value]')).toHaveText("实际生效：50%");
  await expect(page.locator('[data-template-design-property="focus.y"] [data-template-effective-value]')).toHaveText("实际生效：多个有效值");
});
