import { expect, test, type Page } from "@playwright/test";
import { installNewTemplateServer, makePublished, makeResource, openTemplateDesignWithoutDraft, readSession, saveTemplate } from "./fixtures/template-authoring-main-route";

// 自有 API Mock；直接装入合法生成结果，隔离并行变化的创建选项 UI。
async function openGenerated(page: Page) {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1600, height: 1050 });
  await openTemplateDesignWithoutDraft(page);
  const ids = await page.evaluate(async () => {
    const presetsPath = "/src/page-builder/template-creation/presets.ts";
    const generatorPath = "/src/page-builder/template-creation/generateTemplateFromRecipe.ts";
    const repoPath = "/src/page-builder/template-editor/dynamicTemplateDraftRepository.ts";
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const [{ createRecommendedRecipe }, { generateTemplateFromRecipe }, { createNewDynamicTemplateDraft }, { useTemplateEditorSession }] = await Promise.all([
      import(/* @vite-ignore */ presetsPath), import(/* @vite-ignore */ generatorPath), import(/* @vite-ignore */ repoPath), import(/* @vite-ignore */ sessionPath),
    ]);
    const draft = createNewDynamicTemplateDraft("属性可靠性模板");
    draft.definition = generateTemplateFromRecipe(createRecommendedRecipe(), { templateId: draft.definition.templateId, name: "属性可靠性模板" });
    const nodes = Object.values(draft.definition.nodes) as Array<{ nodeId: string; slotId?: string; responsive: { desktop: { placement?: unknown } } }>;
    const image = nodes.find((node) => node.slotId && draft.definition.slots[node.slotId].type === "image")!;
    const title = nodes.find((node) => node.slotId && draft.definition.slots[node.slotId].semanticRole === "title")!;
    const positioned = nodes.find((node) => node.responsive.desktop.placement)!;
    useTemplateEditorSession.getState().open(draft, { isNew: true });
    return { root: draft.definition.rootNodeId, image: image.nodeId, imageSlot: image.slotId!, title: title.nodeId, titleSlot: title.slotId!, positioned: positioned.nodeId, templateId: draft.definition.templateId };
  });
  return { server, ids };
}
async function select(page: Page, nodeId: string, breakpoint: "desktop" | "mobile" = "desktop") {
  await page.evaluate(async ({ nodeId, breakpoint }) => {
    const path = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ path);
    useTemplateEditorSession.getState().setBreakpoint(breakpoint);
    useTemplateEditorSession.getState().selectObject(nodeId);
  }, { nodeId, breakpoint });
}
async function fill(page: Page, label: string, value: string) {
  const field = page.getByRole("textbox", { name: label, exact: true });
  await field.fill(value); await field.press("Tab");
}
async function undo(page: Page) {
  await page.evaluate(async () => {
    const path = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ path);
    useTemplateEditorSession.getState().undo();
  });
}

test("自由对象尺寸改变实际画布矩形，撤销与 Mock 保存重开一致", async ({ page }) => {
  const { server, ids } = await openGenerated(page);
  await select(page, ids.positioned);
  const before = (await readSession(page)).definition!;
  const placement = before.nodes[ids.positioned].responsive.desktop.placement!;
  const node = page.frameLocator("iframe.template-editor__viewport-frame").locator(`[data-template-node-id="${ids.positioned}"]`);
  await expect(node).toBeVisible();
  const beforeBox = await node.boundingBox();
  const width = page.locator('[data-template-design-property="node.placement.width"] input');
  await width.fill(String(placement.width * 50)); await width.press("Enter");
  await expect.poll(async () => (await readSession(page)).definition?.nodes[ids.positioned].responsive.desktop.placement?.width).toBeCloseTo(placement.width / 2, 6);
  await expect.poll(async () => (await node.boundingBox())!.width / beforeBox!.width).toBeCloseTo(.5, 2);
  await expect(page.getByRole("combobox", { name: "宽度方式", exact: true })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "对象外框比例预设", exact: true })).toBeVisible();
  await undo(page);
  expect((await readSession(page)).definition).toEqual(before);
  await width.fill(String(placement.width * 60)); await width.press("Enter");
  await saveTemplate(page);
  await expect.poll(() => server.saveResults.length).toBe(1);
  const saved = server.persisted!.draft!.definition;
  expect(saved.nodes[ids.positioned].responsive.desktop.placement!.width).toBeCloseTo(placement.width * .6, 6);
  await openTemplateDesignWithoutDraft(page);
  await page.locator(`[data-template-name="${ids.templateId}"]`).getByRole("button", { name: /^打开属性可靠性模板/ }).click();
  await select(page, ids.positioned);
  await expect(width).toHaveValue(String(Number((placement.width * 60).toFixed(2))));
});

