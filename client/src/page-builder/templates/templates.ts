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
          textColor: "#181A1B",
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

  /* ═══════ 六个品牌页面的推荐起点 ════════
   * 模块全部 locked:false；动态业务页的固定功能区由 editorPages 放在简短首屏之后，
   * 避免作品、筛选和预约任务被连续装饰模块推到页面末尾。 */

  /** 关于海川：影像开场 → 品牌视角 → 可核验实践 → 作品 → 服务入口。 */
  {
    id: "jewelry-about-v1",
    name: "关于海川·信任叙事",
    pageType: "about",
    description:
      "以品牌视角、设计实践和作品建立信任；资质与历史只在运营提供真实证据后添加。",
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
            subtitle: "从材质、比例与佩戴关系理解作品",
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
            description: "展示已经确认的设计、制作或质量信息，并为图片补充真实说明。",
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
            title: "作品先于修饰",
            body: "用经过确认的作品、材质与服务事实说明海川，不以空泛称谓代替真实信息。",
            buttonText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,

            template: "center",
            bgColor: "#FFFFFF",
            textColor: "#181A1B",
            spacing: "spacious",
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

  /** 珠宝作品：精简页头 → 商品作品 → 顾问服务入口。 */
  {
    id: "jewelry-products-v1",
    name: "珠宝作品·视觉框架",
    pageType: "products",
    description:
      "作品列表在简短页头后立即出现，避免编辑内容阻断浏览；尾部承接预约鉴赏。",
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
          type: "预约入口",
          props: {
            id: "products-appointment",
            title: "需要进一步了解作品？",
            subtitle: "说明感兴趣的作品与佩戴需求，由顾问协助确认后续安排。",
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
      "单品焦点推荐",
      "全屏出血图",
      "双图海报",
      "佩戴灵感",
      "作品画廊",
      "文字横幅",
      "预约入口",
    ],
    version: 2,
  },

  /** 选款中心：精简页头 → 筛选与结果 → 顾问协助。 */
  {
    id: "jewelry-catalog-v1",
    name: "选款中心·视觉框架",
    pageType: "catalog",
    description:
      "筛选与结果在简短页头后立即出现；不再用轮播、海报和重复商品区阻断选款。",
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
          type: "预约入口",
          props: {
            id: "catalog-appointment",
            title: "需要顾问协助选款？",
            subtitle: "说明品类、材质与佩戴需求，顾问将结合实际作品提供建议。",
            buttonText: "提交选款需求",
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
      "轮播图",
      "分类卡片",
      "全屏出血图",
      "产品展示行",
      "按场景选购",
      "文字横幅",
      "预约入口",
    ],
    version: 2,
  },

  /** 珠宝定制：服务开场 → 服务范围 → 定制过程 → 经授权案例 → 咨询入口。 */
  {
    id: "jewelry-custom-v1",
    name: "珠宝定制·服务叙事",
    pageType: "custom",
    description:
      "用实际服务范围、确认过程与经授权案例建立信任，收束到定制咨询。",
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
              { number: "01", en: "DISCOVERY", name: "需求沟通", desc: "说明佩戴场景、审美偏好与已有材料,共同梳理需求。", image: "" },
              { number: "02", en: "DESIGN", name: "方案确认", desc: "确认设计范围、材质建议、调整方式与相关安排。", image: "" },
              { number: "03", en: "MAKING", name: "制作沟通", desc: "按已确认方案推进制作与质量检查,同步必要进度。", image: "" },
              { number: "04", en: "DELIVERY", name: "交付说明", desc: "确认作品、相关资料、交付方式与后续服务说明。", image: "" },
            ],
            bgColor: "#FFFFFF",
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

  /** 预约咨询：简洁页头 → 预约表单与联系信息。 */
  {
    id: "jewelry-contact-v1",
    name: "预约咨询·服务承接",
    pageType: "contact",
    description:
      "预约表单紧接页头出现；联系方式、后续流程和 FAQ 由真实业务区提供。",
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
 * 取得可直接成为 PageDocument 的页面种子。
 *
 * 模板库卡片继续消费下方的空白结构版本；页面运行时与编辑器首次进入则共同
 * 消费这份已存在的推荐起点，避免“公开代码兜底”和“画布空白模板”两套页面。
 */
export function createPageDocumentSeed(id: string): any | null {
  const template = rawPageTemplates.find((item) => item.id === id);
  return template?.puckData
    ? JSON.parse(JSON.stringify(template.puckData))
    : null;
}

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
