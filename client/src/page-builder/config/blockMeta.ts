/**
 * blockMeta.ts — 所有区块/模块的唯一元数据来源
 *
 * puckConfig、HomepageConfig、模板库、模块分类筛选均从该文件引用，
 * 新增区块只需在此文件中添加一条记录。
 *
 * mode/master 字段是 Brand/Commerce 双模式与 12 母版体系的挂靠点
 * (单一来源:page-builder/designSystem/masters)。
 */

import type { DesignMode, MasterId } from "../designSystem/masters";

/* ═══════ 区块分类 ═══════ */
export type BlockCategory =
  | "形象展示"
  | "品牌内容"
  | "作品选款"
  | "服务与信任"
  | "活动与引导";

export const BLOCK_CATEGORIES: BlockCategory[] = [
  "形象展示",
  "品牌内容",
  "作品选款",
  "服务与信任",
  "活动与引导",
];

/* ═══════ 预览图种类（用于微缩布局图） ═══════ */
export const BLOCK_PREVIEW_KIND: Record<string, string> = {
  首屏主视觉: "hero",
  单图海报: "single-poster",
  双图海报: "double-poster",
  全屏出血图: "full-bleed",
  作品画廊: "asymmetric-gallery",
  改款对比: "before-after",
  产品展示行: "product-row",
  分类卡片: "category-cards",
  卡片网格: "card-grid",
  文字横幅: "text-banner",
  轮播图: "carousel",
  视频区块: "video",
  热区图: "hotspot",
  预约入口: "appointment",
  资质证书: "certificate",
  定制流程: "custom-process",
  服务承诺: "service-promise",
  门店信息: "store-info",
  单品焦点推荐: "featured-product",
  佩戴灵感: "lookbook",
  限时活动: "limited-offer",
  真实评价与实拍: "testimonial",
  按场景选购: "occasion-guide",
};

/* ═══════ 媒体提示 ═══════ */
export const TEMPLATE_MEDIA_HINT: Record<string, string> = {
  首屏主视觉: "桌面横图(16:7) + 手机竖图(4:5)",
  单图海报: "桌面 4:5 + 手机 3:4 双端海报",
  双图海报: "主图 3:2 与细节图 4:5",
  全屏出血图: "桌面 21:6 + 手机 4:5",
  作品画廊: "建议 3–5 张,主图 4:5",
  轮播图: "桌面 21:6 + 手机 3:4",
  热区图: "桌面 16:9 + 手机 3:4,双端热区坐标",
  单品焦点推荐: "作品图固定 4:5",
  佩戴灵感: "佩戴大片 4:5 + 关联作品",
  真实评价与实拍: "建议准备顾客授权实拍图",
};

/* ═══════ 区块元数据 ═══════ */
export interface BlockMeta {
  /** 面向运营人员的模块显示名；Record key 仍是不可变的 Puck 内部类型。 */
  name: string;
  /** 一级分类：模块在页面中的主要用途。 */
  category: BlockCategory;
  /** 同一分类内的展示顺序。 */
  order: number;
  /** 模块的具体内容类型。 */
  type: string;
  /** 额外适用的一级分类——一种模板多用途，不复制数据 */
  scenes?: BlockCategory[];
  /** 模板库缩略图（真实效果占位）；未设置时按 BLOCK_PREVIEW_KIND 派生 */
  previewImage?: string;
  description: string;
  tags: string[];
  badge?: string;
  /** 同类型区块最多可添加数量（默认 5） */
  limit?: number;
  /** 是否在“推荐”筛选中展示 */
  recommended?: boolean;
  /** 所属视觉母版（构图规则的单一来源，designSystem/masters） */
  master: MasterId;
  /** Brand=奢侈品牌视觉 / Commerce=高端电商视觉 */
  mode: DesignMode;
}

