import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaService } from "../../common/prisma/prisma.service";
import {
  CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY,
  createContentTemplatePublicationAttestation,
} from "./content-template-contract";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  collectDynamicTemplateInstanceReferences,
  dynamicTemplateVersionKey,
  validateDynamicTemplateInstance,
} from "./dynamic-template-instance";
import { definitionFixture } from "./dynamic-template-test-fixture";
import { calculateDynamicTemplateDefinitionChecksum } from "./dynamic-template-definition-integrity";
import { PageModulesService } from "./page-modules.service";
import { makeFormalPageMetadata } from "./page-modules.spec-fixtures";
import type {
  DynamicTemplateNodeType,
  DynamicTemplateSlotType,
  TemplateDefinitionV2,
} from "./generated/templateDefinition.generated";

function instanceProps(overrides: Record<string, unknown> = {}) {
  return {
    id: "puck-instance-1",
    instanceSchemaVersion: 1,
    instanceId: "instance_1",
    templateId: "tpl_server_validation",
    templateVersion: 3,
    contentBySlotId: { slot_heading: "页面填写的标题" },
    overrides: {},
    hiddenSlotIds: [],
    isVisible: true,
    ...overrides,
  };
}

function addComplexSlot(
  definition: TemplateDefinitionV2,
  key: string,
  nodeType: DynamicTemplateNodeType,
  slotType: DynamicTemplateSlotType,
) {
  const nodeId = `node_${key}`;
  const slotId = `slot_${key}`;
  definition.nodes[nodeId] = {
    nodeId,
    type: nodeType,
    name: key,
    slotId,
    childIds: [],
    props: {},
    responsive: {
      desktop: { display: "block", order: 2, width: "fill", height: { mode: "auto" } },
      mobile: { display: "block", order: 2, width: "fill", height: { mode: "auto" } },
    },
    hidden: false,
  };
  definition.nodes.node_container.childIds.push(nodeId);
  definition.slots[slotId] = {
    slotId,
    key: `${key}Content`,
    type: slotType,
    label: key,
    required: false,
    editable: true,
    hideable: true,
    validation: {},
    desktopRules: {},
    mobileRules: {},
  };
}

test("动态页面实例只按 templateId + templateVersion 收集一次精确版本引用", () => {
  const referenceBlock = {
    type: DYNAMIC_TEMPLATE_BLOCK_TYPE,
    props: instanceProps(),
  };
  const references = collectDynamicTemplateInstanceReferences({
    content: [referenceBlock, referenceBlock, { type: "文字横幅", props: {} }],
    zones: {
      secondary: [{
        type: DYNAMIC_TEMPLATE_BLOCK_TYPE,
        props: instanceProps({ templateVersion: 4, instanceId: "instance_2" }),
      }],
    },
  });

  assert.deepEqual(references, [
    { templateId: "tpl_server_validation", templateVersion: 3, instanceId: "instance_1" },
    { templateId: "tpl_server_validation", templateVersion: 4, instanceId: "instance_2" },
  ]);
});

test("模板页面实例通过槽位合同校验且不会携带未授权结构覆盖", () => {
  const result = validateDynamicTemplateInstance(instanceProps(), definitionFixture());

  assert.equal(result.issues.length, 0);
  assert.equal(result.definition?.templateId, "tpl_server_validation");
  assert.deepEqual(result.assets, []);
  assert.deepEqual(result.productCodes, []);
  assert.deepEqual(result.actions, []);
});

test("必填槽位必须由页面实例提供，母模板正式默认内容只作历史兼容回退", () => {
  const definition = definitionFixture();
  definition.slots.slot_heading.required = true;
  definition.slots.slot_heading.hideable = false;
  definition.defaultContent.slot_heading = "历史母模板默认标题";
  const result = validateDynamicTemplateInstance(instanceProps({ contentBySlotId: {} }), definition);

  assert.ok(result.issues.some((issue) => (
    issue.field === "slot_heading" && issue.message.includes("必填内容")
  )));
  const populated = validateDynamicTemplateInstance(instanceProps({
    contentBySlotId: { slot_heading: "页面实例已填写标题" },
  }), definition);
  assert.equal(populated.issues.length, 0);
});

