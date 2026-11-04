import { expect, test } from "@playwright/test";
import {
  createBlankDynamicTemplateDefinition,
  createDynamicTemplateNode,
  createDynamicTemplateSlotDefinition,
} from "../src/page-builder/template-definition/nodeRegistry";
import {
  getTemplateNodeRuleSource,
  resetTemplateNodeRule,
  resetTemplateSlotRule,
  resolveTemplateBreakpoint,
  resolveTemplateDefinitionForBreakpoint,
  resolveTemplateNodeRules,
  resolveTemplateSlotRules,
  setTemplateNodeRule,
  setTemplateSlotRule,
} from "../src/page-builder/template-definition/responsive";
import { getDynamicTemplateStructureLockViolation, validateDynamicTemplateDefinition, validateDynamicTemplatePublishDefinition } from "../src/page-builder/template-definition/validateTemplateDefinition";
import { compileDynamicTemplateRenderPlan } from "../src/page-builder/template-definition/renderPlan";
import { applyStandardTemplateCanvasPair, formatExactTemplateRatio, normalizeTemplateDimensionContract, resolvePairedMobileCanvas, resolveTemplateDesignFrame, STANDARD_TEMPLATE_CANVAS_PAIRS } from "../src/page-builder/template-definition/templateDimensions";
import type { TemplateDefinitionV2 } from "../src/page-builder/template-definition/generated/templateDefinition.generated";
import { addDynamicTemplateNode, DynamicTemplateOperationError, moveDynamicTemplateNode } from "../src/page-builder/template-definition/operations";

function fixture() {
  const definition = createBlankDynamicTemplateDefinition("响应式合同测试");
  const region = createDynamicTemplateNode("Container", "内容区域");
  const slot = createDynamicTemplateSlotDefinition("image", "作品图片", "artworkImage");
  const image = createDynamicTemplateNode("ImageSlot", "图片", slot.slotId);
  region.responsive.mobile = {};
  image.responsive.mobile = {};
  slot.mobileRules = {};
  definition.nodes[definition.rootNodeId].childIds = [region.nodeId];
  region.childIds = [image.nodeId];
  definition.nodes[region.nodeId] = region;
  definition.nodes[image.nodeId] = image;
  definition.slots[slot.slotId] = slot;
  return { definition, regionId: region.nodeId, imageId: image.nodeId, slotId: slot.slotId };
}

function legacyFixture(): TemplateDefinitionV2 {
  const { definition } = fixture();
  definition.schemaVersion = 1;
  delete definition.metadata.previewTabletWidth;
  definition.metadata.mobileBreakpoint = 900;
  for (const node of Object.values(definition.nodes)) node.responsive.mobile = structuredClone(node.responsive.desktop);
  for (const slot of Object.values(definition.slots)) slot.mobileRules = { aspectRatio: "4:5" };
  return definition;
}

