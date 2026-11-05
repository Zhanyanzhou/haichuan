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
import { usesLargePhoneMeasure } from "./largePhoneMeasure";
import { segmentMobileCopyFrames } from "./mobileCopyInsideImage";
import { attachMobileWorkCaptions, creationGridLeadSpanId, heroFrameExceedsViewport, isMobileWorkUnit, pageHeroReusesDesktopFrame, paintDesktopOnlyHeroFrame, partitionMobileWorkUnits, resolveMobileImageFrame, splitHeroMobileFrame } from "./mobileWorkGrid";
import { choosePeerImageSplit, pairedCanvasContentBox, workCardOverflowsCell, type PairedCanvasRatio } from "./pairedCanvas";
import { formatExactTemplateRatio, formatTemplateRatio, isContentHeightSplitSection, parseTemplateRatio, resolvePairedMobileCanvas, splitCopyShouldStack } from "./templateDimensions";
import { hasExplicitMobileTemplateComposition, hasExplicitMobileTemplateLayout, isFixedFourWorkGrid } from "./layoutAuthoring";
import { publicFlowNodeIsVisible } from "./publicFlow";
import { hasTemplateImageContent, resolveTemplateImageSource } from "./imageContent";
import { resolveTextOnImageScrim } from "./textOnImageScrim";
import { artworkCopyTreatment, artworkNodeClips } from "./imageCarriesCopy";
import { resolveMediaSlotImage } from "../config/mediaSlotContract";
import {
  parseFrameAspect,
  renderedWidthFactor,
  resolveImageDeliveryGeometry,
  scaleSizesExpression,
  sizesLowerBoundPx,
  type ImageDeliveryFit,
} from "../config/imageDeliveryGeometry";
import { buildResponsiveUploadsDerivedUrl } from "@/utils/responsiveUploadsImage";
import { usePublicImageFact } from "../runtime/publicImageFacts";
import { RESPONSIVE_CANVAS } from "../config/blockContracts";
import "./DynamicTemplateRenderer.css";

function definitionWithoutNodeBackgroundImages(definition: TemplateDefinitionV2): TemplateDefinitionV2 {
  const hasBackground = Object.values(definition.nodes).some((node) => Boolean(
    node.responsive.desktop.backgroundImage
    || node.responsive.mobile.backgroundImage
    || node.responsive.tablet?.backgroundImage
  ));
  if (!hasBackground) return definition;
  const projected = structuredClone(definition);
  for (const node of Object.values(projected.nodes)) {
    if (node.responsive.desktop.backgroundImage) node.responsive.desktop.backgroundImage = "";
    if (node.responsive.mobile.backgroundImage) node.responsive.mobile.backgroundImage = "";
    if (node.responsive.tablet?.backgroundImage) node.responsive.tablet.backgroundImage = "";
  }
  return projected;
}

export interface DynamicTemplateRendererProps {
  definition: TemplateDefinitionV2;
  device: "desktop" | "mobile";
  breakpoint?: TemplateBreakpoint;
  contentBySlotId?: Record<string, unknown>;
  hiddenSlotIds?: readonly string[];
  /** 图片已含排好的标题。标题留在 DOM，副标题和按钮不再画到画面上。 */
  imageCarriesCopy?: boolean;
  layoutOverridesByNodeId?: TemplateInstanceLayoutOverridesByNodeId;
  pageSettings?: CompileDynamicTemplateRenderPlanOptions["pageSettings"];
  mode?: ContentTemplateRenderMode;
  /**
   * 是否保留空槽位的编辑占位。只有真正的结构编辑默认保留；
   * 只读预览、目录缩略图和公开页默认都按公开折叠语义处理空内容。
   */
  showEmptySlots?: boolean;
  publicSurface?: CompileDynamicTemplateRenderPlanOptions["publicSurface"];
  /** 页面实例不回放模板节点上保存的背景照片。模板设计画布不传。 */
  omitNodeBackgroundImages?: boolean;
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
  /**
   * 本页第一个可见主舞台为 primary，其余为 subsequent。
   * 不传表示孤立的模板设计预览，按这一节自己的首屏处理。
   */
  pageHeroPlacement?: PageHeroFramePlacement;
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

export type PageHeroFramePlacement = "primary" | "subsequent";

const HERO_FRAME_CAP = "calc(100svh - var(--site-header-height, 0px))";

const DYNAMIC_TEMPLATE_BACKGROUND_TOKENS: Record<string, string> = {
  surface: "#ffffff",
  "surface-muted": "#F4F5F5",
  "brand-ink": "#181A1B",
  "brand-soft": "#ECEEEF",
};

function safeColor(value: string | undefined): string | undefined {
  return value && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value) ? value : undefined;
}

/** 深色画布上没写颜色的文字沿用品牌墨色，会和底融成一条黑带。 */
const DARK_CANVAS_INK = "#F7F8F8";

