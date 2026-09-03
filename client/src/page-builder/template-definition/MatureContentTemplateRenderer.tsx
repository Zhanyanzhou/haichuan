import type { ReactNode } from "react";
import HeroSection from "@/components/blocks/HeroSection";
import FullBleedBlock from "@/components/blocks/FullBleedBlock";
import SinglePosterSection from "@/components/blocks/SinglePosterSection";
import DoublePosterSection from "@/components/blocks/DoublePosterSection";
import TextBannerBlock from "@/components/blocks/TextBannerBlock";
import CustomProcessBlock from "@/components/blocks/CustomProcessBlock";
import AsymmetricGalleryBlock from "@/components/blocks/AsymmetricGalleryBlock";
import CategoryCardsBlock from "@/components/blocks/CategoryCardsBlock";
import CardGridBlock from "@/components/blocks/CardGridBlock";
import CertificateBlock from "@/components/blocks/CertificateBlock";
import StoreInfoBlock from "@/components/blocks/StoreInfoBlock";
import TestimonialBlock from "@/components/blocks/TestimonialBlock";
import LimitedOfferBlock from "@/components/blocks/LimitedOfferBlock";
import CraftDetailsBlock from "@/components/blocks/CraftDetailsBlock";
import { heroPuckConfig } from "../adapters/hero.puck";
import { fullBleedPuckConfig } from "../adapters/fullBleed.puck";
import { singlePosterPuckConfig } from "../adapters/singlePoster.puck";
import { doublePosterPuckConfig } from "../adapters/doublePoster.puck";
import { textBannerPuckConfig } from "../adapters/textBanner.puck";
import { customProcessPuckConfig } from "../adapters/customProcess.puck";
import { galleryPuckConfig } from "../adapters/gallery.puck";
import { lookbookPuckConfig } from "../adapters/lookbook.puck";
import { categoryCardsPuckConfig, CategoryCardsPreview, type CategoryCardsPuckProps } from "../adapters/categoryCards.puck";
import { cardGridPuckConfig } from "../adapters/cardGrid.puck";
import { certificatePuckConfig } from "../adapters/certificate.puck";
import { storeInfoPuckConfig } from "../adapters/storeInfo.puck";
import { testimonialPuckConfig } from "../adapters/testimonial.puck";
import { limitedOfferPuckConfig } from "../adapters/limitedOffer.puck";
import { craftDetailsPuckConfig } from "../adapters/craftDetails.puck";
import { convertPuckProps } from "../utils/puckPropsToModule";
import type { PuckProps } from "../types";
import ContentTemplateContractFrame from "../runtime/ContentTemplateContractFrame";
import ResolvedLookbookBlock from "../runtime/ResolvedLookbookBlock";
import {
  MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE,
  type MatureContentTemplateSlotType,
} from "./validateTemplateDefinition";

