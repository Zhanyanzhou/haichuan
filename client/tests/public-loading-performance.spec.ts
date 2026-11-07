import { expect, test, type Locator } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";
import { createRecommendedRecipe } from "../src/page-builder/template-creation/presets";
import { createRouteBarrier } from "./fixtures/public-catalog-detail";

// 只验证真实前端加载/布局；HTTP 数据由自有 API 夹具提供，不代表真实数据库联调。
for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`首页 ${viewport.name} 保留首屏空间，主图等待时后续内容可以操作`, async ({ page }, testInfo) => {
    test.skip(process.env.PLAYWRIGHT_APP_MODE === "mock", "需要 HTTP 夹具覆盖真实读取链路");
    test.setTimeout(60000);
    await page.setViewportSize(viewport);
    const bootBarrier = createRouteBarrier();
    const documentBarrier = createRouteBarrier();
    const rendererBarrier = createRouteBarrier();
    const homeBarrier = createRouteBarrier();
    const imageBarrier = createRouteBarrier();
    let homeRequested = false;
    let rendererRequested = false;
    let documentRequested = false;
    let chineseFontRequested = false;
    page.on("request", (request) => {
      if (/\/(?:@fontsource\/noto-serif-sc\/(?:300|400)\.css|assets\/(?:300|400)-[^/]+\.css)(?:\?|$)/.test(request.url())) {
        chineseFontRequested = true;
      }
    });
    const definition = generateTemplateFromRecipe(createRecommendedRecipe("page-hero"), {
      name: "加载性能测试主视觉", templateId: "loading_perf_hero",
    });
    definition.metadata.visualRole = "primary-stage";
    const contentBySlotId = Object.fromEntries(Object.values(definition.slots).map((slot) => [
      slot.slotId,
      slot.type === "image" ? { src: "/uploads/performance-hero.svg", alt: "测试主视觉" }
        : slot.type === "text" ? "加载性能测试" : "",
    ]));
    const firstStage = {
      id: "loading_perf_instance", instanceId: "loading_perf_instance", instanceSchemaVersion: 1,
      templateId: definition.templateId, templateVersion: 1, moduleName: definition.name,
      contentBySlotId, hiddenSlotIds: [], layoutOverridesByNodeId: {}, isVisible: true,
    };
    const nextStage = {
      ...firstStage,
      id: "ready_following_stage",
      instanceId: "ready_following_stage",
      contentBySlotId: Object.fromEntries(Object.values(definition.slots).map((slot) => [
        slot.slotId,
        slot.type === "image" ? { src: "/uploads/ready-following-hero.svg", alt: "后续主视觉" }
          : slot.type === "button" || slot.type === "link" ? { label: "查看后续作品", targetType: "page", pagePath: "/products" }
            : slot.type === "heading" ? "后续内容已就绪" : "",
      ])),
    };
    const published = {
      pageKey: "home", status: "PUBLISHED", version: 1,
      puckData: {
        root: { props: {} }, zones: {},
        content: [firstStage, nextStage].map((props) => ({ type: "动态模板实例", props })),
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
    await page.route(/\/(?:src\/main\.tsx|assets\/index-[^/]+\.js)(?:\?.*)?$/, async (route) => {
      await bootBarrier.waitUntilReleased();
      await route.continue();
    });
    await page.route(/\/(?:src\/pages\/public\/Home\/index\.tsx|assets\/Home-[^/]+\.js)(?:\?.*)?$/, async (route) => {
      homeRequested = true;
      await homeBarrier.waitUntilReleased();
      await route.continue();
    });
    await page.route("**/uploads/performance-hero.svg*", async (route) => {
      await imageBarrier.waitUntilReleased();
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#DDE1E2"/></svg>',
      });
    });
    await page.route("**/uploads/ready-following-hero.svg", (route) => route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#E4DED6"/></svg>',
    }));
    const footerTop = () => page.locator("footer.site-footer").evaluate((el) => el.getBoundingClientRect().top);
    const expectCenteredLoading = async (loading: Locator) => {
      const indicator = loading.locator(".site-route-loading__indicator");
      await expect(indicator).toBeVisible();
      await expect.poll(async () => {
        const box = await indicator.boundingBox();
        if (!box) return Number.POSITIVE_INFINITY;
        return Math.max(
          Math.abs(box.x + box.width / 2 - viewport.width / 2),
          Math.abs(box.y + box.height / 2 - viewport.height / 2),
        );
      }).toBeLessThanOrEqual(0.5);
    };
    try {
      await page.goto("/", { waitUntil: "commit" });
      await expectCenteredLoading(page.locator("#root > .site-route-loading"));
      bootBarrier.release();
      await expect.poll(() => homeRequested).toBe(true);
      await expect(page.locator("header.site-header")).toBeVisible();
      await expectCenteredLoading(page.locator("body > .site-route-loading"));
      await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-route-loading.png`) });
      expect(await footerTop()).toBeGreaterThanOrEqual(viewport.height);
      homeBarrier.release();
      await expect.poll(() => documentRequested).toBe(true);
      await expect(page.locator("header.site-header")).toBeVisible();
      await expectCenteredLoading(page.locator("[data-home-loading-status]"));
      await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-loading.png`) });
      expect(await footerTop()).toBeGreaterThanOrEqual(viewport.height);
      // 接口尚未返回时就发起渲染器下载，避免 API → Renderer 的串行网络往返。
      await expect.poll(() => rendererRequested).toBe(true);
      documentBarrier.release();
      await expect(page.locator('[data-page-document-state="published"]')).toBeVisible();
      expect(await footerTop()).toBeGreaterThanOrEqual(viewport.height);
      rendererBarrier.release();
      await imageBarrier.reached;
      const reveal = page.locator(".home-primary-stage");
      await expect(reveal).toHaveAttribute("data-ready", "false");
      await expect(page.locator("header.site-header")).toBeVisible();
      await expect(page.locator('img[alt="测试主视觉"]').first()).toBeHidden();
      expect(chineseFontRequested).toBe(false);
      const nextAction = page.getByRole("link", { name: "查看后续作品" });
      await nextAction.click({ trial: true, timeout: 1200 });
      await expect(reveal).toHaveAttribute("data-ready", "false");
      await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-following-content-ready.png`) });
      await page.evaluate(() => window.scrollTo(0, 0));
      if (viewport.name === "mobile") {
        // 慢网达到上限时先放行正式内容，图片仍可继续到达。
        await expect(reveal).toHaveAttribute("data-ready", "true");
      }
      imageBarrier.release();
      await expect(page.locator('img[alt="测试主视觉"]').first()).toBeVisible();
      await expect.poll(() => page.locator('img[alt="测试主视觉"]').first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
      await expect.poll(() => chineseFontRequested).toBe(true);
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
      bootBarrier.release();
      documentBarrier.release();
      rendererBarrier.release();
      homeBarrier.release();
      imageBarrier.release();
    }
  });
}

test("结算回退到联系页时两个局部等待不重复显示 H", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_APP_MODE === "mock", "需要 HTTP 和延迟组件夹具");
  await page.setViewportSize({ width: 1440, height: 900 });
  const contactBarrier = createRouteBarrier();
  const formBarrier = createRouteBarrier();
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/stream")) return route.abort();
    if (path.endsWith("/settings/public-contact")) await contactBarrier.waitUntilReleased();
    const data = path.endsWith("/settings/flags")
      ? { commerceEnabled: false, cartEnabled: false, paymentEnabled: false }
      : null;
    return route.fulfill({ json: { code: 200, data } });
  });
  await page.route(/\/(?:src\/pages\/public\/Contact\/ConsultationRequest\.tsx|assets\/ConsultationRequest-[^/]+\.js)(?:\?.*)?$/, async (route) => {
    await formBarrier.waitUntilReleased();
    await route.continue();
  });

  try {
    await page.goto("/checkout", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/contact$/);
    await expect(page.getByText("正在加载联系方式…", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("正在准备预约咨询…", { exact: true })).toBeVisible();
    await expect(page.locator(".site-route-loading__indicator")).toHaveCount(0);
  } finally {
    contactBarrier.release();
    formBarrier.release();
  }
  await expect(page.locator("#cf-name")).toBeVisible();
});
