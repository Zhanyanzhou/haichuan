import { test, expect, type Page } from "@playwright/test";
async function mount(page: Page) {
  await page.route("**/__template-layout-conversion", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div><script type="module" src="/tests/fixtures/template-layout-conversion.tsx"></script></body></html>` }));
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/__template-layout-conversion");
  await expect(page.getByRole("button", { name: "预览自由排列", exact: true })).toBeVisible();
}
const read = async (page: Page) => JSON.parse(await page.getByTestId("state").textContent() ?? "{}");
test("隔离布局：自由转换扣除内边距保持位置、取消零写入、确认一次历史并往返", async ({ page }) => {
  await mount(page); const before = await read(page);
  const child = page.locator(`[data-template-node-id="${before.cards[0]}"]`);
  const box = await child.boundingBox();
  await page.getByRole("button", { name: "预览自由排列", exact: true }).click();
  await expect(page.getByRole("table", { name: "布局转换断点影响" })).toBeVisible();
  expect((await read(page)).history).toBe(0);
  const previewBox = await child.boundingBox();
  for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(previewBox![key] - box![key])).toBeLessThan(1.5);
  await page.keyboard.press("Escape");
  expect((await read(page)).definition).toEqual(before.definition);
  await page.getByRole("button", { name: "预览自由排列", exact: true }).click();
  await page.getByRole("button", { name: "确认排列转换" }).click();
  const saved = await read(page); expect(saved.history).toBe(1); expect(saved.definition.nodes[saved.stack].responsive.desktop.layoutMode).toBe("free");
  await page.getByRole("button", { name: "撤销", exact: true }).click(); expect((await read(page)).definition).toEqual(before.definition);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await page.getByRole("button", { name: "保存格式往返" }).click(); expect((await read(page)).definition).toEqual(saved.definition);
});
test("隔离布局：Tablet从自由转网格仅写覆盖并自动回流，列比例走同一事务", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "预览自由排列", exact: true }).click(); await page.getByRole("button", { name: "确认排列转换" }).click();
  await page.getByRole("button", { name: "tablet", exact: true }).click();
  await page.getByRole("button", { name: "预览网格排列", exact: true }).click(); await page.getByRole("button", { name: "确认排列转换" }).click();
  const state = await read(page); expect(state.definition.nodes[state.stack].responsive.desktop.layoutMode).toBe("free"); expect(state.definition.nodes[state.stack].responsive.tablet.layoutMode).toBe("flow");
  for (const id of state.cards) expect(state.definition.nodes[id].responsive.tablet.placement).toBeNull();
  const ratio = page.getByRole("spinbutton", { name: "第 1 列比例" }); await ratio.fill("2"); expect((await read(page)).history).toBe(2); await ratio.press("Enter"); expect((await read(page)).history).toBe(3);
  const changed = await read(page); expect(changed.definition.nodes[changed.stack].responsive.tablet.columns).toEqual([2, 1, 1]);
  await page.getByRole("button", { name: "模拟列分隔线意图" }).click();
  const resized = await read(page); const columns = resized.definition.nodes[resized.stack].responsive.tablet.columns; expect(columns[0] + columns[1]).toBeCloseTo(3); expect(columns[0]).toBeGreaterThan(2);
});
test("隔离布局：未呈现容器不猜测自由几何，横纵换行转换均可取消", async ({ page }) => {
  await mount(page); const before = await read(page);
  for (const label of ["上下排列", "左右排列", "自动换行", "网格排列"]) { await page.getByRole("button", { name: `预览${label}`, exact: true }).click(); await page.getByRole("button", { name: "取消排列转换" }).click(); expect((await read(page)).definition).toEqual(before.definition); }
  await page.getByRole("button", { name: "切换画布呈现" }).click(); await page.getByRole("button", { name: "预览自由排列", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("未呈现此容器"); expect((await read(page)).history).toBe(0); expect((await read(page)).preview).toBe(false);
});
