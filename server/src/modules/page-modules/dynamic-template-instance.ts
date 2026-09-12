import {
  isMatureContentTemplateSlotType,
  MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE,
  validateDynamicTemplateSlotContent,
  validateDynamicTemplateDefinition,
} from "./generated/validateTemplateDefinition.generated";
import {
  getContentTemplateCompletion,
  sanitizeContentTemplateDefaultContent,
  type ContentTemplateMediaReference,
} from "./generated/contentTemplates.generated";
import type {
  DynamicTemplateSlotDefinition,
  TemplateBreakpoint,
  TemplateDefinitionV2,
} from "./generated/templateDefinition.generated";
import { resolveTemplateNodeRules } from "./generated/templateResponsive.generated";
export type { TemplateInstanceV2 } from "./generated/templateDefinition.generated";

export const DYNAMIC_TEMPLATE_BLOCK_TYPE = "动态模板实例";
export const DYNAMIC_TEMPLATE_INSTANCE_SCHEMA_VERSION = 1;
export const TEMPLATE_INSTANCE_MODEL_VERSION = 2 as const;
export const DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY = "resolvedDynamicTemplates";

const STABLE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;

export interface DynamicTemplateInstanceReference {
  templateId: string;
  templateVersion: number;
  instanceId?: string;
}

export interface DynamicTemplateInstanceIssue {
  message: string;
  field?: string;
  pathSuffix: string;
  index?: number;
}

export interface DynamicTemplateAssetReference {
  slotId: string;
  url: string;
}

export interface DynamicTemplateBusinessReference {
  slotId: string;
  value: string;
  index?: number;
}

export interface DynamicTemplateActionReference {
  slotId: string;
  targetType: "page" | "external" | "product" | "category";
  value: string;
  index?: number;
}

export interface DynamicTemplateInstanceValidation {
  definition?: TemplateDefinitionV2;
  issues: DynamicTemplateInstanceIssue[];
  assets: DynamicTemplateAssetReference[];
  productCodes: DynamicTemplateBusinessReference[];
  categorySlugs: DynamicTemplateBusinessReference[];
  actions: DynamicTemplateActionReference[];
}

function getPubliclyReachableDynamicTemplateSlotIds(
  definition: TemplateDefinitionV2,
  hiddenSlotIds: ReadonlySet<string>,
  contentBySlotId: Record<string, unknown>,
  onBackground?: (nodeId: string, url: string) => void,
) {
  const visibleSlotIds = new Set<string>();
  const visitedStates = new Set<string>();
  const visit = (
    nodeId: string,
    breakpoint: TemplateBreakpoint,
    ancestorIds: ReadonlySet<string>,
  ) => {
    if (ancestorIds.has(nodeId)) return;
    const node = definition.nodes[nodeId];
    if (!node) return;
    const rules = resolveTemplateNodeRules(definition, nodeId, breakpoint);
    if (node.hidden || rules.hidden || rules.display === "none") return;
    if (node.slotId && hiddenSlotIds.has(node.slotId)) return;
    const stateKey = `${nodeId}:${breakpoint}`;
    if (visitedStates.has(stateKey)) return;
    visitedStates.add(stateKey);
    // 空槽位在公开 Renderer 中整体隐藏，它的背景也不构成可达素材。
    const slot = node.slotId ? definition.slots[node.slotId] : undefined;
    const hasInstanceValue = Boolean(node.slotId && Object.prototype.hasOwnProperty.call(contentBySlotId, node.slotId));
    const instanceValue = node.slotId ? contentBySlotId[node.slotId] : undefined;
    const defaultValue = node.slotId ? definition.defaultContent[node.slotId] : undefined;
    const value = hasInstanceValue && !(slot?.emptyPolicy === "use-default" && !hasRenderableSlotContent(slot, instanceValue)) ? instanceValue : defaultValue;
    if ((!slot || hasRenderableSlotContent(slot, value)) && isNonEmptyString(rules.backgroundImage)) {
      onBackground?.(nodeId, rules.backgroundImage);
    }
    if (node.slotId && !hiddenSlotIds.has(node.slotId)) {
      visibleSlotIds.add(node.slotId);
    }
    const nextAncestors = new Set(ancestorIds);
    nextAncestors.add(nodeId);
    node.childIds.forEach((childId) => {
      visit(childId, breakpoint, nextAncestors);
    });
  };
  const breakpoints: TemplateBreakpoint[] = definition.schemaVersion >= 2 ? ["desktop", "tablet", "mobile"] : ["desktop", "mobile"];
  for (const breakpoint of breakpoints) visit(definition.rootNodeId, breakpoint, new Set());
  return visibleSlotIds;
}

