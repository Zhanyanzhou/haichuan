import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import AppointmentBlock from "@/components/blocks/AppointmentBlock";
import CarouselBlock from "@/components/blocks/CarouselBlock";
import CategoryCardsBlock from "@/components/blocks/CategoryCardsBlock";
import BeforeAfterBlock from "@/components/blocks/BeforeAfterBlock";
import HotspotBlock from "@/components/blocks/HotspotBlock";
import ImageTextBlock from "@/components/blocks/ImageTextBlock";
import SplitPanelBlock from "@/components/blocks/SplitPanelBlock";
import VideoBlock from "@/components/blocks/VideoBlock";
import { convertPuckProps } from "@/page-builder/utils/puckPropsToModule";
import { resolveLinkTargetUrl } from "@/page-builder/utils/linkTarget";
import {
  getContentTemplateIssues,
} from "@/page-builder/generated/contentTemplates.generated";
import { isVisiblePrimaryStageBlock } from "@/page-builder/utils/primaryStagePolicy";
import ContentTemplateContractFrame from "@/page-builder/runtime/ContentTemplateContractFrame";
import {
  ResolvedCategoryCardsBlock,
  ResolvedFeaturedProductBlock,
  ResolvedProductRowBlock,
} from "@/page-builder/runtime/ResolvedBusinessTemplateBlocks";
import MatureContentTemplateRenderer from "@/page-builder/template-definition/MatureContentTemplateRenderer";
import { getMatureContentTemplateSlotType } from "@/page-builder/template-definition/validateTemplateDefinition";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import {
  normalizeLegacyRenderColors,
  useHasMissingAssets,
} from "@/page-builder/runtime/renderParity";
import type { PuckBlock, PuckDocument, PuckProps } from "@/page-builder/types";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  DynamicTemplateInstanceView,
  dynamicTemplateVersionKey,
  readResolvedDynamicTemplateDefinitions,
  type DynamicTemplateInstanceProps,
  type ResolvedDynamicTemplateDefinitionMap,
} from "@/page-builder/dynamic-template-instance";

export type { PuckBlock, PuckDocument } from "@/page-builder/types";

function UnsupportedContentTemplateState({
  type,
  message,
}: {
  type?: string;
  message: string;
}) {
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
        <p style={{ margin: "0 0 8px", fontSize: 15 }}>模板版本无法渲染</p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
          {type ? `「${type}」` : "该区块"}{message}
        </p>
      </div>
    </section>
  );
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function PublicMediaFallback({
  type,
  props,
  headingLevel,
}: {
  type?: string;
  props: PuckProps;
  headingLevel: 1 | 2;
}) {
  const eyebrow = [props.number, props.label, props.eyebrow]
    .map(textValue)
    .filter(Boolean)
    .join(" / ");
  const title = textValue(props.title);
  const body = textValue(
    props.body || props.subtitle || props.description || props.summary,
  );
  const actionText = textValue(
    props.actionText || props.buttonText || props.primaryText,
  );
  const targetUrl = resolveLinkTargetUrl({
    targetType: typeof props.targetType === "string" ? props.targetType : undefined,
    productCode: typeof props.productCode === "string" ? props.productCode : undefined,
    productId: typeof props.productId === "string" || typeof props.productId === "number" ? props.productId : undefined,
    categorySlug: typeof props.categorySlug === "string" ? props.categorySlug : undefined,
    linkUrl: typeof props.linkUrl === "string" ? props.linkUrl : undefined,
  });
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const isHero = type === "首屏主视觉";
  const background = isHero ? "#111315" : textValue(props.bgColor) || "#FFFFFF";
  const ink = isHero ? "#F7F8F8" : "#181A1B";
  const muted = isHero ? "rgba(247,248,248,.76)" : "#5F6568";

  if (!eyebrow && !title && !body && !(actionText && targetUrl)) return null;

  return (
    <DecorSection
      master="editorial-text"
      width="narrow"
      background={background}
      className="hc-public-media-fallback"
      data-media-fallback-for={type || "unknown"}
      style={isHero ? { minHeight: "max(520px, 100svh)", display: "grid", alignItems: "center" } : undefined}
    >
      <div style={{ maxWidth: 720, marginInline: "auto", textAlign: "center" }}>
        {eyebrow ? (
          <p style={{ margin: "0 0 18px", color: muted, fontFamily: FONT_SANS, fontSize: 11, letterSpacing: ".18em" }}>
            {eyebrow}
          </p>
        ) : null}
        {title ? (
          <Heading style={{ margin: 0, color: ink, fontFamily: FONT_DISPLAY, fontSize: "clamp(28px,3.2vw,48px)", fontWeight: 500, lineHeight: 1.25 }}>
            {title}
          </Heading>
        ) : null}
        {body ? (
          <p style={{ maxWidth: 720, margin: title ? "22px auto 0" : 0, color: muted, fontSize: 15, lineHeight: 1.9 }}>
            {body}
          </p>
        ) : null}
        {actionText && targetUrl ? (
          <Link
            to={targetUrl}
            style={{ display: "inline-flex", minHeight: 44, alignItems: "center", marginTop: 28, color: ink, fontFamily: FONT_SANS, fontSize: 13, letterSpacing: ".08em", textDecoration: "none", borderBottom: "1px solid currentColor" }}
          >
            {actionText}
          </Link>
        ) : null}
      </div>
    </DecorSection>
  );
}

