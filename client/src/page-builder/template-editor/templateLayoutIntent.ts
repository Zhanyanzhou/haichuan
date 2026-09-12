import type { DynamicTemplateDefinitionCommand } from "../template-definition/operations";
import type { DynamicTemplatePlacement, TemplateBreakpoint, TemplateDefinitionV2 } from "../template-definition";
import { resolveTemplateNodeRules, setTemplateNodeRule } from "../template-definition/responsive";

export function createTemplateColumnResizeCommand(definition: TemplateDefinitionV2, nodeId: string, breakpoint: TemplateBreakpoint, boundaryIndex: number, deltaPx: number, availableWidth: number): DynamicTemplateDefinitionCommand {
  const rules = resolveTemplateNodeRules(definition, nodeId, breakpoint);
  const columns = [...(rules.columns ?? [])];
  if (rules.display !== "grid" || boundaryIndex < 0 || boundaryIndex >= columns.length - 1 || !Number.isFinite(deltaPx) || !Number.isFinite(availableWidth) || availableWidth <= 0) throw new Error("请在有实际宽度的网格列分隔线上调整比例。");
  const sum = columns.reduce((total, value) => total + value, 0);
  const pair = columns[boundaryIndex] + columns[boundaryIndex + 1];
  const minimum = Math.min(pair / 4, sum * 0.01);
  const left = Math.max(minimum, Math.min(pair - minimum, columns[boundaryIndex] + deltaPx / availableWidth * sum));
  columns[boundaryIndex] = left;
  columns[boundaryIndex + 1] = pair - left;
  return { type: "update-definition", label: "调整网格列比例", update: (next) => setTemplateNodeRule(next, nodeId, breakpoint, "columns", columns) };
}

/** 只测量聚焦画布的实际内容框；隐藏、越界或未呈现子项不能猜测位置。 */
export function measureTemplateContainerLayout(definition: TemplateDefinitionV2, nodeId: string, breakpoint: TemplateBreakpoint) {
  const documents = [document, ...Array.from(document.querySelectorAll("iframe")).flatMap((frame) => {
    try { return frame.contentDocument ? [frame.contentDocument] : []; } catch { return []; }
  })];
  for (const surface of documents) {
    const focus = surface.querySelector<HTMLElement>(`[data-canvas-focus-breakpoint="${breakpoint}"]`);
    const parent = focus?.querySelector<HTMLElement>(`[data-template-node-id="${CSS.escape(nodeId)}"]`);
    if (!parent || !parent.getClientRects().length || !parent.offsetWidth || !parent.offsetHeight) continue;
    const bounds = parent.getBoundingClientRect();
    const scaleX = bounds.width / parent.offsetWidth;
    const scaleY = bounds.height / parent.offsetHeight;
    const style = surface.defaultView!.getComputedStyle(parent);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const width = parent.clientWidth - paddingLeft - (parseFloat(style.paddingRight) || 0);
    const height = parent.clientHeight - paddingTop - (parseFloat(style.paddingBottom) || 0);
    if (width <= 0 || height <= 0) throw new Error("容器当前内容框没有可测量尺寸，请先设置高度并显示容器。");
    const placements: Record<string, DynamicTemplatePlacement> = {};
    for (const [index, childId] of definition.nodes[nodeId].childIds.entries()) {
      const child = parent.querySelector<HTMLElement>(`[data-template-node-id="${CSS.escape(childId)}"]`);
      if (!child || !child.getClientRects().length) throw new Error("存在隐藏或尚未呈现的子对象；请先显示全部直接子对象，再转换自由排列。");
      const rect = child.getBoundingClientRect();
      const x = ((rect.left - bounds.left) / scaleX - parent.clientLeft - paddingLeft) / width;
      const y = ((rect.top - bounds.top) / scaleY - parent.clientTop - paddingTop) / height;
      const w = rect.width / scaleX / width;
      const h = rect.height / scaleY / height;
      if (![x, y, w, h].every(Number.isFinite) || x < -0.001 || y < -0.001 || x + w > 1.001 || y + h > 1.001 || w <= 0 || h <= 0) throw new Error("存在越出内容框或尺寸为零的子对象；请先调整容器尺寸，转换不会自动裁掉对象。");
      placements[childId] = { x: Math.max(0, x), y: Math.max(0, y), width: Math.min(w, 1 - Math.max(0, x)), height: Math.min(h, 1 - Math.max(0, y)), zIndex: resolveTemplateNodeRules(definition, childId, breakpoint).placement?.zIndex ?? index };
    }
    return { placements, height: { mode: "fixed" as const, value: { value: parent.offsetHeight, unit: "px" as const } } };
  }
  throw new Error("当前聚焦画布未呈现此容器，请先聚焦断点并显示容器，不能用其他视口代替测量。");
}
