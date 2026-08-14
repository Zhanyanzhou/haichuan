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
        gap: 14,
        height: height ?? undefined,
        minHeight: height ?? 320,
        padding: "clamp(30px, 6vw, 48px) 24px",
        background: bg ?? "linear-gradient(180deg, #FFFFFF 0%, #FAFBFD 100%)",
        border: "1px solid #DCE3EE",
        color: "#667085",
        textAlign: "center",
        boxSizing: "border-box",
      }}
    >
      <svg
        viewBox="0 0 118 84"
        fill="none"
        aria-hidden="true"
        style={{ width: "clamp(160px, 28%, 240px)", height: "auto", maxWidth: "78%" }}
      >
        <path d="M16 28.5c0-4.6 3.7-8.3 8.3-8.3 3.6 0 6.7 2.3 7.8 5.6a7.7 7.7 0 0 1 11.3 6.8c0 4.3-3.5 7.8-7.8 7.8H17.8A8.2 8.2 0 0 1 16 28.5Z" stroke="#D9E0E9" strokeWidth="1.5" />
        <path d="M82 49.6c0-3.9 3.1-7 7-7 3.1 0 5.8 2 6.7 4.8a6.6 6.6 0 0 1 9.7 5.8c0 3.7-3 6.7-6.7 6.7H83.6A7 7 0 0 1 82 49.6Z" stroke="#D9E0E9" strokeWidth="1.5" />
        <rect x="43" y="27" width="38" height="31" rx="3.5" stroke="#3687F5" strokeWidth="2" />
        <path d="m46.5 53 8.6-8.2 7.2 6 5.8-5.2 9.5 8.4" stroke="#3687F5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="71.2" cy="36.8" r="3.6" stroke="#3687F5" strokeWidth="2" />
        <path d="M32 68.5h54" stroke="#E7EBF1" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <p
        style={{
          margin: 0,
          color: "#667085",
          fontSize: 16,
          lineHeight: 1.5,
        }}
      >
        {hint}
      </p>
      {spec && (
        <p style={{ margin: 0, color: "#98A2B3", fontSize: 13, lineHeight: 1.5 }}>
          {spec}
        </p>
      )}
    </section>
  );
}