function hasRequiredPublicMedia(block: PuckBlock) {
  const props = block.props || {};
  switch (block.type) {
    case "首屏主视觉":
      return Boolean(textValue(props.desktopImage) || textValue(props.mobileImage));
    case "全屏出血图":
      return Boolean(textValue(props.image) || textValue(props.mobileImage));
    case "单图海报":
      return Boolean(textValue(props.desktopImage) || textValue(props.mobileImage));
    case "双图海报":
      return Boolean(textValue(props.mainImage));
    case "作品画廊":
      return Array.isArray(props.items)
        && props.items.some((item: unknown) => Boolean(textValue((item as Record<string, unknown>)?.image)));
    default:
      return true;
  }
}

function suppressHomeSecondaryActions(props: PuckProps): PuckProps {
  return {
    ...props,
    actionText: "",
    buttonText: "",
    primaryText: "",
    secondaryText: "",
  };
}

export type PuckDocumentRenderMode = "public" | "preview";

function renderBlock(
  block: PuckBlock,
  index: number,
  mode: PuckDocumentRenderMode,
  heroHeadingLevel: 1 | 2,
  homeSurface: boolean,
  allowHomePrimaryAction: boolean,
  priority: boolean,
  resolvedDynamicTemplates: ResolvedDynamicTemplateDefinitionMap,
) {
  const normalized = normalizeLegacyRenderColors(block.props || {});
  const contractProps: PuckProps = normalized && typeof normalized === "object" && !Array.isArray(normalized)
    ? normalized as PuckProps
    : {};
  const props = homeSurface && !allowHomePrimaryAction
    ? suppressHomeSecondaryActions(contractProps)
    : contractProps;
  const key = textValue(props.id) || `${block.type || "block"}-${index}`;
  const preview = mode === "preview";
  const wrap = (node: ReactNode) => (
    <ContentTemplateContractFrame
      key={key}
      moduleType={block.type || ""}
      mode="public"
      props={contractProps}
    >
      {node}
    </ContentTemplateContractFrame>
  );

  if (props.isVisible === false) return null;

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
        mode={mode}
        primaryHeadingLevel={heroHeadingLevel}
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
    return (
      <UnsupportedContentTemplateState
        key={key}
        type={block.type}
        message={templateIssue.message}
      />
    );
  }

  if (block.type === "产品展示行") {
    return wrap(<ResolvedProductRowBlock props={props} codeOnly={homeSurface} stableReferencesOnly={false} />);
  }
  if (block.type === "单品焦点推荐") {
    return wrap(<ResolvedFeaturedProductBlock props={props} editMode={preview} codeOnly={homeSurface} stableReferencesOnly={false} />);
  }
  if (block.type === "分类卡片") {
    return wrap(<ResolvedCategoryCardsBlock props={props} allowInlineCategories />);
  }

  if (!preview && !hasRequiredPublicMedia({ ...block, props })) {
    return wrap(
      <PublicMediaFallback
        type={block.type}
        props={props}
        headingLevel={block.type === "首屏主视觉" ? heroHeadingLevel : 2}
      />,
    );
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
        stableReferencesOnly={block.type !== "佩戴灵感"}
      />
    );
  }

  const module = convertPuckProps(block.type || "", props);
  if (!module) return null;
  switch (block.type) {
    // 旧类型(分割面板/图文混排/礼赠指南)分支保留:
    // 已发布历史版本(revision)仍含这些类型,公开渲染永久兼容;
    // 编辑器侧已由 migratePuckData 转为新类型,模板库不再提供添加。
    case "图文混排":
      return <ImageTextBlock key={key} module={module} />;
    case "改款对比":
      return wrap(<BeforeAfterBlock module={module} />);
    case "分类卡片":
    case "礼赠指南":
      return block.type === "礼赠指南"
        ? <CategoryCardsBlock key={key} module={module} />
        : wrap(<CategoryCardsBlock module={module} />);
    case "分割面板":
      return <SplitPanelBlock key={key} module={module} />;
    case "轮播图":
      return wrap(<CarouselBlock module={module} />);
    case "视频区块":
      return wrap(<VideoBlock module={module} />);
    case "热区图":
      return wrap(<HotspotBlock module={module} />);
    case "预约入口":
      return wrap(homeSurface ? (
        <div className="hc-home-booking">
          <AppointmentBlock module={module} editMode={preview} />
        </div>
      ) : <AppointmentBlock module={module} editMode={preview} />);
    default:
      return null;
  }
}

