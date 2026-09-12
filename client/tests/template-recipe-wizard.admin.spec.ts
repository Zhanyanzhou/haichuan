import { expect, test, type Locator, type Page } from "@playwright/test";
import { installNewTemplateServer, openTemplateDesignWithoutDraft, readSession } from "./fixtures/template-authoring-main-route";
import { TEMPLATE_RECIPE_SCHEMA } from "../src/page-builder/template-definition/generated/templateDefinition.generated";

async function openWizard(page: Page) {
  await openTemplateDesignWithoutDraft(page);
  if ((page.viewportSize()?.width ?? 1280) < 600) {
    await page.getByRole("button", { name: "更多模板操作", exact: true }).click();
    await page.getByRole("menuitem", { name: /新建模板$/ }).click();
  } else {
    await page.getByRole("button", { name: "顶部新建模板", exact: true }).click();
  }
  return page.getByRole("dialog", { name: "创建模板", exact: true });
}

async function openRecipeConfirmation(page: Page, layout = "上图下文") {
  const dialog = await openWizard(page);
  await dialog.getByRole("button", { name: "商品促销", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: "竖版 4:5", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: layout, exact: true }).click();
  await dialog.getByRole("button", { name: "前往确认（未配置项用推荐值）", exact: true }).click();
  return dialog;
}

async function normalizedImageFrames(preview: Locator) {
  return preview.locator(".template-recipe__preview-render").evaluate((element) => {
    const canvas = element.getBoundingClientRect();
    return [...element.querySelectorAll('[data-template-node-type="ImageSlot"]')].map((image) => {
      const rect = image.getBoundingClientRect();
      return { x: (rect.x - canvas.x) / canvas.width, y: (rect.y - canvas.y) / canvas.height,
        width: rect.width / canvas.width, height: rect.height / canvas.height };
    });
  });
}

async function expectCanvasRatio(preview: Locator, width: number, height: number) {
  await expect(preview).toHaveAttribute("data-canvas-width", String(width));
  await expect(preview).toHaveAttribute("data-canvas-height", String(height));
  await expect.poll(async () => {
    const box = await preview.boundingBox();
    return box && box.height > 0 ? Math.abs(box.width / box.height - width / height) : Infinity;
  }).toBeLessThan(.02);
}

async function expectDiagramRatio(diagram: Locator, width: number, height: number) {
  await expect(diagram).toHaveAttribute("data-canvas-width", String(width));
  await expect(diagram).toHaveAttribute("data-canvas-height", String(height));
  await expect(diagram).toHaveAttribute("viewBox", `0 0 ${width} ${height}`);
}

async function setImageAppearance(dialog: Locator, index: number, setting: "形状" | "比例" | "填充", value: string) {
  await dialog.getByRole("button", { name: new RegExp(`^选择图片 ${index}：`) }).click();
  await dialog.getByRole("button", { name: `图片 ${index}${setting}：${value}`, exact: true }).click();
}

async function expectImageAppearance(dialog: Locator, index: number, setting: "形状" | "比例" | "填充", value: string) {
  await dialog.getByRole("button", { name: new RegExp(`^选择图片 ${index}：`) }).click();
  await expect(dialog.getByRole("button", { name: `图片 ${index}${setting}：${value}`, exact: true })).toHaveAttribute("aria-pressed", "true");
}

async function normalizedDiagramImageFrames(diagram: Locator) {
  return diagram.evaluate((element) => {
    const width = Number(element.getAttribute("data-canvas-width"));
    const height = Number(element.getAttribute("data-canvas-height"));
    return [...element.querySelectorAll('[data-diagram-kind="image"] > rect, [data-diagram-kind="background"] > rect, [data-diagram-kind="logo"] > rect')].map((rect) => ({
      x: Number(rect.getAttribute("x")) / width, y: Number(rect.getAttribute("y")) / height,
      width: Number(rect.getAttribute("width")) / width, height: Number(rect.getAttribute("height")) / height,
    })).sort((a, b) => a.x - b.x || a.y - b.y);
  });
}

test("4:3 双图并排的单图特点跨内容风格返回及创建保持一致（自有 API Mock）", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const dialog = await openWizard(page);
  const next = () => dialog.getByRole("button", { name: "下一步", exact: true }).click();
  const previous = () => dialog.getByRole("button", { name: "上一步", exact: true }).click();
  await dialog.getByRole("button", { name: "品牌宣传", exact: true }).click();
  await next();
  await dialog.getByRole("button", { name: "更多尺寸", exact: true }).click();
  await dialog.getByRole("button", { name: "标准横版 4:3", exact: true }).click();
  await next();
  await dialog.getByRole("button", { name: "上图下文", exact: true }).click();
  await dialog.getByRole("button", { name: "2 张图片", exact: true }).click();
  await dialog.getByRole("button", { name: "图片并排", exact: true }).click();
  await next();
  await setImageAppearance(dialog, 1, "形状", "圆形");
  await expect(dialog.getByRole("button", { name: "图片 1比例：3:4", exact: true })).toBeDisabled();
  await setImageAppearance(dialog, 2, "比例", "3:4");
  await setImageAppearance(dialog, 2, "填充", "完整显示");
  const main = dialog.getByLabel("生成方案预览");
  await expectCanvasRatio(main, 1200, 900);
  const rowStays = async () => {
    const frames = (await normalizedImageFrames(main)).sort((a, b) => a.x - b.x);
    expect(frames).toHaveLength(2);
    expect(frames[1].x).toBeGreaterThan(frames[0].x + frames[0].width);
    expect(Math.abs(frames[0].y + frames[0].height / 2 - frames[1].y - frames[1].height / 2)).toBeLessThan(.002);
  };
  await rowStays();
  await next();
  await dialog.getByRole("checkbox", { name: "主标题", exact: true }).check();
  await dialog.getByRole("checkbox", { name: "按钮 / CTA", exact: true }).check();
  await next();
  await dialog.getByRole("button", { name: "高端", exact: true }).click();
  await previous();
  await expect(dialog.getByRole("checkbox", { name: "按钮 / CTA", exact: true })).toBeChecked();
  await previous();
  await expectImageAppearance(dialog, 1, "形状", "圆形");
  await expectImageAppearance(dialog, 2, "比例", "3:4");
  await expectImageAppearance(dialog, 2, "填充", "完整显示");
  await rowStays();
  await previous();
  await expect(dialog.getByRole("button", { name: "图片并排", exact: true })).toHaveAttribute("aria-pressed", "true");
  const diagram = dialog.getByRole("button", { name: "上图下文", exact: true }).locator("[data-recipe-layout-diagram]");
  await expectDiagramRatio(diagram, 1200, 900);
  const expected = await normalizedDiagramImageFrames(diagram);
  const actual = (await normalizedImageFrames(main)).sort((a, b) => a.x - b.x || a.y - b.y);
  expect(actual).toHaveLength(expected.length);
  for (let index = 0; index < expected.length; index++) {
    for (const key of ["x", "y", "width", "height"] as const) expect(actual[index][key]).toBeCloseTo(expected[index][key], 2);
  }
  await dialog.getByRole("button", { name: "前往确认（未配置项用推荐值）", exact: true }).click();
  await expectCanvasRatio(main, 1200, 900);
  expect((await readSession(page)).definition).toBeNull();
  expect(server.writes).toEqual([]);
  await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
  await expect(dialog).toBeHidden();
  const definition = (await readSession(page)).definition!;
  expect(definition.metadata.canvasSize).toEqual({ width: 1200, height: 900, aspectRatio: 4 / 3 });
  expect(definition.templateRecipe).toMatchObject({ layout: "topImageBottomContent", rules: { mediaArrangement: "row" }, style: { variant: "premium" } });
  expect(definition.templateRecipe!.media[0]).toMatchObject({ shape: "circle", aspectRatio: 1, freeRatio: false });
  expect(definition.templateRecipe!.media[1]).toMatchObject({ aspectRatio: .75, fitMode: "contain" });
  expect(definition.templateRecipe!.content.some((slot) => slot.role === "cta")).toBe(true);
  const images = Object.values(definition.nodes).filter((node) => node.slotId && definition.slots[node.slotId].type === "image");
  expect(images[0].responsive.desktop.radius).toEqual({ value: 50, unit: "%" });
  expect(definition.defaultContent).toEqual({});
  expect(server.writes).toEqual([]);
});

