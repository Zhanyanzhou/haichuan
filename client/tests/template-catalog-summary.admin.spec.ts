import { expect, test, type Page } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";
import { createContentSlot, createRecommendedRecipe } from "../src/page-builder/template-creation/presets";
import type { PublishedDynamicTemplateResource } from "../src/services/clients/dynamicTemplateClient";
import { installNewTemplateServer, json, makePublished, makeResource } from "./fixtures/template-authoring-main-route";

function published(index: number) {
  const recipe = createRecommendedRecipe();
  recipe.canvas = { width: 1440, height: 810, aspectRatio: 16 / 9 };
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
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/editor/home");
  await expect(page.getByText("当前已锁定最新可用版本 v1。", { exact: true })).toBeVisible();
  expect(state.publishedReads).toBe(1);
  expect(state.reads).toEqual([]);
  state.templates = [{ ...current, version: 2, definitionChecksum: "b".repeat(64) }];
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("haichuan:dynamic-template-server-changed")));
  await expect(page.getByText("发现新版本 v2", { exact: true })).toBeVisible();
  expect(state.reads).toEqual(["tpl_summary_0@2"]);
  await page.getByRole("button", { name: "查看差异", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "模板版本升级：v1 → v2" })).toBeVisible();
  expect(server.writes).toEqual([]);
});
