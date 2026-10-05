import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";

type CommittedInputElement = HTMLInputElement | HTMLTextAreaElement;
const pendingNumberEditors = new WeakMap<CommittedInputElement, () => boolean>();

export function registerPendingCommittedInput(input: CommittedInputElement, commit: () => boolean) {
  pendingNumberEditors.set(input, commit);
}

export function unregisterPendingCommittedInput(input: CommittedInputElement) {
  pendingNumberEditors.delete(input);
}

export interface CommittedNumberInputOptions {
  label: string;
  value: number | string | undefined;
  min?: number;
  max?: number;
  step?: number | "any";
  onCommit: (next: number) => unknown;
  onClear?: () => void;
  commitUnchanged?: boolean;
  onPreview?: (next: number) => void;
  onCancel?: () => void;
  /** 空原值的交互起点，不填入输入框、不声明为对象显式值。 */
  interactionStartValue?: number;
  /** 仅控制非编辑显示；提交、预览和拖动仍使用完整精度。 */
  displayPrecision?: number;
}

const displayNumber = (value: number | string | undefined) => value === undefined ? "" : String(value);
const compactNumber = (draft: string, precision?: number) => {
  if (precision === undefined || !Number.isInteger(precision) || precision < 0 || precision > 100 || !draft.trim()) return draft;
  const number = Number(draft);
  return Number.isFinite(number) ? String(Number(number.toFixed(precision))) : draft;
};

export function focusFirstInvalidNumberField() {
  if (typeof document === "undefined") return false;
  const input = [...document.querySelectorAll<CommittedInputElement>('[data-committed-number-input="true"], [data-committed-text-input="true"]')]
    .find((candidate) => pendingNumberEditors.get(candidate)?.() === false || candidate.getAttribute("aria-invalid") === "true");
  if (!input) return false;
  input.focus();
  input.scrollIntoView({ block: "nearest" });
  return true;
}

