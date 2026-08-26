/**
 * 装修模块契约 — 模板库、画布、属性面板和发布校验共同使用的规则源。
 *
 * 当前覆盖四类样板：混合图文、比例海报、商品内容、特殊热区。
 */

import {
  normalizeLinkTargetType,
  resolveItemLinkUrl,
  resolveLinkTargetUrl,
  resolvePrefixedLinkTarget,
  type LinkTargetValue,
} from "../utils/linkTarget";
import { CONTENT_TEMPLATE_CONTRACTS } from "../generated/contentTemplates.generated";

/**
 * 比例单一来源:schema v3 生成契约的 roles[].defaultRatioByViewport。
 * 给人看的规格(imageSpecs/上传提示)也一律经 getContractRoleRatio 派生,
 * 不再手写字面值(2026-08-18 比例派生管道)。
 */

export type ImageTextTemplate =
  "textLeftImageRight" | "textRightImageLeft" | "textOnly" | "imageBackground";

export type ModuleDensity = "compact" | "normal" | "spacious";

export type ContractKey = keyof typeof CONTENT_TEMPLATE_CONTRACTS;
type ContractViewport = "desktop" | "mobile";

/** 所有真实 Renderer 的素材比例只从 schema v3 生成产物读取。 */
export function getContractRoleRatio(
  key: ContractKey,
  roleId: string,
  viewport: ContractViewport,
): string {
  const role = CONTENT_TEMPLATE_CONTRACTS[key].roles.find((item) => item.id === roleId);
  const ratioMap: Partial<Record<ContractViewport, string>> | undefined =
    role && "defaultRatioByViewport" in role
      ? role.defaultRatioByViewport
      : undefined;
  const ratio = ratioMap?.[viewport];
  if (!ratio) throw new Error(`内容模板 ${String(key)}.${roleId}.${viewport} 缺少默认比例`);
  return ratio;
}

/** 槽位在指定端允许的比例预设(含默认);契约未声明预设时回退为仅默认值。 */
export function getContractRoleRatioPresets(
  key: ContractKey,
  roleId: string,
  viewport: ContractViewport,
): readonly string[] {
  const role = CONTENT_TEMPLATE_CONTRACTS[key].roles.find((item) => item.id === roleId);
  const presetMap: Partial<Record<ContractViewport, readonly string[]>> | undefined =
    role && "allowedRatioPresetsByViewport" in role
      ? role.allowedRatioPresetsByViewport
      : undefined;
  const list = presetMap?.[viewport];
  return list?.length ? list : [getContractRoleRatio(key, roleId, viewport)];
}

/** 数组/集合条目上下限只从机器合同 roles[].quantity 派生，避免 Inspector 另建规则表。 */
export function getContractRoleQuantity(
  key: ContractKey,
  roleId: string,
): { default: number; min: number; max: number } {
  const role = CONTENT_TEMPLATE_CONTRACTS[key].roles.find((item) => item.id === roleId);
  const quantity =
    role && "quantity" in role
      ? (role.quantity as { default: number; min: number; max: number } | undefined)
      : undefined;
  if (!quantity) throw new Error(`内容模板 ${String(key)}.${roleId} 缺少条目数量合同`);
  return quantity;
}

/**
 * 内容区块保存的比例覆盖值(冒号格式如 "4:5")解析为契约比例:
 * 经本端白名单校验,越界/旧值一律回退契约默认,渲染层不会带出非规范比例。
 */
export function resolveContractAspectRatio(
  key: ContractKey,
  roleId: string,
  requested: string | undefined,
  viewport: ContractViewport,
): string {
  const presets = getContractRoleRatioPresets(key, roleId, viewport);
  const normalized = requested?.trim().replace(":", " / ");
  return normalized && presets.includes(normalized)
    ? normalized
    : getContractRoleRatio(key, roleId, viewport);
}

/**
 * 内容合同只有 desktop / mobile 两端。768–1023px 仍可做纯 CSS 几何适配，
 * 但素材、比例与阅读顺序继续继承 desktop，不能形成第三个合同设备源。
 */
export const RESPONSIVE_CANVAS = {
  // 桌面画布 1920（2026-08-16）：wide 内容档 1520 在 1440 画布下被压至 ~1267px，
  // 观感失真约 20%；1920 视口下 wide 档（1520+两侧留白）可完整呈现。
  desktop: { width: 1920, height: 1200 },
  mobile: { width: 390, height: 844 },
  compactDesktopMediaQuery: "(min-width: 768px) and (max-width: 1023px)",
  mobileMaxWidth: 767,
  mobileMediaQuery: "(max-width: 767px)",
} as const;

