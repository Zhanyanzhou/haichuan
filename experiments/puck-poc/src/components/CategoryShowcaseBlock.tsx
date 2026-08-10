import React from "react";

export interface CategoryItem {
  name: string;
  imageUrl: string;
  link: string;
  count?: number;
}

export interface CategoryShowcaseBlockProps {
  title: string;
  columns: 2 | 3 | 4;
  categories: CategoryItem[];
}

/**
 * CategoryShowcaseBlock — 分类导航卡片（对标旺铺"分类货架"）
 * 大图+底部文字叠加，2/3/4列可选
 */
export function CategoryShowcaseBlock({
  title,
  columns,
  categories,
}: CategoryShowcaseBlockProps) {
  const valid = (categories || []).filter((c) => c.name);

  if (valid.length === 0) {
    return (
      <section
        style={{
          padding: "80px 0",
          background: "#FBF9F6",
          textAlign: "center",
          color: "#B8944E",
          fontSize: 14,
        }}
      >
        📂 分类展示 — 请配置分类数据
      </section>
    );
  }

  return (
    <section
      style={{ padding: "clamp(60px,8vh,100px) 0", background: "#FBF9F6" }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "0 clamp(20px,4vw,60px)",
        }}
      >
        {title && (
          <h2
            style={{
              textAlign: "center",
              fontSize: "clamp(22px,2.5vw,34px)",
              fontFamily: "serif",
              color: "#2C2C2C",
              marginBottom: 40,
            }}
          >
            {title}
          </h2>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns || 3}, 1fr)`,
            gap: 16,
          }}
        >
          {valid.map((c, i) => (
            <a
              key={i}
              href={c.link || "#"}
              style={{
                display: "block",
                position: "relative",
                overflow: "hidden",
                textDecoration: "none",
                aspectRatio: columns === 2 ? "16/9" : "3/4",
              }}
            >
              {c.imageUrl ? (
                <img
                  src={c.imageUrl}
                  alt={c.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "#EDE9E2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#C4BFB5",
                    fontSize: 24,
                  }}
                >
                  📷
                </div>
              )}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(to top, rgba(15,13,12,0.5) 0%, transparent 60%)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: 16,
                  left: 16,
                  right: 16,
                }}
              >
                <p
                  style={{
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 500,
                    margin: 0,
                  }}
                >
                  {c.name}
                </p>
                {c.count != null && (
                  <p
                    style={{
                      color: "rgba(255,255,255,0.6)",
                      fontSize: 11,
                      margin: "4px 0 0",
                    }}
                  >
                    {c.count} 件作品
                  </p>
                )}
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
