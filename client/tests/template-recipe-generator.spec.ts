import { expect, test } from "@playwright/test";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";
import { CANVAS_PRESETS, CONTENTS, LAYOUTS, MEDIA_PRESETS, PURPOSES, STYLES, changeRecipePurpose, createContentSlot, createMediaSlots, createRecommendedRecipe, styleFor } from "../src/page-builder/template-creation/presets";
import { validateDynamicTemplateDefinition, validateDynamicTemplatePublishDefinition } from "../src/page-builder/template-definition/validateTemplateDefinition";
import { resolveTemplateNodeRules } from "../src/page-builder/template-definition/responsive";
import { arrangeMedia } from "../src/page-builder/template-creation/mediaGeometry";
import { createTemplateRecipePreviewContent } from "../src/page-builder/template-creation/previewContent";
import { compileDynamicTemplateRenderPlan, type DynamicTemplateRenderPlanNode } from "../src/page-builder/template-definition/renderPlan";

test("三图自由布局的已有外框通过客户端发布校验，未命名仍须补填", () => {
  const recipe = createRecommendedRecipe("news");
  recipe.canvas = { width: 1920, height: 1080, aspectRatio: 16 / 9 };
  recipe.layout = "leftImageRightContent";
  recipe.media = createMediaSlots(["custom", "custom", "custom"]);
  const definition = generateTemplateFromRecipe(recipe);
  expect(validateDynamicTemplatePublishDefinition(definition).issues.some((issue) => issue.code === "PUBLISH_REQUIRES_TEMPLATE_NAME")).toBe(true);
  definition.name = "三图资讯模板";
  const original = structuredClone(definition);
  const result = validateDynamicTemplatePublishDefinition(definition);
  expect(result.issues.filter((issue) => issue.level === "error")).toEqual([]);
  expect(result.issues.some((issue) => issue.code === "IMAGE_SLOT_AUTO_HEIGHT_OVERFLOWS_BOUNDED_PARENT")).toBe(false);
  expect(result.valid).toBe(true);
  expect(definition).toEqual(original);
});

test("1200×900 左文右图的双图充分展开，保留方形和同级关系", () => {
  const recipe = createRecommendedRecipe("brand");
  recipe.canvas = { width: 1200, height: 900, aspectRatio: 4 / 3 };
  recipe.layout = "leftContentRightImage";
  recipe.media = createMediaSlots(["custom", "custom"]);
  const original = structuredClone(recipe);
  const definition = generateTemplateFromRecipe(recipe);
  const images = Object.values(definition.nodes).filter((node) => definition.slots[node.slotId!]?.type === "image").map((node) => node.responsive.desktop.placement!);
  const content = definition.nodes[`${definition.templateId}_content`].responsive.desktop.placement!;
  expect(images).toHaveLength(2);
  expect(images[0].width * 1200).toBeGreaterThan(350);
  expect(images[0].width * 1200).toBeCloseTo(images[0].height * 900, 5);
  expect(images[1].width).toBeCloseTo(images[0].width, 5);
  expect(images[1].y).toBeGreaterThan(images[0].y + images[0].height);
  expect(images[0].x).toBeGreaterThan(content.x + content.width);
  expect(recipe).toEqual(original);
});

test("多图随区域横竖排列，混合比例和一至六图保持间距、身份与边界", () => {
  for (const area of [{ x: 35, y: 42, width: 600, height: 900 }, { x: 35, y: 42, width: 1200, height: 350 }]) {
    for (let count = 1; count <= 6; count += 1) for (const mixed of [false, true, "free"] as const) {
      const media = createMediaSlots(Array.from({ length: count }, () => "custom"));
      if (mixed) media.forEach((item, index) => { item.aspectRatio = [1, .75, 16 / 9][index % 3]; });
      if (mixed === "free") media[0].freeRatio = true;
      const frames = arrangeMedia(area, media, 24);
      expect(frames).toHaveLength(count);
      frames.forEach((frame, index) => {
        if (!media[index].freeRatio) expect(frame.width / frame.height).toBeCloseTo(media[index].aspectRatio, 5);
        expect(frame.x).toBeGreaterThanOrEqual(area.x - .00001);
        expect(frame.y).toBeGreaterThanOrEqual(area.y - .00001);
        expect(frame.x + frame.width).toBeLessThanOrEqual(area.x + area.width + .00001);
        expect(frame.y + frame.height).toBeLessThanOrEqual(area.y + area.height + .00001);
        frames.slice(index + 1).forEach((other) => expect(
          frame.x + frame.width + 23.999 <= other.x || other.x + other.width + 23.999 <= frame.x
          || frame.y + frame.height + 23.999 <= other.y || other.y + other.height + 23.999 <= frame.y,
        ).toBe(true));
      });
      if (count === 2 && !mixed) {
        const portrait = area.height > area.width;
        expect(portrait ? frames[1].y : frames[1].x).toBeGreaterThan(portrait ? frames[0].y : frames[0].x);
        expect(portrait ? frames[1].x : frames[1].y).toBeCloseTo(portrait ? frames[0].x : frames[0].y, 5);
      }
    }
  }
});

