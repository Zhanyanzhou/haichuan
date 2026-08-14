/**
 * ColorField.tsx — Puck 颜色自定义字段（品牌色板约束）
 *
 * 设计原则：结构化自由——默认给品牌预设色板（锁住调性，防运营改乱），
 * 下方保留一个「高级」文本框，供 rgba / 渐变等特殊值手动输入。
 * 去掉了任意取色器（ColorPicker），避免品牌色被随意发挥。
 */
import { Input } from "antd";

/** 品牌预设色板（珠宝调性，全站统一） */
const BRAND_PALETTE: { name: string; value: string }[] = [
  { name: "墨黑", value: "#1A1714" },
  { name: "深棕", value: "#3A322A" },
  { name: "品牌金", value: "#B8944E" },
  { name: "米白", value: "#FBF9F6" },
  { name: "暖白", value: "#FCFCFB" },
  { name: "浅米", value: "#F6F2EC" },
  { name: "中灰", value: "#9A9187" },
  { name: "纯白", value: "#FFFFFF" },
];

interface ColorFieldProps {
  value?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}

export default function ColorField({ value, onChange, readOnly }: ColorFieldProps) {
  const current = (value || "").toLowerCase();
  return (
    <div>
      <div
        role="radiogroup"
        aria-label="品牌色板"
        style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}
      >
        {BRAND_PALETTE.map((c) => {
          const active = current === c.value.toLowerCase();
          return (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={c.name}
              title={c.name}
              disabled={readOnly}
              onClick={() => onChange?.(c.value)}
              style={{
                height: 28,
                padding: 0,
                borderRadius: 4,
                cursor: readOnly ? "not-allowed" : "pointer",
                border: active ? "2px solid #B8944E" : "1px solid #ECE5DA",
                background: c.value,
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
        <span
          aria-hidden
          style={{
            width: 16,
            height: 16,
            borderRadius: 3,
            border: "1px solid #ECE5DA",
            background: value || "transparent",
            flexShrink: 0,
          }}
        />
        <Input
          size="small"
          style={{ flex: 1, minWidth: 0 }}
          value={value || ""}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="高级：自定义色值 / rgba"
        />
      </div>
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
