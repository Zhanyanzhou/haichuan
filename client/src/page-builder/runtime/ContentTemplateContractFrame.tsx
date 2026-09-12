import { Children, cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode, type Ref } from "react";
import {
  contentTemplateObjectHasCapability,
  findContentTemplateEditableObject,
  getContentTemplateContract,
  sanitizeContentTemplateLayoutData,
  type ContentTemplateContract,
  type ContentTemplateEditableConstraints,
  type ContentTemplateVisualRect,
} from "../generated/contentTemplates.generated";
import {
  ContentTemplateLayoutStyles,
  getContentTemplateLayout,
  templateLayoutVars,
} from "../layout/contentTemplateLayouts";
import { resolveVisualNode, setVisualOverridePath, toVisualOverridesV2 } from "./visualLayout";
import {
  CANVAS_SHARED_VISUAL_PREVIEW_MESSAGE,
  sendCanvasTemplateHistory,
  sendCanvasVisualEdit,
  useVisualEditorSession,
  type CanvasSharedVisualPreviewMessage,
  type VisualNodeKind,
} from "../visual-editor/visualEditorSession";
import { getTemplateContractNodeLabel } from "./contentTemplateRolePresentation";
import {
  editableTargetToVisualKind,
  getExplicitContractRolePresentation,
} from "../template-definition/editableTargets";
import {
  CONTENT_TEMPLATE_RENDER_SURFACE,
  useContentTemplateRenderSurface,
} from "./ContentTemplateRenderSurface";

interface ContentTemplateContractFrameProps {
  moduleType: string;
  mode: "editor" | "public";
  props?: Record<string, unknown>;
  children: ReactNode;
}

type ContentTemplateLayout = NonNullable<ReturnType<typeof getContentTemplateLayout>>;

type ContractFrameHandlers = Pick<HTMLAttributes<HTMLDivElement>,
  | "onPointerDownCapture"
  | "onClickCapture"
  | "onPointerMove"
  | "onPointerUp"
  | "onPointerCancel"
  | "onLostPointerCapture"
  | "onKeyDownCapture"
>;

interface ContractFrameEditorView {
  rootRef: Ref<HTMLDivElement>;
  blockId: string;
  editorMode: string;
  panelMode: string;
  viewport: "desktop" | "mobile";
  selectedNodeId?: string;
  snapActive: boolean;
  gesturePhase?: GesturePhase;
  mediaFocusEnabled: boolean;
  selectionCss?: string;
  liveMessage: string;
  handlers: ContractFrameHandlers;
}

type ContractFrameStyle = CSSProperties & Record<`--hc-contract-${string}`, string | number>;

const EDITOR_SURFACE_CSS = `
.hc-contract-frame { width: 100%; min-width: 0; position: relative; }
.hc-contract-frame--editor {
  --hc-contract-canvas: #FFFFFF;
  --hc-contract-surface: #F4F5F5;
  --hc-contract-surface-strong: #DDE1E2;
  --hc-contract-ink: #181A1B;
  --hc-contract-muted: #5F6568;
  --hc-contract-line: #DDE1E2;
  --hc-contract-accent: #181A1B;
  isolation: isolate;
}
.hc-contract-frame--editor[data-visual-panel-mode="design"] {
  background: transparent;
}
.hc-contract-frame--editor :is(
  [data-content-role],
  [data-content-role-desktop],
  [data-content-role-mobile],
  [data-editor-field],
  [data-content-role] *,
  [data-content-role-desktop] *,
  [data-content-role-mobile] *,
  [data-editor-field] *
) {
  pointer-events: auto !important;
}
.hc-contract-frame--editor :is(
  [data-content-role],
  [data-content-role-desktop],
  [data-content-role-mobile],
  [data-editor-field]
) {
  scroll-margin: 24px;
}
@media (max-width: 767px) {
  .hc-contract-frame--editor { overflow-x: clip; }
}
`;

type InstanceValue = Record<string, unknown>;

type MediaDragState = {
  pointerId: number;
  nodeId: string;
  viewport: "desktop" | "mobile";
  startClientX: number;
  startClientY: number;
  startFocusX: number;
  startFocusY: number;
  width: number;
  height: number;
  sourceWindow: Window;
  frameId?: number;
  pendingFocus?: { x: number; y: number };
};

type ResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

type GesturePhase = "idle" | "begin" | "update" | "commit" | "cancel";

type LayoutDragState = {
  pointerId: number;
  nodeId: string;
  viewport: "desktop" | "mobile";
  operation: "move" | "resize";
  resizeDirection?: ResizeDirection;
  startClientX: number;
  startClientY: number;
  startRect: { x: number; y: number; width: number; height: number };
  frameWidth: number;
  frameHeight: number;
  frameOffsetX: number;
  frameOffsetY: number;
  lockRatio: boolean;
  constraints: ContentTemplateEditableConstraints;
  bounds: ContentTemplateVisualRect;
  sourceWindow: Window;
  snapX: SnapCandidate[];
  snapY: SnapCandidate[];
  frameId?: number;
  pendingRect?: { x: number; y: number; width: number; height: number };
};

type SnapKind = "frame-edge" | "frame-center" | "node-edge" | "node-center";

type SnapCandidate = {
  value: number;
  kind: SnapKind;
};

type ActiveGuides = {
  x?: { position: number; kind: SnapKind };
  y?: { position: number; kind: SnapKind };
};

function getVisualNodeKind(
  contract: ContentTemplateContract | undefined,
  nodeId: string,
): VisualNodeKind | undefined {
  const presentation = getExplicitContractRolePresentation(contract, nodeId);
  return presentation ? editableTargetToVisualKind(presentation.kind) : undefined;
}

function supportsCapabilityOnViewport(
  object: ReturnType<typeof findContentTemplateEditableObject>,
  capability: Parameters<typeof contentTemplateObjectHasCapability>[1],
  viewport: "desktop" | "mobile",
) {
  if (!contentTemplateObjectHasCapability(object, capability)) return false;
  const allowedViewports = object?.capabilityViewports?.[capability];
  return !allowedViewports || allowedViewports.includes(viewport);
}

type GesturePreviewState = {
  overrides: InstanceValue | undefined;
  phase: "update" | "commit";
};

const SNAP_THRESHOLD_PX = 6;
const MIN_VISUAL_NODE_SIZE = 0.01;
function clampRect(
  rect: { x: number; y: number; width: number; height: number },
  constraints: ContentTemplateEditableConstraints,
  bounds: ContentTemplateVisualRect,
) {
  const minWidth = Math.max(MIN_VISUAL_NODE_SIZE, constraints.minSize.width);
  const minHeight = Math.max(MIN_VISUAL_NODE_SIZE, constraints.minSize.height);
  const width = Math.min(bounds.width, constraints.maxSize.width, Math.max(minWidth, rect.width));
  const height = Math.min(bounds.height, constraints.maxSize.height, Math.max(minHeight, rect.height));
  return {
    x: Math.min(bounds.x + bounds.width - width, Math.max(bounds.x, rect.x)),
    y: Math.min(bounds.y + bounds.height - height, Math.max(bounds.y, rect.y)),
    width,
    height,
  };
}

function interactionConstraints(
  constraints: ContentTemplateEditableConstraints,
  start: { width: number; height: number },
  touchesWidth: boolean,
  touchesHeight: boolean,
): ContentTemplateEditableConstraints {
  return {
    ...constraints,
    minSize: {
      width: touchesWidth
        ? constraints.minSize.width
        : Math.min(constraints.minSize.width, start.width),
      height: touchesHeight
        ? constraints.minSize.height
        : Math.min(constraints.minSize.height, start.height),
    },
    maxSize: {
      width: touchesWidth
        ? constraints.maxSize.width
        : Math.max(constraints.maxSize.width, start.width),
      height: touchesHeight
        ? constraints.maxSize.height
        : Math.max(constraints.maxSize.height, start.height),
    },
  };
}

function resizeRectFromHandle(
  start: { x: number; y: number; width: number; height: number },
  direction: ResizeDirection,
  dx: number,
  dy: number,
  lockRatio: boolean,
  constraints: ContentTemplateEditableConstraints,
  bounds: ContentTemplateVisualRect,
) {
  let left = start.x;
  let right = start.x + start.width;
  let top = start.y;
  let bottom = start.y + start.height;
  const changesLeft = direction.includes("w");
  const changesRight = direction.includes("e");
  const changesTop = direction.includes("n");
  const changesBottom = direction.includes("s");

  if (changesLeft) left += dx;
  if (changesRight) right += dx;
  if (changesTop) top += dy;
  if (changesBottom) bottom += dy;

  const minWidth = Math.max(MIN_VISUAL_NODE_SIZE, constraints.minSize.width);
  const minHeight = Math.max(MIN_VISUAL_NODE_SIZE, constraints.minSize.height);
  const boundRight = bounds.x + bounds.width;
  const boundBottom = bounds.y + bounds.height;
  left = Math.min(right - minWidth, Math.max(bounds.x, left));
  right = Math.max(left + minWidth, Math.min(boundRight, right));
  top = Math.min(bottom - minHeight, Math.max(bounds.y, top));
  bottom = Math.max(top + minHeight, Math.min(boundBottom, bottom));

  if (lockRatio && (changesLeft || changesRight) && (changesTop || changesBottom)) {
    const ratio = start.width / Math.max(MIN_VISUAL_NODE_SIZE, start.height);
    let width = right - left;
    let height = bottom - top;
    const widthDelta = Math.abs(width - start.width);
    const heightDeltaAsWidth = Math.abs(height - start.height) * ratio;
    if (widthDelta >= heightDeltaAsWidth) height = width / ratio;
    else width = height * ratio;

    const maxWidth = changesLeft ? right - bounds.x : boundRight - left;
    const maxHeight = changesTop ? bottom - bounds.y : boundBottom - top;
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    width *= scale;
    height *= scale;
    if (changesLeft) left = right - width;
    else right = left + width;
    if (changesTop) top = bottom - height;
    else bottom = top + height;
  }

  return clampRect({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }, constraints, bounds);
}

function nearestSnap(
  anchors: Array<{ value: number; offset: number }>,
  candidates: SnapCandidate[],
  threshold: number,
) {
  let match: { value: number; candidate: SnapCandidate; distance: number } | undefined;
  for (const anchor of anchors) {
    for (const candidate of candidates) {
      const distance = Math.abs(anchor.value - candidate.value);
      if (distance > threshold || (match && match.distance <= distance)) continue;
      match = {
        value: candidate.value - anchor.offset,
        candidate,
        distance,
      };
    }
  }
  return match;
}

function isRecord(value: unknown): value is InstanceValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isHtmlElement(value: unknown): value is HTMLElement {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as HTMLElement).closest === "function" &&
      typeof (value as HTMLElement).getBoundingClientRect === "function",
  );
}

function getVisualRoleIdForViewport(
  element: HTMLElement | null | undefined,
  viewport: "desktop" | "mobile",
) {
  if (!element) return undefined;
  return viewport === "mobile"
    ? element.dataset.contentRoleMobile ||
        element.dataset.contentRole ||
        element.dataset.contentRoleDesktop
    : element.dataset.contentRoleDesktop ||
        element.dataset.contentRole ||
        element.dataset.contentRoleMobile;
}

function findModuleFrameElement(element: HTMLElement, root: HTMLElement) {
  // 部分模板（轮播、热区）把可编辑媒体角色直接标在模块根 section 上。
  // 此时几何坐标必须相对合同 wrapper，而不能拿节点自身作参考，否则
  // `height = 自身高度 × 0.75` 会在 ResizeObserver 中反复收缩到零。
  if (element.parentElement === root) return root;
  let frameElement = element;
  while (frameElement.parentElement && frameElement.parentElement !== root) {
    frameElement = frameElement.parentElement;
  }
  return frameElement.parentElement === root ? frameElement : root;
}

function hasRepeatedPreviewCollectionRole(
  contract: ContentTemplateContract,
  viewport: "desktop" | "mobile",
) {
  const collectionRoles = new Set(
    contract.roles
      .filter((role) => role.kind === "collection" || role.kind === "business")
      .map((role) => role.id),
  );
  const roleCounts = new Map<string, number>();
  for (const zone of contract.defaultGeometryByViewport[viewport].zones) {
    if (!collectionRoles.has(zone.roleId)) continue;
    roleCounts.set(zone.roleId, (roleCounts.get(zone.roleId) ?? 0) + 1);
  }
  return [...roleCounts.values()].some((count) => count > 1);
}

function createContractFrameHeightSync(
  root: HTMLElement,
  contract: ContentTemplateContract,
) {
  let managed = false;
  let lastWidth = -1;
  let lastViewport: "desktop" | "mobile" | undefined;

  const clear = () => {
    if (!managed) return;
    root.style.removeProperty("height");
    root.style.removeProperty("min-height");
    managed = false;
    lastWidth = -1;
    lastViewport = undefined;
  };

  const sync = (viewport: "desktop" | "mobile") => {
    if (contract.heightModeByViewport[viewport] !== "content") {
      clear();
      return;
    }
    if (hasRepeatedPreviewCollectionRole(contract, viewport)) {
      // 重复集合已经由真实 Renderer 的文档流撑开，不需要 preview 画框提供基线。
      clear();
      return;
    }
    const width = root.clientWidth;
    const ratio = contract.defaultGeometryByViewport[viewport].frameAspectRatio;
    if (width <= 0 || !Number.isFinite(ratio) || ratio <= 0) return;
    if (lastViewport !== viewport || Math.abs(lastWidth - width) > 1) {
      root.style.removeProperty("height");
      root.style.removeProperty("min-height");
    }
    managed = true;
    lastWidth = width;
    lastViewport = viewport;
    const baselineHeight = Math.ceil(width / ratio);
    root.style.minHeight = `${baselineHeight}px`;
    // 唯一 zone 的绝对定位需要确定的 containing block。
    root.style.height = `${baselineHeight}px`;
  };

  return { clear, sync };
}

function visualNodeLayoutVar(
  nodeId: string,
  viewport: "desktop" | "mobile",
  axis: "left" | "top" | "width" | "height",
) {
  return `--hc-node-${nodeId}-${viewport}-${axis}`;
}

function allowed(value: unknown, values?: readonly string[]) {
  return typeof value === "string" && Boolean(values?.includes(value));
}

const SIZE_CSS: Record<string, string> = {
  small: "72%",
  standard: "88%",
  large: "100%",
};
const WIDTH_CSS: Record<string, string> = {
  narrow: "32rem",
  standard: "44rem",
  wide: "60rem",
};
const TEXT_SIZE_CSS: Record<string, string> = {
  small: "0.9em",
  standard: "1em",
  large: "1.12em",
};
const COLOR_CSS: Record<string, string> = {
  ink: "#181A1B",
  mineral: "#5f6568",
  ivory: "#ffffff",
};
const FRAME_CSS: Record<string, string> = {
  compact: "clamp(320px, 48vh, 560px)",
  standard: "clamp(460px, 66vh, 760px)",
  spacious: "clamp(560px, 76vh, 900px)",
  immersive: "clamp(640px, 90vh, 1080px)",
  tall: "clamp(620px, 82vh, 980px)",
  wide: "clamp(420px, 58vh, 680px)",
};

