import { Link } from "react-router-dom";
import { SecureImage } from "@/components/common/SecureImage";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { getContractRoleRatio } from "@/page-builder/config/blockContracts";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";

interface LookbookBlockProps {
  module: { content: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

const INK = "#28231F";
const MUTED = "rgba(40,35,31,0.58)";
const GOLD = "#B8944E";
const WEARING_RATIO_DESKTOP = getContractRoleRatio("wearingInspiration", "wearingImage", "desktop");
const WEARING_RATIO_MOBILE = getContractRoleRatio("wearingInspiration", "wearingImage", "mobile");

/**
 * 佩戴大片 — Hero Piece 母版(场景变体)
 * 桌面:4:5 佩戴大片(58%) + 关联作品纵列(42%,3:4 缩略);
 * Mobile:大片全宽 4:5 → 关联作品两列。
 * 品牌叙事场景,关联作品不显示价格。
 */
export default function LookbookBlock({ module, editMode }: LookbookBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const { title, subtitle, image, imageAlt, products = [] } = content;
  const bgColor = styleConfig.bgColor || "#FCFCFB";
  const hasProducts = Array.isArray(products) && products.length > 0;

  if (!image && !hasProducts && !editMode) return null;

  return (
    <DecorSection master="hero-piece" background={bgColor}>
      <div className="hc-lookbook">
        <style>{`
          .hc-lookbook {
            display: grid;
            grid-template-columns: 58fr 42fr;
            grid-template-rows: auto 1fr;
            column-gap: clamp(24px, 4vw, 56px);
            row-gap: 28px;
            align-items: start;
          }
          .hc-lookbook__scene { grid-row: 1 / span 2; aspect-ratio: ${WEARING_RATIO_DESKTOP}; overflow: hidden; background: #E5E5E2; }
          .hc-lookbook__scene img { width: 100%; height: 100%; object-fit: cover; display: block; }
          .hc-lookbook__products {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 20px 16px;
          }
          .hc-lookbook__product-link { color: inherit; text-decoration: none; min-width: 0; }
          .hc-lookbook__thumb { aspect-ratio: 3 / 4; overflow: hidden; background: #F0ECE5; margin-bottom: 10px; }
          .hc-lookbook__thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
          @media (max-width: 767px) {
            .hc-lookbook { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto; row-gap: 28px; }
            .hc-lookbook__scene { grid-row: auto; }
            .hc-lookbook__scene { aspect-ratio: ${WEARING_RATIO_MOBILE}; }
            .hc-lookbook__products { gap: 24px 12px; }
          }
        `}</style>
        <div data-editor-field="image" className="hc-lookbook__scene">
          {image ? (
            <img src={image} alt={imageAlt || title || "佩戴大片"} loading="lazy" decoding="async" />
          ) : (
            <BlockEmptyPlaceholder hint="佩戴大片" spec={`请上传佩戴大片 · ${IMAGE_SPECS.lookbook.image.label}`} height="100%" />
          )}
        </div>
        {(title || subtitle) && (
          <div className="hc-lookbook__copy" data-content-role="copy">
            {title && (
              <h2 data-editor-field="title" style={{ margin: "0 0 12px", color: INK, fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`, fontSize: "var(--hc-type-h2, clamp(28px,3.4vw,42px))", fontWeight: 500, lineHeight: 1.2 }}>
                {title}
              </h2>
            )}
            {subtitle && (
              <p data-editor-field="subtitle" style={{ margin: 0, color: MUTED, fontSize: "var(--hc-type-body, 14px)", lineHeight: 1.8 }}>{subtitle}</p>
            )}
          </div>
        )}
        <div className="hc-lookbook__products">
          {hasProducts ? products.map((product: any, index: number) => (
            <Link
              key={`${product.id || product.name}-${index}`}
              to={product.link || "/products"}
              className="hc-lookbook__product-link"
            >
              <div className="hc-lookbook__thumb">
                {product.image ? (
                  <SecureImage src={product.image} alt={product.name || ""} />
                ) : (
                  <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#B8ADA0", fontSize: 12 }}>作品</div>
                )}
              </div>
              <p style={{ margin: 0, color: INK, fontSize: 13, fontWeight: 500, letterSpacing: "0.02em" }}>{product.name}</p>
              <p style={{ margin: "4px 0 0", color: GOLD, fontSize: 11, letterSpacing: "0.12em", fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>查看作品 →</p>
            </Link>
          )) : (
            <p style={{ margin: 0, color: MUTED, fontSize: 13, gridColumn: "1 / -1" }}>请选择关联的珠宝作品</p>
          )}
        </div>
      </div>
    </DecorSection>
  );
}