test("页面实例稳定身份与整体显隐状态遵循 V2 合同", () => {
  const result = validateDynamicTemplateInstance(instanceProps({
    instanceId: "包含空格的实例",
    isVisible: "false",
    hiddenSlotIds: [12, "slot heading"],
  }), definitionFixture());
  const messages = result.issues.map((issue) => issue.message);

  assert.ok(messages.some((message) => message.includes("实例 ID 格式无效")));
  assert.ok(messages.some((message) => message.includes("显示状态必须是布尔值")));
  assert.equal(messages.filter((message) => message.includes("隐藏槽位必须使用合法 slotId")).length, 2);
});

test("动态页面实例拒绝未知槽位、超长文字、非法隐藏和结构覆盖", () => {
  const result = validateDynamicTemplateInstance(instanceProps({
    contentBySlotId: {
      slot_heading: "超".repeat(61),
      slot_unknown: "不应写入",
    },
    hiddenSlotIds: ["slot_heading", "slot_heading"],
    overrides: { layout: "page-owned" },
  }), definitionFixture());
  const messages = result.issues.map((issue) => issue.message);

  assert.ok(messages.some((message) => message.includes("未声明槽位")));
  assert.ok(messages.some((message) => message.includes("最多允许 60 个字符")));
  assert.ok(messages.some((message) => message.includes("隐藏槽位不能重复")));
  assert.ok(messages.some((message) => message.includes("旧版结构覆盖不受支持")));
});

test("页面实例拒绝注入母模板节点定义、内部构图或展示参数", () => {
  const result = validateDynamicTemplateInstance(instanceProps({
    nodeDefinitions: { unsafe: true },
    contentTemplateLayoutData: { version: 2 },
    contentTemplateDesignProps: { layout: "grid-99" },
  }), definitionFixture());
  const messages = result.issues.map((issue) => issue.message);
  assert.ok(messages.some((message) => message.includes("未授权字段 nodeDefinitions")));
  assert.ok(messages.some((message) => message.includes("未授权字段 contentTemplateLayoutData")));
  assert.ok(messages.some((message) => message.includes("未授权字段 contentTemplateDesignProps")));
});

test("页面实例构图覆盖只允许母模板授权节点与安全范围", () => {
  const definition = definitionFixture();
  addComplexSlot(definition, "lockedText", "TextSlot", "text");
  const valid = validateDynamicTemplateInstance(instanceProps({
    layoutOverridesByNodeId: {
      node_heading: {
        desktop: {
          offsetXPercent: 12,
          offsetYPercent: -8,
          widthPercent: 120,
          zIndex: 2,
          fontSizePx: 48,
          textAlign: "center",
          marginTopPx: 16,
          marginBottomPx: 24,
        },
      },
    },
  }), definition);
  assert.equal(valid.issues.length, 0);

  const invalid = validateDynamicTemplateInstance(instanceProps({
    layoutOverridesByNodeId: {
      node_root: { desktop: { widthPercent: 120 } },
      node_lockedText: { desktop: { widthPercent: 120 } },
      node_heading: { desktop: { offsetXPercent: 80, widthPercent: 240, zIndex: 99, fontSizePx: 250, textAlign: "justify", marginTopPx: 500 } },
    },
  }), definition);
  const messages = invalid.issues.map((issue) => issue.message);
  assert.ok(messages.some((message) => message.includes("node_root") && message.includes("未开放")));
  assert.ok(messages.some((message) => message.includes("lockedText") && message.includes("宽度超出")));
  assert.ok(messages.some((message) => message.includes("位置偏移超出")));
  assert.ok(messages.some((message) => message.includes("宽度超出")));
  assert.ok(messages.some((message) => message.includes("层级超出")));
  assert.ok(messages.some((message) => message.includes("字号超出")));
  assert.ok(messages.some((message) => message.includes("文字对齐")));
  assert.ok(messages.some((message) => message.includes("上下间距")));
});

