/**
 * blockMeta.ts — 所有区块/模块的唯一元数据来源
 *
 * puckConfig、HomepageConfig、模板库、模块分类筛选均从该文件引用，
 * 新增区块只需在此文件中添加一条记录。
 */

/* ═══════ 区块分类 ═══════ */
export type BlockCategory =
  | "首屏与氛围"
  | "品牌叙事"
  | "商品导购"
  | "活动与转化";

export const BLOCK_CATEGORIES: BlockCategory[] = [
  "首屏与氛围",
  "品牌叙事",
  "商品导购",
  "活动与转化",
];

/* ═══════ 筛选标签（模板库 Tab） ═══════ */
export const BLOCK_FILTERS = [
  "全部",
  "推荐",
  "最近使用",
  "我的收藏",
  "首屏与氛围",
  "品牌叙事",
  "商品导购",
  "活动与转化",
] as const;

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
  网站全局设置: "site-config",
};

/* ═══════ 媒体提示 ═══════ */
export const TEMPLATE_MEDIA_HINT: Record<string, string> = {
  首屏主视觉: "桌面横图 + 手机竖图",
  单图海报: "建议准备双端海报",
  双图海报: "主图与细节图",
  全屏出血图: "桌面横图 + 手机竖图",
  轮播图: "每张图配手机版本",
  热区图: "确认热区坐标",
};

/* ═══════ 区块元数据 ═══════ */
export interface BlockMeta {
  /** Puck 注册名（同时作为模板库显示名） */
  name: string;
  category: BlockCategory;
  description: string;
  tags: string[];
  badge?: string;
  /** 同类型区块最多可添加数量（默认 5） */
  limit?: number;
  /** 是否在"推荐"筛选中展示 */
  recommended?: boolean;
}

export const BLOCK_META: Record<string, BlockMeta> = {
  首屏主视觉: {
    name: "首屏主视觉",
    category: "首屏与氛围",
    badge: "核心模板",
    description: "用于首页第一屏，快速建立品牌印象。",
    tags: ["推荐", "品牌首页"],
    limit: 1,
    recommended: true,
  },
  单图海报: {
    name: "单图海报",
    category: "品牌叙事",
    description: "用一张主视觉讲述品牌、系列或材质故事。",
    tags: ["品牌", "上新"],
    recommended: true,
  },
  双图海报: {
    name: "双图海报",
    category: "品牌叙事",
    description: "并置两组内容，适合系列与工艺对照表达。",
    tags: ["系列", "内容表达"],
  },
  图文混排: {
    name: "图文混排",
    category: "品牌叙事",
    description: "适合呈现设计理念、材质与品牌故事。",
    tags: ["品牌故事", "工艺"],
  },
  全屏出血图: {
    name: "全屏出血图",
    category: "首屏与氛围",
    description: "以大幅视觉强化页面节奏和高级感。",
    tags: ["强视觉", "品牌感"],
  },
  产品展示行: {
    name: "产品展示行",
    category: "商品导购",
    badge: "推荐",
    description: "突出一组主推商品，引导继续浏览。",
    tags: ["主推", "高转化"],
    recommended: true,
  },
  分类卡片: {
    name: "分类卡片",
    category: "商品导购",
    description: "让访客按系列或品类快速进入选购。",
    tags: ["分类", "快速入口"],
  },
  卡片网格: {
    name: "卡片网格",
    category: "商品导购",
    description: "以规则网格呈现卖点、服务或商品集合。",
    tags: ["系列集合", "导购"],
  },
  文字横幅: {
    name: "文字横幅",
    category: "活动与转化",
    description: "承接上新、活动利益点和咨询行动。",
    tags: ["上新", "活动"],
  },
  轮播图: {
    name: "轮播图",
    category: "首屏与氛围",
    badge: "提升点击率",
    description: "适合同时展示多个系列、新品或活动。",
    tags: ["多活动", "移动端"],
    recommended: true,
  },
  视频区块: {
    name: "视频区块",
    category: "首屏与氛围",
    description: "用动态内容呈现工艺细节和品牌质感。",
    tags: ["工艺", "高质感"],
  },
  分割面板: {
    name: "分割面板",
    category: "品牌叙事",
    description: "以分区内容形成有节奏的系列叙事。",
    tags: ["系列", "内容节奏"],
  },
  热区图: {
    name: "热区图",
    category: "活动与转化",
    description: "将活动视觉转为多个可点击的导购入口。",
    tags: ["专题", "点击转化"],
  },
  网站全局设置: {
    name: "网站全局设置",
    category: "活动与转化",
    description: "统一管理页眉品牌标识、导航菜单与页脚联系信息。",
    tags: ["设置", "品牌"],
    limit: 1,
  },
};

/** 按分类聚合区块名列表（供 puckConfig.categories 使用） */
export function getCategoryComponents(): Record<string, { defaultExpanded: boolean; components: string[] }> {
  const map: Record<string, { defaultExpanded: boolean; components: string[] }> =
    {};
  for (const cat of BLOCK_CATEGORIES) {
    map[cat] = { defaultExpanded: cat === "首屏与氛围", components: [] };
  }
  for (const [name, meta] of Object.entries(BLOCK_META)) {
    map[meta.category]?.components.push(name);
  }
  return map;
}
