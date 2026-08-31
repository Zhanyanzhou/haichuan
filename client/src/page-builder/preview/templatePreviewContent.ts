import type { RegisteredContentTemplateKey } from "../generated/contentTemplates.generated";

import previewWide from "../preview-assets/neutral-template-preview-v1/template-preview-wide.svg";
import previewSquare from "../preview-assets/neutral-template-preview-v1/template-preview-square.svg";
import previewPortrait from "../preview-assets/neutral-template-preview-v1/template-preview-portrait.svg";

const heroWide = previewWide;
const wearingPortrait = previewPortrait;
const productRingSquare = previewSquare;
const detailEarringsPortrait = previewPortrait;
const craftVideoWide = previewWide;
const salonWide = previewWide;
const fullBleedNecklaceWide = previewWide;
const doublePosterMainWide = previewWide;
const carouselBraceletWide = previewWide;
const comparisonBeforeSquare = previewSquare;
const comparisonAfterSquare = previewSquare;
const hotspotWide = previewWide;
const limitedEventWide = previewWide;
const categoryBraceletSquare = previewSquare;
const previewWideAlt = "横向模板预览占位图，不代表实际素材";
const previewSquareAlt = "方形模板预览占位图，不代表实际素材";
const previewPortraitAlt = "竖向模板预览占位图，不代表实际素材";

type PreviewProps = Record<string, unknown>;

const previewProduct = (input: {
  id: number;
  code: string;
  name: string;
  image: string;
}) => ({
  ...input,
  price: 0,
  priceLabel: "",
  category: "",
  status: "PUBLISHED",
  visibility: "PUBLIC",
  eligible: true,
  reason: "AVAILABLE" as const,
});

const ringProduct = previewProduct({
  id: 91001,
  code: "PREVIEW-RING",
  name: "流线戒指",
  image: productRingSquare,
});

const earringsProduct = previewProduct({
  id: 91002,
  code: "PREVIEW-EARRINGS",
  name: "双线耳饰",
  image: detailEarringsPortrait,
});

const braceletProduct = previewProduct({
  id: 91003,
  code: "PREVIEW-BRACELET",
  name: "交叠手镯",
  image: categoryBraceletSquare,
});

/**
 * 只用于模板目录、设计画布和预览样例的中性占位内容。
 * 这些值不会成为组件 defaultProps，也不会进入拖入后的 PageDocument。
 */
