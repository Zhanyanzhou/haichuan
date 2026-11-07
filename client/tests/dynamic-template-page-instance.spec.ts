import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { installAdminSession } from "./fixtures/session-auth";
import { LAUNCH_TEMPLATE_MASTERS } from "../src/page-builder/template-creation/launchTemplateSet";
import { applyStandardTemplateCanvasPair } from "../src/page-builder/template-definition/templateDimensions";
import {
  getDynamicTemplatePageFieldDescriptors,
  groupDynamicTemplatePageFields,
  type DynamicTemplatePageFieldDescriptor,
} from "../src/page-builder/dynamic-template-instance/pageFieldDescriptors";
import { promoteInstanceOverridesToTemplateDraft } from "../src/page-builder/dynamic-template-instance/promoteToTemplate";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  dynamicTemplateVersionKey,
} from "../src/page-builder/dynamic-template-instance/types";
import { analyzeDynamicTemplateUpgrade, planDynamicTemplateDocumentUpgrade } from "../src/page-builder/dynamic-template-instance/upgrade";
import {
  hasVisiblePrimaryStage,
  isVisiblePrimaryStageBlockInDocument,
} from "../src/page-builder/utils/primaryStagePolicy";

const appMode = process.env.PLAYWRIGHT_APP_MODE === "mock" ? "mock" : "development";

async function openBlockActions(page: Page, inspector: Locator) {
  const trigger = inspector.getByRole("button", { name: "区块操作", exact: true });
  await expect(trigger).toBeVisible();
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  return page.getByRole("dialog", { name: "区块操作", exact: true });
}

async function openVersionDiff(page: Page, inspector: Locator) {
  const actions = await openBlockActions(page, inspector);
  await actions.getByRole("button", { name: "查看差异", exact: true }).click();
}

async function openImageDescription(page: Page, field: Locator) {
  const review = page.getByRole("region", { name: "本次发布检查" });
  if (!(await review.isVisible())) {
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: /发布检查（\d+ 项）/ }).click();
  }
  const nodeId = await field.getAttribute("data-inspector-object-id");
  await review.locator(`[data-page-publish-object="${nodeId}"][data-page-publish-field="alt"]`)
    .getByRole("button", { name: "定位", exact: true }).click();
  return field.getByRole("textbox", { name: /替代文字$/ });
}

