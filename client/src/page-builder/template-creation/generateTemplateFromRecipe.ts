import {
  createBlankDynamicTemplateDefinition, createDynamicTemplateNode, createDynamicTemplateSlotDefinition,
} from "../template-definition/nodeRegistry";
import { validateDynamicTemplateDefinition, validateTemplateRecipe } from "../template-definition/validateTemplateDefinition";
import type { DynamicTemplateNodeType, DynamicTemplateSlotType, TemplateDefinitionV2, TemplateRecipe } from "../template-definition/generated/templateDefinition.generated";
import { CANVAS_PRESETS, isCanvasBackground, LAYOUTS, PURPOSES, RADIUS_VALUES, SECTION_ROLES, SPACING_VALUES, MARGIN_VALUES, readableText, recommendedAlignment } from "./presets";
import { allowsButtonSlot, TEMPLATE_TYPE_SCALE, typeLevelFor } from "./typographyScale";
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
  // 流式画布的横向边距按设计宽度计算：这一模式下画布高度不是真实约束，短边不能当分母。
  const flowMargin = Math.round(width * MARGIN_VALUES[recipe.style.margin ?? "standard"]);
  const spacing = SPACING_VALUES[recipe.style.spacing];
  const regionSpacing = spacing * 2;
  // 字号从 UI_GUIDE 第 2.3 节的排印层级取值：语义层级决定字号与字重，
  // 不再按画布短边百分比另算一套主标题算法（template-creation-rules 第 6.1 节），
  // 因此小画布不会自动获得小字号，放不下时按下面的容纳校验如实报错。
  const typography = (role: TemplateRecipe["content"][number]["role"]) => {
    const level = typeLevelFor(role, recipe.sectionRole);
    return { ...TEMPLATE_TYPE_SCALE[level], level };
  };
  const root = definition.nodes[definition.rootNodeId];
  root.nodeId = `${templateId}_root`;
  root.name = "背景";
  definition.nodes = { [root.nodeId]: root };
  definition.rootNodeId = root.nodeId;
  // 用途回退链：历史配方的 purpose 标签 → 本次选定的区块角色 → 通用模板。
  // 新配方不再写 purpose（旧母版 key 只作兼容读取），但 metadata.purpose 服务端要求非空字符串，
  // 后台模板检查器也把它当“用途”文本字段显示，所以必须落到一个标签上而不是空串。
  const legacyPurpose = recipe.purpose === "custom"
    ? recipe.customPurpose || "自定义"
    : PURPOSES.find(([key]) => key === recipe.purpose)?.[1];
  const sectionRoleLabel = recipe.sectionRole
    ? SECTION_ROLES.find(([key]) => key === recipe.sectionRole)?.[1]
    : undefined;
  definition.metadata = { ...definition.metadata,
    purpose: legacyPurpose ?? sectionRoleLabel ?? "通用模板",
    ...(recipe.sectionRole ? { sectionRole: recipe.sectionRole } : {}),
    layoutType: LAYOUTS.find(([key]) => key === recipe.layout)![1], category: "自主设计",
    canvasSize: { ...recipe.canvas }, desktopRatio: `${width}:${height}`, mobileRatio: "auto",
    previewDesktopWidth: Math.min(2560, Math.max(768, width)),
    slotSummary: `${recipe.media.length} 个图片槽位，${recipe.content.length} 个内容槽位`,
  };
  root.responsive.desktop.backgroundColor = recipe.style.backgroundColor;
  const contentHeightPreset = CANVAS_PRESETS.find((preset) => preset.ratio === "auto");
  const rootGrowsWithContent = Boolean(
    contentHeightPreset
    && width === contentHeightPreset.width
    && height === contentHeightPreset.height,
  );
  // “随内容增长”的画布没有固定高度：百分比失去分母，自由坐标的 y/height 也没有参照物，
  // 于是绝对定位的子节点高度全部退化为 auto、又不参与父级高度，根容器塌成 0px。
  // 这一模式下桌面与手机同走流式排版（Stack 默认 flex/column/fill/auto），高度与顺序由内容决定；
  // 布局选择在此表达“顺序与分栏意图”，不再是绝对坐标。固定画幅仍保留自由坐标与溢出拦截。
  root.responsive.desktop.height = rootGrowsWithContent
    ? { mode: "auto" }
    : { mode: "fixed", value: px(height) };
  root.responsive.mobile = { height: { mode: "auto" } };
  const stage = createDynamicTemplateNode("Stack", "布局结构");
  stage.nodeId = `${templateId}_layout`;
  stage.responsive.desktop = rootGrowsWithContent
    ? { ...stage.responsive.desktop, layoutMode: "flow", height: { mode: "auto" }, gap: px(regionSpacing),
        padding: { top: px(flowMargin), right: px(flowMargin), bottom: px(flowMargin), left: px(flowMargin) } }
    : { ...stage.responsive.desktop, layoutMode: "free", height: { mode: "fixed", value: { value: 100, unit: "%" } } };
  stage.responsive.mobile = { layoutMode: "flow", height: { mode: "auto" }, gap: px(regionSpacing), padding: { top: px(24), right: px(20), bottom: px(24), left: px(20) } };
  root.childIds = [stage.nodeId];
  definition.nodes[stage.nodeId] = stage;
  const radius = RADIUS_VALUES[recipe.style.radius];
  if (!recipe.media.length && !recipe.content.length) throw new Error("请至少选择一个图片或内容槽位，再创建模板。");
  if (recipe.media.filter((item) => item.role === "logo").length > 1) throw new Error("Logo 只需一个槽位，请删除重复的 Logo。");
  if (recipe.media.filter((item) => item.role === "backgroundImage").length > 1) throw new Error("画布只能有一张背景图，请调整图片类型。");
  if (recipe.media.some((item) => item.shape === "circle" && (item.aspectRatio !== 1 || item.freeRatio))) throw new Error("圆形图片使用 1:1 比例，请调整图片形态或比例。");
  const nonBackground = recipe.media.filter((item) => !isCanvasBackground(recipe, item) && item.role !== "logo");
  const header = (recipe.layout === "headerSubjectFooter" || recipe.layout === "centerSubject") && nonBackground.length ? recipe.content.find((item) => item.role === "title") : undefined;
  const ordinaryContent = recipe.content.filter((item) => item !== header);
  const logoSize = Math.round(shortSide * .1);
  const normalize = (area: Rect): Rect => ({ x: area.x / width, y: area.y / height, width: area.width / width, height: area.height / height });
  // 只有固定画幅才做区域分配。流式画布没有可分配的固定高度，位置由槽位顺序决定，
  // 因此不预判内容能否“放下”，也不抛容纳错误——那正是“随内容增长”要避免的。
  let headerArea: Rect | undefined;
  let contentArea: Rect | undefined;
  let mediaRects: Rect[] = [];
  let contentRects: Rect[] = [];
  if (!rootGrowsWithContent) {
    const regions = layoutRegions(recipe.layout, { width, height, margin, gap: regionSpacing });
    const logoBand = recipe.media.some((item) => item.role === "logo") ? logoSize + regionSpacing : 0;
    const inner = { x: margin, y: margin + logoBand, width: width - margin * 2, height: height - margin * 2 - logoBand };
    const fitError = () => { throw new Error("当前画布无法容纳所选内容与间距。请增大画布、减少内容或选择更合适的布局；配置已保留。"); };
    // 按完整文案保守估算行数，预先分配空间；保留字号和间距，不靠裁切或缩小文字通过校验。
    const contentHeight = (items: typeof recipe.content, availableWidth: number) => items.reduce((total, item) => {
      const font = typography(item.role);
      const columns = Math.floor((availableWidth - (item.role === "cta" ? 32 : 0)) / Math.max(1, font.desktop));
      if (columns < 1) return fitError();
      const previewText = item.defaultContent || getTemplateRecipeSampleText(item.role, item.name, item.maxLength);
      const lines = previewText.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil([...line].length / columns)), 0);
      return total + Math.ceil(lines * Math.max(1, font.desktop) * 1.3) + (item.role === "cta" ? 16 : 0);
    }, Math.max(0, items.length - 1) * spacing);
    // 字号取自固定层级后不再存在“短边太窄所以正文小于 1px”的情况，容量只由内外框几何决定。
    if (inner.width <= 0 || inner.height <= 0) fitError();
    const headerHeight = header ? contentHeight([header], inner.width) : 0;
    headerArea = normalize({ ...inner, height: headerHeight });
    if (header) { inner.y += headerHeight + regionSpacing; inner.height -= headerHeight + regionSpacing; }
    const overlay = recipe.layout === "fullImageOverlay";
    const horizontal = ["leftImageRightContent", "leftContentRightImage", "splitColumns"].includes(recipe.layout);
    const contentBox = { ...inner };
    const mediaBox = { ...inner };
    const splitWidth = inner.width - regionSpacing;
    // 图文介绍优先给图片展示空间；长内容逐级扩大文字区，同级分栏保持等宽。
    const contentShare = horizontal && nonBackground.length && ordinaryContent.length && recipe.layout !== "splitColumns"
      ? [.4, .45, .5].find((share) => ordinaryContent.every((item) => splitWidth * share >= typography(item.role).desktop + (item.role === "cta" ? 32 : 0))
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
    contentArea = normalize(contentBox);
    mediaRects = arrangeMedia(mediaBox, nonBackground, spacing, recipe.rules.mediaArrangement).map(normalize);
    if (mediaRects.length !== nonBackground.length) fitError();
    contentRects = subdivide(contentArea, ordinaryContent.length, false, recipe.style.spacing === "compact" ? .008 : .018);
  }
  let mediaIndex = 0;
  let contentIndex = 0;
  const addSlot = (name: string, type: DynamicTemplateSlotType, nodeType: DynamicTemplateNodeType, area: Rect | undefined, order: number) => {
    const identity = Object.keys(definition.slots).length + 1;
    const slot = createDynamicTemplateSlotDefinition(type, name, `content${identity}`);
    slot.slotId = `${templateId}_slot_${identity}`;
    slot.emptyPolicy = "hide";
    slot.mobileRules = {};
    const node = createDynamicTemplateNode(nodeType, name, slot.slotId);
    node.nodeId = `${templateId}_node_${identity}`;
    // 流式画布不写自由坐标：宽度交给 Stack 的 fill，位置由顺序决定，也不强制 overflow: hidden
    // （文字与按钮需要溢出可见，图片按下面的 aspect-ratio 自行裁切）。
    node.responsive.desktop = rootGrowsWithContent
      ? { ...node.responsive.desktop, height: { mode: "auto" }, radius: px(radius) }
      : { ...node.responsive.desktop, placement: { ...area!, zIndex: 1 }, radius: px(radius), overflow: "hidden" };
    node.responsive.mobile = { placement: null, height: { mode: "auto" }, order };
    definition.nodes[node.nodeId] = node;
    definition.slots[slot.slotId] = slot;
    stage.childIds.push(node.nodeId);
    return { slot, node };
  };
  const contentFirst = recipe.layout === "topContentBottomImage" || recipe.layout === "leftContentRightImage";
  recipe.media.forEach((media, index) => {
    const background = isCanvasBackground(recipe, media);
    let area: Rect | undefined = rootGrowsWithContent ? undefined
      : background ? { x: 0, y: 0, width: 1, height: 1 }
      : media.role === "logo" ? normalize({ x: width - margin - logoSize, y: margin, width: logoSize, height: logoSize }) : mediaRects[mediaIndex++];
    if (area && media.role === "logo") area = normalize(fitMedia({ x: area.x * width, y: area.y * height, width: area.width * width, height: area.height * height }, media));
    const { slot, node } = addSlot(media.name, "image", "ImageSlot", area, contentFirst ? 50 + index : index);
    if (!rootGrowsWithContent) node.responsive.desktop.display = "flex";
    slot.semanticRole = media.role;
    slot.editable = media.replaceable;
    // 流式画布的推荐尺寸按内容区宽度和比例推算；固定画幅仍用实际外框。
    const recommendedWidth = rootGrowsWithContent ? width - flowMargin * 2 : area!.width * width;
    const recommendedHeight = rootGrowsWithContent ? recommendedWidth / (background ? width / height : media.aspectRatio) : area!.height * height;
    slot.validation = { recommendedWidth: Math.max(1, Math.round(recommendedWidth)), recommendedHeight: Math.max(1, Math.round(recommendedHeight)) };
    const aspectRatio = background ? width / height
      : rootGrowsWithContent ? media.aspectRatio
      : media.freeRatio ? area!.width * width / (area!.height * height) : media.aspectRatio;
    slot.desktopRules = { aspectRatio: integerRatio(aspectRatio), objectFit: media.fitMode, objectPosition: "center center" };
    slot.mobileRules = { aspectRatio: integerRatio(aspectRatio) };
    node.responsive.desktop.radius = background ? px(0) : media.shape === "circle" ? { value: 50, unit: "%" } : px(media.borderRadius);
    // 流式画布里每个图片槽位自带比例，铺满内容区宽度后按比例定高；
    // 背景图这一模式下不再覆盖文字，退化为等比例的通栏图块。
    if (rootGrowsWithContent) node.responsive.desktop.height = { mode: "aspect-ratio", ratio: { width: aspectRatio, height: 1 } };
    else if (background) node.responsive.desktop.placement!.zIndex = 0;
    if (media.role === "logo") {
      if (rootGrowsWithContent) node.responsive.desktop.width = px(logoSize);
      else node.responsive.desktop.placement!.zIndex = 3;
      node.responsive.mobile.width = px(72);
    }
    node.responsive.mobile.height = { mode: "aspect-ratio", ratio: { width: aspectRatio, height: 1 } };
    node.instanceEditPolicy!.imageFit = media.allowCrop;
    node.instanceEditPolicy!.imageFocus = media.allowCrop;
    if (media.defaultImage) definition.defaultContent[slot.slotId] = { src: media.defaultImage, alt: media.name };
  });
  // 不变量 F：一块模板最多一个 ButtonSlot，且只出现在两个主行动角色上；
  // 其余行动槽位一律 LinkSlot——配方里出现多个 cta 时，第二个起降级为链接。
  const primaryAction = allowsButtonSlot(recipe.sectionRole) ? recipe.content.find((item) => item.role === "cta") : undefined;
  recipe.content.forEach((content, index) => {
    const area = content === header ? headerArea : contentRects[contentIndex++];
    const type = content.role === "cta" ? (content === primaryAction ? "button" : "link") : content.role === "title" ? "heading" : "text";
    const nodeType = type === "button" ? "ButtonSlot" : type === "link" ? "LinkSlot" : type === "heading" ? "HeadingSlot" : "TextSlot";
    // 行动槽按实际节点命名，与首发母版一致：唯一主按钮叫主行动，降级链接叫次级链接。
    const structureName = content.role === "cta" ? (content === primaryAction ? "主行动" : "次级链接") : content.name;
    const { slot, node } = addSlot(structureName, type, nodeType, area, content === header ? -1 : contentFirst ? index : 50 + index);
    slot.semanticRole = content.role;
    slot.editable = content.editable;
    slot.validation = { maxLength: content.maxLength };
    const font = typography(content.role);
    slot.desktopRules = { fontRole: type === "button" || type === "link" ? "action" : font.fontRole,
      fontSize: px(Math.max(1, font.desktop)), fontWeight: font.weight,
      lineHeight: 1.3, textAlign: recipe.style.alignment ?? recommendedAlignment(recipe.layout), overflow: "wrap",
      fontFamily: recipe.style.variant === "premium" ? "serif" : "system", color: font.level === "caption" ? recipe.style.secondaryTextColor ?? recipe.style.textColor : recipe.style.textColor,
    };
    slot.mobileRules = { fontSize: px(font.mobile) };
    if (type === "button") {
      node.responsive.desktop.backgroundColor = recipe.style.primaryColor;
      node.responsive.desktop.padding = { top: px(8), right: px(16), bottom: px(8), left: px(16) };
      // 流式画布没有外框可依，不约束就会拉成通栏色条；宽度跟随文字。
      if (rootGrowsWithContent) node.responsive.desktop.width = "fit";
      slot.desktopRules.textAlign = "center";
      slot.desktopRules.color = readableText(recipe.style.primaryColor);
    }
    // 显式配方正文继续兼容；空初值不把系统样例或按钮壳写成正式默认内容。
    if (content.defaultContent !== "") {
      definition.defaultContent[slot.slotId] = type === "button" || type === "link"
        ? { label: content.defaultContent, targetType: "none" } : content.defaultContent;
    }
  });
  if (ordinaryContent.length) {
    const group = createDynamicTemplateNode("Container", "文字列");
    group.nodeId = `${templateId}_content`;
    const overlaySurface = recipe.layout === "fullImageOverlay"
      ? { backgroundColor: recipe.style.backgroundColor, padding: { top: px(12), right: px(20), bottom: px(12), left: px(20) } } : {};
    // 流式画布下内容区是一个普通流式块：高度由内容撑开，纵向 justify 在 auto 高度下本就不起作用。
    group.responsive.desktop = rootGrowsWithContent
      ? { ...group.responsive.desktop, display: "flex", direction: "column", justifyContent: "center", gap: px(spacing), height: { mode: "auto" }, radius: px(radius), ...overlaySurface }
      : { ...group.responsive.desktop, display: "flex", direction: "column", justifyContent: "center", gap: px(spacing),
          placement: { ...contentArea!, zIndex: 2 }, radius: px(radius), ...overlaySurface };
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
    const cardSurface = { radius: px(radius), backgroundColor: recipe.style.background === "light" ? "#F7F8F8" : recipe.style.backgroundColor };
    // 固定画幅里卡片是缩进的内画布；流式画布里卡片退化为一个带背景和内边距的通栏内容块。
    card.responsive.desktop = rootGrowsWithContent
      ? { ...card.responsive.desktop, display: "flex", direction: "column", gap: px(spacing), height: { mode: "auto" },
          padding: { top: px(spacing), right: px(spacing), bottom: px(spacing), left: px(spacing) }, ...cardSurface }
      : { ...card.responsive.desktop, placement: { ...normalize({ x: margin / 2, y: margin / 2, width: width - margin, height: height - margin }), zIndex: 1 }, ...cardSurface };
    card.responsive.mobile = { placement: null, height: { mode: "auto" } };
    card.childIds = stage.childIds.filter((id) => definition.slots[definition.nodes[id].slotId!]?.semanticRole !== "backgroundImage");
    if (!rootGrowsWithContent) for (const id of card.childIds) {
      const place = definition.nodes[id].responsive.desktop.placement!;
      const frame = card.responsive.desktop.placement!;
      Object.assign(place, { x: (place.x - frame.x) / frame.width, y: (place.y - frame.y) / frame.height, width: place.width / frame.width, height: place.height / frame.height });
    }
    card.childIds.sort((a, b) => (definition.nodes[a].responsive.mobile.order ?? 0) - (definition.nodes[b].responsive.mobile.order ?? 0));
    stage.childIds = stage.childIds.filter((id) => !card.childIds.includes(id));
    stage.childIds.push(card.nodeId);
    const cardLayout = createDynamicTemplateNode("Stack", "卡片内容");
    cardLayout.nodeId = `${templateId}_card_layout`;
    cardLayout.responsive.desktop = rootGrowsWithContent
      ? { ...cardLayout.responsive.desktop, layoutMode: "flow", height: { mode: "auto" }, gap: px(spacing) }
      : { ...cardLayout.responsive.desktop, layoutMode: "free", height: { mode: "fixed", value: { value: 100, unit: "%" } } };
    cardLayout.responsive.mobile = { layoutMode: "flow", height: { mode: "auto" }, gap: px(spacing) };
    cardLayout.childIds = card.childIds;
    card.childIds = [cardLayout.nodeId];
    definition.nodes[cardLayout.nodeId] = cardLayout;
    definition.nodes[card.nodeId] = card;
    // 固定画幅的桌面坐标不能改父子关系。作品网格的手机两列由渲染器按区块角色完成；
    // 这里只把作品卡的手机比例收成 4:5。
    if (recipe.sectionRole === "creation-grid") {
      for (const id of cardLayout.childIds) {
        const slotId = definition.nodes[id].slotId;
        const slot = slotId ? definition.slots[slotId] : undefined;
        if (!slot || slot.type !== "image") continue;
        if (slot.semanticRole === "backgroundImage" || slot.semanticRole === "heroImage" || slot.semanticRole === "logo") continue;
        slot.mobileRules = { ...slot.mobileRules, aspectRatio: "4:5" };
        definition.nodes[id].responsive.mobile.height = { mode: "aspect-ratio", ratio: { width: 4, height: 5 } };
      }
    }
  }
  // 同步真实结构顺序，避免移动端仅依赖 CSS order 而屏幕阅读器与画布树仍保持旧顺序。
  stage.childIds.sort((left, right) => (definition.nodes[left].responsive.mobile.order ?? 0) - (definition.nodes[right].responsive.mobile.order ?? 0));
  const result = validateDynamicTemplateDefinition(definition);
  if (!result.valid) throw new Error(result.issues.filter((issue) => issue.level === "error").map((issue) => issue.message).join("；"));
  return definition;
}
