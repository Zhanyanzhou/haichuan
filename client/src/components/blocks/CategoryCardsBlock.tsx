import { Link } from "react-router-dom";

interface CategoryCardsBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
}

/**
 * 分类导航卡片 — 大图 + 标题叠加
 * content: { title, categories: [{image,name,link}], layout: 'grid-2'|'grid-3'|'grid-4' }
 */
export default function CategoryCardsBlock({
  module,
  editMode,
}: CategoryCardsBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const { title, categories = [] } = content;
  const layout = content.layout || "grid-3";
  const bg = styleConfig.bgColor || "#FBF9F6";
  const cols = layout === "grid-2" ? 2 : layout === "grid-4" ? 4 : 3;

  if (!categories.length) {
    return editMode ? (
      <section
        style={{ padding: "80px 0", background: bg, textAlign: "center" }}
      >
        <p style={{ color: "#B8944E", fontSize: 13 }}>
          📂 分类导航卡片 — 请在右侧配置分类数据
        </p>
      </section>
    ) : null;
  }

  return (
    <section style={{ padding: "clamp(60px,8vh,100px) 0", background: bg }}>
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
              fontFamily: '"Cormorant Garamond","Noto Serif SC",serif',
              color: "#2C2C2C",
              marginBottom: 40,
              lineHeight: 1.2,
            }}
          >
            {title}
          </h2>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: cols === 2 ? 24 : 16,
          }}
        >
          {categories.map((c: any, i: number) => (
            <Link
              key={i}
              to={c.link || "/products"}
              style={{
                display: "block",
                position: "relative",
                overflow: "hidden",
                textDecoration: "none",
              }}
              className="group"
            >
              <div
                style={{
                  aspectRatio: cols === 2 ? "16/9" : "3/4",
                  overflow: "hidden",
                  background: "#EDE9E2",
                }}
              >
                {c.image ? (
                  <img
                    src={c.image}
                    alt={c.name || ""}
                    loading="lazy"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      transition: "transform 0.7s ease",
                    }}
                    className="group-hover:scale-105"
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#C4BFB5",
                      fontSize: 28,
                    }}
                  >
                    📷
                  </div>
                )}
              </div>
              {/* 底部渐变 + 文字叠加 */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(to top, rgba(15,13,12,0.45) 0%, rgba(15,13,12,0.02) 55%, transparent 100%)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: 20,
                  left: 20,
                  right: 20,
                }}
              >
                <p
                  style={{
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 500,
                    letterSpacing: "0.05em",
                    margin: 0,
                  }}
                >
                  {c.name || "分类名称"}
                </p>
                {c.count && (
                  <p
                    style={{
                      color: "rgba(255,255,255,0.65)",
                      fontSize: 11,
                      margin: "4px 0 0",
                    }}
                  >
                    {c.count} 件作品
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
