import {
  createBlankDynamicTemplateDefinition, createDynamicTemplateNode, createDynamicTemplateSlotDefinition,
} from "../template-definition/nodeRegistry";
import { validateDynamicTemplateDefinition, validateTemplateRecipe } from "../template-definition/validateTemplateDefinition";
import type { DynamicTemplateNodeType, DynamicTemplateSlotType, TemplateDefinitionV2, TemplateRecipe } from "../template-definition/generated/templateDefinition.generated";
import { isCanvasBackground, LAYOUTS, PURPOSES, RADIUS_VALUES, SPACING_VALUES, MARGIN_VALUES, readableText, recommendedAlignment } from "./presets";
import { layoutRegions, subdivide, type Rect } from "./layoutGeometry";
import { arrangeMedia, fitMedia } from "./mediaGeometry";
import { getTemplateRecipeSampleText } from "./previewContent";

const px = (value: number) => ({ value, unit: "px" as const });
const integerRatio = (ratio: number) => {
  let best = { width: 1, height: 1, error: Math.abs(ratio - 1) };
  for (let height = 1; height <= 9999; height += 1) {
    const width = Math.max(1, Math.min(9999, Math.round(ratio * height)));
    const error = Math.abs(width / height - ratio);
    if (error < best.error) best = { width, height, error };
    if (error < .00000001) break;
  }
  return `${best.width}:${best.height}`;
};