/**
 * 从已注入精确正式模板版本的 PageDocument 中提取模板实例媒体。
 * 定义必须先由 Repository 校验并写入 resolvedDynamicTemplates，避免按任意字段名猜测素材。
 */
export function getDynamicTemplateDocumentMediaReferences(
  puckData: unknown,
  options: { includeZones?: boolean } = {},
): ContentTemplateMediaReference[] {
  if (!isRecord(puckData)) return [];
  const resolved = isRecord(puckData[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY])
    ? puckData[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]
    : {};
  const references: ContentTemplateMediaReference[] = [];
  const collectBlocks = (blocks: unknown, basePath: string) => {
    if (!Array.isArray(blocks)) return;
    blocks.forEach((block, blockIndex) => {
      if (!isRecord(block) || block.type !== DYNAMIC_TEMPLATE_BLOCK_TYPE || !isRecord(block.props)) {
        return;
      }
      const props = block.props;
      if (props.isVisible === false) return;
      const reference = readDynamicTemplateInstanceReference(props);
      if (!reference) return;
      const resolvedVersion = resolved[
        dynamicTemplateVersionKey(reference.templateId, reference.templateVersion)
      ];
      if (!isRecord(resolvedVersion)) return;
      const definitionValidation = validateDynamicTemplateDefinition(resolvedVersion.definition);
      if (!definitionValidation.valid || !definitionValidation.definition) return;
      const validation = validateDynamicTemplateInstance(props, definitionValidation.definition);
      const hiddenSlotIds = new Set(
        Array.isArray(props.hiddenSlotIds)
          ? props.hiddenSlotIds.filter((item): item is string => typeof item === "string")
          : [],
      );
      const visibleSlotIds = getPubliclyReachableDynamicTemplateSlotIds(
        definitionValidation.definition,
        hiddenSlotIds,
        isRecord(props.contentBySlotId) ? props.contentBySlotId : {},
        (nodeId, url) => references.push({
          url,
          path: `${basePath}[${blockIndex}].props.templateDefinition.nodes.${nodeId}.backgroundImage`,
          field: `${nodeId}.backgroundImage`,
          ...(isNonEmptyString(props.id) ? { blockId: props.id.trim() } : {}),
          moduleType: DYNAMIC_TEMPLATE_BLOCK_TYPE,
        }),
      );
      const blockId = isNonEmptyString(props.id) ? props.id.trim() : undefined;
      validation.assets.forEach((asset) => {
        if (!visibleSlotIds.has(asset.slotId)) return;
        references.push({
          url: asset.url,
          path: `${basePath}[${blockIndex}].props.contentBySlotId.${asset.slotId}`,
          field: asset.slotId,
          ...(blockId ? { blockId } : {}),
          moduleType: DYNAMIC_TEMPLATE_BLOCK_TYPE,
        });
      });
    });
  };

  collectBlocks(puckData.content, "content");
  if (options.includeZones !== false && isRecord(puckData.zones)) {
    Object.entries(puckData.zones).forEach(([zoneKey, blocks]) => {
      collectBlocks(blocks, `zones.${zoneKey}`);
    });
  }
  const seenUrls = new Set<string>();
  return references.filter((reference) => {
    if (seenUrls.has(reference.url)) return false;
    seenUrls.add(reference.url);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isEmptyContent(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (isRecord(value)) {
    if (typeof value.src === "string") return value.src.trim().length === 0;
    if (typeof value.label === "string") return value.label.trim().length === 0;
  }
  return false;
}

function hasRenderableSlotContent(slot: DynamicTemplateSlotDefinition, value: unknown): boolean {
  if (slot.type === "image") return typeof value === "string" ? value.trim().length > 0 : isRecord(value) && isNonEmptyString(value.src);
  const meaningful = (item: unknown): boolean => typeof item === "string" ? item.trim().length > 0
    : Array.isArray(item) ? item.some(meaningful) : isRecord(item) ? Object.values(item).some(meaningful) : false;
  return meaningful(value);
}

function isEmptyComplexContent(slotType: string, value: unknown) {
  if (!isRecord(value)) return false;
  if (isMatureContentTemplateSlotType(slotType)) {
    const moduleType = MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE[slotType];
    const content = sanitizeContentTemplateDefaultContent(moduleType, value);
    return !content || !hasMeaningfulBusinessContent(content);
  }
  return false;
}

function hasMeaningfulBusinessContent(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasMeaningfulBusinessContent);
  if (isRecord(value)) return Object.values(value).some(hasMeaningfulBusinessContent);
  // 数值和布尔值是布局、显示或真实性确认参数，不能单独构成公开业务内容。
  return false;
}

function matureContentCompletionMessage(moduleType: string, value: unknown): string | undefined {
  const completion = getContentTemplateCompletion(moduleType, value);
  if (!completion) return "成熟内容模板合同不可用";
  const problems: string[] = [];
  if (!completion.material.complete) {
    problems.push(`缺少必填素材 ${completion.material.missing.join("、")}`);
  }
  if (!completion.content.complete) {
    const missing = [
      ...completion.content.missing,
      ...completion.content.missingCollectionAltText.map((item) => (
        `${item.collectionFieldKey}[${item.index}].${item.altFieldKey}`
      )),
    ];
    problems.push(`缺少必填内容 ${missing.join("、")}`);
  }
  if (!completion.collections.complete) {
    problems.push(completion.collections.invalid.map((item) => (
      `${item.fieldKey} 需要 ${item.min}–${item.max} 项`
    )).join("；"));
  }
  if (!completion.attestations.complete) {
    problems.push(completion.attestations.missing.map((item) => (
      `${item.collectionFieldKey}[${item.index}] 未确认“${item.label}”`
    )).join("；"));
  }
  if (!completion.publish.complete) {
    problems.push(completion.publish.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message)
      .join("；"));
  }
  return problems.filter(Boolean).join("；") || undefined;
}

function readStructuredAction(value: Record<string, unknown>, prefix = "") {
  const read = (suffix: "TargetType" | "ProductCode" | "CategorySlug" | "LinkUrl") => (
    value[prefix ? `${prefix}${suffix}` : suffix.charAt(0).toLowerCase() + suffix.slice(1)]
  );
  const rawTargetType = read("TargetType");
  const targetType = isNonEmptyString(rawTargetType) ? rawTargetType.trim() : "none";
  const targetValue = targetType === "page"
    ? read("LinkUrl") ?? (prefix ? undefined : value.pagePath)
    : targetType === "external"
      ? read("LinkUrl") ?? (prefix ? undefined : value.url)
      : targetType === "product"
        ? read("ProductCode")
        : targetType === "category"
          ? read("CategorySlug")
          : undefined;
  return { targetType, targetValue };
}

const DEFAULT_INSTANCE_EDIT_POLICY = {
  position: false,
  size: false,
  zIndex: false,
  imageFit: false,
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

function validateLayoutOverrides(
  input: unknown,
  definition: TemplateDefinitionV2,
  issues: DynamicTemplateInstanceIssue[],
) {
  if (input === undefined) return;
  if (!isRecord(input)) {
    issues.push({ message: "页面实例构图覆盖必须按 nodeId 保存", field: "layoutOverridesByNodeId", pathSuffix: ".layoutOverridesByNodeId" });
    return;
  }
  if (Object.keys(input).length > 100) {
    issues.push({ message: "页面实例构图覆盖最多包含 100 个节点", field: "layoutOverridesByNodeId", pathSuffix: ".layoutOverridesByNodeId" });
  }
  for (const [nodeId, rawNodeOverrides] of Object.entries(input)) {
    const node = definition.nodes[nodeId];
    const slot = node?.slotId ? definition.slots[node.slotId] : undefined;
    const policy = node && slot?.editable
      ? {
          ...DEFAULT_INSTANCE_EDIT_POLICY,
          imageFit: slot.type === 'image',
          imageFocus: slot.type === 'image',
          ...(node.instanceEditPolicy ?? {}),
        }
      : null;
    if (!node || !slot || !policy) {
      issues.push({ message: `节点 ${nodeId} 未开放页面实例构图调整`, field: nodeId, pathSuffix: `.layoutOverridesByNodeId.${nodeId}` });
      continue;
    }
    if (!isRecord(rawNodeOverrides)) {
      issues.push({ message: `${node.name}的构图覆盖必须是对象`, field: nodeId, pathSuffix: `.layoutOverridesByNodeId.${nodeId}` });
      continue;
    }
    for (const key of Object.keys(rawNodeOverrides)) {
      if (!['desktop', 'mobile'].includes(key)) {
        issues.push({ message: `${node.name}包含未知设备档 ${key}`, field: nodeId, pathSuffix: `.layoutOverridesByNodeId.${nodeId}.${key}` });
      }
    }
    for (const device of ['desktop', 'mobile'] as const) {
      const rawDevice = rawNodeOverrides[device];
      if (rawDevice === undefined) continue;
      if (!isRecord(rawDevice)) {
        issues.push({ message: `${node.name}的${device}构图覆盖必须是对象`, field: nodeId, pathSuffix: `.layoutOverridesByNodeId.${nodeId}.${device}` });
        continue;
      }
      for (const key of Object.keys(rawDevice)) {
        if (![
          'offsetXPercent', 'offsetYPercent', 'widthPercent', 'zIndex',
          'objectFit', 'imageScalePercent', 'focusXPercent', 'focusYPercent',
          'fontSizePx', 'textAlign', 'marginTopPx', 'marginBottomPx',
        ].includes(key)) {
          issues.push({ message: `${node.name}包含未知构图字段 ${key}`, field: nodeId, pathSuffix: `.layoutOverridesByNodeId.${nodeId}.${device}.${key}` });
        }
      }
      const offsetValues = [rawDevice.offsetXPercent, rawDevice.offsetYPercent].filter((value) => value !== undefined);
      if (!policy.position && offsetValues.length > 0) {
        issues.push({ message: `${node.name}不允许调整位置`, field: nodeId, pathSuffix: `.layoutOverridesByNodeId.${nodeId}.${device}` });
      }
      if (offsetValues.some((value) => typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > policy.maxOffsetPercent)) {
        issues.push({ message: `${node.name}位置偏移超出允许范围`, field: nodeId, pathSuffix: `.layoutOverridesByNodeId.${nodeId}.${device}` });
      }
      if (rawDevice.widthPercent !== undefined && (!policy.size
        || typeof rawDevice.widthPercent !== 'number'
        || !Number.isFinite(rawDevice.widthPercent)
        || rawDevice.widthPercent < policy.minWidthPercent
        || rawDevice.widthPercent > policy.maxWidthPercent)) {
        issues.push({ message: `${node.name}宽度超出母模板允许范围`, field: nodeId, pathSuffix: `.layoutOverridesByNodeId.${nodeId}.${device}.widthPercent` });
      }
      const zIndex = rawDevice.zIndex;
      if (zIndex !== undefined && (!policy.zIndex
        || typeof zIndex !== 'number'
        || !Number.isInteger(zIndex)
        || zIndex < -10
        || zIndex > 10)) {
        issues.push({ message: `${node.name}层级超出允许范围`, field: nodeId, pathSuffix: `.layoutOverridesByNodeId.${nodeId}.${device}.zIndex` });
      }
      if (rawDevice.objectFit !== undefined && (!policy.imageFit
        || slot.type !== 'image'
        || !['cover', 'contain', 'fill'].includes(String(rawDevice.objectFit)))) {
        issues.push({ message: `${node.name}图片适配方式未获母模板授权`, field: nodeId, pathSuffix: `.layoutOverridesByNodeId.${nodeId}.${device}.objectFit` });
      }
      if (rawDevice.imageScalePercent !== undefined && (!policy.imageFit
        || slot.type !== 'image'
        || typeof rawDevice.imageScalePercent !== 'number'
        || !Number.isFinite(rawDevice.imageScalePercent)
        || rawDevice.imageScalePercent < 100
        || rawDevice.imageScalePercent > 200)) {
        issues.push({ message: `${node.name}图片缩放超出母模板授权范围`, field: nodeId, pathSuffix: `.layoutOverridesByNodeId.${nodeId}.${device}.imageScalePercent` });
      }
      const focusValues = [rawDevice.focusXPercent, rawDevice.focusYPercent].filter((value) => value !== undefined);
      if (focusValues.length > 0 && (!policy.imageFocus
        || slot.type !== 'image'
        || focusValues.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100))) {
        issues.push({ message: `${node.name}图片焦点超出母模板授权范围`, field: nodeId, pathSuffix: `.layoutOverridesByNodeId.${nodeId}.${device}` });
      }
      const textSlot = ['heading', 'text', 'richText', 'badge'].includes(slot.type);
      if (rawDevice.fontSizePx !== undefined && (!policy.typography
        || !textSlot
        || typeof rawDevice.fontSizePx !== 'number'
        || !Number.isFinite(rawDevice.fontSizePx)
        || rawDevice.fontSizePx < (policy.minFontSizePx ?? 12)
        || rawDevice.fontSizePx > (policy.maxFontSizePx ?? 96))) {
        issues.push({ message: `${node.name}字号超出母模板授权范围`, field: nodeId, pathSuffix: `.layoutOverridesByNodeId.${nodeId}.${device}.fontSizePx` });
      }
      if (rawDevice.textAlign !== undefined && (!policy.typography
        || !textSlot
        || !['left', 'center', 'right'].includes(String(rawDevice.textAlign)))) {
        issues.push({ message: `${node.name}文字对齐未获母模板授权`, field: nodeId, pathSuffix: `.layoutOverridesByNodeId.${nodeId}.${device}.textAlign` });
      }
      const spacingValues = [rawDevice.marginTopPx, rawDevice.marginBottomPx].filter((value) => value !== undefined);
      if (spacingValues.length > 0 && (!policy.spacing
        || !textSlot
        || spacingValues.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > (policy.maxSpacingPx ?? 120)))) {
        issues.push({ message: `${node.name}上下间距超出母模板授权范围`, field: nodeId, pathSuffix: `.layoutOverridesByNodeId.${nodeId}.${device}` });
      }
    }
  }
}

