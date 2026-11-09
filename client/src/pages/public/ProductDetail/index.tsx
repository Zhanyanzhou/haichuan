// 作品详情：公开安全字段/主图悬停放大/SKU/收藏/评价 Tab(晒单)/SEO meta。作品列表只在选款中心。
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useParams, Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { App as AntdApp, Tabs, Rate } from "antd";
import RouteLoading from "@/components/common/RouteLoading";
import {
  ShoppingCartOutlined,
  SafetyCertificateOutlined,
  HeartOutlined,
  HeartFilled,
  ExpandOutlined,
  ArrowRightOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { jewelryMeasurementFacts } from "@/utils/jewelryParameters";
import { getMaterialLabel } from "@/utils/material";
import { isPublishableCertificate } from "@/utils/productCertificate";
import { clampProductTitle } from "@/utils/productTitleLength";
import { getPublicProductTitle } from "@/utils/publicProductTitle";
import { getListingImage, getPrimaryImage, getThumbnailList } from "@/utils/productImage";
import { measureSubjectFrame, mediaIdFromUrl, type SubjectFrame } from "@/utils/subjectFrame";
import { SecureImage } from "@/components/common/SecureImage";
import {
  cartApi,
  customerApi,
  publicProductStreamUrl,
  reviewApi,
} from "@/services/api";
import { USE_MOCK } from "@/services/mockData";
import { lookupPublicWork, type PublicWorkResolution } from "@/data/publicWorkLookup";
import { unwrapResponse } from "@/utils/unwrap";
import type { Product, ProductSKU } from "@/types";
import {
  trackAddToCart,
  trackAddToSelection,
  trackPageView,
  trackViewItem,
  trackRemoveFromSelection,
} from "@/hooks/useAnalytics";
import {
  canPrepareDirectPurchase,
  useCommerceCapabilities,
} from "@/store/featureFlags";
import { useReconnectingEventSource } from "@/hooks/useReconnectingEventSource";
import { usePageMetaStore } from "@/store/pageMetaStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useCustomerAuthStore } from "@/store/customerAuthStore";
import {
  publicProductInquiryPath,
  publicProductPath,
} from "@/utils/publicProductPath";
import { buildPublicUrl, normalizePublicSiteOrigin } from "@/utils/publicSiteUrl";
import { useStructuredData } from "@/hooks/useStructuredData";
import { useProductData } from "@/hooks/useProductData";
import { getRequestErrorMessage } from "@/services/httpClient";
import { getCatalogReturnUrl, productPathWithCatalogReturn, sanitizeCatalogReturnUrl } from "@/pages/public/Catalog/catalogReturnContext";
import { PUBLIC_MEDIA_WIDTHS, withPublicMediaWidth } from "@/utils/publicMediaWidth";

const productSchemaOrigin = normalizePublicSiteOrigin(
  import.meta.env.VITE_PUBLIC_SITE_ORIGIN,
  { allowHttp: import.meta.env.DEV },
);

const DETAIL_ZOOM = 2;

function trackProductDetailZoom(event: ReactPointerEvent<HTMLDivElement>) {
  if (event.pointerType !== "mouse") return;
  if (window.matchMedia("(hover: none), (max-width: 900px)").matches) return;
  const frame = event.currentTarget;
  if (event.target instanceof Element && event.target.closest("button")) {
    frame.classList.remove("is-detail-zoom");
    return;
  }
  const stage = frame.closest(".product-detail-page__stage");
  const lens = frame.querySelector<HTMLElement>(".product-detail-page__zoom-lens");
  const pane = stage?.querySelector<HTMLElement>(".product-detail-page__zoom-pane");
  const photo = pane?.querySelector<HTMLElement>(".product-detail-page__zoom-photo-frame");
  if (!stage || !lens || !pane || !photo) return;
  const rect = frame.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  frame.classList.add("is-detail-zoom");
  const summary = stage.closest(".product-detail-page__layout")?.querySelector(".product-detail-page__summary");
  const summaryLeft = summary?.getBoundingClientRect().left ?? rect.right;
  const size = Math.min(rect.width, Math.max(0, window.innerWidth - summaryLeft - 16));
  if (size < 160) return;
  pane.style.width = `${size}px`;
  pane.style.height = `${size}px`;
  const paneWidth = pane.clientWidth;
  const paneHeight = pane.clientHeight;
  if (paneWidth <= 0 || paneHeight <= 0) return;
  const lensWidth = Math.min(rect.width, paneWidth / DETAIL_ZOOM);
  const lensHeight = Math.min(rect.height, paneHeight / DETAIL_ZOOM);
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  const lensX = Math.min(rect.width - lensWidth, Math.max(0, localX - lensWidth / 2));
  const lensY = Math.min(rect.height - lensHeight, Math.max(0, localY - lensHeight / 2));
  lens.style.width = `${lensWidth}px`;
  lens.style.height = `${lensHeight}px`;
  lens.style.transform = `translate(${lensX}px, ${lensY}px)`;
  const scaleX = paneWidth / lensWidth;
  const scaleY = paneHeight / lensHeight;
  photo.style.width = `${rect.width * scaleX}px`;
  photo.style.height = `${rect.height * scaleY}px`;
  photo.style.transform = `translate(${-lensX * scaleX}px, ${-lensY * scaleY}px)`;
}

function clearProductDetailZoom(event: ReactPointerEvent<HTMLDivElement>) {
  const frame = event.currentTarget;
  frame.classList.remove("is-detail-zoom");
}

function buildDetailZoomSrc(src: string): string {
  if (!src.includes("/media/")) return src;
  try {
    const absolute = /^[a-z][a-z\d+.-]*:/i.test(src);
    const parsed = new URL(src, "https://public-media.local");
    parsed.searchParams.set("width", "1200");
    return absolute
      ? parsed.toString()
      : `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return src;
  }
}

function relatedPriceLabel(product: {
  salesMode?: string;
  price?: number;
  priceMin?: number;
}): string {
  if (product.salesMode === "DIRECT_PURCHASE" && Number(product.price) > 0) {
    return `¥${Number(product.price).toLocaleString()}`;
  }
  if (product.salesMode === "CUSTOM_INQUIRY" && Number(product.priceMin) > 0) {
    return `¥${Number(product.priceMin).toLocaleString()} 起`;
  }
  return "";
}

function RelatedWorks({ categoryId, productId, catalogUrl }: {
  categoryId: number;
  productId: number;
  catalogUrl: string;
}) {
  const { products, loading, error } = useProductData(
    { categoryIds: String(categoryId), pageSize: 5 },
    { loadCategories: false, subscribe: false, requireFresh: true },
  );
  const related = loading || error ? [] : products
    .filter((product) => product.id !== productId && product.secondaryCategoryId === String(categoryId) && product.images.length > 0)
    .slice(0, 4);

  return (
    <section className="product-detail-page__related" id="product-related" aria-labelledby="product-related-title">
      <div className="product-detail-page__related-heading">
        <h2 id="product-related-title">同类作品</h2>
        <Link to={catalogUrl}>继续浏览同类作品 <ArrowRightOutlined aria-hidden="true" /></Link>
      </div>
      {related.length > 0 ? (
        <ul className="product-detail-page__related-grid">
          {related.map((product) => {
            const frames = product.images.filter((src) => src && src !== product.images[0]);
            const secondary = frames[0] ?? "";
            const priceLabel = relatedPriceLabel(product);
            return (
              <li key={product.id}>
                <Link to={productPathWithCatalogReturn(publicProductPath(product), catalogUrl)}>
                  <span className="product-detail-page__related-media">
                    <SecureImage src={getListingImage(product)} alt="" deferUntilVisible />
                    {secondary ? (
                      <SecureImage
                        className="product-detail-page__related-secondary"
                        src={withPublicMediaWidth(secondary, 480)}
                        alt=""
                        deferUntilVisible
                      />
                    ) : null}
                  </span>
                  <span className="product-detail-page__related-name">{getPublicProductTitle(product.name)}</span>
                  {priceLabel ? <span className="product-detail-page__related-price">{priceLabel}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function ProductImageSteps({ onStep }: { onStep: (direction: number) => void }) {
  return (
    <div className="product-detail-page__image-steps" role="group" aria-label="切换作品图">
      <button type="button" onClick={() => onStep(-1)} aria-label="上一张作品图"><LeftOutlined aria-hidden="true" /></button>
      <button type="button" onClick={() => onStep(1)} aria-label="下一张作品图"><RightOutlined aria-hidden="true" /></button>
    </div>
  );
}

function ProductImagePreview({ src, alt, onStep }: { src: string; alt: string; onStep?: (direction: number) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const imageScrollRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === dialogRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useLayoutEffect(() => {
    const viewport = imageScrollRef.current;
    if (zoomed && viewport) {
      viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
      viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) / 2;
    }
  }, [zoomed]);

  return (
    <>
      <button
        type="button"
        className="product-detail-page__view-image"
        aria-haspopup="dialog"
        onClick={() => {
          dialogRef.current?.showModal();
          setOpen(true);
        }}
      >
        <ExpandOutlined aria-hidden="true" />
        查看大图
      </button>
      <dialog
        ref={dialogRef}
        className="product-detail-page__image-dialog"
        aria-label="作品大图"
        onClose={() => {
          setOpen(false);
          setZoomed(false);
          if (document.fullscreenElement === dialogRef.current) {
            void document.exitFullscreen().catch(() => undefined);
          }
        }}
        onKeyDown={(event) => {
          if (!onStep || event.altKey || event.metaKey || event.ctrlKey) return;
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          setZoomed(false);
          onStep(event.key === "ArrowLeft" ? -1 : 1);
        }}
      >
        <form method="dialog" className="product-detail-page__image-dialog-actions">
          {onStep ? (
            <ProductImageSteps onStep={(direction) => {
              setZoomed(false);
              onStep(direction);
            }} />
          ) : null}
          <button type="button" aria-pressed={zoomed} onClick={() => setZoomed((value) => !value)}>
            放大细节
          </button>
          <button
            type="button"
            aria-pressed={fullscreen}
            onClick={() => {
              const dialog = dialogRef.current;
              if (!dialog?.requestFullscreen) return;
              if (document.fullscreenElement === dialog) {
                void document.exitFullscreen().catch(() => undefined);
                return;
              }
              void dialog.requestFullscreen().catch(() => undefined);
            }}
          >
            {fullscreen ? "退出全屏" : "全屏浏览"}
          </button>
          <button type="submit">关闭大图</button>
        </form>
        {open ? (
          <div
            ref={imageScrollRef}
            className="product-detail-page__image-scroll"
            data-zoomed={zoomed}
            role="region"
            aria-label="作品图片"
            tabIndex={zoomed ? 0 : undefined}
          >
            <SecureImage key={src} src={src} alt={alt} className="product-detail-page__dialog-photo" />
          </div>
        ) : null}
        {onStep ? <span className="sr-only" aria-live="polite">{alt}</span> : null}
      </dialog>
    </>
  );
}

function useSubjectFrames(sourceKey: string): Record<string, SubjectFrame> {
  const [frames, setFrames] = useState<Record<string, SubjectFrame>>({});
  useLayoutEffect(() => {
    if (!sourceKey) return undefined;
    const gallery = document.querySelector(".product-detail-page__gallery");
    if (!gallery) return undefined;
    const collect = () => {
      const found: Record<string, SubjectFrame> = {};
      gallery.querySelectorAll("img").forEach((node) => {
        const img = node as HTMLImageElement;
        if (img.closest(".product-detail-page__zoom-pane, dialog")) return;
        const id = mediaIdFromUrl(img.currentSrc || img.src);
        if (!id || !img.naturalWidth || found[id]) return;
        const frame = measureSubjectFrame(img);
        if (frame) found[id] = frame;
      });
      if (Object.keys(found).length === 0) return;
      setFrames((current) => {
        let changed = false;
        const next = { ...current };
        for (const [id, frame] of Object.entries(found)) {
          if (next[id]?.objectViewBox !== frame.objectViewBox) {
            next[id] = frame;
            changed = true;
          }
        }
        return changed ? next : current;
      });
    };
    collect();
    gallery.addEventListener("load", collect, true);
    return () => gallery.removeEventListener("load", collect, true);
  }, [sourceKey]);
  return frames;
}

function buildProductImageSrcSet(src: string): string | undefined {
  if (!src.includes("/media/")) return undefined;
  try {
    const absolute = /^[a-z][a-z\d+.-]*:/i.test(src);
    const parsed = new URL(src, "https://public-media.local");
    return PUBLIC_MEDIA_WIDTHS.map((width) => {
      parsed.searchParams.set("width", String(width));
      const candidate = absolute
        ? parsed.toString()
        : `${parsed.pathname}${parsed.search}${parsed.hash}`;
      return `${candidate} ${width}w`;
    }).join(", ");
  } catch {
    return undefined;
  }
}

type PublicReviewsData = {
  list: Array<{
    id: number;
    rating: number;
    content: string;
    images?: string[];
    reply: string | null;
    createdAt: string;
    reviewer: string;
  }>;
  total: number;
  averageRating: number | null;
};

/** 作品评价 Tab（先审后展）：只在存在已审核评价时渲染。 */
function ProductReviewsTab({ data }: { data: PublicReviewsData }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-brand-line">
        <Rate
          disabled
          allowHalf
          value={data.averageRating || 0}
          className="text-brand-gold"
        />
        <span className="text-sm text-brand-muted">
          {data.averageRating ?? "-"} 分 · {data.total} 条评价
        </span>
      </div>
      <div className="space-y-6">
        {data.list.map((review) => (
          <div
            key={review.id}
            className="border-b border-brand-line pb-5 last:border-0"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{review.reviewer}</span>
              <Rate disabled value={review.rating} className="text-sm" />
            </div>
            <p className="text-sm mt-2 leading-relaxed">{review.content}</p>
            {Array.isArray(review.images) && review.images.length > 0 ? (
              <div className="flex gap-2 mt-3 flex-wrap">
                {review.images.slice(0, 6).map((url: string) => (
                  <SecureImage
                    key={url}
                    src={url}
                    alt="买家晒单"
                    deferUntilVisible
                    className="w-20 h-20 object-cover border border-brand-line"
                  />
                ))}
              </div>
            ) : null}
            {review.reply ? (
              <div className="mt-3 bg-brand-bg p-3 text-sm">
                <span className="text-brand-gold">顾问回复：</span>
                {review.reply}
              </div>
            ) : null}
            <p className="text-xs text-brand-muted mt-2">
              {new Date(review.createdAt).toLocaleDateString("zh-CN")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function hasPublicFact(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value !== "string") return false;
  const clean = value.trim();
  return clean !== "" && clean !== "-" && clean !== "—";
}

/** 公开金重只保留 SKU / 商品事实中的正数，并与规格按钮使用同一写法。 */
function formatPublicGrams(value: unknown): string {
  if (!hasPublicFact(value)) return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  const rounded = Math.round(numeric * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : String(rounded)}g`;
}

function publicStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && hasPublicFact(item))
    .map((item) => item.trim());
}

