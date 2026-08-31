import {
  getContentTemplateContract,
  isContentTemplateAllowedForPage,
  sanitizeContentTemplateDefaultContent,
  type ContentTemplateEditableObject,
  type RegisteredContentTemplateKey,
} from "../generated/contentTemplates.generated";
import { getTemplatePreviewContent } from "../preview/templatePreviewContent";
import {
  addDynamicTemplateNode,
  createBlankDynamicTemplateDefinition,
  createDynamicTemplateStableId,
  sanitizeMatureContentTemplateDesignProps,
  validateDynamicTemplateDefinition,
  type TemplateDefinitionV2,
  type DynamicTemplateNodeType,
  type DynamicTemplateSlotDefinition,
} from "../template-definition";
import type { LegacyTemplateSourceDraft, TemplateEditorDraft } from "./types";

const PAGE_KEYS = ["home", "products", "catalog", "custom", "about", "contact"] as const;

interface LegacyTemplateAdaptationReport {
  sourceLabel: string;
  sourceReference: string;
  mappedSlotLabels: string[];
  skippedItems: string[];
  risks: string[];
  draft: TemplateEditorDraft;
}

function stableKey(value: string, fallback: string) {
  const cleaned = value.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  const prefixed = /^[A-Za-z]/.test(cleaned) ? cleaned : `field_${cleaned || fallback}`;
  return prefixed.slice(0, 128);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function ratioLabel(value: string | undefined) {
  if (!value) return undefined;
  const match = value.match(/^\s*([1-9]\d*)\s*[/ :]\s*([1-9]\d*)\s*$/);
  return match ? `${match[1]}:${match[2]}` : undefined;
}

function textNodeType(field: string): DynamicTemplateNodeType {
  if (/eyebrow|badge|label/i.test(field)) return "BadgeSlot";
  if (/title|heading|headline|name/i.test(field)) return "HeadingSlot";
  if (/body|content|description|summary/i.test(field)) return "RichTextSlot";
  return "TextSlot";
}

function defaultActionContent(defaults: Record<string, unknown>, fields: readonly string[]) {
  const labelField = fields.find((field) => /(?:action|button|link).*text/i.test(field))
    ?? fields.find((field) => /text|label/i.test(field));
  const targetType = typeof defaults.targetType === "string" ? defaults.targetType : "none";
  const result: Record<string, unknown> = {
    label: labelField && typeof defaults[labelField] === "string" ? defaults[labelField] : "",
    targetType,
  };
  if (targetType === "page" && typeof defaults.linkUrl === "string") result.pagePath = defaults.linkUrl;
  if (targetType === "external" && typeof defaults.linkUrl === "string") result.url = defaults.linkUrl;
  if (targetType === "product" && typeof defaults.productCode === "string") result.productCode = defaults.productCode;
  if (targetType === "category" && typeof defaults.categorySlug === "string") result.categorySlug = defaults.categorySlug;
  return result;
}

function defaultVideoContent(defaults: Record<string, unknown>) {
  const stringValue = (key: string, fallback = "") => typeof defaults[key] === "string"
    ? defaults[key] as string
    : fallback;
  const booleanValue = (key: string, fallback: boolean) => typeof defaults[key] === "boolean"
    ? defaults[key] as boolean
    : fallback;
  const targetType = ["none", "page", "product", "category", "external"].includes(stringValue("targetType"))
    ? stringValue("targetType")
    : "none";
  const stableTargetType = targetType === "product" && !isNonEmptyString(defaults.productCode)
    ? "none"
    : targetType;
  return {
    videoUrl: stringValue("videoUrl"),
    posterUrl: stringValue("posterUrl"),
    videoDescription: stringValue("videoDescription"),
    title: stringValue("title"),
    subtitle: stringValue("subtitle"),
    actionText: stringValue("actionText"),
    targetType: stableTargetType,
    ...(typeof defaults.productCode === "string" ? { productCode: defaults.productCode } : {}),
    ...(typeof defaults.categorySlug === "string" ? { categorySlug: defaults.categorySlug } : {}),
    ...(typeof defaults.linkUrl === "string" ? { linkUrl: defaults.linkUrl } : {}),
    autoPlay: booleanValue("autoPlay", false),
    loop: booleanValue("loop", true),
    muted: booleanValue("muted", true),
    showControls: booleanValue("showControls", true),
    aspectRatio: ["16:9", "21:6", "4:5", "9:16"].includes(stringValue("aspectRatio"))
      ? stringValue("aspectRatio")
      : "16:9",
    videoWidth: ["standard", "full"].includes(stringValue("videoWidth"))
      ? stringValue("videoWidth")
      : "standard",
    focusX: typeof defaults.focusX === "number" ? defaults.focusX : 50,
    focusY: typeof defaults.focusY === "number" ? defaults.focusY : 50,
    maxHeight: typeof defaults.maxHeight === "number" ? defaults.maxHeight : 720,
    bgColor: stringValue("bgColor", "#FFFFFF"),
  };
}

const COMPLEX_TEMPLATE_NODE_BY_MODULE = {
  "轮播图": { nodeType: "Carousel", slotKey: "carouselContent", label: "轮播组件" },
  "热区图": { nodeType: "Hotspot", slotKey: "hotspotContent", label: "热区组件" },
  "改款对比": { nodeType: "BeforeAfter", slotKey: "beforeAfterContent", label: "前后对比组件" },
  "预约入口": { nodeType: "Appointment", slotKey: "appointmentContent", label: "预约入口组件" },
  "单品焦点推荐": { nodeType: "ProductCard", slotKey: "productCardContent", label: "单品展示组件" },
  "产品展示行": { nodeType: "ProductCollection", slotKey: "productCollectionContent", label: "商品集合组件" },
  "分类卡片": { nodeType: "CategoryCollection", slotKey: "categoryCollectionContent", label: "分类集合组件" },
} as const satisfies Record<string, {
  nodeType: DynamicTemplateNodeType;
  slotKey: string;
  label: string;
}>;

const MATURE_TEMPLATE_NODE_BY_MODULE = {
  "首屏主视觉": { nodeType: "HeroTemplate", slotKey: "heroTemplateContent", label: "首屏主视觉组件" },
  "全屏出血图": { nodeType: "FullBleedTemplate", slotKey: "fullBleedTemplateContent", label: "全屏出血图组件" },
  "单图海报": { nodeType: "SinglePosterTemplate", slotKey: "singlePosterTemplateContent", label: "单图海报组件" },
  "双图海报": { nodeType: "DoublePosterTemplate", slotKey: "doublePosterTemplateContent", label: "双图海报组件" },
  "文字横幅": { nodeType: "TextBannerTemplate", slotKey: "textBannerTemplateContent", label: "文字横幅组件" },
  "定制流程": { nodeType: "JourneyTemplate", slotKey: "journeyTemplateContent", label: "定制流程组件" },
  "作品画廊": { nodeType: "GalleryTemplate", slotKey: "galleryTemplateContent", label: "作品画廊组件" },
  "佩戴灵感": { nodeType: "LookbookTemplate", slotKey: "lookbookTemplateContent", label: "佩戴灵感组件" },
  "按场景选购": { nodeType: "SceneShoppingTemplate", slotKey: "sceneShoppingTemplateContent", label: "场景选购组件" },
  "卡片网格": { nodeType: "BrandPointsTemplate", slotKey: "brandPointsTemplateContent", label: "品牌要点组件" },
  "服务承诺": { nodeType: "ServicePromisesTemplate", slotKey: "servicePromisesTemplateContent", label: "服务承诺组件" },
  "资质证书": { nodeType: "CertificatesTemplate", slotKey: "certificatesTemplateContent", label: "资质证书组件" },
  "门店信息": { nodeType: "StoreInfoTemplate", slotKey: "storeInfoTemplateContent", label: "门店信息组件" },
  "真实评价与实拍": { nodeType: "TestimonialsTemplate", slotKey: "testimonialsTemplateContent", label: "评价实拍组件" },
  "限时活动": { nodeType: "LimitedEventTemplate", slotKey: "limitedEventTemplateContent", label: "限时活动组件" },
  "工艺细节": { nodeType: "CraftDetailsTemplate", slotKey: "craftDetailsTemplateContent", label: "工艺细节组件" },
} as const satisfies Record<string, {
  nodeType: DynamicTemplateNodeType;
  slotKey: string;
  label: string;
}>;

function removeLegacyNumericProductReferences(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeLegacyNumericProductReferences);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/productIds?$/i.test(key))
      .map(([key, nested]) => [key, removeLegacyNumericProductReferences(nested)]),
  );
}

