import { lazy, Suspense, type ReactNode } from "react";
import { convertPuckProps } from "../utils/puckPropsToModule";
import ContentTemplateContractFrame from "../runtime/ContentTemplateContractFrame";
import type {
  DynamicTemplateNodeProps,
  DynamicTemplateSlotType,
} from "./generated/templateDefinition.generated";
import {
  MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE,
  type MatureContentTemplateSlotType,
} from "./validateTemplateDefinition";

const VideoBlock = lazy(() => import("@/components/blocks/VideoBlock"));
const CarouselBlock = lazy(() => import("@/components/blocks/CarouselBlock"));
const HotspotBlock = lazy(() => import("@/components/blocks/HotspotBlock"));
const BeforeAfterBlock = lazy(() => import("@/components/blocks/BeforeAfterBlock"));
const AppointmentBlock = lazy(() => import("@/components/blocks/AppointmentBlock"));
const FeaturedProductPreview = lazy(() => import("../adapters/featuredProduct.puck").then((module) => ({ default: module.FeaturedProductPreview })));
const ProductRowPreview = lazy(() => import("../adapters/productRow.puck").then((module) => ({ default: module.ProductRowPreview })));
const CategoryCardsPreview = lazy(() => import("../adapters/categoryCards.puck").then((module) => ({ default: module.CategoryCardsPreview })));
const ResolvedProductRowBlock = lazy(() => import("../runtime/ResolvedBusinessTemplateBlocks").then((module) => ({ default: module.ResolvedProductRowBlock })));
const ResolvedFeaturedProductBlock = lazy(() => import("../runtime/ResolvedBusinessTemplateBlocks").then((module) => ({ default: module.ResolvedFeaturedProductBlock })));
const ResolvedCategoryCardsBlock = lazy(() => import("../runtime/ResolvedBusinessTemplateBlocks").then((module) => ({ default: module.ResolvedCategoryCardsBlock })));
const MatureContentTemplateRenderer = lazy(() => import("./MatureContentTemplateRenderer"));

export interface DynamicTemplateNodeAdapterContext {
  content: unknown;
  mode: "public" | "editor" | "preview" | "thumbnail";
  nodeProps?: DynamicTemplateNodeProps;
  headingLevel?: 1 | 2;
}

