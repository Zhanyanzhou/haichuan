import { useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import CarouselBlock from "@/components/blocks/CarouselBlock";
import CardGridBlock from "@/components/blocks/CardGridBlock";
import CategoryCardsBlock from "@/components/blocks/CategoryCardsBlock";
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

function formatProductPrice(product: Product) {
  const price = Number(product.price || product.priceMin || 0);
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
type ProductStreamHandle = { stream: EventSource; listeners: Set<() => void> };
let productStreamHandle: ProductStreamHandle | null = null;
function subscribeProductStream(onTick: () => void): () => void {
  if (!productStreamHandle) {
    const stream = new EventSource(publicProductStreamUrl);
    const listeners = new Set<() => void>();
    stream.onmessage = () => {
      productStreamHandle?.listeners.forEach((cb) => cb());
    };
    productStreamHandle = { stream, listeners };
  }
  productStreamHandle.listeners.add(onTick);
  return () => {
    if (!productStreamHandle) return;
    productStreamHandle.listeners.delete(onTick);
    if (productStreamHandle.listeners.size === 0) {
      productStreamHandle.stream.close();
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

function renderBlock(block: PuckBlock, index: number) {
  const props = block.props || {};
  const key = props.id || `${block.type || "block"}-${index}`;

  if (props.isVisible === false) return null;

  if (block.type === "产品展示行") {
    return <ResolvedProductRowBlock key={key} props={props} />;
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
    case "图文混排":
      return <ImageTextBlock key={key} module={module} />;
    case "全屏出血图":
      return <FullBleedBlock key={key} module={module} />;
    case "文字横幅":
      return <TextBannerBlock key={key} module={module} />;
    case "分类卡片":
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
    default:
      return null;
  }
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
    const node = renderBlock(block, index);
    if (node === null) return null;
    return (
      <ErrorBoundary key={`eb-${block.props?.id || index}`} fallback={null}>
        {node}
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
