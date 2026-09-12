import {
  addDynamicTemplateNode,
  canNestDynamicTemplateNode,
  getDynamicTemplateStructureLockOwnerId,
  type DynamicTemplateNodeType,
  type TemplateDefinitionV2,
} from "../template-definition";
import { addConfiguredTemplateRegion } from "./dynamicTemplateDraftRepository";

export const TEMPLATE_LAYOUT_STARTERS = [
  { id: "stacked", label: "上下排列", description: "两个内容区域上下排列，内容由你添加。" },
  { id: "columns", label: "左右两栏", description: "桌面两栏等宽，手机上下排列，内容由你添加。" },
  { id: "image-text", label: "左图右文", description: "左侧图片，右侧标题、正文和按钮；手机图片在上。" },
  { id: "cards", label: "三列卡片", description: "三组图片、标题和正文；平板两列，手机一列。" },
] as const;

export type TemplateLayoutStarter = typeof TEMPLATE_LAYOUT_STARTERS[number]["id"];

export function getTemplateLayoutStarterUnavailableReason(source: TemplateDefinitionV2, parentId: string, kind: TemplateLayoutStarter): string | null {
  const parent = source.nodes[parentId];
  if (!parent) return "添加目标已不存在，请重新选择。";
  if (getDynamicTemplateStructureLockOwnerId(source, parentId)) return "添加目标已锁定，请解锁后再添加布局。";
  const targetType = parentId === source.rootNodeId ? "Container" : parent.type;
  if (!canNestDynamicTemplateNode(targetType, kind === "stacked" ? "Stack" : "Grid")) {
    return "当前容器不接受此布局，请选择内容区域或列内分组。";
  }
  return null;
}

/** 只组合已注册的原生节点与槽位。调用者将整个结果作为一次命令提交。 */
export function addTemplateLayoutStarter(
  source: TemplateDefinitionV2,
  parentId: string,
  kind: TemplateLayoutStarter,
  index?: number,
): { definition: TemplateDefinitionV2; nodeId: string; firstTargetId: string } {
  const unavailable = getTemplateLayoutStarterUnavailableReason(source, parentId, kind);
  if (unavailable) throw new Error(unavailable);
  let definition = source;
  let targetId = parentId;
  if (parentId === source.rootNodeId) {
    const region = addConfiguredTemplateRegion(definition, parentId, index);
    definition = region.definition;
    targetId = region.nodeId;
  }
  const add = (parent: string, type: DynamicTemplateNodeType, name: string, at?: number) => {
    const result = addDynamicTemplateNode(definition, parent, type, at);
    definition = result.definition;
    definition.nodes[result.nodeId].name = name;
    if (result.slotId) definition.slots[result.slotId].label = name;
    return result;
  };
  const option = TEMPLATE_LAYOUT_STARTERS.find((item) => item.id === kind)!;
  const layout = add(targetId, kind === "stacked" ? "Stack" : "Grid", option.label,
    parentId === source.rootNodeId ? undefined : index);
  const rules = definition.nodes[layout.nodeId].responsive;
  rules.desktop.gap = { value: 24, unit: "px" };
  if (kind !== "stacked") {
    rules.desktop.columns = kind === "cards" ? [1, 1, 1] : [1, 1];
    rules.mobile.columns = [1];
    if (kind === "cards") rules.tablet = { columns: [1, 1] };
  }
  rules.mobile.gap = { value: 16, unit: "px" };
  const groups = Array.from({ length: kind === "cards" ? 3 : 2 }, (_, position) => {
    const name = kind === "cards" ? `卡片 ${position + 1}`
      : kind === "image-text" ? (position === 0 ? "图片区域" : "文案区域")
        : kind === "stacked" ? (position === 0 ? "上方区域" : "下方区域")
          : position === 0 ? "左侧区域" : "右侧区域";
    const group = add(layout.nodeId, kind === "stacked" ? "Container" : "Column", name);
    Object.assign(definition.nodes[group.nodeId].responsive.desktop, {
      display: "flex", direction: "column", gap: { value: 16, unit: "px" },
    });
    return group.nodeId;
  });
  const addContent = (parent: string, type: DynamicTemplateNodeType, name: string) => {
    const result = add(parent, type, name);
    const slot = definition.slots[result.slotId!];
    if (type === "ImageSlot") slot.desktopRules.aspectRatio = "4:3";
    if (type === "HeadingSlot" || type === "TextSlot") {
      slot.desktopRules.fontSize = { value: type === "HeadingSlot" ? 32 : 18, unit: "px" };
      slot.mobileRules.fontSize = { value: type === "HeadingSlot" ? 24 : 16, unit: "px" };
      slot.desktopRules.fontWeight = type === "HeadingSlot" ? 600 : 400;
    }
  };
  if (kind === "image-text") {
    addContent(groups[0], "ImageSlot", "主图");
    addContent(groups[1], "HeadingSlot", "主标题");
    addContent(groups[1], "TextSlot", "正文说明");
    addContent(groups[1], "ButtonSlot", "行动按钮");
  } else if (kind === "cards") {
    groups.forEach((group, position) => {
      addContent(group, "ImageSlot", `卡片 ${position + 1} 图片`);
      addContent(group, "HeadingSlot", `卡片 ${position + 1} 标题`);
      addContent(group, "TextSlot", `卡片 ${position + 1} 说明`);
    });
  }
  return { definition, nodeId: layout.nodeId, firstTargetId: groups[0] };
}
