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
    images[1].instanceEditPolicy = { ...images[1].instanceEditPolicy, position: true };
    images.forEach((node, index) => { definition.defaultContent[node.slotId] = { src: "/media-layout-fixture.svg", alt: `测试图片 ${index + 1}` }; });
    // 公开 Renderer 会丢掉没有内容的文字组，这里给标题和描述真实文案，才能比对图文分区。
    Object.values(definition.slots).forEach((slot: any) => {
      if (slot.semanticRole === "title") definition.defaultContent[slot.slotId] = "双图构图";
      if (slot.semanticRole === "description") definition.defaultContent[slot.slotId] = "两张作品图上下排列，文字区留在一侧。";
    });
    const gallery = document.createElement("main");
    gallery.id = "media-gallery";
    document.body.replaceChildren(gallery);
    for (const mode of ["preview", "editor", "public", "empty", "mobile-editor", "mobile-preview", "mobile"]) {
      const host = document.createElement("section");
      host.dataset.surface = mode;
      const mobile = mode.startsWith("mobile");
      const renderMode = mode === "mobile" ? "public" : mode === "empty" ? "preview" : mode.replace(/^mobile-/, "");
      host.style.width = mobile ? "390px" : "1200px";
      gallery.append(host);
      const root = dom.default.createRoot(host);
      const contentBySlotId = renderMode === "public" ? { ...definition.defaultContent } : undefined;
      const render = (offsetYPercent = 0) => root.render(react.default.createElement(renderer.default, {
        definition: mode === "empty" ? empty : definition, device: mobile ? "mobile" : "desktop",
        mode: renderMode, showEmptySlots: mode === "empty",
        contentBySlotId,
        layoutOverridesByNodeId: offsetYPercent ? { [images[1].nodeId]: { mobile: { offsetYPercent } } } : undefined,
      }));
      render();
      if (mode === "mobile") Object.assign(window, { moveMobileImage: render });
    }
    const next = document.createElement("section");
    next.textContent = "下一节";
    gallery.append(next);
    return { root: definition.rootNodeId, content: "dual_media_content", images: images.map((node) => node.nodeId) };
  });
  for (const mode of ["preview", "editor", "public", "empty", "mobile-editor", "mobile-preview", "mobile"]) {
    const host = page.locator(`[data-surface="${mode}"]`);
    const mobile = mode.startsWith("mobile");
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
    expect(a.width).toBeGreaterThan(mobile ? 300 : 350);
    expect(a.width).toBeCloseTo(a.height, 0);
    expect(b.width).toBeCloseTo(a.width, 0);
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height + 15);
    if (mobile) {
      expect(frame.height / frame.width, "桌面 4:3 在手机上对换成 3:4，装不下的图可以溢出").toBeCloseTo(4 / 3, 1);
      expect(frame.height).toBeCloseTo(520, 0);
      const canvas = host.locator(".hc-dynamic-template");
      expect((await canvas.boundingBox())?.height).toBeCloseTo(frame.height, 0);
      expect(b.y + b.height).toBeGreaterThan(frame.y + frame.height);
      const nextTop = () => host.evaluate((element) => element.nextElementSibling!.getBoundingClientRect().top);
      await expect.poll(nextTop).toBeGreaterThanOrEqual(b.y + b.height - 1);
      if (mode === "mobile-editor") await expect(canvas).toHaveAttribute("data-template-fixed-canvas-overflow", "true");
      if (mode === "mobile") {
        const move = (offset: number) => page.evaluate((value) => (window as unknown as {
          moveMobileImage: (offset: number) => void;
        }).moveMobileImage(value), offset);
        const nextBefore = await nextTop();
        await move(12);
        await expect.poll(async () => (await second.boundingBox())!.y).toBeGreaterThan(b.y + 10);
        const shifted = (await second.boundingBox())!;
        await expect.poll(nextTop).toBeGreaterThanOrEqual(shifted.y + shifted.height - 1);
        await move(0);
        await expect.poll(async () => (await second.boundingBox())!.y).toBeCloseTo(b.y, 0);
        await expect.poll(nextTop).toBeCloseTo(nextBefore, 0);
      }
    } else {
      expect(b.y + b.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
    }
    if (mobile) expect(a.y).toBeGreaterThanOrEqual(text.y + text.height);
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
  // 品牌事实是上图下文：主图保持自己的比例，文字和 Logo 都排在图下，不盖住主图。
  const phone = mounted.phone;
  await expect(page.locator(`[data-flow="phone"] [data-template-node-id="${phone.stage}"]`)).toBeVisible();
  const phoneRects = await flowRects(page, "phone", [phone.stage, phone.content, ...phone.media.map((item) => item.id)]);
  const phoneFrame = phoneRects.find((rect) => rect.id === phone.stage)!;
  const phoneBlocks = phoneRects.filter((rect) => rect.id !== phone.stage);
  expect(phoneFrame.height, "手机流式画布没有高度").toBeGreaterThan(200);
  expect(phoneBlocks.length, "手机端主图、Logo 与内容块未全部渲染").toBe(3);
  const phoneHero = phoneBlocks.find((block) => phone.media.some((item) => item.id === block.id && item.role === "heroImage"))!;
  const phoneCopy = phoneBlocks.find((block) => block.id === phone.content)!;
  const phoneLogo = phoneBlocks.find((block) => phone.media.some((item) => item.id === block.id && item.role === "logo"))!;
  expect(phoneCopy.y, "手机文字盖住了主图").toBeGreaterThanOrEqual(phoneHero.y + phoneHero.height - 1);
  expect(phoneCopy.x, "手机文字跑出画布左侧").toBeGreaterThanOrEqual(phoneFrame.x - 1);
  expect(phoneCopy.x + phoneCopy.width, "手机文字跑出画布右侧").toBeLessThanOrEqual(phoneFrame.x + phoneFrame.width + 1);
  expect(phoneLogo.y, "手机端 Logo 叠进了主图").toBeGreaterThanOrEqual(phoneHero.y + phoneHero.height - 1);
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

test("三格作品在 390px 下第一张满宽、后两张并排，不把第三张落单", async ({ page }) => {
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
  expect(boxes).toHaveLength(3);
  await expect(grid).toHaveAttribute("data-template-mobile-work-lead", "true");
  // 首张跨满两列，后两张同一行并排，三张都是 4:5。
  expect(boxes[0].width).toBeGreaterThan(250);
  expect(Math.abs(boxes[1].x - boxes[0].x)).toBeLessThanOrEqual(1);
  expect(boxes[1].y).toBeGreaterThan(boxes[0].y + boxes[0].height - 1);
  expect(Math.abs(boxes[2].y - boxes[1].y)).toBeLessThanOrEqual(1);
  expect(boxes[2].x).toBeGreaterThan(boxes[1].x + boxes[1].width);
  expect(boxes[2].x - (boxes[1].x + boxes[1].width)).toBeLessThanOrEqual(13);
  expect(Math.abs(boxes[1].width - boxes[2].width)).toBeLessThanOrEqual(1);
  expect(Math.abs(boxes[1].x + boxes[1].width * 2 + 12 - (boxes[0].x + boxes[0].width))).toBeLessThanOrEqual(2);
  for (const box of boxes) expect(box.height / box.width).toBeCloseTo(1.25, 1);
});

test("固定横图根在 390px 下对换成倒数画布：16:9 对 9:16，3:2 对 2:3", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/__paired-canvas", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}</style>
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script></head><body>
      <main id="wide"></main>
      <main id="edit"></main>
      <main id="hero"></main>
      <main id="hero-image"></main>
      <script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { createRecommendedRecipe, createMediaSlots } from '/src/page-builder/template-creation/presets.ts';
      import { generateTemplateFromRecipe } from '/src/page-builder/template-creation/generateTemplateFromRecipe.ts';
      import { findLaunchTemplateMaster } from '/src/page-builder/template-creation/launchTemplateSet.ts';
      import DynamicTemplateRenderer from '/src/page-builder/template-definition/DynamicTemplateRenderer.tsx';
      function mount(id, height) {
        const recipe = createRecommendedRecipe('creation-grid');
        recipe.canvas = { width: 1440, height, aspectRatio: 1440 / height };
        const definition = generateTemplateFromRecipe(recipe, { templateId: id, name: id });
        delete definition.metadata.geometryPolicy;
        const host = document.getElementById(id);
        host.style.width = '390px';
        ReactDOM.createRoot(host).render(React.createElement(DynamicTemplateRenderer, {
          definition, device: 'mobile', mode: 'editor',
        }));
      }
      mount('wide', 810);
      mount('edit', 960);
      const heroHost = document.getElementById('hero');
      heroHost.style.width = '390px';
      ReactDOM.createRoot(heroHost).render(React.createElement(DynamicTemplateRenderer, {
        definition: findLaunchTemplateMaster('page-hero'), device: 'mobile', mode: 'editor',
      }));
      const heroImageHost = document.getElementById('hero-image');
      heroImageHost.style.width = '390px';
      const heroImageRecipe = createRecommendedRecipe('page-hero');
      heroImageRecipe.media = createMediaSlots(['heroImage']);
      ReactDOM.createRoot(heroImageHost).render(React.createElement(DynamicTemplateRenderer, {
        definition: generateTemplateFromRecipe(heroImageRecipe, { templateId: 'hero-image', name: 'hero-image' }),
        device: 'mobile', mode: 'editor',
      }));
    </script></body></html>`,
  }));
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto("/__paired-canvas");
  await expect.poll(() => errors.join("\n")).toBe("");
  const wide = page.locator("#wide .hc-dynamic-template");
  await expect(wide).toHaveAttribute("data-template-paired-canvas", "9:16");
  await expect(wide).toHaveAttribute("data-template-root-height-mode", "auto");
  const wideGrid = page.locator("#wide [data-template-paired-image-grid='true']");
  await expect(wideGrid).toHaveAttribute("data-template-paired-image-columns", "1");
  await expect(wideGrid).toHaveAttribute("data-template-paired-image-rows", "3");
  await expect(page.locator("#wide [data-template-mobile-work-lead='true']")).toHaveCount(0);
  const wideFrame = await wide.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { width: box.width, height: box.height };
  });
  expect(wideFrame.height / wideFrame.width).toBeCloseTo(16 / 9, 1);
  const edit = page.locator("#edit .hc-dynamic-template");
  await expect(edit).toHaveAttribute("data-template-paired-canvas", "2:3");
  await expect(edit).toHaveAttribute("data-template-root-height-mode", "auto");
  const grid = page.locator("#edit [data-template-paired-image-grid='true']");
  await expect(grid).toHaveAttribute("data-template-paired-image-columns", "1");
  await expect(grid).toHaveAttribute("data-template-paired-image-rows", "3");
  const boxes = await grid.locator("[data-template-node-type='ImageSlot']").evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
  }));
  expect(boxes).toHaveLength(3);
  for (let index = 1; index < boxes.length; index += 1) {
    expect(boxes[index].y).toBeGreaterThan(boxes[index - 1].y + boxes[index - 1].height - 1);
    expect(Math.abs(boxes[index].width - boxes[0].width)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxes[index].height - boxes[0].height)).toBeLessThanOrEqual(1);
  }
  const frame = await edit.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { width: box.width, height: box.height };
  });
  expect(frame.height / frame.width).toBeCloseTo(3 / 2, 1);
  const hero = page.locator("#hero .hc-dynamic-template");
  await expect(hero).toHaveAttribute("data-template-paired-canvas", "9:16");
  await expect(hero).toHaveAttribute("data-template-root-height-mode", "auto");
  const heroImage = page.locator("#hero [data-template-semantic-role='backgroundImage']");
  await expect.poll(async () => heroImage.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return box.width > 300 ? box.height / box.width : 0;
  })).toBeCloseTo(16 / 9, 1);
  const heroImageRoot = page.locator("#hero-image .hc-dynamic-template");
  await expect(heroImageRoot).toHaveAttribute("data-template-paired-canvas", "9:16");
  const heroImageFill = await heroImageRoot.evaluate((node) => {
    const root = node.getBoundingClientRect();
    const image = node.querySelector("[data-template-semantic-role='heroImage']")?.getBoundingClientRect();
    const button = node.querySelector("[data-template-node-type='ButtonSlot']")?.getBoundingClientRect();
    return {
      root: { width: root.width, height: root.height },
      image: image ? { width: image.width, height: image.height, top: image.top, bottom: image.bottom } : null,
      button: button ? { top: button.top, bottom: button.bottom } : null,
    };
  });
  expect(heroImageFill.image).not.toBeNull();
  expect(heroImageFill.image!.width / heroImageFill.root.width).toBeGreaterThan(0.9);
  expect(heroImageFill.root.height / heroImageFill.root.width, "桌面 16:9 的固定画幅在手机上对换成 9:16").toBeCloseTo(16 / 9, 1);
  expect(heroImageFill.image!.height / heroImageFill.image!.width, "手机图片框跟着整节使用 9:16").toBeCloseTo(16 / 9, 1);
  expect(heroImageFill.button).not.toBeNull();
});

test("四张作品图在对换画布里仍按两列两行", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/__works-two-by-two", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}</style>
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script></head><body>
      <main id="works" style="width:390px"></main>
      <script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { findLaunchTemplateMaster } from '/src/page-builder/template-creation/launchTemplateSet.ts';
      import DynamicTemplateRenderer from '/src/page-builder/template-definition/DynamicTemplateRenderer.tsx';
      const works = structuredClone(findLaunchTemplateMaster('creation-grid'));
      works.metadata.desktopRatio = '2:1';
      for (const node of Object.values(works.nodes)) {
        if (node.responsive?.desktop?.height) node.responsive.desktop.height = { mode: 'auto' };
      }
      const grid = Object.values(works.nodes).find((node) => node.type === 'Grid');
      grid.responsive.mobile = { display: 'flex', direction: 'column', wrap: 'nowrap' };
      grid.childIds.forEach((childId, index) => {
        const slotId = works.nodes[childId].slotId;
        if (works.slots[slotId]) works.slots[slotId].key = 'highlightImage' + String.fromCharCode(65 + index);
      });
      ReactDOM.createRoot(document.getElementById('works')).render(React.createElement(DynamicTemplateRenderer, {
        definition: works, device: 'mobile', mode: 'editor',
      }));
    </script></body></html>`,
  }));
  await page.setViewportSize({ width: 800, height: 1200 });
  await page.goto("/__works-two-by-two");
  await expect.poll(() => errors.join("\n")).toBe("");
  const frame = page.locator("#works .hc-dynamic-template");
  await expect(frame).toHaveAttribute("data-template-paired-canvas", "1:2");
  const grid = page.locator("#works [data-template-paired-image-grid='true']");
  await expect(grid).toHaveAttribute("data-template-paired-image-columns", "2");
  await expect(grid).toHaveAttribute("data-template-paired-image-rows", "2");
  const boxes = await grid.locator("[data-template-node-type='ImageSlot']").evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
  }));
  expect(boxes).toHaveLength(4);
  expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThanOrEqual(1);
  expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width - 1);
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y + boxes[0].height - 1);
  expect(Math.abs(boxes[2].y - boxes[3].y)).toBeLessThanOrEqual(1);
  expect(boxes[3].x).toBeGreaterThan(boxes[2].x + boxes[2].width - 1);
});

