/**
 * templates.ts — 预置页面模板定义
 * Phase 5: 模板系统
 */

import type { Config } from "@puckeditor/core";

/** 模板定义 */
export interface TemplateDefinition {
  id: string;
  name: string;
  pageType: "home" | "about" | "products" | "catalog" | "custom" | "contact";
  description: string;
  /** 模板库封面和经营场景，仅用于编辑器选模板时展示 */
  coverImage?: string;
  scenario?: string;
  tags?: string[];
  /** 模板默认 Puck 数据 */
  puckData: any;
  /** 允许拖入的 Block 类型 */
  allowedBlockTypes: string[];
  version: number;
}

/** 珠宝首页模板 v2 — 品牌节奏:电影首屏 → 编辑分栏故事 → 留白宣言 → 商品精选 → 转化尾章 */
export const jewelryHomeTemplate: TemplateDefinition = {
  id: "jewelry-home-v2",
  name: "品牌形象首页",
  pageType: "home",
  description: "七页画册式品牌首页：全屏封面 → 品牌宣言 → 当季专题 → 代表作品 → 匠心工艺 → 佩戴大片 → 预约尾章。",
  puckData: {
    content: [
      {
        type: "首屏主视觉",
        props: {
          id: "hero-cover",
          eyebrow: "THE HOUSE OF HAICHUAN",
          title: "海川珠宝",
          subtitle: "以东方美学，铸当代珠宝",
          desktopImage: "",
          mobileImage: "",
          actionText: "",
          linkUrl: "",
          targetType: "none",
          productId: 0,
          altText: "",
          alignment: "left",
          desktopFocusX: 33,
          desktopFocusY: 50,
          mobileFocusX: 50,
          mobileFocusY: 50,
          locked: false,
        },
      },
      {
        type: "文字横幅",
        props: {
          id: "cover-letter",
          eyebrow: "THE HOUSE OF HAICHUAN",
          title: "珠宝，沿着时间生长",
          body: "我们从材质的纹理、光的变化与佩戴的关系出发，让每一件作品在日常之中，慢慢形成属于佩戴者自己的意义。",
          buttonText: "",
          linkUrl: "",
          targetType: "none",
          productId: 0,
          template: "center",
          bgColor: "#FFFFFF",
          textColor: "#1A1A1A",
          spacing: "spacious",
          locked: false,
        },
      },
      {
        type: "全屏出血图",
        props: {
          id: "feature-collection",
          image: "",
          mobileImage: "",
          eyebrow: "COLLECTION",
          title: "当季主题",
          subtitle: "一段关于系列的诗意描述，留给作品自己说话。",
          buttonText: "",
          linkUrl: "",
          targetType: "none",
          productId: 0,
          template: "captionBelow",
          overlayPreset: "none",
          altText: "",
          desktopFocusX: 50,
          desktopFocusY: 50,
          mobileFocusX: 50,
          mobileFocusY: 50,
          locked: false,
        },
      },
      {
        type: "单品焦点推荐",
        props: {
          id: "hero-piece",
          eyebrow: "SIGNATURE PIECE",
          title: "代表作品",
          summary: "为重要时刻挑选一件值得珍藏的珠宝，细节与光泽都经得起近距离凝视。",
          productId: 0,
          primaryText: "查看作品",
          secondaryText: "预约鉴赏",
          secondaryLink: "/contact",
          layout: "imageLeft",
          showPrice: false,
          bgColor: "#FFFFFF",
          locked: false,
        },
      },
      {
        type: "单图海报",
        props: {
          id: "craft-section",
          number: "02",
          label: "CRAFTMANSHIP",
          title: "匠心",
          subtitle: "一凿一刻，皆是时光的痕迹。",
          desktopImage: "",
          mobileImage: "",
          linkUrl: "/about",
          actionText: "了解海川",
          template: "leftImageRightText",
          desktopFocusX: 50,
          desktopFocusY: 50,
          mobileFocusX: 50,
          mobileFocusY: 50,
          locked: false,
        },
      },
      {
        type: "佩戴灵感",
        props: {
          id: "editorial-spread",
          title: "",
          subtitle: "",
          image: "",
          imageAlt: "珠宝佩戴大片",
          productIds: [],
          actionText: "",
          linkUrl: "",
          targetType: "none",
          productId: 0,
          bgColor: "#FFFFFF",
          locked: false,
        },
      },
      {
        type: "预约入口",
        props: {
          id: "colophon",
          title: "预约鉴赏",
          subtitle: "一对一珠宝顾问，为您安排专属服务",
          buttonText: "预约鉴赏",
          linkUrl: "/contact",
          phone: "",
          altText: "",
          desktopFocusX: 50,
          desktopFocusY: 50,
          mobileFocusX: 50,
          mobileFocusY: 50,
          tone: "ivory",
          bgColor: "#FFFFFF",
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
    "作品画廊",
    "全屏出血图",
    "文字横幅",
    "产品展示行",
    "单品焦点推荐",
    "佩戴灵感",
    "分类卡片",
    "卡片网格",
    "视频区块",
    "预约入口",
  ],
  version: 2,
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
  };
}

/** 首页整页方案：用于新建或替换首页，不与单个区块混在模板库里。 */
const rawPageTemplates: TemplateDefinition[] = [
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
        title: "主题活动信息待确认",
        subtitle: "请在发布前填写已确认的活动内容与适用规则。",
        actionText: "查看详情",
      },
      "单图海报": { label: "CAMPAIGN", title: "主题内容待确认" },
      "产品展示行": { title: "主题推荐" },
      "文字横幅": { eyebrow: "CAMPAIGN", title: "活动信息待确认", buttonText: "查看详情" },
    },
  ),

  /* ═══════ 导航五页专属结构模板（2026-08-15 拍板：每页 6–8 块——叙事页 8、工具页 6+业务功能区）═══════
   * 模块全部 locked:false、无锁定组件——结构只是推荐起点，运营可自由增删拖换。
   * 动态业务页只定义视觉框架；业务功能区由 createEditorPageDefault 追加在视觉模块之后
   * （与公开渲染顺序一致：装修内容全部渲染在业务内容之前）。 */

  /** 关于海川 — 信任叙事(8 块):影像开场 → 品牌故事 → 工艺对照 → 宣言 → 证书墙 → 沉浸转场 → 画廊 → 尾章 */
  {
    id: "jewelry-about-v1",
    name: "关于海川·信任叙事",
    pageType: "about",
    description:
      "品牌故事、工艺、权威认证与作品画廊的八幕结构，以信任收束到预约咨询。",
    scenario: "品牌信任页",
    tags: ["品牌", "信任", "推荐"],
    puckData: {
      content: [
        {
          type: "首屏主视觉",
          props: {
            id: "about-hero",
            title: "关于海川",
            subtitle: "在东方审美与当代工艺之间，守护每一份珍贵",
            desktopImage: "",
            mobileImage: "",
            actionText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,
            altText: "",
            alignment: "center",
            desktopFocusX: 50,
            desktopFocusY: 50,
            mobileFocusX: 50,
            mobileFocusY: 50,
            locked: false,
          },
        },
        {
          type: "单图海报",
          props: {
            id: "about-story",
            number: "01",
            label: "OUR STORY",
            title: "品牌故事",
            subtitle: "始于匠心，忠于品质",
            desktopImage: "",
            mobileImage: "",
            linkUrl: "",
            actionText: "",
            template: "leftTextRightImage",
            desktopFocusX: 50,
            desktopFocusY: 50,
            mobileFocusX: 50,
            mobileFocusY: 50,
            locked: false,
          },
        },
        {
          type: "双图海报",
          props: {
            id: "about-craft",
            number: "02",
            label: "CRAFTSMANSHIP",
            title: "工艺与匠心",
            description: "从手工雕刻到精密镶嵌，每一道工序在工坊内完成。",
            mainImage: "",
            detailImage: "",
            actionText: "",
            targetType: "none",
            productId: 0,
            linkUrl: "",
            layout: "mainLeft",
            mainAltText: "",
            detailAltText: "",
            mainFocusX: 50,
            mainFocusY: 50,
            detailFocusX: 50,
            detailFocusY: 50,
            locked: false,
          },
        },
        {
          type: "文字横幅",
          props: {
            id: "about-credo",
            eyebrow: "OUR PHILOSOPHY",
            title: "东方意蕴，当代表达",
            body: "我们从材质、光与佩戴的关系出发，让传统工艺进入当代生活，慢慢形成属于佩戴者自己的意义。",
            buttonText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,

            template: "center",
            bgColor: "#FFFFFF",
            textColor: "#1A1A1A",
            spacing: "spacious",
            locked: false,
          },
        },
        {
          type: "资质证书",
          props: {
            id: "about-certificates",
            title: "权威认证",
            subtitle: "每件作品均附权威检测证书",
            certificates: [
              { name: "国检证书", desc: "NGTC 国家珠宝玉石质量监督检验中心", imageUrl: "" },
              { name: "IGI 国际证书", desc: "国际宝石学院认证", imageUrl: "" },
              { name: "足金 999", desc: "材质成色权威检测", imageUrl: "" },
            ],
            bgColor: "#FFFFFF",
            locked: false,
          },
        },
        {
          type: "全屏出血图",
          props: {
            id: "about-atelier-bleed",
            image: "",
            mobileImage: "",
            title: "",
            subtitle: "",
            buttonText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,
            template: "textCenter",
            overlayPreset: "soft",
            altText: "",
            desktopFocusX: 50,
            desktopFocusY: 50,
            mobileFocusX: 50,
            mobileFocusY: 50,
            locked: false,
          },
        },
        {
          type: "作品画廊",
          props: {
            id: "about-gallery",
            title: "作品画廊",
            subtitle: "以线条、比例与光，呈现海川的作品语言。",
            items: [
              { image: "", altText: "", caption: "FIG. 01 · 主视觉", link: "" },
              { image: "", altText: "", caption: "", link: "" },
              { image: "", altText: "", caption: "", link: "" },
              { image: "", altText: "", caption: "FIG. 02 · 细节", link: "" },
            ],
            bgColor: "#FFFFFF",
            locked: false,
          },
        },
        {
          type: "预约入口",
          props: {
            id: "about-appointment",
            title: "走进海川",
            subtitle: "一对一珠宝顾问，为您安排专属服务",
            buttonText: "预约咨询",
            linkUrl: "/contact",
            phone: "",
            altText: "",
            desktopFocusX: 50,
            desktopFocusY: 50,
            mobileFocusX: 50,
            mobileFocusY: 50,
            tone: "ivory",
            bgColor: "#FFFFFF",
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
      "全屏出血图",
      "作品画廊",
      "文字横幅",
      "视频区块",
      "资质证书",
      "门店信息",
      "单品焦点推荐",
      "预约入口",
    ],
    version: 2,
  },

  /** 珠宝作品 — 视觉框架(6 块+业务区):页头 → 代表作品 → 主题出血图 → 系列对照 → 佩戴灵感 → 精选画廊 → 商品列表（无限加载，其后不设模块） */
  {
    id: "jewelry-products-v1",
    name: "珠宝作品·视觉框架",
    pageType: "products",
    description:
      "六个视觉模块后进入商品列表；无限加载列表之后不设模块。",
    scenario: "作品浏览页",
    tags: ["作品", "框架", "推荐"],
    puckData: {
      content: [
        {
          type: "首屏主视觉",
          props: {
            id: "products-hero",
            title: "珠宝作品",
            subtitle: "从经典系列到当季新作，发现心仪臻品",
            desktopImage: "",
            mobileImage: "",
            actionText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,
            altText: "",
            alignment: "center",
            desktopFocusX: 50,
            desktopFocusY: 50,
            mobileFocusX: 50,
            mobileFocusY: 50,
            locked: false,
          },
        },
        {
          type: "单品焦点推荐",
          props: {
            id: "products-featured",
            eyebrow: "SIGNATURE PIECE",
            title: "代表作品",
            summary: "为重要时刻挑选一件值得珍藏的珠宝，细节与光泽都经得起近距离凝视。",
            productId: 0,
            primaryText: "",
            secondaryText: "",
            secondaryLink: "",
            layout: "imageLeft",
            showPrice: false,
            bgColor: "#FFFFFF",
            locked: false,
          },
        },
        {
          type: "全屏出血图",
          props: {
            id: "products-season-bleed",
            image: "",
            mobileImage: "",
            title: "",
            subtitle: "",
            buttonText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,
            template: "textCenter",
            overlayPreset: "soft",
            altText: "",
            desktopFocusX: 50,
            desktopFocusY: 50,
            mobileFocusX: 50,
            mobileFocusY: 50,
            locked: false,
          },
        },
        {
          type: "双图海报",
          props: {
            id: "products-collection",
            number: "01",
            label: "COLLECTION",
            title: "本季系列",
            description: "主视觉与细节并行，读出这一季的作品语言。",
            mainImage: "",
            detailImage: "",
            actionText: "",
            targetType: "none",
            productId: 0,
            linkUrl: "",
            layout: "mainLeft",
            mainAltText: "",
            detailAltText: "",
            mainFocusX: 50,
            mainFocusY: 50,
            detailFocusX: 50,
            detailFocusY: 50,
            locked: false,
          },
        },
        {
          type: "佩戴灵感",
          props: {
            id: "products-lookbook",
            title: "佩戴灵感",
            subtitle: "在每一个日常与重要时刻，让珠宝成为你的光。",
            image: "",
            imageAlt: "珠宝佩戴灵感",
            productIds: [],
            bgColor: "#FFFFFF",
            locked: false,
          },
        },
        {
          type: "作品画廊",
          props: {
            id: "products-gallery",
            title: "精选画廊",
            subtitle: "",
            items: [
              { image: "", altText: "", caption: "FIG. 01 · 主视觉", link: "" },
              { image: "", altText: "", caption: "", link: "" },
              { image: "", altText: "", caption: "", link: "" },
              { image: "", altText: "", caption: "FIG. 02 · 细节", link: "" },
            ],
            bgColor: "#FFFFFF",
            locked: false,
          },
        },
      ],
      root: { props: {} },
    },
    allowedBlockTypes: [
      "首屏主视觉",
      "单品焦点推荐",
      "全屏出血图",
      "双图海报",
      "佩戴灵感",
      "作品画廊",
      "文字横幅",
    ],
    version: 2,
  },

  /** 选款中心 — 视觉框架(6 块+业务区):页头 → 系列大片 → 品类入口 → 氛围图 → 主推精选 → 场景入口 → 选款工具。
   * 不设尾章：公开渲染把装修模块全部置于业务区之前，工具页前的转化模块会截流选款。 */
  {
    id: "jewelry-catalog-v1",
    name: "选款中心·视觉框架",
    pageType: "catalog",
    description:
      "六个视觉模块后进入筛选工具，保持选款效率优先。",
    scenario: "工具选款页",
    tags: ["选款", "框架", "推荐"],
    puckData: {
      content: [
        {
          type: "首屏主视觉",
          props: {
            id: "catalog-hero",
            title: "选款中心",
            subtitle: "按风格、材质与场景，快速找到合适作品",
            desktopImage: "",
            mobileImage: "",
            actionText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,
            altText: "",
            alignment: "center",
            desktopFocusX: 50,
            desktopFocusY: 50,
            mobileFocusX: 50,
            mobileFocusY: 50,
            locked: false,
          },
        },
        {
          type: "轮播图",
          props: {
            id: "catalog-carousel",
            images: [
              {
                url: "https://placehold.co/1200x500/B8944E/fff?text=珠宝轮播一",
                link: "",
                alt: "珠宝轮播图一",
              },
              {
                url: "https://placehold.co/1200x500/2C2C2C/B8944E?text=珠宝轮播二",
                link: "",
                alt: "珠宝轮播图二",
              },
              {
                url: "https://placehold.co/1200x500/1C1A18/fff?text=珠宝轮播三",
                link: "",
                alt: "珠宝轮播图三",
              },
            ],
            autoPlay: true,
            interval: 4000,
            showDots: true,
            showArrows: true,
            desktopRatio: "wide",
            mobileRatio: "portrait",
            locked: false,
          },
        },
        {
          type: "分类卡片",
          props: {
            id: "catalog-categories",
            title: "探索分类",
            subtitle: "按品类、系列或主题，找到适合你的珠宝作品。",
            categories: [
              { name: "手镯", image: "", link: "/products", count: "" },
              { name: "吊坠", image: "", link: "/products", count: "" },
              { name: "戒指", image: "", link: "/products", count: "" },
            ],
            layout: "grid-3",
            bgColor: "#FFFFFF",
            locked: false,
          },
        },
        {
          type: "全屏出血图",
          props: {
            id: "catalog-atmosphere-bleed",
            image: "",
            mobileImage: "",
            title: "",
            subtitle: "",
            buttonText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,
            template: "textCenter",
            overlayPreset: "soft",
            altText: "",
            desktopFocusX: 50,
            desktopFocusY: 50,
            mobileFocusX: 50,
            mobileFocusY: 50,
            locked: false,
          },
        },
        {
          type: "产品展示行",
          props: {
            id: "catalog-featured-row",
            title: "精选臻品",
            subtitle: "匠心之作，为你甄选",
            productIds: [],
            layout: "grid-4",
            mobileColumns: 2,
            displayMode: "standard",
            actionStyle: "text",
            bgColor: "#FFFFFF",
            showPrice: true,
            showButton: false,
            buttonText: "查看详情",
            locked: false,
          },
        },
        {
          type: "按场景选购",
          props: {
            id: "catalog-occasions",
            title: "场景选款",
            subtitle: "从重要时刻出发，挑选一件恰到好处的珠宝。",
            categories: [
              { name: "求婚告白", image: "", link: "/products", count: "", description: "为承诺点亮心意" },
              { name: "周年纪念", image: "", link: "/products", count: "", description: "珍藏每一段时光" },
              { name: "日常通勤", image: "", link: "/products", count: "", description: "让光泽陪伴日常" },
              { name: "重要礼赠", image: "", link: "/products", count: "", description: "为重要的人挑一份心意" },
            ],
            layout: "grid-4",
            bgColor: "#FFFFFF",
            locked: false,
          },
        },
      ],
      root: { props: {} },
    },
    allowedBlockTypes: [
      "首屏主视觉",
      "轮播图",
      "分类卡片",
      "全屏出血图",
      "产品展示行",
      "按场景选购",
      "文字横幅",
    ],
    version: 2,
  },

  /** 珠宝定制 — 服务叙事(8 块):定制开篇 → 服务总览 → 定制旅程 → 工坊沉浸 → 旧物新生 → 案例画廊 → 宣言 → 预约尾章 */
  {
    id: "jewelry-custom-v1",
    name: "珠宝定制·服务叙事",
    pageType: "custom",
    description:
      "服务总览、定制旅程、旧物新生与案例画廊的八幕结构，收束到定制咨询预约。",
    scenario: "定制服务页",
    tags: ["定制", "服务", "推荐"],
    puckData: {
      content: [
        {
          type: "首屏主视觉",
          props: {
            id: "custom-hero",
            title: "珠宝定制",
            subtitle: "以专属设计，记录独一无二的重要时刻",
            desktopImage: "",
            mobileImage: "",
            actionText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,
            altText: "",
            alignment: "center",
            desktopFocusX: 50,
            desktopFocusY: 50,
            mobileFocusX: 50,
            mobileFocusY: 50,
            locked: false,
          },
        },
        {
          type: "单图海报",
          props: {
            id: "custom-services",
            number: "01",
            label: "BESPOKE SERVICES",
            title: "三种定制方式",
            subtitle: "专属设计 · 珠宝改款 · 尺寸定制",
            desktopImage: "",
            mobileImage: "",
            linkUrl: "",
            actionText: "",
            template: "leftTextRightImage",
            desktopFocusX: 50,
            desktopFocusY: 50,
            mobileFocusX: 50,
            mobileFocusY: 50,
            locked: false,
          },
        },
        {
          type: "定制流程",
          props: {
            id: "custom-journey",
            title: "定制旅程",
            subtitle: "一件珠宝如何为一个人诞生。",
            steps: [
              { number: "01", en: "DISCOVERY", name: "理解您的故事", desc: "倾听佩戴场景、喜好与重要时刻,共同梳理创作方向。", image: "" },
              { number: "02", en: "DESIGN", name: "形成设计语言", desc: "设计师呈现方向与材质建议,反复对齐直至方案明确。", image: "" },
              { number: "03", en: "GEMSTONE", name: "甄选宝石", desc: "从光泽、颜色与纹理出发,挑选与设计呼应的宝石。", image: "" },
              { number: "04", en: "CRAFT", name: "匠心制作", desc: "从起版到镶嵌与表面处理,工坊逐步完成作品。", image: "" },
              { number: "05", en: "DELIVERY", name: "作品交付", desc: "整理作品资料,与您确认交付与后续保养安排。", image: "" },
            ],
            bgColor: "#FFFFFF",
            locked: false,
          },
        },
        {
          type: "全屏出血图",
          props: {
            id: "custom-workshop-bleed",
            image: "",
            mobileImage: "",
            title: "",
            subtitle: "",
            buttonText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,
            template: "textCenter",
            overlayPreset: "soft",
            altText: "",
            desktopFocusX: 50,
            desktopFocusY: 50,
            mobileFocusX: 50,
            mobileFocusY: 50,
            locked: false,
          },
        },
        {
          type: "改款对比",
          props: {
            id: "custom-before-after",
            title: "旧物新生",
            subtitle: "旧物的情感,以新的形态延续。",
            beforeImage: "",
            afterImage: "",
            beforeLabel: "改款前",
            afterLabel: "改款后",
            beforeAltText: "",
            afterAltText: "",
            beforeFocusX: 50,
            beforeFocusY: 50,
            afterFocusX: 50,
            afterFocusY: 50,
            bgColor: "#FFFFFF",
            locked: false,
          },
        },
        {
          type: "作品画廊",
          props: {
            id: "custom-cases-gallery",
            title: "定制案例画廊",
            subtitle: "真实案例需取得客户授权后展示，请在发布前确认素材授权。",
            items: [
              { image: "", altText: "", caption: "FIG. 01 · 定制案例", link: "" },
              { image: "", altText: "", caption: "", link: "" },
              { image: "", altText: "", caption: "", link: "" },
              { image: "", altText: "", caption: "FIG. 02 · 细节", link: "" },
            ],
            bgColor: "#FFFFFF",
            locked: false,
          },
        },
        {
          type: "文字横幅",
          props: {
            id: "custom-credo",
            eyebrow: "ONE OF ONE",
            title: "每一件作品，从一次对话开始",
            body: "",
            buttonText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,

            template: "center",
            bgColor: "#FFFFFF",
            textColor: "#1A1A1A",
            spacing: "spacious",
            locked: false,
          },
        },
        {
          type: "预约入口",
          props: {
            id: "custom-appointment",
            title: "预约定制咨询",
            subtitle: "与专属顾问沟通您的想法",
            buttonText: "开始咨询",
            linkUrl: "/contact",
            phone: "",
            altText: "",
            desktopFocusX: 50,
            desktopFocusY: 50,
            mobileFocusX: 50,
            mobileFocusY: 50,
            tone: "ivory",
            bgColor: "#FFFFFF",
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
      "全屏出血图",
      "定制流程",
      "改款对比",
      "作品画廊",
      "文字横幅",
      "资质证书",
      "视频区块",
      "预约入口",
    ],
    version: 2,
  },

  /** 预约咨询 — 服务承接(6 块+业务区):页头 → 服务宣言 → 代表作品 → 门店与到访 → 顾客之声 → 到店氛围 → 预约表单。 */
  {
    id: "jewelry-contact-v1",
    name: "预约咨询·服务承接",
    pageType: "contact",
    description:
      "页头、门店与口碑铺垫后进入预约表单，转化路径保持单线。",
    scenario: "转化页",
    tags: ["转化", "框架", "推荐"],
    puckData: {
      content: [
        {
          type: "首屏主视觉",
          props: {
            id: "contact-hero",
            title: "预约咨询",
            subtitle: "一对一珠宝顾问，为您安排专属服务",
            desktopImage: "",
            mobileImage: "",
            actionText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,
            altText: "",
            alignment: "center",
            desktopFocusX: 50,
            desktopFocusY: 50,
            mobileFocusX: 50,
            mobileFocusY: 50,
            locked: false,
          },
        },
        {
          type: "文字横幅",
          props: {
            id: "contact-credo",
            eyebrow: "PRIVATE SERVICE",
            title: "一次对话，开始一段服务",
            body: "说明您的佩戴场景与期待，顾问将与您一对一确认后续安排。",
            buttonText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,

            template: "center",
            bgColor: "#FFFFFF",
            textColor: "#1A1A1A",
            spacing: "spacious",
            locked: false,
          },
        },
        {
          type: "单品焦点推荐",
          props: {
            id: "contact-featured",
            eyebrow: "SIGNATURE PIECE",
            title: "代表作品",
            summary: "为重要时刻挑选一件值得珍藏的珠宝，细节与光泽都经得起近距离凝视。",
            productId: 0,
            primaryText: "查看作品",
            secondaryText: "",
            secondaryLink: "",
            layout: "imageLeft",
            showPrice: false,
            bgColor: "#FFFFFF",
            locked: false,
          },
        },
        {
          type: "门店信息",
          props: {
            id: "contact-store",
            storeName: "海川珠宝",
            address: "",
            hours: "",
            phone: "",
            mapUrl: "",
            image: "",
            bgColor: "#FFFFFF",
            locked: false,
          },
        },
        {
          type: "真实评价与实拍",
          props: {
            id: "contact-testimonials",
            title: "来自顾客的真实分享",
            subtitle: "每一份选择，都成为值得被珍藏的故事。",
            testimonials: [
              { name: "林女士", meta: "订制钻戒", content: "从选石到设计都很细致，成品比想象中更有光泽。", image: "" },
              { name: "周先生", meta: "周年纪念礼物", content: "门店顾问很专业，包装和仪式感都让人满意。", image: "" },
              { name: "陈女士", meta: "翡翠吊坠", content: "实物温润通透，证书齐全，佩戴后很喜欢。", image: "" },
            ],
            bgColor: "#FFFFFF",
            locked: false,
          },
        },
        {
          type: "全屏出血图",
          props: {
            id: "contact-store-bleed",
            image: "",
            mobileImage: "",
            title: "",
            subtitle: "",
            buttonText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,
            template: "textCenter",
            overlayPreset: "soft",
            altText: "",
            desktopFocusX: 50,
            desktopFocusY: 50,
            mobileFocusX: 50,
            mobileFocusY: 50,
            locked: false,
          },
        },
      ],
      root: { props: {} },
    },
    allowedBlockTypes: [
      "首屏主视觉",
      "文字横幅",
      "单品焦点推荐",
      "门店信息",
      "真实评价与实拍",
      "全屏出血图",
    ],
    version: 2,
  },
];

/**
 * 页面模板只交付可保存的结构和空白必填位，不把示意文案、虚构评价或外部
 * 占位图片写入草稿/发布数据。编辑器卡片使用独立的 skeleton 示例。
 */
function asBlankStructuralTemplate(template: TemplateDefinition): TemplateDefinition {
  const blankBlock = (block: { type?: string; props?: Record<string, any> }) => {
    const props = { ...(block.props || {}) };
    for (const [key, value] of Object.entries(props)) {
      if (key === "id" || key === "locked" || key === "template" || key === "layout" || key === "spacing" || key === "bgColor" || key === "textColor" || key === "tone") continue;
      if (key === "targetType") {
        props[key] = "none";
      } else if (key === "productId") {
        props[key] = 0;
      } else if (Array.isArray(value)) {
        props[key] = [];
      } else if (typeof value === "string") {
        props[key] = "";
      }
    }
    return { ...block, props };
  };
  const puckData = template.puckData || {};
  return {
    ...template,
    puckData: {
      ...puckData,
      content: Array.isArray(puckData.content) ? puckData.content.map(blankBlock) : [],
      zones: puckData.zones && typeof puckData.zones === "object"
        ? Object.fromEntries(Object.entries(puckData.zones).map(([key, blocks]) => [
            key,
            Array.isArray(blocks) ? blocks.map(blankBlock) : blocks,
          ]))
        : puckData.zones,
    },
  };
}

/** 全部可用模板 */
export const pageTemplates: TemplateDefinition[] = rawPageTemplates.map(asBlankStructuralTemplate);
export const templates: TemplateDefinition[] = pageTemplates;

/** 根据 id 获取模板 */
export function getTemplate(id: string): TemplateDefinition | undefined {
  return templates.find((t) => t.id === id);
}
