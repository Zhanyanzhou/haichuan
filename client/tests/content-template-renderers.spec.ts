import { expect, test } from "@playwright/test";

const fixturePage = `<!doctype html>
<html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>首屏模板 Renderer</title></head>
<body><div id="root"></div><script type="module">
import RefreshRuntime from "/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script><script type="module" src="/tests/fixtures/content-template-renderers.tsx"></script></body></html>`;

test("公开 Renderer 只渲染首屏合同并保留真实渲染标记", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("requestfailed", (request) => runtimeErrors.push(`${request.url()}: ${request.failure()?.errorText ?? "request failed"}`));
  page.on("response", (response) => {
    if (response.status() >= 400) runtimeErrors.push(`${response.status()} ${response.url()}`);
  });
  page.on("console", (entry) => {
    if (entry.type() === "error") runtimeErrors.push(entry.text());
  });
  await page.route(/\/__content-template-renderer(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: fixturePage,
  }));
  await page.route("**/images/test-hero.svg", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#dedede"/></svg>',
  }));
  await page.goto("/__content-template-renderer");
  const fixture = page.locator('[data-renderer-fixture="fixed-hero"]');
  const frame = fixture.locator('[data-content-template-contract="hero"]');
  const bodyText = await page.locator("body").innerText();
  await expect(frame, [...runtimeErrors, bodyText].filter(Boolean).join("\n")).toHaveCount(1);
  await expect(frame).toHaveAttribute("data-content-template-renderer", "real");
  await expect(fixture.getByRole("heading", { name: "首屏模板测试" })).toBeVisible();
  await expect(fixture.locator('[data-content-template="hero"]')).toHaveCount(1);
});

test("公开 Renderer 只展示页面实例明确上传图片的动态模板", async ({ page }) => {
  await page.route(/\/__content-template-renderer(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: fixturePage,
  }));
  await page.route("**/images/*.svg", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#dedede"/></svg>',
  }));

  await page.goto("/__content-template-renderer");

  await expect(page.locator(
    '[data-renderer-fixture="fixed-hero-without-image"] [data-content-template="hero"]',
  )).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "缺图时不应公开的标题" })).toHaveCount(0);
  await expect(page.locator(
    '[data-renderer-fixture="dynamic-without-image"] [data-dynamic-template-instance-id]',
  )).toHaveCount(0);
  const publishedInstance = page.locator(
    '[data-renderer-fixture="dynamic-with-image"] [data-dynamic-template-instance-id="instance_with_image"]',
  );
  await expect(publishedInstance).toHaveCount(1);
  await expect(publishedInstance.locator('img[alt="页面上传图"]')).toBeVisible();
});

test("公开 Renderer 按页面顺序展示多个有图首屏", async ({ page }) => {
  await page.route(/\/__content-template-renderer(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: fixturePage,
  }));
  await page.route("**/images/test-hero.svg", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#dedede"/></svg>',
  }));

  await page.goto("/__content-template-renderer");

  const fixture = page.locator('[data-renderer-fixture="multiple-fixed-heroes"]');
  await expect(fixture.locator('[data-content-template="hero"]')).toHaveCount(2);
  await expect(fixture.getByRole("heading", { name: "首屏模板测试" })).toBeVisible();
  await expect(fixture.getByRole("heading", { name: "第二个首屏模板" })).toBeVisible();
  await expect(fixture.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(fixture.getByRole("heading", { level: 2 })).toHaveCount(1);
});
