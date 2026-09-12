import { expect, test, type Page } from "@playwright/test";
import type { TemplateDefinitionV2 } from "../src/page-builder/template-definition";
import { applyBasicSkeleton, createBlankTemplate, installNewTemplateServer, readSession, saveTemplate, stableAuthoringFacts } from "./fixtures/template-authoring-main-route";

async function prepare(page: Page, legacy = false) {
  const server = await installNewTemplateServer(page);
  await page.route("**/__refinement-image.svg", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#999" /></svg>' }));
  await createBlankTemplate(page);
  await applyBasicSkeleton(page);
  const ids = await page.evaluate(async (isLegacy) => {
    const path = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ path);
    const state = useTemplateEditorSession.getState();
    const draft = structuredClone(state.draft);
    const definition = draft.definition as TemplateDefinitionV2;
    if (!isLegacy) definition.schemaVersion = 3;
    const images = Object.values(definition.nodes).filter((node) => node.slotId && definition.slots[node.slotId]?.type === "image");
    const title = Object.values(definition.nodes).find((node) => node.slotId && definition.slots[node.slotId]?.type === "heading")!;
    if (!isLegacy) {
      definition.defaultContent[images[0].slotId!] = { src: "", alt: "" };
      definition.defaultContent[images[1].slotId!] = { src: "/__refinement-image.svg", alt: "已有默认图片" };
      definition.defaultContent[title.slotId!] = "原始默认标题";
    }
    state.open(draft, { isNew: true });
    return { empty: images[0].nodeId, full: images[1].nodeId, title: title.nodeId, titleSlot: title.slotId!, imageSlot: images[0].slotId! };
  }, legacy);
  return { server, ids };
}

async function selectNode(page: Page, nodeId: string) {
  await page.evaluate(async (id) => {
    const path = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ path);
    useTemplateEditorSession.getState().selectObject(id);
  }, nodeId);
}

