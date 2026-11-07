import { expect, test, type Page } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";
import { createContentSlot, createMediaSlots, createRecommendedRecipe } from "../src/page-builder/template-creation/presets";
import type { PublishedDynamicTemplateResource } from "../src/services/clients/dynamicTemplateClient";
import { installNewTemplateServer, json, makePublished, makeResource } from "./fixtures/template-authoring-main-route";

function published(index: number, height = 810) {
  const recipe = createRecommendedRecipe();
  recipe.canvas = { width: 1440, height, aspectRatio: 1440 / height };
  recipe.content = [createContentSlot("title")];
  const definition = generateTemplateFromRecipe(recipe, { templateId: `tpl_summary_${index}`, name: `摘要模板 ${index}` });
  return makePublished(makeResource(definition, 1, 1), definition);
}

function summary(template: PublishedDynamicTemplateResource) {
  const { definition, ...metadata } = template;
  return { ...metadata, sectionRole: definition.metadata.sectionRole, canvasSize: definition.metadata.canvasSize };
}

async function catalogFixture(page: Page, count = 24) {
  const server = await installNewTemplateServer(page, { pageLifecycle: true });
  const templates = Array.from({ length: count }, (_, index) => published(index));
  const state = { templates, reads: [] as string[], catalogReads: 0, publishedReads: 0, running: 0, maxRunning: 0, fail: false, mismatch: false, archived: false, delayMs: 100 };
  await page.route("**/api/page-modules/dynamic-templates/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/catalog")) {
      expect(url.searchParams.get("view")).toBe("summary");
      expect(url.searchParams.get("pageKey")).toBe("home");
      state.catalogReads += 1;
      return route.fulfill(json({ source: "unified", items: state.templates.map((template) => ({ kind: "published", template: summary(template) })) }));
    }
    if (url.pathname.endsWith("/published")) {
      expect(url.searchParams.get("view")).toBe("summary");
      state.publishedReads += 1;
      return route.fulfill(json(state.templates.map(summary)));
    }
    const exact = url.pathname.match(/\/published\/([^/]+)\/versions\/(\d+)$/);
    if (!exact) return route.fallback();
    state.reads.push(`${exact[1]}@${exact[2]}`);
    const template = state.templates.find((item) => item.templateId === exact[1]);
    state.running += 1;
    state.maxRunning = Math.max(state.maxRunning, state.running);
    await new Promise((resolve) => setTimeout(resolve, state.delayMs));
    state.running -= 1;
    if (state.fail) return route.fulfill(json(null, 500));
    if (!template) return route.fulfill(json(null, 404));
    return route.fulfill(json({ ...template, definitionChecksum: state.mismatch ? "changed-checksum" : template.definitionChecksum, status: state.archived ? "ARCHIVED" : "ACTIVE" }));
  });
  return { server, state };
}

test("模板目录等待时显示侧栏文字，中央加载标识不跳进侧栏", async ({ page }) => {
  const { server } = await catalogFixture(page, 1);
  await page.setViewportSize({ width: 1440, height: 900 });
  let releaseCatalog!: () => void;
  const pendingCatalog = new Promise<void>((resolve) => { releaseCatalog = resolve; });
  await page.route("**/api/page-modules/dynamic-templates/catalog?*", async (route) => {
    await pendingCatalog;
    return route.fallback();
  });

  try {
    await page.goto("/admin/editor/home", { waitUntil: "domcontentloaded" });
    const library = page.locator(".unified-template-library__scroll");
    await expect(library.getByRole("status").filter({ hasText: "正在读取模板目录…" })).toBeVisible();
    await expect(library.locator(".site-route-loading__indicator")).toHaveCount(0);
  } finally {
    releaseCatalog();
  }
  await expect(page.locator('[data-template-name="tpl_summary_0"]')).toBeVisible();
  expect(server.writes).toEqual([]);
});

