import assert from "node:assert/strict";
import test from "node:test";
import { validateDynamicTemplateDefinition } from "./generated/validateTemplateDefinition.generated";
import { DYNAMIC_TEMPLATE_NODE_TYPES } from "./generated/templateDefinition.generated";
import { definitionFixture } from "./dynamic-template-test-fixture";

test("服务端使用与客户端同源的动态模板语义校验器", () => {
  const result = validateDynamicTemplateDefinition(definitionFixture());
  assert.equal(result.valid, true);
  assert.equal(result.definition?.templateId, "tpl_server_validation");
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

test("服务端接受注册的视频复杂节点并拒绝非法播放配置", () => {
  assert.ok((DYNAMIC_TEMPLATE_NODE_TYPES as readonly string[]).includes("Video"));
  const valid = definitionFixture();
  valid.nodes.node_video = {
    nodeId: "node_video",
    type: "Video",
    name: "品牌影片",
    slotId: "slot_video",
    childIds: [],
    props: {},
    responsive: {
      desktop: { display: "block", order: 2, width: "fill", height: { mode: "auto" } },
      mobile: { display: "block", order: 2, width: "fill", height: { mode: "auto" } },
    },
    hidden: false,
  };
  valid.nodes.node_container.childIds.push("node_video");
  valid.slots.slot_video = {
    slotId: "slot_video",
    key: "brandVideo",
    type: "video",
    label: "品牌影片",
    required: true,
    editable: true,
    hideable: false,
    validation: {},
    desktopRules: {},
    mobileRules: {},
  };
  valid.defaultContent.slot_video = {
    videoUrl: "https://example.com/video.mp4",
    posterUrl: "https://example.com/poster.jpg",
    videoDescription: "品牌影片",
    autoPlay: false,
    loop: true,
    muted: true,
    showControls: true,
    aspectRatio: "16:9",
  };
  assert.equal(validateDynamicTemplateDefinition(valid).valid, true);

  const invalid = structuredClone(valid);
  invalid.defaultContent.slot_video = { videoUrl: "https://example.com/video.mp4", autoPlay: "yes" };
  const codes = validateDynamicTemplateDefinition(invalid).issues.map((issue) => issue.code);
  assert.ok(codes.includes("DEFAULT_CONTENT_TYPE_MISMATCH"));
});

test("服务端接受轮播、热区、前后对比和预约复杂节点并校验结构化内容", () => {
  for (const nodeType of ["Carousel", "Hotspot", "BeforeAfter", "Appointment"]) {
    assert.ok((DYNAMIC_TEMPLATE_NODE_TYPES as readonly string[]).includes(nodeType));
  }
  const valid = definitionFixture();
  const entries = [
    ["carousel", "Carousel", {
      images: [{ url: "https://example.com/banner.jpg", alt: "轮播图片", targetType: "none" }],
      autoPlay: false,
      interval: 4000,
      showDots: true,
      showArrows: true,
      desktopRatio: "wide",
      mobileRatio: "portrait",
    }],
    ["hotspot", "Hotspot", {
      image: "https://example.com/scene.jpg",
      hotspots: [{ x: 20, y: 20, width: 30, height: 20, targetType: "none" }],
      mobileHotspots: [],
    }],
    ["before_after", "BeforeAfter", {
      title: "珠宝改款",
      beforeImage: "https://example.com/before.jpg",
      afterImage: "https://example.com/after.jpg",
      beforeFocusX: 50,
      beforeFocusY: 50,
      afterFocusX: 50,
      afterFocusY: 50,
      targetType: "none",
      aspectRatio: "4:5",
    }],
    ["appointment", "Appointment", {
      title: "预约鉴赏",
      buttonText: "立即预约",
      targetType: "page",
      linkUrl: "/contact",
      tone: "ivory",
    }],
  ] as const;
  entries.forEach(([key, nodeType, content], index) => {
    const nodeId = `node_${key}`;
    const slotId = `slot_${key}`;
    valid.nodes[nodeId] = {
      nodeId,
      type: nodeType,
      name: nodeType,
      slotId,
      childIds: [],
      props: {},
      responsive: {
        desktop: { display: "block", order: index + 2, width: "fill", height: { mode: "auto" } },
        mobile: { display: "block", order: index + 2, width: "fill", height: { mode: "auto" } },
      },
      hidden: false,
    };
    valid.nodes.node_container.childIds.push(nodeId);
    valid.slots[slotId] = {
      slotId,
      key: `${key}Content`,
      type: key === "before_after" ? "beforeAfter" : key,
      label: nodeType,
      required: false,
      editable: true,
      hideable: true,
      validation: {},
      desktopRules: {},
      mobileRules: {},
    };
    valid.defaultContent[slotId] = content;
  });
  assert.equal(validateDynamicTemplateDefinition(valid).valid, true);

  const invalid = structuredClone(valid);
  invalid.defaultContent.slot_hotspot = {
    image: "https://example.com/scene.jpg",
    hotspots: [{ x: 90, y: 10, width: 20, height: 20 }],
    mobileHotspots: [],
  };
  const codes = validateDynamicTemplateDefinition(invalid).issues.map((issue) => issue.code);
  assert.ok(codes.includes("DEFAULT_CONTENT_TYPE_MISMATCH"));
});

test("服务端接受业务节点的稳定引用并拒绝旧数字 ID 快照", () => {
  for (const nodeType of ["ProductCard", "ProductCollection", "CategoryCollection"]) {
    assert.ok((DYNAMIC_TEMPLATE_NODE_TYPES as readonly string[]).includes(nodeType));
  }
  const valid = definitionFixture();
  const entries = [
    ["product_card", "ProductCard", "productCard", {
      title: "代表作品",
      productCode: "P-100",
      secondaryTargetType: "category",
      secondaryCategorySlug: "rings",
      layout: "imageLeft",
      showPrice: false,
    }],
    ["product_collection", "ProductCollection", "productCollection", {
      title: "精选商品",
      productCodes: ["P-100", "P-200"],
      layout: "grid-3",
      mobileColumns: "2",
      displayMode: "standard",
      actionStyle: "text",
    }],
    ["category_collection", "CategoryCollection", "categoryCollection", {
      title: "探索分类",
      categorySlugs: ["rings", "bracelets"],
      layout: "grid-2",
    }],
  ] as const;
  entries.forEach(([key, nodeType, slotType, content], index) => {
    const nodeId = `node_${key}`;
    const slotId = `slot_${key}`;
    valid.nodes[nodeId] = {
      nodeId,
      type: nodeType,
      name: nodeType,
      slotId,
      childIds: [],
      props: {},
      responsive: {
        desktop: { display: "block", order: index + 2, width: "fill", height: { mode: "auto" } },
        mobile: { display: "block", order: index + 2, width: "fill", height: { mode: "auto" } },
      },
      hidden: false,
    };
    valid.nodes.node_container.childIds.push(nodeId);
    valid.slots[slotId] = {
      slotId,
      key: `${key}Content`,
      type: slotType,
      label: nodeType,
      required: false,
      editable: true,
      hideable: true,
      validation: {},
      desktopRules: {},
      mobileRules: {},
    };
    valid.defaultContent[slotId] = content;
  });
  assert.equal(validateDynamicTemplateDefinition(valid).valid, true);

  const invalid = structuredClone(valid);
  invalid.defaultContent.slot_product_collection = {
    productIds: [12, 34],
    productCodes: ["P-100"],
  };
  const codes = validateDynamicTemplateDefinition(invalid).issues.map((issue) => issue.code);
  assert.ok(codes.includes("DEFAULT_CONTENT_TYPE_MISMATCH"));
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