test.describe("显式标准双端固定画幅", () => {
  test("正常中文标题的2px字形外延不误报，真实文字溢出和几何越界仍告警", async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 900 });
    await page.route("**/api/**", (route) => route.abort());
    await page.route("**/__canvas-linebox", (route) => route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><head><style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}</style><script type="module">
        import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;
      </script></head><body></body></html>`,
    }));
    await page.goto("/__canvas-linebox");
    const typography = await page.evaluate(async () => {
      // 字形外延受平台字体影响；选出本机确实出现2px外延的正常单行中文，不伪造DOM尺寸。
      const probe = document.createElement("h2");
      probe.textContent = "预约鉴赏";
      probe.style.cssText = 'font-family:"Noto Serif SC","Source Han Serif CN",serif;font-weight:400;width:390px;';
      document.body.append(probe);
      let match: { fontSize: number; lineHeight: number } | undefined;
      for (const fontSize of [48, 40, 32, 24]) {
        for (let lineHeight = fontSize; lineHeight <= fontSize * 1.4; lineHeight++) {
          probe.style.fontSize = `${fontSize}px`; probe.style.lineHeight = `${lineHeight}px`;
          if (probe.scrollHeight - probe.clientHeight === 2) { match = { fontSize, lineHeight }; break; }
        }
        if (match) break;
      }
      probe.remove();
      if (!match) throw new Error("当前字体未形成回归所需的2px中文单行字形外延。");
      const paths = ["/node_modules/.vite/deps/react.js", "/node_modules/.vite/deps/react-dom_client.js", "/src/page-builder/template-definition/nodeRegistry.ts", "/src/page-builder/template-definition/templateDimensions.ts", "/src/page-builder/template-definition/DynamicTemplateRenderer.tsx"];
      const [react, dom, registry, dimensions, renderer] = await Promise.all(paths.map((path) => import(/* @vite-ignore */ path)));
      const scenes = [];
      for (const kind of ["normal", "text-overflow", "geometry-overflow"]) {
        const base = registry.createBlankDynamicTemplateDefinition("中文字形回归"); base.schemaVersion = 3;
        const slot = registry.createDynamicTemplateSlotDefinition("heading", "标题", "title");
        Object.assign(slot.desktopRules, { fontSize: { value: match.fontSize, unit: "px" }, lineHeight: match.lineHeight / match.fontSize, fontFamily: "serif", fontWeight: 400 });
        const title = registry.createDynamicTemplateNode("HeadingSlot", "标题", slot.slotId);
        const group = registry.createDynamicTemplateNode("Container", "标题组");
        group.responsive.mobile = {};
        group.childIds = [title.nodeId];
        title.responsive.mobile = {};
        if (kind === "text-overflow") title.responsive.desktop.height = { mode: "fixed", value: { value: 20, unit: "px" } };
        if (kind === "geometry-overflow") title.responsive.desktop.margin = { top: { value: 700, unit: "px" }, right: { value: 0, unit: "px" }, bottom: { value: 0, unit: "px" }, left: { value: 0, unit: "px" } };
        base.nodes[base.rootNodeId].childIds = [group.nodeId]; base.nodes[group.nodeId] = group; base.nodes[title.nodeId] = title;
        base.slots[slot.slotId] = slot; base.defaultContent[slot.slotId] = "预约鉴赏";
        scenes.push(react.default.createElement("section", { key: kind, "data-linebox-case": kind, style: { width:390, marginBottom:80 } }, react.default.createElement(renderer.default, { definition: dimensions.applyStandardTemplateCanvasPair(base, { width:16, height:9 }), device:"mobile", mode:"editor", showEmptySlots:true })));
      }
      dom.default.createRoot(document.body.appendChild(document.createElement("main"))).render(react.default.createElement(react.default.Fragment, null, ...scenes));
      return match;
    });
    expect(typography.fontSize).toBeGreaterThan(0);
    const normal = page.locator('[data-linebox-case="normal"]');
    await expect(normal.getByRole("heading", { name: "预约鉴赏" })).toBeVisible();
    expect(await normal.locator('[data-template-node-type="HeadingSlot"]').evaluate((node) => node.scrollHeight - node.clientHeight)).toBe(2);
    await expect(normal.locator('[data-template-fixed-canvas-overflow="true"]')).toHaveCount(0);
    await expect(normal.locator('[data-template-fixed-canvas-note]')).toHaveCount(0);
    for (const kind of ["text-overflow", "geometry-overflow"]) {
      await expect(page.locator(`[data-linebox-case="${kind}"] [data-template-fixed-canvas-note]`)).toBeVisible();
    }
  });

  test("显式自定义比例保持精确，不显示为邻近标准比例", () => {
    const { definition } = fixture();
    definition.metadata.geometryPolicy = "paired-canvas";
    definition.nodes[definition.rootNodeId].responsive.desktop.height = { mode: "aspect-ratio", ratio: { width: 55, height: 34 } };
    definition.nodes[definition.rootNodeId].responsive.mobile.height = { mode: "auto" };
    expect(resolveTemplateDesignFrame(definition, "desktop").ratioLabel).toBe("55:34");
    expect(resolveTemplateDesignFrame(definition, "mobile").ratioLabel).toBe("34:55");
    expect(formatExactTemplateRatio(32, 18)).toBe("16:9");
    expect(formatExactTemplateRatio(1.6, .9)).toBe("16:9");
  });
  test("标准画幅只在明确应用时修改根和策略，保留内容及其他手机覆盖", () => {
    const { definition, regionId } = fixture();
    definition.nodes[definition.rootNodeId].responsive.mobile = { height: { mode: "fixed", value: { value: 200, unit: "px" } }, hidden: false };
    definition.defaultContent = { saved: "保留内容" };
    const before = structuredClone(definition);
    for (const pair of STANDARD_TEMPLATE_CANVAS_PAIRS) {
      const next = applyStandardTemplateCanvasPair(definition, pair.desktop);
      expect(next.metadata.geometryPolicy).toBe("paired-canvas");
      expect(next.nodes[next.rootNodeId].responsive.desktop.height).toEqual({ mode: "aspect-ratio", ratio: pair.desktop });
      expect(next.nodes[next.rootNodeId].responsive.mobile).toEqual({ height: { mode: "auto" }, hidden: false });
      expect(next.nodes[regionId]).toEqual(before.nodes[regionId]);
      expect(next.defaultContent).toEqual(before.defaultContent);
      expect(resolvePairedMobileCanvas(next)).toEqual(pair.mobile);
      expect(resolveTemplateDesignFrame(next, "desktop").fallbackHeight).toBeCloseTo(1440 * pair.desktop.height / pair.desktop.width, 7);
      expect(resolveTemplateDesignFrame(next, "mobile").fallbackHeight).toBeCloseTo(390 * pair.mobile.height / pair.mobile.width, 7);
    }
    expect(definition).toEqual(before);
    expect(() => applyStandardTemplateCanvasPair(definition, { width: 10, height: 7 })).toThrow("标准双端画幅");
    definition.nodes[definition.rootNodeId].responsive.desktop.minHeight = { value: 900, unit: "px" };
    expect(() => applyStandardTemplateCanvasPair(definition, { width: 16, height: 9 })).toThrow("先取消模板根节点桌面端的最小高度");
    expect(definition.nodes[definition.rootNodeId].responsive.desktop.minHeight).toEqual({ value: 900, unit: "px" });
  });

  test("四格留白兼容只适用历史缺省，显式对换和手机独立比例按作者选择执行", () => {
    const { definition } = fixture();
    definition.metadata.sectionRole = "creation-grid";
    for (let index = 0; index < 3; index++) {
      const slot = createDynamicTemplateSlotDefinition("image", "作品", `work${index}`);
      definition.slots[slot.slotId] = slot;
    }
    definition.nodes[definition.rootNodeId].responsive.desktop.height = { mode: "aspect-ratio", ratio: { width: 16, height: 9 } };
    definition.nodes[definition.rootNodeId].responsive.mobile.height = { mode: "auto" };
    expect(resolvePairedMobileCanvas(definition)).toEqual({ width: 9, height: 16 });
    const next = applyStandardTemplateCanvasPair(definition, { width: 16, height: 9 });
    expect(resolvePairedMobileCanvas(next)).toEqual({ width: 9, height: 16 });
    next.nodes[next.rootNodeId].responsive.mobile.height = { mode: "aspect-ratio", ratio: { width: 4, height: 5 } };
    expect(resolvePairedMobileCanvas(next)).toBeNull();
    const media = structuredClone(definition);
    media.metadata.geometryPolicy = "hero-media-frame";
    expect(resolvePairedMobileCanvas(media)).toEqual({ width: 9, height: 16 });
    expect(definition.metadata.geometryPolicy).toBeUndefined();
  });

  test("整节换比例时，原先同一对画幅的舞台和铺满图片一起改，作品卡和 Logo 不变", () => {
    const { definition, regionId } = fixture();
    const stage = createDynamicTemplateNode("Stack", "主舞台");
    stage.responsive.desktop.height = { mode: "aspect-ratio", ratio: { width: 16, height: 9 } };
    stage.responsive.desktop.minHeight = { value: 560, unit: "px" };
    stage.responsive.desktop.backgroundColor = "#111315";
    stage.responsive.mobile.height = { mode: "auto" };
    const background = createDynamicTemplateSlotDefinition("image", "背景图", "heroBackground");
    background.semanticRole = "backgroundImage";
    background.desktopRules.aspectRatio = "16:9";
    background.mobileRules.aspectRatio = "9:16";
    const image = createDynamicTemplateNode("ImageSlot", "背景图", background.slotId);
    image.responsive.desktop.placement = { x: 0, y: 0, width: 1, height: 1, zIndex: 0 };
    image.responsive.mobile.height = { mode: "aspect-ratio", ratio: { width: 16, height: 9 } };
    const logo = createDynamicTemplateSlotDefinition("image", "标志", "logo");
    logo.semanticRole = "logo";
    logo.desktopRules.aspectRatio = "3:1";
    logo.mobileRules.aspectRatio = "3:1";
    const logoNode = createDynamicTemplateNode("ImageSlot", "标志", logo.slotId);
    const work = createDynamicTemplateSlotDefinition("image", "作品图", "work");
    work.desktopRules.aspectRatio = "4:5";
    work.mobileRules.aspectRatio = "4:5";
    const workNode = createDynamicTemplateNode("ImageSlot", "作品图", work.slotId);
    workNode.responsive.mobile.height = { mode: "aspect-ratio", ratio: { width: 4, height: 5 } };
    const percentStage = createDynamicTemplateNode("Stack", "百分比舞台");
    percentStage.responsive.desktop.height = { mode: "fixed", value: { value: 100, unit: "%" } };
    stage.childIds = [image.nodeId, logoNode.nodeId];
    definition.nodes[definition.rootNodeId].childIds = [stage.nodeId, percentStage.nodeId, regionId];
    definition.nodes[stage.nodeId] = stage;
    definition.nodes[percentStage.nodeId] = percentStage;
    definition.nodes[image.nodeId] = image;
    definition.nodes[logoNode.nodeId] = logoNode;
    definition.nodes[workNode.nodeId] = workNode;
    definition.slots[background.slotId] = background;
    definition.slots[logo.slotId] = logo;
    definition.slots[work.slotId] = work;
    definition.defaultContent = { saved: "保留内容" };
    const before = structuredClone(definition);

    const same = applyStandardTemplateCanvasPair(definition, { width: 16, height: 9 });
    expect(same.nodes[stage.nodeId].responsive.desktop.height).toEqual({ mode: "aspect-ratio", ratio: { width: 16, height: 9 } });
    expect(same.slots[background.slotId].desktopRules.aspectRatio).toBe("16:9");
    expect(same.slots[background.slotId].mobileRules.aspectRatio).toBe("9:16");

    const next = applyStandardTemplateCanvasPair(definition, { width: 3, height: 2 });
    expect(next.nodes[stage.nodeId].responsive.desktop.height).toEqual({ mode: "aspect-ratio", ratio: { width: 3, height: 2 } });
    expect(next.nodes[stage.nodeId].responsive.desktop.minHeight).toEqual({ value: 560, unit: "px" });
    expect(next.nodes[stage.nodeId].responsive.desktop.backgroundColor).toBe("#111315");
    expect(next.nodes[stage.nodeId].responsive.mobile.height).toEqual({ mode: "auto" });
    expect(next.slots[background.slotId].desktopRules.aspectRatio).toBe("3:2");
    expect(next.slots[background.slotId].mobileRules.aspectRatio).toBe("2:3");
    expect(next.nodes[image.nodeId].responsive.mobile.height).toEqual({ mode: "aspect-ratio", ratio: { width: 2, height: 3 } });
    expect(next.slots[logo.slotId].desktopRules.aspectRatio).toBe("3:1");
    expect(next.slots[logo.slotId].mobileRules.aspectRatio).toBe("3:1");
    expect(next.slots[work.slotId].desktopRules.aspectRatio).toBe("4:5");
    expect(next.slots[work.slotId].mobileRules.aspectRatio).toBe("4:5");
    expect(next.nodes[workNode.nodeId].responsive.mobile.height).toEqual({ mode: "aspect-ratio", ratio: { width: 4, height: 5 } });
    expect(next.nodes[percentStage.nodeId].responsive.desktop.height).toEqual({ mode: "fixed", value: { value: 100, unit: "%" } });
    expect(next.nodes[regionId]).toEqual(before.nodes[regionId]);
    expect(next.defaultContent).toEqual({ saved: "保留内容" });

    const again = applyStandardTemplateCanvasPair(next, { width: 4, height: 3 });
    expect(again.nodes[stage.nodeId].responsive.desktop.height).toEqual({ mode: "aspect-ratio", ratio: { width: 4, height: 3 } });
    expect(again.slots[background.slotId].desktopRules.aspectRatio).toBe("4:3");
    expect(again.slots[background.slotId].mobileRules.aspectRatio).toBe("3:4");
    expect(again.slots[work.slotId].mobileRules.aspectRatio).toBe("4:5");
    expect(definition).toEqual(before);
  });

  test("切换标准画幅后铺满图片填满新画布，舞台下不再留出旧比例空档", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1100 });
    await page.route("**/api/**", (route) => route.abort());
    await page.route("**/__canvas-ratio-follow", (route) => route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><head><style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}</style><script type="module">
        import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;
      </script></head><body></body></html>`,
    }));
    await page.goto("/__canvas-ratio-follow");
    await page.evaluate(async () => {
      const paths = ["/node_modules/.vite/deps/react.js", "/node_modules/.vite/deps/react-dom_client.js", "/src/page-builder/template-definition/nodeRegistry.ts", "/src/page-builder/template-definition/templateDimensions.ts", "/src/page-builder/template-definition/DynamicTemplateRenderer.tsx"];
      const [react, dom, registry, dimensions, renderer] = await Promise.all(paths.map((path) => import(/* @vite-ignore */ path)));
      const base = registry.createBlankDynamicTemplateDefinition("画幅跟随");
      base.schemaVersion = 3;
      base.metadata.sectionRole = "page-hero";
      base.metadata.geometryPolicy = "hero-media-frame";
      base.metadata.desktopRatio = "16:9";
      const stage = registry.createDynamicTemplateNode("Stack", "主舞台");
      stage.responsive.desktop = {
        ...stage.responsive.desktop,
        layoutMode: "free",
        height: { mode: "aspect-ratio", ratio: { width: 16, height: 9 } },
        minHeight: { value: 560, unit: "px" },
        backgroundColor: "#111315",
        padding: { top: { value: 0, unit: "px" }, right: { value: 0, unit: "px" }, bottom: { value: 0, unit: "px" }, left: { value: 0, unit: "px" } },
      };
      stage.responsive.mobile = { ...stage.responsive.mobile, layoutMode: "free", height: { mode: "aspect-ratio", ratio: { width: 9, height: 16 } }, minHeight: { value: 0, unit: "px" } };
      const background = registry.createDynamicTemplateSlotDefinition("image", "背景图", "heroBackground");
      background.semanticRole = "backgroundImage";
      background.desktopRules.aspectRatio = "16:9";
      background.mobileRules.aspectRatio = "9:16";
      const image = registry.createDynamicTemplateNode("ImageSlot", "背景图", background.slotId);
      image.responsive.desktop.placement = { x: 0, y: 0, width: 1, height: 1, zIndex: 0 };
      image.responsive.mobile.placement = { x: 0, y: 0, width: 1, height: 1, zIndex: 0 };
      stage.childIds = [image.nodeId];
      base.nodes[stage.nodeId] = stage;
      base.nodes[image.nodeId] = image;
      base.slots[background.slotId] = background;
      base.nodes[base.rootNodeId].childIds = [stage.nodeId];
      const definition = dimensions.applyStandardTemplateCanvasPair(base, { width: 3, height: 2 });
      const root = dom.default.createRoot(document.body.appendChild(document.createElement("main")));
      root.render(react.default.createElement("section", { "data-fill-case": "desktop", style: { width: 1440 } }, react.default.createElement(renderer.default, { definition, device: "desktop", mode: "editor", showEmptySlots: true })));
    });
    const scene = page.locator('[data-fill-case="desktop"]');
    const canvas = scene.locator("[data-template-fixed-canvas='true']");
    await expect(canvas).toBeVisible();
    const boxes = await canvas.evaluate((element) => {
      const shell = element.getBoundingClientRect();
      const stage = element.querySelector<HTMLElement>('[data-template-node-type="Stack"]')!.getBoundingClientRect();
      const image = element.querySelector<HTMLElement>('[data-template-node-type="ImageSlot"]')!.getBoundingClientRect();
      return {
        shell: { width: shell.width, height: shell.height },
        stage: { width: stage.width, height: stage.height, bottom: stage.bottom },
        image: { width: image.width, height: image.height, bottom: image.bottom },
        shellBottom: shell.bottom,
      };
    });
    expect(boxes.shell.height).toBeCloseTo(boxes.shell.width * 2 / 3, 1);
    expect(boxes.stage.height).toBeCloseTo(boxes.shell.height, 1);
    expect(boxes.image.height).toBeCloseTo(boxes.shell.height, 1);
    expect(boxes.image.bottom).toBeCloseTo(boxes.shellBottom, 1);
    expect(boxes.stage.bottom).toBeCloseTo(boxes.shellBottom, 1);
  });

  test("浏览器真实根与外壳严格采用标准双端比例，长内容可见告警，四作品卡仍为4:5", async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.route("**/api/**", (route) => route.abort());
    await page.route("**/__standard-canvas-pairs", (route) => route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><head><style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}</style><script type="module">
        import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;
      </script></head><body></body></html>`,
    }));
    await page.goto("/__standard-canvas-pairs");
    await page.evaluate(async () => {
      const paths = ["/node_modules/.vite/deps/react.js", "/node_modules/.vite/deps/react-dom_client.js", "/src/page-builder/template-definition/nodeRegistry.ts", "/src/page-builder/template-definition/templateDimensions.ts", "/src/page-builder/template-definition/DynamicTemplateRenderer.tsx"];
      const [react, dom, registry, dimensions, renderer] = await Promise.all(paths.map((path) => import(/* @vite-ignore */ path)));
      const root = dom.default.createRoot(document.body.appendChild(document.createElement("main")));
      const scenes: unknown[] = [];
      for (const [index, pair] of dimensions.STANDARD_TEMPLATE_CANVAS_PAIRS.entries()) {
        const base = registry.createBlankDynamicTemplateDefinition("标准画幅");
        base.schemaVersion = 3;
        const content = registry.createDynamicTemplateNode("Container", "超出根的长内容");
        content.responsive.desktop.height = { mode: "fixed", value: { value: 2000, unit: "px" } };
        const copySlot = registry.createDynamicTemplateSlotDefinition("text", "完整长说明", "description");
        Object.assign(copySlot.desktopRules, { fontSize: { value: 16, unit: "px" }, lineHeight: 1.5 });
        delete copySlot.desktopRules.maxLines;
        const copy = registry.createDynamicTemplateNode("TextSlot", "完整长说明", copySlot.slotId);
        base.nodes[copy.nodeId] = copy;
        base.slots[copySlot.slotId] = copySlot;
        base.defaultContent[copySlot.slotId] = "完整说明不能因为画幅改变而消失。".repeat(200);
        content.childIds = [copy.nodeId];
        base.nodes[content.nodeId] = content;
        base.nodes[base.rootNodeId].childIds = [content.nodeId];
        const definition = dimensions.applyStandardTemplateCanvasPair(base, pair.desktop);
        for (const device of ["desktop", "mobile"]) {
          scenes.push(react.default.createElement("section", { key: `${index}-${device}`, "data-pair": index, "data-device": device, style: { width: device === "desktop" ? 1440 : 390, marginBottom: 80 } }, react.default.createElement(renderer.default, { definition, device, mode: "editor", showEmptySlots: true })));
        }
      }
      const base = registry.createBlankDynamicTemplateDefinition("四格标准画幅");
      base.metadata.sectionRole = "creation-grid";
      const group = registry.createDynamicTemplateNode("Stack", "作品组");
      group.responsive.desktop.direction = "row";
      group.responsive.mobile = { direction: "column" };
      base.nodes[group.nodeId] = group;
      base.nodes[base.rootNodeId].childIds = [group.nodeId];
      for (let i=0;i<4;i++) {
        const slot = registry.createDynamicTemplateSlotDefinition("image", "作品", `work${i}`);
        slot.desktopRules.aspectRatio = "4:5";
        const image = registry.createDynamicTemplateNode("ImageSlot", "作品", slot.slotId);
        base.nodes[image.nodeId] = image; base.slots[slot.slotId] = slot; group.childIds.push(image.nodeId);
      }
      scenes.push(react.default.createElement("section", { key: "works", "data-works": true, style: { width:390 } }, react.default.createElement(renderer.default, { definition: dimensions.applyStandardTemplateCanvasPair(base, {width:16,height:9}), device:"mobile", mode:"editor", showEmptySlots:true })));
      root.render(react.default.createElement(react.default.Fragment, null, ...scenes));
    });
    for (const [index, pair] of STANDARD_TEMPLATE_CANVAS_PAIRS.entries()) {
      for (const device of ["desktop", "mobile"] as const) {
        const scene = page.locator(`[data-pair="${index}"][data-device="${device}"]`);
        const canvas = scene.locator("[data-template-fixed-canvas='true']");
        await expect(canvas).toBeVisible();
        const boxes = await canvas.evaluate((element) => {
          const root = element.querySelector<HTMLElement>(":scope > [data-template-node-id]")!;
          const outer = element.getBoundingClientRect(); const inner = root.getBoundingClientRect();
          return { outer: { width:outer.width, height:outer.height }, inner:{width:inner.width,height:inner.height}, overflow:getComputedStyle(element).overflowY };
        });
        const ratio = pair[device];
        expect(boxes.outer.height).toBeCloseTo(boxes.outer.width * ratio.height / ratio.width, 1);
        expect(boxes.inner.height).toBeCloseTo(boxes.outer.height, 1);
        expect(boxes.inner.width).toBeCloseTo(boxes.outer.width, 1);
        expect(boxes.overflow).toBe("visible");
        await expect(scene.locator("[data-template-fixed-canvas-note]")).toBeVisible();
      }
    }
    const works = page.locator("[data-works]");
    await expect(works.locator("[data-template-paired-image-cell]")).toHaveCount(4);
    for (const card of await works.locator("[data-template-node-type='ImageSlot']").all()) {
      const box = (await card.boundingBox())!;
      expect(box.height).toBeCloseTo(box.width * 5 / 4, 1);
    }
  });
});

test.describe("模板响应式合同：纯函数与客户端校验边界", () => {
  test("运行时传入旧节点类型时受控拒绝，不进入未登记 Registry", () => {
    const definition = createBlankDynamicTemplateDefinition("旧节点拒绝测试");
    expect(() => addDynamicTemplateNode(
      definition,
      definition.rootNodeId,
      "Carousel" as Parameters<typeof addDynamicTemplateNode>[2],
    )).toThrow(new DynamicTemplateOperationError(
      "UNKNOWN_NODE_TYPE",
      "节点类型未登记，无法添加到模板。",
    ));
  });

  test("新增和移动跨自由布局与流式布局时取消定位继承，普通流式节点保持稀疏覆盖", () => {
    const definition = createBlankDynamicTemplateDefinition("混合布局");
    const flow = createDynamicTemplateNode("Container", "流式区域");
    flow.responsive.mobile = {};
    definition.nodes[flow.nodeId] = flow;
    definition.nodes[definition.rootNodeId].childIds.push(flow.nodeId);
    const stage = createDynamicTemplateNode("Stack", "自由区域");
    stage.responsive.desktop.layoutMode = "free";
    stage.responsive.desktop.height = { mode: "fixed", value: { value: 600, unit: "px" } };
    stage.responsive.mobile = { layoutMode: "flow", height: { mode: "auto" } };
    definition.nodes[stage.nodeId] = stage;
    definition.nodes[definition.rootNodeId].childIds.push(stage.nodeId);
    const added = addDynamicTemplateNode(definition, stage.nodeId, "HeadingSlot");
    expect(resolveTemplateNodeRules(added.definition, added.nodeId, "desktop").placement).toBeDefined();
    expect(resolveTemplateNodeRules(added.definition, added.nodeId, "tablet").placement).toBeDefined();
    expect(added.definition.nodes[added.nodeId].responsive.mobile.placement).toBeNull();
    expect(validateDynamicTemplateDefinition(added.definition).valid).toBe(true);
    const flowed = moveDynamicTemplateNode(added.definition, added.nodeId, flow.nodeId);
    for (const device of ["desktop", "mobile"] as const) expect(resolveTemplateNodeRules(flowed, added.nodeId, device).placement).toBeUndefined();
    expect(resolveTemplateNodeRules(flowed, added.nodeId, "tablet").placement).toBeUndefined();
    const returned = moveDynamicTemplateNode(flowed, added.nodeId, stage.nodeId);
    expect(resolveTemplateNodeRules(returned, added.nodeId, "desktop").placement).toBeDefined();
    expect(resolveTemplateNodeRules(returned, added.nodeId, "mobile").placement).toBeUndefined();
    expect(validateDynamicTemplateDefinition(returned).valid).toBe(true);
    const plain = addDynamicTemplateNode(definition, flow.nodeId, "HeadingSlot");
    expect(plain.definition.nodes[plain.nodeId].responsive.tablet).toBeUndefined();
    expect(plain.definition.nodes[plain.nodeId].responsive.mobile).toEqual({});
  });
  test("锁定对象允许新增兄弟自然回流，但拒绝存续兄弟跨越其层序", () => {
    const { definition, regionId, imageId } = fixture();
    definition.nodes[imageId].authoring = { structureLocked: true };
    const sibling = createDynamicTemplateNode("Stack", "未锁定兄弟");
    definition.nodes[sibling.nodeId] = sibling;
    definition.nodes[regionId].childIds.push(sibling.nodeId);
    const next = structuredClone(definition);
    const added = createDynamicTemplateNode("Stack", "新兄弟");
    next.nodes[added.nodeId] = added;
    next.nodes[regionId].childIds.unshift(added.nodeId);
    expect(getDynamicTemplateStructureLockViolation(definition, next)).toBeNull();
    next.nodes[regionId].childIds = [sibling.nodeId, imageId, added.nodeId];
    expect(getDynamicTemplateStructureLockViolation(definition, next)).toContain("同级顺序");
  });
  test("新草稿只持有 Desktop 基值和空 Mobile 覆盖", () => {
    const definition = createBlankDynamicTemplateDefinition();
    expect(definition.schemaVersion).toBe(2);
    expect(definition.nodes[definition.rootNodeId].responsive.mobile).toEqual({});
    expect(definition.nodes[definition.rootNodeId].responsive.tablet).toBeUndefined();
    expect(definition.metadata.previewTabletWidth).toBeUndefined();
    expect(definition.defaultContent).toEqual({});
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);
  });

  test("v1 原有双端与自定义边界保持原样，不自动继承或迁移", () => {
    const definition = legacyFixture();
    const root = definition.nodes[definition.rootNodeId];
    root.responsive.desktop.width = { value: 80, unit: "%" };
    root.responsive.mobile.width = { value: 320, unit: "px" };
    const before = JSON.stringify(definition);
    expect(validateDynamicTemplateDefinition(definition).definition).toBe(definition);
    expect(resolveTemplateNodeRules(definition, root.nodeId, "mobile").width).toEqual({ value: 320, unit: "px" });
    expect(resolveTemplateBreakpoint(definition, 900)).toBe("mobile");
    expect(resolveTemplateBreakpoint(definition, 901)).toBe("desktop");
    expect(JSON.stringify(definition)).toBe(before);
    expect(() => setTemplateNodeRule(definition, root.nodeId, "tablet", "width", "fill")).toThrow("旧模板");
  });

  test("新断点在 767/768/1023/1024 只切桌面与手机", () => {
    const { definition } = fixture();
    expect([767, 768, 1023, 1024].map((width) => resolveTemplateBreakpoint(definition, width))).toEqual(["mobile", "desktop", "desktop", "desktop"]);
    expect(() => resolveTemplateBreakpoint(definition, Number.NaN)).toThrow();
  });

  test("历史平板覆盖不参与继承，手机只叠自身覆盖", () => {
    const { definition, regionId } = fixture();
    setTemplateNodeRule(definition, regionId, "desktop", "gap", { value: 24, unit: "px" });
    definition.nodes[regionId].responsive.tablet = { padding: { top: { value: 16, unit: "px" } } };
    setTemplateNodeRule(definition, regionId, "mobile", "padding.bottom", { value: 8, unit: "px" });
    const effective = resolveTemplateNodeRules(definition, regionId, "mobile");
    expect(effective.padding).toEqual({ top: { value: 0, unit: "px" }, right: { value: 0, unit: "px" }, bottom: { value: 8, unit: "px" }, left: { value: 0, unit: "px" } });
    expect(effective.gap).toEqual({ value: 24, unit: "px" });
    expect(resolveTemplateNodeRules(definition, regionId, "tablet").gap).toEqual({ value: 24, unit: "px" });
    expect(resolveTemplateNodeRules(definition, regionId, "tablet").padding).toBeUndefined();
    expect(definition.nodes[regionId].responsive.mobile).toEqual({ padding: { bottom: { value: 8, unit: "px" } } });
    expect(getTemplateNodeRuleSource(definition, regionId, "mobile", "padding.top")).toBe("system");
    expect(getTemplateNodeRuleSource(definition, regionId, "mobile", "padding.bottom")).toBe("mobile");
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);
    expect(() => setTemplateNodeRule(definition, regionId, "tablet", "gap", { value: 12, unit: "px" })).toThrow("不提供独立平板内容");
  });

  test("历史平板字段不进入草稿或发布检查", () => {
    const { definition, regionId, slotId } = fixture();
    definition.nodes[regionId].responsive.tablet = { notARealRule: true } as never;
    definition.slots[slotId].tabletRules = { notARealRule: true } as never;
    const draft = validateDynamicTemplateDefinition(definition);
    const publish = validateDynamicTemplatePublishDefinition(definition);
    expect(draft.issues.some((issue) => issue.path.includes("tablet") || issue.message.includes("平板"))).toBe(false);
    expect(publish.issues.some((issue) => issue.path.includes("tablet") || issue.message.includes("平板"))).toBe(false);
    expect(draft.valid).toBe(true);
  });

  test("显式等值覆盖保留意图，恢复继承后才跟随基础值", () => {
    const { definition, regionId } = fixture();
    setTemplateNodeRule(definition, regionId, "desktop", "gap", { value: 24, unit: "px" });
    setTemplateNodeRule(definition, regionId, "mobile", ["gap"], { value: 24, unit: "px" });
    setTemplateNodeRule(definition, regionId, "desktop", "gap", { value: 32, unit: "px" });
    expect(resolveTemplateNodeRules(definition, regionId, "mobile").gap?.value).toBe(24);
    resetTemplateNodeRule(definition, regionId, "mobile", "gap");
    expect(resolveTemplateNodeRules(definition, regionId, "mobile").gap?.value).toBe(32);
    expect(definition.nodes[regionId].responsive.mobile).toEqual({});
  });

  test("恢复本来就继承的字段不创建空对象或改变文档", () => {
    const { definition, regionId, slotId } = fixture();
    const before = JSON.stringify(definition);
    resetTemplateNodeRule(definition, regionId, "mobile", "gap");
    resetTemplateSlotRule(definition, slotId, "mobile", "fontSize");
    expect(JSON.stringify(definition)).toBe(before);
  });

  test("空分组首次直接设置内边距：Desktop补全四边，Mobile只保存被修改的一边", () => {
    const { definition, regionId } = fixture();
    setTemplateNodeRule(definition, regionId, "desktop", ["padding", "top"], { value: 24, unit: "px" });
    expect(definition.nodes[regionId].responsive.desktop.padding?.left).toEqual({ value: 0, unit: "px" });
    setTemplateNodeRule(definition, regionId, "mobile", ["margin", "bottom"], { value: 8, unit: "px" });
    setTemplateNodeRule(definition, regionId, "mobile", "gap", { value: 12, unit: "px" });
    expect(definition.nodes[regionId].responsive.mobile.margin).toEqual({ bottom: { value: 8, unit: "px" } });
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);
  });

  test("断点隐藏与恢复保留原排列方式", () => {
    const { definition, regionId } = fixture();
    setTemplateNodeRule(definition, regionId, "desktop", "display", "grid");
    setTemplateNodeRule(definition, regionId, "desktop", "columns", [1, 1, 1]);
    definition.nodes[regionId].responsive.tablet = { hidden: true };
    setTemplateNodeRule(definition, regionId, "mobile", "hidden", false);
    const tablet = compileDynamicTemplateRenderPlan(definition, { device: "desktop", breakpoint: "tablet", showEmptySlots: true });
    const mobile = compileDynamicTemplateRenderPlan(definition, { device: "mobile", breakpoint: "mobile", showEmptySlots: true });
    expect(tablet.ok && tablet.plan.root.children[0].hidden).toBe(false);
    expect(mobile.ok && mobile.plan.root.children[0].hidden).toBe(false);
    expect(resolveTemplateNodeRules(definition, regionId, "mobile").display).toBe("grid");
    expect(resolveTemplateNodeRules(definition, regionId, "tablet").display).toBe("grid");
    expect(definition.nodes[regionId].responsive.tablet).toEqual({ hidden: true });
  });

  test("图片精确焦点继承与恢复，v1 继续限制为旧预设", () => {
    const { definition, slotId } = fixture();
    definition.slots[slotId].tabletRules = { objectPosition: "37.5% 80%" };
    expect(resolveTemplateSlotRules(definition, slotId, "mobile").objectPosition).toBe("center center");
    setTemplateSlotRule(definition, slotId, "mobile", "objectPosition", "10% 20%");
    resetTemplateSlotRule(definition, slotId, "mobile", "objectPosition");
    expect(resolveTemplateSlotRules(definition, slotId, "mobile").objectPosition).toBe("center center");
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);
    definition.slots[slotId].mobileRules.objectPosition = "101% 20%";
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(false);
    const legacy = legacyFixture();
    Object.values(legacy.slots)[0].desktopRules.objectPosition = "37.5% 80%";
    expect(validateDynamicTemplateDefinition(legacy).valid).toBe(false);
  });

  test("稀疏覆盖非法值和未知字段由客户端合同拒绝", () => {
    const { definition, regionId } = fixture();
    definition.nodes[regionId].responsive.mobile = { width: { value: -2, unit: "px" } };
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(false);
    (definition.nodes[regionId].responsive.mobile as Record<string, unknown>).position = "fixed";
    expect(validateDynamicTemplateDefinition(definition).issues.some((issue) => issue.path.endsWith("position"))).toBe(true);
    expect(() => setTemplateNodeRule(definition, regionId, "mobile", "__proto__.value", 1)).toThrow();
  });

  test("有明确最小高度的流式容器可以局部锚定；根或无高度父容器拒绝", () => {
    const { definition, regionId, imageId } = fixture();
    const anchor = { horizontal: "right", vertical: "bottom", offsetX: { value: -12, unit: "px" }, offsetY: { value: 0, unit: "%" } };
    setTemplateNodeRule(definition, imageId, "desktop", "anchor", anchor);
    expect(validateDynamicTemplateDefinition(definition).issues.some((issue) => issue.code === "ANCHOR_REQUIRES_SIZED_PARENT")).toBe(true);
    setTemplateNodeRule(definition, regionId, "desktop", "minHeight", { value: 320, unit: "px" });
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);
    setTemplateNodeRule(definition, definition.rootNodeId, "desktop", "anchor", anchor);
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(false);
  });

  test("Mobile可以明确脱离继承锚点，恢复继承则重新采用上游锚点", () => {
    const { definition, regionId, imageId } = fixture();
    setTemplateNodeRule(definition, regionId, "desktop", "minHeight", { value: 320, unit: "px" });
    const anchor = { horizontal: "left", vertical: "top", offsetX: { value: 0, unit: "px" }, offsetY: { value: 0, unit: "px" } };
    setTemplateNodeRule(definition, imageId, "desktop", "anchor", anchor);
    setTemplateNodeRule(definition, imageId, "desktop", "placement", { x: 0, y: 0, width: 0.5, height: 0.5, zIndex: 0 });
    setTemplateNodeRule(definition, imageId, "mobile", "anchor", null);
    setTemplateNodeRule(definition, imageId, "mobile", "placement", null);
    expect(resolveTemplateNodeRules(definition, imageId, "mobile").anchor).toBeUndefined();
    expect(resolveTemplateNodeRules(definition, imageId, "mobile").placement).toBeUndefined();
    expect(definition.nodes[imageId].responsive.mobile).toEqual({ anchor: null, placement: null });
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);
    resetTemplateNodeRule(definition, imageId, "mobile", "anchor");
    expect(resolveTemplateNodeRules(definition, imageId, "mobile").anchor).toEqual(anchor);
  });

  test("v2 换行、最小宽度、最大高度和 fit/fill 高度有合同消费者", () => {
    const { definition, regionId } = fixture();
    setTemplateNodeRule(definition, regionId, "desktop", "display", "flex");
    setTemplateNodeRule(definition, regionId, "desktop", "wrap", "wrap");
    setTemplateNodeRule(definition, regionId, "desktop", "minWidth", { value: 100, unit: "px" });
    setTemplateNodeRule(definition, regionId, "mobile", "height", { mode: "fit" });
    setTemplateNodeRule(definition, regionId, "mobile", "maxHeight", { value: 400, unit: "px" });
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);
    const result = compileDynamicTemplateRenderPlan(definition, { device: "mobile", breakpoint: "mobile", showEmptySlots: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.root.children[0].rules).toMatchObject({ wrap: "wrap", minWidth: { value: 100, unit: "px" }, height: { mode: "fit" }, maxHeight: { value: 400, unit: "px" } });
  });

  test("投影与尺寸规范化不会改写稀疏文档，公开计划读取同一有效值", () => {
    const { definition, regionId } = fixture();
    setTemplateNodeRule(definition, regionId, "desktop", "display", "grid");
    setTemplateNodeRule(definition, regionId, "desktop", "columns", [1, 1, 1]);
    definition.nodes[regionId].responsive.tablet = { columns: [1, 1] };
    setTemplateNodeRule(definition, regionId, "mobile", "columns", [1]);
    const before = JSON.stringify(definition);
    const projected = resolveTemplateDefinitionForBreakpoint(definition, "tablet");
    expect(projected.nodes[regionId].responsive.mobile.columns).toEqual([1, 1, 1]);
    const plan = compileDynamicTemplateRenderPlan(definition, { device: "desktop", breakpoint: "tablet", showEmptySlots: true });
    expect(plan.ok && plan.plan.root.children[0].rules.columns).toEqual([1, 1, 1]);
    expect(JSON.stringify(normalizeTemplateDimensionContract(definition))).toBe(before);
    expect(JSON.stringify(definition)).toBe(before);
  });

  test("新定义拒绝试排内容和未知 schema，历史平板隐藏不进入发布检查", () => {
    const { definition, imageId, slotId } = fixture();
    definition.slots[slotId].required = true;
    definition.slots[slotId].hideable = false;
    definition.nodes[imageId].responsive.tablet = { display: "none" };
    expect(validateDynamicTemplatePublishDefinition(definition).issues.some((issue) => issue.path.includes("tablet.display"))).toBe(false);
    setTemplateNodeRule(definition, imageId, "mobile", "display", "none");
    expect(validateDynamicTemplatePublishDefinition(definition).issues.some((issue) => issue.path.includes("mobile.display"))).toBe(true);
    definition.defaultContent[slotId] = { src: "/trial-only.jpg" };
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(false);
    expect(validateDynamicTemplateDefinition({ ...definition, defaultContent: {}, schemaVersion: 3 }).valid).toBe(true);
    expect(validateDynamicTemplateDefinition({ ...definition, defaultContent: {}, schemaVersion: 999 }).valid).toBe(false);
  });

  test("必填槽位被上级隐藏时客户端发布门禁只定位桌面与手机", () => {
    const leftoverTablet = fixture();
    leftoverTablet.definition.slots[leftoverTablet.slotId].required = true;
    leftoverTablet.definition.slots[leftoverTablet.slotId].hideable = false;
    leftoverTablet.definition.nodes[leftoverTablet.regionId].responsive.tablet = { hidden: true };
    expect(validateDynamicTemplatePublishDefinition(leftoverTablet.definition).issues
      .filter((issue) => issue.code === "PUBLISH_REQUIRED_SLOT_DEVICE_HIDDEN")).toEqual([]);

    const mobileCase = fixture();
    mobileCase.definition.slots[mobileCase.slotId].required = true;
    mobileCase.definition.slots[mobileCase.slotId].hideable = false;
    setTemplateNodeRule(mobileCase.definition, mobileCase.regionId, "mobile", "hidden", true);
    const clientMobile = validateDynamicTemplatePublishDefinition(mobileCase.definition).issues
      .filter((issue) => issue.code === "PUBLISH_REQUIRED_SLOT_DEVICE_HIDDEN");
    expect(clientMobile.map((issue) => [issue.nodeId, issue.path])).toEqual([
      [mobileCase.regionId, `nodes.${mobileCase.regionId}.responsive.mobile.display`],
    ]);

    const globalCase = fixture();
    globalCase.definition.slots[globalCase.slotId].required = true;
    globalCase.definition.slots[globalCase.slotId].hideable = false;
    globalCase.definition.nodes[globalCase.regionId].hidden = true;
    const issue = validateDynamicTemplatePublishDefinition(globalCase.definition).issues.find((candidate) => candidate.code === "PUBLISH_REQUIRED_SLOT_HIDDEN");
    expect(issue).toMatchObject({
      nodeId: globalCase.regionId,
      path: `nodes.${globalCase.regionId}.hidden`,
    });
    expect(issue?.message).toContain("因上级");
  });
});
