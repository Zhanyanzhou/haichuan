import { expect, test, type Page } from "@playwright/test";
import type { useTemplateEditorSession } from "../src/page-builder/template-editor/templateEditorSession";

declare global {
  interface Window {
    __templateScopeSession: typeof useTemplateEditorSession;
    __templateScopeIds: { imageNodeId: string; imageSlotId: string; textNodeId: string; rootId: string };
  }
}

test.use({ channel: process.env.TEMPLATE_BROWSER_CHANNEL });

async function mountScope(page: Page, width = 384) {
  page.on("pageerror", (error) => console.error("页面属性测试异常:", error.message));
  await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/__template-scope-review?*", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div><script type="module" src="/tests/fixtures/template-properties-page-scope.tsx"></script></body></html>` }));
  await page.goto(`/__template-scope-review?width=${width}`, { waitUntil: "load" });
  await expect(page.getByRole("tabpanel", { name: "页面开放范围", exact: true })).toBeVisible();
  return page.evaluate(() => window.__templateScopeIds);
}

async function mountLegacyDesign(page: Page, width = 384) {
  page.on("pageerror", (error) => console.error("旧模板属性测试异常:", error.stack ?? error.message));
  await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/__template-scope-review?*", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div><script type="module" src="/tests/fixtures/template-properties-page-scope.tsx"></script></body></html>` }));
  await page.goto(`/__template-scope-review?legacy-design&width=${width}`, { waitUntil: "load" });
  await expect(page.getByRole("region", { name: "槽位设计设置", exact: true })).toBeVisible();
  return page.evaluate(() => window.__templateScopeIds);
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const state = window.__templateScopeSession.getState();
    return { definition: JSON.stringify(state.draft!.definition), history: state.historyPast.length, dirty: state.dirty };
  });
}

test("确定性 UI：页面规则分组、只读字段查看与冲突修复保持一步撤销", async ({ page }) => {
  const ids = await mountScope(page);
  const panel = page.getByRole("tabpanel", { name: "页面开放范围", exact: true });
  for (const name of ["字段身份", "内容规则", "内容限制", "可调整设计"]) {
    await expect(panel.getByRole("region", { name, exact: true })).toBeVisible();
  }
  const before = await snapshot(page);
  await panel.getByText("查看页面字段 · 1 项 · 只读", { exact: true }).click();
  await expect(panel.getByRole("img", { name: "工艺主图：图片选择控件示意" })).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
  await panel.getByRole("button", { name: "允许填写并关闭隐藏", exact: true }).click();
  await expect(panel.getByRole("switch", { name: "页面可填写内容", exact: true })).toBeChecked();
  await expect(panel.getByRole("switch", { name: "页面可隐藏", exact: true })).not.toBeChecked();
  expect((await snapshot(page)).history).toBe(before.history + 1);
  await page.evaluate(() => {
    window.__templateScopeSession.getState().undo();
  });
  expect(await snapshot(page)).toEqual(before);
  await panel.getByRole("button", { name: "返回当前结构全部字段", exact: true }).click();
  await expect(panel.getByText("2 个字段 · 1 项必填 · 1 项规则冲突", { exact: true })).toBeVisible();
  await panel.getByText("查看页面字段 · 2 项 · 只读", { exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "工艺标题页面表单示意", exact: true })).toHaveAttribute("readonly", "");
  await panel.getByRole("button", { name: "工艺标题 可选 · 定位对象", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "模板属性", exact: true })).toHaveAttribute("data-template-inspector-object-id", ids.textNodeId);
});