function pushTextIssues(
  slot: DynamicTemplateSlotDefinition,
  value: unknown,
  issues: DynamicTemplateInstanceIssue[],
) {
  if (typeof value !== "string") {
    issues.push({
      message: `${slot.label}必须是文字`,
      field: slot.slotId,
      pathSuffix: `.contentBySlotId.${slot.slotId}`,
    });
    return;
  }
  const length = value.length;
  if (slot.validation.minLength !== undefined && length < slot.validation.minLength) {
    issues.push({
      message: `${slot.label}至少需要 ${slot.validation.minLength} 个字符`,
      field: slot.slotId,
      pathSuffix: `.contentBySlotId.${slot.slotId}`,
    });
  }
  if (slot.validation.maxLength !== undefined && length > slot.validation.maxLength) {
    issues.push({
      message: `${slot.label}最多允许 ${slot.validation.maxLength} 个字符`,
      field: slot.slotId,
      pathSuffix: `.contentBySlotId.${slot.slotId}`,
    });
  }
}

export function dynamicTemplateVersionKey(templateId: string, version: number): string {
  return `${templateId}@${version}`;
}

export function readDynamicTemplateInstanceReference(
  input: unknown,
): DynamicTemplateInstanceReference | null {
  if (!isRecord(input)) return null;
  const templateId = isNonEmptyString(input.templateId) ? input.templateId.trim() : "";
  const templateVersion = Number(input.templateVersion);
  if (!STABLE_ID_PATTERN.test(templateId) || !Number.isInteger(templateVersion) || templateVersion <= 0) {
    return null;
  }
  return {
    templateId,
    templateVersion,
    ...(isNonEmptyString(input.instanceId) ? { instanceId: input.instanceId.trim() } : {}),
  };
}

