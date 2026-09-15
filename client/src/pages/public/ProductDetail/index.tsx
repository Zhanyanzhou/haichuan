// 作品详情：公开安全字段/灯箱/SKU/收藏/评价 Tab(晒单)/相似推荐/SEO meta
import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { App as AntdApp, Tabs, Spin, Rate } from "antd";
import {
  ShoppingCartOutlined,
  SafetyCertificateOutlined,
  HeartOutlined,
  HeartFilled,
} from "@ant-design/icons";
import { getMaterialLabel } from "@/utils/material";
import { getPrimaryImage, getThumbnailList, getListingImage } from "@/utils/productImage";
import { SecureImage } from "@/components/common/SecureImage";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import {
  cartApi,
  customerApi,
  productApi,
  publicProductStreamUrl,
  goldPriceApi,
  reviewApi,
  recommendationApi,
} from "@/services/api";
import { USE_MOCK } from "@/services/mockData";
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
  isCommerceAllowed,
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
import { getRequestErrorMessage, requestStatus } from "@/services/httpClient";

const productSchemaOrigin = normalizePublicSiteOrigin(
  import.meta.env.VITE_PUBLIC_SITE_ORIGIN,
  { allowHttp: import.meta.env.DEV },
);

const RESPONSIVE_PRODUCT_IMAGE_WIDTHS = [480, 800, 1200] as const;