export function isMobileCanvasWidth(width: number | "100%"): boolean {
  return typeof width === "number" && width <= RESPONSIVE_CANVAS.mobileMaxWidth;
}

export interface SinglePosterContractProps {
  title?: string;
  desktopImage?: string;
  mobileImage?: string;
  linkUrl?: string;
  altText?: string;
}

export interface ProductRowContractProps {
  title?: string;
  productIds?: unknown;
  displayMode?: string;
  mobileColumns?: number;
  actionStyle?: string;
  showButton?: boolean;
  buttonText?: string;
}

export interface HotspotContractItem {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  link?: string;
  label?: string;
}

export interface HotspotContractProps {
  image?: string;
  mobileImage?: string;
  hotspots?: unknown;
  mobileHotspots?: unknown;
}

export interface ModuleContractStatus {
  completed: number;
  total: number;
  errors: string[];
  warnings: string[];
}

export interface HeroContractProps extends LinkTargetValue {
  desktopImage?: string;
  mobileImage?: string;
  title?: string;
  subtitle?: string;
  actionText?: string;
  altText?: string;
}

export interface FullBleedContractProps extends LinkTargetValue {
  image?: string;
  mobileImage?: string;
  title?: string;
  altText?: string;
}

export interface DoublePosterContractProps extends LinkTargetValue {
  mainImage?: string;
  detailImage?: string;
  title?: string;
  description?: string;
  mainAltText?: string;
  detailAltText?: string;
}

export interface CraftDetailsContractProps {
  title?: string;
  leadImage?: string;
  leadAltText?: string;
  detailImageOne?: string;
  detailOneAltText?: string;
  detailImageTwo?: string;
  detailTwoAltText?: string;
}

export interface FeaturedProductContractProps {
  productId?: number | string;
  title?: string;
  summary?: string;
  primaryText?: string;
  secondaryText?: string;
  /** 旧字段:下拉白名单值,双读兜底 */
  secondaryLink?: string;
  /** 次行动跳转三件套(secondary 前缀,2026-08-18 P1-3) */
  secondaryTargetType?: string;
  secondaryProductId?: number | string;
  secondaryLinkUrl?: string;
}

export interface CategoryCardContractItem {
  name?: string;
  image?: string;
  /** 旧字段:裸站内路径,双读兜底 */
  link?: string;
  /** 跳转三件套(2026-08-18 P1-3) */
  targetType?: string;
  productId?: number | string;
  linkUrl?: string;
  description?: string;
}

export interface CategoryCardsContractProps {
  title?: string;
  categories?: unknown;
  layout?: string;
}

export interface AppointmentContractProps {
  title?: string;
  subtitle?: string;
  buttonText?: string;
  /** 旧字段:下拉白名单值,双读兜底 */
  linkUrl?: string;
  /** 跳转三件套(2026-08-18 P1-3) */
  targetType?: string;
  productId?: number | string;
  backgroundImage?: string;
  altText?: string;
}

export const HERO_CONTRACT = {
  type: "首屏主视觉",
  purpose: "用全屏视觉建立网站的第一品牌印象，并提供一个清晰行动入口。",
  canvas: {
    heightMode: "viewport",
    // 素材建议比例(渲染为视口裁切驱动,不锁比例):PC 16:7 / Mobile 4:5
    desktopMediaAspectRatio: CONTENT_TEMPLATE_CONTRACTS.hero.media[0].desktopRatio,
    mobileMediaAspectRatio: CONTENT_TEMPLATE_CONTRACTS.hero.media[1].mobileRatio,
    independentFocus: true,
  },
  content: { limits: CONTENT_TEMPLATE_CONTRACTS.hero.contentBudget.limits },
} as const;

export const FULL_BLEED_CONTRACT = {
  type: "全屏出血图",
  purpose: "用一张超宽图片完成章节转场，短说明与行动入口固定在图片下方。",
  canvas: {
    heightMode: "ratio",
    desktopMediaAspectRatio: CONTENT_TEMPLATE_CONTRACTS.fullBleed.media[0].desktopRatio,
    mobileMediaAspectRatio: CONTENT_TEMPLATE_CONTRACTS.fullBleed.media[1].mobileRatio,
    independentFocus: true,
  },
  content: { limits: CONTENT_TEMPLATE_CONTRACTS.fullBleed.contentBudget.limits },
} as const;

