import { expect, test } from "@playwright/test";
test("隔离并排视图：共用文档的三列/两列/单列、隐藏提示、同ID聚焦零写入", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.exposeFunction("__recordComparisonError", (message: string) => errors.push(message));
  await page.addInitScript(() => {
    const target = window as unknown as { __comparisonErrors: string[]; __recordComparisonError: (message: string) => Promise<void> };
    target.__comparisonErrors = [];
    window.addEventListener("error", (event) => {
      if (!event.message) return;
      target.__comparisonErrors.push(event.message);
      void target.__recordComparisonError(event.message);
    });
  });
  await page.route("**/__template-breakpoint-comparison", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div><script type="module" src="/tests/fixtures/template-breakpoint-comparison.tsx"></script></body></html>` }));
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/__template-breakpoint-comparison");
  await expect(page.getByRole("button", { name: "聚焦 Tablet", exact: true })).toBeVisible();
  const initial = JSON.parse(await page.getByTestId("comparison-state").textContent() ?? "{}");
  for (const [name, count] of [["Desktop", 3], ["Tablet", 2], ["Mobile", 1]] as const) {
    const grid = page.frameLocator(`iframe[title="${name} 模板内容"]`).locator(`[data-template-node-id="${initial.grid}"]`);
    await expect(grid).toBeVisible();
    await expect.poll(() => grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(count);
  }
  await expect(page.getByRole("region", { name: "Mobile 并排预览" }).getByRole("status")).toHaveText("当前选中对象在此断点隐藏或不可见");
  await page.frameLocator('iframe[title="Tablet 模板内容"]').locator(`[data-template-node-id="${initial.cards[1]}"]`).click();
  await expect.poll(async () => JSON.parse(await page.getByTestId("comparison-state").textContent() ?? "{}")).toMatchObject({ selected: initial.cards[1], focus: "tablet", unchanged: true });
  await page.getByRole("button", { name: "聚焦 Mobile", exact: true }).click();
  await expect.poll(async () => JSON.parse(await page.getByTestId("comparison-state").textContent() ?? "{}")).toMatchObject({ selected: initial.cards[1], focus: "mobile", unchanged: true });
  await page.evaluate(async () => {
    for (let index = 0; index < 2; index++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  const frameErrors = await Promise.all(page.frames().map((frame) => frame.evaluate(() => (
    window as unknown as { __comparisonErrors?: string[] }
  ).__comparisonErrors ?? [])));
  expect([...errors, ...frameErrors.flat()], "三个源文档并排测量不得产生原生浏览器异常").toEqual([]);
});