test("首发作品网格在 390 与 768 下按张数跨列，单列保持原样", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/__launch-works", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}</style>
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script></head><body>
      <section id="odd" style="width:390px"></section>
      <section id="quad" style="width:390px"></section>
      <section id="one" style="width:390px"></section>
      <section id="even" style="width:390px"></section>
      <section id="desktop" style="width:768px"></section>
      <section id="single" style="width:390px"></section>
      <script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { findLaunchTemplateMaster } from '/src/page-builder/template-creation/launchTemplateSet.ts';
      import DynamicTemplateRenderer from '/src/page-builder/template-definition/DynamicTemplateRenderer.tsx';
      const master = findLaunchTemplateMaster('creation-grid');
      const gridOf = (definition) => Object.values(definition.nodes).find((node) => node.type === 'Grid' && node.name === '作品卡组');
      const withCount = (count) => {
        const next = structuredClone(master);
        const grid = gridOf(next);
        const prototypes = grid.childIds.map((id) => next.nodes[id]);
        grid.childIds = Array.from({ length: count }, (_, index) => {
          const source = prototypes[index % prototypes.length];
          const nodeId = source.nodeId + '__n' + index;
          const slotId = source.slotId + '__n' + index;
          next.nodes[nodeId] = { ...structuredClone(source), nodeId, slotId, name: '作品图 ' + (index + 1) };
          const slot = structuredClone(next.slots[source.slotId]);
          slot.slotId = slotId;
          slot.key = slot.key + '_' + index;
          next.slots[slotId] = slot;
          return nodeId;
        });
        const used = new Set();
        const walk = (id) => {
          if (!id || used.has(id)) return;
          used.add(id);
          for (const childId of next.nodes[id].childIds ?? []) walk(childId);
        };
        walk(next.rootNodeId);
        for (const id of Object.keys(next.nodes)) if (!used.has(id)) delete next.nodes[id];
        const usedSlots = new Set(Object.values(next.nodes).map((node) => node.slotId).filter(Boolean));
        for (const id of Object.keys(next.slots)) if (!usedSlots.has(id)) delete next.slots[id];
        return next;
      };
      const mount = (id, definition, device) => {
        ReactDOM.createRoot(document.getElementById(id)).render(React.createElement(DynamicTemplateRenderer, {
          definition, device, mode: 'editor',
        }));
      };
      mount('odd', withCount(3), 'mobile');
      mount('quad', master, 'mobile');
      mount('one', withCount(1), 'mobile');
      mount('even', withCount(6), 'mobile');
      mount('desktop', master, 'desktop');
      const single = structuredClone(master);
      gridOf(single).responsive.mobile = { ...gridOf(single).responsive.mobile, columns: [1] };
      mount('single', single, 'mobile');
    </script></body></html>`,
  }));
  await page.setViewportSize({ width: 900, height: 1400 });
  await page.goto("/__launch-works");
  await expect.poll(() => errors.join("\n")).toBe("");
  const imageBoxes = (id: string) => page.locator(`#${id} [data-template-node-type='ImageSlot']`).evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
  }));
  const odd = await imageBoxes("odd");
  expect(odd).toHaveLength(3);
  await expect(page.locator("#odd [data-template-mobile-work-grid='true']")).toHaveCount(0);
  await expect(page.locator("#odd [data-template-mobile-work-lead='true']")).toHaveCount(1);
  expect(odd[0].width).toBeGreaterThan(odd[1].width * 1.6);
  expect(odd[1].y).toBeGreaterThan(odd[0].y + odd[0].height - 1);
  expect(Math.abs(odd[2].y - odd[1].y)).toBeLessThanOrEqual(1);
  expect(odd[2].x).toBeGreaterThan(odd[1].x + odd[1].width);
  const quad = await imageBoxes("quad");
  expect(quad).toHaveLength(4);
  await expect(page.locator("#quad [data-template-mobile-work-lead='true']")).toHaveCount(0);
  expect(Math.abs(quad[0].y - quad[1].y)).toBeLessThanOrEqual(1);
  expect(quad[1].x).toBeGreaterThan(quad[0].x + quad[0].width);
  expect(quad[2].y).toBeGreaterThan(quad[0].y + quad[0].height - 1);
  expect(Math.abs(quad[2].y - quad[3].y)).toBeLessThanOrEqual(1);
  expect(quad[3].x).toBeGreaterThan(quad[2].x + quad[2].width);
  const one = await imageBoxes("one");
  expect(one).toHaveLength(1);
  await expect(page.locator("#one [data-template-mobile-work-lead='true']")).toHaveCount(1);
  expect(one[0].width).toBeGreaterThan(250);
  const even = await imageBoxes("even");
  expect(even).toHaveLength(6);
  await expect(page.locator("#even [data-template-mobile-work-lead='true']")).toHaveCount(0);
  expect(Math.abs(even[0].y - even[1].y)).toBeLessThanOrEqual(1);
  expect(even[1].x).toBeGreaterThan(even[0].x);
  expect(even[2].y).toBeGreaterThan(even[0].y + even[0].height - 1);
  expect(Math.abs(even[4].y - even[5].y)).toBeLessThanOrEqual(1);
  const desktopColumns = await page.locator("#desktop [data-template-node-type='Grid']").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length);
  expect(desktopColumns).toBe(4);
  const desktop = await imageBoxes("desktop");
  expect(desktop).toHaveLength(4);
  await expect(page.locator("#desktop [data-template-mobile-work-lead='true']")).toHaveCount(0);
  expect(Math.abs(desktop[0].y - desktop[1].y)).toBeLessThanOrEqual(1);
  expect(Math.abs(desktop[1].y - desktop[2].y)).toBeLessThanOrEqual(1);
  expect(Math.abs(desktop[2].y - desktop[3].y)).toBeLessThanOrEqual(1);
  expect(desktop[1].x).toBeGreaterThan(desktop[0].x);
  expect(desktop[2].x).toBeGreaterThan(desktop[1].x);
  expect(desktop[3].x).toBeGreaterThan(desktop[2].x);
  const singleBoxes = await imageBoxes("single");
  expect(singleBoxes).toHaveLength(4);
  await expect(page.locator("#single [data-template-mobile-work-lead='true']")).toHaveCount(0);
  expect(singleBoxes[1].y).toBeGreaterThan(singleBoxes[0].y + singleBoxes[0].height - 1);
  expect(singleBoxes[2].y).toBeGreaterThan(singleBoxes[1].y + singleBoxes[1].height - 1);
  expect(singleBoxes[3].y).toBeGreaterThan(singleBoxes[2].y + singleBoxes[2].height - 1);
  expect(Math.abs(singleBoxes[0].x - singleBoxes[1].x)).toBeLessThanOrEqual(1);
});

