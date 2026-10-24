import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ElementType, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import type {
  TemplateDefinitionV2,
  DynamicTemplateLength,
  DynamicTemplatePlacement,
  TemplateInstanceLayoutOverride,
  TemplateInstanceLayoutOverridesByNodeId,
} from "./generated/templateDefinition.generated";
import {
  compileDynamicTemplateRenderPlan,
  findFirstReachableHeadingSlotId,
  type CompileDynamicTemplateRenderPlanOptions,
  type DynamicTemplateRenderPlanNode,
} from "./renderPlan";
import {
  getContentTemplateContract,
  getContentTemplateMediaReferences,
} from "../generated/contentTemplates.generated";
import { resolveEditableTargets } from "./editableTargets";
import { getDynamicTemplateNodeAdapter } from "./dynamicTemplateNodeAdapters";
import { objectPositionToPercent } from "./imagePosition";
import type { TemplateBreakpoint } from "./responsive";
import { TEMPLATE_MEDIA_DEFAULTS, TEMPLATE_TEXT_DEFAULTS } from "./designPropertySemantics";
import {
  moveFreePlacement,
} from "./freePlacementGeometry";
import {
  ZERO_MOBILE_BLEED,
  extendMobileBleedInset,
  imageBleedsOnMobile,
  mobileBleedBox,
  mobileFreeFrameStyle,
  subtreeHasMobileBleedImage,
  type MobileBleedInset,
} from "./mobileImageBleed";
import {
  getContentTemplateModuleTypeForSlotType,
  getDynamicTemplateStructureProtectedNodeIds,
  isSafeTemplateMediaUrl,
} from "./validateTemplateDefinition";
import {
  CONTENT_TEMPLATE_RENDER_SURFACE,
  useContentTemplateRenderSurface,
  type ContentTemplateRenderMode,
} from "../runtime/ContentTemplateRenderSurface";
import {
  resolveManagedTemplateMediaPreviewUrl,
  useManagedTemplateMediaDisplayUrl,
} from "./managedMediaPreview";
import { attachMobileWorkCaptions, partitionMobileWorkUnits, resolveMobileImageFrame } from "./mobileWorkGrid";
import { resolveMediaSlotImage } from "../config/mediaSlotContract";
import { RESPONSIVE_CANVAS } from "../config/blockContracts";
import "./DynamicTemplateRenderer.css";

export interface DynamicTemplateRendererProps {
  definition: TemplateDefinitionV2;
  device: "desktop" | "mobile";
  breakpoint?: TemplateBreakpoint;
  contentBySlotId?: Record<string, unknown>;
  hiddenSlotIds?: readonly string[];
  layoutOverridesByNodeId?: TemplateInstanceLayoutOverridesByNodeId;
  mode?: ContentTemplateRenderMode;
  /**
   * 是否保留空槽位的编辑占位。只有真正的结构编辑默认保留；
   * 只读预览、目录缩略图和公开页默认都按公开折叠语义处理空内容。
   */
  showEmptySlots?: boolean;
  publicSurface?: CompileDynamicTemplateRenderPlanOptions["publicSurface"];
  /**
   * 编辑态的交互边界。页面实例只负责整体预览，只有母模板定义工作面
   * 可以注册内部节点选择和直接布局手势；未声明时按无内部交互处理。
   */
  editorSurface?: "page-instance" | "template-definition";
  /** 同一编辑面只能有一个选择与手势 owner；宿主覆盖层接管时 Renderer 仅输出语义 DOM。 */
  interactionOwner?: "renderer" | "host-overlay";
  /** 当前模板编辑会话；仅用于给隔离画布内的合同槽位建立可写回身份。 */
  templateEditorSessionId?: string;
  selectedNodeId?: string | null;
  selectedContractRole?: { nodeId: string; roleId: string } | null;
  onSelectNode?: (nodeId: string) => void;
  onSelectContractRole?: (nodeId: string, roleId: string) => void;
  onNodeAction?: (
    nodeId: string,
    action: "duplicate" | "hide" | "delete" | "forward" | "backward"
      | "align-horizontal" | "align-vertical" | "copy-responsive",
  ) => void;
  /** 公开页主舞台可把首个可见标题槽位提升为页面唯一 h1。 */
  primaryHeadingLevel?: 1 | 2;
  /** 仅公开页首个实际可渲染主舞台的首个可达图片槽位使用。 */
  priority?: boolean;
  layoutEditMode?: boolean;
  onLayoutOverrideCommit?: (
    nodeId: string,
    device: "desktop" | "mobile",
    override: TemplateInstanceLayoutOverride | undefined,
  ) => void;
  onTemplatePlacementCommit?: (
    nodeId: string,
    device: "desktop" | "mobile",
    placement: DynamicTemplatePlacement,
  ) => void;
}

const DYNAMIC_TEMPLATE_BACKGROUND_TOKENS: Record<string, string> = {
  surface: "#ffffff",
  "surface-muted": "#F4F5F5",
  "brand-ink": "#181A1B",
  "brand-soft": "#ECEEEF",
};

function safeColor(value: string | undefined): string | undefined {
  return value && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value) ? value : undefined;
}

function isDisplayableTemplateMediaUrl(value: string | undefined): value is string {
  return Boolean(value && (value.startsWith("blob:") || isSafeTemplateMediaUrl(value)));
}

function backgroundImageToCss(
  rules: DynamicTemplateRenderPlanNode["rules"],
  imageUrl?: string,
): string | undefined {
  const layers: string[] = [];
  const gradient = rules.backgroundGradient;
  if (gradient && safeColor(gradient.from) && safeColor(gradient.to)
    && Number.isFinite(gradient.angle) && gradient.angle >= 0 && gradient.angle <= 360) {
    layers.push(`linear-gradient(${gradient.angle}deg, ${gradient.from}, ${gradient.to})`);
  }
  if (isDisplayableTemplateMediaUrl(imageUrl)) {
    layers.push(`url(${JSON.stringify(imageUrl)})`);
  }
  return layers.length ? layers.join(", ") : undefined;
}

function lengthToCss(length: DynamicTemplateLength | undefined): string | undefined {
  // 编辑视口会随内容调整 iframe 高度，vh 不能再以这个测量结果作为计算依据。
  // 复用宿主的稳定模拟视口；公开页面未提供该变量时仍保持原生 vh 语义。
  if (length?.unit === "vh") {
    return `calc(var(--homepage-editor-viewport-height, 100vh) * ${length.value / 100})`;
  }
  return length ? `${length.value}${length.unit}` : undefined;
}

function sizeToCss(value: DynamicTemplateRenderPlanNode["rules"]["width"]): string {
  if (value === "fill") return "100%";
  if (value === "fit") return "fit-content";
  if (value === "auto") return "auto";
  return lengthToCss(value) ?? "auto";
}

function spacingToCss(
  spacing: DynamicTemplateRenderPlanNode["rules"]["padding"],
): string | undefined {
  if (!spacing) return undefined;
  return [spacing.top, spacing.right, spacing.bottom, spacing.left]
    .map((value) => lengthToCss(value))
    .join(" ");
}

function ratioToCss(ratio: string | undefined): string | undefined {
  return ratio && /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(ratio)
    ? ratio.replace(":", " / ")
    : undefined;
}

/** 解析 "4:5" 这类比例；无法解析时返回 undefined。 */
function parseAspectRatio(ratio: string | undefined): { width: number; height: number } | undefined {
  if (!ratio || !/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(ratio)) return undefined;
  const [width, height] = ratio.split(":").map(Number);
  if (!(width > 0) || !(height > 0)) return undefined;
  return { width, height };
}

/**
 * 手机首屏没有单独竖图时，外框用 4:5，图片铺满。
 * 「完整放入」配上更高的竖框会把横图衬在深色底上，所以这种情况改为铺满。
 * 页面标题仍是槽位里的文字。实例里明确选择的适配方式保持不变。
 */