function GuardedBlock({
  block,
  index,
  mode,
  heroHeadingLevel,
  homeSurface,
  allowHomePrimaryAction,
  priority,
  resolvedDynamicTemplates,
}: {
  block: PuckBlock;
  index: number;
  mode: PuckDocumentRenderMode;
  heroHeadingLevel: 1 | 2;
  homeSurface: boolean;
  allowHomePrimaryAction: boolean;
  priority: boolean;
  resolvedDynamicTemplates: ResolvedDynamicTemplateDefinitionMap;
}) {
  const hasMissingAsset = useHasMissingAssets(block.props || {});

  if (hasMissingAsset && mode === "public") {
    const normalized = normalizeLegacyRenderColors(block.props || {});
    const normalizedProps: PuckProps = normalized && typeof normalized === "object" && !Array.isArray(normalized)
      ? normalized as PuckProps
      : {};
    const fallbackProps = homeSurface && !allowHomePrimaryAction
      ? suppressHomeSecondaryActions(normalizedProps)
      : normalizedProps;
    return (
      <PublicMediaFallback
        type={block.type}
        props={fallbackProps}
        headingLevel={block.type === "首屏主视觉" ? heroHeadingLevel : 2}
      />
    );
  }
  return renderBlock(
    block,
    index,
    mode,
    heroHeadingLevel,
    homeSurface,
    allowHomePrimaryAction,
    priority,
    resolvedDynamicTemplates,
  );
}

