import { useInsertionEffect, type CSSProperties } from "react";
import {
  CONTENT_TEMPLATE_CONTRACTS,
  CONTENT_TEMPLATE_SKELETONS,
  type ContentTemplateSkeleton,
  type ContentTemplateSkeletonRole,
  type RegisteredContentTemplateKey,
} from "../generated/contentTemplates.generated";
import type { MasterId } from "../designSystem/masters";

export type ContentTemplateLayoutKey = RegisteredContentTemplateKey;

export type ContentTemplateRole = ContentTemplateSkeletonRole;

export interface PreviewZone {
  role: ContentTemplateRole;
  column: number;
  span: number;
  row: number;
  rowSpan: number;
  overlay?: boolean;
}

interface ResponsiveSkeleton {
  columns: 12 | 1;
  mediaRatio?: string;
  detailRatio?: string;
  /** schema v3 根角色 id 顺序；集合型模板不再展开重复 generic role。 */
  order: readonly string[];
}

export interface ContentTemplateLayout {
  key: ContentTemplateLayoutKey;
  moduleType: string;
  displayName: string;
  preview: {
    tone: "light" | "dark";
    zones: readonly PreviewZone[];
  };
  desktop: ResponsiveSkeleton;
  mobile: ResponsiveSkeleton;
  controls: readonly string[];
  heightModeByViewport: {
    desktop: "viewport" | "ratio" | "content";
    mobile: "viewport" | "ratio" | "content";
  };
  visualRole: "primary-stage" | "feature-stage" | "support-stage";
  isSkeleton?: boolean;
  master: MasterId;
  width: "full" | "standard" | "wide" | "editorial";
  flow: "bleed" | "flow";
}

const getSlotRatio = (
  skeleton: ContentTemplateSkeleton,
  device: "desktop" | "mobile",
  role: "media" | "mainMedia" | "detailMedia",
) => skeleton.slots.find(
  (slot) => slot.role === role && Boolean(slot[`${device}Ratio`]),
)?.[`${device}Ratio`];

const getPrimaryRatio = (
  skeleton: ContentTemplateSkeleton,
  device: "desktop" | "mobile",
) => getSlotRatio(skeleton, device, "media")
  ?? getSlotRatio(skeleton, device, "mainMedia")
  ?? skeleton.slots.find((slot) => Boolean(slot[`${device}Ratio`]))?.[`${device}Ratio`];

/**
 * 全部活跃模板均拥有真实 adapter / Renderer。这里仅把 schema v5
 * 生成产物转换为渲染布局元数据，不能据 implementationStatus 降级为骨架。
 */
const DERIVED_TEMPLATE_LAYOUTS = Object.fromEntries(
  Object.values(CONTENT_TEMPLATE_SKELETONS).map((skeleton) => {
    const contract = CONTENT_TEMPLATE_CONTRACTS[skeleton.key];
    return [skeleton.key, {
      ...skeleton,
      preview: {
        tone: contract.preview.desktop.tone,
        zones: contract.preview.desktop.zones,
      },
      desktop: {
        columns: 12,
        mediaRatio: getPrimaryRatio(skeleton, "desktop"),
        detailRatio: getSlotRatio(skeleton, "desktop", "detailMedia"),
        order: contract.order.desktop,
      },
      mobile: {
        columns: 1,
        mediaRatio: getPrimaryRatio(skeleton, "mobile"),
        detailRatio: getSlotRatio(skeleton, "mobile", "detailMedia"),
        order: contract.order.mobile,
      },
      controls: contract.allowedControls,
      isSkeleton: false,
      master: contract.master,
    }];
  }),
) as unknown as Record<string, ContentTemplateLayout>;

export const CONTENT_TEMPLATE_LAYOUTS = DERIVED_TEMPLATE_LAYOUTS as Record<
  ContentTemplateLayoutKey,
  ContentTemplateLayout
>;

export const CONTENT_TEMPLATE_LAYOUT_BY_TYPE = Object.fromEntries(
  Object.values(CONTENT_TEMPLATE_LAYOUTS).map((layout) => [
    layout.moduleType,
    layout,
  ]),
) as Record<string, ContentTemplateLayout | undefined>;

