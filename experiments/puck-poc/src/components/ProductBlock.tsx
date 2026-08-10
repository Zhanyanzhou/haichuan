import React from "react";
import { mockProducts } from "../mock/products";

export interface ProductBlockProps {
  title: string;
  selectionMode: "manual" | "category";
  /** manual 模式下选中的商品 id 列表 */
  selectedProductIds?: number[];
  /** category 模式下选中的分类 id */
  categoryId?: number;
  /** 最多显示商品数 */
  limit: number;
}

/**
 * ProductBlock — 商品推荐/展示区块
 * 渲染时根据 selectionMode 从 mock 数据拉取，不把完整商品对象存进 JSON
 */
export function ProductBlock({
  title,
  selectionMode,
  selectedProductIds,
  categoryId,
  limit,
}: ProductBlockProps) {
  let products: typeof mockProducts = [];

  if (selectionMode === "manual" && selectedProductIds?.length) {
    products = mockProducts
      .filter((p) => selectedProductIds.includes(p.id))
      .slice(0, limit);
  } else if (selectionMode === "category" && categoryId) {
    products = mockProducts
      .filter((p) => p.categoryId === categoryId)
      .slice(0, limit);
  }

  return (
    <section
      style={{
        padding: "40px 5vw",
        background: "#F8F6F1",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h2
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "#1C1A18",
          margin: "0 0 24px",
          textAlign: "center",
        }}
      >
        {title || "精选商品"}
      </h2>
      {products.length === 0 ? (
        <p style={{ textAlign: "center", color: "#8A7F72" }}>
          请在编辑器中配置商品
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 16,
          }}
        >
          {products.map((p) => (
            <div key={p.id} style={{ background: "#fff", overflow: "hidden" }}>
              <img
                src={p.image}
                alt={p.name}
                style={{ width: "100%", height: 200, objectFit: "cover" }}
              />
              <div style={{ padding: 12 }}>
                <p
                  style={{ fontSize: 13, color: "#8A7F72", margin: "0 0 4px" }}
                >
                  {p.category} · {p.material}
                </p>
                <h3
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    margin: "0 0 8px",
                    color: "#1C1A18",
                  }}
                >
                  {p.name}
                </h3>
                <p
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#B8944E",
                    margin: 0,
                  }}
                >
                  ¥{p.price.toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
