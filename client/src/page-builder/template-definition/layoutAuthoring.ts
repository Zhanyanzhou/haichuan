import type { TemplateDefinitionV2 } from "./generated/templateDefinition.generated";
import { resolveTemplateNodeRules, type TemplateBreakpoint } from "./responsive";
import { sectionCopyHiddenByDefault } from "./sectionCopyVisibility";

const MOBILE_LAYOUT_PROPERTIES = ["display", "direction", "wrap", "columns"] as const;

/** 与设计画布一致地排除本端隐藏项，不能把隐藏文案算作可排列的同级对象。 */
export function getTemplateVisibleLayoutChildIds(definition: TemplateDefinitionV2, nodeId: string, breakpoint: TemplateBreakpoint): string[] {
  const role = definition.metadata.sectionRole ?? definition.templateRecipe?.sectionRole;
  return (definition.nodes[nodeId]?.childIds ?? []).filter((childId) => {
    const child = definition.nodes[childId];
    if (!child) return false;
    const rules = resolveTemplateNodeRules(definition, childId, breakpoint);
    return !child.hidden && !rules.hidden && rules.display !== "none"
      && !sectionCopyHiddenByDefault(role, child.slotId ? definition.slots[child.slotId] : undefined, rules.hidden);
  });
}

/** 明确写入手机端的排列优先于渲染时的缺省配对，不根据继承后的值猜测来源。 */
export function hasExplicitMobileTemplateLayout(definition: TemplateDefinitionV2, nodeId: string): boolean {
  const mobile = definition.nodes[nodeId]?.responsive.mobile;
  return Boolean(mobile && (MOBILE_LAYOUT_PROPERTIES.some((key) =>
    Object.prototype.hasOwnProperty.call(mobile, key) && mobile[key] !== undefined)
    || mobile.layoutMode === "free"));
}

/** 默认手机 column 仍可图内排文；明确选择分栏、换行或显示方式后按作者结构呈现。 */
export function hasExplicitMobileTemplateComposition(definition: TemplateDefinitionV2, nodeId: string): boolean {
  const mobile = definition.nodes[nodeId]?.responsive.mobile;
  if (!mobile) return false;
  return (Object.prototype.hasOwnProperty.call(mobile, "display") && mobile.display !== undefined && mobile.display !== "none")
    || (Object.prototype.hasOwnProperty.call(mobile, "direction") && mobile.direction === "row")
    || (Object.prototype.hasOwnProperty.call(mobile, "wrap") && mobile.wrap === "wrap");
}

export function getWorkGridImageSlotIds(definition: TemplateDefinitionV2): Set<string> {
  const slotIds = new Set<string>();
  const role = definition.metadata.sectionRole ?? definition.templateRecipe?.sectionRole;
  if (role !== "creation-grid") return slotIds;
  for (const node of Object.values(definition.nodes)) {
    if (node.type !== "Grid") continue;
    const images = node.childIds.flatMap((childId) => {
      const slotId = definition.nodes[childId]?.slotId;
      return slotId && definition.slots[slotId]?.type === "image" ? [slotId] : [];
    });
    if (images.length >= 3 && images.length <= 6) images.forEach((slotId) => slotIds.add(slotId));
  }
  return slotIds;
}

/** 作品网格里正好四张图：手机两列两行。不因为槽位改了名字就改成单列。 */
export function isFixedFourWorkGrid(definition: TemplateDefinitionV2, nodeId: string): boolean {
  const role = definition.metadata.sectionRole ?? definition.templateRecipe?.sectionRole;
  const node = definition.nodes[nodeId];
  if (role !== "creation-grid" || !node) return false;
  const images = node.childIds.flatMap((childId) => {
    const slotId = definition.nodes[childId]?.slotId;
    const slot = slotId ? definition.slots[slotId] : undefined;
    return slot?.type === "image" ? [slot] : [];
  });
  return images.length === 4;
}
