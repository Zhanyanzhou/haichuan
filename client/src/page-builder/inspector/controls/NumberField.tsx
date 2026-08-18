/**
 * NumberField.tsx — 数值控件(百分比坐标/数值参数)。
 * min/max/step 交给 input 原生校验;值以 number 写回 props。
 */
interface NumberFieldProps {
  label: string;
  hint?: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  value: number | string | undefined;
  onChange: (next: number) => void;
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
}: NumberFieldProps) {
  const numeric = Number(value);
  return (
    <div className="homepage-editor__inspector-field">
      <label>
        {label}
        {hint ? (
          <span className="homepage-editor__inspector-hint">{hint}</span>
        ) : null}
      </label>
      <div className="homepage-editor__number-input" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="number"
          value={Number.isFinite(numeric) ? numeric : ""}
          min={min}
          max={max}
          step={step ?? 1}
          onChange={(event) => {
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