export function resolveImageObjectFit(
  node: Pick<DynamicTemplateRenderPlanNode, "layoutOverride" | "slot" | "slotRules">,
  viewport: "desktop" | "mobile" | undefined,
): NonNullable<CSSProperties["objectFit"]> {
  const explicitOverride = node.layoutOverride?.objectFit;
  const requested = explicitOverride
    ?? node.slotRules?.objectFit
    ?? TEMPLATE_MEDIA_DEFAULTS.objectFit;
  if (explicitOverride || viewport !== "mobile" || node.slot?.semanticRole !== "backgroundImage") {
    return requested;
  }
  const frame = parseAspectRatio(node.slotRules?.aspectRatio);
  const desktop = parseAspectRatio(node.slot?.desktopRules?.aspectRatio);
  const portraitFrame = Boolean(frame && frame.width / frame.height < 1);
  const sharedLandscape = !desktop || desktop.width / desktop.height >= 1;
  if (portraitFrame && sharedLandscape && requested === "contain") return "cover";
  return requested;
}

/**
 * 历史 Schema 1/2 的竖框 contain 曾改回桌面横图比例；Schema 3 必须尊重手机槽位比例。
 * 兼容分支只服务旧模板，不能覆盖新合同解析出的 mobileRules。
 */
function resolveImageFrameAspectRatio(
  node: DynamicTemplateRenderPlanNode,
  viewport: "desktop" | "mobile" | undefined,
  preserveResolvedMobileRatio: boolean,
): string | undefined {
  if (preserveResolvedMobileRatio) return undefined;
  if (resolveImageObjectFit(node, viewport) !== "contain" || viewport !== "mobile") return undefined;
  const desktop = parseAspectRatio(node.slot?.desktopRules?.aspectRatio);
  if (desktop && desktop.width / desktop.height >= 1) {
    return `${desktop.width} / ${desktop.height}`;
  }
  return undefined;
}

function rulesToStyle(
  node: DynamicTemplateRenderPlanNode,
  previewOverride?: TemplateInstanceLayoutOverride,
  placementPreview?: DynamicTemplatePlacement,
  parentFree = false,
  parentRules?: DynamicTemplateRenderPlanNode["rules"],
  relationalLayout = false,
  backgroundDisplayUrl?: string,
  viewport?: "desktop" | "mobile",
  preserveResolvedMobileRatio = false,
): CSSProperties {
  const { rules } = node;
  const alignsOwnChildren = rules.display === "flex" || rules.display === "grid";
  const style: CSSProperties = {
    display: rules.display,
    order: rules.order,
    width: sizeToCss(rules.width),
    maxWidth: lengthToCss(rules.maxWidth),
    minHeight: lengthToCss(rules.minHeight),
    gap: lengthToCss(rules.gap),
    padding: spacingToCss(rules.padding),
    marginTop: lengthToCss(rules.margin?.top),
    marginRight: lengthToCss(rules.margin?.right),
    marginBottom: lengthToCss(rules.margin?.bottom),
    marginLeft: lengthToCss(rules.margin?.left),
    // 同一个“交叉方向对齐”控件需要兼顾容器和普通流节点：
    // flex/grid 对齐自己的子项，block 节点则在父级交叉轴上对齐自身。
    // 把 block 的值写成 align-items 虽然合法，但没有布局效果，会造成
    // Inspector 显示“靠后”而画布仍停在左侧。
    alignItems: alignsOwnChildren ? rules.alignItems : undefined,
    alignSelf: alignsOwnChildren ? undefined : rules.alignItems,
    justifyContent: rules.justifyContent,
    borderRadius: lengthToCss(rules.radius),
    overflow: rules.overflow,
    backgroundColor: safeColor(rules.backgroundColor) ?? (rules.backgroundToken
      ? DYNAMIC_TEMPLATE_BACKGROUND_TOKENS[rules.backgroundToken]
      : undefined),
    backgroundImage: backgroundImageToCss(rules, backgroundDisplayUrl),
    backgroundSize: rules.backgroundImage ? "cover" : undefined,
    backgroundPosition: rules.backgroundImage ? "center" : undefined,
    opacity: Number.isFinite(rules.opacity) ? Math.max(0, Math.min(1, rules.opacity!)) : undefined,
    border: rules.borderToken ? {
      subtle: "1px solid #DDE1E2",
      strong: "1px solid #6E7477",
      accent: "1px solid #181A1B",
    }[rules.borderToken] : undefined,
  };
  if (rules.display === "flex") style.flexDirection = rules.direction ?? "row";
  if (rules.display === "grid" && rules.columns?.length) {
    style.gridTemplateColumns = rules.columns.map((column) => relationalLayout ? `minmax(0, ${column}fr)` : `${column}fr`).join(" ");
  }
  if (relationalLayout) {
    if (rules.display === "grid" && ["start", "center", "end"].includes(rules.justifyContent ?? "")) style.justifyItems = rules.justifyContent as "start" | "center" | "end";
    style.minWidth = lengthToCss(rules.minWidth) ?? 0;
    style.maxHeight = lengthToCss(rules.maxHeight);
    if (node.children.length) style.position = "relative";
    if (rules.display === "flex") style.flexWrap = rules.wrap ?? "nowrap";
    if (parentRules?.display === "flex" && parentRules.layoutMode !== "free") {
      if ((parentRules.direction ?? "row") === "row") {
        if (rules.width === "fill") {
          style.width = 0;
          style.flex = "1 1 0px";
        } else style.flex = "0 0 auto";
        if (rules.height.mode === "fill") { style.alignSelf = "stretch"; style.height = "auto"; }
      } else if (rules.height.mode === "fill") {
        style.flex = "1 1 0px";
        style.minHeight = lengthToCss(rules.minHeight) ?? 0;
      }
    }
    if (rules.height.mode === "fit") style.height = "fit-content";
    if (rules.height.mode === "fill" && parentRules?.display !== "flex") style.height = "100%";
  }
  const height = rules.height;
  const landscapeSafeRatio = resolveImageFrameAspectRatio(node, viewport, preserveResolvedMobileRatio);
  if (height.mode === "min-height") style.minHeight = lengthToCss(height.value);
  if (height.mode === "fixed" || height.mode === "viewport") style.height = lengthToCss(height.value);
  if (height.mode === "aspect-ratio" && height.ratio) {
    style.aspectRatio = landscapeSafeRatio ?? `${height.ratio.width} / ${height.ratio.height}`;
  }
  const imageSlotAspectRatio = node.slot?.type === "image" && height.mode === "auto"
    ? landscapeSafeRatio ?? ratioToCss(node.slotRules?.aspectRatio)
    : undefined;
  if (imageSlotAspectRatio) {
    style.aspectRatio = imageSlotAspectRatio;
    if (!rules.overflow) style.overflow = "hidden";
  }
  if (rules.layoutMode === "free") {
    style.position = "relative";
    style.display = "block";
  }
  const placement = placementPreview ?? rules.placement;
  if (parentFree && placement) {
    style.position = "absolute";
    style.left = `${placement.x * 100}%`;
    style.top = `${placement.y * 100}%`;
    style.width = `${placement.width * 100}%`;
    style.height = `${placement.height * 100}%`;
    style.zIndex = placement.zIndex;
    style.marginTop = 0;
    style.marginRight = 0;
    style.marginBottom = 0;
    style.marginLeft = 0;
    if (relationalLayout) {
      style.left = `calc(${placement.x * 100}% + var(--template-content-pad-left, 0px) * ${1 - placement.x} - var(--template-content-pad-right, 0px) * ${placement.x})`;
      style.top = `calc(${placement.y * 100}% + var(--template-content-pad-top, 0px) * ${1 - placement.y} - var(--template-content-pad-bottom, 0px) * ${placement.y})`;
      style.width = `calc(${placement.width * 100}% - (var(--template-content-pad-left, 0px) + var(--template-content-pad-right, 0px)) * ${placement.width})`;
      style.height = `calc(${placement.height * 100}% - (var(--template-content-pad-top, 0px) + var(--template-content-pad-bottom, 0px)) * ${placement.height})`;
    }
  }
  if (relationalLayout && rules.anchor) {
    const anchor = rules.anchor;
    style.position = "absolute";
    const horizontal = anchor.horizontal === "left" ? 0 : anchor.horizontal === "center" ? 50 : 100;
    const vertical = anchor.vertical === "top" ? 0 : anchor.vertical === "center" ? 50 : 100;
    const offsetX = anchor.offsetX.unit === "%" ? `(${100}% - var(--template-content-pad-left, 0px) - var(--template-content-pad-right, 0px)) * ${anchor.offsetX.value / 100}` : lengthToCss(anchor.offsetX);
    const offsetY = anchor.offsetY.unit === "%" ? `(${100}% - var(--template-content-pad-top, 0px) - var(--template-content-pad-bottom, 0px)) * ${anchor.offsetY.value / 100}` : lengthToCss(anchor.offsetY);
    style.left = `calc(${horizontal}% + ${offsetX} + var(--template-content-pad-left, 0px) * ${1 - horizontal / 100} - var(--template-content-pad-right, 0px) * ${horizontal / 100})`;
    style.top = `calc(${vertical}% + ${offsetY} + var(--template-content-pad-top, 0px) * ${1 - vertical / 100} - var(--template-content-pad-bottom, 0px) * ${vertical / 100})`;
    style.transform = `translate(-${horizontal}%, -${vertical}%)`;
    if (placement) {
      style.width = `calc(${placement.width * 100}% - (var(--template-content-pad-left, 0px) + var(--template-content-pad-right, 0px)) * ${placement.width})`;
      style.height = `calc(${placement.height * 100}% - (var(--template-content-pad-top, 0px) + var(--template-content-pad-bottom, 0px)) * ${placement.height})`;
      style.zIndex = placement.zIndex;
    }
    style.margin = 0;
  }
  const instance = previewOverride ?? node.layoutOverride;
  if (instance) {
    if (!relationalLayout || style.position !== "absolute") style.position = "relative";
    if (instance.offsetXPercent || instance.offsetYPercent) {
      const offset = `translate(${instance.offsetXPercent ?? 0}%, ${instance.offsetYPercent ?? 0}%)`;
      style.transform = relationalLayout && style.transform ? `${style.transform} ${offset}` : offset;
    }
    if (instance.widthPercent !== undefined) {
      style.width = `${instance.widthPercent}%`;
      if (relationalLayout && parentRules?.display === "flex") style.flex = "0 0 auto";
    }
    if (instance.zIndex !== undefined) style.zIndex = instance.zIndex;
    if (instance.marginTopPx !== undefined) style.marginTop = instance.marginTopPx;
    if (instance.marginBottomPx !== undefined) style.marginBottom = instance.marginBottomPx;
  }
  if (node.slot?.type === "image" && style.position !== "absolute") {
    style.position = "relative";
  }
  // 流式手机布局里 Logo 是品牌标记，固定窄宽时居中，避免贴在左缘像多出来的图片碎片。
  if (node.slot?.semanticRole === "logo" && style.position !== "absolute") {
    style.alignSelf = "center";
  }
  return style;
}

