import { useId } from "react";

/**
 * NumberField.tsx — 数值控件(百分比坐标/数值参数)。
 * min/max/step 交给 input 原生校验;值以 number 写回 props。
 */
export interface NumberFieldProps {
  label: string;
  hint?: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  value: number | string | undefined;
  onChange: (next: number) => void;
  onClear?: () => void;
  disabled?: boolean;
  inspectorField?: string;
  inspectorDevice?: "desktop" | "mobile" | "shared";
}

export default function NumberField({
  label,
  hint,
  unit,
  min,
  max,
  step,
  value,
  onChange,
  onClear,
  disabled,
  inspectorField,
  inspectorDevice,
}: NumberFieldProps) {
  const inputId = useId();
  const numeric = Number(value);
  return (
    <div
      className="homepage-editor__inspector-field"
      data-workspace-field-control="number"
      data-workspace-field-shared="true"
      data-inspector-field={inspectorField}
      data-inspector-device={inspectorDevice}
    >
      <label htmlFor={inputId}>
        {label}
        {hint ? (
          <span className="homepage-editor__inspector-hint">{hint}</span>
        ) : null}
      </label>
      <div className="homepage-editor__number-input">
        <input
          id={inputId}
          type="number"
          value={value !== undefined && value !== "" && Number.isFinite(numeric) ? numeric : ""}
          min={min}
          max={max}
          step={step ?? 1}
          disabled={disabled}
          onChange={(event) => {
            if (event.target.value === "") {
              onClear?.();
              return;
            }
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(next);
          }}
          style={{ flex: 1, minWidth: 0 }}
        />
        {unit ? (
          <span className="homepage-editor__inspector-hint" aria-hidden="true">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}
