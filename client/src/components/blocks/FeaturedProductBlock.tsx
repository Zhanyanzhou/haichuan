import { Link } from "react-router-dom";
import { SecureImage } from "@/components/common/SecureImage";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { resolveContractAspectRatio } from "@/page-builder/config/blockContracts";
import { resolvePrefixedLinkTarget, isSafeInternalPath } from "@/page-builder/utils/linkTarget";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";

interface FeaturedProductBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
}

/** 代表作品(Hero Piece):一件作品获得极大视觉权重;价格默认隐藏,仅电商场景开启。 */
export default function FeaturedProductBlock({ module, editMode }: FeaturedProductBlockProps) {
  const { content = {}, layoutConfig = {}, styleConfig = {} } = module;
  const { eyebrow, title, summary, product = {}, primaryText, secondaryText } = content;
  const showPrice = content.showPrice === true;
  const bgColor = styleConfig.bgColor || "#FFFFFF";
  // 槽位比例选项(契约派生):一件作品的展示比例,全端一致
  const productRatio = resolveContractAspectRatio("featuredProduct", "product", content.aspectRatio, "desktop");
  const productLink = isSafeInternalPath(product.link) ? product.link : "";
  // 次行动三件套(secondary 前缀):有三件套痕迹即不回退旧裸 secondaryLink,
  // 防"切回不跳转"后残留旧字段让链接复活(与条目级 resolveItemLinkUrl 同构)
  const secondaryUrl = resolvePrefixedLinkTarget(content, "secondary", "secondaryLink");

  if (!product.name) {
    if (!editMode) return null;
    return (
      <DecorSection master="hero-piece" background={bgColor}>
        <div style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
          <BlockEmptyPlaceholder
            assetSlot={{ templateKey: "featuredProduct", roleId: "product" }}
            hint="代表作品"
            spec={`请选择 1 件作品 · 作品图默认 ${productRatio.replace(" / ", ":")}`}
            ratio={productRatio}
          />
        </div>
      </DecorSection>
    );
  }

  const media = (
    <div
      data-content-role="product"
      data-editor-field="productId"
      className="homepage-featured-product__media"
      style={{ aspectRatio: productRatio, overflow: "hidden", background: "#F4F5F5", width: "100%", maxWidth: 640, margin: "0 auto" }}
    >
      <SecureImage
        src={product.image}
        alt={product.name || "代表珠宝作品"}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    </div>
  );

  const copy = (
    <div data-content-role="copy" className="homepage-featured-product__copy" style={{ maxWidth: 640, margin: "0 auto", textAlign: "center", width: "100%" }}>
      {eyebrow ? <p data-editor-field="eyebrow" style={{ margin: "0 0 14px", color: "#6E7477", fontSize: 11, letterSpacing: "0.2em", fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>{eyebrow}</p> : null}
      {title ? <h2 data-editor-field="title" style={{ margin: "0 0 22px", color: "#181A1B", fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`, fontSize: "var(--hc-type-display, clamp(32px, 4vw, 50px))", fontWeight: 500, lineHeight: 1.1 }}>{title}</h2> : null}
      <div data-content-role="list">
        <p style={{ margin: "0 0 8px", color: "#181A1B", fontSize: 17, fontWeight: 600 }}>{product.name}</p>
        {showPrice && product.price ? <p style={{ margin: "0 0 22px", color: "#6E7477", fontSize: 14 }}>{product.price}</p> : null}
      </div>
      {summary ? <p data-editor-field="summary" style={{ margin: "0 0 32px", color: "#5F6568", fontSize: "var(--hc-type-body, 14px)", lineHeight: 1.9 }}>{summary}</p> : null}
      <div data-content-role="action" style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
        {primaryText && productLink ? (
          editMode ? (
            <span data-editor-field="primaryText productId" style={{ color: "#181A1B", fontSize: 13, letterSpacing: "0.08em", borderBottom: "1px solid #181A1B", paddingBottom: 4 }}>{primaryText}</span>
          ) : (
            <Link data-editor-field="primaryText productId" to={productLink} style={{ color: "#181A1B", fontSize: 13, textDecoration: "none", letterSpacing: "0.08em", borderBottom: "1px solid #181A1B", paddingBottom: 4 }}>{primaryText}</Link>
          )
        ) : null}
        {secondaryText && secondaryUrl ? (
          editMode ? (
            <span data-editor-field="secondaryText secondaryLink" style={{ color: "#5F6568", fontSize: 13, letterSpacing: "0.08em", borderBottom: "1px solid #5F6568", paddingBottom: 4 }}>{secondaryText}</span>
          ) : (
            <Link data-editor-field="secondaryText secondaryLink" to={secondaryUrl} style={{ color: "#5F6568", fontSize: 13, textDecoration: "none", letterSpacing: "0.08em", borderBottom: "1px solid #5F6568", paddingBottom: 4 }}>{secondaryText}</Link>
          )
        ) : null}
      </div>
    </div>
  );

  return (
    <DecorSection master="hero-piece" background={bgColor} className="homepage-featured-product">
      <style>{`
        .homepage-featured-product__grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          justify-items: center;
          gap: clamp(32px, 5vw, 56px);
        }
        @media (max-width: 767px) {
          .homepage-featured-product__grid { grid-template-columns: minmax(0, 1fr); gap: 34px; }
          .homepage-featured-product__media { order: 1 !important; }
          .homepage-featured-product__copy { order: 2 !important; justify-self: stretch !important; }
        }
      `}</style>
      <div className="homepage-featured-product__grid">
        {media}
        {copy}
      </div>
    </DecorSection>
  );
}
