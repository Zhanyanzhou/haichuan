import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import {
  addDynamicTemplateNode,
  createBlankDynamicTemplateDefinition,
  duplicateDynamicTemplateNode,
  DynamicTemplateRenderer,
  moveDynamicTemplateNode,
  removeDynamicTemplateNode,
  renameDynamicTemplateNode,
  reorderDynamicTemplateNode,
  setDynamicTemplateNodeHidden,
  validateDynamicTemplateDefinition,
  DynamicTemplateOperationError,
  type TemplateDefinitionV2,
  type DynamicTemplateNodeType,
  type DynamicTemplateResponsiveRules,
} from "../../src/page-builder/template-definition";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  DynamicTemplateInstanceView,
  analyzeDynamicTemplateUpgrade,
  dynamicTemplateVersionKey,
  type DynamicTemplateInstanceProps,
} from "../../src/page-builder/dynamic-template-instance";
import PuckDocumentRenderer from "../../src/page-builder/runtime/PuckDocumentRenderer";
import { resolvePageHeaderMode } from "../../src/page-builder/config/editorPages";
import {
  createNewDynamicTemplateDraft,
  exportDynamicTemplateDraftJson,
  importDynamicTemplateDraftJson,
  listLocalDynamicTemplateDrafts,
  loadLocalDynamicTemplateDraft,
  saveLocalDynamicTemplateDraft,
} from "../../src/page-builder/template-editor/dynamicTemplateDraftRepository";
import {
  createSystemTemplateDraft,
  createTemplateRenderProps,
} from "../../src/page-builder/template-editor/templateDraftAdapter";
import { adaptLegacyTemplateSource } from "../../src/page-builder/template-editor/legacyTemplateConversion";
import { CONTENT_TEMPLATE_REGISTRY } from "../../src/page-builder/generated/contentTemplates.generated";
import { MATURE_CONTENT_TEMPLATE_MODULE_BY_NODE_TYPE } from "../../src/page-builder/template-definition/validateTemplateDefinition";

const autoRules = (
  display: DynamicTemplateResponsiveRules["display"] = "block",
  direction?: DynamicTemplateResponsiveRules["direction"],
  order = 0,
): DynamicTemplateResponsiveRules => ({
  display,
  ...(direction ? { direction } : {}),
  order,
  width: "fill",
  height: { mode: "auto" },
});

const imageData = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'%3E%3Crect width='4' height='3' fill='%23deddd8'/%3E%3C/svg%3E";

function createValidDefinition(): TemplateDefinitionV2 {
  return {
    schemaVersion: 1,
    templateId: "tpl_foundation",
    name: "品牌首屏｜左文右图",
    description: "动态模板基础测试",
    metadata: {
      category: "品牌首屏",
      purpose: "品牌展示",
      layoutType: "左右分栏",
      slotSummary: "1 个图片槽位，1 个标题槽位",
      recommendedFor: ["home"],
      desktopRatio: "16:9",
      mobileRatio: "4:5",
      mobileBreakpoint: 720,
      visualRole: "primary-stage",
      headerCompatibility: ["solid", "overlay-light"],
      tags: ["首屏", "图文"],
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
          desktop: autoRules("block"),
          mobile: autoRules("block"),
        },
        hidden: false,
      },
      node_container: {
        nodeId: "node_container",
        type: "Container",
        name: "首屏内容",
        childIds: ["node_image", "node_heading"],
        props: {},
        responsive: {
          desktop: { ...autoRules("flex", "row"), gap: { value: 2, unit: "rem" } },
          mobile: { ...autoRules("flex", "column"), gap: { value: 1, unit: "rem" } },
        },
        hidden: false,
      },
      node_image: {
        nodeId: "node_image",
        type: "ImageSlot",
        name: "主视觉图片",
        slotId: "slot_image",
        childIds: [],
        props: {},
        instanceEditPolicy: {
          position: true,
          size: true,
          zIndex: false,
          imageFit: true,
          imageFocus: true,
          typography: false,
          spacing: false,
          minWidthPercent: 50,
          maxWidthPercent: 150,
          maxOffsetPercent: 30,
          minFontSizePx: 12,
          maxFontSizePx: 96,
          maxSpacingPx: 120,
        },
        responsive: {
          desktop: { ...autoRules("block", undefined, 1), height: { mode: "aspect-ratio", ratio: { width: 4, height: 3 } } },
          mobile: { ...autoRules("block", undefined, 2), height: { mode: "aspect-ratio", ratio: { width: 4, height: 5 } } },
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
        responsive: {
          desktop: autoRules("block", undefined, 2),
          mobile: autoRules("block", undefined, 1),
        },
        hidden: false,
      },
    },
    slots: {
      slot_image: {
        slotId: "slot_image",
        key: "heroImage",
        type: "image",
        label: "主视觉图片",
        required: true,
        editable: true,
        hideable: false,
        validation: { recommendedWidth: 1600, recommendedHeight: 1200 },
        desktopRules: { aspectRatio: "4:3", objectFit: "cover", objectPosition: "center center" },
        mobileRules: { aspectRatio: "4:5", objectFit: "contain", objectPosition: "center top" },
      },
      slot_heading: {
        slotId: "slot_heading",
        key: "heading",
        type: "heading",
        label: "标题",
        required: true,
        editable: true,
        hideable: false,
        validation: { minLength: 1, maxLength: 40 },
        desktopRules: { fontRole: "display", fontSize: { value: 3, unit: "rem" }, maxLines: 2 },
        mobileRules: { fontRole: "heading", fontSize: { value: 2, unit: "rem" }, maxLines: 3 },
      },
    },
    defaultContent: {
      slot_image: { src: imageData, alt: "中性测试占位" },
      slot_heading: "光，沿线而生",
    },
  };
}

