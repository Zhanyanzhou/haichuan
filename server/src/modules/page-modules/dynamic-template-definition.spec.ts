import assert from "node:assert/strict";
import test from "node:test";
import {
  sanitizeContentTemplateDesignProps,
  validateDynamicTemplateDefinition,
  validateDynamicTemplatePublishDefinition,
  validateTemplateRecipe,
  isSafeTemplateMediaUrl,
  getDynamicTemplateStructureLockViolation,
} from "./generated/validateTemplateDefinition.generated";
import { DYNAMIC_TEMPLATE_NODE_TYPES } from "./generated/templateDefinition.generated";
import { definitionFixture } from "./dynamic-template-test-fixture";
import type { TemplateRecipe } from "./generated/templateDefinition.generated";

function recipeFixture(): TemplateRecipe {
  return {
    recipeVersion: 1, presetVersion: 1, purpose: "productPromotion",
    canvas: { width: 1080, height: 1350, aspectRatio: 0.8 }, layout: "topImageBottomContent",
    media: [{ id: "hero", role: "heroImage", name: "主图", aspectRatio: 1, fitMode: "contain", borderRadius: 8, replaceable: true, allowCrop: true }],
    content: [{ id: "title", role: "title", name: "标题", defaultContent: "新品", maxLength: 60, editable: true }],
    style: { variant: "minimal", background: "light", primaryColor: "#b69b68", backgroundColor: "#fff", textColor: "#222", radius: "medium", spacing: "standard" },
    rules: { aspectLocked: true },
  };
}

test("Recipe 严格验证选项、未知字段、槽位标识、尺寸及默认素材", () => {
  assert.equal(validateTemplateRecipe(recipeFixture()).valid, true);
  const mutations: Array<(recipe: any) => void> = [
    (recipe) => { recipe.purpose = "unknown"; },
    (recipe) => { recipe.recipeVersion = 2; },
    (recipe) => { recipe.style.extra = true; },
    (recipe) => { recipe.content[0].id = "hero"; },
    (recipe) => { recipe.content[0].maxLength = 1; },
    (recipe) => { recipe.canvas.aspectRatio = 1; },
    (recipe) => { recipe.media[0].defaultImage = "javascript:alert(1)"; },
    (recipe) => { recipe.purpose = "custom"; },
  ];
  for (const mutate of mutations) {
    const recipe = recipeFixture(); mutate(recipe);
    assert.equal(validateTemplateRecipe(recipe).valid, false);
  }
  for (const url of ["https://example.com/a.jpg", "/uploads/a.jpg"]) assert.equal(isSafeTemplateMediaUrl(url), true);
  for (const url of ["//example.com/a.jpg", "https://user:pass@example.com/a.jpg", "data:image/png;base64,a", "/\\example.com/a", "javascript:alert(1)", "/a b.jpg", "/a\u0000.jpg", "/a\u007f.jpg"]) assert.equal(isSafeTemplateMediaUrl(url), false);
});

test("schema3 保存 Recipe 与默认文案，旧 schema 保持原有空值语义", () => {
  const current = definitionFixture();
  current.schemaVersion = 3;
  current.templateRecipe = recipeFixture();
  current.defaultContent.slot_heading = "新品";
  current.slots.slot_heading.semanticRole = "title";
  current.slots.slot_heading.desktopRules = { ...current.slots.slot_heading.desktopRules, color: "#222", fontFamily: "serif", letterSpacing: 1 };
  current.nodes.node_container.responsive.desktop.backgroundColor = "#fff";
  current.nodes.node_container.responsive.desktop.backgroundGradient = { from: "#fff", to: "#eee", angle: 90 };
  current.nodes.node_container.responsive.mobile.backgroundGradient = null;
  current.nodes.node_container.responsive.mobile.backgroundImage = "";
  assert.equal(validateDynamicTemplateDefinition(current).valid, true);
  assert.equal(validateDynamicTemplatePublishDefinition(current).valid, true);
  const preview = structuredClone(current); preview.previewContent = { slot_heading: "临时预览" };
  assert.equal(validateDynamicTemplateDefinition(preview).valid, false);
  const longText = structuredClone(current); longText.defaultContent.slot_heading = "长".repeat(61);
  assert.equal(validateDynamicTemplateDefinition(longText).valid, false);
  const legacy = definitionFixture(); legacy.schemaVersion = 2; legacy.defaultContent.slot_heading = "旧模板不能新增默认值";
  assert.equal(validateDynamicTemplateDefinition(legacy).valid, false);
  const unknown = structuredClone(current) as any; unknown.templateRecipe.style.padding = 10;
  assert.equal(validateDynamicTemplateDefinition(unknown).valid, false);
  const locked = structuredClone(current); locked.nodes.node_container.authoring = { structureLocked: true };
  const changed = structuredClone(locked); changed.defaultContent.slot_heading = "修改";
  assert.match(getDynamicTemplateStructureLockViolation(locked, changed) ?? "", /默认内容/);
});