test("首发作品网格在 320 到 1920 的指定宽度上保持四列或两列两行", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/__launch-works-widths", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}</style>
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script></head><body>
      ${[320, 375, 390, 430, 768, 1024, 1440, 1920].map((width) => `<section id="w${width}" style="width:${width}px"></section>`).join("")}
      <script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { findLaunchTemplateMaster } from '/src/page-builder/template-creation/launchTemplateSet.ts';
      import DynamicTemplateRenderer from '/src/page-builder/template-definition/DynamicTemplateRenderer.tsx';
      const master = findLaunchTemplateMaster('creation-grid');
      for (const width of [320, 375, 390, 430, 768, 1024, 1440, 1920]) {
        ReactDOM.createRoot(document.getElementById('w' + width)).render(React.createElement(DynamicTemplateRenderer, {
          definition: master,
          device: width < 768 ? 'mobile' : 'desktop',
          mode: 'editor',
        }));
      }
    </script></body></html>`,
  }));
  await page.setViewportSize({ width: 2100, height: 1600 });
  await page.goto("/__launch-works-widths");
  await expect.poll(() => errors.join("\n")).toBe("");
  for (const width of [320, 375, 390, 430, 768, 1024, 1440, 1920]) {
    const boxes = await page.locator(`#w${width} [data-template-node-type='ImageSlot']`).evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width) };
    }));
    expect(boxes, String(width)).toHaveLength(4);
    const leads = await page.locator(`#w${width} [data-template-mobile-work-lead='true']`).count();
    expect(leads, String(width)).toBe(0);
    if (width < 768) {
      expect(Math.abs(boxes[0].y - boxes[1].y), String(width)).toBeLessThanOrEqual(1);
      expect(boxes[1].x, String(width)).toBeGreaterThan(boxes[0].x);
      expect(boxes[2].y, String(width)).toBeGreaterThan(boxes[0].y);
      expect(Math.abs(boxes[2].y - boxes[3].y), String(width)).toBeLessThanOrEqual(1);
      expect(boxes[3].x, String(width)).toBeGreaterThan(boxes[2].x);
    } else {
      expect(Math.abs(boxes[0].y - boxes[1].y), String(width)).toBeLessThanOrEqual(1);
      expect(Math.abs(boxes[1].y - boxes[2].y), String(width)).toBeLessThanOrEqual(1);
      expect(Math.abs(boxes[2].y - boxes[3].y), String(width)).toBeLessThanOrEqual(1);
      expect(boxes[1].x, String(width)).toBeGreaterThan(boxes[0].x);
      expect(boxes[2].x, String(width)).toBeGreaterThan(boxes[1].x);
      expect(boxes[3].x, String(width)).toBeGreaterThan(boxes[2].x);
    }
  }
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
      const mountSaved = () => {
        const recipe = createRecommendedRecipe('page-hero');
        recipe.style = styleFor('minimal');
        const definition = generateTemplateFromRecipe(recipe, { templateId: 'saved_hero', name: 'saved' });
        delete definition.metadata.geometryPolicy;
        const root = definition.nodes[definition.rootNodeId];
        root.responsive.desktop.backgroundColor = '#1C1E20';
        root.responsive.mobile = { height: { mode: 'auto' } };
        const stage = definition.nodes[root.childIds[0]];
        stage.responsive.mobile = {
          ...stage.responsive.mobile,
          layoutMode: 'flow', display: 'flex', height: { mode: 'auto' },
          padding: { top: { value: 0, unit: 'px' }, right: { value: 20, unit: 'px' }, bottom: { value: 64, unit: 'px' }, left: { value: 20, unit: 'px' } },
        };
        const imageId = Object.keys(definition.nodes).find((id) => {
          const candidate = definition.nodes[id];
          return candidate.type === 'ImageSlot' && definition.slots[candidate.slotId]?.semanticRole !== 'logo';
        });
        const image = definition.nodes[imageId];
        const slot = definition.slots[image.slotId];
        slot.semanticRole = 'backgroundImage';
        slot.desktopRules.aspectRatio = '16:9';
        slot.mobileRules = { ...slot.mobileRules, aspectRatio: '4:5' };
        image.responsive.mobile = {
          ...image.responsive.mobile,
          display: 'flex',
          width: 'fill',
          height: { mode: 'aspect-ratio', ratio: { width: 4, height: 5 } },
          placement: null,
        };
        const host = document.createElement('section');
        host.dataset.case = 'saved-hero';
        host.style.width = '390px';
        document.getElementById('fixture').append(host);
        ReactDOM.createRoot(host).render(React.createElement(DynamicTemplateRenderer, {
          definition, device: 'mobile', mode: 'editor', editorSurface: 'page-instance',
          contentBySlotId: { [slot.slotId]: { src: 'https://example.com/desk.jpg', alt: '吊坠' } },
          layoutOverridesByNodeId: { [image.nodeId]: { mobile: { focusXPercent: 89.5, focusYPercent: 48 } } },
        }));
      };
      mount('dark-story', 'collection-story', 'tech');
      mount('light-story', 'collection-story', 'minimal');
      mount('light-hero', 'page-hero', 'minimal');
      mountSaved();
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
    const rootRect = root?.getBoundingClientRect();
    return {
      root: box(root),
      image: box(image),
      title: box(title),
      bleed: image?.getAttribute("data-template-mobile-bleed"),
      canvasRatio: rootRect && rootRect.width ? rootRect.height / rootRect.width : 0,
      imageRatio: imageRect && imageRect.width ? imageRect.height / imageRect.width : 0,
      titleInsideImage: Boolean(titleRect && imageRect
        && titleRect.top >= imageRect.top - 1
        && titleRect.bottom <= imageRect.bottom + 1
        && titleRect.left >= imageRect.left - 1
        && titleRect.right <= imageRect.right + 1),
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
  expect(hero.canvasRatio, "桌面 16:9 的固定首屏在手机上对换成 9:16").toBeCloseTo(16 / 9, 1);
  expect(hero.imageRatio, "手机首屏图片留在竖画布里").toBeGreaterThan(1);
  expect(hero.title, "首屏标题仍在区块里").toBeTruthy();
  const saved = await page.locator("[data-case='saved-hero']").evaluate((host) => {
    const root = host.querySelector("[data-template-root-node-id]");
    const image = host.querySelector("[data-template-semantic-role='backgroundImage']");
    const rootBox = root?.getBoundingClientRect();
    const imageBox = image?.getBoundingClientRect();
    return {
      paired: root?.getAttribute("data-template-paired-canvas") ?? null,
      note: host.textContent?.slice(0, 180) ?? "",
      leftGap: rootBox && imageBox ? Math.abs(imageBox.left - rootBox.left) : 99,
      widthGap: rootBox && imageBox ? Math.abs(imageBox.width - rootBox.width) : 99,
      ratio: imageBox && imageBox.width ? imageBox.height / imageBox.width : 0,
    };
  });
  expect(saved.paired, saved.note).toBe("9:16");
  expect(saved.leftGap).toBeLessThanOrEqual(1);
  expect(saved.widthGap).toBeLessThanOrEqual(1);
  expect(saved.ratio, "整节已对换成竖画布，图片落在竖框里").toBeGreaterThan(1);
});

