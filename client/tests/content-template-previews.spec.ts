import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { CONTENT_TEMPLATE_REGISTRY } from "../src/page-builder/generated/contentTemplates.generated";

const screenshotDir = path.resolve("test-results/content-template-previews");

function gallery(viewport: "desktop" | "mobile") {
  return `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; color: #292722; background: #ebe7e1; font: 12px/1.5 Arial, sans-serif; }
          main { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; padding: 24px; }
          .preview-card { min-width: 0; padding: 10px; border: 1px solid #d9d3c9; background: #fffefc; }
          .preview-card svg { display: block; width: 100%; height: auto; }
          .preview-card strong { display: block; margin-top: 8px; font-size: 13px; }
          @media (max-width: 720px) { main { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 12px; } }
        </style>
      </head>
      <body>
        <div id="root"></div>
        <script type="module">
          import RefreshRuntime from "/@react-refresh";
          RefreshRuntime.injectIntoGlobalHook(window);
          window.$RefreshReg$ = () => {};
          window.$RefreshSig$ = () => (type) => type;
          window.__vite_plugin_react_preamble_installed__ = true;
        </script>
        <script type="module" src="/tests/fixtures/content-template-preview-gallery.tsx?viewport=${viewport}"></script>
      </body>
    </html>`;
}

for (const viewport of ["desktop", "mobile"] as const) {
  test(`${viewport}：23 张模板缩略图使用统一画幅并保留合同顺序`, async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      const text = message.text();
      const isExpectedDevServerNoise = text.includes("WebSocket connection")
        || text.includes("[vite] failed to connect to websocket")
        || text.includes("Failed to send error to Vite server");
      if (message.type() === "error" && !isExpectedDevServerNoise) runtimeErrors.push(text);
    });
    await page.setViewportSize(viewport === "desktop"
      ? { width: 1440, height: 1000 }
      : { width: 390, height: 844 });
    await page.route(/\/__content-template-preview-gallery(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: gallery(viewport),
    }));
    await page.goto(`/__content-template-preview-gallery?viewport=${viewport}`);

    const previews = page.locator("[data-content-template-preview]");
    await page.waitForTimeout(500);
    expect(runtimeErrors, "预览测试页不应出现运行时错误").toEqual([]);
    await expect(previews).toHaveCount(CONTENT_TEMPLATE_REGISTRY.length);
    await expect(previews).toHaveCount(23);
    await expect.poll(() => page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);

    const expectedViewBox = viewport === "desktop" ? "0 0 300 186" : "0 0 180 228";
    for (const preview of await previews.all()) {
      await expect(preview).toHaveAttribute("viewBox", expectedViewBox);
      await expect(preview).toHaveAttribute("data-preview-viewport", viewport);
      await expect(preview).toHaveAttribute("data-desktop-order", /.+/);
      await expect(preview).toHaveAttribute("data-mobile-order", /.+/);
    }

    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({
      path: path.join(screenshotDir, `all-${viewport}.png`),
      fullPage: true,
    });
  });
}