test("有封面的目录先取缩略封面，慢网拖拽有提示且就绪后可拖入", async ({ page }, testInfo) => {
  const { server, state } = await catalogFixture(page, 3);
  state.delayMs = 0;
  state.fail = true;
  state.templates = state.templates.map((template, index) => ({ ...template, catalogCoverUrl: `/uploads/page-assets/catalog-cover-${index}.jpg` }));
  await page.setViewportSize({ width: 1440, height: 900 });
  const covers: Array<number | null> = [];
  await page.route("**/api/upload/media/preview-by-storage-key**", async (route) => {
    const url = new URL(route.request().url());
    covers.push(url.searchParams.has("width") ? Number(url.searchParams.get("width")) : null);
    return route.fallback();
  });
  let releaseVersion!: () => void;
  const pendingVersion = new Promise<void>((resolve) => { releaseVersion = resolve; });
  await page.route("**/published/tpl_summary_0/versions/1", async (route) => {
    await pendingVersion;
    return route.fallback();
  });
  await page.goto("/admin/editor/home");
  const card = page.locator('[data-template-name="tpl_summary_0"]');
  const image = card.locator("[data-catalog-cover] img");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  expect(covers.length).toBeGreaterThan(0);
  expect(covers.every((width) => width === 480)).toBe(true);
  expect(state.reads).toEqual([]);
  const metrics = await image.evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, dpr: window.devicePixelRatio }));
  console.log("catalog cover delivery", JSON.stringify({ ...metrics, requestedWidth: 480, definitionReadsBeforeInteraction: state.reads.length }));
  await testInfo.attach("catalog-cover-delivery", { contentType: "application/json", body: JSON.stringify(metrics) });
  await page.screenshot({ path: testInfo.outputPath("catalog-cover-ready.png") });
  const control = card.locator(".homepage-editor__dynamic-template-card-main");
  await expect(control).toHaveAttribute("draggable", "false");
  const canvasHost = page.locator(".homepage-editor__canvas-document");
  const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
  const instance = canvas.locator('[data-dynamic-template-id="tpl_summary_0"]');
  const moveTemplateToCanvas = async () => {
    await control.scrollIntoViewIfNeeded();
    const [source, target] = await Promise.all([control.boundingBox(), canvasHost.boundingBox()]);
    if (!source || !target) throw new Error("模板卡片或画布缺少拖放尺寸");
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  };
  try {
    await moveTemplateToCanvas();
    await page.mouse.up();
    await expect(card.getByRole("status")).toHaveText("正在准备模板…完成后请重新拖入。");
    await expect(control).toHaveAttribute("draggable", "false");
    await expect(instance).toHaveCount(0);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
    await page.screenshot({ path: testInfo.outputPath("catalog-drag-preparing.png") });
  } finally {
    releaseVersion();
  }
  await expect(card.getByRole("status")).toHaveText("模板准备失败，请重新拖入。");
  await expect(control).toHaveAttribute("draggable", "false");
  state.fail = false;
  state.delayMs = 350;
  await moveTemplateToCanvas();
  await page.mouse.up();
  await expect(control).toHaveAttribute("draggable", "true");
  await expect(card.getByRole("status")).toHaveText("模板已就绪，可以拖入。");
  expect(state.reads).toEqual(["tpl_summary_0@1", "tpl_summary_0@1"]);
  await moveTemplateToCanvas();
  await expect(canvasHost).toHaveClass(/is-dragging/);
  await page.mouse.up();
  await expect(instance).toHaveCount(1);
  await expect(canvas.getByText("模板已加入页面，请在右侧上传图片或填写文字。")).toBeVisible();
  expect(state.reads).toEqual(["tpl_summary_0@1", "tpl_summary_0@1"]);
  expect(server.writes).toEqual([]);
});

test("目录封面双重失败时回退精确构图，刷新目录后重试同地址封面", async ({ page }) => {
  const { state } = await catalogFixture(page, 1);
  state.templates[0].catalogCoverUrl = "/uploads/page-assets/catalog-failed-cover.jpg";
  await page.setViewportSize({ width: 1440, height: 900 });
  const widths: Array<string | null> = [];
  let coverRecovered = false;
  await page.route("**/api/upload/media/preview-by-storage-key**", (route) => {
    widths.push(new URL(route.request().url()).searchParams.get("width"));
    return coverRecovered ? route.fallback() : route.fulfill({ status: 404, body: "" });
  });
  await page.goto("/admin/editor/home");
  const card = page.locator('[data-template-name="tpl_summary_0"]');
  await expect(card.locator('[data-preview-art-direction="neutral-template-preview-v1"]')).toBeVisible();
  expect(widths).toEqual(["480", null]);
  expect(state.reads).toEqual(["tpl_summary_0@1"]);
  coverRecovered = true;
  const catalogReadsBeforeRefresh = state.catalogReads;
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("haichuan:dynamic-template-server-changed")));
  await expect.poll(() => state.catalogReads).toBeGreaterThan(catalogReadsBeforeRefresh);
  const image = card.locator("[data-catalog-cover] img");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  expect(widths).toEqual(["480", null, "480"]);
  expect(state.reads).toEqual(["tpl_summary_0@1"]);
});

