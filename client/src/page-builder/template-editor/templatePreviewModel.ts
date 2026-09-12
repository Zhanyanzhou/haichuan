import { getContentTemplateContract } from "../generated/contentTemplates.generated";
import { getTemplatePreviewContent } from "../preview/templatePreviewContent";
import {
  compileDynamicTemplateRenderPlan,
  getEditableTargetCompactLabel,
  resolveEditableTargets,
  resolveTemplateDesignFrame,
  type EditableTargetDescriptor,
  type TemplateDefinitionV2,
} from "../template-definition";
import {
  getContentTemplateModuleTypeForSlotType,
  isMatureContentTemplateSlotType,
  MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE,
} from "../template-definition/validateTemplateDefinition";
import type { DynamicTemplateSlotType } from "../template-definition/generated/templateDefinition.generated";
import { createTemplateRecipePreviewContent } from "../template-creation/previewContent";
import type { DynamicTemplatePreviewScenario } from "./types";

const previewPortrait = new URL("../preview-assets/neutral-template-preview-v1/template-preview-portrait.svg", import.meta.url).href;
const previewSquare = new URL("../preview-assets/neutral-template-preview-v1/template-preview-square.svg", import.meta.url).href;
const previewWide = new URL("../preview-assets/neutral-template-preview-v1/template-preview-wide.svg", import.meta.url).href;

export type TemplateCatalogSlotKind =
  | "media"
  | "title"
  | "description"
  | "text"
  | "button"
  | "product"
  | "collection"
  | "business";

export interface TemplateCatalogSlotDescriptor {
  targetId: string;
  ownerNodeId: string;
  slotId: string;
  roleId?: string;
  kind: TemplateCatalogSlotKind;
  label: string;
  compactLabel: string;
  locator: EditableTargetDescriptor["locator"];
}

export interface TemplateCatalogPreviewModel {
  sourceWidth: number;
  heightMode: "fixed" | "aspect-ratio" | "auto";
  fallbackHeight: number;
  ratioLabel: string;
  slots: TemplateCatalogSlotDescriptor[];
}

const TEMPLATE_DESIGN_SAMPLE_MEDIA = {
  wide: previewWide,
  portrait: previewPortrait,
  garden: previewWide,
  process: previewWide,
  products: [previewSquare, previewPortrait, previewSquare],
} as const;

const MEDIA_FIELD_NAMES = new Set([
  "afterImage",
  "backgroundImage",
  "beforeImage",
  "desktopImage",
  "detailImage",
  "detailImageOne",
  "detailImageTwo",
  "eventImage",
  "image",
  "imageUrl",
  "leadImage",
  "mainImage",
  "mobileImage",
  "mobileUrl",
  "posterUrl",
  "src",
]);

function isPreviewPlaceholderAsset(value: string) {
  return !value
    || value.startsWith("data:image/svg+xml")
    || value.includes("neutral-template-preview-v1")
    || value.includes("product-placeholder.svg");
}

function resolveTemplateDesignSampleMedia(path: string[], sequence: number) {
  const context = path.join(".").toLocaleLowerCase("en-US");
  if (/(?:mobile|portrait|wearing)/.test(context)) {
    return TEMPLATE_DESIGN_SAMPLE_MEDIA.portrait;
  }
  if (/(?:steps|process)/.test(context)) {
    return TEMPLATE_DESIGN_SAMPLE_MEDIA.process;
  }
  if (/(?:fullbleed|background|store|event|salon|hotspot)/.test(context)) {
    return TEMPLATE_DESIGN_SAMPLE_MEDIA.garden;
  }
  if (/(?:product|category|gallery|detail|before|after|certificate|testimonial|items)/.test(context)) {
    return TEMPLATE_DESIGN_SAMPLE_MEDIA.products[
      sequence % TEMPLATE_DESIGN_SAMPLE_MEDIA.products.length
    ];
  }
  return TEMPLATE_DESIGN_SAMPLE_MEDIA.wide;
}

