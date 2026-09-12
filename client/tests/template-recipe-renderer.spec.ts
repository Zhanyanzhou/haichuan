import { expect, test, type Page } from "@playwright/test";

test("双图新构图在预览、编辑与公开 Renderer 一致，手机重排与缺图占位稳定", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await mountRenderer(page);
  await page.route("**/media-layout-fixture.svg", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#e8e8e6"/><circle cx="300" cy="300" r="130" fill="none" stroke="#777" stroke-width="24"/></svg>' }));
  const ids = await page.evaluate(async () => {
    const paths = ["/node_modules/.vite/deps/react.js", "/node_modules/.vite/deps/react-dom_client.js", "/src/page-builder/template-creation/presets.ts", "/src/page-builder/template-creation/generateTemplateFromRecipe.ts", "/src/page-builder/template-definition/index.ts"];
    const [react, dom, presets, generator, renderer] = await Promise.all(paths.map((path) => import(/* @vite-ignore */ path)));
    const recipe = presets.createRecommendedRecipe("brand");
    recipe.canvas = { width: 1200, height: 900, aspectRatio: 4 / 3 };
    recipe.layout = "leftContentRightImage";
    recipe.media = presets.createMediaSlots(["custom", "custom"]);
    const definition = generator.generateTemplateFromRecipe(recipe, { templateId: "dual_media" });
    const empty = structuredClone(definition);
    const images = Object.values(definition.nodes).filter((node: any) => definition.slots[node.slotId]?.type === "image") as any[];
    images.forEach((node, index) => { definition.defaultContent[node.slotId] = { src: "/media-layout-fixture.svg", alt: `测试图片 ${index + 1}` }; });
    const gallery = document.createElement("main");
    gallery.id = "media-gallery";
    document.body.replaceChildren(gallery);
    for (const mode of ["preview", "editor", "public", "empty", "mobile"]) {
      const host = document.createElement("section");
      host.dataset.surface = mode;
      host.style.width = mode === "mobile" ? "390px" : "1200px";
      gallery.append(host);
      dom.default.createRoot(host).render(react.default.createElement(renderer.DynamicTemplateRenderer, {
        definition: mode === "empty" ? empty : definition, device: mode === "mobile" ? "mobile" : "desktop",
        mode: mode === "empty" ? "preview" : mode === "mobile" ? "public" : mode, showEmptySlots: mode === "empty",
      }));
    }
    return { root: definition.rootNodeId, content: "dual_media_content", images: images.map((node) => node.nodeId) };
  });
  for (const mode of ["preview", "editor", "public", "empty", "mobile"]) {
    const host = page.locator(`[data-surface="${mode}"]`);
    const root = host.locator(`[data-template-node-id="${ids.root}"]`);
    await expect(root).toBeVisible();
    const first = host.locator(`[data-template-node-id="${ids.images[0]}"]`);
    const second = host.locator(`[data-template-node-id="${ids.images[1]}"]`);
    const content = host.locator(`[data-template-node-id="${ids.content}"]`);
    await expect(first).toBeVisible();
    await expect(second).toBeVisible();
    const a = (await first.boundingBox())!;
    const b = (await second.boundingBox())!;
    const text = (await content.boundingBox())!;
    const frame = (await root.boundingBox())!;
    expect(a.width).toBeGreaterThan(mode === "mobile" ? 300 : 350);
    expect(a.width).toBeCloseTo(a.height, 0);
    expect(b.width).toBeCloseTo(a.width, 0);
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height + 15);
    expect(b.y + b.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
    if (mode === "mobile") expect(a.y).toBeGreaterThanOrEqual(text.y + text.height);
    else expect(a.x).toBeGreaterThan(text.x + text.width);
    if (mode !== "empty") await expect(host.getByRole("img", { name: "测试图片 1" })).toHaveJSProperty("naturalWidth", 600);
    if (mode === "preview" || mode === "mobile") await host.screenshot({ path: testInfo.outputPath(`dual-media-${mode}.png`) });
  }
});

