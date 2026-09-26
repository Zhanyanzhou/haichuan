import { expect, test } from "@playwright/test";
import {
  createBlankTemplate,
  installNewTemplateServer,
  makeResource,
  openTemplateDesignWithoutDraft,
} from "./fixtures/template-authoring-main-route";

const COVER_URL = "/uploads/page-assets/catalog-cover.jpg";
const CROPPED_COVER_URL = "/uploads/page-assets/catalog-cover-cropped.jpg";

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

test("未保存本机草稿不能上传组件库预览图", async ({ page }) => {
  await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await createBlankTemplate(page);
  const card = page.locator(".unified-template-library__card").first();
  await card.getByRole("button", { name: /更多模板操作/ }).click();
  const upload = page.getByRole("menuitem", { name: /上传预览图$/ });
  await expect(upload).toBeDisabled();
  await expect(upload).toHaveAttribute("title", "请先保存模板，再上传组件库预览图");
});

test("已保存模板可上传组件库预览图，放大预览仍用实时渲染", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTemplateDesignWithoutDraft(page);
  const definition = await sourceDefinition(page);
  server.persisted = makeResource(definition, 3);
  await openTemplateDesignWithoutDraft(page);
  const card = page.locator(`[data-template-name="${definition.templateId}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator("[data-catalog-cover]")).toHaveCount(0);

  await card.getByRole("button", { name: /更多模板操作/ }).click();
  await page.getByRole("menuitem", { name: /上传预览图$/ }).click();
  const editor = page.getByRole("dialog", { name: `组件库预览图：${definition.name}` });
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: /粘贴图片链接/ }).click();
  await editor.getByPlaceholder("输入图片 URL；清空后确认 = 删除图片").fill(COVER_URL);
  await editor.getByRole("button", { name: /确\s*认/ }).click();
  await expect(editor.locator("[data-catalog-cover-cropper]")).toBeVisible();
  const canvas = definition.metadata.canvasSize;
  expect(canvas).toBeTruthy();
  await expect(editor.locator("[data-catalog-cover-cropper]")).toHaveAttribute(
    "data-cover-width",
    String(canvas?.width),
  );
  await expect(editor.locator("[data-catalog-cover-cropper]")).toHaveAttribute(
    "data-cover-height",
    String(canvas?.height),
  );
  await expect(editor.locator("[data-catalog-cover-slots]")).toBeVisible();
  expect(await editor.locator("[data-cover-slot]").count()).toBeGreaterThan(0);
  const apply = editor.getByRole("button", { name: /应用这张预览图/ });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(page.getByText("组件库预览图已更新", { exact: true })).toBeVisible();
  await expect(card.locator("[data-catalog-cover] img")).toBeVisible();
  await expect(card.locator("[data-catalog-cover]")).toHaveAttribute("data-cover-width", String(canvas?.width));
  await expect(card.locator("[data-catalog-cover]")).toHaveAttribute("data-cover-height", String(canvas?.height));
  await expect(card.locator("[data-catalog-cover] img")).toHaveCSS("object-fit", "contain");
  expect(server.persisted?.catalogCoverUrl).toBe(CROPPED_COVER_URL);
  expect(server.writes.some((write) => (
    write.method === "POST"
    && write.path.includes("/crop-page-asset")
    && (write.body as { sourceUrl?: string }).sourceUrl === COVER_URL
  ))).toBe(true);
  expect(server.writes.some((write) => (
    write.method === "PATCH"
    && write.path.includes("/catalog-cover")
    && (write.body as { catalogCoverUrl?: string }).catalogCoverUrl === CROPPED_COVER_URL
  ))).toBe(true);

  await editor.getByRole("button", { name: /完\s*成/ }).click();
  await expect(editor).toHaveCount(0);

  await card.getByRole("button", { name: /更多模板操作/ }).click();
  await expect(page.getByRole("menuitem", { name: /更换预览图$/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await card.getByRole("button", { name: `放大预览：${definition.name}` }).click();
  const preview = page.getByRole("dialog", { name: `放大预览：${definition.name}` });
  await expect(preview).toBeVisible();
  await expect(preview.locator("[data-catalog-cover]")).toHaveCount(0);
  await preview.getByRole("button", { name: "关闭预览", exact: true }).click();

  await card.getByRole("button", { name: /更多模板操作/ }).click();
  await page.getByRole("menuitem", { name: /更换预览图$/ }).click();
  const replace = page.getByRole("dialog", { name: `组件库预览图：${definition.name}` });
  await replace.getByRole("button", { name: /改回实时预览/ }).click();
  await expect(page.getByText("已改回实时预览", { exact: true })).toBeVisible();
  await expect(card.locator("[data-catalog-cover]")).toHaveCount(0);
  expect(server.persisted?.catalogCoverUrl ?? null).toBeNull();
});
