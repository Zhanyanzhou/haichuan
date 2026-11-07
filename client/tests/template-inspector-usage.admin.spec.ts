import { expect, test, type Page } from "@playwright/test";
import { findLaunchTemplateMaster } from "../src/page-builder/template-creation/launchTemplateSet";
import { installNewTemplateServer, makeResource, openTemplateDesignWithoutDraft, readSession } from "./fixtures/template-authoring-main-route";

test.use({ channel: process.env.TEMPLATE_BROWSER_CHANNEL });

async function mountInspector(page: Page) {
  await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/__template-inspector-usage", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div><script type="module" src="/tests/fixtures/template-properties-page-scope.tsx"></script></body></html>` }));
  await page.goto("/__template-inspector-usage", { waitUntil: "load" });
  await expect(page.getByRole("tabpanel", { name: "页面开放范围", exact: true })).toBeVisible();
}

test("确定性 UI：空白模板直接显示模板设置，职责修改可撤销", async ({ page }) => {
  await mountInspector(page);
  await page.evaluate(async () => {
    const moduleUrl = "/src/page-builder/template-editor/dynamicTemplateDraftRepository.ts";
    const { createNewDynamicTemplateDraft } = await import(/* @vite-ignore */ moduleUrl);
    const draft = createNewDynamicTemplateDraft("空白职责测试");
    const session = window.__templateScopeSession.getState();
    session.open(draft, { isNew: true });
    session.selectObject(draft.definition.rootNodeId);
    session.setInspectorTask("design");
  });
  const overall = page.getByRole("group", { name: "模板整体比例预设", exact: true });
  await expect(overall).toBeVisible();
  // 桌面给横版档位，手机给对换后的竖版档位（16:9 对 9:16，4:3 对 3:4）。
  await expect(overall.getByRole("button", { name: "16:9", exact: true })).toBeVisible();
  await expect(overall.getByRole("button", { name: "9:16", exact: true })).toHaveCount(0);
  await page.evaluate(() => window.__templateScopeSession.getState().setBreakpoint("mobile"));
  await expect(overall.getByRole("button", { name: "9:16", exact: true })).toBeVisible();
  await expect(overall.getByRole("button", { name: "3:4", exact: true })).toBeVisible();
  await expect(overall.getByRole("button", { name: "16:9", exact: true })).toHaveCount(0);
  await page.evaluate(() => window.__templateScopeSession.getState().setBreakpoint("desktop"));
  await expect(overall.getByRole("button", { name: "16:9", exact: true })).toBeVisible();
  const templateName = page.getByRole("textbox", { name: "模板名称", exact: true });
  const usage = page.getByRole("region", { name: "模板名称与页面职责", exact: true });
  await expect(templateName).toHaveValue("空白职责测试");
  await expect(usage).toBeVisible();
  await expect(usage.locator("summary")).toHaveCount(0);
  await expect(usage.getByText("辅助区用于说明、补充图文或配套内容，不占用页面的主舞台名额。", { exact: true })).toBeVisible();
  await expect(page.locator('[data-template-inspector-field="metadata.category"]')).toBeVisible();
  const before = await page.evaluate(() => {
    const state = window.__templateScopeSession.getState();
    return { role: state.draft!.definition.metadata.visualRole, history: state.historyPast.length };
  });
  await usage.getByRole("button", { name: "页面视觉职责：主舞台", exact: true }).click();
  await expect(usage.getByText(/同一页面可按运营需要重复添加/)).toBeVisible();
  expect(await page.evaluate(() => window.__templateScopeSession.getState().historyPast.length)).toBe(before.history + 1);
  await page.evaluate(() => window.__templateScopeSession.getState().undo());
  expect(await page.evaluate(() => window.__templateScopeSession.getState().draft!.definition.metadata.visualRole)).toBe(before.role);
  await expect(usage.getByText(/页面首个可见内容位置/)).toBeVisible();
  await expect(page.getByText(/仅用于目录推荐，不限制其他页面使用/)).toBeVisible();
  await expect(page.locator('[data-template-inspector-field="metadata.visualRole"]')).toHaveCount(1);
  await expect(page.locator('[data-template-inspector-field="metadata.headerCompatibility"]')).toHaveCount(1);
  await expect(page.getByText(/Tablet|平板端/)).toHaveCount(0);
  await expect(page.locator('[data-template-inspector-field="metadata.mobileBreakpoint"]')).toHaveCount(0);
  await expect(page.getByRole("spinbutton", { name: "小屏布局切换宽度", exact: true })).toHaveCount(0);
});

