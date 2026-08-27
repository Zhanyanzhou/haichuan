import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
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
import CraftDetailsBlock from "@/components/blocks/CraftDetailsBlock";
import FullBleedBlock from "@/components/blocks/FullBleedBlock";
import HeroSection from "@/components/blocks/HeroSection";
import HotspotBlock from "@/components/blocks/HotspotBlock";
import ImageTextBlock from "@/components/blocks/ImageTextBlock";
import ProductRowBlock from "@/components/blocks/ProductRowBlock";
import SinglePosterSection from "@/components/blocks/SinglePosterSection";
import SplitPanelBlock from "@/components/blocks/SplitPanelBlock";
import TextBannerBlock from "@/components/blocks/TextBannerBlock";
import VideoBlock from "@/components/blocks/VideoBlock";
import { categoryApi, productApi, publicProductStreamUrl } from "@/services/api";
import { USE_MOCK } from "@/services/mockData";
import type { Product } from "@/types";
import { getListingImage } from "@/utils/productImage";
import { unwrapResponse } from "@/utils/unwrap";
import { convertPuckProps } from "@/page-builder/utils/puckPropsToModule";
import { createCatalogCategoryUrl, resolveLinkTargetUrl } from "@/page-builder/utils/linkTarget";
import {
  getContentTemplateIssues,
  sanitizeContentTemplateLayoutData,
} from "@/page-builder/generated/contentTemplates.generated";
import ContentTemplateContractFrame from "@/page-builder/runtime/ContentTemplateContractFrame";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import {
  normalizeLegacyRenderColors,
  useHasMissingAssets,
} from "@/page-builder/runtime/renderParity";
import type { PuckBlock, PuckDocument, PuckProps } from "@/page-builder/types";

export type { PuckBlock, PuckDocument } from "@/page-builder/types";

function UnsupportedContentTemplateState({
  type,
  message,
}: {
  type?: string;
  message: string;
}) {
  return (
    <section
      role="alert"
      style={{
        minHeight: 180,
        display: "grid",
        placeItems: "center",
        padding: "32px 24px",
        background: "#F4F5F5",
        border: "1px solid #B8BEC1",
        color: "#181A1B",
        textAlign: "center",
      }}
    >
      <div>
        <p style={{ margin: "0 0 8px", fontSize: 15 }}>模板版本无法渲染</p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
          {type ? `「${type}」` : "该区块"}{message}
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
    link: `/products/${encodeURIComponent(product.code || String(product.id))}`,
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
        background: bgColor || "#FFFFFF",
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
                  color: "#181A1B",
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
                  color: "#5F6568",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
        )}
        <p style={{ color: "#6E7477", fontSize: 13 }}>{message}</p>
      </div>
    </section>
  );
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function PublicMediaFallback({
  type,
  props,
  headingLevel,
}: {
  type?: string;
  props: PuckProps;
  headingLevel: 1 | 2;
}) {
  const eyebrow = [props.number, props.label, props.eyebrow]
    .map(textValue)
    .filter(Boolean)
    .join(" / ");
  const title = textValue(props.title);
  const body = textValue(
    props.body || props.subtitle || props.description || props.summary,
  );
  const actionText = textValue(
    props.actionText || props.buttonText || props.primaryText,
  );
  const targetUrl = resolveLinkTargetUrl({
    targetType: typeof props.targetType === "string" ? props.targetType : undefined,
    productCode: typeof props.productCode === "string" ? props.productCode : undefined,
    productId: typeof props.productId === "string" || typeof props.productId === "number" ? props.productId : undefined,
    linkUrl: typeof props.linkUrl === "string" ? props.linkUrl : undefined,
  });
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const isHero = type === "首屏主视觉";
  const background = isHero ? "#111315" : textValue(props.bgColor) || "#FFFFFF";
  const ink = isHero ? "#F7F8F8" : "#181A1B";
  const muted = isHero ? "rgba(247,248,248,.76)" : "#5F6568";

  if (!eyebrow && !title && !body && !(actionText && targetUrl)) return null;

  return (
    <DecorSection
      master="editorial-text"
      width="narrow"
      background={background}
      className="hc-public-media-fallback"
      data-media-fallback-for={type || "unknown"}
      style={isHero ? { minHeight: "max(520px, 100svh)", display: "grid", alignItems: "center" } : undefined}
    >
      <div style={{ maxWidth: 720, marginInline: "auto", textAlign: "center" }}>
        {eyebrow ? (
          <p style={{ margin: "0 0 18px", color: muted, fontFamily: FONT_SANS, fontSize: 11, letterSpacing: ".18em" }}>
            {eyebrow}
          </p>
        ) : null}
        {title ? (
          <Heading style={{ margin: 0, color: ink, fontFamily: FONT_DISPLAY, fontSize: "clamp(28px,3.2vw,48px)", fontWeight: 500, lineHeight: 1.25 }}>
            {title}
          </Heading>
        ) : null}
        {body ? (
          <p style={{ maxWidth: 720, margin: title ? "22px auto 0" : 0, color: muted, fontSize: 15, lineHeight: 1.9 }}>
            {body}
          </p>
        ) : null}
        {actionText && targetUrl ? (
          <Link
            to={targetUrl}
            style={{ display: "inline-flex", minHeight: 44, alignItems: "center", marginTop: 28, color: ink, fontFamily: FONT_SANS, fontSize: 13, letterSpacing: ".08em", textDecoration: "none", borderBottom: "1px solid currentColor" }}
          >
            {actionText}
          </Link>
        ) : null}
      </div>
    </DecorSection>
  );
}

