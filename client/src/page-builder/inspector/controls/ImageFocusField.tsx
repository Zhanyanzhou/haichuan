import NumberField from "./NumberField";
import ImageFocusPad, { type ImageFocusValue } from "./ImageFocusPad";
import InspectorFieldGroup from "../InspectorFieldGroup";

export type { ImageFocusValue };

const FOCUS_PRESETS = [
  { x: 0, y: 0, label: "左上" }, { x: 50, y: 0, label: "顶部居中" }, { x: 100, y: 0, label: "右上" },
  { x: 0, y: 50, label: "左侧居中" }, { x: 50, y: 50, label: "居中" }, { x: 100, y: 50, label: "右侧居中" },
  { x: 0, y: 100, label: "左下" }, { x: 50, y: 100, label: "底部居中" }, { x: 100, y: 100, label: "右下" },
] as const;

const FOCUS_PRESET_SHORT: Record<(typeof FOCUS_PRESETS)[number]["label"], string> = {
  "左上": "左上",
  "顶部居中": "上",
  "右上": "右上",
  "左侧居中": "左",
  "居中": "中",
  "右侧居中": "右",
  "左下": "左下",
  "底部居中": "下",
  "右下": "右下",
};

function formatFocus(value: ImageFocusValue) {
  const x = Math.round(value.x * 100) / 100;
  const y = Math.round(value.y * 100) / 100;
  return `${x}% · ${y}%`;
}

export default function ImageFocusField({
  label = "画面焦点",
  value,
  disabled,
  allowPreciseInput = true,
  showPad = true,
  showLabel = true,
  previewSrc,
  previewFit,
  previewZoom,
  previewAspectRatio,
  inspectorFieldKeys,
  inspectorDevice,
  onRequestCanvasAdjust,
  onChange,
}: {
  label?: string;
  value: ImageFocusValue;
  disabled?: boolean;
  allowPreciseInput?: boolean;
  /** 已由图片预览承担拖动点位时，不再重复一块取景板；快捷与百分比退为次级。 */
  showPad?: boolean;
  /** 预览上已有拖动点时，不再重复「画面焦点」标题。 */
  showLabel?: boolean;
  previewSrc?: string;
  previewFit?: "cover" | "contain" | "fill";
  previewZoom?: number;
  previewAspectRatio?: string;
  inspectorFieldKeys?: { x: string; y: string };
  inspectorDevice?: "desktop" | "mobile" | "shared";
  onRequestCanvasAdjust?: () => void;
  onChange: (next: ImageFocusValue) => void;
}) {
  const normalized = {
    x: Math.max(0, Math.min(100, Number.isFinite(value.x) ? value.x : 50)),
    y: Math.max(0, Math.min(100, Number.isFinite(value.y) ? value.y : 50)),
  };
  const dragPrimary = showPad || Boolean(onRequestCanvasAdjust);
  const presets = (
    <div role="group" aria-label={`${label}常用位置`} className="image-focus-pad__presets">
      {FOCUS_PRESETS.map((preset) => (
        <button
          key={preset.label}
          type="button"
          disabled={disabled}
          className={normalized.x === preset.x && normalized.y === preset.y ? "is-active" : undefined}
          aria-label={preset.label}
          aria-pressed={normalized.x === preset.x && normalized.y === preset.y}
          onClick={() => onChange({ x: preset.x, y: preset.y })}
        >
          <span aria-hidden="true">{FOCUS_PRESET_SHORT[preset.label]}</span>
        </button>
      ))}
    </div>
  );
  const precise = allowPreciseInput ? (
    <InspectorFieldGroup label="精确百分比">
      <div className="template-editor__geometry-grid">
        <NumberField inspectorField={inspectorFieldKeys?.x} inspectorDevice={inspectorDevice} label="水平焦点" unit="%" min={0} max={100} value={normalized.x} disabled={disabled} onChange={(x) => onChange({ ...normalized, x })} />
        <NumberField inspectorField={inspectorFieldKeys?.y} inspectorDevice={inspectorDevice} label="垂直焦点" unit="%" min={0} max={100} value={normalized.y} disabled={disabled} onChange={(y) => onChange({ ...normalized, y })} />
      </div>
    </InspectorFieldGroup>
  ) : null;

  return (
    <div
      className="homepage-editor__inspector-field"
      data-image-focus-field
      data-image-focus-mode={dragPrimary ? "drag" : "assist"}
      data-workspace-field-control="image-focus"
      data-workspace-field-shared="true"
    >
      {showLabel ? (
        <label>
          {label}
          <span className="homepage-editor__inspector-hint">
            {showPad
              ? "拖动画面上的点调整构图，比填写百分比更准确"
              : onRequestCanvasAdjust
                ? "优先在画布上拖动取景点；需要时再用快捷位置或精确值"
                : "请在上方图片预览中拖动焦点点；需要时再用快捷位置或精确值"}
          </span>
        </label>
      ) : null}
      {onRequestCanvasAdjust ? (
        <button
          type="button"
          className="image-focus-pad__canvas-action"
          disabled={disabled}
          onClick={onRequestCanvasAdjust}
        >
          在画布上拖动调整
        </button>
      ) : null}
      {showPad ? (
        <>
          <ImageFocusPad
            value={normalized}
            disabled={disabled}
            previewSrc={previewSrc}
            previewFit={previewFit}
            previewZoom={previewZoom}
            previewAspectRatio={previewAspectRatio}
            ariaLabel={`${label}拖动点`}
            onChange={onChange}
          />
          <p className="image-focus-pad__hint">点住画面中的十字并拖动；方向键可微调 1%，按住 Shift 步进 10%。</p>
          {presets}
          {precise}
        </>
      ) : (
        <>
          <p className="image-focus-pad__status" role="status">当前焦点 {formatFocus(normalized)}</p>
          <div className="image-focus-pad__assist">
            <span className="homepage-editor__properties-hint">常用位置</span>
            {presets}
          </div>
          {precise}
        </>
      )}
    </div>
  );
}
