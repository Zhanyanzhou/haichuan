import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CatalogProduct } from "@/data/catalogData";
import { useSelectionStore } from "@/store/selectionStore";
import { publicProductInquiryPath, publicProductPath } from "@/utils/publicProductPath";
import { getListingImage } from "@/utils/productImage";
import { SecureImage } from "@/components/common/SecureImage";
import { trackAddToSelection, trackRemoveFromSelection } from "@/hooks/useAnalytics";
import { salesModeCta } from "@/store/featureFlags";
import { productPathWithCatalogReturn, recordCatalogDeparture } from "./catalogReturnContext";
import { App as AntdApp } from "antd";

function rememberDetailEntry(
  product: CatalogProduct,
  productIndex: number,
  catalogUrl: string | null,
  focusTarget: "detail" | "card" = "detail",
) {
  if (!catalogUrl) return;
  recordCatalogDeparture({
    catalogUrl,
    productReference: product.code?.trim() || String(product.id),
    productId: product.id,
    productIndex,
    focusTarget,
    scrollY: window.scrollY,
  });
}
/* ══════════════════════════════════════
   组件：产品卡片（梵克雅宝矩阵风格）
   ══════════════════════════════════════ */
function CatalogProductAction({
  product,
  selected,
  onToggle,
  commerceAllowed,
  productIndex,
  catalogUrl,
}: {
  product: CatalogProduct;
  selected: boolean;
  onToggle: () => void;
  commerceAllowed: boolean;
  productIndex: number;
  catalogUrl: string | null;
}) {
  const actionClass = "catalog-product-card__action";

  if (product.salesMode === "SELECTION") {
    return (
      <button
        type="button"
        className={selected ? `${actionClass} is-selected` : actionClass}
        onClick={onToggle}
        aria-pressed={selected}
      >
        {selected ? "✓ 已选" : "+ 加入选款"}
      </button>
    );
  }

  if (product.salesMode === "APPOINTMENT" || product.salesMode === "CUSTOM_INQUIRY") {
    const inquiryType = product.salesMode === "APPOINTMENT" ? "appointment" : "custom";
    return (
      <Link className={actionClass} to={publicProductInquiryPath(product, inquiryType)}>
        {salesModeCta(product.salesMode)}
      </Link>
    );
  }

  return (
    <Link
      className={actionClass}
      to={productPathWithCatalogReturn(publicProductPath(product), catalogUrl)}
      data-catalog-detail-entry
      onClick={() => rememberDetailEntry(product, productIndex, catalogUrl)}
    >
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
  commerceAllowed,
  productIndex,
  catalogUrl,
}: {
  product: CatalogProduct;
  commerceAllowed: boolean;
  productIndex: number;
  catalogUrl: string | null;
}) {
  const { message } = AntdApp.useApp();
  const toggle = useSelectionStore((s) => s.toggle);
  const sel = useSelectionStore((s) => s.isSelected)(product.id);

  const handleToggle = () => {
    const result = toggle(product.id);
    if (result === "unavailable") return;
    if (result === "limit") {
      message.warning("每次最多选择 20 款作品");
      return;
    }
    if (sel) trackRemoveFromSelection(product.id);
    else trackAddToSelection(product.id);
  };
  const [imgIdx, setImgIdx] = useState(0);
  const allImages = (product.images || []).filter(Boolean);
  const currentImg = allImages[imgIdx] || allImages[0] || getListingImage(product);

  useEffect(() => {
    setImgIdx(0);
  }, [product.id]);

  const priceText = product.salesMode === "DIRECT_PURCHASE"
    ? product.price && product.price > 0
      ? `¥ ${product.price.toLocaleString()} 起`
      : "价格暂不可用"
    : "";

  const subInfo = [product.categoryName, product.material]
    .filter(Boolean)
    .join(" · ");
  const detailHref = productPathWithCatalogReturn(publicProductPath(product), catalogUrl);
  const openDetail = () => rememberDetailEntry(product, productIndex, catalogUrl, "card");

  return (
    <div className="catalog-product-card">
      {/* 正方形格子里，作品在文字上方居中放大。 */}
      <div
        className="catalog-product-card__media"
        data-catalog-product-media
        data-catalog-product-media-src={currentImg}
      >
        <Link
          to={detailHref}
          className="catalog-image-trigger"
          data-catalog-product-focus
          aria-label={product.name || product.sku}
          onClick={openDetail}
        >
          <SecureImage
            src={currentImg}
            alt=""
            className="catalog-img"
          />
        </Link>
        {allImages.length > 1 ? (
          <button
            type="button"
            className="catalog-image-next"
            aria-label={`下一张图片，当前第 ${imgIdx + 1} 张，共 ${allImages.length} 张`}
            onClick={() => setImgIdx((index) => (index + 1) % allImages.length)}
          >
            <span aria-hidden="true" />
          </button>
        ) : null}
        {allImages.length > 1 ? (
          <div
            className="catalog-image-marks"
            role="group"
            aria-label={`${product.name || product.sku} 的图片`}
          >
            {allImages.map((src, i) => (
              <button
                key={`${product.id}-${src}`}
                type="button"
                className="catalog-image-mark"
                data-catalog-image-mark={i}
                aria-label={`查看第 ${i + 1} 张图片，共 ${allImages.length} 张`}
                aria-pressed={i === imgIdx}
                onClick={(event) => {
                  event.stopPropagation();
                  setImgIdx(i);
                }}
              >
                <span aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="catalog-product-card__copy">
        <h3 className="catalog-product-card__title">
          <Link to={detailHref} onClick={openDetail}>
            {product.name || product.sku}
          </Link>
        </h3>
        <p className="catalog-product-card__facts">{subInfo}</p>
        {priceText ? (
          <p className="catalog-product-card__price">{priceText}</p>
        ) : null}
        {product.salesMode === "DIRECT_PURCHASE" ? (
          <p className="catalog-product-card__status" role={product.isAvailableForPurchase === false ? "status" : undefined}>
            {product.isAvailableForPurchase === false ? "已售罄" : ""}
          </p>
        ) : null}
        <CatalogProductAction
          product={product}
          selected={sel}
          onToggle={handleToggle}
          commerceAllowed={commerceAllowed}
          productIndex={productIndex}
          catalogUrl={catalogUrl}
        />
      </div>
    </div>
  );
}

function catalogColumnCount(resultCount: number) {
  if (typeof window === "undefined" || resultCount <= 1) return 1;
  if (window.matchMedia("(max-width: 639px)").matches) return 1;
  if (resultCount === 2 || !window.matchMedia("(min-width: 1024px)").matches) return 2;
  return 3;
}

function useCatalogColumnCount(resultCount: number) {
  const [columns, setColumns] = useState(() => catalogColumnCount(resultCount));

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const phone = window.matchMedia("(max-width: 639px)");
    const apply = () => setColumns(catalogColumnCount(resultCount));
    apply();
    desktop.addEventListener("change", apply);
    phone.addEventListener("change", apply);
    return () => {
      desktop.removeEventListener("change", apply);
      phone.removeEventListener("change", apply);
    };
  }, [resultCount]);

  return columns;
}

/* ══════════════════════════════════════
   组件：产品矩阵。横竖细线连成完整方格，末行空位也保留线条。
   ══════════════════════════════════════ */
export function ProductGrid({
  products,
  commerceAllowed,
  catalogUrl,
  startIndex = 0,
}: {
  products: CatalogProduct[];
  commerceAllowed: boolean;
  catalogUrl: string | null;
  startIndex?: number;
}) {
  const resultCount = Math.min(products.length, 3);
  const columns = useCatalogColumnCount(resultCount);
  const sparseMaxWidth = resultCount === 1 ? 560 : resultCount === 2 ? 960 : 1600;
  const remainder = products.length % columns;
  const emptyCells = remainder === 0 ? 0 : columns - remainder;

  return (
    <div
      className="catalog-matrix"
      data-result-count={resultCount}
      style={{ maxWidth: `${sparseMaxWidth}px` }}
    >
      {products.map((p, index) => (
        <div
          key={p.id}
          className="catalog-cell"
          data-catalog-product-id={p.id}
          data-catalog-product-index={startIndex + index}
        >
          <ProductCard
            product={p}
            commerceAllowed={commerceAllowed}
            productIndex={startIndex + index}
            catalogUrl={catalogUrl}
          />
        </div>
      ))}
      {Array.from({ length: emptyCells }, (_, index) => (
        <div key={`empty-${index}`} className="catalog-cell catalog-cell--empty" aria-hidden="true" />
      ))}
    </div>
  );
}

export function CatalogPathways({
  categories,
  activeCategoryId,
  products,
  hasMore,
  onOpenCategory,
  onMore,
}: {
  categories: Array<{ id: number; name: string }>;
  activeCategoryId: string;
  products: CatalogProduct[];
  hasMore: boolean;
  onOpenCategory: (id: string) => void;
  onMore: () => void;
}) {
  const others = categories.filter((category) => String(category.id) !== activeCategoryId && category.name.trim());
  const channels = (others.length > 0 ? others : categories.filter((category) => category.name.trim())).slice(0, 8);
  if (!channels.length && !hasMore) return null;

  return (
    <section className="catalog-pathways" aria-label="继续浏览">
      <div className="catalog-pathways__head">
        <h2 className="catalog-pathways__title">作品推荐</h2>
        {hasMore || activeCategoryId ? (
          <button
            type="button"
            className="catalog-pathways__more"
            onClick={hasMore ? onMore : () => onOpenCategory("")}
          >
            {hasMore ? "查看更多" : "查看全部作品"}
          </button>
        ) : null}
      </div>
      {channels.length > 0 ? (
        <div className="catalog-pathways__row">
          {channels.map((category) => {
            const sample = products.find((product) => {
              const label = product.categoryName?.trim() || "";
              return product.primaryCategoryId === String(category.id)
                || label === category.name
                || (category.name.length >= 2 && label.includes(category.name));
            });
            const image = sample?.images.find(Boolean) || "";
            return (
              <button
                key={category.id}
                type="button"
                className="catalog-pathways__tile"
                onClick={() => onOpenCategory(String(category.id))}
              >
                <span className="catalog-pathways__frame">
                  {image ? <SecureImage src={image} alt="" className="catalog-pathways__photo" /> : null}
                </span>
                <span>{category.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