test("确定性 UI：切换当前设备不改变完整定义的制作检查结果", async ({ page }) => {
  await mountInspector(page);
  await page.evaluate(() => {
    const state = window.__templateScopeSession.getState();
    const draft = structuredClone(state.draft!);
    const imageId = window.__templateScopeIds.imageNodeId;
    const slot = draft.definition.slots[window.__templateScopeIds.imageSlotId];
    slot.editable = true;
    slot.hideable = false;
    draft.definition.nodes[imageId].responsive.mobile = { hidden: true };
    state.open(draft, { isNew: true });
    state.selectObject(draft.definition.rootNodeId);
    state.setInspectorTask("design");
  });
  const before = await page.evaluate(() => {
    const state = window.__templateScopeSession.getState();
    return { definition: state.draft!.definition, history: state.historyPast.length, dirty: state.dirty };
  });
  for (const breakpoint of ["desktop", "mobile"] as const) {
    await page.evaluate((value) => window.__templateScopeSession.getState().setBreakpoint(value), breakpoint);
    const validation = page.getByRole("region", { name: "模板制作检查", exact: true });
    await expect(validation).toContainText("必填槽位“工艺主图”在移动端布局中已隐藏");
    await expect(validation).not.toContainText("必填槽位“工艺主图”在桌面端布局中已隐藏");
    await expect(validation).not.toContainText("必填槽位“工艺主图”在平板端布局中已隐藏");
  }
  expect(await page.evaluate(() => {
    const state = window.__templateScopeSession.getState();
    return { definition: state.draft!.definition, history: state.historyPast.length, dirty: state.dirty };
  })).toEqual(before);
});

