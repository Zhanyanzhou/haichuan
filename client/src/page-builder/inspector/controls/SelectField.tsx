/**
 * SelectField.tsx — 下拉选择控件（原生 select，与 LinkTargetField 观感一致）。
 */
import { useId } from "react";

export interface SelectFieldProps {
  label: string;
  value: string;
  options: ReadonlyArray<{ label: string; value: string }>;
  onChange: (value: string) => void;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
}

export default function SelectField({
  label,
  value,
  options,
  onChange,
  hint,
  required,
  placeholder,
  disabled,
  allowEmpty,
  emptyLabel = "使用默认设置",
}: SelectFieldProps) {
  const id = useId();
  return (
    <div className="homepage-editor__inspector-field">
      <label htmlFor={id}>
        {label}
        {required ? <em>必填</em> : null}
        {hint ? (
          <span className="homepage-editor__inspector-hint">{hint}</span>
        ) : null}
      </label>
      <select
        id={id}
        value={value || ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {allowEmpty ? <option value="">{emptyLabel}</option> : null}
        {placeholder ? (
          <option value="" disabled={!allowEmpty}>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
