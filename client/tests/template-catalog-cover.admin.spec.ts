import { expect, test } from "@playwright/test";
import {
  createBlankTemplate,
  installNewTemplateServer,
  makeResource,
  openTemplateDesignWithoutDraft,
} from "./fixtures/template-authoring-main-route";

const COVER_URL = "/uploads/page-assets/catalog-cover.jpg";

async function sourceDefinition(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const generatorPath = "/src/page-builder/template-creation/generateTemplateFromRecipe.ts";
    const presetsPath = "/src/page-builder/template-creation/presets.ts";
    const [{ generateTemplateFromRecipe }, { createRecommendedRecipe, createContentSlot, createMediaSlots }] = await Promise.all([
      import(/* @vite-ignore */ generatorPath),
      import(/* @vite-ignore */ presetsPath),
    ]);
    // 角色未定的中性配方：画幅随内容增长、无图片、无内容。本文件要断固定画幅与目录结构缩略图，
    // 因此显式给出 16:9 固定画幅、一个没有默认图的图片槽与一个标题槽。
    const recipe = createRecommendedRecipe();
    recipe.canvas = { width: 1440, height: 810, aspectRatio: 16 / 9 };
    recipe.media = createMediaSlots(["heroImage"]);
    recipe.content = [createContentSlot("title")];
    return generateTemplateFromRecipe(recipe, { name: "组件库预览图验收" });
  });
}

test("新建模板卡片自动显示中性结构，不提供封面上传入口", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await createBlankTemplate(page);
  const card = page.locator(".unified-template-library__card").first();
  await expect(card.locator('[data-preview-art-direction="neutral-template-preview-v1"]')).toBeVisible();
  await expect(card.locator(".template-editor__catalog-slot-key")).toHaveCount(0);
  await expect(card.locator(".template-editor__catalog-dimensions")).toHaveCount(0);
  await expect(card.locator(".template-editor__catalog-published-state")).toHaveText("本机草稿 · 尚未发布");
  await expect(card.locator(".template-editor__catalog-draft-state")).toHaveText("尚未保存");
  await card.getByRole("button", { name: /更多模板操作/ }).click();
  await expect(page.getByRole("menuitem", { name: /上传预览图|更换预览图/ })).toHaveCount(0);
  expect(server.writes).toEqual([]);
});

test("自适应模板只标设计宽度与高随内容，不把预览测量值写成固定尺寸", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTemplateDesignWithoutDraft(page);
  const definition = await sourceDefinition(page);
  definition.nodes[definition.rootNodeId].responsive.desktop.height = { mode: "auto" };
  server.persisted = makeResource(definition, 3);
  await openTemplateDesignWithoutDraft(page);
  const card = page.locator(`[data-template-name="${definition.templateId}"]`);
  await expect(card.locator(".template-editor__catalog-dimensions")).toHaveCount(0);
  await card.getByRole("button", { name: `放大预览：${definition.name}` }).click();
  const preview = page.getByRole("dialog", { name: `放大预览：${definition.name}` });
  await expect(preview.locator(".template-editor__catalog-dimensions"))
    .toHaveText(`桌面端 · 宽 ${definition.metadata.canvasSize.width} px · 高随内容`);
  await preview.getByRole("button", { name: "关闭预览", exact: true }).click();
  const renderer = card.locator("iframe[data-template-catalog-viewport]").contentFrame()
    .locator(".template-editor__catalog-canvas-renderer");
  await expect.poll(() => renderer.evaluate((element) => getComputedStyle(element).minHeight))
    .toBe("240px");
  expect(server.writes).toEqual([]);
});

