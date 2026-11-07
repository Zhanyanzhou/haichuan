import { useEffect, useState } from "react";
import { getContentTemplateIssues } from "@/page-builder/generated/contentTemplates.generated";
import { isVisiblePrimaryStageBlock } from "@/page-builder/utils/primaryStagePolicy";
import { getMatureContentTemplateSlotType } from "@/page-builder/template-definition/validateTemplateDefinition";
import { normalizeLegacyRenderColors } from "@/page-builder/runtime/renderParity";
import type { PuckBlock, PuckProps } from "@/page-builder/types";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  dynamicTemplateVersionKey,
  type DynamicTemplateInstanceProps,
  type ResolvedDynamicTemplateDefinitionMap,
} from "@/page-builder/dynamic-template-instance/types";
import {
  buildDynamicTemplatePublicSurface,
  isDynamicTemplateInstancePubliclyVisible,
} from "@/page-builder/dynamic-template-instance/publicVisibility";
import {
  resolveTemplateBreakpoint,
  toTemplateContentBreakpoint,
  type TemplateContentBreakpoint,
} from "@/page-builder/template-definition/responsive";
import {
  compileDynamicTemplateRenderPlan,
  findFirstReachableHeadingSlotId,
} from "@/page-builder/template-definition/renderPlan";

export function hasRequiredPublicMedia(block: PuckBlock) {
  if (block.type !== "首屏主视觉") return true;
  return [block.props?.desktopImage, block.props?.mobileImage]
    .some((value) => typeof value === "string" && value.trim().length > 0);
}

export function usePublicRendererViewportWidth(enabled: boolean) {
  const [width, setWidth] = useState<number | undefined>(() => (
    enabled && typeof window !== "undefined" ? window.innerWidth : undefined
  ));
  useEffect(() => {
    if (!enabled) {
      setWidth(undefined);
      return undefined;
    }
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [enabled]);
  return enabled && typeof window !== "undefined" ? width ?? window.innerWidth : undefined;
}

function getResolvedDynamicTemplate(
  block: PuckBlock,
  resolvedDynamicTemplates: ResolvedDynamicTemplateDefinitionMap,
) {
  if (block.type !== DYNAMIC_TEMPLATE_BLOCK_TYPE) return undefined;
  const templateId = String(block.props?.templateId ?? "");
  const templateVersion = Number(block.props?.templateVersion);
  return resolvedDynamicTemplates[dynamicTemplateVersionKey(templateId, templateVersion)];
}

export function isPubliclyRenderableBlock(
  block: PuckBlock,
  resolvedDynamicTemplates: ResolvedDynamicTemplateDefinitionMap,
  device: TemplateContentBreakpoint,
  pageKey?: string,
) {
  const normalized = normalizeLegacyRenderColors(block.props || {});
  const props: PuckProps = normalized && typeof normalized === "object" && !Array.isArray(normalized)
    ? normalized as PuckProps
    : {};
  if (props.isVisible === false) return false;

  if (block.type === DYNAMIC_TEMPLATE_BLOCK_TYPE) {
    const instanceProps = props as DynamicTemplateInstanceProps;
    const resolved = getResolvedDynamicTemplate({ ...block, props }, resolvedDynamicTemplates);
    if (!resolved || resolved.definition.templateId !== instanceProps.templateId) return false;
    return isDynamicTemplateInstancePubliclyVisible({
      definition: resolved.definition,
      contentBySlotId: instanceProps.contentBySlotId,
      hiddenSlotIds: instanceProps.hiddenSlotIds,
      breakpoint: device,
      pageKey,
    });
  }

  const hasError = getContentTemplateIssues({
    moduleType: block.type,
    props,
    blockId: props.id,
    path: "public-renderer",
  }).some((issue) => issue.severity === "error");
  return !hasError
    && hasRequiredPublicMedia({ ...block, props })
    && Boolean(getMatureContentTemplateSlotType(block.type || ""));
}

/** 整页与分段渲染使用同一套双端可见性和首屏标题判断。 */
export function createPageBlockRenderSemantics({
  resolvedDynamicTemplates,
  viewportWidth,
  pageKey,
  preview = false,
}: {
  resolvedDynamicTemplates: ResolvedDynamicTemplateDefinitionMap;
  viewportWidth?: number;
  pageKey?: string;
  preview?: boolean;
}) {
  const deviceForBlock = (block: PuckBlock): TemplateContentBreakpoint => {
    const resolved = getResolvedDynamicTemplate(block, resolvedDynamicTemplates);
    if (!resolved || viewportWidth === undefined) return "desktop";
    return toTemplateContentBreakpoint(resolveTemplateBreakpoint(resolved.definition, viewportWidth));
  };
  // 同一次同步渲染复用判断，不缓存编辑中的定义和字段。
  const publicRenderability = new Map<PuckBlock, boolean>();
  const publiclyRenderable = (block: PuckBlock) => {
    if (!publicRenderability.has(block)) {
      publicRenderability.set(block, isPubliclyRenderableBlock(
        block, resolvedDynamicTemplates, deviceForBlock(block), pageKey,
      ));
    }
    return publicRenderability.get(block)!;
  };
  const isRenderablePrimaryStage = (block: PuckBlock) => (
    isVisiblePrimaryStageBlock(block, resolvedDynamicTemplates) && (preview || publiclyRenderable(block))
  );
  const primaryStageHasHeading = (block: PuckBlock) => {
    if (!isRenderablePrimaryStage(block)) return false;
    if (block.type === "首屏主视觉") {
      return typeof block.props?.title === "string" && block.props.title.trim().length > 0;
    }
    const resolved = getResolvedDynamicTemplate(block, resolvedDynamicTemplates);
    if (!resolved) return false;
    const { definition } = resolved;
    const instanceProps = block.props as DynamicTemplateInstanceProps;
    const device = deviceForBlock(block);
    const result = compileDynamicTemplateRenderPlan(definition, {
      device,
      breakpoint: device,
      contentBySlotId: instanceProps.contentBySlotId,
      hiddenSlotIds: instanceProps.hiddenSlotIds,
      layoutOverridesByNodeId: instanceProps.layoutOverridesByNodeId,
      showEmptySlots: false,
      publicSurface: buildDynamicTemplatePublicSurface(definition, instanceProps.contentBySlotId, pageKey),
    });
    return result.ok && Boolean(findFirstReachableHeadingSlotId(result.plan.root));
  };
  return { deviceForBlock, publiclyRenderable, isRenderablePrimaryStage, primaryStageHasHeading };
}
