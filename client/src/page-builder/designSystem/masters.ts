/**
 * masters.ts — 12 个视觉母版注册表(模板体系的单一规则来源)。
 *
 * 每个具体模板(BLOCK_META 条目)必须挂靠一个母版;
 * 母版定义:模式(Brand/Commerce)、宽度档、通栏/内容流、媒体规格、构图红线。
 * 新增模板必须先确认可归入现有母版;母版数量以 12 为上限,不再增加。
 */

import type { DensityMode, RatioToken, WidthToken } from "./tokens";

export type MasterId =
  | "cinematic-hero"
  | "immersive-image"
  | "editorial-split"
  | "editorial-story"
  | "asymmetric-gallery"
  | "editorial-text"
  | "hero-piece"
  | "journey"
  | "conversion"
  | "commerce-grid"
  | "commerce-entry"
  | "commerce-campaign";

export type DesignMode = DensityMode; // "brand" | "commerce"

export interface MasterMediaSpec {
  /** 桌面端素材比例;缺省=裁切驱动(如视口 hero,不锁比例) */
  desktopRatio?: RatioToken;
  /** 移动端素材比例;缺省=裁切驱动 */
  mobileRatio?: RatioToken;
  /** 是否支持独立移动端素材(未上传时自动裁切兜底) */
  independentMobileImage: boolean;
  /** 是否需要 Desktop / Mobile 双端独立焦点 */
  dualFocus: boolean;
}

export interface MasterDefinition {
  id: MasterId;
  label: string;
  mode: DesignMode;
  purpose: string;
  width: WidthToken;
  /** bleed=通栏定比(不吃纵向节奏) / flow=内容流(吃节奏留白) */
  flow: "bleed" | "flow";
  media: MasterMediaSpec;
  /** 构图红线:给运营说明与开发实现共同遵守 */
  rules: string[];
}

