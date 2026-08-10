import { Link } from "react-router-dom";

interface ProductRowBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
}

/**
 * 产品展示行 — 支持网格 2/3/4 列 & 轮播布局
 * content: { title, subtitle, products: [{image,name,price,link}], layout: 'grid-3'|'grid-4'|'carousel' }
 */
export default function ProductRowBlock({
  module,
  editMode,
}: ProductRowBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const { title, subtitle, products = [] } = content;
  const layout = content.layout || "grid-3";
  const bg = styleConfig.bgColor || "#FCFCFB";

  const cols = layout === "grid-2" ? 2 : layout === "grid-4" ? 4 : 3;

  if (!products.length) {
    return editMode ? (
      <section
        style={{ padding: "80px 0", background: bg, textAlign: "center" }}
      >
        <p style={{ color: "#B8944E", fontSize: 13 }}>
          🛍️ 产品展示行 — 请在右侧配置产品数据
        </p>
      </section>
    ) : null;
  }

  return (
    <section style={{ padding: "clamp(60px,8vh,120px) 0", background: bg }}>
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "0 clamp(20px,4vw,60px)",
        }}
      >
        {(title || subtitle) && (
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            {title && (
              <h2
                style={{
                  fontSize: "clamp(24px,2.8vw,38px)",
                  fontFamily: '"Cormorant Garamond","Noto Serif SC",serif',
                  color: "#2C2C2C",
                  marginBottom: 12,
                  lineHeight: 1.2,
                }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p
                style={{
                  fontSize: 13,
                  color: "#8A7F72",
                  maxWidth: 480,
                  margin: "0 auto",
                  lineHeight: 1.6,
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: layout === "grid-2" ? 32 : 20,
          }}
        >
          {products.map((p: any, i: number) => (
            <Link
              key={i}
              to={p.link || "/products"}
              style={{
                display: "block",
                textDecoration: "none",
                color: "inherit",
              }}
              className="group"
            >
              <div
                style={{
                  overflow: "hidden",
                  marginBottom: 16,
                  aspectRatio: "3/4",
                  background: "#F5F2ED",
                }}
              >
                {p.image ? (
                  <img
                    src={p.image}
                    alt={p.name || ""}
                    loading="lazy"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      transition: "transform 0.6s ease",
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
                      color: "#D1CDC5",
                      fontSize: 32,
                    }}
                  >
                    🖼️
                  </div>
                )}
              </div>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#2C2C2C",
                  marginBottom: 4,
                }}
              >
                {p.name || "产品名称"}
              </p>
              {p.price && (
                <p style={{ fontSize: 13, color: "#B8944E" }}>{p.price}</p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
