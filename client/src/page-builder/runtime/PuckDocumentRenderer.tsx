import { useEffect, useMemo, useState } from "react";
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
import type { PageModule } from "@/types/pageModule";
import { getListingImage } from "@/utils/productImage";
import { unwrapResponse } from "@/utils/unwrap";

type PuckBlock = {
  type?: string;
  props?: Record<string, any>;
};

type PuckDocument = {
  content?: PuckBlock[];
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
    const stream = new EventSource(publicProductStreamUrl);
    stream.onmessage = () => setRevision((value) => value + 1);
    return () => stream.close();
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

  return (
    <ProductRowBlock
      module={baseModule(
        "productRow",
        {
          title: props.title,
          subtitle: props.subtitle,
          products: products.map(toProductRowItem),
          productIds,
          layout: props.layout,
        },
        {},
        { bgColor: props.bgColor || "#FCFCFB" },
      )}
    />
  );
}

function baseModule(
  moduleType: string,
  content: Record<string, any>,
  layoutConfig: Record<string, any> = {},
  styleConfig: Record<string, any> = {},
): PageModule {
  return {
    id: 0,
    pageKey: "home",
    moduleType,
    sortOrder: 0,
    isVisible: true,
    status: "PUBLISHED",
    content,
    layoutConfig: layoutConfig as PageModule["layoutConfig"],
    styleConfig: styleConfig as PageModule["styleConfig"],
    createdAt: "",
    updatedAt: "",
  };
}

function renderBlock(block: PuckBlock, index: number) {
  const props = block.props || {};
  const key = props.id || `${block.type || "block"}-${index}`;

  if (props.isVisible === false) return null;

  switch (block.type) {
    case "首屏主视觉":
      return (
        <HeroSection
          key={key}
          module={baseModule(
            "hero",
            {
              desktopImage: props.desktopImage,
              mobileImage: props.mobileImage,
              title: props.title,
              subtitle: props.subtitle,
              actionText: props.actionText,
              linkUrl: props.linkUrl,
              altText: props.altText,
            },
            { template: props.alignment || "overlay" },
            { focusX: props.focusX ?? 50, focusY: props.focusY ?? 50 },
          )}
        />
      );
    case "单图海报":
      return (
        <SinglePosterSection
          key={key}
          module={baseModule(
            "singlePoster",
            {
              number: props.number,
              label: props.label,
              title: props.title,
              subtitle: props.subtitle,
              desktopImage: props.desktopImage,
              mobileImage: props.mobileImage,
              linkUrl: props.linkUrl,
            },
            { template: props.template || "leftTextRightImage" },
            { focusX: props.focusX ?? 50, focusY: props.focusY ?? 50 },
          )}
        />
      );
    case "双图海报":
      return (
        <DoublePosterSection
          key={key}
          module={baseModule(
            "doublePoster",
            {
              number: props.number,
              label: props.label,
              title: props.title,
              description: props.description,
              mainImage: props.mainImage,
              detailImage: props.detailImage,
              linkUrl: props.linkUrl,
            },
            { template: "leftBigRightSmall" },
            {
              mainFocusX: props.mainFocusX ?? 50,
              mainFocusY: props.mainFocusY ?? 50,
              detailFocusX: props.detailFocusX ?? 50,
              detailFocusY: props.detailFocusY ?? 50,
            },
          )}
        />
      );
    case "图文混排":
      return (
        <ImageTextBlock
          key={key}
          module={baseModule(
            "imageText",
            {
              label: props.label,
              title: props.title,
              body: props.body,
              image: props.image,
              imagePosition: props.imagePosition,
              buttonText: props.buttonText,
              linkUrl: props.linkUrl,
            },
            { template: props.template || "textLeftImageRight" },
            { spacing: props.spacing || "normal" },
          )}
        />
      );
    case "全屏出血图":
      return (
        <FullBleedBlock
          key={key}
          module={baseModule(
            "fullBleed",
            {
              image: props.image,
              mobileImage: props.mobileImage,
              title: props.title,
              subtitle: props.subtitle,
              buttonText: props.buttonText,
              linkUrl: props.linkUrl,
            },
            { template: props.template || "textCenter" },
            { bgColor: props.overlay || "rgba(15,13,12,0.2)" },
          )}
        />
      );
    case "文字横幅":
      return (
        <TextBannerBlock
          key={key}
          module={baseModule(
            "textBanner",
            {
              eyebrow: props.eyebrow,
              title: props.title,
              body: props.body,
              buttonText: props.buttonText,
              linkUrl: props.linkUrl,
            },
            { template: props.template || "center" },
            {
              bgColor: props.bgColor || "#FBF9F6",
              textColor: props.textColor || "#2C2C2C",
              spacing: props.spacing || "normal",
            },
          )}
        />
      );
    case "产品展示行":
      return <ResolvedProductRowBlock key={key} props={props} />;
    case "分类卡片":
      return (
        <CategoryCardsBlock
          key={key}
          module={baseModule(
            "categoryCards",
            {
              title: props.title,
              categoryId: props.categoryId,
              categories: props.categories || [],
              layout: props.layout,
            },
            {},
            { bgColor: props.bgColor || "#FBF9F6" },
          )}
        />
      );
    case "卡片网格":
      return (
        <CardGridBlock
          key={key}
          module={baseModule(
            "cardGrid",
            {
              title: props.title,
              subtitle: props.subtitle,
              cards: props.cards || [],
              layout: props.layout,
            },
            {},
            { bgColor: props.bgColor || "#FCFCFB" },
          )}
        />
      );
    case "分割面板":
      return (
        <SplitPanelBlock
          key={key}
          module={baseModule(
            "splitPanel",
            {
              image: props.image,
              title: props.title,
              subtitle: props.subtitle,
              body: props.body,
              buttonText: props.buttonText,
              linkUrl: props.linkUrl,
            },
            {
              template: props.template || "imageLeft",
              split: props.split || "50-50",
            },
            {
              bgColor: props.bgColor || "#FCFCFB",
              textColor: props.textBg || "#fff",
            },
          )}
        />
      );
    case "轮播图":
      return (
        <CarouselBlock
          key={key}
          module={baseModule(
            "carousel",
            {
              images: props.images || [],
              autoPlay: props.autoPlay,
              interval: props.interval || 4000,
              showDots: props.showDots,
              showArrows: props.showArrows,
            },
            { height: props.height || 500, mobileHeight: props.mobileHeight || 640 },
          )}
        />
      );
    case "视频区块":
      return (
        <VideoBlock
          key={key}
          module={baseModule(
            "video",
            {
              videoUrl: props.videoUrl,
              posterUrl: props.posterUrl,
              autoPlay: props.autoPlay,
              loop: props.loop,
              muted: props.muted,
              showControls: props.showControls,
              aspectRatio: props.aspectRatio || "16:9",
            },
            { maxHeight: props.maxHeight || 720 },
          )}
        />
      );
    case "热区图":
      return (
        <HotspotBlock
          key={key}
          module={baseModule("hotspot", {
            image: props.image,
            mobileImage: props.mobileImage,
            hotspots: props.hotspots || [],
          })}
        />
      );
    default:
      return null;
  }
}

export default function PuckDocumentRenderer({ data }: { data: PuckDocument }) {
  if (!Array.isArray(data?.content)) return null;
  return <>{data.content.map(renderBlock)}</>;
}