test("无封面目录的真实图片与背景按缩略尺寸读取，不先下载原图", async ({ page }) => {
  const { state, server } = await catalogFixture(page, 1);
  const recipe = createRecommendedRecipe();
  recipe.canvas = { width: 1440, height: 810, aspectRatio: 16 / 9 };
  recipe.content = [];
  recipe.media = createMediaSlots(["heroImage"]);
  const definition = generateTemplateFromRecipe(recipe, { templateId: "tpl_summary_0", name: "摘要模板 0" });
  const slot = Object.values(definition.slots).find((item) => item.type === "image")!;
  definition.defaultContent = { ...definition.defaultContent, [slot.slotId]: { src: "/uploads/page-assets/catalog-image.jpg", alt: "目录图片" } };
  definition.nodes[definition.rootNodeId].responsive.desktop.backgroundImage = "/uploads/page-assets/catalog-background.jpg";
  state.templates = [makePublished(makeResource(definition, 1, 1), definition)];
  const previews: Array<{ source: string; width: number | null }> = [];
  await page.route("**/api/upload/media/by-url?*", (route) => {
    const source = new URL(route.request().url()).searchParams.get("url");
    return route.fulfill(json({ url: source, displayWidth: 6000, displayHeight: 3375, metadataStatus: "measured", mediaRevision: "catalog-fixture", animated: false }));
  });
  await page.route("**/api/upload/media/preview-by-storage-key**", async (route) => {
    const url = new URL(route.request().url());
    const source = url.searchParams.get("storageKey") ?? "";
    const width = url.searchParams.has("width") ? Number(url.searchParams.get("width")) : null;
    previews.push({ source, width });
    return route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width ?? 6000}" height="${(width ?? 6000) * 9 / 16}"><rect width="100%" height="100%" fill="#998877"/></svg>` });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/editor/home");
  const card = page.locator('[data-template-name="tpl_summary_0"]');
  await expect(card.locator('[data-preview-art-direction="neutral-template-preview-v1"]')).toBeVisible();
  await expect.poll(() => new Set(previews.map((preview) => preview.source)).size).toBe(2);
  expect(previews.every((preview) => preview.width !== null && preview.width <= 800)).toBe(true);
  const image = card.frameLocator("iframe").locator("img").first();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  await expect(card.frameLocator("iframe").locator(`[data-template-node-id="${definition.rootNodeId}"]`)).toHaveCSS("background-image", /blob:/);
  expect(server.writes).toEqual([]);
});

test("切页目录加载失败时不会显示或沿用上一页可添加的模板", async ({ page }) => {
  const { server } = await catalogFixture(page, 1);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/page-modules/document/admin?*", (route) => {
    const pageKey = new URL(route.request().url()).searchParams.get("pageKey");
    return pageKey === "about"
      ? route.fulfill(json({ ...server.pageDocument, pageKey }))
      : route.fallback();
  });
  let targetCatalogReady = false;
  await page.route("**/api/page-modules/dynamic-templates/catalog?*", (route) => {
    if (new URL(route.request().url()).searchParams.get("pageKey") !== "about") return route.fallback();
    return targetCatalogReady ? route.fulfill(json({ items: [] })) : route.fulfill(json(null, 500));
  });
  await page.goto("/admin/editor/home");
  const homeCard = page.locator('[data-template-name="tpl_summary_0"]');
  await expect(homeCard).toBeVisible();
  await page.getByLabel("切换装修页面").selectOption("about");
  await expect(page.getByText("模板目录暂时无法读取，请重试。")).toBeVisible();
  await expect(homeCard).toHaveCount(0);
  targetCatalogReady = true;
  await page.locator(".unified-template-library__scroll").getByRole("button", { name: "重新读取" }).click();
  await expect(page.getByText("模板目录暂时无法读取，请重试。")).toHaveCount(0);
  await expect(homeCard).toHaveCount(0);
  expect(server.writes).toEqual([]);
});

