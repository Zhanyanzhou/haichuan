import { expect, test, type Page } from "@playwright/test";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";
import { createRecommendedRecipe } from "../src/page-builder/template-creation/presets";
import { createRouteBarrier } from "./fixtures/public-catalog-detail";
import { getHomeHeroPreview } from "../src/page-builder/runtime/homeHeroPreview";
import { createContentTemplateMarker } from "../src/page-builder/generated/contentTemplates.generated";

function publishedHero(pageKey = "home") {
  const definition = generateTemplateFromRecipe(createRecommendedRecipe("page-hero"), {
    name: "加载边界测试主视觉", templateId: "public_loading_boundary",
  });
  definition.metadata.visualRole = "primary-stage";
  const contentBySlotId = Object.fromEntries(Object.values(definition.slots).map((slot) => [
    slot.slotId,
    slot.type === "image" ? (slot.semanticRole === "logo"
      ? { src: "/uploads/loading-hero-logo.svg", alt: "加载边界测试标志" }
      : { src: "/uploads/loading-hero-desktop.svg", mobileSrc: "/uploads/loading-hero-mobile.svg", alt: "加载边界测试图片" })
      : slot.type === "text" || slot.type === "heading" ? "加载边界测试" : "",
  ]));
  const block = { type: "动态模板实例", props: {
    id: "public_loading_instance", instanceId: "public_loading_instance", instanceSchemaVersion: 1,
    templateId: definition.templateId, templateVersion: 1, moduleName: definition.name,
    contentBySlotId, hiddenSlotIds: [] as string[], layoutOverridesByNodeId: {}, isVisible: true,
  } };
  return {
    pageKey, status: "PUBLISHED", version: 1,
    puckData: { root: { props: {} }, zones: {}, content: [block], resolvedDynamicTemplates: {
      [`${definition.templateId}@1`]: { templateId: definition.templateId, version: 1, schemaVersion: definition.schemaVersion,
        definitionChecksum: "loading-boundary-fixture", definition },
    } },
  };
}

async function installPublicFixture(page: Page, pageKey = "home") {
  const published = publishedHero(pageKey);
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/stream")) return route.abort();
    return route.fulfill({ json: { code: 200, data: path.endsWith("/document/published") ? published
      : path.endsWith("/settings/public") ? { siteName: "海川珠宝", contactPhone: "", contactEmail: "", contactAddress: "", businessHours: "" } : null } });
  });
  await page.route("**/uploads/loading-hero-*.svg*", (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#DDE1E2"/></svg>',
  }));
  return published;
}

