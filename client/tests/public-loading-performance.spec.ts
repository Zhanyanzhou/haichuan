import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";
import { createRecommendedRecipe } from "../src/page-builder/template-creation/presets";
import { createRouteBarrier } from "./fixtures/public-catalog-detail";

// 只验证真实前端加载/布局；HTTP 数据由自有 API 夹具提供，不代表真实数据库联调。
for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`首页 ${viewport.name} 慢内容和渲染器期间页脚不抢入首屏，且渲染代码与接口并行`, async ({ page }, testInfo) => {
    test.skip(process.env.PLAYWRIGHT_APP_MODE === "mock", "需要 HTTP 夹具覆盖真实读取链路");
    test.setTimeout(60000);
    await page.setViewportSize(viewport);
    const documentBarrier = createRouteBarrier();
    const rendererBarrier = createRouteBarrier();
    const homeBarrier = createRouteBarrier();
    let homeRequested = false;
    let rendererRequested = false;
    let documentRequested = false;
    const definition = generateTemplateFromRecipe(createRecommendedRecipe("page-hero"), {
      name: "加载性能测试主视觉", templateId: "loading_perf_hero",
    });
    const contentBySlotId = Object.fromEntries(Object.values(definition.slots).map((slot) => [
      slot.slotId,
      slot.type === "image" ? { src: "/uploads/performance-hero.svg", alt: "测试主视觉" }
        : slot.type === "text" ? "加载性能测试" : "",
    ]));
    const published = {
      pageKey: "home", status: "PUBLISHED", version: 1,
      puckData: {
        root: { props: {} }, zones: {},
        content: [{ type: "动态模板实例", props: {
          id: "loading_perf_instance", instanceId: "loading_perf_instance", instanceSchemaVersion: 1,
          templateId: definition.templateId, templateVersion: 1, moduleName: definition.name,
          contentBySlotId, hiddenSlotIds: [], layoutOverridesByNodeId: {}, isVisible: true,
        } }],
        resolvedDynamicTemplates: { [`${definition.templateId}@1`]: {
          templateId: definition.templateId, version: 1, schemaVersion: definition.schemaVersion,
          definitionChecksum: "loading-perf-test", definition,
        } },
      },
    };
    await page.addInitScript(() => {
      (window as Window & { loadingShifts?: number[] }).loadingShifts = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
          if (!shift.hadRecentInput) (window as Window & { loadingShifts: number[] }).loadingShifts.push(shift.value);
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/stream")) return route.abort();
      if (path.endsWith("/document/published")) {
        documentRequested = true;
        await documentBarrier.waitUntilReleased();
        return route.fulfill({ json: { code: 200, data: published } });
      }
      return route.fulfill({ json: { code: 200, data: path.endsWith("/settings/public")
        ? { siteName: "海川珠宝", contactPhone: "", contactEmail: "", contactAddress: "", businessHours: "" }
        : null } });
    });
    await page.route(/\/(?:src\/page-builder\/runtime\/PuckDocumentRenderer\.tsx|assets\/PuckDocumentRenderer-[^/]+\.js)(?:\?.*)?$/, async (route) => {
      rendererRequested = true;
      await rendererBarrier.waitUntilReleased();
      await route.continue();
    });
    await page.route(/\/(?:src\/pages\/public\/Home\/index\.tsx|assets\/Home-[^/]+\.js)(?:\?.*)?$/, async (route) => {
      homeRequested = true;
      await homeBarrier.waitUntilReleased();
      await route.continue();
    });
    await page.route("**/uploads/performance-hero.svg*", (route) => route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#DDE1E2"/></svg>',
    }));
    const footerTop = () => page.locator("footer.site-footer").evaluate((el) => el.getBoundingClientRect().top);
    try {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect.poll(() => homeRequested).toBe(true);
      await expect(page.locator("header.site-header")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-route-loading.png`) });
      expect(await footerTop()).toBeGreaterThanOrEqual(viewport.height);
      homeBarrier.release();
      await expect.poll(() => documentRequested).toBe(true);
      await expect(page.locator("header.site-header")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-loading.png`) });
      expect(await footerTop()).toBeGreaterThanOrEqual(viewport.height);
      // 接口尚未返回时就发起渲染器下载，避免 API → Renderer 的串行网络往返。
      await expect.poll(() => rendererRequested).toBe(true);
      documentBarrier.release();
      await expect(page.locator('[data-page-document-state="published"]')).toBeVisible();
      expect(await footerTop()).toBeGreaterThanOrEqual(viewport.height);
      rendererBarrier.release();
      await expect(page.locator('img[alt="测试主视觉"]').first()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-published.png`) });
      expect(await footerTop()).toBeGreaterThanOrEqual(viewport.height);
      const cls = await page.evaluate(() => (window as Window & { loadingShifts: number[] }).loadingShifts.reduce((a, b) => a + b, 0));
      expect(cls).toBeLessThan(0.1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const metricsPath = testInfo.outputPath("loading-performance.json");
      await writeFile(metricsPath, JSON.stringify({ viewport, cls, footerTop: await footerTop(), rendererRequestedBeforeDocument: rendererRequested }));
      await testInfo.attach("loading-performance", {
        contentType: "application/json",
        path: metricsPath,
      });
    } finally {
      documentBarrier.release();
      rendererBarrier.release();
      homeBarrier.release();
    }
  });
}
