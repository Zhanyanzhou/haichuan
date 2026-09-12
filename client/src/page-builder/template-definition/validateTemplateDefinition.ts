import {
  DYNAMIC_TEMPLATE_SUPPORTED_SCHEMA_VERSIONS,
  TEMPLATE_RECIPE_SCHEMA,
  type TemplateRecipe,
  DYNAMIC_TEMPLATE_METADATA_FIELDS,
  DYNAMIC_TEMPLATE_METADATA_INTEGER_BOUNDS,
  getDynamicTemplateNodeRegistryEntry,
  isDynamicTemplateNodeType,
  isDynamicTemplateSlotType,
  type TemplateDefinitionV2,
  type DynamicTemplateLength,
  type DynamicTemplateNodeType,
  type DynamicTemplateResponsiveRules,
  type DynamicTemplateSlotType,
} from "./generated/templateDefinition.generated";
import {
  sanitizeContentTemplateDefaultContent,
  sanitizeContentTemplateLayoutData,
} from "../generated/contentTemplates.generated";
import { mergeTemplateResponsiveRecord, resolveTemplateNodeRules } from "./responsive";

export type DynamicTemplateValidationLevel = "error" | "warning" | "info";

export interface DynamicTemplateValidationIssue {
  level: DynamicTemplateValidationLevel;
  code: string;
  path: string;
  message: string;
  nodeId?: string;
  slotId?: string;
}

export interface DynamicTemplateValidationResult {
  valid: boolean;
  issues: DynamicTemplateValidationIssue[];
  definition?: TemplateDefinitionV2;
}

export type DynamicTemplatePublishValidationResult = DynamicTemplateValidationResult;

export const DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH = {
  category: 50,
  purpose: 100,
  layoutType: 50,
  slotSummary: 200,
} as const;

export const DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS = {
  recommendedFor: { maxItems: 20, maxItemLength: 50 },
  tags: { maxItems: 20, maxItemLength: 30 },
} as const;

export const DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES = 20;

const TEMPLATE_COLOR_PATTERN = /^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;

/** 默认媒体只接收 HTTPS 或本站绝对路径；禁止脚本、内联数据及协议相对地址。 */
export function isSafeTemplateMediaUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || value.includes("\\")) return false;
  if ([...value].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

function validateRecipeShape(value: unknown, schema: Record<string, unknown>, path: string, issues: DynamicTemplateValidationIssue[]) {
  const invalid = (message: string) => addIssue(issues, { level: "error", code: "INVALID_TEMPLATE_RECIPE", path, message });
  if (schema.const !== undefined && value !== schema.const) invalid("模板方案版本无效。");
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) invalid("模板方案选项无效。");
  if (schema.type === "object") {
    if (!isRecord(value)) { invalid("模板方案字段必须是对象。"); return; }
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    validateKnownKeys(value, Object.keys(properties), path, issues);
    for (const key of schema.required as string[]) {
      if (value[key] === undefined) invalid(`模板方案缺少 ${key}。`);
    }
    for (const [key, child] of Object.entries(properties)) {
      if (value[key] !== undefined) validateRecipeShape(value[key], child, `${path}.${key}`, issues);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) { invalid("模板方案字段必须是数组。"); return; }
    if (value.length > Number(schema.maxItems)) invalid("模板方案槽位数量超出限制。");
    value.forEach((item, index) => validateRecipeShape(item, schema.items as Record<string, unknown>, `${path}.${index}`, issues));
  } else if (schema.type === "string") {
    if (typeof value !== "string") { invalid("模板方案字段必须是文字。"); return; }
    if ((schema.minLength !== undefined && value.trim().length < Number(schema.minLength))
      || (schema.maxLength !== undefined && value.length > Number(schema.maxLength))
      || (schema.pattern && !new RegExp(String(schema.pattern)).test(value))) invalid("模板方案文字格式或长度无效。");
  } else if (schema.type === "number" || schema.type === "integer") {
    if (!isFiniteNumber(value) || (schema.type === "integer" && !Number.isInteger(value))
      || (schema.minimum !== undefined && Number(value) < Number(schema.minimum))
      || (schema.maximum !== undefined && Number(value) > Number(schema.maximum))
      || (schema.exclusiveMinimum !== undefined && Number(value) <= Number(schema.exclusiveMinimum))) invalid("模板方案数值超出范围。");
  } else if (schema.type === "boolean" && typeof value !== "boolean") invalid("模板方案选项必须是布尔值。");
}

export function validateTemplateRecipe(input: unknown): { valid: boolean; issues: DynamicTemplateValidationIssue[]; recipe?: TemplateRecipe } {
  const issues: DynamicTemplateValidationIssue[] = [];
  validateRecipeShape(input, TEMPLATE_RECIPE_SCHEMA, "templateRecipe", issues);
  if (!issues.some((issue) => issue.level === "error")) {
    const recipe = input as TemplateRecipe;
    const invalid = (path: string, message: string) => addIssue(issues, { level: "error", code: "INVALID_TEMPLATE_RECIPE", path: `templateRecipe.${path}`, message });
    if (recipe.purpose === "custom" && !recipe.customPurpose?.trim()) invalid("customPurpose", "请输入自定义用途。");
    if (Math.abs(recipe.canvas.width / recipe.canvas.height - recipe.canvas.aspectRatio) > 0.000001) invalid("canvas.aspectRatio", "画布比例必须与宽高一致。");
    const ids = new Set<string>();
    for (const [kind, slots] of [["media", recipe.media], ["content", recipe.content]] as const) {
      slots.forEach((slot, index) => {
        if (ids.has(slot.id)) invalid(`${kind}.${index}.id`, "方案槽位标识不能重复。");
        ids.add(slot.id);
      });
    }
    recipe.media.forEach((slot, index) => {
      if (slot.defaultImage && !isSafeTemplateMediaUrl(slot.defaultImage)) invalid(`media.${index}.defaultImage`, "默认图片地址无效。");
    });
    recipe.content.forEach((slot, index) => {
      if (slot.defaultContent.length > slot.maxLength) invalid(`content.${index}.defaultContent`, "默认文字超过最大字数。");
    });
  }
  const valid = !issues.some((issue) => issue.level === "error");
  return { valid, issues, ...(valid ? { recipe: input as TemplateRecipe } : {}) };
}

const STABLE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const SLOT_KEY_PATTERN = /^[a-z][A-Za-z0-9_]{0,63}$/;
const RATIO_PATTERN = /^(auto|[1-9][0-9]{0,3}:[1-9][0-9]{0,3})$/;
const LENGTH_UNITS = new Set(["px", "%", "rem", "vw", "vh"]);
const DISPLAY_VALUES = new Set(["block", "flex", "grid", "none"]);
const HEIGHT_MODES = new Set(["auto", "fit", "fill", "min-height", "aspect-ratio", "fixed", "viewport"]);
const SLOT_PROTOCOLS = new Set(["https", "page", "product", "category", "none"]);
const TOKEN_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/;
const SEMANTIC_TAGS = new Set(["section", "div", "header", "article", "aside", "nav"]);
const DIVIDER_STYLES = new Set(["solid", "dashed", "dotted"]);
const OBJECT_FITS = new Set(["cover", "contain", "fill"]);
const FONT_ROLES = new Set(["display", "heading", "body", "caption", "action"]);
const TEXT_ALIGNS = new Set(["left", "center", "right"]);
const SLOT_OVERFLOWS = new Set(["clip", "ellipsis", "wrap"]);

export const MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE = {
  heroTemplate: "首屏主视觉",
} as const satisfies Partial<Record<DynamicTemplateSlotType, string>>;

export const COMPLEX_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE = {} as const satisfies Partial<Record<DynamicTemplateSlotType, string>>;

export const CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE = {
  ...COMPLEX_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE,
  ...MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE,
} as const satisfies Partial<Record<DynamicTemplateSlotType, string>>;

export function getContentTemplateModuleTypeForSlotType(
  slotType: string,
): string | undefined {
  return Object.prototype.hasOwnProperty.call(CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE, slotType)
    ? CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE[
        slotType as keyof typeof CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE
      ]
    : undefined;
}

export const MATURE_CONTENT_TEMPLATE_MODULE_BY_NODE_TYPE = {
  HeroTemplate: "首屏主视觉",
} as const satisfies Partial<Record<DynamicTemplateNodeType, string>>;

export const COMPLEX_CONTENT_TEMPLATE_MODULE_BY_NODE_TYPE = {} as const satisfies Partial<Record<DynamicTemplateNodeType, string>>;

export const CONTENT_TEMPLATE_MODULE_BY_NODE_TYPE = {
  ...COMPLEX_CONTENT_TEMPLATE_MODULE_BY_NODE_TYPE,
  ...MATURE_CONTENT_TEMPLATE_MODULE_BY_NODE_TYPE,
} as const satisfies Partial<Record<DynamicTemplateNodeType, string>>;

export type MatureContentTemplateSlotType = keyof typeof MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE;

export function isMatureContentTemplateSlotType(
  value: string,
): value is MatureContentTemplateSlotType {
  return Object.prototype.hasOwnProperty.call(MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE, value);
}

export function getMatureContentTemplateSlotType(
  moduleType: string,
): MatureContentTemplateSlotType | undefined {
  return (Object.entries(MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE) as Array<[
    MatureContentTemplateSlotType,
    string,
  ]>).find(([, candidate]) => candidate === moduleType)?.[0];
}

const CONTENT_TEMPLATE_DESIGN_KEYS = new Set([
  "template", "spacing", "layout", "alignment", "textTone", "overlayPreset",
  "bgColor", "tone", "aspectRatio", "imageRatio", "desktopRatio", "mobileRatio",
  "maxHeight", "videoWidth",
  "desktopFocusX", "desktopFocusY", "mobileFocusX", "mobileFocusY", "focusX", "focusY",
  "mainFocusX", "mainFocusY", "detailFocusX", "detailFocusY", "mainImageRatio", "detailImageRatio",
  "leadFocusX", "leadFocusY", "detailOneFocusX", "detailOneFocusY",
  "detailTwoFocusX", "detailTwoFocusY", "leadImageRatio", "detailOneRatio", "detailTwoRatio",
  "showPrice", "showButton", "displayMode", "actionStyle", "mobileColumns",
]);

function containsC0ControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) <= 0x1f) return true;
  }
  return false;
}

export function sanitizeContentTemplateDesignProps(
  value: unknown,
): Record<string, string | number | boolean> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, string | number | boolean> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!CONTENT_TEMPLATE_DESIGN_KEYS.has(key)) continue;
    if (typeof candidate === "string" && candidate.length <= 64 && !containsC0ControlCharacter(candidate)) {
      result[key] = candidate;
    } else if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= -10000 && candidate <= 10000) {
      result[key] = candidate;
    } else if (typeof candidate === "boolean") {
      result[key] = candidate;
    }
  }
  return result;
}

/** @deprecated 兼容旧调用名；统一母模板不再区分成熟模板与复杂组件的设计参数。 */
export const sanitizeMatureContentTemplateDesignProps = sanitizeContentTemplateDesignProps;

const CONTENT_TEMPLATE_DESIGN_NODE_TYPES = new Set<DynamicTemplateNodeType>([
  ...Object.keys(MATURE_CONTENT_TEMPLATE_MODULE_BY_NODE_TYPE) as DynamicTemplateNodeType[],
]);

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function containsLegacyNumericProductReference(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsLegacyNumericProductReference);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) => (
    /productIds?$/i.test(key)
      ? (Array.isArray(nested) ? nested.some((item) => typeof item === "number") : typeof nested === "number")
      : containsLegacyNumericProductReference(nested)
  ));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isDynamicTemplateStructureLocked(
  node: TemplateDefinitionV2["nodes"][string] | undefined,
): boolean {
  return node?.authoring?.structureLocked === true;
}