export const DOUBLE_POSTER_CONTRACT = {
  type: "双图海报",
  purpose: "使用主图和细节图共同呈现系列气质、作品全貌与工艺细节。",
  canvas: {
    heightMode: "content",
    maxWidth: 1280,
    mainMediaAspectRatio: CONTENT_TEMPLATE_CONTRACTS.doublePoster.media[0].desktopRatio,
    detailMediaAspectRatio: CONTENT_TEMPLATE_CONTRACTS.doublePoster.media[1].desktopRatio,
    layouts: ["mainLeft"],
  },
  content: {
    limits: {
      ...CONTENT_TEMPLATE_CONTRACTS.doublePoster.contentBudget.limits,
    },
  },
} as const;

export const CRAFT_DETAILS_CONTRACT = {
  type: "工艺细节",
  purpose: "以一张工艺主图和两张局部细节图呈现经过核验的材质、结构与制作信息。",
  canvas: {
    heightMode: "content",
    maxWidth: 1520,
    leadAspectRatio: getContractRoleRatio("craftDetails", "leadImage", "desktop"),
    detailAspectRatio: getContractRoleRatio("craftDetails", "detailImageOne", "desktop"),
  },
  content: {
    limits: { ...CONTENT_TEMPLATE_CONTRACTS.craftDetails.contentBudget.limits },
  },
} as const;

export const FEATURED_PRODUCT_CONTRACT = {
  type: "单品焦点推荐",
  purpose:
    "集中呈现一件核心作品的主图与关键卖点；品牌页隐藏价格，电商页可选显示。",
  canvas: {
    heightMode: "content",
    maxWidth: 1180,
    mediaAspectRatio: getContractRoleRatio("featuredProduct", "product", "desktop"),
    layouts: ["imageLeft", "imageRight"],
  },
  content: {
    minProducts: 1,
    maxProducts: 1,
    limits: { eyebrow: 20, title: 24, summary: 120, actionText: 10 },
  },
  defaults: {
    layout: "imageLeft",
    primaryText: "查看作品",
    secondaryLink: "/contact",
    showPrice: false,
  },
} as const;

export const CATEGORY_CARDS_CONTRACT = {
  type: "分类卡片",
  purpose:
    "让访客按系列或品类快速进入选购路径；卡片承担导航，不承载复杂商品信息。",
  canvas: {
    heightMode: "content",
    maxWidth: 1280,
    mediaAspectRatio: getContractRoleRatio("categoryCards", "categories", "desktop"),
    desktopColumns: [2, 3, 4],
    mobileColumns: 2,
  },
  content: {
    minItems: 2,
    maxItems: 6,
    limits: { title: 24, subtitle: 60, name: 12, description: 36, altText: 80 },
  },
  defaults: { layout: "grid-3" },
} as const;

/* ═══════ 作品画廊(Asymmetric Gallery)契约 ═══════ */

export interface GalleryContractItem {
  image?: string;
  altText?: string;
  caption?: string;
  link?: string;
}

export interface GalleryContractProps {
  title?: string;
  subtitle?: string;
  items?: unknown;
}

export const GALLERY_CONTRACT = {
  type: "作品画廊",
  purpose: "以非对称多图画廊呈现作品、空间与证书,强调作品本身而非文案。",
  canvas: {
    heightMode: "content",
    maxWidth: 1520,
    primaryMediaAspectRatio: getContractRoleRatio("gallery", "works", "desktop"),
    secondaryMediaAspectRatios: [getContractRoleRatio("gallery", "works", "desktop")],
  },
  content: {
    minItems: 3,
    maxItems: 6,
    limits: { title: 24, subtitle: 60, caption: 24, altText: 80 },
  },
  defaults: {},
} as const;

