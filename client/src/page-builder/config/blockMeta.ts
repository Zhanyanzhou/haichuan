/**
 * blockMeta.ts — 所有区块/模块的唯一元数据来源
 *
 * puckConfig、HomepageConfig、模板库、模块分类筛选均从该文件引用，
 * 新增区块只需在此文件中添加一条记录。
 */

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
  图文混排: "image-text",
  全屏出血图: "full-bleed",
  产品展示行: "product-row",
  分类卡片: "category-cards",
  卡片网格: "card-grid",
  文字横幅: "text-banner",
  轮播图: "carousel",
  视频区块: "video",
  分割面板: "split-panel",
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
  礼赠指南: "gift-guide",
};

/* ═══════ 媒体提示 ═══════ */
export const TEMPLATE_MEDIA_HINT: Record<string, string> = {
  首屏主视觉: "桌面横图 + 手机竖图",
  单图海报: "建议准备双端海报",
  双图海报: "主图与细节图",
  全屏出血图: "桌面横图 + 手机竖图",
  轮播图: "每张图配手机版本",
  热区图: "确认热区坐标",
  单品焦点推荐: "建议准备 3:4 商品主图",
  佩戴灵感: "场景图 + 关联商品图",
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
}

export const BLOCK_META: Record<string, BlockMeta> = {
  首屏主视觉: {
    name: "首屏展示",
    category: "形象展示",
    order: 1,
    type: "主视觉",
    badge: "核心模板",
    description: "用于首页第一屏，快速建立品牌印象。",
    tags: ["推荐", "品牌首页"],
    limit: 1,
    recommended: true,
  },
  单图海报: {
    name: "单图介绍",
    category: "品牌内容",
    order: 2,
    type: "单图",
    scenes: ["形象展示", "活动与引导"],
    description: "一张图片搭配简短标题，适合系列导语或品牌故事。",
    tags: ["品牌", "上新"],
    recommended: true,
  },
  双图海报: {
    name: "双图展示",
    category: "品牌内容",
    order: 3,
    type: "双图",
    scenes: ["形象展示"],
    description: "使用主图与细节图呈现系列、工艺或作品对照。",
    tags: ["系列", "内容表达"],
  },
  图文混排: {
    name: "图文介绍",
    category: "品牌内容",
    order: 1,
    type: "图文",
    description: "使用图片、正文和按钮详细介绍品牌、工艺或服务。",
    tags: ["品牌故事", "工艺"],
  },
  全屏出血图: {
    name: "单张海报",
    category: "形象展示",
    order: 2,
    type: "单张海报",
    scenes: ["品牌内容"],
    description: "用一张全宽海报建立高级氛围，并引导进入商品或站内页面。",
    tags: ["强视觉", "品牌感", "点击跳转"],
  },
  产品展示行: {
    name: "作品陈列",
    category: "作品选款",
    order: 1,
    type: "单品",
    badge: "推荐",
    description: "突出一组主推商品，引导继续浏览。",
    tags: ["主推", "高转化"],
    recommended: true,
  },
  分类卡片: {
    name: "分类导航",
    category: "作品选款",
    order: 3,
    type: "分类入口",
    description: "让访客按系列或品类快速进入选购。",
    tags: ["分类", "快速入口"],
  },
  卡片网格: {
    name: "品牌亮点",
    category: "品牌内容",
    order: 5,
    type: "品牌卖点",
    description: "以规则网格呈现工艺、材质与品牌价值。",
    tags: ["品牌价值", "工艺", "卖点"],
  },
  文字横幅: {
    name: "引导横幅",
    category: "活动与引导",
    order: 2,
    type: "横幅",
    scenes: ["形象展示"],
    description: "承接上新、活动利益点和咨询行动。",
    tags: ["上新", "活动"],
  },
  轮播图: {
    name: "图片轮播",
    category: "形象展示",
    order: 3,
    type: "轮播",
    scenes: ["活动与引导"],
    badge: "提升点击率",
    description: "适合同时展示多个系列、新品或活动。",
    tags: ["多活动", "移动端"],
    recommended: true,
  },
  视频区块: {
    name: "视频展示",
    category: "形象展示",
    order: 4,
    type: "视频",
    scenes: ["品牌内容"],
    description: "用动态内容呈现工艺细节和品牌质感。",
    tags: ["工艺", "高质感"],
  },
  分割面板: {
    name: "分栏介绍",
    category: "品牌内容",
    order: 4,
    type: "分栏",
    description: "以分区内容形成有节奏的系列叙事。",
    tags: ["系列", "内容节奏"],
  },
  热区图: {
    name: "可点击图片",
    category: "作品选款",
    order: 7,
    type: "热区",
    description: "将活动视觉转为多个可点击的导购入口。",
    tags: ["专题", "点击转化"],
  },
  预约入口: {
    name: "预约引导",
    category: "活动与引导",
    order: 1,
    type: "预约",
    badge: "转化",
    description: "引导访客预约鉴赏或咨询，珠宝核心转化入口。",
    tags: ["预约", "咨询", "转化"],
    limit: 3,
  },
  资质证书: {
    name: "资质与证书",
    category: "服务与信任",
    order: 2,
    type: "证书",
    description: "展示国检 / IGI / 材质等权威认证，建立购买信任。",
    tags: ["证书", "信任", "资质"],
    limit: 3,
  },
  定制流程: {
    name: "定制流程",
    category: "服务与信任",
    order: 3,
    type: "流程",
    description: "可视化定制步骤（选石→设计→交付），降低定制顾虑。",
    tags: ["定制", "流程", "时间轴"],
    limit: 3,
  },
  服务承诺: {
    name: "服务保障",
    category: "服务与信任",
    order: 1,
    type: "承诺",
    badge: "服务预设",
    description: "终身保养 / 退换 / 物流等承诺卡片，降低决策门槛。",
    tags: ["承诺", "售后", "保障"],
    limit: 3,
  },
  门店信息: {
    name: "门店信息",
    category: "服务与信任",
    order: 5,
    type: "门店",
    description: "展示门店地址、营业时间、联系方式，建立线下信任。",
    tags: ["门店", "地址", "联系"],
    limit: 3,
  },
  单品焦点推荐: {
    name: "单品主推",
    category: "作品选款",
    order: 2,
    type: "主推单品",
    badge: "高转化",
    description: "集中呈现一件主推作品的价格、卖点与预约入口。",
    tags: ["单品", "主推", "询价"],
    limit: 4,
    recommended: true,
  },
  佩戴灵感: {
    name: "佩戴灵感",
    category: "作品选款",
    order: 4,
    type: "场景种草",
    description: "以佩戴场景串联可直接购买的关联作品。",
    tags: ["佩戴", "种草", "搭配"],
    limit: 4,
    recommended: true,
  },
  限时活动: {
    name: "限时活动",
    category: "活动与引导",
    order: 3,
    type: "活动倒计时",
    badge: "限时",
    description: "展示真实倒计时与活动权益，承接限时礼遇转化。",
    tags: ["活动", "倒计时", "礼遇"],
    limit: 3,
    recommended: true,
  },
  真实评价与实拍: {
    name: "顾客评价",
    category: "服务与信任",
    order: 4,
    type: "顾客口碑",
    description: "展示授权顾客评价与实拍，补充第三方信任证据。",
    tags: ["评价", "实拍", "口碑"],
    limit: 3,
  },
  按场景选购: {
    name: "场景选款",
    category: "作品选款",
    order: 5,
    type: "场景入口",
    badge: "运营预设",
    description: "按求婚、纪念日、通勤或送礼等场景快速选购。",
    tags: ["场景", "选购", "送礼"],
    limit: 3,
    recommended: true,
  },
  礼赠指南: {
    name: "礼赠选款",
    category: "作品选款",
    order: 6,
    type: "礼赠入口",
    badge: "运营预设",
    description: "按送礼对象或预算提供珠宝礼赠选择入口。",
    tags: ["礼赠", "节日", "预算"],
    limit: 3,
  },
};

/** 按分类聚合区块名列表（供 puckConfig.categories 使用） */
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
