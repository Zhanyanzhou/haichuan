import {
  CONTENT_TEMPLATE_ASSET_POLICY,
  CONTENT_TEMPLATE_CONTRACTS,
} from "../generated/contentTemplates.generated";
import { getContractRoleRatio } from "./blockContracts";

type ContractKey = keyof typeof CONTENT_TEMPLATE_CONTRACTS;
type SpecViewport = "desktop" | "mobile";

/**
 * 图片尺寸规格目录 — 各模块上传素材的推荐尺寸(建议值,8% 容差内提示"尺寸合适",不阻断)。
 *
 * 定位(2026-08-18 比例派生管道):
 * - 比例唯一来源是内容模板契约(roles[].defaultRatioByViewport),本表不再手写比例字面值;
 * - 每条目只声明「模板 + 槽位 + 用途文案」,宽高与比例均由契约现算;
 * - imageText / splitPanel 条目为已退役模板的遗留规格,仅供旧数据编辑兜底,不再新增使用。
 *
 * 桌面端按 2K+ 出图,移动端按 3x 出图,商品图可放大看细节。
 * 注意:大像素原图需配套后端按需缩放(srcset / 多尺寸),避免移动端直接加载 4K 拖慢。
 */
interface ContractSpecInput {
  /** 契约模板 key */
  template: ContractKey;
  /** 契约 roles[].id(媒体槽位 id) */
  role: string;
  viewport: SpecViewport;
  /** 用途短语,label 前缀(如 "证书图") */
  note: string;
}

function contractSpec({
  template,
  role,
  viewport,
  note,
}: ContractSpecInput) {
  const contract = CONTENT_TEMPLATE_CONTRACTS[template];
  const baseWidth = CONTENT_TEMPLATE_ASSET_POLICY.minimumWidthByViewport[viewport][contract.width];
  const ratio = getContractRoleRatio(template, role, viewport); // "3 / 2"
  const [num, den] = ratio.split("/").map((part) => Number(part.trim()));
  const height = Math.round((baseWidth * den) / num);
  return {
    width: baseWidth,
    height,
    ratio,
    label: `${note}（建议至少 ${baseWidth}×${height}，${num}:${den}）`,
  };
}

/**
 * 从规格派生 "a:b" 比例文案。
 * placeholder/分区描述等所有给人看的比例文案统一经此生成,
 * 评审改契约后自动跟随,禁止手写字面值。
 */
export function ratioLabelOf(
  spec: { ratio: string } | undefined | null,
): string {
  return spec
    ? spec.ratio
        .split("/")
        .map((part) => part.trim())
        .join(":")
    : "";
}