function createFreeLayoutDefinition(): TemplateDefinitionV2 {
  const definition = createValidDefinition();
  definition.nodes.node_container.type = "Stack";
  definition.nodes.node_container.responsive.desktop = {
    ...definition.nodes.node_container.responsive.desktop,
    display: "block",
    layoutMode: "free",
    height: { mode: "fixed", value: { value: 360, unit: "px" } },
  };
  definition.nodes.node_image.responsive.desktop.placement = { x: 0, y: 0, width: 0.6, height: 1, zIndex: 0 };
  definition.nodes.node_heading.responsive.desktop.placement = { x: 0.55, y: 0.2, width: 0.4, height: 0.5, zIndex: 1 };
  return definition;
}

function createVideoDefinition(): TemplateDefinitionV2 {
  let definition = createBlankDynamicTemplateDefinition("品牌影片｜宽屏叙事");
  const container = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
  definition = container.definition;
  const video = addDynamicTemplateNode(definition, container.nodeId, "Video");
  definition = video.definition;
  const slotId = video.slotId!;
  definition.nodes[video.nodeId].name = "品牌影片";
  definition.slots[slotId].key = "brandVideo";
  definition.slots[slotId].label = "品牌影片";
  definition.slots[slotId].required = true;
  definition.defaultContent[slotId] = {
    videoUrl: "data:video/mp4;base64,AAAA",
    posterUrl: imageData,
    videoDescription: "中性品牌影片示例",
    title: "光影与工艺",
    subtitle: "用于验证成熟视频组件适配器",
    actionText: "",
    targetType: "none",
    autoPlay: false,
    loop: true,
    muted: true,
    showControls: true,
    aspectRatio: "16:9",
    videoWidth: "standard",
    focusX: 50,
    focusY: 50,
    maxHeight: 720,
    bgColor: "#FFFFFF",
  };
  return definition;
}

function createComplexDefinition(
  name: string,
  nodeType: DynamicTemplateNodeType,
  content: Record<string, unknown>,
): TemplateDefinitionV2 {
  let definition = createBlankDynamicTemplateDefinition(name);
  const container = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
  definition = container.definition;
  const complexNode = addDynamicTemplateNode(definition, container.nodeId, nodeType);
  definition = complexNode.definition;
  definition.nodes[complexNode.nodeId].name = name;
  definition.slots[complexNode.slotId!].key = `${nodeType.charAt(0).toLowerCase()}${nodeType.slice(1)}Content`;
  definition.slots[complexNode.slotId!].label = name;
  definition.defaultContent[complexNode.slotId!] = content;
  return definition;
}

function createComplexDefinitions() {
  return {
    carousel: createComplexDefinition("系列轮播", "Carousel", {
      images: [{ url: imageData, mobileUrl: imageData, alt: "中性轮播图片", targetType: "none" }],
      autoPlay: false,
      interval: 4000,
      showDots: true,
      showArrows: true,
      desktopRatio: "wide",
      mobileRatio: "portrait",
    }),
    hotspot: createComplexDefinition("场景热区", "Hotspot", {
      image: imageData,
      mobileImage: imageData,
      altText: "中性热区底图",
      hotspots: [{ x: 20, y: 20, width: 30, height: 20, label: "中性热区", targetType: "none" }],
      mobileHotspots: [],
    }),
    beforeAfter: createComplexDefinition("改款前后", "BeforeAfter", {
      title: "珠宝改款",
      subtitle: "旧物的情感，以新的形态延续。",
      beforeImage: imageData,
      afterImage: imageData,
      beforeLabel: "改款前",
      afterLabel: "改款后",
      beforeAltText: "改款前示例",
      afterAltText: "改款后示例",
      beforeFocusX: 50,
      beforeFocusY: 50,
      afterFocusX: 50,
      afterFocusY: 50,
      actionText: "",
      targetType: "none",
      aspectRatio: "4:5",
      bgColor: "#FFFFFF",
    }),
    appointment: createComplexDefinition("预约入口", "Appointment", {
      backgroundImage: imageData,
      title: "预约鉴赏",
      subtitle: "一对一珠宝顾问，为您安排专属服务",
      buttonText: "立即预约",
      targetType: "page",
      linkUrl: "/contact",
      altText: "预约鉴赏背景",
      desktopFocusX: 50,
      desktopFocusY: 50,
      mobileFocusX: 50,
      mobileFocusY: 50,
      tone: "ivory",
      bgColor: "#FFFFFF",
    }),
    productCard: createComplexDefinition("单品展示", "ProductCard", {
      productCode: "",
      title: "代表作品",
      summary: "页面实例选择商品后从商品系统读取真实作品资料。",
      secondaryTargetType: "none",
      layout: "imageLeft",
      showPrice: false,
      bgColor: "#FFFFFF",
    }),
    productCollection: createComplexDefinition("商品集合", "ProductCollection", {
      productCodes: [],
      title: "本季精选",
      subtitle: "页面实例按商品编码选择真实商品。",
      layout: "grid-3",
      mobileColumns: 2,
      displayMode: "standard",
      actionStyle: "text",
      showPrice: true,
      bgColor: "#FFFFFF",
    }),
    categoryCollection: createComplexDefinition("分类集合", "CategoryCollection", {
      categorySlugs: [],
      title: "探索分类",
      subtitle: "页面实例按分类标识选择真实分类。",
      layout: "grid-3",
      bgColor: "#FFFFFF",
    }),
  };
}

