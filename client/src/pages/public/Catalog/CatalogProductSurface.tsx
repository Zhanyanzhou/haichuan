import { useState, type CSSProperties, type MouseEvent, type RefObject } from "react";
import { Link } from "react-router-dom";
import type { CatalogProduct } from "@/data/catalogData";
import { useSelectionStore } from "@/store/selectionStore";
import { publicProductPath } from "@/utils/publicProductPath";
import { getListingImage } from "@/utils/productImage";
import { SecureImage } from "@/components/common/SecureImage";
import { trackAddToSelection, trackRemoveFromSelection } from "@/hooks/useAnalytics";
import { salesModeCta, salesModeRoute } from "@/store/featureFlags";
import { catalogTokens as T } from "./catalogTokens";
import useCatalogDialog from "./useCatalogDialog";
import { App as AntdApp } from "antd";
/* ══════════════════════════════════════
   组件：产品卡片（梵克雅宝矩阵风格）
   ══════════════════════════════════════ */
function CatalogProductAction({
  product,
  selected,
  onToggle,
  commerceAllowed,
}: {
  product: CatalogProduct;
  selected: boolean;
  onToggle: () => void;
  commerceAllowed: boolean;
}) {
  const commonStyle: CSSProperties = {
    display: "inline-flex",
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    padding: "0 16px",
    border: `1px solid ${T.line}`,
    background: "transparent",
    color: T.txt,
    cursor: "pointer",
    fontSize: 11,
    letterSpacing: "0.03em",
    textDecoration: "none",
  };

  if (product.salesMode === "SELECTION") {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        style={{
          ...commonStyle,
          borderColor: selected ? T.txt : T.line,
          background: selected ? T.txt : "transparent",
          color: selected ? "#FFFFFF" : T.sec,
        }}
      >
        {selected ? "✓ 已选" : "+ 加入选款"}
      </button>
    );
  }

  if (product.salesMode === "APPOINTMENT" || product.salesMode === "CUSTOM_INQUIRY") {
    return (
      <Link to={salesModeRoute(product.salesMode)} style={commonStyle}>
        {salesModeCta(product.salesMode)}
      </Link>
    );
  }

  return (
    <Link to={publicProductPath(product)} style={commonStyle}>
      {commerceAllowed &&
      product.salesMode === "DIRECT_PURCHASE" &&
      product.isAvailableForPurchase === true
        ? "查看并购买"
        : "查看作品"}
    </Link>
  );
}

