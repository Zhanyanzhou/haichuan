import type { DynamicTemplateResponsiveRules } from "../template-definition/generated/templateDefinition.generated";

/** 原生块级排列也需要明确显示，不能当成未声明方向的横向 Flex。 */
export function getTemplateLayoutPresentation(rules: DynamicTemplateResponsiveRules): {
  layout: "vertical" | "horizontal" | "wrap" | "grid" | "free" | null;
  label: string;
} {
  if (rules.hidden || rules.display === "none") return { layout: null, label: "当前设备隐藏" };
  if (rules.layoutMode === "free") return { layout: "free", label: "自由排列" };
  if (rules.display === "grid") return { layout: "grid", label: "网格排列" };
  if (rules.display !== "flex" || rules.direction === "column") return { layout: "vertical", label: "上下排列" };
  if (rules.wrap === "wrap") return { layout: "wrap", label: "自动换行" };
  return { layout: "horizontal", label: "左右排列" };
}
