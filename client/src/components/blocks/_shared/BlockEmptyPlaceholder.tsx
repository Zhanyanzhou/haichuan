/**
 * BlockEmptyPlaceholder — 装修编辑器画布内 block 空值统一占位
 * 用于 editMode 下图片/数据未配置时，向运营明确"这里需要填充"，
 * 避免误把老兜底数据当成默认成品。
 */
interface Props {
  icon?: string;
  hint: string;
  spec?: string;
  height?: string | number;
  bg?: string;
}

export default function BlockEmptyPlaceholder({
  icon,
  hint,
  spec,
  height,
  bg,
}: Props) {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        minHeight: height ?? 320,
        padding: "48px 24px",
        background: bg ?? "#F0EDE6",
        border: "1px dashed #B8944E",
        textAlign: "center",
        boxSizing: "border-box",
      }}
    >
      {icon && (
        <span style={{ fontSize: 34, lineHeight: 1, opacity: 0.85 }}>{icon}</span>
      )}
      <p
        style={{
          margin: 0,
          color: "#B8944E",
          fontSize: 13,
          letterSpacing: "0.04em",
        }}
      >
        {hint}
      </p>
      {spec && (
        <p style={{ margin: 0, color: "rgba(184,148,78,0.7)", fontSize: 12 }}>
          {spec}
        </p>
      )}
    </section>
  );
}
