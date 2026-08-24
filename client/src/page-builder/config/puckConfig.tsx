/**
 * puckConfig.tsx — 全局 Puck 配置
 * 注册所有 Block 为 Puck 组件
 */

import type { Config } from "@puckeditor/core";
import type { ReactNode } from "react";
import { getCategoryComponents } from "./blockMeta";
import { heroPuckConfig } from "../adapters/hero.puck";
import type { HeroPuckProps } from "../adapters/hero.puck";
import { singlePosterPuckConfig } from "../adapters/singlePoster.puck";
import type { SinglePosterPuckProps } from "../adapters/singlePoster.puck";
import { doublePosterPuckConfig } from "../adapters/doublePoster.puck";
import type { DoublePosterPuckProps } from "../adapters/doublePoster.puck";
import { fullBleedPuckConfig } from "../adapters/fullBleed.puck";
import type { FullBleedPuckProps } from "../adapters/fullBleed.puck";
import { textBannerPuckConfig } from "../adapters/textBanner.puck";
import type { TextBannerPuckProps } from "../adapters/textBanner.puck";
import { productRowPuckConfig } from "../adapters/productRow.puck";
import type { ProductRowPuckProps } from "../adapters/productRow.puck";
import { categoryCardsPuckConfig } from "../adapters/categoryCards.puck";
import type { CategoryCardsPuckProps } from "../adapters/categoryCards.puck";
import {
  cardGridPuckConfig,
  renderCardGridPuck,
} from "../adapters/cardGrid.puck";
import type { CardGridPuckProps } from "../adapters/cardGrid.puck";
import { galleryPuckConfig } from "../adapters/gallery.puck";
import type { GalleryPuckProps } from "../adapters/gallery.puck";
import { beforeAfterPuckConfig } from "../adapters/beforeAfter.puck";
import type { BeforeAfterPuckProps } from "../adapters/beforeAfter.puck";
import { carouselPuckConfig } from "../adapters/carousel.puck";
import type { CarouselPuckProps } from "../adapters/carousel.puck";
import { videoPuckConfig } from "../adapters/video.puck";
import type { VideoPuckProps } from "../adapters/video.puck";
import { hotspotPuckConfig } from "../adapters/hotspot.puck";
import type { HotspotPuckProps } from "../adapters/hotspot.puck";
import { siteConfigPuckConfig } from "../adapters/siteConfig.puck";
import type { SiteConfigPuckProps } from "../adapters/siteConfig.puck";
import { businessRegionPuckConfig } from "../adapters/businessRegion.puck";
import type { BusinessRegionPuckProps } from "../adapters/businessRegion.puck";
import { appointmentPuckConfig } from "../adapters/appointment.puck";
import type { AppointmentPuckProps } from "../adapters/appointment.puck";
import { certificatePuckConfig } from "../adapters/certificate.puck";
import type { CertificatePuckProps } from "../adapters/certificate.puck";
import { customProcessPuckConfig } from "../adapters/customProcess.puck";
import type { CustomProcessPuckProps } from "../adapters/customProcess.puck";
import { storeInfoPuckConfig } from "../adapters/storeInfo.puck";
import type { StoreInfoPuckProps } from "../adapters/storeInfo.puck";
import { featuredProductPuckConfig } from "../adapters/featuredProduct.puck";
import type { FeaturedProductPuckProps } from "../adapters/featuredProduct.puck";
import { lookbookPuckConfig } from "../adapters/lookbook.puck";
import type { LookbookPuckProps } from "../adapters/lookbook.puck";
import { limitedOfferPuckConfig } from "../adapters/limitedOffer.puck";
import type { LimitedOfferPuckProps } from "../adapters/limitedOffer.puck";
import { testimonialPuckConfig } from "../adapters/testimonial.puck";
import type { TestimonialPuckProps } from "../adapters/testimonial.puck";
import ContentTemplateContractFrame from "../runtime/ContentTemplateContractFrame";

type MyComponents = {
  首屏主视觉: HeroPuckProps;
  单图海报: SinglePosterPuckProps;
  双图海报: DoublePosterPuckProps;
  全屏出血图: FullBleedPuckProps;
  文字横幅: TextBannerPuckProps;
  作品画廊: GalleryPuckProps;
  改款对比: BeforeAfterPuckProps;
  产品展示行: ProductRowPuckProps;
  分类卡片: CategoryCardsPuckProps;
  卡片网格: CardGridPuckProps;
  轮播图: CarouselPuckProps;
  视频区块: VideoPuckProps;
  热区图: HotspotPuckProps;
  网站全局设置: SiteConfigPuckProps;
  业务功能区: BusinessRegionPuckProps;
  预约入口: AppointmentPuckProps;
  资质证书: CertificatePuckProps;
  定制流程: CustomProcessPuckProps;
  服务承诺: CardGridPuckProps;
  门店信息: StoreInfoPuckProps;
  单品焦点推荐: FeaturedProductPuckProps;
  佩戴灵感: LookbookPuckProps;
  限时活动: LimitedOfferPuckProps;
  真实评价与实拍: TestimonialPuckProps;
  按场景选购: CategoryCardsPuckProps;
};

