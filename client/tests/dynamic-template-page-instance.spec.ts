import { expect, test, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";
import { promoteInstanceOverridesToTemplateDraft } from "../src/page-builder/dynamic-template-instance/promoteToTemplate";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  dynamicTemplateVersionKey,
} from "../src/page-builder/dynamic-template-instance/types";
import { planDynamicTemplateDocumentUpgrade } from "../src/page-builder/dynamic-template-instance/upgrade";
import {
  hasVisiblePrimaryStage,
  isVisiblePrimaryStageBlockInDocument,
} from "../src/page-builder/utils/primaryStagePolicy";

const appMode = process.env.PLAYWRIGHT_APP_MODE === "mock" ? "mock" : "development";

function json(data: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(status >= 400
      ? { code: status, message: "fixture failure" }
      : { code: 200, data, message: "success" }),
  };
}

function definition(version: 1 | 2 | 3) {
  return {
    schemaVersion: 1,
    templateId: "tpl_page_upgrade",
    name: "内容展示｜版本升级",
    description: `正式版本 ${version}`,
    metadata: {
      category: "内容展示",
      purpose: "页面版本升级",
      layoutType: "纵向内容",
      slotSummary: "1 个标题槽位",
      recommendedFor: ["home"],
      desktopRatio: "16:9",
      mobileRatio: "4:5",
      visualRole: "support-stage",
      headerCompatibility: ["solid", "overlay-light"],
      tags: ["upgrade"],
    },
    rootNodeId: "node_root",
    nodes: {
      node_root: {
        nodeId: "node_root",
        type: "Section",
        name: "模板根节点",
        childIds: ["node_container"],
        props: { semanticTag: "section" },
        responsive: {
          desktop: { display: "block", order: 0, width: "fill", height: { mode: "auto" } },
          mobile: { display: "block", order: 0, width: "fill", height: { mode: "auto" } },
        },
        hidden: false,
      },
      node_container: {
        nodeId: "node_container",
        type: "Container",
        name: "内容容器",
        childIds: ["node_heading"],
        props: {},
        responsive: {
          desktop: { display: "flex", direction: "column", order: 0, width: "fill", height: { mode: "auto" }, gap: { value: version, unit: "rem" } },
          mobile: { display: "flex", direction: "column", order: 0, width: "fill", height: { mode: "auto" } },
        },
        hidden: false,
      },
      node_heading: {
        nodeId: "node_heading",
        type: "HeadingSlot",
        name: "标题",
        slotId: "slot_heading",
        childIds: [],
        props: {},
        instanceEditPolicy: {
          position: true,
          size: true,
          zIndex: true,
          typography: true,
          spacing: true,
          minWidthPercent: 50,
          maxWidthPercent: 120,
          maxOffsetPercent: 20,
          minFontSizePx: 14,
          maxFontSizePx: 64,
          maxSpacingPx: 80,
        },
        responsive: {
          desktop: { display: "block", order: 0, width: "fill", height: { mode: "auto" } },
          mobile: { display: "block", order: 0, width: "fill", height: { mode: "auto" } },
        },
        hidden: false,
      },
    },
    slots: {
      slot_heading: {
        slotId: "slot_heading",
        key: "heading",
        type: "heading",
        label: "标题",
        required: true,
        editable: true,
        hideable: false,
        validation: { minLength: 1, maxLength: 60 },
        desktopRules: { fontRole: "display", maxLines: 2 },
        mobileRules: { fontRole: "heading", maxLines: 3 },
      },
    },
    defaultContent: { slot_heading: `版本 ${version} 默认标题` },
  };
}

type MixedUpgradeScenario =
  | "missing-current"
  | "type-change"
  | "not-editable"
  | "hidden-required"
  | "hidden-not-hideable";

const mixedUpgradeScenarios: Array<{
  key: MixedUpgradeScenario;
  label: string;
  reason: RegExp;
}> = [
  { key: "missing-current", label: "当前精确版本缺失", reason: /缺少当前精确模板版本/ },
  { key: "type-change", label: "含值槽位改型", reason: /已改型或不再允许编辑/ },
  { key: "not-editable", label: "含值槽位变为不可编辑", reason: /已改型或不再允许编辑/ },
  { key: "hidden-required", label: "已隐藏槽位变为必填", reason: /隐藏状态无法由目标版本表达/ },
  { key: "hidden-not-hideable", label: "已隐藏槽位变为不可隐藏", reason: /隐藏状态无法由目标版本表达/ },
];

function createMixedUpgradePlanningFixture(scenario: MixedUpgradeScenario) {
  const v1 = definition(1);
  const v2 = definition(2);
  const target = definition(3);
  const document = pageDocument(v1).puckData;
  const first = document.content[0];
  const second = structuredClone(first);
  second.props.id = "dynamic-upgrade-block-2";
  second.props.instanceId = "dynamic-upgrade-instance-2";
  second.props.templateVersion = 2;
  second.props.contentBySlotId = { slot_heading: "第二实例保持原值" };
  document.content.push(second);

  if (scenario === "missing-current") {
    delete document.resolvedDynamicTemplates[dynamicTemplateVersionKey(v1.templateId, 1)];
    document.content = [second, first];
  }
  if (scenario === "type-change") {
    v2.nodes.node_heading.type = "TextSlot";
    v2.slots.slot_heading.type = "text";
    target.nodes.node_heading.type = "TextSlot";
    target.slots.slot_heading.type = "text";
  }
  if (scenario === "not-editable") {
    target.slots.slot_heading.required = false;
    target.slots.slot_heading.editable = false;
    second.props.contentBySlotId = { slot_heading: "" };
  }
  if (scenario === "hidden-required") {
    v1.slots.slot_heading.required = false;
    v1.slots.slot_heading.hideable = true;
    v2.slots.slot_heading.required = false;
    v2.slots.slot_heading.hideable = true;
    first.props.hiddenSlotIds = ["slot_heading"];
    target.slots.slot_heading.required = true;
    target.slots.slot_heading.hideable = false;
  }
  if (scenario === "hidden-not-hideable") {
    v1.slots.slot_heading.required = false;
    v1.slots.slot_heading.hideable = true;
    v2.slots.slot_heading.required = false;
    v2.slots.slot_heading.hideable = true;
    first.props.hiddenSlotIds = ["slot_heading"];
    target.slots.slot_heading.required = false;
    target.slots.slot_heading.hideable = false;
  }
  document.resolvedDynamicTemplates[dynamicTemplateVersionKey(v2.templateId, 2)] = {
    templateId: v2.templateId,
    version: 2,
    schemaVersion: v2.schemaVersion,
    definitionChecksum: "checksum-v2",
    definition: v2,
  };

  return {
    document,
    target: {
      templateId: target.templateId,
      version: 3,
      schemaVersion: target.schemaVersion,
      definitionChecksum: "checksum-v3",
      definition: target,
      name: target.name,
    },
  };
}