function sparseLayoutOverride(value: TemplateInstanceLayoutOverride): TemplateInstanceLayoutOverride | undefined {
  const next: TemplateInstanceLayoutOverride = {};
  if (value.offsetXPercent) next.offsetXPercent = Math.round(value.offsetXPercent * 100) / 100;
  if (value.offsetYPercent) next.offsetYPercent = Math.round(value.offsetYPercent * 100) / 100;
  if (value.widthPercent !== undefined && value.widthPercent !== 100) {
    next.widthPercent = Math.round(value.widthPercent * 100) / 100;
  }
  if (value.zIndex) next.zIndex = value.zIndex;
  if (value.objectFit) next.objectFit = value.objectFit;
  if (value.imageScalePercent !== undefined && value.imageScalePercent !== 100) {
    next.imageScalePercent = Math.round(value.imageScalePercent * 100) / 100;
  }
  if (value.focusXPercent !== undefined && value.focusXPercent !== 50) {
    next.focusXPercent = Math.round(value.focusXPercent * 100) / 100;
  }
  if (value.focusYPercent !== undefined && value.focusYPercent !== 50) {
    next.focusYPercent = Math.round(value.focusYPercent * 100) / 100;
  }
  if (value.fontSizePx !== undefined) next.fontSizePx = Math.round(value.fontSizePx * 100) / 100;
  if (value.textAlign) next.textAlign = value.textAlign;
  if (value.marginTopPx) next.marginTopPx = Math.round(value.marginTopPx * 100) / 100;
  if (value.marginBottomPx) next.marginBottomPx = Math.round(value.marginBottomPx * 100) / 100;
  return Object.keys(next).length ? next : undefined;
}

function getSafeActionContent(content: unknown): { label: string; href?: string } {
  if (!content || typeof content !== "object" || Array.isArray(content)) return { label: "" };
  const record = content as Record<string, unknown>;
  const label = typeof record.label === "string" ? record.label : "";
  // 站内页面跳转只接受本站绝对路径；排除 `//` 协议相对地址（可被填成外站钓鱼链接）
  if (
    record.targetType === "page" &&
    typeof record.pagePath === "string" &&
    record.pagePath.startsWith("/") &&
    !record.pagePath.startsWith("//") &&
    !record.pagePath.includes("\\")
  ) {
    return { label, href: record.pagePath };
  }
  if (record.targetType === "external" && typeof record.url === "string" && /^https:\/\//i.test(record.url)) {
    return { label, href: record.url };
  }
  if (record.targetType === "product" && typeof record.productCode === "string" && record.productCode.trim()) {
    return { label, href: `/products/${encodeURIComponent(record.productCode.trim())}` };
  }
  if (record.targetType === "category" && typeof record.categorySlug === "string" && record.categorySlug.trim()) {
    return { label, href: `/catalog?category=${encodeURIComponent(record.categorySlug.trim())}` };
  }
  return { label };
}

/** 按动态模板节点几何推导桌面宽度系数（%）；无法确定返回 undefined。 */
function resolveDesktopWidthFraction(node: DynamicTemplateRenderPlanNode): number | undefined {
  const rules = node.rules;
  if (rules.layoutMode === "free" && rules.placement) {
    const fraction = rules.placement.width;
    if (Number.isFinite(fraction) && fraction > 0 && fraction <= 1) {
      return Math.round(fraction * 100);
    }
    return undefined;
  }
  const width = rules.width;
  if (width === "fill") return 100;
  // "auto"/"fit" 是内容自适应（CSS fit-content/auto，见 lengthToCss）：渲染宽度 = min(图片固有宽度, 容器宽度)，
  // 固有宽度在派生 sizes 的渲染前拿不到，故返回 undefined 兜底 100vw（宁可高估不低估），不尝试收紧以免欠采样发虚。
  if (typeof width === "object") {
    if (width.unit === "vw" && Number.isFinite(width.value) && width.value > 0 && width.value <= 100) return width.value;
    if (width.unit === "%" && Number.isFinite(width.value) && width.value > 0 && width.value <= 100) return width.value;
  }
  return undefined;
}

/**
 * 图片槽 sizes：首屏/移动通栏取 100vw；桌面非首屏按节点几何推导宽度系数，
 * 推导不出时退回 100vw（宁可高估不低估），避免候选宽度小于实际渲染宽度而发虚。
 */
function resolveTemplateImageSizes(
  node: DynamicTemplateRenderPlanNode,
  viewport: "desktop" | "mobile",
  priority: boolean,
): string {
  if (priority || viewport === "mobile") return "100vw";
  const fraction = resolveDesktopWidthFraction(node);
  if (fraction === undefined || fraction >= 100) return "100vw";
  return `(max-width: ${RESPONSIVE_CANVAS.mobileMaxWidth}px) 100vw, ${fraction}vw`;
}

function ManagedTemplateSlotImage({
  src,
  alt,
  objectFit,
  objectPosition,
  transform,
  transformOrigin,
  hostFetch,
  priority,
  ratio,
  viewport,
  sizes,
}: {
  src: string;
  alt: string;
  objectFit: NonNullable<CSSProperties["objectFit"]>;
  objectPosition: string;
  transform?: string;
  transformOrigin?: string;
  hostFetch: boolean;
  priority: boolean;
  ratio?: string;
  viewport: "desktop" | "mobile";
  sizes?: string;
}) {
  const media = useManagedTemplateMediaDisplayUrl(src, hostFetch);
  const previewUrl = hostFetch ? resolveManagedTemplateMediaPreviewUrl(src) : src;
  const displaySrc = hostFetch
    ? (media.status === "error" ? previewUrl : media.displaySrc)
    : src;
  // 公开态才接派生图与固有尺寸；后台态走 blob 预览，保持即时显示与既有会话语义。
  const resolved = hostFetch
    ? undefined
    : resolveMediaSlotImage({ ratio: ratio ?? "", viewport, priority, sizes }, displaySrc);
  const loading = priority ? "eager" : hostFetch ? undefined : "lazy";
  const style: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit,
    objectPosition,
    transform,
    transformOrigin,
  };
  return (
    <img
      src={displaySrc || undefined}
      alt={alt}
      data-template-image-fit={objectFit}
      data-template-media-state={media.status}
      data-template-managed-preview={hostFetch ? previewUrl : undefined}
      loading={loading}
      decoding="async"
      {...(priority ? { fetchpriority: "high" } : {})}
      {...(resolved?.srcSet ? { srcSet: resolved.srcSet } : {})}
      {...(resolved?.srcSet && resolved.sizes ? { sizes: resolved.sizes } : {})}
      {...(resolved?.width !== undefined && resolved.height !== undefined
        ? { width: resolved.width, height: resolved.height }
        : {})}
      style={style}
    />
  );
}

