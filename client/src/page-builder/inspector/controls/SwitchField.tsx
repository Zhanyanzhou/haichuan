/**
 * SwitchField.tsx — 布尔开关（元素显隐、播放控制等）。
 */
import { Switch } from "antd";

interface SwitchFieldProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
  disabled?: boolean;
}

export default function SwitchField({
  label,
  value,
  onChange,
  hint,
  disabled,
}: SwitchFieldProps) {
  return (
    <div
      className="homepage-editor__inspector-field"
      data-workspace-field-control="switch"
      data-workspace-field-shared="true"
    >
      <label>
        <span>{label}</span>
        <Switch
          size="small"
          checked={value}
          disabled={disabled}
          onChange={onChange}
        />
      </label>
      {hint ? (
        <span className="homepage-editor__inspector-hint">{hint}</span>
      ) : null}
    </div>
  );
}
