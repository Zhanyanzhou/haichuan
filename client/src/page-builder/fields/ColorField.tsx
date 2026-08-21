/**
 * ColorField.tsx — Puck 颜色自定义字段（品牌色板约束）
 *
 * 设计原则：结构化自由——默认给品牌预设色板（锁住调性，防运营改乱），
 * 仅允许受审品牌色板，不接受 rgba、渐变或任意 CSS 色值。
 */

/** 品牌预设色板（珠宝调性，全站统一） */
const BRAND_PALETTE: { name: string; value: string }[] = [
  { name: "石墨黑", value: "#181A1B" },
  { name: "矿物灰", value: "#5F6568" },
  { name: "钻石灰", value: "#DDE1E2" },
  { name: "反白", value: "#F7F8F8" },
  { name: "画布白", value: "#FFFFFF" },
];

const LEGACY_PALETTE_MAP: Record<string, string> = {
  "#222222": "#181a1b",
  "#66645f": "#5f6568",
  "#e4e3df": "#dde1e2",
  "#f8f7f4": "#f7f8f8",
  "#fcfcfb": "#ffffff",
};

interface ColorFieldProps {
  value?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}

export default function ColorField({ value, onChange, readOnly }: ColorFieldProps) {
  const rawCurrent = (value || "").toLowerCase();
  const current = LEGACY_PALETTE_MAP[rawCurrent] ?? rawCurrent;
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
                borderRadius: 0,
                cursor: readOnly ? "not-allowed" : "pointer",
                border: active ? "2px solid #181A1B" : "1px solid #DDE1E2",
                background: c.value,
              }}
            />
          );
        })}
      </div>
      <p style={{ margin: "6px 0 0", color: "#6E7477", fontSize: 11 }}>
        颜色仅影响当前页面实例，不会修改全局品牌令牌。
      </p>
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