function findDynamicTemplateParentIdForLock(
  definition: TemplateDefinitionV2,
  nodeId: string,
): string | null {
  for (const node of Object.values(definition.nodes)) {
    if (node.childIds.includes(nodeId)) return node.nodeId;
  }
  return null;
}

export function getDynamicTemplateStructureLockOwnerId(
  definition: TemplateDefinitionV2,
  nodeId: string,
): string | null {
  const visited = new Set<string>();
  let currentId: string | null = nodeId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    if (isDynamicTemplateStructureLocked(definition.nodes[currentId])) return currentId;
    currentId = findDynamicTemplateParentIdForLock(definition, currentId);
  }
  return null;
}

export function isDynamicTemplateStructureProtected(
  definition: TemplateDefinitionV2,
  nodeId: string,
): boolean {
  return getDynamicTemplateStructureLockOwnerId(definition, nodeId) !== null;
}

export function getDynamicTemplateStructureProtectedNodeIds(
  definition: TemplateDefinitionV2,
): Set<string> {
  const protectedNodeIds = new Set<string>();
  const pending = Object.values(definition.nodes)
    .filter(isDynamicTemplateStructureLocked)
    .map((node) => node.nodeId);
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (protectedNodeIds.has(nodeId)) continue;
    protectedNodeIds.add(nodeId);
    pending.push(...(definition.nodes[nodeId]?.childIds ?? []));
  }
  return protectedNodeIds;
}

function definitionWithoutNodeAuthoring(definition: TemplateDefinitionV2) {
  return {
    ...definition,
    nodes: Object.fromEntries(Object.entries(definition.nodes).map(([nodeId, node]) => {
      const runtimeNode = { ...node };
      delete runtimeNode.authoring;
      return [nodeId, runtimeNode];
    })),
  };
}

function getContinuouslyLockedStructureOwnerId(
  previous: TemplateDefinitionV2,
  next: TemplateDefinitionV2,
  nodeId: string,
): string | null {
  const visited = new Set<string>();
  let currentId: string | null = nodeId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    if (
      isDynamicTemplateStructureLocked(previous.nodes[currentId])
      && isDynamicTemplateStructureLocked(next.nodes[currentId])
    ) {
      return currentId;
    }
    currentId = findDynamicTemplateParentIdForLock(previous, currentId);
  }
  return null;
}

export function getDynamicTemplateStructureLockViolation(
  previous: TemplateDefinitionV2,
  next: TemplateDefinitionV2,
  options: { mode?: "command" | "persistenceSnapshot" } = {},
): string | null {
  const persistenceSnapshot = options.mode === "persistenceSnapshot";
  const sharedNodeIds = Object.keys(previous.nodes).filter((nodeId) => next.nodes[nodeId]);
  const lockStateChanged = sharedNodeIds.some((nodeId) => (
    isDynamicTemplateStructureLocked(previous.nodes[nodeId])
      !== isDynamicTemplateStructureLocked(next.nodes[nodeId])
  )) || Object.keys(next.nodes).some((nodeId) => (
    !previous.nodes[nodeId] && isDynamicTemplateStructureLocked(next.nodes[nodeId])
  ));
  if (
    !persistenceSnapshot
    &&
    lockStateChanged
    && canonicalJson(definitionWithoutNodeAuthoring(previous))
      !== canonicalJson(definitionWithoutNodeAuthoring(next))
  ) {
    return "结构锁定或解锁必须作为独立操作，不能同时修改模板结构。";
  }

  for (const previousNode of Object.values(previous.nodes)) {
    const lockOwnerId = persistenceSnapshot
      ? getContinuouslyLockedStructureOwnerId(previous, next, previousNode.nodeId)
      : getDynamicTemplateStructureLockOwnerId(previous, previousNode.nodeId);
    if (!lockOwnerId) continue;
    const lockOwner = previous.nodes[lockOwnerId];
    const lockLabel = `“${lockOwner?.name ?? previousNode.name}”已锁定`;
    if (previousNode.nodeId === previous.rootNodeId && (
      previous.metadata.previewDesktopWidth !== next.metadata.previewDesktopWidth
      || previous.metadata.previewMobileWidth !== next.metadata.previewMobileWidth
    )) return `${lockLabel}，不能修改模板设计宽度。`;
    const nextNode = next.nodes[previousNode.nodeId];
    if (!nextNode) return `${lockLabel}，不能删除其结构。`;
    const previousParentId = findDynamicTemplateParentIdForLock(previous, previousNode.nodeId);
    const nextParentId = findDynamicTemplateParentIdForLock(next, previousNode.nodeId);
    if (previousParentId !== nextParentId) {
      return `${lockLabel}，不能改变其内部节点的父级。`;
    }
    if (previousParentId && nextParentId) {
      const before = previous.nodes[previousParentId].childIds;
      const after = next.nodes[nextParentId].childIds;
      // 新增或删除未锁定兄弟会自然回流；锁保护的是存续兄弟之间的相对顺序。
      const shared = new Set(before.filter((id) => after.includes(id)));
      const beforeLocked = before.slice(0, before.indexOf(previousNode.nodeId)).filter((id) => shared.has(id));
      const afterLocked = after.slice(0, after.indexOf(previousNode.nodeId)).filter((id) => shared.has(id));
      if (canonicalJson(beforeLocked.sort()) !== canonicalJson(afterLocked.sort())) return `${lockLabel}，不能改变其内部节点的同级顺序。`;
    }
    if (canonicalJson(previousNode.childIds) !== canonicalJson(nextNode.childIds)) {
      return `${lockLabel}，不能改变子节点结构。`;
    }
    if (canonicalJson(previousNode.responsive) !== canonicalJson(nextNode.responsive)) {
      return `${lockLabel}，不能改变其内部节点的位置或尺寸。`;
    }
    if (previousNode.hidden !== nextNode.hidden || previousNode.name !== nextNode.name) {
      return `${lockLabel}，请先解除锁定。`;
    }
    if (previousNode.type !== nextNode.type
      || previousNode.slotId !== nextNode.slotId
      || canonicalJson(previousNode.props) !== canonicalJson(nextNode.props)
      || canonicalJson(previousNode.instanceEditPolicy) !== canonicalJson(nextNode.instanceEditPolicy)) {
      return `${lockLabel}，不能改变其内部节点的模板构图。`;
    }
    if (previousNode.slotId) {
      const previousSlot = previous.slots[previousNode.slotId];
      const nextSlot = next.slots[previousNode.slotId];
      if (!nextSlot) return `${lockLabel}，不能删除内容槽位。`;
      if (canonicalJson(previous.defaultContent[previousNode.slotId]) !== canonicalJson(next.defaultContent[previousNode.slotId])) {
        return `${lockLabel}，不能修改默认内容。`;
      }
      if (canonicalJson(previousSlot.desktopRules) !== canonicalJson(nextSlot.desktopRules)
        || canonicalJson(previousSlot.mobileRules) !== canonicalJson(nextSlot.mobileRules)) {
        return `${lockLabel}，不能改变其内部槽位布局。`;
      }
    }
  }
  return null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isStableId(value: unknown): value is string {
  return typeof value === "string" && STABLE_ID_PATTERN.test(value);
}

function addIssue(
  issues: DynamicTemplateValidationIssue[],
  issue: DynamicTemplateValidationIssue,
) {
  issues.push(issue);
}

function validateKnownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  issues: DynamicTemplateValidationIssue[],
  identity: Pick<DynamicTemplateValidationIssue, "nodeId" | "slotId"> = {},
) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (allowed.has(key)) continue;
    addIssue(issues, {
      level: "error",
      code: "UNKNOWN_PROPERTY",
      path: path ? `${path}.${key}` : key,
      ...identity,
      message: `字段 ${key} 未在当前 TemplateDefinition Schema 中声明。`,
    });
  }
}

function validateInstanceEditPolicy(
  value: unknown,
  path: string,
  issues: DynamicTemplateValidationIssue[],
  nodeId: string,
) {
  if (value === undefined) return;
  if (!isRecord(value)) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_INSTANCE_EDIT_POLICY",
      path,
      nodeId,
      message: "页面实例编辑策略必须是对象。",
    });
    return;
  }
  validateKnownKeys(value, [
    "position", "size", "zIndex", "imageFit", "imageFocus", "typography", "spacing",
    "minWidthPercent", "maxWidthPercent", "maxOffsetPercent",
    "minFontSizePx", "maxFontSizePx", "maxSpacingPx",
  ], path, issues, { nodeId });
  for (const key of ["position", "size", "zIndex"] as const) {
    if (typeof value[key] !== "boolean") {
      addIssue(issues, {
        level: "error",
        code: "INVALID_INSTANCE_EDIT_PERMISSION",
        path: `${path}.${key}`,
        nodeId,
        message: `${key} 必须是布尔值。`,
      });
    }
  }
  for (const key of ["imageFit", "imageFocus", "typography", "spacing"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") {
      addIssue(issues, {
        level: "error",
        code: "INVALID_INSTANCE_EDIT_PERMISSION",
        path: `${path}.${key}`,
        nodeId,
        message: `${key} 必须是布尔值。`,
      });
    }
  }
  const ranges = {
    minWidthPercent: [10, 100],
    maxWidthPercent: [100, 200],
    maxOffsetPercent: [0, 50],
  } as const;
  for (const [key, [minimum, maximum]] of Object.entries(ranges)) {
    const candidate = value[key];
    if (!isFiniteNumber(candidate) || candidate < minimum || candidate > maximum) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_INSTANCE_EDIT_BOUND",
        path: `${path}.${key}`,
        nodeId,
        message: `${key} 必须在 ${minimum}–${maximum} 范围内。`,
      });
    }
  }
  const optionalRanges = {
    minFontSizePx: [8, 72],
    maxFontSizePx: [12, 200],
    maxSpacingPx: [0, 200],
  } as const;
  for (const [key, [minimum, maximum]] of Object.entries(optionalRanges)) {
    const candidate = value[key];
    if (candidate !== undefined && (!isFiniteNumber(candidate) || candidate < minimum || candidate > maximum)) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_INSTANCE_EDIT_BOUND",
        path: `${path}.${key}`,
        nodeId,
        message: `${key} 必须在 ${minimum}–${maximum} 范围内。`,
      });
    }
  }
  if (
    isFiniteNumber(value.minWidthPercent)
    && isFiniteNumber(value.maxWidthPercent)
    && value.minWidthPercent > value.maxWidthPercent
  ) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_INSTANCE_WIDTH_RANGE",
      path,
      nodeId,
      message: "页面实例最小宽度不能大于最大宽度。",
    });
  }
  if (
    isFiniteNumber(value.minFontSizePx)
    && isFiniteNumber(value.maxFontSizePx)
    && value.minFontSizePx > value.maxFontSizePx
  ) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_INSTANCE_FONT_SIZE_RANGE",
      path,
      nodeId,
      message: "页面实例最小字号不能大于最大字号。",
    });
  }
}

function validateLength(
  value: unknown,
  path: string,
  issues: DynamicTemplateValidationIssue[],
  nodeId?: string,
): value is DynamicTemplateLength {
  if (isRecord(value)) validateKnownKeys(value, ["value", "unit"], path, issues, { nodeId });
  if (!isRecord(value)
    || !isFiniteNumber(value.value)
    || value.value < 0
    || value.value > 10000
    || typeof value.unit !== "string"
    || !LENGTH_UNITS.has(value.unit)) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_LENGTH",
      path,
      nodeId,
      message: "尺寸必须包含 0–10000 的有限数值和受支持单位。",
    });
    return false;
  }
  return true;
}