test("页面目录摘要保留全部搜索结果，只为可见构图取精确版本，添加与多设备预览继续可用", async ({ page }, testInfo) => {
  const { server, state } = await catalogFixture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/editor/home");
  const cards = page.locator(".unified-template-library__card[data-template-name^='tpl_summary_']");
  await expect(cards).toHaveCount(24);
  await expect(cards.first().locator('[data-preview-art-direction="neutral-template-preview-v1"]')).toBeVisible();
  expect(state.reads.length).toBeGreaterThan(0);
  expect(state.reads.length).toBeLessThan(24);
  expect(state.maxRunning).toBeLessThanOrEqual(3);
  const initialReads = [...state.reads];
  const fullBytes = Buffer.byteLength(JSON.stringify(state.templates));
  const summaryBytes = Buffer.byteLength(JSON.stringify(state.templates.map(summary)));
  const definitionsBytes = initialReads.reduce((total, key) => total + Buffer.byteLength(JSON.stringify(state.templates.find((item) => `${item.templateId}@${item.version}` === key))), 0);
  const definitionsGzipBytes = initialReads.reduce((total, key) => total + gzipSync(JSON.stringify(state.templates.find((item) => `${item.templateId}@${item.version}` === key))).byteLength, 0);
  expect(summaryBytes + definitionsBytes).toBeLessThan(fullBytes);
  console.log("catalog summary payload", JSON.stringify({ fullBytes, summaryBytes, initialDefinitions: initialReads.length, initialDefinitionsBytes: definitionsBytes, initialDefinitionsGzipBytes: definitionsGzipBytes, fullGzipBytes: gzipSync(JSON.stringify(state.templates)).byteLength, summaryGzipBytes: gzipSync(JSON.stringify(state.templates.map(summary))).byteLength }));
  await testInfo.attach("catalog-payload-comparison", { contentType: "application/json", body: JSON.stringify({ fullBytes, summaryBytes, initialDefinitions: initialReads.length, initialDefinitionsBytes: definitionsBytes, fullGzipBytes: gzipSync(JSON.stringify(state.templates)).byteLength, summaryGzipBytes: gzipSync(JSON.stringify(state.templates.map(summary))).byteLength }) });
  await page.getByPlaceholder("搜索模板").fill("摘要模板 23");
  await expect(cards).toHaveCount(1);
  const card = cards.first();
  await expect(card.locator('[data-preview-art-direction="neutral-template-preview-v1"]')).toBeVisible();
  await card.getByRole("button", { name: "放大预览：摘要模板 23" }).click();
  const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
  const preview = canvas.locator('[data-canvas-template-preview] [data-dynamic-template-id="tpl_summary_23"]');
  await expect(preview).toHaveAttribute("data-dynamic-template-device", "desktop");
  await page.getByRole("button", { name: "移动端布局（390 × 844）", exact: true }).click();
  await expect(preview).toHaveAttribute("data-dynamic-template-device", "mobile");
  await page.getByRole("button", { name: "桌面端布局（1440 × 900）", exact: true }).click();
  await card.locator('[data-catalog-action="primary"]').click();
  await expect(canvas.locator('[data-dynamic-template-instance-id]')).toHaveCount(1);
  expect(state.reads.filter((key) => key === "tpl_summary_23@1")).toHaveLength(1);
  expect(server.writes).toEqual([]);
});

test("快速预览两张卡片，先点击的构图迟到也不会替换当前模板", async ({ page }) => {
  const { server } = await catalogFixture(page, 2);
  await page.setViewportSize({ width: 1600, height: 1000 });
  let releaseFirst!: () => void;
  const pendingFirst = new Promise<void>((resolve) => { releaseFirst = resolve; });
  await page.route("**/published/tpl_summary_0/versions/1", async (route) => {
    await pendingFirst;
    await route.fallback();
  });
  await page.goto("/admin/editor/home");
  const first = page.getByRole("button", { name: "放大预览：摘要模板 0" });
  const second = page.getByRole("button", { name: "放大预览：摘要模板 1" });
  const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
  const preview = canvas.locator("[data-canvas-template-preview]");
  try {
    await first.click();
    await expect(first).toBeDisabled();
    await second.click();
    await expect(preview.locator('[data-dynamic-template-id="tpl_summary_1"]')).toBeVisible();
  } finally {
    releaseFirst();
  }
  await expect(first).toBeEnabled();
  await expect(preview.locator('[data-dynamic-template-id="tpl_summary_1"]')).toBeVisible();
  await expect(page.getByRole("region", { name: "模板预览属性" })).toContainText("摘要模板 1 · v1");
  expect(server.writes).toEqual([]);
});

