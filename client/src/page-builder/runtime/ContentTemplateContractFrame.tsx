import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode } from "react";
import {
  getContentTemplateContract,
  type ContentTemplateContract,
  type ContentTemplateKey,
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
.hc-contract-frame { width: 100%; min-width: 0; }
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

type LayoutDragState = {
  pointerId: number;
  nodeId: string;
  viewport: "desktop" | "mobile";
  operation: "move" | "resize";
  startClientX: number;
  startClientY: number;
  startRect: { x: number; y: number; width: number; height: number };
  frameWidth: number;
  frameHeight: number;
  lockRatio: boolean;
  sourceWindow: Window;
  frameId?: number;
  pendingRect?: { x: number; y: number; width: number; height: number };
};

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
      const selector = slotCapability
        ? `${root} :is([data-content-role="${nodeId}"],[data-content-role-desktop="${nodeId}"],[data-content-role-mobile="${nodeId}"])`
        : `${root} :is([data-content-role="${nodeId}"],[data-content-role-desktop="${nodeId}"],[data-content-role-mobile="${nodeId}"],[data-editor-field~="${nodeId}"])`;
      if (rawNode.enabled === false) rules.push(`${selector}{display:none!important}`);
      const rectByViewport = isRecord(rawNode.rectByViewport) ? rawNode.rectByViewport : {};
      const rectRule = (rawRect: unknown) => {
        if (!isRecord(rawRect)) return "";
        const x = Number(rawRect.x);
        const y = Number(rawRect.y);
        const width = Number(rawRect.width);
        const height = Number(rawRect.height);
        if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.0001 || y + height > 1.0001) return "";
        return `position:absolute!important;left:${x * 100}%;top:${y * 100}%;width:${width * 100}%;height:${height * 100}%;margin:0!important;max-width:none!important;z-index:2`;
      };
      const desktopRect = rectRule(rectByViewport.desktop);
      const mobileRect = rectRule(rectByViewport.mobile) || desktopRect;
      if (desktopRect || mobileRect) rules.push(`${root}>:where(section,div){position:relative}`);
      if (desktopRect) rules.push(`@media (min-width:768px){${selector}{${desktopRect}}}`);
      if (mobileRect) rules.push(`@media (max-width:767px){${selector}{${mobileRect}}}`);
      const ratio = Number(rawNode.ratio);
      if (Number.isFinite(ratio) && ratio >= 0.25 && ratio <= 4) {
        rules.push(`${selector}{aspect-ratio:${ratio};overflow:hidden}`);
      }
      const slotDeclarations: string[] = [];
      if (slotCapability && allowed(rawNode.sizePreset, slotCapability.sizePresets)) {
        slotDeclarations.push(`width:${SIZE_CSS[String(rawNode.sizePreset)] ?? "100%"}`);
      }
      if (slotCapability && allowed(rawNode.positionPreset, slotCapability.positionPresets)) {
        const position = String(rawNode.positionPreset);
        slotDeclarations.push(`justify-self:${position === "center" ? "center" : position === "end" ? "end" : "start"}`);
        slotDeclarations.push(`margin-inline:${position === "center" ? "auto" : position === "end" ? "auto 0" : "0 auto"}`);
      }
      if (slotDeclarations.length) rules.push(`${selector}{${slotDeclarations.join(";")}}`);
      const mediaView = isRecord(rawNode.mediaView) ? rawNode.mediaView : {};
      const mediaDeclarations: string[] = [];
      if (mediaView.fit === "cover" || mediaView.fit === "contain") mediaDeclarations.push(`object-fit:${mediaView.fit}!important`);
      const zoom = Number(mediaView.zoom);
      if (Number.isFinite(zoom) && zoom >= 1 && zoom <= 3) mediaDeclarations.push(`transform:scale(${zoom});transform-origin:center`);
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
      const desktopFocus = focusRule(focusByViewport.desktop);
      const mobileFocus = focusRule(focusByViewport.mobile) || desktopFocus;
      if (desktopFocus) rules.push(`@media (min-width:768px){${selector} :where(img,video){${desktopFocus}}}`);
      if (mobileFocus) rules.push(`@media (max-width:767px){${selector} :where(img,video){${mobileFocus}}}`);
      const typography = isRecord(rawNode.typography) ? rawNode.typography : {};
      const typeDeclarations: string[] = [];
      // 后代规则：子元素常带内联 color/font-size 或模板自有 line-height，
      // 容器声明到不了它们；必须以后代选择器 + !important 直写到文本元素。
      const descendantDeclarations: string[] = [];
      const sizeMap: Record<string, string> = { xs: ".78em", sm: ".9em", md: "1em", lg: "1.18em", xl: "1.38em" };
      // 字号只落到块级文本元素（em 相对容器），不含 span，避免嵌套 span 复合缩小
      if (typeof typography.sizeLevel === "string" && sizeMap[typography.sizeLevel]) {
        rules.push(`${selector} :where(h1,h2,h3,h4,p){font-size:${sizeMap[typography.sizeLevel]}!important}`);
      }
      if (["left", "center", "right"].includes(String(typography.align))) typeDeclarations.push(`text-align:${typography.align}`);
      const typeColor = color(typography.color);
      if (typeColor) {
        typeDeclarations.push(`color:${typeColor}!important`);
        descendantDeclarations.push(`color:${typeColor}!important`);
      }
      const lineHeight = Number(typography.lineHeight);
      if (Number.isFinite(lineHeight) && lineHeight >= 1 && lineHeight <= 2.5) descendantDeclarations.push(`line-height:${lineHeight}!important`);
      const letterSpacing = Number(typography.letterSpacing);
      if (Number.isFinite(letterSpacing) && letterSpacing >= -0.05 && letterSpacing <= 0.5) descendantDeclarations.push(`letter-spacing:${letterSpacing}em!important`);
      if (typography.safeBand === "light" || typography.safeBand === "dark") {
        typeDeclarations.push(`background:${typography.safeBand === "light" ? "#ffffff" : "#181A1B"}!important`);
        typeDeclarations.push(`color:${typography.safeBand === "light" ? "#181A1B" : "#ffffff"}!important`);
        typeDeclarations.push("padding:clamp(12px,2vw,28px)");
      }
      if (typeDeclarations.length) rules.push(`${selector}{${typeDeclarations.join(";")}}`);
      if (descendantDeclarations.length) rules.push(`${selector} :where(h1,h2,h3,h4,p,span){${descendantDeclarations.join(";")}}`);
      const maxLines = Number(typography.maxLines);
      if (Number.isInteger(maxLines) && maxLines >= 1 && maxLines <= 12) {
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
  const selectNode = useVisualEditorSession((state) => state.selectNode);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  const dragRef = useRef<MediaDragState | null>(null);
  const layoutDragRef = useRef<LayoutDragState | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const blockId = typeof props?.id === "string" ? props.id : "";
  propsRef.current = props;

  useEffect(() => {
    const root = rootRef.current;
    if (mode !== "editor" || !root || !contract) return;
    const capabilities = contract.editorCapabilities.layoutOverrides;
    const allowedNodes = new Set([
      ...(capabilities?.slots ?? []).map((slot) => slot.roleId),
      ...(capabilities?.textRoles ?? []).map((role) => role.roleId),
    ]);
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
      const roleKind = contract.roles.find((role) => role.id === nodeId)?.kind;
      const isAction = roleKind === "action" || /action|button|cta|link/i.test(nodeId);
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
        ? "已进入图片画面调整，使用方向键移动焦点，按 Shift 加方向键可大幅调整，按 Escape 退出"
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
  }, [blockId, editorMode, mode, selection]);

  useEffect(() => {
    const root = rootRef.current;
    const ownerDocument = root?.ownerDocument;
    const ownerWindow = root?.ownerDocument.defaultView;
    const cancelInteraction = () => {
      const mediaDrag = dragRef.current;
      if (mediaDrag?.frameId) mediaDrag.sourceWindow.cancelAnimationFrame(mediaDrag.frameId);
      const layoutDrag = layoutDragRef.current;
      if (layoutDrag?.frameId) layoutDrag.sourceWindow.cancelAnimationFrame(layoutDrag.frameId);
      dragRef.current = null;
      layoutDragRef.current = null;
    };
    ownerWindow?.addEventListener("resize", cancelInteraction);
    return () => {
      ownerWindow?.removeEventListener("resize", cancelInteraction);
      cancelInteraction();
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
  }, [blockId]);
  if (!contract || !layout) return <>{children}</>;
  const scopeId = `hc-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const instanceOverrides = resolveInstanceOverrides(contract, props);
  const instanceCss = createInstanceCss(contract, instanceOverrides, scopeId);
  const instanceLayout = isRecord(instanceOverrides?.layout)
    ? instanceOverrides.layout
    : {};
  const instanceFrame = isRecord(instanceOverrides?.frame)
    ? instanceOverrides.frame
    : {};
  const selectedHere = mode === "editor" && selection?.blockId === blockId
    ? selection
    : null;

  const nodeSelector = (nodeId: string) =>
    `[data-hc-instance="${scopeId}"] :is([data-content-role="${nodeId}"],[data-content-role-desktop="${nodeId}"],[data-content-role-mobile="${nodeId}"],[data-editor-field~="${nodeId}"])`;

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
        if (nodeId) return { nodeId, kind: "media" as const, element: roleElement };
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
    const directRoleKind = directRoleId
      ? contract!.roles.find((role) => role.id === directRoleId)?.kind
      : undefined;
    if (directRoleId && directRoleElement && directRoleKind === "media") {
      return { nodeId: directRoleId, kind: "media" as const, element: directRoleElement };
    }
    const fieldElement = target.closest<HTMLElement>("[data-editor-field]");
    const fieldId = fieldElement?.dataset.editorField?.split(/\s+/).find(Boolean);
    if (fieldId && fieldElement) {
      const kind: VisualNodeKind = /action|button|cta|link/i.test(fieldId)
        ? "action"
        : "text";
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
    const roleKind = contract!.roles.find((role) => role.id === roleId)?.kind;
    const kind: VisualNodeKind = roleKind === "media"
      ? "media"
      : roleKind === "action"
        ? "action"
        : roleKind === "text"
          ? "text"
          : /product/i.test(roleId)
            ? "product"
            : "structured";
    return { nodeId: roleId, kind, element: roleElement };
  }

  const sendFocus = (drag: MediaDragState, focus: { x: number; y: number }) => {
    const next = setVisualOverridePath(
      propsRef.current?.__instanceOverrides,
      ["nodes", drag.nodeId, "mediaView", "focusByViewport", drag.viewport],
      focus,
    );
    sendCanvasVisualEdit({ blockId, moduleType, overrides: next }, drag.sourceWindow);
  };

  const sendRect = (
    drag: LayoutDragState,
    rect: { x: number; y: number; width: number; height: number },
  ) => {
    const next = setVisualOverridePath(
      propsRef.current?.__instanceOverrides,
      ["nodes", drag.nodeId, "rectByViewport", drag.viewport],
      rect,
    );
    sendCanvasVisualEdit({ blockId, moduleType, overrides: next }, drag.sourceWindow);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mode !== "editor" || !blockId || !isHtmlElement(event.target)) return;
    const sourceWindow = event.currentTarget.ownerDocument.defaultView ?? window;
    const activeViewport = sourceWindow.innerWidth <= 767 ? "mobile" : "desktop";
    const node = findVisualNode(event.target, activeViewport);
    if (!node) return;
    selectNode({ blockId, moduleType, nodeId: node.nodeId, kind: node.kind });
    const activeMode = useVisualEditorSession.getState().mode;
    const visualCapabilities = contract.editorCapabilities.layoutOverrides;
    const layoutAllowed = Boolean(
      visualCapabilities?.slots?.some((slot) => slot.roleId === node.nodeId) ||
      visualCapabilities?.textRoles?.some((role) => role.roleId === node.nodeId),
    );
    const mediaAllowed = Boolean(
      node.kind === "media" && visualCapabilities?.slots?.some((slot) => slot.roleId === node.nodeId),
    );
    if (activeMode === "adjust-layout") {
      if (!layoutAllowed) return;
      const nodeBounds = node.element.getBoundingClientRect();
      // 根框架前面会插入合同样式节点，firstElementChild 因此可能是零尺寸
      // <style>。从当前槽位向上找到框架的直接内容子节点，才能按真实模板
      // 构图计算初始矩形；否则会把文字错误扩成 100% × 100%。
      let frameElement: HTMLElement = node.element;
      while (
        frameElement.parentElement &&
        frameElement.parentElement !== event.currentTarget
      ) {
        frameElement = frameElement.parentElement;
      }
      if (frameElement.parentElement !== event.currentTarget) {
        frameElement = event.currentTarget;
      }
      const frameBounds = frameElement.getBoundingClientRect();
      const effective = resolveVisualNode(props, node.nodeId, activeViewport);
      const derivedRect = {
        x: Math.min(1, Math.max(0, (nodeBounds.left - frameBounds.left) / Math.max(1, frameBounds.width))),
        y: Math.min(1, Math.max(0, (nodeBounds.top - frameBounds.top) / Math.max(1, frameBounds.height))),
        width: Math.min(1, Math.max(0.05, nodeBounds.width / Math.max(1, frameBounds.width))),
        height: Math.min(1, Math.max(0.05, nodeBounds.height / Math.max(1, frameBounds.height))),
      };
      const startRect = effective.rect ?? derivedRect;
      layoutDragRef.current = {
        pointerId: event.pointerId,
        nodeId: node.nodeId,
        viewport: activeViewport,
        operation:
          event.clientX >= nodeBounds.right - 20 && event.clientY >= nodeBounds.bottom - 20
            ? "resize"
            : "move",
        startClientX: event.clientX,
        startClientY: event.clientY,
        startRect,
        frameWidth: Math.max(1, frameBounds.width),
        frameHeight: Math.max(1, frameBounds.height),
        lockRatio: event.shiftKey,
        sourceWindow,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (activeMode !== "adjust-media" || !mediaAllowed) return;
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
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (mode !== "editor" || !blockId || !isHtmlElement(event.target)) return;
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
    const activeViewport = event.currentTarget.ownerDocument.defaultView?.innerWidth &&
      event.currentTarget.ownerDocument.defaultView.innerWidth <= 767 ? "mobile" : "desktop";
    const node = findVisualNode(event.target, activeViewport);
    if (!node || node.kind === "action") return;
    selectNode({ blockId, moduleType, nodeId: node.nodeId, kind: node.kind });
    if (event.key === "Escape") {
      useVisualEditorSession.getState().setMode("select");
      setLiveMessage("已退出画布调整模式");
      event.preventDefault();
      return;
    }
    const capabilities = contract.editorCapabilities.layoutOverrides;
    const mediaAllowed = node.kind === "media" && capabilities?.slots?.some((slot) => slot.roleId === node.nodeId);
    const layoutAllowed = capabilities?.slots?.some((slot) => slot.roleId === node.nodeId) ||
      capabilities?.textRoles?.some((role) => role.roleId === node.nodeId);
    if (event.key === "Enter") {
      if (useVisualEditorSession.getState().panelMode === "design") {
        useVisualEditorSession.getState().setMode(mediaAllowed ? "adjust-media" : layoutAllowed ? "adjust-layout" : "select");
        setLiveMessage(mediaAllowed ? "已进入图片构图调整" : "已进入对象位置调整");
      }
      event.preventDefault();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const activeMode = useVisualEditorSession.getState().mode;
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const axis = event.key === "ArrowLeft" || event.key === "ArrowRight" ? "x" : "y";
    if (activeMode === "adjust-media" && mediaAllowed) {
      const effective = resolveVisualNode(propsRef.current, node.nodeId, activeViewport);
      const focus = {
        x: effective.focus?.x ?? 50,
        y: effective.focus?.y ?? 50,
      };
      focus[axis] = Math.min(100, Math.max(0, focus[axis] + direction * (event.shiftKey ? 5 : 1)));
      sendFocus({
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
    const frameBounds = event.currentTarget.getBoundingClientRect();
    const nodeBounds = node.element.getBoundingClientRect();
    const effective = resolveVisualNode(propsRef.current, node.nodeId, activeViewport);
    const rect = effective.rect ?? {
      x: Math.min(1, Math.max(0, (nodeBounds.left - frameBounds.left) / Math.max(1, frameBounds.width))),
      y: Math.min(1, Math.max(0, (nodeBounds.top - frameBounds.top) / Math.max(1, frameBounds.height))),
      width: Math.min(1, Math.max(0.05, nodeBounds.width / Math.max(1, frameBounds.width))),
      height: Math.min(1, Math.max(0.05, nodeBounds.height / Math.max(1, frameBounds.height))),
    };
    const step = event.shiftKey ? 0.05 : 0.01;
    if (event.altKey) {
      const dimension = axis === "x" ? "width" : "height";
      rect[dimension] = Math.min(1 - (axis === "x" ? rect.x : rect.y), Math.max(0.05, rect[dimension] + direction * step));
    } else {
      rect[axis] = Math.min(1 - (axis === "x" ? rect.width : rect.height), Math.max(0, rect[axis] + direction * step));
    }
    sendRect({
      pointerId: -1,
      nodeId: node.nodeId,
      viewport: activeViewport,
      operation: event.altKey ? "resize" : "move",
      startClientX: 0,
      startClientY: 0,
      startRect: rect,
      frameWidth: 1,
      frameHeight: 1,
      lockRatio: false,
      sourceWindow: event.currentTarget.ownerDocument.defaultView ?? window,
    }, rect);
    setLiveMessage(event.altKey ? "对象大小已调整" : "对象位置已调整");
    event.preventDefault();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const layoutDrag = layoutDragRef.current;
    if (layoutDrag && layoutDrag.pointerId === event.pointerId) {
      const dx = (event.clientX - layoutDrag.startClientX) / layoutDrag.frameWidth;
      const dy = (event.clientY - layoutDrag.startClientY) / layoutDrag.frameHeight;
      const rect = { ...layoutDrag.startRect };
      if (layoutDrag.operation === "move") {
        rect.x = Math.min(1 - rect.width, Math.max(0, rect.x + dx));
        rect.y = Math.min(1 - rect.height, Math.max(0, rect.y + dy));
      } else {
        rect.width = Math.min(1 - rect.x, Math.max(0.05, rect.width + dx));
        rect.height = Math.min(1 - rect.y, Math.max(0.05, rect.height + dy));
        if (layoutDrag.lockRatio) {
          const ratio = layoutDrag.startRect.width / Math.max(0.01, layoutDrag.startRect.height);
          rect.height = Math.min(1 - rect.y, rect.width / ratio);
        }
      }
      layoutDrag.pendingRect = rect;
      if (!layoutDrag.frameId) {
        layoutDrag.frameId = layoutDrag.sourceWindow.requestAnimationFrame(() => {
          const current = layoutDragRef.current;
          if (current?.pendingRect) sendRect(current, current.pendingRect);
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
        if (current?.pendingFocus) sendFocus(current, current.pendingFocus);
        if (current) current.frameId = undefined;
      });
    }
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const layoutDrag = layoutDragRef.current;
    if (layoutDrag && layoutDrag.pointerId === event.pointerId) {
      if (layoutDrag.frameId) layoutDrag.sourceWindow.cancelAnimationFrame(layoutDrag.frameId);
      if (layoutDrag.pendingRect) sendRect(layoutDrag, layoutDrag.pendingRect);
      layoutDragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.frameId) drag.sourceWindow.cancelAnimationFrame(drag.frameId);
    if (drag.pendingFocus) sendFocus(drag, drag.pendingFocus);
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const style: ContractFrameStyle = {
    ...templateLayoutVars(layout),
    "--hc-contract-container":
      layout.width === "full" ? "100%" : layout.width === "wide" ? "1520px" : layout.width === "editorial" ? "1040px" : "1280px",
  };
  const renderedChild = isValidElement(children)
    ? cloneElement(children as ReactElement<{
        contentTemplateKey?: ContentTemplateKey;
        editMode?: boolean;
      }>, {
        contentTemplateKey: contract.key,
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
      onPointerDownCapture={handlePointerDown}
      onClickCapture={handleClick}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={finishPointerDrag}
      onKeyDownCapture={handleKeyDown}
    >
      <ContentTemplateLayoutStyles />
      {mode === "editor" ? <style data-hc-contract-editor-surface>{EDITOR_SURFACE_CSS}</style> : null}
      {instanceCss ? <style data-hc-instance-overrides>{instanceCss}</style> : null}
      {selectedHere ? (
        <style data-hc-visual-selection>{`${nodeSelector(selectedHere.nodeId)}{outline:1px solid #181A1B!important;outline-offset:-1px;cursor:${editorMode === "adjust-layout" ? "move" : editorMode === "adjust-media" && selectedHere.kind === "media" ? "grab" : "pointer"}}${editorMode === "adjust-layout" ? `${nodeSelector(selectedHere.nodeId)}::after{content:"";position:absolute;right:2px;bottom:2px;width:14px;height:14px;border:2px solid #fff;background:#181A1B;box-shadow:0 0 0 1px #181A1B;cursor:nwse-resize;z-index:20}` : ""}`}</style>
      ) : null}
      {mode === "editor" ? (
        <span role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{liveMessage}</span>
      ) : null}
      {renderedChild}
    </div>
  );
}