export const MASTERS: Record<MasterId, MasterDefinition> = {
  "cinematic-hero": {
    id: "cinematic-hero",
    label: "电影首屏",
    mode: "brand",
    purpose: "页面第一印象:大面积影像、极少文字、至多一个行动入口。",
    width: "full",
    flow: "bleed",
    media: {
      desktopRatio: "16:9",
      mobileRatio: "4:5",
      independentMobileImage: true,
      dualFocus: true,
    },
    rules: [
      "视口高度(100svh,下限 680px),素材裁切驱动不锁比例",
      "文字≤3 行,CTA≤1",
      "遮罩默认柔和,禁止强促销配色",
    ],
  },
  "immersive-image": {
    id: "immersive-image",
    label: "沉浸视觉",
    mode: "brand",
    purpose: "章节转场、工艺沉浸与页面尾章的全宽定比大图。",
    width: "full",
    flow: "bleed",
    media: {
      desktopRatio: "21:6",
      mobileRatio: "4:5",
      independentMobileImage: true,
      dualFocus: true,
    },
    rules: [
      "尾章素材建议 21:6 / 工艺变体 16:9（默认参照，设计卡可偏离须写理由）",
      "文字位四选一(居中/左/右/左下),CTA≤1",
      "整图可点击",
    ],
  },
  "editorial-split": {
    id: "editorial-split",
    label: "编辑分栏",
    mode: "brand",
    purpose: "品牌故事、人物与服务说明的杂志式图文分栏。",
    width: "standard",
    flow: "flow",
    media: {
      desktopRatio: "4:5",
      mobileRatio: "4:5",
      independentMobileImage: true,
      dualFocus: true,
    },
    rules: [
      "桌面默认 38/62 或 62/38 镜像（默认参照，设计卡可偏离须写理由），避免 50/50 等分",
      "Mobile 自动转上下排列,图在前",
      "文字列宽≤440px",
    ],
  },
  "editorial-story": {
    id: "editorial-story",
    label: "编辑叙事",
    mode: "brand",
    purpose: "双图叙事:成品+细节、主视觉+辅图,文字挂在细节列。",
    width: "wide",
    flow: "flow",
    media: {
      desktopRatio: "3:2",
      mobileRatio: "4:5",
      independentMobileImage: false,
      dualFocus: true,
    },
    rules: [
      "主图约 2/3 + 细节图 1/3,细节图下移错位(≈12%)",
      "Mobile 上下单列排列",
      "两张图各自独立焦点",
    ],
  },
  "asymmetric-gallery": {
    id: "asymmetric-gallery",
    label: "非对称画廊",
    mode: "brand",
    purpose: "作品、空间与证书的画廊式展示,强调作品本身。",
    width: "wide",
    flow: "flow",
    media: {
      desktopRatio: "4:5",
      mobileRatio: "4:5",
      independentMobileImage: false,
      dualFocus: false,
    },
    rules: [
      "多图明确主次:大图+双图+大图的节奏",
      "禁止均分 2×2 / 3×1 / 4×1",
      "Mobile 重排:大图→留白→双列→大图",
    ],
  },
  "editorial-text": {
    id: "editorial-text",
    label: "编辑文字",
    mode: "brand",
    purpose: "品牌宣言与章节标题:纯文字与大面积留白。",
    width: "editorial",
    flow: "flow",
    media: {
      independentMobileImage: false,
      dualFocus: false,
    },
    rules: ["纯文字,无图", "正文≤80 字,居中或左对齐", "留白明显高于平均区块"],
  },
  "hero-piece": {
    id: "hero-piece",
    label: "代表作品",
    mode: "brand",
    purpose: "让单件作品获得非常大的视觉权重。",
    width: "standard",
    flow: "flow",
    media: {
      desktopRatio: "4:5",
      mobileRatio: "4:5",
      independentMobileImage: false,
      dualFocus: true,
    },
    rules: [
      "作品对称居中,庄严经典,四周大留白",
      "Brand 模式隐藏价格,CTA 仅限查看/预约类",
      "Mobile 图在前",
    ],
  },
  journey: {
    id: "journey",
    label: "叙事旅程",
    mode: "brand",
    purpose: "品牌历程与定制旅程的高端叙事,不是功能流程图。",
    width: "editorial",
    flow: "flow",
    media: {
      desktopRatio: "1:1",
      mobileRatio: "1:1",
      independentMobileImage: false,
      dualFocus: false,
    },
    rules: [
      "01–05 大字叙事:编号+英文+中文一句",
      "禁止步骤圆/连线流程图",
      "PC 横向叙事,Mobile 自动转纵向",
    ],
  },
  conversion: {
    id: "conversion",
    label: "转化尾章",
    mode: "brand",
    purpose: "页面尾章的极简转化:一个明确行动入口。",
    width: "full",
    flow: "bleed",
    media: {
      desktopRatio: "21:6",
      mobileRatio: "1:1",
      independentMobileImage: true,
      dualFocus: true,
    },
    rules: [
      "21:6 背景(或纯色),Mobile 4:5/1:1 独立视觉",
      "1 主 CTA(+可选电话),文案≤2 行",
      "深色典藏 / 象牙留白两种预设",
    ],
  },
  "commerce-grid": {
    id: "commerce-grid",
    label: "商品网格",
    mode: "commerce",
    purpose: "选款效率:商品以统一节奏陈列。",
    width: "standard",
    flow: "flow",
    media: {
      desktopRatio: "4:5",
      mobileRatio: "4:5",
      independentMobileImage: false,
      dualFocus: false,
    },
    rules: [
      "≥1440px 四列 / 1024–1439px 三列 / Mobile 两列",
      "商品图固定 4:5,不可改",
      "卡片仅:图/名称/材质/价格/收藏",
    ],
  },
  "commerce-entry": {
    id: "commerce-entry",
    label: "入口卡组",
    mode: "commerce",
    purpose: "品类、场景与礼赠的图卡入口。",
    width: "standard",
    flow: "flow",
    media: {
      desktopRatio: "1:1",
      mobileRatio: "4:5",
      independentMobileImage: false,
      dualFocus: false,
    },
    rules: [
      "1:1(品类)或 4:5(场景),≤6 卡",
      "底部叠字,卡片承担导航不承载商品信息",
      "Mobile 两列",
    ],
  },
  "commerce-campaign": {
    id: "commerce-campaign",
    label: "活动导购",
    mode: "commerce",
    purpose: "轮播、热区、限时等强导购组件,仅 Commerce 页可用。",
    width: "full",
    flow: "bleed",
    media: {
      desktopRatio: "21:6",
      mobileRatio: "4:5",
      independentMobileImage: true,
      dualFocus: false,
    },
    rules: [
      "仅选款中心等 Commerce 页可添加;Brand 页发布校验拦截",
      "轮播/热区/倒计时等强导购形态",
      "不用于品牌叙事页",
    ],
  },
};

export function getMaster(id: MasterId): MasterDefinition {
  return MASTERS[id];
}