for (const viewport of [{ width: 1600, height: 1000 }, { width: 1200, height: 900 }, { width: 390, height: 844 }]) {
  test(`图片方案示意、比例设置与自适应预览 ${viewport.width}px（自有 API Mock）`, async ({ page }, testInfo) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize(viewport);
    const dialog = await openWizard(page);
    const next = dialog.getByRole("button", { name: "下一步", exact: true });
    await dialog.getByRole("button", { name: "品牌宣传", exact: true }).click();
    await next.click();
    await dialog.getByRole("button", { name: "更多尺寸", exact: true }).click();
    await dialog.getByRole("button", { name: "标准横版 4:3", exact: true }).click();
    await next.click();
    await expect(dialog.locator(".template-recipe__composition-grid").first().getByRole("button")).toHaveCount(6);
    await dialog.getByRole("button", { name: "更多布局", exact: true }).click();
    await expect(dialog.locator(".template-recipe__composition-grid").first().getByRole("button")).toHaveCount(10);
    await expectDiagramRatio(dialog.getByRole("button", { name: "左文右图", exact: true }).locator("[data-recipe-layout-diagram]"), 1200, 900);
    await dialog.getByRole("button", { name: "左文右图", exact: true }).click();
    await dialog.getByRole("button", { name: "2 张图片", exact: true }).click();
    const twoImageDiagram = dialog.getByRole("button", { name: "2 张图片", exact: true }).locator("[data-recipe-layout-diagram]");
    await expectDiagramRatio(twoImageDiagram, 1200, 900);
    await expect(twoImageDiagram.locator('[data-diagram-kind="image"]')).toHaveCount(2);
    await expect(dialog.getByRole("button", { name: "2 张图片", exact: true })).toHaveAttribute("aria-pressed", "true");
    await next.click();
    await expect(dialog.getByRole("button", { name: "2 张图片", exact: true })).toHaveCount(0);
    await expect(dialog.locator("[data-recipe-layout-diagram]")).toHaveCount(0);
    const frame = dialog.locator(".ant-modal-content");
    const noOverflow = async () => {
      expect(await frame.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      const box = (await frame.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    };
    await noOverflow();
    await page.screenshot({ path: testInfo.outputPath(`media-options-${viewport.width}.png`) });
    await setImageAppearance(dialog, 1, "比例", "4:5");
    await dialog.getByRole("button", { name: /^选择图片 2：/ }).click();
    await expectImageAppearance(dialog, 1, "比例", "4:5");
    const ratio = dialog.getByRole("button", { name: "图片 1比例：1:1", exact: true });
    await ratio.focus();
    await page.keyboard.press("Enter");
    await expect(ratio).toHaveAttribute("aria-pressed", "true");
    await setImageAppearance(dialog, 1, "比例", "4:5");
    await noOverflow();
    await page.screenshot({ path: testInfo.outputPath(`media-settings-${viewport.width}.png`) });
    if (viewport.width <= 760) await dialog.getByRole("button", { name: "查看预览", exact: true }).click();
    const preview = dialog.getByLabel("生成方案预览");
    await expect(preview).toBeVisible();
    await expect.poll(async () => (await preview.boundingBox())!.width).toBeGreaterThan(viewport.width > 760 ? 400 : 280);
    await expect.poll(async () => (await preview.locator('[data-template-node-type="ImageSlot"]').first().boundingBox())?.width ?? 0).toBeGreaterThan(40);
    const previewBox = (await preview.boundingBox())!;
    expect(Math.abs(previewBox.width / previewBox.height - 4 / 3)).toBeLessThan(.02);
    expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`media-preview-${viewport.width}.png`) });
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(server.writes).toEqual([]);
  });
}

test("确认摘要分项修改与错误定位保留输入，修复后直接返回确认（自有 API Mock）", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  const dialog = await openRecipeConfirmation(page);
  for (const section of ["用途", "尺寸", "布局", "图片", "内容", "风格"]) await expect(dialog.getByRole("button", { name: `修改${section}`, exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "修改尺寸", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "选择画布尺寸", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "自定义尺寸", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "宽度", exact: true }).fill("10");
  await expect(dialog.getByRole("button", { name: "返回确认", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("alert")).toContainText("当前画布无法容纳");
  await dialog.getByRole("alert").getByRole("button", { name: "修改布局", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "选择布局结构", exact: true })).toBeFocused();
  await dialog.getByRole("alert").getByRole("button", { name: "修改尺寸", exact: true }).click();
  await expect(dialog.getByRole("spinbutton", { name: "宽度", exact: true })).toHaveValue("10");
  await dialog.getByRole("spinbutton", { name: "宽度", exact: true }).fill("1200");
  await dialog.getByRole("spinbutton", { name: "高度", exact: true }).fill("1500");
  await dialog.getByRole("button", { name: "返回确认", exact: true }).click();
  await expect(dialog.locator('[data-template-recipe-confirmation-summary="true"]')).toContainText("1200 × 1500 px");
  await dialog.getByRole("button", { name: "修改布局", exact: true }).click();
  await dialog.getByRole("button", { name: "自定义", exact: true }).click();
  await dialog.getByRole("textbox", { name: "图片槽位 1 名称", exact: true }).fill("");
  await expect(dialog.getByRole("alert").getByRole("button", { name: "修改布局", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "返回确认", exact: true })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "图片槽位 1 名称", exact: true }).fill("主商品照片");
  await dialog.getByRole("button", { name: "返回确认", exact: true }).click();
  await dialog.getByRole("button", { name: "修改内容", exact: true }).click();
  await dialog.getByRole("button", { name: "添加自定义文字", exact: true }).click();
  await dialog.getByRole("textbox", { name: "自定义文字 1 名称", exact: true }).fill("");
  await expect(dialog.getByRole("alert").getByRole("button", { name: "修改内容", exact: true })).toBeVisible();
  await dialog.getByRole("textbox", { name: "自定义文字 1 名称", exact: true }).fill("保留的商品卖点");
  await dialog.getByRole("button", { name: "返回确认", exact: true }).click();
  await dialog.getByRole("button", { name: "修改布局", exact: true }).click();
  await dialog.getByRole("button", { name: "左图右文", exact: true }).click();
  await dialog.getByRole("button", { name: "返回确认", exact: true }).click();
  await dialog.getByRole("button", { name: "修改风格", exact: true }).click();
  await dialog.getByRole("button", { name: "高端", exact: true }).click();
  await dialog.getByRole("button", { name: "返回确认", exact: true }).click();
  await dialog.getByRole("button", { name: "修改用途", exact: true }).click();
  await dialog.getByRole("button", { name: "自定义", exact: true }).click();
  await dialog.getByRole("textbox", { name: "自定义用途", exact: true }).fill("目录展示");
  await dialog.getByRole("button", { name: "返回确认", exact: true }).click();
  await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
  const recipe = (await readSession(page)).definition!.templateRecipe!;
  expect(recipe).toMatchObject({ purpose: "custom", customPurpose: "目录展示", layout: "leftImageRightContent", canvas: { width: 1200, height: 1500 }, style: { variant: "premium" } });
  expect(recipe.media[0].name).toBe("主商品照片");
  expect(recipe.content.find((item) => item.role === "customText")?.name).toBe("保留的商品卖点");
  expect(recipe.content.find((item) => item.role === "customText")?.defaultContent).toBe("");
  expect(server.writes).toEqual([]);
});