export function evaluateGalleryContract(
  props: GalleryContractProps,
): ModuleContractStatus {
  const items = Array.isArray(props.items) ? props.items : [];
  const completeItems = items.filter(
    (item: GalleryContractItem) =>
      typeof item?.image === "string" && item.image.trim(),
  );
  const enoughItems = items.length >= GALLERY_CONTRACT.content.minItems;
  const checks = [
    hasText(props.title),
    enoughItems,
    enoughItems && completeItems.length === items.length,
  ];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!hasText(props.title)) errors.push("请填写画廊标题");
  if (items.length > 0 && items.length < GALLERY_CONTRACT.content.minItems)
    errors.push(
      `画廊至少需要 ${GALLERY_CONTRACT.content.minItems} 张图片,建议 3–5 张形成节奏`,
    );
  if (items.length > GALLERY_CONTRACT.content.maxItems)
    errors.push(`画廊图片不能超过 ${GALLERY_CONTRACT.content.maxItems} 张`);
  if (items.some((item: GalleryContractItem) => !hasText(item?.image)))
    errors.push("存在未上传图片的条目");
  if (items.some((item: GalleryContractItem) => !hasText(item?.altText)))
    warnings.push("建议为每张图片补充替代文字");
  if (items.every((item: GalleryContractItem) => !hasText(item?.caption)))
    warnings.push("建议为关键作品补充一句图注(如 FIG. 01 · 系列名)");
  return {
    completed: checks.filter(Boolean).length,
    total: checks.length,
    errors,
    warnings,
  };
}

export const APPOINTMENT_CONTRACT = {
  type: "预约入口",
  purpose: "以一个明确主行动引导访客进入预约咨询；统一联系电话仅作为次要联系入口。",
  canvas: {
    heightMode: "content",
    minHeight: 380,
    maxWidth: 1280,
    heightModeByViewport: CONTENT_TEMPLATE_CONTRACTS.booking.heightModeByViewport,
  },
  content: {
    limits: { title: 24, subtitle: 72, buttonText: 10, altText: 80 },
  },
  defaults: { linkUrl: "/contact", tone: "ivory" },
} as const;

export const IMAGE_TEXT_CONTRACT = {
  type: "图文混排",
  purpose: "用图片与文字讲述品牌、工艺、材质或系列故事。",
  canvas: {
    heightMode: "mixed",
    maxWidth: 1280,
    desktopColumns: "1fr 1fr",
    desktopMediaAspectRatio: "4 / 3",
    mobileMediaAspectRatio: "3 / 4",
    mobileBreakpoint: 767,
  },
  content: {
    limits: {
      label: 16,
      title: 24,
      body: 180,
      buttonText: 8,
      imageAlt: 80,
    },
  },
  inspector: {
    sections: ["模块概况", "基础内容", "图片素材", "布局", "高级设置"],
  },
  defaults: {
    title: "品牌故事",
    template: "textLeftImageRight" as ImageTextTemplate,
    spacing: "normal" as ModuleDensity,
  },
} as const;

export const SINGLE_POSTER_CONTRACT = {
  type: "单图海报",
  purpose: "用一张主视觉承接系列、上新或品牌故事，并提供明确跳转。",
  canvas: {
    heightMode: "ratio",
    maxWidth: 1280,
    // Editorial Split 构图红线:38/62(镜像 62/38),禁止 50/50
    desktopColumns: "38fr 62fr",
    desktopImageLeftColumns: "62fr 38fr",
    desktopMediaAspectRatio: CONTENT_TEMPLATE_CONTRACTS.singlePoster.media[0].desktopRatio,
    mobileMediaAspectRatio: CONTENT_TEMPLATE_CONTRACTS.singlePoster.media[1].mobileRatio,
    mobileBreakpoint: 767,
  },
  content: {
    limits: CONTENT_TEMPLATE_CONTRACTS.singlePoster.contentBudget.limits,
  },
  defaults: { template: "leftTextRightImage", focusX: 50, focusY: 50 },
} as const;

export const CAROUSEL_CONTRACT = {
  type: "轮播图",
  purpose:
    "以固定的版式比例展示系列或活动主视觉，避免按任意像素高度拉伸导致不同宽度下失真。",
  canvas: {
    desktopAspectRatios: {
      wide: getContractRoleRatio("carousel", "frames", "desktop"),
      standard: getContractRoleRatio("carousel", "frames", "desktop"),
    },
    mobileAspectRatios: {
      portrait: getContractRoleRatio("carousel", "frames", "mobile"),
      standard: getContractRoleRatio("carousel", "frames", "mobile"),
    },
  },
  defaults: { desktopRatio: "wide", mobileRatio: "portrait" },
} as const;

export function getCarouselAspectRatio(
  device: "desktop" | "mobile",
  format?: string,
): string {
  if (device === "mobile") {
    return format === "standard"
      ? CAROUSEL_CONTRACT.canvas.mobileAspectRatios.standard
      : CAROUSEL_CONTRACT.canvas.mobileAspectRatios.portrait;
  }
  return format === "standard"
    ? CAROUSEL_CONTRACT.canvas.desktopAspectRatios.standard
    : CAROUSEL_CONTRACT.canvas.desktopAspectRatios.wide;
}