test("超长手机模板卡片只显示顶部并标明下面还有，放大预览保留完整画幅", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTemplateDesignWithoutDraft(page);
  const definition = await sourceDefinition(page);
  definition.nodes[definition.rootNodeId].responsive.mobile.height = {
    mode: "fixed",
    value: { unit: "px", value: 3200 },
  };
  server.persisted = makeResource(definition, 3);
  await openTemplateDesignWithoutDraft(page);
  await page.getByRole("button", { name: "移动端模板布局（390 px）" }).click();

  const card = page.locator(`[data-template-name="${definition.templateId}"]`);
  const shell = card.locator("[data-template-catalog-preview-shell]");
  await expect(shell).toHaveAttribute("data-preview-status", "ready");
  await expect(shell).toHaveAttribute("data-preview-thumbnail-mode", "top");
  await expect(card.locator(".template-editor__catalog-long-page-hint"))
    .toHaveText("下面还有");
  const stage = card.locator(".template-editor__catalog-artboard-stage");
  const geometry = await stage.evaluate((element) => ({
    clientHeight: element.clientHeight,
    previewWidth: element.querySelector(".template-editor__catalog-viewport-preview")?.getBoundingClientRect().width ?? 0,
    scrollHeight: element.scrollHeight,
    width: element.clientWidth,
  }));
  expect(geometry.clientHeight).toBe(220);
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight * 2);
  expect(geometry.previewWidth).toBeGreaterThan(geometry.width * 0.85);
  expect(await stage.evaluate((element) => getComputedStyle(element).overflow)).toBe("hidden");

  await card.getByRole("button", { name: `放大预览：${definition.name}` }).click();
  const dialog = page.getByRole("dialog", { name: `放大预览：${definition.name}` });
  await expect(dialog.locator("[data-template-catalog-preview-shell]"))
    .toHaveAttribute("data-preview-thumbnail-mode", "overview");
  await expect(dialog.locator(".template-editor__catalog-long-page-hint")).toHaveCount(0);
  expect(server.writes).toEqual([]);
});

test("已上传的预览图替换卡片，未上传时仍是中性图", async ({ page }) => {
  await page.route("**/api/upload/media/preview-by-storage-key**", (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"800\" height=\"450\"><rect width=\"800\" height=\"450\" fill=\"#d9d9d9\"/></svg>",
  }));
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTemplateDesignWithoutDraft(page);
  const definition = await sourceDefinition(page);
  server.persisted = { ...makeResource(definition, 3), catalogCoverUrl: COVER_URL };
  await openTemplateDesignWithoutDraft(page);
  const card = page.locator(`[data-template-name="${definition.templateId}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator("[data-catalog-cover]")).toBeVisible();
  await expect(card.locator('[data-preview-art-direction="neutral-template-preview-v1"]')).toHaveCount(0);
  await card.getByRole("button", { name: /更多模板操作/ }).click();
  await expect(page.getByRole("menuitem", { name: "更换预览图" })).toBeVisible();
  await page.keyboard.press("Escape");
  await card.getByRole("button", { name: `放大预览：${definition.name}` }).click();
  const preview = page.getByRole("dialog", { name: `放大预览：${definition.name}` });
  await expect(preview).toBeVisible();
  await expect(preview.locator('[data-preview-art-direction="actual-template-content"]')).toBeVisible();
  expect(server.persisted?.catalogCoverUrl).toBe(COVER_URL);
  expect(server.writes).toEqual([]);
  await preview.getByRole("button", { name: "关闭预览", exact: true }).click();
});

test("目录跟随当前设备，放大预览可只读切换真实内容与中性结构", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTemplateDesignWithoutDraft(page);
  const definition = await sourceDefinition(page);
  server.persisted = makeResource(definition, 3);
  await openTemplateDesignWithoutDraft(page);
  const card = page.locator(`[data-template-name="${definition.templateId}"]`);

  await expect(card.locator('[data-preview-viewport="desktop"]')).toBeVisible();
  await page.getByRole("button", { name: "移动端模板布局（390 px）" }).click();
  await expect(card.locator('[data-preview-viewport="mobile"]')).toBeVisible();
  await expect(card.locator(".template-editor__catalog-dimensions")).toHaveCount(0);

  await card.getByRole("button", { name: `放大预览：${definition.name}` }).click();
  const preview = page.getByRole("dialog", { name: `放大预览：${definition.name}` });
  await expect(preview.getByRole("button", { name: "移动端", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(preview.getByRole("button", { name: "真实内容" })).toHaveAttribute("aria-pressed", "true");
  await expect(preview.locator('[data-preview-art-direction="actual-template-content"]')).toBeVisible();

  await preview.getByRole("button", { name: "中性结构" }).click();
  await expect(preview.getByRole("button", { name: "中性结构" })).toHaveAttribute("aria-pressed", "true");
  await expect(preview.locator('[data-preview-art-direction="neutral-template-preview-v1"]')).toBeVisible();
  await expect(preview.locator('[data-preview-annotations="true"]')).toBeVisible();
  await expect(preview.locator("[data-preview-slot-box-count]")).not.toHaveAttribute("data-preview-slot-box-count", "0");

  await preview.getByRole("button", { name: "真实内容" }).click();
  await expect(preview.locator('[data-preview-art-direction="actual-template-content"]')).toBeVisible();
  expect(server.writes).toEqual([]);
  await preview.getByRole("button", { name: "关闭预览", exact: true }).click();
});