const EDITOR_FRAME_CSS: Record<string, string> = {
  compact: "clamp(320px, calc(var(--homepage-editor-viewport-height, 1200px) * .48), 560px)",
  standard: "clamp(460px, calc(var(--homepage-editor-viewport-height, 1200px) * .66), 760px)",
  spacious: "clamp(560px, calc(var(--homepage-editor-viewport-height, 1200px) * .76), 900px)",
  immersive: "clamp(640px, calc(var(--homepage-editor-viewport-height, 1200px) * .9), 1080px)",
  tall: "clamp(620px, calc(var(--homepage-editor-viewport-height, 1200px) * .82), 980px)",
  wide: "clamp(420px, calc(var(--homepage-editor-viewport-height, 1200px) * .58), 680px)",
};

function createInstanceCss(
  contract: ContentTemplateContract,
  overrides: Record<string, unknown> | undefined,
  props: Record<string, unknown>,
  scopeId: string,
  mode: "editor" | "preview" | "public",
) {
  if (!overrides) return "";
  const capabilities = contract.editorCapabilities.layoutOverrides ?? {};
  const root = `[data-hc-instance="${scopeId}"]`;
  const rules: string[] = [];
  if (contract.key === "hero") {
    const visibilityNodes = overrides.version === 2
      ? (isRecord(overrides.nodes) ? overrides.nodes : {})
      : (isRecord(overrides.textRoles) ? overrides.textRoles : {});
    const visibleCopyRoles = ["eyebrow", "title", "subtitle", "actionText"].some((roleId) => {
      const node = isRecord(visibilityNodes[roleId]) ? visibilityNodes[roleId] : {};
      if (node.enabled === false) return false;
      return mode === "editor" || (typeof props[roleId] === "string" && props[roleId].trim().length > 0);
    });
    if (!visibleCopyRoles) {
      rules.push(`${root} :is(.hc-phase1-hero__copy-band,.hc-phase1-hero__copy-shade){display:none!important}`);
    }
  }
  if (overrides.version === 2) {
    const frame = isRecord(overrides.frame) ? overrides.frame : {};
    const aspectRatios = isRecord(frame.aspectRatioByViewport)
      ? frame.aspectRatioByViewport
      : {};
    const legacyAspectRatio = Number(frame.aspectRatio);
    const desktopAspectRatio = Number(aspectRatios.desktop ?? legacyAspectRatio);
    const mobileAspectRatio = Number(aspectRatios.mobile ?? legacyAspectRatio);
    const hasDesktopAspectRatio = Number.isFinite(desktopAspectRatio)
      && desktopAspectRatio >= 0.25
      && desktopAspectRatio <= 4;
    const hasMobileAspectRatio = Number.isFinite(mobileAspectRatio)
      && mobileAspectRatio >= 0.25
      && mobileAspectRatio <= 4;
    const selectedHeight = allowed(frame.heightPreset, capabilities.framePresets)
      ? (mode === "editor" ? EDITOR_FRAME_CSS : FRAME_CSS)[String(frame.heightPreset)]
      : undefined;
    if (selectedHeight) {
      rules.push(`${root}{min-height:${selectedHeight}!important}`);
    } else {
      if (!hasDesktopAspectRatio && contract.heightModeByViewport.desktop === "viewport") {
        rules.push(`@media (min-width:768px){${root}{min-height:${mode === "editor" ? "calc(var(--homepage-editor-viewport-height, 1200px) * .75)" : "75vh"}}}`);
      }
      if (!hasMobileAspectRatio && contract.heightModeByViewport.mobile === "viewport") {
        rules.push(`@media (max-width:767px){${root}{min-height:${mode === "editor" ? "calc(var(--homepage-editor-viewport-height, 844px) * .75)" : "75vh"}}}`);
      }
    }
    const frameAspectRule = (ratio: number) => Number.isFinite(ratio) && ratio >= 0.25 && ratio <= 4
      ? `aspect-ratio:${ratio};position:relative;overflow:hidden`
      : "";
    const desktopFrameAspect = frameAspectRule(desktopAspectRatio);
    const mobileFrameAspect = frameAspectRule(mobileAspectRatio);
    const contractFrameSelector = `${root}>:where(section,div):not([data-content-role]):not([data-content-role-desktop]):not([data-content-role-mobile])`;
    rules.push(`${contractFrameSelector}{box-sizing:border-box!important;position:relative!important;width:100%!important;max-width:none!important;margin-inline:0!important}`);
    // 画布比例属于合同根框架。若把比例写在恰好也是可编辑槽位的根
    // section 上（轮播、热区），该槽位再按百分比绝对定位时会形成
    // “父高度依赖自身高度”的循环并收缩为 0。
    if (desktopFrameAspect) rules.push(`@media (min-width:768px){${root}{${desktopFrameAspect}}}`);
    if (mobileFrameAspect) rules.push(`@media (max-width:767px){${root}{${mobileFrameAspect}}}`);
    if (desktopFrameAspect || mobileFrameAspect) {
      rules.push(`${root}>:where(section,div):not([data-content-role]):not([data-content-role-desktop]):not([data-content-role-mobile]){height:100%!important;min-height:0!important;max-height:100%!important;overflow:hidden!important}`);
    }
    const contentFrameSelector = contractFrameSelector;
    if (contract.heightModeByViewport.desktop === "content") {
      rules.push(`@media (min-width:768px){${contentFrameSelector}{box-sizing:border-box!important;height:100%!important;min-height:0!important;max-height:none!important;position:relative!important}}`);
    }
    if (contract.heightModeByViewport.mobile === "content") {
      rules.push(`@media (max-width:767px){${contentFrameSelector}{box-sizing:border-box!important;height:100%!important;min-height:0!important;max-height:none!important;position:relative!important}}`);
    }
    const customColors = isRecord(frame.customColors) ? frame.customColors : {};
    const colorPresets: Record<string, { background: string; text: string; accent: string }> = {
      canvas: { background: "#FFFFFF", text: "#181A1B", accent: "#5F6568" },
      mist: { background: "#F7F8F8", text: "#181A1B", accent: "#5F6568" },
      inkSurface: { background: "#181A1B", text: "#FFFFFF", accent: "#DDE1E2" },
    };
    const colorPreset = typeof frame.colorPreset === "string"
      ? colorPresets[frame.colorPreset]
      : undefined;
    const allowedInstanceColors = new Set([
      "#181A1B", "#5F6568", "#DDE1E2", "#F7F8F8", "#FFFFFF",
      "#222222", "#66645F", "#E4E3DF", "#F8F7F4", "#FCFCFB",
    ]);
    const legacyColorMap: Record<string, string> = {
      "#222222": "#181A1B",
      "#66645F": "#5F6568",
      "#E4E3DF": "#DDE1E2",
      "#F8F7F4": "#F7F8F8",
      "#FCFCFB": "#FFFFFF",
    };
    const color = (value: unknown) => {
      if (typeof value !== "string") return undefined;
      const normalized = value.toUpperCase();
      if (!allowedInstanceColors.has(normalized)) return undefined;
      return legacyColorMap[normalized] ?? normalized;
    };
    const background = color(customColors.background) ?? colorPreset?.background;
    const text = color(customColors.text) ?? colorPreset?.text;
    const accent = color(customColors.accent) ?? colorPreset?.accent;
    if (background || text || accent) {
      rules.push(`${root}{${background ? `--hc-instance-background:${background};` : ""}${text ? `--hc-instance-text:${text};` : ""}${accent ? `--hc-instance-accent:${accent};` : ""}}`);
      if (background) rules.push(`${root}>:where(section,div){background:var(--hc-instance-background)!important}`);
      if (text) rules.push(`${root} :where(h1,h2,h3,h4,p,span,a){color:var(--hc-instance-text)}`);
    }
    if (contract.flow === "flow") {
      const paddingMap: Record<string, string> = {
        compact: "clamp(32px,4vw,56px)",
        standard: "clamp(56px,7vw,96px)",
        spacious: "clamp(88px,10vw,144px)",
      };
      const radiusMap: Record<string, string> = { square: "0", soft: "8px", rounded: "16px" };
      const shadowMap: Record<string, string> = {
        none: "none",
        soft: "0 10px 28px rgba(24,26,27,.08)",
        lifted: "0 20px 48px rgba(24,26,27,.14)",
      };
      const padding = typeof frame.paddingPreset === "string" ? paddingMap[frame.paddingPreset] : undefined;
      const radius = typeof frame.radiusPreset === "string" ? radiusMap[frame.radiusPreset] : undefined;
      const shadow = typeof frame.shadowPreset === "string" ? shadowMap[frame.shadowPreset] : undefined;
      if (padding || radius || shadow) {
        rules.push(`${root}{box-sizing:border-box!important;${padding ? `padding-block:${padding}!important;` : ""}${radius ? `border-radius:${radius}!important;overflow:clip;` : ""}${shadow ? `box-shadow:${shadow}!important;` : ""}}`);
      }
    }
    if (allowed(frame.compositionPreset, capabilities.compositionPresets)) {
      const composition = String(frame.compositionPreset);
      if (/^grid-[234]$/.test(composition)) {
        rules.push(`${root} [data-content-role="productCards"]{grid-template-columns:repeat(${composition.slice(-1)},minmax(0,1fr))!important}`);
      }
      if (composition === "image-left" || composition === "image-right") {
        const mediaOrder = composition === "image-left" ? 1 : 2;
        const copyOrder = composition === "image-left" ? 2 : 1;
        rules.push(`@media (min-width:768px){${root} .homepage-featured-product__grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;align-items:center}${root} .homepage-featured-product__media{order:${mediaOrder}}${root} .homepage-featured-product__copy{order:${copyOrder}}}`);
      }
      if (["main-led", "balanced", "detail-led"].includes(composition)) {
        const spans = composition === "main-led"
          ? { main: 8, sideStart: 9, side: 4 }
          : composition === "detail-led"
            ? { main: 5, sideStart: 6, side: 7 }
            : { main: 6, sideStart: 7, side: 6 };
        rules.push(`@media (min-width:768px){${root} .hc-phase1-double__main{grid-column:1/span ${spans.main}!important}${root} :where(.hc-phase1-double__detail,.hc-phase1-double__copy,.hc-phase1-double__action){grid-column:${spans.sideStart}/span ${spans.side}!important}}`);
      }
    }
    const nodes = isRecord(overrides.nodes) ? overrides.nodes : {};
    for (const [nodeId, rawNode] of Object.entries(nodes)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(nodeId) || !isRecord(rawNode)) continue;
      const contractRole = contract.roles.find((role) => role.id === nodeId);
      const slotCapability = capabilities.slots?.find((slot) => slot.roleId === nodeId);
      const textCapability = capabilities.textRoles?.find((role) => role.roleId === nodeId);
      const editableObject = findContentTemplateEditableObject(contract, nodeId);
      const hasCapability = (capability: Parameters<typeof contentTemplateObjectHasCapability>[1]) =>
        contentTemplateObjectHasCapability(editableObject, capability);
      const hasCapabilityOnViewport = (
        capability: Parameters<typeof contentTemplateObjectHasCapability>[1],
        viewport: "desktop" | "mobile",
      ) => supportsCapabilityOnViewport(editableObject, capability, viewport);
      const layoutSelector = `${root} :is([data-content-role="${nodeId}"],[data-content-role-desktop="${nodeId}"],[data-content-role-mobile="${nodeId}"])`;
      const selector = slotCapability
        ? layoutSelector
        : `${root} :is([data-content-role="${nodeId}"],[data-content-role-desktop="${nodeId}"],[data-content-role-mobile="${nodeId}"],[data-editor-field~="${nodeId}"])`;
      // copy 等文字角色在部分 Renderer 中也是行动按钮的布局父容器。
      // “隐藏内容文字”应只隐藏合同声明的文字字段，不能连带吞掉独立 CTA。
      const contentFieldKeys = editableObject?.contentFieldKeys ?? [];
      const visibilitySelector = editableObject?.kind === "text" && contentFieldKeys.length > 0
        ? `${root} :is(${contentFieldKeys
            .map((field) => `[data-editor-field~="${field}"]`)
            .join(",")})`
        : selector;
      if (rawNode.enabled === false && hasCapability("visibility")) {
        rules.push(`${visibilitySelector}{display:none!important}`);
      }
      const rectByViewport = isRecord(rawNode.rectByViewport) ? rawNode.rectByViewport : {};
      const layoutRects = rectByViewport;
      const zIndexByViewport = isRecord(rawNode.zIndexByViewport)
        ? rawNode.zIndexByViewport
        : {};
      const safeZIndex = (value: unknown) => {
        const numeric = Number(value);
        return Number.isInteger(numeric) && numeric >= 0 && numeric <= 20
          ? numeric
          : undefined;
      };
      const desktopZIndex = (contractRole || hasCapabilityOnViewport("layer", "desktop"))
        ? safeZIndex(zIndexByViewport.desktop)
        : undefined;
      const mobileZIndex = (contractRole || hasCapabilityOnViewport("layer", "mobile"))
        ? safeZIndex(zIndexByViewport.mobile)
        : undefined;
      const rectRule = (
        rawRect: unknown,
        zIndex: number | undefined,
        viewport: "desktop" | "mobile",
      ) => {
        if (!isRecord(rawRect)) return "";
        const x = Number(rawRect.x);
        const y = Number(rawRect.y);
        const width = Number(rawRect.width);
        const height = Number(rawRect.height);
        if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.0001 || y + height > 1.0001) return "";
        return `position:absolute!important;box-sizing:border-box!important;left:var(${visualNodeLayoutVar(nodeId, viewport, "left")},${x * 100}%)!important;top:var(${visualNodeLayoutVar(nodeId, viewport, "top")},${y * 100}%)!important;width:var(${visualNodeLayoutVar(nodeId, viewport, "width")},${width * 100}%)!important;height:var(${visualNodeLayoutVar(nodeId, viewport, "height")},${height * 100}%)!important;margin:0!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;transform:none!important;overflow:hidden!important;z-index:${zIndex ?? 2}!important`;
      };
      const desktopRect = (contractRole || hasCapabilityOnViewport("layout", "desktop"))
        ? rectRule(layoutRects.desktop, desktopZIndex, "desktop")
        : "";
      const mobileRect = (contractRole || hasCapabilityOnViewport("layout", "mobile"))
        ? rectRule(layoutRects.mobile, mobileZIndex, "mobile")
        : "";
      if (desktopRect || mobileRect) rules.push(`${root}>:where(section,div){position:relative}`);
      if (desktopRect) rules.push(`@media (min-width:768px){${layoutSelector}{${desktopRect}}}`);
      if (mobileRect) rules.push(`@media (max-width:767px){${layoutSelector}{${mobileRect}}}`);
      if (!desktopRect && desktopZIndex !== undefined) {
        rules.push(`@media (min-width:768px){${layoutSelector}{position:relative;z-index:${desktopZIndex}!important}}`);
      }
      if (!mobileRect && mobileZIndex !== undefined) {
        rules.push(`@media (max-width:767px){${layoutSelector}{position:relative;z-index:${mobileZIndex}!important}}`);
      }
      if (!editableObject || (!slotCapability && !textCapability)) continue;
      const ratio = Number(rawNode.ratio);
      if (hasCapability("ratio") && Number.isFinite(ratio) && ratio >= 0.25 && ratio <= 4) {
        rules.push(`${selector}{aspect-ratio:${ratio};overflow:hidden}`);
      }
      const slotDeclarations: string[] = [];
      if (slotCapability && hasCapability("size") && allowed(rawNode.sizePreset, slotCapability.sizePresets)) {
        slotDeclarations.push(`width:${SIZE_CSS[String(rawNode.sizePreset)] ?? "100%"}`);
      }
      if (slotCapability && hasCapability("position") && allowed(rawNode.positionPreset, slotCapability.positionPresets)) {
        const position = String(rawNode.positionPreset);
        slotDeclarations.push(`justify-self:${position === "center" ? "center" : position === "end" ? "end" : "start"}`);
        slotDeclarations.push(`margin-inline:${position === "center" ? "auto" : position === "end" ? "auto 0" : "0 auto"}`);
      }
      if (slotDeclarations.length) rules.push(`${selector}{${slotDeclarations.join(";")}}`);
      const appearance = isRecord(rawNode.appearance) ? rawNode.appearance : {};
      if (["media", "video", "product", "collection"].includes(editableObject.kind)) {
        const radiusMap: Record<string, string> = { square: "0", soft: "8px", rounded: "16px" };
        const shadowMap: Record<string, string> = {
          none: "none",
          soft: "0 8px 22px rgba(24,26,27,.1)",
          lifted: "0 16px 36px rgba(24,26,27,.16)",
        };
        const radius = typeof appearance.radiusPreset === "string"
          ? radiusMap[appearance.radiusPreset]
          : undefined;
        const shadow = typeof appearance.shadowPreset === "string"
          ? shadowMap[appearance.shadowPreset]
          : undefined;
        const appearanceSelector = editableObject.kind === "collection"
          ? `${selector}>*`
          : selector;
        if (radius || shadow) {
          rules.push(`${appearanceSelector}{${radius ? `border-radius:${radius}!important;overflow:hidden;` : ""}${shadow ? `box-shadow:${shadow}!important;` : ""}}`);
        }
      }
      const mediaView = isRecord(rawNode.mediaView) ? rawNode.mediaView : {};
      const mediaDeclarations: string[] = [];
      if (hasCapability("fit") && (mediaView.fit === "cover" || mediaView.fit === "contain")) mediaDeclarations.push(`object-fit:${mediaView.fit}!important`);
      const zoom = Number(mediaView.zoom);
      if (hasCapability("zoom") && Number.isFinite(zoom) && zoom >= 1 && zoom <= 3) mediaDeclarations.push(`transform:scale(${zoom});transform-origin:center`);
      if (mediaDeclarations.length) rules.push(`${selector} :where(img,video){${mediaDeclarations.join(";")}}`);
      const focusByViewport = isRecord(mediaView.focusByViewport) ? mediaView.focusByViewport : {};
      const focusRule = (rawFocus: unknown) => {
        if (!isRecord(rawFocus)) return "";
        const x = Number(rawFocus.x);
        const y = Number(rawFocus.y);
        return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100
          ? `object-position:${x}% ${y}%!important`
          : "";
      };
      const desktopFocus = hasCapability("focus") ? focusRule(focusByViewport.desktop) : "";
      const mobileFocus = hasCapability("focus") ? focusRule(focusByViewport.mobile) : "";
      if (desktopFocus) rules.push(`@media (min-width:768px){${selector} :where(img,video){${desktopFocus}}}`);
      if (mobileFocus) rules.push(`@media (max-width:767px){${selector} :where(img,video){${mobileFocus}}}`);
      const typography = isRecord(rawNode.typography) ? rawNode.typography : {};
      const typeDeclarations: string[] = [];
      // 后代规则：子元素常带内联 color/font-size 或模板自有 line-height，
      // 容器声明到不了它们；必须以后代选择器 + !important 直写到文本元素。
      const descendantDeclarations: string[] = [];
      const sizeMap: Record<string, string> = { xs: ".78em", sm: ".9em", md: "1em", lg: "1.18em", xl: "1.38em" };
      // 字号只落到块级文本元素（em 相对容器），不含 span，避免嵌套 span 复合缩小
      if (hasCapability("typography") && typeof typography.sizeLevel === "string" && sizeMap[typography.sizeLevel]) {
        rules.push(`${selector} :where(h1,h2,h3,h4,p){font-size:${sizeMap[typography.sizeLevel]}!important}`);
      }
      if (hasCapability("typography") && ["left", "center", "right"].includes(String(typography.align))) typeDeclarations.push(`text-align:${typography.align}`);
      const typeColor = color(typography.color);
      if (hasCapability("typography") && typeColor) {
        typeDeclarations.push(`color:${typeColor}!important`);
        descendantDeclarations.push(`color:${typeColor}!important`);
      }
      const lineHeight = Number(typography.lineHeight);
      if (hasCapability("typography") && Number.isFinite(lineHeight) && lineHeight >= 1 && lineHeight <= 2.5) descendantDeclarations.push(`line-height:${lineHeight}!important`);
      const letterSpacing = Number(typography.letterSpacing);
      if (hasCapability("typography") && Number.isFinite(letterSpacing) && letterSpacing >= -0.05 && letterSpacing <= 0.5) descendantDeclarations.push(`letter-spacing:${letterSpacing}em!important`);
      if (hasCapability("typography") && (typography.safeBand === "light" || typography.safeBand === "dark")) {
        typeDeclarations.push(`background:${typography.safeBand === "light" ? "#ffffff" : "#181A1B"}!important`);
        typeDeclarations.push(`color:${typography.safeBand === "light" ? "#181A1B" : "#ffffff"}!important`);
        typeDeclarations.push("padding:clamp(12px,2vw,28px)");
      }
      if (typeDeclarations.length) rules.push(`${selector}{${typeDeclarations.join(";")}}`);
      if (descendantDeclarations.length) rules.push(`${selector} :where(h1,h2,h3,h4,p,span){${descendantDeclarations.join(";")}}`);
      const maxLines = Number(typography.maxLines);
      if (hasCapability("typography") && Number.isInteger(maxLines) && maxLines >= 1 && maxLines <= 12) {
        rules.push(`${selector}{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${maxLines};overflow:hidden;overflow-wrap:anywhere}`);
      }
    }
    return rules.join("\n");
  }
  if (overrides.version !== 1) return "";
  const layout = isRecord(overrides.layout) ? overrides.layout : {};
  if (
    allowed(layout.framePreset, capabilities.framePresets) &&
    FRAME_CSS[String(layout.framePreset)]
  ) {
    rules.push(`${root} > :where(section, div) { min-height: ${FRAME_CSS[String(layout.framePreset)]} !important; }`);
  }
  if (allowed(layout.compositionPreset, capabilities.compositionPresets)) {
    const composition = String(layout.compositionPreset);
    if (/^grid-[234]$/.test(composition)) {
      rules.push(
        `${root} [data-content-role="productCards"]{grid-template-columns:repeat(${composition.slice(-1)},minmax(0,1fr))!important}`,
      );
    }
    if (composition === "image-left" || composition === "image-right") {
      const mediaOrder = composition === "image-left" ? 1 : 2;
      const copyOrder = composition === "image-left" ? 2 : 1;
      rules.push(
        `@media (min-width:768px){${root} .homepage-featured-product__grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;align-items:center}${root} .homepage-featured-product__media{order:${mediaOrder}}${root} .homepage-featured-product__copy{order:${copyOrder}}}`,
      );
    }
    if (["main-led", "balanced", "detail-led"].includes(composition)) {
      const spans =
        composition === "main-led"
          ? { main: 8, sideStart: 9, side: 4 }
          : composition === "detail-led"
            ? { main: 5, sideStart: 6, side: 7 }
            : { main: 6, sideStart: 7, side: 6 };
      rules.push(
        `@media (min-width:768px){${root} .hc-phase1-double__main{grid-column:1/span ${spans.main}!important}${root} :where(.hc-phase1-double__detail,.hc-phase1-double__copy,.hc-phase1-double__action){grid-column:${spans.sideStart}/span ${spans.side}!important}}`,
      );
    }
  }

  const slots = isRecord(overrides.slots) ? overrides.slots : {};
  for (const capability of capabilities.slots ?? []) {
    const rawValue = slots[capability.roleId];
    const value: InstanceValue | undefined = isRecord(rawValue)
      ? rawValue
      : undefined;
    if (!value) continue;
    const selector = `${root} :is([data-content-role="${capability.roleId}"],[data-content-role-desktop="${capability.roleId}"],[data-content-role-mobile="${capability.roleId}"])`;
    const declarations: string[] = [];
    if (allowed(value.ratioPreset, capability.ratioPresets)) {
      declarations.push(`aspect-ratio:${String(value.ratioPreset)}`);
      declarations.push("overflow:hidden");
    }
    if (allowed(value.sizePreset, capability.sizePresets)) {
      declarations.push(`width:${SIZE_CSS[String(value.sizePreset)] ?? "100%"}`);
    }
    if (allowed(value.positionPreset, capability.positionPresets)) {
      const position = String(value.positionPreset);
      declarations.push(`margin-inline:${position === "center" ? "auto" : position === "end" ? "auto 0" : "0 auto"}`);
    }
    if (declarations.length) rules.push(`${selector}{${declarations.join(";")}}`);
    const mediaDeclarations: string[] = [];
    if (allowed(value.fit, capability.fit)) {
      mediaDeclarations.push(`object-fit:${String(value.fit)}!important`);
    }
    const zoom = Number(value.zoom);
    if (
      capability.zoom &&
      Number.isFinite(zoom) &&
      zoom >= capability.zoom.min &&
      zoom <= capability.zoom.max
    ) {
      mediaDeclarations.push(`transform:scale(${zoom})`);
      mediaDeclarations.push("transform-origin:center");
    }
    const focusByViewport = isRecord(value.focusByViewport) ? value.focusByViewport : undefined;
    const desktopFocus = isRecord(focusByViewport?.desktop) ? focusByViewport.desktop : undefined;
    const mobileFocus = isRecord(focusByViewport?.mobile) ? focusByViewport.mobile : desktopFocus;
    const focusRule = (focus: InstanceValue | undefined) => {
      const x = Number(focus?.x);
      const y = Number(focus?.y);
      return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100
        ? `object-position:${x}% ${y}%!important`
        : "";
    };
    const desktopFocusRule = focusRule(desktopFocus);
    const mobileFocusRule = focusRule(mobileFocus);
    if (mediaDeclarations.length) {
      rules.push(`${selector} :where(img,video){${mediaDeclarations.join(";")}}`);
    }
    if (desktopFocusRule) rules.push(`@media (min-width:768px){${selector} :where(img,video){${desktopFocusRule}}}`);
    if (mobileFocusRule) rules.push(`@media (max-width:767px){${selector} :where(img,video){${mobileFocusRule}}}`);
  }

  const textRoles = isRecord(overrides.textRoles) ? overrides.textRoles : {};
  for (const capability of capabilities.textRoles ?? []) {
    const rawValue = textRoles[capability.roleId];
    const value: InstanceValue | undefined = isRecord(rawValue)
      ? rawValue
      : undefined;
    if (!value || value.enabled !== true) continue;
    const selector = `${root} [data-content-role="${capability.roleId}"]`;
    const declarations: string[] = [];
    if (allowed(value.widthPreset, capability.widthPresets)) {
      declarations.push(`max-width:${WIDTH_CSS[String(value.widthPreset)] ?? "44rem"}`);
    }
    if (allowed(value.sizePreset, capability.sizePresets)) {
      declarations.push(`font-size:${TEXT_SIZE_CSS[String(value.sizePreset)] ?? "1em"}`);
    }
    if (allowed(value.align, capability.align)) {
      declarations.push(`text-align:${String(value.align)}`);
    }
    if (allowed(value.colorToken, capability.colorTokens)) {
      declarations.push(`color:${COLOR_CSS[String(value.colorToken)] ?? "inherit"}`);
    }
    if (value.safeBand === "light" || value.safeBand === "dark") {
      declarations.push(`background:${value.safeBand === "light" ? "#ffffff" : "#181A1B"}`);
      declarations.push(`color:${value.safeBand === "light" ? "#181A1B" : "#ffffff"}`);
      declarations.push("padding:clamp(16px,2.5vw,32px)");
    }
    if (allowed(value.placementPreset, capability.placementPresets)) {
      const placement = String(value.placementPreset);
      if (["left", "center", "right"].includes(placement)) {
        declarations.push(`margin-inline:${placement === "center" ? "auto" : placement === "right" ? "auto 0" : "0 auto"}`);
      }
    }
    if (declarations.length) rules.push(`${selector}{${declarations.join(";")}}`);
    if (capability.maxLines) {
      rules.push(`${selector} :where(h1,h2,h3,p){display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${capability.maxLines};overflow:hidden;overflow-wrap:anywhere}`);
    }
  }
  return rules.join("\n");
}

