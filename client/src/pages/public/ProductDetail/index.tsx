import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Tabs, Spin, message } from "antd";
import {
  HeartOutlined,
  ShoppingCartOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { getMaterialLabel } from "@/utils/material";
import { getPrimaryImage, getThumbnailList } from "@/utils/productImage";
import { SecureImage } from "@/components/common/SecureImage";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { cartApi, productApi, publicProductStreamUrl, goldPriceApi } from "@/services/api";
import { USE_MOCK } from "@/services/mockData";
import { unwrapResponse } from "@/utils/unwrap";
import type { Product, ProductSKU } from "@/types";
import { trackAddToCart, trackPageView, trackProductView } from "@/hooks/useAnalytics";
import {
  isCommerceAllowed,
  salesModeRoute,
  salesModeCta,
} from "@/store/featureFlags";
import { useReconnectingEventSource } from "@/hooks/useReconnectingEventSource";
import { usePageMetaStore } from "@/store/pageMetaStore";

export default function ProductDetail() {
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
  const [goldPrice, setGoldPrice] = useState<{ price?: number | string } | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const res = await productApi.getPublicById(Number(id));
        const data = unwrapResponse<Product>(res);
        setProduct(data);
        if (data?.skus?.length) setSelectedSku(data.skus.find((s) => s.isActive) ?? null);
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
  useReconnectingEventSource(
    USE_MOCK ? null : publicProductStreamUrl,
    () => setRevision((value) => value + 1),
  );

  // 只有直接购买商品需要金价参考；咨询类作品不触发无用请求，也不暴露价格组成。
  useEffect(() => {
    if (!isCommerceAllowed(product?.salesMode)) {
      setGoldPrice(null);
      return;
    }
    goldPriceApi
      .getLatest()
      .then((res) => setGoldPrice(unwrapResponse<any>(res)))
      .catch(() => setGoldPrice(null));
  }, [product?.salesMode]);

  useEffect(() => {
    if (id) {
      trackPageView();
      trackProductView(Number(id));
    }
  }, [id]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  if (!product)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-brand-muted text-lg">该珠宝作品当前暂不可浏览</p>
        <Link
          to="/products"
          className="text-brand-gold hover:underline text-sm"
        >
          返回珠宝作品列表
        </Link>
      </div>
    );

  // 起价 = 活跃 SKU 最低价(与后端 Product.price 语义一致);选中 SKU 后切到该 SKU 价
  const activeSkus = (product.skus ?? []).filter((s) => s.isActive);
  // P1-33：缩略图与主图共享同一数据源，mainImage 驱动主图切换
  // （原主图恒渲染 getPrimaryImage，点击缩略图只改高亮、主图不变）
  const thumbnails = getThumbnailList(product.images);
  const mainImageUrl = (thumbnails[mainImage] as any)?.mediaUrl || thumbnails[mainImage]?.url || getPrimaryImage(product as any);
  const activePrices = activeSkus
    .map((s) => Number(s.price) || 0)
    .filter((p) => p > 0);
  const startingPrice =
    activePrices.length > 0 ? Math.min(...activePrices) : Number(product.price) || 0;
  const displayPrice = selectedSku ? Number(selectedSku.price) : startingPrice;
  const commerceOk = isCommerceAllowed(product.salesMode);
  const displayGoldWeight = selectedSku?.goldWeight ?? product.goldWeight;

  const handleAddToCart = async () => {
    if (!selectedSku) {
      message.warning("请先选择商品规格");
      return;
    }

    setAddingToCart(true);
    try {
      await cartApi.add({
        productId: product.id,
        skuId: selectedSku.id,
        quantity: qty,
      });
      trackAddToCart(product.id, qty);
      message.success("已加入购物车");
    } catch (error: any) {
      message.error(error?.message || "加入购物车失败");
    } finally {
      setAddingToCart(false);
    }
  };

  return (
    <div>
      <div className="max-w-7xl mx-auto px-6 md:px-20 py-10 md:py-16">
        {/* Breadcrumb */}
        <div className="text-xs tracking-[.2em] text-brand-gold mb-8 font-sans">
          <Link to="/" className="hover:text-brand-goldD transition-colors">
            首页
          </Link>
          <span className="mx-2 text-brand-muted">/</span>
          <Link
            to="/products"
            className="hover:text-brand-goldD transition-colors"
          >
            臻品
          </Link>
          <span className="mx-2 text-brand-muted">/</span>
          <span className="text-brand-muted">{product.name}</span>
        </div>

        <div className="grid md:grid-cols-2 gap-10 md:gap-20">
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
              className={`aspect-[4/5] bg-brand-bg flex items-center justify-center sticky top-24 border border-brand-line ${mainImageUrl ? "cursor-zoom-in" : ""}`}
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
                  {((img as any).mediaUrl || img.url) ? (
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
            <h1 className="text-3xl md:text-4xl font-display font-semibold mb-2">
              {product.name}
            </h1>
            <p className="text-xs text-brand-muted mb-6 font-sans">
              {product.code}
            </p>

            <p className="body text-brand-muted mb-8 leading-relaxed">
              {product.description}
            </p>

            {/* 公开参数与价格：非直接购买模式不暴露价格组成，统一引导顾问服务。 */}
            <div className="border-y border-brand-line py-4 mb-8">
              {commerceOk && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-brand-muted">金价参考</span>
                  <span className="font-sans font-medium">
                    {goldPrice?.price ? `¥${Number(goldPrice.price).toFixed(2)}` : "—"}{" "}
                    <span className="text-xs text-brand-gold">/克</span>
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-brand-muted">金重</span>
                <span>{displayGoldWeight ? `${displayGoldWeight}g` : "—"}</span>
              </div>
              {commerceOk && displayPrice > 0 ? (
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
                      {getMaterialLabel(sku.material)} · {sku.goldWeight ? `${sku.goldWeight}g` : "—"}
                      {commerceOk && Number(sku.price) > 0
                        ? ` · ¥${Number(sku.price).toLocaleString()}`
                        : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity + Actions */}
            <div className="flex items-center gap-4 mb-8">
              {commerceOk && (
                <div className="flex items-center border border-brand-line">
                  <button
                    type="button"
                    aria-label="减少数量"
                    className="px-4 py-2.5 text-brand-muted hover:text-brand-text transition-colors font-sans"
                    onClick={() => setQty(Math.max(1, qty - 1))}
                  >
                    −
                  </button>
                  <span className="px-4 py-2.5 text-sm font-sans" aria-live="polite">{qty}</span>
                  <button
                    type="button"
                    aria-label="增加数量"
                    className="px-4 py-2.5 text-brand-muted hover:text-brand-text transition-colors font-sans"
                    onClick={() => setQty(qty + 1)}
                  >
                    +
                  </button>
                </div>
              )}
              {commerceOk ? (
                <button
                  className="btn btn-primary flex-1"
                  onClick={handleAddToCart}
                  disabled={addingToCart || !selectedSku}
                >
                  <ShoppingCartOutlined /> {addingToCart ? "加入中..." : "加入购物车"}
                </button>
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
              <button
                type="button"
                aria-label="收藏这件作品"
                className="p-3 border border-brand-line hover:border-brand-gold transition-colors"
              >
                <HeartOutlined className="text-brand-muted hover:text-brand-gold transition-colors" />
              </button>
            </div>

            {/* Tabs */}
            <Tabs
              items={[
                {
                  key: "params",
                  label: (
                    <span className="font-sans text-xs tracking-[.1em]">
                      产品参数
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
              ]}
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