test("背景预设覆盖生成颜色，手机选择只改手机且恢复继承有效", async ({ page }) => {
  const { ids } = await openGenerated(page);
  await select(page, ids.root, "mobile");
  const before = (await readSession(page)).definition!;
  const group = page.locator('[data-template-property-group="外观"]');
  await group.locator("summary").first().click();
  await page.getByRole("combobox", { name: "背景预设", exact: true }).selectOption("brand-ink");
  const node = page.frameLocator("iframe.template-editor__viewport-frame").locator(`[data-template-node-id="${ids.root}"]`);
  await expect(node).toHaveCSS("background-color", "rgb(24, 26, 27)");
  expect((await readSession(page)).definition!.nodes[ids.root].responsive.desktop).toEqual(before.nodes[ids.root].responsive.desktop);
  const property = page.locator('[data-template-design-property="node.backgroundToken"]');
  await property.locator("summary").click();
  await property.getByRole("button", { name: /恢复.*继承/ }).click();
  expect((await readSession(page)).definition!.nodes[ids.root].responsive.mobile.backgroundColor).toBeUndefined();
  await undo(page);
  await expect(node).toHaveCSS("background-color", "rgb(24, 26, 27)");
});

test("自由主图外框比例预览取消与确认写真实矩形，边界内缩放且焦点不变", async ({ page }) => {
  const { ids } = await openGenerated(page);
  await select(page, ids.image);
  await page.evaluate(async (nodeId) => {
    const path = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ path);
    useTemplateEditorSession.getState().executeCommand({ type: "update-definition", label: "靠近父区域下边界的图片前置", update: (next: any) => {
      next.nodes[nodeId].responsive.desktop.placement = { x: .1, y: .8, width: .7, height: .1, zIndex: 0 };
      next.slots[next.nodes[nodeId].slotId].desktopRules.objectPosition = "25% 75%";
    } });
  }, ids.image);
  const before = (await readSession(page)).definition!;
  const node = page.frameLocator("iframe.template-editor__viewport-frame").locator(`[data-template-node-id="${ids.image}"]`);
  const ratio = page.getByRole("group", { name: "对象外框比例预设", exact: true }).getByRole("button", { name: "4:5", exact: true });
  await expect(ratio).toBeEnabled();
  await ratio.click();
  await expect.poll(async () => { const rect = await node.boundingBox(); return rect!.width / rect!.height; }).toBeCloseTo(.8, 2);
  expect((await readSession(page)).definition).toEqual(before);
  await page.getByRole("button", { name: "取消比例预览", exact: true }).click();
  expect((await readSession(page)).definition).toEqual(before);
  await ratio.click();
  await page.getByRole("button", { name: "确认对象比例", exact: true }).click();
  await expect.poll(async () => { const rect = await node.boundingBox(); return rect!.width / rect!.height; }).toBeCloseTo(.8, 2);
  const after = (await readSession(page)).definition!;
  const placement = after.nodes[ids.image].responsive.desktop.placement!;
  expect(placement).toMatchObject({ x: .1, y: .8 });
  expect(placement.y + placement.height).toBeLessThanOrEqual(1.000001);
  expect(after.slots[ids.imageSlot]).toEqual(before.slots[ids.imageSlot]);
  await undo(page);
  expect((await readSession(page)).definition).toEqual(before);
});