test("页面保存按精确模板版本允许授权几何并在写入前拒绝越界值", async () => {
  const definition = definitionFixture();
  let pageDocumentWrites = 0;
  const changedProps = instanceProps({
    layoutOverridesByNodeId: {
      node_heading: {
        desktop: {
          offsetXPercent: 9,
          widthPercent: 115,
          zIndex: 3,
          fontSizePx: 40,
          textAlign: "center",
          marginTopPx: 12,
        },
      },
    },
  });
  const changed = validateDynamicTemplateInstance(changedProps, definition);
  assert.equal(changed.issues.length, 0);

  const outOfBoundsProps = instanceProps({
    layoutOverridesByNodeId: {
      node_heading: { desktop: { offsetXPercent: 99, fontSizePx: 400 } },
    },
  });
  const outOfBounds = validateDynamicTemplateInstance(outOfBoundsProps, definition);
  assert.ok(outOfBounds.issues.some((issue) => issue.message.includes("位置偏移超出")));
  assert.ok(outOfBounds.issues.some((issue) => issue.message.includes("字号超出")));

  const db = {
    dynamicTemplateVersion: {
      findMany: async () => [{
        version: 3,
        schemaVersion: 1,
        definition,
        definitionChecksum: calculateDynamicTemplateDefinitionChecksum(definition),
        template: { templateId: definition.templateId },
      }],
    },
    pageDocument: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        pageDocumentWrites += 1;
        return data;
      },
    },
  } as unknown as PrismaService;
  const service = new PageModulesService(db);
  const assertLayout = (service as unknown as {
    assertDynamicTemplateLayoutOverridesValid(value: unknown): Promise<void>;
  }).assertDynamicTemplateLayoutOverridesValid.bind(service);
  const page = (props: Record<string, unknown>) => ({
    content: [{ type: DYNAMIC_TEMPLATE_BLOCK_TYPE, props }],
    zones: {},
  });
  await assert.doesNotReject(assertLayout(page(changedProps)));
  await assert.rejects(
    assertLayout(page(outOfBoundsProps)),
    /页面实例构图覆盖无效.*位置偏移超出/,
  );
  await assert.rejects(
    assertLayout(page({ ...changedProps, templateId: "" })),
    /页面实例构图覆盖无效.*身份无效的模板实例不能保存构图覆盖/,
  );
  await assert.doesNotReject(
    service.savePageDocument("home", page(changedProps), {}),
  );
  assert.equal(pageDocumentWrites, 1);
  await assert.rejects(
    service.savePageDocument("home", page(outOfBoundsProps), {}),
    /页面实例构图覆盖无效.*位置偏移超出/,
  );
  assert.equal(pageDocumentWrites, 1);
});

test("普通图片槽位的设备级适配与焦点只写入母模板授权的稀疏覆盖", () => {
  const definition = definitionFixture();
  addComplexSlot(definition, "image", "ImageSlot", "image");
  const valid = validateDynamicTemplateInstance(instanceProps({
    contentBySlotId: {
      slot_heading: "页面填写的标题",
      slot_image: { src: "https://example.com/portrait.jpg", alt: "珠宝佩戴肖像" },
    },
    layoutOverridesByNodeId: {
      node_image: {
        desktop: { objectFit: "contain", imageScalePercent: 150, focusXPercent: 28, focusYPercent: 64 },
      },
    },
  }), definition);
  assert.equal(valid.issues.length, 0);

  const invalid = validateDynamicTemplateInstance(instanceProps({
    layoutOverridesByNodeId: {
      node_heading: { desktop: { objectFit: "cover", imageScalePercent: 120, focusXPercent: 50 } },
      node_image: { desktop: { objectFit: "scale-down", imageScalePercent: 350, focusYPercent: 130 } },
    },
  }), definition);
  const messages = invalid.issues.map((issue) => issue.message);
  assert.ok(messages.some((message) => message.includes("标题") && message.includes("图片适配")));
  assert.ok(messages.some((message) => message.includes("标题") && message.includes("图片缩放")));
  assert.ok(messages.some((message) => message.includes("image") && message.includes("图片适配")));
  assert.ok(messages.some((message) => message.includes("image") && message.includes("图片缩放")));
  assert.ok(messages.some((message) => message.includes("image") && message.includes("图片焦点")));
});