function hexLuminance(color: string | undefined): number | undefined {
  const safe = safeColor(color);
  if (!safe) return undefined;
  const raw = safe.slice(1);
  const expanded = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw;
  const channel = (offset: number) => parseInt(expanded.slice(offset, offset + 2), 16) / 255;
  const [red, green, blue] = [0, 2, 4].map(channel);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function isDarkCanvas(color: string | undefined): boolean {
  const luminance = hexLuminance(color);
  return luminance !== undefined && luminance < 0.4;
}

function canonicalHex(color: string | undefined): string | undefined {
  const safe = safeColor(color);
  if (!safe) return undefined;
  const raw = safe.slice(1);
  const expanded = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw;
  return `#${expanded.toUpperCase()}`;
}

function contrastRatio(foreground: string | undefined, background: string | undefined): number | undefined {
  const left = hexLuminance(foreground);
  const right = hexLuminance(background);
  if (left === undefined || right === undefined) return undefined;
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

/** 只改深色底上的品牌墨色。其他作者选的低对比颜色保持原样，并标成待改。 */
function resolveReadableInk(
  explicit: string | undefined,
  canvas: string | undefined,
): { color: string | undefined; contrast?: "corrected" | "low" } {
  if (!explicit) return { color: isDarkCanvas(canvas) ? DARK_CANVAS_INK : undefined };
  const ratio = contrastRatio(explicit, canvas);
  if (ratio === undefined || ratio >= 4.5 || !isDarkCanvas(canvas)) return { color: explicit };
  if (canonicalHex(explicit) === "#181A1B") return { color: DARK_CANVAS_INK, contrast: "corrected" };
  return { color: explicit, contrast: "low" };
}

/** 文字落在照片上时，深色字改成反色；按钮自己有底色时保留原字色。 */
function inkOnImage(explicit: string | undefined, hasOwnSurface: boolean): string {
  if (hasOwnSurface && explicit) return explicit;
  const luminance = hexLuminance(explicit);
  if (!hasOwnSurface && explicit && luminance !== undefined && luminance >= 0.7) return explicit;
  return DARK_CANVAS_INK;
}

function occupyingChildren(
  node: DynamicTemplateRenderPlanNode,
  showEmptySlots: boolean,
  mode: NonNullable<DynamicTemplateRendererProps["mode"]>,
  device: "desktop" | "mobile",
): DynamicTemplateRenderPlanNode[] {
  const collapseEmpty = mode === "public" || !showEmptySlots;
  return collapseEmpty
    ? node.children.filter((child) => !child.hidden && publicFlowNodeIsVisible(child, device))
    : node.children.filter((child) => !child.hidden);
}

function branchIsOnlyImage(
  node: DynamicTemplateRenderPlanNode,
  showEmptySlots: boolean,
  mode: NonNullable<DynamicTemplateRendererProps["mode"]>,
  device: "desktop" | "mobile",
): boolean {
  if (node.slot?.type === "image") return true;
  if (node.slot) return false;
  const children = occupyingChildren(node, showEmptySlots, mode, device);
  return children.length > 0 && children.every((child) => branchIsOnlyImage(child, showEmptySlots, mode, device));
}

/**
 * 手机流式排版里，深色画布的下内边距会露在满幅图下面。
 * 图下已经没有文字或按钮时，这段内边距就是一条没有内容的黑带。
 */
function dropDarkMobileImageTail(
  node: DynamicTemplateRenderPlanNode,
  device: "desktop" | "mobile",
  canvasColor: string | undefined,
  showEmptySlots: boolean,
  mode: NonNullable<DynamicTemplateRendererProps["mode"]>,
): boolean {
  if (device !== "mobile" || node.rules.layoutMode === "free" || !isDarkCanvas(canvasColor)) return false;
  if (!(node.rules.padding?.bottom && node.rules.padding.bottom.value > 0)) return false;
  const visible = occupyingChildren(node, showEmptySlots, mode, device);
  return visible.length > 0 && visible.every((child) => branchIsOnlyImage(child, showEmptySlots, mode, device));
}

/**
 * 子项在当前端都隐藏后，容器只剩内边距。
 * 它没有自己的底色时，这段空白会把父级深色底露成一条黑带。
 * 空的新建区域仍保留最小高度，方便在画布上点选。
 */
function collapseVacantFlowPadding(
  node: DynamicTemplateRenderPlanNode,
  showEmptySlots: boolean,
  mode: NonNullable<DynamicTemplateRendererProps["mode"]>,
  showEmptyStructure: boolean,
  device: "desktop" | "mobile",
): boolean {
  if (node.slot || node.type === "Spacer" || node.type === "Divider") return false;
  if (showEmptyStructure && node.children.length === 0) return false;
  if (!node.rules.padding) return false;
  if (node.rules.backgroundColor || node.rules.backgroundToken || node.rules.backgroundImage) return false;
  return occupyingChildren(node, showEmptySlots, mode, device).length === 0;
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

function cssFrameIsLandscape(frame: string | undefined): boolean {
  if (!frame) return false;
  const [width, height] = frame.split("/").map((part) => Number(part.trim()));
  return width > 0 && height > 0 && width / height >= 1;
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

function collectDesktopHeroImages(node: DynamicTemplateRenderPlanNode): Array<{
  desktopAspect?: string;
  hasMobileAsset: boolean;
  explicitObjectFit?: string;
}> {
  const images: Array<{ desktopAspect?: string; hasMobileAsset: boolean; explicitObjectFit?: string }> = [];
  const walk = (current: DynamicTemplateRenderPlanNode) => {
    const role = current.slot?.semanticRole;
    if (current.slot?.type === "image" && (role === "backgroundImage" || role === "heroImage")) {
      const content = current.content && typeof current.content === "object" && !Array.isArray(current.content)
        ? current.content as { mobileSrc?: unknown }
        : null;
      images.push({
        desktopAspect: current.slot.desktopRules?.aspectRatio,
        hasMobileAsset: isSafeTemplateMediaUrl(content?.mobileSrc),
        explicitObjectFit: current.layoutOverride?.objectFit,
      });
    }
    current.children.forEach(walk);
  };
  walk(node);
  return images;
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
  if (rules.display === "flex") style.flexDirection = node.mirrored ? "row-reverse" : rules.direction ?? "row";
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
  if (value.visuallyCollapsed === true) next.visuallyCollapsed = true;
  return Object.keys(next).length ? next : undefined;
}

function getSafeActionContent(content: unknown, allowProductTarget = true): { label: string; href?: string } {
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
    return allowProductTarget
      ? { label, href: `/products/${encodeURIComponent(record.productCode.trim())}` }
      : { label };
  }
  if (record.targetType === "category" && typeof record.categorySlug === "string" && record.categorySlug.trim()) {
    return { label, href: `/catalog?category=${encodeURIComponent(record.categorySlug.trim())}` };
  }
  return { label };
}

function findArtworkActionHref(
  node: DynamicTemplateRenderPlanNode,
  allowProductTarget: boolean,
): string | undefined {
  if (!node.hidden && node.slot?.type === "button") {
    const href = getSafeActionContent(node.content, allowProductTarget).href;
    if (href) return href;
  }
  for (const child of node.children) {
    const href = findArtworkActionHref(child, allowProductTarget);
    if (href) return href;
  }
  return undefined;
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

function authorScaleFromTransform(transform?: string): number {
  const match = /(?:^|\s)scale\(\s*([0-9.]+)/.exec(transform ?? "");
  const value = match ? Number(match[1]) : 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function deliveryFit(objectFit: string): ImageDeliveryFit {
  if (objectFit === "cover" || objectFit === "contain" || objectFit === "fill") return objectFit;
  return "fill";
}

/**
 * 图片槽 sizes 先按画框占视口的宽度。铺满超出画框的部分由原图比例再乘一次。
 * 窄槽使用自己的宽度系数，不再因为首屏或手机就把每张图当成通栏。
 */
function resolveTemplateImageSizes(
  node: DynamicTemplateRenderPlanNode,
  viewport: "desktop" | "mobile",
): string {
  const fraction = resolveDesktopWidthFraction(node);
  if (viewport === "mobile") {
    return fraction !== undefined && fraction < 100 ? `${fraction}vw` : "100vw";
  }
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
  source = "desktop",
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
  source?: "desktop" | "mobile";
}) {
  // blob 必须由这张图片所在的 iframe 文档创建，父页面的 blob 在画布里不会显示。
  const imageRef = useRef<HTMLImageElement>(null);
  const media = useManagedTemplateMediaDisplayUrl(src, hostFetch, imageRef);
  const previewUrl = hostFetch ? resolveManagedTemplateMediaPreviewUrl(src) : src;
  const displaySrc = hostFetch
    ? (media.status === "error" ? previewUrl : media.displaySrc)
    : src;
  const facts = usePublicImageFact(hostFetch ? undefined : src);
  const [srcSetEnabled, setSrcSetEnabled] = useState(true);
  const [measuredCssWidth, setMeasuredCssWidth] = useState<number | null>(null);
  const authorScale = authorScaleFromTransform(transform);
  const fit = deliveryFit(objectFit);
  const frame = parseFrameAspect(ratio);
  const widthFactor = facts && !facts.animated && frame
    ? renderedWidthFactor({
      frameAspect: frame,
      sourceWidth: facts.displayWidth,
      sourceHeight: facts.displayHeight,
      objectFit: fit,
      authorScale,
    })
    : authorScale;
  const sized = facts && !facts.animated
    ? scaleSizesExpression(sizes || "100vw", widthFactor)
    : sizes;
  const deliverySizes = measuredCssWidth ? `${measuredCssWidth}px` : sized;
  useEffect(() => {
    setSrcSetEnabled(true);
  }, [src]);
  useLayoutEffect(() => {
    setMeasuredCssWidth(null);
    if (hostFetch || !facts || facts.animated) return undefined;
    const parent = imageRef.current?.parentElement;
    const ownerWindow = parent?.ownerDocument.defaultView;
    // 画布由父页面渲染进 iframe。必须用元素所在窗口的观察器，跨文档观察会触发 loop。
    if (!parent || !ownerWindow || typeof ownerWindow.ResizeObserver === "undefined") return undefined;
    let current = 0;
    const commitMeasuredWidth = (next: number) => {
      // 首帧画布还没按视口撑开时，量到的窄宽不能盖过声明的 sizes。
      // 否则 1440 视口会按几百像素挑候选，比手机更窄。
      const viewportWidth = parent.ownerDocument.defaultView?.innerWidth ?? 0;
      const declared = sized ? sizesLowerBoundPx(sized, viewportWidth) : 0;
      if (declared > 0 && next + 8 < declared) return;
      if (current !== 0 && next < current + 8) return;
      current = next;
      setMeasuredCssWidth((previous) => (previous !== null && next <= previous + 8 ? previous : next));
    };
    const measure = () => {
      const frameWidth = parent.offsetWidth;
      const frameHeight = parent.offsetHeight;
      if (!(frameWidth > 0) || !(frameHeight > 0)) return;
      const geometry = resolveImageDeliveryGeometry({
        sourceWidth: facts.displayWidth,
        sourceHeight: facts.displayHeight,
        frameWidth,
        frameHeight,
        objectFit: fit,
        authorScale,
        devicePixelRatio: 1,
      });
      if (!geometry) return;
      const next = Math.round(geometry.renderedCssWidth);
      commitMeasuredWidth(next);
    };
    let measureTimer = 0;
    const scheduleMeasure = () => {
      if (measureTimer) return;
      measureTimer = ownerWindow.setTimeout(() => {
        measureTimer = 0;
        measure();
      }, 16);
    };
    scheduleMeasure();
    const observer = new ownerWindow.ResizeObserver(scheduleMeasure);
    observer.observe(parent);
    return () => {
      if (measureTimer) ownerWindow.clearTimeout(measureTimer);
      observer.disconnect();
    };
  }, [
    src,
    viewport,
    objectFit,
    ratio,
    transform,
    facts?.revision,
    facts?.displayWidth,
    facts?.displayHeight,
    facts?.animated,
    hostFetch,
    authorScale,
    fit,
    facts,
    sized,
  ]);
  // 公开态才接派生图与固有尺寸；后台态走 blob 预览，保持即时显示与既有会话语义。
  // 没有原图展示尺寸时不生成 srcset，避免把请求档位写成实际像素。
  const resolved = hostFetch || !srcSetEnabled
    ? undefined
    : resolveMediaSlotImage(
      { ratio: ratio ?? "", viewport, priority, sizes: deliverySizes },
      displaySrc,
      facts,
    );
  const imgSrc = resolved?.srcSet
    ? buildResponsiveUploadsDerivedUrl(displaySrc, 1680) ?? displaySrc
    : displaySrc;
  const loading = priority ? "eager" : hostFetch ? undefined : "lazy";
  // 加载失败的图片是行内替换元素，百分比宽高会退回替代文字的固有尺寸。
  // 槽位已经有画框，图片必须绝对铺满这层，不能缩成 48×21 的破图。
  const style: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit,
    objectPosition,
    transform,
    transformOrigin,
  };
  return (
    <span data-template-image-frame="true" style={{ display: "block", position: "relative", width: "100%", height: "100%" }}>
      <img
        ref={imageRef}
        src={imgSrc || undefined}
        onError={() => {
          if (srcSetEnabled) setSrcSetEnabled(false);
        }}
        alt={alt}
        data-template-image-fit={objectFit}
        data-template-image-source={source}
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
    </span>
  );
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
  canvasColor?: string,
  onImage = false,
  imageCarriesCopy = false,
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
  const explicitInk = safeColor(node.slotRules?.color);
  const ownSurface = safeColor(node.rules.backgroundColor)
    ?? (node.rules.backgroundToken ? DYNAMIC_TEMPLATE_BACKGROUND_TOKENS[node.rules.backgroundToken] : undefined);
  const hasOwnSurface = Boolean(ownSurface);
  const onImageInk = inkOnImage(explicitInk, hasOwnSurface);
  const ink = onImage
    ? {
      color: onImageInk,
      contrast: !hasOwnSurface && canonicalHex(explicitInk) === "#181A1B" && onImageInk !== explicitInk
        ? "corrected" as const
        : undefined,
    }
    : resolveReadableInk(explicitInk, ownSurface ?? canvasColor);
  const textStyle: CSSProperties = {
    margin: 0,
    fontSize: node.layoutOverride?.fontSizePx !== undefined
      ? `${node.layoutOverride.fontSizePx}px`
      : lengthToCss(node.slotRules?.fontSize),
    fontWeight: node.slotRules?.fontWeight,
    fontFamily: node.slotRules?.fontFamily
      ? ({ system: "system-ui, sans-serif", serif: '"Noto Serif SC", "Source Han Serif CN", serif', sans: "Inter, system-ui, sans-serif" } as const)[node.slotRules.fontFamily]
      : undefined,
    color: ink.color,
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
    const mobileCandidate = record?.mobileSrc;
    const mobileSrc = editorViewport === "mobile" && isSafeTemplateMediaUrl(mobileCandidate)
      ? mobileCandidate.trim()
      : "";
    const src = resolveTemplateImageSource(content, editorViewport);
    const alt = typeof record?.alt === "string" ? record.alt : "";
    const imageSource = mobileSrc ? "mobile" as const : "desktop" as const;
    const defaultFocus = objectPositionToPercent(node.slotRules?.objectPosition ?? TEMPLATE_MEDIA_DEFAULTS.objectPosition);
    const focusPosition = `${node.layoutOverride?.focusXPercent ?? defaultFocus.x}% ${node.layoutOverride?.focusYPercent ?? defaultFocus.y}%`;
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
      // 目录卡片把整页缩进 iframe。图标用槽位百分比，缩小时仍留在框内。
      // 灰底铺满槽位，图标只是空位标记，不再在画框里再套一张横图。
      return (
        <span
          data-template-neutral-media="true"
          style={{
            position: "absolute",
            inset: 0,
            boxSizing: "border-box",
            background: "#DDE1E2",
            boxShadow: "inset 0 0 0 1px #5F6568",
          }}
        >
          <span style={{ position: "absolute", left: "50%", top: "50%", width: "38%", aspectRatio: "1", transform: "translate(-50%, -50%)" }}>
            <ManagedTemplateSlotImage
              src={src}
              alt={alt}
              hostFetch={mode !== "public"}
              priority={priority}
              ratio={node.slotRules?.aspectRatio}
              viewport={editorViewport ?? "desktop"}
              sizes={resolveTemplateImageSizes(node, editorViewport ?? "desktop")}
              source={imageSource}
              objectFit="contain"
              objectPosition="50% 50%"
            />
          </span>
        </span>
      );
    }
    const operatorFit = node.layoutOverride?.objectFit;
    const desktopFrame = parseAspectRatio(node.slot?.desktopRules?.aspectRatio);
    const landscapeHero = (node.slot?.semanticRole === "backgroundImage" || node.slot?.semanticRole === "heroImage")
      && Boolean(desktopFrame && desktopFrame.width / desktopFrame.height >= 1);
    // 横图没有手机图时按原比例铺满，不再完整放入竖框。操作者明确选了铺满或拉伸时保留该选择。
    const posterContain = imageCarriesCopy
      && editorViewport === "mobile"
      && !mobileSrc
      && operatorFit !== "cover"
      && operatorFit !== "fill"
      && !landscapeHero;
    const resolvedFit = posterContain ? "contain" : imageFit ?? resolveImageObjectFit(node, editorViewport);
    const objectFit = resolvedFit;
    return (
      <ManagedTemplateSlotImage
        src={src}
        alt={alt}
        hostFetch={mode !== "public"}
        priority={priority}
        ratio={node.slotRules?.aspectRatio}
        viewport={editorViewport ?? "desktop"}
        sizes={resolveTemplateImageSizes(node, editorViewport ?? "desktop")}
        source={imageSource}
        objectFit={objectFit}
        objectPosition={focusPosition}
        transform={node.layoutOverride?.imageScalePercent && node.layoutOverride.imageScalePercent !== 100
          ? `scale(${node.layoutOverride.imageScalePercent / 100})`
          : undefined}
        transformOrigin={focusPosition}
      />
    );
  }
  if (["heading", "text", "richText", "badge", "icon"].includes(slot.type)) {
    const text = typeof content === "string" ? content : "";
    if (!text) {
      return mode === "public" ? null : (
        <span className="hc-dynamic-template__empty-slot" style={{ display: "block", textAlign: textStyle.textAlign }}>
          {slot.label}待填写
        </span>
      );
    }
    if (slot.type === "heading") {
      const Heading = headingLevel === 1 ? "h1" : "h2";
      return <Heading className={fontClass} data-template-font-role={node.slotRules?.fontRole} data-template-text-contrast={ink.contrast} style={textStyle}>{text}</Heading>;
    }
    if (slot.type === "badge") return <span className={fontClass} data-template-font-role={node.slotRules?.fontRole} data-template-text-contrast={ink.contrast} style={textStyle}>{text}</span>;
    return <p className={fontClass} data-template-font-role={node.slotRules?.fontRole} data-template-text-contrast={ink.contrast} style={relationalLayout ? textStyle : { ...textStyle, whiteSpace: "pre-wrap" }}>{text}</p>;
  }
  if (slot.type === "button" || slot.type === "link") {
    const action = getSafeActionContent(content, mode !== "public");
    // 行动槽位的可点击语义由承载全部布局/背景/边框的节点外壳负责。
    // 这里始终只输出文案，避免形成“外层视觉盒子 + 内层文字链接”的双重命中区域。
    // 对齐作用于行动槽位的可用宽度；行内 span 不会响应 text-align。
    // 手机把边框令牌写成 none 时，这是文字链接，不是方框按钮。
    const quietAction = node.rules.borderToken === "none";
    if (!action.label) {
      return mode === "public" ? null : (
        <span
          className="hc-dynamic-template__empty-slot"
          style={{ display: "block", textAlign: textStyle.textAlign, ...(quietAction ? { textDecoration: "underline", textUnderlineOffset: "0.35em", textDecorationThickness: "1px" } : {}) }}
        >
          {slot.label}待填写
        </span>
      );
    }
    return <span className={fontClass} data-template-font-role={node.slotRules?.fontRole} data-template-text-contrast={ink.contrast} style={{ display: "block", ...(quietAction ? { textDecoration: "underline", textUnderlineOffset: "0.35em", textDecorationThickness: "1px" } : {}), ...textStyle }}>{action.label}</span>;
  }
  if (slot.type === "product") {
    if (mode === "public") return null;
    const productCode = typeof content === "string" ? content.trim() : "";
    const mockLabel = content && typeof content === "object" && !Array.isArray(content)
      && (content as Record<string, unknown>).mock === true
      && typeof (content as Record<string, unknown>).label === "string"
      ? String((content as Record<string, unknown>).label)
      : "";
    if (mockLabel) return <span data-template-mock-content="product">{mockLabel}</span>;
    return productCode
      ? <a href={`/products/${encodeURIComponent(productCode)}`}>{productCode}</a>
      : <span className="hc-dynamic-template__empty-slot">商品待选择</span>;
  }
  if (slot.type === "collection") {
    if (mode === "public") return null;
    const refs = Array.isArray(content) ? content.filter((item): item is string => typeof item === "string") : [];
    return refs.length ? (
      <ul>
        {refs.map((reference) => (
          <li key={reference}>
            <a href={`/products/${encodeURIComponent(reference)}`}>{reference}</a>
          </li>
        ))}
      </ul>
    ) : <span className="hc-dynamic-template__empty-slot">集合待选择</span>;
  }
  return null;
}

function pairedImageCoversSection(
  node: DynamicTemplateRenderPlanNode,
  sectionRole: string | undefined,
): boolean {
  if (node.slot?.type !== "image") return false;
  const role = node.slot.semanticRole;
  // 背景图就是这一节的画面。旧模板经常没写 sectionRole，仍要铺满对换画布。
  if (role === "backgroundImage") return true;
  return sectionRole === "page-hero" && role === "heroImage";
}

function subtreeFillsPairedCanvas(
  node: DynamicTemplateRenderPlanNode,
  sectionRole: string | undefined,
): boolean {
  if (node.hidden || node.rules.layoutMode === "free") return false;
  // 铺满对换画布的图钉住整节。上图下文的主图保持自己的比例，排在文字前面。
  if (pairedImageCoversSection(node, sectionRole)) return true;
  const groups = partitionMobileWorkUnits(node.children, {
    device: "mobile",
    sectionRole,
    layoutMode: node.rules.layoutMode,
    display: node.rules.display,
    columnCount: node.rules.columns?.length,
  });
  if (groups.some((group) => group.kind === "works" && group.nodes.length >= 2)) return true;
  return node.children.some((child) => subtreeFillsPairedCanvas(child, sectionRole));
}

function nodeElementType(node: DynamicTemplateRenderPlanNode): ElementType {
  if (node.type === "Section") return node.props.semanticTag === "header" ? "header" : "section";
  if (["Container", "Grid", "Row", "Column", "Stack"].includes(node.type)) {
    return node.props.semanticTag ?? "div";
  }
  return "div";
}

function heroImageFrameRequest(
  definition: TemplateDefinitionV2 | undefined,
  node: DynamicTemplateRenderPlanNode,
  placement: PageHeroFramePlacement | undefined,
) {
  if (!definition || definition.metadata.geometryPolicy !== "hero-media-frame") return {};
  const desktopLabel = node.slotId ? definition.slots[node.slotId]?.desktopRules?.aspectRatio : undefined;
  const parsed = parseTemplateRatio(desktopLabel);
  return {
    geometryPolicy: "hero-media-frame" as const,
    heroPlacement: placement ?? "design" as const,
    desktopRatio: parsed && parsed.height > 0 ? parsed.width / parsed.height : undefined,
    authorLocked: node.rules.height.mode === "fixed",
  };
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
  parentMeasured = false,
  onImageCopy = false,
  imageCarriesCopy = false,
  pairedCanvas = null,
  fillPairedCell = false,
  fillSplitRemainder = false,
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
  parentMeasured?: boolean;
  onImageCopy?: boolean;
  imageCarriesCopy?: boolean;
  pairedCanvas?: PairedCanvasRatio | null;
  fillPairedCell?: boolean;
  fillSplitRemainder?: boolean;
} & Omit<Parameters<typeof RenderNode>[0], "node" | "sectionRole" | "device" | "parentFree" | "parentRules" | "siblingIndex" | "siblingPlacements" | "workCardFrame" | "constrainWorkCell" | "inheritedCanvasColor" | "bleedInset" | "bleedAtStart" | "bleedAtEnd" | "parentMeasured" | "siblings" | "onImageCopy" | "imageCarriesCopy" | "fillMobileCopyFrame" | "pairedCanvas" | "fillPairedCell" | "fillSplitRemainder">) {
  const dropImageTail = dropDarkMobileImageTail(
    node,
    device,
    inheritedCanvasColor,
    shared.showEmptySlots ?? false,
    shared.mode,
  );
  const childInset = extendMobileBleedInset(
    bleedInset,
    dropImageTail && node.rules.padding
      ? { ...node.rules.padding, bottom: { ...node.rules.padding.bottom, value: 0 } }
      : node.rules.padding,
    device === "mobile" && !parentFree && !constrainWorkCell && node.rules.layoutMode !== "free",
  );
  // 公开页和页面画布丢掉没有内容的容器。否则空文字盒的内边距和间距会留在满幅图下方，深色画布就露出黑带。
  // 模板结构编辑仍留着空位，方便点选。
  const renderedChildren = shared.mode === "public" || !shared.showEmptySlots
    ? node.children.filter((child) => !child.hidden && publicFlowNodeIsVisible(child, device))
    : node.children;
  const canvasForChildren = safeColor(node.rules.backgroundColor)
    ?? (node.rules.backgroundToken ? DYNAMIC_TEMPLATE_BACKGROUND_TOKENS[node.rules.backgroundToken] : undefined)
    ?? inheritedCanvasColor;
  const visibleChildren = renderedChildren.filter((child) => !child.hidden);
  const firstVisibleId = visibleChildren[0]?.nodeId;
  const lastVisibleId = visibleChildren[visibleChildren.length - 1]?.nodeId;
  // 品牌事实、到店邀请，以及明确的上下/左右图文配方：主图保持自己的比例，文字排在图下。
  // 首屏与全幅覆盖仍把跟随主图的文字收进图片槽位。
  const recipeLayout = shared.layoutDefinition?.templateRecipe?.layout;
  const stackedRecipeLayout = recipeLayout === "topImageBottomContent"
    || recipeLayout === "topContentBottomImage"
    || recipeLayout === "leftImageRightContent"
    || recipeLayout === "leftContentRightImage"
    || recipeLayout === "splitColumns"
    || recipeLayout === "cards"
    || recipeLayout === "free"
    || recipeLayout === "centerSubject"
    || recipeLayout === "headerSubjectFooter";
  const stackedCopy = sectionRole === "maison-fact" || sectionRole === "service-invitation" || stackedRecipeLayout;
  const pairedHeroFrame = Boolean(pairedCanvas)
    && sectionRole === "page-hero"
    && device === "mobile"
    && !shared.heroCopyBelow
    && !imageCarriesCopy
    && !constrainWorkCell
    && node.rules.layoutMode !== "free";
  const composeCopyInsideImage = !stackedCopy && (
    pairedHeroFrame || (
      device === "mobile"
      && !shared.heroCopyBelow
      && !(shared.layoutDefinition && hasExplicitMobileTemplateComposition(shared.layoutDefinition, node.nodeId))
      && sectionRole !== "creation-grid"
      && !(shared.layoutDefinition && isContentHeightSplitSection(shared.layoutDefinition))
      && !parentFree
      && !constrainWorkCell
      && !onImageCopy
      && !imageCarriesCopy
      && node.rules.layoutMode !== "free"
    )
  );
  const copySegments = composeCopyInsideImage
    ? segmentMobileCopyFrames(renderedChildren)
    : [{ kind: "nodes" as const, nodes: renderedChildren }];
  const renderChild = (
    child: DynamicTemplateRenderPlanNode,
    childIndex: number,
    inWorkGrid: boolean,
    frame?: { onImage?: boolean; fillImage?: boolean; measured?: boolean; fillPairedCell?: boolean; pairedWorkCard?: boolean },
    spanWorkLead = false,
  ) => (
    <RenderNode
      key={child.nodeId}
      node={child}
      device={device}
      sectionRole={sectionRole}
      constrainWorkCell={constrainWorkCell || inWorkGrid}
      workCardFrame={(constrainWorkCell || inWorkGrid) && child.slot?.type === "image" && !frame?.fillPairedCell}
      parentFree={parentFree}
      parentRules={node.rules}
      siblingIndex={childIndex}
      siblingPlacements={node.children
        .filter((sibling) => sibling.nodeId !== child.nodeId)
        .flatMap((sibling) => sibling.rules.placement ? [sibling.rules.placement] : [])}
      {...shared}
      spanWorkLead={spanWorkLead}
      inheritedCanvasColor={frame?.onImage ? "#111315" : canvasForChildren}
      bleedInset={childInset}
      bleedAtStart={bleedAtStart && child.nodeId === firstVisibleId}
      bleedAtEnd={bleedAtEnd && child.nodeId === lastVisibleId}
      parentMeasured={parentMeasured || frame?.measured === true}
      onImageCopy={(onImageCopy || frame?.onImage === true)
        && !child.rules.backgroundColor
        && !child.rules.backgroundToken}
      imageCarriesCopy={imageCarriesCopy}
      fillMobileCopyFrame={frame?.fillImage === true}
      fillPairedCell={frame?.fillPairedCell === true || fillPairedCell}
      pairedWorkCard={frame?.pairedWorkCard === true}
      pairedCanvas={pairedCanvas}
      fillSplitRemainder={fillSplitRemainder}
      siblings={node.children}
    />
  );
  const renderNodeGroup = (children: readonly DynamicTemplateRenderPlanNode[]) => {
    const workOptions = {
      device,
      sectionRole,
      layoutMode: node.rules.layoutMode,
      display: node.rules.display,
      columnCount: node.rules.columns?.length,
    };
    const fourImageWorkGrid = sectionRole === "creation-grid"
      && children.filter((child) => isMobileWorkUnit(child, sectionRole)).length === 4;
    const hasAuthorMobileLayout = device === "mobile" && !fourImageWorkGrid && Boolean(shared.layoutDefinition
      && hasExplicitMobileTemplateLayout(shared.layoutDefinition, node.nodeId)
      && !isFixedFourWorkGrid(shared.layoutDefinition, node.nodeId));
    const leadSpanId = creationGridLeadSpanId(children, workOptions);
    const groups = attachMobileWorkCaptions(hasAuthorMobileLayout
      ? children.map((child) => ({ kind: "node" as const, node: child }))
      : partitionMobileWorkUnits(children, workOptions));
    return groups.map((group) => {
    if (group.kind === "node") {
      const childIndex = node.children.findIndex((child) => child.nodeId === group.node.nodeId);
      return renderChild(group.node, childIndex, false, undefined, group.node.nodeId === leadSpanId);
    }
    if (group.nodes.length < 2) {
      const child = group.nodes[0];
      const childIndex = node.children.findIndex((item) => item.nodeId === child.nodeId);
      return renderChild(child, childIndex, false);
    }
    // 四张作品固定两列两行。竖画布里的三张同行图排成一列。
    // 作品网格对换成横画布（例如 4:5 对 5:4）时，三张仍是第一张满宽、后两张并排。
    const pairedPortrait = pairedCanvas ? pairedCanvas.height > pairedCanvas.width : false;
    const peerImagesInSwappedFrame = Boolean(pairedCanvas) && device === "mobile"
      && (sectionRole !== "creation-grid" || group.nodes.length === 4 || pairedPortrait);
    if (peerImagesInSwappedFrame && pairedCanvas) {
      const reserveText = children.some((child) => !isMobileWorkUnit(child, sectionRole));
      const box = pairedCanvasContentBox(pairedCanvas, { reserveText });
      // 四张作品图固定两列两行。1:2 画布若按可读比例挑选，会排成四行扁图。
      const workGap = 12;
      const workCellWidth = (box.innerWidth - workGap) / 2;
      const workCellHeight = (box.innerHeight - workGap) / 2;
      const split = sectionRole === "creation-grid" && group.nodes.length === 4
        ? {
          columns: 2,
          rows: 2,
          cellWidth: workCellWidth,
          cellHeight: workCellHeight,
          overflow: workCardOverflowsCell(workCellWidth, workCellHeight),
        }
        : choosePeerImageSplit(group.nodes.length, box.innerWidth, box.innerHeight);
      return (
        <div
          key={group.nodes.map((child) => child.nodeId).join(":")}
          data-template-paired-image-grid="true"
          data-template-paired-image-columns={split.columns}
          data-template-paired-image-rows={split.rows}
          data-template-canvas-overflow={split.overflow ? "true" : undefined}
          style={{
            display: "grid",
            flex: "1 1 0%",
            gap: 12,
            gridTemplateColumns: `repeat(${split.columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${split.rows}, minmax(0, 1fr))`,
            minHeight: 0,
            width: "100%",
          }}
        >
          {group.nodes.map((child) => {
            const childIndex = node.children.findIndex((item) => item.nodeId === child.nodeId);
            return (
              <div key={child.nodeId} data-template-paired-image-cell="true" style={{ minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                {renderChild(child, childIndex, false, {
                  fillPairedCell: true,
                  pairedWorkCard: split.columns === 2 && split.rows === 2 && group.nodes.length === 4,
                })}
              </div>
            );
          })}
        </div>
      );
    }
    // 奇数张时第一张跨满两列，其余两两并排，避免两张一排、最后一张落单，
    // 也不把三张竖排成一屏半（区块模板标准 R-6）。
    const leadCard = group.nodes.length % 2 === 1;
    return (
      <div
        key={group.nodes.map((child) => child.nodeId).join(":")}
        data-template-mobile-work-grid="true"
        data-template-mobile-work-columns="2"
        data-template-mobile-work-lead={leadCard ? "true" : undefined}
        style={{
          display: "grid",
          gap: "24px 12px",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          width: "100%",
        }}
      >
        {group.nodes.map((child, cardIndex) => {
          const childIndex = node.children.findIndex((item) => item.nodeId === child.nodeId);
          const caption = group.captions[cardIndex];
          const captionIndex = caption ? node.children.findIndex((item) => item.nodeId === caption.nodeId) : -1;
          return (
            <div key={child.nodeId} data-template-mobile-work-card="true" style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0, ...(leadCard && cardIndex === 0 ? { gridColumn: "1 / -1" } : {}) }}>
              {renderChild(child, childIndex, true)}
              {caption ? renderChild(caption, captionIndex, true) : null}
            </div>
          );
        })}
      </div>
    );
    });
  };
  return copySegments.flatMap((segment) => {
    if (segment.kind === "nodes") return renderNodeGroup(segment.nodes);
    const imageIndex = node.children.findIndex((child) => child.nodeId === segment.image.nodeId);
    const heightRatio = segment.image.rules.height.mode === "aspect-ratio" && segment.image.rules.height.ratio
      ? segment.image.rules.height.ratio.width / segment.image.rules.height.ratio.height
      : undefined;
    const slotRatio = parseAspectRatio(segment.image.slotRules?.aspectRatio);
    const resolvedRatio = resolveMobileImageFrame({
      device: "mobile",
      inWorkGrid: false,
      slotType: segment.image.slot?.type,
      semanticRole: segment.image.slot?.semanticRole,
      sectionRole,
      ratio: heightRatio ?? (slotRatio ? slotRatio.width / slotRatio.height : undefined),
      ...heroImageFrameRequest(shared.layoutDefinition, segment.image, shared.pageHeroPlacement),
    });
    const segmentImage = segment.image.content && typeof segment.image.content === "object" && !Array.isArray(segment.image.content)
      ? segment.image.content as { mobileSrc?: unknown }
      : null;
    const ratio = paintDesktopOnlyHeroFrame({
      resolvedFrame: resolvedRatio,
      desktopAspect: segment.image.slot?.desktopRules?.aspectRatio,
      hasMobileAsset: isSafeTemplateMediaUrl(segmentImage?.mobileSrc),
      explicitObjectFit: segment.image.layoutOverride?.objectFit,
      // 整节已经对换时，主图跟着竖画布，不再退回桌面横图。
      pairedCanvas: Boolean(pairedCanvas) || pairedHeroFrame,
    }) ?? (slotRatio ? `${slotRatio.width} / ${slotRatio.height}` : "4 / 5");
    const bleeds = imageBleedsOnMobile(segment.image, {
      device: "mobile",
      constrainWorkCell: false,
      sectionRole,
      canvasColor: inheritedCanvasColor,
    });
    const frameBleed = bleeds ? mobileBleedBox(childInset, { top: bleedAtStart, bottom: bleedAtEnd }) : undefined;
    const measured = usesLargePhoneMeasure(segment.image, {
      device: "mobile",
      inWorkGrid: false,
      parentMeasured,
      sectionRole,
    });
    const lockHeroFrame = shared.stableMediaFrame === true && sectionRole === "page-hero";
    return [
      <div
        key={`copy-frame:${segment.image.nodeId}`}
        data-template-mobile-copy-frame="true"
        data-template-large-phone-measure={measured ? "true" : undefined}
        style={{
          display: "grid",
          position: "relative",
          width: "100%",
          minWidth: 0,
          maxWidth: "100%",
          ...(pairedHeroFrame ? { height: "100%", flex: "1 1 auto", minHeight: 0 } : {}),
          ...frameBleed,
        }}
      >
        <div aria-hidden="true" data-template-hero-frame-ratio={ratio} style={{ gridArea: "1 / 1", width: "100%", ...(pairedHeroFrame ? { height: "100%" } : { aspectRatio: ratio }) }} />
        <div style={{ gridArea: "1 / 1", position: "relative", minHeight: "100%" }}>
          {renderChild(segment.image, imageIndex, false, { fillImage: true, measured: true })}
        </div>
        <div
          aria-hidden="true"
          data-template-text-scrim="bottom"
          style={{
            gridArea: "1 / 1",
            alignSelf: "end",
            height: "46%",
            zIndex: 1,
            pointerEvents: "none",
            background: "linear-gradient(to top, rgb(24 26 27 / 0.6), rgb(24 26 27 / 0))",
          }}
        />
        <div data-template-hero-frame-copy="true" style={{
          ...(lockHeroFrame
            ? { position: "absolute", left: 0, right: 0, bottom: 0 }
            : { gridArea: "1 / 1", alignSelf: "end" }),
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          minWidth: 0,
          overflowWrap: "anywhere",
          padding: "28px 20px 24px",
        }}
        >
          {segment.copy.map((child) => {
            const childIndex = node.children.findIndex((item) => item.nodeId === child.nodeId);
            return renderChild(child, childIndex, false, { onImage: true, measured: true });
          })}
        </div>
      </div>,
      ...segment.rest.map((child) => {
        const childIndex = node.children.findIndex((item) => item.nodeId === child.nodeId);
        return renderChild(child, childIndex, false);
      }),
    ];
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
  showEmptySlots = false,
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
  parentMeasured = false,
  siblings = [],
  onImageCopy = false,
  imageCarriesCopy = false,
  artworkHref,
  artworkImageSlotId,
  fillMobileCopyFrame = false,
  spanWorkLead = false,
  pairedCanvas = null,
  fillPairedCell = false,
  fillSplitRemainder = false,
  pairedWorkCard = false,
  layoutDefinition,
  pageHeroPlacement,
  heroCopyBelow = false,
  heroFrameCapped = false,
  stableMediaFrame = false,
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
  showEmptySlots?: boolean;
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
  parentMeasured?: boolean;
  siblings?: readonly DynamicTemplateRenderPlanNode[];
  onImageCopy?: boolean;
  imageCarriesCopy?: boolean;
  /** 完成稿不绘制按钮时，主图承接这一处跳转。 */
  artworkHref?: string;
  artworkImageSlotId?: string;
  fillMobileCopyFrame?: boolean;
  /** 作品网格自身的第一张跨满现有两列，不另套内层网格。 */
  spanWorkLead?: boolean;
  pairedCanvas?: PairedCanvasRatio | null;
  /** 对换画布里的图片格：铺满格子，不再套 4:5。 */
  fillPairedCell?: boolean;
  /**
   * 对换后的竖向画布里只有一张主图：主图吃掉文案下方的空白。
   * 不把 pairedCanvas 传进节点，避免主图盖住文字。
   */
  fillSplitRemainder?: boolean;
  /** 旧对换画布里的四张作品卡保持 4:5；三张及横图根仍铺满格子。 */
  pairedWorkCard?: boolean;
  /** 当前渲染定义（含属性预览），仅用于判断手机排列是否由作者明确设置。 */
  layoutDefinition?: TemplateDefinitionV2;
  pageHeroPlacement?: PageHeroFramePlacement;
  heroCopyBelow?: boolean;
  heroFrameCapped?: boolean;
  /** 新几何的首屏媒体框：高度只跟比例走，下方文字不能把它挤矮。旧画布不传。 */
  stableMediaFrame?: boolean;
}) {
  const layoutElement = useRef<HTMLElement | null>(null);
  const backgroundSource = !node.hidden && node.rules.backgroundImage && isSafeTemplateMediaUrl(node.rules.backgroundImage)
    ? node.rules.backgroundImage
    : "";
  const backgroundMedia = useManagedTemplateMediaDisplayUrl(backgroundSource, mode !== "public", layoutElement);
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
    let measureTimer = 0;
    const scheduleMeasure = () => {
      if (measureTimer) return;
      measureTimer = ownerWindow.setTimeout(() => {
        measureTimer = 0;
        measure();
      }, 16);
    };
    const observer = new ownerWindow.ResizeObserver(scheduleMeasure);
    observer.observe(element);
    return () => {
      if (measureTimer) ownerWindow.clearTimeout(measureTimer);
      observer.disconnect();
    };
  }, [hasPositionedChildren, node.rules.padding]);
  const safeAction = node.slot && (node.slot.type === "button" || node.slot.type === "link")
    ? getSafeActionContent(node.content, contentRenderMode !== "public")
    : undefined;
  const actionHref = mode !== "editor"
    && (contentRenderMode === "preview" || contentRenderMode === "public")
    && safeAction?.label
    ? safeAction.href
    : undefined;
  const artworkImageHref = artworkHref && node.slot?.type === "image" && node.slotId === artworkImageSlotId
    ? artworkHref
    : undefined;
  const Element: ElementType = actionHref || artworkImageHref ? "a" : nodeElementType(node);
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
  if (imageCarriesCopy && artworkCopyTreatment(node.slot) === "omit") return null;
  const emptyPublicImage = mode === "public"
    && !showEmptySlots
    && node.slot?.type === "image"
    && !hasTemplateImageContent(node.content, device);
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
  const paintedRatio = heightRatio ?? (slotRatio ? slotRatio.width / slotRatio.height : undefined);
  const mobileFrame = fillPairedCell ? undefined : resolveMobileImageFrame({
    device,
    inWorkGrid: workCardFrame,
    slotType: node.slot?.type,
    semanticRole: node.slot?.semanticRole,
    sectionRole,
    ratio: paintedRatio,
    ...heroImageFrameRequest(layoutDefinition, node, pageHeroPlacement),
  });
  const mobileAssetRecord = node.content && typeof node.content === "object" && !Array.isArray(node.content)
    ? node.content as { mobileSrc?: unknown }
    : null;
  const missingMobileHero = device === "mobile"
    && sectionRole === "page-hero"
    && node.slot?.type === "image"
    && (node.slot.semanticRole === "backgroundImage" || node.slot.semanticRole === "heroImage")
    && !isSafeTemplateMediaUrl(mobileAssetRecord?.mobileSrc);
  const paintedMobileFrame = paintDesktopOnlyHeroFrame({
    resolvedFrame: mobileFrame,
    desktopAspect: node.slot?.desktopRules?.aspectRatio,
    hasMobileAsset: !missingMobileHero,
    explicitObjectFit: node.layoutOverride?.objectFit,
    pairedCanvas: Boolean(pairedCanvas),
  });
  const splitPlate = !pairedCanvas && !fillSplitRemainder && layoutDefinition && isContentHeightSplitSection(layoutDefinition)
    ? splitHeroMobileFrame({
      device,
      sectionRole,
      semanticRole: node.slot?.semanticRole,
      slotType: node.slot?.type,
      mobileRatio: paintedRatio,
      desktopAspect: node.slot?.desktopRules?.aspectRatio,
    })
    : undefined;
  const holdsSplitHero = fillSplitRemainder && subtreeHasHeroImage(node);
  const splitHeroSlot = holdsSplitHero
    && node.slot?.type === "image"
    && node.slot.semanticRole === "heroImage";
  const splitHeroColumn = holdsSplitHero && !splitHeroSlot && node.rules.layoutMode !== "free";
  const besideSplitHero = fillSplitRemainder
    && !holdsSplitHero
    && siblings.some((item) => subtreeHasHeroImage(item));
  const capHeroFrame = heroFrameCapped && paintedMobileFrame === "9 / 16";
  const releaseHeroCopy = heroCopyBelow && sectionRole === "page-hero";
  const bleedStyle = parentFree && placement
    ? mobileFreeFrameStyle(placement, bleeds, node.slot?.semanticRole)
    : bleeds
      ? mobileBleedBox(bleedInset, { top: bleedAtStart, bottom: bleedAtEnd })
      : undefined;
  const largePhoneMeasure = usesLargePhoneMeasure(node, {
    device,
    inWorkGrid: constrainWorkCell,
    parentMeasured,
    sectionRole,
  });
  const holdsSourceRatio = Boolean(paintedMobileFrame && paintedMobileFrame !== mobileFrame);
  const artworkClip = imageCarriesCopy && artworkNodeClips(node);
  const visualCollapse = node.layoutOverride?.visuallyCollapsed === true
    && Boolean(node.slot && ["heading", "text", "richText", "badge"].includes(node.slot.type));
  const overlayScrim = artworkClip ? undefined : resolveTextOnImageScrim(node, siblings, device);
  const posterContain = imageCarriesCopy
    && missingMobileHero
    && !pairedCanvas
    && node.layoutOverride?.objectFit !== "cover"
    && node.layoutOverride?.objectFit !== "fill"
    && !cssFrameIsLandscape(paintedMobileFrame);
  const fillSourceFrame = missingMobileHero
    && cssFrameIsLandscape(paintedMobileFrame)
    && node.layoutOverride?.objectFit !== "fill";
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
      fillSourceFrame
        ? "cover"
        : posterContain
          ? "contain"
          : bleedStyle && !node.layoutOverride?.objectFit ? "cover" : fillMobileCopyFrame ? "cover" : undefined,
      canvasColor,
      onImageCopy,
      imageCarriesCopy,
    )
    : null;
  const coversPairedSection = Boolean(pairedCanvas)
    && device === "mobile"
    && pairedImageCoversSection(node, sectionRole);
  const fillsPairedImage = coversPairedSection || (
    Boolean(pairedCanvas)
    && device === "mobile"
    && fillPairedCell
  );
  const pairedStructure = Boolean(pairedCanvas)
    && device === "mobile"
    && !node.slot
    && node.rules.layoutMode !== "free"
    && subtreeFillsPairedCanvas(node, sectionRole);
  const explicitMobileLayout = device === "mobile" && Boolean(layoutDefinition
    && hasExplicitMobileTemplateLayout(layoutDefinition, node.nodeId)
    && !isFixedFourWorkGrid(layoutDefinition, node.nodeId));
  return (
    <Element
      ref={layoutElement}
      {...(actionHref || artworkImageHref ? { href: actionHref ?? artworkImageHref } : {})}
      className={[
        artworkClip ? "hc-dynamic-template__artwork-copy" : undefined,
        mode === "editor" && visualCollapse && !artworkClip ? "hc-dynamic-template__empty-slot" : undefined,
      ].filter(Boolean).join(" ") || undefined}
      data-template-artwork-copy={artworkClip ? (node.slot?.type === "heading" ? "heading" : "frame") : undefined}
      data-template-artwork-link={artworkImageHref ? "true" : undefined}
      data-template-node-id={node.nodeId}
      data-template-node-type={node.type}
      data-template-split-row={isSplitCopyRow(node, sectionRole) ? "true" : undefined}
      data-template-layout={isSplitCopyRow(node, sectionRole) ? (node.rules.layoutMode ?? "flow") : undefined}
      data-template-split-columns={isSplitCopyRow(node, sectionRole) ? String(splitCopyColumnCount(node)) : undefined}
      data-template-pair-group={mode === "editor" && node.children.some((child) => child.nodeId === selectedNodeId) ? "true" : undefined}
      data-template-work-card-ratio={pairedWorkCard || mobileFrame === "4 / 5" ? "4 / 5" : undefined}
      data-template-split-hero-frame={splitPlate}
      data-template-split-hero-fill={splitHeroSlot ? "true" : undefined}
      data-template-mobile-asset={missingMobileHero ? "desktop-only" : undefined}
      data-template-mobile-frame={holdsSourceRatio ? "source" : undefined}
      data-template-poster-fit={posterContain ? "contain" : undefined}
      data-template-visual-collapse={visualCollapse ? "true" : undefined}
      data-template-node-label={interactive ? node.name : undefined}
      data-template-empty-structure={showEmptyStructure && !node.slot && node.children.length === 0 ? "true" : undefined}
      data-template-slot-id={node.slotId}
      data-template-selected={selectedNodeId === node.nodeId ? "true" : undefined}
      data-template-selected-contract-role={selectedContractRole?.nodeId === node.nodeId ? selectedContractRole.roleId : undefined}
      data-template-background-token={node.rules.backgroundToken}
      data-template-border-token={node.rules.borderToken}
      data-template-semantic-role={node.slot?.semanticRole}
      data-template-mobile-bleed={bleedStyle ? "true" : undefined}
      data-template-mirrored={node.mirrored ? "true" : undefined}
      data-template-mobile-work-lead={spanWorkLead ? "true" : undefined}
      data-template-large-phone-measure={largePhoneMeasure ? "true" : undefined}
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
        ...(dropDarkMobileImageTail(node, device, canvasColor, showEmptySlots, mode)
          ? { paddingBottom: 0 }
          : {}),
        ...(collapseVacantFlowPadding(node, showEmptySlots, mode, showEmptyStructure, device)
          ? { padding: 0 }
          : {}),
        ...(showEmptyStructure && !node.slot && node.children.length === 0
          ? { minHeight: "256px" }
          : {}),
        // 新合同的阅读顺序与叠放层序共用 childIds，断点不维护第二套排序。
        ...(constrainWorkCell ? { width: "100%", maxWidth: "100%", minWidth: 0 } : {}),
        ...(paintedMobileFrame && stableMediaFrame && !capHeroFrame ? {
          aspectRatio: paintedMobileFrame,
          height: "auto",
          maxHeight: "none",
          flex: "0 0 auto",
          width: "100%",
          flexShrink: 0,
          minHeight: 0,
        } : paintedMobileFrame ? {
          aspectRatio: capHeroFrame ? "auto" : paintedMobileFrame,
          ...(missingMobileHero ? {
            width: "100%",
            maxWidth: "100%",
            height: "auto",
            flex: "0 0 auto",
            alignSelf: "flex-start" as const,
          } : {}),
        } : {}),
        ...(splitPlate ? {
          aspectRatio: splitPlate,
          height: "auto",
          maxHeight: "none",
          flex: "0 0 auto",
          width: "100%",
          flexShrink: 0,
          minHeight: 0,
        } : {}),
        ...(releaseHeroCopy && node.rules.layoutMode === "free" ? {
          position: "relative" as const,
          display: "flex",
          flexDirection: "column" as const,
          height: "auto",
          aspectRatio: "auto",
          overflow: "visible" as const,
          minHeight: 0,
        } : {}),
        ...(releaseHeroCopy && parentFree ? {
          position: "relative" as const,
          left: "auto",
          top: "auto",
          width: "100%",
          height: capHeroFrame ? HERO_FRAME_CAP : "auto",
          maxWidth: "100%",
          transform: "none",
        } : {}),
        ...(capHeroFrame ? {
          width: "100%",
          height: HERO_FRAME_CAP,
          maxHeight: HERO_FRAME_CAP,
          minHeight: 0,
          overflow: "hidden" as const,
        } : {}),
        ...(relationalLayout ? { order: siblingIndex, zIndex: layoutPreview?.zIndex ?? node.layoutOverride?.zIndex ?? siblingIndex } : {}),
        ...(device === "mobile" && node.slot?.type !== "image" && node.rules.overflow === "hidden" && subtreeHasMobileBleedImage(node, { device, sectionRole, canvasColor })
          ? { overflow: "visible" as const }
          : {}),
        ...(fillMobileCopyFrame ? {
          position: "absolute" as const,
          inset: 0,
          width: "100%",
          height: "100%",
          maxWidth: "none",
          margin: 0,
          aspectRatio: "auto",
          overflow: "hidden" as const,
        } : bleedStyle),
        ...(layoutEditable || freePlacementEditable ? {
          ...(layoutEditable ? { position: "relative" as const } : {}),
          cursor: freePlacementEditable || node.instanceEditPolicy?.position ? "move" : undefined,
        } : {}),
        ...(spanWorkLead ? { gridColumn: "1 / -1" } : {}),
        ...(pairedStructure && !parentRules ? {
          position: "absolute" as const,
          inset: 0,
          ...(!explicitMobileLayout ? { display: "flex", flexDirection: "column" as const } : {}),
          // 主舞台自己仍写着桌面横图比例。对换后整节已经是竖画布，舞台必须跟着铺满，
          // 否则主图量到的还是 16:9。
          aspectRatio: "auto",
          maxHeight: "none",
          minHeight: 0,
          width: "100%",
          height: "100%",
          boxSizing: "border-box" as const,
        } : pairedStructure ? {
          ...(!explicitMobileLayout ? { display: "flex", flexDirection: "column" as const } : {}),
          flex: "1 1 auto",
          minHeight: 0,
          height: "100%",
          width: "100%",
          boxSizing: "border-box" as const,
        } : {}),
        ...(pairedWorkCard ? {
          width: "100%",
          height: "auto",
          aspectRatio: "4 / 5",
          flex: "0 0 auto",
          alignSelf: "start" as const,
          maxHeight: "none",
          overflow: "hidden" as const,
        } : coversPairedSection && !capHeroFrame && node.slot?.semanticRole === "heroImage" ? {
          // 首屏主图保持对换画幅并留在文档流里。文案变长时整节变高，图片高度不跟着拉长。
          position: "relative" as const,
          width: "100%",
          height: "auto",
          aspectRatio: paintedMobileFrame ?? (pairedCanvas ? `${pairedCanvas.width} / ${pairedCanvas.height}` : "9 / 16"),
          maxWidth: "100%",
          flex: "0 0 auto",
          minHeight: 0,
          overflow: "hidden" as const,
        } : coversPairedSection && !capHeroFrame ? {
          // 高度按内容盒的 100% 再叠负外边距，会在画布底下留下同样深的底色。贴齐整节才盖住内边距。
          position: "absolute" as const,
          inset: 0,
          margin: 0,
          width: "100%",
          height: "100%",
          maxWidth: "none",
          maxHeight: "none",
          minHeight: 0,
          aspectRatio: "auto",
          overflow: "hidden" as const,
        } : fillsPairedImage ? {
          flex: "1 1 auto",
          width: "100%",
          height: capHeroFrame ? HERO_FRAME_CAP : "100%",
          minHeight: 0,
          maxHeight: capHeroFrame ? HERO_FRAME_CAP : "100%",
          aspectRatio: "auto",
          overflow: "hidden" as const,
          // 整节定位已经贴齐时不再加宽。仍在内边距里的图，要补回左右留白，否则右边短一截。
          ...(fillMobileCopyFrame || !bleedStyle ? {} : {
            width: bleedStyle.width,
            marginLeft: bleedStyle.marginLeft,
            marginRight: bleedStyle.marginRight,
          }),
        } : {}),
        ...(artworkClip || (visualCollapse && mode !== "editor") ? {
          position: "absolute" as const,
          width: "1px",
          height: "1px",
          padding: 0,
          margin: "-1px",
          overflow: "hidden" as const,
          clip: "rect(0 0 0 0)",
          clipPath: "inset(50%)",
          whiteSpace: "nowrap" as const,
          border: 0,
          background: "none",
          backgroundColor: "transparent",
          backgroundImage: "none",
          boxShadow: "none",
          minWidth: 0,
          minHeight: 0,
          maxWidth: "1px",
          pointerEvents: "none" as const,
        } : visualCollapse && mode === "editor" ? {
          minHeight: "2.5rem",
          outline: "1px dashed #6E7477",
          outlineOffset: "2px",
        } : {}),
        ...(splitHeroColumn ? {
          display: "flex",
          flexDirection: "column" as const,
          flex: "1 1 auto",
          alignItems: "stretch" as const,
          width: "100%",
          height: "100%",
          minHeight: 0,
          boxSizing: "border-box" as const,
        } : {}),
        ...(splitHeroSlot ? {
          position: "relative" as const,
          flex: "1 1 0%",
          alignSelf: "stretch" as const,
          width: "100%",
          height: "auto",
          minHeight: 0,
          maxHeight: "none",
          aspectRatio: "auto",
          overflow: "hidden" as const,
        } : {}),
        ...(besideSplitHero ? {
          flex: "0 0 auto",
          height: "auto",
          maxHeight: "none",
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
      {overlayScrim ? (
        <div
          aria-hidden="true"
          data-template-text-scrim={overlayScrim}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: -1,
            pointerEvents: "none",
            background: overlayScrim === "bottom"
              ? "linear-gradient(to top, rgb(24 26 27 / 0.6), rgb(24 26 27 / 0))"
              : "linear-gradient(to bottom, rgb(24 26 27 / 0.6), rgb(24 26 27 / 0))",
          }}
        />
      ) : null}
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
        showEmptySlots,
        parentFree: node.type === "Stack" && node.rules.layoutMode === "free",
        relationalLayout,
        preserveResolvedMobileRatio,
        sectionRole,
        constrainWorkCell,
        inheritedCanvasColor: canvasColor,
        bleedInset,
        bleedAtStart,
        bleedAtEnd,
        parentMeasured: largePhoneMeasure,
        onImageCopy: onImageCopy && !node.rules.backgroundColor && !node.rules.backgroundToken,
        imageCarriesCopy,
        artworkHref,
        artworkImageSlotId,
        pairedCanvas,
        fillPairedCell,
        fillSplitRemainder,
        layoutDefinition,
        pageHeroPlacement,
        heroCopyBelow,
        heroFrameCapped,
        stableMediaFrame,
      })}
    </Element>
  );
}

