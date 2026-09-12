import { test, expect, type Page } from "@playwright/test";

const readState = async (page: Page) => JSON.parse(await page.getByTestId("state").textContent() ?? "{}");
test.beforeEach(async ({ page }) => {
  await page.route("**/__number-field-transactions", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div><script type="module" src="/tests/fixtures/number-field-transactions.tsx"></script></body></html>` }));
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/__number-field-transactions");
  await expect(page.getByRole("spinbutton", { name: "高度", exact: true })).toBeVisible();
});

test("确定性数值 UI：提交回调重检门禁不递归，其他非法字段仍阻断且修正后可重试", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const guarded = page.getByRole("spinbutton", { name: "门禁数值", exact: true });
  await guarded.fill("834"); await guarded.press("Enter");
  expect((await readState(page)).events).toEqual([{ kind: "guarded", value: 834 }]);
  const height = page.getByRole("spinbutton", { name: "高度", exact: true });
  await height.fill("5001"); await height.press("Enter");
  await guarded.fill("390"); await guarded.press("Enter");
  await expect(height).toBeFocused();
  await expect(height).toHaveAttribute("aria-invalid", "true");
  expect((await readState(page)).guardedValue).toBe(834);
  await height.fill("44"); await height.press("Enter");
  await guarded.press("Enter");
  await expect(guarded).not.toHaveAttribute("aria-invalid", "true");
  expect((await readState(page)).guardedValue).toBe(390);
  expect((await readState(page)).events.filter((event: { kind: string }) => event.kind === "guarded")).toEqual([{ kind: "guarded", value: 834 }, { kind: "guarded", value: 390 }]);
  expect(errors).toEqual([]);
});

test("确定性数值 UI：仅聚焦、Enter 和失焦不提交显示取整，默认调用保留精度", async ({ page }) => {
  const input = page.getByRole("spinbutton", { name: "高度", exact: true });
  await expect(input).toHaveValue("1436.18");
  await expect(page.getByRole("spinbutton", { name: "默认精度", exact: true })).toHaveValue("1436.180371352785");
  await input.focus();
  await expect(input).toHaveValue("1436.180371352785");
  await input.press("Enter");
  await expect(input).toHaveValue("1436.18");
  await input.focus();
  await page.getByRole("button", { name: "离开属性" }).click();
  expect((await readState(page)).events).toEqual([]);
  expect((await readState(page)).value).toBe(1436.180371352785);
  const legacyInput = page.getByRole("spinbutton", { name: "默认精度", exact: true });
  await legacyInput.fill("21.123456");
  await legacyInput.blur();
  expect((await readState(page)).events).toEqual([{ kind: "default", value: 21.123456 }]);
});

test("确定性数值 UI：精确输入 Enter 单次提交，Esc 取消预览并恢复", async ({ page }) => {
  const input = page.getByRole("spinbutton", { name: "高度", exact: true });
  await input.fill("35.123456789");
  expect((await readState(page)).preview).toBe(35.123456789);
  await input.press("Enter");
  await page.getByRole("button", { name: "离开属性" }).click();
  await expect(input).toHaveValue("35.12");
  expect((await readState(page)).events).toEqual([{ kind: "value", value: 35.123456789 }]);
  await input.fill("88.8888");
  await input.press("Escape");
  await expect(input).toHaveValue("35.12");
  expect((await readState(page)).events).toHaveLength(1);
  expect((await readState(page)).preview).toBeNull();
  await input.focus();
  await expect(input).toHaveValue("35.123456789");
});

test("确定性数值 UI：未提交合法输入与单位原子提交，无旧值覆盖", async ({ page }) => {
  const input = page.getByRole("spinbutton", { name: "高度", exact: true });
  const unit = page.getByRole("combobox", { name: "高度单位", exact: true });
  await input.fill("27.123456");
  await input.press("Tab");
  await expect(unit).toBeFocused();
  expect((await readState(page)).events).toEqual([]);
  await unit.selectOption("%");
  await page.getByRole("button", { name: "离开属性" }).click();
  expect(await readState(page)).toMatchObject({ value: 27.123456, unit: "%", preview: null,
    events: [{ kind: "unit", value: 27.123456, unit: "%" }] });
  await expect(input).toHaveValue("27.12");
});

test("确定性数值 UI：只经过单位不更改仍提交草稿，直接切单位保持原始精度", async ({ page }) => {
  const input = page.getByRole("spinbutton", { name: "高度", exact: true });
  const unit = page.getByRole("combobox", { name: "高度单位", exact: true });
  await unit.selectOption("vh");
  expect((await readState(page)).events).toEqual([{ kind: "unit", value: 1436.180371352785, unit: "vh" }]);
  await input.fill("42.012345");
  await input.press("Tab");
  await unit.press("Tab");
  expect((await readState(page)).events).toEqual([
    { kind: "unit", value: 1436.180371352785, unit: "vh" }, { kind: "value", value: 42.012345 },
  ]);
});

test("确定性数值 UI：非法、空和越界输入阻止单位切换，保留纠错内容", async ({ page }) => {
  const input = page.getByRole("spinbutton", { name: "高度", exact: true });
  const unit = page.getByRole("combobox", { name: "高度单位", exact: true });
  for (const invalid of ["nope", "", "5001"]) {
    await input.fill(invalid);
    await input.press("Tab");
    await unit.selectOption("%");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(invalid);
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(unit).toHaveValue("px");
    expect((await readState(page)).events).toEqual([]);
  }
  await input.press("Escape");
  await expect(input).toHaveValue("1436.18");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("确定性数值 UI：单位聚焦期间 Esc 放弃待提交数值", async ({ page }) => {
  const input = page.getByRole("spinbutton", { name: "高度", exact: true });
  await input.fill("42.42");
  await input.press("Tab");
  await page.getByRole("combobox", { name: "高度单位", exact: true }).press("Escape");
  await expect(input).toHaveValue("1436.18");
  expect((await readState(page)).events).toEqual([]);
  expect((await readState(page)).preview).toBeNull();
});

test("确定性数值 UI：拖动从原始精度开始，一次提交，窄面板同行不溢出", async ({ page }) => {
  const label = page.locator('label').filter({ hasText: /^高度$/ });
  const bounds = await label.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + 12, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 22, bounds!.y + bounds!.height / 2, { steps: 3 });
  await page.mouse.up();
  const state = await readState(page);
  expect(state.value).toBeCloseTo(1437.180371352785, 10);
  expect(state.events).toHaveLength(1);
  const field = page.getByRole("spinbutton", { name: "高度", exact: true }).locator("..");
  expect(await field.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