function invalidCodes(definition: TemplateDefinitionV2): string[] {
  return validateDynamicTemplateDefinition(definition).issues.map((issue) => issue.code);
}

function makeInvalidCases() {
  const duplicateSlotKey = structuredClone(createValidDefinition());
  duplicateSlotKey.slots.slot_heading.key = duplicateSlotKey.slots.slot_image.key;

  const cycle = structuredClone(createValidDefinition());
  cycle.nodes.node_container.childIds.push("node_root");

  const missingChild = structuredClone(createValidDefinition());
  missingChild.nodes.node_container.childIds.push("node_missing");

  const illegalNesting = structuredClone(createValidDefinition());
  illegalNesting.nodes.node_column = {
    nodeId: "node_column",
    type: "Column",
    name: "非法直系列",
    childIds: ["node_image", "node_heading"],
    props: {},
    responsive: { desktop: autoRules("flex", "column"), mobile: autoRules("flex", "column") },
    hidden: false,
  };
  illegalNesting.nodes.node_root.childIds = ["node_column"];
  delete illegalNesting.nodes.node_container;

  const slotMismatch = structuredClone(createValidDefinition());
  slotMismatch.nodes.node_heading.type = "ImageSlot";

  const orphanNode = structuredClone(createValidDefinition());
  orphanNode.nodes.node_orphan = {
    nodeId: "node_orphan",
    type: "Spacer",
    name: "孤立间距",
    childIds: [],
    props: { spacerSize: { value: 1, unit: "rem" } },
    responsive: { desktop: autoRules(), mobile: autoRules() },
    hidden: false,
  };

  const invalidViewportHeight = structuredClone(createValidDefinition());
  invalidViewportHeight.nodes.node_root.responsive.mobile.height = {
    mode: "viewport",
    value: { value: 80, unit: "px" },
  };

  const unknownProperty = structuredClone(createValidDefinition());
  (unknownProperty.nodes.node_heading as unknown as Record<string, unknown>).unsafeStyle = "position:fixed";

  const invalidEmptyPolicy = structuredClone(createValidDefinition());
  (invalidEmptyPolicy.slots.slot_heading as unknown as Record<string, unknown>).emptyPolicy = "render-placeholder";

  const invalidVideoContent = createVideoDefinition();
  const videoSlotId = Object.values(invalidVideoContent.nodes).find((node) => node.type === "Video")?.slotId;
  if (videoSlotId) invalidVideoContent.defaultContent[videoSlotId] = { videoUrl: "https://example.com/video.mp4", autoPlay: "yes" };

  const invalidCarouselContent = createComplexDefinitions().carousel;
  const carouselSlotId = Object.values(invalidCarouselContent.nodes).find((node) => node.type === "Carousel")?.slotId;
  if (carouselSlotId) invalidCarouselContent.defaultContent[carouselSlotId] = { images: [{ url: imageData }], interval: 25 };

  const invalidHotspotContent = createComplexDefinitions().hotspot;
  const hotspotSlotId = Object.values(invalidHotspotContent.nodes).find((node) => node.type === "Hotspot")?.slotId;
  if (hotspotSlotId) invalidHotspotContent.defaultContent[hotspotSlotId] = {
    image: imageData,
    hotspots: [{ x: 90, y: 20, width: 20, height: 20 }],
    mobileHotspots: [],
  };

  const freeBase = structuredClone(createValidDefinition());
  freeBase.nodes.node_container.type = "Stack";
  freeBase.nodes.node_container.responsive.desktop.layoutMode = "free";
  freeBase.nodes.node_container.responsive.desktop.display = "block";
  freeBase.nodes.node_container.responsive.desktop.height = { mode: "fixed", value: { value: 420, unit: "px" } };
  freeBase.nodes.node_image.responsive.desktop.placement = { x: 0, y: 0, width: 0.6, height: 1, zIndex: 0 };
  freeBase.nodes.node_heading.responsive.desktop.placement = { x: 0.55, y: 0.2, width: 0.4, height: 0.5, zIndex: 1 };

  const placementOutOfBounds = structuredClone(freeBase);
  placementOutOfBounds.nodes.node_heading.responsive.desktop.placement = { x: 0.8, y: 0.2, width: 0.4, height: 0.5, zIndex: 1 };

  const placementInFlow = structuredClone(freeBase);
  placementInFlow.nodes.node_container.responsive.desktop.layoutMode = "flow";

  const freeAutoHeight = structuredClone(freeBase);
  freeAutoHeight.nodes.node_container.responsive.desktop.height = { mode: "auto" };

  const freeNonStack = structuredClone(freeBase);
  freeNonStack.nodes.node_container.type = "Container";

  return {
    duplicateSlotKey: invalidCodes(duplicateSlotKey),
    cycle: invalidCodes(cycle),
    missingChild: invalidCodes(missingChild),
    illegalNesting: invalidCodes(illegalNesting),
    slotMismatch: invalidCodes(slotMismatch),
    orphanNode: invalidCodes(orphanNode),
    invalidViewportHeight: invalidCodes(invalidViewportHeight),
    unknownProperty: invalidCodes(unknownProperty),
    invalidEmptyPolicy: invalidCodes(invalidEmptyPolicy),
    invalidVideoContent: invalidCodes(invalidVideoContent),
    invalidCarouselContent: invalidCodes(invalidCarouselContent),
    invalidHotspotContent: invalidCodes(invalidHotspotContent),
    validDesktopFreeMobileFlow: validateDynamicTemplateDefinition(freeBase).valid,
    placementOutOfBounds: invalidCodes(placementOutOfBounds),
    placementInFlow: invalidCodes(placementInFlow),
    freeAutoHeight: invalidCodes(freeAutoHeight),
    freeNonStack: invalidCodes(freeNonStack),
  };
}

