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
  columns: 12 | 8 | 1;
  mediaRatio?: string;
  detailRatio?: string;
  /** schema v2 根角色 id 顺序；集合型模板不再展开重复 generic role。 */
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
  tablet: ResponsiveSkeleton;
  mobile: ResponsiveSkeleton;
  controls: readonly string[];
  heightModeByViewport: {
    desktop: "viewport" | "ratio" | "content";
    tablet: "viewport" | "ratio" | "content";
    mobile: "viewport" | "ratio" | "content";
  };
  visualRole: "primary-stage" | "feature-stage" | "support-stage";
  isSkeleton?: boolean;
  master: MasterId;
  width: "full" | "standard" | "wide" | "editorial";
  flow: "bleed" | "flow";
}

/**
 * 第一批五模板的最小语义布局源。
 *
 * 这里只保存模板专属的比例、主次、三端顺序和受控选项；颜色、字体、
 * 容器与全局间距继续由 designSystem tokens / UI_GUIDE 提供。缩略图与
 * Renderer 均消费本对象，避免两处各自维护坐标和内容顺序。
 */
const ACTIVE_TEMPLATE_LAYOUTS = {
  hero: {
    ...CONTENT_TEMPLATE_CONTRACTS.hero,
    preview: {
      tone: "dark",
      zones: [
        { role: "media", column: 1, span: 12, row: 2, rowSpan: 4 },
        { role: "copy", column: 2, span: 5, row: 3, rowSpan: 1, overlay: true },
        {
          role: "action",
          column: 2,
          span: 3,
          row: 4,
          rowSpan: 1,
          overlay: true,
        },
      ],
    },
    desktop: {
      columns: 12,
      mediaRatio: CONTENT_TEMPLATE_CONTRACTS.hero.media[0].desktopRatio,
      order: ["media", "copy", "action"],
    },
    tablet: {
      columns: 8,
      mediaRatio: CONTENT_TEMPLATE_CONTRACTS.hero.media[0].tabletRatio,
      order: ["media", "copy", "action"],
    },
    mobile: {
      columns: 1,
      mediaRatio: CONTENT_TEMPLATE_CONTRACTS.hero.media[1].mobileRatio,
      order: ["media", "copy", "action"],
    },
    controls: CONTENT_TEMPLATE_CONTRACTS.hero.allowedControls,
  },
  fullBleed: {
    ...CONTENT_TEMPLATE_CONTRACTS.fullBleed,
    preview: {
      tone: "light",
      zones: [
        { role: "media", column: 1, span: 12, row: 1, rowSpan: 3 },
        { role: "copy", column: 1, span: 8, row: 4, rowSpan: 2 },
        { role: "action", column: 10, span: 3, row: 5, rowSpan: 1 },
      ],
    },
    desktop: {
      columns: 12,
      mediaRatio: CONTENT_TEMPLATE_CONTRACTS.fullBleed.media[0].desktopRatio,
      order: ["media", "copy", "action"],
    },
    tablet: {
      columns: 8,
      mediaRatio: CONTENT_TEMPLATE_CONTRACTS.fullBleed.media[0].tabletRatio,
      order: ["media", "copy", "action"],
    },
    mobile: {
      columns: 1,
      mediaRatio: CONTENT_TEMPLATE_CONTRACTS.fullBleed.media[1].mobileRatio,
      order: ["media", "copy", "action"],
    },
    controls: CONTENT_TEMPLATE_CONTRACTS.fullBleed.allowedControls,
  },
  singlePoster: {
    ...CONTENT_TEMPLATE_CONTRACTS.singlePoster,
    preview: {
      tone: "light",
      zones: [
        { role: "copy", column: 1, span: 4.56, row: 3, rowSpan: 3 },
        { role: "action", column: 1, span: 3, row: 7, rowSpan: 1 },
        { role: "media", column: 5.56, span: 7.44, row: 1, rowSpan: 8 },
      ],
    },
    desktop: {
      columns: 12,
      mediaRatio: CONTENT_TEMPLATE_CONTRACTS.singlePoster.media[0].desktopRatio,
      order: ["copy", "action", "media"],
    },
    tablet: {
      columns: 8,
      mediaRatio: CONTENT_TEMPLATE_CONTRACTS.singlePoster.media[0].tabletRatio,
      order: ["media", "copy", "action"],
    },
    mobile: {
      columns: 1,
      mediaRatio: CONTENT_TEMPLATE_CONTRACTS.singlePoster.media[1].mobileRatio,
      order: ["media", "copy", "action"],
    },
    controls: CONTENT_TEMPLATE_CONTRACTS.singlePoster.allowedControls,
  },
  doublePoster: {
    ...CONTENT_TEMPLATE_CONTRACTS.doublePoster,
    preview: {
      tone: "light",
      zones: [
        { role: "mainMedia", column: 1, span: 8, row: 1, rowSpan: 6 },
        { role: "detailMedia", column: 9, span: 4, row: 2, rowSpan: 4 },
        { role: "copy", column: 9, span: 4, row: 6, rowSpan: 2 },
        { role: "action", column: 9, span: 2, row: 8, rowSpan: 1 },
      ],
    },
    desktop: {
      columns: 12,
      mediaRatio: CONTENT_TEMPLATE_CONTRACTS.doublePoster.media[0].desktopRatio,
      detailRatio:
        CONTENT_TEMPLATE_CONTRACTS.doublePoster.media[1].desktopRatio,
      order: ["mainMedia", "detailMedia", "copy", "action"],
    },
    tablet: {
      columns: 8,
      mediaRatio: CONTENT_TEMPLATE_CONTRACTS.doublePoster.media[0].tabletRatio,
      detailRatio: CONTENT_TEMPLATE_CONTRACTS.doublePoster.media[1].tabletRatio,
      order: ["mainMedia", "copy", "detailMedia", "action"],
    },
    mobile: {
      columns: 1,
      mediaRatio: CONTENT_TEMPLATE_CONTRACTS.doublePoster.media[0].mobileRatio,
      detailRatio: CONTENT_TEMPLATE_CONTRACTS.doublePoster.media[1].mobileRatio,
      order: ["mainMedia", "copy", "detailMedia", "action"],
    },
    controls: CONTENT_TEMPLATE_CONTRACTS.doublePoster.allowedControls,
  },
  textBanner: {
    ...CONTENT_TEMPLATE_CONTRACTS.textBanner,
    preview: {
      tone: "light",
      zones: [
        { role: "copy", column: 3, span: 8, row: 3, rowSpan: 3 },
        { role: "action", column: 5, span: 4, row: 7, rowSpan: 1 },
      ],
    },
    desktop: {
      columns: 12,
      order: ["copy", "action"],
    },
    tablet: {
      columns: 8,
      order: ["copy", "action"],
    },
    mobile: {
      columns: 1,
      order: ["copy", "action"],
    },
    controls: CONTENT_TEMPLATE_CONTRACTS.textBanner.allowedControls,
  },
} as const satisfies Record<"hero" | "fullBleed" | "singlePoster" | "doublePoster" | "textBanner", ContentTemplateLayout>;