test("schema3 默认媒体与 CTA 使用原生内容结构并拒绝不安全地址", () => {
  const definition = definitionFixture(); definition.schemaVersion = 3;
  definition.nodes.node_heading.type = "ImageSlot";
  delete definition.nodes.node_heading.instanceEditPolicy;
  definition.slots.slot_heading.type = "image";
  definition.defaultContent.slot_heading = { src: "/uploads/product.jpg", alt: "商品" };
  assert.equal(validateDynamicTemplateDefinition(definition).valid, true);
  definition.defaultContent.slot_heading = { src: "javascript:alert(1)", alt: "商品" };
  assert.equal(validateDynamicTemplateDefinition(definition).valid, false);
  definition.nodes.node_heading.type = "ButtonSlot"; definition.slots.slot_heading.type = "button";
  definition.defaultContent.slot_heading = { label: "了解详情" };
  assert.equal(validateDynamicTemplateDefinition(definition).valid, true);
  definition.defaultContent.slot_heading = { label: "了解详情", url: "javascript:alert(1)" };
  assert.equal(validateDynamicTemplateDefinition(definition).valid, false);
});

test("服务端使用与客户端同源的动态模板语义校验器", () => {
  const result = validateDynamicTemplateDefinition(definitionFixture());
  assert.equal(result.valid, true);
  assert.equal(result.definition?.templateId, "tpl_server_validation");

  const authoringLocked = definitionFixture();
  authoringLocked.nodes.node_container.authoring = { structureLocked: true };
  assert.equal(validateDynamicTemplateDefinition(authoringLocked).valid, true);

  const invalidAuthoring = structuredClone(authoringLocked) as any;
  invalidAuthoring.nodes.node_container.authoring = {
    structureLocked: "yes",
    unsafeField: true,
  };
  const authoringCodes = validateDynamicTemplateDefinition(invalidAuthoring).issues.map(
    (issue) => issue.code,
  );
  assert.ok(authoringCodes.includes("INVALID_STRUCTURE_LOCK"));
  assert.ok(authoringCodes.includes("UNKNOWN_PROPERTY"));

  const requiredReadOnly = definitionFixture();
  requiredReadOnly.slots.slot_heading.required = true;
  requiredReadOnly.slots.slot_heading.editable = false;
  assert.ok(validateDynamicTemplateDefinition(requiredReadOnly).issues.some(
    (issue) => issue.code === "REQUIRED_SLOT_MUST_BE_EDITABLE",
  ));
});

test("双图片槽位比例属于可保存的通用模板设计字段", () => {
  assert.deepEqual(
    sanitizeContentTemplateDesignProps({
      mainImageRatio: "3:2",
      detailImageRatio: "4:5",
    }),
    {
      mainImageRatio: "3:2",
      detailImageRatio: "4:5",
    },
  );
});