function validateHeightRule(
  value: unknown,
  path: string,
  issues: DynamicTemplateValidationIssue[],
  nodeId: string,
) {
  if (!isRecord(value) || typeof value.mode !== "string" || !HEIGHT_MODES.has(value.mode)) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_HEIGHT_RULE",
      path,
      nodeId,
      message: "高度策略必须是 auto、min-height、aspect-ratio、fixed 或 viewport。",
    });
    return;
  }
  validateKnownKeys(value, ["mode", "value", "ratio"], path, issues, { nodeId });
  if (["min-height", "fixed", "viewport"].includes(value.mode)) {
    if (!validateLength(value.value, `${path}.value`, issues, nodeId)) return;
    if (value.mode === "viewport" && isRecord(value.value) && !["vh", "vw"].includes(String(value.value.unit))) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_VIEWPORT_HEIGHT_UNIT",
        path: `${path}.value.unit`,
        nodeId,
        message: "viewport 高度策略只能使用 vh 或 vw。",
      });
    }
  } else if (value.value !== undefined) {
    addIssue(issues, {
      level: "warning",
      code: "UNUSED_HEIGHT_VALUE",
      path: `${path}.value`,
      nodeId,
      message: `高度策略 ${value.mode} 不会使用 value。`,
    });
  }
  if (value.mode === "aspect-ratio") {
    if (!isRecord(value.ratio)
      || !isFiniteNumber(value.ratio.width)
      || !isFiniteNumber(value.ratio.height)
      || value.ratio.width <= 0
      || value.ratio.height <= 0
      || value.ratio.width > 1000
      || value.ratio.height > 1000) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_ASPECT_RATIO",
        path: `${path}.ratio`,
        nodeId,
        message: "aspect-ratio 高度策略必须提供有效的宽高比例。",
      });
    }
    if (isRecord(value.ratio)) {
      validateKnownKeys(value.ratio, ["width", "height"], `${path}.ratio`, issues, { nodeId });
    }
  } else if (value.ratio !== undefined) {
    addIssue(issues, {
      level: "warning",
      code: "UNUSED_HEIGHT_RATIO",
      path: `${path}.ratio`,
      nodeId,
      message: `高度策略 ${value.mode} 不会使用 ratio。`,
    });
  }
}

function validateResponsiveRules(
  value: unknown,
  path: string,
  issues: DynamicTemplateValidationIssue[],
  nodeId: string,
  schemaVersion = 1,
): value is DynamicTemplateResponsiveRules {
  if (!isRecord(value)) {
    addIssue(issues, {
      level: "error",
      code: "MISSING_RESPONSIVE_RULES",
      path,
      nodeId,
      message: "缺少响应式几何规则。",
    });
    return false;
  }
  validateKnownKeys(value, [
    "display", "direction", "order", "width", "height", "maxWidth", "minHeight", "gap",
    "padding", "margin", "alignItems", "justifyContent", "columns", "backgroundToken",
    "borderToken", "radius", "overflow", "layoutMode", "placement",
    ...(schemaVersion >= 2 ? ["wrap", "minWidth", "maxHeight", "anchor", "hidden"] : []),
    ...(schemaVersion >= 3 ? ["backgroundColor", "backgroundImage", "backgroundGradient", "opacity"] : []),
  ], path, issues, { nodeId });
  for (const key of ["backgroundColor"] as const) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || !TEMPLATE_COLOR_PATTERN.test(value[key]))) {
      addIssue(issues, { level: "error", code: "INVALID_TEMPLATE_COLOR", path: `${path}.${key}`, nodeId, message: "颜色必须是十六进制颜色。" });
    }
  }
  if (value.backgroundImage !== undefined && value.backgroundImage !== "" && !isSafeTemplateMediaUrl(value.backgroundImage)) {
    addIssue(issues, { level: "error", code: "INVALID_TEMPLATE_MEDIA", path: `${path}.backgroundImage`, nodeId, message: "背景图片地址无效。" });
  }
  if (value.opacity !== undefined && (!isFiniteNumber(value.opacity) || value.opacity < 0 || value.opacity > 1)) {
    addIssue(issues, { level: "error", code: "INVALID_TEMPLATE_OPACITY", path: `${path}.opacity`, nodeId, message: "透明度必须在 0–1 之间。" });
  }
  if (value.backgroundGradient !== undefined && value.backgroundGradient !== null) {
    const gradient = value.backgroundGradient;
    if (!isRecord(gradient) || ![gradient.from, gradient.to].every((color) => typeof color === "string" && TEMPLATE_COLOR_PATTERN.test(color))
      || !isFiniteNumber(gradient.angle) || gradient.angle < 0 || gradient.angle > 360) {
      addIssue(issues, { level: "error", code: "INVALID_TEMPLATE_GRADIENT", path: `${path}.backgroundGradient`, nodeId, message: "渐变需要有效颜色和 0–360 度角度。" });
    } else validateKnownKeys(gradient, ["from", "to", "angle"], `${path}.backgroundGradient`, issues, { nodeId });
  }
  if (value.hidden !== undefined && typeof value.hidden !== "boolean") {
    addIssue(issues, { level: "error", code: "INVALID_BREAKPOINT_HIDDEN", path: `${path}.hidden`, nodeId, message: "断点隐藏必须是布尔值。" });
  }
  if (schemaVersion === 1 && isRecord(value.height) && ["fit", "fill"].includes(String(value.height.mode))) {
    addIssue(issues, { level: "error", code: "UNSUPPORTED_HEIGHT_MODE", path: `${path}.height.mode`, nodeId, message: "旧模板不支持此高度策略。" });
  }
  if (value.wrap !== undefined && !["nowrap", "wrap"].includes(String(value.wrap))) {
    addIssue(issues, { level: "error", code: "INVALID_WRAP", path: `${path}.wrap`, nodeId, message: "换行规则必须是 nowrap 或 wrap。" });
  }
  if (value.anchor !== undefined) {
    const anchor = value.anchor;
    if (!isRecord(anchor)) {
      addIssue(issues, { level: "error", code: "INVALID_ANCHOR", path: `${path}.anchor`, nodeId, message: "锚点必须是完整定位规则。" });
    } else {
      validateKnownKeys(anchor, ["horizontal", "vertical", "offsetX", "offsetY"], `${path}.anchor`, issues, { nodeId });
      if (!["left", "center", "right"].includes(String(anchor.horizontal)) || !["top", "center", "bottom"].includes(String(anchor.vertical))) {
        addIssue(issues, { level: "error", code: "INVALID_ANCHOR", path: `${path}.anchor`, nodeId, message: "锚点方向无效。" });
      }
      for (const axis of ["offsetX", "offsetY"] as const) {
        const offset = anchor[axis];
        if (isRecord(offset)) validateKnownKeys(offset, ["value", "unit"], `${path}.anchor.${axis}`, issues, { nodeId });
        if (!isRecord(offset) || !isFiniteNumber(offset.value) || Math.abs(offset.value) > 10000 || !["px", "%"].includes(String(offset.unit))) {
          addIssue(issues, { level: "error", code: "INVALID_ANCHOR_OFFSET", path: `${path}.anchor.${axis}`, nodeId, message: "锚点偏移须为 -10000–10000 的 px 或百分比数值。" });
        }
      }
    }
  }
  if (typeof value.display !== "string" || !DISPLAY_VALUES.has(value.display)) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_DISPLAY",
      path: `${path}.display`,
      nodeId,
      message: "display 规则无效。",
    });
  }
  if (!Number.isInteger(value.order) || Number(value.order) < -100 || Number(value.order) > 100) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_ORDER",
      path: `${path}.order`,
      nodeId,
      message: "节点顺序必须是 -100 到 100 的整数。",
    });
  }
  if (value.direction !== undefined && !["row", "column"].includes(String(value.direction))) {
    addIssue(issues, { level: "error", code: "INVALID_DIRECTION", path: `${path}.direction`, nodeId, message: "direction 只能是 row 或 column。" });
  }
  if (value.alignItems !== undefined && !["start", "center", "end", "stretch"].includes(String(value.alignItems))) {
    addIssue(issues, { level: "error", code: "INVALID_ALIGN_ITEMS", path: `${path}.alignItems`, nodeId, message: "alignItems 值无效。" });
  }
  if (value.justifyContent !== undefined && !["start", "center", "end", "space-between", "space-around"].includes(String(value.justifyContent))) {
    addIssue(issues, { level: "error", code: "INVALID_JUSTIFY_CONTENT", path: `${path}.justifyContent`, nodeId, message: "justifyContent 值无效。" });
  }
  if (value.overflow !== undefined && !["visible", "hidden", "clip"].includes(String(value.overflow))) {
    addIssue(issues, { level: "error", code: "INVALID_OVERFLOW", path: `${path}.overflow`, nodeId, message: "overflow 值无效。" });
  }
  if (value.layoutMode !== undefined && !["flow", "free"].includes(String(value.layoutMode))) {
    addIssue(issues, { level: "error", code: "INVALID_LAYOUT_MODE", path: `${path}.layoutMode`, nodeId, message: "布局模式只能是 flow 或 free。" });
  }
  if (value.placement !== undefined) {
    if (!isRecord(value.placement)) {
      addIssue(issues, { level: "error", code: "INVALID_PLACEMENT", path: `${path}.placement`, nodeId, message: "自由层位置必须是完整的矩形对象。" });
    } else {
      validateKnownKeys(value.placement, ["x", "y", "width", "height", "zIndex"], `${path}.placement`, issues, { nodeId });
      for (const key of ["x", "y", "width", "height"] as const) {
        const coordinate = value.placement[key];
        const valid = typeof coordinate === "number"
          && Number.isFinite(coordinate)
          && coordinate >= 0
          && coordinate <= 1
          && (key === "x" || key === "y" || coordinate > 0);
        if (!valid) {
          addIssue(issues, { level: "error", code: "INVALID_PLACEMENT", path: `${path}.placement.${key}`, nodeId, message: `${key} 必须是 0–1 内的有效归一化数值，尺寸必须大于 0。` });
        }
      }
      if (!Number.isInteger(value.placement.zIndex) || Number(value.placement.zIndex) < -10 || Number(value.placement.zIndex) > 10) {
        addIssue(issues, { level: "error", code: "INVALID_PLACEMENT_Z_INDEX", path: `${path}.placement.zIndex`, nodeId, message: "自由层级必须是 -10 到 10 的整数。" });
      }
      if (typeof value.placement.x === "number" && typeof value.placement.width === "number" && value.placement.x + value.placement.width > 1.000001) {
        addIssue(issues, { level: "error", code: "PLACEMENT_OUT_OF_BOUNDS", path: `${path}.placement`, nodeId, message: "自由层不能超出父容器右边界。" });
      }
      if (typeof value.placement.y === "number" && typeof value.placement.height === "number" && value.placement.y + value.placement.height > 1.000001) {
        addIssue(issues, { level: "error", code: "PLACEMENT_OUT_OF_BOUNDS", path: `${path}.placement`, nodeId, message: "自由层不能超出父容器下边界。" });
      }
    }
  }
  for (const key of ["backgroundToken", "borderToken"] as const) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || !TOKEN_PATTERN.test(value[key]))) {
      addIssue(issues, { level: "error", code: "INVALID_STYLE_TOKEN", path: `${path}.${key}`, nodeId, message: `${key} 必须使用安全令牌标识。` });
    }
  }
  if (typeof value.width === "string") {
    if (!["auto", "fill", "fit"].includes(value.width)) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_WIDTH",
        path: `${path}.width`,
        nodeId,
        message: "宽度字符串必须是 auto、fill 或 fit。",
      });
    }
  } else {
    validateLength(value.width, `${path}.width`, issues, nodeId);
  }
  validateHeightRule(value.height, `${path}.height`, issues, nodeId);
  for (const key of ["minWidth", "maxWidth", "minHeight", "maxHeight", "gap", "radius"] as const) {
    if (value[key] !== undefined) validateLength(value[key], `${path}.${key}`, issues, nodeId);
  }
  if (schemaVersion >= 2) {
    for (const [minimum, maximum] of [["minWidth", "maxWidth"], ["minHeight", "maxHeight"]] as const) {
      const min = value[minimum];
      const max = value[maximum];
      if (isRecord(min) && isRecord(max) && min.unit === max.unit && isFiniteNumber(min.value) && isFiniteNumber(max.value) && min.value > max.value) {
        addIssue(issues, { level: "error", code: "CONFLICTING_SIZE_LIMITS", path: `${path}.${minimum}`, nodeId, message: "相同单位的最小尺寸不能大于最大尺寸。" });
      }
    }
  }
  for (const key of ["padding", "margin"] as const) {
    const spacing = value[key];
    if (spacing === undefined) continue;
    if (!isRecord(spacing)) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_BOX_SPACING",
        path: `${path}.${key}`,
        nodeId,
        message: `${key} 必须分别声明上、右、下、左。`,
      });
      continue;
    }
    validateKnownKeys(spacing, ["top", "right", "bottom", "left"], `${path}.${key}`, issues, { nodeId });
    for (const side of ["top", "right", "bottom", "left"] as const) {
      validateLength(spacing[side], `${path}.${key}.${side}`, issues, nodeId);
    }
  }
  if (value.columns !== undefined) {
    if (!Array.isArray(value.columns)
      || value.columns.length < 1
      || value.columns.length > 12
      || value.columns.some((column) => !isFiniteNumber(column) || column <= 0 || column > 100)) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_GRID_COLUMNS",
        path: `${path}.columns`,
        nodeId,
        message: "网格列必须包含 1–12 个大于 0 的有限比例值。",
      });
    } else if (value.display !== "grid") {
      addIssue(issues, {
        level: "warning",
        code: "UNUSED_GRID_COLUMNS",
        path: `${path}.columns`,
        nodeId,
        message: "非 Grid 布局不会使用 columns。",
      });
    }
  }
  return !issues.some((issue) => issue.level === "error" && issue.nodeId === nodeId && issue.path.startsWith(path));
}