function readRenderedImageSource(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!content || typeof content !== "object" || Array.isArray(content)) return "";
  const src = (content as { src?: unknown }).src;
  return typeof src === "string" ? src.trim() : "";
}

function renderSlotContent(
  node: DynamicTemplateRenderPlanNode,
  mode: NonNullable<DynamicTemplateRendererProps["mode"]>,
  headingLevel: 1 | 2 = 2,
  editorBlockId?: string,
  editorViewport?: "desktop" | "mobile",
  interactionOwner?: DynamicTemplateRendererProps["interactionOwner"],
  relationalLayout = false,
  priority = false,
  imageFit?: NonNullable<CSSProperties["objectFit"]>,
): ReactNode {
  const { slot, content } = node;
  if (!slot) return null;
  const adapter = getDynamicTemplateNodeAdapter(slot.type);
  if (adapter) return adapter.render({
    content: editorBlockId && content && typeof content === "object" && !Array.isArray(content)
      ? { ...content as Record<string, unknown>, id: editorBlockId, __editorViewport: editorViewport, __interactionOwner: interactionOwner }
      : editorBlockId
        ? { id: editorBlockId, __editorViewport: editorViewport, __interactionOwner: interactionOwner }
        : interactionOwner === "host-overlay" && content && typeof content === "object" && !Array.isArray(content)
          ? { ...content as Record<string, unknown>, __interactionOwner: interactionOwner }
          : interactionOwner === "host-overlay"
            ? { __interactionOwner: interactionOwner }
            : content,
    mode,
    nodeProps: node.props,
    headingLevel,
    priority,
  });
  const textOverflow = node.slotRules?.overflow ?? TEMPLATE_TEXT_DEFAULTS.overflow;
  const textStyle: CSSProperties = {
    margin: 0,
    fontSize: node.layoutOverride?.fontSizePx !== undefined
      ? `${node.layoutOverride.fontSizePx}px`
      : lengthToCss(node.slotRules?.fontSize),
    fontWeight: node.slotRules?.fontWeight,
    fontFamily: node.slotRules?.fontFamily
      ? ({ system: "system-ui, sans-serif", serif: '"Noto Serif SC", "Source Han Serif CN", serif', sans: "Inter, system-ui, sans-serif" } as const)[node.slotRules.fontFamily]
      : undefined,
    color: safeColor(node.slotRules?.color),
    letterSpacing: Number.isFinite(node.slotRules?.letterSpacing) ? `${node.slotRules!.letterSpacing}px` : undefined,
    lineHeight: node.slotRules?.lineHeight,
    textAlign: node.layoutOverride?.textAlign ?? node.slotRules?.textAlign,
    ...(relationalLayout ? {
      whiteSpace: "pre-wrap" as const,
      overflowWrap: "anywhere" as const,
      ...(textOverflow === "clip" ? { overflow: "hidden" } : {}),
    } : {}),
    ...(node.slotRules?.maxLines ? {
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: node.slotRules.maxLines,
      overflow: "hidden",
    } : {}),
    ...(textOverflow === "ellipsis" && !node.slotRules?.maxLines ? {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    } : {}),
  };
  const fontClass = relationalLayout && node.slotRules?.fontRole
    ? ({ display: "font-display", heading: "font-body", body: "font-body", caption: "font-sans", action: "font-sans" } as const)[node.slotRules.fontRole]
    : undefined;
  if (slot.type === "image") {
    const record = content && typeof content === "object" && !Array.isArray(content)
      ? content as Record<string, unknown>
      : null;
    const src = typeof content === "string" ? content : typeof record?.src === "string" ? record.src : "";
    const alt = typeof record?.alt === "string" ? record.alt : "";
    const defaultFocus = objectPositionToPercent(node.slotRules?.objectPosition ?? TEMPLATE_MEDIA_DEFAULTS.objectPosition);
    // 对外页面没有图片就不留外框。编辑和方案预览仍铺满比例框，标出图片位置。
    if (!src.trim()) {
      if (mode === "public") return null;
      return (
        <span
          className="hc-dynamic-template__empty-slot"
          data-template-empty-image="true"
          style={{ position: "absolute", inset: 0, minHeight: 0, background: "#ECEEEF" }}
        >
          图片待填写
        </span>
      );
    }
    if (src.includes("catalog-structure-media.svg")) {
      // 目录卡片把整页缩进 iframe。流式槽位的高度来自比例，cqmin 会算成 0，
      // 图标和边框都消失，只剩灰块。这里用槽位自身的百分比，缩小时图标仍在框内。
      return (
        <span
          data-template-neutral-media="true"
          style={{
            position: "absolute",
            inset: 0,
            boxSizing: "border-box",
            background: "#E4E7E8",
            boxShadow: "inset 0 0 0 8px #5F6568",
          }}
        >
          <span style={{ position: "absolute", left: "16%", top: "16%", width: "68%", height: "68%" }}>
            <ManagedTemplateSlotImage
              src={src}
              alt={alt}
              hostFetch={mode !== "public"}
              priority={priority}
              ratio={node.slotRules?.aspectRatio}
              viewport={editorViewport ?? "desktop"}
              sizes={resolveTemplateImageSizes(node, editorViewport ?? "desktop", priority)}
              objectFit="contain"
              objectPosition="center"
            />
          </span>
        </span>
      );
    }
    const objectFit = imageFit ?? resolveImageObjectFit(node, editorViewport);
    return (
      <ManagedTemplateSlotImage
        src={src}
        alt={alt}
        hostFetch={mode !== "public"}
        priority={priority}
        ratio={node.slotRules?.aspectRatio}
        viewport={editorViewport ?? "desktop"}
        sizes={resolveTemplateImageSizes(node, editorViewport ?? "desktop", priority)}
        objectFit={objectFit}
        objectPosition={`${node.layoutOverride?.focusXPercent ?? defaultFocus.x}% ${node.layoutOverride?.focusYPercent ?? defaultFocus.y}%`}
        transform={node.layoutOverride?.imageScalePercent && node.layoutOverride.imageScalePercent !== 100
          ? `scale(${node.layoutOverride.imageScalePercent / 100})`
          : undefined}
        transformOrigin={`${node.layoutOverride?.focusXPercent ?? defaultFocus.x}% ${node.layoutOverride?.focusYPercent ?? defaultFocus.y}%`}
      />
    );
  }
  if (["heading", "text", "richText", "badge", "icon"].includes(slot.type)) {
    const text = typeof content === "string" ? content : "";
    if (!text) return mode === "public" ? null : <span className="hc-dynamic-template__empty-slot">{slot.label}待填写</span>;
    if (slot.type === "heading") {
      const Heading = headingLevel === 1 ? "h1" : "h2";
      return <Heading className={fontClass} data-template-font-role={node.slotRules?.fontRole} style={textStyle}>{text}</Heading>;
    }
    if (slot.type === "badge") return <span className={fontClass} data-template-font-role={node.slotRules?.fontRole} style={textStyle}>{text}</span>;
    return <p className={fontClass} data-template-font-role={node.slotRules?.fontRole} style={relationalLayout ? textStyle : { ...textStyle, whiteSpace: "pre-wrap" }}>{text}</p>;
  }
  if (slot.type === "button" || slot.type === "link") {
    const action = getSafeActionContent(content);
    if (!action.label) return mode === "public" ? null : <span className="hc-dynamic-template__empty-slot">行动待填写</span>;
    // 行动槽位的可点击语义由承载全部布局/背景/边框的节点外壳负责。
    // 这里始终只输出文案，避免形成“外层视觉盒子 + 内层文字链接”的双重命中区域。
    // 对齐作用于行动槽位的可用宽度；行内 span 不会响应 text-align。
    return <span className={fontClass} data-template-font-role={node.slotRules?.fontRole} style={{ display: "block", ...textStyle }}>{action.label}</span>;
  }
  if (slot.type === "product") {
    const productCode = typeof content === "string" ? content.trim() : "";
    const mockLabel = mode !== "public"
      && content && typeof content === "object" && !Array.isArray(content)
      && (content as Record<string, unknown>).mock === true
      && typeof (content as Record<string, unknown>).label === "string"
      ? String((content as Record<string, unknown>).label)
      : "";
    if (mockLabel) return <span data-template-mock-content="product">{mockLabel}</span>;
    return productCode
      ? <a href={`/products/${encodeURIComponent(productCode)}`}>{productCode}</a>
      : mode === "public" ? null : <span className="hc-dynamic-template__empty-slot">商品待选择</span>;
  }
  if (slot.type === "collection") {
    const refs = Array.isArray(content) ? content.filter((item): item is string => typeof item === "string") : [];
    return refs.length ? (
      <ul>
        {refs.map((reference) => (
          <li key={reference}>
            <a href={`/products/${encodeURIComponent(reference)}`}>{reference}</a>
          </li>
        ))}
      </ul>
    ) : mode === "public" ? null : <span className="hc-dynamic-template__empty-slot">集合待选择</span>;
  }
  return null;
}