const getSlotRatio = (
  skeleton: ContentTemplateSkeleton,
  device: "desktop" | "tablet" | "mobile",
  role: "media" | "mainMedia" | "detailMedia",
) => skeleton.slots.find((slot) => slot.role === role)?.[`${device}Ratio`];

const getPrimaryRatio = (
  skeleton: ContentTemplateSkeleton,
  device: "desktop" | "tablet" | "mobile",
) => getSlotRatio(skeleton, device, "media")
  ?? getSlotRatio(skeleton, device, "mainMedia")
  ?? skeleton.slots.find((slot) => slot.desktopRatio || slot.tabletRatio || slot.mobileRatio)?.[`${device}Ratio`];

/**
 * 其余 18 个模板同样拥有真实 adapter / Renderer。这里仅把 schema v2
 * 生成产物转换为渲染布局元数据，不能据 implementationStatus 再降级为骨架。
 */
const PLANNED_TEMPLATE_LAYOUTS = Object.fromEntries(
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
      tablet: {
        columns: 8,
        mediaRatio: getPrimaryRatio(skeleton, "tablet"),
        detailRatio: getSlotRatio(skeleton, "tablet", "detailMedia"),
        order: contract.order.tablet,
      },
      mobile: {
        columns: 1,
        mediaRatio: getPrimaryRatio(skeleton, "mobile"),
        detailRatio: getSlotRatio(skeleton, "mobile", "detailMedia"),
        order: contract.order.mobile,
      },
      controls: contract.allowedControls,
      isSkeleton: false,
      // planned 历史消费面只需要一个已注册母版类型；真实区块仍由各 adapter 决定表现层。
      master: "editorial-text",
    }];
  }),
) as unknown as Record<string, ContentTemplateLayout>;

export const CONTENT_TEMPLATE_LAYOUTS = {
  ...ACTIVE_TEMPLATE_LAYOUTS,
  ...PLANNED_TEMPLATE_LAYOUTS,
} as unknown as Record<ContentTemplateLayoutKey, ContentTemplateLayout>;

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
): TemplateStyle {
  return {
    "--hc-template-media-desktop": layout.desktop.mediaRatio ?? "auto",
    "--hc-template-media-tablet": layout.tablet.mediaRatio ?? "auto",
    "--hc-template-media-mobile": layout.mobile.mediaRatio ?? "auto",
    "--hc-template-detail-desktop": layout.desktop.detailRatio ?? "auto",
    "--hc-template-detail-tablet": layout.tablet.detailRatio ?? "auto",
    "--hc-template-detail-mobile": layout.mobile.detailRatio ?? "auto",
  };
}

