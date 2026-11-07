import { CheckOutlined } from "@ant-design/icons";
import { OptionDiagram } from "../inspector/controls/SegmentedField";
import type { DynamicTemplateMediaSide } from "../template-definition";
import "./PageLayoutPresetCards.css";

const choices = [
  { value: "start", label: "图片在左", diagram: "imageLeftTextRight" },
  { value: "end", label: "图片在右", diagram: "textLeftImageRight" },
] as const;

interface PageLayoutPresetCardsProps {
  value: DynamicTemplateMediaSide;
  onChange: (value: DynamicTemplateMediaSide) => void;
  disabled?: boolean;
}

export default function PageLayoutPresetCards({ value, onChange, disabled }: PageLayoutPresetCardsProps) {
  return (
    <div className="homepage-editor__layout-presets" data-media-side-control="true">
      <div className="homepage-editor__layout-presets-heading">
        <strong>布局排列</strong>
        <span>桌面端</span>
      </div>
      <div className="homepage-editor__layout-preset-grid" role="group" aria-label="布局排列">
        {choices.map((choice) => (
          <button
            type="button"
            key={choice.value}
            className="homepage-editor__layout-preset"
            aria-pressed={value === choice.value}
            disabled={disabled}
            onClick={() => {
              if (value !== choice.value) onChange(choice.value);
            }}
          >
            <svg className="homepage-editor__layout-preset-diagram" viewBox="0 0 26 18" aria-hidden="true">
              <OptionDiagram kind={choice.diagram} />
            </svg>
            <span>{choice.label}</span>
            {value === choice.value ? (
              <CheckOutlined aria-hidden="true" className="homepage-editor__layout-preset-check" />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
