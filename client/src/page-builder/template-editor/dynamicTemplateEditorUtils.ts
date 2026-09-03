import {
  canNestDynamicTemplateNode,
  type TemplateDefinitionV2,
  type DynamicTemplateNodeType,
} from "../template-definition";

export function findDynamicTemplateParentId(
  definition: TemplateDefinitionV2,
  nodeId: string,
): string | null {
  for (const node of Object.values(definition.nodes)) {
    if (node.childIds.includes(nodeId)) return node.nodeId;
  }
  return null;
}

export function collectDynamicTemplateSubtreeIds(
  definition: TemplateDefinitionV2,
  nodeId: string,
  result = new Set<string>(),
): Set<string> {
  if (result.has(nodeId)) return result;
  result.add(nodeId);
  for (const childId of definition.nodes[nodeId]?.childIds ?? []) {
    collectDynamicTemplateSubtreeIds(definition, childId, result);
  }
  return result;
}

export function findDynamicTemplateInsertionParentId(
  definition: TemplateDefinitionV2,
  selectedNodeId: string | null,
  childType: DynamicTemplateNodeType,
): string | null {
  let candidateId = selectedNodeId ?? definition.rootNodeId;
  while (candidateId) {
    const candidate = definition.nodes[candidateId];
    if (candidate && canNestDynamicTemplateNode(candidate.type, childType)) return candidateId;
    candidateId = findDynamicTemplateParentId(definition, candidateId) ?? "";
  }
  const root = definition.nodes[definition.rootNodeId];
  return root && canNestDynamicTemplateNode(root.type, childType) ? root.nodeId : null;
}

export function getDynamicTemplateRegionDisplayName(
  definition: TemplateDefinitionV2,
  nodeId: string,
  semanticLabel?: string,
): string {
  const node = definition.nodes[nodeId];
  const root = definition.nodes[definition.rootNodeId];
  const regionIndex = Math.max(0, root?.childIds.indexOf(nodeId) ?? 0);
  const fallback = `内容区域 ${regionIndex + 1}`;
  const source = node?.name.trim() ?? "";
  const numberedRegion = source.match(/^内容区域\s*0*(\d+)(?:区)?$/);
  const semanticRegion = semanticLabel
    ? /(?:区|区域)$/.test(semanticLabel)
      ? semanticLabel
      : `${semanticLabel.replace(/(?:内容)?容器$/, "")}区域`
    : undefined;

  if (numberedRegion) return `内容区域 ${Number(numberedRegion[1])}`;
  if (source === "响应式内容容器" || source === "响应式区") return "响应式区域";
  if (!source || source === "区" || source === "容器" || source === "Container" || source === "模板根节点") {
    return semanticRegion ?? fallback;
  }
  if (source === "内容容器") {
    return semanticRegion ?? fallback;
  }
  return source;
}

export function getDynamicTemplateAllowedParentIds(
  definition: TemplateDefinitionV2,
  nodeId: string,
): string[] {
  const node = definition.nodes[nodeId];
  if (!node) return [];
  const subtree = collectDynamicTemplateSubtreeIds(definition, nodeId);
  return Object.values(definition.nodes)
    .filter((candidate) => (
      !subtree.has(candidate.nodeId)
      && canNestDynamicTemplateNode(candidate.type, node.type)
    ))
    .map((candidate) => candidate.nodeId);
}

export function parseCommaSeparatedValues(value: string): string[] {
  return [...new Set(value.split(/[,，]/).map((item) => item.trim()).filter(Boolean))];
}