for (const viewport of [{ width: 1600, height: 1000 }, { width: 390, height: 844 }]) {
  test(`确认桌面手机预览采用同一方案真实重排 ${viewport.width}px（自有 API Mock）`, async ({ page }, testInfo) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize(viewport);
    const dialog = await openRecipeConfirmation(page, "左图右文");
    if (viewport.width < 760) await dialog.getByRole("button", { name: "查看预览", exact: true }).click();
    const preview = dialog.getByLabel("生成方案预览");
    const rendered = preview.locator("[data-dynamic-template-device]");
    await expect(rendered).toHaveAttribute("data-dynamic-template-device", "desktop");
    const ids = await preview.locator("[data-template-node-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-template-node-id")));
    const image = preview.locator('[data-template-node-type="ImageSlot"]').first();
    const title = preview.locator('[data-template-node-type="HeadingSlot"]').first();
    await expect(image).toHaveCSS("position", "absolute");
    expect((await title.boundingBox())!.x).toBeGreaterThan((await image.boundingBox())!.x);
    await dialog.getByRole("group", { name: "确认预览设备", exact: true }).getByRole("button", { name: "手机", exact: true }).click();
    await expect(dialog.getByRole("group", { name: "确认预览设备", exact: true }).getByRole("button", { name: "手机", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(rendered).toHaveAttribute("data-dynamic-template-device", "mobile");
    await expect(image).toHaveCSS("position", "relative");
    await expect.poll(async () => (await title.boundingBox())!.y - ((await image.boundingBox())!.y + (await image.boundingBox())!.height)).toBeGreaterThanOrEqual(0);
    await expect.poll(() => preview.locator(".template-recipe__preview-render").evaluate((node) => (node as HTMLElement).offsetWidth)).toBe(390);
    expect(await preview.locator("[data-template-node-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-template-node-id")))).toEqual(ids);
    await expect.poll(() => preview.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(preview).toHaveCSS("pointer-events", "auto");
    await expect(preview).toHaveCSS("overflow-y", "auto");
    await preview.hover();
    await page.mouse.wheel(0, 500);
    await expect.poll(() => preview.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath(`confirmation-mobile-preview-${viewport.width}.png`), animations: "disabled" });
    await dialog.getByRole("group", { name: "确认预览设备", exact: true }).getByRole("button", { name: "桌面", exact: true }).click();
    await expect(image).toHaveCSS("position", "absolute");
    await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect((await readSession(page)).definition!.templateRecipe!.canvas).toEqual({ width: 1080, height: 1350, aspectRatio: .8 });
    expect(server.writes).toEqual([]);
  });
}

test("用途推荐按勾选覆盖，保留未选段与图片圆角并清理对应覆盖状态（自有 API Mock）", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  const dialog = await openRecipeConfirmation(page, "左图右文");
  await dialog.getByRole("button", { name: "修改尺寸", exact: true }).click();
  await dialog.getByRole("button", { name: "自定义尺寸", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "宽度", exact: true }).fill("1200");
  await dialog.getByRole("spinbutton", { name: "高度", exact: true }).fill("1500");
  await dialog.getByRole("switch", { name: "锁定比例", exact: true }).click();
  await dialog.getByRole("button", { name: "返回确认", exact: true }).click();
  await dialog.getByRole("button", { name: "修改布局", exact: true }).click();
  await dialog.getByRole("button", { name: "自定义", exact: true }).click();
  await dialog.getByRole("textbox", { name: "图片槽位 1 名称", exact: true }).fill("保留图片");
  await dialog.getByRole("button", { name: "返回确认", exact: true }).click();
  await dialog.getByRole("button", { name: "修改图片", exact: true }).click();
  await setImageAppearance(dialog, 1, "形状", "圆角");
  await dialog.getByRole("textbox", { name: "图片 1圆角大小", exact: true }).fill("24");
  await dialog.getByRole("button", { name: "返回确认", exact: true }).click();
  await dialog.getByRole("button", { name: "修改内容", exact: true }).click();
  await dialog.getByRole("button", { name: "添加自定义文字", exact: true }).click();
  await dialog.getByRole("textbox", { name: "自定义文字 1 名称", exact: true }).fill("待主动替换文案");
  await dialog.getByRole("button", { name: "返回确认", exact: true }).click();
  await dialog.getByRole("button", { name: "修改风格", exact: true }).click();
  await dialog.getByRole("button", { name: "高端", exact: true }).click();
  await dialog.locator("summary").filter({ hasText: "自定义颜色" }).click();
  await dialog.getByLabel("主题颜色", { exact: true }).fill("#123456");
  await dialog.getByRole("button", { name: "返回确认", exact: true }).click();
  await dialog.getByRole("button", { name: "修改用途", exact: true }).click();
  await dialog.getByRole("button", { name: "活动宣传", exact: true }).click();
  const recommendations = dialog.locator("details").filter({ hasText: "重新应用当前用途推荐" });
  await recommendations.locator("summary").click();
  await expect(recommendations.getByRole("button", { name: "确认应用已选推荐", exact: true })).toBeDisabled();
  await recommendations.getByRole("checkbox", { name: "应用内容推荐", exact: true }).check();
  await expect(recommendations).toContainText("主标题、时间、地点、按钮 / CTA");
  await recommendations.getByRole("button", { name: "确认应用已选推荐", exact: true }).click();
  await dialog.getByRole("button", { name: "返回确认", exact: true }).click();
  await expect(dialog.locator('[data-template-recipe-confirmation-summary="true"]')).toContainText("1200 × 1500 px");
  await expect(dialog.locator('[data-template-recipe-confirmation-summary="true"]')).toContainText("保留图片");
  await expect(dialog.locator('[data-template-recipe-confirmation-summary="true"]')).toContainText("24 px 圆角");
  await expect(dialog.locator('[data-template-recipe-confirmation-summary="true"]')).not.toContainText("待主动替换文案");
  await expect(dialog.locator('[data-template-recipe-confirmation-summary="true"]')).toContainText("高端");
  await dialog.getByRole("button", { name: "修改尺寸", exact: true }).click();
  await expect(dialog.getByRole("switch", { name: "锁定比例", exact: true })).toBeChecked();
  await dialog.getByRole("button", { name: "返回确认", exact: true }).click();
  await dialog.getByRole("button", { name: "修改用途", exact: true }).click();
  await recommendations.locator("summary").click();
  for (const section of ["尺寸", "布局", "风格"]) await recommendations.getByRole("checkbox", { name: `应用${section}推荐`, exact: true }).check();
  await recommendations.getByRole("button", { name: "确认应用已选推荐", exact: true }).click();
  await dialog.getByRole("button", { name: "返回确认", exact: true }).click();
  await expect(dialog.locator('[data-template-recipe-confirmation-summary="true"]')).toContainText("1080 × 1920 px");
  await dialog.getByRole("button", { name: "修改风格", exact: true }).click();
  await dialog.getByRole("button", { name: "科技", exact: true }).click();
  await dialog.getByRole("button", { name: "返回确认", exact: true }).click();
  await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
  const recipe = (await readSession(page)).definition!.templateRecipe!;
  expect(recipe).toMatchObject({ purpose: "event", layout: "fullImageOverlay", canvas: { width: 1080, height: 1920 }, rules: { aspectLocked: false }, style: { variant: "tech", primaryColor: "#181A1B" } });
  expect(recipe.media[0]).toMatchObject({ name: "保留图片", borderRadius: 24 });
  expect(recipe.content.map((slot) => slot.role)).toEqual(["title", "time", "location", "cta"]);
  expect(server.writes).toEqual([]);
});

