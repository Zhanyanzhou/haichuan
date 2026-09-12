import type { DynamicTemplateResponsiveRules, DynamicTemplateSlotRules, TemplateDefinitionV2 } from "./generated/templateDefinition.generated";
import { resolveTemplateNodeRules, type TemplateBreakpoint } from "./responsive";

/** Renderer 与设计控件共用的稳定行为默认；不把浏览器计算值伪装成模板值。 */
export const TEMPLATE_MEDIA_DEFAULTS = { objectFit: "cover", objectPosition: "50% 50%" } as const;
export const TEMPLATE_TEXT_DEFAULTS = { overflow: "wrap" } as const;
export const TEMPLATE_DESIGN_RANGES: Readonly<Record<string, readonly [number, number]>> = {
  columns: [1, 12], gap: [0, 10000], padding: [0, 10000], fontSize: [1, 10000],
  fontWeight: [100, 900], lineHeight: [0.8, 3], maxLines: [1, 20], objectPosition: [0, 100],
};
export function getTemplateDesignRange(path: string, fallback: readonly [number, number]) {
  return TEMPLATE_DESIGN_RANGES[path] ?? TEMPLATE_DESIGN_RANGES[path.split(".")[0]] ?? fallback;
}

export function supportsTemplateContainerAlignment(rules: DynamicTemplateResponsiveRules) {
  return rules.layoutMode !== "free" && (rules.display === "flex" || rules.display === "grid");
}

/** 九宫格按物理水平/垂直表达；Flex 再映射到主轴与交叉轴。 */
export function getTemplateAlignmentRules(rules: DynamicTemplateResponsiveRules, horizontal: "start" | "center" | "end", vertical: "start" | "center" | "end") {
  return rules.display === "flex" && rules.direction === "column"
    ? { alignItems: horizontal, justifyContent: vertical }
    : { alignItems: vertical, justifyContent: horizontal };
}

function hasIndependentHeight(rules: DynamicTemplateResponsiveRules) {
  return ["fixed", "min-height", "viewport", "aspect-ratio"].includes(rules.height.mode)
    || Boolean(rules.minHeight && rules.minHeight.value > 0 && rules.minHeight.unit !== "%");
}

/** 与结构命令相同的约束前置解释；提交仍必须由命令原子校验。 */
export function getTemplateSizeOptionDisabledReason(definition: TemplateDefinitionV2, nodeId: string, breakpoint: TemplateBreakpoint, path: string, value: string): string | undefined {
  if (path !== "width" && path !== "height") return undefined;
  const node = definition.nodes[nodeId];
  if (!node) return "对象已不存在";
  const rules = resolveTemplateNodeRules(definition, nodeId, breakpoint);
  const parent = Object.values(definition.nodes).find((candidate) => candidate.childIds.includes(nodeId));
  const parentRules = parent && resolveTemplateNodeRules(definition, parent.nodeId, breakpoint);
  if (!parent && path === "height" && value === "fill") return "模板根容器没有可分配的父级高度，请使用固定、最小或比例高度";
  const positioned = Boolean(rules.anchor) || parentRules?.layoutMode === "free";
  if (value === "fill" && positioned) return "叠放对象不参与可用空间分配，请使用固定尺寸或百分比";
  if (value === "fill" && parentRules) {
    if (path === "width" && parentRules.width === "fit") return "父容器宽度适应内容，不能同时让子对象填满；请先确定父容器宽度";
    if (path === "height" && ["auto", "fit"].includes(parentRules.height.mode) && !hasIndependentHeight(parentRules)) return "父容器高度随内容变化，不能同时让子对象填满；请先确定父容器高度";
  }
  if ((path === "width" && value === "fit") || (path === "height" && ["auto", "fit"].includes(value))) {
    const hasFillingChild = node.childIds.some((id) => {
      const child = definition.nodes[id];
      if (!child || child.hidden) return false;
      const childRules = resolveTemplateNodeRules(definition, id, breakpoint);
      if (childRules.hidden || childRules.display === "none" || childRules.anchor) return false;
      return path === "width" ? childRules.width === "fill" : childRules.height.mode === "fill";
    });
    if (hasFillingChild && rules.layoutMode !== "free" && (path === "width" || !(rules.minHeight && rules.minHeight.value > 0 && rules.minHeight.unit !== "%"))) return "存在同轴填满空间的子对象，请先修改子对象尺寸方式";
  }
  return undefined;
}

export function getTemplatePropertySystemValue(path: string, slot: boolean): unknown {
  if (slot && path in TEMPLATE_MEDIA_DEFAULTS) return TEMPLATE_MEDIA_DEFAULTS[path as keyof typeof TEMPLATE_MEDIA_DEFAULTS];
  if (slot && path === "overflow") return TEMPLATE_TEXT_DEFAULTS.overflow;
  if (!slot && path === "wrap") return "nowrap";
  return undefined;
}

export function describeTemplateEffectiveValue(value: unknown, path: string, rules: DynamicTemplateResponsiveRules, slot: boolean, slotRules?: DynamicTemplateSlotRules): string {
  if (value !== undefined) {
    if (value && typeof value === "object" && "value" in value && "unit" in value) return `${value.value}${value.unit}`;
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  const system = getTemplatePropertySystemValue(path, slot);
  if (system !== undefined) return `${system}（系统行为）`;
  if (slot) {
    if (["fontSize", "fontWeight", "lineHeight", "textAlign", "fontRole"].includes(path)) return "继承页面字体样式（以实际文字渲染为准）";
    if (path === "maxLines") return slotRules?.overflow === "ellipsis" ? "单行省略" : "不限制行数";
  }
  if (path === "overflow") return rules.height.mode === "auto" && slotRules?.aspectRatio ? "hidden（图片比例裁剪）" : "visible（浏览器默认）";
  if (path === "minWidth") return "0px（Renderer 默认）";
  if (["maxWidth", "maxHeight"].includes(path)) return "不限制";
  if (["gap", "radius"].includes(path) || path.startsWith("padding.") || path.startsWith("margin.")) return "0px（未设置）";
  if (path === "backgroundToken") return "透明";
  if (path === "borderToken") return "无边框";
  return "由内容或浏览器布局决定";
}