test("600 到 767 宽时叙事块限宽 560，作品网格仍用内容宽", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/__large-phone", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}</style>
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script></head><body>
      <section id="hero" style="width:700px"></section>
      <section id="works" style="width:700px"></section>
      <script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { findLaunchTemplateMaster } from '/src/page-builder/template-creation/launchTemplateSet.ts';
      const hero = findLaunchTemplateMaster('page-hero');
      const works = findLaunchTemplateMaster('creation-grid');
      ReactDOM.createRoot(document.getElementById('hero')).render(React.createElement((await import('/src/page-builder/template-definition/DynamicTemplateRenderer.tsx')).default, {
        definition: hero, device: 'mobile', mode: 'editor',
      }));
      ReactDOM.createRoot(document.getElementById('works')).render(React.createElement((await import('/src/page-builder/template-definition/DynamicTemplateRenderer.tsx')).default, {
        definition: works, device: 'mobile', mode: 'editor',
      }));
    </script></body></html>`,
  }));
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.goto("/__large-phone");
  await expect.poll(() => errors.join("\n")).toBe("");
  const heroRoot = page.locator("#hero [data-template-large-phone='true']");
  await expect(heroRoot).toBeVisible();
  const measured = page.locator("#hero [data-template-large-phone-measure='true']").first();
  await expect(measured).toBeVisible();
  const measuredBox = await measured.boundingBox();
  expect(measuredBox?.width ?? 0).toBeLessThanOrEqual(560);
  expect(measuredBox?.width ?? 0).toBeGreaterThan(500);
  const worksBox = await page.locator("#works .hc-dynamic-template").boundingBox();
  expect(worksBox?.width ?? 0).toBeGreaterThan(640);
});

test("浅色文字叠在主图上时，桌面和手机都铺底部中性渐变", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/__text-scrim", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style>
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script></head><body>
      <section id="desktop" style="width:1440px"></section>
      <section id="mobile" style="width:390px"></section>
      <script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { findLaunchTemplateMaster } from '/src/page-builder/template-creation/launchTemplateSet.ts';
      import DynamicTemplateRenderer from '/src/page-builder/template-definition/DynamicTemplateRenderer.tsx';
      const hero = findLaunchTemplateMaster('page-hero');
      ReactDOM.createRoot(document.getElementById('desktop')).render(React.createElement(DynamicTemplateRenderer, {
        definition: hero, device: 'desktop', mode: 'editor',
      }));
      ReactDOM.createRoot(document.getElementById('mobile')).render(React.createElement(DynamicTemplateRenderer, {
        definition: hero, device: 'mobile', mode: 'editor',
      }));
    </script></body></html>`,
  }));
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto("/__text-scrim");
  await expect.poll(() => errors.join("\n")).toBe("");
  const scrim = page.locator("#desktop [data-template-text-scrim='bottom']");
  await expect(scrim).toBeVisible();
  await expect(scrim).toHaveCSS("background-image", /linear-gradient/);
  const background = await scrim.evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(background).toContain("0.6");
  await expect(page.locator("#mobile [data-template-text-scrim='bottom']")).toBeVisible();
});