test("新增颜色字体共用修改范围；内容共享；关闭替换后裁剪禁用且偏好保留", async ({ page }) => {
  const { ids } = await openGenerated(page);
  await select(page, ids.title);
  await expect(page.getByRole("combobox", { name: "修改作用域" })).toHaveCount(0);
  await expect(page.getByText("正在修改桌面基础，保留手机和平板的独立设置。", { exact: true })).toBeVisible();
  await select(page, ids.title, "mobile");
  await page.getByRole("combobox", { name: "修改作用域" }).selectOption("base");
  await select(page, ids.title);
  await expect(page.getByRole("combobox", { name: "修改作用域" })).toHaveCount(0);
  await select(page, ids.title, "mobile");
  await expect(page.getByRole("combobox", { name: "修改作用域" })).toHaveValue("base");
  const beforeMobile = (await readSession(page)).definition!.slots[ids.titleSlot].mobileRules;
  await fill(page, "文字颜色", "#123456");
  await page.getByRole("combobox", { name: "字体", exact: true }).selectOption("serif");
  await fill(page, "默认文字", "各端共享的精修文字");
  let definition = (await readSession(page)).definition!;
  expect(definition.slots[ids.titleSlot].desktopRules).toMatchObject({ color: "#123456", fontFamily: "serif" });
  expect(definition.slots[ids.titleSlot].mobileRules).toEqual(beforeMobile);
  expect(definition.defaultContent[ids.titleSlot]).toBe("各端共享的精修文字");
  await page.getByRole("combobox", { name: "修改作用域" }).selectOption("current");
  await select(page, ids.title);
  await select(page, ids.title, "mobile");
  await expect(page.getByRole("combobox", { name: "修改作用域" })).toHaveValue("current");
  await fill(page, "文字颜色", "#654321");
  definition = (await readSession(page)).definition!;
  expect(definition.slots[ids.titleSlot].mobileRules.color).toBe("#654321");
  expect(definition.slots[ids.titleSlot].desktopRules.color).toBe("#123456");
  await select(page, ids.image);
  await expect(page.getByRole("switch", { name: "允许页面裁剪" })).toHaveCount(0);
  await page.getByRole("button", { name: "设置页面开放范围", exact: true }).click();
  await expect(page.getByRole("tab", { name: "页面开放范围", exact: true })).toHaveAttribute("aria-selected", "true");
  const crop = page.getByRole("switch", { name: "可调整画面焦点", exact: true });
  if (!(await crop.isChecked())) await crop.click();
  await page.getByRole("switch", { name: "页面可填写内容", exact: true }).click();
  await expect(crop).toBeDisabled(); await expect(crop).toBeChecked();
  await page.getByRole("switch", { name: "页面可填写内容", exact: true }).click();
  await expect(crop).toBeEnabled(); await expect(crop).toBeChecked();
  await crop.click();
  expect((await readSession(page)).definition!.nodes[ids.image].instanceEditPolicy?.imageFocus).toBe(false);
});