export default function PuckDocumentRenderer({
  data,
  mode = "public",
  heroHeadingLevel = 1,
  primaryHeading,
  surface,
}: {
  data: PuckDocument;
  mode?: PuckDocumentRenderMode;
  heroHeadingLevel?: 1 | 2;
  /** 纯装修公开页的页面标题；无有效 Hero 标题时补为唯一的视觉隐藏 h1。 */
  primaryHeading?: string;
  surface?: "home";
}) {
  if (!Array.isArray(data?.content)) return null;
  const zoneBlocks =
    data?.zones && typeof data.zones === "object"
      ? Object.entries(data.zones).flatMap(([, blocks]) =>
          Array.isArray(blocks) ? blocks : [],
        )
      : [];
  const homeSurface = surface === "home";
  const resolvedDynamicTemplates = readResolvedDynamicTemplateDefinitions(
    data[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY],
  );
  const isPrimaryStage = (block: PuckBlock) => (
    isVisiblePrimaryStageBlock(block, resolvedDynamicTemplates)
  );
  // 已发布的历史文档可能早于“单一首屏”门禁。公开与只读预览只取第一个
  // 可见主舞台，既不修改源文档，也避免异常数据把整页堆成连续首屏。
  let primaryStageSeen = false;
  const keepRenderableBlock = (block: PuckBlock) => {
    if (!isPrimaryStage(block)) return true;
    if (primaryStageSeen) return false;
    primaryStageSeen = true;
    return true;
  };
  const renderableContent = data.content.filter(keepRenderableBlock);
  const renderableZoneBlocks = zoneBlocks.filter(keepRenderableBlock);
  const allBlocks = [...renderableContent, ...renderableZoneBlocks];
  const dynamicPrimaryStageHasHeading = (block: PuckBlock) => {
    if (block.type !== DYNAMIC_TEMPLATE_BLOCK_TYPE || !isPrimaryStage(block)) return false;
    const templateId = String(block.props?.templateId ?? "");
    const templateVersion = Number(block.props?.templateVersion);
    const definition = resolvedDynamicTemplates[
      dynamicTemplateVersionKey(templateId, templateVersion)
    ]?.definition;
    if (!definition) return false;
    const hidden = new Set(Array.isArray(block.props?.hiddenSlotIds) ? block.props.hiddenSlotIds : []);
    const instanceContent = block.props?.contentBySlotId && typeof block.props.contentBySlotId === "object"
      && !Array.isArray(block.props.contentBySlotId)
      ? block.props.contentBySlotId as Record<string, unknown>
      : {};
    return Object.values(definition.slots).some((slot) => {
      if (!["heading", "heroTemplate"].includes(slot.type) || hidden.has(slot.slotId)) return false;
      const value = Object.prototype.hasOwnProperty.call(instanceContent, slot.slotId)
        ? instanceContent[slot.slotId]
        : definition.defaultContent[slot.slotId];
      return slot.type === "heroTemplate"
        ? Boolean(value && typeof value === "object" && !Array.isArray(value)
          && typeof (value as Record<string, unknown>).title === "string"
          && ((value as Record<string, unknown>).title as string).trim().length > 0)
        : typeof value === "string" && value.trim().length > 0;
    });
  };
  const primaryHeroIndex = allBlocks.findIndex((block) => (
    block.type === "首屏主视觉"
      ? block.props?.isVisible !== false
        && typeof block.props?.title === "string"
        && block.props.title.trim().length > 0
      : dynamicPrimaryStageHasHeading(block)
  ));
  const homePrimaryHeroIndex = homeSurface
    ? allBlocks.findIndex(isPrimaryStage)
    : -1;
  const primaryStageIndex = allBlocks.findIndex(isPrimaryStage);
  // 区块级兜底：单个 block 运行时抛错只跳过该区块，避免整页白屏
  const render = (block: PuckBlock, index: number) => {
    const blockHeroHeadingLevel = index === primaryHeroIndex
      ? heroHeadingLevel
      : 2;
    return (
      <ErrorBoundary
        key={`eb-${block.props?.id || index}`}
        fallback={
          <section role="status" style={{ padding: "48px 24px", textAlign: "center", color: "#5F6568" }}>
            该内容暂不可展示
          </section>
        }
      >
        <GuardedBlock
          block={block}
          index={index}
          mode={mode}
          heroHeadingLevel={blockHeroHeadingLevel}
          homeSurface={homeSurface}
          allowHomePrimaryAction={homeSurface && index === homePrimaryHeroIndex}
          priority={index === primaryStageIndex}
          resolvedDynamicTemplates={resolvedDynamicTemplates}
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
      {renderableContent.map(render)}
      {renderableZoneBlocks.map((block, index) =>
        render(block, renderableContent.length + index),
      )}
    </div>
  );
}
