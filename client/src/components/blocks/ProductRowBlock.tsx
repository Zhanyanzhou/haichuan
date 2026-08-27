import { Link } from "react-router-dom";
import type { CSSProperties } from "react";
import { SecureImage } from "@/components/common/SecureImage";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { PRODUCT_ROW_CONTRACT } from "@/page-builder/config/blockContracts";
import type { PageModuleProductItem, RenderablePageModule } from "@/types/pageModule";

interface ProductRowBlockProps {
  module: RenderablePageModule;
  editMode?: boolean;
}

/** 图片比例:统一 4:5;仅旧数据的历史值(3:4/1:1/4:3/16:9)按原值渲染 */
const IMAGE_RATIO_MAP: Record<string, string> = {
  "4:5": "4 / 5",
  "3:4": PRODUCT_ROW_CONTRACT.canvas.defaultMediaAspectRatio,
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
 *   mobileColumns: 1 | 2,
 *   displayMode: 'album' | 'standard',
 *   actionStyle: 'none' | 'text' | 'button',
 *   imageRatio: '4:5' | '1:1' | '3:4' | '4:3' | '16:9',
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
    imageRatio = "4:5",
    mobileColumns = 2,
    displayMode = "standard",
    actionStyle: configuredActionStyle,
    showPrice = true,
    showButton = false,
    buttonText = "查看详情",
    titleSize = "medium",
  } = content;
  const layout = content.layout || "grid-3";
  const bg = styleConfig.bgColor || "#FFFFFF";
  const headingColor = styleConfig.textColor || "#181A1B";
  const gap = styleConfig.gap;
  const actionStyle = displayMode === "album"
    ? "none"
    : configuredActionStyle || (showButton ? "button" : "none");
  const resolvedShowPrice = displayMode === "album" ? false : showPrice;
  // schema segmented 写入的是字符串,统一在渲染入口归一为数字
  const resolvedMobileColumns = Number(mobileColumns) === 1 ? 1 : 2;

  const cols = layout === "grid-2" ? 2 : layout === "grid-4" ? 4 : 3;
  const ratio = IMAGE_RATIO_MAP[imageRatio] || PRODUCT_ROW_CONTRACT.canvas.defaultMediaAspectRatio;

  const titleFontSize =
    titleSize === "large"
      ? "clamp(28px, 3.2vw, 42px)"
      : titleSize === "small"
        ? "clamp(20px, 2.2vw, 28px)"
        : "clamp(24px, 2.8vw, 38px)";

  if (!products.length && !editMode) return null;
  const displayProducts: PageModuleProductItem[] = products.length > 0
    ? products
    : Array.from({ length: cols }, (_, index) => ({ __empty: true, id: `empty-${index}` }));

  return (
    <DecorSection master="commerce-grid" background={bg}>
      <style>{`
        .homepage-product-row__grid { grid-template-columns: repeat(var(--product-row-columns), minmax(0, 1fr)); }
        .homepage-product-row__card { min-width: 0; }
        .homepage-product-row__media img { transition: transform .6s ease; }
        .homepage-product-row__card:hover .homepage-product-row__media img { transform: scale(1.035); }
        .homepage-product-row__action { display: inline-flex; align-items: center; min-height: 30px; color: #5F6568; font-size: 12px; letter-spacing: .04em; text-decoration: none; transition: color .2s ease, border-color .2s ease, background .2s ease; }
        .homepage-product-row__action:hover { color: #181A1B; }
        .homepage-product-row__action.is-button { padding: 6px 0; border-bottom: 1px solid #181A1B; border-radius: 0; color: #181A1B; }
        .homepage-product-row__action.is-button:hover { color: #FFFFFF; background: #181A1B; }
        @media (max-width: 767px) {
          .homepage-product-row__grid { grid-template-columns: repeat(var(--product-row-mobile-columns), minmax(0, 1fr)) !important; gap: 24px 12px !important; }
          .homepage-product-row__heading { margin-bottom: 32px !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .homepage-product-row__media img { transition: none; }
          .homepage-product-row__card:hover .homepage-product-row__media img { transform: none; }
        }
      `}</style>
      {/* ── 标题区 ── */}
      {(title || subtitle || editMode) && (
        <div data-content-role="copy" className="homepage-product-row__heading" style={{ textAlign: "center", marginBottom: 48 }}>
          {title ? (
            <h2
              style={{
                fontSize: `var(--hc-type-h2, ${titleFontSize})`,
                fontFamily: 'var(--hc-font-display, "Cormorant Garamond","Noto Serif SC",serif)',
                color: headingColor,
                marginBottom: 12,
                lineHeight: 1.2,
              }}
            >
              {title}
            </h2>
          ) : null}
          {subtitle ? (
            <p
              style={{
                fontSize: 13,
                color: "#6E7477",
                maxWidth: 480,
                margin: "0 auto",
                lineHeight: 1.6,
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
      )}

      {/* ── 产品网格 ── */}
      <div
        data-content-role="productCards"
        className="homepage-product-row__grid"
        style={{
          display: "grid",
          "--product-row-columns": cols,
          "--product-row-mobile-columns": resolvedMobileColumns,
          gap: gap != null ? `${gap}px` : displayMode === "album" ? (cols === 2 ? 40 : 28) : (cols === 2 ? 32 : 20),
        } as CSSProperties}
      >
        {displayProducts.map((p, i) => p.__empty ? (
          <div key={p.id} className="homepage-product-row__empty-card" aria-label={`待选择商品 ${i + 1}`}>
            <div style={{ aspectRatio: ratio, display: "grid", placeItems: "center", marginBottom: 16, border: "1px solid #DDE1E2", background: "#F7F8F8" }}>
              <div style={{ textAlign: "center", color: "#6E7477" }}>
                <strong style={{ display: "block", fontSize: 12, fontWeight: 500 }}>选择商品</strong>
                <small style={{ display: "block", marginTop: 4, fontSize: 10 }}>右侧商品列表</small>
              </div>
            </div>
            <div style={{ width: "68%", height: 8, borderRadius: 2, background: "#DDE1E2" }} />
            <div style={{ width: "42%", height: 7, marginTop: 8, borderRadius: 2, background: "#F4F5F5" }} />
          </div>
        ) : (
          <article key={p.id || p.link || i} className="homepage-product-row__card">
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
                className="homepage-product-row__media"
                style={{
                  overflow: "hidden",
                  marginBottom: 16,
                  aspectRatio: ratio,
                  background: "#F4F5F5",
                }}
              >
                {p.image ? (
                  <SecureImage
                    src={p.image}
                    alt={p.name || ""}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#B8BEC1",
                      fontSize: 32,
                    }}
                  >
                    暂无图片
                  </div>
                )}
              </div>

              {/* 产品名 */}
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#181A1B",
                  marginBottom: 4,
                }}
              >
                {p.name || "产品名称"}
              </p>
            </Link>

            {/* 价格（可单独隐藏） */}
            {resolvedShowPrice && p.price && (
              <p style={{ fontSize: 13, color: "#6E7477", marginBottom: actionStyle !== "none" ? 10 : 0 }}>
                {p.price}
              </p>
            )}

            {/* 操作入口（整张卡片始终可进入详情） */}
            {actionStyle !== "none" && (
              <Link
                to={p.link || "/products"}
                className={`homepage-product-row__action${actionStyle === "button" ? " is-button" : ""}`}
              >
                {actionStyle === "text" ? "查看作品 →" : buttonText || "查看详情"}
              </Link>
            )}
          </article>
        ))}
      </div>
    </DecorSection>
  );
}