test("切换不同用途只更新方案，创建向导外框保持稳定（自有 API Mock）", async ({ page }) => {
  await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const dialog = await openWizard(page);
  await expect.poll(async () => (await dialog.boundingBox())?.width ?? 0).toBeCloseTo(1320, 0);
  const purposes = ["商品促销", "新品发布", "活动宣传", "品牌宣传", "社交媒体", "新闻 / 资讯", "人物介绍", "通用模板", "自定义"];
  const boxes = [];

  for (const purpose of purposes) {
    const option = dialog.getByRole("button", { name: purpose, exact: true });
    await expect(option).toBeVisible();
    await option.dispatchEvent("click");
    await expect(option).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await dialog.boundingBox())?.width ?? 0).toBeCloseTo(1320, 0);
    boxes.push(await dialog.boundingBox());
  }

  expect(boxes.every(Boolean)).toBe(true);
  const widths = boxes.map((box) => box!.width);
  const heights = boxes.map((box) => box!.height);
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
});

for (const viewport of [{ width: 1600, height: 1000 }, { width: 1024, height: 768 }, { width: 761, height: 800 }, { width: 760, height: 800 }, { width: 390, height: 844 }, { width: 390, height: 568 }]) {
  test(`七步与展开内容保持外框和操作位置稳定 ${viewport.width}x${viewport.height}（自有 API Mock）`, async ({ page }, testInfo) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize(viewport);
    const dialog = await openWizard(page);
    await expect(dialog.getByRole("heading", { level: 3 })).toBeFocused();
    await expect(dialog.getByText("中性示例（尚未选择用途）", { exact: true })).toBeAttached();
    const frame = dialog.locator(".ant-modal-content");
    const footer = dialog.locator(".template-recipe__footer");
    await dialog.getByRole("button", { name: "取消", exact: true }).click({ trial: true });
    await dialog.evaluate(async (element) => {
      await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
    });
    const initial = (await frame.boundingBox())!;
    const initialFooter = (await footer.boundingBox())!;
    const stable = async () => {
      const box = (await frame.boundingBox())!;
      const buttons = (await footer.boundingBox())!;
      for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(box[key] - initial[key])).toBeLessThanOrEqual(1);
      expect(Math.abs(buttons.y - initialFooter.y)).toBeLessThanOrEqual(1);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      expect(await frame.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    };
    await dialog.getByRole("button", { name: "商品促销", exact: true }).click();
    const next = dialog.getByRole("button", { name: "下一步", exact: true });
    await next.click();
    await dialog.getByRole("button", { name: "更多尺寸", exact: true }).click();
    await stable();
    await dialog.getByRole("button", { name: "自定义尺寸", exact: true }).click();
    const width = dialog.getByRole("spinbutton", { name: "宽度", exact: true });
    await expect(width).toBeFocused();
    await expect(width).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "更多尺寸", exact: true })).toHaveAttribute("aria-expanded", "false");
    await stable();
    await width.fill("1200");
    await dialog.getByRole("spinbutton", { name: "高度", exact: true }).fill("1500");
    await expect(dialog.locator("[aria-live=polite]")).toContainText("1200 × 1500 px");
    await next.click();
    await expect(dialog.getByRole("heading", { level: 3 })).toBeFocused();
    await dialog.getByRole("button", { name: "更多布局", exact: true }).click();
    await dialog.getByRole("button", { name: "自由布局", exact: true }).click();
    await stable();
    if (viewport.width <= 760) {
      await dialog.getByRole("button", { name: "查看预览", exact: true }).click();
      await stable();
      await expect(dialog.getByLabel("生成方案预览")).toBeVisible();
      await dialog.getByRole("button", { name: "返回选项", exact: true }).click();
      await expect(dialog.getByRole("button", { name: "自由布局", exact: true })).toHaveAttribute("aria-pressed", "true");
      for (const button of await footer.getByRole("button").all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: testInfo.outputPath("layout.png") });
    for (let step = 3; step <= 6; step++) {
      await next.click();
      await expect(dialog.getByRole("heading", { level: 3 })).toBeFocused();
      if (step === 3) await expect(dialog.getByRole("group", { name: "选择要设置的图片", exact: true })).toBeVisible();
      if (step === 5) await dialog.getByRole("button", { name: "自定义", exact: true }).click();
      await stable();
    }
    await expect(dialog.locator('[data-template-recipe-confirmation-summary="true"]')).toContainText("1200 × 1500 px");
    await page.screenshot({ path: testInfo.outputPath("confirmation.png") });
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(server.writes).toEqual([]);
  });
}

