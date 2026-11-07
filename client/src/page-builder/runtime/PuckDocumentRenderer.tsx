import { Fragment, lazy, Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { getBrowserPublicContentLocale } from "@/i18n/publicLocale";
import {
  getContentTemplateIssues,
} from "@/page-builder/generated/contentTemplates.generated";
import { getMatureContentTemplateSlotType } from "@/page-builder/template-definition/validateTemplateDefinition";
import {
  normalizeLegacyRenderColors,
} from "@/page-builder/runtime/renderParity";
import type { PuckBlock, PuckDocument, PuckProps } from "@/page-builder/types";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  dynamicTemplateVersionKey,
  readResolvedDynamicTemplateDefinitions,
  type DynamicTemplateInstanceProps,
  type ResolvedDynamicTemplateDefinitionMap,
} from "@/page-builder/dynamic-template-instance/types";
import DynamicTemplateInstanceView from "@/page-builder/dynamic-template-instance/DynamicTemplateInstanceView";
import type { TemplateContentBreakpoint } from "@/page-builder/template-definition/responsive";
import {
  createPageBlockRenderSemantics,
  hasRequiredPublicMedia,
  isPubliclyRenderableBlock,
  usePublicRendererViewportWidth,
} from "./pageBlockRenderSemantics";

export type { PuckBlock, PuckDocument } from "@/page-builder/types";

// 原生动态模板不应为兼容首屏下载成熟模板及其编辑适配层。
const MatureContentTemplateRenderer = lazy(() => import("@/page-builder/template-definition/MatureContentTemplateRenderer"));

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

export type PuckDocumentRenderMode = "public" | "preview";

function renderBlock(
  block: PuckBlock,
  index: number,
  mode: PuckDocumentRenderMode,
  heroHeadingLevel: 1 | 2,
  homeSurface: boolean,
  priority: boolean,
  pageHeroPlacement: "primary" | "subsequent",
  resolvedDynamicTemplates: ResolvedDynamicTemplateDefinitionMap,
  deviceOverride?: TemplateContentBreakpoint,
  pageKey?: string,
  publiclyRenderable?: boolean,
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
    && !(publiclyRenderable ?? isPubliclyRenderableBlock(
      { ...block, props },
      resolvedDynamicTemplates,
      deviceOverride ?? "desktop",
      pageKey,
    ))
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
        pageHeroPlacement={pageHeroPlacement}
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
    const renderer = (
      <MatureContentTemplateRenderer
        slotType={matureSlotType}
        content={props}
        layoutData={layoutData}
        mode={mode}
        headingLevel={block.type === "首屏主视觉" ? heroHeadingLevel : 2}
        priority={priority}
        homeSurface={homeSurface}
      />
    );
    // 兼容首屏的第二个分块到达前，沿用首页现有首图，避免以区块空白占位取代它。
    if (mode === "public" && homeSurface && priority && block.type === "首屏主视觉") return renderer;
    return (
      <Suspense key={key} fallback={<div aria-busy="true" style={{ minHeight: priority ? "100svh" : 120 }} />}>
        {renderer}
      </Suspense>
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
  pageHeroPlacement,
  resolvedDynamicTemplates,
  deviceOverride,
  pageKey,
  publiclyRenderable,
}: {
  block: PuckBlock;
  index: number;
  mode: PuckDocumentRenderMode;
  heroHeadingLevel: 1 | 2;
  homeSurface: boolean;
  priority: boolean;
  pageHeroPlacement: "primary" | "subsequent";
  resolvedDynamicTemplates: ResolvedDynamicTemplateDefinitionMap;
  deviceOverride?: TemplateContentBreakpoint;
  pageKey?: string;
  publiclyRenderable?: boolean;
}) {
  return renderBlock(
    block,
    index,
    mode,
    heroHeadingLevel,
    homeSurface,
    priority,
    pageHeroPlacement,
    resolvedDynamicTemplates,
    deviceOverride,
    pageKey,
    publiclyRenderable,
  );
}

export default function PuckDocumentRenderer({
  data,
  mode = "public",
  heroHeadingLevel = 1,
  primaryHeading,
  primaryHeroBlock,
  viewportWidthOverride,
  surface,
  pageKey,
  renderPrimaryStage,
}: {
  data: PuckDocument;
  mode?: PuckDocumentRenderMode;
  heroHeadingLevel?: 1 | 2;
  /** 纯装修公开页的页面标题；无有效 Hero 标题时补为唯一的视觉隐藏 h1。 */
  primaryHeading?: string;
  /** 分段公开页从整页选出的唯一主标题来源。 */
  primaryHeroBlock?: PuckBlock;
  viewportWidthOverride?: number;
  surface?: "home";
  pageKey?: string;
  /** 首页可单独呈现首个可见主舞台，缺少主舞台时传入 null。 */
  renderPrimaryStage?: (stage: ReactNode, block?: PuckBlock) => ReactNode;
}) {
  const measuredWidth = usePublicRendererViewportWidth(mode === "public" && viewportWidthOverride === undefined);
  const viewportWidth = viewportWidthOverride ?? measuredWidth;
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
  const { deviceForBlock, publiclyRenderable, isRenderablePrimaryStage, primaryStageHasHeading } =
    createPageBlockRenderSemantics({
      resolvedDynamicTemplates,
      viewportWidth,
      pageKey: resolvedPageKey,
      preview: mode === "preview",
    });
  const allBlocks = [...content, ...zoneBlocks];
  const primaryHeroIndex = heroHeadingLevel === 2
    ? -1
    : primaryHeroBlock
      ? allBlocks.indexOf(primaryHeroBlock)
      : allBlocks.findIndex(primaryStageHasHeading);
  const primaryStageIndex = allBlocks.findIndex(isRenderablePrimaryStage);
  const presentPrimaryStage = homeSurface && mode === "public" ? renderPrimaryStage : undefined;
  // 区块级兜底：单个 block 运行时抛错只跳过该区块，避免整页白屏
  const render = (block: PuckBlock, index: number) => {
    const blockHeroHeadingLevel = index === primaryHeroIndex
      ? heroHeadingLevel
      : 2;
    const key = `eb-${block.props?.id || index}`;
    const section = (
      <ErrorBoundary
        key={key}
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
          pageHeroPlacement={index === primaryStageIndex ? "primary" : "subsequent"}
          resolvedDynamicTemplates={resolvedDynamicTemplates}
          deviceOverride={mode === "public" ? deviceForBlock(block) : undefined}
          pageKey={resolvedPageKey}
          publiclyRenderable={mode === "public" ? publiclyRenderable(block) : undefined}
        />
      </ErrorBoundary>
    );
    return presentPrimaryStage && index === primaryStageIndex
      ? <Fragment key={key}>{presentPrimaryStage(section, block)}</Fragment>
      : section;
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
      {primaryStageIndex < 0 ? presentPrimaryStage?.(null) : null}
      {content.map(render)}
      {zoneBlocks.map((block, index) =>
        render(block, content.length + index),
      )}
    </div>
  );
}
