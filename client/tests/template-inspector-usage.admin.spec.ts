import { expect, test, type Page } from "@playwright/test";

test.use({ channel: process.env.TEMPLATE_BROWSER_CHANNEL });

async function mountInspector(page: Page) {
  await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/__template-inspector-usage", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div><script type="module" src="/tests/fixtures/template-properties-page-scope.tsx"></script></body></html>` }));
  await page.goto("/__template-inspector-usage", { waitUntil: "load" });
  await expect(page.getByRole("tabpanel", { name: "页面开放范围", exact: true })).toBeVisible();
}

test("确定性 UI：空白模板先显示整体尺寸与比例，模板设置按需展开且职责可撤销", async ({ page }) => {
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
  const templateName = page.getByRole("textbox", { name: "模板名称", exact: true });
  const usage = page.getByRole("region", { name: "模板名称与页面职责", exact: true });
  await expect(templateName).toHaveValue("空白职责测试");
  await expect(usage).toBeHidden();
  await page.getByText("模板设置", { exact: true }).click();
  await expect(usage).toBeVisible();
  await expect(usage.getByText("辅助区用于说明、补充图文或配套内容，不占用页面的主舞台名额。", { exact: true })).toBeVisible();
  await expect(page.locator('[data-template-inspector-field="metadata.category"]')).toHaveCount(0);
  const before = await page.evaluate(() => {
    const state = window.__templateScopeSession.getState();
    return { role: state.draft!.definition.metadata.visualRole, history: state.historyPast.length };
  });
  await usage.getByRole("button", { name: "页面视觉职责：主舞台", exact: true }).click();
  await expect(usage.getByText(/同一页面可按运营需要重复添加/)).toBeVisible();
  expect(await page.evaluate(() => window.__templateScopeSession.getState().historyPast.length)).toBe(before.history + 1);
  await page.evaluate(() => window.__templateScopeSession.getState().undo());
  expect(await page.evaluate(() => window.__templateScopeSession.getState().draft!.definition.metadata.visualRole)).toBe(before.role);
  await usage.getByText("首屏导航兼容", { exact: true }).click();
  await expect(usage.getByText(/页面首个可见内容位置/)).toBeVisible();
  await usage.getByRole("button", { name: "模板资料与使用限制", exact: true }).click();
  await expect(page.getByText(/仅用于目录推荐，不限制其他页面使用/)).toBeVisible();
  await expect(page.locator('[data-template-inspector-field="metadata.visualRole"]')).toHaveCount(1);
  await expect(page.locator('[data-template-inspector-field="metadata.headerCompatibility"]')).toHaveCount(1);
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
  for (const breakpoint of ["desktop", "tablet", "mobile"] as const) {
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
  const preview = page.locator(".template-editor__page-form-preview");
  await preview.getByText("查看页面字段 · 2 项 · 只读", { exact: true }).click();
  const fields = preview.locator(".template-editor__page-form-field");
  await expect(fields).toHaveCount(2);
  await expect(fields.nth(0).getByText(/当前查看范围第 1 项/)).toBeVisible();
  await expect(fields.nth(0).getByRole("button", { name: "工艺主图 必填 · 定位对象", exact: true })).toBeVisible();
  await expect(fields.nth(0).getByText("内容只读 · 页面可隐藏", { exact: true })).toBeVisible();
  await expect(fields.nth(1).getByText("页面可填写 · 页面不可手动隐藏", { exact: true })).toBeVisible();
  await expect(fields.nth(1).getByRole("textbox", { name: "工艺标题页面表单示意", exact: true })).toHaveAttribute("readonly", "");
  expect(await snapshot()).toEqual(before);
  await fields.nth(1).getByRole("button", { name: "工艺标题 可选 · 定位对象", exact: true }).click();
  expect(await snapshot()).toEqual(before);
  await expect(page.locator('[data-template-page-scope-field="label"] input')).toHaveValue("工艺标题");
});