test("自定义尺寸保留非法原输入并阻止前进，修正与锁比往返可恢复（自有 API Mock）", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  const dialog = await openWizard(page);
  await dialog.getByRole("button", { name: "商品促销", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: "自定义尺寸", exact: true }).click();
  const width = dialog.getByRole("spinbutton", { name: "宽度", exact: true });
  const height = dialog.getByRole("spinbutton", { name: "高度", exact: true });
  const next = dialog.getByRole("button", { name: "下一步", exact: true });
  for (const input of ["5000", "0", "-1", "1080.5", "", "Infinity"]) {
    await width.fill(input);
    await expect(next).toBeDisabled();
    await expect(width).toHaveAttribute("aria-invalid", "true");
    await dialog.getByRole("heading", { name: "选择画布尺寸", exact: true }).click();
    await expect(width).toHaveValue(input);
    await expect(dialog.getByText("宽度和高度须为 1–4096 px 的整数。", { exact: true })).toHaveAttribute("role", "alert");
  }
  await dialog.getByRole("button", { name: "上一步", exact: true }).click();
  await next.click();
  await expect(width).toHaveValue("Infinity");
  await width.fill("1080");
  await dialog.getByRole("switch", { name: "锁定比例", exact: true }).click();
  await width.fill("3400");
  await expect(height).toHaveValue("4250");
  await expect(next).toBeDisabled();
  await height.blur();
  await expect(height).toHaveValue("4250");
  const lock = dialog.getByRole("switch", { name: "锁定比例", exact: true });
  await lock.click();
  await expect(lock).not.toBeChecked();
  await expect(lock).toBeDisabled();
  await height.fill("4096");
  await expect(next).toBeEnabled();
  await width.fill("1080");
  await height.fill("1350");
  await lock.click();
  await width.fill("1200");
  await expect(height).toHaveValue("1500");
  await expect(next).toBeEnabled();
  await next.click();
  await dialog.getByRole("button", { name: "上图下文", exact: true }).click();
  await dialog.getByRole("button", { name: "前往确认（未配置项用推荐值）", exact: true }).click();
  await expect(dialog.locator('[data-template-recipe-confirmation-summary="true"]')).toContainText("1200 × 1500 px");
  await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
  const recipe = (await readSession(page)).definition!.templateRecipe!;
  expect(recipe.canvas).toEqual({ width: 1200, height: 1500, aspectRatio: .8 });
  expect(recipe.rules.aspectLocked).toBe(true);
  expect(server.writes).toEqual([]);
});

test("内容共用合同上限且达到后可取消替换，创建不超限（自有 API Mock）", async ({ page }, testInfo) => {
  const server = await installNewTemplateServer(page);
  const dialog = await openWizard(page);
  await dialog.getByRole("button", { name: "通用模板", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: "自定义尺寸", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "宽度", exact: true }).fill("1080");
  await dialog.getByRole("spinbutton", { name: "高度", exact: true }).fill("4096");
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: "更多布局", exact: true }).click();
  await dialog.getByRole("button", { name: "自由布局", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  const limit = TEMPLATE_RECIPE_SCHEMA.properties.content.maxItems;
  const add = dialog.getByRole("button", { name: "添加自定义文字", exact: true });
  for (let i = 0; i < limit - 1; i++) await add.click();
  const title = dialog.getByRole("checkbox", { name: "主标题", exact: true });
  const subtitle = dialog.getByRole("checkbox", { name: "副标题", exact: true });
  await title.check();
  await expect(dialog.getByRole("status")).toContainText(`已选 ${limit}/${limit} 项内容`);
  await expect(dialog.getByRole("status")).toContainText("请先取消一项或删除自定义文字");
  await expect(add).toBeDisabled();
  await expect(subtitle).toBeDisabled();
  await expect(title).toBeEnabled();
  await title.uncheck();
  await expect(subtitle).toBeEnabled();
  await subtitle.check();
  await dialog.getByRole("button", { name: "删除自定义文字 1", exact: true }).click();
  await expect(add).toBeEnabled();
  await add.click();
  await expect(dialog.getByRole("status")).toContainText(`已选 ${limit}/${limit} 项内容`);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("button", { name: "前往确认（未配置项用推荐值）", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "创建模板", exact: true })).toBeEnabled();
  await expect(dialog.getByLabel("生成方案预览").locator('[data-template-node-type="TextSlot"]')).toHaveCount(limit);
  const start = await page.evaluate(() => performance.now());
  await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
  await expect(dialog).toBeHidden();
  const created = (await readSession(page)).definition!;
  expect(created.templateRecipe!.content).toHaveLength(limit);
  const createdAt = await page.evaluate(() => performance.now());
  const node = Object.values(created.nodes).find((item) => item.slotId && created.slots[item.slotId].semanticRole === "subtitle")!;
  const parent = Object.values(created.nodes).find((item) => item.childIds.includes(node.nodeId))!;
  const index = parent.childIds.indexOf(node.nodeId);
  await page.getByRole("treeitem", { name: "副标题 文字区域 可选", exact: true }).hover();
  await page.getByRole("button", { name: "副标题节点操作", exact: true }).click();
  const up = page.getByRole("menuitem", { name: "上移", exact: true });
  await expect(up).toBeEnabled();
  const menuAt = await page.evaluate(() => performance.now());
  await testInfo.attach("creation-30-timing.json", { body: JSON.stringify({ createMs: createdAt - start, menuMs: menuAt - createdAt }), contentType: "application/json" });
  expect(createdAt - start, "30 项方案创建后须及时进入可响应的编辑器").toBeLessThan(5000);
  expect(menuAt - createdAt, "打开单行菜单不应重新预计算整棵结构树").toBeLessThan(2000);
  await up.click();
  expect((await readSession(page)).definition!.nodes[parent.nodeId].childIds.indexOf(node.nodeId)).toBe(index - 1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await readSession(page)).definition!.nodes[parent.nodeId].childIds).toEqual(parent.childIds);
  expect(server.writes).toEqual([]);
});

test("返回布局新增图片继承当前圆角并保留已有手动形态（自有 API Mock）", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  const dialog = await openWizard(page);
  await dialog.getByRole("button", { name: "商品促销", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: "竖版 4:5", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: "上图下文", exact: true }).click();
  await dialog.getByRole("button", { name: "自定义", exact: true }).click();
  await dialog.getByRole("button", { name: "添加图片槽位", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await setImageAppearance(dialog, 1, "形状", "圆角");
  await dialog.getByRole("textbox", { name: "图片 1圆角大小", exact: true }).fill("24");
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: "高端", exact: true }).click();
  await dialog.getByRole("button", { name: "上一步", exact: true }).click();
  await dialog.getByRole("button", { name: "上一步", exact: true }).click();
  await dialog.getByRole("button", { name: "修改布局", exact: true }).click();
  await dialog.getByRole("button", { name: "添加图片槽位", exact: true }).click();
  await dialog.getByRole("button", { name: "前往确认（未配置项用推荐值）", exact: true }).click();
  await expect(dialog.locator('[data-template-recipe-confirmation-summary="true"]')).toContainText("图片 2：1:1，填满，0 px 圆角");
  await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
  const recipe = (await readSession(page)).definition!.templateRecipe!;
  expect(recipe.style.radius).toBe("none");
  expect(recipe.media.map((slot) => slot.borderRadius)).toEqual([24, 0, 0]);
  expect(server.writes).toEqual([]);
});

test("只选用途尺寸布局即可确认，生成后没有第二套制作步骤（自有 API Mock）", async ({ page }, testInfo) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const dialog = await openWizard(page);
  await dialog.getByRole("button", { name: "商品促销", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /标准横版 4:3/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: /竖版 4:5/ }).click();
  const preview = dialog.getByLabel("生成方案预览");
  const size = await preview.boundingBox();
  expect(size!.width / size!.height).toBeCloseTo(4 / 5, 2);
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: /上图下文/ }).click();
  await dialog.getByRole("button", { name: "前往确认（未配置项用推荐值）", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "确认模板方案", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("creation-confirm-desktop.png") });
  await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /制作检查/ })).toHaveCount(0);
  await expect(page.getByText("从真正空白开始", { exact: true })).toHaveCount(0);
  expect((await readSession(page)).definition?.templateRecipe?.layout).toBe("topImageBottomContent");
  expect(server.writes).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("generated-editor-desktop.png") });
});