test("确定性 UI：旧模板自定义图片比例保留非法文本、Enter/失焦提交、Escape 取消且适配 240px 属性区", async ({ page }) => {
  const ids = await mountLegacyDesign(page, 240);
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  const input = inspector.getByRole("textbox", { name: "自定义图片比例", exact: true });
  const before = await snapshot(page);

  await input.fill("0:3");
  await input.press("Enter");
  await expect(input).toHaveValue("0:3");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(inspector.getByRole("alert")).toHaveText("请输入有效图片比例，例如 12:5。");
  expect(await snapshot(page)).toEqual(before);

  await input.press("Escape");
  await expect(input).toHaveValue("4:3");
  await expect(input).not.toHaveAttribute("aria-invalid", "true");
  await input.fill("12:5");
  await input.press("Enter");
  const entered = await snapshot(page);
  expect(JSON.parse(entered.definition).slots[ids.imageSlotId].desktopRules.aspectRatio).toBe("12:5");
  expect(entered.history).toBe(before.history + 1);

  await input.fill("12::5");
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await expect(input).toHaveValue("12::5");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  expect(await snapshot(page)).toEqual(entered);
  await input.press("Escape");
  await expect(input).toHaveValue("12:5");

  await input.fill("7:3");
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await expect(input).toHaveValue("7:3");
  const blurred = await snapshot(page);
  expect(JSON.parse(blurred.definition).slots[ids.imageSlotId].desktopRules.aspectRatio).toBe("7:3");
  expect(blurred.history).toBe(entered.history + 1);

  await input.fill("x:y");
  await input.press("Enter");
  const layout = await inspector.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  const inputBox = await input.boundingBox();
  const errorBox = await inspector.getByRole("alert").boundingBox();
  const inspectorBox = await inspector.boundingBox();
  if (!inputBox || !errorBox || !inspectorBox) throw new Error("缺少比例输入或就近错误布局");
  expect(errorBox.x).toBeGreaterThanOrEqual(inputBox.x - 1);
  expect(errorBox.x + errorBox.width).toBeLessThanOrEqual(inspectorBox.x + inspectorBox.width + 1);
});

