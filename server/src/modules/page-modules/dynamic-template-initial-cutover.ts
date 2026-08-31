import { createHash } from "node:crypto";
import {
  CONTENT_TEMPLATE_REGISTRY,
  sanitizeContentTemplateDefaultContent,
} from "./generated/contentTemplates.generated";
import {
  isMatureContentTemplateSlotType,
  MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE,
  sanitizeMatureContentTemplateDesignProps,
} from "./generated/validateTemplateDefinition.generated";
import type {
  DynamicTemplateSlotDefinition,
  TemplateDefinitionV2,
} from "./generated/templateDefinition.generated";
import {
  DYNAMIC_TEMPLATE_INSTANCE_SCHEMA_VERSION,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  validateDynamicTemplateInstance,
} from "./dynamic-template-instance";
import type {
  DynamicTemplateActivationDocumentSnapshot,
  DynamicTemplateActivationSchemeSnapshot,
} from "./dynamic-template-activation";

const DYNAMIC_TEMPLATE_BLOCK_TYPE = "动态模板实例";

type JsonRecord = Record<string, unknown>;

export const INITIAL_CUTOVER_REQUIRED_SOURCE_REFERENCES = CONTENT_TEMPLATE_REGISTRY.map(
  (template) => `legacy_system_${template.key}`,
);

const SOURCE_REFERENCE_BY_MODULE_TYPE = new Map<string, string>(
  CONTENT_TEMPLATE_REGISTRY.map((template) => [
    template.moduleType,
    `legacy_system_${template.key}`,
  ]),
);

export interface InitialTemplateV2CutoverReplacement {
  sourceReference: string;
  templateId: string;
  targetVersion: number;
  definitionChecksum: string;
  definition: TemplateDefinitionV2;
}

export interface InitialTemplateV2CutoverOccurrence {
  source: "draft" | "published" | "scheme";
  path: string;
  legacyModuleType: string;
  sourceReference: string;
  templateId: string;
  targetVersion: number;
  instanceId: string;
}

export interface InitialTemplateV2CutoverDocumentPlan {
  documentId: number;
  pageKey: string;
  hadUnpublishedDraft: boolean;
  nextDocumentStatus: "DRAFT" | "PUBLISHED";
  occurrences: InitialTemplateV2CutoverOccurrence[];
  convertedDraftPuckData: unknown;
  convertedPublishedPuckData: unknown | null;
}

export interface InitialTemplateV2CutoverSchemePlan {
  schemeId: number;
  pageKey: string;
  occurrences: InitialTemplateV2CutoverOccurrence[];
  convertedPuckData: unknown;
}

export interface InitialTemplateV2CutoverImpact {
  impactHash: string;
  requiredReplacementCount: number;
  readyReplacementCount: number;
  affectedDocumentCount: number;
  affectedDraftInstanceCount: number;
  affectedPublishedInstanceCount: number;
  preservedDraftDocumentCount: number;
  affectedSchemeCount: number;
  affectedSchemeInstanceCount: number;
  blockers: string[];
  warnings: string[];
  documents: InitialTemplateV2CutoverDocumentPlan[];
  schemes: InitialTemplateV2CutoverSchemePlan[];
}

