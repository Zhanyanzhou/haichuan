/**
 * layoutFields.ts — 共享的 Puck 布局字段定义
 *
 * 各适配器可以展开这些预置字段集，避免每个适配器重复定义
 * 列数、间距、背景、对齐等常见属性。
 */

/* ═══════ 通用布局字段 ═══════ */

/** 列数选择（grid-2 ~ grid-4，也用于产品展示、卡片等） */
export const columnsField = {
  type: "radio" as const,
  label: "列数",
  options: [
    { label: "2 列", value: "grid-2" },
    { label: "3 列", value: "grid-3" },
    { label: "4 列", value: "grid-4" },
  ],
};

/** 间距选项 */
export const spacingField = {
  type: "radio" as const,
  label: "内边距",
  options: [
    { label: "紧凑", value: "compact" },
    { label: "正常", value: "normal" },
    { label: "宽松", value: "spacious" },
  ],
};

/** 背景色 */
export const bgColorField = {
  type: "text" as const,
  label: "背景色（CSS 颜色值）",
};

/** 内容宽度约束 */
export const maxWidthField = {
  type: "radio" as const,
  label: "内容宽度",
  options: [
    { label: "全宽", value: "full" },
    { label: "标准 (1280px)", value: "1280" },
    { label: "窄栏 (960px)", value: "960" },
    { label: "窄栏 (720px)", value: "720" },
  ],
};

/* ═══════ 文本排版字段 ═══════ */

/** 文字对齐 */
export const textAlignField = {
  type: "radio" as const,
  label: "文字对齐",
  options: [
    { label: "居中", value: "center" },
    { label: "左对齐", value: "left" },
  ],
};

/** 按钮文字 */
export const buttonTextField = {
  type: "text" as const,
  label: "按钮文字",
};

/** 按钮链接 */
export const buttonLinkField = {
  type: "text" as const,
  label: "按钮链接",
};

/* ═══════ 组合预置 ═══════ */

/** 商品/卡片类区块的通用布局字段 */
export const cardGridLayoutFields: Record<string, any> = {
  layout: columnsField,
  bgColor: bgColorField,
};

/** 文本横幅类区块的通用排版字段 */
export const textBannerLayoutFields: Record<string, any> = {
  template: textAlignField,
  spacing: spacingField,
  bgColor: bgColorField,
};

/** Hero/海报类区块的通用图片字段 */
export const heroImageFields: Record<string, any> = {
  desktopImage: { type: "text" as const, label: "桌面端图片 URL" },
  mobileImage: { type: "text" as const, label: "手机端图片 URL（建议填写）" },
};
