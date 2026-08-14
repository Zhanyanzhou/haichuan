/**
 * PresetField.tsx — 设计预设选择器（配色方案 / 间距方案等）。
 * 点击预设一次写入一组 props 键值（patch）；不直接暴露专业参数。
 */
import type { InspectorContext } from "../schema/types";

interface PresetFieldProps {
  label: string;
  hint?: string;
  value?: string;
  options: ReadonlyArray<{
    label: string;
    value: string;
    patch: Record<string, any>;
    isActive?: (ctx: InspectorContext) => boolean;
  }>;
  ctx: InspectorContext;
  onApply: (patch: Record<string, any>, value: string) => void;
}

export default function PresetField({
  label,
  hint,
  value,
  options,
  ctx,
  onApply,
}: PresetFieldProps) {
  return (
    <div className="homepage-editor__inspector-option-group">
      <div>
        <strong>{label}</strong>
        {hint ? <span>{hint}</span> : null}
      </div>
      <div
        className={`homepage-editor__inspector-segmented${options.length > 2 ? " is-three" : ""}`}
        role="group"
        aria-label={label}
      >
        {options.map((option) => {
          const active = option.isActive
            ? option.isActive(ctx)
            : value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={active ? "is-active" : ""}
              aria-pressed={active}
              onClick={() => onApply(option.patch, option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