test("布局自定义图片最多六个，普通组合恢复简洁选择（自有 API Mock）", async ({ page }) => {
  await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const dialog = await openWizard(page);
  await dialog.getByRole("button", { name: "商品促销", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: /竖版 4:5/ }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: /上图下文/ }).click();
  await dialog.getByRole("button", { name: "1 张主图 + 1 张副图", exact: true }).click();
  await dialog.getByRole("button", { name: "自定义", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "图片槽位 1 名称", exact: true })).toHaveValue("主图片");
  await expect(dialog.getByRole("textbox", { name: "图片槽位 2 名称", exact: true })).toHaveValue("副图片");
  const add = dialog.getByRole("button", { name: "添加图片槽位", exact: true });
  for (let i = 0; i < 4; i++) await add.click();
  await expect(add).toBeDisabled();
  await expect(dialog.getByRole("textbox")).toHaveCount(6);
  await dialog.getByRole("button", { name: "1 张主图", exact: true }).click();
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await expect(dialog.getByText("已选：主图片", { exact: true })).toBeVisible();
  await expect(add).toHaveCount(0);
  await expect(dialog.getByRole("complementary", { name: "当前方案" })).toContainText("1 个图片位置");
});

test("Escape 与关闭按钮恢复新建入口焦点且不建立草稿（自有 API Mock）", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTemplateDesignWithoutDraft(page);
  const trigger = page.getByRole("button", { name: "顶部新建模板", exact: true });
  for (const close of ["escape", "button"] as const) {
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "创建模板", exact: true });
    await expect(dialog).toBeVisible();
    if (close === "escape") await page.keyboard.press("Escape");
    else await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect((await readSession(page)).definition).toBeNull();
  }
  expect(server.writes).toEqual([]);
});

test("七步只做选择、即时预览、返回保留、确认生成与取消保护（自有 API Mock）", async ({ page }, testInfo) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const dialog = await openWizard(page);
  await expect(dialog.getByLabel("生成方案预览")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "下一步", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "商品促销", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: /竖版 4:5/ }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: /上图下文/ }).click();
  await dialog.getByRole("button", { name: "1 张主图 + 2 张副图", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "图片 1圆角大小", exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "添加图片槽位", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("complementary", { name: "当前方案" })).toContainText("3 个图片位置");
  const imagePlaceholders = dialog.getByLabel("生成方案预览").locator('[data-template-node-type="ImageSlot"] > .hc-dynamic-template__empty-slot');
  await expect(imagePlaceholders).toHaveCount(3);
  await expect(imagePlaceholders.first()).toHaveCSS("background-color", "rgb(236, 238, 239)");
  await page.screenshot({ path: testInfo.outputPath("creation-media-desktop.png") });
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: "添加自定义文字", exact: true }).click();
  await dialog.getByRole("textbox", { name: "自定义文字 1 名称", exact: true }).fill("商品卖点");
  await dialog.getByRole("button", { name: "上一步", exact: true }).click();
  await dialog.getByRole("button", { name: "修改布局", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "1 张主图 + 2 张副图", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "自定义文字 1 名称", exact: true })).toHaveValue("商品卖点");
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(dialog.getByLabel("主题颜色", { exact: true })).toBeHidden();
  await dialog.getByRole("button", { name: "高端", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(dialog.getByLabel("生成方案预览")).toBeVisible();
  expect(server.writes).toEqual([]);
  expect((await readSession(page)).definition).toBeNull();
  await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
  await expect(dialog).toBeHidden();
  const snapshot = await readSession(page);
  expect(snapshot.definition!.schemaVersion).toBe(3);
  expect(snapshot.definition!.templateRecipe!.content.find((slot) => slot.role === "customText")?.name).toBe("商品卖点");
  expect(Object.keys(snapshot.definition!.slots)).toHaveLength(9);
  expect(server.writes).toEqual([]);
  await page.getByRole("button", { name: "顶部新建模板", exact: true }).click();
  await dialog.getByRole("button", { name: "商品促销", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: /正方形 1:1/ }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: /上图下文/ }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: "前往确认（未配置项用推荐值）", exact: true }).click();
  await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
  await page.getByRole("button", { name: "继续编辑", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "创建模板", exact: true })).toBeEnabled();
  expect((await readSession(page)).definition!.templateId).toBe(snapshot.definition!.templateId);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(server.writes).toEqual([]);
});

test("390px 自定义锁比、预览切换与取消保护（自有 API Mock）", async ({ page }, testInfo) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openTemplateDesignWithoutDraft(page);
  const direct = page.getByRole("button", { name: "顶部新建模板", exact: true });
  if (await direct.isVisible()) await direct.click();
  else { await page.getByRole("button", { name: "更多模板操作", exact: true }).click(); await page.getByRole("menuitem", { name: /新建模板$/ }).click(); }
  const dialog = page.getByRole("dialog", { name: "创建模板", exact: true });
  await dialog.getByRole("button", { name: "通用模板", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: /正方形 1:1/ }).click();
  await dialog.getByRole("button", { name: "自定义尺寸", exact: true }).click();
  await dialog.getByRole("switch", { name: "锁定比例" }).click();
  await dialog.getByRole("spinbutton", { name: "宽度", exact: true }).fill("1200");
  await expect(dialog.getByRole("spinbutton", { name: "高度", exact: true })).toHaveValue("1200");
  await dialog.getByRole("button", { name: "查看预览", exact: true }).click();
  await expect(dialog.getByLabel("生成方案预览")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("creation-preview-mobile.png") });
  await dialog.getByRole("button", { name: "返回选项", exact: true }).click();
  await expect(dialog.getByRole("spinbutton", { name: "高度", exact: true })).toHaveValue("1200");
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect((await readSession(page)).definition).toBeNull();
  expect(server.writes).toEqual([]);
});