test("发布门禁以根节点高度为唯一尺寸事实并禁止模板保存运营或 Mock 内容", () => {
  const fixed = definitionFixture();
  fixed.metadata.previewDesktopWidth = 1920;
  fixed.metadata.desktopRatio = "8:1";
  fixed.nodes.node_root.responsive.desktop.height = {
    mode: "fixed",
    value: { value: 240, unit: "px" },
  };
  assert.equal(validateDynamicTemplatePublishDefinition(fixed).valid, true);

  const ratio = structuredClone(fixed);
  ratio.nodes.node_root.responsive.desktop.height = {
    mode: "aspect-ratio",
    ratio: { width: 8, height: 1 },
  };
  assert.equal(validateDynamicTemplatePublishDefinition(ratio).valid, true);

  const mismatched = structuredClone(fixed);
  mismatched.metadata.desktopRatio = "16:9";
  assert.ok(validateDynamicTemplatePublishDefinition(mismatched).issues.some(
    (issue) => issue.code === "ROOT_RATIO_METADATA_MISMATCH",
  ));

  const contentLeak = structuredClone(fixed);
  contentLeak.defaultContent.slot_heading = "正式运营标题";
  contentLeak.previewContent = { slot_heading: "Mock 标题" };
  const leakCodes = validateDynamicTemplatePublishDefinition(contentLeak).issues.map((issue) => issue.code);
  assert.ok(leakCodes.includes("PUBLISH_FORBIDS_DEFAULT_CONTENT"));
  assert.ok(leakCodes.includes("PUBLISH_FORBIDS_MOCK_CONTENT"));

  const legacyEmptyPolicy = structuredClone(fixed);
  legacyEmptyPolicy.slots.slot_heading.emptyPolicy = "use-default";
  assert.ok(validateDynamicTemplatePublishDefinition(legacyEmptyPolicy).issues.some(
    (issue) => issue.code === "PUBLISH_FORBIDS_LEGACY_EMPTY_POLICY",
  ));

  const forbiddenPolicy = structuredClone(fixed);
  forbiddenPolicy.slots.slot_heading.editable = false;
  const policyCodes = validateDynamicTemplatePublishDefinition(forbiddenPolicy).issues.map((issue) => issue.code);
  assert.ok(policyCodes.includes("NON_EDITABLE_SLOT_HAS_INSTANCE_PERMISSIONS"));
});

test("发布必须填写名称，合法未命名草稿仍可保存", () => {
  const unnamed = definitionFixture();
  unnamed.name = "未命名模板";
  assert.equal(validateDynamicTemplateDefinition(unnamed).valid, true);
  const result = validateDynamicTemplatePublishDefinition(unnamed);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "PUBLISH_REQUIRES_TEMPLATE_NAME" && issue.path === "name"));
});

test("固定高度区域的自动高度图片只建议检查，不阻断发布", () => {
  const overflowing = definitionFixture();
  overflowing.nodes.node_container.childIds.push("node_image");
  overflowing.nodes.node_container.responsive.desktop.height = {
    mode: "fixed",
    value: { value: 240, unit: "px" },
  };
  overflowing.nodes.node_container.responsive.mobile.height = {
    mode: "fixed",
    value: { value: 280, unit: "px" },
  };
  overflowing.nodes.node_image = {
    nodeId: "node_image",
    type: "ImageSlot",
    name: "主图",
    slotId: "slot_image",
    childIds: [],
    props: {},
    responsive: {
      desktop: { display: "block", order: 1, width: "fill", height: { mode: "auto" } },
      mobile: { display: "block", order: 1, width: "fill", height: { mode: "auto" } },
    },
    hidden: false,
  };
  overflowing.slots.slot_image = {
    slotId: "slot_image",
    key: "mainImage",
    type: "image",
    label: "主图",
    required: false,
    editable: true,
    hideable: true,
    validation: {},
    desktopRules: { objectFit: "cover" },
    mobileRules: { objectFit: "cover" },
  };

  const result = validateDynamicTemplatePublishDefinition(overflowing);
  assert.equal(result.valid, true);
  assert.ok(result.issues.some(
    (issue) => issue.code === "IMAGE_SLOT_AUTO_HEIGHT_OVERFLOWS_BOUNDED_PARENT" && issue.level === "warning",
  ));

  const contained = structuredClone(overflowing);
  contained.nodes.node_image.responsive.desktop.height = {
    mode: "fixed",
    value: { value: 240, unit: "px" },
  };
  contained.nodes.node_image.responsive.mobile.height = {
    mode: "fixed",
    value: { value: 280, unit: "px" },
  };
  assert.equal(validateDynamicTemplatePublishDefinition(contained).valid, true);
});