function buildProductImageSrcSet(src: string): string | undefined {
  if (!src.includes("/media/")) return undefined;
  try {
    const absolute = /^[a-z][a-z\d+.-]*:/i.test(src);
    const parsed = new URL(src, "https://public-media.local");
    return RESPONSIVE_PRODUCT_IMAGE_WIDTHS.map((width) => {
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

/** 相似作品推荐（同分类/材质+热度加权；recommendations 模块首次接线启用） */
type SimilarProduct = Pick<
  Product,
  "id" | "code" | "name" | "price" | "images" | "primaryImage" | "listingImage"
>;

function SimilarProducts({ productId }: { productId: number }) {
  const [list, setList] = useState<SimilarProduct[]>([]);

  useEffect(() => {
    let cancelled = false;
    setList([]);
    recommendationApi
      .getSimilar(productId, 8)
      .then((res: unknown) => {
        if (!cancelled) setList(unwrapResponse<SimilarProduct[]>(res) || []);
      })
      .catch(() => {
        if (!cancelled) setList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (list.length === 0) return null;
  return (
    <div className="mt-12 pt-8 border-t border-brand-line">
      <p className="text-xs tracking-[.15em] uppercase text-brand-gold mb-5 font-sans">
        相关作品
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        {list.map((item) => (
          <Link key={item.id} to={publicProductPath(item)} className="group">
            <div className="aspect-square bg-brand-bg overflow-hidden">
              <SecureImage
                src={getListingImage(item)}
                alt={item.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <p className="text-sm mt-2 truncate group-hover:text-brand-gold transition-colors">
              {item.name}
            </p>
            {item.price != null && Number(item.price) > 0 ? (
              <p className="text-sm text-brand-gold mt-1">
                ¥{Number(item.price).toLocaleString()}
              </p>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
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
                  <img
                    key={url}
                    src={url}
                    alt="买家晒单"
                    loading="lazy"
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

function ProductPrimaryAction({
  product,
  selectedSku,
  commerceFlags,
  commerceFlagsLoading,
  canUseCart,
  canAddToCart,
  addingToCart,
  isSignedIn,
  isSelected,
  onToggleSelection,
  onAddToCart,
}: {
  product: Product;
  selectedSku: ProductSKU | null;
  commerceFlags: { commerceEnabled: boolean; cartEnabled: boolean } | null;
  commerceFlagsLoading: boolean;
  canUseCart: boolean;
  canAddToCart: boolean;
  addingToCart: boolean;
  isSignedIn: boolean;
  isSelected: boolean;
  onToggleSelection: () => void;
  onAddToCart: () => void;
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
    return <Link to={publicProductInquiryPath(product, "custom")} className={`${primaryClass} text-center`}>咨询此款定制</Link>;
  }

  if (product.salesMode !== "DIRECT_PURCHASE") {
    return <Link to={publicProductInquiryPath(product, "product")} className={`${primaryClass} text-center`}>咨询此款作品</Link>;
  }

  if (commerceFlagsLoading || !commerceFlags) {
    return <button type="button" className={primaryClass} disabled>正在确认购买状态</button>;
  }
  if (product.isAvailableForPurchase === false) {
    return <button type="button" className={primaryClass} disabled>已售罄</button>;
  }
  if (typeof product.isAvailableForPurchase !== "boolean") {
    return <button type="button" className={primaryClass} disabled>库存状态暂不可用</button>;
  }
  if (!canUseCart) {
    return <Link to={publicProductInquiryPath(product, "purchase-support")} className={`${primaryClass} text-center`}>购买暂未开放，联系顾问</Link>;
  }
  if (!isSignedIn) {
    return (
      <Link
        to="/customer"
        state={{ returnTo: publicProductPath(product) }}
        className={`${primaryClass} text-center`}
      >
        登录后购买
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={primaryClass}
      onClick={onAddToCart}
      disabled={addingToCart || !canAddToCart || !selectedSku}
    >
      <ShoppingCartOutlined /> {addingToCart ? "加入中..." : "加入购物车"}
    </button>
  );
}

export default function ProductDetail() {
  const { message } = AntdApp.useApp();
  const { id } = useParams();
  const reduceMotion = useReducedMotion();
  const setPageMeta = usePageMetaStore((s) => s.setMeta);
  const clearPageMeta = usePageMetaStore((s) => s.clear);
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [loadFailure, setLoadFailure] = useState<"not-found" | "error" | null>(null);
  const [qty, setQty] = useState(1);
  const [selectedSku, setSelectedSku] = useState<ProductSKU | null>(null);
  const [mainImage, setMainImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [addingToCart, setAddingToCart] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");
  const [reviewsData, setReviewsData] = useState<PublicReviewsData | null>(null);
  const addPendingRef = useRef(false);
  const [goldPrice, setGoldPrice] = useState<{
    price?: number | string;
  } | null>(null);
  const { flags: commerceFlags, loading: commerceFlagsLoading } =
    useCommerceCapabilities();
  const commerceEnabled = commerceFlags?.commerceEnabled ?? false;
  const cartEnabled = commerceFlags?.cartEnabled ?? false;
  const isSignedIn = useCustomerAuthStore((state) => state.isLoggedIn);
  const productAudience = isSignedIn ? "member" : "public";
  // 心愿单仅对登录客户启用；游客仍可浏览公开安全字段。
  const [favorited, setFavorited] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const toggleSelection = useSelectionStore((state) => state.toggle);
  const isSelected = useSelectionStore((state) =>
    product ? state.selectedIds.has(product.id) : false,
  );

  // 初始收藏态：拉一次心愿单判断当前作品是否在列（心愿单量级小，整表判断成本可忽略）。
  // 登录墙 return 之前 hooks 已执行，必须显式判断登录态，避免游客每次必发一个注定 401 的请求。
  useEffect(() => {
    let cancelled = false;
    setFavorited(false);
    if (!product?.id || !isSignedIn) return undefined;
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
  }, [product?.id, isSignedIn]);

  const handleToggleFavorite = async () => {
    if (favBusy || !product?.id) return;
    setFavBusy(true);
    // 乐观更新，失败回滚
    const next = !favorited;
    setFavorited(next);
    try {
      const res = await customerApi.toggleFavorite(product.id);
      const result = unwrapResponse<{ favorited: boolean }>(res);
      setFavorited(Boolean(result?.favorited));
      message.success(result?.favorited ? "已加入心愿单" : "已移出心愿单");
    } catch (error: unknown) {
      setFavorited(!next);
      message.error(getRequestErrorMessage(error, "操作失败，请稍后重试"));
    } finally {
      setFavBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) {
        setProduct(null);
        setLoadFailure("not-found");
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadFailure(null);
      try {
        const res = await productApi.getPublicById(id, { suppressGlobalError: true });
        const data = unwrapResponse<Product>(res);
        if (cancelled) return;
        setProduct(data || null);
        setLoadFailure(data ? null : "not-found");
        setMainImage(0);
        setSelectedSku(data?.skus?.find((s) => s.isActive) ?? null);
        setQty(1);
        setPurchaseError("");
      } catch (error) {
        if (!cancelled) {
          setProduct(null);
          setLoadFailure(requestStatus(error) === 404 ? "not-found" : "error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id, productAudience, revision]);

  useEffect(() => {
    if (!product?.id) {
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
  }, [product?.id]);

  // SEO：商品详情独立标题（不泄露内部编号；未加载时不设误导标题）
  useEffect(() => {
    if (product?.name) {
      setPageMeta({
        title: `${product.name} | 海川珠宝`,
        description: product.shortDescription || undefined,
        // og:image / twitter:image：分享到微信/微博/小红书时展示作品主图
        image: getPrimaryImage(product) || undefined,
        canonicalPath: publicProductPath(product),
      });
    } else if (!loading) {
      setPageMeta({
        title: loadFailure === "error"
          ? "作品暂时无法加载 | 海川珠宝"
          : "作品暂不可浏览 | 海川珠宝",
        description: loadFailure === "error"
          ? "作品信息暂时无法取得，请稍后重试。"
          : "该作品可能已下架，或尚未公开。",
        noIndex: true,
        canonicalPath: null,
      });
    }
    return () => clearPageMeta();
  }, [loadFailure, loading, product, setPageMeta, clearPageMeta]);

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
  useStructuredData("product", product ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
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
        name: product.name,
        ...(productCanonicalUrl ? { item: productCanonicalUrl } : {}),
      },
    ],
  } : null);

  // P1-35：带自动重连的 SSE（断线指数退避重连，避免实时刷新静默失效）
  useReconnectingEventSource(USE_MOCK ? null : publicProductStreamUrl(), () =>
    setRevision((value) => value + 1),
  );

  // 只有直接购买商品需要金价参考；咨询类作品不触发无用请求，也不暴露价格组成。
  useEffect(() => {
    if (!isCommerceAllowed(product?.salesMode, commerceEnabled)) {
      setGoldPrice(null);
      return;
    }
    goldPriceApi
      .getLatest()
      .then((res) => setGoldPrice(unwrapResponse<{ price?: number | string }>(res)))
      .catch(() => setGoldPrice(null));
  }, [product?.salesMode, commerceEnabled]);

  useEffect(() => {
    if (id) trackPageView();
  }, [id]);

  useEffect(() => {
    if (product?.id) trackViewItem(product.id);
  }, [product?.id]);

  if (loading)
    return (
      <div className="product-detail-page__state flex flex-col items-center justify-center gap-4 bg-white" aria-live="polite" aria-busy="true">
        <Spin size="large" />
        <p className="text-xs tracking-[.12em] text-brand-muted">正在加载作品</p>
      </div>
    );
  if (!product && loadFailure === "error")
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
            onClick={() => setRevision((value) => value + 1)}
          >
            重新尝试
          </button>
          <Link
            to="/catalog"
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
          to="/catalog"
          className="text-brand-gold hover:underline text-sm"
        >
          进入选款中心
        </Link>
      </div>
    );

  // Product.price 是服务端派生展示价；选中 SKU 后只展示该 SKU 的成交价。
  const activeSkus = (product.skus ?? []).filter((s) => s.isActive);
  // P1-33：缩略图与主图共享同一数据源，mainImage 驱动主图切换
  // （原主图恒渲染 getPrimaryImage，点击缩略图只改高亮、主图不变）
  const thumbnails = getThumbnailList(product.images, product.primaryImage);
  const mainImageUrl =
    thumbnails[mainImage]?.mediaUrl ||
    thumbnails[mainImage]?.url ||
    (thumbnails.length > 0 ? getPrimaryImage(product) : "");
  const mainImageRecord = thumbnails[mainImage];
  const startingPrice = Number(product.price) || 0;
  const displayPrice = selectedSku ? Number(selectedSku.price) : startingPrice;
  const isDirectPurchase = product.salesMode === "DIRECT_PURCHASE";
  const isSingleUnit = product.inventoryPolicy === "SINGLE_UNIT";
  const availabilityKnown = typeof product.isAvailableForPurchase === "boolean";
  const isSoldOut = isDirectPurchase && product.isAvailableForPurchase === false;
  const commerceOk = isCommerceAllowed(product.salesMode, commerceEnabled);
  const canUseCart = commerceOk && cartEnabled;
  const canAddToCart =
    canUseCart &&
    product.isAvailableForPurchase === true &&
    Boolean(selectedSku) &&
    displayPrice > 0;
  const displayGoldWeight = selectedSku?.goldWeight ?? product.goldWeight;
  const publicSummary =
    product.shortDescription?.trim() || product.description?.trim() || "";
  const detailBlocks = product.detailContent ?? [];
  const materialLabel = getMaterialLabel(product.materialType);
  const numericGoldWeight = Number(displayGoldWeight);
  const numericTotalWeight = Number(product.weight);
  const hasDistinctTotalWeight = hasPublicFact(product.weight) && (
    !hasPublicFact(displayGoldWeight)
    || !Number.isFinite(numericGoldWeight)
    || !Number.isFinite(numericTotalWeight)
    || numericGoldWeight !== numericTotalWeight
  );
  const publicFacts = [
    { label: "材质", value: hasPublicFact(materialLabel) ? materialLabel : "" },
    {
      label: "金重",
      value: hasPublicFact(displayGoldWeight) ? `${displayGoldWeight}g` : "",
    },
    {
      label: "总重",
      value: hasDistinctTotalWeight ? `${product.weight}g` : "",
    },
    { label: "尺寸", value: hasPublicFact(product.size) ? product.size!.trim() : "" },
    ...(product.craftTechnique ?? [])
      .filter(hasPublicFact)
      .map((craft) => ({ label: "工艺", value: craft.trim() })),
  ].filter((fact) => fact.value);
  const validCertificates = (product.certificates ?? []).filter((certificate) =>
    hasPublicFact(certificate.certNumber),
  );

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
    if (!selectedSku) {
      setPurchaseError("请先选择可购买的商品规格。");
      return;
    }

    addPendingRef.current = true;
    setAddingToCart(true);
    try {
      await cartApi.add({
        productId: product.id,
        skuId: selectedSku.id,
        quantity: isSingleUnit ? 1 : qty,
      });
      trackAddToCart(product.id, isSingleUnit ? 1 : qty);
      message.success("已加入购物车");
    } catch (error: unknown) {
      const reason = getRequestErrorMessage(error, "加入购物车失败，请稍后重试");
      setPurchaseError(reason);
      message.error(reason);
    } finally {
      addPendingRef.current = false;
      setAddingToCart(false);
    }
  };

  return (
    <div className="product-detail-page bg-white text-[#181A1B]">
      <div className="product-detail-page__inner">
        {/* Breadcrumb */}
        <nav aria-label="面包屑" className="product-detail-page__breadcrumb text-[11px] tracking-[.16em] text-brand-muted font-sans">
          <Link to="/" className="hover:text-brand-goldD transition-colors">
            首页
          </Link>
          <span className="mx-2 text-brand-muted">/</span>
          <Link
            to="/catalog"
            className="hover:text-brand-goldD transition-colors"
          >
            选款中心
          </Link>
          <span className="mx-2 text-brand-muted">/</span>
          <span className="text-brand-muted">{product.name}</span>
        </nav>

        <div className="product-detail-page__layout">
          {/* Left: Images */}
          <motion.div
            className="product-detail-page__gallery"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.6 }}
          >
            <div
              data-product-main-media-id={
                thumbnails[mainImage]?.id ?? ""
              }
              onClick={() => mainImageUrl && setLightboxOpen(true)}
              role={mainImageUrl ? "button" : undefined}
              aria-label={mainImageUrl ? "放大查看作品图" : undefined}
              tabIndex={mainImageUrl ? 0 : undefined}
              onKeyDown={(e) => {
                if (mainImageUrl && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  setLightboxOpen(true);
                }
              }}
              className={`product-detail-page__main-media ${mainImageUrl ? "cursor-zoom-in" : ""}`}
            >
              {mainImageUrl ? (
                <SecureImage
                  src={mainImageUrl}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  srcSet={buildProductImageSrcSet(mainImageUrl)}
                  sizes="(max-width: 900px) calc(100vw - 40px), (max-width: 1440px) 55vw, 700px"
                  width={mainImageRecord?.width ?? undefined}
                  height={mainImageRecord?.height ?? undefined}
                  aspectRatio="4 / 5"
                  priority
                />
              ) : (
                <span className="text-sm text-brand-muted">图片暂不可用</span>
              )}
            </div>
            {thumbnails.length > 0 ? <div className="product-detail-page__thumbnails">
              {thumbnails.map((img, i) => (
                <button
                  type="button"
                  key={img.id}
                  onClick={() => setMainImage(i)}
                  aria-label={`查看第 ${i + 1} 张作品图`}
                  aria-pressed={i === mainImage}
                  className={`product-detail-page__thumbnail ${i === mainImage ? "is-active" : ""}`}
                >
                  {img.mediaUrl || img.url ? (
                    <SecureImage
                      src={img.mediaUrl || img.url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-brand-muted">图{i + 1}</span>
                  )}
                </button>
              ))}
            </div> : null}
            {thumbnails.length > 0 ? <Lightbox
              open={lightboxOpen}
              close={() => setLightboxOpen(false)}
              index={mainImage}
              slides={thumbnails.map((img) => ({
                src: img.mediaUrl || img.url,
                alt: product.name,
              }))}
            /> : null}
          </motion.div>

          {/* Right: Info */}
          <motion.div
            className="product-detail-page__summary"
            initial={{ y: 20 }}
            animate={{ y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.5, delay: reduceMotion ? 0 : 0.12 }}
          >
            <p className="text-[10px] tracking-[.2em] text-brand-muted mb-5 font-sans">JEWELRY WORK</p>
            <h1 className="text-[clamp(32px,4vw,52px)] leading-[1.15] tracking-[.02em] font-display font-normal mb-3">
              {product.name}
            </h1>
            <p className="text-xs text-brand-muted mb-6 font-sans">
              {product.code}
            </p>

            {publicSummary ? (
              <p className="body text-brand-muted mb-10 leading-[1.9] max-w-[42rem]">
                {publicSummary}
              </p>
            ) : null}

            {/* 只显示来自公开事实源的非空事实，不以 0 或破折号填充。 */}
            {hasPublicFact(goldPrice?.price) || hasPublicFact(displayGoldWeight) ||
            (isDirectPurchase && displayPrice > 0) ? (
              <dl className="product-detail-page__commerce-facts">
                {commerceOk && hasPublicFact(goldPrice?.price) ? (
                  <>
                    <dt>金价参考</dt>
                    <dd>¥{Number(goldPrice!.price).toFixed(2)} <span>/克</span></dd>
                  </>
                ) : null}
                {hasPublicFact(displayGoldWeight) ? (
                  <>
                    <dt>金重</dt>
                    <dd>{displayGoldWeight}g</dd>
                  </>
                ) : null}
                {isDirectPurchase && displayPrice > 0 ? (
                  <>
                    <dt className="is-price">售价</dt>
                    <dd className="is-price">
                      ¥{displayPrice.toLocaleString()}
                      {!selectedSku && activeSkus.length > 1 ? <span>起</span> : null}
                    </dd>
                  </>
                ) : null}
              </dl>
            ) : null}

            {/* SKU selection */}
            {activeSkus.length > 0 && (
              <div className="mb-8">
                <p className="text-xs tracking-[.15em] uppercase text-brand-gold mb-3 font-sans">
                  规格
                </p>
                <div className="flex gap-2 flex-wrap">
                  {activeSkus.map((sku) => (
                    <button
                      type="button"
                      key={sku.id}
                      onClick={() => setSelectedSku(sku)}
                      className={`product-detail-page__sku-option inline-flex min-h-11 min-w-11 items-center justify-center px-5 py-2.5 text-sm border transition-colors font-sans ${selectedSku?.id === sku.id ? "border-brand-gold text-brand-gold" : "border-brand-line hover:border-brand-gold"}`}
                    >
                      {[
                        getMaterialLabel(sku.material),
                        hasPublicFact(sku.goldWeight) ? `${sku.goldWeight}g` : "",
                        isDirectPurchase && Number(sku.price) > 0
                          ? `¥${Number(sku.price).toLocaleString()}`
                          : "",
                      ].filter(Boolean).join(" · ")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 数量控制与 SalesMode 唯一主行动分层呈现。 */}
            {isDirectPurchase && canUseCart && product.isAvailableForPurchase === true ? (
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
            ) : null}
            <div className="product-detail-page__action-zone">
              <ProductPrimaryAction
                product={product}
                selectedSku={selectedSku}
                commerceFlags={commerceFlags}
                commerceFlagsLoading={commerceFlagsLoading}
                canUseCart={canUseCart}
                canAddToCart={canAddToCart}
                addingToCart={addingToCart}
                isSignedIn={isSignedIn}
                isSelected={isSelected}
                onToggleSelection={() => {
                  const result = toggleSelection(product.id);
                  if (result === "limit") {
                    message.warning("每次最多选择 20 款作品");
                    return;
                  }
                  if (isSelected) trackRemoveFromSelection(product.id);
                  else trackAddToSelection(product.id);
                }}
                onAddToCart={handleAddToCart}
              />
            </div>
            {isSingleUnit && isDirectPurchase ? (
              <p className="product-detail-page__status-copy text-xs leading-6 text-brand-muted">
                一物一件，每位顾客的购物车最多保留 1 件。
              </p>
            ) : null}
            {isSoldOut ? (
              <p className="product-detail-page__status-copy text-sm leading-6 text-brand-muted" role="status">
                该作品已售罄，仍可继续浏览作品信息或联系珠宝顾问。
              </p>
            ) : null}
            {purchaseError ? (
              <p className="product-detail-page__status-copy text-sm leading-6 text-[#8C3F3B]" role="alert">
                {purchaseError}
              </p>
            ) : null}

            {/* 只有存在真实内容的标签才进入公开 DOM。 */}
            {publicFacts.length > 0 || validCertificates.length > 0 ||
            Boolean(reviewsData?.total) ? (
              <Tabs
                items={[
                  ...(publicFacts.length > 0 ? [{
                  key: "params",
                  label: (
                    <span className="font-sans text-xs tracking-[.1em]">
                      作品信息
                    </span>
                  ),
                  children: (
                    <div className="product-detail-page__facts-grid">
                      {publicFacts.map((fact, index) => (
                        <div key={`${fact.label}-${fact.value}-${index}`}>
                          <p className="text-[10px] text-brand-muted uppercase">
                            {fact.label}
                          </p>
                          <p className="text-sm mt-1">{fact.value}</p>
                        </div>
                      ))}
                    </div>
                  ),
                }] : []),
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
            ) : null}
            {isSignedIn ? (
              <button
                type="button"
                onClick={handleToggleFavorite}
                disabled={favBusy}
                className="product-detail-page__favorite"
              >
                {favorited ? <HeartFilled /> : <HeartOutlined />}
                <span>{favorited ? "已加入心愿单" : "加入心愿单"}</span>
              </button>
            ) : null}
            {/* 推荐接口要求客户登录；游客不发必然 401 的请求。 */}
            {isSignedIn ? <SimilarProducts productId={product.id} /> : null}
          </motion.div>
        </div>
        {detailBlocks.length > 0 && (
          <section className="product-detail-page__content" aria-label="商品详情">
            {detailBlocks.map((block, index) => {
              if (block.type === "TEXT") {
                return block.text ? (
                  <p key={`detail-text-${index}`} className="mx-auto max-w-3xl whitespace-pre-wrap py-8 text-base leading-8 text-brand-muted">
                    {block.text}
                  </p>
                ) : null;
              }
              const image = product.images?.find((item) => item.id === block.imageId);
              const src = image?.mediaUrl || image?.url;
              return src ? (
                <SecureImage
                  key={`detail-image-${index}`}
                  src={src}
                  srcSet={buildProductImageSrcSet(src)}
                  sizes="(max-width: 1000px) calc(100vw - 40px), 960px"
                  width={image?.width ?? undefined}
                  height={image?.height ?? undefined}
                  alt={block.alt || `${product.name} 详情图 ${index + 1}`}
                  className="mx-auto block h-auto w-full"
                  deferUntilVisible
                />
              ) : null;
            })}
          </section>
        )}
      </div>
    </div>
  );
}
