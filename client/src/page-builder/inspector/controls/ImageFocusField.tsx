import { Button } from "antd";
import NumberField from "./NumberField";

export interface ImageFocusValue {
  x: number;
  y: number;
}

export default function ImageFocusField({
  label = "画面焦点",
  value,
  disabled,
  allowPreciseInput = true,
  inspectorFieldKeys,
  inspectorDevice,
  onChange,
}: {
  label?: string;
  value: ImageFocusValue;
  disabled?: boolean;
  allowPreciseInput?: boolean;
  inspectorFieldKeys?: { x: string; y: string };
  inspectorDevice?: "desktop" | "mobile" | "shared";
  onChange: (next: ImageFocusValue) => void;
}) {
  const normalized = {
    x: Math.max(0, Math.min(100, Number.isFinite(value.x) ? value.x : 50)),
    y: Math.max(0, Math.min(100, Number.isFinite(value.y) ? value.y : 50)),
  };
  const presets = [
    { x: 0, y: 0, label: "左上" }, { x: 50, y: 0, label: "顶部居中" }, { x: 100, y: 0, label: "右上" },
    { x: 0, y: 50, label: "左侧居中" }, { x: 50, y: 50, label: "居中" }, { x: 100, y: 50, label: "右侧居中" },
    { x: 0, y: 100, label: "左下" }, { x: 50, y: 100, label: "底部居中" }, { x: 100, y: 100, label: "右下" },
  ];
  return (
    <div
      className="homepage-editor__inspector-field"
      data-image-focus-field
      data-workspace-field-control="image-focus"
      data-workspace-field-shared="true"
    >
      <label>
        {label}
        <span className="homepage-editor__inspector-hint">
          {allowPreciseInput ? "可选常用位置，也可输入精确百分比" : "选择一个稳定的常用构图位置"}
        </span>
      </label>
      <div role="group" aria-label={`${label}常用位置`} style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
        {presets.map((preset) => (
          <Button
            key={preset.label}
            size="small"
            disabled={disabled}
            type={normalized.x === preset.x && normalized.y === preset.y ? "primary" : "default"}
            aria-label={preset.label}
            aria-pressed={normalized.x === preset.x && normalized.y === preset.y}
            onClick={() => onChange({ x: preset.x, y: preset.y })}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      {allowPreciseInput ? (
        <div className="template-editor__geometry-grid">
          <NumberField inspectorField={inspectorFieldKeys?.x} inspectorDevice={inspectorDevice} label="水平焦点" unit="%" min={0} max={100} value={normalized.x} disabled={disabled} onChange={(x) => onChange({ ...normalized, x })} />
          <NumberField inspectorField={inspectorFieldKeys?.y} inspectorDevice={inspectorDevice} label="垂直焦点" unit="%" min={0} max={100} value={normalized.y} disabled={disabled} onChange={(y) => onChange({ ...normalized, y })} />
        </div>
      ) : null}
    </div>
  );
}