test("主首屏策略统一识别固定模板、动态母模板与隐藏状态", () => {
  const primaryDefinition = definition(1);
  primaryDefinition.metadata.visualRole = "primary-stage";
  const resolvedKey = dynamicTemplateVersionKey(primaryDefinition.templateId, 1);
  const dynamicPrimaryStage = {
    type: DYNAMIC_TEMPLATE_BLOCK_TYPE,
    props: {
      id: "dynamic-primary-stage",
      templateId: primaryDefinition.templateId,
      templateVersion: 1,
      isVisible: true,
    },
  };
  const dynamicDocument = {
    content: [dynamicPrimaryStage],
    [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: {
      [resolvedKey]: {
        templateId: primaryDefinition.templateId,
        version: 1,
        schemaVersion: primaryDefinition.schemaVersion,
        definitionChecksum: "primary-stage-checksum",
        definition: primaryDefinition,
      },
    },
  };

  expect(hasVisiblePrimaryStage(dynamicDocument)).toBe(true);
  expect(isVisiblePrimaryStageBlockInDocument(dynamicPrimaryStage, dynamicDocument)).toBe(true);
  expect(hasVisiblePrimaryStage({
    ...dynamicDocument,
    content: [{ ...dynamicPrimaryStage, props: { ...dynamicPrimaryStage.props, isVisible: false } }],
  })).toBe(false);
  expect(hasVisiblePrimaryStage({
    content: [{ type: "首屏主视觉", props: { id: "fixed-primary-stage", isVisible: true } }],
  })).toBe(true);
});

function lockedLayoutDefinition() {
  const result: any = definition(1);
  result.nodes.node_heading.instanceEditPolicy = {
    position: false,
    size: false,
    zIndex: false,
    typography: false,
    spacing: false,
    minWidthPercent: 50,
    maxWidthPercent: 120,
    maxOffsetPercent: 20,
    minFontSizePx: 14,
    maxFontSizePx: 64,
    maxSpacingPx: 80,
  };
  return result;
}

function carouselDefinition() {
  const result: any = definition(1);
  result.metadata.purpose = "品牌展示";
  result.metadata.slotSummary = "1 个标题槽位，1 个轮播槽位";
  result.nodes.node_container.childIds.push("node_carousel");
  result.nodes.node_carousel = {
    nodeId: "node_carousel",
    type: "Carousel",
    name: "系列轮播",
    slotId: "slot_carousel",
    childIds: [],
    props: {},
    responsive: {
      desktop: { display: "block", order: 1, width: "fill", height: { mode: "auto" } },
      mobile: { display: "block", order: 1, width: "fill", height: { mode: "auto" } },
    },
    hidden: false,
  };
  result.slots.slot_carousel = {
    slotId: "slot_carousel",
    key: "carouselContent",
    type: "carousel",
    label: "系列轮播",
    required: false,
    editable: true,
    hideable: true,
    validation: {},
    desktopRules: {},
    mobileRules: {},
  };
  result.defaultContent.slot_carousel = {
    images: [],
    autoPlay: true,
    interval: 4000,
    showDots: true,
    showArrows: true,
    desktopRatio: "wide",
    mobileRatio: "portrait",
  };
  return result;
}

function productCollectionDefinition() {
  const result: any = definition(1);
  result.metadata.purpose = "商品销售";
  result.metadata.slotSummary = "1 个标题槽位，1 个商品集合槽位";
  result.nodes.node_container.childIds.push("node_product_collection");
  result.nodes.node_product_collection = {
    nodeId: "node_product_collection",
    type: "ProductCollection",
    name: "商品集合",
    slotId: "slot_product_collection",
    childIds: [],
    props: {},
    responsive: {
      desktop: { display: "block", order: 1, width: "fill", height: { mode: "auto" } },
      mobile: { display: "block", order: 1, width: "fill", height: { mode: "auto" } },
    },
    hidden: false,
  };
  result.slots.slot_product_collection = {
    slotId: "slot_product_collection",
    key: "productCollectionContent",
    type: "productCollection",
    label: "商品集合",
    required: false,
    editable: true,
    hideable: true,
    validation: { maxItems: 8 },
    desktopRules: {},
    mobileRules: {},
  };
  result.defaultContent.slot_product_collection = {
    productCodes: [],
    title: "本季精选",
    layout: "grid-3",
    mobileColumns: 2,
    displayMode: "standard",
    actionStyle: "text",
    showPrice: true,
  };
  return result;
}

function directBusinessDefinition() {
  const result: any = definition(1);
  result.metadata.purpose = "商品销售";
  const entries = [
    { nodeId: "node_product", type: "ProductSlot", slotId: "slot_product", slotType: "product", label: "主商品", validation: {} },
    { nodeId: "node_collection", type: "CollectionSlot", slotId: "slot_collection", slotType: "collection", label: "搭配商品", validation: { minItems: 1, maxItems: 4 } },
    { nodeId: "node_action", type: "ButtonSlot", slotId: "slot_action", slotType: "button", label: "主行动", validation: { maxLength: 30 } },
    { nodeId: "node_summary", type: "TextSlot", slotId: "slot_summary", slotType: "text", label: "补充说明", validation: { maxLength: 120 } },
  ];
  for (const [index, entry] of entries.entries()) {
    result.nodes.node_container.childIds.push(entry.nodeId);
    result.nodes[entry.nodeId] = {
      nodeId: entry.nodeId,
      type: entry.type,
      name: entry.label,
      slotId: entry.slotId,
      childIds: [],
      props: {},
      responsive: {
        desktop: { display: "block", order: index + 1, width: "fill", height: { mode: "auto" } },
        mobile: { display: "block", order: index + 1, width: "fill", height: { mode: "auto" } },
      },
      hidden: false,
    };
    result.slots[entry.slotId] = {
      slotId: entry.slotId,
      key: `${entry.slotId}Content`,
      type: entry.slotType,
      label: entry.label,
      required: entry.slotType === "product",
      editable: true,
      hideable: entry.slotType !== "product",
      validation: entry.validation,
      desktopRules: {},
      mobileRules: {},
    };
  }
  result.defaultContent.slot_summary = "可选的补充说明";
  return result;
}

function imageDefinition(version: 1 | 2 | 3) {
  const result: any = definition(version);
  // 故意包含“行动”关键词，验证 Inspector 不会在没有行动槽位时误判任务。
  result.metadata.purpose = "品牌行动引导";
  result.metadata.category = "品牌展示";
  result.metadata.slotSummary = "1 个标题槽位，1 个图片槽位";
  result.nodes.node_container.childIds.push("node_image");
  result.nodes.node_image = {
    nodeId: "node_image",
    type: "ImageSlot",
    name: "主图",
    slotId: "slot_image",
    childIds: [],
    props: {},
    instanceEditPolicy: {
      position: true,
      size: true,
      zIndex: true,
      imageFit: true,
      imageFocus: true,
      minWidthPercent: 50,
      maxWidthPercent: 120,
      maxOffsetPercent: 20,
    },
    responsive: {
      desktop: { display: "block", order: 1, width: "fill", height: { mode: "aspect-ratio", ratio: { width: 4, height: 3 } } },
      mobile: { display: "block", order: 1, width: "fill", height: { mode: "aspect-ratio", ratio: { width: 4, height: 5 } } },
    },
    hidden: false,
  };
  result.slots.slot_image = {
    slotId: "slot_image",
    key: "mainImage",
    type: "image",
    label: "主图",
    required: false,
    editable: true,
    hideable: true,
    validation: { recommendedWidth: 1200, recommendedHeight: 900 },
    desktopRules: { aspectRatio: "4:3", objectFit: "cover", objectPosition: "center center" },
    mobileRules: { aspectRatio: "4:5", objectFit: "cover", objectPosition: "center top" },
  };
  result.defaultContent.slot_image = {
    src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23ddd'/%3E%3C/svg%3E",
    alt: "中性示例图",
  };
  return result;
}

function pageDocument(v1 = definition(1)) {
  return {
    id: 8801,
    pageKey: "products",
    puckData: {
      content: [{
        type: "动态模板实例",
        props: {
          id: "dynamic-upgrade-block",
          instanceSchemaVersion: 1,
          instanceId: "dynamic-upgrade-instance",
          templateId: v1.templateId,
          templateVersion: 1,
          moduleName: v1.name,
          contentBySlotId: { slot_heading: "页面实例填写内容" },
          layoutOverridesByNodeId: {},
          hiddenSlotIds: [],
          isVisible: true,
        },
      }],
      zones: {},
      root: { props: {} },
      resolvedDynamicTemplates: {
        [`${v1.templateId}@1`]: {
          templateId: v1.templateId,
          version: 1,
          schemaVersion: 1,
          definitionChecksum: "checksum-v1",
          definition: v1,
        },
      },
    },
    metadata: {},
    editorVersion: "0.22.4",
    status: "DRAFT",
    version: 0,
    publishedRevisionId: 91,
    publishedAt: null,
    publishedBy: null,
    updatedAt: "2026-08-28T12:00:00.000Z",
  };
}

async function prepareEditor(page: Page, options: { failVersionCheck?: boolean; complex?: boolean; business?: boolean; directBusiness?: boolean; image?: boolean; duplicate?: boolean; legacyLayout?: boolean; lockedLayout?: boolean; primaryStage?: boolean; upgradeWouldDuplicatePrimaryStage?: boolean; noNewVersion?: boolean; invalidLatestDefinition?: boolean; invalidCurrentVersion?: boolean; incompatibleHeader?: boolean; missingCurrentVersion?: boolean; mixedUpgradeScenario?: MixedUpgradeScenario; templateConflict?: boolean; requiredUpgrade?: boolean; destructiveRemoval?: boolean; restrictLatestLayout?: boolean; personalUpgradeHint?: boolean; saveFailureStatus?: 409 | 500; adminRole?: "SUPER_ADMIN" | "ADMIN" | "EDITOR"; publishIssues?: Array<{ code: string; message: string; severity: "error" | "warning" | "info"; blockId?: string; path?: string; field?: string }> } = {}) {
  const sourceDefinition = options.image
    ? imageDefinition(1)
    : options.lockedLayout
      ? lockedLayoutDefinition()
    : options.directBusiness
      ? directBusinessDefinition()
    : options.business
    ? productCollectionDefinition()
    : options.complex
      ? carouselDefinition()
      : definition(1);
  if (options.primaryStage) sourceDefinition.metadata.visualRole = "primary-stage";
  const draft = pageDocument(sourceDefinition);
  const validCurrentResolvedDefinition = structuredClone(
    draft.puckData.resolvedDynamicTemplates[
      dynamicTemplateVersionKey(sourceDefinition.templateId, 1)
    ],
  );
  if (options.upgradeWouldDuplicatePrimaryStage) {
    draft.puckData.content.unshift({
      type: "首屏主视觉",
      props: {
        id: "existing-fixed-primary-stage",
        desktopImage: "",
        mobileImage: "",
        isVisible: true,
      },
    });
  }
  if (options.missingCurrentVersion) {
    delete draft.puckData.resolvedDynamicTemplates[
      dynamicTemplateVersionKey(sourceDefinition.templateId, 1)
    ];
  }
  if (options.invalidCurrentVersion) {
    draft.puckData.resolvedDynamicTemplates[
      dynamicTemplateVersionKey(sourceDefinition.templateId, 1)
    ].definition.nodes.node_root.childIds = ["node_missing"];
  }
  if (options.legacyLayout) {
    draft.puckData.content[0].props.layoutOverridesByNodeId = {
      node_heading: {
        desktop: {
          offsetXPercent: 8,
          offsetYPercent: -4,
          widthPercent: 115,
          zIndex: 3,
          fontSizePx: 40,
          textAlign: "center",
          marginTopPx: 12,
          marginBottomPx: 18,
        },
        ...(options.restrictLatestLayout ? {
          mobile: {
            offsetXPercent: -6,
            widthPercent: 105,
            fontSizePx: 28,
          },
        } : {}),
      },
    };
  }
  if (options.personalUpgradeHint) {
    draft.puckData.content.push({
      type: "首屏主视觉",
      props: {
        id: "personal-compat-instance",
        title: "保持旧草稿",
        __instanceOverrides: { version: 2, frame: { colorPreset: "mist" } },
        __templateOrigin: { kind: "personal", templateId: 77, revision: 1 },
      },
    });
  }
  if (options.duplicate) {
    const duplicate = structuredClone(draft.puckData.content[0]);
    duplicate.props.id = "dynamic-upgrade-block-2";
    duplicate.props.instanceId = "dynamic-upgrade-instance-2";
    duplicate.props.contentBySlotId = { slot_heading: "第二实例保持原值" };
    draft.puckData.content.push(duplicate);
  }
  let savedPayload: Record<string, unknown> | null = null;
  let currentDocument = draft;
  let catalogReadCount = 0;
  let validationRequestCount = 0;
  const pageWrites: Array<{ method: string; path: string }> = [];
  const templateWrites: Array<{ method: string; path: string; payload?: Record<string, unknown> }> = [];
  let templateSavedPayload: Record<string, unknown> | null = null;
  const latestVersion = options.noNewVersion ? 1 : options.mixedUpgradeScenario ? 3 : 2;
  const latestDefinition = options.image
    ? imageDefinition(latestVersion)
    : definition(latestVersion);
  if (options.mixedUpgradeScenario) {
    const mixed = createMixedUpgradePlanningFixture(options.mixedUpgradeScenario);
    draft.puckData.content = mixed.document.content;
    draft.puckData.resolvedDynamicTemplates = mixed.document.resolvedDynamicTemplates;
    Object.assign(latestDefinition, mixed.target.definition);
  }
  if (options.requiredUpgrade) {
    (latestDefinition.nodes.node_container.childIds as string[]).push("node_required");
    (latestDefinition.nodes as Record<string, unknown>).node_required = {
      nodeId: "node_required",
      type: "TextSlot",
      name: "新增必填正文",
      slotId: "slot_required",
      childIds: [],
      props: {},
      responsive: {
        desktop: { display: "block", order: 1, width: "fill", height: { mode: "auto" } },
        mobile: { display: "block", order: 1, width: "fill", height: { mode: "auto" } },
      },
      hidden: false,
    };
    (latestDefinition.slots as Record<string, unknown>).slot_required = {
      slotId: "slot_required",
      key: "requiredCopy",
      type: "text",
      label: "新增必填正文",
      required: true,
      editable: true,
      hideable: false,
      validation: { minLength: 1, maxLength: 120 },
      desktopRules: {},
      mobileRules: {},
    };
  }
  if (options.destructiveRemoval) {
    latestDefinition.nodes.node_container.childIds = [];
    delete (latestDefinition.nodes as Record<string, unknown>).node_heading;
    delete (latestDefinition.slots as Record<string, unknown>).slot_heading;
    delete (latestDefinition.defaultContent as Record<string, unknown>).slot_heading;
  }
  if (options.restrictLatestLayout) {
    latestDefinition.nodes.node_heading.instanceEditPolicy = {
      ...latestDefinition.nodes.node_heading.instanceEditPolicy,
      position: false,
      size: false,
      zIndex: false,
      typography: false,
      spacing: false,
    };
  }
  if (options.primaryStage || options.upgradeWouldDuplicatePrimaryStage) {
    latestDefinition.metadata.visualRole = "primary-stage";
  }
  if (options.invalidLatestDefinition) {
    latestDefinition.nodes.node_root.childIds = ["node_missing"];
  }
  if (options.incompatibleHeader) {
    latestDefinition.metadata.headerCompatibility = ["solid"];
  }
  const latestPublishedTemplate = {
    templateId: latestDefinition.templateId,
    name: latestDefinition.name,
    category: latestDefinition.metadata.category,
    purpose: latestDefinition.metadata.purpose,
    layoutType: latestDefinition.metadata.layoutType,
    description: latestDefinition.description,
    slotSummary: latestDefinition.metadata.slotSummary,
    recommendedFor: latestDefinition.metadata.recommendedFor,
    tags: latestDefinition.metadata.tags,
    version: latestVersion,
    schemaVersion: 1,
    definition: latestDefinition,
    definitionChecksum: `checksum-v${latestVersion}`,
    versionNote: "调整桌面间距",
    publishedAt: "2026-08-28T13:00:00.000Z",
  };
  const editableDraftDefinition = structuredClone(sourceDefinition);
  if (options.templateConflict) {
    editableDraftDefinition.slots.slot_heading.desktopRules.fontSize = { value: 32, unit: "px" };
  }
  let editableTemplate = {
    id: 501,
    templateId: sourceDefinition.templateId,
    ownerId: null,
    sourceType: "SYSTEM",
    visibility: "STAFF",
    status: "ACTIVE",
    name: sourceDefinition.name,
    category: sourceDefinition.metadata.category,
    purpose: sourceDefinition.metadata.purpose,
    layoutType: sourceDefinition.metadata.layoutType,
    description: sourceDefinition.description,
    slotSummary: sourceDefinition.metadata.slotSummary,
    recommendedFor: sourceDefinition.metadata.recommendedFor,
    tags: sourceDefinition.metadata.tags,
    definitionSchemaVersion: 1,
    publishedVersion: 1,
    sourceReference: null,
    archivedAt: null,
    createdAt: "2026-08-28T10:00:00.000Z",
    updatedAt: "2026-08-28T12:00:00.000Z",
    draft: {
      id: 601,
      baseVersion: 1,
      revision: 7,
      definition: editableDraftDefinition,
      definitionChecksum: "checksum-draft-7",
      versionNote: null,
      updatedAt: "2026-08-28T12:00:00.000Z",
    },
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (
      (request.method() === "PUT" && path.endsWith("/page-modules/document"))
      || (request.method() === "PUT" && path.endsWith("/page-modules/document/publish"))
    ) {
      pageWrites.push({ method: request.method(), path });
    }
    if (path.endsWith("/auth/profile")) return route.fallback();
    if (path.endsWith("/page-modules/dynamic-templates/catalog")) {
      catalogReadCount += 1;
      if (options.failVersionCheck) return route.fulfill(json(null, 503));
      return route.fulfill(json({
        items: [
          { kind: "published", template: latestPublishedTemplate },
          ...(options.personalUpgradeHint ? [{
            kind: "personal-compatibility",
            template: {
              id: 77,
              name: "旧个人模板",
              moduleType: "首屏主视觉",
              contractKey: "hero",
              contractVersion: 3,
              revision: 2,
              layoutData: { version: 2, frame: { colorPreset: "ink" } },
              contentDefaults: null,
              createdAt: "2026-08-28T10:00:00.000Z",
              updatedAt: "2026-08-28T13:00:00.000Z",
            },
          }] : []),
        ],
      }));
    }
    if (path.endsWith("/page-modules/dynamic-templates/published")) {
      if (options.failVersionCheck) return route.fulfill(json(null, 503));
      return route.fulfill(json([latestPublishedTemplate]));
    }
    if (path.endsWith(`/page-modules/dynamic-templates/${sourceDefinition.templateId}/draft`) && request.method() === "GET") {
      return route.fulfill(json(editableTemplate));
    }
    if (path.endsWith(`/page-modules/dynamic-templates/${sourceDefinition.templateId}/draft`) && request.method() === "PATCH") {
      templateSavedPayload = request.postDataJSON() as Record<string, unknown>;
      templateWrites.push({ method: request.method(), path, payload: templateSavedPayload });
      editableTemplate = {
        ...editableTemplate,
        updatedAt: "2026-08-28T12:02:00.000Z",
        draft: {
          ...editableTemplate.draft,
          revision: editableTemplate.draft.revision + 1,
          definition: structuredClone(templateSavedPayload.definition ?? editableTemplate.draft.definition),
          definitionChecksum: "checksum-draft-8",
          versionNote: typeof templateSavedPayload.versionNote === "string" ? templateSavedPayload.versionNote : null,
          updatedAt: "2026-08-28T12:02:00.000Z",
        },
      } as typeof editableTemplate;
      return route.fulfill(json(editableTemplate));
    }
    if (path.includes("/page-modules/dynamic-templates") && request.method() !== "GET") {
      templateWrites.push({ method: request.method(), path });
      return route.fulfill(json({}));
    }
    if (path.endsWith("/page-modules/document/revisions")) return route.fulfill(json([]));
    if (path.endsWith("/page-modules/document/published/admin")) return route.fulfill(json(null));
    if (path.endsWith("/page-modules/document/published")) return route.fulfill(json(null));
    if (path.endsWith("/page-modules/document/admin")) return route.fulfill(json(currentDocument));
    if (path.endsWith("/page-modules/document") && request.method() === "PUT") {
      if (options.saveFailureStatus) {
        return route.fulfill(json(null, options.saveFailureStatus));
      }
      savedPayload = request.postDataJSON() as Record<string, unknown>;
      const nextPayload = savedPayload as typeof draft;
      const locksTargetVersion = nextPayload.puckData?.content?.some((block) => (
        block.props?.templateId === latestPublishedTemplate.templateId
        && block.props?.templateVersion === latestPublishedTemplate.version
      ));
      currentDocument = {
        ...currentDocument,
        ...nextPayload,
        puckData: {
          ...currentDocument.puckData,
          ...nextPayload.puckData,
          resolvedDynamicTemplates: nextPayload.puckData?.resolvedDynamicTemplates
            ?? {
              ...currentDocument.puckData.resolvedDynamicTemplates,
              ...(locksTargetVersion ? {
                [dynamicTemplateVersionKey(latestPublishedTemplate.templateId, latestPublishedTemplate.version)]: {
                  templateId: latestPublishedTemplate.templateId,
                  version: latestPublishedTemplate.version,
                  schemaVersion: latestPublishedTemplate.schemaVersion,
                  definitionChecksum: latestPublishedTemplate.definitionChecksum,
                  definition: latestPublishedTemplate.definition,
                },
              } : {}),
            },
        },
        updatedAt: "2026-08-28T12:01:00.000Z",
      } as typeof draft;
      return route.fulfill(json(currentDocument));
    }
    if (path.endsWith("/page-modules/document/validate")) {
      validationRequestCount += 1;
      const issues = options.publishIssues ?? [];
      return route.fulfill(json({
        valid: !issues.some((issue) => issue.severity === "error"),
        errors: issues.filter((issue) => issue.severity === "error").map((issue) => issue.message),
        issues,
      }));
    }
    if ((options.business || options.directBusiness) && path.endsWith("/products/admin/resolve-references")) {
      const body = request.postDataJSON() as { codes?: string[] };
      return route.fulfill(json((body.codes ?? []).map((code) => ({
        code,
        id: code === "P-600" ? 600 : 500,
        name: `业务商品 ${code}`,
        thumbnail: "/svg/product.svg",
        price: 12800,
        status: "PUBLISHED",
        visibility: "PUBLIC",
        eligible: true,
        reason: "AVAILABLE",
      }))));
    }
    if ((options.business || options.directBusiness) && path.endsWith("/products") && request.method() === "GET") {
      return route.fulfill(json({
        list: ["P-500", "P-600"].map((code, index) => ({
          id: 500 + index * 100,
          code,
          name: `业务商品 ${code}`,
          price: 12800 + index * 1000,
          status: "PUBLISHED",
          visibility: "PUBLIC",
          category: { id: 1, name: "戒指" },
          images: [{ url: "/svg/product.svg", type: "FRONT", isPrimary: true }],
        })),
        total: 2,
        page: 1,
        pageSize: 12,
      }));
    }
    return route.fulfill(json({}));
  });
  await installAdminSession(page, {
    username: "dynamic-template-page-test",
    realName: "动态模板页面测试管理员",
    role: options.adminRole ?? "SUPER_ADMIN",
  });
  await page.goto("/admin/editor/products");
  const hasResolutionError = options.missingCurrentVersion || options.invalidCurrentVersion;
  if (hasResolutionError) {
    await expect(page.getByRole("alert")).toContainText("模板版本解析失败", { timeout: 15_000 });
    return {
      inspector: page.getByRole("region", { name: "模板实例属性" }),
      savedPayload: () => savedPayload,
      currentDocument: () => currentDocument,
      restoreCurrentVersion: () => {
        currentDocument.puckData.resolvedDynamicTemplates[
          dynamicTemplateVersionKey(sourceDefinition.templateId, 1)
        ] = structuredClone(validCurrentResolvedDefinition);
      },
      templateSavedPayload: () => templateSavedPayload,
      catalogReadCount: () => catalogReadCount,
      validationRequestCount: () => validationRequestCount,
      pageWrites,
      templateWrites,
    };
  }
  await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
  await page.locator(
    '.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"] .homepage-editor__layer-select',
  )
    .click({ position: { x: 12, y: 18 } });
  const inspector = page.getByRole("region", { name: "模板实例属性" });
  await expect(inspector).toBeVisible();
  return {
    inspector,
    savedPayload: () => savedPayload,
    currentDocument: () => currentDocument,
    restoreCurrentVersion: () => undefined,
    templateSavedPayload: () => templateSavedPayload,
    catalogReadCount: () => catalogReadCount,
    validationRequestCount: () => validationRequestCount,
    pageWrites,
    templateWrites,
  };
}