function withTemplateDesignSampleMedia(
  value: unknown,
  path: string[],
  sequence: { current: number },
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => withTemplateDesignSampleMedia(
      item,
      [...path, String(index)],
      sequence,
    ));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    const childPath = [...path, key];
    const isCarouselImageUrl = key === "url"
      && path.some((part) => part === "images" || part === "items");
    if (
      typeof child === "string"
      && (MEDIA_FIELD_NAMES.has(key) || isCarouselImageUrl)
      && isPreviewPlaceholderAsset(child)
    ) {
      const replacement = resolveTemplateDesignSampleMedia(childPath, sequence.current);
      sequence.current += 1;
      return [key, replacement];
    }
    if (
      typeof child === "string"
      && /(?:alt|altText)$/i.test(key)
      && child.includes("占位图")
    ) {
      return [key, "模板结构示例图片，不代表正式页面素材"];
    }
    return [key, withTemplateDesignSampleMedia(child, childPath, sequence)];
  }));
}

function createTemplateCatalogSlotDescriptors(
  definition: TemplateDefinitionV2,
  device: "desktop" | "mobile",
): TemplateCatalogSlotDescriptor[] {
  const compiled = compileDynamicTemplateRenderPlan(definition, {
    device,
    showEmptySlots: true,
  });
  if (!compiled.ok) return [];
  const targets = resolveEditableTargets(
    definition,
    compiled.plan,
    getContentTemplateContract,
  ).filter((target) => target.slotId);
  const contractSlotIds = new Set(targets
    .filter((target) => target.source === "builtin-contract-role")
    .flatMap((target) => target.slotId ? [target.slotId] : []));
  return targets.flatMap((target): TemplateCatalogSlotDescriptor[] => {
    if (!target.slotId) return [];
    if (target.source === "definition-node" && contractSlotIds.has(target.slotId)) return [];
    const kind: TemplateCatalogSlotKind = target.kind === "action"
      ? "button"
      : target.kind === "structured"
        ? "business"
        : target.kind;
    return [{
      targetId: target.targetId,
      ownerNodeId: target.ownerNodeId,
      slotId: target.slotId,
      ...(target.contractRoleId ? { roleId: target.contractRoleId } : {}),
      kind,
      label: target.label,
      compactLabel: getEditableTargetCompactLabel(target),
      locator: target.locator,
    }];
  });
}

function getExamplePreviewContentForSlot(slotType: string): Record<string, unknown> {
  const moduleType = getContentTemplateModuleTypeForSlotType(slotType);
  if (!moduleType) return {};
  const contract = getContentTemplateContract(moduleType);
  if (!contract) return {};
  const content = withTemplateDesignSampleMedia(
    structuredClone(getTemplatePreviewContent(contract.key)),
    [contract.key],
    { current: 0 },
  ) as Record<string, unknown>;
  const hasAction = contract.editorCapabilities.editableObjects.some((object) => object.kind === "action");
  if (hasAction && (typeof content.linkUrl !== "string" || !content.linkUrl.trim())) {
    // 只读示例需要让 Renderer 真正生成按钮 DOM，才能测量按钮槽位；
    // 使用站内安全路径，不写回模板定义，也不会在目录卡中响应点击。
    content.targetType = "page";
    content.linkUrl = "/contact";
  }
  return content;
}

function getGenericSlotExample(slotType: string): unknown {
  if (slotType === "heading") return "典藏新作";
  if (["text", "richText"].includes(slotType)) return "以克制线条呈现珠宝的光泽、比例与细节。";
  if (["badge", "icon"].includes(slotType)) return "臻选";
  if (["button", "link"].includes(slotType)) return { label: "查看详情" };
  if (slotType === "collection") return ["示例作品 01", "示例作品 02"];
  if (slotType === "image") {
    return {
      src: TEMPLATE_DESIGN_SAMPLE_MEDIA.products[0],
      alt: "珠宝作品示例",
    };
  }
  if (slotType === "product") return { mock: true, label: "鎏光戒指" };
  return {};
}

/**
 * 模板目录、设计画布与只读预览共用的系统示例内容。
 * 新方案模板展示持久默认内容；旧版本继续使用中性示例。
 * 页面实例内容与仅本次试排仍由调用方单独覆盖。
 */
export function createTemplatePreviewContentBySlotId(
  definition: TemplateDefinitionV2,
): Record<string, unknown> {
  if (Number(definition.schemaVersion) >= 3) return structuredClone(definition.defaultContent);
  const contentBySlotId: Record<string, unknown> = {};
  for (const [slotId, slot] of Object.entries(definition.slots)) {
    const exampleContent = getExamplePreviewContentForSlot(slot.type);
    contentBySlotId[slotId] = Object.keys(exampleContent).length > 0
      ? exampleContent
      : getGenericSlotExample(slot.type);
  }
  return contentBySlotId;
}