/** 数值输入的唯一事务状态机：编辑字符串与已提交值分离。 */
export function useCommittedNumberInput({
  label, value, min, max, step, onCommit, onClear, commitUnchanged = false, onPreview, onCancel, interactionStartValue, displayPrecision,
}: CommittedNumberInputOptions) {
  const [draft, setDraft] = useState(displayNumber(value));
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const editingRef = useRef(false);
  const committingRef = useRef(false);
  const skipNextBlurRef = useRef(false);
  const committedRef = useRef(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const commitRef = useRef<() => boolean>(() => true);
  const attachInput = useCallback((input: HTMLInputElement | null) => {
    if (inputRef.current) unregisterPendingCommittedInput(inputRef.current);
    inputRef.current = input;
    if (input) registerPendingCommittedInput(input, () => commitRef.current());
  }, []);

  useEffect(() => {
    if (editingRef.current || error) return;
    committedRef.current = value;
    setDraft(displayNumber(value));
  }, [error, value]);

  const restore = () => {
    onCancel?.();
    editingRef.current = false;
    setDraft(displayNumber(committedRef.current));
    setError(null);
    inputRef.current?.removeAttribute("aria-invalid");
  };
  const commit = (commitValue?: (next: number) => unknown) => {
    // 提交回调可能再次检查全部待提交输入；当前数值已校验，不能重入自身。
    if (committingRef.current) return true;
    if (!editingRef.current && !commitValue) return !error;
    const normalized = draft.trim();
    if (normalized === "") {
      if (!onClear || commitValue) {
        setError(`${label}不能为空，请输入有效数值。`);
        return false;
      }
      editingRef.current = false;
      setError(null);
      inputRef.current?.removeAttribute("aria-invalid");
      if (committedRef.current !== undefined) onClear();
      return true;
    }
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) {
      setError(`${label}必须是有效数值，请修正后再继续。`);
      return false;
    }
    const next = Number(normalized);
    if (!Number.isFinite(next)) {
      setError(`${label}必须是有限数值，请修正后再继续。`);
      return false;
    }
    if (min !== undefined && next < min) {
      setError(`${label}不能小于 ${min}。`);
      return false;
    }
    if (max !== undefined && next > max) {
      setError(`${label}不能大于 ${max}。`);
      return false;
    }
    const committed = Number(committedRef.current);
    if (commitValue || commitUnchanged || onPreview || !Number.isFinite(committed) || next !== committed) {
      inputRef.current?.removeAttribute("aria-invalid");
      committingRef.current = true;
      let result: unknown;
      try { result = (commitValue ?? onCommit)(next); }
      finally { committingRef.current = false; }
      if (result === false || (result && typeof result === "object" && "ok" in result && result.ok === false)) {
        onCancel?.();
        // 合同拒绝的是这次提交，不是用户正在修正的文本。保留草稿与焦点，
        // 让用户就地改正；只有 Escape 才明确恢复最后一次已提交值。
        editingRef.current = true;
        setError(result && typeof result === "object" && "message" in result && typeof result.message === "string"
          ? result.message : `${label}未应用，请修正后再继续。`);
        return false;
      }
    }
    editingRef.current = false;
    setDraft(String(next));
    setError(null);
    inputRef.current?.removeAttribute("aria-invalid");
    return true;
  };
  commitRef.current = commit;
  const edit = (next: string) => {
    editingRef.current = true;
    setDraft(next);
    setError(null);
    const number = Number(next);
    if (next.trim() && Number.isFinite(number) && (min === undefined || number >= min) && (max === undefined || number <= max)) onPreview?.(number);
    else onCancel?.();
  };

  return {
    inputRef: attachInput,
    draft,
    displayDraft: !focused && !editingRef.current && !error ? compactNumber(draft, displayPrecision) : draft,
    error,
    commit,
    restore,
    setDraft: edit,
    focus: () => inputRef.current?.focus(),
    onFocus: () => {
      if (displayPrecision === undefined) { setFocused(true); return; }
      // 首次进入时选中精确数值，避免精度回显使浏览器的全选失效并把新输入追加到旧值。
      const input = inputRef.current;
      flushSync(() => setFocused(true));
      input?.select();
    },
    onBlur: (_event: FocusEvent<HTMLInputElement>, deferCommit = false) => {
      setFocused(false);
      if (skipNextBlurRef.current) {
        skipNextBlurRef.current = false;
        return;
      }
      if (!deferCommit) commit();
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const parsed = draft.trim() ? Number(draft) : interactionStartValue ?? 0;
        if (Number.isFinite(parsed)) {
          const next = parsed + (event.key === "ArrowUp" ? 1 : -1) * (typeof step === "number" ? step : 1);
          edit(String(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next))));
        }
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (commit()) {
          skipNextBlurRef.current = true;
          event.currentTarget.blur();
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        // Escape 在数值编辑器内表示放弃本次草稿；不能继续冒泡到紧凑工作区，
        // 否则同一次按键会把承载该输入框的属性面板也关闭。
        event.stopPropagation();
        restore();
        skipNextBlurRef.current = true;
        event.currentTarget.blur();
      }
    },
  };
}

export interface NumberFieldProps {
  label: string;
  hint?: string;
  unit?: string;
  unitOptions?: readonly string[];
  /** 单位和精确数值作为同一笔变更提交，避免旧闭包回写数值。 */
  onUnitChange?: (unit: string, value: number) => void;
  displayPrecision?: number;
  min?: number;
  max?: number;
  step?: number | "any";
  value: number | string | undefined;
  onChange: (next: number) => unknown;
  onClear?: () => void;
  disabled?: boolean;
  inspectorField?: string;
  inspectorDevice?: "desktop" | "mobile" | "shared";
  commitUnchanged?: boolean;
  placeholder?: string;
  onPreview?: (next: number) => void;
  onCancel?: () => void;
  interactionStartValue?: number;
}