test("左右图文的图片位置只在桌面镜像横排；手机图在上文在下且不对换画布", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/__media-side", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}</style>
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script></head><body>
      <section id="authored" style="width:1440px"></section>
      <section id="mirrored" style="width:1440px"></section>
      <section id="mobile" style="width:390px"></section>
      <script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { findLaunchTemplateMaster } from '/src/page-builder/template-creation/launchTemplateSet.ts';
      import DynamicTemplateRenderer from '/src/page-builder/template-definition/DynamicTemplateRenderer.tsx';
      const split = findLaunchTemplateMaster('editorial-split');
      const mount = (id, device, pageSettings) => ReactDOM.createRoot(document.getElementById(id)).render(
        React.createElement(DynamicTemplateRenderer, { definition: split, device, mode: 'editor', pageSettings }),
      );
      mount('authored', 'desktop', undefined);
      mount('mirrored', 'desktop', { mediaSide: 'end' });
      mount('mobile', 'mobile', { mediaSide: 'end' });
    </script></body></html>`,
  }));
  await page.setViewportSize({ width: 1500, height: 1200 });
  await page.goto("/__media-side");
  await expect.poll(() => errors.join("\n")).toBe("");

  const columnsOf = (host: string) => page.locator(`#${host}`).evaluate((root) => {
    const box = (suffix: string) => root.querySelector(`[data-template-node-id$='_node_${suffix}']`)?.getBoundingClientRect();
    const media = box("media");
    const text = box("text");
    return media && text ? { mediaX: media.x, mediaBottom: media.bottom, textX: text.x, textTop: text.top } : null;
  });

  await expect(page.locator("#authored [data-template-mirrored='true']")).toHaveCount(0);
  const authored = await columnsOf("authored");
  expect(authored).not.toBeNull();
  expect(authored!.mediaX).toBeLessThan(authored!.textX);

  const mirroredRow = page.locator("#mirrored [data-template-mirrored='true']");
  await expect(mirroredRow).toHaveCount(1);
  await expect(mirroredRow).toHaveCSS("flex-direction", "row-reverse");
  const mirrored = await columnsOf("mirrored");
  expect(mirrored!.mediaX).toBeGreaterThan(mirrored!.textX);

  await expect(page.locator("#mobile [data-template-mirrored='true']")).toHaveCount(0);
  const mobileRoot = page.locator("#mobile .hc-dynamic-template");
  await expect(mobileRoot).toHaveAttribute("data-template-paired-canvas", "2:3");
  const mobile = await columnsOf("mobile");
  expect(mobile!.mediaBottom).toBeLessThanOrEqual(mobile!.textTop + 1);
  const detailBoxes = await page.locator("#mobile [data-template-semantic-role='secondaryImage']").evaluateAll(
    (nodes) => nodes.map((node) => node.getBoundingClientRect().top),
  );
  expect(detailBoxes).toHaveLength(2);
  expect(Math.abs(detailBoxes[0] - detailBoxes[1])).toBeLessThanOrEqual(1);
  const heroBox = await page.locator("#mobile [data-template-semantic-role='heroImage']").boundingBox();
  expect(heroBox).not.toBeNull();
  expect(heroBox!.width / heroBox!.height, "自动 4:5 改回桌面 3:2，文字仍在图下").toBeCloseTo(3 / 2, 1);
  await page.locator("#mobile .hc-dynamic-template").screenshot({ path: testInfo.outputPath("split-mobile-plate.png") });
});