test("复杂页面实例复用同源槽位校验并提取媒体与行动引用", () => {
  const definition = definitionFixture();
  addComplexSlot(definition, "video", "Video", "video");
  addComplexSlot(definition, "carousel", "Carousel", "carousel");
  addComplexSlot(definition, "hotspot", "Hotspot", "hotspot");
  addComplexSlot(definition, "beforeAfter", "BeforeAfter", "beforeAfter");
  addComplexSlot(definition, "appointment", "Appointment", "appointment");
  addComplexSlot(definition, "productCard", "ProductCard", "productCard");
  addComplexSlot(definition, "productCollection", "ProductCollection", "productCollection");
  addComplexSlot(definition, "categoryCollection", "CategoryCollection", "categoryCollection");
  definition.slots.slot_productCollection.validation = { minItems: 2, maxItems: 8 };
  definition.slots.slot_categoryCollection.validation = { minItems: 2, maxItems: 4 };
  const contentBySlotId = {
    slot_heading: "页面填写的标题",
    slot_video: {
      videoUrl: "https://example.com/video.mp4",
      posterUrl: "https://example.com/poster.jpg",
      videoDescription: "品牌影片说明",
      targetType: "none",
    },
    slot_carousel: {
      images: [{
        url: "https://example.com/banner.jpg",
        mobileUrl: "https://example.com/banner-mobile.jpg",
        alt: "系列轮播",
        targetType: "product",
        productCode: "P-100",
      }],
      interval: 4000,
    },
    slot_hotspot: {
      image: "https://example.com/scene.jpg",
      mobileImage: "https://example.com/scene-mobile.jpg",
      altText: "场景导购",
      hotspots: [{ x: 20, y: 20, width: 30, height: 20, targetType: "category", categorySlug: "rings" }],
      mobileHotspots: [],
    },
    slot_beforeAfter: {
      beforeImage: "https://example.com/before.jpg",
      afterImage: "https://example.com/after.jpg",
      beforeAltText: "改款前",
      afterAltText: "改款后",
      targetType: "external",
      linkUrl: "https://example.com/service",
    },
    slot_appointment: {
      title: "预约鉴赏",
      buttonText: "立即预约",
      backgroundImage: "https://example.com/appointment.jpg",
      altText: "预约背景",
      targetType: "page",
      linkUrl: "/contact",
    },
    slot_productCard: {
      title: "代表作品",
      productCode: "P-200",
      secondaryTargetType: "category",
      secondaryCategorySlug: "bracelets",
      layout: "imageLeft",
      showPrice: false,
    },
    slot_productCollection: {
      title: "本季精选",
      productCodes: ["P-300", "P-400"],
      layout: "grid-2",
      mobileColumns: 1,
      displayMode: "standard",
      actionStyle: "text",
    },
    slot_categoryCollection: {
      title: "探索分类",
      categorySlugs: ["rings", "necklaces"],
      layout: "grid-2",
    },
  };
  const result = validateDynamicTemplateInstance(instanceProps({ contentBySlotId }), definition);
  assert.deepEqual(result.issues, []);
  assert.equal(result.assets.length, 9);
  assert.deepEqual(result.actions, [
    { slotId: "slot_carousel", targetType: "product", value: "P-100", index: 0 },
    { slotId: "slot_hotspot", targetType: "category", value: "rings", index: 0 },
    { slotId: "slot_beforeAfter", targetType: "external", value: "https://example.com/service" },
    { slotId: "slot_appointment", targetType: "page", value: "/contact" },
    { slotId: "slot_productCard", targetType: "category", value: "bracelets" },
  ]);
  assert.deepEqual(result.productCodes, [
    { slotId: "slot_productCard", value: "P-200" },
    { slotId: "slot_productCollection", value: "P-300", index: 0 },
    { slotId: "slot_productCollection", value: "P-400", index: 1 },
  ]);
  assert.deepEqual(result.categorySlugs, [
    { slotId: "slot_categoryCollection", value: "rings", index: 0 },
    { slotId: "slot_categoryCollection", value: "necklaces", index: 1 },
  ]);

  const invalid = validateDynamicTemplateInstance(instanceProps({
    contentBySlotId: {
      ...contentBySlotId,
      slot_carousel: { images: [{ url: "https://example.com/banner.jpg" }], interval: 25 },
    },
  }), definition);
  assert.ok(invalid.issues.some((issue) => issue.message.includes("内容结构与母模板槽位不匹配")));

  definition.slots.slot_carousel.required = true;
  const emptyRequired = validateDynamicTemplateInstance(instanceProps({
    contentBySlotId: { ...contentBySlotId, slot_carousel: { images: [] } },
  }), definition);
  assert.ok(emptyRequired.issues.some((issue) => issue.message.includes("carousel为必填内容")));

  definition.slots.slot_productCollection.required = true;
  const emptyProducts = validateDynamicTemplateInstance(instanceProps({
    contentBySlotId: { ...contentBySlotId, slot_productCollection: { productCodes: [] } },
  }), definition);
  assert.ok(emptyProducts.issues.some((issue) => issue.message.includes("productCollection为必填内容")));
});

