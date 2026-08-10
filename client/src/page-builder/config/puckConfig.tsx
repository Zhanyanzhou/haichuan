/**
 * puckConfig.tsx — 全局 Puck 配置
 * 注册所有 Block 为 Puck 组件
 */

import type { Config } from "@puckeditor/core";
import { heroPuckConfig } from "../adapters/hero.puck";
import type { HeroPuckProps } from "../adapters/hero.puck";
import { singlePosterPuckConfig } from "../adapters/singlePoster.puck";
import type { SinglePosterPuckProps } from "../adapters/singlePoster.puck";
import { doublePosterPuckConfig } from "../adapters/doublePoster.puck";
import type { DoublePosterPuckProps } from "../adapters/doublePoster.puck";
import { imageTextPuckConfig } from "../adapters/imageText.puck";
import type { ImageTextPuckProps } from "../adapters/imageText.puck";
import { fullBleedPuckConfig } from "../adapters/fullBleed.puck";
import type { FullBleedPuckProps } from "../adapters/fullBleed.puck";
import { textBannerPuckConfig } from "../adapters/textBanner.puck";
import type { TextBannerPuckProps } from "../adapters/textBanner.puck";
import { productRowPuckConfig } from "../adapters/productRow.puck";
import type { ProductRowPuckProps } from "../adapters/productRow.puck";
import { categoryCardsPuckConfig } from "../adapters/categoryCards.puck";
import type { CategoryCardsPuckProps } from "../adapters/categoryCards.puck";
import { cardGridPuckConfig } from "../adapters/cardGrid.puck";
import type { CardGridPuckProps } from "../adapters/cardGrid.puck";
import { splitPanelPuckConfig } from "../adapters/splitPanel.puck";
import type { SplitPanelPuckProps } from "../adapters/splitPanel.puck";
import { carouselPuckConfig } from "../adapters/carousel.puck";
import type { CarouselPuckProps } from "../adapters/carousel.puck";
import { videoPuckConfig } from "../adapters/video.puck";
import type { VideoPuckProps } from "../adapters/video.puck";
import { hotspotPuckConfig } from "../adapters/hotspot.puck";
import type { HotspotPuckProps } from "../adapters/hotspot.puck";

type MyComponents = {
  首屏主视觉: HeroPuckProps;
  单图海报: SinglePosterPuckProps;
  双图海报: DoublePosterPuckProps;
  图文混排: ImageTextPuckProps;
  全屏出血图: FullBleedPuckProps;
  文字横幅: TextBannerPuckProps;
  产品展示行: ProductRowPuckProps;
  分类卡片: CategoryCardsPuckProps;
  卡片网格: CardGridPuckProps;
  分割面板: SplitPanelPuckProps;
  轮播图: CarouselPuckProps;
  视频区块: VideoPuckProps;
  热区图: HotspotPuckProps;
};

/** 注册全部 Block — 中文 Key 即 Puck 侧栏显示名称 */
export const puckConfig: Config<MyComponents> = {
  components: {
    首屏主视觉: heroPuckConfig,
    单图海报: singlePosterPuckConfig,
    双图海报: doublePosterPuckConfig,
    图文混排: imageTextPuckConfig,
    全屏出血图: fullBleedPuckConfig,
    文字横幅: textBannerPuckConfig,
    产品展示行: productRowPuckConfig,
    分类卡片: categoryCardsPuckConfig,
    卡片网格: cardGridPuckConfig,
    分割面板: splitPanelPuckConfig,
    轮播图: carouselPuckConfig,
    视频区块: videoPuckConfig,
    热区图: hotspotPuckConfig,
  },
  /** 与区块模板库保持一致：按页面经营目标分类，而非技术组件类型。 */
  categories: {
    "首屏与氛围": {
      defaultExpanded: true,
      components: [
        "首屏主视觉",
        "全屏出血图",
        "轮播图",
        "视频区块",
      ],
    },
    "品牌叙事": {
      defaultExpanded: false,
      components: ["单图海报", "双图海报", "图文混排", "分割面板"],
    },
    "商品导购": {
      defaultExpanded: false,
      components: ["产品展示行", "分类卡片", "卡片网格"],
    },
    "活动与转化": {
      defaultExpanded: false,
      components: ["文字横幅", "热区图"],
    },
  },
  root: { render: ({ children }) => <div>{children}</div>, fields: {} },
};