function subtreeHasHeroImage(node: DynamicTemplateRenderPlanNode): boolean {
  if (node.hidden) return false;
  if (node.slot?.type === "image" && node.slot.semanticRole === "heroImage") return true;
  return node.children.some(subtreeHasHeroImage);
}

function countVisibleImages(node: DynamicTemplateRenderPlanNode): number {
  if (node.hidden) return 0;
  const self = node.slot?.type === "image" ? 1 : 0;
  return node.children.reduce((total, child) => total + countVisibleImages(child), self);
}

const SPLIT_COPY_ROLES = new Set(["editorial-split", "collection-story", "craft-detail"]);
const SPLIT_TEXT_SLOT_TYPES = new Set(["heading", "text", "richText", "badge", "button", "link"]);

function subtreeHasSlot(
  node: DynamicTemplateRenderPlanNode,
  predicate: (item: DynamicTemplateRenderPlanNode) => boolean,
): boolean {
  if (predicate(node)) return true;
  return node.children.some((child) => subtreeHasSlot(child, predicate));
}

function splitCopyColumnCount(node: DynamicTemplateRenderPlanNode): number {
  if (node.rules.display === "grid" && (node.rules.columns?.length ?? 0) >= 2) {
    return node.rules.columns?.length ?? 0;
  }
  const direction = node.rules.direction ?? "row";
  if (node.rules.display === "flex" && direction !== "column") {
    return Math.max(2, node.children.filter((child) => !child.hidden).length);
  }
  return 0;
}

