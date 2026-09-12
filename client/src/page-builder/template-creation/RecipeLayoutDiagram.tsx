import type { TemplateDefinitionV2 } from "../template-definition/generated/templateDefinition.generated";

type DiagramRect = { x: number; y: number; width: number; height: number };
type DiagramRegion = DiagramRect & {
  nodeId: string;
  kind: "image" | "logo" | "background" | "content" | "card";
  contentCount: number;
};

/** 只提取创建生成器已有的桌面矩形；内容流使用其真实父区域，不模拟浏览器文字排版。 */
export function getRecipeLayoutDiagramRegions(definition: TemplateDefinitionV2): DiagramRegion[] {
  const canvas = definition.metadata.canvasSize;
  if (!canvas) return [];
  const regions: DiagramRegion[] = [];
  const visited = new Set<string>();
  const visit = (nodeId: string, parent: DiagramRect) => {
    const node = definition.nodes[nodeId];
    if (!node || visited.has(nodeId)) return;
    visited.add(nodeId);
    const rules = node.responsive.desktop;
    if (rules.hidden || rules.display === "none") return;
    const placement = rules.placement;
    const rect = placement ? {
      x: parent.x + placement.x * parent.width,
      y: parent.y + placement.y * parent.height,
      width: placement.width * parent.width,
      height: placement.height * parent.height,
    } : parent;
    const slot = node.slotId ? definition.slots[node.slotId] : undefined;
    if (slot) {
      if (!placement) return;
      const kind = slot.type !== "image" ? "content"
        : slot.semanticRole === "logo" ? "logo"
          : slot.semanticRole === "backgroundImage" ? "background" : "image";
      regions.push({ ...rect, nodeId, kind, contentCount: 1 });
      return;
    }
    const flowContent = node.childIds.filter((id) => {
      const child = definition.nodes[id];
      return child?.slotId && definition.slots[child.slotId]?.type !== "image"
        && !child.responsive.desktop.placement && !child.responsive.desktop.hidden
        && child.responsive.desktop.display !== "none";
    });
    if (placement && flowContent.length) {
      regions.push({ ...rect, nodeId, kind: "content", contentCount: flowContent.length });
    } else if (placement && rules.backgroundColor) {
      regions.push({ ...rect, nodeId, kind: "card", contentCount: 0 });
    }
    node.childIds.forEach((id) => visit(id, rect));
  };
  visit(definition.rootNodeId, { x: 0, y: 0, width: canvas.width, height: canvas.height });
  const paintOrder = { background: 0, card: 1, image: 2, content: 3, logo: 4 };
  return regions.sort((a, b) => paintOrder[a.kind] - paintOrder[b.kind]);
}

/** 线框与效果预览读取同一生成定义；短线表达内容区域，不声称复刻最终文案换行。 */
export function RecipeLayoutDiagram({ definition }: { definition: TemplateDefinitionV2 }) {
  const canvas = definition.metadata.canvasSize;
  if (!canvas) return null;
  const unit = Math.min(canvas.width, canvas.height) / 110;
  const regions = getRecipeLayoutDiagramRegions(definition);
  return <svg
    aria-hidden="true"
    focusable="false"
    data-recipe-layout-diagram="true"
    data-canvas-width={canvas.width}
    data-canvas-height={canvas.height}
    viewBox={`0 0 ${canvas.width} ${canvas.height}`}
    preserveAspectRatio="xMidYMid meet"
    style={{ display: "block", width: "100%", height: 110, maxHeight: 110 }}
  >
    <rect x={unit / 2} y={unit / 2} width={canvas.width - unit} height={canvas.height - unit} fill="white" stroke="#B8BEC1" strokeWidth={unit} />
    {regions.map((region) => {
      const { x, y, width, height, kind, nodeId } = region;
      if (width <= 0 || height <= 0) return null;
      if (kind === "content") {
        const count = Math.min(5, Math.max(2, region.contentCount));
        const lineHeight = Math.min(height / (count * 2 + 1), unit * 3);
        const gap = lineHeight * 1.4;
        const startY = y + (height - count * lineHeight - (count - 1) * gap) / 2;
        return <g key={nodeId} data-diagram-node-id={nodeId} data-diagram-kind={kind}>
          <rect x={x} y={y} width={width} height={height} fill="white" />
          {Array.from({ length: count }, (_, index) => <rect key={index}
            x={x + width * .08} y={startY + index * (lineHeight + gap)}
            width={width * (index === 0 ? .68 : index === count - 1 ? .45 : .8)}
            height={index === 0 ? lineHeight : lineHeight * .65}
            rx={lineHeight / 4} fill={index === 0 ? "#6E7477" : "#B8BEC1"} />)}
        </g>;
      }
      return <g key={nodeId} data-diagram-node-id={nodeId} data-diagram-kind={kind}>
        <rect x={x} y={y} width={width} height={height}
          fill={kind === "background" ? "#F4F5F5" : kind === "card" ? "#FFFFFF" : "#F7F8F8"}
          stroke="#B8BEC1" strokeWidth={unit} rx={unit} />
        {kind === "logo" ? <text x={x + width / 2} y={y + height / 2}
          dominantBaseline="central" textAnchor="middle" fill="#6E7477"
          fontSize={Math.min(width / 3, height / 2)}>L</text>
          : kind !== "card" && <polyline
            points={`${x + width * .12},${y + height * .76} ${x + width * .36},${y + height * .45} ${x + width * .55},${y + height * .63} ${x + width * .84},${y + height * .25}`}
            fill="none" stroke="#B8BEC1" strokeWidth={unit} strokeLinejoin="round" />}
      </g>;
    })}
  </svg>;
}
