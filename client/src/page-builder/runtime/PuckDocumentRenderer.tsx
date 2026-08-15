import { useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import AppointmentBlock from "@/components/blocks/AppointmentBlock";
import StoreInfoBlock from "@/components/blocks/StoreInfoBlock";
import CertificateBlock from "@/components/blocks/CertificateBlock";
import CustomProcessBlock from "@/components/blocks/CustomProcessBlock";
import FeaturedProductBlock from "@/components/blocks/FeaturedProductBlock";
import LookbookBlock from "@/components/blocks/LookbookBlock";
import LimitedOfferBlock from "@/components/blocks/LimitedOfferBlock";
import TestimonialBlock from "@/components/blocks/TestimonialBlock";
import CarouselBlock from "@/components/blocks/CarouselBlock";
import CardGridBlock from "@/components/blocks/CardGridBlock";
import CategoryCardsBlock from "@/components/blocks/CategoryCardsBlock";
import AsymmetricGalleryBlock from "@/components/blocks/AsymmetricGalleryBlock";
import BeforeAfterBlock from "@/components/blocks/BeforeAfterBlock";
import DoublePosterSection from "@/components/blocks/DoublePosterSection";
import FullBleedBlock from "@/components/blocks/FullBleedBlock";
import HeroSection from "@/components/blocks/HeroSection";
import HotspotBlock from "@/components/blocks/HotspotBlock";
import ImageTextBlock from "@/components/blocks/ImageTextBlock";
import ProductRowBlock from "@/components/blocks/ProductRowBlock";
import SinglePosterSection from "@/components/blocks/SinglePosterSection";
import SplitPanelBlock from "@/components/blocks/SplitPanelBlock";
import TextBannerBlock from "@/components/blocks/TextBannerBlock";
import VideoBlock from "@/components/blocks/VideoBlock";
import { productApi, publicProductStreamUrl } from "@/services/api";
import { USE_MOCK } from "@/services/mockData";
import type { Product } from "@/types";
import { getListingImage } from "@/utils/productImage";
import { unwrapResponse } from "@/utils/unwrap";
import { convertPuckProps } from "@/page-builder/utils/puckPropsToModule";

type PuckBlock = {
  type?: string;
  props?: Record<string, any>;
};

type PuckDocument = {
  content?: PuckBlock[];
  zones?: Record<string, PuckBlock[]>;
};

const LOCAL_UPLOAD_PREFIX = "/uploads/";
const BLOCK_ASSET_FIELDS = [
  "desktopImage",
  "mobileImage",
  "mainImage",
  "detailImage",
  "image",
  "posterUrl",
  "url",
  "videoUrl",
  "backgroundImage",
  "beforeImage",
  "afterImage",
];

function getLocalUploadUrls(props: Record<string, any>): string[] {
  const urls = new Set<string>();
  const collect = (value: unknown) => {
    if (typeof value === "string" && value.startsWith(LOCAL_UPLOAD_PREFIX)) {
      urls.add(value);
    }
  };

  BLOCK_ASSET_FIELDS.forEach((field) => collect(props[field]));
  if (Array.isArray(props.images)) {
    props.images.forEach((item: any) => {
      collect(item?.url);
      collect(item?.mobileUrl);
    });
  }
  if (Array.isArray(props.categories)) {
    props.categories.forEach((item: any) => collect(item?.image));
  }
  if (Array.isArray(props.items)) {
    // 作品画廊条目图
    props.items.forEach((item: any) => collect(item?.image));
  }
  if (Array.isArray(props.certificates)) {
    props.certificates.forEach((item: any) => collect(item?.imageUrl));
  }
  if (Array.isArray(props.steps)) {
    props.steps.forEach((item: any) => collect(item?.image));
  }
  if (Array.isArray(props.testimonials)) {
    props.testimonials.forEach((item: any) => collect(item?.image));
  }

  return [...urls];
}

function MissingMediaState({ type }: { type?: string }) {
  return (
    <section
      role="status"
      style={{
        minHeight: 260,
        display: "grid",
        placeItems: "center",
        padding: "48px 24px",
        background: "#F3F0E9",
        border: "1px dashed #B8944E",
        color: "#7D6440",
        textAlign: "center",
      }}
    >
      <div>
        <p style={{ margin: "0 0 8px", fontSize: 15 }}>图片暂时不可用</p>
        <p style={{ margin: 0, fontSize: 13, color: "#9A9288" }}>
          请在店铺装修中重新上传{type ? `「${type}」` : "该区块"}的图片后再发布。
        </p>
      </div>
    </section>
  );
}

function formatProductPrice(product: Product) {
  const price = Number(product.price || 0);
  if (!price) return "";
  return `¥${price.toLocaleString("zh-CN")}`;
}

function toProductRowItem(product: Product) {
  return {
    id: product.id,
    name: product.name,
    image: getListingImage(product),
    price: formatProductPrice(product),
    link: `/products/${product.id}`,
  };
}

function ProductRowState({
  title,
  subtitle,
  bgColor,
  message,
}: {
  title?: string;
  subtitle?: string;
  bgColor?: string;
  message: string;
}) {
  return (
    <section
      style={{
        padding: "clamp(60px,8vh,120px) 0",
        background: bgColor || "#FCFCFB",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "0 clamp(20px,4vw,60px)",
          textAlign: "center",
        }}
      >
        {(title || subtitle) && (
          <div style={{ marginBottom: 28 }}>
            {title && (
              <h2
                style={{
                  margin: "0 0 12px",
                  color: "#2C2C2C",
                  fontFamily: '"Cormorant Garamond","Noto Serif SC",serif',
                  fontSize: "clamp(24px,2.8vw,38px)",
                  lineHeight: 1.2,
                }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p
                style={{
                  margin: "0 auto",
                  maxWidth: 480,
                  color: "#8A7F72",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
        )}
        <p style={{ color: "#9A9288", fontSize: 13 }}>{message}</p>
      </div>
    </section>
  );
}

// 模块级单例：多个产品行共享同一条商品变更 SSE，引用计数管理生命周期
// P1-35：onerror 时指数退避重连（与 useReconnectingEventSource 同策略），避免单例流断线后所有产品行静默不刷新
type ProductStreamHandle = {
  stream: EventSource | null;
  listeners: Set<() => void>;
  retry: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
};
let productStreamHandle: ProductStreamHandle | null = null;
function subscribeProductStream(onTick: () => void): () => void {
  if (!productStreamHandle) {
    const handle: ProductStreamHandle = {
      stream: null,
      listeners: new Set(),
      retry: 0,
      retryTimer: null,
    };
    const open = () => {
      const stream = new EventSource(publicProductStreamUrl);
      stream.onmessage = () => {
        handle.retry = 0;
        handle.listeners.forEach((cb) => cb());
      };
      stream.onerror = () => {
        stream.close();
        if (handle.retry >= 10) return;
        const delay = Math.min(1000 * 2 ** handle.retry, 30000);
        handle.retry += 1;
        handle.retryTimer = setTimeout(open, delay);
      };
      handle.stream = stream;
    };
    productStreamHandle = handle;
    open();
  }
  productStreamHandle.listeners.add(onTick);
  return () => {
    if (!productStreamHandle) return;
    productStreamHandle.listeners.delete(onTick);
    if (productStreamHandle.listeners.size === 0) {
      productStreamHandle.stream?.close();
      if (productStreamHandle.retryTimer) clearTimeout(productStreamHandle.retryTimer);
      productStreamHandle = null;
    }
  };
}

function ResolvedProductRowBlock({
  props,
}: {
  props: Record<string, any>;
}) {
  const productIds = useMemo(
    () =>
      Array.isArray(props.productIds)
        ? props.productIds
          .map((id: unknown) => Number(id))
          .filter((id: number) => Number.isInteger(id) && id > 0)
        : [],
    [props.productIds],
  );
  const idsKey = productIds.join(",");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(productIds.length > 0);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (productIds.length === 0) {
      setProducts([]);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    (async () => {
      try {
        const response = await productApi.getPublicList({
          ids: idsKey,
          pageSize: productIds.length,
          sortBy: "sortOrder",
        });
        const data = unwrapResponse<any>(response);
        const list: Product[] = data?.list || data || [];
        const byId = new Map(list.map((product) => [product.id, product]));
        const ordered = productIds
          .map((id) => byId.get(id))
          .filter((product): product is Product => Boolean(product));
        if (!cancelled) setProducts(ordered);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [idsKey, productIds, revision]);

  useEffect(() => {
    if (USE_MOCK || productIds.length === 0) return;
    return subscribeProductStream(() => setRevision((value) => value + 1));
  }, [productIds.length]);

  if (productIds.length === 0) return null;
  if (loading) {
    return (
      <ProductRowState
        title={props.title}
        subtitle={props.subtitle}
        bgColor={props.bgColor}
        message="正在加载精选商品"
      />
    );
  }
  if (error) {
    return (
      <ProductRowState
        title={props.title}
        subtitle={props.subtitle}
        bgColor={props.bgColor}
        message="精选商品暂时加载失败"
      />
    );
  }
  if (products.length === 0) {
    return (
      <ProductRowState
        title={props.title}
        subtitle={props.subtitle}
        bgColor={props.bgColor}
        message="所选商品暂不可展示"
      />
    );
  }

  const module = convertPuckProps("产品展示行", props);
  if (!module) return null;
  (module as any).content.products = products.map(toProductRowItem);

  return <ProductRowBlock module={module} />;
}

function ResolvedFeaturedProductBlock({ props }: { props: Record<string, any> }) {
  const productId = Number(props.productId);
  const hasValidProductId = Number.isInteger(productId) && productId > 0;
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(productId > 0);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!Number.isInteger(productId) || productId <= 0) {
      setProduct(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    void productApi.getPublicList({ ids: String(productId), pageSize: 1 })
      .then((response) => {
        const result = unwrapResponse<any>(response);
        const list: Product[] = result?.list || result || [];
        if (!cancelled) setProduct(list.find((item) => item.id === productId) || null);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [productId]);

  if (!hasValidProductId) return null;
  if (loading) return <ProductRowState title={props.title} bgColor={props.bgColor} message="正在加载主推商品" />;
  if (error) return <ProductRowState title={props.title} bgColor={props.bgColor} message="主推商品加载失败，请稍后重试" />;
  if (!product) return <ProductRowState title={props.title} bgColor={props.bgColor} message="所选主推商品已下架或暂不可展示" />;
  const module = convertPuckProps("单品焦点推荐", props);
  if (!module) return null;
  (module as any).content.product = toProductRowItem(product);
  return <FeaturedProductBlock module={module} />;
}

function ResolvedLookbookBlock({ props }: { props: Record<string, any> }) {
  const productIds = useMemo(
    () => Array.isArray(props.productIds)
      ? props.productIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
      : [],
    [props.productIds],
  );
  const idsKey = productIds.join(",");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(productIds.length > 0);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!idsKey) {
      setProducts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    void productApi.getPublicList({ ids: idsKey, pageSize: productIds.length, sortBy: "sortOrder" })
      .then((response) => {
        const result = unwrapResponse<any>(response);
        const list: Product[] = result?.list || result || [];
        const byId = new Map(list.map((item) => [item.id, item]));
        if (!cancelled) setProducts(productIds.map((id) => byId.get(id)).filter((item): item is Product => Boolean(item)));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [idsKey, productIds]);

  if (loading) return <ProductRowState title={props.title} subtitle={props.subtitle} bgColor={props.bgColor} message="正在加载关联商品" />;
  if (error) return <ProductRowState title={props.title} subtitle={props.subtitle} bgColor={props.bgColor} message="关联商品暂时加载失败" />;
  const module = convertPuckProps("佩戴灵感", props);
  if (!module) return null;
  (module as any).content.products = products.map(toProductRowItem);
  return <LookbookBlock module={module} />;
}

function renderBlock(block: PuckBlock, index: number) {
  const props = block.props || {};
  const key = props.id || `${block.type || "block"}-${index}`;

  if (props.isVisible === false) return null;

  if (block.type === "产品展示行") {
    return <ResolvedProductRowBlock key={key} props={props} />;
  }
  if (block.type === "单品焦点推荐") {
    return <ResolvedFeaturedProductBlock key={key} props={props} />;
  }
  if (block.type === "佩戴灵感") {
    return <ResolvedLookbookBlock key={key} props={props} />;
  }

  const module = convertPuckProps(block.type || "", props);
  if (!module) return null;

  switch (block.type) {
    case "首屏主视觉":
      return <HeroSection key={key} module={module} />;
    case "单图海报":
      return <SinglePosterSection key={key} module={module} />;
    case "双图海报":
      return <DoublePosterSection key={key} module={module} />;
    // 旧类型(分割面板/图文混排/礼赠指南)分支保留:
    // 已发布历史版本(revision)仍含这些类型,公开渲染永久兼容;
    // 编辑器侧已由 migratePuckData 转为新类型,模板库不再提供添加。
    case "图文混排":
      return <ImageTextBlock key={key} module={module} />;
    case "全屏出血图":
      return <FullBleedBlock key={key} module={module} />;
    case "文字横幅":
      return <TextBannerBlock key={key} module={module} />;
    case "作品画廊":
      return <AsymmetricGalleryBlock key={key} module={module} />;
    case "改款对比":
      return <BeforeAfterBlock key={key} module={module} />;
    case "分类卡片":
    case "按场景选购":
    case "礼赠指南":
      return <CategoryCardsBlock key={key} module={module} />;
    case "卡片网格":
      return <CardGridBlock key={key} module={module} />;
    case "分割面板":
      return <SplitPanelBlock key={key} module={module} />;
    case "轮播图":
      return <CarouselBlock key={key} module={module} />;
    case "视频区块":
      return <VideoBlock key={key} module={module} />;
    case "热区图":
      return <HotspotBlock key={key} module={module} />;
    case "预约入口":
      return <AppointmentBlock key={key} module={module} />;
    case "资质证书":
      return <CertificateBlock key={key} module={module} />;
    case "定制流程":
      return <CustomProcessBlock key={key} module={module} />;
    case "服务承诺":
      return <CardGridBlock key={key} module={module} />;
    case "门店信息":
      return <StoreInfoBlock key={key} module={module} />;
    case "限时活动":
      return <LimitedOfferBlock key={key} module={module} />;
    case "真实评价与实拍":
      return <TestimonialBlock key={key} module={module} />;
    default:
      return null;
  }
}

function GuardedBlock({ block, index }: { block: PuckBlock; index: number }) {
  const urlsKey = useMemo(() => getLocalUploadUrls(block.props || {}).join("\n"), [block.props]);
  const [hasMissingAsset, setHasMissingAsset] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const urls = urlsKey ? urlsKey.split("\n") : [];
    if (!urls.length) {
      setHasMissingAsset(false);
      return;
    }

    void Promise.all(
      urls.map((url) =>
        fetch(url, { method: "HEAD" })
          .then((response) => response.ok)
          .catch(() => false),
      ),
    ).then((available) => {
      if (!cancelled) setHasMissingAsset(available.some((value) => !value));
    });

    return () => {
      cancelled = true;
    };
  }, [urlsKey]);

  if (hasMissingAsset) return <MissingMediaState type={block.type} />;
  return renderBlock(block, index);
}

export default function PuckDocumentRenderer({ data }: { data: PuckDocument }) {
  if (!Array.isArray(data?.content)) return null;
  const zoneBlocks =
    data?.zones && typeof data.zones === "object"
      ? Object.entries(data.zones).flatMap(([, blocks]) =>
          Array.isArray(blocks) ? blocks : [],
        )
      : [];
  // 区块级兜底：单个 block 运行时抛错只跳过该区块，避免整页白屏
  const render = (block: PuckBlock, index: number) => {
    return (
      <ErrorBoundary key={`eb-${block.props?.id || index}`} fallback={null}>
        <GuardedBlock block={block} index={index} />
      </ErrorBoundary>
    );
  };
  return (
    <>
      {data.content.map(render)}
      {zoneBlocks.map((block, index) =>
        render(block, data.content!.length + index),
      )}
    </>
  );
}
