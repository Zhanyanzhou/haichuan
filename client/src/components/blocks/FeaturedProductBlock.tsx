import { Link } from "react-router-dom";
import { SecureImage } from "@/components/common/SecureImage";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { FEATURED_PRODUCT_CONTRACT } from "@/page-builder/config/blockContracts";
import { isSafeInternalPath } from "@/page-builder/utils/linkTarget";

interface FeaturedProductBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
}

/** 单品主推：一件商品、一条主路径，品牌叙事只作为商品信息的补充。 */
export default function FeaturedProductBlock({ module, editMode }: FeaturedProductBlockProps) {
  const { content = {}, layoutConfig = {}, styleConfig = {} } = module;
  const { eyebrow, title, summary, product = {}, primaryText, secondaryText, secondaryLink } = content;
  const bgColor = styleConfig.bgColor || "#F5F2ED";
  const productLink = isSafeInternalPath(product.link) ? product.link : "";
  const secondaryUrl = isSafeInternalPath(secondaryLink) ? secondaryLink : "";
  const imageRight = layoutConfig.template === "imageRight";

  if (!product.name) {
    if (!editMode) return null;
    return (
      <BlockEmptyPlaceholder
        hint="单品主推"
        spec="请选择 1 件主推商品 · 商品主图固定 3:4"
        bg={bgColor}
        height={520}
      />
    );
  }

  const media = (
    <div
      data-editor-field="productId"
      className="homepage-featured-product__media"
      style={{ aspectRatio: FEATURED_PRODUCT_CONTRACT.canvas.mediaAspectRatio, overflow: "hidden", background: "#E6DED2" }}
    >
      <SecureImage
        src={product.image}
        alt={product.name || "主推珠宝作品"}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    </div>
  );

  const copy = (
    <div className="homepage-featured-product__copy" style={{ maxWidth: 480 }}>
      {eyebrow ? <p data-editor-field="eyebrow" style={{ margin: "0 0 14px", color: "#9A753E", fontSize: 11, letterSpacing: "0.2em" }}>{eyebrow}</p> : null}
      {title ? <h2 data-editor-field="title" style={{ margin: "0 0 22px", color: "#28231F", fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', fontSize: "clamp(32px, 4vw, 50px)", fontWeight: 500, lineHeight: 1.1 }}>{title}</h2> : null}
      <p style={{ margin: "0 0 8px", color: "#28231F", fontSize: 17, fontWeight: 600 }}>{product.name}</p>
      {product.price ? <p style={{ margin: "0 0 22px", color: "#8E6A35", fontSize: 14 }}>{product.price}</p> : null}
      {summary ? <p data-editor-field="summary" style={{ margin: "0 0 32px", color: "#776D63", fontSize: 14, lineHeight: 1.9 }}>{summary}</p> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {primaryText && productLink ? (
          editMode ? (
            <span data-editor-field="primaryText productId" style={{ padding: "12px 26px", background: "#B8944E", color: "#fff", fontSize: 12, letterSpacing: "0.1em" }}>{primaryText}</span>
          ) : (
            <Link data-editor-field="primaryText productId" to={productLink} style={{ padding: "12px 26px", background: "#B8944E", color: "#fff", fontSize: 12, textDecoration: "none", letterSpacing: "0.1em" }}>{primaryText}</Link>
          )
        ) : null}
        {secondaryText && secondaryUrl ? (
          editMode ? (
            <span data-editor-field="secondaryText secondaryLink" style={{ padding: "11px 25px", border: "1px solid #B8944E", color: "#8E6A35", fontSize: 12, letterSpacing: "0.1em" }}>{secondaryText}</span>
          ) : (
            <Link data-editor-field="secondaryText secondaryLink" to={secondaryUrl} style={{ padding: "11px 25px", border: "1px solid #B8944E", color: "#8E6A35", fontSize: 12, textDecoration: "none", letterSpacing: "0.1em" }}>{secondaryText}</Link>
          )
        ) : null}
      </div>
    </div>
  );

  return (
    <section className="homepage-featured-product" data-layout={imageRight ? "imageRight" : "imageLeft"} style={{ padding: "clamp(64px, 9vw, 120px) clamp(20px, 4vw, 60px)", background: bgColor }}>
      <style>{`
        .homepage-featured-product__grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(320px, .82fr);
          align-items: center;
          gap: clamp(40px, 7vw, 96px);
        }
        .homepage-featured-product[data-layout="imageRight"] .homepage-featured-product__media { order: 2; }
        .homepage-featured-product[data-layout="imageRight"] .homepage-featured-product__copy { order: 1; justify-self: end; }
        @media (max-width: 767px) {
          .homepage-featured-product__grid { grid-template-columns: minmax(0, 1fr); gap: 34px; }
          .homepage-featured-product__media { order: 1 !important; }
          .homepage-featured-product__copy { order: 2 !important; justify-self: stretch !important; }
        }
      `}</style>
      <div className="homepage-featured-product__grid" style={{ maxWidth: FEATURED_PRODUCT_CONTRACT.canvas.maxWidth, margin: "0 auto" }}>
        {media}
        {copy}
      </div>
    </section>
  );
}