function validateMetadata(value: unknown, issues: DynamicTemplateValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_METADATA",
      path: "metadata",
      message: "模板元数据缺失。",
    });
    return;
  }
  validateKnownKeys(value, DYNAMIC_TEMPLATE_METADATA_FIELDS, "metadata", issues);
  if (value.canvasSize !== undefined) {
    const size = value.canvasSize;
    if (!isRecord(size)) {
      addIssue(issues, { level: "error", code: "INVALID_CANVAS_SIZE", path: "metadata.canvasSize", message: "画布尺寸必须包含宽度、高度和比例。" });
    } else {
      validateKnownKeys(size, ["width", "height", "aspectRatio"], "metadata.canvasSize", issues);
      for (const key of ["width", "height"] as const) {
        if (typeof size[key] !== "number" || !Number.isInteger(size[key]) || size[key] < 1 || size[key] > 4096) {
          addIssue(issues, { level: "error", code: "INVALID_CANVAS_SIZE", path: `metadata.canvasSize.${key}`, message: "画布宽高必须是 1–4096 之间的整数像素值。" });
        }
      }
      if (typeof size.aspectRatio !== "number" || !Number.isFinite(size.aspectRatio) || size.aspectRatio <= 0
        || typeof size.width !== "number" || typeof size.height !== "number"
        || Math.abs(size.aspectRatio - size.width / size.height) > 1e-10) {
        addIssue(issues, { level: "error", code: "INVALID_CANVAS_ASPECT_RATIO", path: "metadata.canvasSize.aspectRatio", message: "画布比例必须与宽度和高度一致。" });
      }
    }
  }
  for (const [key, maxLength] of [
    ["category", DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH.category],
    ["purpose", DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH.purpose],
    ["layoutType", DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH.layoutType],
    ["slotSummary", DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH.slotSummary],
  ] as const) {
    if (!isNonEmptyString(value[key], maxLength)) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_METADATA_FIELD",
        path: `metadata.${key}`,
        message: `${key} 必须是有效的非空文字。`,
      });
    }
  }
  for (const key of ["desktopRatio", "mobileRatio"] as const) {
    if (typeof value[key] !== "string" || !RATIO_PATTERN.test(value[key])) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_METADATA_RATIO",
        path: `metadata.${key}`,
        message: `${key} 必须是 auto 或合法宽高比。`,
      });
    }
  }
  for (const [key, { minimum, maximum }] of Object.entries(
    DYNAMIC_TEMPLATE_METADATA_INTEGER_BOUNDS,
  )) {
    const width = value[key];
    if (width !== undefined && (typeof width !== "number" || !Number.isInteger(width) || width < minimum || width > maximum)) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_METADATA_WIDTH",
        path: `metadata.${key}`,
        message: `${key} 必须是 ${minimum}–${maximum} 之间的整数像素值。`,
      });
    }
  }
  const minViewportWidth = value.minViewportWidth;
  const maxViewportWidth = value.maxViewportWidth;
  if (Number.isInteger(minViewportWidth)
    && Number.isInteger(maxViewportWidth)
    && Number(minViewportWidth) > Number(maxViewportWidth)) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_METADATA_WIDTH_RANGE",
      path: "metadata.maxViewportWidth",
      message: "最大适用宽度不能小于最小适用宽度。",
    });
  }
  if (value.defaultBackgroundToken !== undefined
    && (typeof value.defaultBackgroundToken !== "string" || !TOKEN_PATTERN.test(value.defaultBackgroundToken))) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_BACKGROUND_TOKEN",
      path: "metadata.defaultBackgroundToken",
      message: "默认背景必须使用合法的设计令牌。",
    });
  }
  if (value.visualRole !== undefined
    && !["primary-stage", "feature-stage", "support-stage"].includes(String(value.visualRole))) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_VISUAL_ROLE",
      path: "metadata.visualRole",
      message: "visualRole 必须是首屏主舞台、重点内容或辅助内容。",
    });
  }
  if (value.headerCompatibility !== undefined) {
    const items = value.headerCompatibility;
    if (!Array.isArray(items)
      || items.length < 1
      || items.length > 2
      || new Set(items).size !== items.length
      || items.some((item) => !["solid", "overlay-light"].includes(String(item)))) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_HEADER_COMPATIBILITY",
        path: "metadata.headerCompatibility",
        message: "导航兼容模式必须从 solid 与 overlay-light 中选择且不能重复。",
      });
    }
  }
  for (const [key, maxItems, maxLength] of [
    [
      "recommendedFor",
      DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS.recommendedFor.maxItems,
      DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS.recommendedFor.maxItemLength,
    ],
    [
      "tags",
      DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS.tags.maxItems,
      DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS.tags.maxItemLength,
    ],
  ] as const) {
    const items = value[key];
    if (!Array.isArray(items)
      || items.length > maxItems
      || new Set(items).size !== items.length
      || items.some((item) => !isNonEmptyString(item, maxLength))) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_METADATA_LIST",
        path: `metadata.${key}`,
        message: `${key} 必须是去重且数量受限的文字列表。`,
      });
    }
  }
}

function validateSlotRules(
  value: unknown,
  path: string,
  issues: DynamicTemplateValidationIssue[],
  slotId: string,
  schemaVersion = 1,
) {
  if (!isRecord(value)) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_SLOT_RULES",
      path,
      slotId,
      message: "槽位设备规则必须是对象。",
    });
    return;
  }
  validateKnownKeys(value, [
    "aspectRatio", "objectFit", "objectPosition", "fontRole", "fontSize", "fontWeight",
    "lineHeight", "textAlign", "maxLines", "overflow",
    ...(schemaVersion >= 3 ? ["fontFamily", "color", "letterSpacing"] : []),
  ], path, issues, { slotId });
  if (value.fontFamily !== undefined && !["system", "serif", "sans"].includes(String(value.fontFamily))) {
    addIssue(issues, { level: "error", code: "INVALID_TEMPLATE_FONT", path: `${path}.fontFamily`, slotId, message: "字体选项无效。" });
  }
  if (value.color !== undefined && (typeof value.color !== "string" || !TEMPLATE_COLOR_PATTERN.test(value.color))) {
    addIssue(issues, { level: "error", code: "INVALID_TEMPLATE_COLOR", path: `${path}.color`, slotId, message: "颜色必须是十六进制颜色。" });
  }
  if (value.letterSpacing !== undefined && (!isFiniteNumber(value.letterSpacing) || value.letterSpacing < -10 || value.letterSpacing > 100)) {
    addIssue(issues, { level: "error", code: "INVALID_TEMPLATE_LETTER_SPACING", path: `${path}.letterSpacing`, slotId, message: "字间距必须在 -10–100 之间。" });
  }
  if (value.aspectRatio !== undefined
    && (typeof value.aspectRatio !== "string" || !RATIO_PATTERN.test(value.aspectRatio))) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_SLOT_RATIO",
      path: `${path}.aspectRatio`,
      slotId,
      message: "槽位比例必须是 auto 或合法宽高比。",
    });
  }
  if (value.objectPosition !== undefined
    && (typeof value.objectPosition !== "string"
      || (!/^(left|center|right) (top|center|bottom)$/.test(value.objectPosition)
        && !(schemaVersion >= 2 && /^(100(?:\.0+)?|[0-9]{1,2}(?:\.[0-9]+)?)% (100(?:\.0+)?|[0-9]{1,2}(?:\.[0-9]+)?)%$/.test(value.objectPosition))))) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_OBJECT_POSITION",
      path: `${path}.objectPosition`,
      slotId,
      message: "图片位置必须是水平/垂直预设，或 schema2 的 0–100% 精确焦点。",
    });
  }
  if (value.objectFit !== undefined && !OBJECT_FITS.has(String(value.objectFit))) {
    addIssue(issues, { level: "error", code: "INVALID_OBJECT_FIT", path: `${path}.objectFit`, slotId, message: "objectFit 值无效。" });
  }
  if (value.fontRole !== undefined && !FONT_ROLES.has(String(value.fontRole))) {
    addIssue(issues, { level: "error", code: "INVALID_FONT_ROLE", path: `${path}.fontRole`, slotId, message: "fontRole 值无效。" });
  }
  if (value.fontWeight !== undefined && (!Number.isInteger(value.fontWeight) || Number(value.fontWeight) < 100 || Number(value.fontWeight) > 900 || Number(value.fontWeight) % 100 !== 0)) {
    addIssue(issues, { level: "error", code: "INVALID_FONT_WEIGHT", path: `${path}.fontWeight`, slotId, message: "fontWeight 必须是 100–900 的整百数。" });
  }
  if (value.lineHeight !== undefined && (!isFiniteNumber(value.lineHeight) || value.lineHeight < 0.8 || value.lineHeight > 3)) {
    addIssue(issues, { level: "error", code: "INVALID_LINE_HEIGHT", path: `${path}.lineHeight`, slotId, message: "lineHeight 必须在 0.8–3 之间。" });
  }
  if (value.textAlign !== undefined && !TEXT_ALIGNS.has(String(value.textAlign))) {
    addIssue(issues, { level: "error", code: "INVALID_TEXT_ALIGN", path: `${path}.textAlign`, slotId, message: "textAlign 值无效。" });
  }
  if (value.maxLines !== undefined && (!Number.isInteger(value.maxLines) || Number(value.maxLines) < 1 || Number(value.maxLines) > DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES)) {
    addIssue(issues, { level: "error", code: "INVALID_MAX_LINES", path: `${path}.maxLines`, slotId, message: `maxLines 必须是 1–${DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES} 的整数。` });
  }
  if (value.overflow !== undefined && !SLOT_OVERFLOWS.has(String(value.overflow))) {
    addIssue(issues, { level: "error", code: "INVALID_SLOT_OVERFLOW", path: `${path}.overflow`, slotId, message: "槽位 overflow 值无效。" });
  }
  if (value.fontSize !== undefined) validateLength(value.fontSize, `${path}.fontSize`, issues);
}

const ACTION_CONTENT_KEYS = [
  "targetType", "pagePath", "url", "productCode", "categorySlug", "linkUrl",
] as const;

function hasOnlyKnownKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasValidOptionalStrings(value: Record<string, unknown>, keys: readonly string[]) {
  return keys.every((key) => value[key] === undefined || typeof value[key] === "string");
}

function hasValidActionContent(value: Record<string, unknown>) {
  return (value.targetType === undefined
      || ["none", "page", "product", "category", "external"].includes(String(value.targetType)))
    && hasValidOptionalStrings(value, ["pagePath", "url", "productCode", "categorySlug", "linkUrl"]);
}

function hasValidPercent(value: unknown) {
  return isFiniteNumber(value) && value >= 0 && value <= 100;
}

function hasValidHotspotItems(value: unknown) {
  if (!Array.isArray(value) || value.length > 20) return false;
  return value.every((item) => {
    if (!isRecord(item) || !hasOnlyKnownKeys(item, [
      "x", "y", "width", "height", "label", "link", ...ACTION_CONTENT_KEYS,
    ])) return false;
    if (![item.x, item.y, item.width, item.height].every(hasValidPercent)) return false;
    if (Number(item.width) <= 0 || Number(item.height) <= 0) return false;
    if (Number(item.x) + Number(item.width) > 100 || Number(item.y) + Number(item.height) > 100) return false;
    return hasValidOptionalStrings(item, ["label", "link"])
      && hasValidActionContent(item);
  });
}

function hasValidStableReferenceList(value: unknown, maximum: number) {
  if (!Array.isArray(value) || value.length > maximum) return false;
  const normalized = value.map((item) => typeof item === "string" ? item.trim() : "");
  return normalized.every((item) => item.length > 0 && item.length <= 128)
    && new Set(normalized).size === normalized.length;
}

export function validateDynamicTemplateSlotContent(
  slotType: DynamicTemplateSlotType,
  value: unknown,
): boolean {
  if (value === null) return true;
  if (["heading", "text", "richText", "badge", "icon"].includes(slotType)) {
    return typeof value === "string";
  }
  if (slotType === "image") {
    return typeof value === "string"
      || (isRecord(value)
        && typeof value.src === "string"
        && (value.alt === undefined || typeof value.alt === "string"));
  }
  if (["button", "link"].includes(slotType)) {
    return isRecord(value)
      && typeof value.label === "string"
      && (value.targetType === undefined || typeof value.targetType === "string");
  }
  if (slotType === "product") return typeof value === "string";
  if (slotType === "collection") {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
  }
  if (isMatureContentTemplateSlotType(slotType)) {
    if (!isRecord(value) || containsLegacyNumericProductReference(value)) return false;
    const moduleType = MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE[slotType];
    const sanitized = sanitizeContentTemplateDefaultContent(moduleType, value);
    return Boolean(sanitized && canonicalJson(sanitized) === canonicalJson(value));
  }
  return false;
}

