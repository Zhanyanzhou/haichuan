/**
 * templates.ts — 预置页面模板定义
 * Phase 5: 模板系统
 */
import type { PuckBlock, PuckDocument } from "@/page-builder/types";


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
  puckData: PuckDocument;
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
            template: "leftImageRightText",
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

  /** 珠宝定制：成品开场 → 交错工艺章节 → 通栏转场 → 成品确认与咨询。 */
  {
    id: "jewelry-custom-v1",
    name: "珠宝定制·古法黄金流程",
    pageType: "custom",
    description:
      "以古法黄金手镯成品建立第一视觉焦点，再以交错图文与通栏影像呈现从手绘构想到表面处理的过程。",
    coverImage: "/images/custom-process-v4-editorial/07-final-inspection.png",
    scenario: "定制服务页",
    tags: ["古法黄金", "定制流程", "画册式", "推荐"],
    puckData: {
      content: [
        {
          type: "全屏出血图",
          props: {
            id: "custom-process-overture",
            image: "/images/custom-process-v4-editorial/07-final-inspection.png",
            mobileImage: "/images/custom-process-v4-editorial/07-final-inspection.png",
            eyebrow: "BESPOKE GOLD",
            title: "一只手镯，从构想到成形",
            subtitle: "以足金成品建立第一印象，再回到每一次比例、结构与工艺确认。",
            buttonText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,
            template: "captionBelow",
            overlayPreset: "none",
            altText: "古法黄金手镯定制成品，足金手镯置于明亮工作台上",
            desktopFocusX: 50,
            desktopFocusY: 58,
            mobileFocusX: 50,
            mobileFocusY: 50,
            locked: false,
          },
        },
        {
          type: "单图海报",
          props: {
            id: "custom-process-sketching",
            number: "01",
            label: "",
            title: "从一笔线条开始",
            subtitle: "确认轮廓、比例与纹样方向，为后续制作建立清晰依据。",
            desktopImage: "/images/custom-process-v4-editorial/01-concept-sketching.png",
            mobileImage: "/images/custom-process-v4-editorial/01-concept-sketching.png",
            linkUrl: "",
            actionText: "",
            targetType: "none",
            productId: 0,
            altText: "古法黄金手镯定制第一阶段，手绘设计稿与制图工具",
            template: "leftImageRightText",
            aspectRatio: "3 / 2",
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
            id: "custom-process-rhino-modeling",
            number: "02",
            label: "",
            title: "让比例进入数字空间",
            subtitle: "在 Rhino 中校准曲线、厚度与结构，把构想转化为可制作形态。",
            desktopImage: "/images/custom-process-v4-editorial/02-rhino-modeling.png",
            mobileImage: "/images/custom-process-v4-editorial/02-rhino-modeling.png",
            linkUrl: "",
            actionText: "",
            targetType: "none",
            productId: 0,
            altText: "古法黄金手镯定制第二阶段，在 Rhino 中进行三维建模",
            template: "leftTextRightImage",
            aspectRatio: "3 / 2",
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
            id: "custom-process-wax-prototype",
            image: "/images/custom-process-v4-editorial/03-red-wax-prototype.png",
            mobileImage: "/images/custom-process-v4-editorial/03-red-wax-prototype.png",
            eyebrow: "03 · WAX PROTOTYPING",
            title: "看见真实体量",
            subtitle: "一比一红蜡模型让体量与佩戴关系第一次变得可触碰。",
            linkUrl: "",
            buttonText: "",
            targetType: "none",
            productId: 0,
            altText: "古法黄金手镯定制第三阶段，制作一比一红蜡模型",
            template: "captionBelow",
            overlayPreset: "none",
            desktopFocusX: 50,
            desktopFocusY: 55,
            mobileFocusX: 50,
            mobileFocusY: 50,
            locked: false,
          },
        },
        {
          type: "单图海报",
          props: {
            id: "custom-process-casting",
            number: "04",
            label: "",
            title: "从蜡型转向金属",
            subtitle: "经失蜡与铸造，红蜡形态转化为黄金铸坯。",
            desktopImage: "/images/custom-process-v4-editorial/04-investment-casting.png",
            mobileImage: "/images/custom-process-v4-editorial/04-investment-casting.png",
            linkUrl: "",
            actionText: "",
            targetType: "none",
            productId: 0,
            altText: "古法黄金手镯定制第四阶段，失蜡铸造与倒模成型",
            template: "leftTextRightImage",
            aspectRatio: "3 / 2",
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
            id: "custom-process-hand-refinement",
            number: "05",
            label: "",
            title: "让边缘回到尺度",
            subtitle: "逐步清理浇口并修整边缘，让弧度与细节回到设计尺度。",
            desktopImage: "/images/custom-process-v4-editorial/05-hand-refinement.png",
            mobileImage: "/images/custom-process-v4-editorial/05-hand-refinement.png",
            linkUrl: "",
            actionText: "",
            targetType: "none",
            productId: 0,
            altText: "古法黄金手镯定制第五阶段，工匠手工修整黄金铸坯",
            template: "leftImageRightText",
            aspectRatio: "3 / 2",
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
            id: "custom-process-matte-finishing",
            image: "/images/custom-process-v4-editorial/06-matte-finishing.png",
            mobileImage: "/images/custom-process-v4-editorial/06-matte-finishing.png",
            eyebrow: "06 · MATTE FINISHING",
            title: "留住温润肌理",
            subtitle: "通过细致处理建立古法黄金温润克制的哑光肌理。",
            linkUrl: "",
            buttonText: "",
            targetType: "none",
            productId: 0,
            altText: "古法黄金手镯定制第六阶段，形成温润的哑光表面",
            template: "captionBelow",
            overlayPreset: "none",
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
            id: "custom-service-note",
            eyebrow: "07 · FINAL INSPECTION",
            title: "以成品完成确认",
            body: "确认尺寸、表面与细节状态，再围绕交付与后续服务逐项沟通；实际周期与费用以双方确认结果为准。",
            buttonText: "开始定制咨询",
            linkUrl: "/contact?type=custom",
            targetType: "page",
            productId: 0,
            template: "center",
            bgColor: "#FFFFFF",
            textColor: "#181A1B",
            spacing: "spacious",
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
    version: 6,
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
 * 取得可直接成为 PageDocument 的中性页面种子。
 *
 * 编辑器首次进入只继承模块结构与设计参数，不自动写入示意文案、未经核验的
 * 经营事实或素材。公开运行时只接受已发布 PageDocument，不能把编辑器种子
 * 当成品牌内容兜底。
 */
export function createPageDocumentSeed(id: string): PuckDocument | null {
  const template = rawPageTemplates.find((item) => item.id === id);
  const structuralTemplate = template ? asBlankStructuralTemplate(template) : null;
  return structuralTemplate?.puckData
    ? JSON.parse(JSON.stringify(structuralTemplate.puckData))
    : null;
}

/**
 * 页面模板只交付可保存的结构和空白必填位，不把示意文案、虚构评价或外部
 * 占位图片写入草稿/发布数据。编辑器卡片使用独立的 skeleton 示例。
 */
function asBlankStructuralTemplate(template: TemplateDefinition): TemplateDefinition {
  const blankBlock = (block: PuckBlock): PuckBlock => {
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
