import { getContentTemplateContract } from "../generated/contentTemplates.generated";
import type {
  DynamicTemplateSlotDefinition,
  TemplateDefinitionV2,
} from "../template-definition";
import {
  getContentTemplateModuleTypeForSlotType,
  isMatureContentTemplateSlotType,
} from "../template-definition/validateTemplateDefinition";
const previewPortrait = new URL("../preview-assets/neutral-template-preview-v1/template-preview-portrait.svg", import.meta.url).href;
const previewSquare = new URL("../preview-assets/neutral-template-preview-v1/template-preview-square.svg", import.meta.url).href;
const previewWide = new URL("../preview-assets/neutral-template-preview-v1/template-preview-wide.svg", import.meta.url).href;
import { createTemplatePreviewContentBySlotId } from "./templatePreviewModel";
import { getTemplateRecipeSampleText } from "../template-creation/previewContent";

export const TEMPLATE_STRESS_PREVIEW_SCENARIOS = [
  "short-text",
  "long-text",
  "optional-missing",
  "required-missing",
  "media-ratios",
] as const;

export type TemplateStressPreviewScenario =
  typeof TEMPLATE_STRESS_PREVIEW_SCENARIOS[number];

const LONG_TEXT_STRESS_LENGTH = 240;
const LONG_TEXT_SOURCE = "这是一段用于检查长文换行截断溢出与布局稳定性的中性系统预览内容。";
const NEUTRAL_MEDIA_ALT = "模板比例检查用中性图片，不代表正式页面素材";
const MEDIA_RATIO_ASSETS = [previewWide, previewSquare, previewPortrait] as const;

const SIMPLE_TEXT_SLOT_TYPES = new Set([
  "heading",
  "text",
  "richText",
  "badge",
  "icon",
]);

const TEXT_FIELD_PATTERN = /(?:title|subtitle|heading|eyebrow|label|text|body|content|copy|cta|quote|summary|description|caption|name|desc|actionText|buttonText|primaryText|secondaryText)$/i;
const NON_COPY_FIELD_PATTERN = /(?:alt(?:Text)?|src|url|href|id|identity|key|code|slug|type|status|visibility|reason|token|preset|ratio|position|protocol|date|time)$/i;
const NON_COPY_FIELD_PREFIX_PATTERN = /^(?:__|meta|price|amount|currency|focus|target|authorization|rights)/i;

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function compareStableKeys(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function createStressText(length: number) {
  if (length <= 0) return "";
  return LONG_TEXT_SOURCE.repeat(Math.ceil(length / LONG_TEXT_SOURCE.length)).slice(0, length);
}

function getPositiveLimit(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : Number.POSITIVE_INFINITY;
}

function getTextLimit(slot: DynamicTemplateSlotDefinition, fieldKey: string) {
  const moduleType = getContentTemplateModuleTypeForSlotType(slot.type);
  const contractLimit = moduleType
    ? getContentTemplateContract(moduleType)?.contentBudget.limits[fieldKey]
    : undefined;
  return Math.min(
    LONG_TEXT_STRESS_LENGTH,
    getPositiveLimit(slot.validation.maxLength),
    getPositiveLimit(contractLimit),
  );
}

function isTextField(
  slot: DynamicTemplateSlotDefinition,
  fieldKey: string,
  path: readonly string[],
) {
  if (
    NON_COPY_FIELD_PATTERN.test(fieldKey)
    || NON_COPY_FIELD_PREFIX_PATTERN.test(fieldKey)
  ) return false;
  const moduleType = getContentTemplateModuleTypeForSlotType(slot.type);
  const contractLimits = moduleType
    ? getContentTemplateContract(moduleType)?.contentBudget.limits
    : undefined;
  return Boolean(contractLimits && fieldKey in contractLimits)
    || TEXT_FIELD_PATTERN.test(fieldKey);
}

function withLongText(
  value: unknown,
  slot: DynamicTemplateSlotDefinition,
  fieldKey: string,
  path: readonly string[],
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => withLongText(
      item,
      slot,
      fieldKey,
      [...path, String(index)],
    ));
  }
  if (!value || typeof value !== "object") {
    return typeof value === "string" && isTextField(slot, fieldKey, path)
      ? createStressText(getTextLimit(slot, fieldKey))
      : value;
  }
  return Object.fromEntries(Object.keys(value)
    .sort(compareStableKeys)
    .map((key) => [
      key,
      withLongText(
        (value as Record<string, unknown>)[key],
        slot,
        key,
        [...path, key],
      ),
    ]));
}