test("主副图按最终面积保持层级，支持混合比例与横竖区域", () => {
  for (const [width, height] of [[600, 900], [1200, 350]]) for (const count of [1, 2]) {
    const media = createMediaSlots(["heroImage", ...Array.from({ length: count }, () => "secondaryImage" as const)]);
    media[0].aspectRatio = .75;
    media[1].aspectRatio = 16 / 9;
    const frames = arrangeMedia({ x: 0, y: 0, width, height }, media, 24);
    expect(frames).toHaveLength(media.length);
    for (const frame of frames.slice(1)) expect(frames[0].width * frames[0].height).toBeGreaterThan(frame.width * frame.height * 2);
  }
});

test("长文扩大文字区而不缩字号，同级分栏仍保持等宽", () => {
  const recipe = createRecommendedRecipe();
  recipe.canvas = { width: 1200, height: 900, aspectRatio: 4 / 3 };
  recipe.layout = "leftContentRightImage";
  recipe.media = createMediaSlots(["custom", "custom"]);
  recipe.content = [createContentSlot("title"), ...["description-one", "description-two"].map((id) => ({ ...createContentSlot("description", id), defaultContent: "图".repeat(300) }))];
  const definition = generateTemplateFromRecipe(recipe);
  const contentWidth = definition.nodes[`${definition.templateId}_content`].responsive.desktop.placement!.width * 1200;
  expect(contentWidth).toBeGreaterThan((1200 - 108 - 32) * .4);
  const title = Object.values(definition.slots).find((slot) => slot.semanticRole === "title")!;
  expect(title.desktopRules.fontSize).toEqual({ value: 54, unit: "px" });
  recipe.layout = "splitColumns";
  const columns = generateTemplateFromRecipe(recipe);
  expect(columns.nodes[`${columns.templateId}_content`].responsive.desktop.placement!.width * 1200).toBeCloseTo((1200 - 108 - 32) / 2, 5);
});

test("Recipe 独立生成稳定身份，预览和创建可复用同一定义", () => {
  const recipe = createRecommendedRecipe();
  const original = structuredClone(recipe);
  const definition = generateTemplateFromRecipe(recipe, { templateId: "tpl_recipe_stable" });
  expect(generateTemplateFromRecipe(recipe, { templateId: "tpl_recipe_stable" })).toEqual(definition);
  expect(recipe).toEqual(original);
  expect(definition.schemaVersion).toBe(3);
  expect(definition.templateRecipe).toEqual(recipe);
  expect(Object.values(definition.slots).map((slot) => slot.semanticRole)).toContain("price");
  expect(definition.defaultContent).toEqual({});
  expect(definition.previewContent).toEqual({});
  expect(recipe.content.every((item) => item.defaultContent === "")).toBe(true);
});