function ProductCard({
  product,
  onQuickView,
  commerceAllowed,
}: {
  product: CatalogProduct;
  onQuickView: (p: CatalogProduct, trigger: HTMLButtonElement) => void;
  commerceAllowed: boolean;
}) {
  const { message } = AntdApp.useApp();
  const toggle = useSelectionStore((s) => s.toggle);
  const sel = useSelectionStore((s) => s.isSelected)(product.id);

  const handleToggle = () => {
    const result = toggle(product.id);
    if (result === "limit") {
      message.warning("每次最多选择 20 款作品");
      return;
    }
    if (sel) trackRemoveFromSelection(product.id);
    else trackAddToSelection(product.id);
  };
  const [imgIdx, setImgIdx] = useState(0);

  // 所有可用图片
  const allImages: string[] =
    product.images && product.images.length > 0
      ? product.images.filter(Boolean)
      : [getListingImage(product)];
  const currentImg = allImages[imgIdx] || allImages[0] || "";

  // 鼠标左右半区切换图片
  const handleMouseMove = (e: MouseEvent) => {
    if (allImages.length < 2) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const half = rect.width / 2;
    if (x < half && allImages.length >= 2) {
      setImgIdx(1);
    } else if (x >= half && allImages.length >= 3) {
      setImgIdx(2);
    }
  };
  const handleMouseLeave = () => {
    setImgIdx(0);
  };

  const priceText = product.salesMode === "DIRECT_PURCHASE"
    ? product.price && product.price > 0
      ? `¥${product.price.toLocaleString()} 起`
      : "价格暂不可用"
    : "";

  const subInfo = [product.categoryName, product.material]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={{ background: T.bg }}>
      {/* 商品目录统一使用 4:5 产品图比例。 */}
      <div
        data-catalog-product-media
        data-catalog-product-media-src={currentImg}
        style={{
          aspectRatio: "4/5",
          background: T.imgBg,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <button
          type="button"
          className="catalog-image-trigger"
          aria-label={`快速预览 ${product.name || product.sku}`}
          onClick={(event) => onQuickView(product, event.currentTarget)}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            width: "100%",
            height: "100%",
            border: 0,
            padding: 0,
            background: "none",
            cursor: "pointer",
          }}
        >
          <SecureImage
            src={currentImg}
            alt={product.name || product.sku}
            className="catalog-img"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transition: "transform 0.6s cubic-bezier(0.22,1,0.36,1)",
            }}
          />
        </button>
        {/* 图片切换指示器 — 极简细线（全部商品默认显示） */}
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 4,
            zIndex: 1,
          }}
        >
          {allImages.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`查看第 ${i + 1} 张图片`}
              aria-pressed={i === imgIdx}
              onClick={() => {
                setImgIdx(i);
              }}
              style={{
                width: 44,
                height: 44,
                border: "none",
                padding: 0,
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                background: "transparent",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: i === imgIdx ? 20 : 8,
                  height: 2,
                  background: i === imgIdx ? "rgba(24,26,27,0.55)" : "rgba(24,26,27,0.18)",
                  transition: "all 0.25s",
                }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* 信息区：名称 → 材质 → 价格 → 选款 */}
      <div style={{ padding: "14px 0 20px", textAlign: "center" }}>
        <h3
          className="catalog-product-card__title"
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: T.txt,
            margin: "0 0 5px",
            lineHeight: 1.4,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {product.name || product.sku}
        </h3>
        <p
          className="catalog-product-card__facts"
          style={{
            fontSize: 11,
            color: T.light,
            margin: "0 0 8px",
            lineHeight: 1.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {subInfo}
        </p>
        {priceText ? (
          <p
            style={{
              fontSize: 12,
              fontWeight: 400,
              color: T.txt,
              margin: "0 0 10px",
              lineHeight: 1.4,
            }}
          >
            {priceText}
          </p>
        ) : null}
        {product.salesMode === "DIRECT_PURCHASE" && product.isAvailableForPurchase === false ? (
          <p role="status" style={{ margin: "-4px 0 10px", color: T.sec, fontSize: 11 }}>
            已售罄
          </p>
        ) : null}
        <CatalogProductAction
          product={product}
          selected={sel}
          onToggle={handleToggle}
          commerceAllowed={commerceAllowed}
        />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   组件：产品矩阵（横竖分割线网格）
   — 横线：cell border-bottom，同一行自然连续
   — 竖线：cell border-right，最后列不画
   — gap=0 确保边框相接无断点
   ══════════════════════════════════════ */
export function ProductGrid({
  products,
  onQuickView,
  commerceAllowed,
}: {
  products: CatalogProduct[];
  onQuickView: (p: CatalogProduct, trigger: HTMLButtonElement) => void;
  commerceAllowed: boolean;
}) {
  const resultCount = Math.min(products.length, 3);
  const sparseMaxWidth = resultCount === 1 ? 560 : resultCount === 2 ? 960 : 1280;

  return (
    <>
      <style>{`
        .catalog-matrix {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          column-gap: 0;
          row-gap: 1px;
          background: ${T.line};
          width: 100%;
          border-left: 1px solid ${T.line};
          border-right: 1px solid ${T.line};
        }
        @media (min-width: 1024px) {
          .catalog-matrix { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        .catalog-cell {
          background: ${T.bg};
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          border-right: 1px solid ${T.line};
          padding: clamp(16px, 3vw, 28px);
        }
        /* 2列：第2列无右边线 */
        .catalog-cell:nth-child(2n) { border-right: none; }
        @media (min-width: 1024px) {
          /* 3列：覆盖2列规则，改为第3列无右边线 */
          .catalog-cell:nth-child(2n) { border-right: 1px solid ${T.line}; }
          .catalog-cell:nth-child(3n) { border-right: none; }
        }
        /* 少量结果不制造空轨道：保持作品为页面焦点，并让左右留白对称。 */
        .catalog-matrix[data-result-count="1"] {
          grid-template-columns: minmax(0, 1fr);
        }
        .catalog-matrix[data-result-count="1"] .catalog-cell,
        .catalog-matrix[data-result-count="2"] .catalog-cell:nth-child(2n) {
          border-right: none;
        }
        .catalog-matrix[data-result-count="2"] {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      `}</style>
      <div
        className="catalog-matrix"
        data-result-count={resultCount}
        style={{ maxWidth: `${sparseMaxWidth}px`, margin: "0 auto" }}
      >
        {products.map((p) => (
          <div key={p.id} className="catalog-cell">
            <ProductCard
              product={p}
              onQuickView={onQuickView}
              commerceAllowed={commerceAllowed}
            />
          </div>
        ))}
      </div>
      {/* 底部全宽横线：独立 div，width:100% 确保铺满整行 */}
      <div
        aria-hidden="true"
        style={{
          width: "100%",
          maxWidth: `${sparseMaxWidth}px`,
          margin: "0 auto",
          height: "1px",
          background: T.line,
        }}
      />
    </>
  );
}

/* ══════════════════════════════════════
   组件：快速查看
   ══════════════════════════════════════ */
export function QuickView({
  product,
  onClose,
  returnFocusRef,
  commerceAllowed,
}: {
  product: CatalogProduct | null;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  commerceAllowed: boolean;
}) {
  const { message } = AntdApp.useApp();
  const toggle = useSelectionStore((s) => s.toggle);
  const isSelected = useSelectionStore((s) => s.isSelected);
  const { dialogRef, initialFocusRef } = useCatalogDialog(onClose, returnFocusRef);
  if (!product) return null;
  const sel = isSelected(product.id);
  const handleToggle = () => {
    const result = toggle(product.id);
    if (result === "limit") {
      message.warning("每次最多选择 20 款作品");
      return;
    }
    if (sel) trackRemoveFromSelection(product.id);
    else trackAddToSelection(product.id);
  };

  return (
    <div
      className="catalog-pagination"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 95,
        background: "rgba(0,0,0,0.15)",
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="catalog-quick-view"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-quick-view-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(560px, 100%)",
          zIndex: 96,
          background: T.bg,
          overflowY: "auto",
          padding: "40px 36px",
          boxShadow: "-1px 0 0 " + T.line,
        }}
      >
        <button
          ref={initialFocusRef}
          type="button"
          aria-label="关闭快速预览"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 20,
            right: 24,
            background: "none",
            border: 0,
            cursor: "pointer",
            fontSize: 22,
            color: T.sec,
            lineHeight: 1,
            minWidth: 44,
            minHeight: 44,
          }}
        >
          ✕
        </button>
        <div
          data-catalog-quick-media
          style={{
            aspectRatio: "4/5",
            background: T.imgBg,
            overflow: "hidden",
            marginBottom: 28,
          }}
        >
          <SecureImage
            src={getListingImage(product)}
            alt={product.sku}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
        <h2
          id="catalog-quick-view-title"
          style={{
            fontSize: 18,
            fontWeight: 400,
            color: T.txt,
            margin: "0 0 4px",
          }}
        >
          {product.name || product.sku}
        </h2>
        {product.name && product.sku ? (
          <p
            style={{
              fontSize: 16,
              color: T.txt,
              margin: "0 0 16px",
              lineHeight: 1.5,
            }}
          >
            {product.sku}
          </p>
        ) : null}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px 20px",
            marginBottom: 24,
          }}
        >
          {product.categoryName ? <Info label="品类" value={product.categoryName} /> : null}
          {product.material && <Info label="材质" value={product.material} />}
        </div>
        {product.salesMode === "DIRECT_PURCHASE" && product.price && product.price > 0 ? (
          <p style={{ margin: "0 0 12px", color: T.txt, fontSize: 15 }}>
            ¥{product.price.toLocaleString()} 起
          </p>
        ) : null}
        {product.salesMode === "DIRECT_PURCHASE" && product.isAvailableForPurchase === false ? (
          <p role="status" style={{ margin: "0 0 12px", color: T.sec, fontSize: 13 }}>
            已售罄，作品仍可浏览
          </p>
        ) : null}
        <div className="catalog-quick-view__actions">
          <CatalogProductAction
            product={product}
            selected={sel}
            onToggle={handleToggle}
            commerceAllowed={commerceAllowed}
          />
          <Link className="catalog-quick-view__detail-link" to={publicProductPath(product)}>
            查看完整信息
          </Link>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ fontSize: 10, letterSpacing: "0.08em", color: T.light }}>
        {label}
      </span>
      <p style={{ fontSize: 13, color: T.txt, margin: "2px 0 0" }}>{value}</p>
    </div>
  );
}
