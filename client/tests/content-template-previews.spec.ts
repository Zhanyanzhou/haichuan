import { expect, test } from "@playwright/test";
import { CONTENT_TEMPLATE_REGISTRY } from "../src/page-builder/generated/contentTemplates.generated";

const fixturePage = (viewport: "desktop" | "mobile", variant: "structure" | "renderer") => `<!doctype html>
<html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>首屏模板预览</title></head>
<body><div id="root"></div><script type="module">
import RefreshRuntime from "/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script><script type="module" src="/tests/fixtures/content-template-preview-gallery.tsx?viewport=${viewport}&variant=${variant}"></script></body></html>`;

test("内置模板目录只登记首屏测试模板", () => {
  expect(CONTENT_TEMPLATE_REGISTRY.map((entry) => entry.key)).toEqual(["hero"]);
  expect(CONTENT_TEMPLATE_REGISTRY.map((entry) => entry.moduleType)).toEqual(["首屏主视觉"]);
});

for (const viewport of ["desktop", "mobile"] as const) {
  test(`${viewport} 目录只渲染一张首屏真实预览`, async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (entry) => {
      if (entry.type() === "error") runtimeErrors.push(entry.text());
    });
    await page.route(/\/__content-template-preview(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: fixturePage(viewport, "renderer"),
    }));
    await page.goto(`/__content-template-preview?viewport=${viewport}`);

    await expect(page.locator("article.preview-card"), runtimeErrors.join("\n")).toHaveCount(1);
    await expect(page.locator('[data-template-key="hero"]')).toBeVisible();
    const preview = page.locator('[data-content-template-preview="hero"]');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute("data-preview-viewport", viewport);
  });
}