test("新几何在指定视口里，没有手机图的首屏按桌面反比例显示", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/__hero-frame-viewports", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><style>
      :root { --site-header-height: 88px; }
      *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
      section[data-case]{width:100%}
    </style>
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script></head><body><main id="fixture"></main><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { findLaunchTemplateMaster } from '/src/page-builder/template-creation/launchTemplateSet.ts';
      import DynamicTemplateRenderer from '/src/page-builder/template-definition/DynamicTemplateRenderer.tsx';
      const roles = ['page-hero', 'later-page-hero', 'creation-grid', 'service-invitation', 'editorial-split'];
      const root = ReactDOM.createRoot(document.getElementById('fixture'));
      window.renderCases = (device) => {
        root.render(React.createElement(React.Fragment, null, roles.map((role) =>
          React.createElement('section', { key: role + device, 'data-case': role },
            React.createElement(DynamicTemplateRenderer, {
              definition: findLaunchTemplateMaster(role === 'later-page-hero' ? 'page-hero' : role),
              device,
              mode: 'editor',
              pageHeroPlacement: role === 'page-hero' ? 'primary' : 'subsequent',
            }),
          ),
        )));
      };
    </script></body></html>`,
  }));

  const read = () => page.locator("#fixture").evaluate(() => {
    const measure = (role: string) => {
      const host = document.querySelector(`[data-case="${role}"]`);
      const section = host?.querySelector(".hc-dynamic-template");
      const image = host?.querySelector("[data-template-semantic-role='backgroundImage'], [data-template-semantic-role='heroImage']");
      const byText = (snippet: string) => [...(host?.querySelectorAll("[data-template-slot-id]") ?? [])]
        .filter((node) => node.textContent?.includes(snippet))
        .sort((left, right) => left.getBoundingClientRect().height - right.getBoundingClientRect().height)[0];
      const title = byText("页面主标题") ?? byText("主标题");
      const action = byText("主行动");
      const rect = (node: Element | null | undefined) => {
        const box = node?.getBoundingClientRect();
        return box && box.width > 0 ? { width: box.width, height: box.height, top: box.top, bottom: box.bottom } : null;
      };
      const slots = [...(host?.querySelectorAll("[data-template-node-type='ImageSlot']") ?? [])]
        .map((node) => node.getBoundingClientRect())
        .filter((box) => box.width > 20 && box.height > 20);
      const sectionBox = rect(section);
      const imageBox = rect(image);
      const titleBox = rect(title);
      const actionBox = rect(action);
      const inside = (box: { top: number; bottom: number } | null) => Boolean(
        sectionBox && box && box.top >= sectionBox.top - 1 && box.bottom <= sectionBox.bottom + 1 && box.bottom - box.top > 8,
      );
      return {
        paired: section?.getAttribute("data-template-paired-canvas") ?? null,
        copy: section?.getAttribute("data-template-hero-copy") ?? null,
        cap: section?.getAttribute("data-template-hero-viewport-cap") ?? null,
        section: sectionBox,
        heightMode: section?.getAttribute("data-template-root-height-mode") ?? null,
        image: imageBox,
        imageRatio: imageBox && imageBox.width ? imageBox.height / imageBox.width : 0,
        titleInside: inside(titleBox),
        titleBelowImage: Boolean(imageBox && titleBox && titleBox.top >= imageBox.bottom - 1),
        actionInside: actionBox ? inside(actionBox) : true,
        imageCount: slots.length,
        rowCount: new Set(slots.map((box) => Math.round(box.top / 8))).size,
        cardRatio: slots[0] ? slots[0].height / slots[0].width : 0,
        cardsInside: slots.every((box) => inside(box)),
      };
    };
    return {
      hero: measure("page-hero"),
      laterHero: measure("later-page-hero"),
      grid: measure("creation-grid"),
      invitation: measure("service-invitation"),
      split: measure("editorial-split"),
    };
  });

  await page.goto("/__hero-frame-viewports");
  await expect.poll(() => errors.join("\n")).toBe("");
  await page.waitForFunction(() => typeof (window as unknown as { renderCases?: unknown }).renderCases === "function");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (window as unknown as { renderCases: (device: string) => void }).renderCases("mobile"));
  await expect.poll(async () => {
    const ratio = (await read()).hero.imageRatio;
    return ratio > 1.5;
  }).toBe(true);
  const phone = await read();
  expect(phone.hero.paired).toBe("9:16");
  expect(phone.hero.imageRatio, "桌面 16:9 的首屏在手机上对换成 9:16").toBeCloseTo(16 / 9, 1);
  expect(phone.hero.copy === "below" || phone.hero.copy === null).toBe(true);
  expect(phone.hero.titleInside, "标题留在首屏里，装不下时排到横图下面").toBe(true);
  expect(phone.hero.actionInside).toBe(true);
  expect(phone.laterHero.paired).toBeNull();
  expect(phone.laterHero.imageRatio).toBeCloseTo(9 / 16, 1);
  expect(phone.laterHero.cap).toBeNull();
  expect(phone.grid.paired).toBe("5:4");
  expect(phone.grid.imageCount).toBe(4);
  expect(phone.grid.rowCount).toBe(2);
  expect(phone.grid.cardRatio).toBeGreaterThan(1.15);
  expect(phone.grid.cardRatio).toBeLessThan(1.35);
  expect(phone.grid.heightMode, "作品网格随内容增高，4:5 约束单卡").toBe("auto");
  expect(phone.grid.cardsInside).toBe(true);
  expect(phone.invitation.paired).toBe("9:16");
  expect(phone.split.paired).toBe("2:3");
  expect(phone.invitation.section && phone.split.section).toBeTruthy();

  const fixture = page.locator("#fixture");
  await fixture.evaluate((el) => el.style.setProperty("--homepage-editor-preview-height", "844px"));
  await page.setViewportSize({ width: 390, height: 450 });
  await fixture.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const simulated = await read();
  expect(simulated.hero.cap).toBe(phone.hero.cap);
  expect(simulated.hero.copy).toBe(phone.hero.copy);
  expect(simulated.hero.image?.height).toBeCloseTo(phone.hero.image!.height, 1);
  await fixture.evaluate((el) => el.style.removeProperty("--homepage-editor-preview-height"));

  await page.setViewportSize({ width: 320, height: 568 });
  await expect.poll(async () => (await read()).hero.cap).toBe("true");
  const short = await read();
  expect(short.hero.copy).toBe("below");
  expect(short.hero.image && short.hero.image.height).toBeLessThanOrEqual(568 - 88 + 2);
  expect(short.hero.titleBelowImage, "320×568 的标题落到图片下方且不被裁掉").toBe(true);
  expect(short.hero.titleInside).toBe(true);
  expect(short.hero.actionInside).toBe(true);

  await page.setViewportSize({ width: 767, height: 900 });
  await expect.poll(async () => (await read()).hero.cap).toBe("true");
  const narrow = await read();
  expect(narrow.hero.paired).toBe("9:16");
  expect(narrow.hero.copy).toBe("below");
  expect(narrow.hero.image && narrow.hero.image.height).toBeLessThanOrEqual(900 - 88 + 2);
  expect(narrow.hero.titleBelowImage).toBe(true);
  expect(narrow.hero.titleInside).toBe(true);

  await page.setViewportSize({ width: 768, height: 900 });
  await page.evaluate(() => (window as unknown as { renderCases: (device: string) => void }).renderCases("desktop"));
  await expect.poll(async () => (await read()).hero.imageRatio).toBeGreaterThan(0.7);
  const desktop = await read();
  expect(desktop.hero.imageRatio).toBeLessThan(0.8);
  expect(desktop.hero.paired).toBeNull();
  expect(desktop.hero.titleInside).toBe(true);
  expect(desktop.grid.paired).toBeNull();
  expect(desktop.invitation.paired).toBeNull();
  expect(desktop.split.paired).toBeNull();
  const split = page.locator('[data-case="editorial-split"] .hc-dynamic-template');
  await expect(split).toHaveAttribute("data-template-narrow-split", "true");
  const readings = await split.locator("[data-template-node-type='HeadingSlot']").first().evaluate(async (heading) => {
    const frames: string[] = [];
    for (let index = 0; index < 24; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const { width, top } = heading.getBoundingClientRect();
      frames.push(`${Math.round(width)}:${Math.round(top)}`);
    }
    return frames;
  });
  expect(new Set(readings).size).toBe(1);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => (window as unknown as { renderCases: (device: string) => void }).renderCases("desktop"));
  await expect.poll(async () => (await read()).hero.copy).toBe("below");
  const landscape = await read();
  expect(landscape.hero.paired).toBeNull();
  expect(landscape.hero.titleBelowImage, "横屏矮视口的标题落到图片下方").toBe(true);
  expect(landscape.hero.titleInside).toBe(true);
  expect(landscape.grid.paired).toBeNull();
  expect(landscape.invitation.paired).toBeNull();
  expect(landscape.split.paired).toBeNull();

  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(async () => (await read()).hero.copy).toBeNull();
  const wide = await read();
  expect(wide.hero.imageRatio).toBeGreaterThan(0.5);
  expect(wide.hero.imageRatio).toBeLessThan(0.62);
  expect(wide.hero.titleInside).toBe(true);
  expect(wide.grid.imageCount).toBe(4);
  expect(wide.grid.rowCount).toBe(1);
  await expect(split).not.toHaveAttribute("data-template-narrow-split", "true");
});

test("首页首屏旧画布与新画框在指定视口分开成立", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => route.abort());
  await page.route("https://example.com/*.jpg", (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#263c42"/></svg>',
  }));
  await page.route("**/__hero-home-proof", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><style>
      :root { --site-header-height: 88px; }
      *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
      #fixture{width:100%}
    </style>
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script></head><body><main id="fixture"></main><section data-fixture-next-section>下一节</section><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { findLaunchTemplateMaster } from '/src/page-builder/template-creation/launchTemplateSet.ts';
      import DynamicTemplateRenderer from '/src/page-builder/template-definition/DynamicTemplateRenderer.tsx';
      const root = ReactDOM.createRoot(document.getElementById('fixture'));
      const titleId = 'tpl_launch_page_hero_slot_title';
      const subtitleId = 'tpl_launch_page_hero_slot_subtitle';
      const imageId = 'tpl_launch_page_hero_slot_heroBackground';
      const actionId = 'tpl_launch_page_hero_slot_primaryAction';
      const titleNodeId = 'tpl_launch_page_hero_node_title';
      window.renderHero = (options) => {
        const master = findLaunchTemplateMaster('page-hero');
        const definition = structuredClone(master);
        if (options.geometry === 'old') delete definition.metadata.geometryPolicy;
        if (options.ink) {
          definition.slots[titleId].desktopRules.color = options.ink;
          definition.slots[titleId].mobileRules.color = options.ink;
        }
        const content = {
          [imageId]: {
            src: 'https://example.com/desk.jpg',
            alt: '首屏',
            ...(options.mobileSrc ? { mobileSrc: options.mobileSrc } : {}),
          },
          [titleId]: options.title || '吊坠',
          [subtitleId]: options.subtitle || '一句说明',
        };
        if (options.action) {
          content[actionId] = { label: '查看作品', targetType: 'page', pagePath: '/products' };
        }
        root.render(React.createElement(DynamicTemplateRenderer, {
          definition,
          device: options.device,
          mode: options.mode,
          pageHeroPlacement: 'primary',
          contentBySlotId: content,
          imageCarriesCopy: options.imageCarriesCopy === true,
          layoutOverridesByNodeId: options.collapse
            ? { [titleNodeId]: { [options.device]: { visuallyCollapsed: true } } }
            : undefined,
        }));
      };
    </script></body></html>`,
  }));

  const read = () => page.locator("#fixture").evaluate(() => {
    const host = document.querySelector(".hc-dynamic-template");
    const image = host?.querySelector("img");
    const imageBox = image?.getBoundingClientRect();
    const hostBox = host?.getBoundingClientRect();
    const copyBox = host?.querySelector("[data-template-hero-frame-copy]")?.getBoundingClientRect();
    const nextSection = document.querySelector("[data-fixture-next-section]")?.getBoundingClientRect();
    const title = host?.querySelector("[data-template-node-type='HeadingSlot']");
    const titleInk = title?.querySelector("h1, h2") ?? title;
    const button = host?.querySelector("[data-template-node-type='ButtonSlot'] span");
    const links = [...(host?.querySelectorAll("a") ?? [])].map((node) => ({
      href: node.getAttribute("href"),
      nested: node.querySelectorAll("a").length,
    }));
    const color = (node: Element | null | undefined) => node ? getComputedStyle(node).color : null;
    const fit = image ? getComputedStyle(image).objectFit : null;
    return {
      paired: host?.getAttribute("data-template-paired-canvas") ?? null,
      copy: host?.getAttribute("data-template-hero-copy") ?? null,
      source: image?.getAttribute("data-template-image-source") ?? null,
      src: image?.getAttribute("src") ?? "",
      fit,
      poster: image?.closest("[data-template-poster-fit]")?.getAttribute("data-template-poster-fit")
        ?? host?.querySelector("[data-template-poster-fit]")?.getAttribute("data-template-poster-fit")
        ?? null,
      mobileAsset: host?.querySelector("[data-template-mobile-asset]")?.getAttribute("data-template-mobile-asset") ?? null,
      imageWidth: imageBox?.width ?? 0,
      imageHeight: imageBox?.height ?? 0,
      sectionHeight: hostBox?.height ?? 0,
      copyHeight: copyBox?.height ?? 0,
      copyInsideFlow: Boolean(copyBox && nextSection && copyBox.bottom <= nextSection.top + 1),
      spillBackground: host ? getComputedStyle(host, "::before").backgroundColor : null,
      titleText: title?.textContent ?? "",
      titleColor: color(titleInk),
      titleContrast: titleInk?.getAttribute("data-template-text-contrast") ?? null,
      titleCollapsed: title?.getAttribute("data-template-visual-collapse") ?? null,
      titleHidden: title?.getAttribute("aria-hidden") ?? null,
      titleHeight: title?.getBoundingClientRect().height ?? 0,
      buttonColor: color(button),
      links,
      pairedNote: host?.querySelector("[data-template-paired-image-note]")?.textContent ?? null,
      correctedNote: host?.querySelector("[data-template-text-contrast-note='corrected']")?.textContent ?? null,
      lowNote: host?.querySelector("[data-template-text-contrast-note='low']")?.textContent ?? null,
    };
  });

  const show = async (options: Record<string, unknown>) => {
    await page.evaluate((value) => (
      window as unknown as { renderHero: (options: Record<string, unknown>) => void }
    ).renderHero(value), options);
    await expect.poll(async () => (await read()).sectionHeight).toBeGreaterThan(40);
  };

  await page.goto("/__hero-home-proof");
  await expect.poll(() => errors.join("\n")).toBe("");
  await page.waitForFunction(() => typeof (window as unknown as { renderHero?: unknown }).renderHero === "function");

  const longCopy = "这是一段用来检查文字增长的说明。".repeat(12);
  await page.setViewportSize({ width: 390, height: 844 });
  await show({ geometry: "new", device: "mobile", mode: "preview", title: "吊坠", subtitle: "一句说明" });
  const freshPhone = await read();
  expect(freshPhone.paired).toBe("9:16");
  expect(freshPhone.source).toBe("desktop");
  expect(freshPhone.mobileAsset).toBe("desktop-only");
  expect(freshPhone.fit).toBe("cover");
  expect(freshPhone.poster).toBeNull();
  expect(freshPhone.links).toHaveLength(0);
  expect(freshPhone.imageWidth / freshPhone.imageHeight, "桌面 16:9 的首屏在手机上对换成 9:16").toBeCloseTo(9 / 16, 1);
  expect(freshPhone.imageHeight).toBeGreaterThan(freshPhone.sectionHeight * 0.25);

  await show({ geometry: "new", device: "mobile", mode: "preview", title: longCopy, subtitle: longCopy });
  await expect.poll(async () => {
    const current = await read();
    return Math.abs(current.imageHeight - freshPhone.imageHeight);
  }).toBeLessThan(8);
  const longPhone = await read();
  expect(longPhone.sectionHeight).toBeGreaterThanOrEqual(freshPhone.sectionHeight - 1);
  expect(longPhone.pairedNote).toBeNull();

  await show({ geometry: "old", device: "mobile", mode: "editor", title: "吊坠", subtitle: "一句说明" });
  const oldShort = await read();
  expect(oldShort.paired).toBe("9:16");
  expect(oldShort.imageWidth / oldShort.imageHeight, "旧首屏按桌面 16:9 对换成 9:16").toBeCloseTo(9 / 16, 1);
  for (const mode of ["editor", "preview", "public"]) {
    await show({ geometry: "old", device: "mobile", mode, title: longCopy, subtitle: longCopy });
    await expect.poll(async () => (await read()).copyInsideFlow).toBe(true);
    const oldLong = await read();
    expect(oldLong.paired).toBe("9:16");
    expect(Math.abs(oldLong.imageHeight - oldShort.imageHeight)).toBeLessThan(8);
    expect(oldLong.sectionHeight).toBeCloseTo(oldShort.sectionHeight, 0);
    expect(oldLong.copyHeight).toBeGreaterThan(oldLong.imageHeight);
    expect(oldLong.titleText).toContain(longCopy);
    expect(oldLong.spillBackground).toBe("rgb(24, 26, 27)");
    const overflow = page.locator("[data-template-fixed-canvas-note]");
    if (mode === "editor") {
      await expect(overflow).toContainText("超出画框");
      await page.locator("body").screenshot({ path: testInfo.outputPath("legacy-hero-mobile-long-copy.png") });
    } else await expect(overflow).toHaveCount(0);
  }

  await show({
    geometry: "new",
    device: "mobile",
    mode: "public",
    imageCarriesCopy: true,
    title: "画面里的标题",
    subtitle: "画面里的说明",
  });
  const poster = await read();
  expect(poster.fit).toBe("contain");
  expect(poster.poster).toBe("contain");
  expect(poster.imageWidth / poster.imageHeight, "带字横图完整放入对换后的竖框").toBeCloseTo(9 / 16, 1);
  expect(poster.source).toBe("desktop");
  expect(poster.titleText).toContain("画面里的标题");
  expect(poster.titleHeight).toBeLessThan(8);
  expect(poster.links).toHaveLength(0);

  await show({
    geometry: "new",
    device: "mobile",
    mode: "preview",
    mobileSrc: "https://example.com/phone.jpg",
    action: true,
    title: "吊坠",
  });
  const linked = await read();
  expect(linked.source).toBe("mobile");
  expect(linked.src).toContain("phone.jpg");
  expect(linked.fit).toBe("cover");
  expect(linked.imageHeight, "有手机图时仍用竖向外框").toBeGreaterThan(linked.imageWidth);
  expect(linked.links).toEqual([{ href: "/products", nested: 0 }]);

  await show({
    geometry: "new",
    device: "mobile",
    mode: "preview",
    imageCarriesCopy: true,
    mobileSrc: "https://example.com/phone.jpg",
    action: true,
    title: "画面标题",
  });
  const artworkLink = await read();
  expect(artworkLink.fit).toBe("contain");
  expect(artworkLink.links).toEqual([{ href: "/products", nested: 0 }]);
  expect(artworkLink.titleHeight).toBeLessThan(8);

  await show({ geometry: "new", device: "desktop", mode: "public", imageCarriesCopy: true, title: "画面标题" });
  expect((await read()).fit).toBe("contain");

  await show({
    geometry: "new",
    device: "mobile",
    mode: "preview",
    collapse: true,
    title: "收起的标题",
    subtitle: "仍在的说明",
  });
  const collapsed = await read();
  expect(collapsed.titleCollapsed).toBe("true");
  expect(collapsed.titleHidden).toBeNull();
  expect(collapsed.titleText).toContain("收起的标题");
  expect(collapsed.titleHeight).toBeLessThan(8);

  await page.setViewportSize({ width: 1440, height: 900 });
  await show({ geometry: "new", device: "desktop", mode: "editor", ink: "#181A1B", title: "深色底标题", action: true });
  const corrected = await read();
  expect(corrected.paired).toBeNull();
  expect(corrected.titleColor).toBe("rgb(247, 248, 248)");
  expect(corrected.titleContrast).toBe("corrected");
  expect(corrected.buttonColor).toBe("rgb(24, 26, 27)");
  expect(corrected.correctedNote).toContain("品牌墨色");
  expect(corrected.links).toHaveLength(0);

  await show({ geometry: "new", device: "desktop", mode: "editor", ink: "#333333", title: "另选的深色" });
  const low = await read();
  expect(low.titleColor).toBe("rgb(51, 51, 51)");
  expect(low.titleContrast).toBe("low");
  expect(low.lowNote).toContain("对比不够");

  await page.setViewportSize({ width: 768, height: 1024 });
  await show({ geometry: "new", device: "desktop", mode: "public", mobileSrc: "https://example.com/phone.jpg", title: "桌面内容" });
  const tablet = await read();
  expect(tablet.paired).toBeNull();
  expect(tablet.source).toBe("desktop");
  expect(tablet.fit).toBe("cover");

  await page.setViewportSize({ width: 834, height: 1194 });
  await show({ geometry: "new", device: "desktop", mode: "public", title: "平板竖屏" });
  const portraitTablet = await read();
  expect(portraitTablet.paired).toBeNull();
  expect(portraitTablet.source).toBe("desktop");

  await page.setViewportSize({ width: 844, height: 390 });
  await show({ geometry: "new", device: "desktop", mode: "preview", title: longCopy, subtitle: longCopy });
  const landscape = await read();
  expect(landscape.paired).toBeNull();
  expect(landscape.copy).toBe("below");
  const landscapeImage = landscape.imageHeight;
  await show({ geometry: "new", device: "desktop", mode: "preview", title: "短", subtitle: "短" });
  const landscapeShort = await read();
  expect(Math.abs(landscapeShort.imageHeight - landscapeImage)).toBeLessThan(8);

  await page.setViewportSize({ width: 390, height: 844 });
  await show({ geometry: "old", device: "mobile", mode: "public", title: "旧定义", subtitle: "保持整节画布" });
  const oldPublic = await read();
  expect(oldPublic.paired).toBe("9:16");
  expect(oldPublic.imageWidth / oldPublic.imageHeight).toBeCloseTo(9 / 16, 1);
  expect(oldPublic.correctedNote).toBeNull();
  expect(oldPublic.spillBackground).toBe("rgba(0, 0, 0, 0)");
  expect(oldPublic.pairedNote).toBeNull();

  const shot = (name: string) => page.screenshot({
    path: `G:/海川珠宝官方网站开发/.codex-tmp/hero-home-proof/${name}.png`,
  });
  await shot("old-390x844-public");
  await show({ geometry: "old", device: "mobile", mode: "editor", title: longCopy, subtitle: longCopy });
  await shot("old-390x844-long");
  await show({ geometry: "new", device: "mobile", mode: "preview", title: "吊坠", subtitle: "一句说明" });
  await shot("new-390x844-short");
  await show({ geometry: "new", device: "mobile", mode: "preview", title: longCopy, subtitle: longCopy });
  await expect.poll(async () => Math.abs((await read()).imageHeight - freshPhone.imageHeight)).toBeLessThan(8);
  await shot("new-390x844-long");
  await show({ geometry: "new", device: "mobile", mode: "public", imageCarriesCopy: true, title: "画面里的标题" });
  await shot("new-390x844-poster-no-mobile");
  await show({
    geometry: "new",
    device: "mobile",
    mode: "preview",
    mobileSrc: "https://example.com/phone.jpg",
    action: true,
    title: "吊坠",
  });
  await shot("new-390x844-mobile-and-action");
  await page.setViewportSize({ width: 768, height: 1024 });
  await show({ geometry: "new", device: "desktop", mode: "public", mobileSrc: "https://example.com/phone.jpg", title: "桌面内容" });
  await shot("new-768x1024");
  await page.setViewportSize({ width: 834, height: 1194 });
  await show({ geometry: "new", device: "desktop", mode: "public", title: "平板竖屏" });
  await shot("new-834x1194");
  await page.setViewportSize({ width: 844, height: 390 });
  await show({ geometry: "new", device: "desktop", mode: "preview", title: longCopy, subtitle: longCopy });
  await shot("new-844x390-long");
  await page.setViewportSize({ width: 1440, height: 900 });
  await show({ geometry: "new", device: "desktop", mode: "editor", ink: "#181A1B", title: "深色底标题", action: true });
  await shot("new-1440x900-contrast");
});
