/**
 * SegmentedField.tsx — 分段单选控件。
 * 复用 homepage-editor__inspector-segmented 样式（LinkTargetField 同款）。
 * 2026-08-16 布局图示化：选项可携带 diagram 微缩构图示意，替代纯文字构图选项。
 */

interface SegmentedFieldProps {
  label?: string;
  hint?: string;
  value: string;
  options: ReadonlyArray<{ label: string; value: string; diagram?: string }>;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

const IMG_FILL = "#DDE1E2";
const IMG_STROKE = "#B8BEC1";
const LINE_FILL = "#6E7477";
const DOT_FILL = "#181A1B";

/** 布局选项的微缩构图示意（26×18）：图=灰块、文字=横线、文字位=深色点 */
export function OptionDiagram({ kind }: { kind: string }) {
  const lines = (xs: number[]) =>
    xs.map((y) => (
      <rect key={`l${y}`} x={2} y={y} width={9} height="1.6" rx="0.8" fill={LINE_FILL} />
    ));
  const linesRight = (xs: number[]) =>
    xs.map((y) => (
      <rect key={`r${y}`} x={15} y={y} width={9} height="1.6" rx="0.8" fill={LINE_FILL} />
    ));
  const imageRect = (x: number, y: number, w: number, h: number) => (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx="1"
      fill={IMG_FILL}
      stroke={IMG_STROKE}
      strokeWidth="0.8"
    />
  );

  switch (kind) {
    case "textLeftImageRight":
      return (
        <svg width="26" height="18" aria-hidden>
          {lines([4, 8, 12, 16])}
          {imageRect(14, 2, 10, 14)}
        </svg>
      );
    case "imageLeftTextRight":
      return (
        <svg width="26" height="18" aria-hidden>
          {imageRect(2, 2, 10, 14)}
          {linesRight([4, 8, 12, 16])}
        </svg>
      );
    case "mainLeft":
      return (
        <svg width="26" height="18" aria-hidden>
          {imageRect(2, 2, 14, 14)}
          {imageRect(18, 6, 6, 10)}
        </svg>
      );
    case "mainRight":
      return (
        <svg width="26" height="18" aria-hidden>
          {imageRect(2, 6, 6, 10)}
          {imageRect(10, 2, 14, 14)}
        </svg>
      );
    case "alignLeft":
      return (
        <svg width="26" height="18" aria-hidden>
          <rect x={4} y={6} width={14} height="1.8" rx="0.9" fill={LINE_FILL} />
          <rect x={4} y={10} width={9} height="1.8" rx="0.9" fill={LINE_FILL} />
        </svg>
      );
    case "alignCenter":
      return (
        <svg width="26" height="18" aria-hidden>
          <rect x={6} y={6} width={14} height="1.8" rx="0.9" fill={LINE_FILL} />
          <rect x={9} y={10} width={8} height="1.8" rx="0.9" fill={LINE_FILL} />
        </svg>
      );
    case "textCenter":
      return (
        <svg width="26" height="18" aria-hidden>
          {imageRect(0.8, 0.8, 24.4, 16.4)}
          <circle cx={13} cy={9} r="2" fill={DOT_FILL} />
        </svg>
      );
    case "textLeft":
      return (
        <svg width="26" height="18" aria-hidden>
          {imageRect(0.8, 0.8, 24.4, 16.4)}
          <circle cx={5} cy={9} r="2" fill={DOT_FILL} />
        </svg>
      );
    case "textRight":
      return (
        <svg width="26" height="18" aria-hidden>
          {imageRect(0.8, 0.8, 24.4, 16.4)}
          <circle cx={21} cy={9} r="2" fill={DOT_FILL} />
        </svg>
      );
    case "textBottomLeft":
      return (
        <svg width="26" height="18" aria-hidden>
          {imageRect(0.8, 0.8, 24.4, 16.4)}
          <circle cx={5} cy={14} r="2" fill={DOT_FILL} />
        </svg>
      );
    default:
      return null;
  }
}

export default function SegmentedField({
  label,
  hint,
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedFieldProps) {
  const hasDiagram = options.some((option) => option.diagram);
  const group = (
    <div
      className={`homepage-editor__inspector-segmented${options.length > 2 ? " is-three" : ""}${hasDiagram ? " has-diagram" : ""}`}
      role="group"
      aria-label={ariaLabel || label}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? "is-active" : ""}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.diagram ? <OptionDiagram kind={option.diagram} /> : null}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );

  if (!label) return group;

  return (
    <div className="homepage-editor__inspector-option-group">
      <div>
        <strong>{label}</strong>
        {hint ? <span>{hint}</span> : null}
      </div>
      {group}
    </div>
  );
}