export const BLOCK_META: Record<string, BlockMeta> = {
  首屏主视觉: {
    name: "品牌电影首屏",
    category: "形象展示",
    order: 1,
    type: "主视觉",
    badge: "核心模板",
    description: "用于页面第一屏，用大面积影像与极少文字建立品牌印象。",
    tags: ["推荐", "品牌首屏"],
    limit: 1,
    recommended: true,
    master: "cinematic-hero",
    mode: "brand",
  },
  单图海报: {
    name: "品牌故事",
    category: "品牌内容",
    order: 2,
    type: "单图",
    scenes: ["形象展示", "活动与引导"],
    description: "38/62 编辑式图文分栏，适合品牌故事、人物与服务叙事。",
    tags: ["品牌", "编辑排版"],
    recommended: true,
    master: "editorial-split",
    mode: "brand",
  },
  双图海报: {
    name: "系列对照·双幅",
    category: "品牌内容",
    order: 3,
    type: "双图",
    scenes: ["形象展示"],
    description: "主图+细节图的非对称双幅叙事，呈现系列、工艺或作品对照。",
    tags: ["系列", "编辑叙事"],
    master: "editorial-story",
    mode: "brand",
  },
  作品画廊: {
    name: "作品画廊",
    category: "作品选款",
    order: 6,
    type: "画廊",
    badge: "作品页核心",
    description: "非对称多图画廊：大图+双图+大图节奏，呈现作品、空间与证书。",
    tags: ["画廊", "非对称", "作品"],
    limit: 2,
    recommended: true,
    master: "asymmetric-gallery",
    mode: "brand",
  },
  改款对比: {
    name: "改款前后",
    category: "服务与信任",
    order: 6,
    type: "改款对比",
    description: "滑动分割线对比改款前/后的同比例影像，承载旧物新生的情感叙事。",
    tags: ["改款", "定制", "对比"],
    limit: 2,
    master: "editorial-story",
    mode: "brand",
  },
  全屏出血图: {
    name: "沉浸视觉",
    category: "形象展示",
    order: 2,
    type: "单张海报",
    scenes: ["品牌内容"],
    description: "全宽定比大图建立高级氛围，适合章节转场、工艺沉浸与尾章。",
    tags: ["强视觉", "章节转场"],
    master: "immersive-image",
    mode: "brand",
  },
  产品展示行: {
    name: "商品精选",
    category: "作品选款",
    order: 1,
    type: "单品",
    badge: "推荐",
    description: "以统一节奏陈列一组主推商品，引导继续浏览。",
    tags: ["主推", "商品陈列"],
    recommended: true,
    master: "commerce-grid",
    mode: "commerce",
  },
  分类卡片: {
    name: "品类入口",
    category: "作品选款",
    order: 3,
    type: "分类入口",
    description: "让访客按系列或品类快速进入选购。",
    tags: ["分类", "快速入口"],
    master: "commerce-entry",
    mode: "commerce",
  },
  卡片网格: {
    name: "品牌亮点",
    category: "服务与信任",
    order: 5,
    type: "服务预设",
    description: "以简洁条目呈现工艺、材质与服务承诺（电商场景专用）。",
    tags: ["服务", "承诺"],
    master: "commerce-grid",
    mode: "commerce",
  },
  文字横幅: {
    name: "品牌宣言",
    category: "活动与引导",
    order: 2,
    type: "横幅",
    scenes: ["形象展示"],
    description: "纯文字与大留白：品牌宣言、章节标题或极简行动引导。",
    tags: ["宣言", "留白"],
    master: "editorial-text",
    mode: "brand",
  },
  轮播图: {
    name: "系列大片轮播",
    category: "形象展示",
    order: 3,
    type: "轮播",
    scenes: ["活动与引导"],
    description: "同时展示多个系列或活动主视觉（建议仅电商与活动页使用）。",
    tags: ["多主题", "电商"],
    master: "commerce-campaign",
    mode: "commerce",
  },
  视频区块: {
    name: "品牌影片",
    category: "形象展示",
    order: 4,
    type: "视频",
    scenes: ["品牌内容"],
    description: "用动态影像呈现工艺细节和品牌质感。",
    tags: ["工艺", "影像"],
    master: "cinematic-hero",
    mode: "brand",
  },
  热区图: {
    name: "场景导购图",
    category: "作品选款",
    order: 7,
    type: "热区",
    description: "在场景大图上建立可点击区域，把视觉内容转为导购入口。",
    tags: ["专题", "点击转化"],
    master: "commerce-campaign",
    mode: "commerce",
  },
  预约入口: {
    name: "预约尾章",
    category: "活动与引导",
    order: 1,
    type: "预约",
    badge: "转化",
    description: "页面尾章的极简转化：一个明确预约入口，电话作次要选项。",
    tags: ["预约", "咨询", "转化"],
    limit: 3,
    master: "conversion",
    mode: "brand",
  },
  资质证书: {
    name: "权威认证",
    category: "服务与信任",
    order: 2,
    type: "证书",
    description: "以画廊式图墙展示国检 / IGI / 材质等权威认证。",
    tags: ["证书", "信任"],
    limit: 3,
    master: "asymmetric-gallery",
    mode: "brand",
  },
  定制流程: {
    name: "定制旅程",
    category: "服务与信任",
    order: 3,
    type: "旅程",
    description: "01–05 大字叙事呈现定制旅程，而非功能步骤条。",
    tags: ["定制", "旅程", "叙事"],
    limit: 3,
    master: "journey",
    mode: "brand",
  },
  服务承诺: {
    name: "服务保障",
    category: "服务与信任",
    order: 1,
    type: "承诺",
    badge: "服务预设",
    description: "保养 / 退换 / 物流等承诺条目，降低决策门槛。",
    tags: ["承诺", "售后", "保障"],
    limit: 3,
    master: "commerce-grid",
    mode: "commerce",
  },
  门店信息: {
    name: "门店与到访",
    category: "服务与信任",
    order: 5,
    type: "门店",
    description: "门店空间、地址、营业时间与联系方式。",
    tags: ["门店", "地址", "联系"],
    limit: 3,
    master: "editorial-split",
    mode: "brand",
  },
  单品焦点推荐: {
    name: "代表作品",
    category: "作品选款",
    order: 2,
    type: "主推单品",
    badge: "高转化",
    description: "让一件作品获得极大视觉权重；品牌页隐藏价格，电商页显示。",
    tags: ["单品", "主推", "代表作品"],
    limit: 4,
    recommended: true,
    master: "hero-piece",
    mode: "brand",
  },
  佩戴灵感: {
    name: "佩戴大片",
    category: "作品选款",
    order: 4,
    type: "场景种草",
    description: "以佩戴大片串联可直接查看的关联作品。",
    tags: ["佩戴", "大片", "搭配"],
    limit: 4,
    recommended: true,
    master: "hero-piece",
    mode: "brand",
  },
  限时活动: {
    name: "限时礼遇",
    category: "活动与引导",
    order: 3,
    type: "活动倒计时",
    badge: "限时",
    description: "展示真实倒计时与活动权益，承接限时礼遇转化（仅电商页）。",
    tags: ["活动", "倒计时", "礼遇"],
    limit: 3,
    recommended: true,
    master: "commerce-campaign",
    mode: "commerce",
  },
  真实评价与实拍: {
    name: "顾客之声",
    category: "服务与信任",
    order: 4,
    type: "顾客口碑",
    description: "以引语与实拍补充第三方信任证据。",
    tags: ["评价", "实拍", "口碑"],
    limit: 3,
    master: "editorial-story",
    mode: "brand",
  },
  按场景选购: {
    name: "场景选款",
    category: "作品选款",
    order: 5,
    type: "场景入口",
    badge: "运营预设",
    description: "按求婚、纪念日、送礼对象等场景快速选购。",
    tags: ["场景", "选购", "送礼"],
    limit: 3,
    recommended: true,
    master: "commerce-entry",
    mode: "commerce",
  },
};

