import { expect, test, type Page } from "@playwright/test";

test("双图新构图在预览、编辑与公开 Renderer 一致，手机重排与缺图占位稳定", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await mountRenderer(page);
  await page.route("**/media-layout-fixture.svg", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#e8e8e6"/><circle cx="300" cy="300" r="130" fill="none" stroke="#777" stroke-width="24"/></svg>' }));
  const ids = await page.evaluate(async () => {
    const paths = ["/node_modules/.vite/deps/react.js", "/node_modules/.vite/deps/react-dom_client.js", "/src/page-builder/template-creation/presets.ts", "/src/page-builder/template-creation/generateTemplateFromRecipe.ts", "/src/page-builder/template-definition/DynamicTemplateRenderer.tsx"];
    const [react, dom, presets, generator, renderer] = await Promise.all(paths.map((path) => import(/* @vite-ignore */ path)));
    // 画幅、布局与图片都在下面被覆盖，角色只决定内容槽位：取图文介绍的标题 + 描述。
    const recipe = presets.createRecommendedRecipe("editorial-media");
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
      dom.default.createRoot(host).render(react.default.createElement(renderer.default, {
        definition: mode === "empty" ? empty : definition, device: mode === "mobile" ? "mobile" : "desktop",
        mode: mode === "empty" ? "preview" : mode === "mobile" ? "public" : mode, showEmptySlots: mode === "empty",
        contentBySlotId: mode === "public" || mode === "mobile" ? { ...definition.defaultContent } : undefined,
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
    const paths = ["/node_modules/.vite/deps/react.js", "/node_modules/.vite/deps/react-dom_client.js", "/src/page-builder/template-creation/presets.ts", "/src/page-builder/template-creation/generateTemplateFromRecipe.ts", "/src/page-builder/template-definition/DynamicTemplateRenderer.tsx"];
    const [react, dom, presets, generator, renderer] = await Promise.all(paths.map((path) => import(/* @vite-ignore */ path)));
    // 几何断言要一张真主图：编辑媒体角色的画幅随内容、媒体与内容都非空。
    const recipe = presets.createRecommendedRecipe("editorial-media");
    recipe.layout = layout;
    const definition = generator.generateTemplateFromRecipe(recipe, { templateId: "geometry_recipe" });
    if (adjustedHeight) definition.nodes[definition.rootNodeId].responsive.desktop.height = { mode: "fixed", value: { value: adjustedHeight, unit: "px" } };
    const host = document.createElement("section");
    host.id = "generated-geometry";
    host.style.width = `${recipe.canvas.width}px`;
    document.body.append(host);
    dom.default.createRoot(host).render(react.default.createElement(renderer.default, { definition, device: "desktop", mode: "editor" }));
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

type FlowRecipeOptions = {
  sectionRole?: string;
  layout?: string;
  mediaPreset?: string;
  aspectRatios?: number[];
  contents?: Record<string, string>;
  device?: "desktop" | "mobile";
  mode?: "editor" | "preview" | "public";
  width?: number;
};
type FlowFixture = {
  root: string;
  stage: string;
  content: string;
  media: Array<{ id: string; role: string; ratio: number }>;
  text: Array<{ id: string; role: string }>;
};

// 随内容增长的画布没有固定高度可依，几何只能靠真实 DOM 量出来：这里挂载生产 Renderer，
// 不读后台会话或真实模板接口，只把每块的实际外框交给断言。
async function mountFlowRecipes(page: Page, fixtures: Record<string, FlowRecipeOptions>): Promise<Record<string, FlowFixture>> {
  await mountRenderer(page);
  return page.evaluate((fixtures: Record<string, FlowRecipeOptions>) => {
    const paths = ["/node_modules/.vite/deps/react.js", "/node_modules/.vite/deps/react-dom_client.js", "/src/page-builder/template-creation/presets.ts", "/src/page-builder/template-creation/generateTemplateFromRecipe.ts", "/src/page-builder/template-definition/DynamicTemplateRenderer.tsx"];
    return Promise.all(paths.map((path) => import(/* @vite-ignore */ path))).then(([react, dom, presets, generator, renderer]) => {
      const mounted: Record<string, FlowFixture> = {};
      document.body.replaceChildren();
      for (const [name, options] of Object.entries(fixtures)) {
        // 默认取品牌事实：画幅随内容增长，媒体是主图 + Logo，内容是标题与描述——
        // 正是下面流式几何断言要量的三块。需要别的结构的用例自行给 sectionRole 或覆盖 mediaPreset。
        const recipe = presets.createRecommendedRecipe(options.sectionRole ?? "maison-fact");
        if (options.layout) recipe.layout = options.layout;
        if (options.mediaPreset) recipe.media = presets.createMediaSlots(presets.MEDIA_PRESETS.find((item: any) => item.id === options.mediaPreset)!.roles);
        if (options.aspectRatios?.length && recipe.media.length) recipe.media.forEach((slot: any, index: number) => { slot.aspectRatio = options.aspectRatios![index % options.aspectRatios!.length]; });
        const definition = generator.generateTemplateFromRecipe(recipe, { templateId: `flow_${name}` });
        const contentBySlotId: Record<string, string> = {};
        for (const [role, text] of Object.entries(options.contents ?? {})) {
          const slot = Object.values(definition.slots).find((item: any) => item.semanticRole === role) as any;
          if (slot) contentBySlotId[slot.slotId] = text;
        }
        const host = document.createElement("section");
        host.dataset.flow = name;
        host.style.width = `${options.width ?? recipe.canvas.width}px`;
        document.body.append(host);
        dom.default.createRoot(host).render(react.default.createElement(renderer.default, {
          definition, device: options.device ?? "desktop", mode: options.mode ?? "editor", contentBySlotId,
        }));
        const nodes = Object.values(definition.nodes) as any[];
        const slotOf = (node: any) => definition.slots[node.slotId];
        mounted[name] = {
          root: definition.rootNodeId,
          stage: `${definition.templateId}_layout`,
          content: `${definition.templateId}_content`,
          media: nodes.filter((node) => node.slotId && slotOf(node).type === "image")
            .map((node) => ({ id: node.nodeId, role: slotOf(node).semanticRole, ratio: node.responsive.desktop.height.ratio?.width ?? 0 })),
          text: nodes.filter((node) => node.slotId && ["heading", "text", "button"].includes(slotOf(node).type))
            .map((node) => ({ id: node.nodeId, role: slotOf(node).semanticRole })),
        };
      }
      return mounted;
    });
  }, fixtures);
}

/** 按文档顺序量出这些节点的真实外框；隐藏或未渲染的节点不会出现。 */
async function flowRects(page: Page, name: string, ids: string[]) {
  return page.locator(`[data-flow="${name}"]`).evaluate((host, ids) => {
    const entries = ids
      .map((id) => ({ id, element: host.querySelector(`[data-template-node-id="${id}"]`) }))
      .filter((entry): entry is { id: string; element: Element } => Boolean(entry.element));
    entries.sort((left, right) => (left.element.compareDocumentPosition(right.element) & 4 ? -1 : 1));
    return entries.map(({ id, element }) => {
      const rect = element.getBoundingClientRect();
      return { id, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
  }, ids);
}

const FLOW_LAYOUTS = ["topImageBottomContent", "topContentBottomImage", "leftImageRightContent", "leftContentRightImage", "fullImageOverlay", "centerSubject", "headerSubjectFooter", "splitColumns", "cards", "free"];
// 长文夹具要真的超过一行：随内容增长的画布取 1440 宽，减去两侧 6% 页边距后内容区约 1268px，
// 主标题按 UI_GUIDE 排印层级是 34px——汉字一格一字，所以标题必须明显长于 37 字才会折行。
// 上限取内容槽位自己的 maxLength（标题 80 字），不写产品里存不下的文案。
const FLOW_LONG_TITLE = "海川工坊在同一张工作台上完成的镶嵌、抛光与质检记录，每一道工序都留档可查，客人到店可以逐件复核";
const FLOW_LONG_BODY = "每一件作品都从选石开始，由师傅手工完成起版、镶嵌、抛光与复检，全过程留档。工坊不为赶工跳过任何一道工序，也不把未经验收的半成品提前交到客人手里。预约到店可以先看这一批的完整工序记录，再决定是否进入定制流程。";

test("随内容增长的画布按内容撑高：十种布局的主图、Logo 与内容块都有真实高度且不重叠", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  const mounted = await mountFlowRecipes(page, Object.fromEntries(FLOW_LAYOUTS.map((layout) => [layout, { layout }])));
  for (const layout of FLOW_LAYOUTS) {
    const ids = mounted[layout];
    await expect(page.locator(`[data-flow="${layout}"] [data-template-node-id="${ids.stage}"]`)).toBeVisible();
    const rects = await flowRects(page, layout, [ids.stage, ids.content, ...ids.media.map((item) => item.id)]);
    const byId = new Map(rects.map((rect) => [rect.id, rect]));
    const frame = byId.get(ids.stage)!;
    // 画布高度为 0 时，这里、以及下面每一块都会是 0 或负坐标。
    expect(frame.height, `${layout}：流式画布没有高度`).toBeGreaterThan(200);
    expect(frame.width, `${layout}：流式画布没有宽度`).toBeGreaterThan(0);
    const ordered = rects.filter((rect) => rect.id !== ids.stage);
    expect(ordered.length, `${layout}：主图、Logo 与内容块未全部渲染`).toBe(3);
    for (const block of ordered) {
      expect(block.width, `${layout}：${block.id} 宽度为 0`).toBeGreaterThan(0);
      expect(block.height, `${layout}：${block.id} 高度为 0`).toBeGreaterThan(0);
      expect(block.y, `${layout}：${block.id} 起点跑到画布上方`).toBeGreaterThanOrEqual(frame.y - 1);
    }
    // 流式画布里所有块同处一列，文档顺序就是阅读顺序，相邻两块不得重叠。
    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index].y, `${layout}：${ordered[index].id} 与上一块重叠`).toBeGreaterThanOrEqual(ordered[index - 1].y + ordered[index - 1].height - 1);
    }
    const last = ordered[ordered.length - 1];
    expect(last.y + last.height, `${layout}：最后一块溢出画布底部`).toBeLessThanOrEqual(frame.y + frame.height + 1);
    const hero = ids.media.find((item) => item.role === "heroImage")!;
    const logo = ids.media.find((item) => item.role === "logo")!;
    expect(byId.get(hero.id)!.width, `${layout}：主图没有铺满内容区`).toBeGreaterThan(frame.width * .8);
    expect(byId.get(logo.id)!.width, `${layout}：Logo 被拉伸成通栏`).toBeCloseTo(90, 0);
    expect(byId.get(logo.id)!.height, `${layout}：Logo 没有按 1:1 定高`).toBeCloseTo(90, 0);
  }
});

test("随内容增长的长中文撑高画布，缺图不塌陷也不给负坐标", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  const mounted = await mountFlowRecipes(page, {
    short: { mode: "public", contents: { title: "海川工坊", description: "手工镶嵌" } },
    long: { mode: "public", contents: { title: FLOW_LONG_TITLE, description: FLOW_LONG_BODY } },
    blank: { mode: "editor" },
  });
  const measure = async (name: string) => {
    const ids = mounted[name];
    await expect(page.locator(`[data-flow="${name}"] [data-template-node-id="${ids.stage}"]`)).toBeVisible();
    const rects = await flowRects(page, name, [ids.stage, ids.content, ...ids.media.map((item) => item.id), ...ids.text.map((item) => item.id)]);
    const byId = new Map(rects.map((rect) => [rect.id, rect]));
    return { ids, byId, frame: byId.get(ids.stage)! };
  };
  const short = await measure("short");
  const long = await measure("long");
  const textOf = (result: typeof short, role: string) => result.byId.get(result.ids.text.find((item) => item.role === role)!.id)!;
  const blocks = (name: string, result: typeof short) => {
    const title = textOf(result, "title");
    const body = textOf(result, "description");
    for (const block of [title, body]) {
      expect(block.height, `${name}：文字高度为 0`).toBeGreaterThan(0);
      expect(block.y, `${name}：文字跑到画布上方`).toBeGreaterThanOrEqual(result.frame.y - 1);
      expect(block.y + block.height, `${name}：文字溢出画布底部`).toBeLessThanOrEqual(result.frame.y + result.frame.height + 1);
    }
    expect(body.y, `${name}：正文没有排在标题之后`).toBeGreaterThanOrEqual(title.y + title.height - 1);
    return { title, body };
  };
  const shortBlocks = blocks("short", short);
  const longBlocks = blocks("long", long);
  // 长中文必须真的多占行：标题与正文各自撑开，而不是被压回同一行或裁掉。
  expect(longBlocks.title.height, "长中文标题没有换行").toBeGreaterThan(shortBlocks.title.height * 1.5);
  expect(longBlocks.body.height, "长中文正文没有分行撑开").toBeGreaterThan(shortBlocks.body.height);
  // 画布高度完全由这两块文字撑出来：增量必须等于文字增量，既不能截断也不能留出多余空白。
  const growth = (long.frame.height - short.frame.height) - (longBlocks.title.height - shortBlocks.title.height) - (longBlocks.body.height - shortBlocks.body.height);
  expect(growth, "画布增量与文字撑出的高度不符").toBeCloseTo(0, 0);
  for (const [name, result] of [["short", short], ["long", long]] as const) {
    // 公开页没有图片内容：主图按空槽位折叠，剩下的文字仍要撑出体面高度。
    expect(await page.locator(`[data-flow="${name}"] [data-template-node-id="${result.ids.media[0].id}"]`).count(), `${name}：缺图在公开页未折叠`).toBe(0);
    expect(result.frame.height, `${name}：缺图让画布塌陷`).toBeGreaterThan(100);
  }
  // 编辑态保留空槽位占位：缺图也要有真实外框，不能把画布压成 0。
  const blank = await measure("blank");
  const placeholder = blank.byId.get(blank.ids.media[0].id)!;
  expect(placeholder.width, "编辑态缺图占位没有宽度").toBeGreaterThan(0);
  expect(placeholder.height, "编辑态缺图占位没有高度").toBeGreaterThan(0);
  expect(placeholder.height, "编辑态缺图占位没有按比例定高").toBeCloseTo(placeholder.width, -1);
  expect(blank.frame.height, "编辑态缺图让画布塌陷").toBeGreaterThan(placeholder.height);
});

test("随内容增长的多画幅各自定高，手机仍按内容顺序单列堆叠", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  const mounted = await mountFlowRecipes(page, {
    mixed: { mediaPreset: "heroTwo", aspectRatios: [16 / 9, 1, .8] },
    phone: { layout: "centerSubject", device: "mobile", width: 390 },
  });
  const mixed = mounted.mixed;
  await expect(page.locator(`[data-flow="mixed"] [data-template-node-id="${mixed.stage}"]`)).toBeVisible();
  const mixedRects = await flowRects(page, "mixed", [mixed.stage, mixed.content, ...mixed.media.map((item) => item.id)]);
  const mixedById = new Map(mixedRects.map((rect) => [rect.id, rect]));
  const heights: number[] = [];
  for (const media of mixed.media) {
    const rect = mixedById.get(media.id)!;
    // 每张图按自己的比例铺满内容区宽度定高，比例不同的图不会被拉成同一个高度。
    expect(rect.height, `${media.id} 没有按 ${media.ratio} 定高`).toBeCloseTo(rect.width / media.ratio, -1);
    heights.push(rect.height);
  }
  expect(heights[0], "16:9 没有比 1:1 矮").toBeLessThan(heights[1]);
  expect(heights[1], "1:1 没有比 4:5 矮").toBeLessThan(heights[2]);
  // 手机端同样靠内容撑高：Logo 固定窄宽，其余按顺序单列，不得重叠。
  const phone = mounted.phone;
  await expect(page.locator(`[data-flow="phone"] [data-template-node-id="${phone.stage}"]`)).toBeVisible();
  const phoneRects = await flowRects(page, "phone", [phone.stage, phone.content, ...phone.media.map((item) => item.id)]);
  const phoneFrame = phoneRects.find((rect) => rect.id === phone.stage)!;
  const phoneBlocks = phoneRects.filter((rect) => rect.id !== phone.stage);
  expect(phoneFrame.height, "手机流式画布没有高度").toBeGreaterThan(200);
  expect(phoneBlocks.length, "手机端主图、Logo 与内容块未全部渲染").toBe(3);
  for (let index = 0; index < phoneBlocks.length; index += 1) {
    expect(phoneBlocks[index].height, `手机端 ${phoneBlocks[index].id} 高度为 0`).toBeGreaterThan(0);
    expect(phoneBlocks[index].y, `手机端 ${phoneBlocks[index].id} 起点跑到画布上方`).toBeGreaterThanOrEqual(phoneFrame.y - 1);
    if (index) expect(phoneBlocks[index].y, `手机端 ${phoneBlocks[index].id} 与上一块重叠`).toBeGreaterThanOrEqual(phoneBlocks[index - 1].y + phoneBlocks[index - 1].height - 1);
  }
  const phoneLogo = phoneBlocks.find((block) => phone.media.some((item) => item.id === block.id && item.role === "logo"))!;
  expect(phoneLogo.width, "手机端 Logo 没有保持窄宽").toBeCloseTo(72, 0);
});

// 隔离浏览器工作面，只挂载生产 Renderer；不读取后台会话或真实模板接口。
async function mountRenderer(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/__recipe-renderer", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><style>
      /* 与 styles/public/foundation.css 的全局重置一致：缺了它，带内边距的节点会按 content-box
         量出比生产更宽的内容区，几何断言就不是生产的几何。 */
      *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    </style><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script></head><body><main id="fixture"></main><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import DynamicTemplateRenderer from '/src/page-builder/template-definition/DynamicTemplateRenderer.tsx';
      import { addDynamicTemplateNode, createBlankDynamicTemplateDefinition, duplicateDynamicTemplateNode, compileDynamicTemplateRenderPlan } from '/src/page-builder/template-definition/index.ts';
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
      const publicContent = { ...definition.defaultContent };
      const modes = ['thumbnail', 'editor', 'public', 'mobile', 'public-empty'];
      ReactDOM.createRoot(document.getElementById('fixture')).render(React.createElement(React.Fragment, null,
        ...modes.map((mode) => React.createElement('section', { key: mode, 'data-mode': mode }, React.createElement(DynamicTemplateRenderer, {
          definition, device: mode === 'mobile' ? 'mobile' : 'desktop', mode: mode === 'mobile' || mode === 'public-empty' ? 'public' : mode, contentBySlotId: mode === 'public' || mode === 'mobile' ? publicContent : mode === 'public-empty' ? undefined : preview,
        })))
      ));
      window.__recipeFixture = { definition, titleId: title.nodeId, titleSlot, imageSlot, actionSlot, preview, useTemplateEditorSession, mergeTemplateTrialContent, createTemplatePreviewContentBySlotId, duplicateDynamicTemplateNode, compileDynamicTemplateRenderPlan };
    </script></body></html>`,
  }));
  await page.route("**/template-fixture.svg", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#ccc"/></svg>' }));
  await page.goto("/__recipe-renderer");
  await expect.poll(async () => errors.length ? errors.join("\n") : await page.locator('[data-mode="public"]').count()).toBe(1);
}

test("方案默认图文用于目录与画布，公开 Renderer 只显示页面实例值", async ({ page }) => {
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
  const emptyPublic = page.locator('[data-mode="public-empty"]');
  await expect(emptyPublic.getByRole("heading", { name: "保存的方案标题" })).toHaveCount(0);
  await expect(emptyPublic.getByRole("img", { name: "保存的默认图" })).toHaveCount(0);
  await expect(emptyPublic.getByText("了解方案", { exact: true })).toHaveCount(0);
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

test("作品网格和连续作品卡在 390px 下排成两列", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/__work-grid", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><style>*,*::before,*::after{box-sizing:border-box}</style>
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script></head><body><main id="fixture"></main><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { createRecommendedRecipe } from '/src/page-builder/template-creation/presets.ts';
      import { generateTemplateFromRecipe } from '/src/page-builder/template-creation/generateTemplateFromRecipe.ts';
      import DynamicTemplateRenderer from '/src/page-builder/template-definition/DynamicTemplateRenderer.tsx';
      const recipe = createRecommendedRecipe('creation-grid');
      const definition = generateTemplateFromRecipe(recipe, { templateId: 'work_grid', name: '作品网格' });
      const host = document.getElementById('fixture');
      host.style.width = '390px';
      ReactDOM.createRoot(host).render(React.createElement(DynamicTemplateRenderer, {
        definition, device: 'mobile', mode: 'editor',
      }));
    </script></body></html>`,
  }));
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto("/__work-grid");
  await expect.poll(() => errors.join("\n")).toBe("");
  const grid = page.locator("[data-template-mobile-work-grid='true']");
  await expect(grid).toBeVisible();
  const boxes = await grid.locator("[data-template-node-type='ImageSlot']").evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
  }));
  expect(boxes.length).toBeGreaterThanOrEqual(3);
  expect(boxes[0].width).toBeGreaterThan(120);
  expect(boxes[0].width).toBeLessThan(220);
  expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width - 1);
  expect(boxes[1].y).toBeCloseTo(boxes[0].y, 0);
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y + boxes[0].height - 1);
  expect(boxes[0].height / boxes[0].width).toBeGreaterThan(1.1);
});