function pickMatureTemplateContent(
  moduleType: keyof typeof MATURE_TEMPLATE_NODE_BY_MODULE,
  contractKey: RegisteredContentTemplateKey,
  defaults: Record<string, unknown>,
) {
  const neutralPreview = getTemplatePreviewContent(contractKey);
  return sanitizeContentTemplateDefaultContent(
    moduleType,
    removeLegacyNumericProductReferences({
      ...neutralPreview,
      ...defaults,
    }),
  ) ?? {};
}

function pickMatureTemplateDesignProps(
  contractKey: RegisteredContentTemplateKey,
  defaults: Record<string, unknown>,
) {
  return sanitizeMatureContentTemplateDesignProps({
    ...getTemplatePreviewContent(contractKey),
    ...defaults,
  }) ?? {};
}

function pickLegacyComplexContent(
  moduleType: keyof typeof COMPLEX_TEMPLATE_NODE_BY_MODULE,
  contractKey: RegisteredContentTemplateKey,
  defaults: Record<string, unknown>,
) {
  const allowedKeys = {
    "轮播图": ["images", "autoPlay", "interval", "showDots", "showArrows", "desktopRatio", "mobileRatio"],
    "热区图": ["image", "mobileImage", "altText", "hotspots", "mobileHotspots"],
    "改款对比": [
      "title", "subtitle", "beforeImage", "afterImage", "beforeLabel", "afterLabel",
      "beforeAltText", "afterAltText", "beforeFocusX", "beforeFocusY", "afterFocusX", "afterFocusY",
      "actionText", "targetType", "pagePath", "url", "productCode", "categorySlug",
      "linkUrl", "aspectRatio", "bgColor",
    ],
    "预约入口": [
      "backgroundImage", "title", "subtitle", "buttonText", "targetType", "pagePath", "url",
      "productCode", "categorySlug", "linkUrl", "altText", "desktopFocusX",
      "desktopFocusY", "mobileFocusX", "mobileFocusY", "tone", "bgColor",
    ],
    "单品焦点推荐": [
      "eyebrow", "title", "summary", "productCode", "primaryText", "secondaryText",
      "secondaryTargetType", "secondaryProductCode", "secondaryCategorySlug", "secondaryLinkUrl",
      "layout", "showPrice", "bgColor", "imageRatio",
    ],
    "产品展示行": [
      "title", "subtitle", "productCodes", "layout", "mobileColumns", "displayMode",
      "actionStyle", "bgColor", "showPrice", "showButton", "buttonText", "imageRatio",
    ],
    "分类卡片": [
      "title", "subtitle", "categorySlugs", "layout", "bgColor", "imageRatio",
    ],
  }[moduleType];
  const source = removeLegacyNumericProductReferences({
    ...getTemplatePreviewContent(contractKey),
    ...defaults,
  }) as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (source[key] !== undefined) result[key] = structuredClone(source[key]);
  }
  if (moduleType === "轮播图" && !Array.isArray(result.images)) result.images = [];
  if (moduleType === "热区图") {
    if (!Array.isArray(result.hotspots)) result.hotspots = [];
    if (!Array.isArray(result.mobileHotspots)) result.mobileHotspots = [];
  }
  if (moduleType === "产品展示行" && !Array.isArray(result.productCodes)) result.productCodes = [];
  if (moduleType === "分类卡片" && !Array.isArray(result.categorySlugs)) result.categorySlugs = [];
  if (moduleType === "单品焦点推荐"
    && result.secondaryTargetType === "product"
    && (typeof result.secondaryProductCode !== "string" || !result.secondaryProductCode.trim())) {
    result.secondaryTargetType = "none";
  }
  if (["改款对比", "预约入口"].includes(moduleType)
    && result.targetType === "product"
    && (typeof result.productCode !== "string" || !result.productCode.trim())) {
    result.targetType = "none";
  }
  return result;
}

