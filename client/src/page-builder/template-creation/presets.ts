import type { TemplateRecipe } from "../template-definition/generated/templateDefinition.generated";

/**
 * 旧母版 key 与标签。按 store-decoration 第 2 节，它只作**历史配方的兼容读取与显示回退**，
 * 不再作为创建推荐目录的信息架构；创建界面按下面的九种区块角色组织。
 */
export const PURPOSES = [
  ["productPromotion", "商品促销"], ["newProduct", "新品发布"], ["event", "活动宣传"],
  ["brand", "品牌故事"], ["social", "社交媒体"], ["news", "新闻 / 资讯"],
  ["profile", "人物介绍"], ["general", "通用模板"], ["custom", "自定义"],
] as const;
export type TemplateSectionRole = NonNullable<TemplateRecipe["sectionRole"]>;
/** 九个区块角色；标签与顺序取自 store-decoration 第 2 节的表，不另立第二份名单。 */
export const SECTION_ROLES = [
  ["page-hero", "页面首屏"], ["collection-story", "系列叙事"], ["editorial-split", "左右图文"],
  ["craft-detail", "工艺细节"], ["editorial-media", "编辑媒体"], ["creation-grid", "作品网格"],
  ["maison-fact", "品牌事实"], ["service-invitation", "服务邀请"], ["video-story", "视频叙事"],
] as const satisfies readonly (readonly [TemplateSectionRole, string])[];
export const CANVAS_PRESETS = [
  { name: "随内容增长", ratio: "auto", width: 1440, height: 900 },
  { name: "宽幅主视觉", ratio: "16:9", width: 1440, height: 810 },
  { name: "编辑横版", ratio: "3:2", width: 1440, height: 960 },
  { name: "均衡横版", ratio: "4:3", width: 1440, height: 1080 },
  { name: "方形卡片", ratio: "1:1", width: 1080, height: 1080 },
  { name: "竖向卡片", ratio: "4:5", width: 1080, height: 1350 },
] as const;
export const LAYOUTS = [
  ["topImageBottomContent", "上图下文"], ["topContentBottomImage", "上文下图"],
  ["leftImageRightContent", "左图右文"], ["leftContentRightImage", "左文右图"],
  ["fullImageOverlay", "全幅图片 + 内容覆盖"], ["centerSubject", "中央主体"],
  ["headerSubjectFooter", "顶部标题 + 中部主体 + 底部信息"], ["splitColumns", "左右分栏"],
  ["cards", "卡片式布局"], ["free", "自由布局"],
] as const;
export const CONTENTS = [
  ["title", "主标题", "主标题"], ["subtitle", "副标题", "补充一句让人了解主题"],
  ["description", "描述", "在这里介绍内容亮点，文字可以在创建后继续调整。"],
  ["brandName", "品牌名称", "品牌名称"], ["tag", "标签", "精选"], ["date", "日期", "活动日期"],
  ["price", "价格", "价格待填写"], ["originalPrice", "原价", "原价待填写"],
  ["offer", "优惠信息", "限时礼遇"], ["cta", "主行动", "了解详情"],
  ["contact", "联系信息", "联系信息"], ["customText", "自定义文字", "自定义文字"],
  ["time", "时间", "时间待填写"], ["location", "地点", "地点待填写"],
  ["productName", "商品名称", "商品名称"], ["sellingPoint", "商品卖点", "商品卖点"],
  ["discount", "折扣", "折扣待填写"], ["personName", "姓名", "姓名"],
  ["position", "职位", "职位"], ["biography", "简介", "人物简介"], ["socialInfo", "社交信息", "社交信息"],
] as const;
export const MEDIA_ROLES = [["heroImage", "主图"], ["logo", "Logo"], ["backgroundImage", "背景图"], ["secondaryImage", "副图"], ["custom", "自定义图片"]] as const;
export const MEDIA_PRESETS = [
  { id: "none", name: "无图片", roles: [] },
  { id: "hero", name: "1 张主图", roles: ["heroImage"] },
  { id: "heroLogo", name: "1 张主图 + Logo", roles: ["heroImage", "logo"] },
  { id: "heroOne", name: "1 张主图 + 1 张副图", roles: ["heroImage", "secondaryImage"] },
  { id: "heroTwo", name: "1 张主图 + 2 张副图", roles: ["heroImage", "secondaryImage", "secondaryImage"] },
  { id: "two", name: "2 张图片", roles: ["custom", "custom"] },
  { id: "three", name: "3 张图片", roles: ["custom", "custom", "custom"] },
  { id: "background", name: "背景图", roles: ["backgroundImage"] },
  { id: "backgroundHero", name: "背景图 + 主图", roles: ["backgroundImage", "heroImage"] },
  { id: "backgroundLogo", name: "背景图 + Logo", roles: ["backgroundImage", "logo"] },
  { id: "custom", name: "自定义", roles: ["custom"] },
] satisfies Array<{ id: string; name: string; roles: TemplateRecipe["media"][number]["role"][] }>;
export const STYLES = [["minimal", "简约"], ["business", "商务"], ["premium", "高端"], ["vibrant", "活力"], ["tech", "科技"], ["warm", "温暖"], ["ultraMinimal", "极简"], ["custom", "自定义"]] as const;
export const BACKGROUNDS = [["light", "浅色"], ["softLight", "柔和浅色"], ["dark", "深色"], ["brand", "品牌色"], ["custom", "自定义"]] as const;
export const RADII = [["none", "无"], ["small", "小"], ["medium", "中"], ["large", "大"], ["extraLarge", "超大"]] as const;
export const SPACINGS = [["compact", "紧凑"], ["standard", "标准"], ["relaxed", "宽松"], ["extraRelaxed", "超宽松"]] as const;
export const MARGINS = [["compact", "紧凑 · 4%"], ["standard", "标准 · 6%"], ["relaxed", "宽松 · 8%"]] as const;
export const ALIGNMENTS = [["left", "左对齐"], ["center", "居中"], ["right", "右对齐"]] as const;
export const RADIUS_VALUES = { none: 0, small: 8, medium: 16, large: 24, extraLarge: 32 };
export const SPACING_VALUES = { compact: 12, standard: 16, relaxed: 24, extraRelaxed: 32 };
export const MARGIN_VALUES = { compact: .04, standard: .06, relaxed: .08 };

