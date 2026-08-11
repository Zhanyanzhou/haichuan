/**
 * templates.ts — 预置页面模板定义
 * Phase 5: 模板系统
 */

import type { Config } from "@puckeditor/core";

/** 模板定义 */
export interface TemplateDefinition {
  id: string;
  name: string;
  pageType: "home" | "about" | "custom";
  description: string;
  /** 模板库封面和经营场景，仅用于编辑器选模板时展示 */
  coverImage?: string;
  scenario?: string;
  tags?: string[];
  /** 模板默认 Puck 数据 */
  puckData: any;
  /** 允许拖入的 Block 类型 */
  allowedBlockTypes: string[];
  /** 锁定组件（通过 id 匹配） */
  lockedComponents: Array<{
    componentId: string;
    permissions: { delete?: boolean; drag?: boolean; duplicate?: boolean };
  }>;
  version: number;
}

/** 珠宝首页模板 v1 */
export const jewelryHomeTemplate: TemplateDefinition = {
  id: "jewelry-home-v1",
  name: "品牌形象首页",
  pageType: "home",
  description: "以主视觉、品牌故事和精选商品，建立稳定的品牌官网首页。",
  puckData: {
    content: [
      {
        type: "首屏主视觉",
        props: {
          id: "hero-locked",
          title: "海川珠宝",
          subtitle: "传承东方美学，匠心铸造经典",
          desktopImage: "",
          mobileImage: "",
          actionText: "探索新品",
          linkUrl: "/products",
          altText: "",
          alignment: "center",
          focusX: 50,
          focusY: 50,
          locked: true,
        },
      },
      {
        type: "单图海报",
        props: {
          id: "story-section",
          number: "01",
          label: "BRAND STORY",
          title: "品牌故事",
          subtitle: "始于匠心，忠于品质",
          desktopImage: "",
          linkUrl: "/about",
          template: "leftTextRightImage",
          focusX: 50,
          focusY: 50,
          locked: false,
        },
      },
      {
        type: "产品展示行",
        props: {
          id: "featured-products",
          title: "精选臻品",
          subtitle: "匠心之作，为你甄选",
          productIds: [],
          layout: "grid-4",
          bgColor: "#FCFCFB",
          locked: false,
        },
      },
      {
        type: "卡片网格",
        props: {
          id: "craft-values",
          title: "匠心工艺",
          subtitle: "每一件作品，都承载着对品质的执着",
          cards: [
            {
              icon: "",
              title: "匠心设计",
              body: "从纹样到比例，每件作品均由资深工匠手工绘制与打磨",
            },
            {
              icon: "",
              title: "真材实料",
              body: "精选足金原料，所有材质均附国家权威检测证书",
            },
            {
              icon: "",
              title: "终身保养",
              body: "购买即享终身免费清洗保养服务，让作品历久弥新",
            },
          ],
          layout: "grid-3",
          bgColor: "#FCFCFB",
          locked: false,
        },
      },
      {
        type: "文字横幅",
        props: {
          id: "cta-section",
          eyebrow: "APPOINTMENT",
          title: "预约鉴赏",
          body: "欢迎莅临线下展厅，品鉴更多臻品",
          buttonText: "预约咨询",
          linkUrl: "/contact",
          template: "center",
          bgColor: "#FBF9F6",
          textColor: "#2C2C2C",
          spacing: "normal",
          locked: false,
        },
      },
    ],
    root: { props: {} },
  },
  allowedBlockTypes: [
    "首屏主视觉",
    "单图海报",
    "双图海报",
    "图文混排",
    "全屏出血图",
    "文字横幅",
    "产品展示行",
    "分类卡片",
    "卡片网格",
    "分割面板",
  ],
  lockedComponents: [
    {
      componentId: "hero-locked",
      permissions: { delete: false, duplicate: false, drag: false },
    },
  ],
  version: 1,
};

/** 深拷贝并替换区块属性，保证不同页面模板可独立维护。 */
function createHomeVariant(
  id: string,
  name: string,
  description: string,
  coverImage: string,
  scenario: string,
  tags: string[],
  overrides: Record<string, Record<string, unknown>>,
): TemplateDefinition {
  const puckData = JSON.parse(JSON.stringify(jewelryHomeTemplate.puckData));
  puckData.content = puckData.content.map((block: any) => ({
    ...block,
    props: {
      ...block.props,
      ...(overrides[block.type] ?? {}),
    },
  }));

  return {
    ...jewelryHomeTemplate,
    id,
    name,
    description,
    coverImage,
    scenario,
    tags,
    puckData,
    lockedComponents: [],
  };
}

/** 首页整页方案：用于新建或替换首页，不与单个区块混在模板库里。 */
export const pageTemplates: TemplateDefinition[] = [
  {
    ...jewelryHomeTemplate,
    coverImage: "/images/editorial/hero-gold-bangle-v1.webp",
    scenario: "日常品牌官网",
    tags: ["品牌形象", "推荐"],
  },
  createHomeVariant(
    "jewelry-product-guide-v1",
    "商品导购首页",
    "以品类入口与精选商品为主，帮助访客快速找到心仪款式。",
    "/images/products/ATP1020素金正面.png",
    "商品发现与选购",
    ["商品导购", "高转化"],
    {
      "首屏主视觉": {
        title: "探索心仪臻品",
        subtitle: "从经典系列到当季新作，找到属于你的光芒",
        actionText: "浏览全系商品",
        linkUrl: "/products",
      },
      "单图海报": { label: "CURATED COLLECTION", title: "按系列探索" },
      "产品展示行": { title: "本季推荐" },
      "文字横幅": { title: "预约专属选购服务", buttonText: "联系顾问" },
    },
  ),
  createHomeVariant(
    "jewelry-new-launch-v1",
    "新品发布首页",
    "围绕一个新品系列展开，从首屏、故事到主推商品逐步建立期待。",
    "/images/editorial/poster-gold-pendant-v1.webp",
    "系列新品发布",
    ["新品", "系列故事"],
    {
      "首屏主视觉": {
        title: "2026 新作发布",
        subtitle: "以东方意蕴，重释当代珠宝之美",
        actionText: "探索新系列",
      },
      "单图海报": { label: "NEW COLLECTION", title: "新作灵感" },
      "产品展示行": { title: "新作精选" },
      "文字横幅": { eyebrow: "PRIVATE VIEWING", title: "预约新品鉴赏" },
    },
  ),
  createHomeVariant(
    "jewelry-campaign-v1",
    "活动营销首页",
    "突出活动利益点与行动入口，适合节日、限时礼遇和专题推广。",
    "/images/editorial/poster-dragon-bangle-v1.webp",
    "节日与限时活动",
    ["活动", "节日", "高转化"],
    {
      "首屏主视觉": {
        title: "臻礼季限定礼遇",
        subtitle: "为重要时刻，挑选一份恰到好处的心意",
        actionText: "查看活动礼遇",
      },
      "单图海报": { label: "LIMITED OFFER", title: "限时专属礼遇" },
      "产品展示行": { title: "活动精选" },
      "文字横幅": { eyebrow: "LIMITED TIME", title: "立即预约，尊享专属礼遇", buttonText: "立即咨询" },
    },
  ),
];

/** 全部可用模板 */
export const templates: TemplateDefinition[] = pageTemplates;

/** 根据 id 获取模板 */
export function getTemplate(id: string): TemplateDefinition | undefined {
  return templates.find((t) => t.id === id);
}
