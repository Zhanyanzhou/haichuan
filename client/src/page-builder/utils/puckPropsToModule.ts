/**
 * puckPropsToModule.ts — 统一的 Puck 扁平 props → PageModule 转换
 *
 * 每个适配器 *.puck.tsx 和前台渲染器 PuckDocumentRenderer.tsx 均通过
 * 该文件转换 props，避免重复的 switch-case 和手写映射。
 *
 * 新增 Block 时：
 * 1. 在此文件添加 PuckType 类型和对应的转换函数
 * 2. 在 PuckDocumentRenderer.tsx 的 switch 中调用对应函数
 */

import type { PageModule } from "@/types/pageModule";
import type { HeroPuckProps } from "../adapters/hero.puck";
import type { SinglePosterPuckProps } from "../adapters/singlePoster.puck";
import type { DoublePosterPuckProps } from "../adapters/doublePoster.puck";
import type { ImageTextPuckProps } from "../adapters/imageText.puck";
import type { FullBleedPuckProps } from "../adapters/fullBleed.puck";
import type { TextBannerPuckProps } from "../adapters/textBanner.puck";
import type { ProductRowPuckProps } from "../adapters/productRow.puck";
import type { CategoryCardsPuckProps } from "../adapters/categoryCards.puck";
import type { CardGridPuckProps } from "../adapters/cardGrid.puck";
import type { SplitPanelPuckProps } from "../adapters/splitPanel.puck";
import type { CarouselPuckProps } from "../adapters/carousel.puck";
import type { VideoPuckProps } from "../adapters/video.puck";
import type { HotspotPuckProps } from "../adapters/hotspot.puck";

/** 所有 Puck props 类型的联合 */
export type PuckProps =
  | { type: "首屏主视觉"; props: HeroPuckProps }
  | { type: "单图海报"; props: SinglePosterPuckProps }
  | { type: "双图海报"; props: DoublePosterPuckProps }
  | { type: "图文混排"; props: ImageTextPuckProps }
  | { type: "全屏出血图"; props: FullBleedPuckProps }
  | { type: "文字横幅"; props: TextBannerPuckProps }
  | { type: "产品展示行"; props: ProductRowPuckProps }
  | { type: "分类卡片"; props: CategoryCardsPuckProps }
  | { type: "卡片网格"; props: CardGridPuckProps }
  | { type: "分割面板"; props: SplitPanelPuckProps }
  | { type: "轮播图"; props: CarouselPuckProps }
  | { type: "视频区块"; props: VideoPuckProps }
  | { type: "热区图"; props: HotspotPuckProps };

/** 基础模块骨架 */
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

/** 根据区块类型和 props 转换为 PageModule */
export function convertPuckProps(
  type: string,
  props: Record<string, any>,
): PageModule | null {
  switch (type) {
    case "首屏主视觉":
      return baseModule(
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
      );

    case "单图海报":
      return baseModule(
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
      );

    case "双图海报":
      return baseModule(
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
      );

    case "图文混排":
      return baseModule(
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
      );

    case "全屏出血图":
      return baseModule(
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
      );

    case "文字横幅":
      return baseModule(
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
      );

    case "产品展示行":
      // 产品展示行需要单独处理（异步加载商品），仅返回基础结构
      return baseModule(
        "productRow",
        {
          title: props.title,
          subtitle: props.subtitle,
          products: [],
          productIds: props.productIds || [],
          layout: props.layout,
          imageRatio: props.imageRatio || "3:4",
          showPrice: props.showPrice ?? true,
          showButton: props.showButton ?? false,
          buttonText: props.buttonText || "查看详情",
          titleSize: props.titleSize || "medium",
        },
        {},
        { bgColor: props.bgColor || "#FCFCFB" },
      );

    case "分类卡片":
      return baseModule(
        "categoryCards",
        {
          title: props.title,
          categoryId: props.categoryId,
          categories: props.categories || [],
          layout: props.layout,
        },
        {},
        { bgColor: props.bgColor || "#FBF9F6" },
      );

    case "卡片网格":
      return baseModule(
        "cardGrid",
        {
          title: props.title,
          subtitle: props.subtitle,
          cards: props.cards || [],
          layout: props.layout,
        },
        {},
        { bgColor: props.bgColor || "#FCFCFB" },
      );

    case "分割面板":
      return baseModule(
        "splitPanel",
        {
          image: props.image,
          title: props.title,
          subtitle: props.subtitle,
          body: props.body,
          buttonText: props.buttonText,
          linkUrl: props.linkUrl,
        },
        { template: props.template || "imageLeft", split: props.split || "50-50" },
        { bgColor: props.bgColor || "#FCFCFB", textColor: props.textBg || "#fff" },
      );

    case "轮播图":
      return baseModule(
        "carousel",
        {
          images: props.images || [],
          autoPlay: props.autoPlay,
          interval: props.interval || 4000,
          showDots: props.showDots,
          showArrows: props.showArrows,
        },
        { height: props.height || 500, mobileHeight: props.mobileHeight || 640 },
      );

    case "视频区块":
      return baseModule(
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
      );

    case "热区图":
      return baseModule("hotspot", {
        image: props.image,
        mobileImage: props.mobileImage,
        hotspots: props.hotspots || [],
      });

    default:
      return null;
  }
}