export function validateDynamicTemplateDefinition(input: unknown): DynamicTemplateValidationResult {
  const issues: DynamicTemplateValidationIssue[] = [];
  if (!isRecord(input)) {
    return {
      valid: false,
      issues: [{
        level: "error",
        code: "INVALID_DEFINITION",
        path: "",
        message: "模板定义必须是对象。",
      }],
    };
  }
  validateKnownKeys(input, [
    "schemaVersion", "templateId", "name", "description", "metadata",
    "rootNodeId", "nodes", "slots", "defaultContent", "previewContent",
    ...(input.schemaVersion === 3 ? ["templateRecipe"] : []),
  ], "", issues);

  const schemaVersion = input.schemaVersion === 3 ? 3 : input.schemaVersion === 2 ? 2 : 1;
  if (input.templateRecipe !== undefined) issues.push(...validateTemplateRecipe(input.templateRecipe).issues);
  if (!(DYNAMIC_TEMPLATE_SUPPORTED_SCHEMA_VERSIONS as readonly unknown[]).includes(input.schemaVersion)) {
    addIssue(issues, {
      level: "error",
      code: "UNSUPPORTED_SCHEMA_VERSION",
      path: "schemaVersion",
      message: "当前仅支持母模板 schema v1 和 v2。",
    });
  }
  if (!isStableId(input.templateId)) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_TEMPLATE_ID",
      path: "templateId",
      message: "templateId 必须是稳定且可序列化的标识。",
    });
  }
  if (!isNonEmptyString(input.name, 100)) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_TEMPLATE_NAME",
      path: "name",
      message: "模板名称不能为空且最多 100 个字符。",
    });
  }
  if (input.description !== undefined && (typeof input.description !== "string" || input.description.length > 500)) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_TEMPLATE_DESCRIPTION",
      path: "description",
      message: "模板描述最多 500 个字符。",
    });
  }
  validateMetadata(input.metadata, issues);
  if (isRecord(input.metadata)) {
    if (schemaVersion === 1 && input.metadata.previewTabletWidth !== undefined) {
      addIssue(issues, { level: "error", code: "UNSUPPORTED_TABLET_METADATA", path: "metadata.previewTabletWidth", message: "旧模板没有平板断点。" });
    }
    if (schemaVersion >= 2 && input.metadata.mobileBreakpoint !== undefined && input.metadata.mobileBreakpoint !== 767) {
      addIssue(issues, { level: "error", code: "INVALID_V2_BREAKPOINT", path: "metadata.mobileBreakpoint", message: "新模板使用 767/1023 固定断点边界。" });
    }
  }

  if (!isStableId(input.rootNodeId)) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_ROOT_NODE_ID",
      path: "rootNodeId",
      message: "rootNodeId 无效。",
    });
  }
  const nodes = isRecord(input.nodes) ? input.nodes : {};
  if (!isRecord(input.nodes) || Object.keys(nodes).length === 0 || Object.keys(nodes).length > 500) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_NODE_MAP",
      path: "nodes",
      message: "模板必须包含 1–500 个节点。",
    });
  }
  const slots = isRecord(input.slots) ? input.slots : {};
  if (!isRecord(input.slots) || Object.keys(slots).length > 250) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_SLOT_MAP",
      path: "slots",
      message: "槽位映射必须是对象且最多包含 250 个槽位。",
    });
  }
  const defaultContent = isRecord(input.defaultContent) ? input.defaultContent : {};
  if (!isRecord(input.defaultContent) || Object.keys(defaultContent).length > 250) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_DEFAULT_CONTENT",
      path: "defaultContent",
      message: "默认内容必须是以 slotId 为键的对象。",
    });
  }
  const previewContent = isRecord(input.previewContent) ? input.previewContent : {};
  if ((schemaVersion === 2 && Object.keys(defaultContent).length > 0) || (schemaVersion >= 2 && Object.keys(previewContent).length > 0)) {
    addIssue(issues, { level: "error", code: "TEMPLATE_TRIAL_CONTENT_NOT_PERSISTABLE", path: "defaultContent", message: "新模板不保存试排文字、图片或页面内容。" });
  }
  if (input.previewContent !== undefined
    && (!isRecord(input.previewContent) || Object.keys(previewContent).length > 250)) {
    addIssue(issues, {
      level: "error",
      code: "INVALID_PREVIEW_CONTENT",
      path: "previewContent",
      message: "预览示例必须是以 slotId 为键的对象。",
    });
  }

  const parentIds = new Map<string, string[]>();
  const referencedSlotIds = new Map<string, string[]>();
  for (const [nodeKey, rawNode] of Object.entries(nodes)) {
    const path = `nodes.${nodeKey}`;
    if (!isStableId(nodeKey) || !isRecord(rawNode)) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_NODE",
        path,
        nodeId: nodeKey,
        message: "节点必须使用稳定标识和对象结构。",
      });
      continue;
    }
    validateKnownKeys(rawNode, [
      "nodeId", "type", "name", "slotId", "childIds", "props", "authoring", "instanceEditPolicy", "responsive", "hidden",
    ], path, issues, { nodeId: nodeKey });
    if (rawNode.nodeId !== nodeKey) {
      addIssue(issues, {
        level: "error",
        code: "NODE_ID_MISMATCH",
        path: `${path}.nodeId`,
        nodeId: nodeKey,
        message: "节点映射键必须与 nodeId 相同。",
      });
    }
    if (!isDynamicTemplateNodeType(rawNode.type)) {
      addIssue(issues, {
        level: "error",
        code: "UNKNOWN_NODE_TYPE",
        path: `${path}.type`,
        nodeId: nodeKey,
        message: "节点类型未在母模板合同中登记。",
      });
      continue;
    }
    const type = rawNode.type;
    const registry = getDynamicTemplateNodeRegistryEntry(type);
    if (rawNode.authoring !== undefined) {
      if (!isRecord(rawNode.authoring)) {
        addIssue(issues, {
          level: "error",
          code: "INVALID_NODE_AUTHORING",
          path: `${path}.authoring`,
          nodeId: nodeKey,
          message: "authoring 必须是受控模板作者属性对象。",
        });
      } else {
        validateKnownKeys(
          rawNode.authoring,
          ["structureLocked"],
          `${path}.authoring`,
          issues,
          { nodeId: nodeKey },
        );
        if (
          rawNode.authoring.structureLocked !== undefined
          && typeof rawNode.authoring.structureLocked !== "boolean"
        ) {
          addIssue(issues, {
            level: "error",
            code: "INVALID_STRUCTURE_LOCK",
            path: `${path}.authoring.structureLocked`,
            nodeId: nodeKey,
            message: "structureLocked 必须是布尔值。",
          });
        }
      }
    }
    validateInstanceEditPolicy(rawNode.instanceEditPolicy, `${path}.instanceEditPolicy`, issues, nodeKey);
    if (rawNode.instanceEditPolicy !== undefined && registry.kind !== "slot") {
      addIssue(issues, {
        level: "error",
        code: "STRUCTURE_NODE_HAS_INSTANCE_EDIT_POLICY",
        path: `${path}.instanceEditPolicy`,
        nodeId: nodeKey,
        message: "页面装修只能调整内容槽位，结构节点不能开放实例几何编辑。",
      });
    }
    if (typeof rawNode.hidden !== "boolean") {
      addIssue(issues, {
        level: "error",
        code: "INVALID_NODE_HIDDEN",
        path: `${path}.hidden`,
        nodeId: nodeKey,
        message: "hidden 必须是布尔值。",
      });
    }
    if (!isRecord(rawNode.props)) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_NODE_PROPS",
        path: `${path}.props`,
        nodeId: nodeKey,
        message: "props 必须是受控节点属性对象。",
      });
    } else {
      validateKnownKeys(rawNode.props, ["semanticTag", "dividerStyle", "spacerSize", "contentTemplateLayoutData", "contentTemplateDesignProps"], `${path}.props`, issues, { nodeId: nodeKey });
      if (rawNode.props.semanticTag !== undefined && !SEMANTIC_TAGS.has(String(rawNode.props.semanticTag))) {
        addIssue(issues, { level: "error", code: "INVALID_SEMANTIC_TAG", path: `${path}.props.semanticTag`, nodeId: nodeKey, message: "semanticTag 值无效。" });
      }
      if (rawNode.props.dividerStyle !== undefined && !DIVIDER_STYLES.has(String(rawNode.props.dividerStyle))) {
        addIssue(issues, { level: "error", code: "INVALID_DIVIDER_STYLE", path: `${path}.props.dividerStyle`, nodeId: nodeKey, message: "dividerStyle 值无效。" });
      }
      if (rawNode.props.spacerSize !== undefined) {
        validateLength(rawNode.props.spacerSize, `${path}.props.spacerSize`, issues, nodeKey);
      }
      const contentTemplateModuleType = CONTENT_TEMPLATE_MODULE_BY_NODE_TYPE[
        type as keyof typeof CONTENT_TEMPLATE_MODULE_BY_NODE_TYPE
      ];
      if (rawNode.props.contentTemplateLayoutData !== undefined) {
        if (!contentTemplateModuleType) {
          addIssue(issues, {
            level: "error",
            code: "UNEXPECTED_CONTENT_TEMPLATE_LAYOUT",
            path: `${path}.props.contentTemplateLayoutData`,
            nodeId: nodeKey,
            message: "只有内容模板合同节点可以保存内部构图。",
          });
        } else {
          const sanitizedLayout = sanitizeContentTemplateLayoutData(
            contentTemplateModuleType,
            rawNode.props.contentTemplateLayoutData,
          );
          if (!sanitizedLayout || canonicalJson(sanitizedLayout) !== canonicalJson(rawNode.props.contentTemplateLayoutData)) {
            addIssue(issues, {
              level: "error",
              code: "INVALID_CONTENT_TEMPLATE_LAYOUT",
              path: `${path}.props.contentTemplateLayoutData`,
              nodeId: nodeKey,
              message: "内容模板内部构图不符合对应模板合同。",
            });
          }
        }
      }
      if (rawNode.props.contentTemplateDesignProps !== undefined) {
        const sanitizedDesignProps = sanitizeContentTemplateDesignProps(
          rawNode.props.contentTemplateDesignProps,
        );
        if (!CONTENT_TEMPLATE_DESIGN_NODE_TYPES.has(type)) {
          addIssue(issues, {
            level: "error",
            code: "UNEXPECTED_CONTENT_TEMPLATE_DESIGN_PROPS",
            path: `${path}.props.contentTemplateDesignProps`,
            nodeId: nodeKey,
            message: "只有复杂内容组件可以保存母模板展示参数。",
          });
        } else if (!sanitizedDesignProps
          || canonicalJson(sanitizedDesignProps) !== canonicalJson(rawNode.props.contentTemplateDesignProps)) {
          addIssue(issues, {
            level: "error",
            code: "INVALID_CONTENT_TEMPLATE_DESIGN_PROPS",
            path: `${path}.props.contentTemplateDesignProps`,
            nodeId: nodeKey,
            message: "成熟内容模板展示参数包含未授权字段或非法数值。",
          });
        }
      }
    }
    if (!isNonEmptyString(rawNode.name, 100)) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_NODE_NAME",
        path: `${path}.name`,
        nodeId: nodeKey,
        message: "节点名称不能为空且最多 100 个字符。",
      });
    }
    const childIds = Array.isArray(rawNode.childIds) ? rawNode.childIds : [];
    if (!Array.isArray(rawNode.childIds)
      || childIds.length > 100
      || childIds.some((childId) => !isStableId(childId))) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_CHILD_IDS",
        path: `${path}.childIds`,
        nodeId: nodeKey,
        message: "childIds 必须是稳定节点标识列表且最多 100 项。",
      });
    }
    if (new Set(childIds).size !== childIds.length) {
      addIssue(issues, {
        level: "error",
        code: "DUPLICATE_CHILD_ID",
        path: `${path}.childIds`,
        nodeId: nodeKey,
        message: "同一父节点不能重复引用子节点。",
      });
    }
    if (!registry.canHaveChildren && childIds.length > 0) {
      addIssue(issues, {
        level: "error",
        code: "LEAF_NODE_HAS_CHILDREN",
        path: `${path}.childIds`,
        nodeId: nodeKey,
        message: `${type} 是叶节点，不能拥有子节点。`,
      });
    }
    for (const childId of childIds) {
      if (typeof childId !== "string") continue;
      parentIds.set(childId, [...(parentIds.get(childId) ?? []), nodeKey]);
    }
    if (!isRecord(rawNode.responsive)) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_RESPONSIVE_MAP",
        path: `${path}.responsive`,
        nodeId: nodeKey,
        message: "节点必须分别声明 desktop 和 mobile 几何。",
      });
    } else {
      validateKnownKeys(rawNode.responsive, schemaVersion >= 2 ? ["desktop", "tablet", "mobile"] : ["desktop", "mobile"], `${path}.responsive`, issues, { nodeId: nodeKey });
      validateResponsiveRules(rawNode.responsive.desktop, `${path}.responsive.desktop`, issues, nodeKey, schemaVersion);
      if (schemaVersion === 1) {
        validateResponsiveRules(rawNode.responsive.mobile, `${path}.responsive.mobile`, issues, nodeKey);
      } else {
        let effective = isRecord(rawNode.responsive.desktop) ? rawNode.responsive.desktop : {};
        for (const breakpoint of ["tablet", "mobile"] as const) {
          const override = rawNode.responsive[breakpoint];
          if (breakpoint === "tablet" && override === undefined) continue;
          if (!isRecord(override)) {
            addIssue(issues, { level: "error", code: "INVALID_RESPONSIVE_OVERRIDE", path: `${path}.responsive.${breakpoint}`, nodeId: nodeKey, message: "断点覆盖必须是属性对象。" });
            continue;
          }
          effective = mergeTemplateResponsiveRecord(effective, override);
          validateResponsiveRules(effective, `${path}.responsive.${breakpoint}`, issues, nodeKey, schemaVersion);
        }
      }
    }
    if (registry.kind === "slot") {
      if (!isStableId(rawNode.slotId)) {
        addIssue(issues, {
          level: "error",
          code: "MISSING_SLOT_ID",
          path: `${path}.slotId`,
          nodeId: nodeKey,
          message: `${type} 必须引用稳定 slotId。`,
        });
      } else {
        referencedSlotIds.set(rawNode.slotId, [...(referencedSlotIds.get(rawNode.slotId) ?? []), nodeKey]);
      }
    } else if (rawNode.slotId !== undefined) {
      addIssue(issues, {
        level: "error",
        code: "STRUCTURE_NODE_HAS_SLOT",
        path: `${path}.slotId`,
        nodeId: nodeKey,
        message: "结构节点不能引用内容槽位。",
      });
    }
  }

  const slotKeys = new Map<string, string>();
  for (const [slotKey, rawSlot] of Object.entries(slots)) {
    const path = `slots.${slotKey}`;
    if (!isStableId(slotKey) || !isRecord(rawSlot)) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_SLOT",
        path,
        slotId: slotKey,
        message: "槽位必须使用稳定标识和对象结构。",
      });
      continue;
    }
    validateKnownKeys(rawSlot, [
      "slotId", "key", "type", "label", "required", "editable", "hideable",
      "emptyPolicy", "validation", "desktopRules", "mobileRules",
      ...(schemaVersion >= 2 ? ["tabletRules"] : []),
      ...(schemaVersion >= 3 ? ["semanticRole"] : []),
    ], path, issues, { slotId: slotKey });
    if (rawSlot.semanticRole !== undefined && !isNonEmptyString(rawSlot.semanticRole, 64)) {
      addIssue(issues, { level: "error", code: "INVALID_SLOT_ROLE", path: `${path}.semanticRole`, slotId: slotKey, message: "槽位语义名称最多 64 个字符。" });
    }
    if (rawSlot.slotId !== slotKey) {
      addIssue(issues, {
        level: "error",
        code: "SLOT_ID_MISMATCH",
        path: `${path}.slotId`,
        slotId: slotKey,
        message: "槽位映射键必须与 slotId 相同。",
      });
    }
    if (typeof rawSlot.key !== "string" || !SLOT_KEY_PATTERN.test(rawSlot.key)) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_SLOT_KEY",
        path: `${path}.key`,
        slotId: slotKey,
        message: "字段 key 必须使用稳定的 camelCase 标识。",
      });
    } else if (slotKeys.has(rawSlot.key)) {
      addIssue(issues, {
        level: "error",
        code: "DUPLICATE_SLOT_KEY",
        path: `${path}.key`,
        slotId: slotKey,
        message: `字段 key 与 ${slotKeys.get(rawSlot.key)} 重复。`,
      });
    } else {
      slotKeys.set(rawSlot.key, slotKey);
    }
    if (!isDynamicTemplateSlotType(rawSlot.type)) {
      addIssue(issues, {
        level: "error",
        code: "UNKNOWN_SLOT_TYPE",
        path: `${path}.type`,
        slotId: slotKey,
        message: "槽位类型未在母模板合同中登记。",
      });
    }
    if (!isNonEmptyString(rawSlot.label, 100)) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_SLOT_LABEL",
        path: `${path}.label`,
        slotId: slotKey,
        message: "槽位名称不能为空且最多 100 个字符。",
      });
    }
    for (const key of ["required", "editable", "hideable"] as const) {
      if (typeof rawSlot[key] !== "boolean") {
        addIssue(issues, {
          level: "error",
          code: "INVALID_SLOT_PERMISSION",
          path: `${path}.${key}`,
          slotId: slotKey,
          message: `${key} 必须是布尔值。`,
        });
      }
    }
    if (rawSlot.emptyPolicy !== undefined
      && rawSlot.emptyPolicy !== "hide"
      && rawSlot.emptyPolicy !== "use-default") {
      addIssue(issues, {
        level: "error",
        code: "INVALID_SLOT_EMPTY_POLICY",
        path: `${path}.emptyPolicy`,
        slotId: slotKey,
        message: "空内容策略只能是 hide 或 use-default。",
      });
    }
    if (rawSlot.required === true && rawSlot.editable === false) {
      addIssue(issues, {
        level: "error",
        code: "REQUIRED_SLOT_MUST_BE_EDITABLE",
        path: `${path}.editable`,
        slotId: slotKey,
        message: "必填槽位必须允许页面实例填写真实内容。",
      });
    }
    if (!isRecord(rawSlot.validation)) {
      addIssue(issues, {
        level: "error",
        code: "INVALID_SLOT_VALIDATION",
        path: `${path}.validation`,
        slotId: slotKey,
        message: "槽位校验规则必须是对象。",
      });
    } else {
      validateKnownKeys(rawSlot.validation, [
        "minLength", "maxLength", "minItems", "maxItems", "recommendedWidth",
        "recommendedHeight", "allowedProtocols",
      ], `${path}.validation`, issues, { slotId: slotKey });
      const { minLength, maxLength, minItems, maxItems, allowedProtocols } = rawSlot.validation;
      const numericRanges = {
        minLength: [0, 100000],
        maxLength: [1, 100000],
        minItems: [0, 100],
        maxItems: [1, 100],
        recommendedWidth: [1, 20000],
        recommendedHeight: [1, 20000],
      } as const;
      for (const [key, [minimum, maximum]] of Object.entries(numericRanges)) {
        const value = rawSlot.validation[key];
        if (value !== undefined && (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum)) {
          addIssue(issues, {
            level: "error",
            code: "INVALID_SLOT_VALIDATION_NUMBER",
            path: `${path}.validation.${key}`,
            slotId: slotKey,
            message: `${key} 必须是 ${minimum}–${maximum} 的整数。`,
          });
        }
      }
      if (isFiniteNumber(minLength) && isFiniteNumber(maxLength) && minLength > maxLength) {
        addIssue(issues, {
          level: "error",
          code: "INVALID_LENGTH_RANGE",
          path: `${path}.validation`,
          slotId: slotKey,
          message: "minLength 不能大于 maxLength。",
        });
      }
      if (isFiniteNumber(minItems) && isFiniteNumber(maxItems) && minItems > maxItems) {
        addIssue(issues, {
          level: "error",
          code: "INVALID_ITEM_RANGE",
          path: `${path}.validation`,
          slotId: slotKey,
          message: "minItems 不能大于 maxItems。",
        });
      }
      if (allowedProtocols !== undefined
        && (!Array.isArray(allowedProtocols)
          || new Set(allowedProtocols).size !== allowedProtocols.length
          || allowedProtocols.some((protocol) => typeof protocol !== "string" || !SLOT_PROTOCOLS.has(protocol)))) {
        addIssue(issues, {
          level: "error",
          code: "INVALID_SLOT_PROTOCOL",
          path: `${path}.validation.allowedProtocols`,
          slotId: slotKey,
          message: "行动协议包含未允许的值。",
        });
      }
    }
    validateSlotRules(rawSlot.desktopRules, `${path}.desktopRules`, issues, slotKey, schemaVersion);
    validateSlotRules(rawSlot.mobileRules, `${path}.mobileRules`, issues, slotKey, schemaVersion);
    if (rawSlot.tabletRules !== undefined) validateSlotRules(rawSlot.tabletRules, `${path}.tabletRules`, issues, slotKey, schemaVersion);
  }

  const rootNodeId = typeof input.rootNodeId === "string" ? input.rootNodeId : "";
  const rawRoot = nodes[rootNodeId];
  if (!isRecord(rawRoot) || !isDynamicTemplateNodeType(rawRoot.type)) {
    addIssue(issues, {
      level: "error",
      code: "ROOT_NODE_NOT_FOUND",
      path: "rootNodeId",
      nodeId: rootNodeId,
      message: "根节点不存在或类型无效。",
    });
  } else {
    const rootRegistry = getDynamicTemplateNodeRegistryEntry(rawRoot.type);
    if (!rootRegistry.rootOnly || rawRoot.type !== "Section") {
      addIssue(issues, {
        level: "error",
        code: "INVALID_ROOT_NODE_TYPE",
        path: `nodes.${rootNodeId}.type`,
        nodeId: rootNodeId,
        message: "根节点必须是 Section。",
      });
    }
    if (rawRoot.hidden === true) {
      addIssue(issues, {
        level: "error",
        code: "HIDDEN_ROOT_NODE",
        path: `nodes.${rootNodeId}.hidden`,
        nodeId: rootNodeId,
        message: "模板根节点不能隐藏。",
      });
    }
  }

  const readRules = (rawNode: Record<string, unknown>, breakpoint: "desktop" | "tablet" | "mobile") => {
    if (!isRecord(rawNode.responsive)) return undefined;
    if (schemaVersion === 1) return isRecord(rawNode.responsive[breakpoint]) ? rawNode.responsive[breakpoint] : undefined;
    if (!isRecord(rawNode.responsive.desktop)) return undefined;
    let result = rawNode.responsive.desktop;
    if (breakpoint !== "desktop" && isRecord(rawNode.responsive.tablet)) result = mergeTemplateResponsiveRecord(result, rawNode.responsive.tablet);
    if (breakpoint === "mobile" && isRecord(rawNode.responsive.mobile)) result = mergeTemplateResponsiveRecord(result, rawNode.responsive.mobile);
    return result;
  };
  for (const [nodeId, rawNode] of Object.entries(nodes)) {
    if (!isRecord(rawNode) || !isDynamicTemplateNodeType(rawNode.type)) continue;
    const parents = parentIds.get(nodeId) ?? [];
    const registry = getDynamicTemplateNodeRegistryEntry(rawNode.type);
    for (const device of (schemaVersion >= 2 ? ["desktop", "tablet", "mobile"] : ["desktop", "mobile"]) as Array<"desktop" | "tablet" | "mobile">) {
      const responsive = readRules(rawNode, device);
      if (!responsive) continue;
      if (schemaVersion >= 2 && nodeId === rootNodeId && isRecord(responsive.height) && responsive.height.mode === "fill") {
        addIssue(issues, { level: "error", code: "ROOT_HEIGHT_CANNOT_FILL", path: `nodes.${nodeId}.responsive.${device}.height`, nodeId, message: "模板根节点没有可分配高度的父容器，请选择固定、最小、比例或适应内容高度。" });
      }
      if (responsive.layoutMode === "free") {
        if (rawNode.type !== "Stack") {
          addIssue(issues, {
            level: "error",
            code: "FREE_LAYOUT_REQUIRES_STACK",
            path: `nodes.${nodeId}.responsive.${device}.layoutMode`,
            nodeId,
            message: "只有 Stack 容器可以启用自由叠放。",
          });
        }
        if (isRecord(responsive.height) && ["auto", "fit", "fill"].includes(String(responsive.height.mode))) {
          addIssue(issues, {
            level: "error",
            code: "FREE_LAYOUT_REQUIRES_FIXED_HEIGHT",
            path: `nodes.${nodeId}.responsive.${device}.height`,
            nodeId,
            message: "自由叠放容器必须固定高度或比例，不能使用自动高度。",
          });
        }
      }
      const parentId = parents.length === 1 ? parents[0] : undefined;
      const parent = parentId ? nodes[parentId] : undefined;
      const parentRules = isRecord(parent) ? readRules(parent, device) : undefined;
      const parentIsFreeStack = isRecord(parent)
        && parent.type === "Stack"
        && parentRules?.layoutMode === "free";
      if (responsive.anchor !== undefined) {
        const parentHeight = parentRules?.height;
        const hasHeight = isRecord(parentHeight) && (parentHeight.mode === "aspect-ratio"
          || ["fixed", "min-height", "viewport"].includes(String(parentHeight.mode)) && isRecord(parentHeight.value) && Number(parentHeight.value.value) > 0);
        const hasMinHeight = isRecord(parentRules?.minHeight) && Number(parentRules.minHeight.value) > 0;
        if (!isRecord(parent) || !hasHeight && !hasMinHeight) {
          addIssue(issues, { level: "error", code: "ANCHOR_REQUIRES_SIZED_PARENT", path: `nodes.${nodeId}.responsive.${device}.anchor`, nodeId, message: "局部叠放须有合法父容器及明确高度、最小高度或比例。" });
        }
      }
      if (responsive.placement !== undefined && !parentIsFreeStack && responsive.anchor === undefined) {
        addIssue(issues, {
          level: "error",
          code: "PLACEMENT_REQUIRES_FREE_STACK_PARENT",
          path: `nodes.${nodeId}.responsive.${device}.placement`,
          nodeId,
          message: "placement 只允许用于同设备自由 Stack 的直接子节点。",
        });
      }
      if (parentIsFreeStack && responsive.placement === undefined && responsive.anchor === undefined) {
        addIssue(issues, {
          level: "error",
          code: "FREE_STACK_CHILD_REQUIRES_PLACEMENT",
          path: `nodes.${nodeId}.responsive.${device}.placement`,
          nodeId,
          message: "自由 Stack 的每个直接子节点都必须保存位置和尺寸。",
        });
      }
    }
    if (nodeId === rootNodeId) {
      if (parents.length > 0) {
        addIssue(issues, {
          level: "error",
          code: "ROOT_HAS_PARENT",
          path: `nodes.${nodeId}`,
          nodeId,
          message: "根节点不能被其他节点引用。",
        });
      }
    } else if (parents.length !== 1) {
      addIssue(issues, {
        level: "error",
        code: parents.length === 0 ? "ORPHAN_NODE" : "MULTIPLE_PARENTS",
        path: `nodes.${nodeId}`,
        nodeId,
        message: parents.length === 0 ? "节点没有父节点。" : "节点不能同时属于多个父节点。",
      });
    }
    if (registry.rootOnly && nodeId !== rootNodeId) {
      addIssue(issues, {
        level: "error",
        code: "ROOT_ONLY_NODE_NESTED",
        path: `nodes.${nodeId}.type`,
        nodeId,
        message: `${rawNode.type} 只能作为模板根节点。`,
      });
    }
    for (const parentId of parents) {
      const parent = nodes[parentId];
      if (!isRecord(parent) || !isDynamicTemplateNodeType(parent.type)) continue;
      if (!registry.allowedParents.includes(parent.type)) {
        addIssue(issues, {
          level: "error",
          code: "ILLEGAL_NESTING",
          path: `nodes.${parentId}.childIds`,
          nodeId,
          message: `${rawNode.type} 不能放在 ${parent.type} 内。`,
        });
      }
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (nodeId: string) => {
    if (visiting.has(nodeId)) {
      addIssue(issues, {
        level: "error",
        code: "NODE_CYCLE",
        path: `nodes.${nodeId}.childIds`,
        nodeId,
        message: "节点树存在循环引用。",
      });
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    const rawNode = nodes[nodeId];
    if (isRecord(rawNode) && Array.isArray(rawNode.childIds)) {
      for (const childId of rawNode.childIds) {
        if (typeof childId !== "string" || !nodes[childId]) {
          addIssue(issues, {
            level: "error",
            code: "MISSING_CHILD_NODE",
            path: `nodes.${nodeId}.childIds`,
            nodeId,
            message: `子节点 ${String(childId)} 不存在。`,
          });
          continue;
        }
        visit(childId);
      }
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  if (rootNodeId) visit(rootNodeId);
  for (const nodeId of Object.keys(nodes)) {
    if (!visited.has(nodeId)) {
      addIssue(issues, {
        level: "error",
        code: "UNREACHABLE_NODE",
        path: `nodes.${nodeId}`,
        nodeId,
        message: "节点无法从根节点到达。",
      });
    }
  }

  for (const [slotId, rawSlot] of Object.entries(slots)) {
    const references = referencedSlotIds.get(slotId) ?? [];
    if (references.length !== 1) {
      addIssue(issues, {
        level: "error",
        code: references.length === 0 ? "ORPHAN_SLOT" : "SLOT_REFERENCED_MULTIPLE_TIMES",
        path: `slots.${slotId}`,
        slotId,
        message: references.length === 0 ? "槽位没有对应内容节点。" : "同一槽位不能被多个节点引用。",
      });
    }
    if (isRecord(rawSlot) && isDynamicTemplateSlotType(rawSlot.type) && references.length > 0) {
      const rawNode = nodes[references[0]];
      if (isRecord(rawNode) && isDynamicTemplateNodeType(rawNode.type)) {
        const expectedSlotType = getDynamicTemplateNodeRegistryEntry(rawNode.type).slotType;
        if (expectedSlotType !== rawSlot.type) {
          addIssue(issues, {
            level: "error",
            code: "SLOT_NODE_TYPE_MISMATCH",
            path: `nodes.${references[0]}.slotId`,
            nodeId: references[0],
            slotId,
            message: `${rawNode.type} 不能引用 ${rawSlot.type} 槽位。`,
          });
        }
      }
    }
  }
  for (const slotId of referencedSlotIds.keys()) {
    if (!slots[slotId]) {
      addIssue(issues, {
        level: "error",
        code: "MISSING_SLOT_DEFINITION",
        path: `slots.${slotId}`,
        slotId,
        message: "节点引用的槽位定义不存在。",
      });
    }
  }

  for (const [slotId, value] of Object.entries(defaultContent)) {
    const rawSlot = slots[slotId];
    if (!isRecord(rawSlot) || !isDynamicTemplateSlotType(rawSlot.type)) {
      addIssue(issues, {
        level: "error",
        code: "UNKNOWN_DEFAULT_CONTENT_SLOT",
        path: `defaultContent.${slotId}`,
        slotId,
        message: "默认内容只能引用已声明槽位。",
      });
      continue;
    }
    if (!validateDynamicTemplateSlotContent(rawSlot.type, value)) {
      addIssue(issues, {
        level: "error",
        code: "DEFAULT_CONTENT_TYPE_MISMATCH",
        path: `defaultContent.${slotId}`,
        slotId,
        message: `默认内容与 ${rawSlot.type} 槽位类型不匹配。`,
      });
    }
    if (schemaVersion >= 3 && value !== null) {
      const path = `defaultContent.${slotId}`;
      const fail = (message: string) => addIssue(issues, { level: "error", code: "INVALID_DEFAULT_CONTENT", path, slotId, message });
      const text = typeof value === "string" ? value : isRecord(value) && typeof value.label === "string" ? value.label : undefined;
      if (text !== undefined && rawSlot.type !== "image") {
        const maxLength = isRecord(rawSlot.validation) && typeof rawSlot.validation.maxLength === "number" ? rawSlot.validation.maxLength : 10000;
        if (text.length > maxLength) fail("默认文字超过槽位最大字数。");
      }
      if (rawSlot.type === "image") {
        const src = typeof value === "string" ? value : isRecord(value) ? value.src : undefined;
        if (src !== "" && !isSafeTemplateMediaUrl(src)) fail("默认图片地址无效。");
        if (isRecord(value)) validateKnownKeys(value, ["src", "alt"], path, issues, { slotId });
      }
      if (["button", "link"].includes(rawSlot.type) && isRecord(value)) {
        validateKnownKeys(value, ["label", "targetType", "pagePath", "url", "productCode", "categorySlug", "linkUrl"], path, issues, { slotId });
        if (!hasValidActionContent(value)) fail("默认操作类型或链接字段无效。");
        for (const key of ["url", "linkUrl", "pagePath"]) {
          if (value[key] !== undefined && value[key] !== "" && !isSafeTemplateMediaUrl(value[key])) fail("默认操作链接地址无效。");
        }
      }
    }
  }
  for (const [slotId, value] of Object.entries(previewContent)) {
    const rawSlot = slots[slotId];
    if (!isRecord(rawSlot) || !isDynamicTemplateSlotType(rawSlot.type)) {
      addIssue(issues, {
        level: "error",
        code: "UNKNOWN_PREVIEW_CONTENT_SLOT",
        path: `previewContent.${slotId}`,
        slotId,
        message: "预览示例只能引用已声明槽位。",
      });
      continue;
    }
    if (!validateDynamicTemplateSlotContent(rawSlot.type, value)) {
      addIssue(issues, {
        level: "error",
        code: "PREVIEW_CONTENT_TYPE_MISMATCH",
        path: `previewContent.${slotId}`,
        slotId,
        message: `预览示例与 ${rawSlot.type} 槽位类型不匹配。`,
      });
    }
  }
  const valid = !issues.some((issue) => issue.level === "error");
  return {
    valid,
    issues,
    ...(valid ? { definition: input as unknown as TemplateDefinitionV2 } : {}),
  };
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(Math.round(left));
  let b = Math.abs(Math.round(right));
  while (b > 0) [a, b] = [b, a % b];
  return a || 1;
}

function publishRatioLabel(width: number, height: number): string {
  const divisor = greatestCommonDivisor(width, height);
  return `${Math.round(width) / divisor}:${Math.round(height) / divisor}`;
}

/** 发布门禁比草稿校验更严格：草稿允许不完整，正式版本必须形成可消费结构。 */
export function validateDynamicTemplatePublishDefinition(
  input: unknown,
): DynamicTemplatePublishValidationResult {
  const base = validateDynamicTemplateDefinition(input);
  if (!base.valid || !base.definition) return base;
  const definition = base.definition;
  const issues = [...base.issues];
  const root = definition.nodes[definition.rootNodeId];
  if (definition.name.trim() === "未命名模板") {
    addIssue(issues, {
      level: "error",
      code: "PUBLISH_REQUIRES_TEMPLATE_NAME",
      path: "name",
      message: "请打开“模板设置”，填写模板名称后再发布。",
    });
  }
  const structureTypes = new Set(["Container", "Grid", "Row", "Column", "Stack"]);
  const hasRegion = root.childIds.some((nodeId) => structureTypes.has(definition.nodes[nodeId]?.type));
  if (!hasRegion) {
    addIssue(issues, {
      level: "error",
      code: "PUBLISH_REQUIRES_REGION",
      path: `nodes.${definition.rootNodeId}.childIds`,
      nodeId: definition.rootNodeId,
      message: "发布前至少需要一个区域或容器。",
    });
  }
  if (Object.keys(definition.slots).length === 0) {
    addIssue(issues, {
      level: "error",
      code: "PUBLISH_REQUIRES_SLOT",
      path: "slots",
      nodeId: definition.rootNodeId,
      message: "发布前至少需要一个内容槽位。",
    });
  }
  if (definition.schemaVersion < 3 && Object.keys(definition.defaultContent).length > 0) {
    addIssue(issues, {
      level: "error",
      code: "PUBLISH_FORBIDS_DEFAULT_CONTENT",
      path: "defaultContent",
      message: "模板正式版本不能保存运营内容；默认展示请使用槽位样式和空值规则。",
    });
  }
  if (Object.keys(definition.previewContent ?? {}).length > 0) {
    addIssue(issues, {
      level: "error",
      code: "PUBLISH_FORBIDS_MOCK_CONTENT",
      path: "previewContent",
      message: "Mock Content 只存在于预览内存，不能写入模板正式版本。",
    });
  }

  for (const slot of Object.values(definition.slots)) {
    if (definition.schemaVersion >= 3 || slot.emptyPolicy !== "use-default") continue;
    addIssue(issues, {
      level: "error",
      code: "PUBLISH_FORBIDS_LEGACY_EMPTY_POLICY",
      path: `slots.${slot.slotId}.emptyPolicy`,
      slotId: slot.slotId,
      message: "正式版本不能依赖历史默认内容；请清理历史内容并让空槽位隐藏。",
    });
  }

  for (const device of ["desktop", "mobile"] as const) {
    const width = device === "desktop"
      ? definition.metadata.previewDesktopWidth ?? 1920
      : definition.metadata.previewMobileWidth ?? 390;
    const ratioField = device === "desktop" ? "desktopRatio" : "mobileRatio";
    const height = resolveTemplateNodeRules(definition, root.nodeId, device).height;
    let expectedRatio = "auto";
    if (height.mode === "fixed") {
      if (height.value?.unit !== "px" || !Number.isFinite(height.value.value) || height.value.value <= 0) {
        addIssue(issues, {
          level: "error",
          code: "ROOT_FIXED_HEIGHT_REQUIRES_PX",
          path: `nodes.${definition.rootNodeId}.responsive.${device}.height`,
          nodeId: definition.rootNodeId,
          message: `${device === "desktop" ? "桌面" : "移动"}根节点固定高度必须使用有效像素值。`,
        });
      } else {
        expectedRatio = publishRatioLabel(width, height.value.value);
      }
    } else if (height.mode === "aspect-ratio" && height.ratio) {
      expectedRatio = publishRatioLabel(height.ratio.width, height.ratio.height);
    }
    if (definition.schemaVersion === 1 && definition.metadata[ratioField] !== expectedRatio) {
      addIssue(issues, {
        level: "error",
        code: "ROOT_RATIO_METADATA_MISMATCH",
        path: `metadata.${ratioField}`,
        nodeId: definition.rootNodeId,
        message: `${device === "desktop" ? "桌面" : "移动"}兼容比例必须由根节点高度规则派生，期望 ${expectedRatio}。`,
      });
    }
  }

  const parentByNodeId = new Map<string, string>();
  for (const [parentId, parent] of Object.entries(definition.nodes)) {
    for (const childId of parent.childIds) parentByNodeId.set(childId, parentId);
  }
  const ancestorNodeIds = (nodeId: string) => {
    const result: string[] = [];
    const visited = new Set<string>();
    let current: string | undefined = nodeId;
    while (current && definition.nodes[current] && !visited.has(current)) {
      visited.add(current);
      result.unshift(current);
      current = parentByNodeId.get(current);
    }
    return result;
  };
  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    const slot = node.slotId ? definition.slots[node.slotId] : undefined;
    if (!slot?.required) continue;
    if (slot.hideable) {
      addIssue(issues, {
        level: "error",
        code: "PUBLISH_REQUIRED_SLOT_PAGE_HIDE_CONFLICT",
        path: `slots.${slot.slotId}.hideable`,
        nodeId,
        slotId: slot.slotId,
        message: `必填槽位“${slot.label}”不能同时允许页面隐藏，关闭页面隐藏权限后才能发布模板。`,
      });
    }
    const requiredAncestors = ancestorNodeIds(nodeId);
    const globallyHiddenNodeId = requiredAncestors.find((candidateId) => definition.nodes[candidateId].hidden);
    if (globallyHiddenNodeId) {
      addIssue(issues, {
        level: "error",
        code: "PUBLISH_REQUIRED_SLOT_HIDDEN",
        path: `nodes.${globallyHiddenNodeId}.hidden`,
        nodeId: globallyHiddenNodeId,
        slotId: slot.slotId,
        message: globallyHiddenNodeId === nodeId
          ? `必填槽位“${slot.label}”已隐藏，恢复显示后才能发布模板。`
          : `必填槽位“${slot.label}”因上级“${definition.nodes[globallyHiddenNodeId].name}”全局隐藏而不可见，恢复该上级后才能发布模板。`,
      });
      continue;
    }
    for (const device of (definition.schemaVersion >= 2 ? ["desktop", "tablet", "mobile"] : ["desktop", "mobile"]) as Array<"desktop" | "tablet" | "mobile">) {
      const hiddenNodeId = requiredAncestors.find((candidateId) => {
        const requiredRules = resolveTemplateNodeRules(definition, candidateId, device);
        return requiredRules.display === "none" || requiredRules.hidden;
      });
      if (!hiddenNodeId) continue;
      addIssue(issues, {
        level: "error",
        code: "PUBLISH_REQUIRED_SLOT_DEVICE_HIDDEN",
        path: `nodes.${hiddenNodeId}.responsive.${device}.display`,
        nodeId: hiddenNodeId,
        slotId: slot.slotId,
        message: `必填槽位“${slot.label}”在${device === "desktop" ? "桌面端" : device === "tablet" ? "平板端" : "移动端"}布局中${hiddenNodeId === nodeId ? "已隐藏" : `因上级“${definition.nodes[hiddenNodeId].name}”隐藏而不可见`}，恢复显示后才能发布模板。`,
      });
    }

  }
  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    const slot = node.slotId ? definition.slots[node.slotId] : undefined;
    if (slot?.type !== "image") continue;
    const parentId = parentByNodeId.get(nodeId);
    const parent = parentId ? definition.nodes[parentId] : undefined;
    if (!parent) continue;
    for (const device of (definition.schemaVersion >= 2 ? ["desktop", "tablet", "mobile"] : ["desktop", "mobile"]) as Array<"desktop" | "tablet" | "mobile">) {
      const rules = resolveTemplateNodeRules(definition, nodeId, device);
      const parentRules = resolveTemplateNodeRules(definition, parent.nodeId, device);
      const parentHasBoundedHeight = ["fixed", "aspect-ratio", "viewport"].includes(
        parentRules.height.mode,
      );
      if (
        rules.display !== "none"
        && parentRules.display !== "none"
        && rules.height.mode === "auto"
        && parentHasBoundedHeight
        && !(parent.type === "Stack" && parentRules.layoutMode === "free" && rules.placement)
      ) {
        addIssue(issues, {
          level: "warning",
          code: "IMAGE_SLOT_AUTO_HEIGHT_OVERFLOWS_BOUNDED_PARENT",
          path: `nodes.${nodeId}.responsive.${device}.height`,
          nodeId,
          slotId: slot.slotId,
          message: `“${slot.label}”在${device === "desktop" ? "桌面" : device === "tablet" ? "平板" : "手机"}端随图片比例自动调整高度。若预览超出区域，可在“尺寸与位置”设置图片高度或比例；此建议不影响发布。`,
        });
      }
    }
  }

  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    if (!node.slotId) continue;
    const slot = definition.slots[node.slotId];
    const policy = node.instanceEditPolicy;
    if (!slot || slot.editable || !policy) continue;
    if (
      policy.position || policy.size || policy.zIndex || policy.imageFit
      || policy.imageFocus || policy.typography || policy.spacing
    ) {
      addIssue(issues, {
        level: "error",
        code: "NON_EDITABLE_SLOT_HAS_INSTANCE_PERMISSIONS",
        path: `nodes.${nodeId}.instanceEditPolicy`,
        nodeId,
        slotId: slot.slotId,
        message: `${slot.label} 已禁止内容编辑，不能继续开放页面实例布局或样式权限。`,
      });
    }
  }

  const valid = !issues.some((issue) => issue.level === "error");
  return {
    valid,
    issues,
    ...(valid ? { definition } : {}),
  };
}
