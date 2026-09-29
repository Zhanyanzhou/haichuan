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
    const [{ generateTemplateFromRecipe }, { createRecommendedRecipe }] = await Promise.all([
      import(/* @vite-ignore */ generatorPath),
      import(/* @vite-ignore */ presetsPath),
    ]);
    return generateTemplateFromRecipe(createRecommendedRecipe(), { name: "组件库预览图验收" });
  });
}

test("新建模板卡片自动显示中性结构，不提供封面上传入口", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await createBlankTemplate(page);
  const card = page.locator(".unified-template-library__card").first();
  await expect(card.locator('[data-preview-art-direction="neutral-template-preview-v1"]')).toBeVisible();
  const slotKey = card.locator(".template-editor__catalog-slot-key");
  await expect(slotKey.locator(":scope > span")).toHaveCount(4);
  expect(await slotKey.locator(":scope > span").allTextContents()).toEqual([
    expect.stringMatching(/^图片 \d+$/),
    expect.stringMatching(/^文字 \d+$/),
    expect.stringMatching(/^按钮 \d+$/),
    expect.stringMatching(/^隐藏 \d+$/),
  ]);
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
  await expect(card.locator(".template-editor__catalog-dimensions"))
    .toHaveText(`桌面端 · 宽 ${definition.metadata.canvasSize.width} px · 高随内容`);
  const renderer = card.locator("iframe[data-template-catalog-viewport]").contentFrame()
    .locator(".template-editor__catalog-canvas-renderer");
  await expect.poll(() => renderer.evaluate((element) => getComputedStyle(element).minHeight))
    .toBe("240px");
  expect(server.writes).toEqual([]);
});

test("超长手机模板卡片使用明确标注的局部滚动视窗，放大预览保留完整画幅", async ({ page }) => {
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
  await expect(shell).toHaveAttribute("data-preview-thumbnail-mode", "scroll");
  await expect(card.locator(".template-editor__catalog-long-page-hint"))
    .toHaveText("长页局部 · 滚动查看");
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
  await stage.press("PageDown");
  await expect.poll(() => stage.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await card.getByRole("button", { name: `放大预览：${definition.name}` }).click();
  const dialog = page.getByRole("dialog", { name: `放大预览：${definition.name}` });
  await expect(dialog.locator("[data-template-catalog-preview-shell]"))
    .toHaveAttribute("data-preview-thumbnail-mode", "overview");
  await expect(dialog.locator(".template-editor__catalog-long-page-hint")).toHaveCount(0);
  expect(server.writes).toEqual([]);
});

test("历史封面不覆盖中性缩略图，放大预览仍使用真实内容", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTemplateDesignWithoutDraft(page);
  const definition = await sourceDefinition(page);
  server.persisted = { ...makeResource(definition, 3), catalogCoverUrl: COVER_URL };
  await openTemplateDesignWithoutDraft(page);
  const card = page.locator(`[data-template-name="${definition.templateId}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator("[data-catalog-cover]")).toHaveCount(0);
  await expect(card.locator('[data-preview-art-direction="neutral-template-preview-v1"]')).toBeVisible();
  const thumbnail = card.locator("iframe[data-template-catalog-viewport]").contentFrame();
  await expect(thumbnail.locator('img[src*="catalog-structure-media.svg"]').first()).toBeVisible();
  await card.getByRole("button", { name: /更多模板操作/ }).click();
  await expect(page.getByRole("menuitem", { name: /上传预览图|更换预览图/ })).toHaveCount(0);
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
  await expect(card.locator(".template-editor__catalog-dimensions")).toContainText("移动端");

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