test("schema 3 外观与文字设计组复制和恢复包含新字段，不改默认内容", async ({ page }) => {
  const { ids } = await openGenerated(page);
  await select(page, ids.title);
  await fill(page, "文字颜色", "#123456");
  await page.getByRole("combobox", { name: "字体", exact: true }).selectOption("serif");
  await page.locator('details[data-template-property-group="外观"] > summary').click();
  await fill(page, "背景颜色", "#EEEEEE");
  const before = (await readSession(page)).definition!;
  const result = await page.evaluate(async ({ nodeId }) => {
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const designPath = "/src/page-builder/template-editor/TemplateNativeDesignControls.tsx";
    const responsivePath = "/src/page-builder/template-editor/TemplateNativeResponsiveControls.tsx";
    const [{ useTemplateEditorSession }, { getNativeDesignProperties }, { createNativeResponsivePlan }] = await Promise.all([import(sessionPath), import(designPath), import(responsivePath)]);
    const baseline = structuredClone(useTemplateEditorSession.getState().draft.definition);
    baseline.nodes[nodeId].responsive.mobile.backgroundColor = "#112233";
    baseline.slots[baseline.nodes[nodeId].slotId].mobileRules.color = "#654321";
    baseline.slots[baseline.nodes[nodeId].slotId].mobileRules.fontFamily = "sans";
    const source = structuredClone(baseline);
    source.nodes[nodeId].responsive.desktop.backgroundImage = "https://template.test/background.png";
    source.nodes[nodeId].responsive.desktop.backgroundGradient = { from: "#FFFFFF", to: "#000000", angle: 90 };
    source.nodes[nodeId].responsive.desktop.opacity = .7;
    source.slots[source.nodes[nodeId].slotId].desktopRules.letterSpacing = 2;
    const args = { definition: baseline, source, nodeIds: [nodeId], sourceBreakpoint: "desktop", targetBreakpoint: "mobile", groups: ["外观", "文字或媒体"], mode: "copy", getProperties: getNativeDesignProperties };
    const copied = createNativeResponsivePlan(args);
    const restored = createNativeResponsivePlan({ ...args, definition: copied.definition, source: baseline, mode: "restore" });
    return { baseline, copied: copied.definition, restored: restored.definition, paths: copied.changes.map((change: { path: string }) => change.path) };
  }, { nodeId: ids.title });
  expect(result.paths).toEqual(expect.arrayContaining(["backgroundColor", "backgroundImage", "backgroundGradient", "opacity", "color", "fontFamily", "letterSpacing"]));
  expect(result.copied.slots[ids.titleSlot].mobileRules).toMatchObject({ color: "#123456", fontFamily: "serif", letterSpacing: 2 });
  expect(result.copied.defaultContent).toEqual(before.defaultContent);
  expect(result.restored).toEqual(result.baseline);
});

test("背景图片槽位保留唯一默认图片入口，容器仍可配置 CSS 背景", async ({ page }, testInfo) => {
  const { ids } = await openGenerated(page);
  await page.evaluate(async (slotId) => {
    const path = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ path);
    useTemplateEditorSession.getState().executeCommand({ type: "update-definition", label: "背景槽位兼容前置", update: (next: { slots: Record<string, { semanticRole: string }> }) => { next.slots[slotId].semanticRole = "backgroundImage"; } });
  }, ids.imageSlot);
  await select(page, ids.image);
  await expect(page.getByRole("region", { name: "模板默认内容" }).getByRole("button", { name: "或粘贴图片链接" })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "模板颜色与背景" }).getByRole("button", { name: "或粘贴图片链接" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("image-properties-1600.png"), fullPage: true });
  await select(page, ids.root);
  await expect(page.getByRole("region", { name: "模板颜色与背景" }).getByRole("button", { name: "或粘贴图片链接" })).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("root-size-first-1600.png"), fullPage: true });
});