export const PRODUCT_ROW_CONTRACT = {
  type: "产品展示行",
  purpose: "展示一组可直接进入详情的主推商品，承担页面核心导购任务。",
  canvas: {
    heightMode: "content",
    maxWidth: 1280,
    desktopColumns: [2, 3, 4],
    mobileColumns: [1, 2],
    // 商品图统一 4:5,不再开放其他比例
    defaultMediaAspectRatio: getContractRoleRatio("productRow", "productCards", "desktop"),
  },
  content: {
    minProducts: 2,
    maxProducts: 8,
    limits: { title: 24, subtitle: 60, buttonText: 8 },
  },
  defaults: {
    layout: "grid-3",
    mobileColumns: 2,
    displayMode: "standard",
    actionStyle: "text",
  },
} as const;

export const HOTSPOT_CONTRACT = {
  type: "热区图",
  purpose: "在活动或场景大图上建立可点击区域，把视觉内容转为导购入口。",
  canvas: {
    heightMode: "ratio",
    maxWidth: 1280,
    desktopMediaAspectRatio: getContractRoleRatio("hotspot", "sceneImage", "desktop"),
    mobileMediaAspectRatio: getContractRoleRatio("hotspot", "sceneImage", "mobile"),
    mobileBreakpoint: 767,
  },
  content: {
    minHotspots: 1,
    maxHotspots: 8,
    limits: { label: 12 },
  },
} as const;

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function evaluateLinkTarget(value: LinkTargetValue): {
  ready: boolean;
  error?: string;
} {
  const targetType = normalizeLinkTargetType(value);
  if (targetType === "none") return { ready: true };
  if (targetType === "product") {
    return resolveLinkTargetUrl(value)
      ? { ready: true }
      : { ready: false, error: "请选择跳转商品" };
  }
  return resolveLinkTargetUrl(value)
    ? { ready: true }
    : { ready: false, error: "请选择已登记的公开页面" };
}

export function evaluateHeroContract(
  props: HeroContractProps,
): ModuleContractStatus {
  const target = evaluateLinkTarget(props);
  const checks = [
    hasText(props.title),
    hasText(props.desktopImage),
    hasText(props.mobileImage),
    hasText(props.altText),
    target.ready,
  ];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!hasText(props.title)) errors.push("请填写公开页面主标题");
  if (!hasText(props.desktopImage)) errors.push("请上传桌面端主视觉");
  if (!hasText(props.mobileImage)) errors.push("请上传手机端主视觉并单独确认裁切");
  if (!hasText(props.altText)) errors.push("请填写图片替代文字");
  if (target.error) errors.push(target.error);
  return {
    completed: checks.filter(Boolean).length,
    total: checks.length,
    errors,
    warnings,
  };
}

export function evaluateFullBleedContract(
  props: FullBleedContractProps,
): ModuleContractStatus {
  const target = evaluateLinkTarget(props);
  const checks = [hasText(props.image), target.ready];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!hasText(props.image)) errors.push("请上传桌面端海报");
  if (target.error) errors.push(target.error);
  if (!hasText(props.mobileImage))
    warnings.push("建议上传移动端4:5竖图并单独调整焦点");
  if (!hasText(props.altText)) warnings.push("建议填写图片替代文字");
  return {
    completed: checks.filter(Boolean).length,
    total: checks.length,
    errors,
    warnings,
  };
}

export function evaluateDoublePosterContract(
  props: DoublePosterContractProps,
): ModuleContractStatus {
  const target = evaluateLinkTarget(props);
  const checks = [
    hasText(props.mainImage),
    hasText(props.detailImage),
    hasText(props.title),
    target.ready,
  ];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!hasText(props.mainImage)) errors.push("请上传主海报");
  if (!hasText(props.detailImage)) errors.push("请上传细节海报");
  if (!hasText(props.title)) errors.push("请填写标题");
  if (target.error) errors.push(target.error);
  if (!hasText(props.description)) warnings.push("建议补充系列或工艺说明");
  if (!hasText(props.mainAltText) || !hasText(props.detailAltText))
    warnings.push("建议为两张图片补充替代文字");
  return {
    completed: checks.filter(Boolean).length,
    total: checks.length,
    errors,
    warnings,
  };
}