export const recommendedAlignment = (layout: TemplateRecipe["layout"]) => layout === "centerSubject" ? "center" as const : "left" as const;
export const imageRatioLabel = (ratio: number) => ratio === 1 ? "1:1" : ratio === .8 ? "4:5" : ratio === .75 ? "3:4" : ratio === 16 / 9 ? "16:9" : `${ratio}:1`;
export const isCanvasBackground = (recipe: TemplateRecipe, media: TemplateRecipe["media"][number]) => media.role === "backgroundImage"
  || recipe.layout === "fullImageOverlay" && !recipe.media.some((item) => item.role === "backgroundImage")
  && recipe.media.find((item) => item.role !== "logo")?.id === media.id;

export function readableText(color: string): string {
  const hex = color.slice(1);
  const expanded = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
  const rgb = expanded.match(/../g)!.map((part) => { const value = parseInt(part, 16) / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; });
  const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  if ((luminance + .05) / (.005605 + .05) >= 4.5) return "#111315";
  return 1.05 / (luminance + .05) >= 4.5 ? "#FFFFFF" : "#000000";
}
export function paletteFor(background: TemplateRecipe["style"]["background"], primaryColor: string) {
  const backgroundColor = background === "dark" ? "#111315" : background === "softLight" ? "#F7F8F8" : background === "brand" ? primaryColor : "#FFFFFF";
  const textColor = readableText(backgroundColor);
  return { backgroundColor, textColor, secondaryTextColor: background === "brand" ? textColor : background === "dark" ? "#B8BEC1" : "#5F6568" };
}

export function createMediaSlots(roles: TemplateRecipe["media"][number]["role"][]): TemplateRecipe["media"] {
  return roles.map((role, i) => ({ id: `media-${i + 1}`, role,
    name: `${MEDIA_ROLES.find(([id]) => id === role)![1]}${roles.filter((item) => item === role).length > 1 ? ` ${roles.slice(0, i + 1).filter((item) => item === role).length}` : ""}`,
    aspectRatio: 1, fitMode: role === "logo" ? "contain" : "cover",
    borderRadius: role === "logo" || role === "backgroundImage" ? 0 : 16, replaceable: true, allowCrop: role !== "logo",
  }));
}
export function createContentSlot(role: TemplateRecipe["content"][number]["role"], id: string = role): TemplateRecipe["content"][number] {
  const entry = CONTENTS.find(([key]) => key === role)!;
  return { id, role, name: entry[1], defaultContent: "", maxLength: role === "description" ? 400 : role === "title" ? 80 : 120, editable: true };
}
export interface SectionRoleRecommendation {
  ratios: string[];
  layouts: TemplateRecipe["layout"][];
  mediaPreset: string;
  contents: TemplateRecipe["content"][number]["role"][];
}
/** 角色未定时不给任何推荐：画幅落“随内容增长”，布局自由，图片与内容为空。 */
const NEUTRAL_RECOMMENDATION: SectionRoleRecommendation = { ratios: [], layouts: [], mediaPreset: "", contents: [] };
/**
 * 九个区块角色的创建初值，逐行取自 template-creation-rules 第 2 节的推荐表。
 * 表中同列给出两种画幅或布局时，第一项落在与首发母模板一致的那一种上
 * （launch-template-set 第 3 节；全幅主视觉的角色按该文件第 3.1 节的过渡优先全幅背景）。
 * 价格、原价、折扣不属于任何角色的默认推荐，仍可在创建第 5 步自行勾选。
 */
