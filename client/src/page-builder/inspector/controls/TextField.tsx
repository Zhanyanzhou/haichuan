/**
 * TextField.tsx — 文本 / 多行文本控件（薄封装 antd Input）。
 * 复用 homepage-editor__inspector-field 样式体系，与专属面板观感一致。
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
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
  /** 返回错误文案时保留当前临时值并阻止事务提交。未提供时沿用原有行为。 */
  validate?: (value: string) => string | null;
  /**
   * 编辑期间只维护输入框临时值；合法的失焦或 Enter 才调用一次 onChange，
   * Escape 恢复进入编辑时的值。用于需要“一次输入 = 一条撤销历史”的编辑器字段。
   */
  transactional?: boolean;
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
  validate,
  transactional = false,
}: TextFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [draftValue, setDraftValue] = useState(value || "");
  const [validationError, setValidationError] = useState<string | null>(null);
  const editingRef = useRef(false);
  const baselineRef = useRef(value || "");
  const skipNextBlurRef = useRef(false);
  useEffect(() => {
    if (!editingRef.current) {
      setDraftValue(value || "");
      setValidationError(null);
    }
  }, [value]);
  const displayedValue = transactional ? draftValue : value || "";
  const beginEditing = () => {
    if (!transactional || readOnly) return;
    if (editingRef.current) return;
    editingRef.current = true;
    baselineRef.current = value || "";
    setDraftValue(value || "");
  };
  const commitEditing = () => {
    if (!transactional || !editingRef.current) return true;
    const next = draftValue;
    const nextError = validate?.(next) ?? null;
    if (nextError) {
      setValidationError(nextError);
      return false;
    }
    editingRef.current = false;
    baselineRef.current = next;
    setValidationError(null);
    if (next !== value) onChange(next);
    return true;
  };
  const cancelEditing = (target: HTMLInputElement | HTMLTextAreaElement) => {
    if (!transactional || !editingRef.current) return;
    skipNextBlurRef.current = true;
    editingRef.current = false;
    setDraftValue(baselineRef.current);
    setValidationError(null);
    target.blur();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!transactional || readOnly) return;
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing(event.currentTarget);
      return;
    }
    if (event.key === "Enter" && (!rows || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (commitEditing()) {
        skipNextBlurRef.current = true;
        event.currentTarget.blur();
      }
    }
  };
  const handleBlur = () => {
    if (!transactional) return;
    if (skipNextBlurRef.current) {
      skipNextBlurRef.current = false;
      return;
    }
    commitEditing();
  };
  const countVisible = showCount ?? Boolean(maxLength);
  return (
    <div className="homepage-editor__inspector-field">
      <label htmlFor={inputId}>
        {label}
        {required ? <em>必填</em> : null}
        {countVisible && maxLength ? (
          <span className="homepage-editor__inspector-count">
            {displayedValue.length}/{maxLength}
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
          aria-invalid={error || validationError ? true : undefined}
          aria-describedby={validationError ? errorId : undefined}
          value={displayedValue}
          readOnly={readOnly}
          onFocus={beginEditing}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onChange={(e) => {
            if (!transactional) onChange(e.target.value);
            else {
              setDraftValue(e.target.value);
              setValidationError(null);
            }
          }}
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
          aria-invalid={error || validationError ? true : undefined}
          aria-describedby={validationError ? errorId : undefined}
          value={displayedValue}
          readOnly={readOnly}
          onFocus={beginEditing}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onChange={(e) => {
            if (!transactional) onChange(e.target.value);
            else {
              setDraftValue(e.target.value);
              setValidationError(null);
            }
          }}
          maxLength={maxLength}
          placeholder={placeholder}
          status={error ? "error" : undefined}
        />
      )}
      {validationError ? <span id={errorId} className="homepage-editor__field-error" role="alert">{validationError}</span> : null}
    </div>
  );
}
