import {
  createContext,
  lazy,
  Suspense,
  useContext,
  type ReactNode,
} from "react";

export type BusinessRegionPuckProps = {
  pageKey: string;
  title: string;
  description: string;
  items: string;
  locked?: boolean;
};

type BusinessRegionCanvasState = {
  hasLeadingDecoration: boolean;
};

const BusinessRegionCanvasContext = createContext<BusinessRegionCanvasState>({
  hasLeadingDecoration: false,
});

const CatalogPreview = lazy(() => import("@/pages/public/Catalog"));

export function BusinessRegionCanvasProvider({
  hasLeadingDecoration,
  children,
}: BusinessRegionCanvasState & { children: ReactNode }) {
  return (
    <BusinessRegionCanvasContext.Provider value={{ hasLeadingDecoration }}>
      {children}
    </BusinessRegionCanvasContext.Provider>
  );
}

/** 真实业务组件加载期间及非选款页面使用的安全结构说明。 */
function BusinessRegionFallback({ pageKey, title, description, items }: BusinessRegionPuckProps) {
  const itemList = items.split("|").filter(Boolean);
  const isCatalog = pageKey === "catalog";
  const catalogStates = [
    { key: "default", label: "默认", detail: "32 款 · 推荐排序" },
    { key: "loading", label: "加载中", detail: "保留稳定骨架与状态说明" },
    { key: "empty", label: "空结果", detail: "提供清除筛选入口" },
    { key: "error", label: "加载失败", detail: "提供重试与咨询路径" },
    { key: "filtered", label: "已筛选", detail: "材质：足金 · 工艺：示例" },
    { key: "selected", label: "已选款", detail: "已选 2 款 · 可提交询价" },
  ];

  return (
    <section
      style={{
        padding: "clamp(44px, 6vw, 76px) clamp(20px, 5vw, 72px)",
        background: "#F4F5F5",
        borderTop: "1px solid #DDE1E2",
        borderBottom: "1px solid #DDE1E2",
        color: "#181A1B",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <p style={{ margin: "0 0 10px", color: "#5F6568", fontSize: 11, letterSpacing: "0.18em" }}>
          固定业务区 · 由系统数据驱动
        </p>
        <h2 style={{ margin: 0, fontFamily: '"Cormorant Garamond", "Noto Serif SC", serif', fontSize: "clamp(28px, 3vw, 42px)", fontWeight: 500 }}>
          {title}
        </h2>
        <p style={{ maxWidth: 600, margin: "14px 0 24px", color: "#5F6568", fontSize: 14, lineHeight: 1.8 }}>
          {description}
        </p>
        {isCatalog ? (
          <div aria-label="选款中心业务步骤">
            <p style={{ margin: "0 0 10px", color: "#6E7477", fontSize: 11, letterSpacing: ".12em" }}>
              业务流程预览
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))",
                borderTop: "1px solid #DDE1E2",
                borderLeft: "1px solid #DDE1E2",
              }}
            >
              {itemList.map((item, index) => (
                <div
                  key={item}
                  data-business-preview-step={index + 1}
                  style={{
                    minHeight: 92,
                    padding: "16px",
                    borderRight: "1px solid #DDE1E2",
                    borderBottom: "1px solid #DDE1E2",
                    background: "rgba(255,255,255,.72)",
                  }}
                >
                  <span style={{ display: "block", marginBottom: 12, color: "#6E7477", fontSize: 10, letterSpacing: ".12em" }}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span style={{ color: "#181A1B", fontSize: 12, lineHeight: 1.5 }}>
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {itemList.map((item) => (
              <span key={item} style={{ padding: "8px 12px", border: "1px solid #DDE1E2", color: "#181A1B", fontSize: 12, background: "rgba(255,255,255,.72)" }}>
                {item}
              </span>
            ))}
          </div>
        )}
        {isCatalog ? (
          <div
            aria-label="选款中心确定性状态预览"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
              marginTop: 32,
            }}
          >
            {catalogStates.map((state) => (
              <div
                key={state.key}
                data-business-preview-state={state.key}
                style={{ minHeight: 88, padding: "14px 16px", border: "1px solid #DDE1E2", background: "#FFFFFF" }}
              >
                <p style={{ margin: "0 0 8px", color: "#181A1B", fontSize: 12, letterSpacing: ".06em" }}>
                  {state.label}
                </p>
                <p style={{ margin: 0, color: "#6E7477", fontSize: 11, lineHeight: 1.6 }}>
                  {state.detail}
                </p>
              </div>
            ))}
          </div>
        ) : null}
        <p style={{ margin: "24px 0 0", color: "#6E7477", fontSize: 12 }}>
          此区域会在前台真实渲染，不能删除、隐藏或调整顺序；请通过对应业务管理维护其数据。
        </p>
      </div>
    </section>
  );
}

/** 选款中心画布直接消费公开页组件；其他动态页面暂保留显式结构说明。 */
function BusinessRegionPreview(props: BusinessRegionPuckProps) {
  const { hasLeadingDecoration } = useContext(BusinessRegionCanvasContext);
  if (props.pageKey !== "catalog") {
    return <BusinessRegionFallback {...props} />;
  }

  return (
    <Suspense fallback={<BusinessRegionFallback {...props} />}>
      <CatalogPreview
        mode="editor-preview"
        hasLeadingDecoration={hasLeadingDecoration}
      />
    </Suspense>
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