test("图片独立设置与显式风格参数保留，Logo 仅在布局增删（自有 API Mock）", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const dialog = await openWizard(page);
  const next = () => dialog.getByRole("button", { name: "下一步", exact: true }).click();
  const select = async (name: string, option: string) => {
    await dialog.locator(".ant-select").filter({ has: page.getByRole("combobox", { name, exact: true }) }).locator(".ant-select-selector").click();
    await expect(dialog.getByRole("combobox", { name, exact: true })).toHaveAttribute("aria-expanded", "true");
    await page.locator(".ant-select-dropdown:visible .ant-select-item-option-content").filter({ hasText: new RegExp(`^${option}$`) }).click();
  };
  await dialog.getByRole("button", { name: "商品促销", exact: true }).click();
  await next();
  await dialog.getByRole("button", { name: "竖版 4:5", exact: true }).click();
  await next();
  await dialog.getByRole("button", { name: "上图下文", exact: true }).click();
  await dialog.getByRole("button", { name: "1 张主图 + Logo", exact: true }).click();
  const logo = dialog.getByRole("checkbox", { name: "显示 Logo 位置", exact: true });
  await expect(logo).toBeChecked();
  await logo.uncheck();
  await logo.check();
  await next();
  await setImageAppearance(dialog, 1, "形状", "圆形");
  await setImageAppearance(dialog, 1, "填充", "完整显示");
  await expect(logo).toHaveCount(0);
  await next();
  await expect(dialog.getByRole("checkbox", { name: /Logo/ })).toHaveCount(0);
  for (const name of ["时间", "地点", "商品名称", "商品卖点", "折扣", "姓名", "职位", "简介", "社交信息"]) {
    await expect(dialog.getByRole("checkbox", { name, exact: true })).toHaveCount(1);
  }
  await next();
  await select("圆角", "超大");
  await select("对齐", "右对齐");
  await dialog.getByRole("button", { name: "极简", exact: true }).click();
  await select("背景", "柔和浅色");
  await next();
  await expect(dialog.locator("dd").filter({ hasText: "基础 / 区域间距" })).toContainText("圆角 32 px");
  await expect(dialog.locator("dd").filter({ hasText: "基础 / 区域间距" })).toContainText("32 / 64 px");
  await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
  await expect(dialog).toBeHidden();
  const definition = (await readSession(page)).definition!;
  const recipe = definition.templateRecipe!;
  expect(recipe.media.filter((item) => item.role === "logo")).toHaveLength(1);
  expect(recipe.media.find((item) => item.role === "heroImage")).toMatchObject({ shape: "circle", fitMode: "contain" });
  expect(recipe.style).toMatchObject({ variant: "ultraMinimal", radius: "extraLarge", alignment: "right", backgroundColor: "#F7F8F8" });
  const hero = Object.values(definition.nodes).find((node) => definition.slots[node.slotId!]?.semanticRole === "heroImage")!;
  expect(hero.responsive.desktop.radius).toEqual({ value: 50, unit: "%" });
  expect(server.writes).toEqual([]);
});

test("过小画布拒绝创建且返回仍保留所选尺寸（自有 API Mock）", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  const dialog = await openWizard(page);
  await dialog.getByRole("button", { name: "商品促销", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: "自定义尺寸", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "宽度", exact: true }).fill("100");
  await dialog.getByRole("spinbutton", { name: "高度", exact: true }).fill("60");
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: "上图下文", exact: true }).click();
  for (let i = 0; i < 4; i++) await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "创建模板", exact: true })).toBeDisabled();
  await expect(dialog.locator(".template-recipe__body").getByRole("alert")).toContainText("无法容纳");
  for (let i = 0; i < 5; i++) await dialog.getByRole("button", { name: "上一步", exact: true }).click();
  await expect(dialog.getByRole("spinbutton", { name: "宽度", exact: true })).toHaveValue("100");
  await expect(dialog.getByRole("spinbutton", { name: "高度", exact: true })).toHaveValue("60");
  expect((await readSession(page)).definition).toBeNull();
  expect(server.writes).toEqual([]);
});

