import {
  isMatureContentTemplateSlotType,
  validateDynamicTemplateSlotContent,
  validateDynamicTemplateDefinition,
} from "./generated/validateTemplateDefinition.generated";
import type {
  DynamicTemplateSlotDefinition,
  TemplateDefinitionV2,
} from "./generated/templateDefinition.generated";
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

function isEmptyComplexContent(slotType: string, value: unknown) {
  // 标量槽位已经由 isEmptyContent 与各自类型校验处理；这里仅检查对象型复杂槽位。
  if (!isRecord(value)) return false;
  if (slotType === "video") return !isNonEmptyString(value.videoUrl);
  if (slotType === "carousel") {
    return !Array.isArray(value.images)
      || !value.images.some((item) => isRecord(item) && isNonEmptyString(item.url));
  }
  if (slotType === "hotspot") return !isNonEmptyString(value.image) && !isNonEmptyString(value.mobileImage);
  if (slotType === "beforeAfter") return !isNonEmptyString(value.beforeImage) || !isNonEmptyString(value.afterImage);
  if (slotType === "appointment") return !isNonEmptyString(value.title) || !isNonEmptyString(value.buttonText);
  if (slotType === "productCard") return !isNonEmptyString(value.productCode);
  if (slotType === "productCollection") {
    return !Array.isArray(value.productCodes) || !value.productCodes.some(isNonEmptyString);
  }
  if (slotType === "categoryCollection") {
    return !Array.isArray(value.categorySlugs) || !value.categorySlugs.some(isNonEmptyString);
  }
  return false;
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
  const reference = readDynamicTemplateInstanceReference(props);
  if (!reference || reference.templateId !== definition.templateId) {
    issues.push({
      message: "页面实例与正式模板身份不一致",
      field: "templateId",
      pathSuffix: ".templateId",
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
    const value = hasInstanceValue ? contentBySlotId[slot.slotId] : definition.defaultContent[slot.slotId];
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
    if (!validateDynamicTemplateSlotContent(slot.type, value)) {
      issues.push({
        message: `${slot.label}内容结构与母模板槽位不匹配`,
        field: slot.slotId,
        pathSuffix: `.contentBySlotId.${slot.slotId}`,
      });
      continue;
    }
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
    if ([
      "video", "carousel", "hotspot", "beforeAfter", "appointment",
      "productCard", "productCollection", "categoryCollection",
    ].includes(slot.type)) {
      const content = value as Record<string, unknown>;
      const addAsset = (url: unknown) => {
        if (isNonEmptyString(url)) assets.push({ slotId: slot.slotId, url: url.trim() });
      };
      const addAction = (action: unknown, index?: number, prefix = "") => {
        if (!isRecord(action)) return;
        const { targetType, targetValue } = readStructuredAction(action, prefix);
        if (!["none", "page", "external", "product", "category"].includes(targetType)) {
          issues.push({ message: `${slot.label}行动类型无效`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}` });
        } else if (targetType !== "none" && !isNonEmptyString(targetValue)) {
          issues.push({ message: `${slot.label}必须设置有效去向`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}` });
        } else if (targetType !== "none" && isNonEmptyString(targetValue)) {
          actions.push({
            slotId: slot.slotId,
            targetType: targetType as DynamicTemplateActionReference["targetType"],
            value: targetValue.trim(),
            ...(index === undefined ? {} : { index }),
          });
        }
      };
      if (slot.type === "video") {
        addAsset(content.videoUrl);
        addAsset(content.posterUrl);
        if (isNonEmptyString(content.videoUrl) && !isNonEmptyString(content.videoDescription)) {
          issues.push({ message: `${slot.label}必须填写视频说明`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}.videoDescription` });
        }
        addAction(content);
      } else if (slot.type === "carousel") {
        (content.images as unknown[] ?? []).forEach((item, index) => {
          if (!isRecord(item)) return;
          addAsset(item.url);
          addAsset(item.mobileUrl);
          if (isNonEmptyString(item.url) && !isNonEmptyString(item.alt)) {
            issues.push({ message: `${slot.label}第 ${index + 1} 张图片必须填写替代文字`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}.images[${index}].alt`, index });
          }
          addAction(item, index);
        });
      } else if (slot.type === "hotspot") {
        addAsset(content.image);
        addAsset(content.mobileImage);
        if ((isNonEmptyString(content.image) || isNonEmptyString(content.mobileImage)) && !isNonEmptyString(content.altText)) {
          issues.push({ message: `${slot.label}底图必须填写替代文字`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}.altText` });
        }
        [...(content.hotspots as unknown[] ?? []), ...(content.mobileHotspots as unknown[] ?? [])]
          .forEach((item, index) => addAction(item, index));
      } else if (slot.type === "beforeAfter") {
        addAsset(content.beforeImage);
        addAsset(content.afterImage);
        if (isNonEmptyString(content.beforeImage) && !isNonEmptyString(content.beforeAltText)) {
          issues.push({ message: `${slot.label}改款前图片必须填写替代文字`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}.beforeAltText` });
        }
        if (isNonEmptyString(content.afterImage) && !isNonEmptyString(content.afterAltText)) {
          issues.push({ message: `${slot.label}改款后图片必须填写替代文字`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}.afterAltText` });
        }
        addAction(content);
      } else if (slot.type === "appointment") {
        addAsset(content.backgroundImage);
        if (isNonEmptyString(content.backgroundImage) && !isNonEmptyString(content.altText)) {
          issues.push({ message: `${slot.label}背景图必须填写替代文字`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}.altText` });
        }
        addAction(content);
      } else if (slot.type === "productCard") {
        if (isNonEmptyString(content.productCode)) {
          productCodes.push({ slotId: slot.slotId, value: content.productCode.trim() });
        }
        addAction(content, undefined, "secondary");
      } else if (slot.type === "productCollection") {
        const values = Array.isArray(content.productCodes)
          ? content.productCodes.filter(isNonEmptyString).map((item) => item.trim())
          : [];
        if (slot.validation.minItems !== undefined && values.length < slot.validation.minItems) {
          issues.push({ message: `${slot.label}至少需要 ${slot.validation.minItems} 项`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}.productCodes` });
        }
        if (slot.validation.maxItems !== undefined && values.length > slot.validation.maxItems) {
          issues.push({ message: `${slot.label}最多允许 ${slot.validation.maxItems} 项`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}.productCodes` });
        }
        values.forEach((item, index) => productCodes.push({ slotId: slot.slotId, value: item, index }));
      } else {
        const values = Array.isArray(content.categorySlugs)
          ? content.categorySlugs.filter(isNonEmptyString).map((item) => item.trim())
          : [];
        if (slot.validation.minItems !== undefined && values.length < slot.validation.minItems) {
          issues.push({ message: `${slot.label}至少需要 ${slot.validation.minItems} 项`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}.categorySlugs` });
        }
        if (slot.validation.maxItems !== undefined && values.length > slot.validation.maxItems) {
          issues.push({ message: `${slot.label}最多允许 ${slot.validation.maxItems} 项`, field: slot.slotId, pathSuffix: `.contentBySlotId.${slot.slotId}.categorySlugs` });
        }
        values.forEach((item, index) => categorySlugs.push({ slotId: slot.slotId, value: item, index }));
      }
    }
  }

  return { definition, issues, assets, productCodes, categorySlugs, actions };
}