async function mountGeneratedGeometry(page: Page, layout: string, adjustedHeight?: number) {
  await mountRenderer(page);
  return page.evaluate(async ({ layout, adjustedHeight }) => {
    const paths = ["/node_modules/.vite/deps/react.js", "/node_modules/.vite/deps/react-dom_client.js", "/src/page-builder/template-creation/presets.ts", "/src/page-builder/template-creation/generateTemplateFromRecipe.ts", "/src/page-builder/template-definition/index.ts"];
    const [react, dom, presets, generator, renderer] = await Promise.all(paths.map((path) => import(/* @vite-ignore */ path)));
    const recipe = presets.createRecommendedRecipe();
    recipe.layout = layout;
    const definition = generator.generateTemplateFromRecipe(recipe, { templateId: "geometry_recipe" });
    if (adjustedHeight) definition.nodes[definition.rootNodeId].responsive.desktop.height = { mode: "fixed", value: { value: adjustedHeight, unit: "px" } };
    const host = document.createElement("section");
    host.id = "generated-geometry";
    host.style.width = `${recipe.canvas.width}px`;
    document.body.append(host);
    dom.default.createRoot(host).render(react.default.createElement(renderer.DynamicTemplateRenderer, { definition, device: "desktop", mode: "editor" }));
    return { root: definition.rootNodeId, stage: "geometry_recipe_layout", content: "geometry_recipe_content", hero: Object.values(definition.nodes).find((node: any) => node.slotId && definition.slots[node.slotId].semanticRole === "heroImage")!.nodeId };
  }, { layout, adjustedHeight });
}

test("生成的全幅主图真正铺满画布并位于内容下方", async ({ page }) => {
  const ids = await mountGeneratedGeometry(page, "fullImageOverlay");
  const host = page.locator("#generated-geometry");
  const root = host.locator(`[data-template-node-id="${ids.root}"]`);
  await expect(root).toBeVisible();
  const frame = (await root.boundingBox())!;
  const hero = (await host.locator(`[data-template-node-id="${ids.hero}"]`).boundingBox())!;
  const content = (await host.locator(`[data-template-node-id="${ids.content}"]`).boundingBox())!;
  expect(hero.width).toBeCloseTo(frame.width, 0);
  expect(hero.height).toBeCloseTo(frame.height, 0);
  expect(hero.y).toBeCloseTo(frame.y, 0);
  expect(Math.min(hero.y + hero.height, content.y + content.height) - Math.max(hero.y, content.y)).toBeGreaterThan(0);
});

test("生成后修改整体高度，内部布局跟随实际画布而不保留旧固定高度", async ({ page }) => {
  const ids = await mountGeneratedGeometry(page, "topImageBottomContent", 1600);
  const host = page.locator("#generated-geometry");
  const root = host.locator(`[data-template-node-id="${ids.root}"]`);
  await expect(root).toBeVisible();
  const frame = (await root.boundingBox())!;
  const stage = (await host.locator(`[data-template-node-id="${ids.stage}"]`).boundingBox())!;
  expect(frame.height).toBeCloseTo(1600, 0);
  expect(stage.height).toBeCloseTo(frame.height, 0);
});