export function evaluateCraftDetailsContract(
  props: CraftDetailsContractProps,
): ModuleContractStatus {
  const checks = [
    hasText(props.title),
    hasText(props.leadImage),
    hasText(props.leadAltText),
    hasText(props.detailImageOne),
    hasText(props.detailOneAltText),
    hasText(props.detailImageTwo),
    hasText(props.detailTwoAltText),
  ];
  const errors: string[] = [];
  if (!hasText(props.title)) errors.push("请填写工艺细节标题");
  if (!hasText(props.leadImage)) errors.push("请上传工艺主图");
  if (!hasText(props.leadAltText)) errors.push("请填写主图替代文字");
  if (!hasText(props.detailImageOne)) errors.push("请上传第一张细节图");
  if (!hasText(props.detailOneAltText)) errors.push("请填写第一张细节图替代文字");
  if (!hasText(props.detailImageTwo)) errors.push("请上传第二张细节图");
  if (!hasText(props.detailTwoAltText)) errors.push("请填写第二张细节图替代文字");
  return { completed: checks.filter(Boolean).length, total: checks.length, errors, warnings: [] };
}

export function evaluateFeaturedProductContract(
  props: FeaturedProductContractProps,
): ModuleContractStatus {
  const productId = Number(props.productId);
  const hasProduct = Number.isInteger(productId) && productId > 0;
  const checks = [hasProduct, hasText(props.title), hasText(props.primaryText)];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!hasProduct) errors.push("请选择一件主推商品");
  if (!hasText(props.title)) errors.push("请填写模块标题");
  if (!hasText(props.primaryText)) errors.push("请填写商品详情入口文字");
  if (!hasText(props.summary))
    warnings.push("建议补充作品材质、工艺或设计卖点");
  // 次行动三件套:有三件套痕迹即不回退旧裸 secondaryLink(防切回不跳转后复活)
  const secondaryUrl = resolvePrefixedLinkTarget(props as Record<string, any>, "secondary", "secondaryLink");
  if (hasText(props.secondaryText) && !secondaryUrl) {
    errors.push("次要行动已显示，请选择站内页面");
  }
  return {
    completed: checks.filter(Boolean).length,
    total: checks.length,
    errors,
    warnings,
  };
}

function normalizeCategoryCards(value: unknown): CategoryCardContractItem[] {
  return Array.isArray(value) ? value : [];
}

export function evaluateCategoryCardsContract(
  props: CategoryCardsContractProps,
): ModuleContractStatus {
  const cards = normalizeCategoryCards(props.categories);
  const cardLinkOk = (item: CategoryCardContractItem) =>
    Boolean(resolveItemLinkUrl(item));
  const completeCards = cards.filter(
    (item) => hasText(item.name) && hasText(item.image) && cardLinkOk(item),
  );
  const enoughItems = cards.length >= CATEGORY_CARDS_CONTRACT.content.minItems;
  const checks = [
    hasText(props.title),
    enoughItems,
    enoughItems && completeCards.length === cards.length,
  ];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!hasText(props.title)) errors.push("请填写分类导航标题");
  if (!enoughItems)
    errors.push(
      `请至少配置 ${CATEGORY_CARDS_CONTRACT.content.minItems} 个分类入口`,
    );
  if (cards.length > CATEGORY_CARDS_CONTRACT.content.maxItems) {
    errors.push(
      `分类入口不能超过 ${CATEGORY_CARDS_CONTRACT.content.maxItems} 个`,
    );
  }
  if (cards.some((item) => !hasText(item.name)))
    errors.push("每个分类都必须填写名称");
  if (cards.some((item) => !hasText(item.image)))
    errors.push("每个分类都必须上传图片");
  if (cards.some((item) => !cardLinkOk(item)))
    errors.push("每个分类都必须设置安全的站内路径");
  if (cards.some((item) => !hasText(item.description)))
    warnings.push("建议为分类补充一句选择提示");
  return {
    completed: checks.filter(Boolean).length,
    total: checks.length,
    errors,
    warnings,
  };
}

export function evaluateAppointmentContract(
  props: AppointmentContractProps,
): ModuleContractStatus {
  // 旧 linkUrl 仅在指向已登记公开页面时由统一解析器兼容。
  const targetUrl = resolveLinkTargetUrl({
    targetType: props.targetType,
    productId: props.productId,
    linkUrl: props.linkUrl,
  });
  const checks = [hasText(props.title), hasText(props.buttonText), Boolean(targetUrl)];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!hasText(props.title)) errors.push("请填写预约标题");
  if (!hasText(props.buttonText)) errors.push("请填写预约按钮文字");
  if (!targetUrl) errors.push("请选择预约咨询站内页面");
  if (!hasText(props.subtitle)) warnings.push("建议说明服务方式或响应时间");
  if (hasText(props.backgroundImage) && !hasText(props.altText))
    warnings.push("建议填写背景图片替代文字");
  return {
    completed: checks.filter(Boolean).length,
    total: checks.length,
    errors,
    warnings,
  };
}

