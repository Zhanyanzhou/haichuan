/**
 * BlockEmptyPlaceholder — 装修编辑器画布内 block 空值统一占位
 * 用于 editMode 下图片/数据未配置时，向运营明确"这里需要填充"，
 * 避免误把老兜底数据当成默认成品。
 *
 * 视觉语言(2026-08-18 对齐 UI_GUIDE/契约表面)：纯白、石墨、石灰、
 * 低饱和灰线与单一香槟金识别符；无渐变、无蓝灰科技色。
 * ratio 传入时空态即契约比例框(空素材结构不坍塌),与画布/前台渲染同源。
 */
interface Props {
  icon?: string;
  hint: string;
  spec?: string;
  /** 契约比例(如 "3 / 2"),空态按比例框呈现;与 height 二选一,height 优先 */
  ratio?: string;
  /** 深色区块(ink 配色)上的空态用暗色表面 */
  tone?: "neutral" | "dark";
  height?: string | number;
  bg?: string;
}

const SURFACE = {
  neutral: {
    canvas: "#FFFFFF",
    line: "#DDE1E2",
    ink: "#5F6568",
    muted: "#6E7477",
    sketch: "#DDE1E2",
    accent: "#181A1B",
  },
  dark: {
    canvas: "#181A1B",
    line: "#5F6568",
    ink: "#DDE1E2",
    muted: "#6E7477",
    sketch: "#181A1B",
    accent: "#F7F8F8",
  },
} as const;

export default function BlockEmptyPlaceholder({
  hint,
  spec,
  ratio,
  tone = "neutral",
  height,
  bg,
}: Props) {
  const color = SURFACE[tone];
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        height: height ?? undefined,
        minHeight: height ?? (ratio ? undefined : 320),
        aspectRatio: !height && ratio ? ratio : undefined,
        padding: "clamp(30px, 6vw, 48px) 24px",
        background: bg ?? color.canvas,
        border: `1px solid ${color.line}`,
        color: color.ink,
        textAlign: "center",
        boxSizing: "border-box",
        width: "100%",
      }}
    >
      <svg
        viewBox="0 0 118 84"
        fill="none"
        aria-hidden="true"
        style={{ width: "clamp(160px, 28%, 240px)", height: "auto", maxWidth: "78%" }}
      >
        <path d="M16 28.5c0-4.6 3.7-8.3 8.3-8.3 3.6 0 6.7 2.3 7.8 5.6a7.7 7.7 0 0 1 11.3 6.8c0 4.3-3.5 7.8-7.8 7.8H17.8A8.2 8.2 0 0 1 16 28.5Z" stroke={color.sketch} strokeWidth="1.5" />
        <path d="M82 49.6c0-3.9 3.1-7 7-7 3.1 0 5.8 2 6.7 4.8a6.6 6.6 0 0 1 9.7 5.8c0 3.7-3 6.7-6.7 6.7H83.6A7 7 0 0 1 82 49.6Z" stroke={color.sketch} strokeWidth="1.5" />
        <rect x="43" y="27" width="38" height="31" rx="3.5" stroke={color.line} strokeWidth="1.5" />
        {/* 山形与日点为空态识别符,单一香槟金 */}
        <path d="m46.5 53 8.6-8.2 7.2 6 5.8-5.2 9.5 8.4" stroke={color.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="71.2" cy="36.8" r="3.6" stroke={color.accent} strokeWidth="1.5" />
        <path d="M32 68.5h54" stroke={color.line} strokeWidth="3" strokeLinecap="round" />
      </svg>
      <p
        style={{
          margin: 0,
          color: color.ink,
          fontSize: 16,
          lineHeight: 1.5,
        }}
      >
        {hint}
      </p>
      {spec && (
        <p style={{ margin: 0, color: color.muted, fontSize: 13, lineHeight: 1.5 }}>
          {spec}
        </p>
      )}
    </section>
  );
}