type RenderableConfig<Props> = {
  render: (props: Props) => ReactNode;
} & Record<string, unknown>;

/** 保留 adapter 的真实 render 与 props，只在外层附加 schema v3 根合同。 */
function withContractRenderer<Props>(
  moduleType: string,
  config: RenderableConfig<Props>,
) {
  const render = config.render;
  return {
    ...config,
    render: (props: Props) => (
      <ContentTemplateContractFrame
        moduleType={moduleType}
        mode="editor"
        props={props as Record<string, unknown>}
      >
        {render(props)}
      </ContentTemplateContractFrame>
    ),
  };
}

/**
 * 注册全部 Block — 中文 Key 即 Puck 侧栏显示名称。
 * 旧类型「图文混排 / 分割面板 / 礼赠指南」已从注册表移除(2026-08 模板收敛):
 * 编辑器载入时由 migratePuckData 转换为新类型;公开渲染器保留旧类型分支,
 * 已发布历史版本(revision)不受影响。
 */
export const puckConfig: Config<MyComponents> = {
  components: {
    首屏主视觉: withContractRenderer("首屏主视觉", heroPuckConfig),
    单图海报: withContractRenderer("单图海报", singlePosterPuckConfig),
    双图海报: withContractRenderer("双图海报", doublePosterPuckConfig),
    全屏出血图: withContractRenderer("全屏出血图", fullBleedPuckConfig),
    文字横幅: withContractRenderer("文字横幅", textBannerPuckConfig),
    作品画廊: withContractRenderer("作品画廊", galleryPuckConfig),
    改款对比: withContractRenderer("改款对比", beforeAfterPuckConfig),
    产品展示行: withContractRenderer("产品展示行", productRowPuckConfig),
    分类卡片: withContractRenderer("分类卡片", categoryCardsPuckConfig),
    卡片网格: withContractRenderer("卡片网格", cardGridPuckConfig),
    轮播图: withContractRenderer("轮播图", carouselPuckConfig),
    视频区块: withContractRenderer("视频区块", videoPuckConfig),
    热区图: withContractRenderer("热区图", hotspotPuckConfig),
    网站全局设置: siteConfigPuckConfig,
    业务功能区: businessRegionPuckConfig,
    预约入口: withContractRenderer("预约入口", appointmentPuckConfig),
    资质证书: withContractRenderer("资质证书", certificatePuckConfig),
    定制流程: withContractRenderer("定制流程", customProcessPuckConfig),
    服务承诺: withContractRenderer("服务承诺", {
      ...cardGridPuckConfig,
      render: (props: CardGridPuckProps) =>
        renderCardGridPuck(props, "servicePromises"),
      defaultProps: {
        title: "服务信息",
        subtitle: "请在发布前填写已确认的服务信息。",
        cards: [
          { icon: "", title: "保养信息待确认", body: "请填写经业务确认的保养安排。" },
          { icon: "", title: "售后信息待确认", body: "请填写经业务确认的售后说明。" },
          { icon: "", title: "配送信息待确认", body: "请填写经业务确认的配送说明。" },
          { icon: "", title: "鉴定信息待确认", body: "请填写经业务确认的鉴定或证书说明。" },
        ],
        layout: "grid-4",
        bgColor: "#FFFFFF",
        locked: false,
      },
    }),
    门店信息: withContractRenderer("门店信息", storeInfoPuckConfig),
    单品焦点推荐: withContractRenderer("单品焦点推荐", featuredProductPuckConfig),
    佩戴灵感: withContractRenderer("佩戴灵感", lookbookPuckConfig),
    限时活动: withContractRenderer("限时活动", limitedOfferPuckConfig),
    真实评价与实拍: withContractRenderer("真实评价与实拍", testimonialPuckConfig),
    按场景选购: withContractRenderer("按场景选购", {
      ...categoryCardsPuckConfig,
      defaultProps: {
        title: "场景选款",
        subtitle: "从重要时刻出发，挑选一件恰到好处的珠宝。",
        categories: [
          { name: "求婚告白", image: "", link: "/catalog", count: "", description: "为承诺点亮心意" },
          { name: "周年纪念", image: "", link: "/catalog", count: "", description: "珍藏每一段时光" },
          { name: "日常通勤", image: "", link: "/catalog", count: "", description: "让光泽陪伴日常" },
          { name: "重要礼赠", image: "", link: "/catalog", count: "", description: "为重要的人挑一份心意" },
        ],
        layout: "grid-4",
        bgColor: "#FFFFFF",
        locked: false,
      },
    }),
  },
  /** 与区块模板库保持一致：按页面经营目标分类，而非技术组件类型。 */
  categories: getCategoryComponents() as any,
  root: { render: ({ children }) => <div>{children}</div>, fields: {} },
};