test("确定性 UI：旧模板响应式分组复制与恢复保留未选值、取消零提交、单步撤销并可保存重开", async ({ page }) => {
  const ids = await mountLegacyDesign(page);
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  const groups = inspector.getByRole("group", { name: "响应式设计组", exact: true });
  const imageDisplay = groups.getByRole("checkbox", { name: "图片显示", exact: true });
  await imageDisplay.check();
  const before = await snapshot(page);
  const beforeDefinition = JSON.parse(before.definition);

  await inspector.getByRole("button", { name: "复制当前画布到另一画布", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("只复制已选设计组中的中性设计值");
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole("dialog").getByRole("button", { name: /取\s*消/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(imageDisplay).toBeChecked();
  expect(await snapshot(page)).toEqual(before);

  await inspector.getByRole("button", { name: "复制当前画布到另一画布", exact: true }).click();
  await page.getByRole("button", { name: "确认替换", exact: true }).click();
  const copied = await snapshot(page);
  const copiedDefinition = JSON.parse(copied.definition);
  expect(copiedDefinition.slots[ids.imageSlotId].mobileRules).toMatchObject({
    aspectRatio: "4:3",
    objectFit: "cover",
    objectPosition: "left top",
  });
  expect(copiedDefinition.nodes[ids.imageNodeId].responsive.mobile.width)
    .toEqual(beforeDefinition.nodes[ids.imageNodeId].responsive.mobile.width);
  expect(copied.history).toBe(before.history + 1);
  await page.evaluate(() => window.__templateScopeSession.getState().undo());
  expect(await snapshot(page)).toEqual(before);

  await inspector.getByRole("button", { name: "复制当前画布到另一画布", exact: true }).click();
  await page.getByRole("button", { name: "确认替换", exact: true }).click();
  await page.evaluate((nodeId) => {
    const session = window.__templateScopeSession;
    const saved = structuredClone(session.getState().draft!);
    session.getState().markSaved(saved);
    session.getState().close();
    session.getState().open(saved);
    session.getState().selectObject(nodeId);
    session.getState().setDevice("mobile");
    session.getState().setInspectorTask("design");
  }, ids.imageNodeId);
  await expect(imageDisplay).toBeChecked();
  const customRatio = inspector.getByRole("textbox", { name: "自定义图片比例", exact: true });
  await expect(customRatio).toHaveValue("4:3");
  const reopened = await snapshot(page);
  expect(JSON.parse(reopened.definition).slots[ids.imageSlotId].mobileRules.aspectRatio).toBe("4:3");
  expect(reopened.history).toBe(0);
  expect(reopened.dirty).toBe(false);

  await customRatio.fill("9:16");
  await customRatio.press("Enter");
  const changed = await snapshot(page);
  expect(JSON.parse(changed.definition).slots[ids.imageSlotId].mobileRules.aspectRatio).toBe("9:16");
  await inspector.getByRole("button", { name: "恢复上次保存值", exact: true }).click();
  const restored = await snapshot(page);
  const restoredDefinition = JSON.parse(restored.definition);
  expect(restoredDefinition.slots[ids.imageSlotId].mobileRules.aspectRatio).toBe("4:3");
  expect(restoredDefinition.nodes[ids.imageNodeId].responsive.mobile.width)
    .toEqual(copiedDefinition.nodes[ids.imageNodeId].responsive.mobile.width);
  expect(restored.history).toBe(changed.history + 1);
  await page.evaluate(() => window.__templateScopeSession.getState().undo());
  expect(JSON.parse((await snapshot(page)).definition).slots[ids.imageSlotId].mobileRules.aspectRatio).toBe("9:16");

  await inspector.getByRole("button", { name: "恢复上次保存值", exact: true }).click();
  await page.evaluate((nodeId) => {
    const session = window.__templateScopeSession;
    const saved = structuredClone(session.getState().draft!);
    session.getState().markSaved(saved);
    session.getState().close();
    session.getState().open(saved);
    session.getState().selectObject(nodeId);
    session.getState().setDevice("mobile");
    session.getState().setInspectorTask("design");
  }, ids.imageNodeId);
  const savedReopened = await snapshot(page);
  expect(JSON.parse(savedReopened.definition).slots[ids.imageSlotId].mobileRules.aspectRatio).toBe("4:3");
  expect(savedReopened.history).toBe(0);
  expect(savedReopened.dirty).toBe(false);
});

test("确定性 UI：240px 属性区重排、键盘详情与明确必填组合动作", async ({ page }) => {
  const ids = await mountScope(page, 240);
  const panel = page.getByRole("tabpanel", { name: "页面开放范围", exact: true });
  await panel.locator(".template-editor__page-field-identity summary").focus();
  await page.keyboard.press("Enter");
  await expect(panel.getByText(ids.imageSlotId, { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "允许填写并关闭隐藏", exact: true }).click();
  await panel.getByRole("switch", { name: "页面必须填写", exact: true }).uncheck();
  await panel.getByRole("switch", { name: "页面可隐藏", exact: true }).check();
  const before = await snapshot(page);
  await panel.getByRole("button", { name: "设为必填、允许填写并关闭隐藏", exact: true }).click();
  await expect(panel.getByRole("switch", { name: "页面必须填写", exact: true })).toBeChecked();
  await expect(panel.getByRole("switch", { name: "页面可隐藏", exact: true })).not.toBeChecked();
  expect((await snapshot(page)).history).toBe(before.history + 1);
  const overflow = await panel.evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.width + 1);
  await page.screenshot({ path: "template-properties-page-scope-results/narrow-page-scope.png", fullPage: true });
});

test("确定性 UI：长度限制阻止反向范围，设计边界在关闭再开启后保留", async ({ page }) => {
  const ids = await mountScope(page);
  await page.evaluate((nodeId) => {
    window.__templateScopeSession.getState().selectObject(nodeId);
  }, ids.textNodeId);
  const panel = page.getByRole("tabpanel", { name: "页面开放范围", exact: true });
  const minimum = panel.getByRole("spinbutton", { name: "最小字数", exact: true });
  const before = await snapshot(page);
  await minimum.fill("40");
  await minimum.press("Enter");
  await expect(minimum).toHaveAttribute("aria-invalid", "true");
  expect(await snapshot(page)).toEqual(before);
  await minimum.press("Escape");
  await panel.getByRole("switch", { name: "允许调整文字样式", exact: true }).check();
  const maxFont = panel.getByRole("spinbutton", { name: "最大字号", exact: true });
  await maxFont.fill("60");
  await maxFont.press("Enter");
  await panel.getByRole("switch", { name: "允许调整文字样式", exact: true }).uncheck();
  await expect(maxFont).toHaveCount(0);
  await panel.getByRole("switch", { name: "允许调整文字样式", exact: true }).check();
  await expect(maxFont).toHaveValue("60");
});

test("确定性 UI：合同拒绝非整数内容限制时保留待纠正输入，Escape 恢复原值且不增加历史", async ({ page }) => {
  const ids = await mountScope(page);
  const panel = page.getByRole("tabpanel", { name: "页面开放范围", exact: true });
  await panel.getByRole("button", { name: "允许填写并关闭隐藏", exact: true }).click();
  const imageWidth = panel.getByRole("spinbutton", { name: "建议图片宽", exact: true });
  await imageWidth.fill("800");
  await imageWidth.press("Enter");
  const beforeImage = await snapshot(page);
  await imageWidth.fill("800.5");
  await imageWidth.press("Enter");
  await expect(imageWidth).toHaveAttribute("aria-invalid", "true");
  await expect(imageWidth).toHaveValue("800.5");
  await expect(panel.locator(".homepage-editor__field-error[role=alert]")).toBeVisible();
  expect(await snapshot(page)).toEqual(beforeImage);
  await imageWidth.press("Escape");
  await expect(imageWidth).toHaveValue("800");
  await expect(imageWidth).not.toHaveAttribute("aria-invalid", "true");
  await page.evaluate((nodeId) => window.__templateScopeSession.getState().selectObject(nodeId), ids.textNodeId);
  const maxLength = panel.getByRole("spinbutton", { name: "最大字数", exact: true });
  const beforeText = await snapshot(page);
  await maxLength.fill("12.5");
  await maxLength.press("Enter");
  await expect(maxLength).toHaveAttribute("aria-invalid", "true");
  await expect(maxLength).toHaveValue("12.5");
  expect(await snapshot(page)).toEqual(beforeText);
  await maxLength.press("Escape");
  await expect(maxLength).toHaveValue("36");
  await expect(maxLength).not.toHaveAttribute("aria-invalid", "true");
});

test("确定性 UI：图标文字输入不开放页面实例不支持的文字样式与间距", async ({ page }) => {
  const ids = await mountScope(page);
  await page.evaluate((nodeId) => {
    const state = window.__templateScopeSession.getState();
    state.executeCommand({ type: "update-definition", label: "建立图标测试对象", update: (next) => {
      const node = next.nodes[nodeId];
      node.type = "IconSlot";
      next.slots[node.slotId!].type = "icon";
      node.instanceEditPolicy = { ...node.instanceEditPolicy!, typography: true, spacing: true };
    } });
    state.selectObject(nodeId);
  }, ids.textNodeId);
  const panel = page.getByRole("tabpanel", { name: "页面开放范围", exact: true });
  const before = await snapshot(page);
  await expect(panel.getByText("图标 · 文字输入", { exact: true })).toBeVisible();
  await expect(panel.getByRole("switch", { name: "允许调整文字样式", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("spinbutton", { name: "最小字号", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("spinbutton", { name: "最大字号", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("switch", { name: "允许调整间距", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("spinbutton", { name: "最大间距", exact: true })).toHaveCount(0);
  await expect(panel.getByText("已保留原有文字样式、间距设置；当前对象的页面表单不支持这些调整。", { exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
  await page.evaluate((nodeId) => {
    const state = window.__templateScopeSession.getState();
    state.executeCommand({ type: "update-definition", label: "建立图片原有间距策略", update: (next) => {
      next.nodes[nodeId].instanceEditPolicy = { ...next.nodes[nodeId].instanceEditPolicy!, spacing: true };
    } });
    state.selectObject(nodeId);
  }, ids.imageNodeId);
  const beforeImage = await snapshot(page);
  await expect(panel.getByRole("switch", { name: "允许调整间距", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("spinbutton", { name: "最大间距", exact: true })).toHaveCount(0);
  await expect(panel.getByText("已保留原有间距设置；当前对象的页面表单不支持这些调整。", { exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(beforeImage);
});


test("确定性 UI：按钮文字限制沿用唯一页面规则主控、100000 上限和最小字数关系", async ({ page }) => {
  const ids = await mountScope(page);
  await page.evaluate((nodeId) => {
    const state = window.__templateScopeSession.getState();
    state.executeCommand({ type: "update-definition", label: "建立按钮文字规则", update: (next) => {
      const node = next.nodes[nodeId];
      node.type = "ButtonSlot";
      next.slots[node.slotId!].type = "button";
      next.slots[node.slotId!].validation = { minLength: 10001, maxLength: 20000 };
    } });
    state.selectObject(nodeId);
  }, ids.textNodeId);
  const panel = page.getByRole("tabpanel", { name: "页面开放范围", exact: true });
  const maximum = panel.getByRole("spinbutton", { name: "最大字数", exact: true });
  await expect(maximum).toHaveCount(1);
  await expect(maximum).toHaveValue("20000");
  await expect(maximum).toHaveAttribute("min", "10001");
  await expect(maximum).toHaveAttribute("max", "100000");
  const before = await snapshot(page);
  await maximum.fill("100000"); await maximum.press("Enter");
  await expect(maximum).toHaveValue("100000");
  const saved = await snapshot(page);
  expect(saved.history).toBe(before.history + 1);
  for (const value of ["100001", "10000"]) {
    await maximum.fill(value); await maximum.press("Enter");
    await expect(maximum).toHaveAttribute("aria-invalid", "true");
    expect(await snapshot(page)).toEqual(saved);
    await maximum.press("Escape");
  }
  await page.evaluate(() => window.__templateScopeSession.getState().undo());
  expect(await snapshot(page)).toEqual(before);
});
