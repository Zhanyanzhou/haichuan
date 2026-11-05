import type { PuckDocument } from "../types";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  dynamicTemplateVersionKey,
  readResolvedDynamicTemplateDefinitions,
  type DynamicTemplateInstanceProps,
} from "../dynamic-template-instance/types";
import {
  buildDynamicTemplatePublicSurface,
  resolveDynamicTemplatePublicVisibility,
} from "../dynamic-template-instance/publicVisibility";
import { compileDynamicTemplateRenderPlan, type DynamicTemplateRenderPlanNode } from "../template-definition/renderPlan";
import { resolveTemplateImageSource } from "../template-definition/imageContent";
import type { TemplateContentBreakpoint } from "../template-definition/responsive";

export type HomeHeroPreview = {
  image: string;
  mobileImage: string;
  title: string;
  subtitle: string;
  eyebrow: string;
};

const EMPTY_PREVIEW: HomeHeroPreview = { image: "", mobileImage: "", title: "", subtitle: "", eyebrow: "" };
const NON_PUBLISHABLE_SYSTEM_MEDIA = new Set([
  "/images/system/product-placeholder.svg",
  "/images/system/launch-short-page-desktop.svg",
  "/images/system/launch-short-page-mobile.svg",
]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function publicHeroMedia(value: unknown) {
  const source = text(value);
  return NON_PUBLISHABLE_SYSTEM_MEDIA.has(source) ? "" : source;
}

function isHeroRoleEnabled(content: Record<string, unknown>, roleId: string) {
  const overrides = content.__instanceOverrides;
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return true;
  const record = overrides as Record<string, unknown>;
  const collection = record[record.version === 2 ? "nodes" : "textRoles"];
  if (!collection || typeof collection !== "object" || Array.isArray(collection)) return true;
  const node = (collection as Record<string, unknown>)[roleId];
  return !node || typeof node !== "object" || Array.isArray(node)
    || (node as Record<string, unknown>).enabled !== false;
}

function firstReachableImage(node: DynamicTemplateRenderPlanNode, device: TemplateContentBreakpoint): string {
  if (node.hidden) return "";
  if (node.slot?.type === "image") {
    const source = publicHeroMedia(resolveTemplateImageSource(node.content, device));
    if (source) return source;
  }
  for (const child of node.children) {
    const source = firstReachableImage(child, device);
    if (source) return source;
  }
  return "";
}

/** 只发现同一份发布文档的首图；布局、文字和交互仍由正式 Renderer 唯一负责。 */
export function getHomeHeroPreview(data?: PuckDocument | null, device: TemplateContentBreakpoint = "desktop"): HomeHeroPreview {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const definitions = readResolvedDynamicTemplateDefinitions(data?.[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]);
  for (const block of blocks) {
    if (block.props?.isVisible === false) continue;
    if (block.type === DYNAMIC_TEMPLATE_BLOCK_TYPE) {
      const props = block.props as DynamicTemplateInstanceProps;
      const definition = definitions[dynamicTemplateVersionKey(props.templateId, Number(props.templateVersion))]?.definition;
      if (!definition || definition.metadata.visualRole !== "primary-stage") continue;
      const visibility = resolveDynamicTemplatePublicVisibility({
        definition, contentBySlotId: props.contentBySlotId, hiddenSlotIds: props.hiddenSlotIds,
        breakpoint: device, pageKey: "home",
      });
      if (!visibility.visible) continue;
      const compiled = compileDynamicTemplateRenderPlan(definition, {
        device, breakpoint: device, contentBySlotId: props.contentBySlotId,
        hiddenSlotIds: props.hiddenSlotIds, layoutOverridesByNodeId: props.layoutOverridesByNodeId,
        pageSettings: props.pageSettings, showEmptySlots: false,
        publicSurface: buildDynamicTemplatePublicSurface(definition, props.contentBySlotId, "home"),
      });
      const image = compiled.ok ? firstReachableImage(compiled.plan.root, device) : "";
      // 不跨端回填被隐藏的图片，也不因这一节无图而把后续章节提前到首屏。
      return { ...EMPTY_PREVIEW, image, mobileImage: image };
    }
    if (block.type !== "首屏主视觉") continue;
    const content = block.props ?? {};
    const desktopImage = isHeroRoleEnabled(content, "desktopImage") ? publicHeroMedia(content.desktopImage) : "";
    const mobileImage = isHeroRoleEnabled(content, "mobileImage") ? publicHeroMedia(content.mobileImage) : "";
    return {
      image: desktopImage || mobileImage,
      mobileImage: mobileImage || desktopImage,
      title: isHeroRoleEnabled(content, "title") ? text(content.title) : "",
      subtitle: isHeroRoleEnabled(content, "subtitle") ? text(content.subtitle) : "",
      eyebrow: isHeroRoleEnabled(content, "eyebrow") ? text(content.eyebrow) : "",
    };
  }
  return EMPTY_PREVIEW;
}