function createLongTextValue(slot: DynamicTemplateSlotDefinition, value: unknown) {
  if (SIMPLE_TEXT_SLOT_TYPES.has(slot.type)) {
    return createStressText(getTextLimit(slot, slot.key));
  }
  if (slot.type === "button" || slot.type === "link") {
    return { label: createStressText(getTextLimit(slot, "label")) };
  }
  return withLongText(value, slot, slot.key, [slot.slotId]);
}

function createCanonicalEmptyValue(slot: DynamicTemplateSlotDefinition): unknown {
  if (isMatureContentTemplateSlotType(slot.type)) return {};
  switch (slot.type) {
    case "button":
    case "link":
      return { label: "" };
    case "collection":
      return [];
    default:
      return "";
  }
}

function isMediaValueKey(path: readonly string[], key: string) {
  if (/^(?:src|desktopUrl|mobileUrl|.*image|.*imageUrl|posterUrl)$/i.test(key)) return true;
  return key === "url" && path.some((part) => part === "images" || part === "items");
}

function isAltKey(key: string) {
  return /(?:^alt$|altText$)/i.test(key);
}

function withMediaRatios(
  value: unknown,
  path: readonly string[],
  sequence: { current: number },
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => withMediaRatios(item, [...path, String(index)], sequence));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value)
    .sort(compareStableKeys)
    .map((key) => {
      const child = (value as Record<string, unknown>)[key];
      if (typeof child === "string" && isMediaValueKey(path, key)) {
        const asset = MEDIA_RATIO_ASSETS[sequence.current % MEDIA_RATIO_ASSETS.length];
        sequence.current += 1;
        return [key, asset];
      }
      if (typeof child === "string" && isAltKey(key)) return [key, NEUTRAL_MEDIA_ALT];
      return [key, withMediaRatios(child, [...path, key], sequence)];
    }));
}

/**
 * 模板结构压力预览的纯内存内容引擎。
 * 输出仅供只读 Renderer 使用，不构造 PageDocument，也不写回模板或页面会话。
 */
export function createTemplateStressPreviewContentBySlotId(
  definition: TemplateDefinitionV2,
  scenario: TemplateStressPreviewScenario,
  sessionContentBySlotId: Record<string, unknown> = {},
): Record<string, unknown> {
  const shortContent = createTemplatePreviewContentBySlotId(definition);
  // 新建模板没有正式默认内容，压力预览仍需可见的临时构图。
  // 仅补未配置槽位，显式清空、正式默认值和本次试排均保留其优先级。
  if (Number(definition.schemaVersion) >= 3) {
    for (const slot of Object.values(definition.slots)) {
      if (Object.prototype.hasOwnProperty.call(definition.defaultContent, slot.slotId)) continue;
      if (slot.type === "image") {
        shortContent[slot.slotId] = { src: previewSquare, alt: NEUTRAL_MEDIA_ALT };
      } else if (SIMPLE_TEXT_SLOT_TYPES.has(slot.type) || slot.type === "button" || slot.type === "link") {
        const sample = getTemplateRecipeSampleText(slot.semanticRole ?? "", slot.label, slot.validation.maxLength);
        shortContent[slot.slotId] = slot.type === "button" || slot.type === "link"
          ? { label: sample, targetType: "none" }
          : sample;
      }
    }
  }
  for (const [slotId, value] of Object.entries(sessionContentBySlotId)) {
    if (definition.slots[slotId]) shortContent[slotId] = cloneValue(value);
  }
  const contentBySlotId: Record<string, unknown> = {};
  const mediaSequence = { current: 0 };

  for (const slotId of Object.keys(definition.slots).sort(compareStableKeys)) {
    const slot = definition.slots[slotId];
    const shortValue = cloneValue(shortContent[slotId]);
    switch (scenario) {
      case "short-text":
        contentBySlotId[slotId] = shortValue;
        break;
      case "long-text":
        contentBySlotId[slotId] = createLongTextValue(slot, shortValue);
        break;
      case "optional-missing":
        contentBySlotId[slotId] = slot.required
          ? shortValue
          : createCanonicalEmptyValue(slot);
        break;
      case "required-missing":
        contentBySlotId[slotId] = slot.required
          ? createCanonicalEmptyValue(slot)
          : shortValue;
        break;
      case "media-ratios":
        contentBySlotId[slotId] = withMediaRatios(shortValue, [slotId], mediaSequence);
        break;
    }
  }

  return contentBySlotId;
}