test("深色画布的手机主图贴齐区块边缘，浅色图文仍留边距", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/__bleed-frame", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><style>*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}</style>
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script></head><body><main id="fixture"></main><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { createRecommendedRecipe, styleFor } from '/src/page-builder/template-creation/presets.ts';
      import { generateTemplateFromRecipe } from '/src/page-builder/template-creation/generateTemplateFromRecipe.ts';
      import DynamicTemplateRenderer from '/src/page-builder/template-definition/DynamicTemplateRenderer.tsx';
      const mount = (name, sectionRole, variant) => {
        const recipe = createRecommendedRecipe(sectionRole);
        recipe.style = styleFor(variant);
        const definition = generateTemplateFromRecipe(recipe, { templateId: name, name });
        const host = document.createElement('section');
        host.dataset.case = name;
        host.style.width = '390px';
        document.getElementById('fixture').append(host);
        ReactDOM.createRoot(host).render(React.createElement(DynamicTemplateRenderer, {
          definition, device: 'mobile', mode: 'editor',
        }));
      };
      mount('dark-story', 'collection-story', 'tech');
      mount('light-story', 'collection-story', 'minimal');
      mount('light-hero', 'page-hero', 'minimal');
    </script></body></html>`,
  }));
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto("/__bleed-frame");
  await expect.poll(() => errors.join("\n")).toBe("");
  const edges = async (name: string) => page.locator(`[data-case="${name}"]`).evaluate((host) => {
    const root = host.querySelector("[data-template-root-node-id]");
    const image = host.querySelector("[data-template-semantic-role='heroImage'], [data-template-semantic-role='backgroundImage']");
    const title = host.querySelector("[data-template-semantic-role='title']");
    const box = (node: Element | null) => {
      const rect = node?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right } : null;
    };
    const imageRect = image?.getBoundingClientRect();
    const titleRect = title?.getBoundingClientRect();
    return {
      root: box(root),
      image: box(image),
      title: box(title),
      bleed: image?.getAttribute("data-template-mobile-bleed"),
      imageRatio: imageRect && imageRect.width ? imageRect.height / imageRect.width : 0,
      titleBelowImage: Boolean(titleRect && imageRect && titleRect.top >= imageRect.bottom - 1),
    };
  });
  const dark = await edges("dark-story");
  const light = await edges("light-story");
  const hero = await edges("light-hero");
  expect(dark.image && dark.root && dark.title).toBeTruthy();
  expect(Math.abs(dark.image!.left - dark.root!.left), "深色主图左边仍缩在画布里").toBeLessThanOrEqual(1);
  expect(Math.abs(dark.image!.right - dark.root!.right), "深色主图右边仍缩在画布里").toBeLessThanOrEqual(1);
  expect(dark.title!.left).toBeGreaterThan(dark.image!.left + 8);
  expect(dark.bleed).toBe("true");
  expect(light.image && light.root).toBeTruthy();
  expect(light.image!.left).toBeGreaterThan(light.root!.left + 8);
  expect(light.bleed).toBeNull();
  expect(hero.image && hero.root).toBeTruthy();
  expect(Math.abs(hero.image!.left - hero.root!.left), "浅色首屏主图没有贴边").toBeLessThanOrEqual(1);
  expect(hero.bleed).toBe("true");
  expect(hero.imageRatio, "首屏手机图是 4:5，不是横图压成的细条").toBeGreaterThan(1.2);
  expect(hero.imageRatio).toBeLessThan(1.35);
  expect(hero.titleBelowImage, "首屏标题在图下，不盖住画面").toBe(true);
});