function hasRequiredPublicMedia(block: PuckBlock) {
  const props = block.props || {};
  switch (block.type) {
    case "首屏主视觉":
      return Boolean(textValue(props.desktopImage) || textValue(props.mobileImage));
    case "全屏出血图":
      return Boolean(textValue(props.image) || textValue(props.mobileImage));
    case "单图海报":
      return Boolean(textValue(props.desktopImage) || textValue(props.mobileImage));
    case "双图海报":
      return Boolean(textValue(props.mainImage));
    case "作品画廊":
      return Array.isArray(props.items)
        && props.items.some((item: unknown) => Boolean(textValue((item as Record<string, unknown>)?.image)));
    default:
      return true;
  }
}

function suppressHomeSecondaryActions(props: PuckProps): PuckProps {
  return {
    ...props,
    actionText: "",
    buttonText: "",
    primaryText: "",
    secondaryText: "",
  };
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
      const stream = new EventSource(publicProductStreamUrl());
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

function usePublicProductRevision(active: boolean) {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (USE_MOCK || !active) return;
    return subscribeProductStream(() => setRevision((value) => value + 1));
  }, [active]);

  return revision;
}

function ResolvedProductRowBlock({
  props,
  codeOnly = false,
}: {
  props: PuckProps;
  codeOnly?: boolean;
}) {
  const productIds = useMemo(
    () =>
      !codeOnly && Array.isArray(props.productIds)
        ? props.productIds
          .map((id: unknown) => Number(id))
          .filter((id: number) => Number.isInteger(id) && id > 0)
        : [],
    [codeOnly, props.productIds],
  );
  const productCodes = useMemo(
    () => Array.isArray(props.productCodes)
      ? props.productCodes.map(String).map((code: string) => code.trim()).filter(Boolean)
      : [],
    [props.productCodes],
  );
  const idsKey = productIds.join(",");
  const codesKey = productCodes.join(",");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(productCodes.length + productIds.length > 0);
  const [error, setError] = useState(false);
  const revision = usePublicProductRevision(productCodes.length + productIds.length > 0);

  useEffect(() => {
    if (productCodes.length === 0 && productIds.length === 0) {
      setProducts([]);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(false);

    (async () => {
      try {
        const response = await productApi.getPublicList({
          ...(productCodes.length ? { codes: codesKey } : { ids: idsKey }),
          pageSize: productCodes.length || productIds.length,
          sortBy: "sortOrder",
        }, controller.signal);
        const data = unwrapResponse<{ list?: Product[] } | Product[]>(response);
        const list = Array.isArray(data) ? data : data.list ?? [];
        const byReference = new Map(list.map((product) => [productCodes.length ? product.code : product.id, product]));
        const ordered = (productCodes.length ? productCodes : productIds)
          .map((reference) => byReference.get(reference))
          .filter((product): product is Product => Boolean(product && getListingImage(product)));
        if (!cancelled) setProducts(ordered);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [codesKey, idsKey, productCodes, productIds, revision]);

  if (productCodes.length === 0 && productIds.length === 0) return null;
  if (loading) {
    return (
      <ProductRowState
        title={textValue(props.title)}
        subtitle={textValue(props.subtitle)}
        bgColor={textValue(props.bgColor)}
        message="正在加载精选商品"
      />
    );
  }
  if (error) {
    return (
      <ProductRowState
        title={textValue(props.title)}
        subtitle={textValue(props.subtitle)}
        bgColor={textValue(props.bgColor)}
        message="精选商品暂时加载失败"
      />
    );
  }
  if (products.length === 0) {
    return (
      <ProductRowState
        title={textValue(props.title)}
        subtitle={textValue(props.subtitle)}
        bgColor={textValue(props.bgColor)}
        message="所选商品暂不可展示"
      />
    );
  }

  const module = convertPuckProps("产品展示行", props);
  if (!module) return null;
  module.content.products = products.map(toProductRowItem);
  if (codeOnly) {
    module.content.displayMode = "album";
    module.content.showPrice = false;
    module.content.showButton = false;
    module.content.actionStyle = "none";
    module.content.mobileColumns = 1;
    module.content.layout = products.length === 2 ? "grid-2" : "grid-3";
  }

  const productRow = <ProductRowBlock module={module} />;
  return codeOnly ? (
    <div
      className="hc-home-product-row"
      data-home-product-count={Math.min(products.length, 3)}
    >
      {productRow}
    </div>
  ) : productRow;
}

function ResolvedFeaturedProductBlock({
  props,
  editMode = false,
  codeOnly = false,
}: {
  props: PuckProps;
  editMode?: boolean;
  codeOnly?: boolean;
}) {
  const productId = Number(props.productId);
  const productCode = String(props.productCode || "").trim();
  const hasValidProductId = Boolean(productCode) || (!codeOnly && Number.isInteger(productId) && productId > 0);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(Boolean(productCode) || (!codeOnly && productId > 0));
  const [error, setError] = useState(false);
  const revision = usePublicProductRevision(hasValidProductId);

  useEffect(() => {
    if (!productCode && (codeOnly || !Number.isInteger(productId) || productId <= 0)) {
      setProduct(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void productApi.getPublicList(productCode ? { codes: productCode, pageSize: 1 } : { ids: String(productId), pageSize: 1 }, controller.signal)
      .then((response) => {
        const result = unwrapResponse<{ list?: Product[] } | Product[]>(response);
        const list = Array.isArray(result) ? result : result.list ?? [];
        if (!cancelled) {
          const resolved = list.find((item) => productCode ? item.code === productCode : item.id === productId);
          setProduct(resolved && getListingImage(resolved) ? resolved : null);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; controller.abort(); };
  }, [codeOnly, productCode, productId, revision]);

  if (!hasValidProductId) {
    if (!editMode) return null;
    const module = convertPuckProps("单品焦点推荐", props);
    return module ? <FeaturedProductBlock module={module} editMode /> : null;
  }
  if (loading) return <ProductRowState title={textValue(props.title)} bgColor={textValue(props.bgColor)} message="正在加载主推商品" />;
  if (error) return <ProductRowState title={textValue(props.title)} bgColor={textValue(props.bgColor)} message="主推商品加载失败，请稍后重试" />;
  if (!product) return <ProductRowState title={textValue(props.title)} bgColor={textValue(props.bgColor)} message="所选主推商品已下架或暂不可展示" />;
  const module = convertPuckProps("单品焦点推荐", props);
  if (!module) return null;
  module.content.product = toProductRowItem(product);
  if (codeOnly) module.content.showPrice = false;
  return <FeaturedProductBlock module={module} editMode={editMode} />;
}

function ResolvedLookbookBlock({ props }: { props: PuckProps }) {
  const productIds = useMemo(
    () => Array.isArray(props.productIds)
      ? props.productIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
      : [],
    [props.productIds],
  );
  const productCodes = useMemo(
    () => Array.isArray(props.productCodes) ? props.productCodes.map(String).filter(Boolean) : [],
    [props.productCodes],
  );
  const idsKey = productIds.join(",");
  const codesKey = productCodes.join(",");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(productCodes.length + productIds.length > 0);
  const [error, setError] = useState(false);
  const revision = usePublicProductRevision(productCodes.length + productIds.length > 0);

  useEffect(() => {
    if (!idsKey && !codesKey) {
      setProducts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void productApi.getPublicList(productCodes.length
      ? { codes: codesKey, pageSize: productCodes.length, sortBy: "sortOrder" }
      : { ids: idsKey, pageSize: productIds.length, sortBy: "sortOrder" }, controller.signal)
      .then((response) => {
        const result = unwrapResponse<{ list?: Product[] } | Product[]>(response);
        const list = Array.isArray(result) ? result : result.list ?? [];
        const byReference = new Map(list.map((item) => [productCodes.length ? item.code : item.id, item]));
        const references = productCodes.length ? productCodes : productIds;
        if (!cancelled) setProducts(references.map((reference) => byReference.get(reference)).filter((item): item is Product => Boolean(item && getListingImage(item))));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; controller.abort(); };
  }, [codesKey, idsKey, productCodes, productIds, revision]);

  if (loading) return <ProductRowState title={textValue(props.title)} subtitle={textValue(props.subtitle)} bgColor={textValue(props.bgColor)} message="正在加载关联商品" />;
  if (error) return <ProductRowState title={textValue(props.title)} subtitle={textValue(props.subtitle)} bgColor={textValue(props.bgColor)} message="关联商品暂时加载失败" />;
  const module = convertPuckProps("佩戴灵感", props);
  if (!module) return null;
  module.content.products = products.map(toProductRowItem);
  return <LookbookBlock module={module} />;
}

interface PublicCategoryNode {
  id: number;
  slug: string;
  name: string;
  coverImage?: string | null;
  children?: PublicCategoryNode[];
}

function flattenCategoryNodes(nodes: PublicCategoryNode[]): PublicCategoryNode[] {
  return nodes.flatMap((node) => [node, ...flattenCategoryNodes(node.children ?? [])]);
}

function ResolvedCategoryCardsBlock({ props }: { props: PuckProps }) {
  const slugs = useMemo(
    () => Array.isArray(props.categorySlugs) ? props.categorySlugs.map(String).filter(Boolean) : [],
    [props.categorySlugs],
  );
  const [categories, setCategories] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(slugs.length > 0);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slugs.length) { setCategories([]); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void categoryApi.getTree(controller.signal)
      .then((response) => {
        const data = unwrapResponse<PublicCategoryNode[]>(response);
        const bySlug = new Map(flattenCategoryNodes(Array.isArray(data) ? data : []).map((node) => [node.slug, node]));
        if (!controller.signal.aborted) setCategories(slugs.flatMap((slug) => {
          const node = bySlug.get(slug);
          return node?.coverImage ? [{ name: node.name, image: node.coverImage, link: createCatalogCategoryUrl(node.id), altText: node.name }] : [];
        }));
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slugs]);

  if (loading) return <ProductRowState title={textValue(props.title)} subtitle={textValue(props.subtitle)} bgColor={textValue(props.bgColor)} message="正在加载分类导航" />;
  if (error) return <ProductRowState title={textValue(props.title)} subtitle={textValue(props.subtitle)} bgColor={textValue(props.bgColor)} message="分类导航暂时加载失败" />;
  if (categories.length === 0) return <ProductRowState title={textValue(props.title)} subtitle={textValue(props.subtitle)} bgColor={textValue(props.bgColor)} message="所选分类当前不可展示" />;
  const module = convertPuckProps("分类卡片", { ...props, categories });
  return module ? <CategoryCardsBlock module={module} /> : null;
}

export type PuckDocumentRenderMode = "public" | "preview";

function renderBlock(
  block: PuckBlock,
  index: number,
  mode: PuckDocumentRenderMode,
  heroHeadingLevel: 1 | 2,
  homeSurface: boolean,
  allowHomePrimaryAction: boolean,
) {
  const normalized = normalizeLegacyRenderColors(block.props || {});
  const contractProps: PuckProps = normalized && typeof normalized === "object" && !Array.isArray(normalized)
    ? normalized as PuckProps
    : {};
  const props = homeSurface && !allowHomePrimaryAction
    ? suppressHomeSecondaryActions(contractProps)
    : contractProps;
  const key = textValue(props.id) || `${block.type || "block"}-${index}`;
  const preview = mode === "preview";
  const wrap = (node: ReactNode) => (
    <ContentTemplateContractFrame
      key={key}
      moduleType={block.type || ""}
      mode="public"
      props={contractProps}
    >
      {node}
    </ContentTemplateContractFrame>
  );

  if (props.isVisible === false) return null;

  const renderValidationProps = props.__instanceOverrides === undefined
    ? props
    : {
        ...props,
        __instanceOverrides: sanitizeContentTemplateLayoutData(
          block.type || "",
          props.__instanceOverrides,
        ),
      };
  const templateIssue = getContentTemplateIssues({
    moduleType: block.type,
    props: renderValidationProps,
    blockId: props.id,
    path: `content[${index}].props.__contentTemplate`,
  }).find((issue) => issue.severity === "error");
  if (templateIssue) {
    return (
      <UnsupportedContentTemplateState
        key={key}
        type={block.type}
        message={templateIssue.message}
      />
    );
  }

  if (block.type === "产品展示行") {
    return wrap(<ResolvedProductRowBlock props={props} codeOnly={homeSurface} />);
  }
  if (block.type === "单品焦点推荐") {
    return wrap(<ResolvedFeaturedProductBlock props={props} editMode={preview} codeOnly={homeSurface} />);
  }
  if (block.type === "佩戴灵感") {
    return wrap(<ResolvedLookbookBlock props={props} />);
  }
  if (block.type === "分类卡片" && Array.isArray(props.categorySlugs) && props.categorySlugs.length > 0) {
    return wrap(<ResolvedCategoryCardsBlock props={props} />);
  }

  if (!preview && !hasRequiredPublicMedia({ ...block, props })) {
    return wrap(
      <PublicMediaFallback
        type={block.type}
        props={props}
        headingLevel={block.type === "首屏主视觉" ? heroHeadingLevel : 2}
      />,
    );
  }

  const module = convertPuckProps(block.type || "", props);
  if (!module) return null;
  switch (block.type) {
    case "首屏主视觉":
      return wrap(
        <HeroSection
          module={module}
          editMode={preview}
          headingLevel={heroHeadingLevel}
        />,
      );
    case "单图海报":
      return wrap(<SinglePosterSection module={module} editMode={preview} />);
    case "双图海报":
      return wrap(<DoublePosterSection module={module} editMode={preview} />);
    case "工艺细节":
      return wrap(<CraftDetailsBlock module={module} editMode={preview} />);
    // 旧类型(分割面板/图文混排/礼赠指南)分支保留:
    // 已发布历史版本(revision)仍含这些类型,公开渲染永久兼容;
    // 编辑器侧已由 migratePuckData 转为新类型,模板库不再提供添加。
    case "图文混排":
      return <ImageTextBlock key={key} module={module} />;
    case "全屏出血图":
      return wrap(<FullBleedBlock module={module} editMode={preview} />);
    case "文字横幅":
      return wrap(homeSurface ? (
        <div className="hc-home-text-banner">
          <TextBannerBlock module={module} editMode={preview} />
        </div>
      ) : <TextBannerBlock module={module} editMode={preview} />);
    case "作品画廊":
      return wrap(<AsymmetricGalleryBlock module={module} editMode={preview} />);
    case "改款对比":
      return wrap(<BeforeAfterBlock module={module} />);
    case "分类卡片":
    case "按场景选购":
    case "礼赠指南":
      return block.type === "礼赠指南"
        ? <CategoryCardsBlock key={key} module={module} />
        : wrap(<CategoryCardsBlock module={module} />);
    case "卡片网格":
      return wrap(homeSurface ? (
        <div className="hc-home-brand-points">
          <CardGridBlock module={module} contentTemplateKey="brandPoints" />
        </div>
      ) : <CardGridBlock module={module} contentTemplateKey="brandPoints" />);
    case "分割面板":
      return <SplitPanelBlock key={key} module={module} />;
    case "轮播图":
      return wrap(<CarouselBlock module={module} />);
    case "视频区块":
      return wrap(<VideoBlock module={module} />);
    case "热区图":
      return wrap(<HotspotBlock module={module} />);
    case "预约入口":
      return wrap(homeSurface ? (
        <div className="hc-home-booking">
          <AppointmentBlock module={module} editMode={preview} />
        </div>
      ) : <AppointmentBlock module={module} editMode={preview} />);
    case "资质证书":
      return wrap(<CertificateBlock module={module} />);
    case "定制流程":
      return wrap(<CustomProcessBlock module={module} />);
    case "服务承诺":
      return wrap(
        <CardGridBlock module={module} contentTemplateKey="servicePromises" />,
      );
    case "门店信息":
      return wrap(<StoreInfoBlock module={module} />);
    case "限时活动":
      return wrap(<LimitedOfferBlock module={module} />);
    case "真实评价与实拍":
      return wrap(<TestimonialBlock module={module} />);
    default:
      return null;
  }
}

function GuardedBlock({
  block,
  index,
  mode,
  heroHeadingLevel,
  homeSurface,
  allowHomePrimaryAction,
}: {
  block: PuckBlock;
  index: number;
  mode: PuckDocumentRenderMode;
  heroHeadingLevel: 1 | 2;
  homeSurface: boolean;
  allowHomePrimaryAction: boolean;
}) {
  const hasMissingAsset = useHasMissingAssets(block.props || {});

  if (hasMissingAsset && mode === "public") {
    const normalized = normalizeLegacyRenderColors(block.props || {});
    const normalizedProps: PuckProps = normalized && typeof normalized === "object" && !Array.isArray(normalized)
      ? normalized as PuckProps
      : {};
    const fallbackProps = homeSurface && !allowHomePrimaryAction
      ? suppressHomeSecondaryActions(normalizedProps)
      : normalizedProps;
    return (
      <PublicMediaFallback
        type={block.type}
        props={fallbackProps}
        headingLevel={block.type === "首屏主视觉" ? heroHeadingLevel : 2}
      />
    );
  }
  return renderBlock(
    block,
    index,
    mode,
    heroHeadingLevel,
    homeSurface,
    allowHomePrimaryAction,
  );
}

export default function PuckDocumentRenderer({
  data,
  mode = "public",
  heroHeadingLevel = 1,
  primaryHeading,
  surface,
}: {
  data: PuckDocument;
  mode?: PuckDocumentRenderMode;
  heroHeadingLevel?: 1 | 2;
  /** 纯装修公开页的页面标题；无有效 Hero 标题时补为唯一的视觉隐藏 h1。 */
  primaryHeading?: string;
  surface?: "home";
}) {
  if (!Array.isArray(data?.content)) return null;
  const zoneBlocks =
    data?.zones && typeof data.zones === "object"
      ? Object.entries(data.zones).flatMap(([, blocks]) =>
          Array.isArray(blocks) ? blocks : [],
        )
      : [];
  const homeSurface = surface === "home";
  const allBlocks = [...data.content, ...zoneBlocks];
  const primaryHeroIndex = allBlocks.findIndex((block) =>
    block.type === "首屏主视觉"
    && block.props?.isVisible !== false
    && typeof block.props?.title === "string"
    && block.props.title.trim().length > 0,
  );
  const homePrimaryHeroIndex = homeSurface
    ? allBlocks.findIndex((block) =>
        block.type === "首屏主视觉" && block.props?.isVisible !== false,
      )
    : -1;
  // 区块级兜底：单个 block 运行时抛错只跳过该区块，避免整页白屏
  const render = (block: PuckBlock, index: number) => {
    const blockHeroHeadingLevel = index === primaryHeroIndex
      ? heroHeadingLevel
      : 2;
    return (
      <ErrorBoundary
        key={`eb-${block.props?.id || index}`}
        fallback={
          <section role="status" style={{ padding: "48px 24px", textAlign: "center", color: "#5F6568" }}>
            该内容暂不可展示
          </section>
        }
      >
        <GuardedBlock
          block={block}
          index={index}
          mode={mode}
          heroHeadingLevel={blockHeroHeadingLevel}
          homeSurface={homeSurface}
          allowHomePrimaryAction={homeSurface && index === homePrimaryHeroIndex}
        />
      </ErrorBoundary>
    );
  };
  return (
    <div className="hc-public-document" data-home-surface={homeSurface ? "true" : undefined}>
      <style>{`
        .hc-public-document { min-width: 0; background: #FFFFFF; }
        .hc-public-document[data-home-surface="true"] .hc-section {
          --hc-px: 20px;
          --hc-py-brand: 64px;
        }
        .hc-public-document[data-home-surface="true"] .hc-content-template__body { max-width: 720px; }
        .hc-public-document[data-home-surface="true"] .hc-phase1-hero__copy { max-width: 520px; }
        .hc-public-document a:focus-visible {
          outline: 2px solid currentColor;
          outline-offset: 4px;
        }
        @media (min-width: 768px) {
          .hc-public-document[data-home-surface="true"] .hc-section {
            --hc-px: clamp(48px, 5.55vw, 80px);
            --hc-py-brand: 96px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .hc-public-document *,
          .hc-public-document *::before,
          .hc-public-document *::after {
            scroll-behavior: auto !important;
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
      {primaryHeading && (primaryHeroIndex < 0 || heroHeadingLevel !== 1) ? (
        <h1 className="sr-only">{primaryHeading}</h1>
      ) : null}
      {data.content.map(render)}
      {zoneBlocks.map((block, index) =>
        render(block, data.content!.length + index),
      )}
    </div>
  );
}