function mergeInstanceValue(
  base: InstanceValue,
  override: InstanceValue,
): InstanceValue {
  const result: InstanceValue = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isRecord(value) && isRecord(base[key])) {
      result[key] = mergeInstanceValue(base[key] as InstanceValue, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function createDefaultGeometryOverrides(contract: ContentTemplateContract): InstanceValue {
  const nodes: InstanceValue = {};
  for (const role of contract.roles) {
    const rectByViewport: InstanceValue = {};
    const zIndexByViewport: InstanceValue = {};
    for (const viewport of ["desktop", "mobile"] as const) {
      // 一旦同一角色由多个 preview zone 表达，该视口就是集合式自然流。
      // 不混用“标题绝对定位 + 集合自然流”，否则集合会从标题下方失去占位。
      if (hasRepeatedPreviewCollectionRole(contract, viewport)) continue;
      const matchingZones = contract.defaultGeometryByViewport[viewport].zones
        .filter((candidate) => candidate.roleId === role.id);
      // 重复 zone 表示集合里的多张预览卡片，不是集合容器自身的绝对定位框。
      // 只有角色与单一 zone 一一对应时，才把合同默认几何下沉为实例 rect。
      if (matchingZones.length !== 1) continue;
      const [matchingZone] = matchingZones;
      rectByViewport[viewport] = matchingZone.rect;
      zIndexByViewport[viewport] = matchingZone.overlay ? 4 : 2;
    }
    if (Object.keys(rectByViewport).length > 0) {
      nodes[role.id] = { rectByViewport, zIndexByViewport };
    }
  }
  const aspectRatioByViewport: InstanceValue = {};
  for (const viewport of ["desktop", "mobile"] as const) {
    if (contract.heightModeByViewport[viewport] === "ratio") {
      aspectRatioByViewport[viewport] = contract.defaultGeometryByViewport[viewport].frameAspectRatio;
    }
  }
  return {
    version: 2,
    frame: {
      aspectRatioByViewport,
    },
    nodes,
  };
}

function resolveEffectiveInstanceOverrides(
  contract: ContentTemplateContract,
  props: Record<string, unknown> | undefined,
) {
  const explicit: InstanceValue = resolveInstanceOverrides(contract, props) ?? {};
  const merged = mergeInstanceValue(createDefaultGeometryOverrides(contract), explicit);
  const raw = isRecord(props?.__instanceOverrides) && props.__instanceOverrides.version === 2
    ? props.__instanceOverrides
    : undefined;
  if (!raw) return merged;

  // 显式传入但被合同清洗拒绝的设备值必须保持 fail-closed；否则默认几何
  // 会在清洗之后悄悄把非法值“复活”为一个看似有效的定位。
  const rawNodes = isRecord(raw.nodes) ? raw.nodes : {};
  const explicitNodes = isRecord(explicit.nodes) ? explicit.nodes : {};
  const mergedNodes = isRecord(merged.nodes) ? merged.nodes : {};
  for (const [nodeId, rawNodeValue] of Object.entries(rawNodes)) {
    if (!isRecord(rawNodeValue)) continue;
    const explicitNode = isRecord(explicitNodes[nodeId]) ? explicitNodes[nodeId] : {};
    const mergedNode = isRecord(mergedNodes[nodeId]) ? mergedNodes[nodeId] : undefined;
    if (!mergedNode) continue;
    for (const field of ["rectByViewport", "zIndexByViewport"] as const) {
      const rawByViewport = isRecord(rawNodeValue[field]) ? rawNodeValue[field] : undefined;
      if (!rawByViewport) continue;
      const explicitByViewport = isRecord(explicitNode[field]) ? explicitNode[field] : {};
      const mergedByViewport = isRecord(mergedNode[field]) ? mergedNode[field] : undefined;
      if (!mergedByViewport) continue;
      for (const viewport of ["desktop", "mobile"] as const) {
        const wasSupplied = Object.prototype.hasOwnProperty.call(rawByViewport, viewport);
        const wasAccepted = Object.prototype.hasOwnProperty.call(explicitByViewport, viewport);
        if (wasSupplied && !wasAccepted) {
          delete mergedByViewport[viewport];
          if (field === "rectByViewport") {
            const mergedLayers = isRecord(mergedNode.zIndexByViewport)
              ? mergedNode.zIndexByViewport
              : undefined;
            if (mergedLayers) delete mergedLayers[viewport];
          }
        }
      }
    }
  }
  const rawFrame = isRecord(raw.frame) ? raw.frame : {};
  const rawRatios = isRecord(rawFrame.aspectRatioByViewport) ? rawFrame.aspectRatioByViewport : undefined;
  const explicitFrame = isRecord(explicit.frame) ? explicit.frame : {};
  const explicitRatios = isRecord(explicitFrame.aspectRatioByViewport) ? explicitFrame.aspectRatioByViewport : {};
  const mergedFrame = isRecord(merged.frame) ? merged.frame : {};
  const mergedRatios = isRecord(mergedFrame.aspectRatioByViewport) ? mergedFrame.aspectRatioByViewport : undefined;
  if (rawRatios && mergedRatios) {
    for (const viewport of ["desktop", "mobile"] as const) {
      const wasSupplied = Object.prototype.hasOwnProperty.call(rawRatios, viewport);
      const wasAccepted = Object.prototype.hasOwnProperty.call(explicitRatios, viewport);
      if (wasSupplied && !wasAccepted) delete mergedRatios[viewport];
    }
  }
  return merged;
}

function resolveInstanceOverrides(
  contract: ContentTemplateContract,
  props: Record<string, unknown> | undefined,
) {
  const source = isRecord(props?.__instanceOverrides)
    ? props.__instanceOverrides
    : undefined;
  const normalizedSource = source?.version === 1
    ? toVisualOverridesV2(source)
    : source;
  const sanitized = normalizedSource?.version === 2
    ? sanitizeContentTemplateLayoutData(contract.moduleType, normalizedSource)
    : undefined;
  return isRecord(sanitized) ? sanitized : undefined;
}

function resolveContractVisualNode(
  contract: ContentTemplateContract,
  props: Record<string, unknown> | undefined,
  nodeId: string,
  viewport: "desktop" | "mobile",
) {
  const explicitOverrides = resolveInstanceOverrides(contract, props);
  return resolveVisualNode(
    {
      ...(props ?? {}),
      __instanceOverrides: mergeInstanceValue(
        createDefaultGeometryOverrides(contract),
        isRecord(explicitOverrides) ? explicitOverrides : {},
      ),
    },
    nodeId,
    viewport,
  );
}

function resolveExplicitVisualNode(
  contract: ContentTemplateContract,
  props: Record<string, unknown> | undefined,
  nodeId: string,
  viewport: "desktop" | "mobile",
) {
  return resolveVisualNode(
    {
      ...(props ?? {}),
      __instanceOverrides: resolveInstanceOverrides(contract, props),
    },
    nodeId,
    viewport,
  );
}

interface ContentTemplateFrameViewProps extends ContentTemplateContractFrameProps {
  contract: ContentTemplateContract;
  layout: ContentTemplateLayout;
  scopeId: string;
  instanceCss: string;
  instanceLayout: InstanceValue;
  instanceFrame: InstanceValue;
  childEditMode?: boolean;
  ensureContractActions?: boolean;
  rootRef?: Ref<HTMLDivElement>;
  editor?: ContractFrameEditorView;
}

/**
 * 公开、目录预览与模板编辑共用的纯渲染壳。编辑会话订阅、手势状态和
 * 全局监听器只由上层的编辑边界提供，本层只把已经解析好的状态映射到 DOM。
 */
function ContentTemplateFrameView({
  moduleType,
  mode,
  props,
  children,
  contract,
  layout,
  scopeId,
  instanceCss,
  instanceLayout,
  instanceFrame,
  childEditMode,
  ensureContractActions,
  rootRef,
  editor,
}: ContentTemplateFrameViewProps) {
  const style: ContractFrameStyle = {
    ...templateLayoutVars(layout),
    width: "100%",
    minWidth: 0,
    position: "relative",
    boxSizing: "border-box",
    "--hc-contract-container":
      layout.width === "full" ? "100%" : layout.width === "wide" ? "1520px" : layout.width === "editorial" ? "1040px" : "1280px",
  };
  const renderContractChild = (node: ReactNode): ReactNode => {
    if (!isValidElement(node)) return node;
    const child = node as ReactElement<{
      children?: ReactNode;
      editMode?: boolean;
      module?: Record<string, unknown>;
    }>;
    const childProps: {
      children?: ReactNode;
      editMode?: boolean;
      module?: Record<string, unknown>;
    } = {};
    const flatProps = child.props as Record<string, unknown>;
    if (childEditMode !== undefined && (child.props.module || "editMode" in flatProps)) {
      childProps.editMode = childEditMode;
    }
    if (child.props.children !== undefined) {
      childProps.children = Children.map(child.props.children, renderContractChild);
    }
    if (ensureContractActions && (
      contract.order.desktop.includes("action") || contract.order.mobile.includes("action")
    )) {
      const module = isRecord(child.props.module) ? child.props.module : undefined;
      const content = isRecord(module?.content) ? module.content : undefined;
      if (module && content) {
        const hasTarget = [content.linkUrl, content.productId, content.productCode, content.categorySlug]
          .some((value) => typeof value === "string" && value.trim().length > 0);
        childProps.module = {
          ...module,
          content: {
            ...content,
            ...(hasTarget ? {} : { targetType: "link", linkUrl: "/contact" }),
            ...("buttonText" in content
              ? { buttonText: typeof content.buttonText === "string" && content.buttonText.trim() ? content.buttonText : "查看详情" }
              : { actionText: typeof content.actionText === "string" && content.actionText.trim() ? content.actionText : "查看详情" }),
          },
        };
      } else if ("buttonText" in flatProps || "actionText" in flatProps || "targetType" in flatProps) {
        Object.assign(childProps as Record<string, unknown>, {
          targetType: "link",
          linkUrl: "/contact",
          ...("buttonText" in flatProps
            ? { buttonText: typeof flatProps.buttonText === "string" && flatProps.buttonText.trim() ? flatProps.buttonText : "查看详情" }
            : { actionText: typeof flatProps.actionText === "string" && flatProps.actionText.trim() ? flatProps.actionText : "查看详情" }),
        });
      }
    }
    return cloneElement(child, childProps);
  };
  const renderedChild = renderContractChild(children);

  return (
    <div
      ref={rootRef ?? editor?.rootRef}
      className={`hc-contract-frame hc-contract-frame--${mode}`}
      style={style}
      data-content-template-contract={contract.key}
      data-content-template-module={moduleType}
      data-content-template-renderer="real"
      data-editor-block-id={editor?.blockId}
      data-contract-tone={contract.preview.desktop.tone}
      data-contract-visual-role={contract.visualRole}
      data-contract-height-desktop={contract.heightModeByViewport.desktop}
      data-contract-height-mobile={contract.heightModeByViewport.mobile}
      data-contract-order-desktop={contract.order.desktop.join(",")}
      data-contract-order-mobile={contract.order.mobile.join(",")}
      data-contract-role-count={contract.roles.length}
      data-hc-instance={scopeId}
      data-instance-frame={typeof instanceFrame.heightPreset === "string"
        ? instanceFrame.heightPreset
        : typeof instanceLayout.framePreset === "string"
          ? instanceLayout.framePreset
          : undefined}
      data-instance-composition={typeof instanceFrame.compositionPreset === "string"
        ? instanceFrame.compositionPreset
        : typeof instanceLayout.compositionPreset === "string"
          ? instanceLayout.compositionPreset
          : undefined}
      data-visual-editor-mode={editor?.editorMode}
      data-visual-panel-mode={editor?.panelMode}
      data-visual-editor-viewport={editor?.viewport}
      data-visual-selected-node={editor?.selectedNodeId}
      data-hc-snap-active={editor?.snapActive ? "true" : undefined}
      data-hc-gesture-phase={editor?.gesturePhase}
      data-hc-media-focus-enabled={editor?.mediaFocusEnabled ? "true" : undefined}
      {...editor?.handlers}
    >
      <ContentTemplateLayoutStyles />
      {editor ? <style data-hc-contract-editor-surface="true">{EDITOR_SURFACE_CSS}</style> : null}
      {instanceCss ? <style data-hc-instance-overrides>{instanceCss}</style> : null}
      {editor?.selectionCss ? <style data-hc-visual-selection>{editor.selectionCss}</style> : null}
      {editor ? (
        <span role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{editor.liveMessage}</span>
      ) : null}
      {renderedChild}
    </div>
  );
}

function ContentTemplateReadOnlyContractFrame({
  moduleType,
  mode,
  props,
  children,
  renderSurface,
}: ContentTemplateContractFrameProps & { renderSurface: ReturnType<typeof useContentTemplateRenderSurface> }) {
  const contract = getContentTemplateContract(moduleType);
  const layout = getContentTemplateLayout(moduleType);
  const reactId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !contract || !layout) return;
    const ownerWindow = root.ownerDocument.defaultView;
    const appliedVariables = new Set<string>();
    const frameHeight = createContractFrameHeightSync(root, contract);
    let resizeFrame = 0;
    const resolveViewport = () => props?.__editorViewport === "mobile"
      ? "mobile" as const
      : props?.__editorViewport === "desktop"
        ? "desktop" as const
        : ownerWindow && ownerWindow.innerWidth <= 767
          ? "mobile" as const
          : "desktop" as const;
    const nodeIds = new Set([
      ...contract.roles.map((role) => role.id),
      ...contract.editorCapabilities.editableObjects.flatMap((object) =>
        object.nodeIds ?? [object.roleId],
      ),
    ]);
    const clearVariables = () => {
      appliedVariables.forEach((name) => root.style.removeProperty(name));
      appliedVariables.clear();
    };
    const syncLayoutVariables = () => {
      clearVariables();
      const viewport = resolveViewport();
      frameHeight.sync(viewport);
      root.style.setProperty(
        "--hc-layout-grid-rows",
        String(contract.defaultGeometryByViewport[viewport].rows),
      );
      appliedVariables.add("--hc-layout-grid-rows");
      const candidates = Array.from(root.querySelectorAll<HTMLElement>(
        "[data-content-role],[data-content-role-desktop],[data-content-role-mobile]",
      ));
      nodeIds.forEach((nodeId) => {
        const rect = resolveContractVisualNode(contract, props, nodeId, viewport).rect;
        if (!rect) return;
        const target = candidates.find((element) => {
          if (element.getClientRects().length === 0) return false;
          const ids = [
            viewport === "mobile"
              ? element.dataset.contentRoleMobile
              : element.dataset.contentRoleDesktop,
            element.dataset.contentRole,
          ];
          return ids.includes(nodeId);
        });
        if (!target) return;
        const frameElement = findModuleFrameElement(target, root);
        const rawContainingBlock = target.offsetParent;
        const containingBlock = isHtmlElement(rawContainingBlock) && (
          rawContainingBlock === root || root.contains(rawContainingBlock)
        )
          ? rawContainingBlock
          : frameElement;
        const measuredFrameBounds = frameElement.getBoundingClientRect();
        const rootBounds = root.getBoundingClientRect();
        const frameBounds = measuredFrameBounds.width > 0 && measuredFrameBounds.height > 0
          ? measuredFrameBounds
          : rootBounds;
        const containingBounds = containingBlock.getBoundingClientRect();
        const containingScaleX = containingBlock.offsetWidth > 0
          ? containingBounds.width / containingBlock.offsetWidth
          : 1;
        const containingScaleY = containingBlock.offsetHeight > 0
          ? containingBounds.height / containingBlock.offsetHeight
          : containingScaleX;
        const values = {
          left: (frameBounds.left - containingBounds.left + rect.x * frameBounds.width) /
            Math.max(0.0001, containingScaleX),
          top: (frameBounds.top - containingBounds.top + rect.y * frameBounds.height) /
            Math.max(0.0001, containingScaleY),
          width: rect.width * frameBounds.width / Math.max(0.0001, containingScaleX),
          height: rect.height * frameBounds.height / Math.max(0.0001, containingScaleY),
        };
        (Object.entries(values) as Array<[keyof typeof values, number]>).forEach(
          ([axis, value]) => {
            const name = visualNodeLayoutVar(nodeId, viewport, axis);
            root.style.setProperty(name, `${value}px`);
            appliedVariables.add(name);
          },
        );
      });
      frameHeight.sync(viewport);
    };

    syncLayoutVariables();
    const ResizeObserverConstructor = ownerWindow?.ResizeObserver;
    const observer = ResizeObserverConstructor
      ? new ResizeObserverConstructor(() => {
          if (!ownerWindow) return;
          ownerWindow.cancelAnimationFrame(resizeFrame);
          resizeFrame = ownerWindow.requestAnimationFrame(syncLayoutVariables);
        })
      : undefined;
    observer?.observe(root);
    const mutationObserver = ownerWindow
      ? new ownerWindow.MutationObserver(() => {
          ownerWindow.cancelAnimationFrame(resizeFrame);
          resizeFrame = ownerWindow.requestAnimationFrame(syncLayoutVariables);
        })
      : undefined;
    mutationObserver?.observe(root, { childList: true, subtree: true });
    return () => {
      observer?.disconnect();
      mutationObserver?.disconnect();
      ownerWindow?.cancelAnimationFrame(resizeFrame);
      clearVariables();
      frameHeight.clear();
    };
  }, [contract, layout, mode, moduleType, props]);

  if (!contract || !layout) return <>{children}</>;

  const scopeId = `hc-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const previewProps = props ?? {};
  const explicitInstanceOverrides = resolveInstanceOverrides(contract, previewProps);
  const instanceOverrides = resolveEffectiveInstanceOverrides(contract, previewProps);
  const instanceCss = createInstanceCss(
    contract,
    instanceOverrides,
    previewProps,
    scopeId,
    renderSurface === CONTENT_TEMPLATE_RENDER_SURFACE.CATALOG_PREVIEW ? "editor" : mode,
  );
  const instanceOverrideRecord: InstanceValue = isRecord(explicitInstanceOverrides)
    ? explicitInstanceOverrides as InstanceValue
    : {};
  const instanceLayout = isRecord(instanceOverrideRecord.layout)
    ? instanceOverrideRecord.layout
    : {};
  const instanceFrame = isRecord(instanceOverrideRecord.frame)
    ? instanceOverrideRecord.frame
    : {};

  return (
    <ContentTemplateFrameView
      moduleType={moduleType}
      mode={mode}
      props={props}
      contract={contract}
      layout={layout}
      scopeId={scopeId}
      instanceCss={instanceCss}
      instanceLayout={instanceLayout}
      instanceFrame={instanceFrame}
      childEditMode={renderSurface === CONTENT_TEMPLATE_RENDER_SURFACE.CATALOG_PREVIEW ? false : undefined}
      ensureContractActions={mode === "editor" || renderSurface === CONTENT_TEMPLATE_RENDER_SURFACE.CATALOG_PREVIEW}
      rootRef={rootRef}
    >
      {children}
    </ContentTemplateFrameView>
  );
}

export default function ContentTemplateContractFrame(props: ContentTemplateContractFrameProps) {
  const renderSurface = useContentTemplateRenderSurface();
  const blockId = typeof props.props?.id === "string" ? props.props.id : "";
  const internalEditorEnabled = renderSurface !== CONTENT_TEMPLATE_RENDER_SURFACE.CATALOG_PREVIEW
    && props.mode === "editor"
    && blockId.startsWith("template-editor:")
    && props.props?.__interactionOwner !== "host-overlay";

  return internalEditorEnabled ? (
    <ContentTemplateEditorContractFrame {...props} />
  ) : (
    <ContentTemplateReadOnlyContractFrame {...props} renderSurface={renderSurface} />
  );
}

/**
 * 三条真实渲染链路共用的 schema v5 根框架。
 * 默认状态保留语义 Renderer 的内容流；合同默认几何仅作为编辑器选区回退，
 * 只有合法的实例覆盖才会改变公开布局，从而统一驱动编辑器、
 * 缩略图与公开 Renderer。子节点仍由 adapter 输出语义 DOM，本层不复制内容结构。
 */
function ContentTemplateEditorContractFrame({
  moduleType,
  mode,
  props,
  children,
}: ContentTemplateContractFrameProps) {
  const contract = getContentTemplateContract(moduleType);
  const layout = getContentTemplateLayout(moduleType);
  const reactId = useId();
  const selection = useVisualEditorSession((state) => state.selection);
  const editorMode = useVisualEditorSession((state) => state.mode);
  const panelMode = useVisualEditorSession((state) => state.panelMode);
  const visualWorkspace = useVisualEditorSession((state) => state.workspace);
  const layerCommand = useVisualEditorSession((state) => state.layerCommand);
  const selectNode = useVisualEditorSession((state) => state.selectNode);
  const setEditorMode = useVisualEditorSession((state) => state.setMode);
  const setVisualPanelMode = useVisualEditorSession((state) => state.setPanelMode);
  const requestContentAction = useVisualEditorSession((state) => state.requestContentAction);
  const reportCanvasGeometry = useVisualEditorSession((state) => state.reportCanvasGeometry);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  const dragRef = useRef<MediaDragState | null>(null);
  const layoutDragRef = useRef<LayoutDragState | null>(null);
  const suppressClickRef = useRef(false);
  const gesturePreviewRef = useRef<GesturePreviewState | null>(null);
  const handledLayerCommandRef = useRef(0);
  const [liveMessage, setLiveMessage] = useState("");
  const [activeGuides, setActiveGuides] = useState<ActiveGuides>({});
  const [gesturePreview, setGesturePreview] = useState<GesturePreviewState | null>(null);
  const [sharedDesignPreview, setSharedDesignPreview] = useState<InstanceValue | undefined>();
  const [gesturePhase, setGesturePhase] = useState<GesturePhase>("idle");
  const [activeViewport, setActiveViewport] = useState<"desktop" | "mobile">("desktop");
  const blockId = typeof props?.id === "string" ? props.id : "";
  // 页面装修已经由 CanvasBlockInteractionBoundary 持有模块级定位标识；
  // 只有独立模板画布没有这层外部边界，需要由真实 Renderer 自己暴露节点标识。
  // 同一个页面模块出现两个相同 data-editor-block-id 会让滚动定位和选择命中不唯一。
  const ownsEditorBlockMarker = blockId.startsWith("template-editor:");
  // 页面装修只选择整个模板实例；合同内部节点交互仅属于隔离的母模板会话。
  // 预览、缩略图与公开 Renderer 同样不会建立监听器、tabindex 或会话标记。
  const internalEditorEnabled = mode === "editor"
    && ownsEditorBlockMarker
    && props?.__interactionOwner !== "host-overlay";
  const forcedEditorViewport = props?.__editorViewport === "mobile"
    ? "mobile" as const
    : props?.__editorViewport === "desktop"
      ? "desktop" as const
      : undefined;
  const resolveEditorViewport = useCallback(
    (ownerWindow: Window | null | undefined) =>
      forcedEditorViewport ?? (ownerWindow && ownerWindow.innerWidth <= 767 ? "mobile" : "desktop"),
    [forcedEditorViewport],
  );
  const selectedHere = internalEditorEnabled && selection?.blockId === blockId
    ? selection
    : null;
  const panelModeHere = internalEditorEnabled && visualWorkspace === "template"
    ? "design"
    : selectedHere
      ? panelMode
      : "content";
  const editorModeHere = selectedHere ? editorMode : "select";
  const layoutCapabilities = contract?.editorCapabilities.layoutOverrides;
  const selectedSlot = selectedHere
    ? layoutCapabilities?.slots?.find((slot) => slot.roleId === selectedHere.nodeId)
    : undefined;
  const selectedTextRole = selectedHere
    ? layoutCapabilities?.textRoles?.find((role) => role.roleId === selectedHere.nodeId)
    : undefined;
  const selectedEditableObject = selectedHere
    ? findContentTemplateEditableObject(contract, selectedHere.nodeId)
    : undefined;
  const canAdjustLayout = Boolean(
    (selectedSlot || selectedTextRole) &&
      supportsCapabilityOnViewport(selectedEditableObject, "layout", activeViewport),
  );
  const canAdjustMediaView = Boolean(
    selectedSlot && (
      (selectedSlot.focusByViewport === true && contentTemplateObjectHasCapability(selectedEditableObject, "focus")) ||
      (selectedSlot.zoom && contentTemplateObjectHasCapability(selectedEditableObject, "zoom")) ||
      (selectedSlot.fit?.length && contentTemplateObjectHasCapability(selectedEditableObject, "fit"))
    ),
  );
  const canDragMediaFocus = selectedSlot?.focusByViewport === true &&
    contentTemplateObjectHasCapability(selectedEditableObject, "focus");
  propsRef.current = props;

  useEffect(() => {
    if (!internalEditorEnabled) return;
    const ownerWindow = rootRef.current?.ownerDocument.defaultView;
    if (!ownerWindow) return;
    const handleSharedPreview = (event: MessageEvent<CanvasSharedVisualPreviewMessage>) => {
      if (
        event.origin !== ownerWindow.location.origin ||
        event.data?.type !== CANVAS_SHARED_VISUAL_PREVIEW_MESSAGE ||
        event.data.moduleType !== moduleType
      ) {
        return;
      }
      const next = event.data.overrides;
      setSharedDesignPreview(
        isRecord(next) && next.version === 2 ? next as InstanceValue : undefined,
      );
    };
    ownerWindow.addEventListener("message", handleSharedPreview);
    return () => ownerWindow.removeEventListener("message", handleSharedPreview);
  }, [internalEditorEnabled, mode, moduleType]);

  const previewGesture = useCallback((overrides: InstanceValue | undefined) => {
    const next: GesturePreviewState = { overrides, phase: "update" };
    gesturePreviewRef.current = next;
    setGesturePreview(next);
    setGesturePhase("update");
  }, []);

  const retainCommittedPreview = useCallback((overrides: InstanceValue | undefined) => {
    const next: GesturePreviewState = { overrides, phase: "commit" };
    gesturePreviewRef.current = next;
    setGesturePreview(next);
    setGesturePhase("commit");
  }, []);

  const cancelActiveGesture = useCallback((announce = true, updateUi = true) => {
    const root = rootRef.current;
    const mediaDrag = dragRef.current;
    const layoutDrag = layoutDragRef.current;
    if (mediaDrag?.frameId) mediaDrag.sourceWindow.cancelAnimationFrame(mediaDrag.frameId);
    if (layoutDrag?.frameId) layoutDrag.sourceWindow.cancelAnimationFrame(layoutDrag.frameId);
    const sourceWindow = layoutDrag?.sourceWindow ?? mediaDrag?.sourceWindow;
    if (updateUi && sourceWindow && (mediaDrag || layoutDrag)) {
      sendCanvasVisualEdit({
        blockId,
        moduleType,
        overrides: undefined,
        cancelled: true,
      }, sourceWindow);
    }
    const pointerId = layoutDrag?.pointerId ?? mediaDrag?.pointerId;
    dragRef.current = null;
    layoutDragRef.current = null;
    gesturePreviewRef.current = null;
    if (pointerId !== undefined && root?.hasPointerCapture(pointerId)) {
      root.releasePointerCapture(pointerId);
    }
    if (!updateUi) return Boolean(mediaDrag || layoutDrag);
    setGesturePreview(null);
    setActiveGuides({});
    setGesturePhase(mediaDrag || layoutDrag ? "cancel" : "idle");
    if (announce && (mediaDrag || layoutDrag)) {
      setLiveMessage("已取消本次调整，恢复调整前状态");
    }
    return Boolean(mediaDrag || layoutDrag);
  }, [blockId, moduleType]);

  useEffect(() => {
    if (gesturePreview?.phase !== "commit") return;
    const current = sanitizeContentTemplateLayoutData(
      moduleType,
      isRecord(props?.__instanceOverrides) ? props.__instanceOverrides : undefined,
    );
    const committed = sanitizeContentTemplateLayoutData(
      moduleType,
      gesturePreview.overrides,
    );
    // 模板会话会在写回前按合同清洗几何；用同一清洗结果确认提交，避免
    // 临时手势对象与持久化对象仅因规范化差异而永久停留在 commit 预览态。
    if (!committed || JSON.stringify(current) !== JSON.stringify(committed)) return;
    gesturePreviewRef.current = null;
    setGesturePreview(null);
    setGesturePhase("idle");
  }, [gesturePreview, moduleType, props?.__instanceOverrides]);

  useEffect(() => {
    if (
      !internalEditorEnabled ||
      !contract ||
      !layerCommand ||
      layerCommand.blockId !== blockId ||
      handledLayerCommandRef.current === layerCommand.revision
    ) {
      return;
    }
    handledLayerCommandRef.current = layerCommand.revision;
    const editableObject = findContentTemplateEditableObject(contract, layerCommand.nodeId);
    const sourceWindow = rootRef.current?.ownerDocument.defaultView ?? window;
    const viewport = resolveEditorViewport(sourceWindow);
    const allowedNode = supportsCapabilityOnViewport(editableObject, "layer", viewport);
    if (!allowedNode) return;
    const currentZIndex = resolveContractVisualNode(
      contract,
      propsRef.current,
      layerCommand.nodeId,
      viewport,
    ).zIndex ?? 2;
    const nextZIndex = Math.min(20, Math.max(0, currentZIndex + layerCommand.direction));
    if (nextZIndex === currentZIndex) {
      setLiveMessage(layerCommand.direction > 0 ? "对象已在最上层" : "对象已在最下层");
      return;
    }
    const next = setVisualOverridePath(
      propsRef.current?.__instanceOverrides,
      ["nodes", layerCommand.nodeId, "zIndexByViewport", viewport],
      nextZIndex,
    );
    sendCanvasVisualEdit({ blockId, moduleType, overrides: next }, sourceWindow);
    setLiveMessage(`对象层级已调整为 ${nextZIndex}`);
  }, [blockId, contract, internalEditorEnabled, layerCommand, mode, moduleType, resolveEditorViewport]);

  useEffect(() => {
    if (!selectedHere) return;
    if (editorMode === "adjust-media" && !canAdjustMediaView) setEditorMode("select");
    if (editorMode === "adjust-layout" && !canAdjustLayout) setEditorMode("select");
  }, [canAdjustLayout, canAdjustMediaView, editorMode, selectedHere, setEditorMode]);

  useEffect(() => {
    const root = rootRef.current;
    if (!internalEditorEnabled || !root || !contract) return;
    const allowedNodes = new Set(
      contract.editorCapabilities.editableObjects.flatMap((object) =>
        object.nodeIds ?? [object.roleId],
      ),
    );
    const touched = new Set<HTMLElement>();
    const cleanupElement = (element: HTMLElement) => {
      element.removeAttribute("data-hc-template-slot-kind");
      element.removeAttribute("data-hc-template-slot-label");
      if (element.dataset.hcKeyboardNode) {
        element.removeAttribute("data-hc-keyboard-node");
      }
      if (element.dataset.hcKeyboardTab === "true") {
        element.removeAttribute("tabindex");
        element.removeAttribute("data-hc-keyboard-tab");
      }
      if (element.dataset.hcKeyboardAria === "true") {
        element.removeAttribute("aria-label");
        element.removeAttribute("data-hc-keyboard-aria");
      }
    };
    const decorateSlots = () => {
      const eligible = new Set<HTMLElement>();
      root.querySelectorAll<HTMLElement>(
        "[data-content-role],[data-content-role-desktop],[data-content-role-mobile],[data-editor-field]",
      ).forEach((element) => {
        const directNodeId = getVisualRoleIdForViewport(element, activeViewport);
        const fieldNodeIds = element.dataset.editorField?.split(/\s+/).filter(Boolean) ?? [];
        const ancestor = element.parentElement?.closest<HTMLElement>(
          "[data-content-role],[data-content-role-desktop],[data-content-role-mobile]",
        );
        const ancestorNodeId = getVisualRoleIdForViewport(ancestor, activeViewport);
        const nodeId = directNodeId
          || (ancestorNodeId && fieldNodeIds.includes(ancestorNodeId)
            ? ancestorNodeId
            : fieldNodeIds.find((candidate) => allowedNodes.has(candidate)));
        if (!nodeId || !allowedNodes.has(nodeId)) return;
        if (ancestorNodeId === nodeId && allowedNodes.has(ancestorNodeId)) return;
        const ownerWindow = element.ownerDocument.defaultView;
        const computed = ownerWindow?.getComputedStyle(element);
        if (
          element.getClientRects().length === 0
          || computed?.display === "none"
          || computed?.visibility === "hidden"
          || element.closest('[aria-hidden="true"]')
        ) return;
        const nodeKind = getVisualNodeKind(contract, nodeId);
        if (!nodeKind) return;
        const editableObject = findContentTemplateEditableObject(contract, nodeId);
        const nodeLabel = getTemplateContractNodeLabel(nodeId, editableObject?.roleId);
        element.dataset.hcTemplateSlotKind = nodeKind;
        element.dataset.hcTemplateSlotLabel = nodeLabel;
        touched.add(element);
        eligible.add(element);
        const isAction = nodeKind === "action";
        if (isAction) return;
        if (!element.hasAttribute("tabindex")) {
          element.tabIndex = 0;
          element.dataset.hcKeyboardTab = "true";
        }
        element.dataset.hcKeyboardNode = nodeId;
        if (!element.hasAttribute("aria-label")) {
          element.setAttribute("aria-label", `编辑画布对象：${nodeLabel}`);
          element.dataset.hcKeyboardAria = "true";
        }
      });
      touched.forEach((element) => {
        if (eligible.has(element)) return;
        cleanupElement(element);
        touched.delete(element);
      });
    };
    decorateSlots();
    const MutationObserverConstructor = root.ownerDocument.defaultView?.MutationObserver;
    const observer = MutationObserverConstructor
      ? new MutationObserverConstructor(decorateSlots)
      : undefined;
    observer?.observe(root, {
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"],
      childList: true,
      subtree: true,
    });
    return () => {
      observer?.disconnect();
      touched.forEach(cleanupElement);
    };
  }, [activeViewport, blockId, contract, internalEditorEnabled, mode]);

  useEffect(() => {
    const root = rootRef.current;
    if (
      !internalEditorEnabled ||
      !root ||
      !selection ||
      selection.blockId !== blockId ||
      editorMode === "select"
    ) {
      return;
    }
    const ownerWindow = root.ownerDocument.defaultView;
    if (!ownerWindow) return;
    const frameElement = ownerWindow.frameElement;
    const canvasOwnsFocus = frameElement
      ? frameElement.ownerDocument.activeElement === frameElement
      : root.contains(root.ownerDocument.activeElement);
    setLiveMessage(
      editorMode === "adjust-media"
        ? canDragMediaFocus
          ? "已进入图片画面调整，使用方向键移动焦点，按 Shift 加方向键可大幅调整，按 Escape 退出"
          : "已进入图片显示调整，可使用画布工具调整显示方式和缩放，按 Escape 退出"
        : "已进入对象位置调整，使用方向键移动，按 Alt 加方向键调整大小，按 Escape 退出",
    );
    // 页签、属性面板等画布外控件切换设计模式时保留其键盘焦点。
    if (!canvasOwnsFocus) return;
    const frameId = ownerWindow.requestAnimationFrame(() => {
      const target = Array.from(
        root.querySelectorAll<HTMLElement>("[data-hc-keyboard-node]"),
      ).find(
        (element) =>
          element.dataset.hcKeyboardNode === selection.nodeId &&
          element.getClientRects().length > 0,
      );
      if (!target) return;
      target.focus({ preventScroll: true });
    });
    return () => ownerWindow.cancelAnimationFrame(frameId);
  }, [blockId, canDragMediaFocus, editorMode, internalEditorEnabled, mode, selection]);

  useEffect(() => {
    const root = rootRef.current;
    const ownerDocument = root?.ownerDocument;
    const ownerWindow = root?.ownerDocument.defaultView;
    let viewport = resolveEditorViewport(ownerWindow);
    const cancelOnViewportWidthChange = () => {
      const nextViewport = resolveEditorViewport(ownerWindow);
      setActiveViewport(nextViewport);
      if (nextViewport === viewport) return;
      viewport = nextViewport;
      cancelActiveGesture(true);
    };
    const cancelOnBlur = () => cancelActiveGesture(true);
    // Puck 会按内容高度同步调整 iframe。对象实时预览可能因此触发仅高度变化的
    // resize；这不是视口/断点变化，若在这里释放 pointer capture 会中断拖动。
    cancelOnViewportWidthChange();
    ownerWindow?.addEventListener("resize", cancelOnViewportWidthChange);
    ownerWindow?.addEventListener("blur", cancelOnBlur);
    return () => {
      ownerWindow?.removeEventListener("resize", cancelOnViewportWidthChange);
      ownerWindow?.removeEventListener("blur", cancelOnBlur);
      cancelActiveGesture(false, false);
      // Puck 仅更新 itemSelector 时也可能短暂重挂当前区块。同步 clear 会把
      // 刚由图片/文字 pointerdown 写入的视觉选择擦掉，表现为画布点不中。
      // 等同 blockId 的替代节点挂回后再判断；真正删除区块时才清理会话。
      ownerWindow?.setTimeout(() => {
        const replacementExists = Array.from(
          ownerDocument?.querySelectorAll<HTMLElement>(
            "[data-editor-block-id]",
          ) ?? [],
        ).some((element) => element.dataset.editorBlockId === blockId);
        if (!replacementExists) {
          useVisualEditorSession.getState().clearNode(blockId);
        }
      }, 120);
    };
  }, [blockId, cancelActiveGesture, resolveEditorViewport]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !contract || !layout) return;
    const ownerWindow = root.ownerDocument.defaultView;
    const appliedVariables = new Set<string>();
    const frameHeight = createContractFrameHeightSync(root, contract);
    let geometryFrame = 0;
    const previewOverrides = gesturePreview?.overrides ?? sharedDesignPreview;
    const visualProps = previewOverrides
      ? { ...props, __instanceOverrides: previewOverrides }
      : props;
    const nodeIds = new Set([
      ...contract.roles.map((role) => role.id),
      ...contract.editorCapabilities.editableObjects.flatMap((object) =>
        object.nodeIds ?? [object.roleId],
      ),
    ]);

    const clearVariables = () => {
      appliedVariables.forEach((name) => root.style.removeProperty(name));
      appliedVariables.clear();
    };
    const reportMeasuredGeometry = () => {
      if (!internalEditorEnabled || !blockId) return;
      const viewport = resolveEditorViewport(ownerWindow);
      const candidates = Array.from(root.querySelectorAll<HTMLElement>(
        "[data-content-role],[data-content-role-desktop],[data-content-role-mobile]",
      ));
      const nodes: Record<string, { x: number; y: number; width: number; height: number }> = {};
      let sharedFrame: HTMLElement | null = null;
      const round = (value: number) => Math.round(value * 100_000) / 100_000;
      nodeIds.forEach((nodeId) => {
        const target = candidates.find((element) => {
          if (element.getClientRects().length === 0) return false;
          const ids = [
            viewport === "mobile"
              ? element.dataset.contentRoleMobile
              : element.dataset.contentRoleDesktop,
            element.dataset.contentRole,
          ];
          return ids.includes(nodeId);
        });
        if (!target) return;
        const frameElement = findModuleFrameElement(target, root);
        if (!sharedFrame) sharedFrame = frameElement;
        if (frameElement !== sharedFrame) return;
        const frameBounds = frameElement.getBoundingClientRect();
        const nodeBounds = target.getBoundingClientRect();
        if (frameBounds.width <= 0 || frameBounds.height <= 0 || nodeBounds.width <= 0 || nodeBounds.height <= 0) return;
        nodes[nodeId] = {
          x: round((nodeBounds.left - frameBounds.left) / frameBounds.width),
          y: round((nodeBounds.top - frameBounds.top) / frameBounds.height),
          width: round(nodeBounds.width / frameBounds.width),
          height: round(nodeBounds.height / frameBounds.height),
        };
      });
      const measuredFrame = sharedFrame as HTMLElement | null;
      if (!measuredFrame || Object.keys(nodes).length === 0) return;
      const frameBounds = measuredFrame.getBoundingClientRect();
      if (frameBounds.width <= 0 || frameBounds.height <= 0) return;
      reportCanvasGeometry({
        blockId,
        moduleType,
        viewport,
        frameAspectRatio: round(frameBounds.width / frameBounds.height),
        nodes,
      });
    };
    const scheduleGeometryReport = () => {
      if (!ownerWindow || !internalEditorEnabled) return;
      ownerWindow.cancelAnimationFrame(geometryFrame);
      geometryFrame = ownerWindow.requestAnimationFrame(reportMeasuredGeometry);
    };
    const syncLayoutVariables = () => {
      clearVariables();
      const viewport = resolveEditorViewport(ownerWindow);
      frameHeight.sync(viewport);
      root.style.setProperty(
        "--hc-layout-grid-rows",
        String(contract.defaultGeometryByViewport[viewport].rows),
      );
      appliedVariables.add("--hc-layout-grid-rows");
      const candidates = Array.from(root.querySelectorAll<HTMLElement>(
        "[data-content-role],[data-content-role-desktop],[data-content-role-mobile]",
      ));
      nodeIds.forEach((nodeId) => {
        const rect = resolveContractVisualNode(contract, visualProps, nodeId, viewport).rect;
        if (!rect) return;
        const target = candidates.find((element) => {
          if (element.getClientRects().length === 0) return false;
          const ids = [
            viewport === "mobile"
              ? element.dataset.contentRoleMobile
              : element.dataset.contentRoleDesktop,
            element.dataset.contentRole,
          ];
          return ids.includes(nodeId);
        });
        if (!target) return;
        const frameElement = findModuleFrameElement(target, root);
        const rawContainingBlock = target.offsetParent;
        const containingBlock = isHtmlElement(rawContainingBlock) && (
          rawContainingBlock === root || root.contains(rawContainingBlock)
        )
          ? rawContainingBlock
          : frameElement;
        const measuredFrameBounds = frameElement.getBoundingClientRect();
        const rootBounds = root.getBoundingClientRect();
        // Puck 切换内容/模板编辑时会短暂重挂当前区块。直接框架在这一帧
        // 可能尚未恢复高度；若把 0 写进布局变量，媒体槽位会保持折叠。
        // 合同根框架已经具有当前设备的确定尺寸，可安全承担这一帧兜底。
        const frameBounds = measuredFrameBounds.width > 0 && measuredFrameBounds.height > 0
          ? measuredFrameBounds
          : rootBounds;
        const containingBounds = containingBlock.getBoundingClientRect();
        // 模板库缩略图会缩放真实 Renderer。getBoundingClientRect 返回缩放后的
        // 视觉像素，而 CSS 自定义属性写入的是缩放前布局像素；两者混用会让
        // 1/4 缩略图里的槽位再次缩小到 1/16。按包含块实际缩放比还原即可
        // 同时覆盖编辑画布、缩略图和公开页面（公开页面比例为 1）。
        const containingScaleX = containingBlock.offsetWidth > 0
          ? containingBounds.width / containingBlock.offsetWidth
          : 1;
        const containingScaleY = containingBlock.offsetHeight > 0
          ? containingBounds.height / containingBlock.offsetHeight
          : containingScaleX;
        const values = {
          left: (frameBounds.left - containingBounds.left + rect.x * frameBounds.width) /
            Math.max(0.0001, containingScaleX),
          top: (frameBounds.top - containingBounds.top + rect.y * frameBounds.height) /
            Math.max(0.0001, containingScaleY),
          width: rect.width * frameBounds.width / Math.max(0.0001, containingScaleX),
          height: rect.height * frameBounds.height / Math.max(0.0001, containingScaleY),
        };
        (Object.entries(values) as Array<[keyof typeof values, number]>).forEach(
          ([axis, value]) => {
            const name = visualNodeLayoutVar(nodeId, viewport, axis);
            root.style.setProperty(name, `${value}px`);
            appliedVariables.add(name);
          },
        );
      });
      frameHeight.sync(viewport);
      scheduleGeometryReport();
    };

    syncLayoutVariables();
    const ResizeObserverConstructor = ownerWindow?.ResizeObserver;
    const observer = ResizeObserverConstructor
      ? new ResizeObserverConstructor(syncLayoutVariables)
      : undefined;
    observer?.observe(root);
    ownerWindow?.addEventListener("resize", syncLayoutVariables);
    return () => {
      observer?.disconnect();
      ownerWindow?.removeEventListener("resize", syncLayoutVariables);
      ownerWindow?.cancelAnimationFrame(geometryFrame);
      clearVariables();
      frameHeight.clear();
    };
  }, [blockId, contract, gesturePreview, internalEditorEnabled, layout, mode, moduleType, props, reportCanvasGeometry, resolveEditorViewport, sharedDesignPreview]);

  if (!contract || !layout) return <>{children}</>;
  const scopeId = `hc-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const previewOverrides = gesturePreview?.overrides ?? sharedDesignPreview;
  const previewProps = previewOverrides
    ? { ...(props ?? {}), __instanceOverrides: previewOverrides }
    : (props ?? {});
  const explicitInstanceOverrides = resolveInstanceOverrides(contract, previewProps);
  const instanceOverrides = resolveEffectiveInstanceOverrides(contract, previewProps);
  const instanceCss = createInstanceCss(
    contract,
    instanceOverrides,
    previewProps,
    scopeId,
    mode,
  );
  const instanceOverrideRecord: InstanceValue = isRecord(explicitInstanceOverrides)
    ? explicitInstanceOverrides as InstanceValue
    : {};
  const instanceLayout = isRecord(instanceOverrideRecord.layout)
    ? instanceOverrideRecord.layout
    : {};
  const instanceFrame = isRecord(instanceOverrideRecord.frame)
    ? instanceOverrideRecord.frame
    : {};

  const nodeSelector = (nodeId: string) =>
    `[data-hc-instance="${scopeId}"] :is([data-content-role="${nodeId}"],[data-content-role-desktop="${nodeId}"],[data-content-role-mobile="${nodeId}"],[data-editor-field~="${nodeId}"])`;

  const collectSnapCandidates = (
    root: HTMLElement,
    frameElement: HTMLElement,
    selectedNodeId: string,
    viewport: "desktop" | "mobile",
  ) => {
    const frameBounds = frameElement.getBoundingClientRect();
    const allowedNodeIds = new Set([
      ...(contract.editorCapabilities.layoutOverrides?.slots ?? []).map((slot) => slot.roleId),
      ...(contract.editorCapabilities.layoutOverrides?.textRoles ?? []).map((role) => role.roleId),
    ]);
    const x: SnapCandidate[] = [
      { value: 0, kind: "frame-edge" },
      { value: 0.5, kind: "frame-center" },
      { value: 1, kind: "frame-edge" },
    ];
    const y: SnapCandidate[] = [
      { value: 0, kind: "frame-edge" },
      { value: 0.5, kind: "frame-center" },
      { value: 1, kind: "frame-edge" },
    ];
    const seen = new Set<string>();
    root.querySelectorAll<HTMLElement>(
      "[data-content-role],[data-content-role-desktop],[data-content-role-mobile]",
    ).forEach((element) => {
      if (
        element.getClientRects().length === 0
        || findModuleFrameElement(element, root) !== frameElement
      ) return;
      const nodeId =
        (viewport === "mobile"
          ? element.dataset.contentRoleMobile
          : element.dataset.contentRoleDesktop) ||
        element.dataset.contentRole ||
        element.dataset.contentRoleDesktop ||
        element.dataset.contentRoleMobile;
      if (!nodeId || nodeId === selectedNodeId || !allowedNodeIds.has(nodeId) || seen.has(nodeId)) return;
      seen.add(nodeId);
      const bounds = element.getBoundingClientRect();
      const left = (bounds.left - frameBounds.left) / Math.max(1, frameBounds.width);
      const top = (bounds.top - frameBounds.top) / Math.max(1, frameBounds.height);
      const width = bounds.width / Math.max(1, frameBounds.width);
      const height = bounds.height / Math.max(1, frameBounds.height);
      if (left >= 0 && left <= 1 && width > 0) {
        x.push(
          { value: left, kind: "node-edge" },
          { value: left + width / 2, kind: "node-center" },
          { value: left + width, kind: "node-edge" },
        );
      }
      if (top >= 0 && top <= 1 && height > 0) {
        y.push(
          { value: top, kind: "node-edge" },
          { value: top + height / 2, kind: "node-center" },
          { value: top + height, kind: "node-edge" },
        );
      }
    });
    return { x, y };
  };

  function findVisualNode(target: HTMLElement, activeViewport: "desktop" | "mobile") {
    const media = target.closest("img,video");
    if (media) {
      const roleElement = media.closest<HTMLElement>(
        "[data-content-role],[data-content-role-desktop],[data-content-role-mobile]",
      );
      if (roleElement) {
        const nodeId = getVisualRoleIdForViewport(roleElement, activeViewport);
        const kind = nodeId ? getVisualNodeKind(contract, nodeId) : undefined;
        if (nodeId && kind) {
          return {
            nodeId,
            kind,
            element: roleElement,
          };
        }
      }
    }
    // 键盘焦点落在媒体槽位容器本身时，容器往往同时带有
    // data-editor-field。必须先按合同角色识别媒体，否则会被误判为文字字段，
    // 导致 Enter/方向键无法调整焦点。
    const directRoleElement = target.closest<HTMLElement>(
      "[data-content-role],[data-content-role-desktop],[data-content-role-mobile]",
    );
    const directRoleId = getVisualRoleIdForViewport(directRoleElement, activeViewport);
    const directVisualKind = directRoleId
      ? getVisualNodeKind(contract, directRoleId)
      : undefined;
    if (
      directRoleId &&
      directRoleElement &&
      (directVisualKind === "media" || directVisualKind === "product")
    ) {
      return {
        nodeId: directRoleId,
        kind: directVisualKind,
        element: directRoleElement,
      };
    }
    const fieldElement = target.closest<HTMLElement>("[data-editor-field]");
    const fieldId = fieldElement?.dataset.editorField?.split(/\s+/).find(Boolean);
    const fieldObject = fieldId
      ? findContentTemplateEditableObject(contract, fieldId)
      : undefined;
    const fieldIsLayoutNode = Boolean(
      fieldId && contract?.defaultGeometryByViewport[activeViewport].zones.some(
        (zone) => zone.nodeId === fieldId,
      ),
    );
    const selectionNodeId = fieldObject
      ? fieldIsLayoutNode
        ? fieldId
        : fieldObject.roleId
      : undefined;
    const fieldKind = selectionNodeId
      ? getVisualNodeKind(contract, selectionNodeId)
      : undefined;
    if (selectionNodeId && fieldElement && fieldKind) {
      const kind: VisualNodeKind = fieldKind;
      // 标题等字段本身就是布局节点，必须保留精确 nodeId；actionText 等
      // 仅是角色内容字段，结构树和实例覆盖则使用 action 这类合同角色。
      return { nodeId: selectionNodeId, kind, element: fieldElement };
    }
    const roleElement = target.closest<HTMLElement>(
      "[data-content-role],[data-content-role-desktop],[data-content-role-mobile]",
    );
    const roleId = getVisualRoleIdForViewport(roleElement, activeViewport);
    if (!roleId || !roleElement) return null;
    const kind = getVisualNodeKind(contract, roleId);
    if (!kind) return null;
    return { nodeId: roleId, kind, element: roleElement };
  }

  const applyFocus = (
    drag: MediaDragState,
    focus: { x: number; y: number },
    phase: "update" | "commit" = "commit",
  ) => {
    const next = setVisualOverridePath(
      propsRef.current?.__instanceOverrides,
      ["nodes", drag.nodeId, "mediaView", "focusByViewport", drag.viewport],
      focus,
    );
    if (phase === "update") {
      previewGesture(next);
      sendCanvasVisualEdit(
        { blockId, moduleType, overrides: next, transient: true },
        drag.sourceWindow,
      );
      return;
    }
    sendCanvasVisualEdit({ blockId, moduleType, overrides: next }, drag.sourceWindow);
    if (drag.pointerId >= 0) {
      retainCommittedPreview(next);
    } else {
      gesturePreviewRef.current = null;
      setGesturePreview(null);
      setGesturePhase("idle");
    }
  };

  const applyRect = (
    drag: LayoutDragState,
    rect: { x: number; y: number; width: number; height: number },
    phase: "update" | "commit" = "commit",
  ) => {
    let next = setVisualOverridePath(
      propsRef.current?.__instanceOverrides,
      ["nodes", drag.nodeId, "rectByViewport", drag.viewport],
      rect,
    );
    const currentOverrides = resolveInstanceOverrides(contract, propsRef.current);
    const currentFrame = isRecord(currentOverrides?.frame)
      ? currentOverrides.frame
      : {};
    const currentAspectRatios = isRecord(currentFrame.aspectRatioByViewport)
      ? currentFrame.aspectRatioByViewport
      : {};
    const currentAspectRatio = Number(
      currentAspectRatios[drag.viewport] ?? currentFrame.aspectRatio,
    );
    const hasStableFrame = (
      Number.isFinite(currentAspectRatio) &&
      currentAspectRatio >= 0.25 &&
      currentAspectRatio <= 4
    ) || (
      typeof currentFrame.heightPreset === "string" &&
      contract.editorCapabilities.layoutOverrides?.framePresets?.includes(
        currentFrame.heightPreset,
      )
    );
    const liveAspectRatio = drag.frameWidth / Math.max(1, drag.frameHeight);
    if (
      !hasStableFrame &&
      Number.isFinite(liveAspectRatio) &&
      liveAspectRatio >= 0.25 &&
      liveAspectRatio <= 4
    ) {
      // 文档流节点首次转为自由定位时会退出 grid/flex 布局。若不同时固定
      // 当前真实框架比例，容器会因失去流内子项而收缩，使“只横移”伴随
      // 纵向跳动和尺寸变化。比例和节点矩形在同一历史事务中提交。
      next = setVisualOverridePath(
        next,
        ["frame", "aspectRatioByViewport", drag.viewport],
        liveAspectRatio,
      );
    }
    if (phase === "update") {
      previewGesture(next);
      sendCanvasVisualEdit(
        { blockId, moduleType, overrides: next, transient: true },
        drag.sourceWindow,
      );
      return;
    }
    sendCanvasVisualEdit({ blockId, moduleType, overrides: next }, drag.sourceWindow);
    if (drag.pointerId >= 0) {
      retainCommittedPreview(next);
    } else {
      gesturePreviewRef.current = null;
      setGesturePreview(null);
      setGesturePhase("idle");
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!internalEditorEnabled || !blockId || !isHtmlElement(event.target)) return;
    if (event.currentTarget.closest('[data-editor-node-selection="module"]')) return;
    const sourceWindow = event.currentTarget.ownerDocument.defaultView ?? window;
    const activeViewport = resolveEditorViewport(sourceWindow);
    const node = findVisualNode(event.target, activeViewport);
    if (!node) return;
    const previousSelection = useVisualEditorSession.getState().selection;
    const isTemplateCanvasBlock = blockId.startsWith("template-editor:");
    selectNode({ blockId, moduleType, nodeId: node.nodeId, kind: node.kind });
    if (
      previousSelection
      && previousSelection.blockId !== blockId
      && !isTemplateCanvasBlock
    ) {
      // 跨模块第一击必须先让外层画布边界同步 Puck 模块选择；若立即进入
      // 拖动并停止冒泡，会出现“对象已换、属性面板仍属于旧模块”的分裂状态。
      setEditorMode("select");
      event.preventDefault();
      return;
    }
    const activeMode = useVisualEditorSession.getState().mode;
    const visualCapabilities = contract.editorCapabilities.layoutOverrides;
    const editableObject = findContentTemplateEditableObject(contract, node.nodeId);
    const layoutAllowed = Boolean(
      supportsCapabilityOnViewport(editableObject, "layout", activeViewport) && (
        visualCapabilities?.slots?.some((slot) => slot.roleId === node.nodeId) ||
        visualCapabilities?.textRoles?.some((role) => role.roleId === node.nodeId)
      ),
    );
    const mediaSlot = visualCapabilities?.slots?.find((slot) => slot.roleId === node.nodeId);
    const mediaFocusAllowed = Boolean(
      (node.kind === "media" || node.kind === "product") &&
        contentTemplateObjectHasCapability(editableObject, "focus") &&
        mediaSlot?.focusByViewport === true,
    );
    // 模板设计遵循 Canvas First / Mouse First：即使当前对象刚处于“完成”
    // 选择态，按住可移动槽位主体的同一次手势也要直接重新进入布局调整。
    // 页面装修仍保留“只选择实例、不拖动内部对象”的边界。
    const directTemplateLayoutGesture =
      isTemplateCanvasBlock && activeMode === "select" && layoutAllowed;
    if (activeMode === "adjust-layout" || directTemplateLayoutGesture) {
      if (!layoutAllowed) return;
      if (directTemplateLayoutGesture) {
        setVisualPanelMode("design");
        setEditorMode("adjust-layout");
        setLiveMessage("已开始移动画布对象");
      }
      const nodeBounds = node.element.getBoundingClientRect();
      // 根框架前面会插入合同样式节点，firstElementChild 因此可能是零尺寸
      // <style>。从当前槽位向上找到框架的直接内容子节点，才能按真实模板
      // 构图计算初始矩形；否则会把文字错误扩成 100% × 100%。
      const frameElement = findModuleFrameElement(node.element, event.currentTarget);
      const frameBounds = frameElement.getBoundingClientRect();
      const rootBounds = event.currentTarget.getBoundingClientRect();
      const snapCandidates = collectSnapCandidates(
        event.currentTarget,
        frameElement,
        node.nodeId,
        activeViewport,
      );
      const effective = resolveExplicitVisualNode(contract, props, node.nodeId, activeViewport);
      const baseConstraints = editableObject!.constraints;
      const bounds = baseConstraints.safeAreaRequired
        ? contract.defaultGeometryByViewport[activeViewport].safeArea
        : { x: 0, y: 0, width: 1, height: 1 };
      if (baseConstraints.safeAreaRequired) {
        snapCandidates.x.push(
          { value: bounds.x, kind: "frame-edge" },
          { value: bounds.x + bounds.width / 2, kind: "frame-center" },
          { value: bounds.x + bounds.width, kind: "frame-edge" },
        );
        snapCandidates.y.push(
          { value: bounds.y, kind: "frame-edge" },
          { value: bounds.y + bounds.height / 2, kind: "frame-center" },
          { value: bounds.y + bounds.height, kind: "frame-edge" },
        );
      }
      const derivedRect = {
        x: Math.min(1, Math.max(0, (nodeBounds.left - frameBounds.left) / Math.max(1, frameBounds.width))),
        y: Math.min(1, Math.max(0, (nodeBounds.top - frameBounds.top) / Math.max(1, frameBounds.height))),
        width: Math.min(1, Math.max(MIN_VISUAL_NODE_SIZE, nodeBounds.width / Math.max(1, frameBounds.width))),
        height: Math.min(1, Math.max(MIN_VISUAL_NODE_SIZE, nodeBounds.height / Math.max(1, frameBounds.height))),
      };
      const rawStartRect = effective.rect ?? derivedRect;
      const constraints = interactionConstraints(
        baseConstraints,
        rawStartRect,
        false,
        false,
      );
      const startRect = clampRect(rawStartRect, constraints, bounds);
      layoutDragRef.current = {
        pointerId: event.pointerId,
        nodeId: node.nodeId,
        viewport: activeViewport,
        operation: "move",
        startClientX: event.clientX,
        startClientY: event.clientY,
        startRect,
        frameWidth: Math.max(1, frameBounds.width),
        frameHeight: Math.max(1, frameBounds.height),
        frameOffsetX: frameBounds.left - rootBounds.left,
        frameOffsetY: frameBounds.top - rootBounds.top,
        lockRatio: event.shiftKey,
        constraints,
        bounds,
        sourceWindow,
        snapX: snapCandidates.x,
        snapY: snapCandidates.y,
      };
      gesturePreviewRef.current = null;
      suppressClickRef.current = true;
      setGesturePreview(null);
      setGesturePhase("begin");
      // pointerdown 会被画布接管并阻止浏览器默认聚焦；若不显式聚焦，
      // 随后的 Esc/方向键会落到 iframe 宿主而无法取消或微调当前对象。
      // preventScroll 保留画布当前位置，避免缩放 iframe 因聚焦而跳动。
      node.element.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (activeMode === "select") {
      // 可编辑节点为键盘操作保留 tabindex；但鼠标点击时若让浏览器默认
      // 聚焦 iframe 内节点，Chrome 会按未缩放坐标滚动宿主画布，表现为
      // 当前模块突然跳走或只剩白块。选择状态已经写入 store，无需再聚焦。
      event.preventDefault();
      return;
    }
    if (activeMode !== "adjust-media" || !mediaFocusAllowed) return;
    const bounds = node.element.getBoundingClientRect();
    const effective = resolveContractVisualNode(contract, props, node.nodeId, activeViewport);
    dragRef.current = {
      pointerId: event.pointerId,
      nodeId: node.nodeId,
      viewport: activeViewport,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startFocusX: effective.focus?.x ?? 50,
      startFocusY: effective.focus?.y ?? 50,
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height),
      sourceWindow,
    };
    gesturePreviewRef.current = null;
    suppressClickRef.current = true;
    setGesturePreview(null);
    setGesturePhase("begin");
    node.element.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!internalEditorEnabled || !blockId || !isHtmlElement(event.target)) return;
    if (event.currentTarget.closest('[data-editor-node-selection="module"]')) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.target.closest("a,button,video")) {
      event.preventDefault();
      event.stopPropagation();
    }
    const sourceWindow = event.currentTarget.ownerDocument.defaultView ?? window;
    const activeViewport = resolveEditorViewport(sourceWindow);
    const node = findVisualNode(event.target, activeViewport);
    if (!node) return;
    // Puck 会在外层组件的 pointerdown 阶段处理 itemSelector；select 模式下
    // 再用 click 落实一次视觉节点选择，避免同一轮重挂把 pointerdown 选择吞掉。
    selectNode({ blockId, moduleType, nodeId: node.nodeId, kind: node.kind });
    if (panelModeHere === "content" && (
      node.kind === "media" ||
      node.kind === "product" ||
      node.kind === "structured"
    )) {
      requestContentAction({
        blockId,
        moduleType,
        nodeId: node.nodeId,
        kind: node.kind,
      });
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!internalEditorEnabled || !blockId || !isHtmlElement(event.target)) return;
    if (
      blockId.startsWith("template-editor:")
      && (event.ctrlKey || event.metaKey)
      && !event.altKey
      && ["z", "y"].includes(event.key.toLowerCase())
    ) {
      sendCanvasTemplateHistory({
        blockId,
        direction: event.key.toLowerCase() === "y" || event.shiftKey ? "forward" : "back",
      }, event.currentTarget.ownerDocument.defaultView ?? window);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key === "Escape") {
      cancelActiveGesture(true);
      setEditorMode("select");
      setLiveMessage("已退出画布调整模式");
      event.preventDefault();
      return;
    }
    const activeViewport = resolveEditorViewport(event.currentTarget.ownerDocument.defaultView);
    const node = findVisualNode(event.target, activeViewport);
    if (!node || node.kind === "action") return;
    selectNode({ blockId, moduleType, nodeId: node.nodeId, kind: node.kind });
    const capabilities = contract.editorCapabilities.layoutOverrides;
    const editableObject = findContentTemplateEditableObject(contract, node.nodeId);
    const mediaSlot = capabilities?.slots?.find((slot) => slot.roleId === node.nodeId);
    const mediaViewAllowed = (node.kind === "media" || node.kind === "product") && Boolean(
      mediaSlot && (
        (mediaSlot.focusByViewport === true && contentTemplateObjectHasCapability(editableObject, "focus")) ||
        (mediaSlot.zoom && contentTemplateObjectHasCapability(editableObject, "zoom")) ||
        (mediaSlot.fit?.length && contentTemplateObjectHasCapability(editableObject, "fit"))
      ),
    );
    const mediaFocusAllowed = mediaViewAllowed &&
      contentTemplateObjectHasCapability(editableObject, "focus") &&
      mediaSlot?.focusByViewport === true;
    const layoutAllowed = supportsCapabilityOnViewport(editableObject, "layout", activeViewport) && (
      capabilities?.slots?.some((slot) => slot.roleId === node.nodeId) ||
      capabilities?.textRoles?.some((role) => role.roleId === node.nodeId)
    );
    if (event.key === "Enter") {
      if (useVisualEditorSession.getState().panelMode === "design") {
        useVisualEditorSession.getState().setMode(mediaViewAllowed ? "adjust-media" : layoutAllowed ? "adjust-layout" : "select");
        setLiveMessage(
          mediaViewAllowed
            ? mediaFocusAllowed
              ? "已进入图片画面调整，使用方向键移动焦点，按 Shift 加方向键可大幅调整，按 Escape 退出"
              : "已进入图片显示调整，可使用画布工具调整显示方式和缩放，按 Escape 退出"
            : "已进入对象位置调整，使用方向键移动，按 Alt 加方向键调整大小，按 Escape 退出",
        );
      }
      event.preventDefault();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const activeMode = useVisualEditorSession.getState().mode;
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const axis = event.key === "ArrowLeft" || event.key === "ArrowRight" ? "x" : "y";
    if (activeMode === "adjust-media" && mediaFocusAllowed) {
      const effective = resolveContractVisualNode(contract, propsRef.current, node.nodeId, activeViewport);
      const focus = {
        x: effective.focus?.x ?? 50,
        y: effective.focus?.y ?? 50,
      };
      focus[axis] = Math.min(100, Math.max(0, focus[axis] + direction * (event.shiftKey ? 5 : 1)));
      applyFocus({
        pointerId: -1,
        nodeId: node.nodeId,
        viewport: activeViewport,
        startClientX: 0,
        startClientY: 0,
        startFocusX: focus.x,
        startFocusY: focus.y,
        width: 1,
        height: 1,
        sourceWindow: event.currentTarget.ownerDocument.defaultView ?? window,
      }, focus);
      setLiveMessage(`图片焦点已调整为 ${Math.round(focus.x)}%，${Math.round(focus.y)}%`);
      event.preventDefault();
      return;
    }
    if (activeMode !== "adjust-layout" || !layoutAllowed) return;
    const frameElement = findModuleFrameElement(node.element, event.currentTarget);
    const frameBounds = frameElement.getBoundingClientRect();
    const nodeBounds = node.element.getBoundingClientRect();
    const effective = resolveExplicitVisualNode(contract, propsRef.current, node.nodeId, activeViewport);
    const baseConstraints = editableObject!.constraints;
    const bounds = baseConstraints.safeAreaRequired
      ? contract.defaultGeometryByViewport[activeViewport].safeArea
      : { x: 0, y: 0, width: 1, height: 1 };
    const rawRect = effective.rect ?? {
      x: Math.min(1, Math.max(0, (nodeBounds.left - frameBounds.left) / Math.max(1, frameBounds.width))),
      y: Math.min(1, Math.max(0, (nodeBounds.top - frameBounds.top) / Math.max(1, frameBounds.height))),
      width: Math.min(1, Math.max(MIN_VISUAL_NODE_SIZE, nodeBounds.width / Math.max(1, frameBounds.width))),
      height: Math.min(1, Math.max(MIN_VISUAL_NODE_SIZE, nodeBounds.height / Math.max(1, frameBounds.height))),
    };
    const resizingWidth = event.altKey && axis === "x";
    const resizingHeight = event.altKey && axis === "y";
    const constraints = interactionConstraints(
      baseConstraints,
      rawRect,
      resizingWidth,
      resizingHeight,
    );
    const rect = clampRect(rawRect, constraints, bounds);
    const step = event.shiftKey ? 0.05 : 0.01;
    if (event.altKey) {
      const resizeDirection = axis === "x" ? "e" : "s";
      if (!constraints.allowedResize.includes(resizeDirection)) return;
      const dimension = axis === "x" ? "width" : "height";
      const maximum = axis === "x"
        ? Math.min(constraints.maxSize.width, bounds.x + bounds.width - rect.x)
        : Math.min(constraints.maxSize.height, bounds.y + bounds.height - rect.y);
      const minimum = axis === "x" ? constraints.minSize.width : constraints.minSize.height;
      rect[dimension] = Math.min(maximum, Math.max(minimum, rect[dimension] + direction * step));
    } else {
      if (!constraints.movementAxes.includes(axis)) return;
      rect[axis] = axis === "x"
        ? Math.min(bounds.x + bounds.width - rect.width, Math.max(bounds.x, rect.x + direction * step))
        : Math.min(bounds.y + bounds.height - rect.height, Math.max(bounds.y, rect.y + direction * step));
    }
    applyRect({
      pointerId: -1,
      nodeId: node.nodeId,
      viewport: activeViewport,
      operation: event.altKey ? "resize" : "move",
      resizeDirection: event.altKey ? axis === "x" ? "e" : "s" : undefined,
      startClientX: 0,
      startClientY: 0,
      startRect: rect,
      frameWidth: Math.max(1, frameBounds.width),
      frameHeight: Math.max(1, frameBounds.height),
      frameOffsetX: 0,
      frameOffsetY: 0,
      lockRatio: false,
      constraints,
      bounds,
      sourceWindow: event.currentTarget.ownerDocument.defaultView ?? window,
      snapX: [],
      snapY: [],
    }, rect);
    setLiveMessage(event.altKey ? "对象大小已调整" : "对象位置已调整");
    event.preventDefault();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const layoutDrag = layoutDragRef.current;
    if (layoutDrag && layoutDrag.pointerId === event.pointerId) {
      const dx = (event.clientX - layoutDrag.startClientX) / layoutDrag.frameWidth;
      const dy = (event.clientY - layoutDrag.startClientY) / layoutDrag.frameHeight;
      let rect = { ...layoutDrag.startRect };
      if (layoutDrag.operation === "move") {
        if (layoutDrag.constraints.movementAxes.includes("x")) {
          rect.x = Math.min(layoutDrag.bounds.x + layoutDrag.bounds.width - rect.width, Math.max(layoutDrag.bounds.x, rect.x + dx));
        }
        if (layoutDrag.constraints.movementAxes.includes("y")) {
          rect.y = Math.min(layoutDrag.bounds.y + layoutDrag.bounds.height - rect.height, Math.max(layoutDrag.bounds.y, rect.y + dy));
        }
      } else {
        rect = resizeRectFromHandle(
          layoutDrag.startRect,
          layoutDrag.resizeDirection ?? "se",
          dx,
          dy,
          layoutDrag.lockRatio,
          layoutDrag.constraints,
          layoutDrag.bounds,
        );
      }
      const guides: ActiveGuides = {};
      if (!event.altKey) {
        const thresholdX = SNAP_THRESHOLD_PX / layoutDrag.frameWidth;
        const thresholdY = SNAP_THRESHOLD_PX / layoutDrag.frameHeight;
        if (layoutDrag.operation === "move") {
          const xMatch = nearestSnap(
            [
              { value: rect.x, offset: 0 },
              { value: rect.x + rect.width / 2, offset: rect.width / 2 },
              { value: rect.x + rect.width, offset: rect.width },
            ],
            layoutDrag.snapX,
            thresholdX,
          );
          const yMatch = nearestSnap(
            [
              { value: rect.y, offset: 0 },
              { value: rect.y + rect.height / 2, offset: rect.height / 2 },
              { value: rect.y + rect.height, offset: rect.height },
            ],
            layoutDrag.snapY,
            thresholdY,
          );
          if (xMatch) {
            rect.x = xMatch.value;
            guides.x = { position: xMatch.candidate.value, kind: xMatch.candidate.kind };
          }
          if (yMatch) {
            rect.y = yMatch.value;
            guides.y = { position: yMatch.candidate.value, kind: yMatch.candidate.kind };
          }
        } else {
          const direction = layoutDrag.resizeDirection ?? "se";
          const changesLeft = direction.includes("w");
          const changesRight = direction.includes("e");
          const changesTop = direction.includes("n");
          const changesBottom = direction.includes("s");
          const xMatch = changesLeft
            ? nearestSnap([{ value: rect.x, offset: 0 }], layoutDrag.snapX, thresholdX)
            : changesRight
              ? nearestSnap(
                  [{ value: rect.x + rect.width, offset: rect.x }],
                  layoutDrag.snapX,
                  thresholdX,
                )
              : undefined;
          const yMatch = layoutDrag.lockRatio || (!changesTop && !changesBottom)
            ? undefined
            : changesTop
              ? nearestSnap([{ value: rect.y, offset: 0 }], layoutDrag.snapY, thresholdY)
              : nearestSnap(
                  [{ value: rect.y + rect.height, offset: rect.y }],
                  layoutDrag.snapY,
                  thresholdY,
                );
          if (xMatch) {
            if (changesLeft) {
              const right = rect.x + rect.width;
              rect.x = Math.min(right - MIN_VISUAL_NODE_SIZE, xMatch.value);
              rect.width = right - rect.x;
            } else {
              rect.width = Math.max(MIN_VISUAL_NODE_SIZE, xMatch.value);
            }
            guides.x = { position: xMatch.candidate.value, kind: xMatch.candidate.kind };
            if (layoutDrag.lockRatio && (changesTop || changesBottom)) {
              const ratio = layoutDrag.startRect.width / Math.max(0.01, layoutDrag.startRect.height);
              const nextHeight = rect.width / ratio;
              if (changesTop) rect.y += rect.height - nextHeight;
              rect.height = nextHeight;
            }
          }
          if (yMatch) {
            if (changesTop) {
              const bottom = rect.y + rect.height;
              rect.y = Math.min(bottom - MIN_VISUAL_NODE_SIZE, yMatch.value);
              rect.height = bottom - rect.y;
            } else {
              rect.height = Math.max(MIN_VISUAL_NODE_SIZE, yMatch.value);
            }
            guides.y = { position: yMatch.candidate.value, kind: yMatch.candidate.kind };
          }
        }
      }
      const boundedRect = clampRect(rect, layoutDrag.constraints, layoutDrag.bounds);
      setActiveGuides(guides);
      layoutDrag.pendingRect = boundedRect;
      if (!layoutDrag.frameId) {
        layoutDrag.frameId = layoutDrag.sourceWindow.requestAnimationFrame(() => {
          const current = layoutDragRef.current;
          if (current?.pendingRect) applyRect(current, current.pendingRect, "update");
          if (current) current.frameId = undefined;
        });
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const focus = {
      x: Math.min(100, Math.max(0, drag.startFocusX - ((event.clientX - drag.startClientX) / drag.width) * 100)),
      y: Math.min(100, Math.max(0, drag.startFocusY - ((event.clientY - drag.startClientY) / drag.height) * 100)),
    };
    drag.pendingFocus = focus;
    // 设计模式中的真实媒体会被槽位占位层隐藏；这里仅缓存最后焦点，
    // pointerup 时一次提交。若在 pointermove 中触发 React 预览重绘，Puck
    // 会重建当前渲染子树并提前释放 pointer capture，导致完整编辑器丢手势。
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const clearSuppressedClick = () => {
      const sourceWindow = event.currentTarget.ownerDocument.defaultView ?? window;
      sourceWindow.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };
    const layoutDrag = layoutDragRef.current;
    if (layoutDrag && layoutDrag.pointerId === event.pointerId) {
      if (layoutDrag.frameId) layoutDrag.sourceWindow.cancelAnimationFrame(layoutDrag.frameId);
      layoutDragRef.current = null;
      if (layoutDrag.pendingRect) applyRect(layoutDrag, layoutDrag.pendingRect);
      else {
        gesturePreviewRef.current = null;
        setGesturePreview(null);
        setGesturePhase("idle");
      }
      setActiveGuides({});
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      clearSuppressedClick();
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.frameId) drag.sourceWindow.cancelAnimationFrame(drag.frameId);
    dragRef.current = null;
    if (drag.pendingFocus) applyFocus(drag, drag.pendingFocus);
    else {
      gesturePreviewRef.current = null;
      setGesturePreview(null);
      setGesturePhase("idle");
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    clearSuppressedClick();
  };

  const cancelPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointerId = layoutDragRef.current?.pointerId ?? dragRef.current?.pointerId;
    if (pointerId !== event.pointerId) return;
    cancelActiveGesture(true);
    const sourceWindow = event.currentTarget.ownerDocument.defaultView ?? window;
    sourceWindow.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const handleLostPointerCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointerId = layoutDragRef.current?.pointerId ?? dragRef.current?.pointerId;
    if (pointerId !== event.pointerId) return;
    cancelActiveGesture(true);
  };

  return (
    <ContentTemplateFrameView
      moduleType={moduleType}
      mode={mode}
      props={props}
      contract={contract}
      layout={layout}
      scopeId={scopeId}
      instanceCss={instanceCss}
      instanceLayout={instanceLayout}
      instanceFrame={instanceFrame}
      childEditMode
      ensureContractActions
      editor={{
        rootRef,
        blockId,
        editorMode: editorModeHere,
        panelMode: panelModeHere,
        viewport: activeViewport,
        selectedNodeId: selectedHere?.nodeId,
        snapActive: Boolean(activeGuides.x || activeGuides.y),
        gesturePhase: gesturePhase !== "idle" ? gesturePhase : undefined,
        mediaFocusEnabled: Boolean(
          selectedHere && editorMode === "adjust-media" && canDragMediaFocus,
        ),
        selectionCss: selectedHere
          ? `${nodeSelector(selectedHere.nodeId)}{outline:1px solid #335F7D!important;outline-offset:-1px;cursor:${editorMode === "adjust-layout" ? "move" : editorMode === "adjust-media" && (selectedHere.kind === "media" || selectedHere.kind === "product") && canDragMediaFocus ? "grab" : "pointer"}}`
          : undefined,
        liveMessage,
        handlers: {
          onPointerDownCapture: handlePointerDown,
          onClickCapture: handleClick,
          onPointerMove: handlePointerMove,
          onPointerUp: finishPointerDrag,
          onPointerCancel: cancelPointerDrag,
          onLostPointerCapture: handleLostPointerCapture,
          onKeyDownCapture: handleKeyDown,
        },
      }}
    >
      {children}
    </ContentTemplateFrameView>
  );
}