export function collectDynamicTemplateInstanceReferences(
  puckData: unknown,
): DynamicTemplateInstanceReference[] {
  if (!isRecord(puckData)) return [];
  const blocks = [
    ...(Array.isArray(puckData.content) ? puckData.content : []),
    ...(isRecord(puckData.zones)
      ? Object.values(puckData.zones).flatMap((zone) => Array.isArray(zone) ? zone : [])
      : []),
  ];
  const unique = new Map<string, DynamicTemplateInstanceReference>();
  for (const block of blocks) {
    if (!isRecord(block) || block.type !== DYNAMIC_TEMPLATE_BLOCK_TYPE) continue;
    const reference = readDynamicTemplateInstanceReference(block.props);
    if (!reference) continue;
    unique.set(dynamicTemplateVersionKey(reference.templateId, reference.templateVersion), reference);
  }
  return [...unique.values()];
}

export function validateDynamicTemplateInstance(
  propsInput: unknown,
  definitionInput: unknown,
): DynamicTemplateInstanceValidation {
  const issues: DynamicTemplateInstanceIssue[] = [];
  const assets: DynamicTemplateAssetReference[] = [];
  const productCodes: DynamicTemplateBusinessReference[] = [];
  const categorySlugs: DynamicTemplateBusinessReference[] = [];
  const actions: DynamicTemplateActionReference[] = [];
  const validation = validateDynamicTemplateDefinition(definitionInput);
  if (!validation.valid || !validation.definition) {
    return {
      issues: [{
        message: validation.issues.find((issue) => issue.level === "error")?.message ?? "模板定义无效",
        pathSuffix: ".templateVersion",
        field: "templateVersion",
      }],
      assets,
      productCodes,
      categorySlugs,
      actions,
    };
  }
  const definition = validation.definition;
  if (!isRecord(propsInput)) {
    return {
      definition,
      issues: [{ message: "动态模板实例配置不能为空", pathSuffix: "" }],
      assets,
      productCodes,
      categorySlugs,
      actions,
    };
  }
  const props = propsInput;
  const allowedInstanceKeys = new Set([
    "id", "instanceSchemaVersion", "instanceId", "templateId", "templateVersion",
    "moduleName", "contentBySlotId", "overrides", "layoutOverridesByNodeId",
    "hiddenSlotIds", "isVisible",
  ]);
  for (const key of Object.keys(props)) {
    if (allowedInstanceKeys.has(key)) continue;
    issues.push({
      message: `页面实例包含未授权字段 ${key}`,
      field: key,
      pathSuffix: `.${key}`,
    });
  }
  if (props.instanceSchemaVersion !== DYNAMIC_TEMPLATE_INSTANCE_SCHEMA_VERSION) {
    issues.push({
      message: `动态模板实例 Schema 必须为 v${DYNAMIC_TEMPLATE_INSTANCE_SCHEMA_VERSION}`,
      field: "instanceSchemaVersion",
      pathSuffix: ".instanceSchemaVersion",
    });
  }
  const hasStrictTemplateId = typeof props.templateId === "string"
    && props.templateId === props.templateId.trim()
    && STABLE_ID_PATTERN.test(props.templateId);
  if (!hasStrictTemplateId || props.templateId !== definition.templateId) {
    issues.push({
      message: "页面实例与正式模板身份不一致",
      field: "templateId",
      pathSuffix: ".templateId",
    });
  }
  if (
    typeof props.templateVersion !== "number"
    || !Number.isInteger(props.templateVersion)
    || props.templateVersion <= 0
  ) {
    issues.push({
      message: "页面实例模板版本必须是正整数",
      field: "templateVersion",
      pathSuffix: ".templateVersion",
    });
  }
  if (!isNonEmptyString(props.instanceId)) {
    issues.push({ message: "页面模板实例 ID 不能为空", field: "instanceId", pathSuffix: ".instanceId" });
  } else if (!STABLE_ID_PATTERN.test(props.instanceId)) {
    issues.push({ message: "页面模板实例 ID 格式无效", field: "instanceId", pathSuffix: ".instanceId" });
  }
  if (typeof props.isVisible !== "boolean") {
    issues.push({ message: "页面模板实例显示状态必须是布尔值", field: "isVisible", pathSuffix: ".isVisible" });
  }
  const contentBySlotId = isRecord(props.contentBySlotId) ? props.contentBySlotId : {};
  if (!isRecord(props.contentBySlotId)) {
    issues.push({ message: "页面实例内容必须按 slotId 保存", field: "contentBySlotId", pathSuffix: ".contentBySlotId" });
  }
  const hiddenSlotIds = Array.isArray(props.hiddenSlotIds)
    ? props.hiddenSlotIds.filter((value): value is string => typeof value === "string")
    : [];
  if (!Array.isArray(props.hiddenSlotIds)) {
    issues.push({ message: "隐藏槽位必须是 slotId 数组", field: "hiddenSlotIds", pathSuffix: ".hiddenSlotIds" });
  } else {
    for (const [index, value] of props.hiddenSlotIds.entries()) {
      if (typeof value !== "string" || !STABLE_ID_PATTERN.test(value)) {
        issues.push({
          message: "隐藏槽位必须使用合法 slotId",
          field: "hiddenSlotIds",
          pathSuffix: `.hiddenSlotIds[${index}]`,
          index,
        });
      }
    }
  }
  if (new Set(hiddenSlotIds).size !== hiddenSlotIds.length) {
    issues.push({ message: "隐藏槽位不能重复", field: "hiddenSlotIds", pathSuffix: ".hiddenSlotIds" });
  }
  if (props.overrides !== undefined && !isRecord(props.overrides)) {
    issues.push({ message: "旧版页面实例覆盖必须是对象", field: "overrides", pathSuffix: ".overrides" });
  } else if (isRecord(props.overrides) && Object.keys(props.overrides).length > 0) {
    issues.push({ message: "旧版结构覆盖不受支持，请恢复模板默认后重新调整", field: "overrides", pathSuffix: ".overrides" });
  }
  validateLayoutOverrides(props.layoutOverridesByNodeId, definition, issues);

  for (const slotId of Object.keys(contentBySlotId)) {
    if (!STABLE_ID_PATTERN.test(slotId) || !definition.slots[slotId]) {
      issues.push({
        message: `页面实例包含未声明槽位 ${slotId}`,
        field: slotId,
        pathSuffix: `.contentBySlotId.${slotId}`,
      });
    }
  }
  for (const [index, slotId] of hiddenSlotIds.entries()) {
    const slot = definition.slots[slotId];
    if (!slot) {
      issues.push({ message: `隐藏槽位 ${slotId} 未在模板中声明`, field: "hiddenSlotIds", pathSuffix: `.hiddenSlotIds[${index}]`, index });
    } else if (!slot.hideable || slot.required) {
      issues.push({ message: `${slot.label}不允许隐藏`, field: "hiddenSlotIds", pathSuffix: `.hiddenSlotIds[${index}]`, index });
    }
  }

  const visibleSlotIds = getPubliclyReachableDynamicTemplateSlotIds(
    definition,
    new Set(hiddenSlotIds),
    contentBySlotId,
  );
  for (const slot of Object.values(definition.slots)) {
    const hasInstanceValue = Object.prototype.hasOwnProperty.call(contentBySlotId, slot.slotId);
    if (hasInstanceValue && !slot.editable) {
      issues.push({
        message: `${slot.label}不允许在页面中修改`,
        field: slot.slotId,
        pathSuffix: `.contentBySlotId.${slot.slotId}`,
      });
      continue;
    }
    const instanceValue = contentBySlotId[slot.slotId];
    const useDefault = definition.schemaVersion >= 3 && slot.emptyPolicy === "use-default" && !hasRenderableSlotContent(slot, instanceValue);
    const value = hasInstanceValue && !useDefault ? instanceValue : definition.defaultContent[slot.slotId];
    if (slot.required && (hiddenSlotIds.includes(slot.slotId)
      || !hasInstanceValue
      || isEmptyContent(contentBySlotId[slot.slotId]))) {
      issues.push({
        message: `${slot.label}为必填内容`,
        field: slot.slotId,
        pathSuffix: `.contentBySlotId.${slot.slotId}`,
      });
      continue;
    }
    if (value === undefined || value === null || value === "") continue;
    // 兼容旧实例清空图片后仍保留 alt 的对象；必填槽位已在上方明确阻断。
    if (slot.type === "image" && isEmptyContent(value)) continue;
    if (!validateDynamicTemplateSlotContent(slot.type, value)) {
      issues.push({
        message: `${slot.label}内容结构与母模板槽位不匹配`,
        field: slot.slotId,
        pathSuffix: `.contentBySlotId.${slot.slotId}`,
      });
      continue;
    }
    // 隐藏只跳过公开内容门禁；实例字段、槽位结构、编辑授权与必填约束仍需验证。
    if (!slot.required && !visibleSlotIds.has(slot.slotId)) continue;
    if (slot.required && isEmptyComplexContent(slot.type, value)) {
      issues.push({
        message: `${slot.label}为必填内容`,
        field: slot.slotId,
        pathSuffix: `.contentBySlotId.${slot.slotId}`,
      });
      continue;
    }

    if (["heading", "text", "richText", "badge", "icon"].includes(slot.type)) {
      pushTextIssues(slot, value, issues);
      continue;
    }
    if (slot.type === "image") {
      const image = typeof value === "string" ? { src: value, alt: "" } : isRecord(value) ? value : null;
      if (!image || !isNonEmptyString(image.src)) {
        issues.push({ message: `${slot.label}图片地址无效`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}` });
      } else {
        assets.push({ slotId: slot.slotId, url: image.src.trim() });
        if (!isNonEmptyString(image.alt)) {
          issues.push({ message: `${slot.label}替代文字不能为空`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}.alt` });
        }
      }
      continue;
    }
    if (slot.type === "button" || slot.type === "link") {
      if (!isRecord(value) || !isNonEmptyString(value.label)) {
        issues.push({ message: `${slot.label}必须填写行动文案`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}.label` });
        continue;
      }
      const targetType = isNonEmptyString(value.targetType) ? value.targetType.trim() : "none";
      const targetValue = targetType === "page"
        ? value.pagePath
        : targetType === "external"
          ? value.url
          : targetType === "product"
            ? value.productCode
            : targetType === "category"
              ? value.categorySlug
              : undefined;
      if (!["none", "page", "external", "product", "category"].includes(targetType)) {
        issues.push({ message: `${slot.label}行动类型无效`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}.targetType` });
      } else if (targetType !== "none" && !isNonEmptyString(targetValue)) {
        issues.push({ message: `${slot.label}必须设置有效去向`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}` });
      } else if (targetType !== "none" && isNonEmptyString(targetValue)) {
        actions.push({ slotId: slot.slotId, targetType: targetType as DynamicTemplateActionReference["targetType"], value: targetValue.trim() });
      }
      continue;
    }
    if (slot.type === "product") {
      if (!isNonEmptyString(value)) {
        issues.push({ message: `${slot.label}必须选择商品`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}` });
      } else {
        productCodes.push({ slotId: slot.slotId, value: value.trim() });
      }
      continue;
    }
    if (slot.type === "collection") {
      const values = Array.isArray(value)
        ? value.filter((item): item is string => isNonEmptyString(item)).map((item) => item.trim())
        : [];
      if (!Array.isArray(value) || values.length !== value.length) {
        issues.push({ message: `${slot.label}必须是商品编号数组`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}` });
        continue;
      }
      if (new Set(values).size !== values.length) {
        issues.push({ message: `${slot.label}不能包含重复商品`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}` });
      }
      if (slot.validation.minItems !== undefined && values.length < slot.validation.minItems) {
        issues.push({ message: `${slot.label}至少需要 ${slot.validation.minItems} 项`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}` });
      }
      if (slot.validation.maxItems !== undefined && values.length > slot.validation.maxItems) {
        issues.push({ message: `${slot.label}最多允许 ${slot.validation.maxItems} 项`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}` });
      }
      values.forEach((item, index) => productCodes.push({ slotId: slot.slotId, value: item, index }));
      continue;
    }
    if (isMatureContentTemplateSlotType(slot.type)) {
      const content = value as Record<string, unknown>;
      if (!hasMeaningfulBusinessContent(content)) continue;
      const moduleType = MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE[slot.type];
      const completionMessage = matureContentCompletionMessage(moduleType, content);
      if (completionMessage) {
        issues.push({
          message: `${slot.label}未满足公开内容合同：${completionMessage}`,
          field: slot.slotId,
          pathSuffix: `.contentBySlotId.${slot.slotId}`,
        });
      }
      let referenceIndex = 0;
      const visit = (candidate: unknown, key = "") => {
        if (Array.isArray(candidate)) {
          candidate.forEach((item) => visit(item, key));
          return;
        }
        if (!isRecord(candidate)) return;
        for (const [nestedKey, nestedValue] of Object.entries(candidate)) {
          if (isNonEmptyString(nestedValue) && /^(?:image|desktopImage|mobileImage|mainImage|detailImage|eventImage|backgroundImage|bgImage|beforeImage|afterImage|posterUrl|videoUrl)$/i.test(nestedKey)) {
            assets.push({ slotId: slot.slotId, url: nestedValue.trim() });
          }
          if (isNonEmptyString(nestedValue) && /^(?:productCode|secondaryProductCode)$/i.test(nestedKey)) {
            productCodes.push({ slotId: slot.slotId, value: nestedValue.trim(), index: referenceIndex++ });
          }
          if (isNonEmptyString(nestedValue) && /^(?:categorySlug|secondaryCategorySlug)$/i.test(nestedKey)) {
            categorySlugs.push({ slotId: slot.slotId, value: nestedValue.trim(), index: referenceIndex++ });
          }
          if (Array.isArray(nestedValue) && nestedKey === "productCodes") {
            nestedValue.filter(isNonEmptyString).forEach((item) => {
              productCodes.push({ slotId: slot.slotId, value: item.trim(), index: referenceIndex++ });
            });
          }
          if (Array.isArray(nestedValue) && nestedKey === "categorySlugs") {
            nestedValue.filter(isNonEmptyString).forEach((item) => {
              categorySlugs.push({ slotId: slot.slotId, value: item.trim(), index: referenceIndex++ });
            });
          }
          visit(nestedValue, nestedKey);
        }
        const addStructuredAction = (prefix = "") => {
          const { targetType, targetValue } = readStructuredAction(candidate, prefix);
          if (targetType === "none") return;
          if (!isNonEmptyString(targetValue)) {
            issues.push({ message: `${slot.label}必须设置有效去向`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}` });
            return;
          }
          actions.push({
            slotId: slot.slotId,
            targetType: targetType as DynamicTemplateActionReference["targetType"],
            value: targetValue.trim(),
          });
        };
        if (candidate.targetType !== undefined) addStructuredAction();
        if (candidate.secondaryTargetType !== undefined) addStructuredAction("secondary");
      };
      visit(content);
      continue;
    }
  }

  return { definition, issues, assets, productCodes, categorySlugs, actions };
}
