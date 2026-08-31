/**
 * TextField.tsx — 文本 / 多行文本控件（薄封装 antd Input）。
 * 复用 homepage-editor__inspector-field 样式体系，与专属面板观感一致。
 */
import { useId } from "react";
import { Input } from "antd";

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  /** 多行文本行数；提供时渲染 TextArea */
  rows?: number;
  showCount?: boolean;
  /** 为空且必填时标红 */
  error?: boolean;
  readOnly?: boolean;
}

export default function TextField({
  label,
  value,
  onChange,
  hint,
  required,
  maxLength,
  placeholder,
  rows,
  showCount,
  error,
  readOnly,
}: TextFieldProps) {
  const inputId = useId();
  const countVisible = showCount ?? Boolean(maxLength);
  return (
    <div className="homepage-editor__inspector-field">
      <label htmlFor={inputId}>
        {label}
        {required ? <em>必填</em> : null}
        {countVisible && maxLength ? (
          <span className="homepage-editor__inspector-count">
            {(value || "").length}/{maxLength}
          </span>
        ) : hint ? (
          <span className="homepage-editor__inspector-hint">{hint}</span>
        ) : null}
      </label>
      {rows ? (
        <Input.TextArea
          id={inputId}
          aria-label={label}
          aria-required={required || undefined}
          aria-invalid={error || undefined}
          value={value || ""}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
          rows={rows}
          status={error ? "error" : undefined}
        />
      ) : (
        <Input
          id={inputId}
          aria-label={label}
          aria-required={required || undefined}
          aria-invalid={error || undefined}
          value={value || ""}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
          status={error ? "error" : undefined}
        />
      )}
    </div>
  );
}