export function evaluateSinglePosterContract(
  props: SinglePosterContractProps,
): ModuleContractStatus {
  const checks = [hasText(props.title), hasText(props.desktopImage)];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!hasText(props.title)) errors.push("请填写标题");
  if (!hasText(props.desktopImage)) errors.push("请上传桌面端海报");
  if (!hasText(props.linkUrl)) warnings.push("建议设置海报跳转链接");
  if (!hasText(props.mobileImage))
    warnings.push("建议上传移动端竖图，避免自动裁切主体");
  return {
    completed: checks.filter(Boolean).length,
    total: checks.length,
    errors,
    warnings,
  };
}

function normalizePositiveIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter((id) => Number.isInteger(id) && id > 0);
}

export function evaluateProductRowContract(
  props: ProductRowContractProps,
): ModuleContractStatus {
  const productIds = normalizePositiveIds(props.productIds);
  const checks = [
    productIds.length >= PRODUCT_ROW_CONTRACT.content.minProducts,
  ];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (productIds.length < PRODUCT_ROW_CONTRACT.content.minProducts) {
    errors.push(
      `请至少选择 ${PRODUCT_ROW_CONTRACT.content.minProducts} 件商品`,
    );
  }
  if (productIds.length > PRODUCT_ROW_CONTRACT.content.maxProducts) {
    errors.push(
      `商品数量不能超过 ${PRODUCT_ROW_CONTRACT.content.maxProducts} 件`,
    );
  }
  if (!hasText(props.title)) warnings.push("未设置标题，将直接展示商品");
  if (productIds.length > 0 && productIds.length < 3)
    warnings.push("桌面端建议选择 3 件以上商品，版面更完整");
  return {
    completed: checks.filter(Boolean).length,
    total: checks.length,
    errors,
    warnings,
  };
}

function normalizeHotspots(value: unknown): HotspotContractItem[] {
  return Array.isArray(value) ? value : [];
}

function hasValidHotspotGeometry(item: HotspotContractItem): boolean {
  return (
    [item.x, item.y, item.width, item.height].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    ) &&
    Number(item.width) > 0 &&
    Number(item.height) > 0
  );
}

export function evaluateHotspotContract(
  props: HotspotContractProps,
): ModuleContractStatus {
  const hotspots = normalizeHotspots(props.hotspots);
  const mobileHotspots = normalizeHotspots(props.mobileHotspots);
  const linkedHotspots = hotspots.filter((item) => hasText(item.link));
  const checks = [
    hasText(props.image),
    hotspots.length >= HOTSPOT_CONTRACT.content.minHotspots,
    hotspots.length > 0 && linkedHotspots.length === hotspots.length,
  ];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!hasText(props.image)) errors.push("请上传桌面端热区底图");
  if (hotspots.length < HOTSPOT_CONTRACT.content.minHotspots)
    errors.push("请至少添加 1 个热区");
  if (hotspots.some((item) => !hasValidHotspotGeometry(item)))
    errors.push("存在尺寸或位置无效的热区");
  if (linkedHotspots.length !== hotspots.length)
    errors.push("每个热区都必须设置跳转链接");
  if (hotspots.length > HOTSPOT_CONTRACT.content.maxHotspots)
    errors.push(`热区数量不能超过 ${HOTSPOT_CONTRACT.content.maxHotspots} 个`);
  if (!hasText(props.mobileImage))
    warnings.push("建议上传移动端热区图，避免自动裁切影响点击区域");
  if (mobileHotspots.length === 0)
    warnings.push("移动端正在复用桌面热区，建议单独校准坐标");
  if (
    mobileHotspots.some(
      (item) => !hasValidHotspotGeometry(item) || !hasText(item.link),
    )
  ) {
    errors.push("移动端存在未完成的热区");
  }
  return {
    completed: checks.filter(Boolean).length,
    total: checks.length,
    errors,
    warnings,
  };
}

/* ═══════ 改款前后对比契约 ═══════ */

export interface BeforeAfterContractProps {
  title?: string;
  subtitle?: string;
  beforeImage?: string;
  afterImage?: string;
  beforeLabel?: string;
  afterLabel?: string;
}

