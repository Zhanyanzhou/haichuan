import type { TemplateDefinitionV2 } from "../template-definition/generated/templateDefinition.generated";

const TEXT_SLOT_TYPES = new Set(["heading", "text", "richText", "link", "button"]);

/**
 * 结构树同级的显示顺序。不改 childIds，也不改画布。
 * 自由叠放按桌面位置先上后下、先左后右。
 * 流式排列保持原顺序，只把副图整组放到这一级最后。
 * 这一级全是文字时，固定为标题、副标题、描述、链接、按钮。
 */
export function orderStructureChildIds(
  definition: TemplateDefinitionV2,
  parentId: string,
  childIds: readonly string[],
): string[] {
  if (childIds.length < 2) return [...childIds];
  const parent = definition.nodes[parentId];
  const placed = childIds.every((childId) => readPlacement(definition, childId));
  if (parent?.responsive.desktop.layoutMode === "free" || placed) {
    return [...childIds].sort((leftId, rightId) => comparePlacement(definition, leftId, rightId, childIds));
  }
  const leading = childIds.filter((childId) => !isSecondaryImageNode(definition, childId));
  const trailing = childIds.filter((childId) => isSecondaryImageNode(definition, childId));
  const orderedLeading = leading.every((childId) => isTextNode(definition, childId))
    ? [...leading].sort((leftId, rightId) => compareText(definition, leftId, rightId, childIds))
    : leading;
  return [...orderedLeading, ...trailing];
}

function readPlacement(definition: TemplateDefinitionV2, nodeId: string) {
  const placement = definition.nodes[nodeId]?.responsive.desktop.placement;
  if (!placement || typeof placement.y !== "number" || typeof placement.x !== "number") return null;
  return placement;
}

function comparePlacement(
  definition: TemplateDefinitionV2,
  leftId: string,
  rightId: string,
  childIds: readonly string[],
) {
  const left = readPlacement(definition, leftId);
  const right = readPlacement(definition, rightId);
  if (left && right && left.y !== right.y) return left.y - right.y;
  if (left && right && left.x !== right.x) return left.x - right.x;
  return childIds.indexOf(leftId) - childIds.indexOf(rightId);
}

function isSecondaryImageNode(definition: TemplateDefinitionV2, nodeId: string): boolean {
  const node = definition.nodes[nodeId];
  if (!node) return false;
  if (!node.slotId && node.name.includes("副图")) return true;
  const slot = node.slotId ? definition.slots[node.slotId] : undefined;
  if (slot?.type === "image") {
    return slot.semanticRole === "secondaryImage" || node.name.includes("副图") || slot.label.includes("副图");
  }
  if (node.slotId || node.childIds.length === 0) return false;
  const images = collectImageNodeIds(definition, nodeId);
  return images.length > 0 && images.every((imageId) => isSecondaryImageNode(definition, imageId));
}

function collectImageNodeIds(definition: TemplateDefinitionV2, nodeId: string): string[] {
  const node = definition.nodes[nodeId];
  if (!node) return [];
  const slot = node.slotId ? definition.slots[node.slotId] : undefined;
  if (slot?.type === "image") return [nodeId];
  return node.childIds.flatMap((childId) => collectImageNodeIds(definition, childId));
}

function isTextNode(definition: TemplateDefinitionV2, nodeId: string): boolean {
  const node = definition.nodes[nodeId];
  if (!node) return false;
  const slot = node.slotId ? definition.slots[node.slotId] : undefined;
  if (slot) return TEXT_SLOT_TYPES.has(slot.type);
  if (node.childIds.length === 0) return false;
  return node.childIds.every((childId) => isTextNode(definition, childId));
}

function compareText(
  definition: TemplateDefinitionV2,
  leftId: string,
  rightId: string,
  childIds: readonly string[],
) {
  const left = textBand(definition, leftId);
  const right = textBand(definition, rightId);
  if (left !== right) return left - right;
  return childIds.indexOf(leftId) - childIds.indexOf(rightId);
}

function textBand(definition: TemplateDefinitionV2, nodeId: string): number {
  const node = definition.nodes[nodeId];
  if (!node) return 70;
  const slot = node.slotId ? definition.slots[node.slotId] : undefined;
  if (slot) {
    if (slot.semanticRole === "subtitle" || slot.label.includes("副标题")) return 20;
    if (slot.type === "heading") return 10;
    if (slot.type === "text" || slot.type === "richText") return 30;
    if (slot.type === "link") return 40;
    if (slot.type === "button") return 50;
    return 70;
  }
  const bands = node.childIds.map((childId) => textBand(definition, childId));
  return bands.length ? Math.min(...bands) : 70;
}