const FULFILLMENT_LABELS: Record<NonNullable<Product["fulfillmentType"]>, string> = {
  IN_STOCK: "现货作品",
  PREORDER: "预订作品",
  CUSTOM: "按确认方案制作",
};

const DISPATCH_TIME_LABELS: Record<NonNullable<Product["dispatchTime"]>, string> = {
  SAME_DAY: "当日发出",
  WITHIN_24_HOURS: "24 小时内发出",
  WITHIN_48_HOURS: "48 小时内发出",
  OVER_48_HOURS: "超过 48 小时",
  CUSTOM: "以确认方案为准",
};

const DELIVERY_METHOD_LABELS: Record<string, string> = {
  EXPRESS: "物流配送",
  STORE_PICKUP: "到店自提",
  DEDICATED: "专人配送",
};

const GEM_TYPE_LABELS: Record<string, string> = {
  diamond: "钻石",
  jade: "玉石",
  pearl: "珍珠",
};

function formatCarat(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : String(rounded)} ct`;
}

function gemPublicFacts(gemInfo: Product["gemInfo"]): Array<{ label: string; value: string }> {
  if (!gemInfo || typeof gemInfo !== "object") return [];
  const rawType = typeof gemInfo.type === "string" ? gemInfo.type.trim() : "";
  const typeLabel = rawType === "无主石"
    ? ""
    : /[\u4e00-\u9fff]/.test(rawType)
      ? rawType
      : GEM_TYPE_LABELS[rawType.toLowerCase()] ?? "";
  const facts: Array<{ label: string; value: string }> = [];
  if (hasPublicFact(typeLabel)) facts.push({ label: "主石", value: typeLabel });
  if (gemInfo.settingMaterial) {
    const materialLabel = getMaterialLabel(gemInfo.settingMaterial);
    if (materialLabel !== "其他") facts.push({ label: "镶托材质", value: materialLabel });
  }
  if (hasPublicFact(gemInfo.origin)) facts.push({ label: "宝石来源", value: gemInfo.origin!.trim() });
  if (hasPublicFact(gemInfo.treatment)) facts.push({ label: "宝石处理", value: gemInfo.treatment!.trim() });
  if (typeof gemInfo.carat === "number" && hasPublicFact(gemInfo.carat)) {
    facts.push({ label: "克拉", value: formatCarat(gemInfo.carat) });
  }
  if (hasPublicFact(gemInfo.color)) facts.push({ label: "颜色", value: gemInfo.color!.trim() });
  if (hasPublicFact(gemInfo.clarity)) facts.push({ label: "净度", value: gemInfo.clarity!.trim() });
  if (hasPublicFact(gemInfo.cut)) facts.push({ label: "切工", value: gemInfo.cut!.trim() });
  if (typeof gemInfo.quantity === "number" && gemInfo.quantity > 1) {
    facts.push({ label: "数量", value: String(gemInfo.quantity) });
  }
  if (hasPublicFact(gemInfo.metalColor)) facts.push({ label: "金属颜色", value: gemInfo.metalColor!.trim() });
  if (hasPublicFact(gemInfo.brand)) facts.push({ label: "品牌", value: gemInfo.brand!.trim() });
  if (hasPublicFact(gemInfo.collection)) facts.push({ label: "系列", value: gemInfo.collection!.trim() });
  if (hasPublicFact(gemInfo.style)) facts.push({ label: "款式", value: gemInfo.style!.trim() });
  facts.push(...jewelryMeasurementFacts(gemInfo.measurements));
  return facts;
}

type PurchaseIssue = {
  actionLabel: string;
  detail: string;
  offerConsultation: boolean;
};

function ProductPrimaryAction({
  product,
  selectedSku,
  commerceFlags,
  commerceFlagsLoading,
  commerceFlagsError,
  onRetryCommerceFlags,
  canUseCart,
  canAddToCart,
  purchaseIssue,
  addingToCart,
  isSignedIn,
  isSelected,
  onToggleSelection,
  onAddToCart,
  buyNowPath,
  canCheckout,
}: {
  product: Product;
  selectedSku: ProductSKU | null;
  commerceFlags: { commerceEnabled: boolean; cartEnabled: boolean } | null;
  commerceFlagsLoading: boolean;
  commerceFlagsError: boolean;
  onRetryCommerceFlags: () => Promise<void>;
  canUseCart: boolean;
  canAddToCart: boolean;
  purchaseIssue: PurchaseIssue | null;
  addingToCart: boolean;
  isSignedIn: boolean;
  isSelected: boolean;
  onToggleSelection: () => void;
  onAddToCart: () => void;
  buyNowPath: string | null;
  canCheckout: boolean;
}) {
  const primaryClass = "btn btn-primary product-detail-page__primary-action";

  if (product.salesMode === "SELECTION") {
    return (
      <button
        type="button"
        className={primaryClass}
        aria-pressed={isSelected}
        onClick={onToggleSelection}
      >
        {isSelected ? "已加入" : "加入选款"}
      </button>
    );
  }

  if (product.salesMode === "APPOINTMENT") {
    return <Link to={publicProductInquiryPath(product, "appointment")} className={`${primaryClass} text-center`}>预约鉴赏此款</Link>;
  }

  if (product.salesMode === "CUSTOM_INQUIRY") {
    const hasCustomReferencePrice = Number(product.priceMin) > 0;
    return (
      <Link
        to={publicProductInquiryPath(product, hasCustomReferencePrice ? "custom" : "purchase-support")}
        className={`${primaryClass} product-detail-page__consultation-action`}
      >
        <span>{hasCustomReferencePrice ? "预约定制" : "联系顾问确认购买"}</span>
        <ArrowRightOutlined aria-hidden="true" />
      </Link>
    );
  }

  if (product.salesMode !== "DIRECT_PURCHASE") {
    return (
      <Link
        to={publicProductInquiryPath(product, "product")}
        className={`${primaryClass} product-detail-page__consultation-action`}
      >
        <span>咨询此款作品</span>
        <ArrowRightOutlined aria-hidden="true" />
      </Link>
    );
  }

  if (product.isAvailableForPurchase === false) {
    return <button type="button" className={primaryClass} disabled>已售罄</button>;
  }
  if (typeof product.isAvailableForPurchase !== "boolean") {
    return <button type="button" className={primaryClass} disabled>库存状态暂不可用</button>;
  }
  if (commerceFlagsError) {
    return (
      <div role="alert" aria-live="polite" className="grid gap-3">
        <button type="button" className={primaryClass} disabled>购买状态暂时无法确认</button>
        <button
          type="button"
          className="btn btn-secondary product-detail-page__primary-action"
          onClick={() => void onRetryCommerceFlags()}
        >
          重新检查购买状态
        </button>
      </div>
    );
  }
  if (commerceFlagsLoading || !commerceFlags) {
    return <button type="button" className={primaryClass} disabled>正在确认购买状态</button>;
  }
  if (!canUseCart) {
    return (
      <div className="grid gap-3">
        <Link to={publicProductInquiryPath(product, "purchase-support")} className={`${primaryClass} text-center`}>购买暂未开放，联系顾问</Link>
        <button
          type="button"
          className="product-detail-page__bag-action"
          aria-pressed={isSelected}
          aria-describedby="product-detail-selection-purpose"
          onClick={onToggleSelection}
        >
          {isSelected ? "已保存到购物袋" : "保存到购物袋"}
        </button>
        <p id="product-detail-selection-purpose" className="product-detail-page__selection-purpose">
          保存的款式可稍后与珠宝顾问沟通。
        </p>
      </div>
    );
  }
  return (
    <div className="product-detail-page__purchase-actions" data-checkout={canCheckout}>
      {purchaseIssue ? (
        <button type="button" className={primaryClass} disabled>{purchaseIssue.actionLabel}</button>
      ) : !isSignedIn ? (
        <Link
          to={`/customer?returnTo=${encodeURIComponent(buyNowPath ?? publicProductPath(product))}`}
          className={primaryClass}
        >
          登录后购买
        </Link>
      ) : (
        <button
          type="button"
          className={primaryClass}
          onClick={onAddToCart}
          disabled={addingToCart || !canAddToCart || !selectedSku}
        >
          <ShoppingCartOutlined /> {addingToCart ? "加入中..." : "加入购物车"}
        </button>
      )}
      {canCheckout ? (
        buyNowPath && !addingToCart ? (
          <Link to={buyNowPath} className="btn btn-primary product-detail-page__buy-now">立即购买</Link>
        ) : (
          <button type="button" className="btn btn-primary product-detail-page__buy-now" disabled>立即购买</button>
        )
      ) : null}
    </div>
  );
}

export default function ProductDetail() {
  const { message } = AntdApp.useApp();
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const catalogReturnUrl = getCatalogReturnUrl(id)
    || sanitizeCatalogReturnUrl(searchParams.get("from"))
    || "/catalog";
  const setPageMeta = usePageMetaStore((s) => s.setMeta);
  const clearPageMeta = usePageMetaStore((s) => s.clear);
  const isSignedIn = useCustomerAuthStore((state) => state.isLoggedIn);
  const customerId = useCustomerAuthStore((state) => state.customer?.id ?? null);
  const workKey = JSON.stringify([id, isSignedIn, customerId]);
  const [work, setWork] = useState<{ key: string; resolution: PublicWorkResolution } | null>(null);
  // 路由或会员身份变化时立即停止使用旧投影，不等待取数 effect 执行。
  const resolution = work?.key === workKey ? work.resolution : null;
  const loading = Boolean(id && !resolution);
  const product = resolution?.kind === "published" || resolution?.kind === "virtual" ? resolution.product : null;
  const isVirtualWork = resolution?.kind === "virtual";
  const loadFailure = resolution?.kind === "error";
  const [qty, setQty] = useState(1);
  const [selectedSkuId, setSelectedSkuId] = useState<number | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [mainImage, setMainImage] = useState(0);
  const [galleryPanel, setGalleryPanel] = useState<"images" | "parameters">("images");
  const parameterPreviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const parameterSwitchRef = useRef<HTMLButtonElement>(null);
  const specificationsHeadingRef = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (galleryPanel === "parameters") {
      parameterPreviewHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [galleryPanel]);
  const galleryPointerStart = useRef<{ id: number; x: number; y: number } | null>(null);
  const subjectFrameKey = product
    ? `${product.id}:${mainImage}:${(product.images ?? []).map((image) => image.id).join(",")}`
    : "";
  const subjectFrames = useSubjectFrames(subjectFrameKey);
  const [revision, setRevision] = useState(0);
  const [addingToCart, setAddingToCart] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");
  const [reviewsData, setReviewsData] = useState<PublicReviewsData | null>(null);
  const addPendingRef = useRef(false);
  const favoriteOperationRef = useRef(0);
  const cartOperationRef = useRef(0);
  const {
    flags: commerceFlags,
    loading: commerceFlagsLoading,
    error: commerceFlagsError,
    reload: reloadCommerceFlags,
  } = useCommerceCapabilities();
  const commerceEnabled = commerceFlags?.commerceEnabled ?? false;
  const cartEnabled = commerceFlags?.cartEnabled ?? false;
  // 心愿单仅对登录客户启用；游客仍可浏览公开安全字段。
  const [favorited, setFavorited] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const toggleSelection = useSelectionStore((state) => state.toggle);
  const isSelected = useSelectionStore((state) =>
    product ? state.selectedIds.has(product.id) : false,
  );
  const activeInteractionRef = useRef({
    routeId: id ?? null,
    productId: product?.id ?? null,
    customerId,
  });
  useLayoutEffect(() => {
    activeInteractionRef.current = {
      routeId: id ?? null,
      productId: product?.id ?? null,
      customerId,
    };
    return () => {
      activeInteractionRef.current = { routeId: null, productId: null, customerId: null };
    };
  }, [id, product?.id, customerId]);

  useEffect(() => {
    // 路由或客户身份变化后，旧作品写请求仍可能在服务端完成，但不得继续控制
    // 当前作品的忙碌态、错误、收藏按钮或消息反馈。
    favoriteOperationRef.current += 1;
    cartOperationRef.current += 1;
    addPendingRef.current = false;
    setFavBusy(false);
    setAddingToCart(false);
    setMainImage(0);
    setGalleryPanel("images");
    galleryPointerStart.current = null;
    setSelectedSkuId(null);
    setSelectedStyle(null);
    setQty(1);
    setPurchaseError("");
  }, [workKey]);

  // 初始收藏态：拉一次心愿单判断当前作品是否在列（心愿单量级小，整表判断成本可忽略）。
  // 登录墙 return 之前 hooks 已执行，必须显式判断登录态，避免游客每次必发一个注定 401 的请求。
  useEffect(() => {
    let cancelled = false;
    setFavorited(false);
    if (!product?.id || !isSignedIn || isVirtualWork) return undefined;
    customerApi
      .getFavorites()
      .then((res: unknown) => {
        const list = unwrapResponse<Array<{ productId: number }>>(res) || [];
        if (!cancelled) setFavorited(list.some((f) => f.productId === product.id));
      })
      .catch(() => {
        if (!cancelled) setFavorited(false);
      });
    return () => {
      cancelled = true;
    };
  }, [product?.id, isSignedIn, customerId, isVirtualWork]);

  const handleToggleFavorite = async () => {
    if (favBusy || !product?.id || isVirtualWork) return;
    const operation = favoriteOperationRef.current + 1;
    favoriteOperationRef.current = operation;
    const requestContext = {
      routeId: id ?? null,
      productId: product.id,
      customerId,
    };
    const isCurrentOperation = () => {
      const current = activeInteractionRef.current;
      return favoriteOperationRef.current === operation
        && current.routeId === requestContext.routeId
        && current.productId === requestContext.productId
        && current.customerId === requestContext.customerId;
    };
    setFavBusy(true);
    // 乐观更新，失败回滚
    const next = !favorited;
    setFavorited(next);
    try {
      const res = await customerApi.setFavorite(product.id, next);
      if (!isCurrentOperation()) return;
      const result = unwrapResponse<{ favorited: boolean }>(res);
      setFavorited(Boolean(result?.favorited));
      message.success(result?.favorited ? "已加入心愿单" : "已移出心愿单");
    } catch (error: unknown) {
      if (!isCurrentOperation()) return;
      setFavorited(!next);
      message.error(getRequestErrorMessage(error, "操作失败，请稍后重试"));
    } finally {
      if (isCurrentOperation()) setFavBusy(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setWork((previous) => previous?.key === workKey ? previous : null);
    void lookupPublicWork(id, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setWork({ key: workKey, resolution: result });
      },
      () => {
        if (!controller.signal.aborted) setWork({ key: workKey, resolution: { kind: "error" } });
      },
    );
    return () => controller.abort();
  }, [id, workKey, revision]);

  useEffect(() => {
    if (!id || !product?.code || isVirtualWork) return;
    const routeCode = decodeURIComponent(id);
    if (/^\d+$/.test(routeCode) || routeCode === product.code) return;
    navigate(`/products/${encodeURIComponent(product.code)}${location.search}`, { replace: true });
  }, [id, product?.code, isVirtualWork, navigate, location.search]);

  useEffect(() => {
    if (!product?.id || isVirtualWork) {
      setReviewsData(null);
      return;
    }
    let cancelled = false;
    setReviewsData(null);
    reviewApi
      .listForProduct(product.id, { pageSize: 20 })
      .then((res) => {
        if (!cancelled) {
          setReviewsData(unwrapResponse<PublicReviewsData>(res) || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReviewsData({ list: [], total: 0, averageRating: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isVirtualWork, product?.id]);

  const publicTitle = product?.name ? clampProductTitle(product.name) : "";
  const displayTitle = product?.name ? clampProductTitle(getPublicProductTitle(product.name)) : "";

  // SEO：商品详情独立标题（不泄露内部编号；未加载时不设误导标题）
  useEffect(() => {
    if (product && publicTitle) {
      setPageMeta({
        title: `${publicTitle} | 海川珠宝`,
        description: product.shortDescription || undefined,
        // og:image / twitter:image：分享到微信/微博/小红书时展示作品主图
        image: getPrimaryImage(product) || undefined,
        canonicalPath: publicProductPath(product),
        ...(isVirtualWork ? { noIndex: true } : {}),
      });
    } else if (!loading) {
      setPageMeta({
        title: loadFailure
          ? "作品暂时无法加载 | 海川珠宝"
          : "作品暂不可浏览 | 海川珠宝",
        description: loadFailure
          ? "作品信息暂时无法取得，请稍后重试。"
          : "该作品可能已下架，或尚未公开。",
        noIndex: true,
        canonicalPath: null,
      });
    }
    return () => clearPageMeta();
  }, [isVirtualWork, loadFailure, loading, product, publicTitle, setPageMeta, clearPageMeta]);

  const productCanonicalUrl = product
    ? buildPublicUrl(productSchemaOrigin, publicProductPath(product))
    : null;
  const productImage = product ? getPrimaryImage(product) : "";
  const absoluteProductImage = productImage
    ? /^https:\/\//i.test(productImage)
      ? productImage
      : buildPublicUrl(productSchemaOrigin, productImage)
    : null;
  const schemaPrice = Number(product?.price || 0);
  const includeOffer = Boolean(
    product?.salesMode === "DIRECT_PURCHASE"
    && Number.isFinite(schemaPrice)
    && schemaPrice > 0
    && typeof product.isAvailableForPurchase === "boolean",
  );
  useStructuredData("product", product && !isVirtualWork ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: publicTitle,
    sku: product.code,
    ...(product.shortDescription?.trim()
      ? { description: product.shortDescription.trim() }
      : {}),
    ...(product.category?.name ? { category: product.category.name } : {}),
    ...(absoluteProductImage ? { image: [absoluteProductImage] } : {}),
    ...(productCanonicalUrl ? { url: productCanonicalUrl } : {}),
    ...(includeOffer ? {
      offers: {
        "@type": "Offer",
        priceCurrency: "CNY",
        price: schemaPrice.toFixed(2),
        availability: product.isAvailableForPurchase
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        ...(productCanonicalUrl ? { url: productCanonicalUrl } : {}),
      },
    } : {}),
  } : null);
  useStructuredData("product-breadcrumb", product ? {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "首页",
        ...(buildPublicUrl(productSchemaOrigin, "/")
          ? { item: buildPublicUrl(productSchemaOrigin, "/") }
          : {}),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "选款中心",
        ...(buildPublicUrl(productSchemaOrigin, "/catalog")
          ? { item: buildPublicUrl(productSchemaOrigin, "/catalog") }
          : {}),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: publicTitle,
        ...(productCanonicalUrl ? { item: productCanonicalUrl } : {}),
      },
    ],
  } : null);

  // P1-35：带自动重连的 SSE（断线指数退避重连，避免实时刷新静默失效）
  useReconnectingEventSource(USE_MOCK ? null : publicProductStreamUrl(), () =>
    setRevision((value) => value + 1),
  );

  useEffect(() => {
    if (id) trackPageView();
  }, [id]);

  useEffect(() => {
    if (product?.id && !isVirtualWork) trackViewItem(product.id);
  }, [isVirtualWork, product?.id]);

  if (loading)
    return (
      <div className="product-detail-page__state">
        <RouteLoading scope="region" surface="public" label="正在加载作品" />
      </div>
    );
  if (!product && loadFailure)
    return (
      <div
        className="product-detail-page__state flex flex-col items-center justify-center gap-4 bg-white px-6 text-center"
      >
        <h1 className="font-display text-3xl font-normal tracking-[.04em]">作品暂时无法加载</h1>
        <p className="max-w-md text-sm leading-7 text-brand-muted" role="alert">
          当前无法取得作品信息。请检查网络后重新尝试，或先返回选款中心浏览其他作品。
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setWork(null);
              setRevision((value) => value + 1);
            }}
          >
            重新尝试
          </button>
          <Link
            to={catalogReturnUrl}
            className="inline-flex min-h-11 items-center text-sm text-brand-text underline underline-offset-4"
          >
            进入选款中心
          </Link>
        </div>
      </div>
    );
  if (!product)
    return (
      <div className="product-detail-page__state flex flex-col items-center justify-center gap-4 bg-white px-6 text-center">
        <h1 className="font-display text-3xl font-normal tracking-[.04em]">作品暂不可浏览</h1>
        <p className="text-brand-muted text-sm">该珠宝作品可能已下架，或尚未公开。</p>
        <Link
          to={catalogReturnUrl}
          className="inline-flex min-h-11 min-w-11 items-center justify-center text-brand-gold hover:underline text-sm"
        >
          进入选款中心
        </Link>
      </div>
    );

  // Product.price 是服务端派生展示价；选中 SKU 后只展示该 SKU 的成交价。
  const activeSkus = (Array.isArray(product.skus) ? product.skus : [])
    .filter((s) => s.isActive);
  // P1-33：缩略图与主图共享同一数据源，mainImage 驱动主图切换
  // （原主图恒渲染 getPrimaryImage，点击缩略图只改高亮、主图不变）
  const thumbnails = getThumbnailList(product.images, product.primaryImage);
  const skuOptions = activeSkus.map((sku) => {
    const material = getMaterialLabel(sku.material);
    const color = hasPublicFact(sku.color) ? sku.color!.trim() : "";
    const size = hasPublicFact(sku.size) ? sku.size!.trim() : "";
    const styleName = [material !== "其他" ? material : "", color, size].filter(Boolean).join(" · ");
    const weight = formatPublicGrams(sku.goldWeight);
    const imageIndex = thumbnails.findIndex((image) => image.id === sku.imageId);
    const image = thumbnails[imageIndex];
    return {
      sku,
      styleKey: JSON.stringify([sku.material, color, size]),
      styleName: styleName || "作品款式",
      weight,
      name: [styleName, weight].filter(Boolean).join(" · ") || "作品规格",
      imageIndex,
      imageUrl: image?.mediaUrl || image?.url || "",
      priceLabel: Number(sku.price) > 0 ? `¥${Number(sku.price).toLocaleString()}` : "价格待确认",
      statusLabel: sku.isAvailableForPurchase === true
        ? "可选择"
        : sku.isAvailableForPurchase === false ? "已售罄" : "库存待确认",
    };
  });
  const hasSkuColors = activeSkus.some((sku) => hasPublicFact(sku.color));
  const hasSkuImages = skuOptions.some((option) => option.imageUrl);
  const hasSkuWeights = skuOptions.some((option) => option.weight);
  const styles = new Map<string, typeof skuOptions>();
  for (const option of skuOptions) {
    const group = styles.get(option.styleKey);
    if (group) group.push(option);
    else styles.set(option.styleKey, [option]);
  }
  const splitStyles = [...styles.values()].some(
    (options) => new Set(options.map((option) => option.weight).filter(Boolean)).size > 1,
  );
  const activeStyle = styles.has(selectedStyle ?? "") ? selectedStyle : styles.size === 1
    ? skuOptions[0].styleKey : null;
  const visibleOptions = splitStyles ? styles.get(activeStyle ?? "") ?? [] : skuOptions;
  const selectedSku = visibleOptions.find(({ sku }) => sku.id === selectedSkuId)?.sku ?? null;
  const pickStyle = (key: string, imageIndex: number) => {
    if (activeStyle === key) return;
    setSelectedStyle(key);
    setSelectedSkuId(null);
    setPurchaseError("");
    setQty(1);
    if (hasSkuImages) {
      setMainImage(Math.max(0, imageIndex));
      setGalleryPanel("images");
    }
  };
  const selectSku = (option: (typeof skuOptions)[number]) => {
    if (option.sku.isAvailableForPurchase !== true) return;
    setSelectedSkuId(option.sku.id);
    setPurchaseError("");
    setQty(1);
    if (hasSkuImages) {
      const styleImage = styles.get(option.styleKey)?.find(({ imageIndex }) => imageIndex >= 0);
      setMainImage(option.imageIndex >= 0 ? option.imageIndex : styleImage?.imageIndex ?? 0);
      setGalleryPanel("images");
    }
  };
  const mainImageUrl =
    thumbnails[mainImage]?.mediaUrl ||
    thumbnails[mainImage]?.url ||
    (thumbnails.length > 0 ? getPrimaryImage(product) : "");
  const mainImageRecord = thumbnails[mainImage];
  const mainImageAlt = thumbnails.length > 1 ? `${publicTitle} · 第 ${mainImage + 1} 张作品图` : publicTitle;
  const mainSubjectFrame = subjectFrames[String(mainImageRecord?.id ?? "")];
  const stepGallery = (direction: number) => {
    setMainImage((index) => (index + direction + thumbnails.length) % thumbnails.length);
  };
  const beginGallerySwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || thumbnails.length < 2) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    if (!event.isPrimary) {
      galleryPointerStart.current = null;
      return;
    }
    galleryPointerStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const finishGallerySwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = galleryPointerStart.current;
    galleryPointerStart.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return;
    stepGallery(dx < 0 ? 1 : -1);
  };
  const startingPrice = Number(product.price) || 0;
  const displayPrice = selectedSku ? Number(selectedSku.price) : startingPrice;
  const customReferencePrice = product.salesMode === "CUSTOM_INQUIRY" ? Number(product.priceMin) : 0;
  const isDirectPurchase = product.salesMode === "DIRECT_PURCHASE";
  const isSingleUnit = product.inventoryPolicy === "SINGLE_UNIT";
  const availabilityKnown = typeof product.isAvailableForPurchase === "boolean";
  const isSoldOut = isDirectPurchase && product.isAvailableForPurchase === false;
  const canUseCart = canPrepareDirectPurchase(product.salesMode, cartEnabled);
  const availableSkus = activeSkus.filter((sku) => sku.isAvailableForPurchase === true);
  const allSkuAvailabilityKnown = activeSkus.every(
    (sku) => typeof sku.isAvailableForPurchase === "boolean",
  );
  let purchaseIssue: PurchaseIssue | null = null;
  if (isDirectPurchase && activeSkus.length === 0) {
    purchaseIssue = {
      actionLabel: "规格暂不可用",
      detail: "当前没有可选择的公开规格。",
      offerConsultation: true,
    };
  } else if (isDirectPurchase && availableSkus.length === 0) {
    purchaseIssue = allSkuAvailabilityKnown
      ? {
          actionLabel: "当前规格已售罄",
          detail: "当前公开规格均已售罄。",
          offerConsultation: true,
        }
      : {
          actionLabel: "规格库存待确认",
          detail: "当前规格的库存状态暂时无法确认。",
          offerConsultation: true,
        };
  } else if (isDirectPurchase && !selectedSku) {
    purchaseIssue = {
      actionLabel: "请先选择规格",
      detail: "请先选择可购买的规格。",
      offerConsultation: false,
    };
  } else if (isDirectPurchase && selectedSku?.isAvailableForPurchase !== true) {
    purchaseIssue = {
      actionLabel: selectedSku?.isAvailableForPurchase === false ? "所选规格已售罄" : "规格库存待确认",
      detail: selectedSku?.isAvailableForPurchase === false
        ? "所选规格已售罄，请改选其他可售规格。"
        : "所选规格的库存状态暂时无法确认。",
      offerConsultation: true,
    };
  } else if (isDirectPurchase && !(Number(selectedSku?.price) > 0)) {
    purchaseIssue = {
      actionLabel: "价格暂不可用",
      detail: "所选规格暂时没有有效公开价格。",
      offerConsultation: true,
    };
  }
  const canAddToCart =
    canUseCart &&
    product.isAvailableForPurchase === true &&
    selectedSku?.isAvailableForPurchase === true &&
    displayPrice > 0;
  const completionOpen = Boolean(commerceEnabled && commerceFlags?.paymentEnabled);
  const buyNowPath = canAddToCart && selectedSku && id && !isVirtualWork
    ? `/checkout?${new URLSearchParams({ product: id, sku: String(selectedSku.id), quantity: String(isSingleUnit ? 1 : qty) })}`
    : null;
  const canEnterCheckout = Boolean(
    canUseCart
    && product.isAvailableForPurchase === true
    && !isVirtualWork
    && commerceFlags
    && !commerceFlagsLoading
    && !commerceFlagsError
    && purchaseIssue?.offerConsultation !== true
  );
  const canChoosePurchaseQuantity =
    isDirectPurchase &&
    product.isAvailableForPurchase === true &&
    selectedSku?.isAvailableForPurchase === true &&
    displayPrice > 0;
  const purchaseGuidance = purchaseIssue?.detail ?? (
    commerceFlagsLoading ? "正在确认购买状态。"
    : !canUseCart ? "您可以先核对规格，或联系顾问了解购买方式。"
    : !completionOpen
      ? (isSignedIn
        ? "所选规格可以加入购物车。暂时不能提交订单或付款。"
        : "请登录后继续购买。暂时不能提交订单或付款。")
      : isSignedIn ? "所选规格可以加入购物车。"
      : "请登录后继续购买。"
  );
  const skuGoldLabels = activeSkus
    .map((sku) => formatPublicGrams(sku.goldWeight))
    .filter(Boolean);
  const uniqueSkuGoldLabels = [...new Set(skuGoldLabels)];
  const selectedGoldLabel = formatPublicGrams(selectedSku?.goldWeight);
  const productGoldLabel = formatPublicGrams(product.goldWeight);
  // 多规格金重不一致时，未选择前不回退到商品级金重，避免和规格按钮互相矛盾。
  const resolvedGoldLabel = selectedGoldLabel
    || (uniqueSkuGoldLabels.length === 1 ? uniqueSkuGoldLabels[0] : "")
    || (uniqueSkuGoldLabels.length === 0 ? productGoldLabel : "");
  const showPurchaseWeight = Boolean(resolvedGoldLabel);
  const selectedOption = selectedSku
    ? skuOptions.find((option) => option.sku.id === selectedSku.id) ?? null
    : null;
  const originalSummary =
    product.shortDescription?.trim() || product.description?.trim() || "";
  const hasDesignPreview = /3D\s*设计效果图/iu.test(originalSummary);
  const publicSummary = hasDesignPreview
    ? originalSummary.replace(/[\s·，,。]*3D\s*设计效果图[。.]?/iu, "").trim()
    : originalSummary;
  const detailBlocks = Array.isArray(product.detailContent)
    ? product.detailContent.filter((block) =>
        Boolean(block) && (block.type === "TEXT" || block.type === "IMAGE"),
      )
    : [];
  const materialLabel = getMaterialLabel(selectedSku?.material ?? product.materialType);
  const materialNote = typeof product.gemInfo?.materialNote === "string" ? product.gemInfo.materialNote.trim() : "";
  const resolvedGoldNumber = Number.parseFloat(resolvedGoldLabel);
  const productGoldNumber = Number.parseFloat(productGoldLabel);
  const numericTotalWeight = Number(product.weight);
  // 商品级金重与总重相同，只说明没有单独的总重事实；规格金重以 SKU 为准。
  const totalRepeatsProductGold = Number.isFinite(productGoldNumber)
    && Number.isFinite(numericTotalWeight)
    && productGoldNumber === numericTotalWeight;
  const hasDistinctTotalWeight = hasPublicFact(product.weight)
    && !totalRepeatsProductGold
    && (
      !resolvedGoldLabel
      || !Number.isFinite(resolvedGoldNumber)
      || !Number.isFinite(numericTotalWeight)
      || resolvedGoldNumber !== numericTotalWeight
    );
  const categoryId = product.category?.id;
  const categoryName = product.category?.name?.trim() ?? "";
  const seriesName = categoryName && categoryName !== displayTitle ? categoryName : "";
  const publicFacts = [
    { label: "商品编号", value: selectedSku?.skuCode?.trim() || product.code },
    { label: "类别", value: categoryName },
    { label: "材质", value: hasPublicFact(materialLabel) && materialLabel !== "其他" ? materialLabel : materialNote },
    ...gemPublicFacts(product.gemInfo),
    {
      label: "金重",
      value: resolvedGoldLabel,
    },
    {
      label: "总重",
      value: hasDistinctTotalWeight ? `${product.weight}g` : "",
    },
    ...publicStringList(product.craftTechnique)
      .map((craft) => ({ label: "工艺", value: craft })),
    hasPublicFact(product.packageType)
      ? { label: "包装", value: product.packageType!.trim() }
      : null,
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact?.value));
  const storyText = publicSummary && publicSummary !== seriesName ? publicSummary : "";
  const storyIsShort = Boolean(storyText) && storyText.length <= 18 && !/[。！？.!?]/u.test(storyText);
  const storyStem = storyText.replace(/系列$/, "");
  const storyRepeatsTitle = storyIsShort && Boolean(storyStem) && displayTitle.includes(storyStem);
  const storyLabel = storyIsShort && !storyRepeatsTitle ? storyText : "";
  const storyBody = storyIsShort ? "" : storyText;
  const validCertificates = (Array.isArray(product.certificates) ? product.certificates : [])
    .filter(isPublishableCertificate);
  const currentSize = hasPublicFact(selectedSku?.size)
    ? selectedSku!.size!.trim()
    : !selectedSku && hasPublicFact(product.size)
      ? product.size!.trim()
      : "";
  const deliveryMethods = publicStringList(product.deliveryMethods)
    .map((method) => DELIVERY_METHOD_LABELS[method])
    .filter((method): method is string => Boolean(method));
  const hasDeclaredLogistics = deliveryMethods.length > 0 || product.dispatchTime === "CUSTOM";
  const serviceFacts = (isDirectPurchase && hasDeclaredLogistics ? [
    product.fulfillmentType
      ? { label: "履约方式", value: FULFILLMENT_LABELS[product.fulfillmentType] }
      : null,
    product.dispatchTime
      ? { label: "发出时间", value: DISPATCH_TIME_LABELS[product.dispatchTime] }
      : null,
    product.dispatchTime === "CUSTOM" && hasPublicFact(product.customLeadTime)
      ? { label: "制作周期", value: product.customLeadTime!.trim() }
      : null,
    deliveryMethods.length > 0
      ? { label: "交付方式", value: deliveryMethods.join("、") }
      : null,
    product.requiresInsuredShipping === true
      ? { label: "运输", value: "需要保价运输" }
      : null,
    product.requiresSignature === true
      ? { label: "签收", value: "需要签收确认" }
      : null,
  ] : []);
  if (validCertificates.length > 0) {
    serviceFacts.push({ label: "证书", value: `${validCertificates.length} 份已登记有效证书` });
  }
  const visibleServiceFacts = serviceFacts.filter((fact): fact is { label: string; value: string } => Boolean(fact?.value));
  const hasSkuSizeFact = isDirectPurchase
    && activeSkus.some((sku) => hasPublicFact(sku.size));
  const showSizeConsultation = !currentSize && !hasSkuSizeFact;
  const sizeFactValue = currentSize || "选择规格后查看对应尺寸";
  const parameterPreview = [
    ...(currentSize ? [{ label: "尺寸", value: currentSize }] : []),
    ...publicFacts,
  ].slice(0, 3);
  const showParameterPreview = galleryPanel === "parameters" && parameterPreview.length > 0 && Boolean(mainImageUrl);
  const showGalleryPreview = showParameterPreview;
  const decisionNote = isDirectPurchase
    ? "购买前请核对所选规格与尺寸；页面未列明的费用、交付时间或服务不作推定。"
    : "页面未列明的费用、交期或服务不作推定。";
  const sameCategoryHref = typeof categoryId === "number"
    && Number.isInteger(categoryId)
    && categoryId > 0
    && categoryName
    ? `/catalog?category=${categoryId}`
    : null;

  const handleAddToCart = async () => {
    if (addPendingRef.current || addingToCart) return;
    setPurchaseError("");
    if (!canUseCart) {
      setPurchaseError("购买服务当前未开放，请通过珠宝顾问咨询。");
      return;
    }
    if (!availabilityKnown) {
      setPurchaseError("库存状态暂时无法确认，请刷新后重试。");
      return;
    }
    if (isSoldOut) {
      setPurchaseError("该作品已售罄，仍可浏览作品信息。");
      return;
    }
    if (!canAddToCart || !selectedSku || !isSignedIn || isVirtualWork) {
      setPurchaseError("请先选择可购买的商品规格。");
      return;
    }

    const operation = cartOperationRef.current + 1;
    cartOperationRef.current = operation;
    const requestContext = {
      routeId: id ?? null,
      productId: product.id,
      customerId,
    };
    const isCurrentOperation = () => {
      const current = activeInteractionRef.current;
      return cartOperationRef.current === operation
        && current.routeId === requestContext.routeId
        && current.productId === requestContext.productId
        && current.customerId === requestContext.customerId;
    };
    addPendingRef.current = true;
    setAddingToCart(true);
    try {
      await cartApi.add({
        productId: product.id,
        skuId: selectedSku.id,
        quantity: isSingleUnit ? 1 : qty,
      });
      if (!isCurrentOperation()) return;
      trackAddToCart(product.id, isSingleUnit ? 1 : qty);
      message.success("已加入购物车");
    } catch (error: unknown) {
      if (!isCurrentOperation()) return;
      const reason = getRequestErrorMessage(error, "加入购物车失败，请稍后重试");
      setPurchaseError(reason);
      message.error(reason);
    } finally {
      if (isCurrentOperation()) {
        addPendingRef.current = false;
        setAddingToCart(false);
      }
    }
  };

  return (
    <div className="product-detail-page bg-white text-[#181A1B]" data-sales-mode={product.salesMode}>
      <div className="product-detail-page__inner">
        <nav aria-label="面包屑" className="product-detail-page__breadcrumb font-sans text-brand-muted">
          <Link to="/">首页</Link>
          <span aria-hidden="true">/</span>
          <Link to={catalogReturnUrl}>选款中心</Link>
          <span aria-hidden="true">/</span>
          <span>{displayTitle}</span>
        </nav>
        <div className="product-detail-page__layout">
          <div className="product-detail-page__reading">
          {/* Left: Images */}
          <div className="product-detail-page__gallery" id="product-media">
            <div className="product-detail-page__stage">
            <div className="product-detail-page__plate">
            <div
              key={showParameterPreview ? "parameters" : "images"}
              data-product-main-media-id={
                showGalleryPreview ? undefined : thumbnails[mainImage]?.id ?? ""
              }
              className="product-detail-page__main-media"
              data-design-preview={hasDesignPreview || undefined}
              onPointerDown={showGalleryPreview ? undefined : beginGallerySwipe}
              onPointerUp={showGalleryPreview ? undefined : finishGallerySwipe}
              onPointerCancel={() => { galleryPointerStart.current = null; }}
              onPointerEnter={mainImageUrl && !showGalleryPreview ? trackProductDetailZoom : undefined}
              onPointerMove={mainImageUrl && !showGalleryPreview ? trackProductDetailZoom : undefined}
              onPointerLeave={mainImageUrl ? clearProductDetailZoom : undefined}
            >
              {showParameterPreview ? (
                <section className="product-detail-page__parameter-preview" aria-labelledby="product-parameter-preview-title">
                  <h2 id="product-parameter-preview-title" ref={parameterPreviewHeadingRef} tabIndex={-1}>参数快览</h2>
                  <dl>
                    {parameterPreview.map(({ label, value }, index) => (
                      <div key={`${label}-${index}`}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <button type="button" onClick={() => {
                    const heading = specificationsHeadingRef.current;
                    heading?.focus({ preventScroll: true });
                    heading?.scrollIntoView();
                  }}>查看完整参数 <ArrowRightOutlined aria-hidden="true" /></button>
                </section>
              ) : mainImageUrl ? (
                <SecureImage
                  key={mainImageUrl}
                  src={withPublicMediaWidth(mainImageUrl, 1200)}
                  alt={mainImageAlt}
                  className="product-detail-page__photo"
                  srcSet={buildProductImageSrcSet(mainImageUrl)}
                  sizes="(max-width: 900px) calc(100vw - 40px), (max-width: 1200px) 50vw, 544px"
                  width={mainImageRecord?.width ?? undefined}
                  height={mainImageRecord?.height ?? undefined}
                  style={mainSubjectFrame ? {
                    objectViewBox: mainSubjectFrame.objectViewBox,
                  } as CSSProperties & { objectViewBox?: string } : undefined}
                  priority
                />
              ) : (
                <span className="text-sm text-brand-muted">图片暂不可用</span>
              )}
              {mainImageUrl && !showGalleryPreview ? (
                <>
                  <div className="product-detail-page__zoom-lens" aria-hidden="true" />
                  {thumbnails.length > 1 ? <ProductImageSteps onStep={stepGallery} /> : null}
                </>
              ) : null}
            </div>
            {mainImageUrl ? (
              <div className="product-detail-page__gallery-controls">
                {hasDesignPreview && !showGalleryPreview ? (
                  <p className="product-detail-page__gallery-caption">3D 设计效果图</p>
                ) : null}
                {thumbnails.length > 1 && !showGalleryPreview ? (
                  <span className="sr-only" aria-live="polite">第 {mainImage + 1} 张，共 {thumbnails.length} 张作品图</span>
                ) : null}
                {showParameterPreview || parameterPreview.length > 0 ? (
                  <div className="product-detail-page__media-switcher" role="group" aria-label="切换作品内容">
                    {showParameterPreview ? (
                      <button
                        type="button"
                        onClick={() => {
                          parameterSwitchRef.current?.focus();
                          setGalleryPanel("images");
                        }}
                      >返回图集</button>
                    ) : null}
                    {parameterPreview.length > 0 ? (
                      <button
                        ref={parameterSwitchRef}
                        type="button"
                        aria-pressed={showParameterPreview}
                        onClick={() => setGalleryPanel("parameters")}
                      >参数</button>
                    ) : null}
                  </div>
                ) : null}
                {!showGalleryPreview ? (
                  <ProductImagePreview
                    key={workKey}
                    src={buildDetailZoomSrc(mainImageUrl)}
                    alt={mainImageAlt}
                    onStep={thumbnails.length > 1 ? stepGallery : undefined}
                  />
                ) : null}
              </div>
            ) : null}
            {thumbnails.length > 1 ? (
              <div className="product-detail-page__thumbnails" role="group" aria-label="选择作品视角">
                {thumbnails.map((img, i) => {
                  const src = img.mediaUrl || img.url || "";
                  const frame = subjectFrames[mediaIdFromUrl(src)];
                  return (
                    <button
                      type="button"
                      key={img.id}
                      onClick={() => {
                        setMainImage(i);
                        setGalleryPanel("images");
                      }}
                      aria-label={`查看第 ${i + 1} 张作品图`}
                      aria-pressed={i === mainImage}
                      className={`product-detail-page__thumbnail ${i === mainImage ? "is-active" : ""}`}
                    >
                      <SecureImage
                        src={withPublicMediaWidth(src, 480)}
                        alt=""
                        className="product-detail-page__thumbnail-photo"
                        style={frame ? {
                          objectViewBox: frame.objectViewBox,
                        } as CSSProperties & { objectViewBox?: string } : undefined}
                        deferUntilVisible
                      />
                    </button>
                  );
                })}
              </div>
            ) : null}
            </div>
            {mainImageUrl && !showGalleryPreview ? (
              <div className="product-detail-page__zoom-pane" aria-hidden="true">
                <div className="product-detail-page__zoom-photo-frame">
                  <SecureImage
                    key={mainImageUrl}
                    src={buildDetailZoomSrc(mainImageUrl)}
                    alt=""
                    className="product-detail-page__zoom-photo"
                    width={mainImageRecord?.width ?? undefined}
                    height={mainImageRecord?.height ?? undefined}
                    style={mainSubjectFrame ? {
                      objectViewBox: mainSubjectFrame.objectViewBox,
                    } as CSSProperties & { objectViewBox?: string } : undefined}
                  />
                </div>
              </div>
            ) : null}
            </div>
          </div>

        {publicFacts.length > 0 || currentSize || hasSkuSizeFact || isDirectPurchase || visibleServiceFacts.length > 0 ? (
          <div className="product-detail-page__details-grid" id="product-specifications">
            {publicFacts.length > 0 || currentSize || hasSkuSizeFact ? (
              <section className="product-detail-page__specifications" aria-labelledby="product-specifications-title">
                <h2 id="product-specifications-title" ref={specificationsHeadingRef} tabIndex={-1}>
                  参数
                </h2>
                {publicFacts.length > 0 ? (
                  <dl className="product-detail-page__facts-grid">
                    {publicFacts.map((fact, index) => (
                      <div key={`${fact.label}-${fact.value}-${index}`}>
                        <dt>{fact.label}</dt>
                        <dd>{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {currentSize || hasSkuSizeFact ? (
                  <section className="product-detail-page__fit" aria-labelledby="product-fit-title">
                    <h3 id="product-fit-title">尺寸与佩戴</h3>
                    <p>{sizeFactValue}</p>
                    <Link to={publicProductInquiryPath(product, "purchase-support")}>联系珠宝顾问确认尺寸</Link>
                  </section>
                ) : null}
              </section>
            ) : null}
            {isDirectPurchase || visibleServiceFacts.length > 0 ? (
              <section className="product-detail-page__decision-panel" aria-labelledby="product-decision-title">
                <h2 id="product-decision-title">选购与服务信息</h2>
                <dl className="product-detail-page__decision-facts">
                  {isDirectPurchase ? (
                    <div>
                      <dt>价格</dt>
                      <dd>
                        {selectedSku
                          ? "当前显示所选规格的公开价格。"
                          : "当前显示有效规格的最低公开价格，选择规格后显示该规格价格。"}
                      </dd>
                    </div>
                  ) : null}
                  {visibleServiceFacts.map((fact) => (
                    <div key={`${fact.label}-${fact.value}`}>
                      <dt>{fact.label}</dt>
                      <dd>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="product-detail-page__decision-note">{decisionNote}</p>
                <div className="product-detail-page__services">
                  <details className="product-detail-page__service" open>
                    <summary>商品咨询</summary>
                    <p>如需核对规格、尺寸或购买方式，可联系珠宝顾问。页面未列明的费用与交期不作推定。</p>
                    <Link to={publicProductInquiryPath(product, "purchase-support")}>联系珠宝顾问</Link>
                  </details>
                  <details className="product-detail-page__service">
                    <summary>保养与维修</summary>
                    <p>可说明保养或维修需求。是否承接、费用与时间，以实际评估为准。</p>
                    <Link to="/contact">前往联系与咨询</Link>
                  </details>
                  {isSignedIn ? (
                    <details className="product-detail-page__service">
                      <summary>订单售后</summary>
                      <p>已购作品的退款或售后，在账户订单中按实际状态申请。</p>
                      <Link to="/customer?section=orders">查看订单</Link>
                    </details>
                  ) : null}
                </div>
              </section>
            ) : null}

          </div>
        ) : null}
        {storyBody || detailBlocks.length > 0 ? (
          <section className="product-detail-page__content product-detail-page__editorial" id="product-detail-content" aria-labelledby="product-detail-content-title">
            <h2 id="product-detail-content-title">作品与工艺</h2>
            {storyBody ? <p className="product-detail-page__editorial-copy">{storyBody}</p> : null}
            {detailBlocks.map((block, index) => {
              if (block.type === "TEXT") {
                return block.text ? (
                  <p key={`detail-text-${index}`} className="product-detail-page__editorial-copy">
                    {block.text}
                  </p>
                ) : null;
              }
              const image = product.images?.find((item) => item.id === block.imageId);
              const src = image?.mediaUrl || image?.url;
              return src ? (
                <SecureImage
                  key={`detail-image-${index}`}
                  src={withPublicMediaWidth(src, 1200)}
                  srcSet={buildProductImageSrcSet(src)}
                  sizes="(max-width: 1000px) calc(100vw - 40px), 960px"
                  width={image?.width ?? undefined}
                  height={image?.height ?? undefined}
                  alt={block.alt || `${publicTitle} 详情图 ${index + 1}`}
                  className="product-detail-page__editorial-photo"
                  deferUntilVisible
                />
              ) : null;
            })}
          </section>
        ) : null}
          </div>
          {/* Right: Info */}
          <div className="product-detail-page__summary">
            <div className="product-detail-page__meta-line">
              {seriesName ? <p className="product-detail-page__series">{seriesName}</p> : null}
              <p className="product-detail-page__reference">款号 {product.code}</p>
            </div>
            <div className="product-detail-page__heading">
              <h1 className="product-detail-page__title">
                {displayTitle}
              </h1>
              {!isVirtualWork ? (
                isSignedIn ? (
                  <button
                    type="button"
                    onClick={handleToggleFavorite}
                    disabled={favBusy}
                    className="product-detail-page__favorite"
                    title={favorited ? "已加入心愿单" : "加入心愿单"}
                  >
                    {favorited ? <HeartFilled /> : <HeartOutlined />}
                    <span className="sr-only">{favorited ? "已加入心愿单" : "加入心愿单"}</span>
                  </button>
                ) : (
                  <Link
                    to={`/customer?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`}
                    className="product-detail-page__favorite"
                    title="登录后加入心愿单"
                  >
                    <HeartOutlined />
                    <span className="sr-only">登录后加入心愿单</span>
                  </Link>
                )
              ) : null}
            </div>
            {storyLabel ? <p className="product-detail-page__subtitle">{storyLabel}</p> : null}
            {isVirtualWork ? (
              <p className="mb-4 text-sm leading-7 text-brand-muted">演示款式，不是在售作品。</p>
            ) : null}

            <section
              className="product-detail-page__purchase-panel"
              aria-label={isDirectPurchase ? "购买信息" : "作品服务"}
            >
            {/* 只显示来自公开事实源的非空事实，不以 0 或破折号填充。 */}
            {showPurchaseWeight || (isDirectPurchase && displayPrice > 0) || customReferencePrice > 0 ? (
              <dl className="product-detail-page__commerce-facts">
                {isDirectPurchase && displayPrice > 0 ? (
                  <>
                    <dt className="is-price">售价</dt>
                    <dd className="is-price" aria-live="polite">
                      ¥{displayPrice.toLocaleString()}
                      {!selectedSku ? <span>起</span> : null}
                    </dd>
                  </>
                ) : null}
                {customReferencePrice > 0 ? (
                  <>
                    <dt className="is-price">定制参考起价</dt>
                    <dd className="is-price">¥{customReferencePrice.toLocaleString()}<span>起</span></dd>
                  </>
                ) : null}
                {showPurchaseWeight ? (
                  <>
                    <dt>金重</dt>
                    <dd>{resolvedGoldLabel}</dd>
                  </>
                ) : null}
              </dl>
            ) : null}
            {selectedOption ? (
              <p className="product-detail-page__availability" role="status">
                {selectedOption.sku.isAvailableForPurchase === true
                  ? "当前规格可购买"
                  : selectedOption.sku.isAvailableForPurchase === false
                    ? "当前规格已售罄"
                    : "库存待确认"}
              </p>
            ) : null}
            {customReferencePrice > 0 ? (
              <p className="product-detail-page__decision-note">最终金额在确认定制方案后报价。</p>
            ) : null}
            {isDirectPurchase && splitStyles && styles.size > 1 ? (
              <fieldset className="product-detail-page__sku-picker">
                <legend className="product-detail-page__section-label">款式</legend>
                <div className="product-detail-page__sku-cards">
                  {[...styles].map(([key, options]) => {
                    const image = options.find((option) => option.imageUrl);
                    return (
                      <label className="product-detail-page__sku-card" key={key}>
                        <input
                          className="sr-only"
                          type="radio"
                          name="product-style"
                          checked={activeStyle === key}
                          disabled={addingToCart}
                          onChange={() => pickStyle(key, image?.imageIndex ?? -1)}
                        />
                        {image ? <SecureImage src={withPublicMediaWidth(image.imageUrl, 480)} alt="" deferUntilVisible /> : null}
                        <span>{options[0].styleName}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            {isDirectPurchase && visibleOptions.length > 0 ? (
              <fieldset className="product-detail-page__sku-picker">
                <legend className="product-detail-page__section-label">
                  {splitStyles || (styles.size === 1 && visibleOptions.every(({ styleName, weight }) => styleName === "作品款式" && weight))
                    ? "金重"
                    : hasSkuColors ? "款式与颜色" : "款式规格"}
                </legend>
                <div className="product-detail-page__sku-cards">
                  {visibleOptions.map((option) => {
                    const { sku, name, imageUrl, priceLabel, statusLabel, weight } = option;
                    const weightOnly = splitStyles && styles.size > 1;
                    const label = weightOnly ? weight || "金重未标注" : name;
                    const hasDuplicateLabel = visibleOptions.some((other) =>
                      other.sku.id !== sku.id && (weightOnly ? other.weight === weight : other.name === name)
                    );
                    return (
                      <label className="product-detail-page__sku-card" key={sku.id}>
                        <input
                          className="sr-only"
                          type="radio"
                          name="product-sku"
                          value={sku.id}
                          checked={sku.id === selectedSkuId}
                          disabled={addingToCart || sku.isAvailableForPurchase !== true}
                          onChange={() => selectSku(option)}
                        />
                        {imageUrl && !weightOnly ? <SecureImage src={withPublicMediaWidth(imageUrl, 480)} alt="" deferUntilVisible /> : null}
                        <span>
                          <span>{label}{hasDuplicateLabel ? ` · ${sku.skuCode}` : ""}</span>
                          <small>{priceLabel} · {statusLabel}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="sr-only" role="status">
                  {selectedSku ? `已选 ${skuOptions.find(({ sku }) => sku.id === selectedSku.id)?.name}` : null}
                </p>
              </fieldset>
            ) : isDirectPurchase && splitStyles ? (
              <p className="product-detail-page__section-label">先选择款式，再选择对应金重。</p>
            ) : null}

            {showSizeConsultation ? (
              <p className="product-detail-page__consultation-note">可向顾问了解材质与尺寸。</p>
            ) : null}

            {isDirectPurchase ? (
              <section className="product-detail-page__purchase-guidance" aria-labelledby="product-purchase-guidance-title">
                <h2 id="product-purchase-guidance-title">下单提示</h2>
                <p aria-live="polite">{purchaseGuidance}</p>
              </section>
            ) : null}

            {/* 数量控制与 SalesMode 唯一主行动分层呈现。 */}
            {canChoosePurchaseQuantity ? (
              <div className="product-detail-page__quantity-block">
                <p className="product-detail-page__section-label">
                  {isSingleUnit ? "购买数量（一物一件）" : "购买数量"}
                </p>
                <div className="product-detail-page__quantity" aria-label={isSingleUnit ? "一物一件，数量固定为 1" : "购买数量"}>
                  <button
                    type="button"
                    aria-label="减少数量"
                    disabled={qty <= 1 || isSingleUnit}
                    onClick={() => setQty(Math.max(1, qty - 1))}
                  >
                    −
                  </button>
                  <span aria-live="polite">{qty}</span>
                  <button
                    type="button"
                    aria-label="增加数量"
                    disabled={isSingleUnit || qty >= 99}
                    onClick={() => setQty(Math.min(99, qty + 1))}
                  >
                    +
                  </button>
                </div>
                <small>{isSingleUnit ? "该作品每次最多购买 1 件。" : "可购数量以提交时的库存为准。"}</small>
              </div>
            ) : null}
            <div className="product-detail-page__action-zone" data-pinned={canUseCart && product.isAvailableForPurchase === true}>
              <ProductPrimaryAction
                product={product}
                selectedSku={selectedSku}
                commerceFlags={commerceFlags}
                commerceFlagsLoading={commerceFlagsLoading}
                commerceFlagsError={commerceFlagsError}
                onRetryCommerceFlags={reloadCommerceFlags}
                canUseCart={canUseCart}
                canAddToCart={canAddToCart}
                purchaseIssue={purchaseIssue}
                addingToCart={addingToCart}
                isSignedIn={isSignedIn}
                isSelected={isSelected}
                onToggleSelection={() => {
                  const result = toggleSelection(product.id);
                  if (result === "unavailable") return;
                  if (result === "limit") {
                    message.warning("每次最多选择 20 款作品");
                    return;
                  }
                  if (isSelected) trackRemoveFromSelection(product.id);
                  else trackAddToSelection(product.id);
                }}
                onAddToCart={handleAddToCart}
                buyNowPath={buyNowPath}
                canCheckout={canEnterCheckout}
              />
            </div>
            {isSingleUnit && isDirectPurchase ? (
              <p className="product-detail-page__status-copy text-xs leading-6 text-brand-muted">
                一物一件，每位顾客的购物车最多保留 1 件。
              </p>
            ) : null}
            {isSoldOut ? (
              <p className="product-detail-page__status-copy text-sm leading-6 text-brand-muted" role="status">
                该作品已售罄，仍可继续浏览作品信息或
                <Link to={publicProductInquiryPath(product, "purchase-support")}>联系珠宝顾问</Link>。
              </p>
            ) : null}
            {isDirectPurchase && !availabilityKnown ? (
              <p className="product-detail-page__status-copy text-sm leading-6 text-brand-muted" role="status">
                作品库存状态暂时无法确认，您可以
                <Link to={publicProductInquiryPath(product, "purchase-support")}>联系珠宝顾问</Link>核对。
              </p>
            ) : null}
            {isDirectPurchase && availabilityKnown && !isSoldOut && canUseCart && purchaseIssue?.offerConsultation ? (
              <p className="product-detail-page__status-copy text-sm leading-6 text-brand-muted" role="status">
                如需进一步确认，您可以
                <Link to={publicProductInquiryPath(product, "purchase-support")}>联系珠宝顾问</Link>核对。
              </p>
            ) : null}
            {purchaseError ? (
              <p className="product-detail-page__status-copy text-sm leading-6 text-[#8C3F3B]" role="alert">
                {purchaseError}
              </p>
            ) : null}
            {isDirectPurchase ? (
              <Link
                className="product-detail-page__advisor"
                to={publicProductInquiryPath(product, "purchase-support")}
              >
                联系珠宝顾问
              </Link>
            ) : null}
            </section>

          </div>

        </div>
            <nav className="product-detail-page__content-nav" aria-label="作品详情内容">
              <a href="#product-media">作品图集</a>
              {publicFacts.length > 0 || currentSize || hasSkuSizeFact || isDirectPurchase || visibleServiceFacts.length > 0 ? (
                <a href="#product-specifications">参数信息</a>
              ) : null}
              {storyBody || detailBlocks.length > 0 ? <a href="#product-detail-content">作品与工艺</a> : null}
              {validCertificates.length > 0 || Boolean(reviewsData?.total) ? <a href="#product-proof">证书与评价</a> : null}
              {sameCategoryHref && categoryId ? <a href="#product-related">同类作品</a> : null}
            </nav>
            {/* 证书和评价只在有真实内容时提供。 */}
            {validCertificates.length > 0 || Boolean(reviewsData?.total) ? (
              <section id="product-proof" className="product-detail-page__proof" aria-label="证书与评价">
                <Tabs
                  items={[
                ...(validCertificates.length > 0 ? [{
                  key: "cert",
                  label: (
                    <span className="font-sans text-xs tracking-[.1em]">
                      证书
                    </span>
                  ),
                  children: validCertificates.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-3 p-4 bg-brand-bg"
                      >
                        <SafetyCertificateOutlined className="text-brand-gold text-lg" />
                        <span className="text-sm">
                          {c.certType === "NATIONAL"
                            ? "国检证书"
                            : c.certType === "GIA"
                              ? "GIA证书"
                              : "证书"}{" "}
                          — {c.certNumber}
                        </span>
                      </div>
                    )),
                }] : []),
                ...(reviewsData && reviewsData.total > 0 ? [{
                  key: "reviews",
                  label: (
                    <span className="font-sans text-xs tracking-[.1em]">
                      评价
                    </span>
                  ),
                  children: <ProductReviewsTab data={reviewsData} />,
                }] : []),
                  ]}
                />
              </section>
            ) : null}
            {sameCategoryHref && categoryId ? (
              <RelatedWorks key={categoryId} categoryId={categoryId} productId={product.id} catalogUrl={sameCategoryHref} />
            ) : null}
      </div>
    </div>
  );
}