test("默认内容精修不受试排覆盖，试排只在预览可达且退出恢复默认显示（Mock）", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const { ids, server } = await prepare(page);
  await selectNode(page, ids.title);
  await page.evaluate(async ({ slotId }) => {
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const trialPath = "/src/page-builder/template-editor/templateTrialContentSession.ts";
    const [{ useTemplateEditorSession }, { useTemplateTrialContentSession }] = await Promise.all([import(/* @vite-ignore */ sessionPath), import(/* @vite-ignore */ trialPath)]);
    useTemplateTrialContentSession.getState().setSlotContent(useTemplateEditorSession.getState().sessionId, slotId, "之前的临时试排");
  }, { slotId: ids.titleSlot });
  const canvas = page.frameLocator("iframe[title$='模板隔离画布']");
  await expect(canvas.getByText("原始默认标题", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "试排内容（仅本次编辑）" })).toHaveCount(0);
  const defaultText = page.getByRole("textbox", { name: "默认文字", exact: true });
  await defaultText.fill("已精修默认标题"); await defaultText.press("Tab");
  await expect(canvas.getByText("已精修默认标题", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("refinement-desktop-default.png"), fullPage: true });
  const before = stableAuthoringFacts(await readSession(page));
  await page.getByRole("button", { name: "预览模板", exact: true }).click();
  await page.getByText("自定义试排内容", { exact: true }).click();
  await page.getByRole("combobox", { name: "试排对象", exact: true }).selectOption(ids.title);
  await expect(page.getByRole("textbox", { name: "试排标题", exact: true })).toHaveValue("之前的临时试排");
  await page.getByRole("textbox", { name: "试排标题", exact: true }).fill("只在预览显示的标题");
  await expect(canvas.getByText("只在预览显示的标题", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "退出预览并继续编辑", exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("refinement-desktop-trial.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 1000 });
  const expandInspector = page.locator('[data-panel="inspector"][data-action="expand"]');
  await expect(expandInspector).toBeVisible();
  await expandInspector.click();
  await expect(page.getByRole("textbox", { name: "试排标题", exact: true })).toHaveValue("只在预览显示的标题");
  await expect(page.getByRole("button", { name: "退出预览并继续编辑", exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("refinement-mobile-trial.png"), fullPage: true });
  await page.setViewportSize({ width: 1600, height: 1000 });
  expect(stableAuthoringFacts(await readSession(page))).toEqual(before);
  await page.getByRole("button", { name: "退出预览并继续编辑", exact: true }).click();
  await expect(canvas.getByText("已精修默认标题", { exact: true })).toBeVisible();
  expect(stableAuthoringFacts(await readSession(page))).toEqual(before);
  expect(server.writes).toEqual([]);
  await saveTemplate(page);
  await expect.poll(() => server.saveResults.length).toBe(1);
  expect(server.persisted?.draft?.definition.defaultContent[ids.titleSlot]).toBe("已精修默认标题");
});

for (const width of [1600, 390]) test(`${width}px 空图片双击定位默认图片，已有图片仍可裁剪（Mock）`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1000 });
  const { ids, server } = await prepare(page);
  await selectNode(page, ids.empty);
  const before = stableAuthoringFacts(await readSession(page));
  const hit = page.locator(`[data-overlay-hit-for="node:${ids.empty}"]`);
  await hit.dblclick();
  const defaults = page.locator(`[data-template-default-content="${ids.imageSlot}"]`);
  await expect(defaults).toBeVisible();
  await expect.poll(() => defaults.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`refinement-image-properties-${width}.png`), fullPage: true });
  await expect(page.getByRole("group", { name: "图片取景编辑", exact: true })).toHaveCount(0);
  expect(stableAuthoringFacts(await readSession(page))).toEqual(before);
  if (width === 390) {
    await expect(page.getByRole("dialog", { name: "模板属性工作区", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await selectNode(page, ids.full);
  const fullImage = page.locator(`[data-overlay-hit-for="node:${ids.full}"]`);
  const imageBox = await fullImage.boundingBox();
  if (!imageBox) throw new Error("已有图片缺少可见外框");
  await fullImage.dblclick({ position: { x: imageBox.width * .75, y: imageBox.height * .25 } });
  await expect(page.getByRole("group", { name: "图片取景编辑", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "取消取景", exact: true }).click();
  expect(stableAuthoringFacts(await readSession(page))).toEqual(before);
  expect(server.writes).toEqual([]);
});

test("并排预览收在视图辅助，布局导航为中文且查看不改草稿（Mock）", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const { server } = await prepare(page);
  const before = stableAuthoringFacts(await readSession(page));
  const navigation = page.getByRole("navigation", { name: "画布编辑层级" });
  await expect(navigation).not.toContainText(/Desktop|Tablet|Mobile|\bblock\b|\bflex\b/);
  await expect(page.getByRole("button", { name: "多设备并排预览", exact: true })).toBeHidden();
  await page.getByRole("button", { name: /^视图辅助/ }).click();
  await page.getByRole("group", { name: "画布视图辅助" }).getByRole("button", { name: "多设备并排预览", exact: true }).click();
  await expect(page.locator(".template-breakpoint-comparison__card iframe")).toHaveCount(3);
  await page.getByRole("button", { name: "返回单画布编辑", exact: true }).click();
  await expect(page.locator("iframe.template-editor__viewport-frame")).toHaveCount(1);
  expect(stableAuthoringFacts(await readSession(page))).toEqual(before);
  expect(server.writes).toEqual([]);
});

test("旧模板文字双击进入对应试排对象，退出预览不改变旧默认内容（Mock）", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const { ids, server } = await prepare(page, true);
  await selectNode(page, ids.title);
  const before = stableAuthoringFacts(await readSession(page));
  await page.locator(`[data-overlay-hit-for="node:${ids.title}"]`).dblclick();
  await expect(page.getByRole("combobox", { name: "试排对象", exact: true })).toHaveValue(ids.title);
  const input = page.getByRole("textbox", { name: "试排标题", exact: true });
  await expect(input).toBeFocused();
  await input.fill("旧模板临时预览标题");
  await expect(page.frameLocator("iframe[title$='模板隔离画布']").getByText("旧模板临时预览标题", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "退出预览并继续编辑", exact: true }).click();
  expect(stableAuthoringFacts(await readSession(page))).toEqual(before);
  expect(server.writes).toEqual([]);
});
