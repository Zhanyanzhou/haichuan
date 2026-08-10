/**
 * ColorField.tsx — Puck 颜色自定义字段
 *
 * 提供 antd ColorPicker 可视化选色 + 文本输入框（接受任意 CSS 颜色字符串）。
 * 文本框是权威值来源，确保 rgba / 渐变等 Picker 无法表达的形式仍可手动输入；
 * Picker 仅在选色时写入 hex，向后兼容既有数据。
 */
import { ColorPicker, Input } from "antd";

interface ColorFieldProps {
  value?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}

export default function ColorField({ value, onChange, readOnly }: ColorFieldProps) {
  // 仅当值像颜色字符串时喂给 Picker，避免渐变等值触发解析告警。
  const isColorLike = /^(#|rgb|rgba|hsl|hsla)/i.test(value || "");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <ColorPicker
        size="small"
        value={isColorLike ? value : undefined}
        disabled={readOnly}
        onChange={(color) => onChange?.(color.toHexString())}
      />
      <Input
        size="small"
        style={{ flex: 1, minWidth: 0 }}
        value={value || ""}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="#FBF9F6 / rgba(0,0,0,.2)"
      />
    </div>
  );
}

type PuckFieldRenderProps = {
  value?: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
};

/**
 * 生成一个 Puck 颜色字段定义，供各适配器复用：
 *   bgColor: colorPuckField("背景色")
 */
export const colorPuckField = (label: string) => ({
  type: "custom" as const,
  label,
  render: ({ value, onChange, readOnly }: PuckFieldRenderProps) => (
    <ColorField value={value} onChange={onChange} readOnly={readOnly} />
  ),
});