export default function NumberField({
  label, hint, unit, unitOptions, onUnitChange, displayPrecision, min, max, step, value, onChange, onClear, disabled,
  inspectorField, inspectorDevice, commitUnchanged, placeholder, onPreview, onCancel, interactionStartValue,
}: NumberFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const transaction = useCommittedNumberInput({
    label, value, min, max, step, onCommit: onChange, onClear, commitUnchanged, onPreview, onCancel, interactionStartValue, displayPrecision,
  });
  const unitInput = useRef<HTMLSelectElement | null>(null);
  const scrub = useRef<{ x: number; value: number; moved: boolean } | null>(null);
  const restoreScrub = useRef(transaction.restore);
  restoreScrub.current = transaction.restore;
  useEffect(() => {
    const cancel = () => { if (!scrub.current) return; scrub.current = null; restoreScrub.current(); };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || !scrub.current) return;
      event.preventDefault(); event.stopPropagation(); cancel();
    };
    window.addEventListener("keydown", escape, true); window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("keydown", escape, true); window.removeEventListener("blur", cancel); };
  }, []);
  return (
    <div
      className="homepage-editor__inspector-field"
      data-workspace-field-control="number"
      data-workspace-field-shared="true"
      data-inspector-field={inspectorField}
      data-inspector-device={inspectorDevice}
    >
      <label htmlFor={inputId}
        title={onPreview && !disabled ? "左右拖动标签调整数值，也可直接输入" : undefined}
        style={onPreview && !disabled ? { cursor: "ew-resize", touchAction: "none" } : undefined}
        onPointerDown={(event) => {
          if (!onPreview || disabled || event.button !== 0) return;
          const number = transaction.draft.trim() ? Number(transaction.draft) : interactionStartValue ?? 0;
          if (!Number.isFinite(number)) return;
          event.preventDefault();
          (event.currentTarget.control as HTMLElement | null)?.focus();
          scrub.current = { x: event.clientX, value: number, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const gesture = scrub.current;
          if (!gesture || (!gesture.moved && Math.abs(event.clientX - gesture.x) < 4)) return;
          gesture.moved = true;
          const next = gesture.value + Math.round(event.clientX - gesture.x) * (typeof step === "number" ? step : 1);
          transaction.setDraft(String(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next))));
        }}
        onPointerUp={() => { const moved = scrub.current?.moved; scrub.current = null; if (moved) transaction.commit(); }}
        onPointerCancel={() => { scrub.current = null; transaction.restore(); }}
        onLostPointerCapture={() => { if (scrub.current) transaction.restore(); scrub.current = null; }}
      >{label}{hint ? <span className="homepage-editor__inspector-hint">{hint}</span> : null}</label>
      <div className="homepage-editor__number-input">
        <input
          id={inputId}
          ref={transaction.inputRef}
          type="text"
          role="spinbutton"
          inputMode="decimal"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={transaction.draft.trim() && Number.isFinite(Number(transaction.draft)) ? Number(transaction.draft) : undefined}
          data-committed-number-input="true"
          value={transaction.displayDraft}
          min={min}
          max={max}
          data-number-step={step ?? 1}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={transaction.error ? "true" : undefined}
          aria-describedby={transaction.error ? errorId : undefined}
          onChange={(event) => transaction.setDraft(event.target.value)}
          onFocus={transaction.onFocus}
          onBlur={(event) => transaction.onBlur(event, Boolean(unitInput.current && event.relatedTarget === unitInput.current))}
          onKeyDown={transaction.onKeyDown}
          style={{ flex: 1, minWidth: 0 }}
        />
        {unitOptions?.length && onUnitChange ? <select
          ref={unitInput}
          aria-label={`${label}单位`}
          value={unit ?? ""}
          disabled={disabled}
          style={{ width: "auto", flex: "0 0 auto", minWidth: 52, maxWidth: "45%" }}
          onChange={(event) => {
            const nextUnit = event.target.value;
            if (nextUnit === unit) return;
            if (!transaction.commit((next) => onUnitChange(nextUnit, next))) transaction.focus();
          }}
          onBlur={() => transaction.commit()}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.stopPropagation();
            transaction.restore();
            event.currentTarget.blur();
          }}
        >
          {!unit || !unitOptions.includes(unit) ? <option value={unit ?? ""} disabled>{unit || "单位"}</option> : null}
          {unitOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select> : unit ? <span className="homepage-editor__inspector-hint" aria-hidden="true">{unit}</span> : null}
      </div>
      {transaction.error ? <span id={errorId} className="homepage-editor__field-error" role="alert">{transaction.error}</span> : null}
    </div>
  );
}