const DEFAULT_PROPS_BY_MODULE: Record<string, Record<string, unknown>> = {
  首屏主视觉: heroPuckConfig.defaultProps,
  全屏出血图: fullBleedPuckConfig.defaultProps,
  单图海报: singlePosterPuckConfig.defaultProps,
  双图海报: doublePosterPuckConfig.defaultProps,
  文字横幅: textBannerPuckConfig.defaultProps,
  定制流程: customProcessPuckConfig.defaultProps,
  作品画廊: galleryPuckConfig.defaultProps,
  佩戴灵感: lookbookPuckConfig.defaultProps,
  按场景选购: categoryCardsPuckConfig.defaultProps,
  卡片网格: cardGridPuckConfig.defaultProps,
  服务承诺: cardGridPuckConfig.defaultProps,
  资质证书: certificatePuckConfig.defaultProps,
  门店信息: storeInfoPuckConfig.defaultProps,
  真实评价与实拍: testimonialPuckConfig.defaultProps,
  限时活动: limitedOfferPuckConfig.defaultProps,
  工艺细节: craftDetailsPuckConfig.defaultProps,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export interface MatureContentTemplateRendererProps {
  slotType: MatureContentTemplateSlotType;
  content: unknown;
  layoutData?: Record<string, unknown>;
  designProps?: Record<string, string | number | boolean>;
  mode: "public" | "editor" | "preview" | "thumbnail";
  headingLevel?: 1 | 2;
  priority?: boolean;
  homeSurface?: boolean;
  /** 历史 Puck 文档兼容数字 ID；母模板默认只解析稳定商品编码。 */
  stableReferencesOnly?: boolean;
}

/**
 * 旧格式成熟组件的只读兼容适配层。
 *
 * 它消费母模板节点/槽位合同，只把已经验收过的 24 模板 React 组件
 * 纳入单一渲染路径，避免把复杂根构图降级为通用纵向槽位。模板内部构图锁定
 * 在母模板节点 props 中，页面实例只能覆盖经过内容合同清洗的槽位值。
 */
export default function MatureContentTemplateRenderer({
  slotType,
  content,
  layoutData,
  designProps,
  mode,
  headingLevel = 2,
  priority = false,
  homeSurface = false,
  stableReferencesOnly = true,
}: MatureContentTemplateRendererProps) {
  const moduleType = MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE[slotType];
  const editMode = mode !== "public";
  const props: PuckProps = {
    ...DEFAULT_PROPS_BY_MODULE[moduleType],
    ...designProps,
    ...asRecord(content),
    ...(layoutData ? { __instanceOverrides: layoutData } : {}),
  };
  const module = convertPuckProps(moduleType, props);
  if (!module) return null;

  let node: ReactNode = null;
  switch (moduleType) {
    case "首屏主视觉":
      node = <HeroSection module={module} editMode={editMode} headingLevel={headingLevel} priority={priority} />;
      break;
    case "全屏出血图":
      node = <FullBleedBlock module={module} editMode={editMode} />;
      break;
    case "单图海报":
      node = <SinglePosterSection module={module} editMode={editMode} />;
      break;
    case "双图海报":
      node = <DoublePosterSection module={module} editMode={editMode} />;
      break;
    case "文字横幅":
      node = homeSurface ? (
        <div className="hc-home-text-banner">
          <TextBannerBlock module={module} editMode={editMode} />
        </div>
      ) : <TextBannerBlock module={module} editMode={editMode} />;
      break;
    case "定制流程":
      node = <CustomProcessBlock module={module} />;
      break;
    case "作品画廊":
      node = <AsymmetricGalleryBlock module={module} editMode={editMode} />;
      break;
    case "佩戴灵感":
      node = (
        <ResolvedLookbookBlock
          props={props}
          editMode={editMode}
          stableReferencesOnly={stableReferencesOnly}
        />
      );
      break;
    case "按场景选购":
      node = (
        <CategoryCardsPreview
          {...props as unknown as CategoryCardsPuckProps}
          templateKey="sceneShopping"
          editMode={editMode}
        />
      );
      break;
    case "卡片网格":
      node = homeSurface ? (
        <div className="hc-home-brand-points">
          <CardGridBlock module={module} contentTemplateKey="brandPoints" />
        </div>
      ) : <CardGridBlock module={module} contentTemplateKey="brandPoints" />;
      break;
    case "服务承诺":
      node = <CardGridBlock module={module} contentTemplateKey="servicePromises" />;
      break;
    case "资质证书":
      node = <CertificateBlock module={module} />;
      break;
    case "门店信息":
      node = <StoreInfoBlock module={module} editMode={editMode} />;
      break;
    case "真实评价与实拍":
      node = <TestimonialBlock module={module} editMode={editMode} />;
      break;
    case "限时活动":
      node = <LimitedOfferBlock module={module} />;
      break;
    case "工艺细节":
      node = <CraftDetailsBlock module={module} editMode={editMode} />;
      break;
  }

  return (
    <ContentTemplateContractFrame
      moduleType={moduleType}
      mode={mode === "editor" ? "editor" : "public"}
      props={props}
    >
      {node}
    </ContentTemplateContractFrame>
  );
}