test("生成方案目录缩略图保留自然高度与真实文字，按根画幅缩放且零写入", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { ids, server } = await openGenerated(page);
  const card = page.locator(`[data-template-name="${ids.templateId}"]`);
  await expect(card.locator('[data-template-catalog-preview-shell]')).toHaveAttribute("data-preview-status", "ready");
  await expect(card.locator('[data-overlay-label-for]')).toHaveCount(0);
  await expect(card.locator('.template-editor__editable-overlay.is-catalog')).toHaveCount(0);
  const frame = card.locator("iframe[data-template-catalog-viewport]");
  const thumbnail = frame.contentFrame();
  const title = thumbnail.locator(`[data-template-node-id="${ids.title}"] h1, [data-template-node-id="${ids.title}"] h2`);
  await expect(title).toHaveText("主标题");
  const metrics = await title.evaluate((element) => {
    const rect = (item: Element) => { const value = item.getBoundingClientRect(); return { top: value.top, bottom: value.bottom, width: value.width, height: value.height }; };
    const root = document.querySelector('[data-dynamic-template-id] > [data-template-node-id]')!;
    const host = document.querySelector('.template-editor__catalog-canvas-renderer')!;
    return { title: rect(element), root: rect(root), body: rect(document.body), host: rect(host), position: getComputedStyle(host).position, viewportHeight: innerHeight };
  });
  expect(metrics.position).toBe("relative");
  expect(metrics.body.height).toBeGreaterThanOrEqual(metrics.root.height);
  expect(metrics.title.bottom).toBeLessThanOrEqual(metrics.body.bottom);
  expect(metrics.title.bottom).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.root.width / metrics.root.height).toBeCloseTo(4 / 5, 3);
  const displayedFrame = await frame.boundingBox();
  expect(displayedFrame!.width / displayedFrame!.height).toBeCloseTo(metrics.root.width / metrics.root.height, 3);
  const viewport = await card.locator('[data-content-template-preview]').boundingBox();
  expect(displayedFrame!.height).toBeCloseTo(viewport!.height, 0);
  const cardViewport = await card.locator('.template-editor__catalog-artboard-stage').boundingBox();
  expect(cardViewport!.height, "目录使用固定高度的中性预览舞台").toBeCloseTo(112, 0);
  const textBottomOnScreen = displayedFrame!.y + metrics.title.bottom * displayedFrame!.height / metrics.viewportHeight;
  expect(displayedFrame!.y + displayedFrame!.height, "完整画幅必须落在固定卡片视窗内").toBeLessThanOrEqual(cardViewport!.y + cardViewport!.height);
  expect(displayedFrame!.x, "真实画幅在相框内水平居中").toBeCloseTo(cardViewport!.x + (cardViewport!.width - displayedFrame!.width) / 2, 0);
  expect(textBottomOnScreen, "iframe 内有文字还不够，映射到宿主后不能被目录卡裁掉").toBeLessThanOrEqual(cardViewport!.y + cardViewport!.height);
  const dimensions = card.locator(".template-editor__catalog-dimensions");
  await expect(dimensions).toHaveText(/桌面 · \d+ × \d+ · 固定高度/);
  const dimensionBox = await dimensions.boundingBox();
  expect(dimensionBox!.y).toBeGreaterThanOrEqual(cardViewport!.y + cardViewport!.height);
  await expect(card.locator(".homepage-editor__template-card-status")).toContainText("当前草稿");
  const moreAction = card.locator('button[aria-label^="更多模板操作："]');
  const moreBox = await moreAction.boundingBox();
  expect(moreBox!.y, "更多操作收进预览右上角，不再单占底栏").toBeGreaterThanOrEqual(cardViewport!.y);
  expect(moreBox!.y + moreBox!.height).toBeLessThanOrEqual(cardViewport!.y + cardViewport!.height);
  expect(server.writes).toEqual([]);
  await testInfo.attach("catalog-geometry", { body: JSON.stringify(metrics, null, 2), contentType: "application/json" });
  await page.mouse.move(1000, 80);
  await page.screenshot({ path: testInfo.outputPath("catalog-visible-content-1600.png") });
  await page.getByRole("button", { name: "切换为双列查看", exact: true }).click();
  await expect.poll(async () => {
    const rect = (await frame.boundingBox())!;
    const clip = (await card.locator('.template-editor__catalog-artboard-stage').boundingBox())!;
    return {
      contained: rect.x >= clip.x && rect.y >= clip.y
        && rect.x + rect.width <= clip.x + clip.width
        && rect.y + rect.height <= clip.y + clip.height,
      height: clip.height,
    };
  }).toEqual({ contained: true, height: expect.closeTo(72, 0) });
  await page.getByRole("button", { name: "切换为单列查看", exact: true }).click();
  await expect.poll(async () => { const rect = (await frame.boundingBox())!; const clip = (await card.locator('.template-editor__catalog-artboard-stage').boundingBox())!; return rect.y + rect.height <= clip.y + clip.height; }).toBe(true);
  const stableHeights = await frame.evaluate(async (element) => {
    const heights: number[] = [];
    for (let index = 0; index < 8; index += 1) { await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); heights.push(element.getBoundingClientRect().height); }
    return heights;
  });
  expect(Math.max(...stableHeights) - Math.min(...stableHeights)).toBeLessThan(.1);
  for (const viewportSize of [{ width: 1200, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewportSize);
    await expect.poll(async () => {
      const rect = (await frame.boundingBox())!;
      const clip = (await card.locator('.template-editor__catalog-artboard-stage').boundingBox())!;
      const centered = Math.abs(rect.x + rect.width / 2 - clip.x - clip.width / 2) < 1
        && Math.abs(rect.y + rect.height / 2 - clip.y - clip.height / 2) < 1;
      return Math.abs(clip.height - 112) < 1
        && rect.x >= clip.x
        && rect.y >= clip.y
        && rect.x + rect.width <= clip.x + clip.width
        && rect.y + rect.height <= clip.y + clip.height
        && centered;
    }).toBe(true);
    await expect(dimensions).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`catalog-${viewportSize.width}.png`), animations: "disabled" });
  }
  await moreAction.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.evaluate(async () => {
    const path = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ path);
    useTemplateEditorSession.getState().executeCommand({
      type: "update-definition",
      label: "目录宽屏画幅验收",
      update: (next: any) => {
        next.metadata.canvasSize = { width: 1920, height: 1080, aspectRatio: 16 / 9 };
        next.nodes[next.rootNodeId].responsive.desktop.height = {
          mode: "fixed",
          value: { value: 1080, unit: "px" },
        };
      },
    });
  });
  await expect(dimensions).toHaveText("桌面 · 1920 × 1080 · 固定高度");
  await expect.poll(async () => {
    const rect = (await frame.boundingBox())!;
    const clip = (await card.locator('.template-editor__catalog-artboard-stage').boundingBox())!;
    return rect.x >= clip.x
      && rect.y >= clip.y
      && rect.x + rect.width <= clip.x + clip.width
      && rect.y + rect.height <= clip.y + clip.height
      && Math.abs(rect.x + rect.width / 2 - clip.x - clip.width / 2) < 1
      && Math.abs(rect.y + rect.height / 2 - clip.y - clip.height / 2) < 1;
  }).toBe(true);
  expect(errors).toEqual([]);
});