export function getContentTemplateLayout(moduleType: string) {
  return CONTENT_TEMPLATE_LAYOUT_BY_TYPE[moduleType];
}

type TemplateStyle = CSSProperties & Record<`--hc-${string}`, string | number>;

export function templateLayoutVars(
  layout: ContentTemplateLayout,
  /**
   * 槽位比例覆盖(2026-08-19 选项机制):区块编辑者选择的比例经
   * resolveContractAspectRatio 白名单解析后传入,逐端覆盖布局默认值。
   */
  overrides?: {
    mediaRatio?: Partial<Record<"desktop" | "mobile", string>>;
    detailRatio?: Partial<Record<"desktop" | "mobile", string>>;
  },
): TemplateStyle {
  return {
    "--hc-template-media-desktop": overrides?.mediaRatio?.desktop ?? layout.desktop.mediaRatio ?? "auto",
    "--hc-template-media-mobile": overrides?.mediaRatio?.mobile ?? layout.mobile.mediaRatio ?? "auto",
    "--hc-template-detail-desktop": overrides?.detailRatio?.desktop ?? layout.desktop.detailRatio ?? "auto",
    "--hc-template-detail-mobile": overrides?.detailRatio?.mobile ?? layout.mobile.detailRatio ?? "auto",
  };
}