async function selectInternalPage(page: Page, field: Locator, name: string) {
  await field.getByRole("button", { name: "页面", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "选择页面", exact: true });
  await dialog.getByRole("radio", { name, exact: true }).check();
  await dialog.getByRole("button", { name: "确认选择", exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function uploadFixtureImage(page: Page, field: Locator, url: string) {
  const buffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const uploadUrl = "**/api/upload/image";
  await page.route(uploadUrl, (route) => route.fulfill(json({ url })), { times: 1 });
  const response = page.waitForResponse((item) => item.url().endsWith("/api/upload/image") && item.request().method() === "POST");
  await field.locator('input[type="file"]').first().setInputFiles({ name: "test-image.png", mimeType: "image/png", buffer });
  await response;
}


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

function frameMasterDefinition(ratio: "16:9" | "2:1") {
  const master = LAUNCH_TEMPLATE_MASTERS.find((item) => item.metadata.sectionRole === "page-hero")!;
  const next = applyStandardTemplateCanvasPair(master, ratio === "16:9" ? { width: 16, height: 9 } : { width: 2, height: 1 });
  next.templateId = "tpl_page_upgrade";
  return next;
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

function mediaSideDefinition(version: 1 | 2 | 3, direction: "row" | "column" = "row") {
  const result: any = definition(version);
  result.nodes.node_container.responsive.desktop.direction = direction;
  result.nodes.node_container.childIds = ["node_side", "node_heading"];
  result.nodes.node_side = {
    nodeId: "node_side",
    type: "Spacer",
    name: "副栏留白",
    childIds: [],
    props: {},
    responsive: {
      desktop: { display: "block", order: 0, width: "fill", height: { mode: "auto" } },
      mobile: { display: "block", order: 0, width: "fill", height: { mode: "auto" } },
    },
    hidden: false,
  };
  result.metadata.pageSettings = {
    mediaSide: { targetNodeId: "node_container", authoredSide: "start" },
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

function descriptorPolicyDefinition(version: 1 | 2 | 3) {
  const result: any = imageDefinition(version);
  result.nodes.node_heading.instanceEditPolicy = {
    position: false,
    size: false,
    zIndex: false,
    imageFit: false,
    imageFocus: false,
    typography: true,
    spacing: false,
    minWidthPercent: 25,
    maxWidthPercent: 150,
    maxOffsetPercent: 30,
    minFontSizePx: 16,
    maxFontSizePx: 52,
    maxSpacingPx: 64,
  };
  result.nodes.node_image.instanceEditPolicy = {
    position: false,
    size: false,
    zIndex: false,
    imageFit: true,
    imageFocus: false,
    typography: false,
    spacing: false,
    minWidthPercent: 25,
    maxWidthPercent: 150,
    maxOffsetPercent: 30,
    minFontSizePx: 12,
    maxFontSizePx: 96,
    maxSpacingPx: 120,
  };
  result.nodes.node_container.childIds.push("node_locked_copy");
  result.nodes.node_locked_copy = {
    nodeId: "node_locked_copy",
    type: "TextSlot",
    name: "只读说明",
    slotId: "slot_locked_copy",
    childIds: [],
    props: {},
    instanceEditPolicy: {
      position: true,
      size: true,
      zIndex: true,
      imageFit: false,
      imageFocus: false,
      typography: true,
      spacing: true,
      minWidthPercent: 25,
      maxWidthPercent: 150,
      maxOffsetPercent: 30,
      minFontSizePx: 12,
      maxFontSizePx: 96,
      maxSpacingPx: 120,
    },
    responsive: {
      desktop: { display: "block", order: 2, width: "fill", height: { mode: "auto" } },
      mobile: { display: "block", order: 2, width: "fill", height: { mode: "auto" } },
    },
    hidden: false,
  };
  result.slots.slot_locked_copy = {
    slotId: "slot_locked_copy",
    key: "lockedCopy",
    type: "text",
    label: "只读说明",
    required: false,
    editable: false,
    hideable: false,
    validation: { maxLength: 80 },
    desktopRules: {},
    mobileRules: {},
  };
  result.defaultContent.slot_locked_copy = "由母模板锁定的说明";
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
    reviewStatus: "APPROVED",
    contentHash: "a".repeat(64),
    version: 0,
    publishedRevisionId: 91,
    publishedAt: null,
    publishedBy: null,
    updatedAt: "2026-08-28T12:00:00.000Z",
  };
}

async function prepareEditor(page: Page, options: { frameMaster?: "16:9" | "2:1"; mediaSide?: boolean | "column"; failVersionCheck?: boolean; catalogMissing?: boolean; sameVersionIdentityMismatch?: boolean; retiredNodeType?: "Carousel" | "ProductCollection"; complex?: boolean; business?: boolean; directBusiness?: boolean; image?: boolean; imageDescriptionWarnings?: boolean; swappedHero?: boolean | "single-image"; heroImage?: boolean; descriptorPolicy?: boolean; duplicate?: boolean; lockedBusiness?: boolean; legacyLayout?: boolean; restoreTemplateValue?: boolean; lockedLeftover?: boolean; lockedLayout?: boolean; primaryStage?: boolean; upgradeWouldDuplicatePrimaryStage?: boolean; noNewVersion?: boolean; invalidLatestDefinition?: boolean; invalidCurrentVersion?: boolean; incompatibleHeader?: boolean; missingCurrentVersion?: boolean; mixedUpgradeScenario?: MixedUpgradeScenario; templateConflict?: boolean; requiredUpgrade?: boolean; destructiveRemoval?: boolean; restrictLatestLayout?: boolean; personalUpgradeHint?: boolean; saveFailureStatus?: 409 | 500; adminRole?: "SUPER_ADMIN" | "ADMIN" | "EDITOR"; pageMedia?: { failFirst?: boolean; items: Array<Record<string, unknown>> }; publishIssues?: Array<{ code: string; message: string; severity: "error" | "warning" | "info"; blockId?: string; path?: string; field?: string }> } = {}, presetRole?: "creation-grid" | "editorial-split") {
  const sourceDefinition = presetRole
    ? structuredClone(LAUNCH_TEMPLATE_MASTERS.find((item) => item.metadata.sectionRole === presetRole)!)
    : options.frameMaster
    ? frameMasterDefinition(options.frameMaster)
    : options.retiredNodeType === "Carousel"
    ? carouselDefinition()
    : options.retiredNodeType === "ProductCollection"
    ? productCollectionDefinition()
    : options.descriptorPolicy
    ? descriptorPolicyDefinition(1)
    : options.image
    ? imageDefinition(1)
    : options.lockedLayout
      ? lockedLayoutDefinition()
    : options.directBusiness
      ? directBusinessDefinition()
    : options.business
    ? productCollectionDefinition()
    : options.complex
      ? carouselDefinition()
    : options.mediaSide
      ? mediaSideDefinition(1, options.mediaSide === "column" ? "column" : "row")
      : definition(1);
  if (options.primaryStage) sourceDefinition.metadata.visualRole = "primary-stage";
  if (options.swappedHero && sourceDefinition.slots?.slot_image) {
    sourceDefinition.schemaVersion = 3;
    sourceDefinition.metadata.sectionRole = "page-hero";
    sourceDefinition.metadata.mobileBreakpoint = 767;
    sourceDefinition.metadata.mobileRatio = "auto";
    sourceDefinition.previewContent = {};
    sourceDefinition.nodes.node_root.responsive.desktop.height = {
      mode: "aspect-ratio",
      ratio: { width: 16, height: 9 },
    };
    sourceDefinition.slots.slot_image.semanticRole = "heroImage";
    sourceDefinition.slots.slot_image.desktopRules = {
      ...sourceDefinition.slots.slot_image.desktopRules,
      aspectRatio: "16:9",
    };
    sourceDefinition.slots.slot_image.validation = { recommendedWidth: 1440, recommendedHeight: 810 };
    sourceDefinition.defaultContent.slot_image = { src: "", alt: "" };
  }
  if (options.restoreTemplateValue) {
    sourceDefinition.slots.slot_heading.required = false;
    sourceDefinition.slots.slot_heading.hideable = true;
  }
  const draft = pageDocument(sourceDefinition);
  if (presetRole) {
    draft.puckData.content[0].props.contentBySlotId = {};
    draft.puckData.resolvedDynamicTemplates[`${sourceDefinition.templateId}@1`].schemaVersion = sourceDefinition.schemaVersion;
  }
  if (options.swappedHero === "single-image") {
    sourceDefinition.nodes.node_container.childIds = ["node_image"];
    delete sourceDefinition.nodes.node_heading;
    delete sourceDefinition.slots.slot_heading;
    delete sourceDefinition.defaultContent.slot_heading;
    draft.puckData.content[0].props.contentBySlotId = {};
  }
  if (options.frameMaster) {
    draft.puckData.content[0].props.contentBySlotId = {};
    draft.puckData.resolvedDynamicTemplates[`${sourceDefinition.templateId}@1`].schemaVersion = sourceDefinition.schemaVersion;
  }
  if (options.swappedHero) {
    draft.puckData.resolvedDynamicTemplates[
      `${sourceDefinition.templateId}@1`
    ].schemaVersion = sourceDefinition.schemaVersion;
  }
  if (options.lockedBusiness) draft.pageKey = "contact";
  const validCurrentResolvedDefinition = structuredClone(
    draft.puckData.resolvedDynamicTemplates[
      dynamicTemplateVersionKey(sourceDefinition.templateId, 1)
    ],
  );
  if (options.upgradeWouldDuplicatePrimaryStage) {
    const existingPrimary = definition(1);
    existingPrimary.templateId = "tpl_existing_primary";
    existingPrimary.metadata.visualRole = "primary-stage";
    draft.puckData.resolvedDynamicTemplates[`${existingPrimary.templateId}@1`] = {
      templateId: existingPrimary.templateId,
      version: 1,
      schemaVersion: 1,
      definitionChecksum: "checksum-existing-primary",
      definition: existingPrimary,
    };
    draft.puckData.content.unshift({
      type: DYNAMIC_TEMPLATE_BLOCK_TYPE,
      props: {
        ...draft.puckData.content[0].props,
        id: "existing-dynamic-primary-stage",
        instanceId: "existing-primary-instance",
        templateId: existingPrimary.templateId,
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
  if (options.lockedBusiness) {
    draft.puckData.content.push({
      type: "业务功能区",
      props: {
        id: "locked-business-region",
        pageKey: "products",
        title: "商品列表与筛选",
        description: "商品、库存与分类来自商品管理。",
        items: "商品卡片|分类筛选|排序|分页",
        locked: true,
      },
    } as unknown as typeof draft.puckData.content[number]);
  }
  if (options.restoreTemplateValue) {
    draft.puckData.content[0].props.contentBySlotId = {
      slot_heading: "页面原文：戒指 & 项链｜编号 A-01（逐字保留）",
    };
    draft.puckData.content[0].props.hiddenSlotIds = ["slot_heading"];
    draft.puckData.content[0].props.isVisible = false;
  }
  if (options.lockedLeftover) {
    draft.puckData.content[0].props.contentBySlotId = {
      ...draft.puckData.content[0].props.contentBySlotId,
      slot_locked_copy: "旧页面覆盖说明",
    };
  }
  let savedPayload: Record<string, unknown> | null = null;
  if (options.heroImage) {
    draft.puckData.content = [{
      type: "首屏主视觉",
      props: {
        id: "hero-unpublished-image",
        desktopImage: "/uploads/page-assets/hero.png",
        mobileImage: "/uploads/page-assets/hero.png",
        title: "首屏",
        subtitle: "",
        actionText: "",
        targetType: "none",
        linkUrl: "",
        productId: 0,
        altText: "未公开主视觉",
        alignment: "center",
        textTone: "dark",
        desktopFocusX: 50,
        desktopFocusY: 50,
        mobileFocusX: 50,
        mobileFocusY: 50,
        isVisible: true,
      },
    }];
  }
  let currentDocument = draft;
  let catalogReadCount = 0;
  let versionReadCount = 0;
  let pageMediaReadCount = 0;
  let versionCheckFailureActive = Boolean(options.failVersionCheck);
  let validationRequestCount = 0;
  const pageWrites: Array<{ method: string; path: string }> = [];
  const templateWrites: Array<{ method: string; path: string; payload?: Record<string, unknown> }> = [];
  let templateSavedPayload: Record<string, unknown> | null = null;
  const latestVersion = options.noNewVersion ? 1 : options.mixedUpgradeScenario ? 3 : 2;
  const latestDefinition = presetRole || options.swappedHero === "single-image" || (options.directBusiness && options.noNewVersion)
    ? structuredClone(sourceDefinition)
    : options.frameMaster
    ? frameMasterDefinition(options.frameMaster)
    : options.descriptorPolicy
    ? descriptorPolicyDefinition(latestVersion)
    : options.image
    ? imageDefinition(latestVersion)
    : options.mediaSide
    ? mediaSideDefinition(latestVersion, options.mediaSide === "column" ? "column" : "row")
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
    schemaVersion: latestDefinition.schemaVersion,
    definition: latestDefinition,
    definitionChecksum: options.sameVersionIdentityMismatch
      ? "checksum-v1-drifted"
      : `checksum-v${latestVersion}`,
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
    if (path.endsWith("/upload/media/preview-by-storage-key")) return route.fallback();
    if (path.endsWith("/upload/media") && request.method() === "GET") {
      pageMediaReadCount += 1;
      if (options.pageMedia?.failFirst && pageMediaReadCount === 1) {
        return route.fulfill(json(null, 503));
      }
      const items = options.pageMedia?.items ?? [];
      return route.fulfill(json({ list: items, total: items.length, page: 1, pageSize: 100 }));
    }
    if (path.endsWith("/page-modules/dynamic-templates/catalog")) {
      catalogReadCount += 1;
      if (versionCheckFailureActive) return route.fulfill(json(null, 503));
      return route.fulfill(json({
        items: [
          ...(options.catalogMissing ? [] : [{ kind: "published", template: latestPublishedTemplate }]),
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
      versionReadCount += 1;
      if (versionCheckFailureActive) return route.fulfill(json(null, 503));
      return route.fulfill(json(options.catalogMissing ? [] : [latestPublishedTemplate]));
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
      if (options.lockedLeftover) {
        const body = request.postDataJSON() as {
          puckData?: {
            content?: Array<{ props?: { contentBySlotId?: Record<string, unknown> } }>;
          };
        };
        const leftover = body.puckData?.content?.some((block) => (
          Object.prototype.hasOwnProperty.call(block.props?.contentBySlotId ?? {}, "slot_locked_copy")
        ));
        if (leftover) {
          const issues = [{
            code: "locked-slot-page-value",
            message: "只读说明不允许在页面中修改",
            severity: "error" as const,
            blockId: "dynamic-upgrade-block",
            path: "content[0].props.contentBySlotId.slot_locked_copy",
            field: "slot_locked_copy",
          }];
          return route.fulfill(json({
            valid: false,
            errors: issues.map((issue) => issue.message),
            issues,
          }));
        }
        return route.fulfill(json({ valid: true, errors: [], issues: [] }));
      }
      const issues = [...(options.publishIssues ?? [])];
      if (options.imageDescriptionWarnings) {
        const body = request.postDataJSON() as typeof draft;
        for (const [index, block] of (body.puckData?.content ?? []).entries()) {
          for (const [slotId, value] of Object.entries(block.props.contentBySlotId ?? {})) {
            if (!value || typeof value !== "object" || !("src" in value)
              || !value.src || ("alt" in value && value.alt)) continue;
            issues.push({
              message: "图片替代文字不能为空",
              severity: "warning",
              blockId: block.props.id,
              path: `content[${index}].props.contentBySlotId.${slotId}.alt`,
              field: slotId,
            });
          }
        }
      }
      return route.fulfill(json({
        valid: !issues.some((issue) => issue.severity === "error"),
        errors: issues.filter((issue) => issue.severity === "error").map((issue) => issue.message),
        issues,
      }));
    }
    if ((options.business || options.directBusiness || presetRole === "creation-grid") && path.endsWith("/products/admin/resolve-references")) {
      const body = request.postDataJSON() as { codes?: string[] };
      return route.fulfill(json((body.codes ?? []).map((code) => ({
        code,
        id: code === "P-600" ? 600 : 500,
        name: `业务商品 ${code}`,
        thumbnail: "/images/audit/template-v1-jewelry-banner.png",
        price: 12800,
        status: "PUBLISHED",
        visibility: "PUBLIC",
        eligible: true,
        reason: "AVAILABLE",
      }))));
    }
    if ((options.business || options.directBusiness || presetRole === "creation-grid") && path.endsWith("/products") && request.method() === "GET") {
      return route.fulfill(json({
        list: ["P-500", "P-600"].map((code, index) => ({
          id: 500 + index * 100,
          code,
          name: `业务商品 ${code}`,
          price: 12800 + index * 1000,
          status: "PUBLISHED",
          visibility: "PUBLIC",
          category: { id: 1, name: "戒指" },
          images: [{ url: "/images/audit/template-v1-jewelry-banner.png", type: "FRONT", isPrimary: true }],
        })),
        total: 2,
        page: 1,
        pageSize: 12,
      }));
    }
    return route.fulfill(json({}));
  });
  const initialDocumentJson = JSON.stringify(currentDocument);
  await installAdminSession(page, {
    username: "dynamic-template-page-test",
    realName: "动态模板页面测试管理员",
    role: options.adminRole ?? "SUPER_ADMIN",
  });
  await page.goto(
    `/admin/editor/${draft.pageKey}`,
    options.lockedBusiness ? { waitUntil: "domcontentloaded" } : undefined,
  );
  const hasResolutionError = options.missingCurrentVersion
    || options.invalidCurrentVersion
    || Boolean(options.retiredNodeType)
    || options.mixedUpgradeScenario === "missing-current";
  if (hasResolutionError) {
    await expect(page.getByRole("alert")).toContainText("模板版本解析失败", { timeout: 15_000 });
    return {
      inspector: page.getByRole("region", { name: "模板实例属性" }),
      savedPayload: () => savedPayload,
      currentDocument: () => currentDocument,
      initialDocumentJson,
      restoreCurrentVersion: () => {
        currentDocument.puckData.resolvedDynamicTemplates[
          dynamicTemplateVersionKey(sourceDefinition.templateId, 1)
        ] = structuredClone(validCurrentResolvedDefinition);
      },
      templateSavedPayload: () => templateSavedPayload,
      catalogReadCount: () => catalogReadCount,
      versionReadCount: () => versionReadCount,
      pageMediaReadCount: () => pageMediaReadCount,
      recoverVersionCheck: () => {
        versionCheckFailureActive = false;
      },
      validationRequestCount: () => validationRequestCount,
      pageWrites,
      templateWrites,
    };
  }
  await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
  if (options.heroImage) {
    return {
      inspector: page.getByRole("complementary").first(),
      savedPayload: () => savedPayload,
      currentDocument: () => currentDocument,
      initialDocumentJson,
      restoreCurrentVersion: () => undefined,
      templateSavedPayload: () => templateSavedPayload,
      catalogReadCount: () => catalogReadCount,
      versionReadCount: () => versionReadCount,
      pageMediaReadCount: () => pageMediaReadCount,
      recoverVersionCheck: () => {
        versionCheckFailureActive = false;
      },
      validationRequestCount: () => validationRequestCount,
      pageWrites,
      templateWrites,
    };
  }
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
    initialDocumentJson,
    restoreCurrentVersion: () => undefined,
    templateSavedPayload: () => templateSavedPayload,
    catalogReadCount: () => catalogReadCount,
      versionReadCount: () => versionReadCount,
    pageMediaReadCount: () => pageMediaReadCount,
    recoverVersionCheck: () => {
      versionCheckFailureActive = false;
    },
    validationRequestCount: () => validationRequestCount,
    pageWrites,
    templateWrites,
  };
}

async function prepareToolbarOwnerPages(page: Page, inReview = false) {
  const fixture = await prepareEditor(page, { adminRole: inReview ? "ADMIN" : "SUPER_ADMIN" });
  const products = { ...structuredClone(fixture.currentDocument()), submittedBy: 2 };
  products.reviewStatus = inReview ? "IN_REVIEW" : "APPROVED";
  const about = structuredClone(products);
  about.pageKey = "about";
  about.puckData.content[0].props.contentBySlotId.slot_heading = "关于页的原有内容";
  const documents: Record<string, typeof products> = { products, about };
  const reviewBodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/page-modules/dynamic-templates/published/*/versions/*", (route) => {
    const parts = new URL(route.request().url()).pathname.split("/");
    const key = `${decodeURIComponent(parts[parts.length - 3])}@${parts[parts.length - 1]}`;
    const exact = products.puckData.resolvedDynamicTemplates[key as keyof typeof products.puckData.resolvedDynamicTemplates];
    return route.fulfill(exact ? json(exact) : json(null, 404));
  });
  await page.route("**/api/page-modules/document/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname.endsWith("/published/admin")) return route.fulfill(json(null));
    if (request.method() === "GET" && url.pathname.endsWith("/admin")) {
      return route.fulfill(json(documents[url.searchParams.get("pageKey") || "products"]));
    }
    if (request.method() === "PUT" && url.pathname.endsWith("/review")) {
      const body = request.postDataJSON() as Record<string, unknown>;
      reviewBodies.push(body);
      const current = documents[String(body.pageKey)];
      return route.fulfill(json({ ...current, reviewStatus: "CHANGES_REQUESTED", reviewNote: body.reviewNote }));
    }
    return route.fallback();
  });
  const validationBeforeReload = fixture.validationRequestCount();
  await page.reload();
  await expect(page.getByLabel("切换装修页面")).toHaveValue("products");
  await expect.poll(() => fixture.validationRequestCount()).toBeGreaterThan(validationBeforeReload);
  return { fixture, documents, reviewBodies };
}

async function navigateToolbarOwnerPage(page: Page, pageKey: "products" | "about") {
  await page.evaluate((key) => window.dispatchEvent(new MessageEvent("message", {
    origin: window.location.origin,
    data: { type: "homepage-editor:page-navigation", path: `/${key}` },
  })), pageKey);
  await expect(page.getByLabel("切换装修页面")).toHaveValue(pageKey);
}

function renderedPageInstance(page: Page, instanceId = "dynamic-upgrade-instance") {
  return page.frameLocator(".homepage-editor__canvas-scale iframe")
    .locator(`[data-dynamic-template-instance-id="${instanceId}"]`);
}

async function dragImageFocusToCorner(page: Page, focus: Locator, corner: "top-left" | "bottom-right") {
  await focus.scrollIntoViewIfNeeded();
  const bounds = await focus.boundingBox();
  if (!bounds) throw new Error("缺少画面焦点拖动板");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    corner === "top-left" ? bounds.x - 1 : bounds.x + bounds.width + 1,
    corner === "top-left" ? bounds.y - 1 : bounds.y + bounds.height + 1,
  );
  await page.mouse.up();
}

test.describe("动态模板页面实例（真实编辑器组件 + 自有 API 夹具）", () => {
  // 本组验证页面实例业务链路，使用当前四区停靠边界避免把功能断言耦合到覆盖层状态。
  // 需要验证紧凑工作区交接的场景会在用例内显式切到 1200px。
  test.use({ viewport: { width: 1440, height: 900 } });
  test.skip(appMode === "mock", "development 模式拦截自有 API；不作为真实 API 写入证据");

  test("工具栏导入兼容：实际导出当前动态页面后可原样导入且精确版本不变", async ({ page }, testInfo) => {
    const { fixture, documents } = await prepareToolbarOwnerPages(page);
    const downloadReady = page.waitForEvent("download");
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: /导出方案 JSON/ }).click();
    const download = await downloadReady;
    const exportPath = testInfo.outputPath("exported-current-dynamic-page.json");
    await download.saveAs(exportPath);
    const payload = JSON.parse(await readFile(exportPath, "utf8"));
    expect(payload.pageKey).toBe("products");
    expect(payload.puckData.content[0].type).toBe(DYNAMIC_TEMPLATE_BLOCK_TYPE);
    expect(payload.puckData.content[0].props.templateId).toBe(documents.products.puckData.content[0].props.templateId);
    expect(payload.puckData.content[0].props.templateVersion).toBe(1);
    expect(payload.puckData.resolvedDynamicTemplates["tpl_page_upgrade@1"].definitionChecksum).toBe("checksum-v1");
    await fixture.inspector.getByRole("textbox", { name: "标题", exact: true }).fill("导入前未保存的临时文字");
    await page.locator("#homepage-editor-import-file").setInputFiles(exportPath);
    const confirmation = page.getByRole("dialog", { name: "导入装修方案？" });
    await expect(confirmation).toContainText("当前画布内容将被导入的方案整体替换");
    expect(fixture.pageWrites).toEqual([]);
    await confirmation.getByRole("button", { name: "导入并替换画布" }).click();
    await expect(page.frameLocator(".homepage-editor__canvas-scale iframe").getByText("页面实例填写内容", { exact: true })).toBeVisible();
    await expect(page.frameLocator(".homepage-editor__canvas-scale iframe").getByText("导入前未保存的临时文字", { exact: true })).toHaveCount(0);
    expect(fixture.pageWrites).toEqual([]);
    await page.getByRole("button", { name: "保存当前装修草稿", exact: true }).click();
    await expect.poll(() => fixture.savedPayload()).not.toBeNull();
    const saved = fixture.savedPayload() as { puckData: { content: Array<{ props: { templateId: string; templateVersion: number } }> } };
    expect(saved.puckData.content[0].props.templateId).toBe(documents.products.puckData.content[0].props.templateId);
    expect(saved.puckData.content[0].props.templateVersion).toBe(1);
  });

  for (const scenario of ["unknown-type", "missing-version", "damaged-definition"] as const) {
    test(`工具栏导入兼容：${scenario}在确认前拒绝且保留当前草稿`, async ({ page }) => {
      const { fixture, documents } = await prepareToolbarOwnerPages(page);
      const imported = structuredClone(documents.products);
      if (scenario === "unknown-type") imported.puckData.content[0].type = "未登记模块类型";
      if (scenario === "missing-version") imported.puckData.content[0].props.templateVersion = 999;
      if (scenario === "damaged-definition") {
        imported.puckData.resolvedDynamicTemplates["tpl_page_upgrade@1"].definition.nodes.node_root.childIds = ["missing-node"];
      }
      await page.locator("#homepage-editor-import-file").setInputFiles({
        name: `${scenario}.json`,
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ pageKey: "products", puckData: imported.puckData })),
      });
      await expect(page.locator(".ant-message-notice-content")).toContainText(
        scenario === "unknown-type" ? "包含未知模块类型" : "精确模板版本缺失或定义无效",
      );
      await expect(page.getByRole("dialog", { name: "导入装修方案？" })).toHaveCount(0);
      await expect(page.frameLocator(".homepage-editor__canvas-scale iframe").getByText("页面实例填写内容", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
      expect(fixture.pageWrites).toEqual([]);
      expect(fixture.templateWrites).toEqual([]);
    });
  }

  test("工具栏导入权威：保留checksum的合法定义篡改不进入画布且保存重载稳定", async ({ page }) => {
    const { fixture, documents } = await prepareToolbarOwnerPages(page);
    const imported = structuredClone(documents.products);
    imported.puckData.content[0].props.contentBySlotId.slot_heading = "仅导入真实页面内容";
    imported.puckData.resolvedDynamicTemplates["tpl_page_upgrade@1"].definition.nodes.node_container.responsive.desktop.gap = { value: 19, unit: "rem" };
    const exactReads: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith("/published/tpl_page_upgrade/versions/1")) exactReads.push(request.url());
    });
    await page.locator("#homepage-editor-import-file").setInputFiles({
      name: "same-checksum-tampered-definition.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ pageKey: "products", puckData: imported.puckData })),
    });
    const confirmation = page.getByRole("dialog", { name: "导入装修方案？" });
    await expect(confirmation).toContainText("模板结构沿用原已发布版本");
    await confirmation.getByRole("button", { name: "导入并替换画布" }).click();
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    await expect(canvas.getByText("仅导入真实页面内容", { exact: true })).toBeVisible();
    await expect(canvas.locator('[data-template-node-id="node_container"]')).toHaveCSS("gap", "16px");
    expect(exactReads).toHaveLength(1);
    expect(fixture.pageWrites).toEqual([]);
    expect(fixture.templateWrites).toEqual([]);
    await page.getByRole("button", { name: "保存当前装修草稿", exact: true }).click();
    await expect.poll(() => fixture.savedPayload()).not.toBeNull();
    documents.products = { ...documents.products, ...structuredClone(fixture.currentDocument()) };
    await page.reload();
    await expect(canvas.getByText("仅导入真实页面内容", { exact: true })).toBeVisible();
    await expect(canvas.locator('[data-template-node-id="node_container"]')).toHaveCSS("gap", "16px");
    expect(fixture.currentDocument().puckData.content[0].props.templateVersion).toBe(1);
    expect(fixture.templateWrites).toEqual([]);
  });

  test("工具栏导入权威：精确版本API失败不打开确认且不改变当前草稿", async ({ page }) => {
    const { fixture, documents } = await prepareToolbarOwnerPages(page);
    await page.route("**/api/page-modules/dynamic-templates/published/*/versions/*", (route) => route.fulfill(json(null, 503)));
    await page.locator("#homepage-editor-import-file").setInputFiles({
      name: "unavailable-exact-version.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ pageKey: "products", puckData: documents.products.puckData })),
    });
    await expect(page.locator(".ant-message-notice-content")).toContainText("暂时无法读取方案引用的精确模板版本");
    await expect(page.getByRole("dialog", { name: "导入装修方案？" })).toHaveCount(0);
    await expect(page.frameLocator(".homepage-editor__canvas-scale iframe").getByText("页面实例填写内容", { exact: true })).toBeVisible();
    expect(fixture.pageWrites).toEqual([]);
    expect(fixture.templateWrites).toEqual([]);
  });

  test("工具栏导入权威：精确版本API在途A→B→A后旧结果不能打开确认", async ({ page }) => {
    const { fixture, documents } = await prepareToolbarOwnerPages(page);
    let notifyRead!: () => void;
    let releaseRead!: () => void;
    const readStarted = new Promise<void>((resolve) => { notifyRead = resolve; });
    const gate = new Promise<void>((resolve) => { releaseRead = resolve; });
    await page.route("**/api/page-modules/dynamic-templates/published/tpl_page_upgrade/versions/1", async (route) => {
      notifyRead();
      await gate;
      return route.fulfill(json(documents.products.puckData.resolvedDynamicTemplates["tpl_page_upgrade@1"]));
    });
    await page.locator("#homepage-editor-import-file").setInputFiles({
      name: "inflight-exact-version.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ pageKey: "products", puckData: documents.products.puckData })),
    });
    await readStarted;
    await navigateToolbarOwnerPage(page, "about");
    await navigateToolbarOwnerPage(page, "products");
    releaseRead();
    const staleDialogAppeared = await page.getByRole("dialog", { name: "导入装修方案？" })
      .waitFor({ state: "visible", timeout: 1000 }).then(() => true, () => false);
    expect(staleDialogAppeared).toBe(false);
    expect(fixture.pageWrites).toEqual([]);
    expect(fixture.templateWrites).toEqual([]);
  });

  test("工具栏owner回归：同页查看线上版本阻止在途和新收到的导入文件", async ({ page }) => {
    const { fixture, documents } = await prepareToolbarOwnerPages(page);
    const published = { ...structuredClone(documents.products), status: "PUBLISHED", contentHash: "b".repeat(64) };
    published.puckData.content[0].props.contentBySlotId.slot_heading = "当前线上只读内容";
    await page.route("**/api/page-modules/document/published/admin**", (route) => route.fulfill(json(published)));
    const validationBeforeReload = fixture.validationRequestCount();
    await page.reload();
    await expect(page.getByLabel("切换装修页面")).toHaveValue("products");
    await expect.poll(() => fixture.validationRequestCount()).toBeGreaterThan(validationBeforeReload);
    await page.evaluate(() => {
      const nativeText = File.prototype.text;
      const target = window as unknown as { __releaseReadonlyImport?: () => Promise<void> };
      File.prototype.text = function () {
        const text = nativeText.call(this);
        if (this.name !== "delayed-readonly-transition.json") return text;
        return new Promise<string>((resolve) => {
          target.__releaseReadonlyImport = async () => { resolve(await text); };
        });
      };
    });
    const buffer = Buffer.from(JSON.stringify({ pageKey: "products", puckData: documents.products.puckData }));
    const fileInput = page.locator("#homepage-editor-import-file");
    await fileInput.setInputFiles({ name: "delayed-readonly-transition.json", mimeType: "application/json", buffer });
    await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __releaseReadonlyImport?: unknown }).__releaseReadonlyImport))).toBe(true);
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: /查看线上版本/ }).click();
    const publishedCopy = page.frameLocator(".homepage-editor__canvas-scale iframe").getByText("当前线上只读内容", { exact: true });
    await expect(publishedCopy).toBeVisible();
    await page.evaluate(() => (window as unknown as { __releaseReadonlyImport: () => Promise<void> }).__releaseReadonlyImport());
    // 模拟系统文件选择器在工作区已改为只读时，才把选中文件交给仍存在的 input。
    await fileInput.setInputFiles({ name: "late-picker-selection.json", mimeType: "application/json", buffer });
    const staleDialogAppeared = await page.getByRole("dialog", { name: "导入装修方案？" })
      .waitFor({ state: "visible", timeout: 1000 }).then(() => true, () => false);
    expect(staleDialogAppeared).toBe(false);
    await expect(publishedCopy).toBeVisible();
    expect(fixture.pageWrites).toEqual([]);
    expect(fixture.templateWrites).toEqual([]);
  });

  for (const roundTrip of [false, true]) {
    const journey = roundTrip ? "A→B→A" : "A→B";
    test(`工具栏owner回归：file.text等待期间${journey}不弹出过期导入确认`, async ({ page }) => {
      const { fixture, documents } = await prepareToolbarOwnerPages(page);
      const imported = structuredClone(documents.products);
      imported.puckData.content[0].props.contentBySlotId.slot_heading = "过期异步导入不应出现";
      await page.evaluate(() => {
        const nativeText = File.prototype.text;
        const target = window as unknown as { __releaseToolbarImport?: () => Promise<void> };
        File.prototype.text = function () {
          const text = nativeText.call(this);
          if (this.name !== "delayed-decoration.json") return text;
          return new Promise<string>((resolve) => {
            target.__releaseToolbarImport = async () => { resolve(await text); };
          });
        };
      });
      await page.locator("#homepage-editor-import-file").setInputFiles({
        name: "delayed-decoration.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ pageKey: "products", puckData: imported.puckData })),
      });
      await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __releaseToolbarImport?: unknown }).__releaseToolbarImport))).toBe(true);
      await navigateToolbarOwnerPage(page, "about");
      if (roundTrip) await navigateToolbarOwnerPage(page, "products");
      await page.evaluate(async () => {
        await (window as unknown as { __releaseToolbarImport: () => Promise<void> }).__releaseToolbarImport();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      });
      const staleDialogAppeared = await page.getByRole("dialog", { name: "导入装修方案？" })
        .waitFor({ state: "visible", timeout: 1000 })
        .then(() => true, () => false);
      expect(staleDialogAppeared, "异步文件读取结束后的观察窗口内也不能出现旧工作区确认").toBe(false);
      await expect(page.getByRole("dialog", { name: "导入装修方案？" })).toHaveCount(0);
      await expect(page.frameLocator(".homepage-editor__canvas-scale iframe").getByText("过期异步导入不应出现", { exact: true })).toHaveCount(0);
      expect(fixture.pageWrites).toEqual([]);
      expect(fixture.templateWrites).toEqual([]);
    });

    test(`工具栏owner回归：导入确认已打开时${journey}销毁所属确认且不替换新页`, async ({ page }, testInfo) => {
      const { fixture, documents } = await prepareToolbarOwnerPages(page);
      const imported = structuredClone(documents.products);
      imported.puckData.content[0].props.contentBySlotId.slot_heading = "旧确认不能替换新页面";
      await page.locator("#homepage-editor-import-file").setInputFiles({
        name: "pending-confirmation.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ pageKey: "products", puckData: imported.puckData })),
      });
      const confirmation = page.getByRole("dialog", { name: "导入装修方案？" });
      await expect(confirmation).toBeVisible();
      await navigateToolbarOwnerPage(page, "about");
      if (roundTrip) await navigateToolbarOwnerPage(page, "products");
      await expect(confirmation).toHaveCount(0).catch(async (error) => {
        // 失败时继续取证：确认仍可操作会直接写入复用的 Puck，不能只当作残留视觉。
        await confirmation.getByRole("button", { name: "导入并替换画布" }).click();
        const polluted = page.frameLocator(".homepage-editor__canvas-scale iframe")
          .getByText("旧确认不能替换新页面", { exact: true });
        await expect(polluted).toBeVisible();
        await testInfo.attach("stale-confirm-mutated-current-canvas", {
          body: JSON.stringify({ journey, oldConfirmationApplied: true, pageWrites: fixture.pageWrites }),
          contentType: "application/json",
        });
        throw error;
      });
      await expect(page.frameLocator(".homepage-editor__canvas-scale iframe").getByText("旧确认不能替换新页面", { exact: true })).toHaveCount(0);
      expect(fixture.pageWrites).toEqual([]);
      expect(fixture.templateWrites).toEqual([]);
    });

    test(`工具栏owner回归：退回修改弹窗${journey}后清空旧备注且只向当前页提交`, async ({ page }) => {
      const { reviewBodies } = await prepareToolbarOwnerPages(page, true);
      await page.getByRole("button", { name: "退回修改", exact: true }).click();
      const confirmation = page.getByRole("dialog", { name: "退回修改？" });
      await confirmation.getByRole("textbox").fill("旧页面的退回原因");
      await navigateToolbarOwnerPage(page, "about");
      if (roundTrip) await navigateToolbarOwnerPage(page, "products");
      await expect(confirmation).toBeHidden();
      expect(reviewBodies).toEqual([]);
      await page.getByRole("button", { name: "退回修改", exact: true }).click();
      await expect(confirmation.getByRole("textbox")).toHaveValue("");
      await confirmation.getByRole("textbox").fill("当前页面的退回原因");
      await confirmation.getByRole("button", { name: "确认退回修改" }).click();
      await expect.poll(() => reviewBodies).toEqual([
        expect.objectContaining({ pageKey: roundTrip ? "products" : "about", action: "REQUEST_CHANGES", reviewNote: "当前页面的退回原因" }),
      ]);
    });
  }

  test("刷新店铺装修时加载标识与失败提示保持在视口中心", async ({ page }) => {
    const fixture = await prepareEditor(page);
    await page.goto("/admin/editor/home");
    const loadingMark = page
      .getByRole("status", { name: "正在加载店铺装修…" })
      .locator(".site-route-loading__indicator");
    const loadError = page.getByRole("alert").filter({ hasText: "无法打开店铺装修" });
    const documentRead = "**/api/page-modules/document/admin?*";

    for (const viewport of [{ width: 1920, height: 950 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      let finishRead!: () => void;
      const delayedRead = new Promise<void>((resolve) => { finishRead = resolve; });
      const handleRead = async (route: Route) => {
        await delayedRead;
        await route.fulfill(json(null, 503));
      };
      await page.route(documentRead, handleRead);
      try {
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(loadingMark).toBeVisible();
        const mark = (await loadingMark.boundingBox())!;
        expect.soft(mark.x + mark.width / 2).toBeCloseTo(viewport.width / 2, 0);
        expect.soft(mark.y + mark.height / 2).toBeCloseTo(viewport.height / 2, 0);
      } finally {
        finishRead();
      }
      await expect(loadError).toBeVisible();
      const error = (await loadError.boundingBox())!;
      expect.soft(error.x + error.width / 2).toBeCloseTo(viewport.width / 2, 0);
      expect.soft(error.y + error.height / 2).toBeCloseTo(viewport.height / 2, 0);
      await page.unroute(documentRead, handleRead);
    }
    expect(fixture.pageWrites).toEqual([]);
    expect(fixture.templateWrites).toEqual([]);
  });

  test("性能回归：切换装修页面等待接口时保留同一画布且保存不会串入上一页", async ({ page }) => {
    const fixture = await prepareEditor(page);
    const frame = page.locator(".homepage-editor__canvas-scale iframe");
    await expect(frame).toBeVisible();
    await frame.evaluate((node) => { node.setAttribute("data-session-proof", "original-frame"); });
    const aboutDocument = structuredClone(fixture.currentDocument());
    aboutDocument.pageKey = "about";
    aboutDocument.puckData.content[0].props.contentBySlotId.slot_heading = "关于页面独立内容";
    let releaseRead!: () => void;
    let notifyRead!: () => void;
    const delayedRead = new Promise<void>((resolve) => { releaseRead = resolve; });
    const readStarted = new Promise<void>((resolve) => { notifyRead = resolve; });
    await page.route("**/api/page-modules/document/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("pageKey") !== "about") return route.fallback();
      if (url.pathname.endsWith("/published/admin")) return route.fulfill(json(null));
      if (!url.pathname.endsWith("/admin")) return route.fallback();
      notifyRead();
      await delayedRead;
      return route.fulfill(json(aboutDocument));
    });
    await page.getByLabel("切换装修页面").selectOption("about");
    await readStarted;
    await expect(page.getByText("正在加载店铺装修…", { exact: true })).toBeVisible();
    await expect(page.locator('[data-session-proof="original-frame"]')).toHaveCount(1);
    await expect(frame).toBeHidden();
    expect(fixture.pageWrites).toEqual([]);
    releaseRead();
    await expect(page.getByLabel("切换装修页面")).toHaveValue("about");
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute("data-session-proof", "original-frame");
    await expect(page.frameLocator(".homepage-editor__canvas-scale iframe").getByText("关于页面独立内容", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "保存当前装修草稿", exact: true }).click();
    await expect.poll(() => fixture.savedPayload()).not.toBeNull();
    const saved = fixture.savedPayload() as { pageKey: string; puckData: { content: Array<{ props: { contentBySlotId: Record<string, string> } }> } };
    expect(saved.pageKey).toBe("about");
    expect(saved.puckData.content[0].props.contentBySlotId.slot_heading).toBe("关于页面独立内容");
  });

  test("性能回归：切页读取失败保留隔离画布，重试后恢复同一实例", async ({ page }) => {
    const fixture = await prepareEditor(page);
    const frame = page.locator(".homepage-editor__canvas-scale iframe");
    await expect(frame).toBeVisible();
    await frame.evaluate((node) => { node.setAttribute("data-session-proof", "recoverable-frame"); });
    const aboutDocument = structuredClone(fixture.currentDocument());
    aboutDocument.pageKey = "about";
    aboutDocument.puckData.content[0].props.contentBySlotId.slot_heading = "重试后的关于页面";
    let failRead = true;
    await page.route("**/api/page-modules/document/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("pageKey") !== "about") return route.fallback();
      if (url.pathname.endsWith("/published/admin")) return route.fulfill(json(null));
      if (!url.pathname.endsWith("/admin")) return route.fallback();
      return route.fulfill(failRead ? json(null, 503) : json(aboutDocument));
    });
    await page.getByLabel("切换装修页面").selectOption("about");
    await expect(page.getByRole("alert")).toContainText("无法打开店铺装修");
    await expect(page.locator('[data-session-proof="recoverable-frame"]')).toHaveCount(1);
    await expect(frame).toBeHidden();
    await expect(page.getByRole("button", { name: "保存当前装修草稿", exact: true })).toBeHidden();
    expect(fixture.pageWrites).toEqual([]);
    failRead = false;
    await page.getByRole("button", { name: "重新加载", exact: true }).click();
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute("data-session-proof", "recoverable-frame");
    await expect(page.frameLocator(".homepage-editor__canvas-scale iframe").getByText("重试后的关于页面", { exact: true })).toBeVisible();
    expect(fixture.pageWrites).toEqual([]);
  });

  test("性能回归：768画布重复测量保持稳定且恢复后没有ResizeObserver循环", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const fixture = await prepareEditor(page);
    const frame = page.locator(".homepage-editor__canvas-scale iframe");
    await frame.evaluate((node) => { node.setAttribute("data-session-proof", "tablet-frame"); });
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(frame).toBeVisible();
    const aboutDocument = structuredClone(fixture.currentDocument());
    aboutDocument.pageKey = "about";
    let releaseRead!: () => void;
    let notifyRead!: () => void;
    const gate = new Promise<void>((resolve) => { releaseRead = resolve; });
    const started = new Promise<void>((resolve) => { notifyRead = resolve; });
    await page.route("**/api/page-modules/document/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("pageKey") !== "about") return route.fallback();
      if (url.pathname.endsWith("/published/admin")) return route.fulfill(json(null));
      if (!url.pathname.endsWith("/admin")) return route.fallback();
      notifyRead();
      await gate;
      return route.fulfill(json(aboutDocument));
    });
    await page.getByLabel("切换装修页面").selectOption("about");
    await started;
    await expect(frame).toBeHidden();
    releaseRead();
    await expect(frame).toBeVisible();
    await expect(page.getByLabel("切换装修页面")).toHaveValue("about");
    // 几何稳定性采样跨多个真实渲染帧，避免仅凭单次DOM读数漏掉反馈振荡。
    await page.waitForTimeout(300);
    const samples: Array<{ stageWidth: number; frameWidth: number; stageHeight: number; documentHeight: number }> = [];
    for (let sample = 0; sample < 6; sample += 1) {
      await page.waitForTimeout(120);
      samples.push(await page.evaluate(() => {
        const stage = document.querySelector<HTMLElement>(".homepage-editor__canvas-scroll")!;
        const frame = stage.querySelector<HTMLIFrameElement>("iframe")!;
        return {
          stageWidth: stage.getBoundingClientRect().width,
          frameWidth: frame.getBoundingClientRect().width,
          stageHeight: stage.getBoundingClientRect().height,
          documentHeight: stage.querySelector<HTMLElement>(".homepage-editor__canvas-document")!.getBoundingClientRect().height,
        };
      }));
    }
    const geometryPath = testInfo.outputPath("tablet-repeated-geometry.json");
    await writeFile(geometryPath, JSON.stringify({ viewport: [768, 1024], samples, pageErrors: errors }, null, 2));
    await testInfo.attach("tablet-repeated-geometry", { path: geometryPath, contentType: "application/json" });
    for (const key of ["stageWidth", "frameWidth", "stageHeight", "documentHeight"] as const) {
      const values = samples.map((sample) => sample[key]);
      expect(Math.min(...values), `${key}必须保持非零`).toBeGreaterThan(0);
      expect(Math.max(...values) - Math.min(...values), `${key}不应在多帧间振荡`).toBeLessThan(1);
    }
    expect(errors.filter((message) => /ResizeObserver/i.test(message))).toEqual([]);
    await expect(frame).toHaveAttribute("data-session-proof", "tablet-frame");
    await page.screenshot({ path: testInfo.outputPath("tablet-stable-canvas.png") });
  });

  test("性能回归：升级审查打开时外部切页暂停旧portal并保持零写入", async ({ page }, testInfo) => {
    const catalogPageKeys: Array<string | null> = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.endsWith("/dynamic-templates/catalog")) catalogPageKeys.push(url.searchParams.get("pageKey"));
    });
    const fixture = await prepareEditor(page);
    const frame = page.locator(".homepage-editor__canvas-scale iframe");
    await frame.evaluate((node) => { node.setAttribute("data-session-proof", "portal-frame"); });
    const aboutDocument = structuredClone(fixture.currentDocument());
    aboutDocument.pageKey = "about";
    aboutDocument.puckData.content[0].props.contentBySlotId.slot_heading = "新页面没有旧升级操作";
    let releaseRead!: () => void;
    let notifyRead!: () => void;
    const gate = new Promise<void>((resolve) => { releaseRead = resolve; });
    const started = new Promise<void>((resolve) => { notifyRead = resolve; });
    await page.route("**/api/page-modules/document/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("pageKey") !== "about") return route.fallback();
      if (url.pathname.endsWith("/published/admin")) return route.fulfill(json(null));
      if (!url.pathname.endsWith("/admin")) return route.fallback();
      notifyRead();
      await gate;
      return route.fulfill(json(aboutDocument));
    });
    await openVersionDiff(page, fixture.inspector);
    const upgradeDialog = page.getByRole("dialog", { name: "模板版本升级：v1 → v2" });
    await expect(upgradeDialog).toBeVisible();
    // 复现来自同源画布导航的跨页动作：不需要先关闭已打开的只读审查。
    await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin,
      data: { type: "homepage-editor:page-navigation", path: "/about" },
    })));
    await started;
    await expect(upgradeDialog).toBeHidden();
    await expect(page.getByRole("button", { name: "保存当前装修草稿" })).toBeHidden();
    await expect(frame).toBeHidden();
    expect(fixture.pageWrites).toEqual([]);
    expect(fixture.templateWrites).toEqual([]);
    releaseRead();
    await expect(page.getByLabel("切换装修页面")).toHaveValue("about");
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute("data-session-proof", "portal-frame");
    await expect(page.frameLocator(".homepage-editor__canvas-scale iframe").getByText("新页面没有旧升级操作", { exact: true })).toBeVisible();
    await expect(upgradeDialog).toBeHidden();
    await expect.poll(() => catalogPageKeys.includes("about")).toBe(true);
    expect(catalogPageKeys).toContain("products");
    expect(fixture.pageWrites).toEqual([]);
    expect(fixture.templateWrites).toEqual([]);
    const observationsPath = testInfo.outputPath("portal-handoff-observations.json");
    await writeFile(observationsPath, JSON.stringify({ catalogPageKeys, pageWrites: fixture.pageWrites, templateWrites: fixture.templateWrites }, null, 2));
    await testInfo.attach("portal-handoff-observations", { path: observationsPath, contentType: "application/json" });
    await page.screenshot({ path: testInfo.outputPath("portal-page-handoff-restored.png") });
  });

  test("模板设计切换页面后仍不恢复首发母版入口", async ({ page }) => {
    const fixture = await prepareEditor(page);
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "选择首发母版" });
    const retiredEntry = page.getByRole("button", { name: "从首发母版开始", exact: true, includeHidden: true });
    await expect(retiredEntry).toHaveCount(0);
    await expect(picker).toHaveCount(0);
    const aboutDocument = structuredClone(fixture.currentDocument());
    aboutDocument.pageKey = "about";
    let releaseRead!: () => void;
    let notifyRead!: () => void;
    const gate = new Promise<void>((resolve) => { releaseRead = resolve; });
    const started = new Promise<void>((resolve) => { notifyRead = resolve; });
    await page.route("**/api/page-modules/document/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("pageKey") !== "about") return route.fallback();
      if (url.pathname.endsWith("/published/admin")) return route.fulfill(json(null));
      if (!url.pathname.endsWith("/admin")) return route.fallback();
      notifyRead();
      await gate;
      return route.fulfill(json(aboutDocument));
    });
    await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin,
      data: { type: "homepage-editor:page-navigation", path: "/about" },
    })));
    await started;
    await expect(picker).toBeHidden();
    const aboutRead = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith("/document/admin") && url.searchParams.get("pageKey") === "about";
    });
    releaseRead();
    await aboutRead;
    await expect(page.getByRole("region", { name: "空模板画布", exact: true })).toBeVisible();
    await expect(retiredEntry).toHaveCount(0);
    await expect(picker).toBeHidden();
    expect(fixture.pageWrites).toEqual([]);
    expect(fixture.templateWrites).toEqual([]);
  });

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

  test("兼容浅色覆盖的首个模块在画布页头使用浅色字", async ({ page }) => {
    await prepareEditor(page);
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const frame = canvas.locator(".homepage-editor__storefront-frame");
    const header = canvas.locator(".site-header");
    const template = canvas.locator('[data-dynamic-template-instance-id="dynamic-upgrade-instance"]');

    await expect(frame).toHaveAttribute("data-page-header-mode", "overlay-light");
    await expect(canvas.locator(".storefront-navigation")).toHaveAttribute("data-page-header-surface", "transparent");
    await expect(header).toHaveClass(/is-transparent/);
    await expect(header).toHaveClass(/is-overlay-light/);
    await expect(header).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const [headerBox, templateBox] = await Promise.all([
      header.boundingBox(),
      template.boundingBox(),
    ]);
    expect(headerBox).not.toBeNull();
    expect(templateBox).not.toBeNull();
    expect(templateBox!.y).toBeLessThan(headerBox!.y + headerBox!.height);
  });

  test("发布卡预览与添加分离，预览和设备切换零写，显式添加才创建精确空内容实例", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const {
      savedPayload,
      currentDocument,
      pageWrites,
      templateWrites,
    } = await prepareEditor(page);
    const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
    if (await expandLibrary.isVisible()) await expandLibrary.click();

    const preview = page.getByRole("button", {
      name: "预览内容展示｜版本升级版本2",
    });
    const selectedLayer = page.locator(".homepage-editor__layer-item.is-active");
    await expect(preview).toBeVisible();
    await expect(selectedLayer).toHaveAttribute("data-layer-id", "dynamic-upgrade-block");
    await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();

    await preview.click();
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const canvasPreview = canvas.locator("[data-canvas-template-preview]");
    await expect(page.getByRole("dialog", { name: "放大预览：内容展示｜版本升级" })).toHaveCount(0);
    await expect(canvasPreview).toContainText("版本 2 默认标题");
    const previewProperties = page.getByRole("region", { name: "模板预览属性" });
    await expect(previewProperties).toContainText("内容展示｜版本升级 · v2");
    await expect(previewProperties).toContainText("正在预览 · 尚未加入页面");
    const existingBlock = canvas.locator('[data-editor-block-id="dynamic-upgrade-block"]');
    await expect(existingBlock.locator("[data-editor-select-handle]")).toHaveAttribute("aria-pressed", "false");
    await expect(canvasPreview).not.toContainText("尚未加入页面");
    await expect(canvasPreview).not.toContainText("正在画布中预览");
    await expect(canvasPreview).not.toContainText("精确版本");
    await expect(canvasPreview.getByRole("button", { name: "关闭预览" })).toHaveCount(0);
    await expect(canvasPreview.getByRole("button", { name: "添加到页面", exact: true })).toHaveCount(0);
    await expect(canvasPreview.locator('[data-dynamic-template-id="tpl_page_upgrade"]'))
      .toHaveAttribute("data-dynamic-template-device", "desktop");
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect(canvasPreview.locator('[data-dynamic-template-id="tpl_page_upgrade"]'))
      .toHaveAttribute("data-dynamic-template-device", "mobile");
    await expect.poll(() => canvas.locator("body").evaluate(() => {
      const previewNode = document.querySelector("[data-canvas-template-preview]");
      const existingBlock = document.querySelector("[data-editor-block-id='dynamic-upgrade-block']");
      if (!previewNode || !existingBlock) return false;
      const follows = Boolean(
        existingBlock.compareDocumentPosition(previewNode) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
      const previewTop = previewNode.getBoundingClientRect().top;
      const existingTop = existingBlock.getBoundingClientRect().top;
      return follows && existingTop < previewTop;
    })).toBe(true);
    await expect(canvasPreview).toBeInViewport();
    const previewLayer = page.locator(".homepage-editor__layer-item[data-layer-preview]");
    await expect(previewLayer).toContainText("内容展示｜版本升级");
    await expect(previewLayer).toContainText("尚未加入页面");
    await expect(page.locator(".homepage-editor__layer-item").last()).toHaveAttribute("data-layer-preview", "true");
    await expect(previewLayer).toHaveClass(/is-active/);
    await expect(page.locator(".homepage-editor__layer-item.is-active")).toHaveCount(1);
    await existingBlock.click();
    await expect(previewProperties).toHaveCount(0);
    await expect(selectedLayer).toHaveAttribute("data-layer-id", "dynamic-upgrade-block");
    await previewLayer.locator(".homepage-editor__layer-select").click();
    await expect(previewProperties).toContainText("内容展示｜版本升级 · v2");
    await expect(canvasPreview).toBeInViewport();
    await expect(previewLayer.getByRole("button", { name: "隐藏内容展示｜版本升级" })).toBeVisible();
    await expect(previewLayer.getByRole("button", { name: "删除内容展示｜版本升级" })).toBeVisible();
    await previewLayer.getByRole("button", { name: "隐藏内容展示｜版本升级" }).click();
    await expect(canvasPreview).toHaveCount(0);
    await expect(previewProperties).toContainText("预览已隐藏 · 尚未加入页面");
    await expect(previewLayer).toHaveClass(/is-hidden/);
    await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
    await previewLayer.getByRole("button", { name: "显示内容展示｜版本升级" }).click();
    await expect(canvasPreview).toBeVisible();
    await expect(page.locator('.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"]')).not.toHaveClass(/is-active/);
    await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
    await expect(page.getByRole("status", { name: /草稿状态：有未保存修改/ })).toHaveCount(0);
    expect(savedPayload()).toBeNull();
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);

    await previewLayer.getByRole("button", { name: "删除内容展示｜版本升级" }).click();
    await expect(canvasPreview).toHaveCount(0);
    await expect(previewProperties).toHaveCount(0);
    await expect(existingBlock.locator("[data-editor-select-handle]")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".homepage-editor__layer-item[data-layer-preview]")).toHaveCount(0);
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);
    await expect(page.locator(".homepage-editor__layer-item.is-active")).toHaveAttribute("data-layer-id", "dynamic-upgrade-block");
    await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);

    await preview.click();
    await previewProperties.getByRole("button", { name: "添加并编辑" }).click();
    await expect(page.locator(".homepage-editor__layer-item[data-layer-preview]")).toHaveCount(0);
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(2);
    await expect(page.getByRole("region", { name: "模板实例属性" }).getByRole("textbox", { name: "标题", exact: true })).toBeVisible();
    await expect(page.getByRole("status", { name: /草稿状态：有未保存修改/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "撤销" })).toBeEnabled();
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);
    expect(currentDocument().puckData.content).toHaveLength(1);

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const payload = savedPayload() as {
      puckData: { content: Array<{ props: Record<string, unknown> }> };
    };
    const [existing, inserted] = payload.puckData.content;
    expect(inserted.props).toMatchObject({
      templateId: "tpl_page_upgrade",
      templateVersion: 2,
      contentBySlotId: {},
    });
    expect(inserted.props.instanceId).not.toBe(existing.props.instanceId);
  });

  for (const ratio of ["16:9", "2:1"] as const) {
    test(`页面模板 ${ratio}：空态保留双端画幅，手机先上传后即时显示且双端图片独立`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1600, height: 1000 });
      const { inspector, savedPayload, pageWrites, templateWrites } = await prepareEditor(page, { frameMaster: ratio });
      const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
      if (await expandLibrary.isVisible()) await expandLibrary.click();
      await page.getByRole("textbox", { name: "搜索模板" }).fill("单图海报");
      const purpose = page.getByRole("combobox", { name: "模板用途" });
      await purpose.selectOption({ label: "作品展示" });
      await expect(page.getByRole("button", { name: "添加到页面：单图海报 v2", exact: true })).toHaveCount(0);
      await purpose.selectOption({ label: "海报与图文" });
      await page.getByRole("button", { name: "添加到页面：单图海报 v2", exact: true }).click();
      const layers = page.locator(".homepage-editor__layer-item");
      await expect(layers).toHaveCount(2);
      await expect(layers.last()).toHaveClass(/is-active/);
      const id = (await layers.last().getAttribute("data-layer-id"))!;
      const titleSlot = Object.values(frameMasterDefinition(ratio).slots).find((slot) => slot.key === "title")!;
      const title = inspector.getByRole("region", { name: "标题与说明" }).getByRole("textbox", { name: titleSlot.label });
      await expect(title).toHaveValue("");
      const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
      const block = canvas.locator(`[data-editor-block-id="${id}"]`);
      const shell = block.locator("[data-template-root-node-id]");
      const rootId = await shell.getAttribute("data-template-root-node-id");
      const root = block.locator(`[data-template-node-id="${rootId}"]`);
      const [rw, rh] = ratio.split(":").map(Number);
      const checkRatio = async (mobile: boolean) => {
        for (const element of [block, shell, root]) {
          await expect.poll(() => element.evaluate((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width / rect.height;
          })).toBeCloseTo(mobile ? rh / rw : rw / rh, 2);
        }
      };
      await expect(block.locator("[data-page-instance-empty]")).toContainText("当前设备尚无页面内容");
      await expect(block.locator('[data-dynamic-template-instance-id]')).toHaveCSS("visibility", "hidden");
      await expect(block.getByRole("status")).toBeVisible();
      await checkRatio(false);
      await page.getByRole("button", { name: /移动端布局/ }).click();
      await checkRatio(true);
      await page.screenshot({ path: testInfo.outputPath("mobile-empty-frame.png") });

      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
      const uploads: string[] = [];
      await page.route("**/api/upload/image", async (route) => {
        expect(route.request().method()).toBe("POST");
        const url = `/uploads/page-assets/${uploads.length === 0 ? "mobile" : "desktop"}-frame.png`;
        uploads.push(url);
        await route.fulfill(json({ url, width: 1, height: 1, metadataStatus: "measured" }));
      });
      await page.route("**/uploads/page-assets/**", (route) => route.fulfill({ status: 404, body: "not public" }));
      await page.route("**/api/upload/media/preview-by-storage-key**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: png }));
      const imageSlot = Object.values(frameMasterDefinition(ratio).slots).find((slot) => slot.type === "image")!;
      const media = inspector.locator(`fieldset[data-slot-id="${imageSlot.slotId}"]`);
      const upload = async (name: string) => {
        await media.locator('input[type="file"]').first().setInputFiles({ name, mimeType: "image/png", buffer: png });
      };
      const image = block.locator(`[data-template-slot-id="${imageSlot.slotId}"] img`);
      const checkImage = async (source: "mobile" | "desktop") => {
        await expect(image).toHaveAttribute("data-template-managed-preview", new RegExp(`${source}-frame\\.png`));
        await expect(image).toBeVisible();
        await expect.poll(() => image.evaluate((node) => {
          const picture = node as HTMLImageElement;
          return picture.complete && picture.naturalWidth > 0 && picture.getBoundingClientRect().height > 0;
        })).toBe(true);
        await expect(block.locator("[data-page-instance-empty]")).toHaveCount(0);
      };
      await upload("mobile.png");
      await checkImage("mobile");
      await expect.poll(() => image.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width / rect.height;
      })).toBeCloseTo(rh / rw, 2);
      await checkRatio(true);
      await page.getByRole("button", { name: /桌面端布局/ }).click();
      await expect(block.locator("[data-page-instance-empty]")).toBeVisible();
      await checkRatio(false);
      await upload("desktop.png");
      await checkImage("desktop");
      await checkRatio(false);
      await page.getByRole("button", { name: /移动端布局/ }).click();
      await checkImage("mobile");
      await checkRatio(true);
      await title.fill("当期珠宝作品");
      await expect(block.locator(`[data-template-slot-id="${titleSlot.slotId}"]`)).toHaveText("当期珠宝作品");
      await page.getByRole("button", { name: "预览当前画布", exact: true }).click();
      await checkImage("mobile");
      await checkRatio(true);
      await page.getByRole("button", { name: "退出当前画布预览", exact: true }).click();
      await checkImage("mobile");
      await expect(page.locator(".ant-message-notice")).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath("mobile-uploaded-frame.png") });
      expect(uploads).toHaveLength(2);
      expect(pageWrites).toEqual([]);
      expect(templateWrites).toEqual([]);
      await page.getByRole("button", { name: "保存当前装修草稿" }).click();
      await expect.poll(() => savedPayload()).not.toBeNull();
      const payload = savedPayload() as { puckData: { content: Array<{ props: { contentBySlotId: Record<string, unknown> } }> } };
      expect(payload.puckData.content[1].props.contentBySlotId[imageSlot.slotId]).toMatchObject({
        src: "/uploads/page-assets/desktop-frame.png", mobileSrc: "/uploads/page-assets/mobile-frame.png",
      });
      expect(payload.puckData.content[1].props.contentBySlotId[titleSlot.slotId]).toBe("当期珠宝作品");
      await page.reload();
      await page.locator(`.homepage-editor__layer-item[data-layer-id="${id}"] .homepage-editor__layer-select`).click({ position: { x: 12, y: 18 } });
      await page.getByRole("button", { name: /移动端布局/ }).click();
      await checkImage("mobile");
      await checkRatio(true);
      await expect(title).toHaveValue("当期珠宝作品");
    });
  }

  test("点击添加追加末尾并定位新模板，空内容可见且填写后恢复构图", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 800 });
    const { inspector, pageWrites, templateWrites } = await prepareEditor(page);
    const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
    if (await expandLibrary.isVisible()) await expandLibrary.click();
    const add = page.getByRole("button", { name: "添加到页面：内容展示｜版本升级 v2" });
    const layers = page.locator(".homepage-editor__layer-item");
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const initialId = await layers.first().getAttribute("data-layer-id");
    const insertedIds: string[] = [];
    for (let count = 2; count <= 11; count += 1) {
      // 即使反复选回第一块，普通添加也必须追加，不受选中位置影响。
      await layers.first().locator(".homepage-editor__layer-select").click({ position: { x: 12, y: 18 } });
      await add.click();
      await expect(layers).toHaveCount(count);
      await expect(layers.last()).toHaveClass(/is-active/);
      const id = (await layers.last().getAttribute("data-layer-id"))!;
      insertedIds.push(id);
      await expect(canvas.locator(`[data-editor-block-id="${id}"] [data-page-instance-empty]`))
        .toContainText("当前设备尚无页面内容");
      // Puck 0.22.4 的 history.record 有 250ms 合并窗口；这里模拟独立点击，供单步撤销验收。
      await page.waitForTimeout(300);
    }
    expect(new Set(insertedIds).size).toBe(10);
    expect(await layers.first().getAttribute("data-layer-id")).toBe(initialId);
    expect(await layers.evaluateAll((elements) => elements.slice(1).map((element) => element.getAttribute("data-layer-id"))))
      .toEqual(insertedIds);
    const lastId = insertedIds.at(-1)!;
    // 断言真实滚动容器里的几何；仅选中或 DOM 存在不能证明画布已定位。
    await expect.poll(() => page.evaluate((id) => {
      const frame = document.querySelector<HTMLIFrameElement>(".homepage-editor__preview-frame iframe")!;
      const scroller = frame.closest<HTMLElement>(".homepage-editor__canvas-scroll")!;
      const target = Array.from(frame.contentDocument!.querySelectorAll<HTMLElement>("[data-editor-block-id]"))
        .find((element) => element.dataset.editorBlockId === id)!;
      const frameBox = frame.getBoundingClientRect();
      const scale = frameBox.width / frame.contentDocument!.documentElement.clientWidth;
      const top = frameBox.top + target.getBoundingClientRect().top * scale;
      const box = scroller.getBoundingClientRect();
      return scroller.scrollTop > 100 && top >= box.top - 2 && top < box.bottom - 30;
    }, lastId)).toBe(true);
    await expect(page.locator(".ant-message-notice")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("appended-template-visible.png") });
    await page.getByRole("button", { name: "放大预览：内容展示｜版本升级" }).click();
    await expect(canvas.locator("[data-canvas-template-preview]")).toBeInViewport();
    await expect(page.getByRole("region", { name: "模板预览属性" })).toContainText("内容展示｜版本升级 · v2");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "模板预览属性" })).toHaveCount(0);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(layers).toHaveCount(10);
    await page.getByRole("button", { name: "重做", exact: true }).click();
    await expect(layers).toHaveCount(11);
    await layers.last().locator(".homepage-editor__layer-select").click({ position: { x: 12, y: 18 } });
    const lastBlock = canvas.locator(`[data-editor-block-id="${lastId}"]`);
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect(lastBlock.locator("[data-page-instance-empty]")).toBeVisible();
    await page.getByRole("button", { name: /桌面端布局/ }).click();
    await page.getByRole("button", { name: "收起属性面板" }).click();
    await expect(inspector).toBeHidden();
    await lastBlock.locator("[data-page-instance-empty]").click();
    await expect(inspector).toBeVisible();
    await inspector.getByRole("textbox", { name: "标题", exact: true }).fill("新模板的页面标题");
    await expect(lastBlock.locator("[data-page-instance-empty]")).toHaveCount(0);
    await expect(lastBlock).toContainText("新模板的页面标题");
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect(lastBlock).toContainText("新模板的页面标题");
    await add.click();
    await expect(layers).toHaveCount(12);
    await expect(layers.last()).toHaveClass(/is-active/);
    const mobileId = await layers.last().getAttribute("data-layer-id");
    const mobileBlock = canvas.locator(`[data-editor-block-id="${mobileId}"]`);
    await expect(mobileBlock.locator("[data-page-instance-empty]")).toBeVisible();
    await expect.poll(async () => {
      const [target, scroller] = await Promise.all([
        mobileBlock.boundingBox(), page.locator(".homepage-editor__canvas-scroll").boundingBox(),
      ]);
      return Boolean(target && scroller && target.y >= scroller.y - 2 && target.y < scroller.y + scroller.height - 30);
    }).toBe(true);
    await expect(page.locator(".ant-message-notice")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("appended-template-mobile-visible.png") });
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);
  });

  test("已有动态主舞台时仍可继续插入，独立升级只修改当前页面草稿", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const { inspector, savedPayload, currentDocument, templateWrites } = await prepareEditor(page, {
      primaryStage: true,
    });
    const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
    if (await expandLibrary.isVisible()) await expandLibrary.click();

    const cardControl = page.getByRole("button", {
      name: "预览内容展示｜版本升级版本2",
    });
    await expect(cardControl).toBeVisible();
    await expect(cardControl).not.toHaveAttribute("aria-disabled", "true");
    await expect(cardControl).toHaveAttribute("draggable", "true");
    await expect(cardControl.locator("..")).not.toContainText("预览模板");
    await expect(page.getByRole("button", { name: "放大预览：内容展示｜版本升级" })).toBeVisible();
    await expect(page.getByRole("button", {
      name: "添加到页面：内容展示｜版本升级 v2",
    })).toBeEnabled();
    const dragTypes = await cardControl.evaluate((element) => {
      const dataTransfer = new DataTransfer();
      element.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
      const types = [...dataTransfer.types];
      element.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
      return types;
    });
    expect(dragTypes).toContain("application/x-haichuan-published-template");
    await cardControl.click();
    const canvasPreview = page.frameLocator(".homepage-editor__canvas-scale iframe")
      .locator("[data-canvas-template-preview]");
    await expect(canvasPreview).toBeVisible();
    await expect(canvasPreview).not.toContainText("当前页面已有主舞台");
    await expect(page.locator(".homepage-editor__layer-item[data-layer-preview]"))
      .toContainText("内容展示｜版本升级");
    await expect(canvasPreview.getByRole("button", { name: "添加到页面", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "添加到页面：内容展示｜版本升级 v2" }).click();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "复制当前模块" })).toBeEnabled();

    await expect(page.getByRole("button", { name: /升级页面中的/ })).toHaveCount(0);
    await page.locator(
      '.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"] .homepage-editor__layer-select',
    ).click({ position: { x: 12, y: 18 } });
    await openVersionDiff(page, inspector);
    const dialog = page.getByRole("dialog", { name: "模板版本升级：v1 → v2" });
    await expect(dialog).toContainText("只修改当前内存草稿并增加一条页面历史");
    await expect(dialog).toContainText("不会自动保存、发布或回写母模板");
    await dialog.getByRole("button", { name: "保留当前版本" }).click();
    await openVersionDiff(page, inspector);
    await page.getByRole("dialog", { name: "模板版本升级：v1 → v2" })
      .getByRole("button", { name: "确认升级页面草稿" })
      .click();

    await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "2");
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(2);
    await expect(page.getByRole("status", { name: /草稿状态：有未保存修改/ })).toBeVisible();
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
      await page.setViewportSize({ width: 1200, height: 900 });
      const { savedPayload, templateWrites } = await prepareEditor(page, {
        primaryStage: true,
        ...scenario.options,
      });
      const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
      if (await expandLibrary.isVisible()) await expandLibrary.click();
      const cardControl = page.getByRole("button", {
        name: new RegExp("预览内容展示｜版本升级版本[12]"),
      });
      await expect(cardControl).toBeVisible();
      await expect(page.getByRole("button", { name: /升级页面中的内容展示｜版本升级模板实例/ }))
        .toHaveCount(0);
      await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);
      expect(savedPayload()).toBeNull();
      expect(templateWrites).toEqual([]);
    });
  }

  test("升级产生第二个主舞台时仍允许确认升级", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    const { inspector, savedPayload, templateWrites } = await prepareEditor(page, {
      upgradeWouldDuplicatePrimaryStage: true,
    });
    const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
    if (await expandLibrary.isVisible()) await expandLibrary.click();
    await expect(page.getByRole("button", {
      name: "预览内容展示｜版本升级版本2",
    })).toBeVisible();
    await expect(page.getByRole("button", { name: /升级页面中的/ })).toHaveCount(0);
    // 此宽度的目录是覆盖面板，先按真实操作收起，再选择其下方图层。
    await page.getByRole("button", { name: "收起模板组件库", exact: true }).click();
    await page.locator(
      '.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"] .homepage-editor__layer-select',
    ).click({ position: { x: 12, y: 18 } });
    await openVersionDiff(page, inspector);
    const dialog = page.getByRole("dialog", { name: "模板版本升级：v1 → v2" });
    await expect(dialog).not.toContainText("升级后会产生多个主舞台实例");
    await dialog.getByRole("button", { name: "确认升级页面草稿" }).click();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(2);
    await expect(page.getByRole("status", { name: /草稿状态：有未保存修改/ })).toBeVisible();
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
    await page.setViewportSize({ width: 1200, height: 900 });
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
      name: "预览内容展示｜版本升级版本2",
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
      page.getByRole("button", { name: "预览内容展示｜版本升级版本2" }),
    ).toBeVisible();
    await expect(page.getByRole("button", {
      name: "添加到页面：内容展示｜版本升级 v2",
    })).toBeVisible();
    await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "1");
    await expect(await openBlockActions(page, inspector)).toContainText("此区块有可用更新");

    await openVersionDiff(page, inspector);
    const dialog = page.getByRole("dialog", { name: "模板版本升级：v1 → v2" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("桌面端当前 v1")).toContainText("页面实例填写内容");
    await expect(dialog.getByLabel("桌面端目标 v2")).toContainText("页面实例填写内容");
    await expect(dialog.getByLabel("移动端当前 v1")).toContainText("页面实例填写内容");
    await expect(dialog.getByLabel("移动端目标 v2")).toContainText("页面实例填写内容");
    await dialog.getByRole("button", { name: "保留当前版本" }).click();
    await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "1");

    await openVersionDiff(page, inspector);
    await page.getByRole("dialog", { name: "模板版本升级：v1 → v2" })
      .getByRole("button", { name: "确认升级页面草稿" })
      .click();
    await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "2");
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
    await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "2");
  });

  test("新增必填槽位允许显式升级，取消零副作用且确认只增加一条历史并定位待填字段", async ({ page }) => {
    const { inspector, pageWrites, templateWrites } = await prepareEditor(page, {
      requiredUpgrade: true,
    });
    await openVersionDiff(page, inspector);
    const review = page.getByRole("dialog", { name: "模板版本升级：v1 → v2" });
    await expect(review).toContainText("升级后待填写：新增必填正文");
    await expect(review.getByRole("button", { name: "确认升级页面草稿" })).toBeEnabled();
    await review.getByRole("button", { name: "保留当前版本" }).click();
    await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "1");
    await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);

    await openVersionDiff(page, inspector);
    await review.getByRole("button", { name: "确认升级页面草稿" }).click();
    await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "2");
    const pendingField = inspector.getByRole("textbox", { name: "新增必填正文" });
    await expect(pendingField).toBeFocused();
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);

    await page.getByRole("button", { name: "撤销" }).click();
    await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "1");
    await page.getByRole("button", { name: "重做" }).click();
    await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "2");
  });

  test("图片位置可在页面属性栏切换，画布桌面镜像、可撤销且保存前零写", async ({ page }) => {
    const { inspector, pageWrites, templateWrites } = await prepareEditor(page, {
      mediaSide: true,
      noNewVersion: true,
    });
    const control = inspector.getByRole("group", { name: "布局排列" });
    await expect(control).toBeVisible();
    await expect(control.getByRole("button", { name: "图片在左" })).toHaveAttribute("aria-pressed", "true");
    const row = page.frameLocator(".homepage-editor__canvas-scale iframe")
      .locator('[data-dynamic-template-instance-id="dynamic-upgrade-instance"] [data-template-node-id="node_container"]');
    await expect(row).not.toHaveAttribute("data-template-mirrored", "true");

    await control.getByRole("button", { name: "图片在右" }).click();
    await expect(control.getByRole("button", { name: "图片在右" })).toHaveAttribute("aria-pressed", "true");
    await expect(row).toHaveAttribute("data-template-mirrored", "true");
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);

    await page.getByRole("button", { name: "撤销" }).click();
    await expect(control.getByRole("button", { name: "图片在左" })).toHaveAttribute("aria-pressed", "true");
    await expect(row).not.toHaveAttribute("data-template-mirrored", "true");
    await page.getByRole("button", { name: "重做" }).click();
    await expect(row).toHaveAttribute("data-template-mirrored", "true");
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);
  });

  test("目标容器在桌面不是横排时隐藏图片位置且保持零写", async ({ page }) => {
    const { inspector, pageWrites, templateWrites } = await prepareEditor(page, {
      mediaSide: "column",
      noNewVersion: true,
    });
    const control = inspector.getByRole("group", { name: "布局排列" });
    await expect(control).toHaveCount(0);
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);
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
    await openVersionDiff(page, inspector);
    await page.getByRole("dialog", { name: "模板版本升级：v1 → v2" })
      .getByRole("button", { name: "确认升级页面草稿" }).click();
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const validationsBeforePublish = validationRequestCount();
    const publish = page.getByRole("button", { name: "发布到前台网站" });
    await expect(publish).toBeEnabled();
    await publish.click();
    const review = page.getByRole("region", { name: "本次发布检查" });
    const issue = review.locator('[data-page-publish-field="slot_required"]');
    await expect(issue).toContainText("页面内容 / 新增必填正文");
    await issue.getByRole("button", { name: "定位" }).click();
    await expect(inspector.getByRole("textbox", { name: "新增必填正文" })).toBeFocused();
    // 输入会更新父级页面状态；检查面板不得因回调身份变化再次抢走字段焦点。
    await inspector.getByRole("textbox", { name: "新增必填正文" }).fill("运营填写的必填正文");
    await expect(inspector.getByRole("textbox", { name: "新增必填正文" })).toBeFocused();
    expect(pageWrites.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "PUT /api/page-modules/document",
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
    await expect(page.getByRole("button", { name: /升级页面中的/ })).toHaveCount(0);
    await page.locator(
      '.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"] .homepage-editor__layer-select',
    ).click({ position: { x: 12, y: 18 } });
    await openVersionDiff(page, inspector);
    await page.getByRole("dialog", { name: "模板版本升级：v1 → v2" })
      .getByRole("button", { name: "确认升级页面草稿" })
      .click();
    await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "2");
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);
    await page.getByRole("button", { name: "撤销" }).click();
    await page.locator(
      '.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"] .homepage-editor__layer-select',
    ).click({ position: { x: 12, y: 18 } });
    await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "1");
    await page.getByRole("button", { name: "重做" }).click();
    await page.locator(
      '.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"] .homepage-editor__layer-select',
    ).click({ position: { x: 12, y: 18 } });
    await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "2");
  });

  for (const scenario of mixedUpgradeScenarios) {
    const testName = scenario.key === "missing-current"
      ? "当前精确版本缺失时阻止页面编辑且不会产生页面或模板写入"
      : `${scenario.label}进入混合目录审查时逐实例显示原因并禁用整批确认`;
    test(testName, async ({ page }) => {
      const { currentDocument, pageWrites, templateWrites } = await prepareEditor(page, {
        mixedUpgradeScenario: scenario.key,
      });
      if (scenario.key === "missing-current") {
        const resolutionError = page.getByRole("alert");
        await expect(resolutionError).toContainText("模板版本解析失败");
        await expect(resolutionError).toContainText("页面锁定的模板版本缺失：tpl_page_upgrade@1");
        await expect(resolutionError).toContainText("页面草稿未修改");
        await expect(resolutionError.getByRole("button", { name: "重新加载模板版本" })).toBeVisible();
        await expect(page.locator(".homepage-editor__toolbar")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "保存当前装修草稿" })).toHaveCount(0);
        expect(currentDocument().puckData.content.map((block) => block.props.templateVersion))
          .toEqual([2, 1]);
        expect(pageWrites).toEqual([]);
        expect(templateWrites).toEqual([]);
        return;
      }
      const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
      if (await expandLibrary.isVisible()) await expandLibrary.click();
      await expect(page.getByRole("button", { name: /升级页面中的/ })).toHaveCount(0);
      expect(currentDocument().puckData.content.map((block) => block.props.templateVersion))
        .toEqual([1, 2]);
      await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
      await expect(page.getByRole("status", { name: /草稿状态：有未保存修改/ })).toHaveCount(0);
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
    await openVersionDiff(page, inspector);
    const single = page.getByRole("dialog", { name: "模板版本升级：v1 → v2" });
    await expect(single).toContainText("原页面内容无法无损保留");
    await expect(single.getByRole("button", { name: "确认升级页面草稿" })).toBeDisabled();
    await single.getByRole("button", { name: "保留当前版本" }).click();
    const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
    if (await expandLibrary.isVisible()) await expandLibrary.click();
    await expect(page.getByRole("button", { name: /升级页面中的/ })).toHaveCount(0);
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);
  });

  test("目标版本收紧构图策略时同时阻断桌面与移动覆盖", async ({ page }) => {
    const { inspector, pageWrites } = await prepareEditor(page, {
      legacyLayout: true,
      restrictLatestLayout: true,
    });
    await openVersionDiff(page, inspector);
    const review = page.getByRole("dialog", { name: "模板版本升级：v1 → v2" });
    await expect(review).toContainText("桌面端节点“标题”");
    await expect(review).toContainText("移动端节点“标题”");
    await expect(review.getByRole("button", { name: "确认升级页面草稿" })).toBeDisabled();
    expect(pageWrites).toEqual([]);
  });

  test("读取历史来源实例不自动迁移；原 revision、草稿和 dirty 状态保持不变", async ({ page }) => {
    const { currentDocument, pageWrites } = await prepareEditor(page, {
      personalUpgradeHint: true,
    });
    const hint = page.getByRole("status").filter({ hasText: /历史(?:个人)?模板实例可升级/ });
    // 首期不恢复退役的个人模板升级入口；兼容读取仍须保持原 JSON 与零写入。
    await expect(hint).toHaveCount(0);
    await expect(page.getByRole("status", { name: /草稿状态：有未保存修改/ })).toHaveCount(0);
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
    const trigger = inspector.getByRole("button", { name: "区块操作", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog", { name: "区块操作", exact: true }).getByRole("button", { name: "查看差异" }).press("Enter");
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
    await openVersionDiff(page, inspector);
    await page.getByRole("dialog", { name: "模板版本升级：v1 → v2" })
      .getByRole("button", { name: "确认升级页面草稿" }).click();
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const publish = page.getByRole("button", { name: /当前账号可提交审核，发布需由管理员完成/ });
    await expect(publish).toBeDisabled();
    await expect(publish).toHaveAttribute("aria-label", /当前账号可提交审核，发布需由管理员完成/);
    expect(pageWrites.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "PUT /api/page-modules/document",
    ]);
  });

  test("ADMIN 显式发布升级草稿严格执行保存、校验、PUT 发布且不写母模板", async ({ page }) => {
    const { inspector, pageWrites, templateWrites, validationRequestCount } = await prepareEditor(page, {
      adminRole: "ADMIN",
    });
    await openVersionDiff(page, inspector);
    await page.getByRole("dialog", { name: "模板版本升级：v1 → v2" })
      .getByRole("button", { name: "确认升级页面草稿" }).click();
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => pageWrites.length).toBe(1);
    const validationsBeforePublish = validationRequestCount();
    const publish = page.getByRole("button", { name: "发布到前台网站" });
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect.poll(() => pageWrites.some(({ path }) => path.endsWith("/publish"))).toBe(true);
    expect(pageWrites.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "PUT /api/page-modules/document",
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
      await openVersionDiff(page, inspector);
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
      await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "2");
      await expect(inspector.getByRole("textbox", { name: "新增必填正文" })).toHaveValue("");
      await expect(page.getByRole("status", { name: /草稿状态：保存失败/ })).toBeVisible();
      expect(currentDocument().puckData.content[0].props.templateVersion).toBe(1);
      expect(pageWrites.map(({ method }) => method)).toEqual(["PUT"]);
      expect(templateWrites).toEqual([]);
    });
  }

  test("目录未找到当前模板时明确为不可判断且重试不写页面", async ({ page }) => {
    const {
      inspector,
      versionReadCount,
      pageWrites,
      templateWrites,
    } = await prepareEditor(page, { catalogMissing: true });
    const missing = (await openBlockActions(page, inspector)).getByRole("alert").filter({
      hasText: "目录未找到当前模板，无法判断是否最新",
    });
    await expect(missing).toContainText("当前页面继续锁定 tpl_page_upgrade v1，页面草稿未修改");
    await expect(inspector.getByRole("button", { name: "查看差异" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
    const readsBeforeRetry = versionReadCount();
    await missing.getByRole("button", { name: "重新检查" }).click();
    await expect.poll(() => versionReadCount()).toBeGreaterThan(readsBeforeRetry);
    await expect(missing).toContainText("目录未找到当前模板，无法判断是否最新");
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);
  });

  test("目录精确版本与当前锁定一致时收起无操作的版本提示", async ({ page }) => {
    const { inspector, pageWrites, templateWrites } = await prepareEditor(page, {
      noNewVersion: true,
    });
    await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "1");
    await expect(inspector.getByText("当前已锁定最新可用版本 v1")).toHaveCount(0);
    await expect(inspector.getByRole("button", { name: "查看差异" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);
  });

  test("目录同版本身份漂移时不能伪报最新且保持页面零写入", async ({ page }) => {
    const { inspector, pageWrites, templateWrites } = await prepareEditor(page, {
      noNewVersion: true,
      sameVersionIdentityMismatch: true,
    });
    const conflict = (await openBlockActions(page, inspector)).getByRole("alert").filter({
      hasText: "目录中的 v1 身份与页面锁定版本不一致，无法确认是否最新",
    });
    await expect(conflict).toBeVisible();
    await expect(conflict).toContainText("当前页面继续锁定 tpl_page_upgrade v1，页面草稿未修改");
    await expect(inspector.getByRole("status").filter({
      hasText: "当前已锁定最新可用版本 v1",
    })).toHaveCount(0);
    await expect(inspector.getByRole("button", { name: "查看差异" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);
  });

  test("版本检查失败只显示可恢复提示，不改变当前页面实例", async ({ page }) => {
    const {
      inspector,
      versionReadCount,
      pageWrites,
      templateWrites,
    } = await prepareEditor(page, { failVersionCheck: true });
    await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "1");
    await expect(await openBlockActions(page, inspector)).toContainText("暂时无法检查模板新版本，当前页面版本未改变");
    const readsBeforeRetry = versionReadCount();
    await (await openBlockActions(page, inspector)).getByRole("button", { name: "重新检查" }).click();
    await expect.poll(() => versionReadCount()).toBeGreaterThan(readsBeforeRetry);
    await expect(await openBlockActions(page, inspector)).toContainText("暂时无法检查模板新版本，当前页面版本未改变");
    await expect(inspector.getByRole("button", { name: "保存页面草稿" })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "草稿与线上一致" })).toBeVisible();
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);
  });

  test("版本检查失败后重新检查可恢复升级，并在保存重载后回读目标版本", async ({ page }) => {
    const {
      inspector,
      versionReadCount,
      recoverVersionCheck,
      currentDocument,
      pageWrites,
      templateWrites,
    } = await prepareEditor(page, {
      failVersionCheck: true,
    });
    await expect(await openBlockActions(page, inspector)).toContainText("暂时无法检查模板新版本，当前页面版本未改变");
    recoverVersionCheck();
    await (await openBlockActions(page, inspector)).getByRole("button", { name: "重新检查" }).click();
    await expect.poll(() => versionReadCount()).toBeGreaterThan(1);
    await expect(await openBlockActions(page, inspector)).toContainText("此区块有可用更新");
    expect(pageWrites).toEqual([]);

    await openVersionDiff(page, inspector);
    await page.getByRole("dialog", { name: "模板版本升级：v1 → v2" })
      .getByRole("button", { name: "确认升级页面草稿" })
      .click();
    await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "2");
    expect(pageWrites).toEqual([]);

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => currentDocument().puckData.content[0].props.templateVersion).toBe(2);
    expect(pageWrites.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "PUT /api/page-modules/document",
    ]);
    expect(templateWrites).toEqual([]);

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await page.locator(
      '.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"] .homepage-editor__layer-select',
    ).click({ position: { x: 12, y: 18 } });
    await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "2");
  });

  test("已配置区块可跨页复制，保留目标内容、锁定版本和两页独立草稿", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const fixture = await prepareEditor(page, { legacyLayout: true });
    const targetDefinition = { ...definition(1), templateId: "tpl_page_copy_target" };
    const aboutDocument = pageDocument(targetDefinition);
    aboutDocument.pageKey = "about";
    aboutDocument.puckData.content[0].props.id = "original-about-block";
    aboutDocument.puckData.content[0].props.instanceId = "original-about-instance";
    aboutDocument.puckData.content[0].props.contentBySlotId.slot_heading = "目标页原有内容";
    const existingId = aboutDocument.puckData.content[0].props.id;
    let allowCopy = false;
    const targetWrites: Array<typeof aboutDocument> = [];
    await page.route("**/api/page-modules/dynamic-templates/catalog?*", (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("pageKey") === "about" && !allowCopy) {
        return route.fulfill(json({ items: [] }));
      }
      return route.fallback();
    });
    await page.route("**/api/page-modules/document/admin?*", (route) => (
      new URL(route.request().url()).searchParams.get("pageKey") === "about"
        ? route.fulfill(json(targetWrites.at(-1) ?? aboutDocument))
        : route.fallback()
    ));
    await page.route("**/api/page-modules/document", (route) => {
      const payload = route.request().postDataJSON() as typeof aboutDocument;
      if (payload.pageKey !== "about") return route.fallback();
      const saved = {
        ...aboutDocument,
        ...payload,
        // 真实接口会按保存的区块引用补回各精确版本。
        puckData: {
          ...payload.puckData,
          resolvedDynamicTemplates: {
            ...aboutDocument.puckData.resolvedDynamicTemplates,
            ...fixture.currentDocument().puckData.resolvedDynamicTemplates,
          },
        },
        updatedAt: "2026-08-28T12:03:00.000Z",
      };
      targetWrites.push(saved);
      return route.fulfill(json(saved));
    });

    const heading = fixture.inspector.getByRole("textbox", { name: "标题", exact: true });
    const sourceTitle = "源页已配置的珠宝标题";
    await heading.fill(sourceTitle);
    const chooseAbout = async () => {
      await page.getByRole("button", { name: "复制到其他页面", exact: true }).click();
      const chooser = page.getByRole("dialog", { name: "复制到其他页面" });
      await chooser.getByRole("combobox", { name: "目标页面" }).click();
      await page.getByRole("listbox").getByRole("option", { name: "关于海川", exact: true }).click();
      await chooser.getByRole("button", { name: "前往目标页" }).click();
      return chooser;
    };
    const destination = page.getByRole("dialog", { name: "添加复制的区块" });
    const layers = page.locator(".homepage-editor__layer-item");
    const chooser = await chooseAbout();
    await expect(chooser.getByRole("alert")).toContainText("「关于海川」的模板组件库不提供此模板");
    await expect(page.getByRole("dialog", { name: "离开当前编辑？" })).toBeHidden();
    await expect(page.getByLabel("切换装修页面")).toHaveValue("products");
    expect(fixture.pageWrites).toHaveLength(0);

    allowCopy = true;
    await chooser.getByRole("button", { name: "前往目标页" }).click();
    await page.getByRole("button", { name: "继续编辑", exact: true }).click();
    await expect(page.getByLabel("切换装修页面")).toHaveValue("products");
    await expect(heading).toHaveValue(sourceTitle);
    expect(fixture.pageWrites).toHaveLength(0);
    expect(targetWrites).toHaveLength(0);

    await page.getByLabel("切换装修页面").selectOption("about");
    await page.getByRole("button", { name: "放弃修改", exact: true }).click();
    await expect(layers.first()).toHaveAttribute("data-layer-id", existingId);
    await expect(destination).toBeHidden();
    await page.getByLabel("切换装修页面").selectOption("products");
    await layers.first().locator(".homepage-editor__layer-select").click();
    await heading.fill(sourceTitle);

    await chooseAbout();
    await page.getByRole("button", { name: "保存并离开", exact: true }).click();
    await expect(destination).toBeVisible();
    const add = destination.getByRole("button", { name: "添加到页面", exact: true });
    allowCopy = false;
    await add.click();
    await expect(destination.getByRole("alert")).toContainText("目标页面的模板组件库不再提供此模板");
    expect(targetWrites).toHaveLength(0);
    allowCopy = true;
    await add.click();
    await expect(destination).toBeHidden();
    await expect(heading).toHaveValue(sourceTitle);
    await expect(layers).toHaveCount(2);
    const copyId = await layers.last().getAttribute("data-layer-id");
    expect(copyId).not.toBe(existingId);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(layers).toHaveCount(1);
    await page.getByRole("button", { name: "重做", exact: true }).click();
    await expect(layers.last()).toHaveAttribute("data-layer-id", copyId!);
    await layers.last().locator(".homepage-editor__layer-select").click();
    await heading.fill("目标页独立修改");
    await page.getByRole("button", { name: "保存当前装修草稿", exact: true }).click();
    await expect.poll(() => targetWrites.length).toBe(1);
    const [original, copied] = targetWrites[0].puckData.content;
    const sourceProps = fixture.currentDocument().puckData.content[0].props;
    expect(original.props.contentBySlotId.slot_heading).toBe("目标页原有内容");
    expect(copied.props.templateVersion).toBe(sourceProps.templateVersion);
    expect(copied.props.instanceId).not.toBe(sourceProps.instanceId);
    expect(copied.props.layoutOverridesByNodeId).toEqual(sourceProps.layoutOverridesByNodeId);
    expect(copied.props.contentBySlotId.slot_heading).toBe("目标页独立修改");
    expect(sourceProps.contentBySlotId.slot_heading).toBe(sourceTitle);
    expect(fixture.templateWrites).toHaveLength(0);

    await page.reload();
    await expect(page.getByLabel("切换装修页面")).toHaveValue("about");
    await layers.last().locator(".homepage-editor__layer-select").click();
    await expect(heading).toHaveValue("目标页独立修改");
    await page.getByLabel("切换装修页面").selectOption("products");
    await expect(layers).toHaveCount(1);
    await layers.first().locator(".homepage-editor__layer-select").click();
    await expect(heading).toHaveValue(sourceTitle);
  });

  test("页面运营通过真实 UI 原子复制、排序、显隐和删除实例，并在保存重载后保持稳定身份", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const {
      inspector,
      savedPayload,
      currentDocument,
      pageWrites,
      templateWrites,
    } = await prepareEditor(page, { legacyLayout: true });
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const layers = page.locator(".homepage-editor__layer-item");
    const renderedInstances = canvas.locator("[data-dynamic-template-instance-id]");
    const undo = page.getByRole("button", { name: "撤销" });
    const redo = page.getByRole("button", { name: "重做" });
    const dock = page.getByRole("toolbar", {
      name: "调整“内容展示｜版本升级”模块",
    });
    const renderedInstanceIds = () => renderedInstances.evaluateAll((items) => (
      items.map((item) => item.getAttribute("data-dynamic-template-instance-id"))
    ));
    const layerBlockIds = () => layers.evaluateAll((items) => (
      items.map((item) => item.getAttribute("data-layer-id"))
    ));

    await expect(dock).toBeVisible();
    await expect(dock.getByRole("button", { name: "上移当前模块" })).toBeDisabled();
    await expect(dock.getByRole("button", { name: "下移当前模块" })).toBeDisabled();
    await expect(undo).toBeDisabled();
    await dock.getByRole("button", { name: "复制当前模块" }).click();

    await expect(layers).toHaveCount(2);
    await expect(renderedInstances).toHaveCount(2);
    const duplicatedBlockIds = await layerBlockIds();
    const duplicatedInstanceIds = await renderedInstanceIds();
    const copiedBlockId = duplicatedBlockIds[1];
    const copiedInstanceId = duplicatedInstanceIds[1];
    if (!copiedBlockId || !copiedInstanceId) {
      throw new Error("复制后的页面区块或实例缺少稳定身份");
    }
    expect(duplicatedBlockIds[0]).toBe("dynamic-upgrade-block");
    expect(copiedBlockId).not.toBe("dynamic-upgrade-block");
    expect(duplicatedInstanceIds[0]).toBe("dynamic-upgrade-instance");
    expect(copiedInstanceId).not.toBe("dynamic-upgrade-instance");
    await expect(layers.nth(1)).toHaveClass(/is-active/);
    await expect(renderedInstances.nth(1)).toHaveAttribute("data-dynamic-template-version", "1");
    await expect(renderedInstances.nth(1).locator(".hc-dynamic-template"))
      .toHaveAttribute("data-dynamic-template-id", "tpl_page_upgrade");
    await expect(renderedInstances.nth(0).locator('[data-template-node-id="node_heading"]'))
      .toContainText("页面实例填写内容");
    await expect(renderedInstances.nth(1).locator('[data-template-node-id="node_heading"]'))
      .toContainText("页面实例填写内容");
    await expect(renderedInstances.nth(0).locator('[data-template-node-id="node_heading"]'))
      .toHaveAttribute("style", /translate\(8%, -4%\)/);
    await expect(renderedInstances.nth(1).locator('[data-template-node-id="node_heading"]'))
      .toHaveAttribute("style", /translate\(8%, -4%\)/);
    await expect(undo).toBeEnabled();
    expect(currentDocument().puckData.content).toHaveLength(1);
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);

    await undo.click();
    await expect(layers).toHaveCount(1);
    await expect(renderedInstances).toHaveCount(1);
    await expect(undo).toBeDisabled();
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect(layers).toHaveCount(2);
    await expect.poll(renderedInstanceIds).toEqual([
      "dynamic-upgrade-instance",
      copiedInstanceId,
    ]);
    await expect.poll(layerBlockIds).toEqual([
      "dynamic-upgrade-block",
      copiedBlockId,
    ]);

    await page.locator(
      `.homepage-editor__layer-item[data-layer-id="${copiedBlockId}"] .homepage-editor__layer-select`,
    ).click({ position: { x: 12, y: 18 } });
    await expect(dock.getByRole("button", { name: "上移当前模块" })).toBeEnabled();
    await expect(dock.getByRole("button", { name: "下移当前模块" })).toBeDisabled();
    await dock.getByRole("button", { name: "上移当前模块" }).click();
    await expect.poll(renderedInstanceIds).toEqual([
      copiedInstanceId,
      "dynamic-upgrade-instance",
    ]);
    await undo.click();
    await expect.poll(renderedInstanceIds).toEqual([
      "dynamic-upgrade-instance",
      copiedInstanceId,
    ]);
    await redo.click();
    await expect.poll(renderedInstanceIds).toEqual([
      copiedInstanceId,
      "dynamic-upgrade-instance",
    ]);
    await expect(dock.getByRole("button", { name: "上移当前模块" })).toBeDisabled();
    await expect(dock.getByRole("button", { name: "下移当前模块" })).toBeEnabled();
    await dock.getByRole("button", { name: "下移当前模块" }).click();
    await expect.poll(renderedInstanceIds).toEqual([
      "dynamic-upgrade-instance",
      copiedInstanceId,
    ]);
    await undo.click();
    await expect.poll(renderedInstanceIds).toEqual([
      copiedInstanceId,
      "dynamic-upgrade-instance",
    ]);

    await page.locator(
      `.homepage-editor__layer-item[data-layer-id="${copiedBlockId}"] .homepage-editor__layer-select`,
    ).click({ position: { x: 12, y: 18 } });
    const copiedLayer = page.locator(`.homepage-editor__layer-item[data-layer-id="${copiedBlockId}"]`);
    await expect(inspector.getByRole("switch", { name: "在页面显示" })).toHaveCount(0);
    await copiedLayer.getByTitle("隐藏模块").click();
    await expect(canvas.locator(`[data-dynamic-template-instance-id="${copiedInstanceId}"]`))
      .toContainText(/已隐藏/);
    await page.getByRole("button", { name: "预览当前画布" }).click();
    await expect(canvas.locator(`[data-dynamic-template-instance-id="${copiedInstanceId}"]`))
      .toHaveCount(0);
    await expect(canvas.locator('[data-dynamic-template-instance-id="dynamic-upgrade-instance"]'))
      .toHaveCount(1);
    await page.getByRole("button", { name: "退出当前画布预览" }).click();
    await copiedLayer.getByTitle("显示模块").click();
    await expect.poll(renderedInstanceIds).toEqual([
      copiedInstanceId,
      "dynamic-upgrade-instance",
    ]);

    await dock.getByRole("button", { name: "删除当前模块" }).click();
    const cancelledDelete = page.getByRole("dialog", {
      name: "删除“内容展示｜版本升级”？",
    });
    await expect(cancelledDelete).toContainText(/删除后/);
    await cancelledDelete.getByRole("button", { name: /取\s*消/ }).click();
    await expect(layers).toHaveCount(2);
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);

    await undo.click();
    await expect(copiedLayer.getByTitle("显示模块")).toBeAttached();
    await expect(layers).toHaveCount(2);
    await redo.click();
    await expect(copiedLayer.getByTitle("隐藏模块")).toBeAttached();
    await dock.getByRole("button", { name: "删除当前模块" }).click();
    await page.getByRole("dialog", { name: "删除“内容展示｜版本升级”？" })
      .getByRole("button", { name: "删除模块" })
      .click();
    await expect(layers).toHaveCount(1);
    await expect.poll(renderedInstanceIds).toEqual(["dynamic-upgrade-instance"]);
    await undo.click();
    await expect(layers).toHaveCount(2);
    await expect.poll(renderedInstanceIds).toEqual([
      copiedInstanceId,
      "dynamic-upgrade-instance",
    ]);
    await redo.click();
    await expect(layers).toHaveCount(1);
    await expect.poll(renderedInstanceIds).toEqual(["dynamic-upgrade-instance"]);
    await undo.click();
    await expect(layers).toHaveCount(2);
    await expect.poll(renderedInstanceIds).toEqual([
      copiedInstanceId,
      "dynamic-upgrade-instance",
    ]);

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const payload = savedPayload() as {
      puckData: { content: Array<{ type: string; props: Record<string, any> }> };
    };
    const [copied, original] = payload.puckData.content;
    expect(payload.puckData.content.map((item) => item.props.id)).toEqual([
      copiedBlockId,
      "dynamic-upgrade-block",
    ]);
    expect(payload.puckData.content.map((item) => item.props.instanceId)).toEqual([
      copiedInstanceId,
      "dynamic-upgrade-instance",
    ]);
    expect(copied.type).toBe("动态模板实例");
    expect(copied.props).toMatchObject({
      templateId: "tpl_page_upgrade",
      templateVersion: 1,
      contentBySlotId: { slot_heading: "页面实例填写内容" },
      layoutOverridesByNodeId: original.props.layoutOverridesByNodeId,
      hiddenSlotIds: [],
      isVisible: true,
    });
    expect(original.props).toMatchObject({
      templateId: "tpl_page_upgrade",
      templateVersion: 1,
      contentBySlotId: { slot_heading: "页面实例填写内容" },
      isVisible: true,
    });
    expect(copied.props.id).not.toBe(original.props.id);
    expect(copied.props.instanceId).not.toBe(original.props.instanceId);
    expect(pageWrites.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "PUT /api/page-modules/document",
    ]);
    expect(templateWrites).toEqual([]);

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(2);
    const refreshedCanvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const refreshedInstances = refreshedCanvas.locator("[data-dynamic-template-instance-id]");
    await expect(refreshedInstances).toHaveCount(2);
    expect(await refreshedInstances.evaluateAll((items) => items.map((item) => (
      item.getAttribute("data-dynamic-template-instance-id")
    )))).toEqual([copiedInstanceId, "dynamic-upgrade-instance"]);
    await expect(refreshedInstances.nth(0)).toHaveAttribute("data-dynamic-template-version", "1");
    await expect(refreshedInstances.nth(0).locator('[data-template-node-id="node_heading"]'))
      .toContainText("页面实例填写内容");
    await expect(refreshedInstances.nth(0).locator('[data-template-node-id="node_heading"]'))
      .toHaveAttribute("style", /translate\(8%, -4%\)/);
    expect(templateWrites).toEqual([]);
  });

  test("已有装修实例跨过固定业务区后保留身份、内容和版式", async ({ page }) => {
    const fixture = await prepareEditor(page, {
      duplicate: true,
      lockedBusiness: true,
      legacyLayout: true,
    });
    const original = structuredClone(fixture.currentDocument().puckData.content.slice(0, 2));
    const [first, second] = original.map(({ props }) => props.id);
    const region = "contact-business-region";
    const layers = page.locator(".homepage-editor__layer-item[data-layer-id]");
    const layer = (id: string) => page.locator(`[data-layer-id="${id}"]`);
    const layerOrder = () => layers.evaluateAll((items) => items.map((item) => item.getAttribute("data-layer-id")));
    await expect.poll(layerOrder).toEqual([first, second, region]);
    await expect(layer(region)).toHaveAttribute("draggable", "false");
    await expect(layer(region).locator(".homepage-editor__layer-actions")).toHaveCount(0);

    await layer(second).getByRole("button").first().click();
    const dock = page.getByRole("toolbar", { name: "调整“内容展示｜版本升级”模块" });
    await dock.getByRole("button", { name: "下移当前模块" }).click();
    await expect.poll(layerOrder).toEqual([first, region, second]);

    await layer(second).dragTo(layer(region));
    await expect.poll(layerOrder).toEqual([first, second, region]);

    await layer(first).getByRole("button").first().click();
    await layer(second).getByRole("button").first().click({ modifiers: ["Shift"] });
    await page.locator(".homepage-editor__layer-batch").getByRole("button", { name: "下移" }).click();
    await expect.poll(layerOrder).toEqual([region, first, second]);
    expect(fixture.pageWrites).toEqual([]);
    expect(fixture.templateWrites).toEqual([]);

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(fixture.savedPayload).not.toBeNull();
    const saved = fixture.savedPayload() as { puckData: { content: typeof original } };
    expect(saved.puckData.content.map(({ props }) => props.id)).toEqual([region, first, second]);
    expect(saved.puckData.content.slice(1)).toMatchObject(original);

    await page.reload();
    await expect.poll(layerOrder).toEqual([region, first, second]);
  });

  test("390px 下实例操作可由键盘非拖拽完成，锁定与边界状态可见且页面无横向溢出", async ({ page }) => {
    const { pageWrites, templateWrites } = await prepareEditor(page, {
      duplicate: true,
      lockedBusiness: true,
    });
    await page.locator(
      '.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block-2"] .homepage-editor__layer-select',
    ).click({ position: { x: 12, y: 18 } });
    await page.setViewportSize({ width: 390, height: 844 });
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const renderedInstances = canvas.locator("[data-dynamic-template-instance-id]");
    const renderedInstanceIds = () => renderedInstances.evaluateAll((items) => (
      items.map((item) => item.getAttribute("data-dynamic-template-instance-id"))
    ));
    const dock = page.getByRole("toolbar", {
      name: "调整“内容展示｜版本升级”模块",
    });
    const copy = dock.getByRole("button", { name: "复制当前模块" });

    await expect(copy).toBeVisible();
    await copy.focus();
    await expect(copy).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(renderedInstances).toHaveCount(3);
    const copiedInstanceId = (await renderedInstanceIds())[2];
    if (!copiedInstanceId) throw new Error("移动端键盘复制没有生成独立实例身份");

    const moveUp = dock.getByRole("button", { name: "上移当前模块" });
    await moveUp.focus();
    await expect(moveUp).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(renderedInstanceIds).toEqual([
      "dynamic-upgrade-instance",
      copiedInstanceId,
      "dynamic-upgrade-instance-2",
    ]);
    const moveDown = dock.getByRole("button", { name: "下移当前模块" });
    await moveDown.focus();
    await expect(moveDown).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(renderedInstanceIds).toEqual([
      "dynamic-upgrade-instance",
      "dynamic-upgrade-instance-2",
      copiedInstanceId,
    ]);
    await expect(moveDown).toBeEnabled();
    await moveDown.focus();
    await page.keyboard.press("Enter");
    await expect(moveDown).toBeDisabled();

    const deleteTrigger = dock.getByRole("button", { name: "删除当前模块" });
    await deleteTrigger.focus();
    await expect(deleteTrigger).toBeFocused();
    await page.keyboard.press("Enter");
    const deleteDialog = page.getByRole("dialog", { name: "删除“内容展示｜版本升级”？" });
    await expect(deleteDialog).toBeVisible();
    const cancelDelete = deleteDialog.getByRole("button", { name: /取\s*消/ });
    await cancelDelete.focus();
    await expect(cancelDelete).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(deleteDialog).toHaveCount(0);
    await expect(deleteTrigger).toBeFocused();

    const expandLayers = page.getByRole("button", { name: "展开图层面板" });
    if (await expandLayers.isVisible()) {
      await expandLayers.focus();
      await expect(expandLayers).toBeFocused();
      await page.keyboard.press("Enter");
    }
    const lockedLayer = page.locator(
      '.homepage-editor__layer-item[data-layer-id="contact-business-region"]',
    );
    await expect(lockedLayer).toBeVisible();
    await expect(lockedLayer.locator(".homepage-editor__layer-actions")).toHaveCount(0);
    const lockedLayerSelect = lockedLayer.locator(".homepage-editor__layer-select");
    await lockedLayerSelect.focus();
    await expect(lockedLayerSelect).toBeFocused();
    await page.keyboard.press("Enter");
    const lockedDock = page.getByRole("toolbar", { name: "调整“业务功能区”模块" });
    await expect(lockedDock.getByRole("button", { name: "上移当前模块" })).toBeDisabled();
    await expect(lockedDock.getByRole("button", { name: "下移当前模块" })).toBeDisabled();
    await expect(lockedDock.getByRole("button", { name: "固定模块不能复制" })).toBeDisabled();
    await expect(lockedDock.getByRole("button", { name: "固定模块不能删除" })).toBeDisabled();
    await expect.poll(() => page.evaluate(() => (
      document.documentElement.scrollWidth <= window.innerWidth + 1
    ))).toBe(true);
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);
  });

  test("整个页面实例显隐在编辑、预览、保存与刷新之间保持一致", async ({ page }) => {
    const { inspector, savedPayload } = await prepareEditor(page);
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const layer = page.locator('.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"]');
    const publicStatus = inspector.getByRole("status", { name: "前台展示状态" });
    await expect(inspector.getByRole("switch", { name: "在页面显示" })).toHaveCount(0);
    await expect(publicStatus).toHaveCount(0);
    await expect(canvas.locator('[data-dynamic-template-instance-id="dynamic-upgrade-instance"]'))
      .toHaveAttribute("data-dynamic-template-render-mode", "editor");

    await layer.getByTitle("隐藏模块").click();
    await expect(publicStatus).toHaveAttribute("data-state", "hidden");
    await expect(publicStatus).toContainText("可在图层面板恢复");
    await expect(canvas.getByText("当前页面中已隐藏", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "预览当前画布" }).click();
    await expect(canvas.getByText("当前页面中已隐藏", { exact: true })).toHaveCount(0);
    await expect(canvas.getByText("页面实例填写内容", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "退出当前画布预览" }).click();
    await expect(canvas.getByText("当前页面中已隐藏", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const payload = savedPayload() as { puckData: { content: Array<{ props: Record<string, unknown> }> } };
    expect(payload.puckData.content[0].props.isVisible).toBe(false);

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const refreshedCanvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    await expect(refreshedCanvas.getByText("当前页面中已隐藏", { exact: true })).toBeVisible();
    await page.locator(".homepage-editor__layer-item .homepage-editor__layer-select")
      .first()
      .click({ position: { x: 12, y: 18 } });
    const refreshedInspector = page.getByRole("region", { name: "模板实例属性" });
    const refreshedPublicStatus = refreshedInspector.getByRole("status", { name: "前台展示状态" });
    await expect(refreshedPublicStatus).toHaveAttribute("data-state", "hidden");
    await layer.getByTitle("显示模块").click();
    await expect(refreshedPublicStatus).toHaveCount(0);
    await expect(refreshedCanvas.getByText("页面实例填写内容", { exact: true })).toBeVisible();
  });

  test("动态模板画布点选字段后定位属性栏，切换设备保留选中项", async ({ page }) => {
    const { inspector, templateWrites } = await prepareEditor(page, { legacyLayout: true });
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const renderer = canvas.locator('[data-dynamic-template-instance-id="dynamic-upgrade-instance"] .hc-dynamic-template');
    const heading = canvas.locator('[data-template-node-id="node_heading"]');

    await expect(renderer).toHaveAttribute("data-dynamic-template-editor-surface", "page-instance");
    await expect(inspector.getByRole("group", { name: "页面实例属性范围" })).toHaveCount(0);
    await expect(inspector.getByText("定位字段", { exact: true })).toHaveCount(0);
    await expect(heading).not.toHaveAttribute("role", "group");
    await expect(heading).not.toHaveAttribute("tabindex", "0");

    await page.getByRole("button", { name: "收起属性面板" }).click();
    await expect(inspector).toBeHidden();
    await canvas.locator('[data-editor-block-id="dynamic-upgrade-block"] [data-editor-select-handle]').click();
    await expect(inspector.getByRole("textbox", { name: "标题", exact: true })).toBeVisible();
    await heading.click();
    const titleField = inspector.locator('[data-slot-id="slot_heading"]');
    await expect(titleField).toHaveAttribute("data-page-field-selected", "true");
    await expect(titleField).toBeFocused();
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect(titleField).toHaveAttribute("data-page-field-selected", "true");
    await expect(canvas.locator('[data-template-selected="true"]')).toHaveCount(0);
    await expect(inspector.getByRole("textbox", { name: "标题" })).toBeVisible();
    await expect(inspector.getByRole("button", { name: "调整区域" })).toHaveCount(0);
    expect(templateWrites).toEqual([]);
  });

  test("页面字段任务分组与可编辑性只消费共享 descriptor", async ({ page }) => {
    const contentField: DynamicTemplatePageFieldDescriptor = {
      nodeId: "node_content",
      slotId: "slot_content",
      stableKey: "content",
      label: "文字",
      slotType: "text",
      slotTypeLabel: "正文",
      controlKind: "text",
      task: "content",
      required: false,
      editable: true,
      hideable: true,
      validation: {},
      effectiveDesignOverrideCapabilities: null,
    };
    const fields: DynamicTemplatePageFieldDescriptor[] = [
      contentField,
      {
        ...contentField,
        nodeId: "node_media",
        slotId: "slot_media",
        stableKey: "media",
        label: "画面",
        slotType: "image",
        slotTypeLabel: "图片",
        controlKind: "image",
        task: "media",
      },
      {
        ...contentField,
        nodeId: "node_commerce",
        slotId: "slot_commerce",
        stableKey: "commerce",
        label: "商品",
        slotType: "product",
        slotTypeLabel: "商品",
        controlKind: "product",
        task: "commerce",
      },
    ];
    const grouped = groupDynamicTemplatePageFields(fields);
    expect(grouped.sections.map((section) => section.label)).toEqual(["文字", "图片", "商品"]);
    expect(grouped.sections.flatMap((section) => section.fields.map((field) => field.slotId)))
      .toEqual(["slot_content", "slot_media", "slot_commerce"]);
    const selectedContent = groupDynamicTemplatePageFields(fields, "slot_content");
    expect(selectedContent.selectedSlotId).toBe("slot_content");
    expect(selectedContent.sections).toHaveLength(3);
    expect(groupDynamicTemplatePageFields([contentField]).sections[0]?.group).toBe("text");
    expect(groupDynamicTemplatePageFields([]).sections).toEqual([]);

    const { inspector, currentDocument, pageWrites, templateWrites } = await prepareEditor(page, {
      descriptorPolicy: true,
      noNewVersion: true,
    });
    const initialInstanceProps = structuredClone(currentDocument().puckData.content[0].props);
    const resolved = currentDocument().puckData.resolvedDynamicTemplates["tpl_page_upgrade@1"];
    await expect(page.locator('.homepage-editor__layer-item .homepage-editor__layer-select').first())
      .toContainText("内容展示｜版本升级");
    await expect(inspector.getByRole("button", { name: /^补充内容 ·/ })).toHaveCount(0);
    await expect(inspector.getByRole("region", { name: "文字", exact: true }).first()).toBeVisible();
    await expect(inspector.getByRole("textbox", { name: "标题", exact: true })).toBeVisible();
    expect(resolved).toBeDefined();
    const descriptors = getDynamicTemplatePageFieldDescriptors(resolved.definition);
    const descriptorBySlotId = Object.fromEntries(descriptors.map((field) => [field.slotId, field]));
    expect(descriptorBySlotId.slot_heading.effectiveDesignOverrideCapabilities).toMatchObject({
      position: false,
      size: false,
      typography: true,
      spacing: false,
    });
    expect(descriptorBySlotId.slot_image.effectiveDesignOverrideCapabilities).toMatchObject({
      position: false,
      size: false,
      imageFit: true,
      imageFocus: false,
    });
    expect(descriptorBySlotId.slot_locked_copy.effectiveDesignOverrideCapabilities).toBeNull();
    for (const field of descriptors) {
      const slot = inspector.locator(`[data-slot-id="${field.slotId}"]`);
      if (field.editable) {
        await expect(slot).toHaveAttribute("data-page-field-policy", JSON.stringify(field.effectiveDesignOverrideCapabilities));
      } else {
        await expect(slot).toHaveCount(0);
      }
    }
    await expect(inspector.getByRole("textbox", { name: "只读说明" })).toHaveCount(0);
    await expect(inspector.getByRole("group", { name: "页面实例属性范围" })).toHaveCount(0);
    await expect(inspector.getByRole("textbox", { name: "标题", exact: true })).toBeVisible();
    await expect(inspector.locator('[data-media-field="slot_image"]')).toBeVisible();
    expect(currentDocument().puckData.content[0].props).toEqual(initialInstanceProps);
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);
  });

  test("锁定槽位残留页面覆盖可恢复为模板内容，且不静默丢弃", async ({ page }) => {
    const { inspector, currentDocument, pageWrites, templateWrites } = await prepareEditor(page, {
      descriptorPolicy: true,
      noNewVersion: true,
      lockedLeftover: true,
    });
    await expect(inspector.locator('[data-slot-id="slot_locked_copy"]')).toHaveCount(0);
    const cleanup = inspector.getByRole("status").filter({ hasText: "1 个锁定字段仍保留页面覆盖" });
    const removeOverrides = cleanup.getByRole("button", { name: "移除锁定字段的页面覆盖" });
    await expect(removeOverrides).toBeVisible();
    expect(currentDocument().puckData.content[0].props.contentBySlotId.slot_locked_copy).toBe("旧页面覆盖说明");

    await removeOverrides.click();
    await expect(cleanup).toHaveCount(0);
    await expect(inspector.getByRole("button", { name: "移除锁定字段的页面覆盖" })).toHaveCount(0);
    expect(currentDocument().puckData.content[0].props.contentBySlotId.slot_locked_copy).toBe("旧页面覆盖说明");
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);
  });

  test("发布前锁定槽位残留会打开检查面板，一键移除后继续保存并发布", async ({ page }) => {
    const { savedPayload, pageWrites, templateWrites } = await prepareEditor(page, {
      descriptorPolicy: true,
      noNewVersion: true,
      lockedLeftover: true,
    });
    const publish = page.getByRole("button", { name: "发布到前台网站" });
    await expect(publish).toBeEnabled();
    await publish.click();
    const review = page.getByRole("region", { name: "本次发布检查" });
    await expect(review).toContainText("只读说明不允许在页面中修改");
    await review.locator('button[aria-label="移除锁定字段的页面覆盖"]').click();
    await expect.poll(() => pageWrites.some(({ path }) => path.endsWith("/publish"))).toBe(true);
    const payload = savedPayload() as {
      puckData?: { content?: Array<{ props?: { contentBySlotId?: Record<string, unknown> } }> };
    } | null;
    expect(payload?.puckData?.content?.[0]?.props?.contentBySlotId).not.toHaveProperty("slot_locked_copy");
    expect(pageWrites.some(({ method, path }) => method === "PUT" && path.endsWith("/page-modules/document"))).toBe(true);
    expect(pageWrites.at(-1)).toEqual({ method: "PUT", path: "/api/page-modules/document/publish" });
    expect(templateWrites).toEqual([]);
  });

  test("页面直接清空和修改文字，保存回读保留旧实例的精确构图", async ({ page }) => {
    const { inspector, savedPayload, currentDocument, templateWrites } = await prepareEditor(page, {
      legacyLayout: true,
    });
    const originalProps = structuredClone(currentDocument().puckData.content[0].props);
    const heading = renderedPageInstance(page).locator('[data-template-node-id="node_heading"]');
    await expect(heading).toHaveAttribute("style", /translate\(8%, -4%\)/);
    await expect(heading.getByRole("heading")).toHaveCSS("font-size", "40px");
    await expect(inspector.getByRole("spinbutton", { name: /水平偏移|垂直偏移|区域宽度|层级|字号|间距/ })).toHaveCount(0);
    await expect(inspector.getByRole("combobox", { name: "标题文字对齐" })).toHaveCount(0);
    await expect(inspector.getByText("清除本页内容", { exact: true })).toHaveCount(0);
    const title = inspector.getByRole("textbox", { name: "标题", exact: true });
    await expect(inspector.getByRole("switch", { name: "在桌面端收起这段文字" })).toHaveCount(0);
    await title.fill("");
    await expect(title).toHaveValue("");
    await expect(inspector.getByRole("switch", { name: "在桌面端收起这段文字" })).toHaveCount(0);
    await title.fill("页面直接修改标题");
    await expect(heading).toContainText("页面直接修改标题");
    await expect(heading).toHaveAttribute("style", /translate\(8%, -4%\)/);
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(savedPayload).not.toBeNull();
    const payload = savedPayload() as { puckData: { content: Array<{ props: Record<string, unknown> }> } };
    expect(payload.puckData.content[0].props.layoutOverridesByNodeId).toEqual(originalProps.layoutOverridesByNodeId);
    expect(payload.puckData.content[0].props.contentBySlotId).toEqual({ slot_heading: "页面直接修改标题" });
    expect(templateWrites).toEqual([]);
    await page.reload();
    await expect(heading).toContainText("页面直接修改标题");
    await expect(heading.getByRole("heading")).toHaveCSS("font-size", "40px");
  });

  for (const role of ["ADMIN", "SUPER_ADMIN"] as const) {
    test(`${role} 装修只编辑页面实例，不显示恢复样式或回填母版入口`, async ({ page }) => {
      const { inspector, currentDocument, pageWrites, templateWrites } = await prepareEditor(page, {
        legacyLayout: true,
        adminRole: role,
        noNewVersion: true,
      });
      const originalProps = structuredClone(currentDocument().puckData.content[0].props);
      await expect(inspector.getByRole("textbox", { name: "标题", exact: true })).toHaveValue("页面实例填写内容");
      await expect(inspector.getByText(/本节样式与来源|页面内容覆盖|页面设计覆盖|模板版本与样式/)).toHaveCount(0);
      await expect(inspector.getByLabel("当前字段来源")).toHaveCount(0);
      await expect(inspector.getByRole("button", { name: "应用设计覆盖到母模板草稿" })).toHaveCount(0);
      await expect(inspector.getByRole("button", { name: "恢复模板样式" })).toHaveCount(0);
      await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "1");
      expect(currentDocument().puckData.content[0].props).toEqual(originalProps);
      expect(pageWrites).toEqual([]);
      expect(templateWrites).toEqual([]);
    });
  }

  test("模板升级保留单端文字收起，并阻断无法保留的作品跳转", () => {
    const currentDefinition = LAUNCH_TEMPLATE_MASTERS.find((item) => item.metadata.sectionRole === "creation-grid")!;
    const targetDefinition = structuredClone(currentDefinition);
    const workSlotId = Object.values(currentDefinition.slots).find((slot) => slot.key === "workA")!.slotId;
    const heading = Object.values(currentDefinition.nodes).find((node) => node.slotId && currentDefinition.slots[node.slotId]?.key === "title")!;
    const input = {
      currentDefinition,
      targetDefinition,
      targetVersion: 2,
      instance: {
        id: "grid-upgrade-test",
        instanceId: "grid-upgrade-instance",
        instanceSchemaVersion: 1 as const,
        templateId: currentDefinition.templateId,
        templateVersion: 1,
        moduleName: "作品网格",
        contentBySlotId: { [workSlotId]: { src: "/images/example.jpg", alt: "作品", workProductCode: "P-500" } },
        hiddenSlotIds: [],
        layoutOverridesByNodeId: { [heading.nodeId]: { mobile: { visuallyCollapsed: true } } },
      },
    };
    const compatible = analyzeDynamicTemplateUpgrade(input);
    expect(compatible.blockers).toEqual([]);
    expect(compatible.nextProps.layoutOverridesByNodeId).toEqual(input.instance.layoutOverridesByNodeId);
    targetDefinition.metadata.sectionRole = "editorial-split";
    expect(analyzeDynamicTemplateUpgrade(input).destructiveBlockers).toContainEqual(expect.objectContaining({
      slotId: workSlotId,
      reason: expect.stringContaining("原作品跳转无法无损保留"),
    }));
  });

  test("恢复本节样式仅修改构图，并可撤销", async ({ page }) => {
    const { inspector, pageWrites } = await prepareEditor(page, { legacyLayout: true, noNewVersion: true });
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const heading = canvas.locator('[data-template-node-id="node_heading"]');
    const title = inspector.getByRole("textbox", { name: "标题", exact: true });
    const management = await openBlockActions(page, inspector);
    await expect(heading).toHaveAttribute("style", /translate\(8%, -4%\)/);
    await management.getByRole("button", { name: "恢复本节样式" }).click();
    await expect(heading).not.toHaveAttribute("style", /translate\(8%, -4%\)/);
    await expect(title).toHaveValue("页面实例填写内容");
    await expect(management).toBeHidden();
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(heading).toHaveAttribute("style", /translate\(8%, -4%\)/);
    expect(pageWrites).toEqual([]);
  });

  test("左右图文的标题、主图和链接直接可编辑并可保存回读", async ({ page }) => {
    const { inspector, savedPayload, pageWrites } = await prepareEditor(page, { noNewVersion: true }, "editorial-split");
    const link = inspector.getByRole("group", { name: "次级链接", exact: true });
    await expect(inspector.getByRole("textbox", { name: "主标题", exact: true })).toBeVisible();
    await expect(inspector.getByRole("textbox", { name: "描述", exact: true })).toBeVisible();
    const mainFields = await inspector.locator('fieldset[data-page-field-consumer="page"]:visible').evaluateAll(
      (fields) => fields.map((field) => field.getAttribute("data-page-field-label")),
    );
    expect(mainFields.slice(0, 3)).toEqual(["主标题", "描述", "主图"]);
    await expect(inspector.locator("summary")).toHaveCount(0);
    await expect(inspector.getByRole("group", { name: "副图 1", exact: true })).toBeVisible();
    await expect(inspector.getByRole("region", { name: "文字", exact: true }).locator("strong").first()).toHaveCSS("font-weight", "600");
    await link.getByRole("textbox", { name: "次级链接文案" }).fill("了解工艺");
    await selectInternalPage(page, link, "关于海川");
    expect(pageWrites).toEqual([]);
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(savedPayload).not.toBeNull();
    await page.reload();
    await page.locator('.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"] .homepage-editor__layer-select').click();
    await expect(link.getByRole("textbox", { name: "次级链接文案" })).toHaveValue("了解工艺");
    await expect(link).toContainText("跳转至「关于海川」");
  });

  test("空作品推荐可批量导入公开主图，单独换图后调整顺序并保存回读", async ({ page }) => {
    const { inspector, savedPayload, pageWrites } = await prepareEditor(page, { noNewVersion: true }, "creation-grid");
    let secondWorkHasPrimary = false;
    await page.route("**/api/products/public/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.includes("/media/")) {
        return route.fulfill({
          contentType: "image/png",
          body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
        });
      }
      const code = path.split("/").at(-1);
      const id = code === "P-500" ? 500 : 600;
      return route.fulfill(json({
        id,
        code,
        name: `业务商品 ${code}`,
        primaryImage: id === 500 || secondWorkHasPrimary
          ? { id: id + 1, mediaUrl: `/products/public/${id}/media/${id + 1}`, isVideo: false }
          : null,
      }));
    });
    const works = inspector.getByRole("region", { name: "作品", exact: true });
    const fields = works.locator("fieldset");
    const first = fields.nth(0);
    const second = fields.nth(1);
    const picker = page.getByRole("dialog", { name: "批量选作品" });
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const autoImage = canvas.getByRole("img", { name: "业务商品 P-500", exact: true });
    await works.getByRole("button", { name: "批量选作品" }).click();
    await picker.getByRole("button", { name: /业务商品 P-500/ }).click();
    await picker.getByRole("button", { name: /业务商品 P-600/ }).click();
    await picker.getByRole("button", { name: "确认选择（2）" }).click();
    await expect(picker.getByRole("alert")).toHaveText("作品 P-600 的公开主图不可用。请选择其他作品后重试。");
    await expect(autoImage).toHaveCount(0);
    expect(pageWrites).toEqual([]);

    secondWorkHasPrimary = true;
    await picker.getByRole("button", { name: "确认选择（2）" }).click();
    await expect(picker).toBeHidden();
    await expect(autoImage).toHaveAttribute("src", /\/api\/products\/public\/500\/media\/501/);
    await expect(first.getByRole("button", { name: "更换商品：业务商品 P-500" })).toBeVisible();
    await expect(second.getByRole("button", { name: "更换商品：业务商品 P-600" })).toBeVisible();
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(autoImage).toHaveCount(0);
    await page.getByRole("button", { name: "重做", exact: true }).click();
    await expect(autoImage).toBeVisible();

    await first.getByRole("button", { name: "更换商品：业务商品 P-500" }).click();
    const singlePicker = page.getByRole("dialog", { name: "选择商品", exact: true });
    await singlePicker.getByRole("button", { name: /业务商品 P-600/ }).click();
    await singlePicker.getByRole("button", { name: "确认选择", exact: true }).click();
    await expect(singlePicker).toBeHidden();
    await expect(canvas.getByRole("img", { name: "业务商品 P-600", exact: true })).toHaveCount(2);
    await expect(autoImage).toHaveCount(0);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(autoImage).toHaveAttribute("src", /\/api\/products\/public\/500\/media\/501/);

    const replacement = "/images/audit/template-v1-jewelry-banner.png";
    await uploadFixtureImage(page, first, replacement);
    await expect(autoImage).toHaveAttribute("src", replacement);
    const mobileReplacement = `${replacement}?mobile=1`;
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await uploadFixtureImage(page, first, mobileReplacement);
    await expect(first.locator('img[alt="预览"]')).toHaveAttribute("src", mobileReplacement);
    await page.getByRole("button", { name: /桌面端布局/ }).click();
    await first.getByRole("button", { name: "作品图 1后移" }).click();
    await expect(first.getByRole("button", { name: "更换商品：业务商品 P-600" })).toBeVisible();
    await expect(second.getByRole("button", { name: "更换商品：业务商品 P-500" })).toBeVisible();
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(savedPayload).toMatchObject({
      puckData: { content: [{ props: { contentBySlotId: {
        tpl_launch_creation_grid_slot_workA: {
          src: "/products/public/600/media/601", workProductCode: "P-600", alt: "业务商品 P-600",
        },
        tpl_launch_creation_grid_slot_workB: {
          src: replacement, mobileSrc: mobileReplacement, workProductCode: "P-500", alt: "业务商品 P-500",
        },
      } } }] },
    });
    await page.reload();
    await page.locator('.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"] .homepage-editor__layer-select').click();
    await expect(autoImage).toHaveAttribute("src", replacement);
    await expect(first.getByRole("button", { name: "更换商品：业务商品 P-600" })).toBeVisible();
    await expect(second.getByRole("button", { name: "更换商品：业务商品 P-500" })).toBeVisible();
  });

  test("作品四格显示缺图进度，作品跳转仅应用于已绑定的图片并保存回读", async ({ page }) => {
    const workSlotId = "tpl_launch_creation_grid_slot_workA";
    const { inspector, savedPayload, pageWrites } = await prepareEditor(page, {
      noNewVersion: true,
      imageDescriptionWarnings: true,
      publishIssues: [{
        code: "work-reference-invalid",
        message: "所选作品已下架，请重新选择",
        severity: "error",
        blockId: "dynamic-upgrade-block",
        path: `content[0].props.contentBySlotId.${workSlotId}.workProductCode`,
        field: workSlotId,
      }],
    }, "creation-grid");
    const works = inspector.getByRole("region", { name: "作品", exact: true });
    await expect(works.getByRole("status")).toHaveText("还缺 4 张作品图");
    const imageFields = works.locator("fieldset");
    await expect(imageFields).toHaveCount(4);
    for (const [index, imageField] of (await imageFields.all()).entries()) {
      await uploadFixtureImage(page, imageField, "/images/audit/template-v1-jewelry-banner.png");
      if (index === 0) continue;
      await (await openImageDescription(page, imageField)).fill(`作品图 ${index + 1} 的珠宝细节`);
      await imageField.getByRole("button", { name: "完成图片说明" }).click();
    }
    await page.getByRole("button", { name: "关闭本次发布检查" }).click();
    await expect(works.getByRole("status")).toHaveText("已填齐 4 张作品图");
    const batchTrigger = works.getByRole("button", { name: "批量选作品" });
    const batchPicker = page.getByRole("dialog", { name: "批量选作品" });
    await batchTrigger.click();
    await batchPicker.getByRole("button", { name: /业务商品 P-600/ }).click();
    await batchPicker.getByRole("button", { name: /^取\s*消$/ }).click();
    await expect(imageFields.first()).not.toContainText("业务商品 P-600");
    await batchTrigger.click();
    await batchPicker.getByRole("button", { name: /业务商品 P-600/ }).click();
    await batchPicker.getByRole("button", { name: /业务商品 P-500/ }).click();
    await batchPicker.getByRole("button", { name: "确认选择（2）" }).click();
    await expect(imageFields.nth(0)).toContainText("业务商品 P-600");
    await expect(imageFields.nth(1)).toContainText("业务商品 P-500");
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(imageFields.nth(0)).not.toContainText("业务商品 P-600");
    await expect(imageFields.nth(1)).not.toContainText("业务商品 P-500");
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    await canvas.locator('[data-template-node-type="ImageSlot"]').filter({
      has: canvas.getByRole("img", { name: "作品图 3 的珠宝细节", exact: true }),
    }).click();
    await expect(imageFields.nth(2)).toHaveAttribute("data-page-field-selected", "true");
    await expect(imageFields.nth(2)).toBeFocused();
    const firstWork = imageFields.first();
    const linkSettings = firstWork.locator('[data-inspector-field="workProductCode"]');
    await firstWork.getByRole("button", { name: "选择商品", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "选择商品" });
    await picker.getByRole("button", { name: /业务商品 P-500/ }).click();
    await picker.getByRole("button", { name: "确认选择", exact: true }).click();
    await expect(linkSettings).toContainText("业务商品 P-500");
    await expect(linkSettings.getByText("图片需要说明，才能作为商品链接。")).toBeVisible();
    await linkSettings.getByRole("button", { name: "填写图片说明" }).click();
    const description = firstWork.getByRole("textbox", { name: /替代文字/ });
    await expect(description).toBeFocused();
    await description.fill("作品图 1 的珠宝细节");
    await firstWork.getByRole("button", { name: "完成图片说明" }).click();
    await expect(linkSettings.getByText("图片需要说明，才能作为商品链接。")).toHaveCount(0);
    await expect(canvas.locator('a[href="/products/P-500"]')).toHaveCount(0);
    await page.getByRole("button", { name: "预览当前画布" }).click();
    await expect(canvas.getByRole("link", { name: "作品图 1 的珠宝细节" })).toHaveAttribute("href", "/products/P-500");
    await expect(canvas.getByRole("link", { name: "作品图 2 的珠宝细节" })).toHaveCount(0);
    await page.getByRole("button", { name: "退出当前画布预览" }).click();
    await firstWork.getByRole("button", { name: "作品图 1后移" }).click();
    await expect(imageFields.nth(1).locator('[data-inspector-field="workProductCode"]')).toContainText("业务商品 P-500");
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(linkSettings).toContainText("业务商品 P-500");
    expect(pageWrites).toEqual([]);
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(savedPayload).toMatchObject({
      puckData: { content: [{ props: { contentBySlotId: { [workSlotId]: { workProductCode: "P-500" } } } }] },
    });
    await page.reload();
    await page.locator('.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"] .homepage-editor__layer-select').click();
    await expect(works.getByRole("status")).toHaveText("已填齐 4 张作品图");
    await expect(linkSettings.getByRole("button", { name: "更换商品：业务商品 P-500" })).toBeVisible();
    await expect(linkSettings.locator(".homepage-editor__linked-product-image"))
      .toHaveAttribute("src", "/images/audit/template-v1-jewelry-banner.png");
    await page.getByRole("button", { name: "发布到前台网站" }).click();
    const review = page.getByRole("region", { name: "本次发布检查" });
    await review.locator('[data-page-publish-field="workProductCode"]').getByRole("button", { name: "定位" }).click();
    await expect(linkSettings).toHaveAttribute("data-page-publish-located", "true");
    expect(pageWrites.some(({ path }) => path.endsWith("/publish"))).toBe(false);
    await page.getByRole("button", { name: "关闭本次发布检查" }).click();
    await firstWork.getByRole("button", { name: "作品图 1后移" }).click();
    await batchTrigger.click();
    await batchPicker.getByRole("button", { name: /业务商品 P-600/ }).click();
    await batchPicker.getByRole("button", { name: "确认选择（1）" }).click();
    await expect(firstWork).toContainText("业务商品 P-600");
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    const secondSlotId = "tpl_launch_creation_grid_slot_workB";
    await expect.poll(savedPayload).toMatchObject({
      puckData: { content: [{ props: { contentBySlotId: {
        [workSlotId]: { alt: "作品图 2 的珠宝细节", workProductCode: "P-600" },
        [secondSlotId]: { alt: "作品图 1 的珠宝细节", workProductCode: "P-500" },
      } } }] },
    });
    await page.reload();
    await page.locator('.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"] .homepage-editor__layer-select').click();
    await expect(firstWork.getByRole("button", { name: "更换商品：业务商品 P-600" })).toBeVisible();
    await expect(imageFields.nth(1).getByRole("button", { name: "更换商品：业务商品 P-500" })).toBeVisible();
  });

  test("单图首屏优先显示画幅与图片，可直接调取景且没有空版本或数字入口", async ({ page }) => {
    const { inspector, savedPayload, pageWrites } = await prepareEditor(page, {
      image: true,
      swappedHero: "single-image",
      noNewVersion: true,
      imageDescriptionWarnings: true,
    });
    const imageField = inspector.locator('[data-slot-id="slot_image"]');
    const mediaField = imageField.locator('[data-media-field="slot_image"]');
    const canvasImage = page.frameLocator(".homepage-editor__canvas-scale iframe")
      .locator('[data-template-node-id="node_image"] img');
    const alt = imageField.getByRole("textbox", { name: "主图替代文字" });
    const save = page.getByRole("button", { name: "保存当前装修草稿" });
    const layer = page.locator('.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"] .homepage-editor__layer-select');
    const savedStatus = page.getByRole("status").filter({ hasText: "草稿与线上一致" });
    await expect(imageField.locator("[data-image-asset-guidance]")).toHaveText("建议 1440 × 810 px");
    await expect(mediaField).toHaveAttribute("data-media-frame", "16:9");
    await expect(imageField.getByText(/手机沿用桌面图/)).toHaveCount(0);
    await expect(alt).toHaveCount(0);
    await expect(mediaField.getByRole("button", { name: "图片链接" })).toHaveCount(0);
    await expect(inspector.getByText("图片已含标题", { exact: true })).toHaveCount(0);
    await expect(inspector.getByText("定位字段", { exact: true })).toHaveCount(0);
    await expect(inspector.getByRole("switch", { name: "在页面显示" })).toHaveCount(0);
    await expect(inspector.getByText("固定版本 tpl_page_upgrade v1")).toHaveCount(0);

    const imageUrl = "/images/audit/template-v1-jewelry-banner.png";
    await uploadFixtureImage(page, mediaField, imageUrl);
    await expect(canvasImage).toBeVisible();
    await expect(imageField.locator("[data-image-asset-guidance]")).toHaveCount(0);
    await expect(alt).toHaveCount(0);
    await expect(imageField).not.toContainText(/原图像素未知|正在读取原图像素/);
    expect(pageWrites).toEqual([]);
    await save.click();
    await expect.poll(savedPayload).not.toBeNull();
    await expect(savedStatus).toBeVisible();
    await page.reload();
    await layer.click();
    await expect(canvasImage).toBeVisible();

    const focus = imageField.getByRole("slider", { name: "拖动调整画面焦点" });
    await expect(focus).toBeVisible();
    await expect(imageField.getByRole("spinbutton", { name: /水平焦点|垂直焦点|缩放/ })).toHaveCount(0);
    await expect(imageField.getByText("调整图片取景", { exact: true })).toHaveCount(0);
    const undo = page.getByRole("button", { name: "撤销", exact: true });
    await expect(undo).toBeDisabled();
    await focus.press("Shift+ArrowLeft");
    await expect(canvasImage).toHaveCSS("object-position", "40% 50%");
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(canvasImage).toHaveCSS("object-position", "50% 50%");
    await layer.click();

    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect(imageField.locator('[data-media-field="slot_image-mobile"]')).toHaveAttribute("data-media-frame", "9:16");
    await expect(imageField.locator("[data-media-inherited-hint]")).toHaveText("手机沿用桌面图");
    await expect(imageField.getByText(/沿用桌面图/)).toHaveCount(1);
    await imageField.getByRole("button", { name: "添加图片说明", exact: true }).click();
    await expect(alt).toBeFocused();
    await alt.fill("首屏图片说明");
    await imageField.getByRole("button", { name: "完成图片说明" }).click();
    await expect(alt).toHaveCount(0);
    await expect(page.getByRole("button", { name: "关闭本次发布检查" })).toHaveCount(0);
    await expect(inspector.getByText("模板版本与样式", { exact: true })).toHaveCount(0);
    await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "1");
    expect(pageWrites).toHaveLength(1);

    await save.click();
    await expect.poll(savedPayload).toMatchObject({
      puckData: { content: [{ props: { contentBySlotId: { slot_image: { src: imageUrl, alt: "首屏图片说明" } } } }] },
    });
    await expect(savedStatus).toBeVisible();
    await page.reload();
    await layer.click();
    await expect(alt).toHaveCount(0);
    await expect(canvasImage).toHaveAttribute("alt", "首屏图片说明");
    await page.frameLocator(".homepage-editor__canvas-scale iframe")
      .locator('[data-template-node-id="node_image"]').click();
    const actions = await openBlockActions(page, inspector);
    await actions.getByRole("button", { name: "更正图片说明" }).click();
    await expect(alt).toHaveValue("首屏图片说明");
    await imageField.getByRole("button", { name: "完成图片说明" }).click();
    await expect(alt).toHaveCount(0);
  });

  test("普通图片槽位直接显示构图设置，与画布即时同步并在刷新后重放", async ({ page }) => {
    const { inspector, savedPayload } = await prepareEditor(page, { image: true });
    const publicStatus = inspector.getByRole("status", { name: "前台展示状态" });
    await expect(publicStatus).toHaveCount(0);
    await expect(inspector.locator('[data-slot-id="slot_image"]')).toContainText("主图");
    await expect(inspector.locator('[data-image-asset-guidance="slot_image"]'))
      .toHaveText("建议 1200 × 900 px");
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const image = canvas.locator('[data-template-node-id="node_image"] img');
    await expect(image).toHaveCount(0);
    // 页面实例整体预览折叠未填的可选图并保留有效标题；模板结构编辑仍有自己的空槽占位。
    await expect(canvas.locator('[data-template-node-id="node_image"]')).toHaveCount(0);
    await expect(canvas.locator('[data-template-empty-image="true"]')).toHaveCount(0);
    await expect(canvas.getByText("页面实例填写内容", { exact: true })).toBeVisible();

    await expect(inspector.locator('[data-media-field="slot_image"]'))
      .toHaveAttribute("data-workspace-field-shared", "true");
    const desktopComposition = inspector.locator('[data-image-composition="desktop"]');
    await expect(desktopComposition).toHaveCount(0);
    await expect(inspector.getByRole("textbox", { name: "主图替代文字" })).toHaveCount(0);

    const mediaField = inspector.locator('[data-media-field="slot_image"]');
    await expect(mediaField.getByRole("button", { name: "本页图片", exact: true })).toBeVisible();
    await expect(mediaField).toHaveAttribute("data-has-page-media", "true");
    await uploadFixtureImage(page, mediaField, "/images/audit/template-v1-jewelry-banner.png");
    await expect(image).toHaveCSS("object-fit", "cover");
    await expect(image).toHaveCSS("object-position", "50% 50%");
    await expect(mediaField.locator("[data-image-source-pixels]")).toHaveCount(0);
    await expect(mediaField.getByRole("button", { name: "本页图片", exact: true })).toHaveCount(0);
    await mediaField.getByRole("button", { name: "图片操作" }).click();
    const reuseImage = page.getByRole("menuitem", { name: "复用本页图片" });
    await expect(reuseImage).toBeVisible();
    await reuseImage.press("Escape");
    await expect(reuseImage).toBeHidden();
    const desktopFit = desktopComposition.getByRole("group", { name: "主图图片适配" });
    await expect(desktopComposition.locator("summary")).toHaveCount(0);
    await expect(desktopFit).toBeVisible();
    await expect(desktopFit.getByRole("button", { name: "填满并裁切" })).toHaveAttribute("aria-pressed", "true");
    await expect(desktopComposition.getByRole("spinbutton")).toHaveCount(0);
    await expect(inspector.getByRole("button", { name: /重置取景|恢复主图的模板取景/ })).toHaveCount(0);
    await expect(mediaField.locator(".homepage-editor__media-warning")).toHaveCount(0);
    await expect(publicStatus).toHaveCount(0);

    const showFullImage = desktopFit.getByRole("button", { name: "完整显示", exact: true });
    await showFullImage.press("Enter");
    await expect(showFullImage).toHaveAttribute("aria-pressed", "true");
    const focusPad = inspector.getByRole("slider", { name: "拖动调整画面焦点" });
    await expect(focusPad).toBeVisible();
    await dragImageFocusToCorner(page, focusPad, "top-left");
    await expect(inspector.getByRole("button", { name: /重置取景|恢复主图的模板取景/ })).toHaveCount(0);
    const actions = await openBlockActions(page, inspector);
    await expect(actions.getByRole("button", { name: "恢复主图的模板取景" })).toBeVisible();
    await actions.press("Escape");
    await expect(image).toHaveCSS("object-fit", "contain");
    await expect(image).toHaveCSS("object-position", "0% 0%");
    const mediaPreview = inspector.locator('[data-media-field="slot_image"] img[alt="预览"]');
    await expect(mediaPreview).toHaveCSS("object-fit", "contain");
    await expect(mediaPreview).toHaveCSS("object-position", "0% 0%");

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const payload = savedPayload() as { puckData: { content: Array<{ props: Record<string, any> }> } };
    expect(payload.puckData.content[0].props.layoutOverridesByNodeId).toEqual({
      node_image: {
        desktop: { objectFit: "contain", focusXPercent: 0, focusYPercent: 0 },
      },
    });

    await page.reload();
    const imageAfterReload = page.frameLocator(".homepage-editor__canvas-scale iframe").locator('[data-template-node-id="node_image"] img');
    await expect(imageAfterReload).toHaveCSS("object-fit", "contain");
    await expect(imageAfterReload).toHaveCSS("object-position", "0% 0%");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "展开属性面板" }).click();
    const drawer = page.getByRole("dialog", { name: "属性面板" });
    await expect(drawer.getByRole("button", { name: "图片操作" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "替换图片" })).toBeVisible();
    const narrowComposition = drawer.locator('[data-image-composition="desktop"]');
    await expect(narrowComposition.getByRole("button", { name: "完整显示", exact: true })).toBeVisible();
    await expect(narrowComposition.getByRole("button", { name: "完整显示", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(drawer.getByRole("button", { name: /重置取景|恢复主图的模板取景/ })).toHaveCount(0);
    await expect(narrowComposition.getByRole("spinbutton")).toHaveCount(0);
    await expect(drawer.getByRole("slider", { name: "拖动调整画面焦点" })).toBeVisible();
    await expect.poll(() => drawer.locator(".homepage-editor__properties-scroll").evaluate(
      (panel) => panel.scrollWidth - panel.clientWidth,
    )).toBeLessThanOrEqual(1);
  });

  test("移动端首屏没有手机图时，上传预览按模板对换后的竖框", async ({ page }) => {
    const { inspector } = await prepareEditor(page, { image: true, swappedHero: true });
    const mediaField = inspector.locator('[data-media-field="slot_image"]');
    const mobileField = inspector.locator('[data-media-field="slot_image-mobile"]');

    await uploadFixtureImage(page, mediaField, "/images/audit/template-v1-jewelry-banner.png");
    await expect(mediaField).toHaveAttribute("data-media-frame", "16:9");

    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect(mobileField).toBeVisible();
    await expect(mobileField).toHaveAttribute("data-media-inherited", "true");
    await expect(mobileField).toHaveAttribute("data-media-frame", "9:16");
    await expect(mobileField.locator("[data-image-focus-pad]")).toHaveCSS("aspect-ratio", "9 / 16");
    await expect(inspector.locator("[data-media-inherited-hint]")).not.toContainText("按原比例显示");
    await expect(inspector.locator('[data-image-asset-guidance="slot_image"]'))
      .toHaveText("手机沿用桌面图");
  });

  test("未上传手机图时，切到移动端后焦点板按手机画框只写手机构图", async ({ page }) => {
    const { inspector, savedPayload } = await prepareEditor(page, { image: true });
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const image = canvas.locator('[data-template-node-id="node_image"] img');
    const renderer = canvas.locator("[data-dynamic-template-device]");
    const mediaField = inspector.locator('[data-media-field="slot_image"]');
    const mobileField = inspector.locator('[data-media-field="slot_image-mobile"]');

    await uploadFixtureImage(page, mediaField, "/images/audit/template-v1-jewelry-banner.png");
    await expect(image).toHaveCSS("object-position", "50% 50%");
    await expect(mobileField).toHaveCount(0);

    const desktopComposition = inspector.locator('[data-image-composition="desktop"]');
    await expect(mediaField).toHaveAttribute("data-media-frame", "4:3");
    await dragImageFocusToCorner(page, mediaField.getByRole("slider", { name: "拖动调整画面焦点" }), "top-left");
    await expect(renderer).toHaveAttribute("data-dynamic-template-device", "desktop");
    await expect(image).toHaveCSS("object-position", "0% 0%");
    await expect(inspector.locator('[data-media-device="mobile"]')).toHaveCount(0);
    await expect(inspector.locator('[data-image-composition="mobile"]')).toHaveCount(0);
    // Puck 把历史提交延迟 250ms。下一步之前先落历史，撤销才只退这一步。
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect(renderer).toHaveAttribute("data-dynamic-template-device", "mobile");
    await expect(image).toHaveCSS("object-position", "50% 0%");
    await expect(desktopComposition).toHaveCount(0);
    await expect(inspector.locator('[data-media-field="slot_image"]')).toHaveCount(0);
    await expect(mobileField).toBeVisible();
    await expect(mobileField).toHaveAttribute("data-media-inherited", "true");
    await expect(mobileField).toHaveAttribute("data-media-frame", "4:5");
    await expect(mobileField.getByRole("alert")).toHaveCount(0);
    await expect(inspector.locator('[data-mobile-focus-preview="reused-desktop"]')).toHaveCount(0);
    const mobilePad = inspector.getByRole("slider", { name: "拖动调整画面焦点" });
    await expect(mobilePad).toBeVisible();
    const mobilePadBox = await mobilePad.boundingBox();
    if (!mobilePadBox) throw new Error("缺少手机画面焦点拖动板");
    await mobilePad.click({
      position: {
        x: Math.round(mobilePadBox.width * 0.8),
        y: Math.round(mobilePadBox.height * 0.85),
      },
    });
    await expect(page.getByRole("button", { name: /移动端布局/ })).toHaveAttribute("aria-pressed", "true");
    await expect(renderer).toHaveAttribute("data-dynamic-template-device", "mobile");
    await expect(image).not.toHaveCSS("object-position", "50% 0%");
    await expect(image).not.toHaveCSS("object-position", "0% 0%");
    const positionAfterPad = await image.evaluate((element) => getComputedStyle(element).objectPosition);
    const mobilePreview = mobileField.locator('img[alt="预览"]');
    await expect(mobilePreview).toHaveCSS("object-position", positionAfterPad);
    await expect(mobilePreview).not.toHaveCSS("object-position", "0% 0%");
    await page.waitForTimeout(300);

    const mobileComposition = inspector.locator('[data-image-composition="mobile"]');
    await expect(mobileComposition.getByRole("group", { name: "主图图片适配" })).toBeVisible();
    await expect(inspector.getByRole("button", { name: /重置取景|恢复主图的模板取景/ })).toHaveCount(0);
    await expect(mobileComposition.getByRole("spinbutton")).toHaveCount(0);
    await mobilePad.press("ArrowRight");
    await expect(image).not.toHaveCSS("object-position", positionAfterPad);
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "撤销" }).click();
    await expect.poll(() => image.evaluate((element) => getComputedStyle(element).objectPosition))
      .toBe(positionAfterPad);
    await expect(mobilePreview).toHaveCSS("object-position", positionAfterPad);

    await dragImageFocusToCorner(page, mobilePad, "bottom-right");
    await expect(image).toHaveCSS("object-position", "100% 100%");
    await page.waitForTimeout(300);
    await (await openBlockActions(page, inspector)).getByRole("button", { name: "恢复主图的模板取景" }).click();
    await expect(image).toHaveCSS("object-position", "50% 0%");
    await expect(mobilePreview).toHaveCSS("object-position", "50% 0%");
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "撤销" }).click();
    await expect(image).toHaveCSS("object-position", "100% 100%");

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const payload = savedPayload() as { puckData: { content: Array<{ props: Record<string, any> }> } };
    expect(payload.puckData.content[0].props.layoutOverridesByNodeId).toEqual({
      node_image: {
        desktop: { focusXPercent: 0, focusYPercent: 0 },
        mobile: { focusXPercent: 100, focusYPercent: 100 },
      },
    });

    await page.reload();
    const reloaded = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const imageAfterReload = reloaded.locator('[data-template-node-id="node_image"] img');
    await expect(imageAfterReload).toHaveCSS("object-position", "0% 0%");
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect(reloaded.locator("[data-dynamic-template-device]")).toHaveAttribute("data-dynamic-template-device", "mobile");
    await expect(imageAfterReload).toHaveCSS("object-position", "100% 100%");
    await page.getByRole("button", { name: /桌面端布局/ }).click();
    await expect(imageAfterReload).toHaveCSS("object-position", "0% 0%");
  });

  test("空浏览器投影直接读共享素材，失败可重试且保留当前引用", async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("haichuan.page-media"));
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const sharedAsset = {
      id: 41,
      url: "/uploads/page-assets/shared-operation.png",
      name: "共享运营素材.png",
      type: "image",
      mimeType: "image/png",
      size: 1024,
      width: 1200,
      height: 900,
      createdAt: "2026-09-22T08:00:00.000Z",
      status: "READY",
      available: true,
    };
    const fallbackAsset = {
      ...sharedAsset,
      id: 42,
      url: "/uploads/page-assets/shared-thumb-fallback.png",
      name: "缩略图回退素材.png",
    };
    const thumbnailProbes: Array<{ storageKey: string | null; width: string | null }> = [];
    const { inspector, savedPayload, pageMediaReadCount } = await prepareEditor(page, {
      image: true,
      pageMedia: { failFirst: true, items: [sharedAsset, fallbackAsset] },
    });
    // 共享列表与预览都是自有 API 夹具，不能让图片读取逃到真实后端触发401登出。
    await page.route("**/api/upload/media/preview-by-storage-key**", (route) => {
      const url = new URL(route.request().url());
      const probe = { storageKey: url.searchParams.get("storageKey"), width: url.searchParams.get("width") };
      thumbnailProbes.push(probe);
      if (probe.storageKey === "page-assets/shared-thumb-fallback.png" && probe.width === "480") {
        return route.fulfill({ status: 404, body: "thumbnail unavailable" });
      }
      return route.fulfill({ status: 200, contentType: "image/png", body: png });
    });
    const mediaField = inspector.locator('[data-media-field="slot_image"]');
    expect(pageMediaReadCount()).toBe(0);

    await mediaField.getByRole("button", { name: "本页图片", exact: true }).click();
    await expect(mediaField.getByRole("alert").filter({ hasText: "共享素材加载失败" }))
      .toBeVisible();
    expect(pageMediaReadCount()).toBe(1);
    await expect(mediaField.locator('img[alt="预览"]')).toHaveCount(0);
    await expect(mediaField.getByRole("button", { name: `使用素材：${sharedAsset.name}` }))
      .toHaveCount(0);

    await mediaField.getByRole("button", { name: "重新加载共享素材" }).click();
    await expect(mediaField.getByRole("button", { name: `使用素材：${sharedAsset.name}` }))
      .toBeEnabled();
    expect(pageMediaReadCount()).toBe(2);
    await expect(mediaField.getByText("当前引用需核对", { exact: true })).toHaveCount(0);
    const thumbnail = mediaField.getByRole("button", { name: `使用素材：${sharedAsset.name}` }).locator("img");
    await expect(thumbnail).toHaveAttribute("src", /[?&]width=480(?:&|$)/);
    const fallbackButton = mediaField.getByRole("button", { name: `使用素材：${fallbackAsset.name}` });
    await fallbackButton.scrollIntoViewIfNeeded();
    const fallbackThumbnail = fallbackButton.locator("img");
    await expect(fallbackThumbnail).toHaveAttribute("src", /preview-by-storage-key\?storageKey=page-assets%2Fshared-thumb-fallback\.png$/);
    await expect.poll(() => fallbackThumbnail.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    expect(thumbnailProbes.filter((probe) => probe.storageKey === "page-assets/shared-thumb-fallback.png" && probe.width === "480")).toHaveLength(1);
    expect(thumbnailProbes.filter((probe) => probe.storageKey === "page-assets/shared-thumb-fallback.png" && probe.width === null)).toHaveLength(1);

    await mediaField.getByRole("button", { name: `使用素材：${fallbackAsset.name}` }).click();
    await expect(mediaField.locator('img[alt="预览"]')).toBeVisible();
    await mediaField.getByRole("button", { name: "图片操作" }).click();
    await page.getByRole("menuitem", { name: "复用本页图片" }).click();
    const mediaSearch = mediaField.getByRole("textbox", { name: "搜索素材文件名" });
    await mediaSearch.fill("没有匹配的测试素材");
    await expect(mediaField.getByText("没有匹配的素材，可修改文件名关键词。")).toBeVisible();
    await mediaSearch.fill(sharedAsset.name);
    await expect(mediaField.getByRole("button", { name: `使用素材：${fallbackAsset.name}` })).toHaveCount(0);
    await expect(mediaField.getByRole("button", { name: `使用素材：${sharedAsset.name}` })).toHaveText(sharedAsset.name);
    await mediaField.getByRole("button", { name: `使用素材：${sharedAsset.name}` }).click();
    await expect(mediaField.locator('img[alt="预览"]')).toBeVisible();
    await page.locator('[data-workspace-action="save"]').evaluate((button: HTMLButtonElement) => button.click());
    await expect.poll(() => savedPayload()).not.toBeNull();
    const payload = savedPayload() as {
      puckData: { content: Array<{ props: { contentBySlotId: Record<string, unknown> } }> };
    };
    expect(payload.puckData.content[0].props.contentBySlotId.slot_image).toEqual({
      src: sharedAsset.url,
      alt: "",
    });
  });

  test("替换未公开授权的页面素材后画布走预览图，不误判为文件缺失", async ({ page }) => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const previewProbes: string[] = [];
    const publicAssetProbes: string[] = [];
    const { inspector } = await prepareEditor(page, { image: true });

    await page.route("**/uploads/page-assets/**", async (route) => {
      const url = new URL(route.request().url());
      publicAssetProbes.push(`${route.request().method()}:${url.pathname}`);
      await route.fulfill({ status: 404, body: "not found" });
    });
    await page.route("**/api/upload/media/preview-by-storage-key**", async (route) => {
      const url = new URL(route.request().url());
      previewProbes.push(`${route.request().method()}:${url.searchParams.get("storageKey") || ""}`);
      await route.fulfill({ status: 200, contentType: "image/png", body: png });
    });

    const mediaField = inspector.locator('[data-media-field="slot_image"]');
    await uploadFixtureImage(page, mediaField, "/uploads/page-assets/replaced.png");

    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const image = canvas.locator('[data-template-node-id="node_image"] img');
    await expect(image).toHaveAttribute(
      "data-template-managed-preview",
      "/api/upload/media/preview-by-storage-key?storageKey=page-assets%2Freplaced.png",
    );
    await expect(image).toHaveAttribute("src", /^blob:/);
    await expect.poll(async () => image.evaluate((element) => {
      const picture = element as HTMLImageElement;
      const box = picture.getBoundingClientRect();
      return picture.complete && picture.naturalWidth > 0 && box.width > 0 && box.height > 0;
    })).toBe(true);
    await expect(canvas.getByText("该内容暂不可展示")).toHaveCount(0);
    await expect.poll(() => previewProbes.some((item) => item.startsWith("GET:"))).toBe(true);
    await expect.poll(() => previewProbes.some((item) => item.startsWith("HEAD:"))).toBe(true);
    expect(publicAssetProbes.some((item) => item.startsWith("HEAD:"))).toBe(false);
  });

  test("未公开的首屏图片在画布里显示预览，不再停在空占位", async ({ page }) => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    await page.route("**/uploads/page-assets/**", async (route) => {
      await route.fulfill({ status: 404, body: "not found" });
    });
    await page.route("**/api/upload/media/preview-by-storage-key**", async (route) => {
      await route.fulfill({ status: 200, contentType: "image/png", body: png });
    });
    await prepareEditor(page, { heroImage: true });
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const image = canvas.locator(".hc-hero__image");
    await expect(image).toHaveAttribute("src", /^blob:/);
    await expect.poll(async () => image.evaluate((element) => {
      const picture = element as HTMLImageElement;
      const box = picture.getBoundingClientRect();
      return picture.complete && picture.naturalWidth > 0 && box.width > 0 && box.height > 0;
    })).toBe(true);
    await expect(canvas.locator("[data-asset-placeholder-illustration]")).toHaveCount(0);
  });

  test("可选图片清空保留替代文字且不回填默认图，保存重开后图片保持为空", async ({ page }) => {
    const { inspector, savedPayload, currentDocument } = await prepareEditor(page, { image: true, imageDescriptionWarnings: true });
    const mediaField = inspector.locator('[data-media-field="slot_image"]');
    await uploadFixtureImage(page, mediaField, "/images/audit/template-v1-jewelry-banner.png");
    const imageField = inspector.locator('[data-slot-id="slot_image"]');
    await (await openImageDescription(page, imageField)).fill("清空前保留的说明");
    await imageField.getByRole("button", { name: "完成图片说明" }).click();
    await page.getByRole("button", { name: "关闭本次发布检查" }).click();
    await page.getByRole("button", { name: /移动端布局/ }).click();
    const mobileField = inspector.locator('[data-media-field="slot_image-mobile"]');
    await expect(mobileField).toHaveAttribute("data-media-inherited", "true");
    await expect(mobileField.getByRole("button", { name: "移除手机专用图" })).toHaveCount(0);
    await uploadFixtureImage(page, mobileField, "/images/audit/template-v1-jewelry-banner.png?mobile=1");
    await expect(imageField.getByText("正在使用手机专用图", { exact: true })).toBeVisible();
    await expect(mobileField.locator('img[alt="预览"]')).toHaveAttribute("src", /mobile=1$/);
    await page.getByRole("button", { name: /桌面端布局/ }).click();
    await expect(mediaField.locator('img[alt="预览"]')).toHaveAttribute("src", /template-v1-jewelry-banner\.png$/);
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect(mobileField.locator('img[alt="预览"]')).toHaveAttribute("src", /mobile=1$/);
    await mobileField.getByRole("button", { name: "图片操作" }).click();
    await page.getByRole("menuitem", { name: "恢复沿用桌面图" }).click();
    await expect(mobileField).toHaveAttribute("data-media-inherited", "true");
    const restoredImage = page.frameLocator(".homepage-editor__canvas-scale iframe").locator('[data-template-node-id="node_image"] img');
    await expect(restoredImage).toHaveAttribute("alt", "清空前保留的说明");

    await page.getByRole("button", { name: /桌面端布局/ }).click();
    await expect(mediaField.locator('img[alt="预览"]')).toHaveAttribute("src", /template-v1-jewelry-banner\.png$/);
    await mediaField.getByRole("button", { name: "图片操作" }).click();
    await page.getByRole("menuitem", { name: "移除桌面图片" }).click();
    const confirm = page.getByRole("dialog", { name: "移除桌面图片？" });
    await expect(confirm).toContainText("手机端也会失去沿用的桌面图");
    await confirm.getByRole("button", { name: "确认移除" }).click();
    await expect(mediaField.locator('img[alt="预览"]')).toHaveCount(0);

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const payload = savedPayload() as { puckData: { content: Array<{ props: Record<string, any> }> } };
    expect(payload.puckData.content[0].props.contentBySlotId.slot_image).toEqual({
      src: "", alt: "清空前保留的说明",
    });

    await page.reload();
    const imageAfterReload = page.frameLocator(".homepage-editor__canvas-scale iframe")
      .locator('[data-template-node-id="node_image"] img');
    await expect(imageAfterReload).toHaveCount(0);
    await page.locator('.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"] .homepage-editor__layer-select')
      .click({ position: { x: 12, y: 18 } });
    await expect(page.getByRole("textbox", { name: "主图替代文字" })).toHaveCount(0);
    expect(currentDocument().puckData.content[0].props.contentBySlotId.slot_image).toEqual({ src: "", alt: "清空前保留的说明" });
  });

  test("母模板未授权时页面仍只编辑真实内容且不开放构图输入", async ({ page }) => {
    const { inspector, savedPayload } = await prepareEditor(page, { lockedLayout: true });
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const headingNode = canvas.locator('[data-template-node-id="node_heading"]');
    await expect(inspector.getByRole("group", { name: "页面实例属性范围" })).toHaveCount(0);
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

  test("只有页面内容时右栏无维护和保存状态，发布提醒由顶部入口查看", async ({ page }) => {
    const reminder = "页面素材源文件体积超过建议值";
    const { inspector, pageWrites, templateWrites } = await prepareEditor(page, {
      noNewVersion: true,
      publishIssues: [{ severity: "warning", path: "metadata", message: reminder }],
    });
    await expect(renderedPageInstance(page)).toHaveAttribute("data-dynamic-template-version", "1");
    await expect(inspector.getByRole("textbox", { name: "标题" })).toHaveValue("页面实例填写内容");
    await expect(inspector.getByText(/固定版本|本节样式与来源|模板版本与样式/)).toHaveCount(0);
    await expect(inspector.getByRole("button", { name: "恢复模板样式" })).toHaveCount(0);
    await expect(inspector.getByRole("button", { name: "查看差异" })).toHaveCount(0);
    await expect(inspector.getByRole("button", { name: "区块操作" })).toHaveCount(0);
    await expect(inspector.locator(".homepage-editor__properties-actions")).toHaveCount(0);
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "发布提醒（1 项）" }).click();
    await expect(page.getByRole("dialog", { name: "不影响发布的提醒 · 1 项" })).toContainText(reminder);
    expect(pageWrites).toEqual([]);
    expect(templateWrites).toEqual([]);
  });

  test("编辑已隐藏实例的内容保留显隐、旧构图和锁定版本，撤销重做不影响其他实例", async ({ page }) => {
    const { inspector, currentDocument, savedPayload, pageWrites, templateWrites } = await prepareEditor(page, {
      duplicate: true,
      legacyLayout: true,
      restoreTemplateValue: true,
    });
    const [original, otherInstance] = structuredClone(currentDocument().puckData.content);
    const first = renderedPageInstance(page);
    const secondHeading = renderedPageInstance(page, "dynamic-upgrade-instance-2")
      .locator('[data-template-node-id="node_heading"]');
    const title = inspector.getByRole("textbox", { name: "标题" });
    const visibility = inspector.getByRole("status", { name: "前台展示状态" });
    const headingVisibility = inspector.locator('[data-slot-id="slot_heading"] legend').getByText("已隐藏");
    const firstLayer = page.locator('.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"] .homepage-editor__layer-select');
    const undo = page.getByRole("button", { name: "撤销", exact: true });
    const redo = page.getByRole("button", { name: "重做", exact: true });

    await expect(first).toHaveAttribute("data-dynamic-template-version", "1");
    await expect(title).toHaveValue("页面原文：戒指 & 项链｜编号 A-01（逐字保留）");
    await expect(visibility).toHaveAttribute("data-state", "hidden");
    await expect(headingVisibility).toBeVisible();
    await expect(first.getByText("当前页面中已隐藏")).toBeVisible();
    await expect(secondHeading).toContainText("第二实例保持原值");
    await expect(secondHeading).toHaveAttribute("style", /translate\(8%, -4%\)/);
    await expect(undo).toBeDisabled();

    const changedTitle = "仅编辑已隐藏实例的文字";
    await title.fill(changedTitle);
    await expect(undo).toBeEnabled();
    await undo.click();
    await firstLayer.click({ position: { x: 12, y: 18 } });
    await expect(title).toHaveValue("页面原文：戒指 & 项链｜编号 A-01（逐字保留）");
    await expect(redo).toBeEnabled();
    await redo.click();
    await firstLayer.click({ position: { x: 12, y: 18 } });
    await expect(title).toHaveValue(changedTitle);
    await expect(visibility).toHaveAttribute("data-state", "hidden");
    await expect(headingVisibility).toBeVisible();
    await expect(secondHeading).toContainText("第二实例保持原值");
    await expect(secondHeading).toHaveAttribute("style", /translate\(8%, -4%\)/);
    expect(pageWrites).toEqual([]);

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(savedPayload).not.toBeNull();
    const payload = savedPayload() as { puckData: { content: Array<{ props: Record<string, unknown> }> } };
    expect(payload.puckData.content[0].props).toMatchObject({
      templateId: original.props.templateId,
      templateVersion: original.props.templateVersion,
      contentBySlotId: { slot_heading: changedTitle },
      layoutOverridesByNodeId: original.props.layoutOverridesByNodeId,
      hiddenSlotIds: ["slot_heading"],
      isVisible: false,
    });
    expect(payload.puckData.content[1].props).toEqual(otherInstance.props);
    expect(pageWrites.map(({ method }) => method)).toEqual(["PUT"]);
    expect(templateWrites).toEqual([]);

    await expect(inspector.getByRole("button", { name: "恢复显示标题" })).toHaveCount(0);
    await (await openBlockActions(page, inspector)).getByRole("button", { name: "恢复显示标题" }).click();
    await expect(headingVisibility).toHaveCount(0);
    await expect(title).toHaveValue(changedTitle);
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

    await inspector.getByRole("textbox", { name: "标题" }).fill("只修改第一个页面实例");
    await expect(headings.nth(0)).toContainText("只修改第一个页面实例");
    await expect(headings.nth(1)).toContainText("第二实例保持原值");
    await expect(headings.nth(0)).not.toHaveAttribute("style", /translate/);
    await expect(headings.nth(1)).not.toHaveAttribute("style", /translate/);

    await page.getByRole("button", { name: "预览当前画布" }).click();
    await expect(page.locator(".homepage-editor__preview-mode-note")).toContainText("正在预览尚未保存的修改");
    await expect(canvas.getByText("只修改第一个页面实例", { exact: true })).toHaveCount(1);
    await expect(canvas.getByText("第二实例保持原值", { exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "退出当前画布预览" }).click();

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savedPayload()).not.toBeNull();
    const payload = savedPayload() as { puckData: { content: Array<{ props: Record<string, any> }> } };
    expect(payload.puckData.content[0].props.contentBySlotId).toEqual({ slot_heading: "只修改第一个页面实例" });
    expect(payload.puckData.content[1].props.contentBySlotId).toEqual({ slot_heading: "第二实例保持原值" });
    expect(payload.puckData.content[0].props.layoutOverridesByNodeId).toEqual({});
    expect(payload.puckData.content[1].props.layoutOverridesByNodeId).toEqual({});
    expect(payload.puckData.content[0].props.instanceId).not.toBe(payload.puckData.content[1].props.instanceId);
    expect(templateWrites).toEqual([]);

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const refreshedCanvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    await expect(refreshedCanvas.getByText("只修改第一个页面实例", { exact: true })).toHaveCount(1);
    await expect(refreshedCanvas.getByText("第二实例保持原值", { exact: true })).toHaveCount(1);
  });

  test("发布问题按节点和设备定位内容，已退役的精确控件回落到对应字段", async ({ page }) => {
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
    await expect(inspector.getByRole("status", { name: "前台展示状态" }))
      .toContainText("本节有 3 项发布阻断");
    await layerButtons.nth(1).click({ position: { x: 12, y: 18 } });
    await expect(inspector.getByRole("status", { name: "前台展示状态" })).toHaveCount(0);
    await expect(inspector.getByRole("textbox", { name: "标题" })).toHaveValue("第二实例保持原值");

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "发布检查（3 项）" }).click();
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

    const title = inspector.getByRole("textbox", { name: "标题", exact: true });
    await desktopLayoutIssue.getByRole("button", { name: "定位" }).click();
    await expect(title).toHaveValue("页面实例填写内容");
    await expect(title).toBeFocused();
    await expect(layerButtons.nth(0)).toHaveAttribute("aria-current", "location");
    await expect(layerButtons.nth(1)).not.toHaveAttribute("aria-current", "location");

    await mobileLayoutIssue.getByRole("button", { name: "定位" }).click();
    await expect(page.getByRole("button", { name: /移动端布局/ })).toHaveAttribute("aria-pressed", "true");
    await expect(title).toBeFocused();

    await contentIssue.getByRole("button", { name: "定位" }).click();
    const titleContent = inspector.locator(
      '[data-inspector-field="slot_heading"][data-page-publish-located="true"]',
    );
    await expect(titleContent).toBeVisible();
    await expect(titleContent.getByRole("textbox", { name: "标题" })).toBeFocused();
  });

  // 当前注册节点范围是产品边界：历史定义保留原样，不能靠重试恢复已退役能力或自动升级。
  for (const retiredNodeType of ["Carousel", "ProductCollection"] as const) {
    test(`历史 ${retiredNodeType} 明确不支持，加载与重试保留精确版本和完整原数据且零写入`, async ({ page }) => {
      const {
        currentDocument, initialDocumentJson, savedPayload, templateSavedPayload,
        pageWrites, templateWrites,
      } = await prepareEditor(page, { retiredNodeType });
      const originalDocument = JSON.parse(initialDocumentJson);
      const versionKey = "tpl_page_upgrade@1";
      const originalResolved = originalDocument.puckData.resolvedDynamicTemplates[versionKey];
      const nodeId = retiredNodeType === "Carousel" ? "node_carousel" : "node_product_collection";
      expect(originalResolved.definition.nodes[nodeId].type).toBe(retiredNodeType);
      const error = page.getByRole("alert");

      const assertOriginalDataProtected = async () => {
        await expect(error).toContainText("模板版本解析失败");
        await expect(error).toContainText("节点类型未在母模板合同中登记");
        await expect(error).toContainText("页面草稿未修改");
        await expect(error.getByRole("button", { name: "重新加载模板版本" })).toBeVisible();
        await expect(page.locator(".homepage-editor__toolbar")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "保存当前装修草稿" })).toHaveCount(0);
        expect(JSON.stringify(currentDocument())).toBe(initialDocumentJson);
        expect(currentDocument().version).toBe(originalDocument.version);
        expect(currentDocument().publishedRevisionId).toBe(originalDocument.publishedRevisionId);
        expect(currentDocument().puckData.resolvedDynamicTemplates[versionKey]).toEqual(originalResolved);
        expect(currentDocument().puckData.resolvedDynamicTemplates[versionKey].definitionChecksum)
          .toBe(originalResolved.definitionChecksum);
        expect(currentDocument().puckData.content[0].props.templateVersion).toBe(1);
        expect(Object.keys(currentDocument().puckData.resolvedDynamicTemplates)).toEqual([versionKey]);
        // 合成事件只检查离开保护，没有刷新页面；失败加载不应制造未保存状态。
        expect(await page.evaluate(() => {
          const event = new Event("beforeunload", { cancelable: true });
          window.dispatchEvent(event);
          return event.defaultPrevented;
        })).toBe(false);
        expect(savedPayload()).toBeNull();
        expect(templateSavedPayload()).toBeNull();
        expect(pageWrites).toEqual([]);
        expect(templateWrites).toEqual([]);
      };

      await assertOriginalDataProtected();
      await Promise.all([
        page.waitForResponse((response) => response.request().method() === "GET"
          && new URL(response.url()).pathname.endsWith("/page-modules/document/admin")),
        error.getByRole("button", { name: "重新加载模板版本" }).click(),
      ]);
      await assertOriginalDataProtected();
    });
  }

  test("跳转在弹窗中搜索选择，取消保留原目标，确认只保存稳定引用", async ({ page }) => {
    const desktopViewport = { width: 1920, height: 948 };
    await page.setViewportSize(desktopViewport);
    const { inspector, savedPayload, pageWrites } = await prepareEditor(page, { directBusiness: true, noNewVersion: true });
    const categories = [
      { id: 1, slug: "rings", name: "戒指", isActive: true, hasPublicProduct: true, coverImage: "/svg/product.svg" },
      { id: 2, slug: "necklaces", name: "项链", isActive: true, hasPublicProduct: true, coverImage: "/svg/product.svg" },
    ];
    let categoryReads = 0;
    await page.route("**/api/categories/admin/tree", (route) => {
      categoryReads += 1;
      return categoryReads === 1 ? route.fulfill(json({}, 503)) : route.fulfill(json(categories));
    });
    await page.route("**/api/products?*", (route) => {
      const categoryId = new URL(route.request().url()).searchParams.get("categoryId");
      const list = categories.map((category, index) => ({
        id: 500 + index * 100,
        code: `P-${500 + index * 100}`,
        name: `业务商品 P-${500 + index * 100}`,
        category,
        status: "PUBLISHED",
        visibility: "PUBLIC",
        images: [{ url: "/images/audit/template-v1-jewelry-banner.png", type: "FRONT" }],
      })).filter((item) => !categoryId || String(item.category.id) === categoryId);
      return route.fulfill(json({ list, total: list.length, page: 1, pageSize: 12 }));
    });
    await page.route("**/api/categories/admin/resolve-references", (route) => {
      const { slugs } = route.request().postDataJSON() as { slugs: string[] };
      return route.fulfill(json(categories.filter((category) => slugs.includes(category.slug))
        .map((category) => ({
          ...category,
          eligible: category.slug !== "necklaces",
          reason: category.slug === "necklaces" ? "MISSING_COVER" : "AVAILABLE",
        }))));
    });
    const actionField = inspector.locator('[data-slot-id="slot_action"]');
    const product = actionField.getByRole("button", { name: "商品", exact: true });
    const category = actionField.getByRole("button", { name: "分类", exact: true });
    await product.click();
    const productPicker = page.getByRole("dialog", { name: "选择商品" });
    const pickerContent = (dialog: typeof productPicker) => dialog.locator(".ant-modal-content");
    await expect(pickerContent(productPicker)).toHaveCSS("width", "1120px");
    await expect(pickerContent(productPicker)).toHaveCSS("height", "740px");
    await expect(actionField.getByRole("button", { name: "不跳转" })).toHaveAttribute("aria-pressed", "true");
    await expect(productPicker.getByText("分类加载失败，仍可按名称或款号搜索商品。")).toBeVisible();
    await expect(productPicker.getByRole("button", { name: /业务商品 P-600/ })).toBeVisible();
    await productPicker.getByRole("button", { name: "重新加载分类" }).click();
    const productCategory = productPicker.getByRole("combobox", { name: "商品分类" });
    await productCategory.selectOption({ label: "戒指" });
    await productPicker.getByRole("button", { name: /业务商品 P-500/ }).click();
    await expect(productPicker.getByRole("button", { name: /业务商品 P-600/ })).toHaveCount(0);
    await productPicker.getByRole("button", { name: "确认选择", exact: true }).click();
    await expect(productPicker).toBeHidden();
    await expect(product).toHaveAttribute("aria-pressed", "true");
    const linkedProduct = actionField.getByRole("button", { name: "更换商品：业务商品 P-500" });
    const thumbnail = actionField.locator(".homepage-editor__linked-product-image");
    await expect(linkedProduct).toBeVisible();
    await expect(linkedProduct.locator("small")).toHaveText("P-500");
    await expect(thumbnail).toHaveAttribute("src", "/images/audit/template-v1-jewelry-banner.png");
    await expect.poll(() => thumbnail.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const detailLink = actionField.getByRole("link", { name: "查看商品详情（新标签页）" });
    await expect(detailLink).toHaveAttribute("href", "/products/P-500");
    await expect(detailLink).toHaveAttribute("target", "_blank");
    await expect(actionField.getByText(/此商品去向仅在装修预览中生效/)).toBeVisible();
    const missingCopy = actionField.getByText("填写文字后，按钮才会显示在页面上。");
    await expect(missingCopy).toBeVisible();
    await actionField.getByRole("textbox", { name: "主行动文案" }).fill("查看作品");
    await expect(missingCopy).toHaveCount(0);
    await linkedProduct.press("Enter");
    await expect(productCategory).toHaveValue("");
    await productPicker.getByRole("button", { name: /业务商品 P-600/ }).click();
    await productPicker.getByRole("button", { name: /^取\s*消$/ }).click();
    await expect(linkedProduct).toBeFocused();
    await expect(linkedProduct).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "展开属性面板" }).click();
    await expect(linkedProduct).toBeVisible();
    await expect.poll(() => linkedProduct.evaluate((button) => button.scrollWidth - button.clientWidth))
      .toBeLessThanOrEqual(1);
    await page.setViewportSize(desktopViewport);

    await category.click();
    const categoryPicker = page.getByRole("dialog", { name: "选择分类" });
    await expect(pickerContent(categoryPicker)).toHaveCSS("width", "1120px");
    await expect(pickerContent(categoryPicker)).toHaveCSS("height", "740px");
    await categoryPicker.getByRole("textbox", { name: "搜索分类" }).fill("项链");
    await expect(categoryPicker.getByRole("button", { name: "选择分类 戒指" })).toHaveCount(0);
    await categoryPicker.getByRole("button", { name: "选择分类 项链" }).click();
    await categoryPicker.getByRole("button", { name: /^取\s*消$/ }).click();
    await expect(categoryPicker).toBeHidden();
    await expect(product).toHaveAttribute("aria-pressed", "true");
    await expect(actionField).toContainText("业务商品 P-500");

    await category.click();
    await categoryPicker.getByRole("button", { name: "选择分类 项链" }).click();
    await categoryPicker.getByRole("button", { name: "确认选择", exact: true }).click();
    await expect(actionField).toContainText("缺少封面");
    await expect(actionField.getByRole("link", { name: "预览分类结果（新标签页）" })).toHaveCount(0);

    await category.click();
    await categoryPicker.getByRole("button", { name: "选择分类 戒指" }).click();
    await categoryPicker.getByRole("button", { name: "确认选择", exact: true }).click();
    await expect(categoryPicker).toBeHidden();
    await expect(category).toHaveAttribute("aria-pressed", "true");
    await expect(actionField).toContainText("戒指");
    const categoryTarget = actionField.getByRole("link", { name: "预览分类结果（新标签页）" });
    await expect(categoryTarget).toHaveAttribute("href", "/catalog?category=rings");
    await expect(categoryTarget).toHaveAttribute("target", "_blank");
    await expect(inspector.getByRole("textbox", { name: "搜索分类" })).toHaveCount(0);
    await actionField.getByRole("button", { name: "页面", exact: true }).click();
    const pagePicker = page.getByRole("dialog", { name: "选择页面", exact: true });
    await expect(pickerContent(pagePicker)).toHaveCSS("width", "1120px");
    await expect(pickerContent(pagePicker)).toHaveCSS("height", "740px");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(pickerContent(pagePicker)).toHaveCSS("width", "390px");
    await expect(pickerContent(pagePicker)).toHaveCSS("height", "844px");
    await expect(pagePicker.getByRole("button", { name: "确认选择", exact: true })).toBeInViewport();
    await page.setViewportSize(desktopViewport);
    await pagePicker.getByRole("radio", { name: "关于海川", exact: true }).check();
    await pagePicker.getByRole("button", { name: /^取\s*消$/ }).click();
    await expect(pagePicker).toBeHidden();
    await expect(category).toHaveAttribute("aria-pressed", "true");
    expect(pageWrites).toEqual([]);
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => (savedPayload() as {
      puckData: { content: Array<{ props: { contentBySlotId: Record<string, unknown> } }> };
    } | null)?.puckData.content[0].props.contentBySlotId.slot_action).toEqual({
      label: "查看作品",
      targetType: "category",
      categorySlug: "rings",
    });
    await page.reload();
    await page.locator('.homepage-editor__layer-item[data-layer-id="dynamic-upgrade-block"] .homepage-editor__layer-select').click();
    await expect(category).toHaveAttribute("aria-pressed", "true");
    await expect(actionField).toContainText("戒指");
  });

  test("直接商品、集合和行动槽位复用运营选择器并只保存稳定引用", async ({ page }) => {
    const { inspector, savedPayload, templateWrites } = await prepareEditor(page, { directBusiness: true });
    await expect(inspector.locator("fieldset:visible").first()).toHaveAttribute("data-slot-id", "slot_heading");
    await expect(inspector.getByText("其他模板内容", { exact: false })).toHaveCount(0);
    await expect(inspector.locator("fieldset:visible")).toHaveCount(5);
    await expect(inspector.getByRole("textbox", { name: "补充说明" })).toBeVisible();
    await expect(inspector.locator('[data-slot-id="slot_product"]')).toContainText("主商品");
    await expect(inspector.locator('[data-slot-id="slot_action"]')).toContainText("主行动");
    await expect(inspector.locator('[data-slot-id="slot_heading"]')
      .getByRole("button", { name: "恢复模板文案" })).toHaveCount(0);
    await expect(inspector.locator('[data-slot-id="slot_summary"]')
      .getByRole("button", { name: "恢复模板文案" })).toHaveCount(0);

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
    await selectInternalPage(page, actionField, "关于海川");
    await expect(actionField).toContainText("跳转至「关于海川」");
    await actionField.getByRole("button", { name: "外链", exact: true }).click();
    await expect(actionField.getByLabel(/HTTPS 外部链接/)).toHaveValue("");
    await selectInternalPage(page, actionField, "关于海川");
    await expect(actionField.getByLabel(/HTTPS 外部链接/)).toHaveCount(0);

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
