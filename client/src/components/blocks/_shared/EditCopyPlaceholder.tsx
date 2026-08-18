import type { CSSProperties } from "react";

/**
 * EditCopyPlaceholder — 装修编辑器画布内文字空字段的统一占位。
 *
 * 用途:运营拖入模板后,画布必须立刻呈现「文字层级 + 构图位置」,而不是
 * 一片空白(空字段不渲染真实节点时,画布会丢失文字这一整层信息)。
 * 占位沿用真实排印样式(衬线标题 / 无衬线正文),仅以浅灰 + 细虚线标记
 * 可编辑位置,与 BlockEmptyPlaceholder(图片空态)同属白盒画布占位体系。
 */
type Variant = "eyebrow" | "label" | "title" | "body" | "action";

interface Props {
  /** 字段名,如「标题」「副文」「眉题」 */
  label: string;
  /** 层级样式,模拟真实字段的排印 */
  variant: Variant;
  /** 居中块级字段(标题/正文)与行内字段(眉题/CTA)的对齐差异 */
  block?: boolean;
}

const VARIANT_STYLE: Record<Variant, CSSProperties> = {
  eyebrow: {
    fontFamily: "var(--hc-font-sans, Inter,system-ui,sans-serif)",
    fontSize: "var(--hc-type-caption, 12px)",
    letterSpacing: "0.24em",
    textTransform: "uppercase",
  },
  label: {
    fontFamily: "var(--hc-font-display, Georgia,serif)",
    fontSize: "clamp(13px, 0.75vw, 19px)",
    letterSpacing: "0.08em",
  },
  title: {
    fontFamily: "var(--hc-font-display, Georgia,serif)",
    fontSize: "var(--hc-type-display, clamp(32px, 4vw, 56px))",
    fontWeight: 400,
    lineHeight: 1.15,
    letterSpacing: "-0.01em",
  },
  body: {
    fontFamily: "var(--hc-font-sans, Inter,system-ui,sans-serif)",
    fontSize: "var(--hc-type-body, 15px)",
    lineHeight: 2,
  },
  action: {
    fontFamily: "var(--hc-font-sans, Inter,system-ui,sans-serif)",
    fontSize: 13,
    letterSpacing: "0.08em",
    borderBottom: "1px dashed #C9C6C0",
    paddingBottom: 4,
  },
} as const;

export default function EditCopyPlaceholder({
  label,
  variant,
  block = false,
}: Props) {
  return (
    <span
      data-edit-placeholder
      style={{
        ...VARIANT_STYLE[variant],
        display: block ? "block" : "inline-block",
        color: "#A8A59E",
        width: "fit-content",
        maxWidth: "100%",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {label}
    </span>
  );
}
