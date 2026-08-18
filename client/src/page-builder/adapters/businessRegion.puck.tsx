export type BusinessRegionPuckProps = {
  pageKey: string;
  title: string;
  description: string;
  items: string;
  locked?: boolean;
};

/** 仅在装修画布中呈现的固定业务区，帮助运营理解前台真实页面结构。 */
function BusinessRegionPreview({ title, description, items }: BusinessRegionPuckProps) {
  const itemList = items.split("|").filter(Boolean);

  return (
    <section
      style={{
        padding: "clamp(44px, 6vw, 76px) clamp(20px, 5vw, 72px)",
        background: "#F7F4EE",
        borderTop: "1px solid #DED6C8",
        borderBottom: "1px solid #DED6C8",
        color: "#322D26",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <p style={{ margin: "0 0 10px", color: "#B8944E", fontSize: 11, letterSpacing: "0.18em" }}>
          固定业务区 · 由系统数据驱动
        </p>
        <h2 style={{ margin: 0, fontFamily: '"Cormorant Garamond", "Noto Serif SC", serif', fontSize: "clamp(28px, 3vw, 42px)", fontWeight: 500 }}>
          {title}
        </h2>
        <p style={{ maxWidth: 600, margin: "14px 0 24px", color: "#756D62", fontSize: 14, lineHeight: 1.8 }}>
          {description}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {itemList.map((item) => (
            <span key={item} style={{ padding: "8px 12px", border: "1px solid #D7C7AA", color: "#765E34", fontSize: 12, background: "rgba(255,255,255,.52)" }}>
              {item}
            </span>
          ))}
        </div>
        <p style={{ margin: "24px 0 0", color: "#968B7D", fontSize: 12 }}>
          此区域会在前台真实渲染，不能删除、隐藏或调整顺序；请通过对应业务管理维护其数据。
        </p>
      </div>
    </section>
  );
}

export const businessRegionPuckConfig = {
  render: (props: BusinessRegionPuckProps) => <BusinessRegionPreview {...props} />,
  defaultProps: {
    pageKey: "products",
    title: "商品列表与筛选",
    description: "商品、库存与分类来自商品管理。",
    items: "商品卡片|分类筛选|排序|分页",
    locked: true,
  } satisfies BusinessRegionPuckProps,
  resolvePermissions: () => ({ delete: false, drag: false, duplicate: false }),
};