export interface PlanInitialTemplateV2CutoverInput {
  replacements: InitialTemplateV2CutoverReplacement[];
  documents: DynamicTemplateActivationDocumentSnapshot[];
  schemes?: DynamicTemplateActivationSchemeSnapshot[];
  initialBlockers?: string[];
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return String(value);
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function collectBlockArrays(puckData: unknown): Array<{ path: string; blocks: unknown[] }> {
  if (!isRecord(puckData)) return [];
  const arrays: Array<{ path: string; blocks: unknown[] }> = [];
  if (Array.isArray(puckData.content)) arrays.push({ path: "content", blocks: puckData.content });
  if (isRecord(puckData.zones)) {
    for (const zoneKey of Object.keys(puckData.zones).sort()) {
      const blocks = puckData.zones[zoneKey];
      if (Array.isArray(blocks)) arrays.push({ path: `zones.${zoneKey}`, blocks });
    }
  }
  return arrays;
}

function withoutLegacyEnvelope(props: JsonRecord) {
  return Object.fromEntries(
    Object.entries(props)
      .filter(([key]) => ![
        "id",
        "instanceId",
        "instanceSchemaVersion",
        "moduleName",
        "isVisible",
        "__instanceOverrides",
        "__templateOrigin",
        "__contentTemplate",
      ].includes(key))
      .map(([key, value]) => [key, cloneJson(value)]),
  );
}

function firstString(source: JsonRecord, keys: string[]) {
  for (const key of keys) {
    if (typeof source[key] === "string") return source[key];
  }
  return undefined;
}

const OBJECT_SLOT_KEYS: Partial<Record<DynamicTemplateSlotDefinition["type"], readonly string[]>> = {
  video: [
    "videoUrl", "posterUrl", "videoDescription", "title", "subtitle", "actionText",
    "targetType", "pagePath", "url", "productCode", "categorySlug", "linkUrl",
    "autoPlay", "loop", "muted", "showControls", "aspectRatio", "videoWidth",
    "focusX", "focusY", "maxHeight", "bgColor",
  ],
  carousel: ["images", "autoPlay", "interval", "showDots", "showArrows", "desktopRatio", "mobileRatio"],
  hotspot: ["image", "mobileImage", "altText", "hotspots", "mobileHotspots"],
  beforeAfter: [
    "title", "subtitle", "beforeImage", "afterImage", "beforeLabel", "afterLabel",
    "beforeAltText", "afterAltText", "actionText", "targetType", "pagePath", "url",
    "productCode", "categorySlug", "linkUrl", "beforeFocusX", "beforeFocusY",
    "afterFocusX", "afterFocusY", "aspectRatio", "bgColor",
  ],
  appointment: [
    "backgroundImage", "title", "subtitle", "buttonText", "targetType", "pagePath", "url",
    "productCode", "categorySlug", "linkUrl", "altText", "desktopFocusX", "desktopFocusY",
    "mobileFocusX", "mobileFocusY", "tone", "bgColor",
  ],
  productCard: [
    "eyebrow", "title", "summary", "productCode", "primaryText", "secondaryText",
    "secondaryTargetType", "secondaryProductCode", "secondaryCategorySlug", "secondaryLinkUrl",
    "layout", "showPrice", "bgColor", "imageRatio",
  ],
  productCollection: [
    "title", "subtitle", "productCodes", "layout", "mobileColumns", "displayMode",
    "actionStyle", "bgColor", "showPrice", "showButton", "buttonText", "imageRatio",
  ],
  categoryCollection: ["title", "subtitle", "categorySlugs", "layout", "bgColor", "imageRatio"],
};

function legacyContentForSlot(slot: DynamicTemplateSlotDefinition, props: JsonRecord): {
  value: unknown;
  unmappedKeys: string[];
  designKeys: string[];
} {
  const businessProps = withoutLegacyEnvelope(props);
  const direct = businessProps[slot.key];
  if (["heading", "text", "richText", "badge", "icon"].includes(slot.type)) {
    return { value: typeof direct === "string" ? direct : "", unmappedKeys: [], designKeys: [] };
  }
  if (slot.type === "image") {
    if (isRecord(direct)) return { value: direct, unmappedKeys: [], designKeys: [] };
    return {
      value: {
        src: typeof direct === "string" ? direct : "",
        alt: firstString(businessProps, [`${slot.key}Alt`, "altText", "imageAlt"]) ?? "",
      },
      unmappedKeys: [],
      designKeys: [],
    };
  }
  if (slot.type === "button" || slot.type === "link") {
    if (isRecord(direct)) return { value: direct, unmappedKeys: [], designKeys: [] };
    const targetType = firstString(businessProps, ["targetType"]) ?? "none";
    return {
      value: {
        label: typeof direct === "string"
          ? direct
          : firstString(businessProps, ["actionText", "buttonText", "linkText"]) ?? "",
        targetType,
        ...(targetType === "page" ? { pagePath: firstString(businessProps, ["pagePath", "linkUrl"]) ?? "" } : {}),
        ...(targetType === "external" ? { url: firstString(businessProps, ["url", "linkUrl"]) ?? "" } : {}),
        ...(targetType === "product" ? { productCode: firstString(businessProps, ["productCode"]) ?? "" } : {}),
        ...(targetType === "category" ? { categorySlug: firstString(businessProps, ["categorySlug"]) ?? "" } : {}),
      },
      unmappedKeys: [],
      designKeys: [],
    };
  }
  if (slot.type === "product") {
    return {
      value: typeof direct === "string" ? direct : firstString(businessProps, ["productCode"]) ?? "",
      unmappedKeys: [],
      designKeys: [],
    };
  }
  if (slot.type === "collection") {
    return {
      value: Array.isArray(direct)
        ? direct
        : Array.isArray(businessProps.productCodes) ? businessProps.productCodes : [],
      unmappedKeys: [],
      designKeys: [],
    };
  }
  if (isMatureContentTemplateSlotType(slot.type)) {
    const moduleType = MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE[slot.type];
    const content = sanitizeContentTemplateDefaultContent(moduleType, businessProps) ?? {};
    const design = sanitizeMatureContentTemplateDesignProps(businessProps) ?? {};
    const mappedKeys = new Set([...Object.keys(content), ...Object.keys(design)]);
    return {
      value: content,
      unmappedKeys: Object.keys(businessProps).filter((key) => !mappedKeys.has(key)),
      designKeys: Object.keys(design),
    };
  }
  const allowedKeys = OBJECT_SLOT_KEYS[slot.type];
  if (allowedKeys) {
    const allowed = new Set(allowedKeys);
    return {
      value: Object.fromEntries(Object.entries(businessProps).filter(([key]) => allowed.has(key))),
      unmappedKeys: Object.keys(businessProps).filter((key) => !allowed.has(key)),
      designKeys: [],
    };
  }
  // 现有 24 个成熟/复杂模板各自使用一个对象槽位；完整业务 props 是该槽位的页面内容。
  return { value: businessProps, unmappedKeys: [], designKeys: [] };
}

function planSnapshot(input: {
  source: InitialTemplateV2CutoverOccurrence["source"];
  contextKey: string;
  contextLabel: string;
  puckData: unknown;
  replacementsBySource: Map<string, InitialTemplateV2CutoverReplacement>;
  blockers: string[];
  warnings: string[];
}) {
  const converted = cloneJson(input.puckData);
  if (isRecord(converted)) delete converted[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY];
  const occurrences: InitialTemplateV2CutoverOccurrence[] = [];
  for (const blockArray of collectBlockArrays(converted)) {
    blockArray.blocks.forEach((rawBlock, index) => {
      if (!isRecord(rawBlock) || typeof rawBlock.type !== "string" || !isRecord(rawBlock.props)) return;
      const legacyModuleType = rawBlock.type;
      const sourceReference = SOURCE_REFERENCE_BY_MODULE_TYPE.get(legacyModuleType);
      if (!sourceReference) return;
      const path = `${blockArray.path}[${index}]`;
      const prefix = `${input.contextLabel} ${path}`;
      const replacement = input.replacementsBySource.get(sourceReference);
      if (!replacement) {
        input.blockers.push(`${prefix} 缺少 ${sourceReference} 的统一 V2 替代模板`);
        return;
      }
      const slots = Object.values(replacement.definition.slots);
      if (slots.length !== 1) {
        input.blockers.push(`${prefix} 的首次转换要求替代模板包含且仅包含一个兼容业务槽位，实际为 ${slots.length} 个`);
        return;
      }
      const slot = slots[0];
      const instanceId = `instance_${hashJson({
        contextKey: input.contextKey,
        path,
        sourceReference,
      }).slice(0, 40)}`;
      const migratedContent = legacyContentForSlot(slot, rawBlock.props);
      const numericReferenceKeys = migratedContent.unmappedKeys.filter((key) => /productIds?$/i.test(key));
      if (numericReferenceKeys.length > 0) {
        input.blockers.push(`${prefix} 仍含不能无损转换的数字商品引用：${numericReferenceKeys.join("、")}`);
      }
      const otherUnmappedKeys = migratedContent.unmappedKeys.filter((key) => !numericReferenceKeys.includes(key));
      if (otherUnmappedKeys.length > 0) {
        input.warnings.push(`${prefix} 的旧字段不进入页面实例：${otherUnmappedKeys.join("、")}`);
      }
      if (migratedContent.designKeys.length > 0) {
        input.warnings.push(`${prefix} 的设计字段由正式母模板接管：${migratedContent.designKeys.join("、")}`);
      }
      const nextProps = {
        id: instanceId,
        instanceSchemaVersion: DYNAMIC_TEMPLATE_INSTANCE_SCHEMA_VERSION,
        instanceId,
        templateId: replacement.templateId,
        templateVersion: replacement.targetVersion,
        moduleName: replacement.definition.name,
        contentBySlotId: {
          [slot.slotId]: migratedContent.value,
        },
        layoutOverridesByNodeId: {},
        hiddenSlotIds: [],
        isVisible: rawBlock.props.isVisible !== false,
      };
      const validation = validateDynamicTemplateInstance(nextProps, replacement.definition);
      for (const issue of validation.issues) {
        input.blockers.push(`${prefix}${issue.pathSuffix}：${issue.message}`);
      }
      if (rawBlock.props.__instanceOverrides !== undefined) {
        input.warnings.push(`${prefix} 的旧实例构图覆盖不会进入 V2 页面覆盖；切换后采用已确认的母模板构图`);
      }
      rawBlock.type = DYNAMIC_TEMPLATE_BLOCK_TYPE;
      rawBlock.props = nextProps;
      occurrences.push({
        source: input.source,
        path,
        legacyModuleType,
        sourceReference,
        templateId: replacement.templateId,
        targetVersion: replacement.targetVersion,
        instanceId,
      });
    });
  }
  return { puckData: converted, occurrences };
}

export function planInitialTemplateV2Cutover(
  input: PlanInitialTemplateV2CutoverInput,
): InitialTemplateV2CutoverImpact {
  const blockers = [...(input.initialBlockers ?? [])];
  const warnings: string[] = [];
  const replacementGroups = new Map<string, InitialTemplateV2CutoverReplacement[]>();
  for (const replacement of input.replacements) {
    const group = replacementGroups.get(replacement.sourceReference) ?? [];
    group.push(replacement);
    replacementGroups.set(replacement.sourceReference, group);
  }
  const replacementsBySource = new Map<string, InitialTemplateV2CutoverReplacement>();
  for (const sourceReference of INITIAL_CUTOVER_REQUIRED_SOURCE_REFERENCES) {
    const candidates = replacementGroups.get(sourceReference) ?? [];
    if (candidates.length === 0) {
      blockers.push(`缺少系统替代模板 ${sourceReference}`);
      continue;
    }
    if (candidates.length > 1) {
      blockers.push(`系统替代模板 ${sourceReference} 存在 ${candidates.length} 个活动候选`);
      continue;
    }
    const candidate = candidates[0];
    if (candidate.definition.templateId !== candidate.templateId) {
      blockers.push(`${sourceReference} 的 templateId 与定义不一致`);
      continue;
    }
    if (!Number.isInteger(candidate.targetVersion) || candidate.targetVersion <= 0) {
      blockers.push(`${sourceReference} 的目标版本无效`);
      continue;
    }
    if (!/^[a-f0-9]{64}$/i.test(candidate.definitionChecksum)) {
      blockers.push(`${sourceReference} 的定义校验和无效`);
      continue;
    }
    replacementsBySource.set(sourceReference, candidate);
  }

  const documents: InitialTemplateV2CutoverDocumentPlan[] = input.documents.map((document) => {
    const draft = planSnapshot({
      source: "draft",
      contextKey: `document:${document.documentId}:draft`,
      contextLabel: `页面 ${document.pageKey} 草稿`,
      puckData: document.draftPuckData,
      replacementsBySource,
      blockers,
      warnings,
    });
    const published = document.latestPublishedRevision
      ? planSnapshot({
          source: "published",
          contextKey: `document:${document.documentId}:published:${document.latestPublishedRevision.id}`,
          contextLabel: `页面 ${document.pageKey} 正式版本 v${document.latestPublishedRevision.version}`,
          puckData: document.latestPublishedRevision.puckData,
          replacementsBySource,
          blockers,
          warnings,
        })
      : null;
    const hadUnpublishedDraft = document.status === "DRAFT"
      || !published
      || hashJson(document.draftPuckData) !== hashJson(document.latestPublishedRevision?.puckData)
      || hashJson(document.draftMetadata ?? {}) !== hashJson(document.latestPublishedRevision?.metadata ?? {});
    return {
      documentId: document.documentId,
      pageKey: document.pageKey,
      hadUnpublishedDraft,
      nextDocumentStatus: hadUnpublishedDraft ? "DRAFT" : "PUBLISHED",
      occurrences: [...draft.occurrences, ...(published?.occurrences ?? [])],
      convertedDraftPuckData: draft.puckData,
      convertedPublishedPuckData: published?.puckData ?? null,
    };
  });
  const schemes: InitialTemplateV2CutoverSchemePlan[] = (input.schemes ?? []).map((scheme) => {
    const converted = planSnapshot({
      source: "scheme",
      contextKey: `scheme:${scheme.schemeId}`,
      contextLabel: `页面方案 ${scheme.schemeId}`,
      puckData: scheme.puckData,
      replacementsBySource,
      blockers,
      warnings,
    });
    return {
      schemeId: scheme.schemeId,
      pageKey: scheme.pageKey,
      occurrences: converted.occurrences,
      convertedPuckData: converted.puckData,
    };
  });
  const affectedDraftInstanceCount = documents.reduce(
    (sum, document) => sum + document.occurrences.filter((item) => item.source === "draft").length,
    0,
  );
  const affectedPublishedInstanceCount = documents.reduce(
    (sum, document) => sum + document.occurrences.filter((item) => item.source === "published").length,
    0,
  );
  const affectedSchemeInstanceCount = schemes.reduce(
    (sum, scheme) => sum + scheme.occurrences.length,
    0,
  );
  const uniqueBlockers = [...new Set(blockers)];
  const uniqueWarnings = [...new Set(warnings)];
  const impactState = {
    replacements: [...replacementsBySource.values()]
      .map((item) => ({
        sourceReference: item.sourceReference,
        templateId: item.templateId,
        targetVersion: item.targetVersion,
        definitionChecksum: item.definitionChecksum,
      }))
      .sort((left, right) => left.sourceReference.localeCompare(right.sourceReference)),
    documents: documents.map((document) => ({
      documentId: document.documentId,
      nextDocumentStatus: document.nextDocumentStatus,
      draftHash: hashJson(document.convertedDraftPuckData),
      publishedHash: document.convertedPublishedPuckData === null
        ? null
        : hashJson(document.convertedPublishedPuckData),
      occurrences: document.occurrences,
    })),
    schemes: schemes.map((scheme) => ({
      schemeId: scheme.schemeId,
      contentHash: hashJson(scheme.convertedPuckData),
      occurrences: scheme.occurrences,
    })),
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
  };
  return {
    impactHash: hashJson(impactState),
    requiredReplacementCount: INITIAL_CUTOVER_REQUIRED_SOURCE_REFERENCES.length,
    readyReplacementCount: replacementsBySource.size,
    affectedDocumentCount: documents.filter((document) => document.occurrences.length > 0).length,
    affectedDraftInstanceCount,
    affectedPublishedInstanceCount,
    preservedDraftDocumentCount: documents.filter((document) => document.hadUnpublishedDraft).length,
    affectedSchemeCount: schemes.filter((scheme) => scheme.occurrences.length > 0).length,
    affectedSchemeInstanceCount,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    documents,
    schemes,
  };
}
