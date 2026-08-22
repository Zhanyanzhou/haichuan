// 作品详情：公开安全字段/灯箱/SKU/收藏/评价 Tab(晒单)/相似推荐/SEO meta
import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
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
  trackPageView,
  trackProductView,
} from "@/hooks/useAnalytics";
import {
  isCommerceAllowed,
  salesModeRoute,
  salesModeCta,
  useCommerceCapabilities,
} from "@/store/featureFlags";
import { useReconnectingEventSource } from "@/hooks/useReconnectingEventSource";
import { usePageMetaStore } from "@/store/pageMetaStore";

/** 相似作品推荐（同分类/材质+热度加权；recommendations 模块首次接线启用） */
function SimilarProducts({ productId }: { productId: number }) {
  const [list, setList] = useState<Array<{ id: number; name: string; price?: number | string | null }>>([]);

  useEffect(() => {
    recommendationApi
      .getSimilar(productId, 8)
      .then((res: unknown) => {
        setList(unwrapResponse<any[]>(res) || []);
      })
      .catch(() => setList([]));
  }, [productId]);

  if (list.length === 0) return null;
  return (
    <div className="mt-12 pt-8 border-t border-brand-line">
      <p className="text-xs tracking-[.15em] uppercase text-brand-gold mb-5 font-sans">
        相关作品
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        {list.map((item) => (
          <Link key={item.id} to={`/products/${item.id}`} className="group">
            <div className="aspect-square bg-brand-bg overflow-hidden">
              <SecureImage
                src={getListingImage(item as any)}
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

/** 作品评价 Tab（先审后展）：平均分 + 审核通过的评价 + 商家回复 */
function ProductReviewsTab({ productId }: { productId: number }) {
  const [data, setData] = useState<{
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
  } | null>(null);

  useEffect(() => {
    reviewApi
      .listForProduct(productId, { pageSize: 20 })
      .then((res) => setData(unwrapResponse<any>(res) || null))
      .catch(() => setData({ list: [], total: 0, averageRating: null }));
  }, [productId]);

  if (!data) {
    return (
      <p className="text-brand-muted text-sm py-4">评价加载中…</p>
    );
  }
  if (data.total === 0) {
    return (
      <p className="text-brand-muted text-sm py-4">
        这件作品还没有评价。完成购买后，欢迎分享您的佩戴体验。
      </p>
    );
  }
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

export default function ProductDetail() {
  const { message } = AntdApp.useApp();
  const { id } = useParams();
  const setPageMeta = usePageMetaStore((s) => s.setMeta);
  const clearPageMeta = usePageMetaStore((s) => s.clear);
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [selectedSku, setSelectedSku] = useState<ProductSKU | null>(null);
  const [mainImage, setMainImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [addingToCart, setAddingToCart] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");
  const addPendingRef = useRef(false);
  const [goldPrice, setGoldPrice] = useState<{
    price?: number | string;
  } | null>(null);
  const { flags: commerceFlags, loading: commerceFlagsLoading } =
    useCommerceCapabilities();
  const commerceEnabled = commerceFlags?.commerceEnabled ?? false;
  const cartEnabled = commerceFlags?.cartEnabled ?? false;
  const isSignedIn = Boolean(
    typeof window !== "undefined" && localStorage.getItem("customerToken"),
  );
  // 心愿单仅对登录客户启用；游客仍可浏览公开安全字段。
  const [favorited, setFavorited] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  // 初始收藏态：拉一次心愿单判断当前作品是否在列（心愿单量级小，整表判断成本可忽略）。
  // 登录墙 return 之前 hooks 已执行，必须显式判断登录态，避免游客每次必发一个注定 401 的请求。
  useEffect(() => {
    if (!id || !isSignedIn) return;
    customerApi
      .getFavorites()
      .then((res: unknown) => {
        const list = unwrapResponse<Array<{ productId: number }>>(res) || [];
        setFavorited(list.some((f) => f.productId === Number(id)));
      })
      .catch(() => setFavorited(false));
  }, [id, isSignedIn]);

  const handleToggleFavorite = async () => {
    if (favBusy || !id) return;
    setFavBusy(true);
    // 乐观更新，失败回滚
    const next = !favorited;
    setFavorited(next);
    try {
      const res = await customerApi.toggleFavorite(Number(id));
      const result = unwrapResponse<{ favorited: boolean }>(res);
      setFavorited(Boolean(result?.favorited));
      message.success(result?.favorited ? "已加入心愿单" : "已移出心愿单");
    } catch (e: any) {
      setFavorited(!next);
      message.error(e?.response?.data?.message || e?.message || "操作失败，请稍后重试");
    } finally {
      setFavBusy(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const res = await productApi.getPublicById(id || "");
        const data = unwrapResponse<Product>(res);
        setProduct(data);
        setSelectedSku(data?.skus?.find((s) => s.isActive) ?? null);
        setQty(1);
        setPurchaseError("");
      } catch {
        setProduct(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, revision]);

  // SEO：商品详情独立标题（不泄露内部编号；未加载时不设误导标题）
  useEffect(() => {
    if (product?.name) {
      setPageMeta({
        title: `${product.name} | 海川珠宝`,
        description: product.shortDescription || undefined,
        // og:image / twitter:image：分享到微信/微博/小红书时展示作品主图
        image: getPrimaryImage(product as any) || undefined,
      });
    }
    return () => clearPageMeta();
  }, [product, setPageMeta, clearPageMeta]);

  // P1-35：带自动重连的 SSE（断线指数退避重连，避免实时刷新静默失效）
  useReconnectingEventSource(USE_MOCK ? null : publicProductStreamUrl, () =>
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
      .then((res) => setGoldPrice(unwrapResponse<any>(res)))
      .catch(() => setGoldPrice(null));
  }, [product?.salesMode, commerceEnabled]);

  useEffect(() => {
    if (id) {
      trackPageView();
      trackProductView(Number(id));
    }
  }, [id]);

  if (loading)
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 bg-white" aria-live="polite" aria-busy="true">
        <Spin size="large" />
        <p className="text-xs tracking-[.12em] text-brand-muted">正在加载作品</p>
      </div>
    );
  if (!product)
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 bg-white px-6 text-center">
        <h1 className="font-display text-3xl font-normal tracking-[.04em]">作品暂不可浏览</h1>
        <p className="text-brand-muted text-sm">该珠宝作品可能已下架，或公开信息暂时无法取得。</p>
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
  const thumbnails = getThumbnailList(product.images);
  const mainImageUrl =
    (thumbnails[mainImage] as any)?.mediaUrl ||
    thumbnails[mainImage]?.url ||
    getPrimaryImage(product as any);
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
  const detailBlocks = product.detailContent ?? [];

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
    } catch (error: any) {
      const reason = error?.message || "加入购物车失败，请稍后重试";
      setPurchaseError(reason);
      message.error(reason);
    } finally {
      addPendingRef.current = false;
      setAddingToCart(false);
    }
  };

  return (
    <div className="product-detail-page bg-white text-[#181A1B]">
      <div className="max-w-[1440px] mx-auto px-5 sm:px-8 lg:px-16 py-10 md:py-16 lg:py-20">
        {/* Breadcrumb */}
        <nav aria-label="面包屑" className="text-[11px] tracking-[.16em] text-brand-muted mb-8 md:mb-12 font-sans">
          <Link to="/" className="hover:text-brand-goldD transition-colors">
            首页
          </Link>
          <span className="mx-2 text-brand-muted">/</span>
          <Link
            to="/products"
            className="hover:text-brand-goldD transition-colors"
          >
            珠宝作品
          </Link>
          <span className="mx-2 text-brand-muted">/</span>
          <span className="text-brand-muted">{product.name}</span>
        </nav>

        <div className="grid lg:grid-cols-[minmax(0,1.12fr)_minmax(360px,.88fr)] gap-12 lg:gap-20 xl:gap-28 items-start">
          {/* Left: Images */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
          >
            <div
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
              className={`aspect-[4/5] bg-[#F4F5F5] flex items-center justify-center lg:sticky lg:top-28 border border-[#DDE1E2] ${mainImageUrl ? "cursor-zoom-in" : ""}`}
            >
              {mainImageUrl ? (
                <SecureImage
                  src={mainImageUrl}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-7xl text-brand-gold/20">◆</span>
              )}
            </div>
            <div className="flex gap-3 mt-4">
              {thumbnails.map((img, i) => (
                <div
                  key={img.id}
                  onClick={() => setMainImage(i)}
                  className={`w-16 h-16 bg-brand-bg flex items-center justify-center cursor-pointer border transition-colors overflow-hidden ${i === mainImage ? "border-brand-gold" : "border-transparent hover:border-brand-gold"}`}
                >
                  {(img as any).mediaUrl || img.url ? (
                    <SecureImage
                      src={(img as any).mediaUrl || img.url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-brand-muted">图{i + 1}</span>
                  )}
                </div>
              ))}
            </div>
            <Lightbox
              open={lightboxOpen}
              close={() => setLightboxOpen(false)}
              index={mainImage}
              slides={thumbnails.map((img) => ({
                src: (img as any).mediaUrl || img.url,
                alt: product.name,
              }))}
            />
          </motion.div>

          {/* Right: Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <p className="text-[10px] tracking-[.2em] text-brand-muted mb-5 font-sans">JEWELRY WORK</p>
            <h1 className="text-[clamp(32px,4vw,52px)] leading-[1.15] tracking-[.02em] font-display font-normal mb-3">
              {product.name}
            </h1>
            <p className="text-xs text-brand-muted mb-6 font-sans">
              {product.code}
            </p>

            <p className="body text-brand-muted mb-10 leading-[1.9] max-w-[42rem]">
              {product.description}
            </p>

            {/* 公开参数与价格：非直接购买模式不暴露价格组成，统一引导顾问服务。 */}
            <div className="border-y border-brand-line py-4 mb-8">
              {commerceOk && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-brand-muted">金价参考</span>
                  <span className="font-sans font-medium">
                    {goldPrice?.price
                      ? `¥${Number(goldPrice.price).toFixed(2)}`
                      : "—"}{" "}
                    <span className="text-xs text-brand-gold">/克</span>
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-brand-muted">金重</span>
                <span>{displayGoldWeight ? `${displayGoldWeight}g` : "—"}</span>
              </div>
              {isDirectPurchase && displayPrice > 0 ? (
                <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-brand-line font-medium">
                  <span>售价</span>
                  <span className="price text-2xl">
                    ¥{displayPrice.toLocaleString()}
                    {!selectedSku && activeSkus.length > 1 && (
                      <span className="text-xs text-brand-muted ml-1">起</span>
                    )}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-brand-line">
                  <span className="text-brand-muted">作品服务</span>
                  <span className="font-medium">请咨询珠宝顾问</span>
                </div>
              )}
            </div>

            {/* SKU selection */}
            {activeSkus.length > 0 && (
              <div className="mb-8">
                <p className="text-xs tracking-[.15em] uppercase text-brand-gold mb-3 font-sans">
                  规格
                </p>
                <div className="flex gap-2 flex-wrap">
                  {activeSkus.map((sku) => (
                    <button
                      key={sku.id}
                      onClick={() => setSelectedSku(sku)}
                      className={`px-5 py-2.5 text-sm border transition-colors font-sans ${selectedSku?.id === sku.id ? "border-brand-gold text-brand-gold" : "border-brand-line hover:border-brand-gold"}`}
                    >
                      {getMaterialLabel(sku.material)} ·{" "}
                      {sku.goldWeight ? `${sku.goldWeight}g` : "—"}
                      {isDirectPurchase && Number(sku.price) > 0
                        ? ` · ¥${Number(sku.price).toLocaleString()}`
                        : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity + Actions */}
            <div className="flex items-center gap-4 mb-8">
              {isDirectPurchase && canUseCart && product.isAvailableForPurchase === true && (
                <div className="flex items-center border border-brand-line" aria-label={isSingleUnit ? "一物一件，数量固定为 1" : "购买数量"}>
                  <button
                    type="button"
                    aria-label="减少数量"
                    disabled={qty <= 1 || isSingleUnit}
                    className="min-w-11 min-h-11 px-4 py-2.5 text-brand-muted hover:text-brand-text transition-colors font-sans disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => setQty(Math.max(1, qty - 1))}
                  >
                    −
                  </button>
                  <span
                    className="px-4 py-2.5 text-sm font-sans"
                    aria-live="polite"
                  >
                    {qty}
                  </span>
                  <button
                    type="button"
                    aria-label="增加数量"
                    disabled={isSingleUnit || qty >= 99}
                    className="min-w-11 min-h-11 px-4 py-2.5 text-brand-muted hover:text-brand-text transition-colors font-sans disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => setQty(Math.min(99, qty + 1))}
                  >
                    +
                  </button>
                </div>
              )}
              {isDirectPurchase ? (
                commerceFlagsLoading || !commerceFlags ? (
                  <button type="button" className="btn btn-primary flex-1" disabled>
                    正在确认购买状态
                  </button>
                ) : isSoldOut ? (
                  <button type="button" className="btn btn-primary flex-1" disabled>
                    已售罄
                  </button>
                ) : !availabilityKnown ? (
                  <button type="button" className="btn btn-primary flex-1" disabled>
                    库存状态暂不可用
                  </button>
                ) : !canUseCart ? (
                  <Link to="/contact" className="btn btn-secondary flex-1 text-center">
                    购买暂未开放，联系顾问
                  </Link>
                ) : isSignedIn ? (
                  <button
                    className="btn btn-primary flex-1 whitespace-nowrap px-4 sm:px-10"
                    onClick={handleAddToCart}
                    disabled={addingToCart || !canAddToCart}
                  >
                    <ShoppingCartOutlined />{" "}
                    {addingToCart ? "加入中..." : "加入购物车"}
                  </button>
                ) : (
                  <Link
                    to="/customer"
                    state={{ returnTo: `/products/${product.id}` }}
                    className="btn btn-primary flex-1 whitespace-nowrap px-4 text-center sm:px-10"
                  >
                    登录后购买
                  </Link>
                )
              ) : product.salesMode === "DISPLAY_ONLY" ? (
                <div className="flex-1 text-center text-brand-muted text-sm py-3 border border-brand-line">
                  仅展示，暂不售卖
                </div>
              ) : (
                <Link
                  to={salesModeRoute(product.salesMode)}
                  className="btn btn-primary flex-1 text-center"
                >
                  {salesModeCta(product.salesMode)}
                </Link>
              )}
              {isSignedIn ? (
                <button
                  type="button"
                  aria-label={favorited ? "移出心愿单" : "加入心愿单"}
                  title={favorited ? "移出心愿单" : "加入心愿单"}
                  onClick={handleToggleFavorite}
                  disabled={favBusy}
                  className={`w-12 h-12 shrink-0 flex items-center justify-center border transition-colors font-sans ${
                    favorited
                      ? "border-brand-gold text-brand-gold"
                      : "border-brand-line text-brand-muted hover:border-brand-gold hover:text-brand-gold"
                  }`}
                >
                  {favorited ? <HeartFilled /> : <HeartOutlined />}
                </button>
              ) : (
                <Link
                  to="/contact"
                  className="text-sm text-brand-gold hover:underline shrink-0"
                >
                  咨询此款
                </Link>
              )}
            </div>
            {isSingleUnit && isDirectPurchase ? (
              <p className="-mt-5 mb-6 text-xs leading-6 text-brand-muted">
                一物一件，每位顾客的购物车最多保留 1 件。
              </p>
            ) : null}
            {isSoldOut ? (
              <p className="-mt-5 mb-6 text-sm leading-6 text-brand-muted" role="status">
                该作品已售罄，仍可继续浏览作品信息或联系珠宝顾问。
              </p>
            ) : null}
            {purchaseError ? (
              <p className="-mt-5 mb-6 text-sm leading-6 text-[#8C3F3B]" role="alert">
                {purchaseError}
              </p>
            ) : null}

            {/* Tabs */}
            <Tabs
              items={[
                {
                  key: "params",
                  label: (
                    <span className="font-sans text-xs tracking-[.1em]">
                      作品信息
                    </span>
                  ),
                  children: (
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        {
                          l: "材质",
                          v: getMaterialLabel(product.materialType),
                        },
                        { l: "金重", v: `${product.goldWeight || "-"}g` },
                        { l: "总重", v: `${product.weight || "-"}g` },
                        { l: "尺寸", v: product.size || "-" },
                      ].map((i) => (
                        <div key={i.l}>
                          <p className="text-[10px] text-brand-muted uppercase">
                            {i.l}
                          </p>
                          <p className="text-sm mt-1">{i.v}</p>
                        </div>
                      ))}
                      {product.craftTechnique?.map((c) => (
                        <div key={c}>
                          <p className="text-[10px] text-brand-muted uppercase">
                            工艺
                          </p>
                          <p className="text-sm mt-1">{c}</p>
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  key: "cert",
                  label: (
                    <span className="font-sans text-xs tracking-[.1em]">
                      证书
                    </span>
                  ),
                  children: product.certificates?.length ? (
                    product.certificates.map((c) => (
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
                    ))
                  ) : (
                    <p className="text-brand-muted text-sm">暂无证书信息</p>
                  ),
                },
                {
                  key: "reviews",
                  label: (
                    <span className="font-sans text-xs tracking-[.1em]">
                      评价
                    </span>
                  ),
                  children: <ProductReviewsTab productId={product.id} />,
                },
              ]}
            />
            {/* 推荐接口要求客户登录；游客不发必然 401 的请求。 */}
            {isSignedIn ? <SimilarProducts productId={product.id} /> : null}
          </motion.div>
        </div>
        {detailBlocks.length > 0 && (
          <section className="mx-auto mt-20 max-w-5xl border-t border-brand-line pt-14" aria-label="商品详情">
            {detailBlocks.map((block, index) => {
              if (block.type === "TEXT") {
                return block.text ? (
                  <p key={`detail-text-${index}`} className="mx-auto max-w-3xl whitespace-pre-wrap py-8 text-base leading-8 text-brand-muted">
                    {block.text}
                  </p>
                ) : null;
              }
              const image = product.images?.find((item) => item.id === block.imageId) as any;
              const src = image?.mediaUrl || image?.url;
              return src ? (
                <img key={`detail-image-${index}`} src={src} alt={block.alt || `${product.name} 详情图 ${index + 1}`} className="mx-auto block h-auto w-full" loading="lazy" />
              ) : null;
            })}
          </section>
        )}
      </div>
    </div>
  );
}