/** 纯生成：不读取 DOM、会话、时钟或 API。相同方案与身份产生相同的定义。 */
export function generateTemplateFromRecipe(recipe: TemplateRecipe, options: { templateId?: string; name?: string } = {}): TemplateDefinitionV2 {
  const checkedRecipe = validateTemplateRecipe(recipe);
  if (!checkedRecipe.valid) throw new Error(checkedRecipe.issues.map((issue) => issue.message).join("；"));
  const definition = createBlankDynamicTemplateDefinition(options.name ?? "未命名模板");
  const templateId = options.templateId ?? "tpl_recipe_preview";
  definition.schemaVersion = 3;
  definition.templateId = templateId;
  definition.templateRecipe = structuredClone(recipe);
  const { width, height } = recipe.canvas;
  const shortSide = Math.min(width, height);
  const margin = Math.round(shortSide * MARGIN_VALUES[recipe.style.margin ?? "standard"]);
  const spacing = SPACING_VALUES[recipe.style.spacing];
  const regionSpacing = spacing * 2;
  const headline = Math.round(shortSide * (recipe.style.variant === "premium" || recipe.style.variant === "ultraMinimal" ? .07 : .06));
  const body = Math.round(headline * .35);
  const typography = (role: TemplateRecipe["content"][number]["role"]) => {
    if (role === "title" || role === "productName" || role === "personName") return { size: headline, weight: 700 };
    if (role === "subtitle" || role === "position") return { size: Math.round(headline * .52), weight: 500 };
    if (role === "price") return { size: Math.round(headline * 1.05), weight: 700 };
    if (["tag", "date", "time", "location", "contact", "socialInfo", "originalPrice"].includes(role)) return { size: Math.round(body * .8), weight: 400 };
    return { size: body, weight: 400 };
  };
  const root = definition.nodes[definition.rootNodeId];
  root.nodeId = `${templateId}_root`;
  root.name = "背景";
  definition.nodes = { [root.nodeId]: root };
  definition.rootNodeId = root.nodeId;
  definition.metadata = { ...definition.metadata,
    purpose: recipe.purpose === "custom" ? recipe.customPurpose || "自定义" : PURPOSES.find(([key]) => key === recipe.purpose)![1],
    layoutType: LAYOUTS.find(([key]) => key === recipe.layout)![1], category: "自主设计",
    canvasSize: { ...recipe.canvas }, desktopRatio: `${width}:${height}`, mobileRatio: "auto",
    previewDesktopWidth: Math.min(2560, Math.max(768, width)),
    slotSummary: `${recipe.media.length} 个图片槽位，${recipe.content.length} 个内容槽位`,
  };
  root.responsive.desktop.backgroundColor = recipe.style.backgroundColor;
  root.responsive.desktop.height = { mode: "fixed", value: px(height) };
  root.responsive.mobile = { height: { mode: "auto" } };
  const stage = createDynamicTemplateNode("Stack", "布局结构");
  stage.nodeId = `${templateId}_layout`;
  stage.responsive.desktop = { ...stage.responsive.desktop, layoutMode: "free", height: { mode: "fixed", value: { value: 100, unit: "%" } } };
  stage.responsive.mobile = { layoutMode: "flow", height: { mode: "auto" }, gap: px(regionSpacing), padding: { top: px(24), right: px(20), bottom: px(24), left: px(20) } };
  root.childIds = [stage.nodeId];
  definition.nodes[stage.nodeId] = stage;
  const radius = RADIUS_VALUES[recipe.style.radius];
  if (!recipe.media.length && !recipe.content.length) throw new Error("请至少选择一个图片或内容槽位，再创建模板。");
  if (recipe.media.filter((item) => item.role === "logo").length > 1) throw new Error("Logo 只需一个槽位，请删除重复的 Logo。");
  if (recipe.media.filter((item) => item.role === "backgroundImage").length > 1) throw new Error("画布只能有一张背景图，请调整图片类型。");
  if (recipe.media.some((item) => item.shape === "circle" && (item.aspectRatio !== 1 || item.freeRatio))) throw new Error("圆形图片使用 1:1 比例，请调整图片形态或比例。");
  const regions = layoutRegions(recipe.layout, { width, height, margin, gap: regionSpacing });
  const nonBackground = recipe.media.filter((item) => !isCanvasBackground(recipe, item) && item.role !== "logo");
  const header = (recipe.layout === "headerSubjectFooter" || recipe.layout === "centerSubject") && nonBackground.length ? recipe.content.find((item) => item.role === "title") : undefined;
  const ordinaryContent = recipe.content.filter((item) => item !== header);
  const logoSize = Math.round(shortSide * .1);
  const logoBand = recipe.media.some((item) => item.role === "logo") ? logoSize + regionSpacing : 0;
  const inner = { x: margin, y: margin + logoBand, width: width - margin * 2, height: height - margin * 2 - logoBand };
  const normalize = (area: Rect): Rect => ({ x: area.x / width, y: area.y / height, width: area.width / width, height: area.height / height });
  const fitError = () => { throw new Error("当前画布无法容纳所选内容与间距。请增大画布、减少内容或选择更合适的布局；配置已保留。"); };
  // 按完整文案保守估算行数，预先分配空间；保留字号和间距，不靠裁切或缩小文字通过校验。
  const contentHeight = (items: typeof recipe.content, availableWidth: number) => items.reduce((total, item) => {
    const font = typography(item.role);
    const columns = Math.floor((availableWidth - (item.role === "cta" ? 32 : 0)) / Math.max(1, font.size));
    if (columns < 1) return fitError();
    const previewText = item.defaultContent || getTemplateRecipeSampleText(item.role, item.name, item.maxLength);
    const lines = previewText.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil([...line].length / columns)), 0);
    return total + Math.ceil(lines * Math.max(1, font.size) * 1.3) + (item.role === "cta" ? 16 : 0);
  }, Math.max(0, items.length - 1) * spacing);
  if (inner.width <= 0 || inner.height <= 0 || (recipe.content.length && body < 1)) fitError();
  const headerHeight = header ? contentHeight([header], inner.width) : 0;
  const headerArea = normalize({ ...inner, height: headerHeight });
  if (header) { inner.y += headerHeight + regionSpacing; inner.height -= headerHeight + regionSpacing; }
  const overlay = recipe.layout === "fullImageOverlay";
  const horizontal = ["leftImageRightContent", "leftContentRightImage", "splitColumns"].includes(recipe.layout);
  const contentBox = { ...inner };
  const mediaBox = { ...inner };
  const splitWidth = inner.width - regionSpacing;
  // 图文介绍优先给图片展示空间；长内容逐级扩大文字区，同级分栏保持等宽。
  const contentShare = horizontal && nonBackground.length && ordinaryContent.length && recipe.layout !== "splitColumns"
    ? [.4, .45, .5].find((share) => ordinaryContent.every((item) => splitWidth * share >= typography(item.role).size + (item.role === "cta" ? 32 : 0))
      && contentHeight(ordinaryContent, splitWidth * share) <= inner.height) ?? .5 : .5;
  const needed = contentHeight(ordinaryContent, horizontal && nonBackground.length ? splitWidth * contentShare : inner.width - (overlay ? 40 : 0)) + (overlay && ordinaryContent.length ? 24 : 0);
  if (needed > inner.height) fitError();
  if (nonBackground.length && ordinaryContent.length) {
    if (horizontal) {
      contentBox.width = splitWidth * contentShare;
      mediaBox.width = splitWidth - contentBox.width;
      if (recipe.layout === "leftContentRightImage") mediaBox.x += contentBox.width + regionSpacing;
      else contentBox.x += mediaBox.width + regionSpacing;
    } else {
      const preferredHeight = regions.content.height * height;
      contentBox.height = Math.max(needed, Math.min(preferredHeight, inner.height - regionSpacing - shortSide * .18));
      mediaBox.height = inner.height - contentBox.height - regionSpacing;
      if (mediaBox.height < shortSide * .12) fitError();
      if (recipe.layout === "topContentBottomImage") mediaBox.y += contentBox.height + regionSpacing;
      else contentBox.y += mediaBox.height + regionSpacing;
      if (recipe.layout === "centerSubject") { mediaBox.x += mediaBox.width * .15; mediaBox.width *= .7; }
      if (recipe.layout === "free") { mediaBox.width *= .7; contentBox.x += contentBox.width * .15; contentBox.width *= .85;
        if (contentHeight(ordinaryContent, contentBox.width) > contentBox.height) fitError(); }
    }
  } else if (overlay && ordinaryContent.length) {
    contentBox.height = needed;
    contentBox.y = inner.y + inner.height - needed;
  }
  const contentArea = normalize(contentBox);
  const mediaRects = arrangeMedia(mediaBox, nonBackground, spacing, recipe.rules.mediaArrangement).map(normalize);
  if (mediaRects.length !== nonBackground.length) fitError();
  const contentRects = subdivide(contentArea, ordinaryContent.length, false, recipe.style.spacing === "compact" ? .008 : .018);
  let mediaIndex = 0;
  let contentIndex = 0;
  const addSlot = (name: string, type: DynamicTemplateSlotType, nodeType: DynamicTemplateNodeType, area: Rect, order: number) => {
    const identity = Object.keys(definition.slots).length + 1;
    const slot = createDynamicTemplateSlotDefinition(type, name, `content${identity}`);
    slot.slotId = `${templateId}_slot_${identity}`;
    slot.emptyPolicy = "hide";
    slot.mobileRules = {};
    const node = createDynamicTemplateNode(nodeType, name, slot.slotId);
    node.nodeId = `${templateId}_node_${identity}`;
    node.responsive.desktop = { ...node.responsive.desktop, placement: { ...area, zIndex: 1 }, radius: px(radius), overflow: "hidden" };
    node.responsive.mobile = { placement: null, height: { mode: "auto" }, order };
    definition.nodes[node.nodeId] = node;
    definition.slots[slot.slotId] = slot;
    stage.childIds.push(node.nodeId);
    return { slot, node };
  };
  const contentFirst = recipe.layout === "topContentBottomImage" || recipe.layout === "leftContentRightImage";
  recipe.media.forEach((media, index) => {
    const background = isCanvasBackground(recipe, media);
    let area = background ? { x: 0, y: 0, width: 1, height: 1 }
      : media.role === "logo" ? normalize({ x: width - margin - logoSize, y: margin, width: logoSize, height: logoSize }) : mediaRects[mediaIndex++];
    if (media.role === "logo") area = normalize(fitMedia({ x: area.x * width, y: area.y * height, width: area.width * width, height: area.height * height }, media));
    const { slot, node } = addSlot(media.name, "image", "ImageSlot", area, contentFirst ? 50 + index : index);
    node.responsive.desktop.display = "flex";
    slot.semanticRole = media.role;
    slot.editable = media.replaceable;
    slot.validation = { recommendedWidth: Math.max(1, Math.round(area.width * width)), recommendedHeight: Math.max(1, Math.round(area.height * height)) };
    const aspectRatio = background ? width / height : media.freeRatio ? area.width * width / (area.height * height) : media.aspectRatio;
    slot.desktopRules = { aspectRatio: integerRatio(aspectRatio), objectFit: media.fitMode, objectPosition: "center center" };
    slot.mobileRules = { aspectRatio: integerRatio(aspectRatio) };
    node.responsive.desktop.radius = background ? px(0) : media.shape === "circle" ? { value: 50, unit: "%" } : px(media.borderRadius);
    if (background) node.responsive.desktop.placement!.zIndex = 0;
    if (media.role === "logo") {
      node.responsive.desktop.placement!.zIndex = 3;
      node.responsive.mobile.width = px(72);
    }
    node.responsive.mobile.height = { mode: "aspect-ratio", ratio: { width: aspectRatio, height: 1 } };
    node.instanceEditPolicy!.imageFit = media.allowCrop;
    node.instanceEditPolicy!.imageFocus = media.allowCrop;
    if (media.defaultImage) definition.defaultContent[slot.slotId] = { src: media.defaultImage, alt: media.name };
  });
  recipe.content.forEach((content, index) => {
    const area = content === header ? headerArea : contentRects[contentIndex++];
    const type = content.role === "cta" ? "button" : content.role === "title" ? "heading" : "text";
    const { slot, node } = addSlot(content.name, type, type === "button" ? "ButtonSlot" : type === "heading" ? "HeadingSlot" : "TextSlot", area, content === header ? -1 : contentFirst ? index : 50 + index);
    slot.semanticRole = content.role;
    slot.editable = content.editable;
    slot.validation = { maxLength: content.maxLength };
    const font = typography(content.role);
    slot.desktopRules = { fontRole: type === "heading" ? "display" : type === "button" ? "action" : "body",
      fontSize: px(Math.max(1, font.size)), fontWeight: font.weight,
      lineHeight: 1.3, textAlign: recipe.style.alignment ?? recommendedAlignment(recipe.layout), overflow: "wrap",
      fontFamily: recipe.style.variant === "premium" ? "serif" : "system", color: font.size < body ? recipe.style.secondaryTextColor ?? recipe.style.textColor : recipe.style.textColor,
    };
    slot.mobileRules = { fontSize: px(content.role === "price" ? 30 : font.weight === 700 ? 28 : font.weight === 500 ? 20 : 16) };
    if (type === "button") {
      node.responsive.desktop.backgroundColor = recipe.style.primaryColor;
      node.responsive.desktop.padding = { top: px(8), right: px(16), bottom: px(8), left: px(16) };
      slot.desktopRules.textAlign = "center";
      slot.desktopRules.color = readableText(recipe.style.primaryColor);
    }
    // 显式配方正文继续兼容；空初值不把系统样例或按钮壳写成正式默认内容。
    if (content.defaultContent !== "") {
      definition.defaultContent[slot.slotId] = type === "button" ? { label: content.defaultContent, targetType: "none" } : content.defaultContent;
    }
  });
  if (ordinaryContent.length) {
    const group = createDynamicTemplateNode("Container", "内容区域");
    group.nodeId = `${templateId}_content`;
    group.responsive.desktop = { ...group.responsive.desktop, display: "flex", direction: "column", justifyContent: "center", gap: px(spacing),
      placement: { ...contentArea, zIndex: 2 }, radius: px(radius),
      ...(recipe.layout === "fullImageOverlay" ? { backgroundColor: recipe.style.backgroundColor, padding: { top: px(12), right: px(20), bottom: px(12), left: px(20) } } : {}) };
    group.responsive.mobile = { placement: null, height: { mode: "auto" }, gap: px(spacing), order: contentFirst ? 0 : 50 };
    const ordinaryRoles = new Set(ordinaryContent.map((content) => content.role));
    stage.childIds = stage.childIds.filter((id) => {
      const node = definition.nodes[id];
      const slot = definition.slots[node.slotId!];
      if (!slot || slot.type === "image" || !ordinaryRoles.has(slot.semanticRole as TemplateRecipe["content"][number]["role"])) return true;
      if (header && id === `${templateId}_node_${recipe.media.length + recipe.content.indexOf(header) + 1}`) return true;
      delete node.responsive.desktop.placement;
      node.responsive.desktop.height = { mode: "auto" };
      node.responsive.desktop.overflow = "visible";
      group.childIds.push(id);
      return false;
    });
    definition.nodes[group.nodeId] = group;
    stage.childIds.push(group.nodeId);
  }
  if (recipe.layout === "cards" && stage.childIds.length) {
    const card = createDynamicTemplateNode("Container", "主内容卡片");
    card.nodeId = `${templateId}_card`;
    card.responsive.desktop = { ...card.responsive.desktop,
      placement: { ...normalize({ x: margin / 2, y: margin / 2, width: width - margin, height: height - margin }), zIndex: 1 }, radius: px(radius),
      backgroundColor: recipe.style.background === "light" ? "#F7F8F8" : recipe.style.backgroundColor };
    card.responsive.mobile = { placement: null, height: { mode: "auto" } };
    card.childIds = stage.childIds.filter((id) => definition.slots[definition.nodes[id].slotId!]?.semanticRole !== "backgroundImage");
    for (const id of card.childIds) {
      const place = definition.nodes[id].responsive.desktop.placement!;
      const frame = card.responsive.desktop.placement!;
      Object.assign(place, { x: (place.x - frame.x) / frame.width, y: (place.y - frame.y) / frame.height, width: place.width / frame.width, height: place.height / frame.height });
    }
    card.childIds.sort((a, b) => (definition.nodes[a].responsive.mobile.order ?? 0) - (definition.nodes[b].responsive.mobile.order ?? 0));
    stage.childIds = stage.childIds.filter((id) => !card.childIds.includes(id));
    stage.childIds.push(card.nodeId);
    const cardLayout = createDynamicTemplateNode("Stack", "卡片内容");
    cardLayout.nodeId = `${templateId}_card_layout`;
    cardLayout.responsive.desktop = { ...cardLayout.responsive.desktop, layoutMode: "free", height: { mode: "fixed", value: { value: 100, unit: "%" } } };
    cardLayout.responsive.mobile = { layoutMode: "flow", height: { mode: "auto" }, gap: px(spacing) };
    cardLayout.childIds = card.childIds;
    card.childIds = [cardLayout.nodeId];
    definition.nodes[cardLayout.nodeId] = cardLayout;
    definition.nodes[card.nodeId] = card;
  }
  // 同步真实结构顺序，避免移动端仅依赖 CSS order 而屏幕阅读器与画布树仍保持旧顺序。
  stage.childIds.sort((left, right) => (definition.nodes[left].responsive.mobile.order ?? 0) - (definition.nodes[right].responsive.mobile.order ?? 0));
  const result = validateDynamicTemplateDefinition(definition);
  if (!result.valid) throw new Error(result.issues.filter((issue) => issue.level === "error").map((issue) => issue.message).join("；"));
  return definition;
}