test("模板设计卡片实时镜像当前草稿，而不是同身份的线上版本", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width: 1912, height: 952 });
  await openTemplateDesignWithoutDraft(page);
  const prepared = await page.evaluate(async () => {
    const presetsPath = "/src/page-builder/template-creation/presets.ts";
    const generatorPath = "/src/page-builder/template-creation/generateTemplateFromRecipe.ts";
    const repoPath = "/src/page-builder/template-editor/dynamicTemplateDraftRepository.ts";
    const [{ createRecommendedRecipe }, { generateTemplateFromRecipe }, { createNewDynamicTemplateDraft }] = await Promise.all([
      import(/* @vite-ignore */ presetsPath), import(/* @vite-ignore */ generatorPath), import(/* @vite-ignore */ repoPath),
    ]);
    const draft = createNewDynamicTemplateDraft("首屏");
    draft.definition = generateTemplateFromRecipe(createRecommendedRecipe(), {
      templateId: draft.definition.templateId,
      name: "首屏",
    });
    draft.definition.metadata.canvasSize = { width: 1920, height: 1200, aspectRatio: 8 / 5 };
    draft.definition.nodes[draft.definition.rootNodeId].responsive.desktop.height = {
      mode: "fixed",
      value: { value: 1200, unit: "px" },
    };
    const title = Object.values(draft.definition.nodes).find((node: any) => (
      node.slotId && draft.definition.slots[node.slotId].semanticRole === "title"
    )) as any;
    draft.definition.defaultContent[title.slotId] = "线上版本标题";
    return { definition: draft.definition, titleSlot: title.slotId, templateId: draft.definition.templateId };
  });
  server.persisted = makeResource(prepared.definition, 2, 1);
  server.published = makePublished(server.persisted, prepared.definition);
  await openTemplateDesignWithoutDraft(page);
  const card = page.locator(`.homepage-editor__template-card[data-template-name="${prepared.templateId}"]`);
  await card.getByRole("button", { name: /^打开首屏模板/ }).click();
  const activeCard = page.locator(`.homepage-editor__template-card.is-active[data-template-name="${prepared.templateId}"]`);
  await expect(activeCard.locator(".template-editor__catalog-published-state")).toHaveText("线上 v1");
  await page.evaluate(async ({ slotId }) => {
    const path = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ path);
    useTemplateEditorSession.getState().executeCommand({
      type: "update-definition",
      label: "修改当前草稿标题",
      update: (next: any) => { next.defaultContent[slotId] = "当前草稿标题"; },
    });
  }, { slotId: prepared.titleSlot });
  const thumbnail = activeCard.locator("iframe[data-template-catalog-viewport]").contentFrame();
  await expect(thumbnail.getByText("当前草稿标题", { exact: true })).toBeVisible();
  await expect(thumbnail.getByText("线上版本标题", { exact: true })).toHaveCount(0);
  await expect(activeCard.locator(".template-editor__catalog-draft-state")).toHaveText("当前草稿 · 有未保存修改");
  await expect(activeCard.locator('[data-template-catalog-preview-shell]')).toHaveAttribute("data-preview-status", "ready");
  await page.screenshot({ path: testInfo.outputPath("catalog-draft-mirror-1912x952.png"), animations: "disabled" });
  expect(consoleErrors).toEqual([]);
  expect(server.writes).toEqual([]);
});