function runOperationScenario() {
  let definition = createBlankDynamicTemplateDefinition("动态操作测试");
  const container = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
  definition = container.definition;
  const heading = addDynamicTemplateNode(definition, container.nodeId, "HeadingSlot");
  definition = heading.definition;
  const text = addDynamicTemplateNode(definition, container.nodeId, "TextSlot");
  definition = text.definition;
  const stack = addDynamicTemplateNode(definition, container.nodeId, "Stack", 1);
  definition = stack.definition;
  definition = moveDynamicTemplateNode(definition, heading.nodeId, stack.nodeId, 0);
  definition = renameDynamicTemplateNode(definition, heading.nodeId, "品牌标题");
  definition = setDynamicTemplateNodeHidden(definition, heading.nodeId, true);
  const headingSlotId = definition.nodes[heading.nodeId].slotId!;
  definition.defaultContent[headingSlotId] = "历史正式默认内容";
  definition.previewContent ??= {};
  definition.previewContent[headingSlotId] = "仅用于预览的示例";
  definition = reorderDynamicTemplateNode(definition, text.nodeId, 0);
  const duplicated = duplicateDynamicTemplateNode(definition, stack.nodeId);
  definition = duplicated.definition;
  const duplicateSlotIds = definition.nodes[duplicated.nodeId].childIds
    .map((nodeId) => definition.nodes[nodeId].slotId)
    .filter((slotId): slotId is string => Boolean(slotId));
  const duplicatedPreviewContent = definition.previewContent?.[duplicateSlotIds[0]];
  const duplicatedHasFormalDefault = Object.prototype.hasOwnProperty.call(
    definition.defaultContent,
    duplicateSlotIds[0],
  );
  definition = removeDynamicTemplateNode(definition, duplicated.nodeId);

  let cycleCode = "";
  try {
    moveDynamicTemplateNode(definition, container.nodeId, stack.nodeId);
  } catch (error) {
    cycleCode = error instanceof DynamicTemplateOperationError ? error.code : "UNKNOWN";
  }

  return {
    valid: validateDynamicTemplateDefinition(definition).valid,
    rootChildren: definition.nodes[definition.rootNodeId].childIds,
    containerChildren: definition.nodes[container.nodeId].childIds,
    stackChildren: definition.nodes[stack.nodeId].childIds,
    headingName: definition.nodes[heading.nodeId].name,
    headingHidden: definition.nodes[heading.nodeId].hidden,
    slotKeys: Object.values(definition.slots).map((slot) => slot.key),
    duplicateSlotIds,
    duplicatedPreviewContent,
    duplicatedHasFormalDefault,
    duplicateRemoved: !definition.nodes[duplicated.nodeId],
    cycleCode,
  };
}

function runLocalDraftScenario() {
  const existingDraftIds = new Set(
    listLocalDynamicTemplateDrafts().map((draft) => draft.localDraftId),
  );
  const draft = createNewDynamicTemplateDraft("本地草稿测试");
  const saved = saveLocalDynamicTemplateDraft(draft);
  const loaded = loadLocalDynamicTemplateDraft(saved.localDraftId);
  const copied = saveLocalDynamicTemplateDraft(saved, { asCopy: true, name: "本地草稿测试副本" });
  const exported = exportDynamicTemplateDraftJson(saved);
  const imported = importDynamicTemplateDraftJson(exported);
  const storedDrafts = listLocalDynamicTemplateDrafts();
  return {
    savedId: saved.localDraftId,
    loadedId: loaded?.localDraftId,
    copiedId: copied.localDraftId,
    copiedName: copied.definition.name,
    importedId: imported.localDraftId,
    importedName: imported.definition.name,
    savedCount: storedDrafts.length,
    netAdded: storedDrafts.filter((item) => !existingDraftIds.has(item.localDraftId)).length,
    savedPresent: storedDrafts.some((item) => item.localDraftId === saved.localDraftId),
    copyPresent: storedDrafts.some((item) => item.localDraftId === copied.localDraftId),
    exportedSchemaVersion: (JSON.parse(exported) as { schemaVersion: number }).schemaVersion,
  };
}

function runUpgradeScenario() {
  const currentDefinition = createValidDefinition();
  const instance: DynamicTemplateInstanceProps = {
    id: "upgrade-instance",
    instanceSchemaVersion: 1,
    instanceId: "upgrade-instance",
    templateId: currentDefinition.templateId,
    templateVersion: 3,
    moduleName: currentDefinition.name,
    contentBySlotId: { slot_heading: "页面保留内容" },
    overrides: {},
    hiddenSlotIds: [],
    isVisible: true,
  };
  const compatibleTarget = structuredClone(currentDefinition);
  compatibleTarget.defaultContent.slot_heading = "新版默认内容";
  const compatible = analyzeDynamicTemplateUpgrade({
    currentDefinition,
    targetDefinition: compatibleTarget,
    targetVersion: 4,
    instance,
  });

  const blockingTarget = structuredClone(currentDefinition);
  delete blockingTarget.slots.slot_heading;
  blockingTarget.slots.slot_required = {
    slotId: "slot_required",
    key: "requiredCopy",
    type: "text",
    label: "新增必填正文",
    required: true,
    editable: true,
    hideable: false,
    validation: {},
    desktopRules: {},
    mobileRules: {},
  };
  const blocking = analyzeDynamicTemplateUpgrade({
    currentDefinition,
    targetDefinition: blockingTarget,
    targetVersion: 5,
    instance,
  });
  return {
    originalVersion: instance.templateVersion,
    compatibleVersion: compatible.nextProps.templateVersion,
    compatibleContent: compatible.nextProps.contentBySlotId.slot_heading,
    preserved: compatible.preservedContentSlotIds,
    compatibleBlockers: compatible.blockers,
    discarded: blocking.discardedContentSlotIds,
    blockingReasons: blocking.blockers,
  };
}

