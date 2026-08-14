/**
 * SegmentedField.tsx — 分段单选控件。
 * 复用 homepage-editor__inspector-segmented 样式（LinkTargetField 同款）。
 */
interface SegmentedFieldProps {
  label?: string;
  hint?: string;
  value: string;
  options: ReadonlyArray<{ label: string; value: string }>;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

export default function SegmentedField({
  label,
  hint,
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedFieldProps) {
  const group = (
    <div
      className={`homepage-editor__inspector-segmented${options.length > 2 ? " is-three" : ""}`}
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
          {option.label}
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