function nodeElementType(node: DynamicTemplateRenderPlanNode): ElementType {
  if (node.type === "Section") return node.props.semanticTag === "header" ? "header" : "section";
  if (["Container", "Grid", "Row", "Column", "Stack"].includes(node.type)) {
    return node.props.semanticTag ?? "div";
  }
  return "div";
}

function renderTemplateChildren({
  node,
  sectionRole,
  device,
  parentFree,
  constrainWorkCell = false,
  inheritedCanvasColor,
  bleedInset = ZERO_MOBILE_BLEED,
  bleedAtStart = true,
  bleedAtEnd = true,
  ...shared
}: {
  node: DynamicTemplateRenderPlanNode;
  sectionRole?: string;
  device: "desktop" | "mobile";
  parentFree: boolean;
  constrainWorkCell?: boolean;
  inheritedCanvasColor?: string;
  bleedInset?: MobileBleedInset;
  bleedAtStart?: boolean;
  bleedAtEnd?: boolean;
} & Omit<Parameters<typeof RenderNode>[0], "node" | "sectionRole" | "device" | "parentFree" | "parentRules" | "siblingIndex" | "siblingPlacements" | "workCardFrame" | "constrainWorkCell" | "inheritedCanvasColor" | "bleedInset" | "bleedAtStart" | "bleedAtEnd">) {
  const childInset = extendMobileBleedInset(
    bleedInset,
    node.rules.padding,
    device === "mobile" && !parentFree && !constrainWorkCell && node.rules.layoutMode !== "free",
  );
  const visibleChildren = node.children.filter((child) => !child.hidden);
  const firstVisibleId = visibleChildren[0]?.nodeId;
  const lastVisibleId = visibleChildren[visibleChildren.length - 1]?.nodeId;
  const groups = attachMobileWorkCaptions(partitionMobileWorkUnits(node.children, {
    device,
    sectionRole,
    layoutMode: node.rules.layoutMode,
    display: node.rules.display,
    columnCount: node.rules.columns?.length,
  }));
  const renderChild = (
    child: DynamicTemplateRenderPlanNode,
    childIndex: number,
    inWorkGrid: boolean,
  ) => (
    <RenderNode
      key={child.nodeId}
      node={child}
      device={device}
      sectionRole={sectionRole}
      constrainWorkCell={constrainWorkCell || inWorkGrid}
      workCardFrame={(constrainWorkCell || inWorkGrid) && child.slot?.type === "image"}
      parentFree={parentFree}
      parentRules={node.rules}
      siblingIndex={childIndex}
      siblingPlacements={node.children
        .filter((sibling) => sibling.nodeId !== child.nodeId)
        .flatMap((sibling) => sibling.rules.placement ? [sibling.rules.placement] : [])}
      {...shared}
      inheritedCanvasColor={inheritedCanvasColor}
      bleedInset={childInset}
      bleedAtStart={bleedAtStart && child.nodeId === firstVisibleId}
      bleedAtEnd={bleedAtEnd && child.nodeId === lastVisibleId}
    />
  );
  return groups.map((group) => {
    if (group.kind === "node") {
      const childIndex = node.children.findIndex((child) => child.nodeId === group.node.nodeId);
      return renderChild(group.node, childIndex, false);
    }
    if (group.nodes.length < 2) {
      const child = group.nodes[0];
      const childIndex = node.children.findIndex((item) => item.nodeId === child.nodeId);
      return renderChild(child, childIndex, false);
    }
    return (
      <div
        key={group.nodes.map((child) => child.nodeId).join(":")}
        data-template-mobile-work-grid="true"
        style={{
          display: "grid",
          gap: "16px",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          width: "100%",
        }}
      >
        {group.nodes.map((child, cardIndex) => {
          const childIndex = node.children.findIndex((item) => item.nodeId === child.nodeId);
          const caption = group.captions[cardIndex];
          const captionIndex = caption ? node.children.findIndex((item) => item.nodeId === caption.nodeId) : -1;
          return (
            <div key={child.nodeId} data-template-mobile-work-card="true" style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 }}>
              {renderChild(child, childIndex, true)}
              {caption ? renderChild(caption, captionIndex, true) : null}
            </div>
          );
        })}
      </div>
    );
  });
}