function runLegacyAdaptationScenario() {
  const legacy = createSystemTemplateDraft("首屏主视觉");
  if (!legacy) throw new Error("首屏主视觉旧模板夹具不存在");
  const originalIdentity = `${legacy.contractKey}@${legacy.contractVersion}`;
  const report = adaptLegacyTemplateSource(legacy);
  const matureNode = Object.values(report.draft.definition.nodes).find((node) => node.type === "HeroTemplate");
  return {
    sourceType: legacy.sourceType,
    originalIdentity,
    originalIdentityAfter: `${legacy.contractKey}@${legacy.contractVersion}`,
    adaptedFormat: report.draft.format,
    adaptedTemplateId: report.draft.definition.templateId,
    sourceReference: report.sourceReference,
    mappedCount: report.mappedSlotLabels.length,
    skippedCount: report.skippedItems.length,
    riskCount: report.risks.length,
    valid: validateDynamicTemplateDefinition(report.draft.definition).valid,
    visualRole: report.draft.definition.metadata.visualRole,
    overlayCompatible: report.draft.definition.metadata.headerCompatibility?.includes("overlay-light"),
    nodeType: matureNode?.type,
    slotType: matureNode?.slotId ? report.draft.definition.slots[matureNode.slotId]?.type : undefined,
    layoutPreserved: JSON.stringify(matureNode?.props.contentTemplateLayoutData) === JSON.stringify(legacy.layoutData),
  };
}

function runLegacyVideoConversionScenario() {
  const legacy = createSystemTemplateDraft("视频区块");
  if (!legacy) throw new Error("视频区块旧模板夹具不存在");
  const report = adaptLegacyTemplateSource(legacy);
  const videoNode = Object.values(report.draft.definition.nodes).find((node) => node.type === "Video");
  const videoSlot = videoNode?.slotId ? report.draft.definition.slots[videoNode.slotId] : undefined;
  return {
    valid: validateDynamicTemplateDefinition(report.draft.definition).valid,
    videoNodeType: videoNode?.type,
    videoSlotType: videoSlot?.type,
    mappedCount: report.mappedSlotLabels.length,
    skippedVideo: report.skippedItems.some((message) => message.includes("视频播放配置未自动转换")),
    previewVideoUrl: videoNode?.slotId
      ? (report.draft.definition.previewContent?.[videoNode.slotId] as Record<string, unknown>)?.videoUrl
      : undefined,
    defaultContainsVideo: videoNode?.slotId
      ? Object.prototype.hasOwnProperty.call(report.draft.definition.defaultContent, videoNode.slotId)
      : false,
  };
}

function runLegacyComplexConversionScenario() {
  return ([
    ["轮播图", "Carousel", "carousel"],
    ["热区图", "Hotspot", "hotspot"],
    ["改款对比", "BeforeAfter", "beforeAfter"],
    ["预约入口", "Appointment", "appointment"],
    ["单品焦点推荐", "ProductCard", "productCard"],
    ["产品展示行", "ProductCollection", "productCollection"],
    ["分类卡片", "CategoryCollection", "categoryCollection"],
  ] as const).map(([moduleType, nodeType, slotType]) => {
    const legacy = createSystemTemplateDraft(moduleType);
    if (!legacy) throw new Error(`${moduleType}旧模板夹具不存在`);
    const report = adaptLegacyTemplateSource(legacy);
    const node = Object.values(report.draft.definition.nodes).find((item) => item.type === nodeType);
    return {
      moduleType,
      valid: validateDynamicTemplateDefinition(report.draft.definition).valid,
      nodeType: node?.type,
      slotType: node?.slotId ? report.draft.definition.slots[node.slotId]?.type : undefined,
      slotCount: Object.keys(report.draft.definition.slots).length,
    };
  });
}

