/**
 * businessRegion.ts — 业务功能区(系统区块)的编辑面板 Schema。
 *
 * 固定业务区由系统数据驱动(商品列表/筛选等),前台真实渲染;
 * 面板只读展示数据说明,不做任何编辑。systemBlock 标记隐藏删除/隐藏等动作。
 */
import { businessRegionPuckConfig } from "../../../adapters/businessRegion.puck";
import type { ModuleInspectorSchema } from "../types";

function BusinessRegionSummary({ props }: { props: Record<string, any> }) {
  const items = String(props.items ?? "")
    .split("|")
    .filter(Boolean);
  return (
    <div
      style={{
        padding: "12px 14px",
        border: "1px solid #DDE1E2",
        borderRadius: 6,
        background: "#FFFFFF",
        color: "#5F6568",
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      <p style={{ margin: "0 0 6px", color: "#181A1B", fontWeight: 500 }}>
        {String(props.title ?? "固定业务区")}
      </p>
      <p style={{ margin: "0 0 10px" }}>{String(props.description ?? "")}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.map((item) => (
          <span
            key={item}
            style={{
              padding: "4px 10px",
              border: "1px solid #DDE1E2",
              borderRadius: 3,
              fontSize: 12,
            }}
          >
            {item}
          </span>
        ))}
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 12, color: "#6E7477" }}>
        此区域在前台真实渲染,不能删除、隐藏或调整顺序;请通过对应业务管理维护其数据。
      </p>
    </div>
  );
}

export const businessRegionSchema: ModuleInspectorSchema = {
  moduleType: "业务功能区",
  displayName: "业务功能区",
  purpose: "固定业务区由系统数据驱动,前台真实渲染,不可在此编辑。",
  systemBlock: true,
  defaults: businessRegionPuckConfig.defaultProps,
  groupTitles: { feature: "数据说明" },
  sections: [
    {
      id: "business-region-summary",
      title: "数据说明",
      layer: "feature",
      fields: [
        {
          key: "businessRegionSummary",
          label: "固定业务区",
          control: "custom",
          render: (ctx) => <BusinessRegionSummary props={ctx.props} />,
        },
      ],
    },
  ],
};
