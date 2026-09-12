import { expect, test, type Page } from "@playwright/test";
async function mount(page: Page) {
  await page.route("**/__template-native-responsive", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div><script type="module" src="/tests/fixtures/template-native-responsive.tsx"></script></body></html>` }));
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/__template-native-responsive");
  await page.getByText("复制与恢复设计组", { exact: true }).click();
}
const snapshot = async (page: Page) => JSON.parse(await page.getByTestId("state").textContent() ?? "{}");

test("确定性属性：三断点分组复制预览与取消零写入，确认一次历史且可以撤销", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "tablet", exact: true }).click();
  const before = await snapshot(page);
  await page.getByRole("checkbox", { name: "布局", exact: true }).check();
  await page.getByRole("button", { name: "检查所选组差异", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("应用后：[1,1,1]");
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole("button", { name: "检查所选组差异", exact: true }).click();
  await page.getByRole("button", { name: "确认应用", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const after = await snapshot(page), id = before.ids.grid;
  expect(after.definition.nodes[id].responsive.tablet.columns).toEqual([1, 1, 1]);
  expect(after.definition.nodes[id].responsive.tablet.gap).toEqual(before.definition.nodes[id].responsive.tablet.gap);
  expect(after.definition.nodes[id].responsive.mobile).toEqual(before.definition.nodes[id].responsive.mobile);
  expect(after.history).toBe(before.history + 1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).definition).toEqual(before.definition);
  await page.getByRole("button", { name: "mobile", exact: true }).click();
  await page.getByRole("combobox", { name: "复制设计的来源设备" }).selectOption("tablet");
  await page.getByRole("checkbox", { name: "布局", exact: true }).check();
  await page.getByRole("button", { name: "检查所选组差异", exact: true }).click();
  await page.getByRole("button", { name: "确认应用", exact: true }).click();
  expect((await snapshot(page)).definition.nodes[id].responsive.mobile.columns).toEqual([1, 1]);
});

test("确定性属性：按组恢复最近保存，保留未选组及其他断点", async ({ page }) => {
  await mount(page);
  const saved = await snapshot(page);
  await page.getByRole("button", { name: "mobile", exact: true }).click();
  await page.getByRole("button", { name: "修改手机间距和高度", exact: true }).click();
  const changed = await snapshot(page), id = changed.ids.grid;
  await page.getByRole("button", { name: "恢复最近保存", exact: true }).click();
  await page.getByRole("checkbox", { name: "间距与对齐", exact: true }).check();
  await page.getByRole("button", { name: "检查所选组差异", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("当前：99 px");
  await expect(page.getByRole("dialog")).toContainText("应用后：6 px");
  await page.getByRole("button", { name: "确认应用", exact: true }).click();
  const restored = await snapshot(page);
  expect(restored.definition.nodes[id].responsive.mobile.gap).toEqual(saved.definition.nodes[id].responsive.mobile.gap);
  expect(restored.definition.nodes[id].responsive.mobile.padding).toEqual(saved.definition.nodes[id].responsive.mobile.padding);
  expect(restored.definition.nodes[id].responsive.mobile.height).toEqual(changed.definition.nodes[id].responsive.mobile.height);
  expect(restored.definition.nodes[id].responsive.tablet).toEqual(saved.definition.nodes[id].responsive.tablet);
  expect(restored.history).toBe(changed.history + 1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await snapshot(page)).definition).toEqual(changed.definition);
});

test("确定性属性：多选排除结构锁，取消与确认均保留锁定对象", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "多选含锁定网格", exact: true }).click();
  await page.getByRole("button", { name: "tablet", exact: true }).click();
  const before = await snapshot(page);
  await page.getByRole("checkbox", { name: "布局", exact: true }).check();
  await page.getByRole("button", { name: "检查所选组差异", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("1 个锁定对象");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole("button", { name: "检查所选组差异", exact: true }).click();
  await page.getByRole("button", { name: "确认应用", exact: true }).click();
  const after = await snapshot(page);
  expect(after.definition.nodes[before.ids.locked]).toEqual(before.definition.nodes[before.ids.locked]);
  expect(after.definition.nodes[before.ids.grid].responsive.tablet.columns).toEqual([1, 1, 1]);
  expect(after.history).toBe(before.history + 1);
});

test("确定性属性：文字组复制影响只读Renderer，复制到桌面不覆盖其他设备独立值", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page);
  await page.getByRole("button", { name: "选择标题", exact: true }).click();
  await page.getByRole("button", { name: "mobile", exact: true }).click();
  await page.getByRole("combobox", { name: "复制设计的来源设备" }).selectOption("tablet");
  await page.getByRole("checkbox", { name: "文字或媒体", exact: true }).check();
  await page.getByRole("button", { name: "检查所选组差异", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).not.toHaveClass(/ant-zoom/);
  await page.screenshot({ path: "test-results/native-responsive/narrow-confirmation.png", fullPage: true });
  await page.getByRole("button", { name: "确认应用", exact: true }).click();
  await expect(page.getByTestId("render").getByText("中性测试标题", { exact: true })).toHaveCSS("font-size", "24px");
  await page.getByRole("button", { name: "desktop", exact: true }).click();
  await page.getByRole("combobox", { name: "复制设计的来源设备" }).selectOption("mobile");
  const before = await snapshot(page), slotId = before.definition.nodes[before.ids.heading].slotId;
  await page.getByRole("checkbox", { name: "文字或媒体", exact: true }).check();
  await page.getByRole("button", { name: "检查所选组差异", exact: true }).click();
  await page.getByRole("button", { name: "确认应用", exact: true }).click();
  const after = await snapshot(page);
  expect(after.definition.slots[slotId].desktopRules.fontSize).toEqual({ value: 24, unit: "px" });
  expect(after.definition.slots[slotId].tabletRules).toEqual(before.definition.slots[slotId].tabletRules);
  expect(after.definition.slots[slotId].mobileRules).toEqual(before.definition.slots[slotId].mobileRules);
  expect(after.definition.slots[slotId]).toEqual({ ...before.definition.slots[slotId], desktopRules: { ...before.definition.slots[slotId].desktopRules, fontSize: { value: 24, unit: "px" } } });
  expect(after.definition.defaultContent).toEqual(before.definition.defaultContent);
  expect(await page.locator("aside").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.locator(".ant-modal-wrap")).toBeHidden();
  await page.screenshot({ path: "test-results/native-responsive/narrow-panel.png", fullPage: true });
});

test("确定性属性：无保存基线明确禁用恢复", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "无保存基线", exact: true }).click();
  await page.getByRole("button", { name: "恢复最近保存", exact: true }).click();
  await expect(page.getByText("模板尚未保存，没有可恢复的保存基线。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "检查所选组差异", exact: true })).toBeDisabled();
});

test("确定性属性：复制不合法尺寸整体拒绝，保留原状态与可取消错误", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "选择标题", exact: true }).click();
  await page.getByRole("button", { name: "mobile", exact: true }).click();
  const before = await snapshot(page);
  await page.getByRole("checkbox", { name: "尺寸与位置", exact: true }).check();
  await page.getByRole("button", { name: "检查所选组差异", exact: true }).click();
  await page.getByRole("button", { name: "确认应用", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