function runAllLegacyConversionScenario() {
  return CONTENT_TEMPLATE_REGISTRY.map(({ key, moduleType }) => {
    const legacy = createSystemTemplateDraft(moduleType);
    if (!legacy) return { key, moduleType, valid: false, error: "missing-source" };
    const sourceBefore = JSON.stringify(legacy);
    try {
      const report = adaptLegacyTemplateSource(legacy);
      const serializedDefaults = JSON.stringify(report.draft.definition.defaultContent);
      return {
        key,
        moduleType,
        valid: validateDynamicTemplateDefinition(report.draft.definition).valid,
        sourceUnchanged: JSON.stringify(legacy) === sourceBefore,
        nodeCount: Object.keys(report.draft.definition.nodes).length,
        slotCount: Object.keys(report.draft.definition.slots).length,
        skippedCount: report.skippedItems.length,
        containsLegacyNumericProductReference: /"(?:secondary)?productIds?"\s*:/i.test(serializedDefaults),
      };
    } catch (error) {
      return {
        key,
        moduleType,
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

function Fixture() {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [localDraftScenario] = useState(runLocalDraftScenario);
  const [layoutOverrides, setLayoutOverrides] = useState<DynamicTemplateInstanceProps["layoutOverridesByNodeId"]>({});
  const [layoutCommitCount, setLayoutCommitCount] = useState(0);
  const [freeDefinition, setFreeDefinition] = useState(createFreeLayoutDefinition);
  const [freeCommitCount, setFreeCommitCount] = useState(0);
  const definition = createValidDefinition();
  const videoDefinition = createVideoDefinition();
  const complexDefinitions = createComplexDefinitions();
  const matureHeroSource = createSystemTemplateDraft("首屏主视觉");
  if (!matureHeroSource) throw new Error("首屏主视觉成熟组件夹具不存在");
  const matureHeroDefinition = adaptLegacyTemplateSource(matureHeroSource).draft.definition;
  const matureHeroProps = createTemplateRenderProps(matureHeroSource, "mature-hero", device);
  if (!matureHeroProps) throw new Error("首屏主视觉成熟组件渲染属性不存在");
  const matureHeroSlotId = Object.keys(matureHeroDefinition.slots)[0];
  const matureModuleTypes = new Set(Object.values(MATURE_CONTENT_TEMPLATE_MODULE_BY_NODE_TYPE));
  const matureDefinitions = CONTENT_TEMPLATE_REGISTRY
    .filter(({ moduleType }) => matureModuleTypes.has(moduleType as typeof MATURE_CONTENT_TEMPLATE_MODULE_BY_NODE_TYPE[keyof typeof MATURE_CONTENT_TEMPLATE_MODULE_BY_NODE_TYPE]))
    .map(({ moduleType }) => {
      const source = createSystemTemplateDraft(moduleType);
      if (!source) throw new Error(`${moduleType}成熟组件夹具不存在`);
      const definition = adaptLegacyTemplateSource(source).draft.definition;
      const props = createTemplateRenderProps(source, `mature-${moduleType}`, device);
      if (!props) throw new Error(`${moduleType}成熟组件渲染属性不存在`);
      const slotId = Object.keys(definition.slots)[0];
      return { moduleType, definition, contentBySlotId: { [slotId]: props } };
    });
  const validation = validateDynamicTemplateDefinition(definition);
  const instanceProps: DynamicTemplateInstanceProps = {
    id: "instance_test_v3",
    instanceSchemaVersion: 1,
    instanceId: "instance_test_v3",
    templateId: definition.templateId,
    templateVersion: 3,
    moduleName: definition.name,
    contentBySlotId: { slot_heading: "页面实例填写的标题" },
    overrides: {},
    hiddenSlotIds: [],
    isVisible: true,
  };
  const version3 = structuredClone(definition);
  version3.defaultContent.slot_heading = "正式版本三";
  const version4 = structuredClone(definition);
  version4.defaultContent.slot_heading = "正式版本四";
  const hideEmptyDefinition = structuredClone(definition);
  hideEmptyDefinition.slots.slot_heading.emptyPolicy = "hide";
  const useDefaultDefinition = structuredClone(definition);
  useDefaultDefinition.slots.slot_heading.emptyPolicy = "use-default";
  const publishedDocument = {
    content: [{
      type: DYNAMIC_TEMPLATE_BLOCK_TYPE,
      props: { ...instanceProps, contentBySlotId: {} },
    }],
    root: { props: {} },
    [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: {
      [dynamicTemplateVersionKey(definition.templateId, 3)]: {
        templateId: definition.templateId,
        version: 3,
        schemaVersion: 1,
        definitionChecksum: "checksum-v3",
        definition: version3,
      },
      [dynamicTemplateVersionKey(definition.templateId, 4)]: {
        templateId: definition.templateId,
        version: 4,
        schemaVersion: 1,
        definitionChecksum: "checksum-v4",
        definition: version4,
      },
    },
  };
  return (
    <main>
      <header>
        <button type="button" onClick={() => setDevice("desktop")}>桌面端</button>
        <button type="button" onClick={() => setDevice("mobile")}>移动端</button>
        <output aria-label="当前设备">{device}</output>
        <output aria-label="选中节点">{selectedNodeId ?? "none"}</output>
        <output aria-label="合法模板校验">{validation.valid ? "valid" : "invalid"}</output>
      </header>
      <section aria-label="V2 模板定义画布几何" style={{ width: 640, maxWidth: "100%" }}>
        <DynamicTemplateRenderer
          definition={definition}
          device={device}
          mode="editor"
          editorSurface="template-definition"
          selectedNodeId="node_image"
          onSelectNode={() => undefined}
          layoutEditMode
          layoutOverridesByNodeId={layoutOverrides}
          onLayoutOverrideCommit={(nodeId, targetDevice, override) => {
            setLayoutOverrides((current) => {
              const next = { ...(current ?? {}) };
              const nextNode = { ...(next[nodeId] ?? {}) };
              if (override) nextNode[targetDevice] = override;
              else delete nextNode[targetDevice];
              if (Object.keys(nextNode).length) next[nodeId] = nextNode;
              else delete next[nodeId];
              return next;
            });
            setLayoutCommitCount((count) => count + 1);
          }}
        />
        <output aria-label="V2 模板构图预览覆盖">{JSON.stringify(layoutOverrides)}</output>
        <output aria-label="V2 模板构图手势提交次数">{layoutCommitCount}</output>
      </section>
      <section aria-label="V2 自由层画布" style={{ width: 640, maxWidth: "100%" }}>
        <DynamicTemplateRenderer
          definition={freeDefinition}
          device="desktop"
          mode="editor"
          editorSurface="template-definition"
          selectedNodeId="node_heading"
          onSelectNode={() => undefined}
          onTemplatePlacementCommit={(nodeId, targetDevice, placement) => {
            setFreeDefinition((current) => {
              const next = structuredClone(current);
              next.nodes[nodeId].responsive[targetDevice].placement = placement;
              return next;
            });
            setFreeCommitCount((count) => count + 1);
          }}
        />
        <output aria-label="自由层位置">{JSON.stringify(freeDefinition.nodes.node_heading.responsive.desktop.placement)}</output>
        <output aria-label="自由层手势提交次数">{freeCommitCount}</output>
      </section>
      <section aria-label="动态模板画布">
        <DynamicTemplateRenderer
          definition={definition}
          device={device}
          mode="editor"
          editorSurface="template-definition"
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
        />
      </section>
      <section aria-label="动态模板缩略图">
        <DynamicTemplateRenderer
          definition={definition}
          device={device}
          mode="thumbnail"
        />
      </section>
      <section aria-label="页面实例内容">
        <DynamicTemplateInstanceView
          props={instanceProps}
          definition={definition}
          mode="preview"
        />
      </section>
      <section aria-label="空内容公开隐藏">
        <DynamicTemplateRenderer
          definition={hideEmptyDefinition}
          device={device}
          mode="public"
          contentBySlotId={{ slot_heading: "" }}
        />
      </section>
      <section aria-label="空内容编辑占位">
        <DynamicTemplateRenderer
          definition={hideEmptyDefinition}
          device={device}
          mode="editor"
          contentBySlotId={{ slot_heading: "" }}
        />
      </section>
      <section aria-label="空内容回退默认">
        <DynamicTemplateRenderer
          definition={useDefaultDefinition}
          device={device}
          mode="public"
          contentBySlotId={{ slot_heading: "" }}
        />
      </section>
      <section aria-label="隐藏实例公开">
        <DynamicTemplateInstanceView
          props={{
            ...instanceProps,
            instanceId: "instance_hidden",
            isVisible: false,
            contentBySlotId: { slot_heading: "不应出现在公开页面" },
          }}
          definition={definition}
          mode="public"
        />
      </section>
      <section aria-label="隐藏实例编辑">
        <DynamicTemplateInstanceView
          props={{ ...instanceProps, instanceId: "instance_hidden_editor", isVisible: false }}
          definition={definition}
          mode="editor"
        />
      </section>
      <section aria-label="复杂视频节点">
        <DynamicTemplateRenderer
          definition={videoDefinition}
          device={device}
          mode="editor"
        />
      </section>
      <section aria-label="复杂轮播节点">
        <DynamicTemplateRenderer definition={complexDefinitions.carousel} device={device} mode="editor" />
      </section>
      <section aria-label="复杂热区节点">
        <DynamicTemplateRenderer definition={complexDefinitions.hotspot} device={device} mode="editor" />
      </section>
      <section aria-label="复杂前后对比节点">
        <DynamicTemplateRenderer definition={complexDefinitions.beforeAfter} device={device} mode="editor" />
      </section>
      <section aria-label="复杂预约节点">
        <DynamicTemplateRenderer definition={complexDefinitions.appointment} device={device} mode="editor" />
      </section>
      <section aria-label="业务单品节点">
        <DynamicTemplateRenderer definition={complexDefinitions.productCard} device={device} mode="editor" />
      </section>
      <section aria-label="业务商品集合节点">
        <DynamicTemplateRenderer definition={complexDefinitions.productCollection} device={device} mode="editor" />
      </section>
      <section aria-label="业务分类集合节点">
        <DynamicTemplateRenderer definition={complexDefinitions.categoryCollection} device={device} mode="editor" />
      </section>
      <section aria-label="成熟首屏 V2 节点">
        <DynamicTemplateRenderer
          definition={matureHeroDefinition}
          device={device}
          mode="public"
          contentBySlotId={{ [matureHeroSlotId]: matureHeroProps }}
          primaryHeadingLevel={1}
        />
      </section>
      <div data-testid="mature-template-v2-matrix">
        {matureDefinitions.map(({ moduleType, definition: matureDefinition, contentBySlotId }) => (
          <section
            key={moduleType}
            aria-label={`成熟模板 ${moduleType}`}
            data-mature-template-module={moduleType}
            style={{ width: "100%", minWidth: 0, overflow: "clip" }}
          >
            <DynamicTemplateRenderer
              definition={matureDefinition}
              device={device}
              mode="public"
              contentBySlotId={contentBySlotId}
              primaryHeadingLevel={moduleType === "首屏主视觉" ? 1 : 2}
            />
          </section>
        ))}
      </div>
      <section aria-label="公开页面固定版本">
        <PuckDocumentRenderer data={publishedDocument} mode="public" />
        <output aria-label="动态首屏导航模式">
          {resolvePageHeaderMode("home", publishedDocument)}
        </output>
      </section>
      <section aria-label="缺失版本预览">
        <PuckDocumentRenderer
          data={{
            content: [{
              type: DYNAMIC_TEMPLATE_BLOCK_TYPE,
              props: { ...instanceProps, templateVersion: 99 },
            }],
            root: { props: {} },
          }}
          mode="preview"
        />
      </section>
      <section aria-label="缺失版本公开">
        <PuckDocumentRenderer
          data={{
            content: [{
              type: DYNAMIC_TEMPLATE_BLOCK_TYPE,
              props: { ...instanceProps, templateVersion: 99 },
            }],
            root: { props: {} },
          }}
          mode="public"
        />
      </section>
      <pre data-testid="invalid-cases">{JSON.stringify(makeInvalidCases())}</pre>
      <pre data-testid="operation-result">{JSON.stringify(runOperationScenario())}</pre>
      <pre data-testid="local-draft-result">{JSON.stringify(localDraftScenario)}</pre>
      <pre data-testid="upgrade-result">{JSON.stringify(runUpgradeScenario())}</pre>
      <pre data-testid="legacy-adaptation-result">{JSON.stringify(runLegacyAdaptationScenario())}</pre>
      <pre data-testid="legacy-video-conversion-result">{JSON.stringify(runLegacyVideoConversionScenario())}</pre>
      <pre data-testid="legacy-complex-conversion-result">{JSON.stringify(runLegacyComplexConversionScenario())}</pre>
      <pre data-testid="legacy-all-conversion-result">{JSON.stringify(runAllLegacyConversionScenario())}</pre>
    </main>
  );
}

function MatureRendererParityMatrix() {
  const device = window.innerWidth <= 390 ? "mobile" : "desktop";
  const matureModuleTypes = new Set(Object.values(MATURE_CONTENT_TEMPLATE_MODULE_BY_NODE_TYPE));
  const directComplexModuleTypes = new Set([
    "视频区块",
    "轮播图",
    "热区图",
    "改款对比",
    "预约入口",
  ]);
  const entries = CONTENT_TEMPLATE_REGISTRY
    .filter(({ moduleType }) => matureModuleTypes.has(moduleType as typeof MATURE_CONTENT_TEMPLATE_MODULE_BY_NODE_TYPE[keyof typeof MATURE_CONTENT_TEMPLATE_MODULE_BY_NODE_TYPE])
      || directComplexModuleTypes.has(moduleType))
    .map(({ moduleType }) => {
      const source = createSystemTemplateDraft(moduleType);
      if (!source) throw new Error(`${moduleType}对照来源不存在`);
      const props = createTemplateRenderProps(source, `parity-${moduleType}`, device);
      if (!props) throw new Error(`${moduleType}对照渲染属性不存在`);
      return {
        moduleType,
        props,
        definition: adaptLegacyTemplateSource(source).draft.definition,
      };
    });
  return (
    <main data-testid="template-renderer-parity-matrix">
      {entries.map(({ moduleType, props, definition: convertedDefinition }) => {
        const slotId = Object.keys(convertedDefinition.slots)[0];
        return (
        <section key={moduleType} data-parity-module={moduleType} style={{ minWidth: 0 }}>
          <div data-parity-source="current">
            <PuckDocumentRenderer
              data={{ content: [{ type: moduleType, props }], root: { props: {} } }}
              mode="public"
              heroHeadingLevel={moduleType === "首屏主视觉" ? 1 : 2}
            />
          </div>
          <div data-parity-source="v2">
            <DynamicTemplateRenderer
              definition={convertedDefinition}
              device={device}
              mode="public"
              contentBySlotId={{ [slotId]: props }}
              primaryHeadingLevel={moduleType === "首屏主视觉" ? 1 : 2}
            />
          </div>
        </section>
        );
      })}
    </main>
  );
}

function BusinessRendererParityMatrix() {
  const device = window.innerWidth <= 390 ? "mobile" : "desktop";
  const stableContentByModule: Record<string, Record<string, unknown>> = {
    单品焦点推荐: { productCode: "SAFE-1" },
    产品展示行: { productCodes: ["SAFE-1", "SAFE-2"] },
    分类卡片: { categorySlugs: ["safe-1", "safe-2"] },
  };
  const entries = Object.entries(stableContentByModule).map(([moduleType, stableContent]) => {
    const source = createSystemTemplateDraft(moduleType);
    if (!source) throw new Error(`${moduleType}业务对照来源不存在`);
    const currentProps = createTemplateRenderProps(source, `business-parity-${moduleType}`, device);
    if (!currentProps) throw new Error(`${moduleType}业务对照渲染属性不存在`);
    const definition = adaptLegacyTemplateSource(source).draft.definition;
    const slotId = Object.keys(definition.slots)[0];
    const contentBySlotId = {
      [slotId]: {
        ...(definition.previewContent?.[slotId] as Record<string, unknown> ?? {}),
        ...stableContent,
      },
    };
    return {
      moduleType,
      props: { ...currentProps, ...stableContent },
      definition,
      contentBySlotId,
    };
  });
  return (
    <main data-testid="business-renderer-parity-matrix">
      {entries.map(({ moduleType, props, definition, contentBySlotId }) => (
        <section key={moduleType} data-business-parity-module={moduleType} style={{ minWidth: 0 }}>
          <div data-parity-source="current">
            <PuckDocumentRenderer
              data={{ content: [{ type: moduleType, props }], root: { props: {} } }}
              mode="public"
            />
          </div>
          <div data-parity-source="v2">
            <DynamicTemplateRenderer
              definition={definition}
              device={device}
              mode="public"
              contentBySlotId={contentBySlotId}
            />
          </div>
        </section>
      ))}
    </main>
  );
}

const searchParams = new URLSearchParams(window.location.search);
const parityMode = searchParams.has("rendererParity");
const businessParityMode = searchParams.has("businessParity");
createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    {businessParityMode
      ? <BusinessRendererParityMatrix />
      : parityMode
        ? <MatureRendererParityMatrix />
        : <Fixture />}
  </MemoryRouter>,
);