test("成熟内容模板页面实例提取素材与稳定业务引用，且不接受数字商品 ID", () => {
  const definition = definitionFixture();
  addComplexSlot(definition, "heroTemplate", "HeroTemplate", "heroTemplate");
  const contentBySlotId = {
    slot_heading: "页面填写的标题",
    slot_heroTemplate: {
      desktopImage: "https://example.com/hero.jpg",
      mobileImage: "https://example.com/hero-mobile.jpg",
      title: "代表作品",
      targetType: "product",
      productCode: "P-900",
    },
  };
  const valid = validateDynamicTemplateInstance(instanceProps({ contentBySlotId }), definition);
  assert.deepEqual(valid.issues, []);
  assert.deepEqual(valid.assets, [
    { slotId: "slot_heroTemplate", url: "https://example.com/hero.jpg" },
    { slotId: "slot_heroTemplate", url: "https://example.com/hero-mobile.jpg" },
  ]);
  assert.ok(valid.productCodes.some((reference) => reference.value === "P-900"));
  assert.ok(valid.actions.some((reference) => reference.targetType === "product" && reference.value === "P-900"));

  const invalid = validateDynamicTemplateInstance(instanceProps({
    contentBySlotId: {
      ...contentBySlotId,
      slot_heroTemplate: {
        ...contentBySlotId.slot_heroTemplate,
        productId: 900,
      },
    },
  }), definition);
  assert.ok(invalid.issues.some((issue) => issue.message.includes("内容结构与母模板槽位不匹配")));
});

