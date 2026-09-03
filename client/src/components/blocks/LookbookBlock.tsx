import { Link } from "react-router-dom";
import { SecureImage } from "@/components/common/SecureImage";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { getContractRoleRatio, resolveContractAspectRatio } from "@/page-builder/config/blockContracts";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import { resolveLinkTargetUrl } from "@/page-builder/utils/linkTarget";
import type { RenderablePageModule } from "@/types/pageModule";

interface LookbookBlockProps {
  module: RenderablePageModule;
  editMode?: boolean;
}

const INK = "#181A1B";
const MUTED = "#6E7477";
const GOLD = "#6E7477";
/** 关联作品缩略与商品行同源,比例取 productRow 契约 */
const PRODUCT_THUMB_RATIO = getContractRoleRatio("productRow", "productCards", "desktop");

/**
 * 佩戴大片 — Hero Piece 母版(场景变体)
 * 桌面:佩戴大片(默认 4:5,可选项)占 58% + 关联作品纵列(42%,4:5 缩略);
 * Mobile:大片全宽 → 关联作品两列。
 * 品牌叙事场景,关联作品不显示价格。
 */
export default function LookbookBlock({ module, editMode }: LookbookBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const { title, subtitle, image, imageAlt, products = [], actionText, linkUrl, targetType, productId } = content;
  const bgColor = styleConfig.bgColor || "#FFFFFF";
  // 槽位比例选项(契约派生)
  const WEARING_RATIO_DESKTOP = resolveContractAspectRatio("wearingInspiration", "wearingImage", content.aspectRatio, "desktop");
  const WEARING_RATIO_MOBILE = resolveContractAspectRatio("wearingInspiration", "wearingImage", content.aspectRatio, "mobile");
  // 纯氛围模式宽度随所选比例缩放(此前硬编码旧 2:3 数值)
  const [wearingW, wearingH] = WEARING_RATIO_DESKTOP.split("/").map((part) => Number(part.trim()));
  // 佩戴大片的视觉焦点（0-100）；与 Schema focusKeys 对应，驱动画布裁切预览
  const focusX = Math.min(100, Math.max(0, Number(styleConfig.focusX ?? 50)));
  const focusY = Math.min(100, Math.max(0, Number(styleConfig.focusY ?? 50)));
  const hasProducts = Array.isArray(products) && products.length > 0;
  const targetUrl = resolveLinkTargetUrl({ targetType, productCode: content.productCode, productId, categorySlug: content.categorySlug, linkUrl });
  // 纯氛围模式：无关联作品时，第 6 页「大片」只保留竖幅氛围影像，零文字零商品
  // 设计/预览态必须保留完整构图，让文字与关联作品槽位可见；公开页面在确实
  // 没有关联作品时才进入纯氛围模式，避免编辑画布与目录缩略图结构漂移。
  const pureAtmosphere = !hasProducts && !editMode;

  if (!image && !hasProducts && !editMode) return null;

  return (
    <DecorSection master="hero-piece" background={bgColor}>
      <div className={pureAtmosphere ? "hc-lookbook hc-lookbook--pure" : "hc-lookbook"}>
        <style>{`
          .hc-lookbook {
            display: grid;
            grid-template-columns: 58fr 42fr;
            grid-template-rows: auto 1fr;
            column-gap: clamp(24px, 4vw, 56px);
            row-gap: 28px;
            align-items: start;
          }
          .hc-lookbook__scene { grid-row: 1 / span 2; aspect-ratio: ${WEARING_RATIO_DESKTOP}; overflow: hidden; background: #DDE1E2; }
          .hc-lookbook__scene img { width: 100%; height: 100%; object-fit: cover; display: block; }
          /* 纯氛围大片：竖幅按所选比例居中，高度不超过 88vh，移动端全宽 */
          .hc-lookbook--pure { display: block; }
          .hc-lookbook--pure .hc-lookbook__scene {
            width: min(100%, calc(88vh * ${wearingW} / ${wearingH}));
            aspect-ratio: ${WEARING_RATIO_DESKTOP};
            margin: 0 auto;
          }
          .hc-lookbook__products {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 20px 16px;
          }
          .hc-lookbook__action { grid-column: 2; justify-self: start; }
          .hc-lookbook__product-link { color: inherit; text-decoration: none; min-width: 0; }
          .hc-lookbook__thumb { aspect-ratio: ${PRODUCT_THUMB_RATIO}; overflow: hidden; background: #F4F5F5; margin-bottom: 10px; }
          .hc-lookbook__thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
          @media (max-width: 767px) {
            .hc-lookbook { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto; row-gap: 28px; }
            .hc-lookbook__scene { grid-row: auto; }
            .hc-lookbook__scene { aspect-ratio: ${WEARING_RATIO_MOBILE}; }
            .hc-lookbook__products { gap: 24px 12px; }
            .hc-lookbook__action { grid-column: auto; }
          }
        `}</style>
        <div data-content-role="wearingImage" data-editor-field="image" className="hc-lookbook__scene">
          {image ? (
            <img
              src={image}
              alt={imageAlt || title || "佩戴大片"}
              loading="lazy"
              decoding="async"
              style={{ objectPosition: `${focusX}% ${focusY}%` }}
            />
          ) : (
            <BlockEmptyPlaceholder
              assetSlot={{ templateKey: "wearingInspiration", roleId: "wearingImage" }}
              hint="佩戴大片"
              spec={`请上传佩戴大片 · ${IMAGE_SPECS.lookbook.image.label}`}
              height="100%"
            />
          )}
        </div>
        {!pureAtmosphere && (title || subtitle || editMode) && (
          <div className="hc-lookbook__copy" data-content-role="copy">
            {title ? (
              <h2 data-editor-field="title" style={{ margin: "0 0 12px", color: INK, fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`, fontSize: "var(--hc-type-h2, clamp(28px,3.4vw,42px))", fontWeight: 500, lineHeight: 1.2 }}>
                {title}
              </h2>
            ) : null}
            {subtitle ? (
              <p data-editor-field="subtitle" style={{ margin: 0, color: MUTED, fontSize: "var(--hc-type-body, 14px)", lineHeight: 1.8 }}>{subtitle}</p>
            ) : null}
          </div>
        )}
        {!pureAtmosphere && (
          <div data-content-role="relatedProducts" className="hc-lookbook__products">
          {hasProducts ? products.map((product, index) => (
            <Link
              key={`${product.id || product.name}-${index}`}
              to={product.link || "/products"}
              className="hc-lookbook__product-link"
            >
              <div className="hc-lookbook__thumb">
                {product.image ? (
                  <SecureImage src={product.image} alt={product.name || ""} />
                ) : (
                  <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#6E7477", fontSize: 12 }}>作品</div>
                )}
              </div>
              <p style={{ margin: 0, color: INK, fontSize: 13, fontWeight: 500, letterSpacing: "0.02em" }}>{product.name}</p>
              <p style={{ margin: "4px 0 0", color: GOLD, fontSize: 11, letterSpacing: "0.12em", fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>查看作品 →</p>
            </Link>
          )) : (
            <p style={{ margin: 0, color: MUTED, fontSize: 13, gridColumn: "1 / -1" }}>请选择关联的珠宝作品</p>
          )}
          </div>
        )}
        {!pureAtmosphere && actionText && targetUrl ? (
          editMode ? (
            <span data-content-role="action" data-editor-field="actionText linkUrl productId" className="hc-lookbook__action" style={{ display: "inline-block", color: INK, fontSize: 13, letterSpacing: "0.04em", fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>
              {actionText} <span>→</span>
            </span>
          ) : (
            <Link data-content-role="action" to={targetUrl} data-editor-field="actionText linkUrl productId" className="hc-lookbook__action" style={{ display: "inline-block", color: INK, textDecoration: "none", fontSize: 13, letterSpacing: "0.04em", fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>
              {actionText} <span>→</span>
            </Link>
          )
        ) : null}
      </div>
    </DecorSection>
  );
}