export interface DynamicTemplateNodeAdapter {
  render: (context: DynamicTemplateNodeAdapterContext) => ReactNode;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function withTemplateDesign(
  content: unknown,
  nodeProps: DynamicTemplateNodeProps | undefined,
  defaults: Record<string, unknown>,
) {
  const record = asRecord(content);
  const design = nodeProps?.contentTemplateDesignProps ?? {};
  return {
    record,
    design,
    props: { ...defaults, ...record, ...design },
  };
}

const VIDEO_DEFAULTS: Record<string, unknown> = {
  videoUrl: "",
  posterUrl: "",
  videoDescription: "",
  title: "",
  subtitle: "",
  actionText: "",
  linkUrl: "",
  targetType: "none",
  productId: 0,
  autoPlay: false,
  loop: true,
  muted: true,
  showControls: true,
  aspectRatio: "16:9",
  maxHeight: 720,
  videoWidth: "standard",
  bgColor: "#FFFFFF",
  focusX: 50,
  focusY: 50,
};

const CAROUSEL_DEFAULTS: Record<string, unknown> = {
  images: [],
  autoPlay: true,
  interval: 4000,
  showDots: true,
  showArrows: true,
  desktopRatio: "wide",
  mobileRatio: "portrait",
};

const HOTSPOT_DEFAULTS: Record<string, unknown> = {
  image: "",
  mobileImage: "",
  altText: "",
  hotspots: [],
  mobileHotspots: [],
};

const BEFORE_AFTER_DEFAULTS: Record<string, unknown> = {
  title: "珠宝改款",
  subtitle: "旧物的情感，以新的形态延续。",
  beforeImage: "",
  afterImage: "",
  beforeLabel: "改款前",
  afterLabel: "改款后",
  beforeAltText: "",
  afterAltText: "",
  beforeFocusX: 50,
  beforeFocusY: 50,
  afterFocusX: 50,
  afterFocusY: 50,
  actionText: "",
  targetType: "none",
  linkUrl: "",
  productId: 0,
  bgColor: "#FFFFFF",
};

const APPOINTMENT_DEFAULTS: Record<string, unknown> = {
  backgroundImage: "",
  title: "预约鉴赏",
  subtitle: "一对一珠宝顾问，为您安排专属服务",
  buttonText: "立即预约",
  targetType: "page",
  linkUrl: "/contact",
  altText: "",
  desktopFocusX: 50,
  desktopFocusY: 50,
  mobileFocusX: 50,
  mobileFocusY: 50,
  tone: "ivory",
  bgColor: "#FFFFFF",
};

const PRODUCT_CARD_DEFAULTS = {
  eyebrow: "SIGNATURE PIECE",
  title: "代表作品",
  summary: "为重要时刻挑选一件值得珍藏的珠宝。",
  productId: 0,
  productCode: "",
  primaryText: "查看作品",
  secondaryText: "预约鉴赏",
  secondaryLink: "/contact",
  secondaryTargetType: "page" as const,
  secondaryProductCode: "",
  secondaryProductId: 0,
  secondaryCategorySlug: "",
  secondaryLinkUrl: "/contact",
  layout: "imageLeft" as const,
  showPrice: false,
  bgColor: "#FFFFFF",
};

const PRODUCT_COLLECTION_DEFAULTS = {
  title: "精选商品",
  subtitle: "",
  productIds: [] as number[],
  productCodes: [] as string[],
  layout: "grid-3",
  mobileColumns: 2,
  displayMode: "standard",
  actionStyle: "text",
  bgColor: "#FFFFFF",
  showPrice: true,
  showButton: false,
  buttonText: "查看详情",
};

const CATEGORY_COLLECTION_DEFAULTS = {
  title: "探索分类",
  subtitle: "按品类、系列或主题，找到适合你的珠宝作品。",
  categories: [],
  categorySlugs: [] as string[],
  layout: "grid-3",
  bgColor: "#FFFFFF",
};

function adapterFallback(label: string, record: Record<string, unknown>) {
  const image = [record.posterUrl, record.image, record.backgroundImage, record.beforeImage]
    .find((value): value is string => typeof value === "string" && value.length > 0);
  return (
    <div
      className="hc-dynamic-template__adapter-loading"
      aria-busy="true"
      aria-label={`${label}正在加载`}
      style={{ minHeight: 160, background: "#F4F5F5", overflow: "hidden" }}
    >
      {image ? <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
    </div>
  );
}

function renderWithContentContract(
  moduleType: string,
  props: Record<string, unknown>,
  child: ReactNode,
) {
  return (
    <ContentTemplateContractFrame moduleType={moduleType} mode="public" props={props}>
      {child}
    </ContentTemplateContractFrame>
  );
}

const DYNAMIC_TEMPLATE_NODE_ADAPTERS: Partial<Record<DynamicTemplateSlotType, DynamicTemplateNodeAdapter>> = {
  video: {
    render: ({ content, mode, nodeProps }) => {
      const { props } = withTemplateDesign(content, nodeProps, VIDEO_DEFAULTS);
      const module = convertPuckProps("视频区块", props);
      if (!module) return null;
      const posterUrl = typeof props.posterUrl === "string" ? props.posterUrl : "";
      const aspectRatio = typeof props.aspectRatio === "string" && /^\d+:\d+$/.test(props.aspectRatio)
        ? props.aspectRatio.replace(":", " / ")
        : "16 / 9";
      return renderWithContentContract("视频区块", props, (
        <Suspense fallback={(
          <div
            className="hc-dynamic-template__adapter-loading"
            aria-busy="true"
            aria-label="视频组件正在加载"
            style={{ aspectRatio, background: "#F4F5F5", overflow: "hidden" }}
          >
            {posterUrl ? <img src={posterUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
          </div>
        )}>
          <VideoBlock module={module} editMode={mode !== "public"} />
        </Suspense>
      ));
    },
  },
  carousel: {
    render: ({ content, mode, nodeProps }) => {
      const { record, props } = withTemplateDesign(content, nodeProps, CAROUSEL_DEFAULTS);
      const module = convertPuckProps("轮播图", props);
      if (!module) return null;
      return renderWithContentContract("轮播图", props, (
        <Suspense fallback={adapterFallback("轮播组件", record)}>
          <CarouselBlock module={module} editMode={mode !== "public"} />
        </Suspense>
      ));
    },
  },
  hotspot: {
    render: ({ content, mode, nodeProps }) => {
      const { record, props } = withTemplateDesign(content, nodeProps, HOTSPOT_DEFAULTS);
      const module = convertPuckProps("热区图", props);
      if (!module) return null;
      return renderWithContentContract("热区图", props, (
        <Suspense fallback={adapterFallback("热区组件", record)}>
          <HotspotBlock module={module} editMode={mode !== "public"} />
        </Suspense>
      ));
    },
  },
  beforeAfter: {
    render: ({ content, mode, nodeProps }) => {
      const { record, props } = withTemplateDesign(content, nodeProps, BEFORE_AFTER_DEFAULTS);
      const module = convertPuckProps("改款对比", props);
      if (!module) return null;
      return renderWithContentContract("改款对比", props, (
        <Suspense fallback={adapterFallback("前后对比组件", record)}>
          <BeforeAfterBlock module={module} editMode={mode !== "public"} />
        </Suspense>
      ));
    },
  },
  appointment: {
    render: ({ content, mode, nodeProps }) => {
      const { record, props } = withTemplateDesign(content, nodeProps, APPOINTMENT_DEFAULTS);
      const module = convertPuckProps("预约入口", props);
      if (!module) return null;
      return renderWithContentContract("预约入口", props, (
        <Suspense fallback={adapterFallback("预约入口组件", record)}>
          <AppointmentBlock module={module} editMode={mode !== "public"} />
        </Suspense>
      ));
    },
  },
  productCard: {
    render: ({ content, mode, nodeProps }) => {
      const { record, design, props } = withTemplateDesign(content, nodeProps, PRODUCT_CARD_DEFAULTS);
      return renderWithContentContract("单品焦点推荐", props, (
      <Suspense fallback={adapterFallback("单品展示组件", asRecord(content))}>
        {mode === "public" ? (
          <ResolvedFeaturedProductBlock props={props} stableReferencesOnly />
        ) : (
          <FeaturedProductPreview {...PRODUCT_CARD_DEFAULTS} {...record} {...design} editMode />
        )}
      </Suspense>
      ));
    },
  },
  productCollection: {
    render: ({ content, mode, nodeProps }) => {
      const { record, design, props } = withTemplateDesign(content, nodeProps, PRODUCT_COLLECTION_DEFAULTS);
      return renderWithContentContract("产品展示行", props, (
      <Suspense fallback={adapterFallback("商品集合组件", asRecord(content))}>
        {mode === "public" ? (
          <ResolvedProductRowBlock props={props} stableReferencesOnly />
        ) : (
          <ProductRowPreview {...PRODUCT_COLLECTION_DEFAULTS} {...record} {...design} editMode />
        )}
      </Suspense>
      ));
    },
  },
  categoryCollection: {
    render: ({ content, mode, nodeProps }) => {
      const { record, design, props } = withTemplateDesign(content, nodeProps, CATEGORY_COLLECTION_DEFAULTS);
      return renderWithContentContract("分类卡片", props, (
      <Suspense fallback={adapterFallback("分类集合组件", asRecord(content))}>
        {mode === "public" ? (
          <ResolvedCategoryCardsBlock props={props} />
        ) : (
          <CategoryCardsPreview {...CATEGORY_COLLECTION_DEFAULTS} {...record} {...design} templateKey="categoryCards" editMode />
        )}
      </Suspense>
      ));
    },
  },
};

for (const slotType of Object.keys(
  MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE,
) as MatureContentTemplateSlotType[]) {
  DYNAMIC_TEMPLATE_NODE_ADAPTERS[slotType] = {
    render: ({ content, mode, nodeProps, headingLevel }) => (
      <Suspense fallback={adapterFallback("成熟内容模板组件", asRecord(content))}>
        <MatureContentTemplateRenderer
          slotType={slotType}
          content={content}
          layoutData={nodeProps?.contentTemplateLayoutData}
          designProps={nodeProps?.contentTemplateDesignProps}
          mode={mode}
          headingLevel={headingLevel}
        />
      </Suspense>
    ),
  };
}

export function getDynamicTemplateNodeAdapter(
  slotType: DynamicTemplateSlotType,
): DynamicTemplateNodeAdapter | undefined {
  return DYNAMIC_TEMPLATE_NODE_ADAPTERS[slotType];
}
