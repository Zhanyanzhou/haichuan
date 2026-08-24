import { cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode } from "react";
import {
  CheckOutlined,
  DragOutlined,
  MinusOutlined,
  PictureOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  contentTemplateObjectHasCapability,
  findContentTemplateEditableObject,
  getContentTemplateContract,
  type ContentTemplateContract,
} from "../generated/contentTemplates.generated";
import {
  ContentTemplateLayoutStyles,
  getContentTemplateLayout,
  templateLayoutVars,
} from "../layout/contentTemplateLayouts";
import { resolveVisualNode, setVisualOverridePath } from "./visualLayout";
import {
  sendCanvasVisualEdit,
  useVisualEditorSession,
  type VisualNodeKind,
} from "../visual-editor/visualEditorSession";

interface ContentTemplateContractFrameProps {
  moduleType: string;
  mode: "editor" | "public";
  props?: Record<string, unknown>;
  children: ReactNode;
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
  color: var(--hc-contract-ink);
  background: var(--hc-contract-canvas);
  isolation: isolate;
}
.hc-contract-frame--editor[data-contract-tone="dark"] {
  --hc-contract-canvas: #181A1B;
  --hc-contract-surface: #181A1B;
  --hc-contract-surface-strong: #181A1B;
  --hc-contract-ink: #F7F8F8;
  --hc-contract-muted: #DDE1E2;
  --hc-contract-line: #5F6568;
}
.hc-contract-frame--editor:not([data-content-template-module="视频区块"]) > :where(section, div),
.hc-contract-frame--editor:not([data-content-template-module="视频区块"]) :where(section.hc-section) {
  background: var(--hc-contract-canvas) !important;
  color: var(--hc-contract-ink) !important;
}
.hc-contract-frame--editor:not([data-content-template-module="视频区块"]) :where(h1, h2, h3, h4, p, strong, small, figcaption) {
  color: inherit !important;
}
.hc-contract-frame--editor :where([class*="empty"], [class*="placeholder"]) {
  border-color: var(--hc-contract-line) !important;
  background: var(--hc-contract-surface) !important;
  box-shadow: none !important;
}
.hc-contract-frame--editor :where([aria-current="true"], [class*="pagination"], [class*="handle"], [class*="hotspot"], [class*="action"], [class*="countdown"]) {
  --hc-gold: var(--hc-contract-accent);
}
.hc-contract-frame--editor :where(article, figure, [class*="card"]) {
  box-shadow: none !important;
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
@media (max-width: 767px) {
  .hc-contract-frame--editor { overflow-x: clip; }
}
.hc-contract-frame--editor [data-hc-editor-overlay] {
  position: absolute;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  isolation: isolate;
}
.hc-contract-frame--editor [data-hc-selection-box] {
  position: absolute;
  border: 1px solid #335F7D;
  box-shadow: 0 0 0 1px rgba(255,255,255,.82);
  pointer-events: none;
  z-index: 2;
}
.hc-contract-frame--editor [data-hc-node-hud] {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: calc(100% - 8px);
  padding: 4px;
  border: 1px solid #DDE1E2;
  border-radius: 5px;
  background: #FFFFFF;
  box-shadow: 0 6px 18px rgba(24,26,27,.12);
  color: #181A1B;
  pointer-events: auto;
  z-index: 4;
  white-space: nowrap;
}
.hc-contract-frame--editor [data-hc-node-hud][data-placement="above"] {
  transform: translateY(-100%);
}
.hc-contract-frame--editor [data-hc-node-hud] button {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 4px 8px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  pointer-events: auto;
}
.hc-contract-frame--editor [data-hc-node-hud] button:hover,
.hc-contract-frame--editor [data-hc-node-hud] button:focus-visible,
.hc-contract-frame--editor [data-hc-node-hud] button[aria-pressed="true"] {
  background: #EEF3F6;
  color: #335F7D;
  outline: none;
}
.hc-contract-frame--editor [data-hc-node-hud] button:focus-visible {
  box-shadow: inset 0 0 0 1px #335F7D;
}
.hc-contract-frame--editor [data-hc-node-hud] button:disabled {
  color: #9AA0A3;
  cursor: not-allowed;
}
.hc-contract-frame--editor [data-hc-resize-handle] {
  position: absolute;
  width: 12px;
  height: 12px;
  padding: 0;
  border: 1px solid #335F7D;
  border-radius: 1px;
  background: #FFFFFF;
  box-shadow: 0 0 0 1px rgba(255,255,255,.78);
  transform: translate(-50%,-50%);
  z-index: 3;
  pointer-events: auto;
}
.hc-contract-frame--editor [data-hc-resize-handle][data-resize-direction="n"],
.hc-contract-frame--editor [data-hc-resize-handle][data-resize-direction="s"] { cursor: ns-resize; }
.hc-contract-frame--editor [data-hc-resize-handle][data-resize-direction="e"],
.hc-contract-frame--editor [data-hc-resize-handle][data-resize-direction="w"] { cursor: ew-resize; }
.hc-contract-frame--editor [data-hc-resize-handle][data-resize-direction="ne"],
.hc-contract-frame--editor [data-hc-resize-handle][data-resize-direction="sw"] { cursor: nesw-resize; }
.hc-contract-frame--editor [data-hc-resize-handle][data-resize-direction="nw"],
.hc-contract-frame--editor [data-hc-resize-handle][data-resize-direction="se"] { cursor: nwse-resize; }
.hc-contract-frame--editor [data-hc-snap-guide] {
  position: absolute;
  z-index: 1;
  pointer-events: none;
  background: #335F7D;
}
.hc-contract-frame--editor [data-hc-snap-guide][data-axis="x"] {
  top: 0;
  bottom: 0;
  width: 1px;
}
.hc-contract-frame--editor [data-hc-snap-guide][data-axis="y"] {
  left: 0;
  right: 0;
  height: 1px;
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

type SelectionOverlayBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  hudLeft: number;
  hudTop: number;
  hudPlacement: "above" | "below" | "inside";
};

function getVisualNodeKind(
  contract: ContentTemplateContract | undefined,
  nodeId: string,
): VisualNodeKind | undefined {
  const kind = findContentTemplateEditableObject(contract, nodeId)?.kind;
  if (kind === "media" || kind === "video") return "media";
  if (kind === "text" || kind === "action" || kind === "product") return kind;
  if (kind === "collection") return "structured";
  return undefined;
}

type GesturePreviewState = {
  overrides: InstanceValue | undefined;
  phase: "update" | "commit";
};

const SNAP_THRESHOLD_PX = 6;
const MIN_VISUAL_NODE_SIZE = 0.01;
const HUD_ESTIMATED_WIDTH = 252;
const HUD_ESTIMATED_HEIGHT = 40;

const RESIZE_HANDLES: ReadonlyArray<{
  direction: ResizeDirection;
  label: string;
  x: 0 | 0.5 | 1;
  y: 0 | 0.5 | 1;
}> = [
  { direction: "nw", label: "左上角", x: 0, y: 0 },
  { direction: "n", label: "上边", x: 0.5, y: 0 },
  { direction: "ne", label: "右上角", x: 1, y: 0 },
  { direction: "e", label: "右边", x: 1, y: 0.5 },
  { direction: "se", label: "右下角", x: 1, y: 1 },
  { direction: "s", label: "下边", x: 0.5, y: 1 },
  { direction: "sw", label: "左下角", x: 0, y: 1 },
  { direction: "w", label: "左边", x: 0, y: 0.5 },
];

function clampRect(rect: { x: number; y: number; width: number; height: number }) {
  const width = Math.min(1, Math.max(MIN_VISUAL_NODE_SIZE, rect.width));
  const height = Math.min(1, Math.max(MIN_VISUAL_NODE_SIZE, rect.height));
  return {
    x: Math.min(1 - width, Math.max(0, rect.x)),
    y: Math.min(1 - height, Math.max(0, rect.y)),
    width,
    height,
  };
}

function resizeRectFromHandle(
  start: { x: number; y: number; width: number; height: number },
  direction: ResizeDirection,
  dx: number,
  dy: number,
  lockRatio: boolean,
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

  left = Math.min(right - MIN_VISUAL_NODE_SIZE, Math.max(0, left));
  right = Math.max(left + MIN_VISUAL_NODE_SIZE, Math.min(1, right));
  top = Math.min(bottom - MIN_VISUAL_NODE_SIZE, Math.max(0, top));
  bottom = Math.max(top + MIN_VISUAL_NODE_SIZE, Math.min(1, bottom));

  if (lockRatio && (changesLeft || changesRight) && (changesTop || changesBottom)) {
    const ratio = start.width / Math.max(MIN_VISUAL_NODE_SIZE, start.height);
    let width = right - left;
    let height = bottom - top;
    const widthDelta = Math.abs(width - start.width);
    const heightDeltaAsWidth = Math.abs(height - start.height) * ratio;
    if (widthDelta >= heightDeltaAsWidth) height = width / ratio;
    else width = height * ratio;

    const maxWidth = changesLeft ? right : 1 - left;
    const maxHeight = changesTop ? bottom : 1 - top;
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
  });
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

function findModuleFrameElement(element: HTMLElement, root: HTMLElement) {
  let frameElement = element;
  while (frameElement.parentElement && frameElement.parentElement !== root) {
    frameElement = frameElement.parentElement;
  }
  return frameElement.parentElement === root ? frameElement : root;
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

function createInstanceCss(
  contract: ContentTemplateContract,
  overrides: Record<string, unknown> | undefined,
  scopeId: string,
) {
  if (!overrides) return "";
  const capabilities = contract.editorCapabilities.layoutOverrides ?? {};
  const root = `[data-hc-instance="${scopeId}"]`;
  const rules: string[] = [];
  if (overrides.version === 2) {
    const frame = isRecord(overrides.frame) ? overrides.frame : {};
    if (
      allowed(frame.heightPreset, capabilities.framePresets) &&
      FRAME_CSS[String(frame.heightPreset)]
    ) {
      rules.push(`${root}>:where(section,div){min-height:${FRAME_CSS[String(frame.heightPreset)]}!important}`);
    }
    const aspectRatios = isRecord(frame.aspectRatioByViewport)
      ? frame.aspectRatioByViewport
      : {};
    const legacyAspectRatio = Number(frame.aspectRatio);
    const desktopAspectRatio = Number(aspectRatios.desktop ?? legacyAspectRatio);
    const mobileAspectRatio = Number(aspectRatios.mobile ?? aspectRatios.desktop ?? legacyAspectRatio);
    const frameAspectRule = (ratio: number) => Number.isFinite(ratio) && ratio >= 0.25 && ratio <= 4
      ? `aspect-ratio:${ratio};min-height:0!important;position:relative;overflow:hidden`
      : "";
    const desktopFrameAspect = frameAspectRule(desktopAspectRatio);
    const mobileFrameAspect = frameAspectRule(mobileAspectRatio);
    if (desktopFrameAspect) rules.push(`@media (min-width:768px){${root}>:where(section,div){${desktopFrameAspect}}}`);
    if (mobileFrameAspect) rules.push(`@media (max-width:767px){${root}>:where(section,div){${mobileFrameAspect}}}`);
    const customColors = isRecord(frame.customColors) ? frame.customColors : {};
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
    const background = color(customColors.background);
    const text = color(customColors.text);
    const accent = color(customColors.accent);
    if (background || text || accent) {
      rules.push(`${root}{${background ? `--hc-instance-background:${background};` : ""}${text ? `--hc-instance-text:${text};` : ""}${accent ? `--hc-instance-accent:${accent};` : ""}}`);
      if (background) rules.push(`${root}>:where(section,div){background:var(--hc-instance-background)!important}`);
      if (text) rules.push(`${root} :where(h1,h2,h3,h4,p,span,a){color:var(--hc-instance-text)}`);
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
      const slotCapability = capabilities.slots?.find((slot) => slot.roleId === nodeId);
      const textCapability = capabilities.textRoles?.find((role) => role.roleId === nodeId);
      const editableObject = findContentTemplateEditableObject(contract, nodeId);
      if (!editableObject || (!slotCapability && !textCapability)) continue;
      const hasCapability = (capability: Parameters<typeof contentTemplateObjectHasCapability>[1]) =>
        contentTemplateObjectHasCapability(editableObject, capability);
      const selector = slotCapability
        ? `${root} :is([data-content-role="${nodeId}"],[data-content-role-desktop="${nodeId}"],[data-content-role-mobile="${nodeId}"])`
        : `${root} :is([data-content-role="${nodeId}"],[data-content-role-desktop="${nodeId}"],[data-content-role-mobile="${nodeId}"],[data-editor-field~="${nodeId}"])`;
      if (rawNode.enabled === false && hasCapability("visibility")) rules.push(`${selector}{display:none!important}`);
      const rectByViewport = isRecord(rawNode.rectByViewport) ? rawNode.rectByViewport : {};
      const zIndexByViewport = isRecord(rawNode.zIndexByViewport)
        ? rawNode.zIndexByViewport
        : {};
      const safeZIndex = (value: unknown) => {
        const numeric = Number(value);
        return Number.isInteger(numeric) && numeric >= 0 && numeric <= 20
          ? numeric
          : undefined;
      };
      const desktopZIndex = hasCapability("layer") ? safeZIndex(zIndexByViewport.desktop) : undefined;
      const mobileZIndex = hasCapability("layer")
        ? safeZIndex(zIndexByViewport.mobile) ?? desktopZIndex
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
        return `position:absolute!important;box-sizing:border-box!important;left:var(${visualNodeLayoutVar(nodeId, viewport, "left")},${x * 100}%)!important;top:var(${visualNodeLayoutVar(nodeId, viewport, "top")},${y * 100}%)!important;width:var(${visualNodeLayoutVar(nodeId, viewport, "width")},${width * 100}%)!important;height:var(${visualNodeLayoutVar(nodeId, viewport, "height")},${height * 100}%)!important;margin:0!important;max-width:none!important;z-index:${zIndex ?? 2}`;
      };
      const desktopRect = hasCapability("layout")
        ? rectRule(rectByViewport.desktop, desktopZIndex, "desktop")
        : "";
      const mobileRect = hasCapability("layout")
        ? rectRule(
            isRecord(rectByViewport.mobile) ? rectByViewport.mobile : rectByViewport.desktop,
            mobileZIndex,
            "mobile",
          )
        : "";
      if (desktopRect || mobileRect) rules.push(`${root}>:where(section,div){position:relative}`);
      if (desktopRect) rules.push(`@media (min-width:768px){${selector}{${desktopRect}}}`);
      if (mobileRect) rules.push(`@media (max-width:767px){${selector}{${mobileRect}}}`);
      if (!desktopRect && desktopZIndex !== undefined) {
        rules.push(`@media (min-width:768px){${selector}{position:relative;z-index:${desktopZIndex}!important}}`);
      }
      if (!mobileRect && mobileZIndex !== undefined) {
        rules.push(`@media (max-width:767px){${selector}{position:relative;z-index:${mobileZIndex}!important}}`);
      }
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
      const mobileFocus = hasCapability("focus") ? focusRule(focusByViewport.mobile) || desktopFocus : "";
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
      if (placement === "overlay" && contract.key === "fullBleed") {
        rules.push(`${root} > section{position:relative}${root} .hc-phase1-full-bleed__caption{position:absolute;z-index:2;inset:auto 0 0}`);
      }
      if (placement === "overlay" && contract.key === "limitedEvent") {
        rules.push(`${root} .hc-limited-event{position:relative}${selector}{position:absolute;z-index:2;inset:auto clamp(16px,3vw,40px) clamp(16px,3vw,40px)!important}`);
      }
    }
    if (declarations.length) rules.push(`${selector}{${declarations.join(";")}}`);
    if (capability.maxLines) {
      rules.push(`${selector} :where(h1,h2,h3,p){display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${capability.maxLines};overflow:hidden;overflow-wrap:anywhere}`);
    }
  }
  return rules.join("\n");
}

function resolveInstanceOverrides(
  contract: ContentTemplateContract,
  props: Record<string, unknown> | undefined,
) {
  const source = isRecord(props?.__instanceOverrides)
    ? props.__instanceOverrides
    : undefined;
  const legacyComposition = contract.key === "featuredProduct"
    ? props?.layout === "imageRight"
      ? "image-right"
      : props?.layout === "imageLeft"
        ? "image-left"
        : undefined
    : undefined;
  if (!legacyComposition) return source;

  if (!source) {
    return { version: 2, frame: { compositionPreset: legacyComposition } };
  }
  if (source.version === 2) {
    const frame = isRecord(source.frame) ? source.frame : {};
    if (typeof frame.compositionPreset === "string") return source;
    return { ...source, frame: { ...frame, compositionPreset: legacyComposition } };
  }
  if (source.version === 1) {
    const layout = isRecord(source.layout) ? source.layout : {};
    if (typeof layout.compositionPreset === "string") return source;
    return { ...source, layout: { ...layout, compositionPreset: legacyComposition } };
  }
  return source;
}

/**
 * 三条真实渲染链路共用的 schema v3 根框架。
 * 它只提供合同元数据、响应式比例变量与编辑画布中性表面；子节点始终是
 * adapter / 公开 Renderer 的真实输出，不在这里重新实现模板构图。
 */
export default function ContentTemplateContractFrame({
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
  const layerCommand = useVisualEditorSession((state) => state.layerCommand);
  const selectNode = useVisualEditorSession((state) => state.selectNode);
  const setEditorMode = useVisualEditorSession((state) => state.setMode);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  const dragRef = useRef<MediaDragState | null>(null);
  const layoutDragRef = useRef<LayoutDragState | null>(null);
  const suppressClickRef = useRef(false);
  const gesturePreviewRef = useRef<GesturePreviewState | null>(null);
  const handledLayerCommandRef = useRef(0);
  const [liveMessage, setLiveMessage] = useState("");
  const [activeGuides, setActiveGuides] = useState<ActiveGuides>({});
  const [selectionOverlay, setSelectionOverlay] = useState<SelectionOverlayBox | null>(null);
  const [gesturePreview, setGesturePreview] = useState<GesturePreviewState | null>(null);
  const [gesturePhase, setGesturePhase] = useState<GesturePhase>("idle");
  const blockId = typeof props?.id === "string" ? props.id : "";
  const selectedHere = mode === "editor" && selection?.blockId === blockId
    ? selection
    : null;
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
      contentTemplateObjectHasCapability(selectedEditableObject, "layout"),
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
  }, []);

  useEffect(() => {
    if (gesturePreview?.phase !== "commit") return;
    const current = isRecord(props?.__instanceOverrides)
      ? props.__instanceOverrides
      : undefined;
    if (JSON.stringify(current) !== JSON.stringify(gesturePreview.overrides)) return;
    gesturePreviewRef.current = null;
    setGesturePreview(null);
  }, [gesturePreview, props?.__instanceOverrides]);

  useEffect(() => {
    if (
      mode !== "editor" ||
      !contract ||
      !layerCommand ||
      layerCommand.blockId !== blockId ||
      handledLayerCommandRef.current === layerCommand.revision
    ) {
      return;
    }
    handledLayerCommandRef.current = layerCommand.revision;
    const editableObject = findContentTemplateEditableObject(contract, layerCommand.nodeId);
    const allowedNode = contentTemplateObjectHasCapability(editableObject, "layer");
    if (!allowedNode) return;
    const sourceWindow = rootRef.current?.ownerDocument.defaultView ?? window;
    const viewport = sourceWindow.innerWidth <= 767 ? "mobile" : "desktop";
    const currentZIndex = resolveVisualNode(
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
  }, [blockId, contract, layerCommand, mode, moduleType]);

  useEffect(() => {
    const root = rootRef.current;
    if (
      mode !== "editor" ||
      !selectedHere ||
      !root ||
      (!canAdjustLayout && !canAdjustMediaView)
    ) {
      setSelectionOverlay(null);
      return;
    }
    const matchesNode = (element: HTMLElement) => {
      const ids = [
        element.dataset.contentRole,
        element.dataset.contentRoleDesktop,
        element.dataset.contentRoleMobile,
        ...(element.dataset.editorField?.split(/\s+/) ?? []),
      ];
      return ids.includes(selectedHere.nodeId) && element.getClientRects().length > 0;
    };
    const target = Array.from(root.querySelectorAll<HTMLElement>(
      "[data-content-role],[data-content-role-desktop],[data-content-role-mobile],[data-editor-field]",
    )).find(matchesNode);
    if (!target) {
      setSelectionOverlay(null);
      return;
    }
    const updateOverlay = () => {
      const rootBounds = root.getBoundingClientRect();
      const targetBounds = target.getBoundingClientRect();
      const left = targetBounds.left - rootBounds.left;
      const top = targetBounds.top - rootBounds.top;
      const width = targetBounds.width;
      const height = targetBounds.height;
      const belowTop = top + height + 8;
      const hudPlacement = top >= HUD_ESTIMATED_HEIGHT + 8
        ? "above" as const
        : belowTop + HUD_ESTIMATED_HEIGHT <= rootBounds.height
          ? "below" as const
          : "inside" as const;
      const hudTop = hudPlacement === "above"
        ? top - 8
        : hudPlacement === "below"
          ? belowTop
          : Math.max(4, Math.min(top + 8, rootBounds.height - HUD_ESTIMATED_HEIGHT - 4));
      setSelectionOverlay({
        left,
        top,
        width,
        height,
        hudLeft: Math.max(
          4,
          Math.min(left, Math.max(4, rootBounds.width - HUD_ESTIMATED_WIDTH - 4)),
        ),
        hudTop,
        hudPlacement,
      });
    };
    updateOverlay();
    const ownerWindow = root.ownerDocument.defaultView;
    const ResizeObserverConstructor = ownerWindow?.ResizeObserver;
    const observer = ResizeObserverConstructor
      ? new ResizeObserverConstructor(updateOverlay)
      : undefined;
    observer?.observe(root);
    observer?.observe(target);
    ownerWindow?.addEventListener("resize", updateOverlay);
    ownerWindow?.addEventListener("scroll", updateOverlay, true);
    return () => {
      observer?.disconnect();
      ownerWindow?.removeEventListener("resize", updateOverlay);
      ownerWindow?.removeEventListener("scroll", updateOverlay, true);
    };
  }, [canAdjustLayout, canAdjustMediaView, gesturePreview, mode, props, selectedHere]);

  useEffect(() => {
    if (!selectedHere) return;
    if (editorMode === "adjust-media" && !canAdjustMediaView) setEditorMode("select");
    if (editorMode === "adjust-layout" && !canAdjustLayout) setEditorMode("select");
  }, [canAdjustLayout, canAdjustMediaView, editorMode, selectedHere, setEditorMode]);

  useEffect(() => {
    const root = rootRef.current;
    if (mode !== "editor" || !root || !contract) return;
    const allowedNodes = new Set(
      contract.editorCapabilities.editableObjects.flatMap((object) =>
        object.nodeIds ?? [object.roleId],
      ),
    );
    const touched: HTMLElement[] = [];
    root.querySelectorAll<HTMLElement>(
      "[data-content-role],[data-content-role-desktop],[data-content-role-mobile],[data-editor-field]",
    ).forEach((element) => {
      const nodeId = element.dataset.contentRole ||
        element.dataset.contentRoleDesktop ||
        element.dataset.contentRoleMobile ||
        element.dataset.editorField?.split(/\s+/).find(Boolean);
      if (!nodeId || !allowedNodes.has(nodeId)) return;
      const ancestor = element.parentElement?.closest<HTMLElement>(
        "[data-content-role],[data-content-role-desktop],[data-content-role-mobile]",
      );
      const ancestorNodeId = ancestor?.dataset.contentRole ||
        ancestor?.dataset.contentRoleDesktop ||
        ancestor?.dataset.contentRoleMobile;
      if (ancestorNodeId === nodeId && allowedNodes.has(ancestorNodeId)) return;
      const isAction = getVisualNodeKind(contract, nodeId) === "action";
      if (isAction) return;
      if (!element.hasAttribute("tabindex")) {
        element.tabIndex = 0;
        element.dataset.hcKeyboardTab = "true";
      }
      element.dataset.hcKeyboardNode = nodeId;
      if (!element.hasAttribute("aria-label")) {
        element.setAttribute("aria-label", `编辑画布对象 ${nodeId}`);
        element.dataset.hcKeyboardAria = "true";
      }
      touched.push(element);
    });
    return () => {
      touched.forEach((element) => {
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
      });
    };
  }, [blockId, contract, mode]);

  useEffect(() => {
    const root = rootRef.current;
    if (
      mode !== "editor" ||
      !root ||
      !selection ||
      selection.blockId !== blockId ||
      editorMode === "select"
    ) {
      return;
    }
    const ownerWindow = root.ownerDocument.defaultView;
    if (!ownerWindow) return;
    setLiveMessage(
      editorMode === "adjust-media"
        ? canDragMediaFocus
          ? "已进入图片画面调整，使用方向键移动焦点，按 Shift 加方向键可大幅调整，按 Escape 退出"
          : "已进入图片显示调整，可使用画布工具调整显示方式和缩放，按 Escape 退出"
        : "已进入对象位置调整，使用方向键移动，按 Alt 加方向键调整大小，按 Escape 退出",
    );
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
  }, [blockId, canDragMediaFocus, editorMode, mode, selection]);

  useEffect(() => {
    const root = rootRef.current;
    const ownerDocument = root?.ownerDocument;
    const ownerWindow = root?.ownerDocument.defaultView;
    const cancelInteraction = () => cancelActiveGesture(true);
    ownerWindow?.addEventListener("resize", cancelInteraction);
    ownerWindow?.addEventListener("blur", cancelInteraction);
    return () => {
      ownerWindow?.removeEventListener("resize", cancelInteraction);
      ownerWindow?.removeEventListener("blur", cancelInteraction);
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
  }, [blockId, cancelActiveGesture]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !contract || !layout) return;
    const ownerWindow = root.ownerDocument.defaultView;
    const appliedVariables = new Set<string>();
    const visualProps = gesturePreview
      ? { ...props, __instanceOverrides: gesturePreview.overrides }
      : props;
    const nodeIds = new Set(
      contract.editorCapabilities.editableObjects.flatMap((object) =>
        object.nodeIds ?? [object.roleId],
      ),
    );

    const clearVariables = () => {
      appliedVariables.forEach((name) => root.style.removeProperty(name));
      appliedVariables.clear();
    };
    const syncLayoutVariables = () => {
      clearVariables();
      const viewport = (ownerWindow?.innerWidth ?? 1024) <= 767
        ? "mobile" as const
        : "desktop" as const;
      const candidates = Array.from(root.querySelectorAll<HTMLElement>(
        "[data-content-role],[data-content-role-desktop],[data-content-role-mobile],[data-editor-field]",
      ));
      nodeIds.forEach((nodeId) => {
        const rect = resolveVisualNode(visualProps, nodeId, viewport).rect;
        if (!rect) return;
        const target = candidates.find((element) => {
          if (element.getClientRects().length === 0) return false;
          const ids = [
            viewport === "mobile"
              ? element.dataset.contentRoleMobile
              : element.dataset.contentRoleDesktop,
            element.dataset.contentRole,
            ...(element.dataset.editorField?.split(/\s+/) ?? []),
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
        const frameBounds = frameElement.getBoundingClientRect();
        const containingBounds = containingBlock.getBoundingClientRect();
        const values = {
          left: frameBounds.left - containingBounds.left + rect.x * frameBounds.width,
          top: frameBounds.top - containingBounds.top + rect.y * frameBounds.height,
          width: rect.width * frameBounds.width,
          height: rect.height * frameBounds.height,
        };
        (Object.entries(values) as Array<[keyof typeof values, number]>).forEach(
          ([axis, value]) => {
            const name = visualNodeLayoutVar(nodeId, viewport, axis);
            root.style.setProperty(name, `${value}px`);
            appliedVariables.add(name);
          },
        );
      });
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
      clearVariables();
    };
  }, [contract, gesturePreview, layout, props]);

  if (!contract || !layout) return <>{children}</>;
  const scopeId = `hc-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const previewProps = gesturePreview
    ? { ...props, __instanceOverrides: gesturePreview.overrides }
    : props;
  const instanceOverrides = resolveInstanceOverrides(contract, previewProps);
  const instanceCss = createInstanceCss(contract, instanceOverrides, scopeId);
  const instanceLayout = isRecord(instanceOverrides?.layout)
    ? instanceOverrides.layout
    : {};
  const instanceFrame = isRecord(instanceOverrides?.frame)
    ? instanceOverrides.frame
    : {};

  const nodeSelector = (nodeId: string) =>
    `[data-hc-instance="${scopeId}"] :is([data-content-role="${nodeId}"],[data-content-role-desktop="${nodeId}"],[data-content-role-mobile="${nodeId}"],[data-editor-field~="${nodeId}"])`;

  const findFrameElement = findModuleFrameElement;

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
      "[data-content-role],[data-content-role-desktop],[data-content-role-mobile],[data-editor-field]",
    ).forEach((element) => {
      if (element.getClientRects().length === 0 || findFrameElement(element, root) !== frameElement) return;
      const nodeId =
        (viewport === "mobile"
          ? element.dataset.contentRoleMobile
          : element.dataset.contentRoleDesktop) ||
        element.dataset.contentRole ||
        element.dataset.contentRoleDesktop ||
        element.dataset.contentRoleMobile ||
        element.dataset.editorField?.split(/\s+/).find(Boolean);
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
        const nodeId =
          (activeViewport === "mobile"
            ? roleElement.dataset.contentRoleMobile
            : roleElement.dataset.contentRoleDesktop) ||
          roleElement.dataset.contentRole ||
          roleElement.dataset.contentRoleDesktop ||
          roleElement.dataset.contentRoleMobile;
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
    const directRoleId = directRoleElement?.dataset.contentRole ||
      (activeViewport === "mobile"
        ? directRoleElement?.dataset.contentRoleMobile
        : directRoleElement?.dataset.contentRoleDesktop) ||
      directRoleElement?.dataset.contentRoleDesktop ||
      directRoleElement?.dataset.contentRoleMobile;
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
    const fieldKind = fieldId ? getVisualNodeKind(contract, fieldId) : undefined;
    if (fieldId && fieldElement && fieldKind) {
      const kind: VisualNodeKind = fieldKind;
      return { nodeId: fieldId, kind, element: fieldElement };
    }
    const roleElement = target.closest<HTMLElement>(
      "[data-content-role],[data-content-role-desktop],[data-content-role-mobile]",
    );
    const roleId = roleElement?.dataset.contentRole ||
      (activeViewport === "mobile"
        ? roleElement?.dataset.contentRoleMobile
        : roleElement?.dataset.contentRoleDesktop) ||
      roleElement?.dataset.contentRoleDesktop ||
      roleElement?.dataset.contentRoleMobile;
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
      return;
    }
    sendCanvasVisualEdit({ blockId, moduleType, overrides: next }, drag.sourceWindow);
    retainCommittedPreview(next);
  };

  const applyRect = (
    drag: LayoutDragState,
    rect: { x: number; y: number; width: number; height: number },
    phase: "update" | "commit" = "commit",
  ) => {
    const next = setVisualOverridePath(
      propsRef.current?.__instanceOverrides,
      ["nodes", drag.nodeId, "rectByViewport", drag.viewport],
      rect,
    );
    if (phase === "update") {
      previewGesture(next);
      return;
    }
    sendCanvasVisualEdit({ blockId, moduleType, overrides: next }, drag.sourceWindow);
    retainCommittedPreview(next);
  };

  const commitVisualPath = (path: string[], value: unknown, message: string) => {
    const sourceWindow = rootRef.current?.ownerDocument.defaultView ?? window;
    const next = setVisualOverridePath(
      gesturePreviewRef.current?.overrides ?? propsRef.current?.__instanceOverrides,
      path,
      value,
    );
    sendCanvasVisualEdit({ blockId, moduleType, overrides: next }, sourceWindow);
    setLiveMessage(message);
  };

  const handleHudMode = (nextMode: "adjust-layout" | "adjust-media") => {
    cancelActiveGesture(false);
    setEditorMode(nextMode);
    setLiveMessage(
      nextMode === "adjust-layout"
        ? "已进入对象位置与大小调整"
        : canDragMediaFocus
          ? "已进入图片构图调整，可拖动画面调整焦点"
          : "已进入图片显示调整",
    );
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mode !== "editor" || !blockId || !isHtmlElement(event.target)) return;
    const requestedHudMode = event.target
      .closest<HTMLElement>("[data-hc-hud-mode]")
      ?.dataset.hcHudMode;
    if (requestedHudMode === "select") {
      cancelActiveGesture(false);
      setEditorMode("select");
      setLiveMessage("已完成画布调整");
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (requestedHudMode === "adjust-layout" || requestedHudMode === "adjust-media") {
      handleHudMode(requestedHudMode);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.target.closest("[data-hc-node-hud]")) return;
    const sourceWindow = event.currentTarget.ownerDocument.defaultView ?? window;
    const activeViewport = sourceWindow.innerWidth <= 767 ? "mobile" : "desktop";
    const resizeHandleElement = event.target.closest<HTMLElement>("[data-hc-resize-handle]");
    const resizeDirection = resizeHandleElement?.dataset.resizeDirection as ResizeDirection | undefined;
    const forcedNodeId = resizeHandleElement?.dataset.nodeId;
    const forcedNodeElement = forcedNodeId
      ? Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          "[data-content-role],[data-content-role-desktop],[data-content-role-mobile],[data-editor-field]",
        )).find((element) => {
          const ids = [
            element.dataset.contentRole,
            element.dataset.contentRoleDesktop,
            element.dataset.contentRoleMobile,
            ...(element.dataset.editorField?.split(/\s+/) ?? []),
          ];
          return ids.includes(forcedNodeId) && element.getClientRects().length > 0;
        })
      : undefined;
    const forcedVisualKind = forcedNodeId
      ? getVisualNodeKind(contract, forcedNodeId)
      : undefined;
    const node = forcedNodeId && forcedNodeElement
      ? {
          nodeId: forcedNodeId,
          kind: forcedVisualKind ?? "text",
          element: forcedNodeElement,
        }
      : findVisualNode(event.target, activeViewport);
    if (!node) return;
    selectNode({ blockId, moduleType, nodeId: node.nodeId, kind: node.kind });
    const activeMode = useVisualEditorSession.getState().mode;
    const visualCapabilities = contract.editorCapabilities.layoutOverrides;
    const editableObject = findContentTemplateEditableObject(contract, node.nodeId);
    const layoutAllowed = Boolean(
      contentTemplateObjectHasCapability(editableObject, "layout") && (
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
    if (activeMode === "adjust-layout") {
      if (!layoutAllowed) return;
      const nodeBounds = node.element.getBoundingClientRect();
      // 根框架前面会插入合同样式节点，firstElementChild 因此可能是零尺寸
      // <style>。从当前槽位向上找到框架的直接内容子节点，才能按真实模板
      // 构图计算初始矩形；否则会把文字错误扩成 100% × 100%。
      const frameElement = findFrameElement(node.element, event.currentTarget);
      const frameBounds = frameElement.getBoundingClientRect();
      const rootBounds = event.currentTarget.getBoundingClientRect();
      const snapCandidates = collectSnapCandidates(
        event.currentTarget,
        frameElement,
        node.nodeId,
        activeViewport,
      );
      const effective = resolveVisualNode(props, node.nodeId, activeViewport);
      const derivedRect = {
        x: Math.min(1, Math.max(0, (nodeBounds.left - frameBounds.left) / Math.max(1, frameBounds.width))),
        y: Math.min(1, Math.max(0, (nodeBounds.top - frameBounds.top) / Math.max(1, frameBounds.height))),
        width: Math.min(1, Math.max(MIN_VISUAL_NODE_SIZE, nodeBounds.width / Math.max(1, frameBounds.width))),
        height: Math.min(1, Math.max(MIN_VISUAL_NODE_SIZE, nodeBounds.height / Math.max(1, frameBounds.height))),
      };
      const startRect = effective.rect ?? derivedRect;
      const operation = resizeHandleElement ||
        (event.clientX >= nodeBounds.right - 20 && event.clientY >= nodeBounds.bottom - 20)
        ? "resize" as const
        : "move" as const;
      layoutDragRef.current = {
        pointerId: event.pointerId,
        nodeId: node.nodeId,
        viewport: activeViewport,
        operation,
        resizeDirection: operation === "resize" ? resizeDirection ?? "se" : undefined,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startRect,
        frameWidth: Math.max(1, frameBounds.width),
        frameHeight: Math.max(1, frameBounds.height),
        frameOffsetX: frameBounds.left - rootBounds.left,
        frameOffsetY: frameBounds.top - rootBounds.top,
        lockRatio: event.shiftKey,
        sourceWindow,
        snapX: snapCandidates.x,
        snapY: snapCandidates.y,
      };
      gesturePreviewRef.current = null;
      suppressClickRef.current = true;
      setGesturePreview(null);
      setGesturePhase("begin");
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
    const effective = resolveVisualNode(props, node.nodeId, activeViewport);
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
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (mode !== "editor" || !blockId || !isHtmlElement(event.target)) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.target.closest("[data-hc-node-hud]")) return;
    if (event.target.closest("a,button,video")) {
      event.preventDefault();
      event.stopPropagation();
    }
    const sourceWindow = event.currentTarget.ownerDocument.defaultView ?? window;
    const activeViewport = sourceWindow.innerWidth <= 767 ? "mobile" : "desktop";
    const node = findVisualNode(event.target, activeViewport);
    if (!node) return;
    // Puck 会在外层组件的 pointerdown 阶段处理 itemSelector；select 模式下
    // 再用 click 落实一次视觉节点选择，避免同一轮重挂把 pointerdown 选择吞掉。
    selectNode({ blockId, moduleType, nodeId: node.nodeId, kind: node.kind });
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (mode !== "editor" || !blockId || !isHtmlElement(event.target)) return;
    if (event.key === "Escape") {
      cancelActiveGesture(true);
      setEditorMode("select");
      setLiveMessage("已退出画布调整模式");
      event.preventDefault();
      return;
    }
    if (event.target.closest("[data-hc-node-hud]")) return;
    const activeViewport = event.currentTarget.ownerDocument.defaultView?.innerWidth &&
      event.currentTarget.ownerDocument.defaultView.innerWidth <= 767 ? "mobile" : "desktop";
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
    const layoutAllowed = contentTemplateObjectHasCapability(editableObject, "layout") && (
      capabilities?.slots?.some((slot) => slot.roleId === node.nodeId) ||
      capabilities?.textRoles?.some((role) => role.roleId === node.nodeId)
    );
    if (event.key === "Enter") {
      if (useVisualEditorSession.getState().panelMode === "design") {
        useVisualEditorSession.getState().setMode(mediaViewAllowed ? "adjust-media" : layoutAllowed ? "adjust-layout" : "select");
        setLiveMessage(mediaViewAllowed ? "已进入图片构图调整" : "已进入对象位置调整");
      }
      event.preventDefault();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const activeMode = useVisualEditorSession.getState().mode;
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const axis = event.key === "ArrowLeft" || event.key === "ArrowRight" ? "x" : "y";
    if (activeMode === "adjust-media" && mediaFocusAllowed) {
      const effective = resolveVisualNode(propsRef.current, node.nodeId, activeViewport);
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
    const frameElement = findFrameElement(node.element, event.currentTarget);
    const frameBounds = frameElement.getBoundingClientRect();
    const nodeBounds = node.element.getBoundingClientRect();
    const effective = resolveVisualNode(propsRef.current, node.nodeId, activeViewport);
    const rect = effective.rect ?? {
      x: Math.min(1, Math.max(0, (nodeBounds.left - frameBounds.left) / Math.max(1, frameBounds.width))),
      y: Math.min(1, Math.max(0, (nodeBounds.top - frameBounds.top) / Math.max(1, frameBounds.height))),
      width: Math.min(1, Math.max(MIN_VISUAL_NODE_SIZE, nodeBounds.width / Math.max(1, frameBounds.width))),
      height: Math.min(1, Math.max(MIN_VISUAL_NODE_SIZE, nodeBounds.height / Math.max(1, frameBounds.height))),
    };
    const step = event.shiftKey ? 0.05 : 0.01;
    if (event.altKey) {
      const dimension = axis === "x" ? "width" : "height";
      rect[dimension] = Math.min(1 - (axis === "x" ? rect.x : rect.y), Math.max(MIN_VISUAL_NODE_SIZE, rect[dimension] + direction * step));
    } else {
      rect[axis] = Math.min(1 - (axis === "x" ? rect.width : rect.height), Math.max(0, rect[axis] + direction * step));
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
      frameWidth: 1,
      frameHeight: 1,
      frameOffsetX: 0,
      frameOffsetY: 0,
      lockRatio: false,
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
        rect.x = Math.min(1 - rect.width, Math.max(0, rect.x + dx));
        rect.y = Math.min(1 - rect.height, Math.max(0, rect.y + dy));
      } else {
        rect = resizeRectFromHandle(
          layoutDrag.startRect,
          layoutDrag.resizeDirection ?? "se",
          dx,
          dy,
          layoutDrag.lockRatio,
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
      const boundedRect = clampRect(rect);
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
    if (!drag.frameId) {
      drag.frameId = drag.sourceWindow.requestAnimationFrame(() => {
        const current = dragRef.current;
        if (current?.pendingFocus) applyFocus(current, current.pendingFocus, "update");
        if (current) current.frameId = undefined;
      });
    }
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

  const activeViewport = (rootRef.current?.ownerDocument.defaultView?.innerWidth ?? 1024) <= 767
    ? "mobile" as const
    : "desktop" as const;
  const selectedVisualNode = selectedHere
    ? resolveVisualNode(
        gesturePreviewRef.current
          ? { ...propsRef.current, __instanceOverrides: gesturePreviewRef.current.overrides }
          : propsRef.current,
        selectedHere.nodeId,
        activeViewport,
      )
    : {};
  const canAdjustFit = Boolean(
    selectedSlot?.fit?.length &&
      contentTemplateObjectHasCapability(selectedEditableObject, "fit"),
  );
  const canAdjustZoom = Boolean(
    selectedSlot?.zoom &&
      contentTemplateObjectHasCapability(selectedEditableObject, "zoom"),
  );
  const activeFit = selectedVisualNode.fit ?? (canAdjustFit ? selectedSlot?.fit?.[0] : undefined);
  const activeZoom = selectedVisualNode.zoom ?? 1;

  const toggleMediaFit = () => {
    if (!selectedHere || !canAdjustFit || !selectedSlot?.fit?.length) return;
    const nextFit = selectedSlot.fit.find((fit) => fit !== activeFit) ?? selectedSlot.fit[0];
    commitVisualPath(
      ["nodes", selectedHere.nodeId, "mediaView", "fit"],
      nextFit,
      nextFit === "contain" ? "图片已完整显示" : "图片已填充区域",
    );
  };

  const adjustMediaZoom = (direction: -1 | 1) => {
    if (!selectedHere || !canAdjustZoom || !selectedSlot?.zoom) return;
    const { min, max, step } = selectedSlot.zoom;
    const nextZoom = Math.min(max, Math.max(min, Number((activeZoom + step * direction).toFixed(3))));
    if (Math.abs(nextZoom - activeZoom) < 0.0001) return;
    commitVisualPath(
      ["nodes", selectedHere.nodeId, "mediaView", "zoom"],
      nextZoom === 1 ? undefined : nextZoom,
      `图片缩放已调整为 ${nextZoom.toFixed(2)} 倍`,
    );
  };

  const style: ContractFrameStyle = {
    ...templateLayoutVars(layout),
    "--hc-contract-container":
      layout.width === "full" ? "100%" : layout.width === "wide" ? "1520px" : layout.width === "editorial" ? "1040px" : "1280px",
  };
  const renderedChild = isValidElement(children)
    ? cloneElement(children as ReactElement<{
        editMode?: boolean;
      }>, {
        ...(mode === "editor" ? { editMode: true } : {}),
      })
    : children;

  return (
    <div
      ref={rootRef}
      className={`hc-contract-frame hc-contract-frame--${mode}`}
      style={style}
      data-content-template-contract={contract.key}
      data-content-template-module={moduleType}
      data-content-template-renderer="real"
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
      data-visual-editor-mode={mode === "editor" ? editorMode : undefined}
      data-visual-selected-node={selectedHere?.nodeId}
      data-hc-snap-active={activeGuides.x || activeGuides.y ? "true" : undefined}
      data-hc-gesture-phase={mode === "editor" && gesturePhase !== "idle" ? gesturePhase : undefined}
      data-hc-media-focus-enabled={
        selectedHere && editorMode === "adjust-media" && canDragMediaFocus
          ? "true"
          : undefined
      }
      onPointerDownCapture={handlePointerDown}
      onClickCapture={handleClick}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={cancelPointerDrag}
      onLostPointerCapture={handleLostPointerCapture}
      onKeyDownCapture={handleKeyDown}
    >
      <ContentTemplateLayoutStyles />
      {mode === "editor" ? <style data-hc-contract-editor-surface>{EDITOR_SURFACE_CSS}</style> : null}
      {instanceCss ? <style data-hc-instance-overrides>{instanceCss}</style> : null}
      {selectedHere ? (
        <style data-hc-visual-selection>{`${nodeSelector(selectedHere.nodeId)}{outline:1px solid #335F7D!important;outline-offset:-1px;cursor:${editorMode === "adjust-layout" ? "move" : editorMode === "adjust-media" && (selectedHere.kind === "media" || selectedHere.kind === "product") && canDragMediaFocus ? "grab" : "pointer"}}`}</style>
      ) : null}
      {mode === "editor" ? (
        <span role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{liveMessage}</span>
      ) : null}
      {renderedChild}
      {(activeGuides.x || activeGuides.y || (selectedHere && selectionOverlay)) ? (
        <div data-hc-editor-overlay>
          {activeGuides.x && layoutDragRef.current ? (
            <span
              aria-hidden="true"
              data-hc-snap-guide
              data-axis="x"
              data-snap-kind={activeGuides.x.kind}
              style={{
                left: layoutDragRef.current.frameOffsetX +
                  activeGuides.x.position * layoutDragRef.current.frameWidth,
              }}
            />
          ) : null}
          {activeGuides.y && layoutDragRef.current ? (
            <span
              aria-hidden="true"
              data-hc-snap-guide
              data-axis="y"
              data-snap-kind={activeGuides.y.kind}
              style={{
                top: layoutDragRef.current.frameOffsetY +
                  activeGuides.y.position * layoutDragRef.current.frameHeight,
              }}
            />
          ) : null}
          {selectedHere && selectionOverlay ? (
            <>
              <span
                aria-hidden="true"
                data-hc-selection-box
                data-node-id={selectedHere.nodeId}
                style={{
                  left: selectionOverlay.left,
                  top: selectionOverlay.top,
                  width: selectionOverlay.width,
                  height: selectionOverlay.height,
                }}
              />
              <div
                role="toolbar"
                aria-label={`调整画布对象 ${selectedHere.nodeId}`}
                data-hc-node-hud
                data-node-id={selectedHere.nodeId}
                data-node-kind={selectedHere.kind}
                data-placement={selectionOverlay.hudPlacement}
                data-can-adjust-layout={canAdjustLayout ? "true" : "false"}
                data-can-adjust-focus={canDragMediaFocus ? "true" : "false"}
                data-can-adjust-fit={canAdjustFit ? "true" : "false"}
                data-can-adjust-zoom={canAdjustZoom ? "true" : "false"}
                style={{
                  left: selectionOverlay.hudLeft,
                  top: selectionOverlay.hudTop,
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                {canAdjustLayout ? (
                  <button
                    type="button"
                    aria-label="调整对象区域"
                    aria-pressed={editorMode === "adjust-layout"}
                    data-hc-hud-mode="adjust-layout"
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      handleHudMode("adjust-layout");
                    }}
                    onClick={() => handleHudMode("adjust-layout")}
                  >
                    <DragOutlined aria-hidden="true" />
                    区域
                  </button>
                ) : null}
                {canAdjustMediaView ? (
                  <button
                    type="button"
                    aria-label="调整图片构图"
                    aria-pressed={editorMode === "adjust-media"}
                    data-hc-hud-mode="adjust-media"
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      handleHudMode("adjust-media");
                    }}
                    onClick={() => handleHudMode("adjust-media")}
                  >
                    <PictureOutlined aria-hidden="true" />
                    构图
                  </button>
                ) : null}
                {editorMode === "adjust-media" && canAdjustFit && selectedSlot?.fit?.length ? (
                  <button
                    type="button"
                    aria-label={activeFit === "contain" ? "切换图片为填充显示" : "切换图片为完整显示"}
                    onClick={toggleMediaFit}
                  >
                    {activeFit === "contain" ? "填充" : "完整"}
                  </button>
                ) : null}
                {editorMode === "adjust-media" && canAdjustZoom && selectedSlot?.zoom ? (
                  <>
                    <button
                      type="button"
                      aria-label="缩小图片"
                      disabled={activeZoom <= selectedSlot.zoom.min}
                      onClick={() => adjustMediaZoom(-1)}
                    >
                      <MinusOutlined aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="放大图片"
                      disabled={activeZoom >= selectedSlot.zoom.max}
                      onClick={() => adjustMediaZoom(1)}
                    >
                      <PlusOutlined aria-hidden="true" />
                    </button>
                  </>
                ) : null}
                {editorMode !== "select" ? (
                  <button
                    type="button"
                    aria-label="完成画布调整"
                    data-hc-hud-mode="select"
                    onClick={() => setEditorMode("select")}
                  >
                    <CheckOutlined aria-hidden="true" />
                    完成
                  </button>
                ) : null}
              </div>
              {editorMode === "adjust-layout" && canAdjustLayout
                ? RESIZE_HANDLES.map((handle) => (
                    <button
                      key={handle.direction}
                      type="button"
                      aria-label={`调整对象大小：${handle.label}`}
                      data-hc-resize-handle
                      data-node-id={selectedHere.nodeId}
                      data-resize-direction={handle.direction}
                      style={{
                        left: selectionOverlay.left + selectionOverlay.width * handle.x,
                        top: selectionOverlay.top + selectionOverlay.height * handle.y,
                      }}
                    />
                  ))
                : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
