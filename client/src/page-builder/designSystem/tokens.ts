/**
 * tokens.ts — 店铺装修 Canvas Design System 的唯一 token 来源。
 *
 * 用法约定:
 * - 区块内联样式一律写 `var(--hc-*, fallback)`,fallback 为字面值;
 *   被 DecorSection(或 DesignSystemStyles)包裹后 token 生效,
 *   尚未迁移的旧区块仍靠 fallback 保底可看。
 * - 迁移完成后禁止在区块里新增硬编码色值/字体串/间距像素;
 *   旧字面值仅作为 fallback 保留。
 * - 比例只能取自 RATIOS(8 个规范比例),不允许新造比例值。
 */

/* ═══ 内容宽度(4 档,终结每区块自定 maxWidth) ═══ */
export const WIDTHS = {
  /** 通栏视觉(Hero/沉浸图/尾章) */
  full: "100%",
  /** Editorial Story / 画廊 */
  wide: "1520px",
  /** 分栏 / 商品网格 / 入口卡组 */
  standard: "1280px",
  /** 文字章节 / 旅程 */
  editorial: "1120px",
  /** 宣言正文 / 引语 */
  narrow: "720px",
} as const;

export type WidthToken = keyof typeof WIDTHS;

/* ═══ 规范图片比例(唯一合法集合,不要新增) ═══ */
export const RATIOS = {
  // "21:9" 已清退(2026-08-16)：全站零引用，比例贵精不贵多。
  "21:6": "21 / 6",
  "16:7": "16 / 7",
  "16:9": "16 / 9",
  "3:2": "3 / 2",
  "4:5": "4 / 5",
  "3:4": "3 / 4",
  "1:1": "1 / 1",
} as const;

export type RatioToken = keyof typeof RATIOS;

/* ═══ 双模式密度与留白档位 ═══ */
export type DensityMode = "brand" | "commerce";
export type SpacingLevel = "compact" | "normal" | "spacious";

/* ═══ 字体(品牌字串唯一来源,区块不再各自拼写) ═══ */
export const FONT_DISPLAY = '"Cormorant Garamond","Noto Serif SC",serif';
export const FONT_SANS = "Inter,system-ui,-apple-system,sans-serif";

/* ═══ 品牌色板(配色预设的唯一色值来源;消灭 #B8944E/#a9854d/#8E6A35 漂移) ═══ */
export type ToneKey = "ivory" | "champagne" | "ink" | "brand";

export interface TonePreset {
  label: string;
  bg: string;
  ink: string;
  muted: string;
  gold: string;
  line: string;
}

export const TONE_PRESETS: Record<ToneKey, TonePreset> = {
  ivory: {
    label: "米白经典",
    bg: "#FBF9F6",
    ink: "#2C2C2C",
    muted: "#8A7F72",
    gold: "#B8944E",
    line: "rgba(0,0,0,0.08)",
  },
  champagne: {
    label: "暖金高级",
    bg: "#F5EDE0",
    ink: "#2C2C2C",
    muted: "#8A7F72",
    gold: "#9A7B3E",
    line: "rgba(0,0,0,0.08)",
  },
  ink: {
    label: "深色典雅",
    bg: "#211D19",
    ink: "#FFFFFF",
    muted: "rgba(255,255,255,0.78)",
    gold: "#D8B86D",
    line: "rgba(255,255,255,0.14)",
  },
  brand: {
    label: "品牌米金",
    bg: "#FCFCFB",
    ink: "#28231F",
    muted: "rgba(40,35,31,0.58)",
    gold: "#B8944E",
    line: "rgba(0,0,0,0.08)",
  },
};

/**
 * Design System 基础样式(由 DesignSystemStyles 幂等注入)。
 * 只定义 CSS 变量与 .hc-section 的节奏规则,不含任何具体业务样式。
 */
export const DESIGN_SYSTEM_BASE_CSS = `
.hc-section {
  /* 页面左右留白:Mobile 20px → PC clamp(48px,6vw,96px) */
  --hc-px: 20px;
  /* 纵向节奏:Brand 大留白 / Commerce 提高信息密度 */
  --hc-py-brand: clamp(64px, 10vw, 96px);
  --hc-py-commerce: 48px;
  /* 字体 */
  --hc-font-display: ${FONT_DISPLAY};
  --hc-font-sans: ${FONT_SANS};
  /* Typography(Mobile 档) */
  --hc-type-hero: clamp(28px, 9vw, 36px);
  --hc-type-display: clamp(28px, 8vw, 36px);
  --hc-type-h2: clamp(22px, 6vw, 28px);
  --hc-type-h3: 20px;
  --hc-type-body: 15px;
  --hc-type-caption: 12px;
}
@media (min-width: 768px) {
  .hc-section {
    --hc-px: clamp(48px, 6vw, 96px);
    --hc-py-brand: clamp(96px, 12vh, 160px);
    --hc-py-commerce: clamp(56px, 7vh, 96px);
    --hc-type-hero: clamp(40px, 5vw, 68px);
    --hc-type-display: clamp(42px, 5vw, 56px);
    --hc-type-h2: clamp(28px, 3vw, 36px);
    --hc-type-h3: clamp(22px, 2.2vw, 26px);
    --hc-type-body: 16px;
    --hc-type-caption: 13px;
  }
}
/* 节奏与留白档位:密度决定基准,三档留白做乘数,bleed 通栏不吃纵向节奏 */
.hc-section { padding-block: var(--hc-py-base, 0px); }
.hc-section[data-spacing="compact"] { padding-block: calc(var(--hc-py-base, 0px) * 0.66); }
.hc-section[data-spacing="spacious"] { padding-block: calc(var(--hc-py-base, 0px) * 1.32); }
.hc-section[data-flow="bleed"] { padding-block: 0; }
`;
