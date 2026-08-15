/**
 * schema/registry.ts — 模块编辑区 Schema 注册表(全量)。
 *
 * 22 个模板全部 Schema 化:InspectorPanel 命中本表即渲染 SchemaInspectorPanel。
 * 旧路径(index.tsx 内 10 个专属面板与 Puck.Fields fallback)已不可达,仅作死代码保留待清理。
 */
import type { ModuleInspectorSchema } from "./types";
import { textBannerSchema } from "./modules/textBanner";
import { cardGridSchema, servicePromiseSchema } from "./modules/cardGrid";
import { heroSchema } from "./modules/hero";
import { singlePosterSchema } from "./modules/singlePoster";
import { doublePosterSchema } from "./modules/doublePoster";
import { fullBleedSchema } from "./modules/fullBleed";
import { gallerySchema } from "./modules/gallery";
import { beforeAfterSchema } from "./modules/beforeAfter";
import { videoSchema } from "./modules/video";
import { carouselSchema } from "./modules/carousel";
import { hotspotSchema } from "./modules/hotspot";
import { productRowSchema } from "./modules/productRow";
import {
  categoryCardsSchema,
  occasionGuideSchema,
} from "./modules/categoryCards";
import { featuredProductSchema } from "./modules/featuredProduct";
import { lookbookSchema } from "./modules/lookbook";
import { appointmentSchema } from "./modules/appointment";
import { certificateSchema } from "./modules/certificate";
import { customProcessSchema } from "./modules/customProcess";
import { storeInfoSchema } from "./modules/storeInfo";
import { limitedOfferSchema } from "./modules/limitedOffer";
import { testimonialSchema } from "./modules/testimonial";

export const MODULE_INSPECTOR_SCHEMAS: Record<
  string,
  ModuleInspectorSchema
> = {
  首屏主视觉: heroSchema,
  单图海报: singlePosterSchema,
  双图海报: doublePosterSchema,
  全屏出血图: fullBleedSchema,
  作品画廊: gallerySchema,
  改款对比: beforeAfterSchema,
  文字横幅: textBannerSchema,
  视频区块: videoSchema,
  预约入口: appointmentSchema,
  资质证书: certificateSchema,
  定制流程: customProcessSchema,
  门店信息: storeInfoSchema,
  单品焦点推荐: featuredProductSchema,
  佩戴灵感: lookbookSchema,
  真实评价与实拍: testimonialSchema,
  产品展示行: productRowSchema,
  分类卡片: categoryCardsSchema,
  按场景选购: occasionGuideSchema,
  卡片网格: cardGridSchema,
  服务承诺: servicePromiseSchema,
  限时活动: limitedOfferSchema,
  轮播图: carouselSchema,
  热区图: hotspotSchema,
};

export function getInspectorSchema(
  moduleType: string,
): ModuleInspectorSchema | undefined {
  return MODULE_INSPECTOR_SCHEMAS[moduleType];
}
