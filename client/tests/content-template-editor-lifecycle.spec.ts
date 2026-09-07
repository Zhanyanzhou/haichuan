import { expect, test, type Page } from "@playwright/test";

type Diagnostics = {
  subscribers: number;
  activeListeners: Record<"message" | "resize" | "blur", number>;
  addedListeners: Record<"message" | "resize" | "blur", number>;
  removedListeners: Record<"message" | "resize" | "blur", number>;
  clearNodeCalls: number;
  cancelledGestureMessages: number;
};

function fixtureHtml() {
  return `<!doctype html>
    <html lang="zh-CN">
      <head><meta charset="utf-8" /></head>
      <body>
        <div id="root"></div>
        <script type="module">
          import RefreshRuntime from "/@react-refresh";
          RefreshRuntime.injectIntoGlobalHook(window);
          window.$RefreshReg$ = () => {};
          window.$RefreshSig$ = () => (type) => type;
          window.__vite_plugin_react_preamble_installed__ = true;
        </script>
        <script type="module" src="/tests/fixtures/content-template-editor-lifecycle.tsx"></script>
      </body>
    </html>`;
}

async function diagnostics(page: Page) {
  return page.evaluate(() => window.__contentTemplateEditorLifecycle()) as Promise<Diagnostics>;
}

test("public/catalog 不订阅编辑会话，编辑面严格注册并清理生命周期资源", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.route(/\/__content-template-editor-lifecycle(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: fixtureHtml(),
  }));
  await page.goto("/__content-template-editor-lifecycle");

  const baseline = await diagnostics(page);
  expect(baseline.subscribers).toBe(0);
  expect(baseline.activeListeners).toEqual({ message: 0, resize: 0, blur: 0 });

  for (const surface of ["public", "catalog"] as const) {
    await page.getByRole("button", { name: surface, exact: true }).click();
    await expect(page.locator("[data-active-surface]")).toHaveText(surface);
    await expect.poll(async () => (await diagnostics(page)).subscribers).toBe(0);
    const mounted = await diagnostics(page);
    expect(mounted.activeListeners).toEqual({ message: 0, resize: 0, blur: 0 });
    expect(mounted.clearNodeCalls).toBe(0);
    expect(mounted.cancelledGestureMessages).toBe(0);

    await page.getByRole("button", { name: "none", exact: true }).click();
    await expect(page.locator("[data-active-surface]")).toHaveText("none");
    await page.waitForTimeout(150);
    const unmounted = await diagnostics(page);
    expect(unmounted.subscribers).toBe(0);
    expect(unmounted.activeListeners).toEqual({ message: 0, resize: 0, blur: 0 });
    expect(unmounted.clearNodeCalls).toBe(0);
    expect(unmounted.cancelledGestureMessages).toBe(0);
  }

  await page.getByRole("button", { name: "editor", exact: true }).click();
  await expect(page.locator("[data-active-surface]")).toHaveText("editor");
  await expect.poll(async () => (await diagnostics(page)).subscribers).toBe(10);
  const editorMounted = await diagnostics(page);
  expect(editorMounted.activeListeners).toEqual({ message: 1, resize: 2, blur: 1 });

  const media = page.locator('[data-content-role="coverImage"]').first();
  await expect(media).toBeVisible();
  const box = await media.boundingBox();
  if (!box) throw new Error("编辑器媒体槽位没有可交互尺寸");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.locator(".hc-contract-frame")).toHaveAttribute("data-hc-gesture-phase", "begin");
  await page.getByRole("button", { name: "none", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  await page.mouse.up();
  await expect(page.locator("[data-active-surface]")).toHaveText("none");
  await page.waitForTimeout(150);

  const editorUnmounted = await diagnostics(page);
  expect(editorUnmounted.subscribers).toBe(0);
  expect(editorUnmounted.activeListeners).toEqual({ message: 0, resize: 0, blur: 0 });
  expect(editorUnmounted.addedListeners).toEqual({ message: 1, resize: 2, blur: 1 });
  expect(editorUnmounted.removedListeners).toEqual({ message: 1, resize: 2, blur: 1 });
  expect(editorUnmounted.clearNodeCalls).toBe(1);
  expect(editorUnmounted.cancelledGestureMessages).toBe(0);
});