function configureSlot(
  definition: TemplateDefinitionV2,
  slotId: string,
  input: {
    key: string;
    label: string;
    required: boolean;
    hideable: boolean;
    maxLength?: number;
    defaultValue?: unknown;
    desktopRatio?: string;
    mobileRatio?: string;
  },
) {
  const slot = definition.slots[slotId];
  slot.key = stableKey(input.key, slotId);
  slot.label = input.label.slice(0, 100);
  slot.required = input.required;
  slot.editable = true;
  slot.hideable = input.required ? false : input.hideable;
  if (input.maxLength) slot.validation.maxLength = input.maxLength;
  const desktopRatio = ratioLabel(input.desktopRatio);
  const mobileRatio = ratioLabel(input.mobileRatio);
  if (desktopRatio) slot.desktopRules.aspectRatio = desktopRatio;
  if (mobileRatio) slot.mobileRules.aspectRatio = mobileRatio;
  if (input.defaultValue !== undefined) {
    definition.previewContent ??= {};
    definition.previewContent[slotId] = structuredClone(input.defaultValue);
  }
}

function addSlot(
  definition: TemplateDefinitionV2,
  parentId: string,
  type: DynamicTemplateNodeType,
  label: string,
) {
  const added = addDynamicTemplateNode(definition, parentId, type);
  if (!added.slotId) throw new Error(`${type} 没有生成槽位身份`);
  added.definition.nodes[added.nodeId].name = label.slice(0, 100);
  return added;
}