test("所有新预设及重复自定义文字的系统样例不进入正式内容", () => {
  for (const [purpose] of PURPOSES) {
    const recipe = createRecommendedRecipe(purpose);
    expect(recipe.content.every((item) => item.defaultContent === "")).toBe(true);
    if (!recipe.content.length && !recipe.media.length) recipe.content = [createContentSlot("title")];
    if (purpose === "custom") recipe.customPurpose = "自定义用途";
    const definition = generateTemplateFromRecipe(recipe);
    const beforePreview = structuredClone(definition);
    createTemplateRecipePreviewContent(definition);
    expect(definition).toEqual(beforePreview);
    expect(definition.defaultContent).toEqual({});
    expect(definition.previewContent).toEqual({});
    expect(definition.templateRecipe?.content.every((item) => item.defaultContent === "")).toBe(true);
  }
  const recipe = createRecommendedRecipe("general");
  recipe.canvas = { width: 1080, height: 4096, aspectRatio: 1080 / 4096 };
  recipe.content = [...CONTENTS.map(([role]) => createContentSlot(role)),
    { ...createContentSlot("customText", "second-custom"), name: "另一个自定义字段" }];
  const definition = generateTemplateFromRecipe(recipe);
  const preview = createTemplateRecipePreviewContent(definition);
  expect(Object.keys(preview)).toHaveLength(recipe.content.length);
  expect(Object.values(preview)).toContain("另一个自定义字段");
  expect(definition.defaultContent).toEqual({});
  expect(definition.previewContent).toEqual({});
});

test("向导样例保持三端文字层级和几何，序列化重开后的公开内容仍为空", () => {
  const recipe = createRecommendedRecipe("general");
  recipe.canvas = { width: 1920, height: 1080, aspectRatio: 16 / 9 };
  recipe.layout = "leftImageRightContent";
  recipe.media = createMediaSlots(["heroImage"]);
  recipe.content = [createContentSlot("title"), createContentSlot("description"), createContentSlot("cta")];
  const definition = generateTemplateFromRecipe(recipe);
  const beforePreview = JSON.stringify(definition);
  const flatten = (node: DynamicTemplateRenderPlanNode): DynamicTemplateRenderPlanNode[] => [node, ...node.children.flatMap(flatten)];
  for (const breakpoint of ["desktop", "tablet", "mobile"] as const) {
    const device = breakpoint === "mobile" ? "mobile" : "desktop";
    const preview = compileDynamicTemplateRenderPlan(definition, {
      device, breakpoint, contentBySlotId: createTemplateRecipePreviewContent(definition), showEmptySlots: true,
    });
    const published = compileDynamicTemplateRenderPlan(JSON.parse(beforePreview), { device, breakpoint });
    expect(preview.ok).toBe(true);
    expect(published.ok).toBe(true);
    if (!preview.ok || !published.ok) throw new Error("渲染计划无效");
    const previewText = flatten(preview.plan.root).filter((node) => node.slot && node.slot.type !== "image");
    expect(previewText).toHaveLength(3);
    expect(previewText.every((node) => !node.hidden && node.content)).toBe(true);
    expect(previewText.find((node) => node.slot?.semanticRole === "description")?.content).toContain("在这里介绍内容亮点");
    expect(flatten(published.plan.root).filter((node) => node.slot).every((node) => node.hidden && node.content === undefined)).toBe(true);
    expect(flatten(preview.plan.root).map((node) => node.rules)).toEqual(flatten(published.plan.root).map((node) => node.rules));
  }
  expect(JSON.stringify(definition)).toBe(beforePreview);
});

test("旧显式配方与编辑后的正式默认内容保持原样，包括与系统样例相同的文字", () => {
  for (const presetVersion of [1, 2]) {
    const recipe = createRecommendedRecipe("general");
    recipe.presetVersion = presetVersion;
    recipe.content = [
      { ...createContentSlot("title"), defaultContent: "主标题" },
      { ...createContentSlot("description"), defaultContent: "经确认的作品说明" },
      { ...createContentSlot("cta"), defaultContent: "了解详情" },
    ];
    recipe.media = [{ ...createMediaSlots(["heroImage"])[0], defaultImage: "/images/approved.jpg" }];
    const source = structuredClone(recipe);
    const definition = generateTemplateFromRecipe(recipe);
    expect(recipe).toEqual(source);
    expect(definition.templateRecipe).toEqual(source);
    const slotFor = (role: string) => Object.values(definition.slots).find((slot) => slot.semanticRole === role)!;
    expect(definition.defaultContent[slotFor("title").slotId]).toBe("主标题");
    expect(definition.defaultContent[slotFor("description").slotId]).toBe("经确认的作品说明");
    expect(definition.defaultContent[slotFor("cta").slotId]).toEqual({ label: "了解详情", targetType: "none" });
    expect(definition.defaultContent[slotFor("heroImage").slotId]).toEqual({ src: "/images/approved.jpg", alt: "主图片" });
    expect(createTemplateRecipePreviewContent(definition)).toEqual({});
    definition.defaultContent[slotFor("description").slotId] = "编辑后保存的真实说明";
    const reopened = JSON.parse(JSON.stringify(definition));
    const result = compileDynamicTemplateRenderPlan(reopened, { device: "desktop" });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).toContain("编辑后保存的真实说明");
    expect(reopened.defaultContent).toEqual(definition.defaultContent);
  }
});