function RenderNode({
  node,
  mode,
  selectedNodeId,
  selectedContractRole,
  onSelectNode,
  onSelectContractRole,
  onNodeAction,
  primaryHeadingSlotId,
  primaryImageSlotId,
  primaryHeadingLevel,
  device,
  layoutEditMode,
  onLayoutOverrideCommit,
  onTemplatePlacementCommit,
  templateEditorSessionId,
  interactionOwner,
  contentRenderMode,
  structureProtectedNodeIds,
  editableContractRoleIdsByNode,
  showEmptyStructure,
  parentFree = false,
  siblingPlacements = [],
  siblingIndex = 0,
  parentRules,
  relationalLayout = false,
  preserveResolvedMobileRatio = false,
  sectionRole,
  workCardFrame = false,
  constrainWorkCell = false,
  inheritedCanvasColor,
  bleedInset = ZERO_MOBILE_BLEED,
  bleedAtStart = true,
  bleedAtEnd = true,
}: {
  node: DynamicTemplateRenderPlanNode;
  mode: NonNullable<DynamicTemplateRendererProps["mode"]>;
  selectedNodeId?: string | null;
  selectedContractRole?: DynamicTemplateRendererProps["selectedContractRole"];
  onSelectNode?: (nodeId: string) => void;
  onSelectContractRole?: DynamicTemplateRendererProps["onSelectContractRole"];
  onNodeAction?: DynamicTemplateRendererProps["onNodeAction"];
  primaryHeadingSlotId?: string;
  primaryImageSlotId?: string;
  primaryHeadingLevel: 1 | 2;
  device: "desktop" | "mobile";
  layoutEditMode?: boolean;
  onLayoutOverrideCommit?: DynamicTemplateRendererProps["onLayoutOverrideCommit"];
  onTemplatePlacementCommit?: DynamicTemplateRendererProps["onTemplatePlacementCommit"];
  templateEditorSessionId?: string;
  interactionOwner?: DynamicTemplateRendererProps["interactionOwner"];
  contentRenderMode: NonNullable<DynamicTemplateRendererProps["mode"]>;
  structureProtectedNodeIds?: ReadonlySet<string>;
  editableContractRoleIdsByNode?: ReadonlyMap<string, ReadonlySet<string>>;
  showEmptyStructure: boolean;
  parentFree?: boolean;
  parentRules?: DynamicTemplateRenderPlanNode["rules"];
  relationalLayout?: boolean;
  preserveResolvedMobileRatio?: boolean;
  siblingPlacements?: DynamicTemplatePlacement[];
  siblingIndex?: number;
  sectionRole?: string;
  workCardFrame?: boolean;
  constrainWorkCell?: boolean;
  inheritedCanvasColor?: string;
  bleedInset?: MobileBleedInset;
  bleedAtStart?: boolean;
  bleedAtEnd?: boolean;
}) {
  const layoutElement = useRef<HTMLElement | null>(null);
  const backgroundSource = !node.hidden && node.rules.backgroundImage && isSafeTemplateMediaUrl(node.rules.backgroundImage)
    ? node.rules.backgroundImage
    : "";
  const backgroundMedia = useManagedTemplateMediaDisplayUrl(backgroundSource, mode !== "public");
  const backgroundDisplayUrl = !backgroundSource
    ? undefined
    : mode === "public"
      ? backgroundSource
      : backgroundMedia.status === "ready"
        ? backgroundMedia.displaySrc
        : backgroundMedia.status === "error"
          ? resolveManagedTemplateMediaPreviewUrl(backgroundSource)
          : undefined;
  const hasPositionedChildren = relationalLayout && node.children.some((child) => child.rules.anchor || child.rules.placement);
  useLayoutEffect(() => {
    const element = layoutElement.current;
    const ownerWindow = element?.ownerDocument.defaultView;
    if (!element || !ownerWindow || !element.isConnected || !hasPositionedChildren) return;
    // 只测量具有叠放子项的容器，统一处理 px、rem 及百分比 padding；不写模板状态。
    const measure = () => {
      if (!element.isConnected || !element.ownerDocument.defaultView) return;
      const computed = element.ownerDocument.defaultView.getComputedStyle(element);
      for (const side of ["top", "right", "bottom", "left"] as const) {
        const value = computed.getPropertyValue(`padding-${side}`);
        const property = `--template-content-pad-${side}`;
        if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
      }
    };
    measure();
    const observer = new ownerWindow.ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasPositionedChildren, node.rules.padding]);
  const safeAction = node.slot && (node.slot.type === "button" || node.slot.type === "link")
    ? getSafeActionContent(node.content)
    : undefined;
  const actionHref = mode !== "editor"
    && (contentRenderMode === "preview" || contentRenderMode === "public")
    && safeAction?.label
    ? safeAction.href
    : undefined;
  const Element: ElementType = actionHref ? "a" : nodeElementType(node);
  const interactive = mode === "editor" && Boolean(onSelectNode);
  const structureLocked = structureProtectedNodeIds?.has(node.nodeId) === true;
  const layoutEditable = Boolean(
    interactive &&
    !structureLocked &&
    layoutEditMode &&
    selectedNodeId === node.nodeId &&
    node.instanceEditPolicy &&
    (node.instanceEditPolicy.position || node.instanceEditPolicy.size) &&
    onLayoutOverrideCommit,
  );
  const freePlacementEditable = Boolean(
    interactive
    && !structureLocked
    && parentFree
    && selectedNodeId === node.nodeId
    && node.rules.placement
    && onTemplatePlacementCommit,
  );
  const [layoutPreview, setLayoutPreview] = useState<TemplateInstanceLayoutOverride | undefined>();
  const [placementPreview, setPlacementPreview] = useState<DynamicTemplatePlacement | undefined>();
  const freeGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    parentWidth: number;
    parentHeight: number;
    start: DynamicTemplatePlacement;
    current: DynamicTemplatePlacement;
  } | null>(null);
  const gestureRef = useRef<{
    pointerId: number;
    operation: "move" | "resize";
    startX: number;
    startY: number;
    baseWidth: number;
    baseHeight: number;
    start: TemplateInstanceLayoutOverride;
    current: TemplateInstanceLayoutOverride;
  } | null>(null);
  useEffect(() => {
    if (!layoutEditable) {
      gestureRef.current = null;
      setLayoutPreview(undefined);
    }
  }, [layoutEditable]);
  useEffect(() => {
    if (!gestureRef.current) setLayoutPreview(undefined);
  }, [node.layoutOverride]);
  useEffect(() => {
    if (!freePlacementEditable) {
      freeGestureRef.current = null;
      setPlacementPreview(undefined);
    }
  }, [freePlacementEditable]);
  useEffect(() => {
    if (!freeGestureRef.current) setPlacementPreview(undefined);
  }, [node.rules.placement]);

  const beginFreePlacementGesture = (event: PointerEvent) => {
    if (!freePlacementEditable || event.button !== 0 || !node.rules.placement) return false;
    const target = event.target as HTMLElement;
    if (target.closest("a,button,input,textarea,select,[contenteditable='true']")) return false;
    event.preventDefault();
    event.stopPropagation();
    const owner = event.currentTarget as HTMLElement;
    const parentRect = owner.parentElement?.getBoundingClientRect();
    if (!parentRect) return false;
    const start = { ...node.rules.placement };
    freeGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      parentWidth: Math.max(1, parentRect.width),
      parentHeight: Math.max(1, parentRect.height),
      start,
      current: start,
    };
    owner.setPointerCapture(event.pointerId);
    return true;
  };

  const updateFreePlacementGesture = (event: PointerEvent) => {
    const gesture = freeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    event.preventDefault();
    const dx = (event.clientX - gesture.startX) / gesture.parentWidth;
    const dy = (event.clientY - gesture.startY) / gesture.parentHeight;
    const next = moveFreePlacement(gesture.start, dx, dy, siblingPlacements);
    gesture.current = next;
    setPlacementPreview(next);
    return true;
  };

  const finishFreePlacementGesture = (event: PointerEvent) => {
    const gesture = freeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    event.preventDefault();
    freeGestureRef.current = null;
    setPlacementPreview(undefined);
    onTemplatePlacementCommit?.(node.nodeId, device, gesture.current);
    return true;
  };

  const cancelFreePlacementGesture = (event: PointerEvent) => {
    if (freeGestureRef.current?.pointerId !== event.pointerId) return false;
    freeGestureRef.current = null;
    setPlacementPreview(undefined);
    return true;
  };
  const beginLayoutGesture = (event: PointerEvent) => {
    if (!layoutEditable || event.button !== 0 || !node.instanceEditPolicy) return;
    const target = event.target as HTMLElement;
    if (target.closest("a,button,input,textarea,select,[contenteditable='true']")) return;
    if (!node.instanceEditPolicy.position) return;
    event.preventDefault();
    event.stopPropagation();
    const owner = event.currentTarget as HTMLElement;
    const rect = owner.getBoundingClientRect();
    const start = { widthPercent: 100, ...node.layoutOverride };
    gestureRef.current = {
      pointerId: event.pointerId,
      operation: "move",
      startX: event.clientX,
      startY: event.clientY,
      baseWidth: Math.max(1, rect.width / ((start.widthPercent ?? 100) / 100)),
      baseHeight: Math.max(1, rect.height),
      start,
      current: start,
    };
    owner.setPointerCapture(event.pointerId);
  };
  const updateLayoutGesture = (event: PointerEvent) => {
    const gesture = gestureRef.current;
    const policy = node.instanceEditPolicy;
    if (!gesture || gesture.pointerId !== event.pointerId || !policy) return;
    event.preventDefault();
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    const next: TemplateInstanceLayoutOverride = { ...gesture.start };
    if (gesture.operation === "resize") {
      next.widthPercent = Math.max(
        policy.minWidthPercent,
        Math.min(policy.maxWidthPercent, (gesture.start.widthPercent ?? 100) + dx / gesture.baseWidth * 100),
      );
    } else {
      next.offsetXPercent = Math.max(
        -policy.maxOffsetPercent,
        Math.min(policy.maxOffsetPercent, (gesture.start.offsetXPercent ?? 0) + dx / gesture.baseWidth * 100),
      );
      next.offsetYPercent = Math.max(
        -policy.maxOffsetPercent,
        Math.min(policy.maxOffsetPercent, (gesture.start.offsetYPercent ?? 0) + dy / gesture.baseHeight * 100),
      );
    }
    gesture.current = next;
    setLayoutPreview(next);
  };
  const finishLayoutGesture = (event: PointerEvent) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    gestureRef.current = null;
    const next = sparseLayoutOverride(gesture.current);
    setLayoutPreview(next);
    onLayoutOverrideCommit?.(node.nodeId, device, next);
  };
  const cancelLayoutGesture = (event: PointerEvent) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    setLayoutPreview(undefined);
  };
  if (node.hidden) return null;
  const emptyPublicImage = mode === "public"
    && node.slot?.type === "image"
    && !readRenderedImageSource(node.content);
  if (emptyPublicImage) return null;
  if (node.type === "Spacer") {
    return <div data-template-node-id={node.nodeId} aria-hidden="true" style={{ height: lengthToCss(node.props.spacerSize) ?? "1rem" }} />;
  }
  if (node.type === "Divider") {
    return <hr data-template-node-id={node.nodeId} style={{ borderStyle: node.props.dividerStyle ?? "solid" }} />;
  }
  // 页面实例沿用预览渲染（链接与业务交互保持非活动），但不能把合同内部
  // 编辑事件、标签、会话或 Overlay 带进 Puck 画布。
  const ownCanvas = safeColor(node.rules.backgroundColor)
    ?? (node.rules.backgroundToken
      ? DYNAMIC_TEMPLATE_BACKGROUND_TOKENS[node.rules.backgroundToken]
      : undefined);
  const canvasColor = ownCanvas ?? inheritedCanvasColor;
  const bleeds = imageBleedsOnMobile(node, {
    device,
    constrainWorkCell,
    sectionRole,
    canvasColor,
  });
  const placement = placementPreview ?? node.rules.placement;
  const heightRatio = node.rules.height.mode === "aspect-ratio" && node.rules.height.ratio
    ? node.rules.height.ratio.width / node.rules.height.ratio.height
    : undefined;
  const slotRatio = parseAspectRatio(node.slotRules?.aspectRatio);
  const mobileFrame = resolveMobileImageFrame({
    device,
    inWorkGrid: workCardFrame,
    slotType: node.slot?.type,
    semanticRole: node.slot?.semanticRole,
    sectionRole,
    ratio: heightRatio ?? (slotRatio ? slotRatio.width / slotRatio.height : undefined),
  });
  const bleedStyle = parentFree && placement
    ? mobileFreeFrameStyle(placement, bleeds, node.slot?.semanticRole)
    : bleeds
      ? mobileBleedBox(bleedInset, { top: bleedAtStart, bottom: bleedAtEnd })
      : undefined;
  const slotContent = node.slot
    ? renderSlotContent(
      node,
      contentRenderMode,
      node.slotId === primaryHeadingSlotId ? primaryHeadingLevel : 2,
      mode === "editor" && templateEditorSessionId
        ? `template-editor:${templateEditorSessionId}:${node.nodeId}`
        : undefined,
      device,
      interactionOwner,
      relationalLayout,
      node.slotId === primaryImageSlotId,
      bleedStyle && !node.layoutOverride?.objectFit ? "cover" : undefined,
    )
    : null;
  return (
    <Element
      ref={layoutElement}
      {...(actionHref ? { href: actionHref } : {})}
      data-template-node-id={node.nodeId}
      data-template-node-type={node.type}
      data-template-node-label={interactive ? node.name : undefined}
      data-template-empty-structure={showEmptyStructure && !node.slot && node.children.length === 0 ? "true" : undefined}
      data-template-slot-id={node.slotId}
      data-template-selected={selectedNodeId === node.nodeId ? "true" : undefined}
      data-template-selected-contract-role={selectedContractRole?.nodeId === node.nodeId ? selectedContractRole.roleId : undefined}
      data-template-background-token={node.rules.backgroundToken}
      data-template-border-token={node.rules.borderToken}
      data-template-semantic-role={node.slot?.semanticRole}
      data-template-mobile-bleed={bleedStyle ? "true" : undefined}
      style={{
        ...rulesToStyle(
          node,
          layoutPreview,
          placementPreview,
          parentFree,
          parentRules,
          relationalLayout,
          backgroundDisplayUrl,
          device,
          preserveResolvedMobileRatio,
        ),
        ...(showEmptyStructure && !node.slot && node.children.length === 0
          ? { minHeight: "256px" }
          : {}),
        // 新合同的阅读顺序与叠放层序共用 childIds，断点不维护第二套排序。
        ...(constrainWorkCell ? { width: "100%", maxWidth: "100%", minWidth: 0 } : {}),
        ...(mobileFrame ? { aspectRatio: mobileFrame } : {}),
        ...(relationalLayout ? { order: siblingIndex, zIndex: layoutPreview?.zIndex ?? node.layoutOverride?.zIndex ?? siblingIndex } : {}),
        ...(device === "mobile" && node.slot?.type !== "image" && node.rules.overflow === "hidden" && subtreeHasMobileBleedImage(node, { device, sectionRole, canvasColor })
          ? { overflow: "visible" as const }
          : {}),
        ...bleedStyle,
        ...(layoutEditable || freePlacementEditable ? {
          ...(layoutEditable ? { position: "relative" as const } : {}),
          cursor: freePlacementEditable || node.instanceEditPolicy?.position ? "move" : undefined,
        } : {}),
      }}
      {...(interactive ? {
        role: "group",
        tabIndex: 0,
        "aria-label": `选择模板节点 ${node.name}`,
        onClick: (event: MouseEvent) => {
          if ((event.currentTarget as HTMLElement).closest('[data-editor-node-selection="module"]')) return;
          event.stopPropagation();
          const roleElement = (event.target as HTMLElement).closest<HTMLElement>(
            "[data-content-role], [data-content-role-desktop], [data-content-role-mobile], [data-editor-field]",
          );
          const allowedRoleIds = editableContractRoleIdsByNode?.get(node.nodeId);
          const roleId = [
            roleElement?.dataset.contentRole,
            roleElement?.dataset.contentRoleDesktop,
            roleElement?.dataset.contentRoleMobile,
            ...(roleElement?.dataset.editorField?.split(/\s+/) ?? []),
          ].find((candidate): candidate is string => Boolean(
            candidate && allowedRoleIds?.has(candidate),
          ));
          if (roleId && onSelectContractRole) {
            onSelectContractRole(node.nodeId, roleId);
            return;
          }
          onSelectNode?.(node.nodeId);
        },
        onKeyDown: (event: KeyboardEvent) => {
          if ((event.target as HTMLElement).closest("[contenteditable='true']")) return;
          if (event.key === "Escape" && freeGestureRef.current) {
            event.preventDefault();
            freeGestureRef.current = null;
            setPlacementPreview(undefined);
            return;
          }
          if (freePlacementEditable && node.rules.placement && event.target === event.currentTarget && event.key.startsWith("Arrow")) {
            event.preventDefault();
            event.stopPropagation();
            const owner = event.currentTarget as HTMLElement;
            const parentRect = owner.parentElement?.getBoundingClientRect();
            const pixelStep = event.shiftKey ? 10 : 1;
            const dx = event.key === "ArrowLeft" ? -pixelStep : event.key === "ArrowRight" ? pixelStep : 0;
            const dy = event.key === "ArrowUp" ? -pixelStep : event.key === "ArrowDown" ? pixelStep : 0;
            const next = moveFreePlacement(
              node.rules.placement,
              dx / Math.max(1, parentRect?.width ?? 1),
              dy / Math.max(1, parentRect?.height ?? 1),
              siblingPlacements,
            );
            onTemplatePlacementCommit?.(node.nodeId, device, next);
            return;
          }
          if (layoutEditable && node.instanceEditPolicy && event.target === event.currentTarget && event.key.startsWith("Arrow")) {
            event.preventDefault();
            event.stopPropagation();
            const step = event.shiftKey ? 5 : 1;
            const current = { widthPercent: 100, ...node.layoutOverride };
            if (event.altKey && node.instanceEditPolicy.size) {
              const direction = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1;
              current.widthPercent = Math.max(node.instanceEditPolicy.minWidthPercent, Math.min(node.instanceEditPolicy.maxWidthPercent, (current.widthPercent ?? 100) + direction * step));
            } else if (node.instanceEditPolicy.position) {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                current.offsetXPercent = Math.max(-node.instanceEditPolicy.maxOffsetPercent, Math.min(node.instanceEditPolicy.maxOffsetPercent, (current.offsetXPercent ?? 0) + (event.key === "ArrowLeft" ? -step : step)));
              } else {
                current.offsetYPercent = Math.max(-node.instanceEditPolicy.maxOffsetPercent, Math.min(node.instanceEditPolicy.maxOffsetPercent, (current.offsetYPercent ?? 0) + (event.key === "ArrowUp" ? -step : step)));
              }
            }
            const next = sparseLayoutOverride(current);
            setLayoutPreview(next);
            onLayoutOverrideCommit?.(node.nodeId, device, next);
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onSelectNode?.(node.nodeId);
          }
        },
        onPointerDown: (event: PointerEvent) => {
          if (!beginFreePlacementGesture(event)) beginLayoutGesture(event);
        },
        onPointerMove: (event: PointerEvent) => {
          if (!updateFreePlacementGesture(event)) updateLayoutGesture(event);
        },
        onPointerUp: (event: PointerEvent) => {
          if (!finishFreePlacementGesture(event)) finishLayoutGesture(event);
        },
        onPointerCancel: (event: PointerEvent) => {
          if (!cancelFreePlacementGesture(event)) cancelLayoutGesture(event);
        },
      } : {})}
    >
      {slotContent}
      {renderTemplateChildren({
        node,
        mode,
        selectedNodeId,
        selectedContractRole,
        onSelectNode,
        onSelectContractRole,
        onNodeAction,
        primaryHeadingSlotId,
        primaryImageSlotId,
        primaryHeadingLevel,
        device,
        layoutEditMode,
        onLayoutOverrideCommit,
        onTemplatePlacementCommit,
        templateEditorSessionId,
        interactionOwner,
        contentRenderMode,
        structureProtectedNodeIds,
        editableContractRoleIdsByNode,
        showEmptyStructure,
        parentFree: node.type === "Stack" && node.rules.layoutMode === "free",
        relationalLayout,
        preserveResolvedMobileRatio,
        sectionRole,
        constrainWorkCell,
        inheritedCanvasColor: canvasColor,
        bleedInset,
        bleedAtStart,
        bleedAtEnd,
      })}
    </Element>
  );
}

