/**
 * businessRegion.ts — 业务功能区(系统区块)的编辑面板 Schema。
 *
 * 固定业务区由系统数据驱动，前台真实渲染。systemBlock 标记隐藏删除、隐藏等动作。
 * 联系页的电话、微信、地址和营业时间在此写入同一份店铺资料。
 * 选款中心的品类不在这里改文案，入口指向已有的类目管理。
 */
import { Link } from "react-router-dom";
import { businessRegionPuckConfig } from "../../../adapters/businessRegion.puck";
import type { InspectorContext, ModuleInspectorSchema } from "../types";
import type { PuckProps } from "../../../types";
import ContactFactsEditor from "./ContactFactsEditor";

function isContactPage(ctx: InspectorContext) {
  return String(ctx.props.pageKey ?? "") === "contact";
}

function BusinessRegionSummary({ props }: { props: PuckProps }) {
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
      {String(props.pageKey ?? "") === "catalog" ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "#5F6568" }}>
            直接点画布上的品类或款式名称修改。画布就是前台选款中心，离开输入框后名称会保存。这里的分类与分类管理是同一份。
          </p>
          <Link
            to="/admin/categories"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 32,
              padding: "0 12px",
              border: "1px solid #181A1B",
              borderRadius: 3,
              color: "#181A1B",
              fontSize: 12,
              textDecoration: "none",
            }}
          >
            管理全部分类
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export const businessRegionSchema: ModuleInspectorSchema = {
  moduleType: "业务功能区",
  displayName: "业务功能区",
  purpose: "固定业务区由系统数据驱动。联系页的电话、微信和地址在此写入店铺资料；选款中心的品类仍到分类管理修改。",
  systemBlock: true,
  defaults: businessRegionPuckConfig.defaultProps,
  groupTitles: { feature: "数据说明" },
  sections: [
    {
      id: "business-region-summary",
      title: "数据说明",
      layer: "feature",
      visibleWhen: (ctx) => !isContactPage(ctx),
      fields: [
        {
          key: "businessRegionSummary",
          label: "固定业务区",
          control: "custom",
          render: (ctx) => <BusinessRegionSummary props={ctx.props} />,
        },
      ],
    },
    {
      id: "contact-facts",
      title: "联系信息",
      layer: "feature",
      visibleWhen: isContactPage,
      fields: [
        {
          key: "contactFacts",
          label: "联系信息",
          control: "custom",
          render: () => <ContactFactsEditor />,
        },
      ],
    },
  ],
};