test("发布门禁拒绝全局或按设备隐藏必填槽位", () => {
  const globallyHidden = definitionFixture();
  globallyHidden.slots.slot_heading.required = true;
  globallyHidden.nodes.node_heading.hidden = true;
  assert.ok(validateDynamicTemplatePublishDefinition(globallyHidden).issues.some(
    (issue) => issue.code === "PUBLISH_REQUIRED_SLOT_HIDDEN",
  ));

  const desktopHidden = definitionFixture();
  desktopHidden.slots.slot_heading.required = true;
  desktopHidden.nodes.node_heading.responsive.desktop.display = "none";
  const desktopResult = validateDynamicTemplatePublishDefinition(desktopHidden);
  assert.equal(desktopResult.valid, false);
  assert.ok(desktopResult.issues.some((issue) => (
    issue.code === "PUBLISH_REQUIRED_SLOT_DEVICE_HIDDEN"
    && issue.path === "nodes.node_heading.responsive.desktop.display"
  )));

  const pageHideConflict = definitionFixture();
  pageHideConflict.slots.slot_heading.required = true;
  pageHideConflict.slots.slot_heading.hideable = true;
  assert.ok(validateDynamicTemplatePublishDefinition(pageHideConflict).issues.some((issue) => (
    issue.code === "PUBLISH_REQUIRED_SLOT_PAGE_HIDE_CONFLICT"
    && issue.path === "slots.slot_heading.hideable"
  )));
});

test("服务端拒绝未声明属性、循环和非法视口高度", () => {
  const invalid = definitionFixture();
  (invalid.nodes.node_heading as unknown as Record<string, unknown>).unsafeStyle = "position:fixed";
  invalid.nodes.node_container.childIds.push("node_root");
  invalid.nodes.node_root.responsive.mobile.height = {
    mode: "viewport",
    value: { value: 80, unit: "px" },
  };
  const codes = validateDynamicTemplateDefinition(invalid).issues.map((issue) => issue.code);
  assert.ok(codes.includes("UNKNOWN_PROPERTY"));
  assert.ok(codes.includes("NODE_CYCLE"));
  assert.ok(codes.includes("INVALID_VIEWPORT_HEIGHT_UNIT"));
});

test("服务端接受双端独立自由 Stack，并拒绝越界、非法父级和自动高度", () => {
  const valid = definitionFixture();
  valid.nodes.node_container.type = "Stack";
  valid.nodes.node_container.responsive.desktop = {
    ...valid.nodes.node_container.responsive.desktop,
    display: "block",
    layoutMode: "free",
    height: { mode: "fixed", value: { value: 420, unit: "px" } },
  };
  valid.nodes.node_heading.responsive.desktop.placement = { x: 0.1, y: 0.2, width: 0.8, height: 0.5, zIndex: 1 };
  assert.equal(validateDynamicTemplateDefinition(valid).valid, true);

  const outOfBounds = structuredClone(valid);
  outOfBounds.nodes.node_heading.responsive.desktop.placement = { x: 0.8, y: 0.2, width: 0.4, height: 0.5, zIndex: 1 };
  assert.ok(validateDynamicTemplateDefinition(outOfBounds).issues.some((issue) => issue.code === "PLACEMENT_OUT_OF_BOUNDS"));

  const flowParent = structuredClone(valid);
  flowParent.nodes.node_container.responsive.desktop.layoutMode = "flow";
  assert.ok(validateDynamicTemplateDefinition(flowParent).issues.some((issue) => issue.code === "PLACEMENT_REQUIRES_FREE_STACK_PARENT"));

  const autoHeight = structuredClone(valid);
  autoHeight.nodes.node_container.responsive.desktop.height = { mode: "auto" };
  assert.ok(validateDynamicTemplateDefinition(autoHeight).issues.some((issue) => issue.code === "FREE_LAYOUT_REQUIRES_FIXED_HEIGHT"));
});

