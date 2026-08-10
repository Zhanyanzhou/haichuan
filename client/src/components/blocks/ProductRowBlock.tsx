import { Link } from "react-router-dom";

interface ProductRowBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
}

/** 支持的图片比例预设 */
const IMAGE_RATIO_MAP: Record<string, string> = {
  "3:4": "3 / 4",
  "1:1": "1 / 1",
  "4:3": "4 / 3",
  "16:9": "16 / 9",
};

/**
 * 产品展示行 — 支持网格 2/3/4 列
 *
 * content 可配字段：
 *   title, subtitle,
 *   products: [{image, name, price, link}],
 *   layout: 'grid-2' | 'grid-3' | 'grid-4',
 *   imageRatio: '3:4' | '1:1' | '4:3' | '16:9',
 *   showPrice: boolean (default true),
 *   showButton: boolean (default false),
 *   buttonText: string (default '查看详情'),
 *   titleSize: 'small' | 'medium' | 'large' (default 'medium'),
 *
 * styleConfig:
 *   bgColor: CSS color
 *   textColor: CSS color (标题颜色)
 *   gap: number (卡片间距，px)
 */
export default function ProductRowBlock({
  module,
  editMode,
}: ProductRowBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const {
    title,
    subtitle,
    products = [],
    imageRatio = "3:4",
    showPrice = true,
    showButton = false,
    buttonText = "查看详情",
    titleSize = "medium",
  } = content;
  const layout = content.layout || "grid-3";
  const bg = styleConfig.bgColor || "#FCFCFB";
  const headingColor = styleConfig.textColor || "#2C2C2C";
  const gap = styleConfig.gap;

  const cols = layout === "grid-2" ? 2 : layout === "grid-4" ? 4 : 3;
  const ratio = IMAGE_RATIO_MAP[imageRatio] || "3 / 4";

  const titleFontSize =
    titleSize === "large"
      ? "clamp(28px, 3.2vw, 42px)"
      : titleSize === "small"
        ? "clamp(20px, 2.2vw, 28px)"
        : "clamp(24px, 2.8vw, 38px)";

  if (!products.length) {
    return editMode ? (
      <section
        style={{ padding: "80px 0", background: bg, textAlign: "center" }}
      >
        <p style={{ color: "#B8944E", fontSize: 13 }}>
          🛍️ 产品展示行 — 请在右侧配置产品数据和商品 ID
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
        {/* ── 标题区 ── */}
        {(title || subtitle) && (
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            {title && (
              <h2
                style={{
                  fontSize: titleFontSize,
                  fontFamily: '"Cormorant Garamond","Noto Serif SC",serif',
                  color: headingColor,
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

        {/* ── 产品网格 ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: gap != null ? `${gap}px` : cols === 2 ? 32 : 20,
          }}
        >
          {products.map((p: any, i: number) => (
            <div key={i} className="group">
              <Link
                to={p.link || "/products"}
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                {/* 图片 */}
                <div
                  style={{
                    overflow: "hidden",
                    marginBottom: 16,
                    aspectRatio: ratio,
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

                {/* 产品名 */}
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
              </Link>

              {/* 价格（可单独隐藏） */}
              {showPrice && p.price && (
                <p style={{ fontSize: 13, color: "#B8944E", marginBottom: showButton ? 10 : 0 }}>
                  {p.price}
                </p>
              )}

              {/* 按钮（可选） */}
              {showButton && (
                <Link
                  to={p.link || "/products"}
                  style={{
                    display: "inline-block",
                    padding: "6px 18px",
                    border: "1px solid #B8944E",
                    borderRadius: 3,
                    color: "#B8944E",
                    fontSize: 12,
                    textDecoration: "none",
                    transition: "background 0.2s, color 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#B8944E";
                    e.currentTarget.style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "#B8944E";
                  }}
                >
                  {buttonText}
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