export const IMAGE_SPECS = {
  hero: {
    desktop: contractSpec({
      template: "hero",
      role: "desktopImage",
      viewport: "desktop",
      note: "桌面端主视觉",
    }),
    mobile: contractSpec({
      template: "hero",
      role: "mobileImage",
      viewport: "mobile",
      note: "移动端主视觉",
    }),
  },
  singlePoster: {
    image: contractSpec({
      template: "singlePoster",
      role: "desktopImage",
      viewport: "desktop",
      note: "海报主图",
    }),
    mobile: contractSpec({
      template: "singlePoster",
      role: "mobileImage",
      viewport: "mobile",
      note: "移动端单海报",
    }),
  },
  doublePoster: {
    main: contractSpec({
      template: "doublePoster",
      role: "mainImage",
      viewport: "desktop",
      note: "主海报",
    }),
    detail: contractSpec({
      template: "doublePoster",
      role: "detailImage",
      viewport: "desktop",
      note: "细节海报",
    }),
  },
  craftDetails: {
    lead: contractSpec({
      template: "craftDetails",
      role: "leadImage",
      viewport: "desktop",
      note: "工艺主图",
    }),
    detailOne: contractSpec({
      template: "craftDetails",
      role: "detailImageOne",
      viewport: "desktop",
      note: "工艺细节图一",
    }),
    detailTwo: contractSpec({
      template: "craftDetails",
      role: "detailImageTwo",
      viewport: "desktop",
      note: "工艺细节图二",
    }),
  },
  imageText: {
    image: {
      width: 1600,
      height: 1200,
      ratio: "4:3",
      label: "图文配图（建议 1600×1200，4:3）",
    },
  }, // 遗留模块（已退役），仅供旧数据编辑兜底;4:3 不在规范比例内,不随契约派生
  fullBleed: {
    desktop: contractSpec({
      template: "fullBleed",
      role: "image",
      viewport: "desktop",
      note: "通栏桌面图",
    }),
    mobile: contractSpec({
      template: "fullBleed",
      role: "mobileImage",
      viewport: "mobile",
      note: "通栏移动图",
    }),
  },
  splitPanel: {
    image: {
      width: 1200,
      height: 1600,
      ratio: "3:4",
      label: "分栏配图（建议 1200×1600，3:4）",
    },
  }, // 遗留模块（已退役），仅供旧数据编辑兜底
  /* ═══ 契约派生(2026-08-18):比例/宽高/文案由合同现算,禁止回填字面值 ═══ */
  certificate: {
    image: contractSpec({
      template: "certificates",
      role: "certificates",
      viewport: "desktop",
      note: "证书图",
    }),
  },
  customProcess: {
    node: contractSpec({
      template: "journey",
      role: "steps",
      viewport: "desktop",
      note: "节点图",
    }),
  },
  testimonial: {
    image: contractSpec({
      template: "testimonials",
      role: "authorizedPhoto",
      viewport: "desktop",
      note: "实拍图",
    }),
  },
  // 2026-08-18 构图评审 #5/#6 决议:品牌要点与服务承诺定位纯文字卡,原卡片图规格删除
  hotspot: {
    desktop: contractSpec({
      template: "hotspot",
      role: "sceneImage",
      viewport: "desktop",
      note: "热区桌面图",
    }),
    mobile: contractSpec({
      template: "hotspot",
      role: "sceneImage",
      viewport: "mobile",
      note: "热区移动图",
    }),
  },
  textBanner: {
    bgImage: contractSpec({
      template: "textBanner",
      role: "bgImage",
      viewport: "desktop",
      note: "横幅背景图",
    }),
  },
  productRow: {
    image: contractSpec({
      template: "productRow",
      role: "productCards",
      viewport: "desktop",
      note: "商品图",
    }),
  },
  featuredProduct: {
    image: contractSpec({
      template: "featuredProduct",
      role: "product",
      viewport: "desktop",
      note: "主推作品图",
    }),
  },
  lookbook: {
    image: contractSpec({
      template: "wearingInspiration",
      role: "wearingImage",
      viewport: "desktop",
      note: "佩戴大片",
    }),
    mobile: contractSpec({
      template: "wearingInspiration",
      role: "wearingImage",
      viewport: "mobile",
      note: "佩戴大片（手机端）",
    }),
  },
  categoryCards: {
    image: contractSpec({
      template: "categoryCards",
      role: "categories",
      viewport: "desktop",
      note: "入口卡图",
    }),
  },
  // 分类卡片(1:1)与场景选购(4:5)同用 CategoryCardsBlock,模板类型二选一,规格分列
  sceneShopping: {
    image: contractSpec({
      template: "sceneShopping",
      role: "scenes",
      viewport: "desktop",
      note: "场景入口图",
    }),
  },
  carousel: {
    image: contractSpec({
      template: "carousel",
      role: "frames",
      viewport: "desktop",
      note: "电脑端宽幕轮播图",
    }),
    mobile: contractSpec({
      template: "carousel",
      role: "frames",
      viewport: "mobile",
      note: "手机端轮播图",
    }),
  },
  gallery: {
    primary: contractSpec({
      template: "gallery",
      role: "works",
      viewport: "desktop",
      note: "画廊主图",
    }),
  },
  storeInfo: {
    image: contractSpec({
      template: "storeInfo",
      role: "store",
      viewport: "desktop",
      note: "门店空间图",
    }),
    mobile: contractSpec({
      template: "storeInfo",
      role: "store",
      viewport: "mobile",
      note: "门店空间图（手机端）",
    }),
  },
  beforeAfter: {
    image: contractSpec({
      template: "comparison",
      role: "before",
      viewport: "desktop",
      note: "改款对比图",
    }),
  },
  video: {
    poster: contractSpec({
      template: "video",
      role: "coverImage",
      viewport: "desktop",
      note: "视频封面",
    }),
    posterMobile: contractSpec({
      template: "video",
      role: "coverImage",
      viewport: "mobile",
      note: "视频封面（手机端）",
    }),
  },
  limitedOffer: {
    event: contractSpec({
      template: "limitedEvent",
      role: "event",
      viewport: "desktop",
      note: "活动视觉",
    }),
  },
  // 2026-08-18 构图评审 #3:预约入口补可选氛围背景(裁切驱动,比例为宽度保障建议)
  booking: {
    bgImage: contractSpec({
      template: "booking",
      role: "bgImage",
      viewport: "desktop",
      note: "预约背景图",
    }),
    bgImageMobile: contractSpec({
      template: "booking",
      role: "bgImage",
      viewport: "mobile",
      note: "预约背景图（手机端）",
    }),
  },
};
