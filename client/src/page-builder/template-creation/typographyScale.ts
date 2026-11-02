import type { TemplateRecipe } from "../template-definition/generated/templateDefinition.generated";

/**
 * UI_GUIDE 第 2.3 节「排印 Scale」是字号权威。本文件是它在生成器一侧的唯一落点：
 * 模板生成、页面装修与前台渲染都从这里取语义层级，不另设第二套换算表，
 * 也不把「画布短边 × 百分比」当作主标题的唯一算法（template-creation-rules 第 6.1 节）。
 *
 * 数值为 UI_GUIDE 原表取值，顺序为 桌面 px / 手机 px；下限即该层级的手机取值。
 * 字重按 UI_GUIDE 第 2.4 节：前台标题 300～500，正文 400，前台不出现 700。
 */
export const TEMPLATE_TYPE_SCALE = {
  /** 展示标题 Display：68 / 40。页面首屏专用。 */
  display: { desktop: 68, mobile: 40, weight: 300, fontRole: "display" },
  /** 主标题 H1：34 / 28。 */
  h1: { desktop: 34, mobile: 28, weight: 400, fontRole: "heading" },
  /** 区块标题 H2：24 / 20。 */
  h2: { desktop: 24, mobile: 20, weight: 400, fontRole: "heading" },
  /** 系列名 / 副标题：18 / 16。 */
  subtitle: { desktop: 18, mobile: 16, weight: 400, fontRole: "body" },
  /** 正文：15 / 14。行动槽位标签同用正文层级——UI_GUIDE 未设独立的按钮层级。 */
  body: { desktop: 15, mobile: 14, weight: 400, fontRole: "body" },
  /** 辅助：12 / 11。 */
  caption: { desktop: 12, mobile: 11, weight: 400, fontRole: "caption" },
  /** 价格（仅选款场景）：强调级，第 6.1 节给的是「接近或略高于主标题」，此处取略高一级。 */
  price: { desktop: 36, mobile: 30, weight: 500, fontRole: "heading" },
} as const;

export type TemplateTypeLevel = keyof typeof TEMPLATE_TYPE_SCALE;

/** 页面首屏（M1）与视频叙事之外的角色，主标题落在 H1，不抬到展示级。 */
const DISPLAY_HEADLINE = "page-hero";

const HEADLINE_ROLES = new Set(["productName", "personName", "brandName"]);
const SUBTITLE_ROLES = new Set(["subtitle", "position"]);
const CAPTION_ROLES = new Set(["tag", "date", "time", "location", "contact", "socialInfo", "originalPrice"]);

/**
 * 内容角色 → 语义字号层级。首屏标题抬到展示级，其余标题落主标题级；
 * 正文级包含行动标签与所有未被点名的长文本角色（描述、简介、卖点、自定义文字、优惠、折扣）。
 */
export function typeLevelFor(
  role: TemplateRecipe["content"][number]["role"],
  sectionRole: TemplateRecipe["sectionRole"] | undefined,
): TemplateTypeLevel {
  if (role === "title") return sectionRole === DISPLAY_HEADLINE ? "display" : "h1";
  if (HEADLINE_ROLES.has(role)) return "h1";
  if (role === "price") return "price";
  if (SUBTITLE_ROLES.has(role)) return "subtitle";
  if (CAPTION_ROLES.has(role)) return "caption";
  return "body";
}

/**
 * 不变量 F：一块模板最多一个 ButtonSlot，且只出现在 M1 与 M7 上。
 * 其余角色的行动槽位一律是 LinkSlot，不论配方是否含 cta。
 */
export const PRIMARY_ACTION_SECTION_ROLES = ["page-hero", "service-invitation"] as const;

export function allowsButtonSlot(sectionRole: TemplateRecipe["sectionRole"] | undefined): boolean {
  return sectionRole !== undefined
    && (PRIMARY_ACTION_SECTION_ROLES as readonly string[]).includes(sectionRole);
}