test.describe("动态模板页面实例（真实编辑器组件 + 自有 API 夹具）", () => {
  test.skip(appMode === "mock", "development 模式拦截自有 API；不作为真实 API 写入证据");

  for (const scenario of mixedUpgradeScenarios) {
    test(`${scenario.label}进入混合批量计划时整批无可应用文档`, () => {
      const { document, target } = createMixedUpgradePlanningFixture(scenario.key);
      const plan = planDynamicTemplateDocumentUpgrade({ document, target });
      expect(plan.upgradedCount).toBe(0);
      expect(plan.document).toBe(document);
      expect(plan.instancePlans).toHaveLength(2);
      const blocked = plan.instancePlans.find((item) => item.instanceId === "dynamic-upgrade-instance");
      const compatible = plan.instancePlans.find((item) => item.instanceId === "dynamic-upgrade-instance-2");
      expect(blocked?.analysis.blockers).toHaveLength(1);
      expect(blocked?.analysis.blockers[0]).toMatch(scenario.reason);
      expect(compatible?.analysis.blockers).toEqual([]);
      expect(plan.blockers).toHaveLength(1);
      expect(plan.blockers[0]).toContain("dynamic-upgrade-instance");
    });
  }

  test("页面设计覆盖只无损写入母模板设计字段，并对同字段草稿修改报冲突", () => {
    const source = definition(1) as any;
    const target = structuredClone(source);
    const overrides = {
      node_heading: {
        desktop: {
          offsetXPercent: 8,
          offsetYPercent: -4,
          widthPercent: 115,
          zIndex: 3,
          fontSizePx: 40,
          textAlign: "center",
          marginTopPx: 12,
          marginBottomPx: 18,
        },
      },
    } as any;

    const promotion = promoteInstanceOverridesToTemplateDraft({
      sourceDefinition: source,
      targetDefinition: target,
      layoutOverridesByNodeId: overrides,
    });
    expect(promotion.blockers).toEqual([]);
    expect(promotion.conflicts).toEqual([]);
    expect(promotion.promoted).toHaveLength(5);
    expect(promotion.skipped.map((item) => item.field).sort()).toEqual([
      "offsetXPercent",
      "offsetYPercent",
      "zIndex",
    ]);
    expect(promotion.definition.nodes.node_heading.responsive.desktop.width).toEqual({ value: 115, unit: "%" });
    expect(promotion.definition.nodes.node_heading.responsive.desktop.margin).toMatchObject({
      top: { value: 12, unit: "px" },
      bottom: { value: 18, unit: "px" },
    });
    expect(promotion.definition.slots.slot_heading.desktopRules).toMatchObject({
      fontSize: { value: 40, unit: "px" },
      textAlign: "center",
    });
    expect(target.nodes.node_heading.responsive.desktop.width).toBe("fill");

    const conflictingTarget = structuredClone(source);
    conflictingTarget.slots.slot_heading.desktopRules.fontSize = { value: 32, unit: "px" };
    const conflict = promoteInstanceOverridesToTemplateDraft({
      sourceDefinition: source,
      targetDefinition: conflictingTarget,
      layoutOverridesByNodeId: { node_heading: { desktop: { fontSizePx: 40 } } },
    });
    expect(conflict.promoted).toEqual([]);
    expect(conflict.conflicts).toHaveLength(1);
    expect(conflict.conflicts[0]).toMatchObject({ nodeId: "node_heading", field: "fontSizePx" });
    expect(conflictingTarget.slots.slot_heading.desktopRules.fontSize).toEqual({ value: 32, unit: "px" });
  });

  test("页面装修按 Puck iframe 设备切换模板规则，不受后台宿主窗口宽度影响", async ({ page }) => {
    await prepareEditor(page);
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const template = canvas.locator('[data-dynamic-template-instance-id="dynamic-upgrade-instance"]');
    const renderer = template.locator("[data-dynamic-template-device]");
    const container = template.locator('[data-template-node-id="node_container"]');

    expect(page.viewportSize()?.width).toBeGreaterThan(767);
    await expect(renderer).toHaveAttribute("data-dynamic-template-device", "desktop");
    await expect(container).toHaveCSS("gap", "16px");

    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect(renderer).toHaveAttribute("data-dynamic-template-device", "mobile");
    await expect(container).toHaveCSS("gap", "normal");
    await expect.poll(() => canvas.locator("html").evaluate((element) => element.clientWidth))
      .toBeLessThan(768);

    await page.getByRole("button", { name: /桌面端布局/ }).click();
    await expect(renderer).toHaveAttribute("data-dynamic-template-device", "desktop");
  });

  test("浅色首屏在页面装修预览中使用透明深字页头", async ({ page }) => {
    await prepareEditor(page);
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const frame = canvas.locator(".homepage-editor__storefront-frame");
    const header = canvas.locator(".site-header");
    const template = canvas.locator('[data-dynamic-template-instance-id="dynamic-upgrade-instance"]');

    await expect(frame).toHaveAttribute("data-page-header-mode", "solid");
    await expect(canvas.locator(".storefront-navigation")).toHaveAttribute("data-page-header-surface", "transparent");
    await expect(header).toHaveClass(/is-transparent/);
    await expect(header).not.toHaveClass(/is-overlay-light/);
    await expect(header).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const [headerBox, templateBox] = await Promise.all([
      header.boundingBox(),
      template.boundingBox(),
    ]);
    expect(headerBox).not.toBeNull();
    expect(templateBox).not.toBeNull();
    expect(templateBox!.y).toBeLessThan(headerBox!.y + headerBox!.height);
  });

  test("已有动态主舞台时发布卡保留且插入关闭，独立升级只修改当前页面草稿", async ({ page }) => {
    const { inspector, savedPayload, currentDocument, templateWrites } = await prepareEditor(page, {
      primaryStage: true,
    });
    const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
    if (await expandLibrary.isVisible()) await expandLibrary.click();

    const cardControl = page.getByRole("button", {
      name: "内容展示｜版本升级版本2已添加为主舞台，不能再次添加",
    });
    await expect(cardControl).toBeVisible();
    await expect(cardControl).toHaveAttribute("aria-disabled", "true");
    await expect(cardControl).toHaveAttribute("draggable", "false");
    await expect(cardControl.locator("..")).toContainText("已添加 · 主舞台不可重复");
    const dragTypes = await cardControl.evaluate((element) => {
      const dataTransfer = new DataTransfer();
      element.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
      return [...dataTransfer.types];
    });
    expect(dragTypes).toEqual([]);
    await cardControl.click({ force: true });
    await cardControl.press("Enter");
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "首屏主舞台不能复制" })).toBeDisabled();

    const upgrade = page.getByRole("button", {
      name: "升级页面中的内容展示｜版本升级动态模板，共 1 处",
    });
    await upgrade.click();
    const dialog = page.getByRole("dialog", {
      name: "升级“内容展示｜版本升级”动态模板实例",
    });
    await expect(dialog).toContainText("只修改当前内存草稿并增加一条页面历史");
    await expect(dialog).toContainText("不会自动保存、发布或回写母模板");
    await dialog.getByRole("button", { name: "保留当前版本" }).click();
    await upgrade.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog", {
      name: "升级“内容展示｜版本升级”动态模板实例",
    }).last().getByRole("button", { name: "确认升级页面草稿" }).click();

    await expect(inspector).toContainText("固定版本 tpl_page_upgrade v2");
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);
    await expect(page.getByText("修改已更新，尚未保存页面草稿", { exact: true })).toBeVisible();
    expect(savedPayload()).toBeNull();
    expect(currentDocument().publishedRevisionId).toBe(91);
    expect(templateWrites).toEqual([]);
  });

  for (const scenario of [
    { name: "无新版", options: { noNewVersion: true } },
    { name: "新版布局非法", options: { invalidLatestDefinition: true } },
    { name: "新版不符合页面导航规则", options: { incompatibleHeader: true } },
  ] as const) {
    test(`动态主舞台发布卡在${scenario.name}时保持可发现且不开放升级`, async ({ page }) => {
      const { savedPayload, templateWrites } = await prepareEditor(page, {
        primaryStage: true,
        ...scenario.options,
      });
      const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
      if (await expandLibrary.isVisible()) await expandLibrary.click();
      const cardControl = page.getByRole("button", {
        name: new RegExp("内容展示｜版本升级版本[12]已添加为主舞台，不能再次添加"),
      });
      await expect(cardControl).toBeVisible();
      await expect(page.getByRole("button", { name: /升级页面中的内容展示｜版本升级动态模板/ }))
        .toHaveCount(0);
      await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);
      expect(savedPayload()).toBeNull();
      expect(templateWrites).toEqual([]);
    });
  }

  test("升级会产生第二个主舞台时动态卡仍可发现但不开放升级", async ({ page }) => {
    const { savedPayload, templateWrites } = await prepareEditor(page, {
      upgradeWouldDuplicatePrimaryStage: true,
    });
    const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
    if (await expandLibrary.isVisible()) await expandLibrary.click();
    await expect(page.getByRole("button", {
      name: "内容展示｜版本升级版本2已添加为主舞台，不能再次添加",
    })).toBeVisible();
    await expect(page.getByRole("button", {
      name: /升级页面中的内容展示｜版本升级动态模板/,
    })).toHaveCount(0);
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(2);
    expect(savedPayload()).toBeNull();
    expect(templateWrites).toEqual([]);
  });

  for (const resolutionFailure of [
    {
      name: "缺少当前精确版本",
      options: { missingCurrentVersion: true },
      message: "页面锁定的模板版本缺失：tpl_page_upgrade@1",
    },
    {
      name: "当前精确版本定义非法",
      options: { invalidCurrentVersion: true },
      message: "页面锁定的模板版本解析失败：tpl_page_upgrade@1",
    },
  ] as const) {
    test(`${resolutionFailure.name}时给出可恢复错误且不会写入页面草稿`, async ({ page }) => {
      const {
        savedPayload,
        currentDocument,
        restoreCurrentVersion,
        pageWrites,
        templateWrites,
      } = await prepareEditor(page, {
        primaryStage: true,
        ...resolutionFailure.options,
      });
      const error = page.getByRole("alert");
      await expect(error).toContainText("模板版本解析失败");
      await expect(error).toContainText(resolutionFailure.message);
      await expect(error).toContainText("页面草稿未修改");
      await expect(error.getByRole("button", { name: "重新加载模板版本" })).toBeVisible();
      await expect(page.locator(".ant-spin-spinning")).toHaveCount(0);
      expect(currentDocument().puckData.content[0].props.templateVersion).toBe(1);
      expect(savedPayload()).toBeNull();
      expect(pageWrites).toEqual([]);
      expect(templateWrites).toEqual([]);

      restoreCurrentVersion();
      await error.getByRole("button", { name: "重新加载模板版本" }).click();
      await expect(error).toHaveCount(0);
      await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);
      expect(savedPayload()).toBeNull();
      expect(pageWrites).toEqual([]);
      expect(templateWrites).toEqual([]);
    });
  }

  test("同一已发布母模板可连续拖入任意多个页面实例并保存", async ({ page }) => {
    const { savedPayload } = await prepareEditor(page);
    await page.evaluate(() => {
      type DragImageObservation = {
        marker: string | null;
        text: string;
        containsLivePreview: boolean;
        offsetX: number;
        offsetY: number;
      };
      const observedWindow = window as typeof window & {
        __templateDragImageObservations?: DragImageObservation[];
      };
      observedWindow.__templateDragImageObservations = [];
      const originalSetDragImage = DataTransfer.prototype.setDragImage;
      DataTransfer.prototype.setDragImage = function setDragImage(
        this: DataTransfer,
        image: Element,
        offsetX: number,
        offsetY: number,
      ) {
        observedWindow.__templateDragImageObservations?.push({
          marker: image.getAttribute("data-template-catalog-drag-image"),
          text: image.textContent ?? "",
          containsLivePreview: Boolean(image.querySelector(
            ".homepage-editor__template-preview-wrap, [data-dynamic-template-id], [data-content-template]",
          )),
          offsetX,
          offsetY,
        });
        originalSetDragImage.call(this, image, offsetX, offsetY);
      };
    });
    const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
    if (await expandLibrary.isVisible()) await expandLibrary.click();

    const templateCard = page.getByRole("button", {
      name: "添加内容展示｜版本升级版本2",
    });
    const canvas = page.locator(".homepage-editor__canvas-document");
    const layers = page.locator(".homepage-editor__layer-item");

    const dragTemplateToCanvas = async () => {
      await templateCard.scrollIntoViewIfNeeded();
      const [templateBox, canvasBox] = await Promise.all([
        templateCard.boundingBox(),
        canvas.boundingBox(),
      ]);
      if (!templateBox || !canvasBox) throw new Error("模板卡片或画布缺少拖放尺寸");
      await page.mouse.move(
        templateBox.x + templateBox.width / 2,
        templateBox.y + templateBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        canvasBox.x + canvasBox.width / 2,
        canvasBox.y + canvasBox.height / 2,
        { steps: 8 },
      );
      await expect(canvas).toHaveClass(/is-dragging/);
      await page.mouse.up();
    };

    await expect(templateCard).toHaveAttribute("draggable", "true");
    await dragTemplateToCanvas();
    await expect(layers).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => (
      window as typeof window & { __templateDragImageObservations?: unknown[] }
    ).__templateDragImageObservations?.length ?? 0)).toBeGreaterThan(0);
    const dragImageObservation = await page.evaluate(() => {
      const observedWindow = window as typeof window & {
        __templateDragImageObservations?: Array<{
          marker: string | null;
          text: string;
          containsLivePreview: boolean;
          offsetX: number;
          offsetY: number;
        }>;
      };
      return observedWindow.__templateDragImageObservations?.at(-1) ?? null;
    });
    expect(dragImageObservation).toMatchObject({
      marker: "static",
      containsLivePreview: false,
      offsetX: 18,
      offsetY: 18,
    });
    expect(dragImageObservation?.text).toBe("内容展示｜版本升级");
    await dragTemplateToCanvas();
    await expect(layers).toHaveCount(3);

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const payload = savedPayload() as {
      puckData: { content: Array<{ type: string; props: { templateId?: string } }> };
    };
    expect(payload.puckData.content).toHaveLength(3);
    expect(
      payload.puckData.content.filter((item) => item.props.templateId === "tpl_page_upgrade"),
    ).toHaveLength(3);
  });

  test("先预览差异再升级，兼容页面内容保留并随页面草稿保存", async ({ page }) => {
    const { inspector, savedPayload, currentDocument } = await prepareEditor(page);
    const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
    if (await expandLibrary.isVisible()) await expandLibrary.click();
    await expect(
      page.getByRole("button", { name: "添加内容展示｜版本升级版本2" }),
    ).toBeVisible();
    await expect(inspector).toContainText("固定版本 tpl_page_upgrade v1");
    await expect(inspector).toContainText("发现新版本 v2");

    await inspector.getByRole("button", { name: "查看差异" }).click();
    const dialog = page.getByRole("dialog", { name: "模板版本升级：v1 → v2" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("桌面端当前 v1")).toContainText("页面实例填写内容");
    await expect(dialog.getByLabel("桌面端目标 v2")).toContainText("页面实例填写内容");
    await expect(dialog.getByLabel("移动端当前 v1")).toContainText("页面实例填写内容");
    await expect(dialog.getByLabel("移动端目标 v2")).toContainText("页面实例填写内容");
    await dialog.getByRole("button", { name: "保留当前版本" }).click();
    await expect(inspector).toContainText("固定版本 tpl_page_upgrade v1");

    await inspector.getByRole("button", { name: "查看差异" }).click();
    await page.getByRole("dialog", { name: "模板版本升级：v1 → v2" })
      .getByRole("button", { name: "确认升级页面草稿" })
      .click();
    await expect(inspector).toContainText("固定版本 tpl_page_upgrade v2");
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const payload = savedPayload() as { puckData: { content: Array<{ props: Record<string, unknown> }> } };
    expect(payload.puckData.content[0].props.templateVersion).toBe(2);
    expect(payload.puckData.content[0].props.contentBySlotId).toEqual({ slot_heading: "页面实例填写内容" });
    expect(payload).not.toHaveProperty("publishedRevisionId");
    expect(currentDocument().publishedRevisionId).toBe(91);
    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await page.locator(
      '.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"] .homepage-editor__layer-select',
    ).click({ position: { x: 12, y: 18 } });
    await expect(page.getByRole("region", { name: "模板实例属性" }))
      .toContainText("固定版本 tpl_page_upgrade v2");
  });

  test("新增必填槽位允许显式升级，取消零副作用且确认只增加一条历史并定位待填字段", async ({ page }) => {
    const { inspector, pageWrites, templateWrites } = await prepareEditor(page, {
      requiredUpgrade: true,
    });
    const openReview = inspector.getByRole("button", { name: "查看差异" });
    await openReview.click();
    const review = page.getByRole("dialog", { name: "模板版本升级：v1 → v2" });
    await expect(review).toContainText("升级后待填写：新增必填正文");
    await expect(review.getByRole("button", { name: "确认升级页面草稿" })).toBeEnabled();
    await review.getByRole("button", { name: "保留当前版本" }).click();
    await expect(inspector).toContainText("固定版本 tpl_page_upgrade v1");
    await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);

    await openReview.click();
    await review.getByRole("button", { name: "确认升级页面草稿" }).click();
    await expect(inspector).toContainText("固定版本 tpl_page_upgrade v2");
    const pendingField = inspector.getByRole("textbox", { name: "新增必填正文" });
    await expect(pendingField).toBeFocused();
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);

    await page.getByRole("button", { name: "撤销" }).click();
    await expect(inspector).toContainText("固定版本 tpl_page_upgrade v1");
    await page.getByRole("button", { name: "重做" }).click();
    await expect(inspector).toContainText("固定版本 tpl_page_upgrade v2");
  });

  test("新增必填槽位未完成时发布预检定位字段且不发送发布请求", async ({ page }) => {
    const { inspector, savedPayload, pageWrites, validationRequestCount } = await prepareEditor(page, {
      requiredUpgrade: true,
      publishIssues: [{
        code: "required-field",
        message: "新增必填正文不能为空",
        severity: "error",
        blockId: "dynamic-upgrade-instance",
        path: "content[0].props.contentBySlotId.slot_required",
        field: "slot_required",
      }],
    });
    await inspector.getByRole("button", { name: "查看差异" }).click();
    await page.getByRole("dialog", { name: "模板版本升级：v1 → v2" })
      .getByRole("button", { name: "确认升级页面草稿" }).click();
    const validationsBeforePublish = validationRequestCount();
    await page.getByRole("button", { name: "发布到前台网站" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const review = page.getByRole("region", { name: "本次发布检查" });
    const issue = review.locator('[data-page-publish-field="slot_required"]');
    await expect(issue).toContainText("页面内容 / 新增必填正文");
    await issue.getByRole("button", { name: "定位" }).click();
    await expect(inspector.getByRole("textbox", { name: "新增必填正文" })).toBeFocused();
    expect(pageWrites.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "PUT /api/page-modules/document",
    ]);
    expect(validationRequestCount() - validationsBeforePublish).toBe(1);
  });

  test("目录批量审查逐实例展示待填状态，确认只增加一条历史并保持实例隔离", async ({ page }) => {
    const { inspector, pageWrites, templateWrites } = await prepareEditor(page, {
      duplicate: true,
      requiredUpgrade: true,
    });
    const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
    if (await expandLibrary.isVisible()) await expandLibrary.click();
    await page.getByRole("button", { name: /升级页面中的内容展示｜版本升级动态模板，共 2 处/ }).click();
    const review = page.getByRole("dialog", { name: "升级“内容展示｜版本升级”动态模板实例" });
    const instanceSummaries = review.getByRole("button").filter({ hasText: "待填 1" });
    await expect(instanceSummaries).toHaveCount(2);
    await review.getByRole("button", { name: "确认升级页面草稿" }).click();
    await expect(inspector).toContainText("固定版本 tpl_page_upgrade v2");
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);
    await page.getByRole("button", { name: "撤销" }).click();
    await page.locator(
      '.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"] .homepage-editor__layer-select',
    ).click({ position: { x: 12, y: 18 } });
    await expect(inspector).toContainText("固定版本 tpl_page_upgrade v1");
    await page.getByRole("button", { name: "重做" }).click();
    await page.locator(
      '.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"] .homepage-editor__layer-select',
    ).click({ position: { x: 12, y: 18 } });
    await expect(inspector).toContainText("固定版本 tpl_page_upgrade v2");
  });

  for (const scenario of mixedUpgradeScenarios) {
    test(`${scenario.label}进入混合目录审查时逐实例显示原因并禁用整批确认`, async ({ page }) => {
      const { currentDocument, pageWrites, templateWrites } = await prepareEditor(page, {
        mixedUpgradeScenario: scenario.key,
      });
      const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
      if (await expandLibrary.isVisible()) await expandLibrary.click();
      await page.getByRole("button", {
        name: /升级页面中的内容展示｜版本升级动态模板，共 2 处/,
      }).click();
      const review = page.getByRole("dialog", {
        name: "升级“内容展示｜版本升级”动态模板实例",
      });
      const blockedInstance = review.getByRole("button", {
        name: /^审查实例 dynamic-upgrade-instance：保留 \d+，待填 \d+，阻断 1$/,
      });
      const compatibleInstance = review.getByRole("button", {
        name: /^审查实例 dynamic-upgrade-instance-2：保留 \d+，待填 \d+，阻断 0$/,
      });
      await expect(blockedInstance).toBeVisible();
      await expect(compatibleInstance).toBeVisible();
      await blockedInstance.click();
      await expect(review.getByRole("alert").filter({ hasText: scenario.reason })).toBeVisible();
      await expect(review.getByRole("button", { name: "确认升级页面草稿" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
      await expect(page.getByText("修改已更新，尚未保存页面草稿", { exact: true })).toHaveCount(0);
      const firstVersion = currentDocument().puckData.content.find((block) => (
        block.props.instanceId === "dynamic-upgrade-instance"
      ))?.props.templateVersion;
      const secondVersion = currentDocument().puckData.content.find((block) => (
        block.props.instanceId === "dynamic-upgrade-instance-2"
      ))?.props.templateVersion;
      expect(firstVersion).toBe(1);
      expect(secondVersion).toBe(2);
      expect(pageWrites).toEqual([]);
      expect(templateWrites).toEqual([]);
    });
  }

  test("非空槽位删除与桌面移动构图策略收紧均为破坏性阻断，单实例和目录审查都不能继续", async ({ page }) => {
    const { inspector, pageWrites, templateWrites } = await prepareEditor(page, {
      destructiveRemoval: true,
    });
    await inspector.getByRole("button", { name: "查看差异" }).click();
    const single = page.getByRole("dialog", { name: "模板版本升级：v1 → v2" });
    await expect(single).toContainText("原页面内容无法无损保留");
    await expect(single.getByRole("button", { name: "确认升级页面草稿" })).toBeDisabled();
    await single.getByRole("button", { name: "保留当前版本" }).click();
    const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
    if (await expandLibrary.isVisible()) await expandLibrary.click();
    await page.getByRole("button", { name: /升级页面中的内容展示｜版本升级动态模板/ }).click();
    const batch = page.getByRole("dialog", { name: "升级“内容展示｜版本升级”动态模板实例" });
    await expect(batch).toContainText("阻断 1");
    await expect(batch.getByRole("button", { name: "确认升级页面草稿" })).toBeDisabled();
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);
  });

  test("目标版本收紧构图策略时同时阻断桌面与移动覆盖", async ({ page }) => {
    const { inspector, pageWrites } = await prepareEditor(page, {
      legacyLayout: true,
      restrictLatestLayout: true,
    });
    await inspector.getByRole("button", { name: "查看差异" }).click();
    const review = page.getByRole("dialog", { name: "模板版本升级：v1 → v2" });
    await expect(review).toContainText("桌面端节点“标题”");
    await expect(review).toContainText("移动端节点“标题”");
    await expect(review.getByRole("button", { name: "确认升级页面草稿" })).toBeDisabled();
    expect(pageWrites).toEqual([]);
  });

  test("打开页面只显示个人模板可升级提示，原 revision、草稿和 dirty 状态保持不变", async ({ page }) => {
    const { currentDocument, pageWrites } = await prepareEditor(page, {
      personalUpgradeHint: true,
    });
    const hint = page.getByRole("status").filter({ hasText: "历史个人模板实例可升级" });
    await expect(hint).toContainText("1 个历史个人模板实例可升级");
    await expect(hint).toContainText("打开页面不会自动改写");
    await expect(page.getByText("修改已更新，尚未保存页面草稿", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
    expect(currentDocument().puckData.content[1].props.__templateOrigin).toEqual({
      kind: "personal",
      templateId: 77,
      revision: 1,
    });
    expect(currentDocument().puckData.content[1].props.__instanceOverrides).toEqual({
      version: 2,
      frame: { colorPreset: "mist" },
    });
    expect(pageWrites).toEqual([]);
  });

  test("升级审查在四个验收视口无横向溢出，Esc 关闭后焦点返回触发按钮", async ({ page }) => {
    const { inspector } = await prepareEditor(page);
    const trigger = inspector.getByRole("button", { name: "查看差异" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "模板版本升级：v1 → v2" });
    for (const viewport of [
      { width: 1600, height: 1000 },
      { width: 1280, height: 900 },
      { width: 1024, height: 768 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 1600, height: 1000 });
    await dialog.getByRole("button", { name: "保留当前版本" }).focus();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("EDITOR 可保存含待填槽位的升级草稿，但不能发送发布请求", async ({ page }) => {
    const { inspector, savedPayload, pageWrites } = await prepareEditor(page, {
      requiredUpgrade: true,
      adminRole: "EDITOR",
    });
    await inspector.getByRole("button", { name: "查看差异" }).click();
    await page.getByRole("dialog", { name: "模板版本升级：v1 → v2" })
      .getByRole("button", { name: "确认升级页面草稿" }).click();
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const publish = page.getByRole("button", { name: /当前账号只能编辑草稿/ });
    await expect(publish).toBeDisabled();
    await expect(publish).toHaveAttribute("aria-label", /当前账号只能编辑草稿/);
    expect(pageWrites.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "PUT /api/page-modules/document",
    ]);
  });

  test("ADMIN 显式发布升级草稿严格执行保存、校验、PUT 发布且不写母模板", async ({ page }) => {
    const { inspector, pageWrites, templateWrites, validationRequestCount } = await prepareEditor(page, {
      adminRole: "ADMIN",
    });
    await inspector.getByRole("button", { name: "查看差异" }).click();
    await page.getByRole("dialog", { name: "模板版本升级：v1 → v2" })
      .getByRole("button", { name: "确认升级页面草稿" }).click();
    const validationsBeforePublish = validationRequestCount();
    await page.getByRole("button", { name: "发布到前台网站" }).click();
    await expect.poll(() => pageWrites.length).toBe(2);
    expect(pageWrites.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "PUT /api/page-modules/document",
      "PUT /api/page-modules/document/publish",
    ]);
    expect(validationRequestCount() - validationsBeforePublish).toBe(1);
    expect(templateWrites).toEqual([]);
  });

  for (const failure of [
    { status: 500 as const, label: "500", dialog: false },
    { status: 409 as const, label: "409", dialog: true },
  ]) {
    test(`升级草稿保存遇到 ${failure.label} 时保留目标版本、待填字段与本地 dirty`, async ({ page }) => {
      const { inspector, currentDocument, pageWrites, templateWrites } = await prepareEditor(page, {
        requiredUpgrade: true,
        saveFailureStatus: failure.status,
      });
      await inspector.getByRole("button", { name: "查看差异" }).click();
      await page.getByRole("dialog", { name: "模板版本升级：v1 → v2" })
        .getByRole("button", { name: "确认升级页面草稿" }).click();
      await page.getByRole("button", { name: "保存当前装修草稿" }).click();
      if (failure.dialog) {
        const conflict = page.getByRole("dialog", { name: "检测到其他人更新了这份整页草稿" });
        await expect(conflict).toContainText("当前页面设置与画布修改仍完整保留");
        await conflict.getByRole("button", { name: "保留本地修改" }).click();
      } else {
        await expect(page.getByText("整页草稿保存失败，请重试", { exact: true })).toBeVisible();
      }
      await expect(inspector).toContainText("固定版本 tpl_page_upgrade v2");
      await expect(inspector.getByRole("textbox", { name: "新增必填正文" })).toHaveValue("");
      await expect(page.getByText("修改已更新，尚未保存页面草稿", { exact: true })).toBeVisible();
      expect(currentDocument().puckData.content[0].props.templateVersion).toBe(1);
      expect(pageWrites.map(({ method }) => method)).toEqual(["PUT"]);
      expect(templateWrites).toEqual([]);
    });
  }

  test("版本检查失败只显示可恢复提示，不改变当前页面实例", async ({ page }) => {
    const { inspector } = await prepareEditor(page, { failVersionCheck: true });
    await expect(inspector).toContainText("固定版本 tpl_page_upgrade v1");
    await expect(inspector).toContainText("暂时无法检查模板新版本，当前页面版本未改变");
    await expect(inspector.getByRole("button", { name: "保存页面草稿" })).toHaveCount(0);
    await expect(inspector.getByRole("status", { name: /页面草稿已保存/ })).toBeVisible();
  });

  test("整个页面实例显隐在编辑、预览、保存与刷新之间保持一致", async ({ page }) => {
    const { inspector, savedPayload } = await prepareEditor(page);
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const visibility = inspector.getByRole("switch", { name: "在页面显示" });
    await expect(visibility).toBeChecked();
    await expect(canvas.locator('[data-dynamic-template-instance-id="dynamic-upgrade-instance"]'))
      .toHaveAttribute("data-dynamic-template-render-mode", "editor");

    await visibility.click();
    await expect(visibility).not.toBeChecked();
    await expect(canvas.getByText("此模块已隐藏，不会发布到前台", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "预览当前画布" }).click();
    await expect(canvas.getByText("此模块已隐藏，不会发布到前台", { exact: true })).toHaveCount(0);
    await expect(canvas.getByText("页面实例填写内容", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "退出当前画布预览" }).click();
    await expect(canvas.getByText("此模块已隐藏，不会发布到前台", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const payload = savedPayload() as { puckData: { content: Array<{ props: Record<string, unknown> }> } };
    expect(payload.puckData.content[0].props.isVisible).toBe(false);

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const refreshedCanvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    await expect(refreshedCanvas.getByText("此模块已隐藏，不会发布到前台", { exact: true })).toBeVisible();
    await page.locator(".homepage-editor__layer-item .homepage-editor__layer-select")
      .first()
      .click({ position: { x: 12, y: 18 } });
    const refreshedInspector = page.getByRole("region", { name: "模板实例属性" });
    const refreshedVisibility = refreshedInspector.getByRole("switch", { name: "在页面显示" });
    await expect(refreshedVisibility).not.toBeChecked();
    await refreshedVisibility.click();
    await expect(refreshedCanvas.getByText("页面实例填写内容", { exact: true })).toBeVisible();
  });

  test("动态模板画布点击只保持模板级完整属性面板", async ({ page }) => {
    const { inspector, templateWrites } = await prepareEditor(page, { legacyLayout: true });
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const renderer = canvas.locator('[data-dynamic-template-instance-id="dynamic-upgrade-instance"] .hc-dynamic-template');
    const heading = canvas.locator('[data-template-node-id="node_heading"]');

    await expect(renderer).toHaveAttribute("data-dynamic-template-editor-surface", "page-instance");
    const propertyScope = inspector.getByRole("group", { name: "页面实例属性范围" });
    await expect(propertyScope.getByRole("button", { name: "全部内容", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(inspector.getByRole("region", { name: "实例管理" })).toBeVisible();
    await expect(heading).not.toHaveAttribute("role", "group");
    await expect(heading).not.toHaveAttribute("tabindex", "0");

    await heading.click();
    await expect(inspector).toContainText("页面实例编辑边界");
    await expect(inspector).not.toContainText("当前选择：标题");
    await expect(canvas.locator('[data-template-selected="true"]')).toHaveCount(0);
    await expect(inspector.getByRole("textbox", { name: "标题" })).toBeVisible();
    await expect(inspector.getByRole("button", { name: "调整区域" })).toHaveCount(0);
    expect(templateWrites).toEqual([]);
  });

  test("母模板授权的几何、文字和间距由精确属性面板写入同一实例覆盖", async ({ page }) => {
    const { inspector, savedPayload, templateWrites } = await prepareEditor(page, { legacyLayout: true });
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const heading = canvas.locator('[data-template-node-id="node_heading"]');
    await inspector.getByRole("group", { name: "页面实例属性范围" })
      .getByRole("button", { name: "标题", exact: true }).click();
    await expect(inspector).toContainText("当前选择：标题");
    await expect(inspector.getByRole("button", { name: "调整区域" })).toHaveCount(0);
    await expect(heading).toHaveAttribute("style", /translate\(8%, -4%\)/);
    const horizontalOffset = inspector.getByRole("spinbutton", { name: "水平偏移" });
    await horizontalOffset.fill("999");
    await expect(horizontalOffset).toHaveValue("20");
    await horizontalOffset.fill("7");
    await inspector.getByRole("spinbutton", { name: "垂直偏移" }).fill("-6");
    await inspector.getByRole("spinbutton", { name: "区域宽度" }).fill("110");
    await inspector.getByRole("spinbutton", { name: "层级" }).fill("4");
    await inspector.getByRole("spinbutton", { name: "标题字号" }).fill("42");
    await inspector.getByRole("combobox", { name: "标题文字对齐" }).locator("xpath=../..").click();
    await page.locator(".ant-select-dropdown:visible .ant-select-item-option").filter({ hasText: "右对齐" }).click();
    await inspector.getByRole("spinbutton", { name: "标题上间距" }).fill("14");
    await inspector.getByRole("spinbutton", { name: "标题下间距" }).fill("20");
    await inspector.getByRole("textbox", { name: "标题" }).fill("授权实例精确构图");
    await expect(heading).toHaveAttribute("style", /translate\(7%, -6%\)/);
    await expect(heading).toHaveAttribute("style", /width: 110%/);
    await expect(heading.getByRole("heading")).toHaveCSS("font-size", "42px");
    await expect(heading.getByRole("heading")).toHaveCSS("text-align", "right");
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const payload = savedPayload() as { puckData: { content: Array<{ props: Record<string, unknown> }> } };
    expect(payload.puckData.content[0].props.layoutOverridesByNodeId).toEqual({
      node_heading: {
        desktop: {
          offsetXPercent: 7,
          offsetYPercent: -6,
          widthPercent: 110,
          zIndex: 4,
          fontSizePx: 42,
          textAlign: "right",
          marginTopPx: 14,
          marginBottomPx: 20,
        },
      },
    });
    expect(payload.puckData.content[0].props.contentBySlotId).toEqual({ slot_heading: "授权实例精确构图" });
    expect(templateWrites).toEqual([]);
  });

  test("页面来源清晰可见，安全设计覆盖经确认进入未保存母模板草稿且不夹带页面内容", async ({ page }) => {
    const { inspector, templateSavedPayload, templateWrites } = await prepareEditor(page, { legacyLayout: true });
    await expect(inspector.getByLabel("当前字段来源")).toContainText("模板基线 · 固定版本");
    await expect(inspector.getByLabel("当前字段来源")).toContainText("页面内容覆盖 1");
    await expect(inspector.getByLabel("当前字段来源")).toContainText("页面设计覆盖 8");
    await expect(inspector.locator('[data-slot-id="slot_heading"]')).toContainText("页面内容");

    const promote = inspector.getByRole("button", { name: "应用设计覆盖到母模板草稿" });
    await expect(promote).toBeEnabled();
    await promote.click();
    expect(templateWrites).toEqual([]);

    const confirm = page.getByRole("dialog", { name: "应用 5 项设计覆盖到母模板草稿？" });
    await expect(confirm).toContainText("不会带入");
    await expect(confirm).toContainText("不会自动保存、发布或更新其他页面");
    await confirm.getByRole("button", { name: "打开模板草稿" }).click();

    await expect(page.getByLabel("模板状态：有未保存修改")).toBeVisible();
    await expect(page.getByRole("button", { name: "保存模板" })).toBeVisible();
    expect(templateWrites).toEqual([]);

    await page.getByRole("button", { name: "撤销" }).click();
    await expect(page.getByLabel("模板状态：已发布，有未发布修改")).toBeVisible();
    await page.getByRole("button", { name: "重做" }).click();
    await expect(page.getByLabel("模板状态：有未保存修改")).toBeVisible();

    await page.getByRole("button", { name: "保存模板" }).click();
    await expect.poll(() => templateSavedPayload()).not.toBeNull();
    const payload = templateSavedPayload() as {
      expectedRevision: number;
      definition: Record<string, any>;
    };
    expect(payload.expectedRevision).toBe(7);
    expect(payload.definition.nodes.node_heading.responsive.desktop.width).toEqual({ value: 115, unit: "%" });
    expect(payload.definition.nodes.node_heading.responsive.desktop.margin).toMatchObject({
      top: { value: 12, unit: "px" },
      bottom: { value: 18, unit: "px" },
    });
    expect(payload.definition.slots.slot_heading.desktopRules).toMatchObject({
      fontSize: { value: 40, unit: "px" },
      textAlign: "center",
    });
    expect(payload.definition.nodes.node_heading.responsive.desktop).not.toHaveProperty("placement");
    expect(payload.definition).not.toHaveProperty("contentBySlotId");
    expect(JSON.stringify(payload.definition)).not.toContain("页面实例填写内容");
    expect(templateWrites).toHaveLength(1);
    expect(templateWrites[0]).toMatchObject({
      method: "PATCH",
      path: "/api/page-modules/dynamic-templates/tpl_page_upgrade/draft",
    });
  });

  test("页面设计覆盖回填只向超级管理员开放，并在母模板同字段变化时整次阻断", async ({ page }) => {
    const admin = await prepareEditor(page, { legacyLayout: true, adminRole: "ADMIN" });
    const restrictedAction = admin.inspector.getByRole("button", { name: "应用设计覆盖到母模板草稿" });
    await expect(restrictedAction).toBeDisabled();
    await expect(admin.inspector).toContainText("只有超级管理员可以把页面设计覆盖应用到母模板草稿");
    expect(admin.templateWrites).toEqual([]);

    await page.unrouteAll({ behavior: "wait" });
    const superAdmin = await prepareEditor(page, { legacyLayout: true, templateConflict: true });
    await superAdmin.inspector.getByRole("button", { name: "应用设计覆盖到母模板草稿" }).click();
    const conflict = page.getByRole("dialog", { name: "未应用：母模板草稿存在安全冲突" });
    await expect(conflict).toContainText("母模板草稿已修改同一字段");
    await expect(conflict).toContainText("页面草稿未被修改");
    expect(superAdmin.templateWrites).toEqual([]);
    await conflict.getByRole("button", { name: "知道了" }).click();
    await expect(page.getByRole("button", { name: "保存当前装修草稿" })).toBeVisible();
  });

  test("普通图片槽位的适配、缩放和焦点按设备写入当前实例并在刷新后重放", async ({ page }) => {
    const { inspector, savedPayload } = await prepareEditor(page, { image: true });
    await expect(inspector.getByText("优先填写 · 媒体与画面", { exact: true })).toBeVisible();
    await expect(inspector.getByText("其他模板内容", { exact: false })).toHaveCount(0);
    await expect(inspector.locator('[data-slot-id="slot_image"]')).toContainText("图片");
    await expect(inspector.locator('[data-image-asset-guidance="slot_image"]'))
      .toHaveText("建议素材：1200 × 900 像素 · 桌面端 4:3 · 移动端 4:5");
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const image = canvas.locator('[data-template-node-id="node_image"] img');
    await expect(image).toHaveCSS("object-fit", "cover");
    await expect(image).toHaveCSS("object-position", "50% 50%");

    await expect(inspector.locator('[data-media-field="slot_image"]'))
      .toHaveAttribute("data-workspace-field-shared", "true");
    await expect(inspector.getByRole("spinbutton", { name: "主图图片缩放" }).locator("xpath=../.."))
      .toHaveAttribute("data-workspace-field-control", "number");
    await expect(inspector.locator('[data-image-focus-field]'))
      .toHaveAttribute("data-workspace-field-control", "image-focus");
    await expect(inspector.getByRole("button", { name: "恢复当前设备图片构图" }))
      .toHaveAttribute("data-workspace-field-shared", "true");

    await inspector.getByRole("combobox", { name: "主图图片适配" }).locator("xpath=../..").click();
    await page.locator(".ant-select-dropdown:visible .ant-select-item-option").filter({ hasText: "完整显示" }).click();
    await inspector.getByRole("spinbutton", { name: "主图图片缩放" }).fill("130");
    const focusGroup = inspector.getByRole("group", { name: "主图画面焦点 · 桌面端常用位置" });
    await focusGroup.getByRole("button", { name: "左上", exact: true }).click();
    await expect(image).toHaveCSS("object-fit", "contain");
    await expect(image).toHaveCSS("object-position", "0% 0%");
    await expect(image).toHaveCSS("transform", /matrix\(1\.3/);

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const payload = savedPayload() as { puckData: { content: Array<{ props: Record<string, any> }> } };
    expect(payload.puckData.content[0].props.layoutOverridesByNodeId).toEqual({
      node_image: {
        desktop: { objectFit: "contain", imageScalePercent: 130, focusXPercent: 0, focusYPercent: 0 },
      },
    });

    await page.reload();
    const imageAfterReload = page.frameLocator(".homepage-editor__canvas-scale iframe").locator('[data-template-node-id="node_image"] img');
    await expect(imageAfterReload).toHaveCSS("object-fit", "contain");
    await expect(imageAfterReload).toHaveCSS("object-position", "0% 0%");
    await expect(imageAfterReload).toHaveCSS("transform", /matrix\(1\.3/);
  });

  test("母模板未授权时页面仍只编辑真实内容且不开放构图输入", async ({ page }) => {
    const { inspector, savedPayload } = await prepareEditor(page, { lockedLayout: true });
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const headingNode = canvas.locator('[data-template-node-id="node_heading"]');
    await inspector.getByRole("group", { name: "页面实例属性范围" })
      .getByRole("button", { name: "标题", exact: true }).click();
    await expect(inspector.getByRole("button", { name: "调整区域" })).toHaveCount(0);
    await expect(inspector.getByRole("spinbutton", { name: "水平偏移" })).toHaveCount(0);
    await expect(inspector.getByRole("spinbutton", { name: "标题字号" })).toHaveCount(0);
    await expect(inspector.getByRole("combobox", { name: "标题文字对齐" })).toHaveCount(0);
    await expect(inspector.getByRole("spinbutton", { name: "标题上间距" })).toHaveCount(0);
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          type: "homepage-editor:dynamic-layout-edit",
          workspace: "page",
          instanceId: "dynamic-upgrade-instance",
          nodeId: "node_heading",
          device: "desktop",
          override: { offsetXPercent: 12 },
        },
      }));
    });
    await inspector.getByRole("textbox", { name: "标题" }).fill("页面只修改真实文字");
    await expect(headingNode).toContainText("页面只修改真实文字");

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const payload = savedPayload() as { puckData: { content: Array<{ props: Record<string, any> }> } };
    expect(payload.puckData.content[0].props.layoutOverridesByNodeId).toEqual({});
    expect(payload.puckData.content[0].props.contentBySlotId).toEqual({ slot_heading: "页面只修改真实文字" });
  });

  test("恢复整个实例默认值只清除当前实例稀疏覆盖并可通过页面撤销恢复", async ({ page }) => {
    const { inspector } = await prepareEditor(page, { legacyLayout: true });
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const headingNode = canvas.locator('[data-template-node-id="node_heading"]');
    await expect(headingNode).toHaveAttribute("style", /translate\(8%, -4%\)/);

    const restoreInstance = inspector.getByRole("button", { name: "恢复整个实例默认值" });
    await expect(restoreInstance).toHaveAttribute("data-workspace-field-shared", "true");
    await expect(restoreInstance).toHaveAttribute("data-workspace-field-control", "restore-default");
    await restoreInstance.click();
    const confirm = page.getByRole("dialog", { name: "恢复整个实例默认值？" });
    await confirm.getByRole("button", { name: "恢复默认" }).click();
    await expect(canvas.getByRole("heading", { name: "版本 1 默认标题" })).toBeVisible();
    await expect(restoreInstance).toBeDisabled();

    await page.getByRole("button", { name: "撤销" }).click();
    await page.locator(".homepage-editor__layer-item .homepage-editor__layer-select").first().click({ position: { x: 12, y: 18 } });
    await expect(canvas.getByRole("heading", { name: "页面实例填写内容" })).toBeVisible();
    await expect(canvas.locator('[data-template-node-id="node_heading"]')).toHaveAttribute("style", /translate\(8%, -4%\)/);
  });

  test("同模板多实例编辑保持隔离，并在预览、保存与刷新后重放同一结果", async ({ page }) => {
    const { inspector, savedPayload, templateWrites, catalogReadCount } = await prepareEditor(page, { duplicate: true });
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const headings = canvas.locator('[data-template-node-id="node_heading"]');
    await expect(headings).toHaveCount(2);
    await expect(headings.nth(0)).toContainText("页面实例填写内容");
    await expect(headings.nth(1)).toContainText("第二实例保持原值");
    await expect.poll(catalogReadCount).toBeGreaterThan(0);
    const initialCatalogReadCount = catalogReadCount();
    const layerButtons = page.locator(".homepage-editor__layer-item .homepage-editor__layer-select");
    await layerButtons.nth(1).click({ position: { x: 12, y: 18 } });
    await expect(inspector.getByRole("textbox", { name: "标题" })).toHaveValue("第二实例保持原值");
    await expect.poll(catalogReadCount).toBe(initialCatalogReadCount);
    await layerButtons.nth(0).click({ position: { x: 12, y: 18 } });

    await inspector.getByRole("group", { name: "页面实例属性范围" })
      .getByRole("button", { name: "标题", exact: true }).click();
    const firstInstanceOffset = inspector.getByRole("spinbutton", { name: "水平偏移" });
    await firstInstanceOffset.fill("6");
    await expect(headings.nth(0)).toHaveAttribute("style", /translate\(6%, 0%\)/);
    await firstInstanceOffset.fill("0");
    await expect(headings.nth(0)).not.toHaveAttribute("style", /translate/);
    await firstInstanceOffset.fill("6");
    await inspector.getByRole("textbox", { name: "标题" }).fill("只修改第一个页面实例");
    await expect(headings.nth(0)).toContainText("只修改第一个页面实例");
    await expect(headings.nth(1)).toContainText("第二实例保持原值");
    await expect(headings.nth(0)).toHaveAttribute("style", /translate\(6%, 0%\)/);
    await expect(headings.nth(1)).not.toHaveAttribute("style", /translate/);

    await page.getByRole("button", { name: "预览当前画布" }).click();
    await expect(page.locator(".homepage-editor__preview-mode-bar")).toContainText("正在预览尚未保存的修改");
    await expect(canvas.getByText("只修改第一个页面实例", { exact: true })).toHaveCount(1);
    await expect(canvas.getByText("第二实例保持原值", { exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "退出当前画布预览" }).click();

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const payload = savedPayload() as { puckData: { content: Array<{ props: Record<string, any> }> } };
    expect(payload.puckData.content[0].props.contentBySlotId).toEqual({ slot_heading: "只修改第一个页面实例" });
    expect(payload.puckData.content[1].props.contentBySlotId).toEqual({ slot_heading: "第二实例保持原值" });
    expect(payload.puckData.content[0].props.layoutOverridesByNodeId).toEqual({
      node_heading: { desktop: { offsetXPercent: 6 } },
    });
    expect(payload.puckData.content[1].props.layoutOverridesByNodeId).toEqual({});
    expect(payload.puckData.content[0].props.instanceId).not.toBe(payload.puckData.content[1].props.instanceId);
    expect(templateWrites).toEqual([]);

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const refreshedCanvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    await expect(refreshedCanvas.getByText("只修改第一个页面实例", { exact: true })).toHaveCount(1);
    await expect(refreshedCanvas.getByText("第二实例保持原值", { exact: true })).toHaveCount(1);
  });

  test("发布问题按节点、设备和属性精确定位动态实例，并保留内容槽位映射", async ({ page }) => {
    const { inspector } = await prepareEditor(page, {
      duplicate: true,
      publishIssues: [
        {
          code: "invalid-instance-layout",
          message: "桌面端标题区域宽度无效",
          severity: "error",
          blockId: "dynamic-upgrade-instance",
          path: "content[0].props.layoutOverridesByNodeId.node_heading.desktop.widthPercent",
          field: "widthPercent",
        },
        {
          code: "invalid-instance-layout",
          message: "移动端标题字号无效",
          severity: "error",
          blockId: "dynamic-upgrade-block",
          path: "content[0].props.layoutOverridesByNodeId.node_heading.mobile.fontSizePx",
          field: "fontSizePx",
        },
        {
          code: "required-field",
          message: "页面实例标题不能为空",
          severity: "error",
          blockId: "dynamic-upgrade-instance",
          path: "content[0].props.contentBySlotId.slot_heading",
          field: "slot_heading",
        },
      ],
    });
    const layerButtons = page.locator(".homepage-editor__layer-item .homepage-editor__layer-select");
    await layerButtons.nth(1).click({ position: { x: 12, y: 18 } });
    await expect(inspector.getByRole("textbox", { name: "标题" })).toHaveValue("第二实例保持原值");

    await page.locator(".homepage-editor__toolbar-publish").click();
    const review = page.getByRole("region", { name: "本次发布检查" });
    await expect(review).toBeVisible();
    const desktopLayoutIssue = review.locator('[data-page-publish-field="widthPercent"]');
    const mobileLayoutIssue = review.locator('[data-page-publish-field="fontSizePx"]');
    const contentIssue = review.locator('[data-page-publish-field="slot_heading"]');
    await expect(desktopLayoutIssue).toHaveAttribute("data-page-publish-block", "dynamic-upgrade-block");
    await expect(desktopLayoutIssue).toHaveAttribute("data-page-publish-object", "node_heading");
    await expect(desktopLayoutIssue).toHaveAttribute("data-page-publish-device", "desktop");
    await expect(desktopLayoutIssue).toContainText("实例构图 / 区域宽度");
    await expect(mobileLayoutIssue).toHaveAttribute("data-page-publish-device", "mobile");
    await expect(contentIssue).toContainText("页面内容 / 标题");

    await desktopLayoutIssue.getByRole("button", { name: "定位" }).click();
    const desktopWidth = inspector.locator(
      '[data-inspector-field="widthPercent"][data-inspector-device="desktop"][data-page-publish-located="true"]',
    );
    await expect(desktopWidth).toBeVisible();
    await expect(desktopWidth.getByRole("spinbutton", { name: "区域宽度" })).toBeFocused();
    await expect(inspector.getByRole("textbox", { name: "标题" })).toHaveValue("页面实例填写内容");
    await expect(layerButtons.nth(0)).toHaveAttribute("aria-current", "location");
    await expect(layerButtons.nth(1)).not.toHaveAttribute("aria-current", "location");

    await mobileLayoutIssue.getByRole("button", { name: "定位" }).click();
    await expect(page.getByRole("button", { name: /移动端布局/ })).toHaveAttribute("aria-pressed", "true");
    const mobileFontSize = inspector.locator(
      '[data-inspector-field="fontSizePx"][data-inspector-device="mobile"][data-page-publish-located="true"]',
    );
    await expect(mobileFontSize).toBeVisible();
    await expect(mobileFontSize.getByRole("spinbutton", { name: "标题字号" })).toBeFocused();

    await contentIssue.getByRole("button", { name: "定位" }).click();
    const titleContent = inspector.locator(
      '[data-inspector-field="slot_heading"][data-page-publish-located="true"]',
    );
    await expect(titleContent).toBeVisible();
    await expect(titleContent.getByRole("textbox", { name: "标题" })).toBeFocused();
  });

  test("复杂组件字段在页面模式只写当前实例覆盖，不写母模板版本", async ({ page }) => {
    const { inspector, savedPayload, templateWrites } = await prepareEditor(page, { complex: true });
    const complexFields = inspector.locator('[data-complex-content-type="carousel"]');
    await expect(complexFields).toHaveAttribute("data-complex-content-scope", "page");
    await expect(complexFields).toContainText("这里的内容只写入当前页面实例，不会修改母模板或其他实例");
    await complexFields.getByRole("group", { name: "切换间隔" })
      .getByRole("button", { name: "6 秒" })
      .click();
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const payload = savedPayload() as { puckData: { content: Array<{ props: Record<string, any> }> } };
    expect(payload.puckData.content[0].props.contentBySlotId.slot_heading).toBe("页面实例填写内容");
    expect(payload.puckData.content[0].props.contentBySlotId.slot_carousel).toMatchObject({ interval: "6000" });
    expect(payload.puckData.content[0].props.templateId).toBe("tpl_page_upgrade");
    expect(templateWrites).toEqual([]);
  });

  test("业务组件在页面模式只编辑稳定引用，布局继续由母模板控制", async ({ page }) => {
    const { inspector, savedPayload, templateWrites } = await prepareEditor(page, { business: true });
    const businessFields = inspector.locator('[data-complex-content-type="productCollection"]');
    await expect(businessFields).toHaveAttribute("data-complex-content-scope", "page");
    await expect(businessFields.getByText("选择商品", { exact: true })).toBeVisible();
    await expect(businessFields).toContainText("这里的内容只写入当前页面实例，不会修改母模板或其他实例");
    await businessFields.getByRole("button", { name: "选择商品" }).click();
    const picker = page.getByRole("dialog", { name: "选择商品" });
    await picker.getByRole("button", { name: /业务商品 P-500/ }).click();
    await picker.getByRole("button", { name: /业务商品 P-600/ }).click();
    await picker.getByRole("button", { name: /确认选择（2）/ }).click();
    await expect(businessFields.getByRole("group", { name: "电脑端列数" })).toHaveCount(0);
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const payload = savedPayload() as { puckData: { content: Array<{ props: Record<string, any> }> } };
    const content = payload.puckData.content[0].props.contentBySlotId.slot_product_collection;
    expect(content).toMatchObject({ layout: "grid-3", productCodes: ["P-500", "P-600"] });
    expect(content).not.toHaveProperty("productIds");
    expect(payload.puckData.content[0].props.templateId).toBe("tpl_page_upgrade");
    expect(templateWrites).toEqual([]);
  });

  test("直接商品、集合和行动槽位复用运营选择器并只保存稳定引用", async ({ page }) => {
    const { inspector, savedPayload, templateWrites } = await prepareEditor(page, { directBusiness: true });
    await expect(inspector.getByText("优先填写 · 商品与分类", { exact: true })).toBeVisible();
    await expect(inspector.locator("fieldset:visible").first()).toHaveAttribute("data-slot-id", "slot_product");
    await expect(inspector.getByText("其他模板内容", { exact: false })).toHaveCount(0);
    await expect(inspector.locator("fieldset:visible")).toHaveCount(5);
    await expect(inspector.getByRole("textbox", { name: "补充说明" })).toBeVisible();
    await expect(inspector.locator('[data-slot-id="slot_product"]')).toContainText("商品");
    await expect(inspector.locator('[data-slot-id="slot_action"]')).toContainText("按钮");
    await expect(inspector.locator('[data-slot-id="slot_heading"]')
      .getByRole("button", { name: "移除页面内容覆盖" })).toBeDisabled();

    const productField = inspector.locator("fieldset").filter({ hasText: "主商品" });
    await productField.getByRole("button", { name: "选择商品" }).click();
    let picker = page.getByRole("dialog", { name: "选择商品" });
    await picker.getByRole("button", { name: /业务商品 P-500/ }).click();
    await picker.getByRole("button", { name: /确认选择（1）/ }).click();

    const collectionField = inspector.locator("fieldset").filter({ hasText: "搭配商品" });
    await collectionField.getByRole("button", { name: "选择商品" }).click();
    picker = page.getByRole("dialog", { name: "选择商品" });
    await picker.getByRole("button", { name: /业务商品 P-500/ }).click();
    await picker.getByRole("button", { name: /业务商品 P-600/ }).click();
    await picker.getByRole("button", { name: /确认选择（2）/ }).click();

    const actionField = inspector.locator("fieldset").filter({ hasText: "主行动" });
    await actionField.getByRole("textbox", { name: "主行动文案" }).fill("查看品牌故事");
    await actionField.getByRole("button", { name: "页面", exact: true }).click();
    await actionField.getByLabel("站内页面").fill("/about");

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const payload = savedPayload() as { puckData: { content: Array<{ props: Record<string, any> }> } };
    const content = payload.puckData.content[0].props.contentBySlotId;
    expect(content.slot_product).toBe("P-500");
    expect(content.slot_collection).toEqual(["P-500", "P-600"]);
    expect(content.slot_action).toEqual({
      label: "查看品牌故事",
      targetType: "page",
      pagePath: "/about",
    });
    expect(JSON.stringify(content)).not.toContain("price");
    expect(JSON.stringify(content)).not.toContain("inventory");
    expect(templateWrites).toEqual([]);
  });
});