test("模板页面职责与导航兼容性使用受控元数据", () => {
  const valid = definitionFixture();
  valid.metadata.visualRole = "primary-stage";
  valid.metadata.headerCompatibility = ["solid", "overlay-light"];
  assert.equal(validateDynamicTemplateDefinition(valid).valid, true);

  const invalid = definitionFixture();
  (invalid.metadata as unknown as Record<string, unknown>).visualRole = "full-screen-guess";
  (invalid.metadata as unknown as Record<string, unknown>).headerCompatibility = ["overlay-light", "overlay-light"];
  const codes = validateDynamicTemplateDefinition(invalid).issues.map((issue) => issue.code);
  assert.ok(codes.includes("INVALID_VISUAL_ROLE"));
  assert.ok(codes.includes("INVALID_HEADER_COMPATIBILITY"));
});

test("服务端接受成熟首屏 V2 适配节点并拒绝未清洗字段和旧数字商品引用", () => {
  assert.ok((DYNAMIC_TEMPLATE_NODE_TYPES as readonly string[]).includes("HeroTemplate"));
  const valid = definitionFixture();
  valid.nodes.node_hero_template = {
    nodeId: "node_hero_template",
    type: "HeroTemplate",
    name: "首屏主视觉组件",
    slotId: "slot_hero_template",
    childIds: [],
    props: {
      contentTemplateDesignProps: { alignment: "center", desktopFocusX: 50 },
    },
    responsive: {
      desktop: { display: "block", order: 2, width: "fill", height: { mode: "auto" } },
      mobile: { display: "block", order: 2, width: "fill", height: { mode: "auto" } },
    },
    hidden: false,
  };
  valid.nodes.node_container.childIds.push("node_hero_template");
  valid.slots.slot_hero_template = {
    slotId: "slot_hero_template",
    key: "heroTemplateContent",
    type: "heroTemplate",
    label: "首屏主视觉组件",
    required: false,
    editable: true,
    hideable: true,
    validation: {},
    desktopRules: {},
    mobileRules: {},
  };
  valid.defaultContent.slot_hero_template = {
    desktopImage: "https://example.com/hero.jpg",
    mobileImage: "https://example.com/hero-mobile.jpg",
    title: "光，沿线而生",
    targetType: "product",
    productCode: "P-100",
  };
  assert.equal(validateDynamicTemplateDefinition(valid).valid, true);

  const numericReference = structuredClone(valid);
  numericReference.defaultContent.slot_hero_template = {
    ...numericReference.defaultContent.slot_hero_template as Record<string, unknown>,
    productId: 12,
  };
  assert.ok(validateDynamicTemplateDefinition(numericReference).issues.some(
    (issue) => issue.code === "DEFAULT_CONTENT_TYPE_MISMATCH",
  ));

  const unknownField = structuredClone(valid);
  unknownField.defaultContent.slot_hero_template = {
    ...unknownField.defaultContent.slot_hero_template as Record<string, unknown>,
    unsafeCss: "position:fixed",
  };
  assert.ok(validateDynamicTemplateDefinition(unknownField).issues.some(
    (issue) => issue.code === "DEFAULT_CONTENT_TYPE_MISMATCH",
  ));

  const unsafeDesignProps = structuredClone(valid);
  unsafeDesignProps.nodes.node_hero_template.props.contentTemplateDesignProps = {
    unsafeCss: "position:fixed",
  } as unknown as Record<string, string | number | boolean>;
  assert.ok(validateDynamicTemplateDefinition(unsafeDesignProps).issues.some(
    (issue) => issue.code === "INVALID_CONTENT_TEMPLATE_DESIGN_PROPS",
  ));

  const controlCharacterDesignProps = structuredClone(valid);
  controlCharacterDesignProps.nodes.node_hero_template.props.contentTemplateDesignProps = {
    alignment: "center\u0001",
  };
  assert.ok(validateDynamicTemplateDefinition(controlCharacterDesignProps).issues.some(
    (issue) => issue.code === "INVALID_CONTENT_TEMPLATE_DESIGN_PROPS",
  ));
});