for (const type of ["heading", "button"] as const) {
  test(`${type} 精修先默认内容和字号，颜色随后、背景折叠且编辑可撤销`, async ({ page }, testInfo) => {
    const { server } = await openGenerated(page);
    const initial = (await readSession(page)).definition!;
    const node = Object.values(initial.nodes).find((candidate) => candidate.slotId && initial.slots[candidate.slotId].type === type)!;
    await select(page, node.nodeId);
    const defaultText = page.getByRole("textbox", { name: type === "button" ? "默认按钮文字" : "默认文字", exact: true });
    const fontSize = page.getByRole("spinbutton", { name: "字号", exact: true });
    const color = page.getByRole("textbox", { name: "文字颜色", exact: true });
    const appearance = page.locator('details[data-template-property-group="外观"]');
    await expect(fontSize).toBeInViewport();
    const contentBox = (await defaultText.boundingBox())!;
    const sizeBox = (await fontSize.boundingBox())!;
    const colorBox = (await color.boundingBox())!;
    expect(contentBox.y + contentBox.height).toBeLessThan(sizeBox.y);
    expect(sizeBox.y + sizeBox.height).toBeLessThan(colorBox.y);
    await expect(appearance).not.toHaveAttribute("open", "");
    await expect(page.getByRole("spinbutton", { name: "不透明度", exact: true })).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath(`primary-properties-${type}.png`), fullPage: true });
    const before = await readSession(page);
    await fontSize.fill("64"); await fontSize.press("Enter");
    await expect.poll(async () => (await readSession(page)).definition!.slots[node.slotId!].desktopRules.fontSize).toEqual({ value: 64, unit: "px" });
    await appearance.locator(":scope > summary").click();
    const background = page.getByRole("textbox", { name: type === "button" ? "按钮背景颜色" : "背景颜色", exact: true });
    await background.fill("#112233"); await background.press("Tab");
    expect((await readSession(page)).definition!.nodes[node.nodeId].responsive.desktop.backgroundColor).toBe("#112233");
    await undo(page); await undo(page);
    expect((await readSession(page)).definition).toEqual(before.definition);
    expect(server.writes).toEqual([]);
  });
}
