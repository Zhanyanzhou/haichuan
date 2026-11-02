import type { DynamicTemplateRenderPlanNode } from "./renderPlan";

const LIGHT_TEXT_SLOTS = new Set(["heading", "text", "richText", "badge", "button", "link"]);

function isLightInk(color: string | undefined): boolean {
  if (!color || !/^#[\da-f]{6}$/i.test(color)) return false;
  const value = Number.parseInt(color.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 >= 0.7;
}

function hasLightText(node: DynamicTemplateRenderPlanNode): boolean {
  if (node.hidden) return false;
  if (node.slot && LIGHT_TEXT_SLOTS.has(node.slot.type) && isLightInk(node.slotRules?.color)) return true;
  return node.children.some(hasLightText);
}

function hasOwnSurface(node: DynamicTemplateRenderPlanNode): boolean {
  const rules = node.rules;
  return Boolean(rules.backgroundColor || rules.backgroundToken || rules.backgroundGradient || rules.backgroundImage);
}

/**
 * 浅色文字叠在主图上时，从文字所在一侧铺一层中性深色渐变（60% → 0%）。
 * 节点自己已有底色、平涂或渐变时不覆盖。手机端的这层渐变由图片槽位内的文字框绘制。
 */
export function resolveTextOnImageScrim(
  node: DynamicTemplateRenderPlanNode,
  siblings: readonly DynamicTemplateRenderPlanNode[],
  device: "desktop" | "mobile",
): "bottom" | "top" | undefined {
  if (device !== "desktop" || node.hidden || node.slot || !node.rules.placement || hasOwnSurface(node)) return undefined;
  if (!hasLightText(node)) return undefined;
  const place = node.rules.placement;
  const coversImage = siblings.some((sibling) => {
    if (sibling.nodeId === node.nodeId || sibling.hidden || sibling.slot?.type !== "image") return false;
    const role = sibling.slot.semanticRole;
    if (role !== "backgroundImage" && role !== "heroImage") return false;
    const imagePlace = sibling.rules.placement;
    if (!imagePlace) return false;
    return (imagePlace.zIndex ?? 0) <= (place.zIndex ?? 0);
  });
  if (!coversImage) return undefined;
  const justify = node.rules.justifyContent;
  if (justify === "start") return "top";
  if (justify === "end") return "bottom";
  return place.y + place.height / 2 >= 0.5 ? "bottom" : "top";
}