const SECTION_RECOMMENDATIONS: Record<TemplateSectionRole, SectionRoleRecommendation> = {
  "page-hero": { ratios: ["16:9"], layouts: ["fullImageOverlay"], mediaPreset: "backgroundLogo", contents: ["title", "subtitle", "cta"] },
  "collection-story": { ratios: ["3:2"], layouts: ["leftImageRightContent", "leftContentRightImage"], mediaPreset: "heroOne", contents: ["subtitle", "title", "description", "cta"] },
  "editorial-split": { ratios: ["3:2"], layouts: ["leftImageRightContent", "leftContentRightImage"], mediaPreset: "heroTwo", contents: ["subtitle", "title", "description", "cta"] },
  "craft-detail": { ratios: ["4:5"], layouts: ["leftImageRightContent", "topImageBottomContent"], mediaPreset: "heroTwo", contents: ["subtitle", "title", "description"] },
  "editorial-media": { ratios: ["16:9"], layouts: ["fullImageOverlay", "centerSubject"], mediaPreset: "hero", contents: ["title", "description"] },
  // 卡片比例取 4:5 而不是本表写作时的 1:1：4:5 是 UI_GUIDE 的商品卡比例，
  // 被 template-creation-rules 第 3.1 节的商品卡组过渡引用为两端不变的不变量（launch-template-set 第 3 节说明 2）。
  "creation-grid": { ratios: ["4:5"], layouts: ["cards"], mediaPreset: "three", contents: ["title", "description"] },
  "maison-fact": { ratios: ["auto"], layouts: ["topImageBottomContent", "splitColumns"], mediaPreset: "heroLogo", contents: ["brandName", "title", "description", "cta"] },
  "service-invitation": { ratios: ["16:9"], layouts: ["topImageBottomContent", "leftContentRightImage"], mediaPreset: "heroLogo", contents: ["title", "time", "location", "cta"] },
  "video-story": { ratios: ["16:9"], layouts: ["fullImageOverlay", "centerSubject"], mediaPreset: "hero", contents: ["title", "description", "cta"] },
};
export function recommendedFor(sectionRole?: TemplateSectionRole): SectionRoleRecommendation {
  return sectionRole ? SECTION_RECOMMENDATIONS[sectionRole] : NEUTRAL_RECOMMENDATION;
}
export function styleFor(variant: TemplateRecipe["style"]["variant"]): TemplateRecipe["style"] {
  const spacious = variant === "premium" || variant === "ultraMinimal";
  const background = variant === "tech" ? "dark" : variant === "warm" ? "softLight" : "light";
  return { variant, background, primaryColor: "#181A1B", ...paletteFor(background, "#181A1B"),
    radius: spacious ? "none" : variant === "business" || variant === "tech" ? "small" : variant === "vibrant" ? "large" : "medium",
    spacing: spacious ? "extraRelaxed" : variant === "warm" ? "relaxed" : "standard", margin: spacious ? "relaxed" : "standard" };
}
/**
 * 按区块角色生成创建初值。角色未定（向导第 0 步尚未选择）时给出中性配方：
 * 画幅随内容增长、布局自由、图片与内容为空，不预告任何角色倾向。
 * 不写 `purpose`：它是旧母版 key，按 store-decoration 第 2 节只作历史配方兼容读取，
 * 新配方一律以 `sectionRole` 表达身份。
 */
export function createRecommendedRecipe(sectionRole?: TemplateSectionRole): TemplateRecipe {
  const recommended = recommendedFor(sectionRole);
  const size = CANVAS_PRESETS.find((item) => item.ratio === recommended.ratios[0]) ?? CANVAS_PRESETS[0];
  return { recipeVersion: 1, presetVersion: 3, ...(sectionRole ? { sectionRole } : {}),
    canvas: { width: size.width, height: size.height, aspectRatio: size.width / size.height },
    layout: recommended.layouts[0] ?? "free", media: createMediaSlots(MEDIA_PRESETS.find((item) => item.id === recommended.mediaPreset)?.roles ?? []),
    content: recommended.contents.map((role) => createContentSlot(role)), style: styleFor("minimal"), rules: { aspectLocked: false } };
}

export type RecipeSection = "canvas" | "layout" | "media" | "content" | "style";
/** 只更新用户尚未修改的段；推荐永不收窄可选集合。 */
export function changeRecipeSectionRole(recipe: TemplateRecipe, sectionRole: TemplateSectionRole, dirty: Partial<Record<RecipeSection, boolean>>): TemplateRecipe {
  const next = createRecommendedRecipe(sectionRole);
  const style = dirty.style ? recipe.style : next.style;
  // 新推荐图片继承本次最终风格；已编辑的图片段保持原有外观和身份。
  const media = dirty.media ? recipe.media : next.media.map((slot) => ({
    ...slot, borderRadius: slot.role === "logo" || slot.role === "backgroundImage" ? 0 : RADIUS_VALUES[style.radius],
  }));
  return { ...recipe, sectionRole, ...Object.fromEntries((["canvas", "layout", "content"] as const).map((key) => [key, dirty[key] ? recipe[key] : next[key]])), media, style };
}