for (const [layout, label] of LAYOUTS) {
  test(`${label} × 八种画幅 × 媒体数量均合法且保持手机阅读顺序`, () => {
    for (const canvas of CANVAS_PRESETS) for (const media of MEDIA_PRESETS) {
      const recipe = createRecommendedRecipe();
      recipe.layout = layout;
      recipe.canvas = { width: canvas.width, height: canvas.height, aspectRatio: canvas.width / canvas.height };
      recipe.media = createMediaSlots(media.roles);
      const definition = generateTemplateFromRecipe(recipe);
      expect(validateDynamicTemplateDefinition(definition).issues.filter((issue) => issue.level === "error")).toEqual([]);
      expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);
      const stage = Object.values(definition.nodes).find((node) => node.type === "Stack")!;
      expect(resolveTemplateNodeRules(definition, stage.nodeId, "mobile").layoutMode).toBe("flow");
      for (const node of Object.values(definition.nodes).filter((item) => item.slotId)) {
        expect(resolveTemplateNodeRules(definition, node.nodeId, "mobile").placement).toBeUndefined();
        const placement = node.responsive.desktop.placement;
        if (!placement) { expect(Object.values(definition.nodes).some((parent) => parent.childIds.includes(node.nodeId) && parent.type === "Container")).toBe(true); continue; }
        expect(placement.width).toBeGreaterThan(0);
        expect(placement.height).toBeGreaterThan(0);
        expect(placement.x + placement.width).toBeLessThanOrEqual(1.00001);
        expect(placement.y + placement.height).toBeLessThanOrEqual(1.00001);
      }
    }
  });
}

test("不同用途与风格可生成纯图片、纯文字，充足空间容纳全部内容", () => {
  for (const [purpose] of PURPOSES) for (const [variant] of STYLES) {
    const recipe = createRecommendedRecipe(purpose);
    if (purpose === "custom") recipe.customPurpose = "自定义主题";
    recipe.style = styleFor(variant);
    recipe.content = [];
    recipe.media = createMediaSlots(["heroImage"]);
    expect(validateDynamicTemplateDefinition(generateTemplateFromRecipe(recipe)).valid).toBe(true);
    recipe.media = [];
    recipe.content = [createContentSlot("title")];
    expect(validateDynamicTemplateDefinition(generateTemplateFromRecipe(recipe)).valid).toBe(true);
    recipe.canvas = { width: 1080, height: 4096, aspectRatio: 1080 / 4096 };
    recipe.content = CONTENTS.map(([role]) => createContentSlot(role));
    expect(validateDynamicTemplateDefinition(generateTemplateFromRecipe(recipe)).valid).toBe(true);
  }
});

test("空方案与放不下的内容明确拒绝，保留完整配置", () => {
  const empty = createRecommendedRecipe("general");
  expect(() => generateTemplateFromRecipe(empty)).toThrow("至少选择一个");
  const crowded = createRecommendedRecipe();
  crowded.canvas = { width: 200, height: 200, aspectRatio: 1 };
  crowded.content = CONTENTS.map(([role]) => createContentSlot(role));
  const before = structuredClone(crowded);
  expect(() => generateTemplateFromRecipe(crowded)).toThrow("无法容纳");
  expect(crowded).toEqual(before);
});

