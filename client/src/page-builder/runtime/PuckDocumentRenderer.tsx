import { useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { getBrowserPublicContentLocale } from "@/i18n/publicLocale";
import {
  getContentTemplateIssues,
} from "@/page-builder/generated/contentTemplates.generated";
import { isVisiblePrimaryStageBlock } from "@/page-builder/utils/primaryStagePolicy";
import MatureContentTemplateRenderer from "@/page-builder/template-definition/MatureContentTemplateRenderer";
import { getMatureContentTemplateSlotType } from "@/page-builder/template-definition/validateTemplateDefinition";
import {
  normalizeLegacyRenderColors,
} from "@/page-builder/runtime/renderParity";
import type { PuckBlock, PuckDocument, PuckProps } from "@/page-builder/types";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  DynamicTemplateInstanceView,
  dynamicTemplateVersionKey,
  buildDynamicTemplatePublicSurface,
  isDynamicTemplateInstancePubliclyVisible,
  readResolvedDynamicTemplateDefinitions,
  type DynamicTemplateInstanceProps,
  type ResolvedDynamicTemplateDefinitionMap,
} from "@/page-builder/dynamic-template-instance";
import {
  resolveTemplateBreakpoint,
  toTemplateContentBreakpoint,
  type TemplateContentBreakpoint,
} from "@/page-builder/template-definition/responsive";
import {
  compileDynamicTemplateRenderPlan,
  findFirstReachableHeadingSlotId,
} from "@/page-builder/template-definition/renderPlan";

export type { PuckBlock, PuckDocument } from "@/page-builder/types";