export function adaptLegacyTemplateSource(
  source: LegacyTemplateSourceDraft,
): LegacyTemplateAdaptationReport {
  const contract = getContentTemplateContract(source.moduleType);
  if (!contract) throw new Error("母模板合同不存在，不能安全载入");
  const defaults = source.contentDefaults ?? {};
  const definition = createBlankDynamicTemplateDefinition(source.name);
  definition.templateId = createDynamicTemplateStableId("tpl");
  definition.name = source.name.slice(0, 100);
  definition.description = `从母模板“${source.name}”载入统一设计草稿；既有模板记录和页面引用保持不变。`;
  definition.metadata = {
    ...definition.metadata,
    category: contract.commercialPurpose,
    purpose: contract.commercialPurpose,
    layoutType: `${contract.displayName} 响应式构图`,
    recommendedFor: PAGE_KEYS.filter((pageKey) =>
      isContentTemplateAllowedForPage(pageKey, source.moduleType)),
    desktopRatio: "auto",
    mobileRatio: "auto",
    visualRole: contract.visualRole,
    headerCompatibility: contract.key === "hero"
      ? ["solid", "overlay-light"]
      : ["solid"],
    tags: [...new Set([...definition.metadata.tags, contract.key])].slice(0, 20),
  };
  const container = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
  let next = container.definition;
  next.nodes[container.nodeId].name = "响应式内容容器";
  for (const device of ["desktop", "mobile"] as const) {
    next.nodes[container.nodeId].responsive[device] = {
      display: "flex",
      direction: "column",
      order: 0,
      width: "fill",
      height: { mode: "auto" },
      gap: { value: device === "desktop" ? 1.5 : 1, unit: "rem" },
    };
  }

  const roleById = new Map(contract.roles.map((role) => [role.id, role]));
  const mappedSlotLabels: string[] = [];
  const skippedItems: string[] = [];
  const usedFields = new Set<string>();
  const requiredText = new Set(contract.contentBudget.requiredText);
  const addConfiguredSlot = (
    object: ContentTemplateEditableObject,
    type: DynamicTemplateNodeType,
    field: string,
    label: string,
    defaultValue?: unknown,
  ) => {
    const added = addSlot(next, container.nodeId, type, label);
    next = added.definition;
    const role = roleById.get(object.roleId);
    configureSlot(next, added.slotId!, {
      key: field,
      label,
      required: Boolean(role?.required || requiredText.has(field)),
      hideable: object.constraints.allowHide,
      maxLength: contract.contentBudget.limits[field],
      defaultValue,
      desktopRatio: role?.defaultRatioByViewport?.desktop,
      mobileRatio: role?.defaultRatioByViewport?.mobile,
    });
    mappedSlotLabels.push(label);
    usedFields.add(field);
  };

  const complexConfig = source.moduleType in COMPLEX_TEMPLATE_NODE_BY_MODULE
    ? COMPLEX_TEMPLATE_NODE_BY_MODULE[source.moduleType as keyof typeof COMPLEX_TEMPLATE_NODE_BY_MODULE]
    : undefined;
  const matureConfig = source.moduleType in MATURE_TEMPLATE_NODE_BY_MODULE
    ? MATURE_TEMPLATE_NODE_BY_MODULE[source.moduleType as keyof typeof MATURE_TEMPLATE_NODE_BY_MODULE]
    : undefined;
  if (matureConfig) {
    const representativeObject = contract.editorCapabilities.editableObjects[0];
    if (!representativeObject) throw new Error("来源母模板缺少可编辑对象合同，不能安全载入");
    const added = addSlot(next, container.nodeId, matureConfig.nodeType, matureConfig.label);
    next = added.definition;
    next.nodes[added.nodeId].props.contentTemplateLayoutData = structuredClone(source.layoutData);
    const designProps = pickMatureTemplateDesignProps(contract.key, defaults);
    if (Object.keys(designProps).length > 0) {
      next.nodes[added.nodeId].props.contentTemplateDesignProps = designProps;
    }
    configureSlot(next, added.slotId!, {
      key: matureConfig.slotKey,
      label: matureConfig.label,
      required: false,
      hideable: representativeObject.constraints.allowHide,
      defaultValue: pickMatureTemplateContent(
        source.moduleType as keyof typeof MATURE_TEMPLATE_NODE_BY_MODULE,
        contract.key,
        defaults,
      ),
    });
    mappedSlotLabels.push(matureConfig.label);
  } else if (complexConfig) {
    const representativeObject = contract.editorCapabilities.editableObjects[0];
    if (!representativeObject) throw new Error("来源母模板缺少可编辑对象合同，不能安全载入");
    addConfiguredSlot(
      representativeObject,
      complexConfig.nodeType,
      complexConfig.slotKey,
      complexConfig.label,
      pickLegacyComplexContent(
        source.moduleType as keyof typeof COMPLEX_TEMPLATE_NODE_BY_MODULE,
        contract.key,
        defaults,
      ),
    );
    if (source.moduleType === "单品焦点推荐") {
      if (!isNonEmptyString(defaults.productCode) && Number(defaults.productId) > 0) {
        skippedItems.push("主推商品：来源中的数字商品 ID 不会写入母模板；请在页面实例中按商品编码重新选择。");
      }
      if (!isNonEmptyString(defaults.secondaryProductCode) && Number(defaults.secondaryProductId) > 0) {
        skippedItems.push("次行动商品：来源中的数字商品 ID 不会写入母模板；请按商品编码重新选择行动去向。");
      }
    }
    if (source.moduleType === "产品展示行"
      && (!Array.isArray(defaults.productCodes) || defaults.productCodes.length === 0)
      && Array.isArray(defaults.productIds) && defaults.productIds.length > 0) {
      skippedItems.push("商品集合：来源中的数字商品 ID 列表不会写入母模板；请在页面实例中按商品编码重新选择。");
    }
    if (source.moduleType === "分类卡片"
      && (!Array.isArray(defaults.categorySlugs) || defaults.categorySlugs.length === 0)
      && Array.isArray(defaults.categories) && defaults.categories.length > 0) {
      skippedItems.push("分类集合：来源卡片快照不会复制为真实分类引用；请在页面实例中按分类 slug 重新选择。");
    }
    if (["改款对比", "预约入口"].includes(source.moduleType)
      && defaults.targetType === "product"
      && !isNonEmptyString(defaults.productCode)
      && Number(defaults.productId) > 0) {
      skippedItems.push("行动去向：来源中的数字商品 ID 不会写入母模板；请按商品编码重新选择。");
    }
  } else for (const object of contract.editorCapabilities.editableObjects) {
    const role = roleById.get(object.roleId);
    if (role?.fallbackRoleId) {
      skippedItems.push(`${object.roleId}：来源模板的设备专属备用素材未复制为第二份内容；请在共享槽位中重新确认裁切。`);
      continue;
    }
    if (object.kind === "video") {
      addConfiguredSlot(
        object,
        "Video",
        "videoContent",
        role?.id ?? "品牌影片",
        defaultVideoContent({
          ...getTemplatePreviewContent(contract.key),
          ...defaults,
        }),
      );
      contract.editorCapabilities.editableObjects
        .flatMap((editableObject) => editableObject.contentFieldKeys)
        .forEach((field) => usedFields.add(field));
      if (defaults.targetType === "product"
        && !isNonEmptyString(defaults.productCode)
        && Number(defaults.productId) > 0) {
        skippedItems.push("视频行动去向：来源中的数字商品 ID 不会写入母模板；请按商品编码重新选择。");
      }
      continue;
    }
    if (object.kind === "media") {
      const mediaField = (object.mediaFieldKeys ?? object.contentFieldKeys)
        .find((field) => field !== object.altFieldKey && !usedFields.has(field));
      if (!mediaField) continue;
      const src = typeof defaults[mediaField] === "string" ? defaults[mediaField] : "";
      const alt = object.altFieldKey && typeof defaults[object.altFieldKey] === "string"
        ? defaults[object.altFieldKey]
        : "";
      addConfiguredSlot(object, "ImageSlot", mediaField, role?.id ?? mediaField, { src, alt });
      continue;
    }
    if (object.kind === "text") {
      for (const field of object.contentFieldKeys) {
        if (usedFields.has(field)) continue;
        const value = typeof defaults[field] === "string" ? defaults[field] : "";
        addConfiguredSlot(object, textNodeType(field), field, field, value);
      }
      continue;
    }
    if (object.kind === "action") {
      const field = object.contentFieldKeys.find((candidate) => /(?:action|button|link).*text/i.test(candidate))
        ?? `${object.roleId}Action`;
      if (!usedFields.has(field)) {
        addConfiguredSlot(object, "ButtonSlot", field, object.roleId, defaultActionContent(defaults, object.contentFieldKeys));
      }
      continue;
    }
    if (object.kind === "product") {
      const field = object.referenceFieldKey ?? object.contentFieldKeys[0] ?? `${object.roleId}Product`;
      if (!usedFields.has(field)) addConfiguredSlot(object, "ProductSlot", field, object.roleId, defaults[field] ?? "");
      continue;
    }
    if (object.kind === "collection") {
      const field = object.referenceFieldKey ?? object.collectionFieldKeys?.[0] ?? object.contentFieldKeys[0] ?? `${object.roleId}Collection`;
      if (!usedFields.has(field)) {
        const value = Array.isArray(defaults[field])
          ? defaults[field].filter((item): item is string => typeof item === "string")
          : [];
        addConfiguredSlot(object, "CollectionSlot", field, object.roleId, value);
      }
    }
  }

  next.metadata.slotSummary = `${mappedSlotLabels.length} 个已映射槽位`;
  const validation = validateDynamicTemplateDefinition(next);
  if (!validation.valid || !validation.definition) {
    throw new Error(validation.issues.find((issue) => issue.level === "error")?.message ?? "兼容来源适配结果未通过模板结构校验");
  }
  const sourceReference = source.sourceType === "personal" && source.personalTemplateId
    ? `legacy_personal_${source.personalTemplateId}`
    : `legacy_system_${source.contractKey}`;
  const risks = [
    ...(matureConfig
      ? ["成熟模板的内部构图与响应式规则作为母模板节点锁定保留；页面实例只能修改合同授权的内容和节点外层几何。"]
      : ["来源模板的自由构图坐标、层级、缩放和焦点不会直接复制；载入结果使用安全的响应式纵向起点。"]),
    "兼容来源仍由原合同与 Renderer 重放；载入不会改写来源记录、已有页面或当前页面草稿。",
    "保存和发布前，应分别检查桌面端、移动端、空内容、超长文字和缺图状态。",
    ...(skippedItems.length > 0 ? ["存在未自动映射对象，必须人工补齐后才能把母模板投入页面。"] : []),
  ];
  return {
    sourceLabel: `${contract.displayName} · ${source.name}`,
    sourceReference,
    mappedSlotLabels,
    skippedItems,
    risks,
    draft: {
      format: "dynamic",
      sourceType: "local",
      localDraftId: validation.definition.templateId,
      sourceReference,
      versionNote: `从母模板 ${source.contractKey} v${source.contractVersion} 建立设计草稿`,
      definition: validation.definition,
    },
  };
}