test("页面首屏：现有模板只展示常用画幅与排列，预览取消和撤销保留草稿（自有 API Mock）", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const server = await installNewTemplateServer(page);
  const definition = findLaunchTemplateMaster("page-hero")!;
  server.persisted = makeResource(definition, 3);
  await openTemplateDesignWithoutDraft(page);
  await page.getByRole("textbox", { name: "搜索模板" }).fill("单图海报");
  await page.getByRole("button", { name: /^打开单图海报模板/ }).click();
  await expect.poll(async () => (await readSession(page)).definition?.templateId).toBe(definition.templateId);
  const structure = page.getByRole("complementary", { name: "模板结构", exact: true });
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  await structure.getByRole("button", { name: "模板整体", exact: true }).click();
  const common = inspector.getByRole("region", { name: "首屏常用属性", exact: true });
  await expect(common).toBeVisible();
  const committed = async () => {
    const state = await readSession(page);
    return { definition: state.definition, history: state.historyPast.length, dirty: state.dirty };
  };
  const before = await committed();
  const frames = common.getByRole("group", { name: "模板整体比例预设", exact: true });
  await expect(frames).toBeVisible();
  await expect(frames.getByRole("button")).toHaveCount(3);
  for (const name of ["16:9", "2:1", "3:2"]) {
    await expect(frames.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(common.getByRole("group", { name: "标题与说明", exact: true })).toBeVisible();
  await expect(inspector.getByRole("combobox", { name: /高度方式|修改作用域/ })).toHaveCount(0);
  await expect(inspector.getByRole("spinbutton", { name: /比例宽|比例高|设计宽度|字号/ })).toHaveCount(0);
  await expect(inspector.getByText(/^(比例来源|尺寸与预览规则|整体留白|背景与边框|断点显示与继承|字体与换行)$/)).toHaveCount(0);

  const mobile = page.getByRole("button", { name: /^移动端模板布局/ });
  await mobile.click();
  await expect(mobile).toHaveAttribute("aria-pressed", "true");
  await expect(frames.getByRole("button")).toHaveCount(3);
  for (const name of ["9:16", "1:2", "2:3"]) {
    await expect(frames.getByRole("button", { name, exact: true })).toBeVisible();
  }
  expect(await committed()).toEqual(before);
  const desktop = page.getByRole("button", { name: /^桌面端模板布局/ });
  await desktop.click();
  await expect(desktop).toHaveAttribute("aria-pressed", "true");
  expect(await committed()).toEqual(before);

  const frame = frames.getByRole("button", { name: "2:1", exact: true });
  await frame.click();
  const cancelFrame = common.getByRole("button", { name: "取消比例预览", exact: true });
  await expect(cancelFrame).toBeVisible();
  expect(await committed()).toEqual(before);
  await cancelFrame.click();
  await expect(cancelFrame).toHaveCount(0);
  expect(await committed()).toEqual(before);
  await frame.click();
  await common.getByRole("button", { name: "确认对象比例", exact: true }).click();
  await expect(frame).toHaveAttribute("aria-pressed", "true");
  const applied = await committed();
  expect(applied.definition).not.toEqual(before.definition);
  expect(applied.history).toBe(before.history + 1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect.poll(committed).toEqual(before);

  const tree = structure.getByRole("tree", { name: "模板区域与槽位", exact: true });
  const title = Object.values(definition.nodes).find((node) => node.type === "HeadingSlot")!;
  await tree.locator(`[role="treeitem"][data-selection-target-id="${title.nodeId}"]`).click();
  await expect.poll(async () => (await readSession(page)).selectedObjectId).toBe(title.nodeId);
  await expect(inspector.getByRole("spinbutton", { name: "字号", exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("group", { name: "字重", exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("combobox", { name: /^(字重|字体)$/ })).toHaveCount(0);
  await expect(inspector.getByRole("region", { name: "模板默认内容", exact: true })).toHaveCount(0);

  const foreground = Object.values(definition.nodes).find((node) => node.name === "前景")!;
  await tree.locator(`[role="treeitem"][data-selection-target-id="${foreground.nodeId}"]`).click();
  await expect.poll(async () => (await readSession(page)).selectedObjectId).toBe(foreground.nodeId);
  const layouts = inspector.getByRole("group", { name: "选择容器排列方式", exact: true });
  await expect(layouts.getByRole("button")).toHaveCount(2);
  await expect(layouts.getByRole("button", { name: "预览左右排列", exact: true })).toBeVisible();
  await expect(layouts.getByRole("button", { name: "预览上下排列", exact: true })).toBeVisible();
  await expect(inspector.getByText("网格列比例", { exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("spinbutton", { name: /列比例|网格列数/ })).toHaveCount(0);
  await layouts.getByRole("button", { name: "预览左右排列", exact: true }).click();
  await expect(inspector.getByRole("button", { name: "确认排列转换", exact: true })).toBeVisible();
  await expect(inspector.getByRole("table", { name: "布局转换断点影响", exact: true })).toHaveCount(0);
  expect(await committed()).toEqual(before);
  await inspector.getByRole("button", { name: "取消排列转换", exact: true }).click();
  expect(await committed()).toEqual(before);
  await layouts.getByRole("button", { name: "预览左右排列", exact: true }).click();
  await inspector.getByRole("button", { name: "确认排列转换", exact: true }).click();
  expect((await committed()).definition?.nodes[foreground.nodeId].responsive.desktop.direction).toBe("row");
  expect((await committed()).history).toBe(before.history + 1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect.poll(committed).toEqual(before);
  const check = page.getByRole("button", { name: /^模板检查/ });
  await expect(check).toBeVisible();
  await check.click();
  await expect(inspector.getByRole("region", { name: "模板制作检查", exact: true })).toBeVisible();
  expect(await committed()).toEqual(before);
  expect(server.writes).toEqual([]);
});

test("确定性 UI：页面表单顺序和填写规则来自现有字段，查看与定位不修改模板", async ({ page }) => {
  await mountInspector(page);
  await page.evaluate(() => {
    window.__templateScopeSession.getState().selectObject(window.__templateScopeIds.rootId);
  });
  const snapshot = () => page.evaluate(() => {
    const state = window.__templateScopeSession.getState();
    return { definition: JSON.stringify(state.draft!.definition), dirty: state.dirty, history: state.historyPast.length };
  });
  const before = await snapshot();
  const rows = page.locator("[data-template-page-rule-row]");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("工艺主图");
  await expect(rows.nth(1)).toContainText("工艺标题");
  await expect(rows.nth(1)).toHaveAccessibleName("编辑工艺标题的页面使用规则");
  await expect(rows.nth(1)).toContainText("编辑规则");
  const preview = page.locator(".template-editor__page-form-preview");
  expect(await preview.evaluate((element) => {
    const rows = document.querySelectorAll("[data-template-page-rule-row]");
    const lastRow = rows.item(rows.length - 1);
    return Boolean(lastRow && (lastRow.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
  await preview.getByText("查看页面字段 · 2 项 · 只读", { exact: true }).click();
  const fields = preview.locator(".template-editor__page-form-field");
  await expect(fields).toHaveCount(2);
  await expect(fields.nth(0).getByText(/当前查看范围第 1 项/)).toBeVisible();
  await expect(fields.nth(0).getByRole("button", { name: "工艺主图 固定展示 · 定位对象", exact: true })).toBeVisible();
  await expect(fields.nth(0).getByText("内容只读 · 页面可隐藏", { exact: true })).toBeVisible();
  await expect(fields.nth(1).getByText("页面可填写 · 页面不可手动隐藏", { exact: true })).toBeVisible();
  await expect(fields.nth(1).getByRole("textbox", { name: "工艺标题页面表单示意", exact: true })).toHaveAttribute("readonly", "");
  expect(await snapshot()).toEqual(before);
  await fields.nth(1).getByRole("button", { name: "工艺标题 建议填写 · 定位对象", exact: true }).click();
  expect(await snapshot()).toEqual(before);
  await expect(page.locator('[data-template-page-scope-field="label"] input')).toHaveValue("工艺标题");
});

test("确定性 UI：页面规则清单明确可编辑，定位和返回不写模板", async ({ page }, testInfo) => {
  await mountInspector(page);
  await page.evaluate(() => window.__templateScopeSession.getState().selectObject(window.__templateScopeIds.rootId));
  const snapshot = () => page.evaluate(() => {
    const state = window.__templateScopeSession.getState();
    return { definition: structuredClone(state.draft!.definition), history: state.historyPast.length, dirty: state.dirty };
  });
  const before = await snapshot();
  const row = page.getByRole("button", { name: "编辑工艺标题的页面使用规则", exact: true });
  await expect(row).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("properties-page-rules.png"), animations: "disabled" });
  await row.click();
  await expect(page.locator('[data-template-page-scope-field="label"] input')).toHaveValue("工艺标题");
  expect(await snapshot()).toEqual(before);
  await expect(page.getByRole("switch", { name: "页面可填写内容", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "返回当前结构全部字段", exact: true }).click();
  await expect(page.locator("[data-template-page-rule-row]")).toHaveCount(2);
  expect(await snapshot()).toEqual(before);
});