/**
 * 目录里的新方案用临时样例补齐空槽位，已保存的显式默认值优先；
 * 返回值只传给缩略图 Renderer，不写回模板定义。
 */
export function createTemplateCatalogPreviewContentBySlotId(
  definition: TemplateDefinitionV2,
): Record<string, unknown> {
  const persisted = createTemplatePreviewContentBySlotId(definition);
  if (Number(definition.schemaVersion) < 3 || !definition.templateRecipe) return persisted;
  return {
    ...createTemplateRecipePreviewContent(definition),
    ...persisted,
  };
}

/**
 * 四种模板 QA 场景共用同一份纯内存内容模型。返回值只传给 Renderer，
 * 不进入 TemplateDefinition、正式版本或 PageDocument。
 */
export function createTemplatePreviewScenarioContentBySlotId(
  definition: TemplateDefinitionV2,
  scenario: DynamicTemplatePreviewScenario,
): Record<string, unknown> {
  const configuredPreview = createTemplatePreviewContentBySlotId(definition);
  if (scenario === "default") return configuredPreview;
  // 长文本和缺图场景都从正常内容开始，只替换各自负责的变量，
  // 避免把文字压力、素材缺失和全部空内容混成同一个结果。
  const content: Record<string, unknown> = scenario === "long-text" || scenario === "missing-image"
    ? structuredClone(configuredPreview)
    : {};
  for (const slot of Object.values(definition.slots)) {
    if (isMatureContentTemplateSlotType(slot.type)) {
      const source = configuredPreview[slot.slotId];
      const base = source && typeof source === "object" && !Array.isArray(source)
        ? structuredClone(source) as Record<string, unknown>
        : {};
      if (scenario === "missing-image") {
        for (const key of Object.keys(base)) {
          if (/(?:image|poster|cover)$/i.test(key) && typeof base[key] === "string") base[key] = "";
        }
        content[slot.slotId] = base;
      } else if (scenario === "long-text") {
        const longHeading = "这是用于验证复杂组件超长标题换行、截断与布局稳定性的示例文字";
        const longBody = "这是一段用于验证复杂组件长文案、无障碍说明和行动区域稳定性的预览内容。".repeat(5);
        for (const key of ["title", "beforeLabel", "afterLabel", "buttonText", "actionText"]) {
          if (key in base) base[key] = longHeading;
        }
        for (const key of ["subtitle", "summary", "videoDescription", "altText", "beforeAltText", "afterAltText"]) {
          if (key in base) base[key] = longBody;
        }
        content[slot.slotId] = base;
      } else {
        content[slot.slotId] = {};
      }
      continue;
    }
    if (scenario === "missing-image") {
      if (slot.type === "image" || slot.type === "product") content[slot.slotId] = "";
      else if (slot.type === "collection") content[slot.slotId] = [];
      continue;
    }
    if (scenario === "long-text") {
      if (["heading", "text", "richText", "badge", "icon"].includes(slot.type)) {
        content[slot.slotId] = slot.type === "heading"
          ? "这是用于验证超长标题在不同画布中换行、截断和布局稳定性的示例文本"
          : "这是一段用于验证超长内容、换行规则、最大行数和溢出处理的预览文字。".repeat(5);
      } else if (slot.type === "button" || slot.type === "link") {
        content[slot.slotId] = { label: "用于验证超长行动文案的预览按钮" };
      }
      continue;
    }
    if (slot.type === "button" || slot.type === "link") content[slot.slotId] = { label: "" };
    else if (slot.type === "collection") content[slot.slotId] = [];
    else content[slot.slotId] = "";
  }
  return content;
}

export function resolveTemplatePreviewViewport(
  definition: TemplateDefinitionV2,
  device: "desktop" | "mobile",
) {
  return resolveTemplateDesignFrame(definition, device);
}

/** 模板目录消费的纯展示模型；不写入模板定义、页面实例或公开 Renderer。 */
export function createTemplateCatalogPreviewModel(
  definition: TemplateDefinitionV2,
  device: "desktop" | "mobile",
): TemplateCatalogPreviewModel {
  const frame = resolveTemplatePreviewViewport(definition, device);
  return {
    sourceWidth: frame.sourceWidth,
    heightMode: frame.heightMode,
    fallbackHeight: frame.fallbackHeight,
    ratioLabel: frame.ratioLabel,
    slots: createTemplateCatalogSlotDescriptors(definition, device),
  };
}