test("摘要构图加载失败可重试，checksum冲突先刷新目录且不会添加错误定义", async ({ page }) => {
  const { server, state } = await catalogFixture(page, 1);
  await page.setViewportSize({ width: 1440, height: 900 });
  state.fail = true;
  await page.goto("/admin/editor/home");
  const card = page.locator('[data-template-name="tpl_summary_0"]');
  await expect(card.getByRole("button", { name: "重新加载构图" })).toBeVisible();
  state.fail = false;
  state.mismatch = true;
  await card.getByRole("button", { name: "重新加载构图" }).click();
  await expect(card.getByRole("button", { name: "目录已变化，刷新目录" })).toBeVisible();
  const before = state.catalogReads;
  state.mismatch = false;
  await card.getByRole("button", { name: "目录已变化，刷新目录" }).click();
  await expect.poll(() => state.catalogReads).toBeGreaterThan(before);
  await expect(card.locator('[data-preview-art-direction="neutral-template-preview-v1"]')).toBeVisible();
  expect(server.writes).toEqual([]);
});

test("定义读取按身份与目录世代隔离，合并并发并拒绝迟到回包", async ({ page }) => {
  const { state } = await catalogFixture(page, 8);
  await page.goto("/admin/login");
  const summaries = state.templates.map(summary);
  const result = await page.evaluate(async (items) => {
    const path = "/src/page-builder/template-editor/publishedCatalogDefinitionLoader.ts";
    const epochPath = "/src/services/sessionEpoch.ts";
    const [{ createPublishedCatalogDefinitionLoader }, { advanceSessionEpoch }] = await Promise.all([import(/* @vite-ignore */ path), import(/* @vite-ignore */ epochPath)]);
    const loader = createPublishedCatalogDefinitionLoader();
    const first = loader.read(items[0]);
    const same = loader.read(items[0]);
    const loaded = await Promise.all([first, same, ...items.slice(1).map((item) => loader.read(item))]);
    const old = createPublishedCatalogDefinitionLoader();
    const late = old.read(items[0]).then(() => false, () => true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    old.dispose();
    const disposedRejected = await late;
    const previousIdentity = createPublishedCatalogDefinitionLoader();
    advanceSessionEpoch("admin");
    const identityRejected = await previousIdentity.read(items[0]).then(() => false, () => true);
    return { samePromise: first === same, count: loaded.length, disposedRejected, identityRejected };
  }, summaries);
  expect(result).toEqual({ samePromise: true, count: 9, disposedRejected: true, identityRejected: true });
  expect(state.maxRunning).toBeLessThanOrEqual(3);
  expect(state.reads.filter((key) => key === "tpl_summary_0@1").length).toBeLessThanOrEqual(2);
});

test("没有 IntersectionObserver 时构图仍可加载，并发不超过三，归档定义可刷新恢复", async ({ page }) => {
  const { state } = await catalogFixture(page, 8);
  await page.addInitScript(() => { Object.defineProperty(window, "IntersectionObserver", { value: undefined, configurable: true }); });
  await page.setViewportSize({ width: 1440, height: 900 });
  state.archived = true;
  await page.goto("/admin/editor/home");
  const first = page.locator('[data-template-name="tpl_summary_0"]');
  await expect(first.getByRole("button", { name: "目录已变化，刷新目录" })).toBeVisible();
  state.archived = false;
  await first.getByRole("button", { name: "目录已变化，刷新目录" }).click();
  await expect(first.locator('[data-preview-art-direction="neutral-template-preview-v1"]')).toBeVisible();
  expect(state.maxRunning).toBeLessThanOrEqual(3);
});

test("目录写后刷新移除卡片，旧精确版本成功回包不能恢复已移除卡片", async ({ page }) => {
  const { state, server } = await catalogFixture(page, 1);
  state.delayMs = 1000;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/editor/home");
  await expect.poll(() => state.running).toBe(1);
  state.templates = [];
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("haichuan:dynamic-template-server-changed")));
  await expect(page.locator('[data-template-name="tpl_summary_0"]')).toHaveCount(0);
  await expect.poll(() => state.running).toBe(0);
  await expect(page.locator('[data-template-name="tpl_summary_0"]')).toHaveCount(0);
  expect(server.writes).toEqual([]);
});

