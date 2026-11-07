import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import type { CatalogProduct } from "@/data/catalogData";
import { useSelectionStore } from "@/store/selectionStore";
import { publicProductInquiryPath, publicProductPath } from "@/utils/publicProductPath";
import { getListingImage } from "@/utils/productImage";
import { withPublicMediaWidth } from "@/utils/publicMediaWidth";
import { getPublicProductTitle } from "@/utils/publicProductTitle";
import { SecureImage } from "@/components/common/SecureImage";
import { trackAddToSelection, trackRemoveFromSelection } from "@/hooks/useAnalytics";
import { salesModeCta } from "@/store/featureFlags";
import { productPathWithCatalogReturn, recordCatalogDeparture } from "./catalogReturnContext";
import {
  catalogImageSwipeDelta,
  catalogImageSwipeEnabled,
  nextCatalogImageIndex,
} from "./catalogImageSwipe";
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
function useCatalogImageSwipe(
  imageCount: number,
  setImgIdx: (update: (index: number) => number) => void,
) {
  const suppressClick = useRef(false);
  const stopGesture = useRef<(() => void) | null>(null);

  useEffect(() => () => stopGesture.current?.(), []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    if (imageCount < 2 || !catalogImageSwipeEnabled()) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button")) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    let axis: "x" | "y" | null = null;

    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      if (stopGesture.current === end) stopGesture.current = null;
    };
    const move = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId || axis) return;
      const dx = pointerEvent.clientX - startX;
      const dy = pointerEvent.clientY - startY;
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    };
    const up = (pointerEvent: PointerEvent) => {
      const locked = axis;
      end();
      if (pointerEvent.pointerId !== pointerId || locked !== "x") return;
      const delta = catalogImageSwipeDelta(
        pointerEvent.clientX - startX,
        pointerEvent.clientY - startY,
      );
      if (delta === 0) return;
      suppressClick.current = true;
      setImgIdx((index) => nextCatalogImageIndex(index, imageCount, delta));
    };
    const cancel = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      end();
    };

    stopGesture.current?.();
    stopGesture.current = end;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };

  const onClickCapture = (event: ReactMouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return { onPointerDown, onClickCapture };
}

/* ══════════════════════════════════════
   组件：产品卡片（梵克雅宝矩阵风格）
   ══════════════════════════════════════ */
function CatalogProductAction({
  product,
  selected,
  onToggle,
}: {
  product: CatalogProduct;
  selected: boolean;
  onToggle: () => void;
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

  if (product.salesMode === "APPOINTMENT") {
    return (
      <Link className={actionClass} to={publicProductInquiryPath(product, "appointment")}>
        {salesModeCta(product.salesMode)}
      </Link>
    );
  }

  return null;
}

function ProductCard({
  product,
  productIndex,
  catalogUrl,
}: {
  product: CatalogProduct;
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
  const swipe = useCatalogImageSwipe(allImages.length, setImgIdx);

  useEffect(() => {
    setImgIdx(0);
  }, [product.id]);

  const priceText = product.salesMode === "DIRECT_PURCHASE"
    ? product.price && product.price > 0
      ? `¥ ${product.price.toLocaleString()} 起`
      : "价格暂不可用"
    : product.salesMode === "CUSTOM_INQUIRY" && Number(product.priceMin) > 0
      ? `¥ ${Number(product.priceMin).toLocaleString()} 起`
      : "";

  const fullName = product.name || product.sku;
  const productCode = product.sku.trim();
  const title = getPublicProductTitle(fullName);
  const detailHref = productPathWithCatalogReturn(publicProductPath(product), catalogUrl);
  const openDetail = () => rememberDetailEntry(product, productIndex, catalogUrl, "card");

  return (
    <div className="catalog-product-card">
      {/* 正方形格子里，作品在文字上方居中放大。 */}
      <div
        className="catalog-product-card__media"
        data-catalog-product-media
        data-catalog-product-media-src={currentImg}
        data-catalog-image-index={imgIdx}
        data-catalog-image-swipe={allImages.length > 1 ? "true" : undefined}
        onPointerDown={swipe.onPointerDown}
        onClickCapture={swipe.onClickCapture}
      >
        <Link
          to={detailHref}
          className="catalog-image-trigger"
          data-catalog-product-focus
          aria-label={fullName}
          draggable={false}
          onClick={openDetail}
        >
          <SecureImage
            src={withPublicMediaWidth(currentImg, 800)}
            alt=""
            className="catalog-img"
          />
        </Link>
        {allImages.length > 1 ? (
          <button
            type="button"
            className="catalog-image-next"
            data-catalog-image-next
            aria-label={`下一张作品图，当前第 ${imgIdx + 1} 张，共 ${allImages.length} 张`}
            onClick={(event) => {
              event.stopPropagation();
              setImgIdx((index) => (index + 1) % allImages.length);
            }}
          >
            <span aria-hidden="true" />
          </button>
        ) : null}
        {allImages.length > 1 ? (
          <button
            type="button"
            className="catalog-image-dots"
            data-catalog-image-dots
            aria-label={`下一张图片，当前第 ${imgIdx + 1} 张，共 ${allImages.length} 张`}
            onClick={(event) => {
              event.stopPropagation();
              setImgIdx((index) => (index + 1) % allImages.length);
            }}
          >
            {allImages.map((src, index) => (
              <span
                key={`${src}-${index}`}
                className="catalog-image-dot"
                data-active={index === imgIdx ? "true" : undefined}
                aria-hidden="true"
              />
            ))}
          </button>
        ) : null}
      </div>

      <div className="catalog-product-card__copy">
        <h3 className="catalog-product-card__title">
          <Link
            to={detailHref}
            data-catalog-detail-entry
            onClick={() => rememberDetailEntry(product, productIndex, catalogUrl)}
          >
            {title}
          </Link>
        </h3>
        {productCode ? (
          <p className="catalog-product-card__facts">款号 {productCode}</p>
        ) : null}
        {priceText ? (
          <p className="catalog-product-card__price">{priceText}</p>
        ) : null}
        <CatalogProductAction
          product={product}
          selected={sel}
          onToggle={handleToggle}
        />
      </div>
    </div>
  );
}

function catalogColumnCount(resultCount: number) {
  if (typeof window === "undefined" || resultCount <= 1) return 1;
  // 选款结果在手机上也是两列；只有一件时保持单列，避免半格。宽屏三件及以上才用三列。
  if (resultCount === 2 || !window.matchMedia("(min-width: 1024px)").matches) return 2;
  return 3;
}

function useCatalogColumnCount(resultCount: number) {
  const [columns, setColumns] = useState(() => catalogColumnCount(resultCount));

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const apply = () => setColumns(catalogColumnCount(resultCount));
    apply();
    desktop.addEventListener("change", apply);
    return () => desktop.removeEventListener("change", apply);
  }, [resultCount]);

  return columns;
}

/* ══════════════════════════════════════
   组件：产品矩阵。横竖细线连成完整方格，末行空位也保留线条。
   ══════════════════════════════════════ */
export function ProductGrid({
  products,
  catalogUrl,
  startIndex = 0,
}: {
  products: CatalogProduct[];
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
                  {image ? <SecureImage src={withPublicMediaWidth(image, 800)} alt="" className="catalog-pathways__photo" /> : null}
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