test("页面读取只水合实例引用的正式精确版本且不会持久化水合缓存", async () => {
  const definition = definitionFixture();
  definition.metadata.visualRole = "primary-stage";
  definition.metadata.headerCompatibility = ["overlay-light"];
  const storedPuckData = {
    content: [{ type: DYNAMIC_TEMPLATE_BLOCK_TYPE, props: instanceProps() }],
    root: { props: {} },
    [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: {
      "stale@1": { definition: { unsafe: true } },
    },
  };
  let versionLookup: unknown;
  let storedDefinitionChecksum = calculateDynamicTemplateDefinitionChecksum(definition);
  const prisma = {
    pageDocument: {
      findUnique: async () => ({
        id: 9,
        pageKey: "home",
        status: "PUBLISHED",
        publishedRevisionId: 99,
      }),
    },
    pageDocumentRevision: {
      findFirst: async () => ({
        id: 99,
        documentId: 9,
        puckData: storedPuckData,
        metadata: {
          ...makeFormalPageMetadata(storedPuckData),
          [CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY]:
            createContentTemplatePublicationAttestation(),
        },
        version: 8,
        publishedAt: new Date("2026-08-28T00:00:00.000Z"),
        createdAt: new Date("2026-08-28T00:00:00.000Z"),
        publishedBy: 1,
      }),
    },
    dynamicTemplateVersion: {
      findMany: async (input: unknown) => {
        versionLookup = input;
        return [{
          version: 3,
          schemaVersion: 1,
          definition,
          definitionChecksum: storedDefinitionChecksum,
          template: { templateId: definition.templateId },
        }];
      },
    },
  } as unknown as PrismaService;
  const service = new PageModulesService(prisma);

  const published = await service.getPublishedPageDocument("home");
  const puckData = published?.puckData as Record<string, unknown>;
  const resolved = puckData[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY] as Record<string, unknown>;

  assert.deepEqual(Object.keys(resolved), [dynamicTemplateVersionKey(definition.templateId, 3)]);
  assert.equal("stale@1" in resolved, false);
  assert.deepEqual(
    (versionLookup as { where: { OR: unknown[] } }).where.OR,
    [{ version: 3, template: { templateId: definition.templateId, visibility: "STAFF" } }],
  );

  storedDefinitionChecksum = "0".repeat(64);
  const corrupted = await service.getPublishedPageDocument("home");
  assert.equal(corrupted?.status, "INVALID");
  assert.equal(corrupted?.invalidReason, "publication-revalidation-required");
  assert.equal("puckData" in (corrupted ?? {}), false);

  const normalize = (service as unknown as {
    normalizePageDocumentPuckData(value: unknown): Record<string, unknown>;
  }).normalizePageDocumentPuckData.bind(service);
  const normalized = normalize(puckData);
  assert.equal(DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY in normalized, false);
  assert.deepEqual(normalized.content, storedPuckData.content);
});

test("页面发布校验拒绝结构、Schema 或 checksum 漂移的精确模板版本", async () => {
  const definition = definitionFixture();
  let storedChecksum = calculateDynamicTemplateDefinitionChecksum(definition);
  const db = {
    dynamicTemplateVersion: {
      findMany: async () => [{
        version: 3,
        schemaVersion: 1,
        definition,
        definitionChecksum: storedChecksum,
        template: { templateId: definition.templateId },
      }],
    },
    product: { findMany: async () => [] },
    category: { findMany: async () => [] },
    siteSetting: { findUnique: async () => null },
  };
  const service = new PageModulesService(db as unknown as PrismaService);
  const collect = (service as unknown as {
    collectPuckDataErrors(database: unknown, value: unknown, pageKey: string): Promise<Array<{ message: string }>>;
  }).collectPuckDataErrors.bind(service);
  const puckData = {
    content: [{ type: DYNAMIC_TEMPLATE_BLOCK_TYPE, props: instanceProps() }],
    zones: {},
    root: { props: {} },
  };

  const valid = await collect(db, puckData, "home");
  assert.equal(valid.some((issue) => issue.message.includes("结构或校验和已损坏")), false);

  storedChecksum = "0".repeat(64);
  const corrupted = await collect(db, puckData, "home");
  assert.ok(corrupted.some((issue) => issue.message.includes("结构或校验和已损坏")));
});