/**
 * 按分类聚合区块名列表（供 puckConfig.categories 使用）。
 * 模板全页面通用,不做模式过滤(2026-08-15 用户决策)。
 */
export function getCategoryComponents(): Record<string, { defaultExpanded: boolean; components: string[] }> {
  const map: Record<string, { defaultExpanded: boolean; components: string[] }> = {};
  for (const cat of BLOCK_CATEGORIES) {
    map[cat] = {
      defaultExpanded: cat === "形象展示",
      components: Object.entries(BLOCK_META)
        .filter(([, meta]) => meta.category === cat)
        .sort(([, left], [, right]) => left.order - right.order)
        .map(([name]) => name),
    };
  }
  return map;
}

/** 模板库只按唯一的一级经营目标归类，避免同一模板在多个标签中重复出现。 */
export function blockMatchesPrimary(meta: BlockMeta, primary: BlockCategory | "全部"): boolean {
  if (primary === "全部") return true;
  return meta.category === primary;
}

/** 取某个一级分类下的二级类型列表（去重）；"全部"时返回所有 type 去重 */
export function getSubTypes(primary: BlockCategory | "全部"): string[] {
  const types = Object.values(BLOCK_META)
    .filter((meta) => blockMatchesPrimary(meta, primary))
    .map((meta) => meta.type);
  return [...new Set(types)];
}

/** 取区块的默认预览图（按 BLOCK_PREVIEW_KIND 派生 SVG 路径） */
export function getDefaultPreviewImage(name: string): string {
  const kind = BLOCK_PREVIEW_KIND[name] ?? "hero";
  return `/svg/template-${kind}.svg`;
}