// 隔离浏览器工作面，只挂载生产 Renderer；不读取后台会话或真实模板接口。
async function mountRenderer(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/__recipe-renderer", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script></head><body><main id="fixture"></main><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { DynamicTemplateRenderer, addDynamicTemplateNode, createBlankDynamicTemplateDefinition, duplicateDynamicTemplateNode, compileDynamicTemplateRenderPlan } from '/src/page-builder/template-definition/index.ts';
      import { createTemplatePreviewContentBySlotId } from '/src/page-builder/template-editor/templatePreviewModel.ts';
      import { useTemplateEditorSession } from '/src/page-builder/template-editor/templateEditorSession.ts';
      import { mergeTemplateTrialContent } from '/src/page-builder/template-editor/templateTrialContentSession.ts';
      let definition = createBlankDynamicTemplateDefinition('方案默认内容');
      const region = addDynamicTemplateNode(definition, definition.rootNodeId, 'Container'); definition = region.definition;
      const title = addDynamicTemplateNode(definition, region.nodeId, 'HeadingSlot'); definition = title.definition;
      const image = addDynamicTemplateNode(definition, region.nodeId, 'ImageSlot'); definition = image.definition;
      const action = addDynamicTemplateNode(definition, region.nodeId, 'ButtonSlot'); definition = action.definition;
      definition.schemaVersion = 3;
      const titleSlot = definition.nodes[title.nodeId].slotId;
      const imageSlot = definition.nodes[image.nodeId].slotId;
      const actionSlot = definition.nodes[action.nodeId].slotId;
      definition.defaultContent = { [titleSlot]: '保存的方案标题', [imageSlot]: { src: '/template-fixture.svg', alt: '保存的默认图' }, [actionSlot]: { label: '了解方案', targetType: 'none' } };
      Object.assign(definition.nodes[definition.rootNodeId].responsive.desktop, {
        backgroundColor: '#f0f1f2', backgroundImage: '/template-fixture.svg',
        backgroundGradient: { from: '#fff', to: '#222', angle: 45 }, opacity: .8,
      });
      Object.assign(definition.nodes[definition.rootNodeId].responsive.mobile, { backgroundGradient: null, backgroundImage: '' });
      Object.assign(definition.slots[titleSlot].desktopRules, { color: '#123456', fontFamily: 'serif', letterSpacing: 2 });
      Object.assign(definition.slots[actionSlot].desktopRules, { textAlign: 'right' });
      definition.slots[actionSlot].mobileRules = { textAlign: 'center' };
      definition.slots[titleSlot].mobileRules = {};
      const preview = createTemplatePreviewContentBySlotId(definition);
      const modes = ['thumbnail', 'editor', 'public', 'mobile'];
      ReactDOM.createRoot(document.getElementById('fixture')).render(React.createElement(React.Fragment, null,
        ...modes.map((mode) => React.createElement('section', { key: mode, 'data-mode': mode }, React.createElement(DynamicTemplateRenderer, {
          definition, device: mode === 'mobile' ? 'mobile' : 'desktop', mode: mode === 'mobile' ? 'public' : mode, contentBySlotId: mode === 'public' || mode === 'mobile' ? undefined : preview,
        })))
      ));
      window.__recipeFixture = { definition, titleId: title.nodeId, titleSlot, imageSlot, actionSlot, preview, useTemplateEditorSession, mergeTemplateTrialContent, createTemplatePreviewContentBySlotId, duplicateDynamicTemplateNode, compileDynamicTemplateRenderPlan };
    </script></body></html>`,
  }));
  await page.route("**/template-fixture.svg", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#ccc"/></svg>' }));
  await page.goto("/__recipe-renderer");
  await expect.poll(async () => errors.length ? errors.join("\n") : await page.locator('[data-mode="public"]').count()).toBe(1);
}

test("方案默认图文与样式在目录、画布、公开 Renderer 一致", async ({ page }) => {
  await mountRenderer(page);
  await expect(page.locator('[data-mode="mobile"] [data-template-node-id]').first()).toHaveCSS("background-image", "none");
  for (const mode of ["thumbnail", "editor", "public"]) {
    const surface = page.locator(`[data-mode="${mode}"]`);
    await expect(surface.getByRole("heading", { name: "保存的方案标题" })).toHaveCSS("color", "rgb(18, 52, 86)");
    await expect(surface.getByRole("heading")).toHaveCSS("letter-spacing", "2px");
    await expect(surface.getByRole("img", { name: "保存的默认图" })).toHaveAttribute("src", "/template-fixture.svg");
    await expect(surface.getByText("了解方案", { exact: true })).toBeVisible();
    const root = surface.locator('[data-template-node-id]').first();
    await expect(root).toHaveCSS("background-color", "rgb(240, 241, 242)");
    await expect(root).toHaveCSS("opacity", "0.8");
    await expect(root).toHaveCSS("background-image", /linear-gradient\(45deg.*template-fixture\.svg/);
  }
});

test("CTA 对齐实际移动文案，在画布、缩略图和公开渲染保持一致", async ({ page }) => {
  await mountRenderer(page);
  for (const mode of ["thumbnail", "editor", "public", "mobile"]) {
    const action = page.locator(`[data-mode="${mode}"]`).getByText("了解方案", { exact: true });
    const geometry = await action.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      return { left: text.left, right: text.right, center: (text.left + text.right) / 2, boxLeft: box.left, boxRight: box.right, boxCenter: (box.left + box.right) / 2 };
    });
    expect(geometry.right - geometry.left).toBeLessThan(geometry.boxRight - geometry.boxLeft);
    expect(Math.abs(mode === "mobile" ? geometry.center - geometry.boxCenter : geometry.right - geometry.boxRight)).toBeLessThan(2);
  }
});

test("方案默认值编辑可撤销重做；临时试排不污染模板；祖先锁禁止默认值修改", async ({ page }) => {
  await mountRenderer(page);
  const result = await page.evaluate(() => {
    const fixture = (window as unknown as { __recipeFixture: any }).__recipeFixture;
    const { definition, titleSlot, useTemplateEditorSession, mergeTemplateTrialContent, createTemplatePreviewContentBySlotId } = fixture;
    const store = useTemplateEditorSession;
    store.getState().open({ format: "dynamic", sourceType: "local", localDraftId: definition.templateId, versionNote: "", definition });
    const changed = store.getState().executeCommand({ type: "update-definition", label: "修改默认标题", update: (next: any) => { next.defaultContent[titleSlot] = "新默认标题"; } });
    const edited = store.getState().draft.definition.defaultContent[titleSlot];
    const historyCount = store.getState().historyPast.length;
    store.getState().undo(); const undone = store.getState().draft.definition.defaultContent[titleSlot];
    store.getState().redo(); const redone = store.getState().draft.definition.defaultContent[titleSlot];
    const current = store.getState().draft.definition;
    const trial = mergeTemplateTrialContent(createTemplatePreviewContentBySlotId(current), { [titleSlot]: "临时试排" });
    const preserved = current.defaultContent[titleSlot];
    store.getState().executeCommand({ type: "update-definition", label: "锁定模板", update: (next: any) => { next.nodes[next.rootNodeId].authoring = { structureLocked: true }; } });
    const blocked = store.getState().executeCommand({ type: "update-definition", label: "改锁定标题", update: (next: any) => { next.defaultContent[titleSlot] = "非法改动"; } });
    return { changed: changed.ok, edited, historyCount, undone, redone, trial: trial[titleSlot], preserved, blocked: blocked.ok, afterBlocked: store.getState().draft.definition.defaultContent[titleSlot] };
  });
  expect(result).toEqual({ changed: true, edited: "新默认标题", historyCount: 1, undone: "保存的方案标题", redone: "新默认标题", trial: "临时试排", preserved: "新默认标题", blocked: false, afterBlocked: "新默认标题" });
});

test("旧模板仍使用中性预览，方案空默认值不被示例替换", async ({ page }) => {
  await mountRenderer(page);
  const result = await page.evaluate(() => {
    const { definition, titleSlot, createTemplatePreviewContentBySlotId } = (window as unknown as { __recipeFixture: any }).__recipeFixture;
    const legacy = structuredClone(definition); legacy.schemaVersion = 1;
    const empty = structuredClone(definition); empty.defaultContent[titleSlot] = "";
    return { legacy: createTemplatePreviewContentBySlotId(legacy)[titleSlot], empty: createTemplatePreviewContentBySlotId(empty)[titleSlot] };
  });
  expect(result.legacy).not.toBe("保存的方案标题");
  expect(result.empty).toBe("");
});

test("复制方案槽位获得新身份并保留默认内容和空值策略", async ({ page }) => {
  await mountRenderer(page);
  const result = await page.evaluate(() => {
    const { definition, titleId, titleSlot, duplicateDynamicTemplateNode } = (window as unknown as { __recipeFixture: any }).__recipeFixture;
    definition.slots[titleSlot].emptyPolicy = "use-default";
    const copied = duplicateDynamicTemplateNode(definition, titleId);
    const copiedSlotId = copied.definition.nodes[copied.nodeId].slotId;
    return { newNode: copied.nodeId !== titleId, newSlot: copiedSlotId !== titleSlot, content: copied.definition.defaultContent[copiedSlotId], policy: copied.definition.slots[copiedSlotId].emptyPolicy, original: definition.defaultContent[titleSlot] };
  });
  expect(result).toEqual({ newNode: true, newSlot: true, content: "保存的方案标题", policy: "use-default", original: "保存的方案标题" });
});

test("公开渲染计划拒绝危险背景URL和任意CSS；实例内容保留覆盖与显式清空语义", async ({ page }) => {
  await mountRenderer(page);
  const result = await page.evaluate(() => {
    const { definition, titleSlot, compileDynamicTemplateRenderPlan } = (window as unknown as { __recipeFixture: any }).__recipeFixture;
    const rejected = ["javascript:alert(1)", "data:image/svg+xml,bad", "//external.test/image.png"].map((url) => {
      const next = structuredClone(definition);
      next.nodes[next.rootNodeId].responsive.desktop.backgroundImage = url;
      return !compileDynamicTemplateRenderPlan(next, { device: "desktop" }).ok;
    });
    const invalidColor = structuredClone(definition);
    invalidColor.slots[titleSlot].desktopRules.color = "red;position:fixed";
    const invalid = compileDynamicTemplateRenderPlan(invalidColor, { device: "desktop" });
    const explicitEmpty = compileDynamicTemplateRenderPlan(definition, { device: "desktop", contentBySlotId: { [titleSlot]: "" } });
    const populated = compileDynamicTemplateRenderPlan(definition, { device: "desktop", contentBySlotId: { [titleSlot]: "页面文案" } });
    return { rejected, invalid: invalid.ok, emptyHidden: explicitEmpty.plan.root.children[0].children[0].hidden, content: populated.plan.root.children[0].children[0].content };
  });
  expect(result.rejected).toEqual([true, true, true]);
  expect(result.invalid).toBe(false);
  expect(result.emptyHidden).toBe(true);
  expect(result.content).toBe("页面文案");
});

test("方案画布双击默认文字提交进入历史，取消和撤销保持正确内容", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/__recipe-canvas*", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div><script type="module" src="/tests/fixtures/template-canvas-interaction.tsx"></script></body></html>`,
  }));
  await page.goto("/__recipe-canvas?flow");
  await expect(page.getByRole("navigation", { name: "画布编辑层级" })).toBeVisible();
  const slotId = await page.evaluate(async () => {
    const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(modulePath);
    const state = useTemplateEditorSession.getState();
    const draft = structuredClone(state.draft);
    draft.definition.schemaVersion = 3;
    const text = Object.values(draft.definition.nodes).find((node: any) => node.type === "TextSlot") as any;
    draft.definition.defaultContent[text.slotId] = "原默认文字";
    state.open(draft);
    useTemplateEditorSession.getState().selectObject(text.nodeId);
    (window as any).__recipeCanvasStore = useTemplateEditorSession;
    return text.slotId;
  });
  const target = page.getByRole("button", { name: "选择模板目标 试排文字", exact: true });
  await target.dblclick({ position: { x: 30, y: 60 } });
  const editor = page.getByRole("textbox", { name: "画布默认文字（保存到模板）" });
  await expect(editor).toHaveValue("原默认文字");
  await editor.fill("取消的文字");
  await editor.press("Escape");
  await target.dblclick({ position: { x: 30, y: 60 } });
  await expect(editor).toHaveValue("原默认文字");
  await editor.fill("画布新默认文字");
  await editor.press("Control+Enter");
  await expect(editor).toHaveCount(0);
  const readState = () => page.evaluate((slot) => {
    const state = (window as any).__recipeCanvasStore.getState();
    return { content: state.draft.definition.defaultContent[slot], history: state.historyPast.length };
  }, slotId);
  await expect.poll(readState).toEqual({ content: "画布新默认文字", history: 1 });
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect.poll(readState).toEqual({ content: "原默认文字", history: 0 });
});