for (const viewport of [{ width: 1440, height: 900, device: "desktop" }, { width: 390, height: 844, device: "mobile" }] as const) {
  test(`动态首页 ${viewport.device} 在完整 Renderer 尚未到达时请求当前端首图`, async ({ page }, testInfo) => {
    test.skip(process.env.PLAYWRIGHT_APP_MODE === "mock", "HTTP 夹具覆盖真实客户端链路");
    await page.setViewportSize(viewport);
    await installPublicFixture(page);
    const renderer = createRouteBarrier();
    let rendererRequested = false;
    const requestedMedia: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/uploads/loading-hero-")) requestedMedia.push(new URL(request.url()).pathname);
    });
    await page.route(/\/(?:src\/page-builder\/runtime\/PuckDocumentRenderer\.tsx|assets\/PuckDocumentRenderer-[^/]+\.js)(?:\?.*)?$/, async (route) => {
      rendererRequested = true;
      await renderer.waitUntilReleased();
      await route.continue();
    });
    try {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect.poll(() => rendererRequested).toBe(true);
      await expect.poll(() => requestedMedia.includes(`/uploads/loading-hero-${viewport.device}.svg`)).toBe(true);
      await expect(page.locator('section[aria-label="首页首屏"] img').first()).toBeVisible();
      expect(requestedMedia.every((path) => path === `/uploads/loading-hero-${viewport.device}.svg`)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${viewport.device}-before-renderer.png`) });
      renderer.release();
      await expect(page.locator('img[alt="加载边界测试图片"]').first()).toBeVisible();
    } finally {
      renderer.release();
    }
  });
}

test("兼容首页首图在两个 Renderer 分块先后到达时持续可见", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_APP_MODE === "mock", "HTTP 夹具覆盖真实客户端模块链路");
  await page.setViewportSize({ width: 390, height: 844 });
  const published = await installPublicFixture(page);
  await page.route(/\/api\/page-modules\/document\/published\?/, (route) => route.fulfill({
    json: { code: 200, data: { ...published, puckData: {
      root: { props: {} },
      content: [{ type: "首屏主视觉", props: {
        id: "compatible-hero", title: "兼容首屏", altText: "兼容首屏测试图",
        desktopImage: "/uploads/loading-hero-mobile.svg",
        mobileImage: "/uploads/loading-hero-mobile.svg",
        __contentTemplate: createContentTemplateMarker("首屏主视觉"),
      } }],
    } } },
  }));

  const renderer = createRouteBarrier();
  const compatibleRenderer = createRouteBarrier();
  await page.route(/\/(?:src\/page-builder\/runtime\/PuckDocumentRenderer\.tsx|assets\/PuckDocumentRenderer-[^/]+\.js)(?:\?.*)?$/, async (route) => {
    await renderer.waitUntilReleased();
    await route.continue();
  });
  await page.route(/\/(?:src\/page-builder\/template-definition\/MatureContentTemplateRenderer\.tsx|assets\/MatureContentTemplateRenderer-[^/]+\.js)(?:\?.*)?$/, async (route) => {
    await compatibleRenderer.waitUntilReleased();
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await renderer.reached;
    const firstImage = page.locator('section[aria-label="首页首屏"] img');
    await expect(firstImage).toBeVisible();
    await expect.poll(() => firstImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

    renderer.release();
    await compatibleRenderer.reached;
    // React 会节流 Suspense 的后续提交。跨过 500ms 提交窗口采样，检查期间首图未被空白占位替换。
    const stayedVisible = await page.evaluate(() => new Promise<boolean>((resolve) => {
      const end = performance.now() + 700;
      const sample = () => {
        const image = document.querySelector('section[aria-label="首页首屏"] img');
        if (!image || image.getBoundingClientRect().height === 0) resolve(false);
        else if (performance.now() >= end) resolve(true);
        else requestAnimationFrame(sample);
      };
      sample();
    }));
    expect(stayedVisible).toBe(true);
    await expect(firstImage).toBeVisible();
    await expect(page.locator('.hc-public-document > [aria-busy="true"]')).toHaveCount(0);

    compatibleRenderer.release();
    await expect(page.locator('[data-content-template-renderer="real"]').getByAltText("兼容首屏测试图")).toBeVisible();
    await expect(firstImage).toHaveCount(0);
  } finally {
    renderer.release();
    compatibleRenderer.release();
  }
});

test("手机快切离开首页后，回到首页独立读取发布文档", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const published = await installPublicFixture(page);
  const oldDocument = structuredClone(published);
  for (const value of Object.values(oldDocument.puckData.content[0].props.contentBySlotId)) {
    if (typeof value === "object" && value?.alt === "加载边界测试图片") value.alt = "已离开页面的旧首图";
  }
  const first = createRouteBarrier();
  let homeReads = 0;
  const cancelled: string[] = [];
  page.on("requestfailed", (request) => {
    if (request.url().includes("/document/published?") && request.url().includes("pageKey=home")) {
      cancelled.push(request.failure()?.errorText ?? "");
    }
  });
  await page.route(/\/api\/page-modules\/document\/published\?/, async (route) => {
    if (new URL(route.request().url()).searchParams.get("pageKey") !== "home") return route.fallback();
    const initialRead = ++homeReads === 1;
    if (initialRead) await first.waitUntilReleased();
    await route.fulfill({ json: { code: 200, data: initialRead ? oldDocument : published } }).catch((error) => {
      if (!initialRead) throw error;
    });
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect.poll(() => homeReads).toBe(1);
    await page.locator('footer a[href="/catalog"]').first().click();
    await expect(page).toHaveURL(/\/catalog$/);
    await page.getByRole("link", { name: "海川珠宝首页" }).click();
    await expect.poll(() => homeReads).toBe(2);
    await expect(page.locator('img[alt="加载边界测试图片"]').first()).toBeVisible();
    first.release();
    await expect.poll(() => cancelled).toContain("net::ERR_ABORTED");
    await expect(page.getByAltText("已离开页面的旧首图")).toHaveCount(0);
  } finally {
    first.release();
  }
});

test("手机首页发布文档 503 后可就地重试", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const published = await installPublicFixture(page);
  let allowDocument = false;
  let successfulReads = 0;
  await page.route(/\/api\/page-modules\/document\/published\?/, (route) => {
    if (!allowDocument) return route.fulfill({ status: 503, json: { message: "暂不可用" } });
    successfulReads += 1;
    return route.fulfill({ json: { code: 200, data: published } });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "首页暂不可用" })).toBeVisible();
  await expect(page.getByRole("link", { name: "海川珠宝首页" })).toBeVisible();
  allowDocument = true;
  await page.getByRole("button", { name: "重新载入内容" }).click();
  await expect(page.locator('img[alt="加载边界测试图片"]').first()).toBeVisible();
  expect(successfulReads).toBe(1);
});

test("手机首页首图请求失败后显示稳定占位并能原地恢复", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installPublicFixture(page);
  let allowImage = false;
  await page.route("**/uploads/loading-hero-mobile.svg*", (route) => allowImage ? route.fallback() : route.abort("internetdisconnected"));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const fallback = page.locator("[data-public-hero-image-error]").first();
  await expect(fallback).toBeVisible();
  await expect(fallback).toContainText("图片暂不可用");
  await expect(page.getByRole("link", { name: "海川珠宝首页" })).toBeVisible();
  const placeholderBox = await fallback.boundingBox();
  await page.screenshot({ path: testInfo.outputPath("mobile-hero-recovery.png") });
  allowImage = true;
  await fallback.getByRole("button", { name: "重新加载图片" }).click();
  const hero = page.locator('img[alt="加载边界测试图片"][fetchpriority="high"]');
  await expect.poll(() => hero.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(fallback).toHaveCount(0);
  const imageBox = await hero.boundingBox();
  expect(imageBox?.height).toBeCloseTo(placeholderBox!.height, 0);
});

test("手机首页 Renderer 请求失败时保留导航并可重新载入", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installPublicFixture(page);
  let allowRenderer = false;
  await page.route(/\/(?:src\/page-builder\/runtime\/PuckDocumentRenderer\.tsx|assets\/PuckDocumentRenderer-[^/]+\.js)(?:\?.*)?$/, (route) => (
    allowRenderer ? route.continue() : route.abort("internetdisconnected")
  ));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "首页暂不可用" })).toBeVisible();
  await expect(page.getByRole("link", { name: "海川珠宝首页" })).toBeVisible();
  allowRenderer = true;
  await page.getByRole("button", { name: "重新载入内容" }).click();
  await expect(page.locator('img[alt="加载边界测试图片"]').first()).toBeVisible();
});

test("纯动态作品页不加载后台升级面板、AntD Provider 或成熟模板 Renderer", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_APP_MODE === "mock", "HTTP 夹具覆盖真实客户端模块链路");
  const unexpected: string[] = [];
  page.on("request", (request) => {
    if (/\/(?:src\/(?:page-builder\/dynamic-template-instance\/DynamicTemplateUpgradePanel|components\/common\/AntdProvider|page-builder\/template-definition\/MatureContentTemplateRenderer)\.tsx|assets\/(?:AntdProvider|MatureContentTemplateRenderer)-[^/]+\.js)(?:\?.*)?$/.test(request.url())) {
      unexpected.push(new URL(request.url()).pathname);
    }
  });
  await installPublicFixture(page, "products");
  await page.goto("/products");
  await expect(page.locator('img[alt="加载边界测试图片"]').first()).toBeVisible();
  expect(unexpected).toEqual([]);
});

test("首图发现遵守精确版本、当前端隐藏与页面内容，不读取模板默认图", () => {
  const published = publishedHero();
  const document = published.puckData;
  expect(getHomeHeroPreview(document, "desktop").image).toBe("/uploads/loading-hero-desktop.svg");
  expect(getHomeHeroPreview(document, "mobile").image).toBe("/uploads/loading-hero-mobile.svg");
  const block = document.content[0];
  block.props.hiddenSlotIds = Object.keys(block.props.contentBySlotId);
  expect(getHomeHeroPreview(document, "mobile").image).toBe("");
  block.props.hiddenSlotIds = [];
  block.props.contentBySlotId = {};
  expect(getHomeHeroPreview(document).image).toBe("");
  block.props.templateVersion = 2;
  expect(getHomeHeroPreview(document).image).toBe("");
});

test("公开渲染复用同一轮判断且下一轮仍校验修改后的内容", async ({ page }, testInfo) => {
  test.skip(process.env.PLAYWRIGHT_APP_MODE === "mock", "工作量探针使用真实Vite模块");
  await page.route("**/__renderer_work", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><script type="module">
      import R from '/@react-refresh';R.injectIntoGlobalHook(window);
      window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;
      </script></head><body><script type="module" src="/tests/fixtures/public-renderer-work.tsx"></script></body></html>`,
  }));
  await page.goto("/__renderer_work");
  await page.waitForFunction(() => Boolean(window.publicRendererWorkProbe));
  const source = publishedHero().puckData;
  source.content = Array.from({ length: 7 }, (_, index) => ({
    ...source.content[0], props: { ...source.content[0].props, id: `work_${index}`, instanceId: `work_${index}` },
  }));
  const result = await page.evaluate((data) => {
    const before = window.publicRendererWorkProbe.measure(data);
    const slot = Object.entries(data.content[0].props.contentBySlotId).find(([, value]) => typeof value === "object" && value !== null && "src" in value)?.[0];
    if (!slot) throw new Error("探针缺少图片槽");
    data.content[0].props.contentBySlotId[slot] = { src: "/uploads/changed-public-work.svg", mobileSrc: "/uploads/changed-public-work.svg", alt: "已更新作品" };
    const after = window.publicRendererWorkProbe.measure(data);
    return { reads: before.schemaReads, nextReads: after.schemaReads, changed: after.html.includes("changed-public-work.svg") };
  }, source);
  // 同一七区块夹具在修复前需680次schema读取；保留余量，防止重复扫描回归。
  expect(result.reads).toBeLessThan(660);
  expect(result.nextReads).toBeGreaterThan(0);
  expect(result.changed).toBe(true);
  await testInfo.attach("public-render-work", { contentType: "application/json", body: JSON.stringify(result) });
});
