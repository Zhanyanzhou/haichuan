/**
 * layoutFields.ts — 共享的间距选项常量
 *
 * Inspector Schema 与 Puck 字段均引用 SPACING_OPTIONS，避免文案漂移。
 * 2026-08-21 批次 B：旧 Puck 预置字段（columnsField/spacingField/bgColorField/
 * maxWidthField/textAlignField/buttonTextField/buttonLinkField 与三组组合对象）
 * 经全仓复核无消费者，已随声明式 Schema 体系退场删除。
 */

/**
 * 间距选项（全站统一文案：紧凑 / 标准 / 宽松；值与旧数据 compact/normal/spacious 保持不变）
 * Inspector Schema 与 Puck 字段均引用本常量，避免文案漂移。
 */
export const SPACING_OPTIONS = [
  { label: "紧凑", value: "compact" },
  { label: "标准", value: "normal" },
  { label: "宽松", value: "spacious" },
] as const;