test("十种生成布局公开 Renderer 桌面与手机真实几何（隔离界面）", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/recipe-neutral.svg", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#e4e6e8"/><circle cx="200" cy="145" r="60" fill="#c2c7cb"/></svg>' }));
  await page.route("**/__recipe-layouts", (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html><head><meta charset="utf-8"><script type="module">
    import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;
    </script><style>body{margin:0;font-family:Arial;background:#f5f5f5}main{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px;padding:16px}section{min-width:0;background:white}h2{font-size:16px;margin:12px} .canvas{position:relative;overflow:hidden} .inner{transform-origin:top left} @media(max-width:600px){main{grid-template-columns:1fr;padding:0}h2{margin:16px}}</style></head><body><main id="fixture"></main><script type="module">
    import React from '/node_modules/.vite/deps/react.js'; import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import '/src/styles/globals.css';
    import DynamicTemplateRenderer from '/src/page-builder/template-definition/DynamicTemplateRenderer.tsx';
    import {generateTemplateFromRecipe} from '/src/page-builder/template-creation/generateTemplateFromRecipe.ts';
    import {createRecommendedRecipe,createMediaSlots,LAYOUTS} from '/src/page-builder/template-creation/presets.ts';
    const device = innerWidth < 600 ? 'mobile' : 'desktop'; const width = device === 'mobile' ? 390 : (innerWidth - 96) / 5;
    const recipes = LAYOUTS.map(([layout,label])=>{ const recipe=createRecommendedRecipe();recipe.layout=layout;
      recipe.media=createMediaSlots(layout==='cards'?['heroImage','secondaryImage','secondaryImage']:['heroImage']);
      recipe.media.forEach(item=>item.defaultImage='/recipe-neutral.svg'); const definition=generateTemplateFromRecipe(recipe,{templateId:'tpl_'+layout});
      const heading=Object.values(definition.slots).find(slot=>slot.type==='heading'); if(heading) definition.defaultContent[heading.slotId]='测试标题';
      return {definition,label,layout};});
    ReactDOM.createRoot(document.getElementById('fixture')).render(React.createElement(React.Fragment,null,...recipes.map(({definition,label,layout})=>React.createElement('section',{key:layout,'data-layout':layout},React.createElement('h2',null,label),React.createElement('div',{className:'canvas',style:{height:device==='desktop'?width*1.25:undefined}},React.createElement('div',{className:'inner',style:{width:device==='desktop'?1080:390,transform:device==='desktop'?'scale('+width/1080+')':undefined}},React.createElement(DynamicTemplateRenderer,{definition,device,mode:'public'})))))));
    window.__recipeLayoutCount=recipes.length;
    </script></body></html>` }));
  for (const width of [1920, 390]) {
    await page.setViewportSize({ width, height: width === 1920 ? 1200 : 844 });
    await page.goto("/__recipe-layouts");
    await expect(page.locator("section[data-layout]")).toHaveCount(10);
    await expect(page.locator("img")).toHaveCount(12);
    expect(errors).toEqual([]);
    const layouts = await page.locator("section[data-layout]").evaluateAll((elements) => elements.map((element) => {
      const images = Array.from(element.querySelectorAll("img")).map((image) => { const box = image.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; });
      const heading = element.querySelector('[data-template-node-type="HeadingSlot"]')?.getBoundingClientRect();
      return { name: element.getAttribute("data-layout"), images, heading: heading ? { x: heading.x, y: heading.y, width: heading.width, height: heading.height } : null };
    }));
    for (const layout of layouts) {
      expect(layout.images.every((image) => image.width > 0 && image.height > 0), layout.name!).toBe(true);
      expect(layout.heading, `${layout.name}:标题槽位`).not.toBeNull();
      expect(layout.heading?.height, layout.name!).toBeGreaterThan(0);
      if (width === 390 && !["topContentBottomImage", "leftContentRightImage", "headerSubjectFooter", "centerSubject"].includes(layout.name!)) expect(layout.heading!.y).toBeGreaterThanOrEqual(layout.images[0].y + layout.images[0].height - 1);
      if (width === 390 && ["topContentBottomImage", "leftContentRightImage", "headerSubjectFooter", "centerSubject"].includes(layout.name!)) expect(layout.heading!.y + layout.heading!.height).toBeLessThanOrEqual(layout.images[0].y + 1);
    }
    const geometryIssues = await page.locator("section[data-layout]").evaluateAll((sections) => sections.flatMap((section) => {
      const root = section.querySelector("[data-template-node-id]")!.getBoundingClientRect();
      const leaves = Array.from(section.querySelectorAll("[data-template-slot-id]"));
      const issues = leaves.flatMap((leaf) => {
        const rect = leaf.getBoundingClientRect();
        const name = `${section.getAttribute("data-layout")}:${leaf.getAttribute("data-template-node-id")}`;
        const problems = [];
        if (rect.left < root.left - 1 || rect.top < root.top - 1 || rect.right > root.right + 1 || rect.bottom > root.bottom + 1) problems.push(`${name}:出界`);
        if (leaf.scrollHeight > leaf.clientHeight + 1 || leaf.scrollWidth > leaf.clientWidth + 1) problems.push(`${name}:内容溢出`);
        return problems;
      });
      for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
        if (section.getAttribute("data-layout") === "fullImageOverlay" && leaves[i].getAttribute("data-template-node-type") === "ImageSlot") continue;
        const a = leaves[i].getBoundingClientRect();
        const b = leaves[j].getBoundingClientRect();
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) issues.push(`${section.getAttribute("data-layout")}:槽位异常覆盖`);
      }
      return issues;
    }));
    expect(geometryIssues).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`generated-layouts-${width}.png`), fullPage: true, animations: "disabled" });
    if (width === 390) await page.locator("section[data-layout]").first().screenshot({ path: testInfo.outputPath("generated-first-layout-mobile.png"), animations: "disabled" });
  }
});

test("4:3 布局线框和图片区结构线框使用实际几何，点击后与主预览一致（自有 API Mock）", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const dialog = await openWizard(page);
  const next = () => dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: "品牌宣传", exact: true }).click();
  await next();
  await dialog.getByRole("button", { name: "更多尺寸", exact: true }).click();
  await dialog.getByRole("button", { name: "标准横版 4:3", exact: true }).click();
  await next();
  const main = dialog.getByLabel("生成方案预览");
  const expectChoiceGeometry = async (name: string) => {
    const choice = dialog.getByRole("button", { name, exact: true });
    const candidate = choice.locator("[data-recipe-layout-diagram]");
    await expectDiagramRatio(candidate, 1200, 900);
    const expected = await normalizedDiagramImageFrames(candidate);
    expect(expected.length).toBeGreaterThan(0);
    await choice.click();
    await expectCanvasRatio(main, 1200, 900);
    await expect.poll(async () => {
      const actual = (await normalizedImageFrames(main)).sort((a, b) => a.x - b.x || a.y - b.y);
      if (actual.length !== expected.length) return Infinity;
      return Math.max(...actual.flatMap((frame, index) => (["x", "y", "width", "height"] as const).map((key) => Math.abs(frame[key] - expected[index][key]))));
    }).toBeLessThan(.002);
  };
  for (const layout of ["左图右文", "左文右图", "全幅图片 + 内容覆盖"]) await expectChoiceGeometry(layout);
  for (const preset of ["2 张图片", "1 张主图 + 1 张副图", "背景图片 + 主图"]) await expectChoiceGeometry(preset);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  expect(server.writes).toEqual([]);
});

test("图片重复选择、尺寸往返和自定义 Logo 往返保留配置，圆角恢复正确（自有 API Mock）", async ({ page }) => {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const dialog = await openWizard(page);
  const next = () => dialog.getByRole("button", { name: "下一步", exact: true }).click();
  const previous = () => dialog.getByRole("button", { name: "上一步", exact: true }).click();
  await dialog.getByRole("button", { name: "品牌宣传", exact: true }).click();
  await next();
  await dialog.getByRole("button", { name: "更多尺寸", exact: true }).click();
  await dialog.getByRole("button", { name: "标准横版 4:3", exact: true }).click();
  await next();
  await dialog.getByRole("button", { name: "左文右图", exact: true }).click();
  const two = dialog.getByRole("button", { name: "2 张图片", exact: true });
  await two.click();
  await next();
  await setImageAppearance(dialog, 1, "比例", "4:5");
  await setImageAppearance(dialog, 1, "填充", "完整显示");
  await setImageAppearance(dialog, 2, "形状", "圆形");
  await previous();
  await two.click();
  await next();
  await expectImageAppearance(dialog, 1, "比例", "4:5");
  await expectImageAppearance(dialog, 1, "填充", "完整显示");
  await expectImageAppearance(dialog, 2, "形状", "圆形");
  await previous();
  await dialog.getByRole("button", { name: "1 张主图", exact: true }).click();
  await two.click();
  await next();
  await expectImageAppearance(dialog, 1, "比例", "4:5");
  await expectImageAppearance(dialog, 2, "形状", "圆形");
  await previous();
  await previous();
  await dialog.getByRole("button", { name: "正方形 1:1", exact: true }).click();
  await next();
  await expectDiagramRatio(dialog.getByRole("button", { name: "左文右图", exact: true }).locator("[data-recipe-layout-diagram]"), 1080, 1080);
  await previous();
  await dialog.getByRole("button", { name: "标准横版 4:3", exact: true }).click();
  await next();
  await next();
  await expectImageAppearance(dialog, 1, "比例", "4:5");
  await expectImageAppearance(dialog, 2, "形状", "圆形");
  await previous();
  await expectDiagramRatio(two.locator("[data-recipe-layout-diagram]"), 1200, 900);
  await dialog.getByRole("button", { name: "自定义", exact: true }).click();
  const firstName = dialog.getByRole("textbox", { name: "图片槽位 1 名称", exact: true });
  const secondName = dialog.getByRole("textbox", { name: "图片槽位 2 名称", exact: true });
  await firstName.fill("保留的左图");
  await secondName.fill("保留的右图");
  await dialog.getByRole("button", { name: "自定义", exact: true }).click();
  await expect(firstName).toHaveValue("保留的左图");
  await expect(secondName).toHaveValue("保留的右图");
  await next();
  await setImageAppearance(dialog, 2, "形状", "圆角");
  await dialog.getByRole("textbox", { name: "图片 2圆角大小", exact: true }).fill("16");
  await previous();
  const logo = dialog.getByRole("checkbox", { name: "显示 Logo 位置", exact: true });
  await logo.check();
  await logo.uncheck();
  await expect(dialog.getByRole("button", { name: "自定义", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(firstName).toHaveValue("保留的左图");
  await expect(secondName).toHaveValue("保留的右图");
  await expect(dialog.getByRole("button", { name: "添加图片槽位", exact: true })).toBeVisible();
  await next();
  await expectImageAppearance(dialog, 1, "比例", "4:5");
  await expectImageAppearance(dialog, 2, "形状", "圆角");
  await expect(dialog.getByRole("textbox", { name: "图片 2圆角大小", exact: true })).toHaveValue("16");
  await dialog.getByRole("button", { name: "前往确认（未配置项用推荐值）", exact: true }).click();
  await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
  const recipe = (await readSession(page)).definition!.templateRecipe!;
  expect(recipe.media).toHaveLength(2);
  expect(recipe.media[0]).toMatchObject({ name: "保留的左图", aspectRatio: .8, fitMode: "contain" });
  expect(recipe.media[1]).toMatchObject({ name: "保留的右图", shape: "rectangle", borderRadius: 16 });
  expect(new Set(recipe.media.map((slot) => slot.id)).size).toBe(2);
  expect(server.writes).toEqual([]);
});