function UnsupportedContentTemplateState({
  type,
  message,
}: {
  type?: string;
  message: string;
}) {
  const english = getBrowserPublicContentLocale() === "en";
  return (
    <section
      role="alert"
      style={{
        minHeight: 180,
        display: "grid",
        placeItems: "center",
        padding: "32px 24px",
        background: "#F4F5F5",
        border: "1px solid #B8BEC1",
        color: "#181A1B",
        textAlign: "center",
      }}
    >
      <div>
        <p style={{ margin: "0 0 8px", fontSize: 15 }}>
          {english ? "Template version unavailable" : "模板版本无法渲染"}
        </p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
          {english
            ? "This content block cannot be displayed."
            : <>{type ? `「${type}」` : "该区块"}{message}</>}
        </p>
      </div>
    </section>
  );
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasRequiredPublicMedia(block: PuckBlock) {
  const props = block.props || {};
  switch (block.type) {
    case "首屏主视觉":
      return Boolean(textValue(props.desktopImage) || textValue(props.mobileImage));
    default:
      return true;
  }
}

function usePublicRendererViewportWidth(enabled: boolean) {
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
  return width;
}

function getResolvedDynamicTemplate(
  block: PuckBlock,
  resolvedDynamicTemplates: ResolvedDynamicTemplateDefinitionMap,
) {
  if (block.type !== DYNAMIC_TEMPLATE_BLOCK_TYPE) return undefined;
  const templateId = String(block.props?.templateId ?? "");
  const templateVersion = Number(block.props?.templateVersion);
  return resolvedDynamicTemplates[
    dynamicTemplateVersionKey(templateId, templateVersion)
  ];
}

function resolveDynamicTemplateDevice(
  block: PuckBlock,
  resolvedDynamicTemplates: ResolvedDynamicTemplateDefinitionMap,
  viewportWidth: number | undefined,
): TemplateContentBreakpoint {
  const resolved = getResolvedDynamicTemplate(block, resolvedDynamicTemplates);
  if (!resolved || viewportWidth === undefined) return "desktop";
  return toTemplateContentBreakpoint(
    resolveTemplateBreakpoint(resolved.definition, viewportWidth),
  );
}

function isPubliclyRenderableBlock(
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

  const templateIssue = getContentTemplateIssues({
    moduleType: block.type,
    props,
    blockId: props.id,
    path: "public-renderer",
  }).some((issue) => issue.severity === "error");
  if (templateIssue || !hasRequiredPublicMedia({ ...block, props })) return false;
  return Boolean(getMatureContentTemplateSlotType(block.type || ""));
}

export type PuckDocumentRenderMode = "public" | "preview";

function renderBlock(
  block: PuckBlock,
  index: number,
  mode: PuckDocumentRenderMode,
  heroHeadingLevel: 1 | 2,
  homeSurface: boolean,
  priority: boolean,
  resolvedDynamicTemplates: ResolvedDynamicTemplateDefinitionMap,
  deviceOverride?: TemplateContentBreakpoint,
  pageKey?: string,
) {
  const normalized = normalizeLegacyRenderColors(block.props || {});
  const props: PuckProps = normalized && typeof normalized === "object" && !Array.isArray(normalized)
    ? normalized as PuckProps
    : {};
  const key = textValue(props.id) || `${block.type || "block"}-${index}`;
  const preview = mode === "preview";
  if (props.isVisible === false) return null;
  if (
    mode === "public"
    && !isPubliclyRenderableBlock(
      { ...block, props },
      resolvedDynamicTemplates,
      deviceOverride ?? "desktop",
      pageKey,
    )
  ) return null;

  if (block.type === DYNAMIC_TEMPLATE_BLOCK_TYPE) {
    const instanceProps = props as DynamicTemplateInstanceProps;
    const resolved = resolvedDynamicTemplates[
      dynamicTemplateVersionKey(instanceProps.templateId, Number(instanceProps.templateVersion))
    ];
    if (!resolved) {
      return mode === "public" ? null : (
        <UnsupportedContentTemplateState
          key={key}
          type={block.type}
          message="缺少页面锁定的正式模板版本。"
        />
      );
    }
    return (
      <DynamicTemplateInstanceView
        key={key}
        props={instanceProps}
        definition={resolved.definition}
        deviceOverride={deviceOverride}
        mode={mode}
        primaryHeadingLevel={heroHeadingLevel}
        priority={mode === "public" && priority}
        pageKey={pageKey}
      />
    );
  }

  const templateIssue = getContentTemplateIssues({
    moduleType: block.type,
    props,
    blockId: props.id,
    path: `content[${index}].props.__contentTemplate`,
  }).find((issue) => issue.severity === "error");
  if (templateIssue) {
    return mode === "public" ? null : (
      <UnsupportedContentTemplateState
        key={key}
        type={block.type}
        message={templateIssue.message}
      />
    );
  }

  if (!preview && !hasRequiredPublicMedia({ ...block, props })) {
    return null;
  }

  const matureSlotType = getMatureContentTemplateSlotType(block.type || "");
  if (matureSlotType) {
    const layoutData = props.__instanceOverrides
      && typeof props.__instanceOverrides === "object"
      && !Array.isArray(props.__instanceOverrides)
      ? props.__instanceOverrides as Record<string, unknown>
      : undefined;
    return (
      <MatureContentTemplateRenderer
        key={key}
        slotType={matureSlotType}
        content={props}
        layoutData={layoutData}
        mode={mode}
        headingLevel={block.type === "首屏主视觉" ? heroHeadingLevel : 2}
        priority={priority}
        homeSurface={homeSurface}
      />
    );
  }

  return null;
}

function GuardedBlock({
  block,
  index,
  mode,
  heroHeadingLevel,
  homeSurface,
  priority,
  resolvedDynamicTemplates,
  deviceOverride,
  pageKey,
}: {
  block: PuckBlock;
  index: number;
  mode: PuckDocumentRenderMode;
  heroHeadingLevel: 1 | 2;
  homeSurface: boolean;
  priority: boolean;
  resolvedDynamicTemplates: ResolvedDynamicTemplateDefinitionMap;
  deviceOverride?: TemplateContentBreakpoint;
  pageKey?: string;
}) {
  return renderBlock(
    block,
    index,
    mode,
    heroHeadingLevel,
    homeSurface,
    priority,
    resolvedDynamicTemplates,
    deviceOverride,
    pageKey,
  );
}

export default function PuckDocumentRenderer({
  data,
  mode = "public",
  heroHeadingLevel = 1,
  primaryHeading,
  surface,
  pageKey,
}: {
  data: PuckDocument;
  mode?: PuckDocumentRenderMode;
  heroHeadingLevel?: 1 | 2;
  /** 纯装修公开页的页面标题；无有效 Hero 标题时补为唯一的视觉隐藏 h1。 */
  primaryHeading?: string;
  surface?: "home";
  pageKey?: string;
}) {
  const viewportWidth = usePublicRendererViewportWidth(mode === "public");
  if (!Array.isArray(data?.content)) return null;
  const english = getBrowserPublicContentLocale() === "en";
  const content = data.content;
  const zoneBlocks =
    data?.zones && typeof data.zones === "object"
      ? Object.entries(data.zones).flatMap(([, blocks]) =>
          Array.isArray(blocks) ? blocks : [],
        )
      : [];
  const homeSurface = surface === "home";
  const resolvedPageKey = pageKey ?? (homeSurface ? "home" : undefined);
  const resolvedDynamicTemplates = readResolvedDynamicTemplateDefinitions(
    data[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY],
  );
  const isPrimaryStage = (block: PuckBlock) => (
    isVisiblePrimaryStageBlock(block, resolvedDynamicTemplates)
  );
  const deviceForBlock = (block: PuckBlock) => resolveDynamicTemplateDevice(
    block,
    resolvedDynamicTemplates,
    viewportWidth,
  );
  const isRenderablePrimaryStage = (block: PuckBlock) => (
    isPrimaryStage(block)
    && (mode !== "public" || isPubliclyRenderableBlock(
      block,
      resolvedDynamicTemplates,
      deviceForBlock(block),
      resolvedPageKey,
    ))
  );
  const allBlocks = [...content, ...zoneBlocks];
  const dynamicPrimaryStageHasHeading = (block: PuckBlock) => {
    if (block.type !== DYNAMIC_TEMPLATE_BLOCK_TYPE || !isRenderablePrimaryStage(block)) return false;
    const templateId = String(block.props?.templateId ?? "");
    const templateVersion = Number(block.props?.templateVersion);
    const definition = resolvedDynamicTemplates[
      dynamicTemplateVersionKey(templateId, templateVersion)
    ]?.definition;
    if (!definition) return false;
    const instanceProps = block.props as DynamicTemplateInstanceProps;
    const device = deviceForBlock(block);
    const result = compileDynamicTemplateRenderPlan(definition, {
      device,
      breakpoint: device,
      contentBySlotId: instanceProps.contentBySlotId,
      hiddenSlotIds: instanceProps.hiddenSlotIds,
      layoutOverridesByNodeId: instanceProps.layoutOverridesByNodeId,
      showEmptySlots: false,
      publicSurface: buildDynamicTemplatePublicSurface(
        definition,
        instanceProps.contentBySlotId,
        resolvedPageKey,
      ),
    });
    return result.ok && Boolean(findFirstReachableHeadingSlotId(result.plan.root));
  };
  const primaryHeroIndex = allBlocks.findIndex((block) => (
    block.type === "首屏主视觉"
      ? isRenderablePrimaryStage(block)
        && typeof block.props?.title === "string"
        && block.props.title.trim().length > 0
      : dynamicPrimaryStageHasHeading(block)
  ));
  const primaryStageIndex = allBlocks.findIndex(isRenderablePrimaryStage);
  // 区块级兜底：单个 block 运行时抛错只跳过该区块，避免整页白屏
  const render = (block: PuckBlock, index: number) => {
    const blockHeroHeadingLevel = index === primaryHeroIndex
      ? heroHeadingLevel
      : 2;
    return (
      <ErrorBoundary
        key={`eb-${block.props?.id || index}`}
        fallback={
          mode === "public" ? null : (
            <section role="status" style={{ padding: "48px 24px", textAlign: "center", color: "#5F6568" }}>
              {english ? "This content is temporarily unavailable" : "该内容暂不可展示"}
            </section>
          )
        }
      >
        <GuardedBlock
          block={block}
          index={index}
          mode={mode}
          heroHeadingLevel={blockHeroHeadingLevel}
          homeSurface={homeSurface}
          priority={index === primaryStageIndex}
          resolvedDynamicTemplates={resolvedDynamicTemplates}
          deviceOverride={mode === "public" ? deviceForBlock(block) : undefined}
          pageKey={resolvedPageKey}
        />
      </ErrorBoundary>
    );
  };
  return (
    <div className="hc-public-document" data-home-surface={homeSurface ? "true" : undefined}>
      <style>{`
        .hc-public-document { min-width: 0; background: #FFFFFF; }
        .hc-public-document[data-home-surface="true"] .hc-section {
          --hc-px: 20px;
          --hc-py-brand: 64px;
        }
        .hc-public-document[data-home-surface="true"] .hc-content-template__body { max-width: 720px; }
        .hc-public-document[data-home-surface="true"] .hc-phase1-hero__copy { max-width: 520px; }
        .hc-public-document a:focus-visible {
          outline: 2px solid currentColor;
          outline-offset: 4px;
        }
        @media (min-width: 768px) {
          .hc-public-document[data-home-surface="true"] .hc-section {
            --hc-px: clamp(48px, 5.55vw, 80px);
            --hc-py-brand: 96px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .hc-public-document *,
          .hc-public-document *::before,
          .hc-public-document *::after {
            scroll-behavior: auto !important;
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
      {primaryHeading && (primaryHeroIndex < 0 || heroHeadingLevel !== 1) ? (
        <h1 className="sr-only">{primaryHeading}</h1>
      ) : null}
      {content.map(render)}
      {zoneBlocks.map((block, index) =>
        render(block, content.length + index),
      )}
    </div>
  );
}