test("新推荐准确，标题按短边计算，主副图有层级且卡片只有一组", () => {
  expect(createRecommendedRecipe().media.map((item) => item.role)).toEqual(["heroImage"]);
  expect(createRecommendedRecipe("event").content.map((item) => item.role)).toEqual(["title", "time", "location", "cta"]);
  expect(createRecommendedRecipe("profile").content.map((item) => item.role)).toEqual(["personName", "position", "biography"]);
  const recipe = createRecommendedRecipe();
  recipe.canvas = { width: 1920, height: 1080, aspectRatio: 16 / 9 };
  recipe.layout = "cards";
  recipe.media = createMediaSlots(["heroImage", "secondaryImage", "secondaryImage"]);
  recipe.media[0].borderRadius = 0;
  const definition = generateTemplateFromRecipe(recipe);
  const role = (name: string) => Object.values(definition.slots).find((item) => item.semanticRole === name)!;
  expect(role("title").desktopRules.fontSize).toEqual({ value: 65, unit: "px" });
  expect(role("subtitle").desktopRules.fontSize).toEqual({ value: 34, unit: "px" });
  expect(role("originalPrice").desktopRules.fontSize).toEqual({ value: 18, unit: "px" });
  expect(role("price").desktopRules.fontSize).toEqual({ value: 68, unit: "px" });
  expect(Object.values(definition.nodes).filter((node) => node.name === "主内容卡片")).toHaveLength(1);
  const imageNode = (name: string) => Object.values(definition.nodes).find((node) => node.slotId === role(name).slotId)!;
  expect(imageNode("heroImage").responsive.desktop.radius).toEqual({ value: 0, unit: "px" });
  const hero = imageNode("heroImage").responsive.desktop.placement!;
  const secondary = imageNode("secondaryImage").responsive.desktop.placement!;
  expect(hero.width * hero.height).toBeGreaterThan(secondary.width * secondary.height * 2);
  expect(definition.templateRecipe?.presetVersion).toBe(2);
});

test("图片圆形、完整显示和自由比例使用最终生成参数，旧配方仍可读取", () => {
  const recipe = createRecommendedRecipe();
  recipe.media = createMediaSlots(["heroImage", "logo"]);
  Object.assign(recipe.media[0], { shape: "circle", fitMode: "contain" });
  const circle = generateTemplateFromRecipe(recipe);
  const image = Object.values(circle.nodes).find((node) => circle.slots[node.slotId!]?.semanticRole === "heroImage")!;
  expect(image.responsive.desktop.radius).toEqual({ value: 50, unit: "%" });
  expect(circle.slots[image.slotId!].desktopRules.objectFit).toBe("contain");
  recipe.presetVersion = 1;
  Object.assign(recipe.media[0], { shape: "rectangle", freeRatio: true });
  expect(validateDynamicTemplateDefinition(generateTemplateFromRecipe(recipe)).valid).toBe(true);
  recipe.media.push({ ...recipe.media[1], id: "duplicate-logo" });
  expect(() => generateTemplateFromRecipe(recipe)).toThrow("Logo 只需一个");
});

test("改用途只更新未手改段，返回上一步不重置内容", () => {
  const recipe = createRecommendedRecipe();
  recipe.content[0].defaultContent = "保留我的标题";
  recipe.layout = "free";
  const updated = changeRecipePurpose(recipe, "news", { content: true, layout: true });
  expect(updated.content).toEqual(recipe.content);
  expect(updated.layout).toBe("free");
  expect(updated.canvas).toEqual(createRecommendedRecipe("news").canvas);
});

test("拒绝无效尺寸、重复身份和默认文字超限", () => {
  const recipe = createRecommendedRecipe();
  recipe.canvas.width = 0;
  expect(() => generateTemplateFromRecipe(recipe)).toThrow();
  const duplicate = createRecommendedRecipe();
  duplicate.media.push({ ...duplicate.media[0] });
  expect(() => generateTemplateFromRecipe(duplicate)).toThrow();
  const long = createRecommendedRecipe();
  long.content[0].defaultContent = "长".repeat(1000);
  expect(() => generateTemplateFromRecipe(long)).toThrow();
});

test("同类内容多次添加仍是独立槽位，中央标题只提取第一个", () => {
  const recipe = createRecommendedRecipe("newProduct");
  recipe.content = [createContentSlot("title", "first"), createContentSlot("title", "second"), createContentSlot("customText", "custom-one"), createContentSlot("customText", "custom-two")];
  const definition = generateTemplateFromRecipe(recipe);
  const titles = Object.values(definition.nodes).filter((node) => definition.slots[node.slotId!]?.semanticRole === "title");
  expect(titles).toHaveLength(2);
  expect(titles.filter((node) => node.responsive.desktop.placement)).toHaveLength(1);
  const group = Object.values(definition.nodes).find((node) => node.name === "内容区域")!;
  expect(group.childIds).toHaveLength(3);
  expect(new Set(Object.keys(definition.slots)).size).toBe(6);
});