export const BEFORE_AFTER_CONTRACT = {
  type: "改款对比",
  purpose: "以滑动分割线对比珠宝改款前/后的同比例影像,承载旧物新生的情感叙事。",
  canvas: {
    heightMode: "content",
    maxWidth: 1280,
    desktopMediaAspectRatio: getContractRoleRatio("comparison", "before", "desktop"),
    mobileMediaAspectRatio: getContractRoleRatio("comparison", "before", "mobile"),
  },
  content: {
    limits: { title: 24, subtitle: 60, label: 8, altText: 80 },
  },
  defaults: { beforeLabel: "改款前", afterLabel: "改款后" },
} as const;

export function evaluateBeforeAfterContract(
  props: BeforeAfterContractProps,
): ModuleContractStatus {
  const checks = [
    hasText(props.title),
    hasText(props.beforeImage),
    hasText(props.afterImage),
  ];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!hasText(props.title)) errors.push("请填写标题");
  if (!hasText(props.beforeImage)) errors.push("请上传改款前图片");
  if (!hasText(props.afterImage)) errors.push("请上传改款后图片");
  if (!hasText(props.subtitle)) warnings.push("建议补充一句改款说明,让对比更有故事感");
  return {
    completed: checks.filter(Boolean).length,
    total: checks.length,
    errors,
    warnings,
  };
}

/* ═══════ 文字横幅（引导横幅）契约 ═══════ */

export const TEXT_BANNER_CONTRACT = {
  type: "文字横幅",
  purpose: "以纯文字和大留白完成章节声明，不承载图片或自由背景配置。",
  content: {
    limits: {
      ...CONTENT_TEMPLATE_CONTRACTS.textBanner.contentBudget.limits,
    },
  },
} as const;

export interface TextBannerContractProps extends LinkTargetValue {
  eyebrow?: string;
  title?: string;
  body?: string;
  backgroundImage?: string;
  buttonText?: string;
}

export function evaluateTextBannerContract(
  props: TextBannerContractProps,
): ModuleContractStatus {
  const resolvedLink = resolveLinkTargetUrl(props);
  const buttonReady =
    !hasText(props.buttonText) || hasText(resolvedLink) || false;
  const checks = [hasText(props.title), hasText(props.body), buttonReady];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!hasText(props.title)) errors.push("请填写横幅标题");
  if (hasText(props.buttonText) && !hasText(resolvedLink))
    warnings.push("按钮文字已填写但未设置跳转，前台不会显示按钮");
  return {
    completed: checks.filter(Boolean).length,
    total: checks.length,
    errors,
    warnings,
  };
}

/* ═══════ 卡片网格（品牌亮点 / 服务承诺）契约 ═══════ */

export const CARD_GRID_CONTRACT = {
  type: "卡片网格",
  purpose: "以规则网格呈现工艺、材质与品牌价值",
  content: {
    limits: {
      title: 100,
      subtitle: 200,
      cardTitle: 30,
      cardBody: 200,
    },
  },
} as const;

export interface CardGridContractProps {
  title?: string;
  subtitle?: string;
  cards?: Array<{ icon?: string; title?: string; body?: string }>;
}

/** 卡片网格与服务承诺共用同一契约规则（变体只差默认文案与用途）。 */
export function evaluateCardGridContract(
  props: CardGridContractProps,
): ModuleContractStatus {
  const cards = Array.isArray(props.cards) ? props.cards : [];
  const cardsComplete =
    cards.length > 0 &&
    cards.every((card) => hasText(card.title) && hasText(card.body));
  const checks = [hasText(props.title), cards.length > 0, cardsComplete];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!hasText(props.title)) errors.push("请填写区块标题");
  if (cards.length === 0) errors.push("请至少添加 1 张卡片");
  const incomplete = cards.some(
    (card) => !hasText(card.title) || !hasText(card.body),
  );
  if (incomplete)
    errors.push(
      cards.every((card) => hasText(card.title))
        ? "存在正文为空的卡片"
        : "存在标题为空的卡片",
    );
  const hasPlaceholder = cards.some((card) =>
    [card.title, card.body].some(
      (text) => hasText(text) && /待确认|待配置|请填写/.test(text as string),
    ),
  );
  if (hasPlaceholder)
    warnings.push("仍有占位文案（待确认/待配置），发布前请替换为正式内容");
  return {
    completed: checks.filter(Boolean).length,
    total: checks.length,
    errors,
    warnings,
  };
}
