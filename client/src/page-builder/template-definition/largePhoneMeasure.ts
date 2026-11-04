import { isMobileWorkUnit, type MobileWorkNode } from "./mobileWorkGrid";
import type { DynamicTemplateRenderPlanNode } from "./renderPlan";

const STRUCTURE = new Set(["Section", "Container", "Stack", "Column", "Grid"]);
const TEXT_SLOTS = new Set(["heading", "text", "richText", "badge", "button", "link"]);

function containsNarrative(node: DynamicTemplateRenderPlanNode): boolean {
  if (node.hidden) return false;
  if (node.slot?.type === "image" && node.slot.semanticRole !== "logo") return true;
  if (node.slot && TEXT_SLOTS.has(node.slot.type)) return true;
  return node.children.some(containsNarrative);
}

function containsWorkGroup(node: DynamicTemplateRenderPlanNode, sectionRole: string | undefined): boolean {
  const units = node.children.filter((child) => isMobileWorkUnit(child as MobileWorkNode, sectionRole));
  return units.length >= 2;
}

function subtreeHasWorkGroup(node: DynamicTemplateRenderPlanNode, sectionRole: string | undefined): boolean {
  if (containsWorkGroup(node, sectionRole)) return true;
  return node.children.some((child) => subtreeHasWorkGroup(child, sectionRole));
}

/**
 * 600～767px 仍是手机内容。单列叙事图和文字组限宽 560 并居中（R-9）。
 * 作品网格的父级和卡片不标，栏数继续按 R-6。
 */
export function usesLargePhoneMeasure(
  node: DynamicTemplateRenderPlanNode,
  options: {
    device: "desktop" | "mobile";
    inWorkGrid: boolean;
    parentMeasured: boolean;
    sectionRole?: string;
  },
): boolean {
  if (options.device !== "mobile" || options.inWorkGrid || options.parentMeasured || node.hidden) return false;
  if (node.slot?.semanticRole === "logo") return false;
  if (subtreeHasWorkGroup(node, options.sectionRole)) return false;
  if (node.slot?.type === "image") return true;
  if (node.slot && TEXT_SLOTS.has(node.slot.type)) return true;
  return !node.slot && STRUCTURE.has(node.type) && containsNarrative(node);
}