test("全幅布局主图铺满画布并承载前景内容，显式背景优先", () => {
  const recipe = createRecommendedRecipe();
  recipe.layout = "fullImageOverlay";
  const definition = generateTemplateFromRecipe(recipe);
  const image = Object.values(definition.nodes).find((node) => node.type === "ImageSlot")!;
  expect(image.responsive.desktop.placement).toEqual({ x: 0, y: 0, width: 1, height: 1, zIndex: 0 });
  expect(definition.slots[image.slotId!].desktopRules.aspectRatio).toBe("4:5");
  const group = Object.values(definition.nodes).find((node) => node.name === "内容区域")!;
  expect(group.responsive.desktop.backgroundColor).toBe(recipe.style.backgroundColor);
  expect(group.responsive.desktop.placement?.zIndex).toBeGreaterThan(0);
  recipe.media = createMediaSlots(["backgroundImage", "heroImage"]);
  const explicit = generateTemplateFromRecipe(recipe);
  const images = Object.values(explicit.nodes).filter((node) => node.type === "ImageSlot");
  expect(images.filter((node) => node.responsive.desktop.placement?.width === 1)).toHaveLength(1);
  expect(explicit.slots[images[0].slotId!].semanticRole).toBe("backgroundImage");
});

test("图片组合切换按角色保留身份和独立设置，新增图片不重用已有身份", async () => {
  const { selectRecipeMediaPreset } = await import("../src/page-builder/template-creation/mediaSelection");
  const media = createMediaSlots(["heroImage", "secondaryImage", "secondaryImage", "custom"]);
  Object.assign(media[0], { name: "保留主图", shape: "circle", fitMode: "contain", borderRadius: 8 });
  Object.assign(media[1], { name: "副图甲", aspectRatio: .75, borderRadius: 24 });
  Object.assign(media[2], { name: "副图乙", aspectRatio: 16 / 9, freeRatio: true });
  const original = structuredClone(media);
  const selected = selectRecipeMediaPreset(media, ["secondaryImage", "heroImage", "secondaryImage", "logo", "backgroundImage", "secondaryImage"], 32);
  expect(selected.slice(0, 3)).toEqual([media[1], media[0], media[2]]);
  expect(selected[3]).toMatchObject({ role: "logo", borderRadius: 0, fitMode: "contain" });
  expect(selected[4]).toMatchObject({ role: "backgroundImage", borderRadius: 0 });
  expect(selected[5]).toMatchObject({ role: "secondaryImage", borderRadius: 32 });
  expect(selected.slice(3).every((slot) => !media.some((existing) => existing.id === slot.id))).toBe(true);
  expect(new Set(selected.map((slot) => slot.id)).size).toBe(selected.length);
  expect(selectRecipeMediaPreset(media, [], 32)).toEqual([]);
  expect(selectRecipeMediaPreset(media, media.map((slot) => slot.role), 32)).toEqual(media);
  selected[0].name = "修改返回副本";
  expect(media).toEqual(original);
});

test("自定义图片删除后再添加不产生重名，圆角恢复与圆形约束保留独立设置", async () => {
  const { nextCustomMediaName, resolveMediaShapeChange } = await import("../src/page-builder/template-creation/mediaSelection");
  const media = createMediaSlots(["custom", "custom"]);
  media[0].name = "图片 1";
  media[1].name = " 图片 3 ";
  expect(nextCustomMediaName(media)).toBe("图片 2");
  expect(nextCustomMediaName([])).toBe("图片 1");
  Object.assign(media[0], { aspectRatio: .75, freeRatio: true, fitMode: "contain", borderRadius: 16 });
  const original = structuredClone(media[0]);
  const circle = { ...media[0], ...resolveMediaShapeChange(media[0], "circle") };
  expect(circle).toMatchObject({ shape: "circle", aspectRatio: 1, freeRatio: false, fitMode: "contain", borderRadius: 16 });
  const restored = { ...circle, ...resolveMediaShapeChange(circle, "inherited") };
  expect(restored).toMatchObject({ shape: "rectangle", borderRadius: 16, aspectRatio: 1, fitMode: "contain" });
  expect(resolveMediaShapeChange(media[0], "rounded")).toEqual({ shape: "rectangle", borderRadius: 24 });
  expect(resolveMediaShapeChange(media[0], "square")).toEqual({ shape: "rectangle", borderRadius: 0 });
  expect(media[0]).toEqual(original);
});