function isSplitCopyRow(node: DynamicTemplateRenderPlanNode, sectionRole?: string): boolean {
  if (!sectionRole || !SPLIT_COPY_ROLES.has(sectionRole)) return false;
  if (node.slot) return false;
  const hasImage = subtreeHasSlot(node, (item) => item.slot?.type === "image");
  const hasText = subtreeHasSlot(node, (item) => Boolean(item.slot && SPLIT_TEXT_SLOT_TYPES.has(item.slot.type)));
  if (!hasImage || !hasText) return false;
  if (node.rules.layoutMode === "free") return true;
  return splitCopyColumnCount(node) >= 2;
}

function overflowObjectName(item: HTMLElement): string {
  return item.getAttribute("data-template-node-label")?.trim()
    || item.getAttribute("data-template-slot-id")?.trim()
    || item.getAttribute("data-template-node-id")?.trim()
    || "未命名对象";
}

export default function DynamicTemplateRenderer({
  definition,
  device,
  breakpoint,
  contentBySlotId,
  hiddenSlotIds,
  imageCarriesCopy = false,
  layoutOverridesByNodeId,
  pageSettings,
  mode = "public",
  showEmptySlots,
  publicSurface,
  omitNodeBackgroundImages = false,
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
  pageHeroPlacement,
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
  const renderDefinition = omitNodeBackgroundImages
    ? definitionWithoutNodeBackgroundImages(definition)
    : definition;
  const result = compileDynamicTemplateRenderPlan(renderDefinition, {
    device,
    breakpoint,
    contentBySlotId,
    hiddenSlotIds,
    layoutOverridesByNodeId,
    pageSettings,
    showEmptySlots: showEmptySlots ?? (mode === "editor" && editorSurface !== "page-instance"),
    publicSurface: mode === "public" && definition.schemaVersion >= 3
      ? { ...publicSurface, omitDefaultImages: true, omitDefaultContent: true }
      : publicSurface,
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const sectionRole = definition.metadata.sectionRole ?? definition.templateRecipe?.sectionRole;
  // 桌面有可读比例时，手机整节按反比例画出，例如 16:9 对 9:16。缺手机图不能取消这次对换。
  // 没有可读桌面比例的首屏，才在没有手机图时继续沿用桌面横图。
  const pairedCanvasRatio = device === "mobile" && result.ok ? resolvePairedMobileCanvas(definition) : null;
  const reuseDesktopHero = !pairedCanvasRatio
    && device === "mobile"
    && result.ok
    && pageHeroReusesDesktopFrame({
      sectionRole,
      images: collectDesktopHeroImages(result.plan.root),
    });
  const explicitCanvasRatio = pairedCanvasRatio
    ?? (definition.metadata.geometryPolicy === "paired-canvas" && result.ok
      && result.plan.root.rules.height.mode === "aspect-ratio"
      ? result.plan.root.rules.height.ratio
      : undefined);
  const [fixedCanvasOverflow, setFixedCanvasOverflow] = useState("");
  useLayoutEffect(() => {
    const canvas = rootRef.current;
    if (!canvas || !explicitCanvasRatio || mode !== "editor") {
      setFixedCanvasOverflow("");
      return;
    }
    const owner = canvas.ownerDocument.defaultView;
    if (!owner) return;
    const nodes = [...canvas.querySelectorAll<HTMLElement>("[data-template-node-id]")];
    const update = () => {
      const frame = canvas.getBoundingClientRect();
      // 图没铺满时外壳随内容变高，不能用变高后的边框判断越界。
      // 仍按声明的双端比例画一条界，超出这条界才提示。
      const intendedHeight = frame.width * explicitCanvasRatio.height / explicitCanvasRatio.width;
      const limitBottom = frame.top + (Number.isFinite(intendedHeight)
        ? Math.min(frame.height, intendedHeight)
        : frame.height);
      const names: string[] = [];
      for (const node of nodes) {
        if (names.length >= 4) break;
        if (node.closest("[data-template-artwork-copy], .hc-dynamic-template__artwork-copy")) continue;
        const box = node.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) continue;
        const past = box.left < frame.left - 1 || box.top < frame.top - 1
          || box.right > frame.right + 1 || box.bottom > limitBottom + 1
          || (/Heading|Text|RichText|Badge/.test(node.dataset.templateNodeType ?? "")
            // 中文字形可能超出行盒 1～2px；这不等于少了一行，几何越框仍按上面的 1px 检查。
            && node.scrollHeight > node.clientHeight + 2);
        if (!past) continue;
        const name = overflowObjectName(node);
        if (!names.includes(name)) names.push(name);
      }
      const deviceLabel = device === "mobile" ? "手机" : "桌面";
      const overflow = names.length > 0
        ? `${deviceLabel}固定画幅里，${names.join("、")}超出画框。系统没有裁掉超出内容。`
        : "";
      setFixedCanvasOverflow((current) => current === overflow ? current : overflow);
    };
    let measureTimer = 0;
    const scheduleUpdate = () => {
      if (measureTimer) return;
      measureTimer = owner.setTimeout(() => {
        measureTimer = 0;
        update();
      }, 16);
    };
    scheduleUpdate();
    // 只观察画布根：逐节点 observe 会在子项随画幅回写时放大 RO 投递风暴。
    const observer = new owner.ResizeObserver(scheduleUpdate);
    observer.observe(canvas);
    return () => {
      if (measureTimer) owner.clearTimeout(measureTimer);
      observer.disconnect();
    };
  }, [definition, contentBySlotId, device, explicitCanvasRatio, mode]);
  const [largePhone, setLargePhone] = useState(false);
  // R-2 只限制写了 hero-media-frame 的第一只全幅主视觉。
  // 未写策略或 paired-canvas 的对换画布要让图片铺满整节；把图片框压到视口高会在底下露出画布底色。
  const heroMediaFrame = definition.metadata.geometryPolicy === "hero-media-frame"
    && sectionRole === "page-hero"
    && pageHeroPlacement !== "subsequent";
  const [heroCopyBelow, setHeroCopyBelow] = useState(false);
  const [heroFrameCapped, setHeroFrameCapped] = useState(false);
  const copySignature = Object.values(contentBySlotId ?? {})
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "text" in item) return String(item.text ?? "");
      return "";
    })
    .join("\u0001");
  const inkSignature = Object.values(definition.slots)
    .map((slot) => `${slot.desktopRules?.color ?? ""}\u0001${slot.mobileRules?.color ?? ""}`)
    .join("\u0002");
  useLayoutEffect(() => {
    if (!heroMediaFrame) {
      setHeroCopyBelow(false);
      setHeroFrameCapped(false);
      return undefined;
    }
    const update = () => {
      const view = rootRef.current?.ownerDocument.defaultView ?? window;
      const height = view.innerHeight;
      const short = height > 0 && height < 480;
      const width = rootRef.current?.clientWidth ?? 0;
      const header = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--site-header-height"),
      ) || 0;
      const capped = device === "mobile" && heroFrameExceedsViewport(width, height, header);
      const host = rootRef.current;
      let copyExceedsFrame = false;
      if (!short && !capped && !imageCarriesCopy && host) {
        const frame = host.querySelector("[data-template-mobile-copy-frame]");
        const ratio = frame?.querySelector("[data-template-hero-frame-ratio]");
        const copy = frame?.querySelector("[data-template-hero-frame-copy]");
        const rawRatio = ratio?.getAttribute("data-template-hero-frame-ratio") ?? "";
        const [ratioWidth, ratioHeight] = rawRatio.split("/").map((part) => Number(part.trim()));
        if (ratio instanceof HTMLElement && copy instanceof HTMLElement && ratioWidth > 0 && ratioHeight > 0) {
          // 首帧宽度还是 0 时不能把标题判成溢出，否则横图会把文案锁到图下。
          if (ratio.clientWidth > 0) {
            const intended = ratio.clientWidth * (ratioHeight / ratioWidth);
            copyExceedsFrame = copy.scrollHeight > intended + 8;
          }
        } else {
          const image = host.querySelector("[data-template-semantic-role='backgroundImage'], [data-template-semantic-role='heroImage']");
          const texts = [...host.querySelectorAll("[data-template-node-type='HeadingSlot'], [data-template-node-type='TextSlot'], [data-template-node-type='RichTextSlot'], [data-template-node-type='BadgeSlot']")]
            .filter((node): node is HTMLElement => node instanceof HTMLElement && node.getAttribute("data-template-visual-collapse") !== "true");
          if (image instanceof HTMLElement && texts.length > 0 && image.getBoundingClientRect().height > 0) {
            const top = Math.min(...texts.map((node) => node.getBoundingClientRect().top));
            const bottom = Math.max(...texts.map((node) => node.getBoundingClientRect().bottom));
            copyExceedsFrame = bottom - top + 64 > image.getBoundingClientRect().height;
          }
        }
      }
      setHeroCopyBelow(short || capped || copyExceedsFrame);
      setHeroFrameCapped(capped);
    };
    update();
    let measureTimer = 0;
    const scheduleUpdate = () => {
      if (measureTimer) return;
      measureTimer = window.setTimeout(() => {
        measureTimer = 0;
        update();
      }, 16);
    };
    const observed = rootRef.current;
    const view = observed?.ownerDocument.defaultView ?? window;
    const observer = observed ? new view.ResizeObserver(scheduleUpdate) : null;
    if (observed) observer?.observe(observed);
    const shortViewport = typeof view.matchMedia === "function"
      ? view.matchMedia("(max-height: 479px)")
      : null;
    const onShortChange = () => scheduleUpdate();
    shortViewport?.addEventListener("change", onShortChange);
    view.addEventListener("resize", scheduleUpdate);
    return () => {
      if (measureTimer) window.clearTimeout(measureTimer);
      observer?.disconnect();
      shortViewport?.removeEventListener("change", onShortChange);
      view.removeEventListener("resize", scheduleUpdate);
    };
  }, [copySignature, device, heroMediaFrame, imageCarriesCopy]);
  useLayoutEffect(() => {
    const element = rootRef.current;
    const ownerWindow = element?.ownerDocument.defaultView;
    if (!element || !ownerWindow || device !== "mobile") {
      setLargePhone(false);
      return undefined;
    }
    const update = () => {
      const width = element.clientWidth;
      setLargePhone(width >= 600 && width < 768);
    };
    let measureTimer = 0;
    const scheduleUpdate = () => {
      if (measureTimer) return;
      measureTimer = window.setTimeout(() => {
        measureTimer = 0;
        update();
      }, 16);
    };
    scheduleUpdate();
    const observer = new ownerWindow.ResizeObserver(scheduleUpdate);
    observer.observe(element);
    return () => {
      if (measureTimer) window.clearTimeout(measureTimer);
      observer.disconnect();
    };
  }, [device, result]);
  const [desktopNarrowSplit, setNarrowSplit] = useState(false);
  // 24em 改上下排列只用于桌面内容端点。手机画布半栏永远窄于 24em，
  // 继续套这条规则会把作者预览的左右排列强行改回上下。
  const narrowSplit = device === "mobile" ? false : desktopNarrowSplit;
  const [copyOverflow, setCopyOverflow] = useState("");
  const [pairedImageCompressed, setPairedImageCompressed] = useState(false);
  const [textContrastNote, setTextContrastNote] = useState<"none" | "corrected" | "low" | "both">("none");
  useLayoutEffect(() => {
    const element = rootRef.current;
    const ownerWindow = element?.ownerDocument.defaultView;
    if (!element || !ownerWindow || !result.ok) {
      setNarrowSplit(false);
      setCopyOverflow("");
      setPairedImageCompressed(false);
      setTextContrastNote("none");
      return undefined;
    }
    const update = () => {
      if (!element.isConnected) return;
      const fontSize = Number.parseFloat(getComputedStyle(element).fontSize) || 16;
      const rows = [...element.querySelectorAll<HTMLElement>("[data-template-split-row='true']")];
      const stack = device !== "mobile" && rows.some((row) => {
        const columns = Number(row.getAttribute("data-template-split-columns")) || 2;
        const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
        const text = row.querySelector<HTMLElement>("[data-template-node-type*='Text'], [data-template-node-type*='Heading']");
        const rowFont = Number.parseFloat(getComputedStyle(text ?? element).fontSize) || fontSize;
        return splitCopyShouldStack({
          sectionRole,
          containerWidth: row.clientWidth,
          fontSizePx: rowFont,
          columns,
          gapPx: gap,
          layoutMode: row.getAttribute("data-template-layout") ?? "flow",
          copyColumnWidth: text?.clientWidth,
        });
      });
      setNarrowSplit((current) => current === stack ? current : stack);
      if (mode === "editor") {
        const corrected = Boolean(element.querySelector("[data-template-text-contrast='corrected']"));
        const low = Boolean(element.querySelector("[data-template-text-contrast='low']"));
        const nextContrast = corrected && low ? "both" as const : corrected ? "corrected" as const : low ? "low" as const : "none" as const;
        setTextContrastNote((current) => current === nextContrast ? current : nextContrast);
        const image = element.querySelector<HTMLElement>("[data-template-semantic-role='backgroundImage'], [data-template-semantic-role='heroImage']");
        const compressed = device === "mobile"
          && sectionRole === "page-hero"
          && Boolean(element.getAttribute("data-template-paired-canvas"))
          && element.clientHeight > 80
          && Boolean(image && image.clientHeight > 24 && image.clientHeight < element.clientHeight * 0.5);
        setPairedImageCompressed((current) => current === compressed ? current : compressed);
      } else {
        setTextContrastNote((current) => current === "none" ? current : "none");
        setPairedImageCompressed((current) => current ? false : current);
      }
      if (mode !== "editor" || stack) {
        setCopyOverflow((current) => current ? "" : current);
        return;
      }
      const rootBox = element.getBoundingClientRect();
      const names: string[] = [];
      for (const item of element.querySelectorAll<HTMLElement>("[data-template-slot-id]")) {
        if (names.length >= 4) break;
        if (item.closest("[data-template-artwork-copy], .hc-dynamic-template__artwork-copy")) continue;
        const box = item.getBoundingClientRect();
        const past = box.width > 1 && box.height > 1 && (
          box.right > rootBox.right + 8 || box.bottom > rootBox.bottom + 8
          || box.left < rootBox.left - 8 || box.top < rootBox.top - 8
        );
        const overflow = getComputedStyle(item).overflowY;
        const clipped = (overflow === "hidden" || overflow === "clip") && item.scrollHeight > item.clientHeight + 4;
        if (!past && !clipped) continue;
        const name = overflowObjectName(item);
        if (!names.includes(name)) names.push(name);
      }
      const deviceLabel = device === "mobile" ? "手机" : "桌面";
      const message = names.length > 0
        ? `${deviceLabel}画面上，${names.join("、")}超出画布。请缩短这些对象，或改排列后再看这一端。`
        : "";
      setCopyOverflow((current) => current === message ? current : message);
    };
    let measureTimer = 0;
    const scheduleUpdate = () => {
      if (measureTimer) return;
      measureTimer = window.setTimeout(() => {
        measureTimer = 0;
        update();
      }, 16);
    };
    scheduleUpdate();
    const observer = new ownerWindow.ResizeObserver(scheduleUpdate);
    observer.observe(element);
    return () => {
      if (measureTimer) window.clearTimeout(measureTimer);
      observer.disconnect();
    };
  }, [copySignature, device, inkSignature, mode, result, sectionRole]);
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
        if (hasTemplateImageContent(node.content, breakpoint ?? device)) return node.slotId;
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
  const artworkHref = imageCarriesCopy && mode !== "editor"
    ? findArtworkActionHref(result.plan.root, contentRenderMode !== "public")
    : undefined;
  const artworkImageSlotId = artworkHref
    ? findPrimaryImageSlotId(result.plan.root)
    : undefined;
  // 左右图文整节用对换比例，文字仍在图下，不把主图盖住文字。
  // 只有一张主图时，主图吃掉对换画布里文案下方的空白，手机槽位不再沿用桌面横图比例。
  const pairedCanvas = pairedCanvasRatio && isContentHeightSplitSection(definition) ? null : pairedCanvasRatio;
  // 图没有铺满时，不再把外壳锁成更高的对换画布，否则底色会在照片下面留出一整条。
  const lockSwappedCanvas = Boolean(pairedCanvasRatio) && (
    subtreeFillsPairedCanvas(result.plan.root, sectionRole)
    || isContentHeightSplitSection(definition)
  );
  const fillSplitRemainder = device === "mobile"
    && Boolean(pairedCanvasRatio)
    && isContentHeightSplitSection(definition)
    && countVisibleImages(result.plan.root) === 1
    && subtreeHasHeroImage(result.plan.root);
  // 旧画布没有 hero-media-frame。上一帧新画框留下的“文案在图下”不能带到这次提交，
  // 否则主图会先按自动高度塌成破图尺寸，轮询在布局效果清状态之前就读到了。
  const activeHeroCopyBelow = heroMediaFrame && heroCopyBelow;
  const activeHeroFrameCapped = heroMediaFrame && heroFrameCapped;
  return (
    <div
      ref={rootRef}
      className="hc-dynamic-template"
      data-dynamic-template-id={result.plan.templateId}
      data-dynamic-template-schema-version={result.plan.schemaVersion}
      data-dynamic-template-device={device}
      data-dynamic-template-mode={mode}
      data-template-surface={mode}
      data-dynamic-template-editor-surface={mode === "editor" ? editorSurface : undefined}
      data-template-composition-authority="template-definition-v2"
      data-template-root-node-id={result.plan.root.nodeId}
      data-template-root-height-mode={result.plan.root.rules.height.mode}
      data-template-root-height-ratio={result.plan.root.rules.height.mode === "aspect-ratio"
        && result.plan.root.rules.height.ratio
        ? `${result.plan.root.rules.height.ratio.width}:${result.plan.root.rules.height.ratio.height}`
        : undefined}
      data-template-paired-canvas={pairedCanvasRatio ? (definition.metadata.geometryPolicy === "paired-canvas" ? formatExactTemplateRatio : formatTemplateRatio)(pairedCanvasRatio.width, pairedCanvasRatio.height) : undefined}
      data-template-split-fill={fillSplitRemainder ? "true" : undefined}
      data-template-fixed-canvas={explicitCanvasRatio && (lockSwappedCanvas || !pairedCanvasRatio) ? "true" : undefined}
      data-template-fixed-canvas-overflow={fixedCanvasOverflow ? "true" : undefined}
      data-template-default-background-token={result.plan.metadata.defaultBackgroundToken}
      data-template-large-phone={largePhone ? "true" : undefined}
      data-template-narrow-split={narrowSplit ? "true" : undefined}
      data-template-hero-copy={activeHeroCopyBelow ? "below" : undefined}
      data-template-hero-viewport-cap={activeHeroFrameCapped ? "true" : undefined}
      data-image-carries-copy={imageCarriesCopy ? "true" : undefined}
      style={{
        background: result.plan.metadata.defaultBackgroundToken
          ? DYNAMIC_TEMPLATE_BACKGROUND_TOKENS[result.plan.metadata.defaultBackgroundToken]
          : undefined,
        ...(pairedCanvasRatio && lockSwappedCanvas ? {
          aspectRatio: `${pairedCanvasRatio.width} / ${pairedCanvasRatio.height}`,
          display: "flex",
          flexDirection: "column" as const,
          overflow: "hidden",
          position: "relative" as const,
          width: "100%",
        } : {}),
        ...(explicitCanvasRatio && (lockSwappedCanvas || !pairedCanvasRatio) ? {
          aspectRatio: `${explicitCanvasRatio.width} / ${explicitCanvasRatio.height}`,
          display: "block",
          position: "relative" as const,
          width: "100%",
          overflow: "visible",
        } : {}),
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
        imageCarriesCopy={imageCarriesCopy}
        artworkHref={artworkHref}
        artworkImageSlotId={artworkImageSlotId}
        device={device}
        layoutEditMode={allowsNodeInteraction && layoutEditMode}
        onLayoutOverrideCommit={allowsNodeInteraction ? onLayoutOverrideCommit : undefined}
        onTemplatePlacementCommit={allowsNodeInteraction ? onTemplatePlacementCommit : undefined}
        templateEditorSessionId={allowsNodeInteraction ? templateEditorSessionId : undefined}
        interactionOwner={interactionOwner}
        contentRenderMode={contentRenderMode}
        structureProtectedNodeIds={structureProtectedNodeIds}
        editableContractRoleIdsByNode={editableContractRoleIdsByNode}
        showEmptySlots={showEmptySlots ?? (mode === "editor" && editorSurface !== "page-instance")}
        showEmptyStructure={mode === "editor" && editorSurface === "template-definition"}
        sectionRole={sectionRole}
        pageHeroPlacement={pageHeroPlacement}
        heroCopyBelow={activeHeroCopyBelow}
        heroFrameCapped={activeHeroFrameCapped}
        stableMediaFrame={heroMediaFrame || reuseDesktopHero}
        inheritedCanvasColor={result.plan.metadata.defaultBackgroundToken
          ? DYNAMIC_TEMPLATE_BACKGROUND_TOKENS[result.plan.metadata.defaultBackgroundToken]
          : undefined}
        pairedCanvas={pairedCanvas}
        fillSplitRemainder={fillSplitRemainder}
        layoutDefinition={definition}
      />
      {fixedCanvasOverflow ? (
        <p role="status" data-template-fixed-canvas-note="true">
          {fixedCanvasOverflow}
        </p>
      ) : null}
      {narrowSplit ? (
        <style>
          {`[data-template-narrow-split="true"] [data-template-split-row="true"]{flex-direction:column !important;grid-template-columns:minmax(0,1fr) !important}[data-template-narrow-split="true"] [data-template-split-row="true"] > *{width:100% !important;max-width:100% !important;flex:1 1 auto !important;grid-column:auto !important}[data-template-narrow-split="true"] [data-template-split-row="true"][data-template-layout="free"]{display:flex !important;flex-direction:column !important;height:auto !important}[data-template-narrow-split="true"] [data-template-split-row="true"][data-template-layout="free"] > *{position:relative !important;inset:auto !important;width:100% !important;height:auto !important;transform:none !important}`}
        </style>
      ) : null}
      {copyOverflow ? (
        <p role="status" data-template-copy-overflow-note="true">
          {copyOverflow}
        </p>
      ) : null}
      {pairedImageCompressed ? (
        <p role="status" data-template-paired-image-note="true">
          文字变长后，图片区被挤小。这是旧的整节画布：缩短文字可恢复。新版本把画框固定、文字排在图下，需要选用该版本后才会变。当前画面保持原样。
        </p>
      ) : null}
      {textContrastNote === "corrected" || textContrastNote === "both" ? (
        <p role="status" data-template-text-contrast-note="corrected">
          深色底上的品牌墨色已改成浅色，方便阅读。
        </p>
      ) : null}
      {textContrastNote === "low" || textContrastNote === "both" ? (
        <p role="status" data-template-text-contrast-note="low">
          这段文字和底色对比不够。请改成可读的前景色。当前颜色保持原样。
        </p>
      ) : null}
    </div>
  );
}