export const TEMPLATE_PREVIEW_CONTENT: Record<RegisteredContentTemplateKey, PreviewProps> = {
  hero: {
    desktopImage: heroWide,
    mobileImage: wearingPortrait,
    eyebrow: "QUIET LIGHT",
    title: "光，沿线而生",
    subtitle: "以克制的比例，留住金属与肌肤之间的呼吸。",
    actionText: "探索作品",
    alignment: "left",
    textTone: "light",
    desktopFocusX: 68,
    desktopFocusY: 45,
    mobileFocusX: 48,
    mobileFocusY: 40,
  },
  fullBleed: {
    image: fullBleedNecklaceWide,
    mobileImage: detailEarringsPortrait,
    eyebrow: "FORM STUDY",
    title: "线条的秩序",
    subtitle: "一幅完整影像之后，只留下必要的说明。",
    buttonText: "查看系列",
    template: "captionBelow",
    overlayPreset: "none",
    desktopFocusX: 50,
    desktopFocusY: 52,
    mobileFocusX: 52,
    mobileFocusY: 48,
  },
  video: {
    // 模板目录展示真实空素材状态，避免无效示例视频触发深色错误遮罩。
    videoUrl: "",
    posterUrl: "",
    title: "一根金属线的旅程",
    subtitle: "从手势、力度到最终弧度。",
    actionText: "观看工艺影像",
    showControls: false,
    autoPlay: false,
    focusX: 70,
    focusY: 50,
  },
  carousel: {
    images: [
      { url: carouselBraceletWide, alt: previewWideAlt, link: "" },
      { url: fullBleedNecklaceWide, alt: previewWideAlt, link: "" },
      { url: salonWide, alt: previewWideAlt, link: "" },
    ],
    autoPlay: false,
    showDots: true,
    showArrows: true,
  },
  singlePoster: {
    number: "01",
    label: "PORTRAIT",
    title: "贴近肌肤的线",
    subtitle: "让竖幅影像成为主角，文字退到边缘。",
    desktopImage: wearingPortrait,
    mobileImage: wearingPortrait,
    actionText: "查看作品",
    template: "leftTextRightImage",
    desktopFocusX: 48,
    desktopFocusY: 42,
    mobileFocusX: 48,
    mobileFocusY: 42,
  },
  doublePoster: {
    number: "02",
    label: "FORM & DETAIL",
    title: "整体与细节",
    description: "主图建立姿态，辅图只负责一次更近的凝视。",
    mainImage: doublePosterMainWide,
    detailImage: detailEarringsPortrait,
    actionText: "展开系列",
    mainFocusX: 34,
    mainFocusY: 48,
    detailFocusX: 50,
    detailFocusY: 44,
  },
  craftDetails: {
    eyebrow: "CRAFT STUDY",
    title: "结构与光",
    body: "主图建立制作语境，两张细节图只补充必要的材质观察。",
    leadImage: craftVideoWide,
    leadAltText: previewWideAlt,
    detailImageOne: detailEarringsPortrait,
    detailOneAltText: previewPortraitAlt,
    detailImageTwo: productRingSquare,
    detailTwoAltText: previewSquareAlt,
    leadFocusX: 70,
    leadFocusY: 50,
    detailOneFocusX: 50,
    detailOneFocusY: 44,
    detailTwoFocusX: 50,
    detailTwoFocusY: 50,
  },
  textBanner: {
    eyebrow: "HAICHUAN EDIT",
    title: "不追逐喧哗，只让比例与材质说话。",
    body: "一段文字也应当拥有留白、节奏和明确的阅读层级。",
    buttonText: "阅读品牌故事",
    template: "center",
    spacing: "large",
  },
  journey: {
    title: "定制旅程",
    subtitle: "从一次交谈，到一件只属于你的作品。",
    steps: [
      { number: "01", en: "DIALOGUE", name: "理解", desc: "确认佩戴场景与审美方向。", image: "" },
      { number: "02", en: "SKETCH", name: "构想", desc: "把想法收敛为比例与线条。", image: "" },
      { number: "03", en: "MATERIAL", name: "选材", desc: "观察材质在真实光线中的状态。", image: "" },
      { number: "04", en: "CRAFT", name: "制作", desc: "在反复校准中完成细节。", image: "" },
      { number: "05", en: "FITTING", name: "交付", desc: "最后确认佩戴与保养方式。", image: "" },
    ],
  },
  comparison: {
    title: "旧物新生",
    subtitle: "同一颗主石，在相同镜位中看见结构的改变。",
    beforeImage: comparisonBeforeSquare,
    afterImage: comparisonAfterSquare,
    beforeLabel: "改款前",
    afterLabel: "改款后",
    beforeAltText: previewSquareAlt,
    afterAltText: previewSquareAlt,
    beforeFocusX: 50,
    beforeFocusY: 50,
    afterFocusX: 50,
    afterFocusY: 50,
  },
  featuredProduct: {
    eyebrow: "SIGNATURE FORM",
    title: "一件作品，一个焦点",
    summary: "大幅作品图与克制说明共同建立单品的视觉重量。",
    primaryText: "查看作品",
    secondaryText: "预约鉴赏",
    layout: "imageLeft",
    showPrice: false,
    __previewProduct: ringProduct,
  },
  productRow: {
    title: "精选作品",
    subtitle: "相同比例、不同轮廓，形成安静而清晰的浏览节奏。",
    layout: "grid-3",
    mobileColumns: 1,
    displayMode: "album",
    showPrice: false,
    __previewProducts: [ringProduct, earringsProduct, braceletProduct],
  },
  gallery: {
    title: "光与材质",
    subtitle: "以大小、横竖与远近变化组织一组编辑式画廊。",
    items: [
      { image: wearingPortrait, altText: previewPortraitAlt, caption: "FIG. 01 · PORTRAIT", link: "" },
      { image: productRingSquare, altText: previewSquareAlt, caption: "", link: "" },
      { image: detailEarringsPortrait, altText: previewPortraitAlt, caption: "", link: "" },
      { image: craftVideoWide, altText: previewWideAlt, caption: "FIG. 02 · CRAFT", link: "" },
    ],
  },
  wearingInspiration: {
    title: "佩戴灵感",
    subtitle: "主肖像负责情绪，关联作品只作为轻量补充。",
    image: wearingPortrait,
    altText: previewPortraitAlt,
    actionText: "查看更多",
    __previewProducts: [earringsProduct, braceletProduct],
  },
  categoryCards: {
    title: "按形态探索",
    subtitle: "方形卡片以轮廓区分类别，不依赖冗长说明。",
    layout: "grid-3",
    categorySlugs: [],
    categories: [
      { name: "戒指", image: productRingSquare, link: "/catalog", altText: previewSquareAlt, focusX: 50, focusY: 50 },
      { name: "耳饰", image: detailEarringsPortrait, link: "/catalog", altText: previewPortraitAlt, focusX: 50, focusY: 48 },
      { name: "手镯", image: categoryBraceletSquare, link: "/catalog", altText: previewSquareAlt, focusX: 50, focusY: 50 },
    ],
  },
  sceneShopping: {
    title: "按场景选款",
    subtitle: "四张竖幅卡片以不同情绪建立入口。",
    layout: "grid-4",
    categorySlugs: [],
    categories: [
      { name: "重要时刻", description: "克制而明确", image: heroWide, link: "/catalog", altText: previewWideAlt, focusX: 72, focusY: 48 },
      { name: "日常佩戴", description: "轻盈地靠近肌肤", image: wearingPortrait, link: "/catalog", altText: previewPortraitAlt, focusX: 50, focusY: 42 },
      { name: "专属定制", description: "从手势开始", image: craftVideoWide, link: "/custom", altText: previewWideAlt, focusX: 72, focusY: 50 },
      { name: "到店鉴赏", description: "在真实光线中观察", image: salonWide, link: "/contact", altText: previewWideAlt, focusX: 50, focusY: 50 },
    ],
  },
  hotspot: {
    image: hotspotWide,
    mobileImage: hotspotWide,
    altText: previewWideAlt,
    hotspots: [
      { x: 20, y: 57, width: 8, height: 12, link: "/catalog", label: "戒指" },
      { x: 50, y: 43, width: 8, height: 14, link: "/catalog", label: "耳饰" },
      { x: 80, y: 60, width: 8, height: 12, link: "/catalog", label: "手镯" },
    ],
    mobileHotspots: [
      { x: 20, y: 57, width: 10, height: 10, link: "/catalog", label: "戒指" },
      { x: 50, y: 43, width: 10, height: 10, link: "/catalog", label: "耳饰" },
      { x: 80, y: 60, width: 10, height: 10, link: "/catalog", label: "手镯" },
    ],
  },
  brandPoints: {
    title: "设计语言",
    subtitle: "不用图标堆砌，让信息本身形成秩序。",
    layout: "grid-3",
    cards: [
      { icon: "", title: "克制比例", body: "先建立留白，再决定信息密度。" },
      { icon: "", title: "材质真实", body: "让光泽与表面细节保持可信。" },
      { icon: "", title: "长期观看", body: "减少一次性的装饰和口号。" },
    ],
  },
  servicePromises: {
    title: "服务信息",
    subtitle: "四项并列信息保持同等层级，便于快速浏览。",
    layout: "grid-4",
    cards: [
      { icon: "", title: "预约沟通", body: "服务内容以实际确认为准。" },
      { icon: "", title: "作品养护", body: "发布前填写已确认安排。" },
      { icon: "", title: "交付说明", body: "发布前填写已确认方式。" },
      { icon: "", title: "后续服务", body: "发布前填写已确认范围。" },
    ],
  },
  certificates: {
    title: "资料与证书",
    subtitle: "仅在信息经过核验后，上传真实资料。",
    certificates: [
      { name: "资料槽位 01", desc: "经核验后替换", imageUrl: "", verificationConfirmed: false },
      { name: "资料槽位 02", desc: "经核验后替换", imageUrl: "", verificationConfirmed: false },
      { name: "资料槽位 03", desc: "经核验后替换", imageUrl: "", verificationConfirmed: false },
    ],
  },
  storeInfo: {
    image: salonWide,
  },
  testimonials: {
    title: "顾客故事",
    subtitle: "仅展示已取得公开授权的真实内容。",
    testimonials: [
      {
        name: "授权内容位置",
        meta: "版式预览",
        content: "已取得授权的顾客故事将在此呈现",
        image: detailEarringsPortrait,
        authorizationConfirmed: false,
      },
    ],
  },
  booking: {
    backgroundImage: salonWide,
    title: "预约鉴赏",
    subtitle: "在安静的空间里，近距离观察材质与比例。",
    buttonText: "预约时间",
    tone: "ivory",
    desktopFocusX: 50,
    desktopFocusY: 48,
    mobileFocusX: 50,
    mobileFocusY: 48,
  },
  limitedEvent: {
    eventImage: limitedEventWide,
    eyebrow: "PRIVATE VIEW",
    title: "特别鉴赏时段",
    body: "活动信息、时间与适用规则请在发布前确认。",
    targetDate: "",
    benefits: [],
    buttonText: "了解安排",
  },
};

export function getTemplatePreviewContent(key: RegisteredContentTemplateKey) {
  return TEMPLATE_PREVIEW_CONTENT[key] ?? {};
}
