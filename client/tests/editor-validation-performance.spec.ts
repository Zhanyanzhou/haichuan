import { expect, test, type Page, type Route } from "@playwright/test";

async function installProbe(page: Page, validate: (route: Route) => Promise<void>) {
  await page.clock.install();
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/document/validate")) return validate(route);
    const data = path.endsWith("/document/admin") ? {
      pageKey: "products", status: "DRAFT", version: 1, metadata: {},
      puckData: { root: { props: {} }, content: [], zones: {} },
    } : null;
    return route.fulfill({ json: { code: 200, data } });
  });
  await page.route("**/__validation-performance", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><meta charset="utf-8"><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script></head><body><div id="root"></div><script type="module" src="/tests/fixtures/page-validation-performance.tsx"></script></body></html>`,
  }));
  await page.goto("/__validation-performance");
  await expect(page.locator("output")).toHaveAttribute("data-ready", "true");
  await page.clock.runFor(650);
  await expect(page.locator("output")).toHaveText("valid");
}

test("连续输入只立即执行脏状态比较，预检遍历延后到防抖触发", async ({ page }, testInfo) => {
  test.skip(process.env.PLAYWRIGHT_APP_MODE === "mock", "真实控制器配合 HTTP 夹具");
  let requests = 0;
  let lastValue: number | undefined;
  await installProbe(page, async (route) => {
    requests += 1;
    lastValue = route.request().postDataJSON().puckData.root.props.workProbe;
    await route.fulfill({ json: { code: 200, data: { valid: true, errors: [], issues: [] } } });
  });
  const before = requests;
  for (let value = 0; value < 10; value += 1) {
    await page.evaluate((next) => window.validationProbe.change(next), value);
    await expect(page.locator("output")).toHaveAttribute("data-iteration", String(value));
    await page.clock.runFor(1);
  }
  await expect(page.locator("output")).toHaveAttribute("data-dirty", "true");
  expect(requests).toBe(before);
  const readsWhileTyping = await page.evaluate(() => window.validationProbe.reads);
  expect(readsWhileTyping).toBe(10);
  await page.clock.runFor(650);
  await expect.poll(() => requests).toBe(before + 1);
  await expect(page.locator("output")).toHaveText("valid");
  expect(lastValue).toBe(9);
  await testInfo.attach("input-work", {
    body: JSON.stringify({ changes: 10, readsWhileTyping, validationRequestsAfterPause: requests - before }),
    contentType: "application/json",
  });
});

test("防抖期间和请求途中再次编辑时，不应用旧内容的预检结论", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_APP_MODE === "mock", "真实控制器配合 HTTP 夹具");
  let releaseOld!: () => void;
  let oldStarted = false;
  const oldResponse = new Promise<void>((resolve) => { releaseOld = resolve; });
  const values: Array<number | undefined> = [];
  await installProbe(page, async (route) => {
    const value = route.request().postDataJSON().puckData.root.props.workProbe;
    values.push(value);
    if (value === 1) {
      oldStarted = true;
      await oldResponse;
      await route.fulfill({ json: { code: 200, data: {
        valid: false, errors: ["obsolete-content"],
        issues: [{ code: "obsolete-content", severity: "error", message: "obsolete-content" }],
      } } }).catch(() => {});
      return;
    }
    await route.fulfill({ json: { code: 200, data: { valid: true, errors: [], issues: [] } } });
  });
  await page.evaluate(() => window.validationProbe.change(1));
  await expect(page.locator("output")).toHaveAttribute("data-iteration", "1");
  await page.clock.runFor(650);
  await expect.poll(() => oldStarted).toBe(true);
  await page.evaluate(() => window.validationProbe.change(2));
  await expect(page.locator("output")).toHaveAttribute("data-iteration", "2");
  releaseOld();
  await expect(page.locator("output")).toHaveText("validating");
  await page.clock.runFor(650);
  await expect(page.locator("output")).toHaveText("valid");
  expect(values).toEqual([undefined, 1, 2]);
  await expect(page.locator("output")).toHaveAttribute("data-dirty", "true");
});