const LAYOUT_CSS = `
.hc-content-template {
  --hc-template-container: 1280px;
  --hc-template-gutter: var(--hc-px, clamp(20px, 5vw, 80px));
  color: var(--hc-ink, #181A1B);
  background: var(--hc-bg, #FFFFFF);
}
.hc-content-template__container {
  width: min(calc(100% - (var(--hc-template-gutter) * 2)), var(--hc-template-container));
  margin-inline: auto;
}
.hc-content-template__media {
  position: relative;
  overflow: hidden;
  background: #F4F5F5;
}
.hc-content-template__media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.hc-content-template__copy {
  min-width: 0;
  overflow-wrap: anywhere;
}
.hc-content-template__eyebrow {
  margin: 0 0 12px;
  color: var(--hc-muted, #5F6568);
  font: 500 var(--hc-type-caption, 12px)/1.4 var(--hc-font-sans, sans-serif);
  letter-spacing: .12em;
  text-transform: uppercase;
}
.hc-content-template__title {
  margin: 0;
  color: var(--hc-ink, #181A1B);
  font-family: var(--hc-font-display, serif);
  font-weight: 400;
  line-height: 1.2;
}
.hc-content-template__body {
  max-width: 45em;
  margin: 16px 0 0;
  color: var(--hc-muted, #5F6568);
  font: 400 var(--hc-type-body, 15px)/1.8 var(--hc-font-sans, sans-serif);
}
.hc-content-template__action {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  color: var(--hc-ink, #181A1B);
  font: 500 var(--hc-type-caption, 12px)/1.4 var(--hc-font-sans, sans-serif);
  letter-spacing: .08em;
  text-decoration: none;
  /* 十家实证(03 第八节):CTA 黑色细底线,金色废除 */
  border-bottom: 1px solid var(--hc-ink, #181A1B);
}
.hc-content-template__action:focus-visible {
  outline: 2px solid #181A1B;
  outline-offset: 4px;
}

/* 首屏：桌面与视口等高，导航悬浮在影像上，不在首屏底部留下工具栏高度的空带。 */
.hc-phase1-hero {
  min-height: max(620px, 100svh);
}
/* 编辑画布内 iframe 会被整页内容撑高，svh 随之失真；编辑态改用编辑器预设的视口高度，保证比例准确。 */
.hc-phase1-hero--edit {
  min-height: var(--homepage-editor-viewport-height, 1200px);
}
.hc-phase1-hero__media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 100%;
  aspect-ratio: auto;
}
.hc-phase1-hero__copy-band {
  position: absolute;
  z-index: 2;
  inset-inline: 0;
  bottom: clamp(64px, 8vh, 96px);
  pointer-events: none;
}
.hc-phase1-hero__copy {
  width: min(calc(100% - (var(--hc-template-gutter) * 2)), 1760px);
  margin-inline: auto;
  color: #F7F8F8;
  text-shadow: 0 2px 24px rgba(0, 0, 0, .18);
}
.hc-phase1-hero__copy[data-align="center"] { text-align: center; }
.hc-phase1-hero__copy[data-align="center"] > * { margin-inline: auto; }
.hc-phase1-hero__copy > * { max-width: min(620px, 48vw); }
.hc-phase1-hero__copy .hc-content-template__title,
.hc-phase1-hero__copy .hc-content-template__action { color: #F7F8F8; }
.hc-phase1-hero__copy .hc-content-template__title {
  line-height: 1.04;
  letter-spacing: .16em;
}
.hc-phase1-hero__copy .hc-content-template__body,
.hc-phase1-hero__copy .hc-content-template__eyebrow { color: rgba(247, 248, 248, .84); }
.hc-phase1-hero__copy .hc-content-template__title + .hc-content-template__eyebrow {
  margin: 22px 0 0;
  letter-spacing: .2em;
}
.hc-phase1-hero__copy .hc-content-template__body {
  margin-top: 26px;
  font-size: clamp(16px, 1.2vw, 20px);
  line-height: 1.5;
  letter-spacing: .025em;
}
.hc-phase1-hero__copy .hc-content-template__action {
  pointer-events: auto;
  margin-top: 28px;
  border-color: rgba(247, 248, 248, .72);
}
.hc-phase1-hero__copy .hc-content-template__action:focus-visible {
  outline-color: #F7F8F8;
}

/* 通栏图：任何断点都不压字，说明带跟在图片之后。 */
.hc-phase1-full-bleed__media { aspect-ratio: var(--hc-template-media-desktop); }
.hc-phase1-full-bleed__caption {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 24px;
  padding-block: 32px 48px;
}
.hc-phase1-full-bleed__copy { grid-column: 1 / span 8; }
.hc-phase1-full-bleed__action { grid-column: 10 / span 3; justify-self: end; align-self: end; }

/* 单图文 · 画廊海报式(P1)：图 ≥75% 主导偏右，签名束贴左下；镜像反侧。 */
.hc-phase1-single {
  position: relative;
  padding-left: clamp(0px, 7vw, 190px);
}
.hc-phase1-single__media { position: relative; aspect-ratio: var(--hc-template-media-desktop); width: min(78%, 100%); margin-left: auto; }
.hc-phase1-single__copy {
  position: absolute; left: 0; bottom: clamp(24px, 3vw, 72px);
  max-width: clamp(160px, 17vw, 340px);
}
.hc-phase1-single[data-mirror="true"] { padding-left: 0; padding-right: clamp(0px, 7vw, 190px); }
.hc-phase1-single[data-mirror="true"] .hc-phase1-single__media { margin-left: 0; margin-right: auto; }
.hc-phase1-single[data-mirror="true"] .hc-phase1-single__copy { left: auto; right: 0; }

/* 双图文：桌面主图 8/12，细节与文字固定 4/12；模板始终为一个区块。 */
.hc-phase1-double {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  grid-template-rows: auto auto auto;
  gap: 24px;
  align-items: start;
}
.hc-phase1-double__main { grid-column: 1 / span 8; grid-row: 1 / span 3; aspect-ratio: var(--hc-template-media-desktop); }
.hc-phase1-double__detail { grid-column: 9 / span 4; grid-row: 1; aspect-ratio: var(--hc-template-detail-desktop); margin-top: 12%; }
.hc-phase1-double__copy { grid-column: 9 / span 4; grid-row: 2; }
.hc-phase1-double__action { grid-column: 9 / span 4; grid-row: 3; justify-self: start; }

/* 纯文字：桌面 720px；对齐和留白只由受控预设改变。 */
.hc-phase1-text {
  width: min(calc(100% - (var(--hc-template-gutter) * 2)), 720px);
  margin-inline: auto;
  text-align: left;
}
.hc-phase1-text[data-align="center"] { text-align: center; }
.hc-phase1-text[data-align="center"] > * { margin-inline: auto; }
.hc-phase1-text[data-spacing="normal"] { padding-block: 96px; }
.hc-phase1-text[data-spacing="spacious"] { padding-block: 144px; }
.hc-phase1-text[data-spacing="grand"] { padding-block: clamp(170px, 18vh, 280px); }

/* 中间宽度只改变几何布局；素材、比例和阅读顺序沿用 desktop 合同。 */
@media (min-width: 768px) and (max-width: 1023px) {
  .hc-content-template { --hc-template-gutter: 28px; }
  .hc-phase1-hero { min-height: 75svh; }
  .hc-phase1-hero__media { position: relative; inset: auto; height: auto; min-height: 0; aspect-ratio: var(--hc-template-media-desktop); }
  .hc-phase1-hero__copy-band { position: relative; bottom: auto; padding-block: 40px 56px; background: var(--hc-bg, #FFFFFF); }
  .hc-phase1-hero__copy { width: min(calc(100% - 56px), 704px); color: var(--hc-ink, #181A1B); }
  .hc-phase1-hero__copy > * { max-width: 45em; }
  .hc-phase1-hero__copy .hc-content-template__title { letter-spacing: .1em; }
  .hc-phase1-hero__copy .hc-content-template__title,
  .hc-phase1-hero__copy .hc-content-template__action { color: var(--hc-ink, #181A1B); }
  .hc-phase1-hero__copy .hc-content-template__body,
  .hc-phase1-hero__copy .hc-content-template__eyebrow { color: var(--hc-muted, #5F6568); }
  .hc-phase1-hero__copy .hc-content-template__action { border-color: var(--hc-ink, #181A1B); }
  .hc-phase1-hero__copy .hc-content-template__action:focus-visible { outline-color: #181A1B; }
  .hc-phase1-full-bleed__media { aspect-ratio: var(--hc-template-media-desktop); }
  .hc-phase1-full-bleed__caption { grid-template-columns: repeat(8, minmax(0, 1fr)); }
  .hc-phase1-full-bleed__copy { grid-column: 1 / span 6; }
  .hc-phase1-full-bleed__action { grid-column: 7 / span 2; }
  .hc-phase1-single { padding-left: clamp(0px, 6vw, 120px); }
  .hc-phase1-single__media { width: min(80%, 100%); margin-left: auto; aspect-ratio: var(--hc-template-media-desktop); }
  .hc-phase1-single__copy { position: absolute; left: 0; bottom: clamp(16px, 2vw, 48px); max-width: 220px; }
  .hc-phase1-single[data-mirror="true"] { padding-left: 0; padding-right: clamp(0px, 6vw, 120px); }
  .hc-phase1-single[data-mirror="true"] .hc-phase1-single__media { margin-left: 0; margin-right: auto; }
  .hc-phase1-single[data-mirror="true"] .hc-phase1-single__copy { left: auto; right: 0; }
  .hc-phase1-double { grid-template-columns: repeat(8, minmax(0, 1fr)); }
  .hc-phase1-double__main { grid-column: 1 / span 8; grid-row: 1; aspect-ratio: var(--hc-template-media-desktop); }
  .hc-phase1-double__copy { grid-column: 1 / span 5; grid-row: 2; padding-top: 32px; }
  .hc-phase1-double__detail { grid-column: 6 / span 3; grid-row: 2; aspect-ratio: var(--hc-template-detail-desktop); margin-top: 32px; }
  .hc-phase1-double__action { grid-column: 1 / span 5; grid-row: 3; }
  .hc-phase1-text { width: calc((100% - 56px) * .75); max-width: 720px; }
  .hc-phase1-text[data-spacing="normal"] { padding-block: 80px; }
  .hc-phase1-text[data-spacing="spacious"] { padding-block: 112px; }
  .hc-phase1-text[data-spacing="grand"] { padding-block: 150px; }
}

@media (max-width: 767px) {
  .hc-content-template { --hc-template-gutter: 20px; }
  .hc-phase1-hero { min-height: 0; }
  .hc-phase1-hero__media { position: relative; inset: auto; height: auto; min-height: 0; aspect-ratio: var(--hc-template-media-mobile); }
  .hc-phase1-hero__copy-band { position: relative; bottom: auto; padding-block: 32px 48px; background: var(--hc-bg, #FFFFFF); }
  .hc-phase1-hero__copy { width: calc(100% - 40px); color: var(--hc-ink, #181A1B); text-align: left !important; }
  .hc-phase1-hero__copy > * { margin-inline: 0 !important; }
  .hc-phase1-hero__copy > * { max-width: 45em; }
  .hc-phase1-hero__copy .hc-content-template__title { letter-spacing: .08em; }
  .hc-phase1-hero__copy .hc-content-template__title,
  .hc-phase1-hero__copy .hc-content-template__action { color: var(--hc-ink, #181A1B); }
  .hc-phase1-hero__copy .hc-content-template__body,
  .hc-phase1-hero__copy .hc-content-template__eyebrow { color: var(--hc-muted, #5F6568); }
  .hc-phase1-hero__copy .hc-content-template__action { border-color: var(--hc-ink, #181A1B); }
  .hc-phase1-hero__copy .hc-content-template__action:focus-visible { outline-color: #181A1B; }
  .hc-phase1-full-bleed__media { aspect-ratio: var(--hc-template-media-mobile); }
  .hc-phase1-full-bleed__caption { display: block; padding-block: 28px 44px; }
  .hc-phase1-full-bleed__action { margin-top: 22px; }
  /* 移动：合同规定图片→文字→行动的堆叠阅读顺序；文字使用独立实色区，不依赖图片对比度。 */
  .hc-phase1-single { position: relative; padding-left: 0; display: flex; flex-direction: column; }
  .hc-phase1-single__media { width: 100%; aspect-ratio: var(--hc-template-media-mobile); }
  .hc-phase1-single__copy { position: relative; inset: auto; max-width: none; margin-top: 0; display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 32px 20px 8px; background: var(--hc-bg, #FFFFFF); }
  .hc-phase1-single[data-mirror="true"] { padding-right: 0; }
  .hc-phase1-single[data-mirror="true"] .hc-phase1-single__media { margin: 0; }
  .hc-phase1-single[data-mirror="true"] .hc-phase1-single__copy { position: relative; inset: auto; align-items: flex-start; text-align: left; }
  .hc-phase1-double { display: grid; grid-template-columns: 1fr; gap: 0; }
  .hc-phase1-double__main { grid-column: 1; grid-row: 1; aspect-ratio: var(--hc-template-media-mobile); }
  .hc-phase1-double__copy { grid-column: 1; grid-row: 2; margin-top: 28px; }
  .hc-phase1-double__detail { grid-column: 1; grid-row: 3; width: 58%; justify-self: end; aspect-ratio: var(--hc-template-detail-mobile); margin-top: 28px; }
  .hc-phase1-double__action { grid-column: 1; grid-row: 4; margin-top: 24px; }
  .hc-phase1-text { width: min(calc(100% - 40px), 350px); }
  .hc-phase1-text[data-spacing="normal"] { padding-block: 64px; }
  .hc-phase1-text[data-spacing="spacious"] { padding-block: 88px; }
  .hc-phase1-text[data-spacing="grand"] { padding-block: 120px; }
}

@media (prefers-reduced-motion: reduce) {
  .hc-content-template *, .hc-content-template *::before, .hc-content-template *::after {
    scroll-behavior: auto !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
`;

/** 由五个 Renderer 共同注入；CSS 仅作用于 hc-content-template 命名空间。 */
export function ContentTemplateLayoutStyles() {
  useInsertionEffect(() => {
    const selector = "style[data-hc-content-template-layouts]";
    let style = document.querySelector<HTMLStyleElement>(selector);
    if (!style) {
      style = document.createElement("style");
      style.dataset.hcContentTemplateLayouts = "";
      document.head.append(style);
    }
    // 内容随 LAYOUT_CSS 同步更新：HMR 或数据变化后不残留旧比例。
    if (style.textContent !== LAYOUT_CSS) {
      style.textContent = LAYOUT_CSS;
    }
  }, [LAYOUT_CSS]);
  return null;
}
