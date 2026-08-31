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