test("添加等待时刷新目录，新版可添加且旧请求回包不会改变新版等待状态", async ({ page }) => {
  const { state, server } = await catalogFixture(page, 1);
  await page.setViewportSize({ width: 1440, height: 900 });
  const v1 = { ...state.templates[0], catalogCoverUrl: "/uploads/page-assets/catalog-cover-0.jpg" };
  const v2 = {
    ...published(0, 1080),
    catalogCoverUrl: v1.catalogCoverUrl,
    version: 2,
    definitionChecksum: "b".repeat(64),
  };
  state.templates = [v1];
  let releaseOld!: () => void;
  let releaseNew!: () => void;
  const pendingOld = new Promise<void>((resolve) => { releaseOld = resolve; });
  const pendingNew = new Promise<void>((resolve) => { releaseNew = resolve; });
  const versionUrl = /\/published\/tpl_summary_0\/versions\/[12]$/;
  await page.route(versionUrl, async (route) => {
    const old = route.request().url().endsWith("/1");
    await (old ? pendingOld : pendingNew);
    await route.fulfill(json({ ...(old ? v1 : v2), status: "ACTIVE" }));
  });
  const card = page.locator('[data-template-name="tpl_summary_0"]');
  const add = card.getByRole("button", { name: /添加到页面：摘要模板 0/ });
  const preview = card.getByRole("button", { name: "放大预览：摘要模板 0" });
  const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
  const instance = canvas.locator('[data-dynamic-template-id="tpl_summary_0"]');
  try {
    await page.goto("/admin/editor/home");
    const oldRequest = page.waitForRequest("**/published/tpl_summary_0/versions/1");
    await add.click();
    await oldRequest;
    await expect(add).toBeDisabled();

    state.templates = [v2];
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("haichuan:dynamic-template-server-changed")));
    await expect(card).toContainText("已发布 · v2");
    await expect(preview).toBeEnabled();
    await expect(add).toBeEnabled();
    const newRequest = page.waitForRequest("**/published/tpl_summary_0/versions/2");
    await add.click();
    await newRequest;
    await expect(add).toBeDisabled();

    const oldResponse = page.waitForResponse("**/published/tpl_summary_0/versions/1");
    releaseOld();
    await (await oldResponse).finished();
    // 等待旧响应在页面完成事件循环和渲染，检查新版仍处于等待。
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    await expect(add).toBeDisabled();
    await expect(preview).toBeDisabled();
    await expect(instance).toHaveCount(0);

    releaseNew();
    await expect(instance).toHaveCount(1);
    await expect(instance).toHaveAttribute("data-template-root-height-ratio", "4:3");
    await expect(add).toBeEnabled();
    expect(server.writes).toEqual([]);
  } finally {
    releaseOld();
    releaseNew();
  }
});

test("页面当前版本检查只读取摘要，新版本差异检查只读取目标精确定义", async ({ page }) => {
  const { server, state } = await catalogFixture(page, 1);
  const current = state.templates[0];
  server.pageDocument.puckData.content = [{ type: "动态模板实例", props: {
    id: "summary-existing-block", instanceSchemaVersion: 1, instanceId: "summary-existing-instance",
    templateId: current.templateId, templateVersion: 1, moduleName: current.name,
    contentBySlotId: {}, layoutOverridesByNodeId: {}, hiddenSlotIds: [], isVisible: true,
  } }];
  Object.assign(server.pageDocument.puckData, { resolvedDynamicTemplates: { [`${current.templateId}@1`]: {
    templateId: current.templateId, version: 1, schemaVersion: current.schemaVersion,
    definitionChecksum: current.definitionChecksum, definition: current.definition,
  } } });
  // 目录收起时没有缩略图请求，能够单独量出版本检查的定义读取次数。
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/admin/editor/home");
  await expect.poll(() => state.publishedReads).toBe(1);
  await expect(page.getByText("当前已锁定最新可用版本 v1。", { exact: true })).toHaveCount(0);
  expect(state.reads).toEqual([]);
  state.templates = [{ ...current, version: 2, definitionChecksum: "b".repeat(64) }];
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("haichuan:dynamic-template-server-changed")));
  await expect(page.getByText("此区块有可用更新", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "区块操作", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "区块操作" })).toContainText("此区块有可用更新");
  expect(state.reads).toEqual(["tpl_summary_0@2"]);
  await page.getByRole("button", { name: "查看差异", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "模板版本升级：v1 → v2" })).toBeVisible();
  expect(server.writes).toEqual([]);
});
