/**
 * templates.ts — 预置页面模板定义
 * Phase 5: 模板系统
 */


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

/**
 * 珠宝首页推荐结构 — 只提供品牌叙事与受控素材槽。
 *
 * 这里是新建草稿/安全 fixture，不是公开内容兜底。所有媒体保持为空，
 * 由合同占位呈现构图，并由发布校验阻止在最终素材确认前上线。
 */
export const jewelryHomeTemplate: TemplateDefinition = {
  id: "jewelry-home-v2",
  name: "品牌形象首页",
  pageType: "home",
  description: "六段画册式品牌首页：品牌首屏 → 作品开场 → 代表作品 → 设计与工艺 → 珠宝定制 → 品牌收束。",
  puckData: {
    content: [
      {
        type: "首屏主视觉",
        props: {
          id: "hero-cover",
          eyebrow: "HAICHUAN JEWELRY",
          title: "海川珠宝",
          subtitle: "让作品、材质与细节成为叙事本身",
          desktopImage: "",
          mobileImage: "",
          actionText: "探索珠宝作品",
          linkUrl: "/products",
          targetType: "page",
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
          id: "works-overture",
          eyebrow: "JEWELRY WORKS",
          title: "珠宝作品",
          body: "从整体轮廓到局部细节，以克制的视觉层次呈现作品。",
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
          id: "representative-works",
          image: "",
          mobileImage: "",
          eyebrow: "SELECTED WORKS",
          title: "代表作品",
          subtitle: "最终作品影像与作品事实将在素材确认后补充。",
          buttonText: "进入珠宝作品",
          linkUrl: "/products",
          targetType: "page",
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
        type: "双图海报",
        props: {
          id: "design-and-craft",
          number: "01",
          label: "DESIGN & CRAFT",
          title: "设计与工艺",
          description: "通过线条、比例与细节建立清晰的作品观看关系。",
          mainImage: "",
          detailImage: "",
          actionText: "了解海川",
          targetType: "page",
          productId: 0,
          linkUrl: "/about",
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
        type: "单图海报",
        props: {
          id: "custom-world",
          number: "02",
          label: "BESPOKE JEWELRY",
          title: "珠宝定制",
          subtitle: "从灵感与需求出发，了解珠宝定制的咨询路径。",
          desktopImage: "",
          mobileImage: "",
          linkUrl: "/custom",
          actionText: "探索珠宝定制",
          targetType: "page",
          productId: 0,
          altText: "",
          template: "leftImageRightText",
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
          id: "brand-colophon",
          eyebrow: "HAICHUAN JEWELRY",
          title: "以作品为先",
          body: "让真实作品、材质信息与服务事实构成海川的品牌表达。",
          buttonText: "",
          linkUrl: "",
          targetType: "none",
          productId: 0,
          template: "center",
          bgImage: "",
          spacing: "grand",
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
  version: 3,
};

/** 首页整页方案：用于新建或替换首页，不与单个区块混在模板库里。 */
const rawPageTemplates: TemplateDefinition[] = [
  {
    ...jewelryHomeTemplate,
    coverImage: "/images/admin/templates/jewelry-home-wireframe.png",
    scenario: "奢侈品品牌官网",
    tags: ["品牌形象", "推荐"],
  },
  /* ═══════ 六个品牌页面的推荐起点 ════════
   * 模块全部 locked:false；动态业务页的固定功能区由 editorPages 放在简短首屏之后，
   * 避免作品、筛选和预约任务被连续装饰模块推到页面末尾。 */

  /** 关于海川：品牌宣言 → 审美与价值 → 工作方式 → 真实背景 → 联系入口。 */
  {
    id: "jewelry-about-v1",
    name: "关于海川·品牌叙事",
    pageType: "about",
    description:
      "以作品、审美与可核验背景建立品牌认知；不使用企业宣传栏、荣誉墙或未经确认的事实。",
    scenario: "品牌信任页",
    tags: ["品牌", "信任", "推荐"],
    puckData: {
      content: [
        {
          type: "首屏主视觉",
          props: {
            id: "about-hero",
            title: "关于海川",
            subtitle: "从作品、材质与工作方式出发，认识海川",
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
            id: "about-aesthetic",
            number: "01",
            label: "AESTHETIC & VALUES",
            title: "审美与价值",
            subtitle: "以线条、比例、材质与佩戴关系组织作品表达",
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
            id: "about-studio-craft",
            number: "02",
            label: "STUDIO & CRAFT",
            title: "工作室与工艺",
            description: "仅呈现已经确认的工作环境、制作过程与工艺事实，并为素材补充真实说明。",
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
          type: "全屏出血图",
          props: {
            id: "about-verifiable-background",
            image: "",
            mobileImage: "",
            eyebrow: "VERIFIABLE BACKGROUND",
            title: "真实背景",
            subtitle: "品牌背景、工作室影像与相关说明等待真实资料确认。",
            buttonText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,
            template: "captionBelow",
            overlayPreset: "none",
            bgColor: "#FFFFFF",
            altText: "",
            imageFocusX: 50,
            imageFocusY: 50,
            locked: false,
          },
        },
        {
          type: "预约入口",
          props: {
            id: "about-appointment",
            title: "联系海川",
            subtitle: "如需了解作品或定制，可提交具体需求进入咨询流程。",
            buttonText: "预约咨询",
            linkUrl: "/contact",
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
      "文字横幅",
      "视频区块",
      "资质证书",
      "门店信息",
      "预约入口",
    ],
    version: 3,
  },

  /**
   * 珠宝作品推荐结构 — 编辑式展陈，不承担搜索、筛选、排序或结果工具。
   * 所有媒体与产品引用保持为空，由素材合同和发布校验阻止未确认内容上线。
   */
  {
    id: "jewelry-products-v1",
    name: "珠宝作品·编辑展陈",
    pageType: "products",
    description:
      "六段画册式作品页：系列开场 → 重点作品 → 代表作品引用 → 细节关系 → 作品章节 → 选款中心收束。",
    scenario: "作品展陈页",
    tags: ["作品", "展陈", "编辑式"],
    puckData: {
      content: [
        {
          type: "首屏主视觉",
          props: {
            id: "products-hero",
            eyebrow: "JEWELRY WORKS",
            title: "珠宝作品",
            subtitle: "以整体轮廓、佩戴关系与工艺细节展开作品叙事",
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
          type: "全屏出血图",
          props: {
            id: "products-feature-spread",
            image: "",
            mobileImage: "",
            eyebrow: "SELECTED WORK",
            title: "重点作品",
            subtitle: "最终作品影像与公开事实将在素材确认后补充。",
            buttonText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,
            template: "captionBelow",
            overlayPreset: "none",
            bgColor: "#FFFFFF",
            altText: "",
            imageFocusX: 50,
            imageFocusY: 50,
            locked: false,
          },
        },
        {
          type: "单品焦点推荐",
          props: {
            id: "products-signature-reference",
            eyebrow: "SIGNATURE PIECE",
            title: "代表作品",
            summary: "选择真实公开作品后，此处仅保存稳定引用，名称、图片与经营事实由商品来源解析。",
            productId: 0,
            productCode: "",
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
          type: "双图海报",
          props: {
            id: "products-detail-relationship",
            number: "01",
            label: "FORM & DETAIL",
            title: "轮廓与细节",
            description: "用整体与局部的观看关系呈现作品，不以参数墙代替视觉叙事。",
            mainImage: "",
            detailImage: "",
            actionText: "",
            targetType: "none",
            productId: 0,
            linkUrl: "",
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
          type: "作品画廊",
          props: {
            id: "products-editorial-gallery",
            title: "作品章节",
            subtitle: "在最终素材确认后，以一大一小与平衡不对称的节奏组织作品。",
            items: [],
            bgColor: "#FFFFFF",
            locked: false,
          },
        },
        {
          type: "文字横幅",
          props: {
            id: "products-catalog-colophon",
            eyebrow: "SELECTION CENTER",
            title: "寻找具体款式",
            body: "需要按关键词、货号或属性查找时，请进入选款中心。",
            buttonText: "进入选款中心",
            linkUrl: "/catalog",
            targetType: "page",
            productId: 0,
            template: "center",
            bgColor: "#FFFFFF",
            textColor: "#181A1B",
            spacing: "grand",
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
    version: 3,
  },

  /** 选款中心：精简品牌框架 → 唯一固定选款区 → 顾问协助。 */
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
          type: "文字横幅",
          props: {
            id: "catalog-intro",
            eyebrow: "SELECTION CENTER",
            title: "选款中心",
            body: "按关键词、货号与当前真实数据支持的属性查找作品。",
            buttonText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,
            template: "left",
            bgColor: "#FFFFFF",
            textColor: "#181A1B",
            spacing: "compact",
            locked: false,
          },
        },
        {
          type: "业务功能区",
          props: {
            id: "catalog-business-region",
            pageKey: "catalog",
            title: "选款工具与商品结果",
            description: "搜索、筛选、排序、快速查看、选款清单与询价由选款中心的真实业务逻辑驱动。",
            items: "关键词/货号搜索|条件筛选|排序与结果|快速查看|选款清单|提交询价",
            locked: true,
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
      "全屏出血图",
      "单图海报",
      "文字横幅",
      "预约入口",
    ],
    version: 4,
  },

  /** 珠宝定制：主视觉 → 理念 → 灵感与设计 → 材质与工艺 → 过程 → 案例槽 → 咨询。 */
  {
    id: "jewelry-custom-v1",
    name: "珠宝定制·服务叙事",
    pageType: "custom",
    description:
      "建立统一的高级定制世界；客户需求类型只在最终咨询流程中处理。",
    scenario: "定制服务页",
    tags: ["定制", "服务", "推荐"],
    puckData: {
      content: [
        {
          type: "首屏主视觉",
          props: {
            id: "custom-hero",
            title: "珠宝定制",
            subtitle: "从灵感与需求出发，进入清晰而克制的定制沟通",
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
            id: "custom-philosophy",
            eyebrow: "BESPOKE PHILOSOPHY",
            title: "定制理念",
            body: "围绕已经确认的需求、材质与设计方向展开，不预设未经核实的服务承诺。",
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
          type: "双图海报",
          props: {
            id: "custom-inspiration-design",
            number: "01",
            label: "INSPIRATION & DESIGN",
            title: "灵感与设计",
            description: "通过整体构图与局部细节承接灵感、轮廓和佩戴关系。",
            mainImage: "",
            detailImage: "",
            actionText: "",
            targetType: "none",
            productId: 0,
            linkUrl: "",
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
          type: "单图海报",
          props: {
            id: "custom-material-craft",
            number: "02",
            label: "MATERIAL & CRAFT",
            title: "材质与工艺",
            subtitle: "最终材质、工艺与服务范围以真实资料和咨询确认结果为准。",
            desktopImage: "",
            mobileImage: "",
            linkUrl: "",
            actionText: "",
            targetType: "none",
            productId: 0,
            altText: "",
            template: "leftImageRightText",
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
            title: "定制过程",
            subtitle: "以下步骤为内容结构草稿，发布前需按真实业务流程确认。",
            steps: [
              { number: "01", en: "DISCOVERY", name: "需求沟通", desc: "沟通目标与已知条件，具体内容等待业务确认。", image: "" },
              { number: "02", en: "DESIGN", name: "方案确认", desc: "确认设计与材质方向，具体内容等待业务确认。", image: "" },
              { number: "03", en: "MAKING", name: "制作安排", desc: "按确认结果安排后续，具体内容等待业务确认。", image: "" },
              { number: "04", en: "COMPLETION", name: "完成确认", desc: "核对作品与相关说明，具体内容等待业务确认。", image: "" },
            ],
            bgColor: "#FFFFFF",
            locked: false,
          },
        },
        {
          type: "作品画廊",
          props: {
            id: "custom-cases-gallery",
            title: "完成作品",
            subtitle: "仅展示已确认且具备使用授权的真实案例。",
            items: [],
            bgColor: "#FFFFFF",
            locked: false,
          },
        },
        {
          type: "预约入口",
          props: {
            id: "custom-appointment",
            title: "预约定制咨询",
            subtitle: "提交已知需求，具体服务范围与安排以实际沟通为准。",
            buttonText: "开始咨询",
            linkUrl: "/contact",
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
    version: 3,
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
            subtitle: "提交作品、选款或定制相关需求，具体安排以实际沟通为准。",
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
    version: 3,
  },
];

/**
 * 取得可直接成为 PageDocument 的页面种子。
 *
 * 模板库卡片继续消费下方的空白结构版本；编辑器首次进入消费这份推荐起点。
 * 公开运行时只接受已发布 PageDocument，不能把编辑器种子当成品牌内容兜底。
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