const LAYOUT_CSS = `
.hc-content-template {
  --hc-template-container: 1280px;
  --hc-template-gutter: var(--hc-px, clamp(20px, 5vw, 80px));
  color: var(--hc-ink, #222222);
  background: var(--hc-bg, #FFFFFF);
}
.hc-content-template__container {
  width: min(calc(100% - (var(--hc-template-gutter) * 2)), var(--hc-template-container));
  margin-inline: auto;
}
.hc-content-template__media {
  position: relative;
  overflow: hidden;
  background: #F5F5F5;
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
  color: var(--hc-muted, #5C5C5C);
  font: 500 var(--hc-type-caption, 12px)/1.4 var(--hc-font-sans, sans-serif);
  letter-spacing: .12em;
  text-transform: uppercase;
}
.hc-content-template__title {
  margin: 0;
  color: var(--hc-ink, #222222);
  font-family: var(--hc-font-display, serif);
  font-weight: 400;
  line-height: 1.2;
}
.hc-content-template__body {
  max-width: 45em;
  margin: 16px 0 0;
  color: var(--hc-muted, #5C5C5C);
  font: 400 var(--hc-type-body, 15px)/1.8 var(--hc-font-sans, sans-serif);
}
.hc-content-template__action {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  color: var(--hc-ink, #222222);
  font: 500 var(--hc-type-caption, 12px)/1.4 var(--hc-font-sans, sans-serif);
  letter-spacing: .08em;
  text-decoration: none;
  border-bottom: 1px solid var(--hc-gold, #B8944E);
}
.hc-content-template__action:focus-visible {
  outline: 2px solid #6F5733;
  outline-offset: 4px;
}

/* 首屏：桌面是导航后的可见舞台，16:7 仅是图片交付与裁切建议，不决定根区块高度。 */
.hc-phase1-hero {
  min-height: max(620px, calc(100svh - var(--hc-hero-nav-offset, 80px)));
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
  bottom: clamp(40px, 7vh, 76px);
  pointer-events: none;
}
.hc-phase1-hero__copy {
  width: min(calc(100% - (var(--hc-template-gutter) * 2)), 1280px);
  max-width: none;
  margin-inline: auto;
  color: #FFFFFF;
}
.hc-phase1-hero__copy[data-align="center"] { text-align: center; }
.hc-phase1-hero__copy[data-align="center"] > * { margin-inline: auto; }
.hc-phase1-hero__copy .hc-content-template__title,
.hc-phase1-hero__copy .hc-content-template__action { color: #FFFFFF; }
.hc-phase1-hero__copy .hc-content-template__body,
.hc-phase1-hero__copy .hc-content-template__eyebrow { color: rgba(255,255,255,.82); }
.hc-phase1-hero__copy .hc-content-template__action { pointer-events: auto; border-color: rgba(255,255,255,.68); }

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

/* 单图文：桌面严格 38/62；平板、手机改为固定阅读顺序。 */
.hc-phase1-single {
  display: grid;
  grid-template-columns: minmax(0, 38fr) minmax(0, 62fr);
  gap: 24px;
  align-items: center;
}
.hc-phase1-single__media { grid-column: 2; aspect-ratio: var(--hc-template-media-desktop); }
.hc-phase1-single__copy { grid-column: 1; grid-row: 1; }
.hc-phase1-single[data-mirror="true"] .hc-phase1-single__media { grid-column: 1; }
.hc-phase1-single[data-mirror="true"] .hc-phase1-single__copy { grid-column: 2; }

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

@media (min-width: 768px) and (max-width: 1023px) {
  .hc-content-template { --hc-template-gutter: 28px; }
  .hc-phase1-hero { min-height: 0; }
  .hc-phase1-hero__media { position: relative; inset: auto; height: auto; min-height: 0; aspect-ratio: var(--hc-template-media-tablet); }
  .hc-phase1-hero__copy-band { position: relative; bottom: auto; padding-block: 40px 56px; background: var(--hc-bg, #FFFFFF); }
  .hc-phase1-hero__copy { width: min(calc(100% - 56px), 704px); color: var(--hc-ink, #222222); }
  .hc-phase1-hero__copy .hc-content-template__title,
  .hc-phase1-hero__copy .hc-content-template__action { color: var(--hc-ink, #222222); }
  .hc-phase1-hero__copy .hc-content-template__body,
  .hc-phase1-hero__copy .hc-content-template__eyebrow { color: var(--hc-muted, #5C5C5C); }
  .hc-phase1-hero__copy .hc-content-template__action { border-color: var(--hc-gold, #B8944E); }
  .hc-phase1-full-bleed__media { aspect-ratio: var(--hc-template-media-tablet); }
  .hc-phase1-full-bleed__caption { grid-template-columns: repeat(8, minmax(0, 1fr)); }
  .hc-phase1-full-bleed__copy { grid-column: 1 / span 6; }
  .hc-phase1-full-bleed__action { grid-column: 7 / span 2; }
  .hc-phase1-single { grid-template-columns: minmax(0, 38fr) minmax(0, 62fr); align-items: start; }
  .hc-phase1-single__media { grid-column: 2; grid-row: 1; aspect-ratio: var(--hc-template-media-tablet); }
  .hc-phase1-single__copy { grid-column: 1; grid-row: 2; margin-top: 24px; }
  .hc-phase1-single[data-mirror="true"] .hc-phase1-single__media { grid-column: 1; }
  .hc-phase1-single[data-mirror="true"] .hc-phase1-single__copy { grid-column: 2; }
  .hc-phase1-double { grid-template-columns: repeat(8, minmax(0, 1fr)); }
  .hc-phase1-double__main { grid-column: 1 / span 8; grid-row: 1; aspect-ratio: var(--hc-template-media-tablet); }
  .hc-phase1-double__copy { grid-column: 1 / span 5; grid-row: 2; padding-top: 32px; }
  .hc-phase1-double__detail { grid-column: 6 / span 3; grid-row: 2; aspect-ratio: var(--hc-template-detail-tablet); margin-top: 32px; }
  .hc-phase1-double__action { grid-column: 1 / span 5; grid-row: 3; }
  .hc-phase1-text { width: calc((100% - 56px) * .75); max-width: 720px; }
  .hc-phase1-text[data-spacing="normal"] { padding-block: 80px; }
  .hc-phase1-text[data-spacing="spacious"] { padding-block: 112px; }
}

@media (max-width: 767px) {
  .hc-content-template { --hc-template-gutter: 20px; }
  .hc-phase1-hero { min-height: 0; }
  .hc-phase1-hero__media { position: relative; inset: auto; height: auto; min-height: 0; aspect-ratio: var(--hc-template-media-mobile); }
  .hc-phase1-hero__copy-band { position: relative; bottom: auto; padding-block: 32px 48px; background: var(--hc-bg, #FFFFFF); }
  .hc-phase1-hero__copy { width: calc(100% - 40px); color: var(--hc-ink, #222222); text-align: left !important; }
  .hc-phase1-hero__copy > * { margin-inline: 0 !important; }
  .hc-phase1-hero__copy .hc-content-template__title,
  .hc-phase1-hero__copy .hc-content-template__action { color: var(--hc-ink, #222222); }
  .hc-phase1-hero__copy .hc-content-template__body,
  .hc-phase1-hero__copy .hc-content-template__eyebrow { color: var(--hc-muted, #5C5C5C); }
  .hc-phase1-hero__copy .hc-content-template__action { border-color: var(--hc-gold, #B8944E); }
  .hc-phase1-full-bleed__media { aspect-ratio: var(--hc-template-media-mobile); }
  .hc-phase1-full-bleed__caption { display: block; padding-block: 28px 44px; }
  .hc-phase1-full-bleed__action { margin-top: 22px; }
  .hc-phase1-single { display: block; }
  .hc-phase1-single__media { aspect-ratio: var(--hc-template-media-mobile); }
  .hc-phase1-single__copy { margin-top: 28px; }
  .hc-phase1-double { display: grid; grid-template-columns: 1fr; gap: 0; }
  .hc-phase1-double__main { grid-column: 1; grid-row: 1; aspect-ratio: var(--hc-template-media-mobile); }
  .hc-phase1-double__copy { grid-column: 1; grid-row: 2; margin-top: 28px; }
  .hc-phase1-double__detail { grid-column: 1; grid-row: 3; width: 58%; justify-self: end; aspect-ratio: var(--hc-template-detail-mobile); margin-top: 28px; }
  .hc-phase1-double__action { grid-column: 1; grid-row: 4; margin-top: 24px; }
  .hc-phase1-text { width: min(calc(100% - 40px), 350px); }
  .hc-phase1-text[data-spacing="normal"] { padding-block: 64px; }
  .hc-phase1-text[data-spacing="spacious"] { padding-block: 88px; }
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
    if (document.querySelector("style[data-hc-content-template-layouts]")) {
      return;
    }
    const style = document.createElement("style");
    style.dataset.hcContentTemplateLayouts = "";
    style.textContent = LAYOUT_CSS;
    document.head.append(style);
  }, []);
  return null;
}