export default function DynamicTemplateRenderer({
  definition,
  device,
  breakpoint,
  contentBySlotId,
  hiddenSlotIds,
  layoutOverridesByNodeId,
  mode = "public",
  showEmptySlots,
  publicSurface,
  editorSurface,
  interactionOwner,
  templateEditorSessionId,
  selectedNodeId,
  selectedContractRole,
  onSelectNode,
  onSelectContractRole,
  onNodeAction,
  primaryHeadingLevel = 2,
  priority = false,
  layoutEditMode = false,
  onLayoutOverrideCommit,
  onTemplatePlacementCommit,
}: DynamicTemplateRendererProps) {
  const renderSurface = useContentTemplateRenderSurface();
  const allowsNodeInteraction = mode === "editor"
    && editorSurface === "template-definition"
    && interactionOwner !== "host-overlay";
  const contentRenderMode = renderSurface === CONTENT_TEMPLATE_RENDER_SURFACE.CATALOG_PREVIEW
    ? CONTENT_TEMPLATE_RENDER_SURFACE.CATALOG_PREVIEW
    : mode === "editor" && editorSurface !== "template-definition"
      ? "preview"
      : mode;
  const structureProtectedNodeIds = allowsNodeInteraction
    ? getDynamicTemplateStructureProtectedNodeIds(definition)
    : undefined;
  const result = compileDynamicTemplateRenderPlan(definition, {
    device,
    breakpoint,
    contentBySlotId,
    hiddenSlotIds,
    layoutOverridesByNodeId,
    showEmptySlots: showEmptySlots ?? mode === "editor",
    publicSurface: mode === "public" && definition.schemaVersion >= 3
      ? { ...publicSurface, omitDefaultImages: true, omitDefaultContent: true }
      : publicSurface,
  });
  if (!result.ok) {
    if (mode === "public") return null;
    return (
      <section className="hc-dynamic-template__invalid" role="alert">
        <strong>模板定义无法渲染</strong>
        <span>{result.issues.find((issue) => issue.level === "error")?.message}</span>
      </section>
    );
  }
  const editableTargets = allowsNodeInteraction
    ? resolveEditableTargets(definition, result.plan, getContentTemplateContract)
    : [];
  const editableContractRoleIdsByNode = new Map<string, Set<string>>();
  editableTargets.forEach((target) => {
    if (target.source !== "builtin-contract-role" || !target.contractRoleId) return;
    const roles = editableContractRoleIdsByNode.get(target.ownerNodeId) ?? new Set<string>();
    roles.add(target.contractRoleId);
    editableContractRoleIdsByNode.set(target.ownerNodeId, roles);
  });
  const primaryHeadingSlotId = primaryHeadingLevel === 1
    ? findFirstReachableHeadingSlotId(result.plan.root)
    : undefined;
  const findPrimaryImageSlotId = (
    node: DynamicTemplateRenderPlanNode,
  ): string | undefined => {
    if (node.hidden) return undefined;
    if (node.slot && node.slotId) {
      if (node.slot.type === "image") {
        const value = node.content;
        const source = typeof value === "string"
          ? value
          : value && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>).src
            : undefined;
        if (typeof source === "string" && source.trim()) return node.slotId;
      }
      const moduleType = getContentTemplateModuleTypeForSlotType(node.slot.type);
      if (moduleType && getContentTemplateMediaReferences(
        moduleType,
        node.content,
        `contentBySlotId.${node.slotId}`,
      ).length > 0) return node.slotId;
    }
    return node.children.reduce<string | undefined>(
      (found, child) => found ?? findPrimaryImageSlotId(child),
      undefined,
    );
  };
  const primaryImageSlotId = priority
    ? findPrimaryImageSlotId(result.plan.root)
    : undefined;
  return (
    <div
      className="hc-dynamic-template"
      data-dynamic-template-id={result.plan.templateId}
      data-dynamic-template-schema-version={result.plan.schemaVersion}
      data-dynamic-template-device={device}
      data-dynamic-template-mode={mode}
      data-dynamic-template-editor-surface={mode === "editor" ? editorSurface : undefined}
      data-template-composition-authority="template-definition-v2"
      data-template-root-node-id={result.plan.root.nodeId}
      data-template-root-height-mode={result.plan.root.rules.height.mode}
      data-template-root-height-ratio={result.plan.root.rules.height.mode === "aspect-ratio"
        && result.plan.root.rules.height.ratio
        ? `${result.plan.root.rules.height.ratio.width}:${result.plan.root.rules.height.ratio.height}`
        : undefined}
      data-template-default-background-token={result.plan.metadata.defaultBackgroundToken}
      style={{
        background: result.plan.metadata.defaultBackgroundToken
          ? DYNAMIC_TEMPLATE_BACKGROUND_TOKENS[result.plan.metadata.defaultBackgroundToken]
          : undefined,
      }}
    >
      <RenderNode
        node={result.plan.root}
        relationalLayout={Number(definition.schemaVersion) >= 2}
        preserveResolvedMobileRatio={Number(definition.schemaVersion) >= 3}
        mode={mode}
        selectedNodeId={allowsNodeInteraction ? selectedNodeId : null}
        selectedContractRole={allowsNodeInteraction ? selectedContractRole : null}
        onSelectNode={allowsNodeInteraction ? onSelectNode : undefined}
        onSelectContractRole={allowsNodeInteraction ? onSelectContractRole : undefined}
        onNodeAction={allowsNodeInteraction ? onNodeAction : undefined}
        primaryHeadingSlotId={primaryHeadingSlotId}
        primaryImageSlotId={primaryImageSlotId}
        primaryHeadingLevel={primaryHeadingLevel}
        device={device}
        layoutEditMode={allowsNodeInteraction && layoutEditMode}
        onLayoutOverrideCommit={allowsNodeInteraction ? onLayoutOverrideCommit : undefined}
        onTemplatePlacementCommit={allowsNodeInteraction ? onTemplatePlacementCommit : undefined}
        templateEditorSessionId={allowsNodeInteraction ? templateEditorSessionId : undefined}
        interactionOwner={interactionOwner}
        contentRenderMode={contentRenderMode}
        structureProtectedNodeIds={structureProtectedNodeIds}
        editableContractRoleIdsByNode={editableContractRoleIdsByNode}
        showEmptyStructure={mode === "editor" && editorSurface === "template-definition"}
        sectionRole={definition.metadata.sectionRole ?? definition.templateRecipe?.sectionRole}
        inheritedCanvasColor={result.plan.metadata.defaultBackgroundToken
          ? DYNAMIC_TEMPLATE_BACKGROUND_TOKENS[result.plan.metadata.defaultBackgroundToken]
          : undefined}
      />
    </div>
  );
}
