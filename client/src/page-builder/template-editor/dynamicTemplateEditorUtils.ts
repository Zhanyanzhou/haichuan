import {
  canNestDynamicTemplateNode,
  type TemplateDefinitionV2,
  type DynamicTemplateNodeType,
} from "../template-definition";

const DYNAMIC_TEMPLATE_COMPATIBILITY_CONTENT_FIELDS = [
  "defaultContent",
  "previewContent",
] as const;

type DynamicTemplateCompatibilityContentField =
  (typeof DYNAMIC_TEMPLATE_COMPATIBILITY_CONTENT_FIELDS)[number];

function getDynamicTemplateCompatibilityContentFields(
  definition: TemplateDefinitionV2,
): DynamicTemplateCompatibilityContentField[] {
  return DYNAMIC_TEMPLATE_COMPATIBILITY_CONTENT_FIELDS.filter(
    (field) => Object.keys(definition[field] ?? {}).length > 0,
  );
}

export function hasDynamicTemplateCompatibilityState(
  definition: TemplateDefinitionV2,
): boolean {
  return getDynamicTemplateCompatibilityContentFields(definition).length > 0
    || Object.values(definition.slots).some((slot) => slot.emptyPolicy === "use-default");
}

export function clearDynamicTemplateCompatibilityContent(
  definition: TemplateDefinitionV2,
): TemplateDefinitionV2 {
  const next = structuredClone(definition);
  next.defaultContent = {};
  next.previewContent = {};
  for (const slot of Object.values(next.slots)) {
    if (slot.emptyPolicy === "use-default") slot.emptyPolicy = "hide";
  }
  return next;
}

export function prepareDynamicTemplateDefinitionForNewIdentity(
  definition: TemplateDefinitionV2,
  templateId: string,
): TemplateDefinitionV2 {
  const next = clearDynamicTemplateCompatibilityContent(definition);
  next.templateId = templateId;
  return next;
}

export function prepareHistoricalTemplateDefinitionForCurrentDraft(
  historical: TemplateDefinitionV2,
  current: TemplateDefinitionV2,
): TemplateDefinitionV2 {
  const next = structuredClone(historical);
  next.templateId = current.templateId;
  next.defaultContent = structuredClone(current.defaultContent);
  next.previewContent = structuredClone(current.previewContent);
  for (const slot of Object.values(next.slots)) {
    if (
      slot.emptyPolicy === "use-default"
      && current.slots[slot.slotId]?.emptyPolicy !== "use-default"
    ) {
      slot.emptyPolicy = "hide";
    }
  }
  return next;
}

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

export function describeDynamicTemplateRemoval(definition: TemplateDefinitionV2, nodeId: string): string {
  const ids = [...collectDynamicTemplateSubtreeIds(definition, nodeId)];
  const slots = ids.flatMap((id) => {
    const slotId = definition.nodes[id]?.slotId;
    return slotId && definition.slots[slotId] ? [definition.slots[slotId]] : [];
  });
  const required = slots.filter((slot) => slot.required).length;
  return `将删除 ${ids.length} 个节点，包含 ${slots.length} 个内容槽位${required ? `（${required} 个必填槽位，受现有结构保护规则约束）` : ""}。该操作只修改当前未保存草稿，可使用撤销完整恢复。`;
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

export function parseCommaSeparatedValues(
  value: string,
  limits?: { maxItems?: number; maxItemLength?: number },
): string[] {
  const maxItems = Math.max(0, limits?.maxItems ?? Number.POSITIVE_INFINITY);
  const maxItemLength = Math.max(0, limits?.maxItemLength ?? Number.POSITIVE_INFINITY);
  const normalized = value
    .split(/[,，]/)
    .map((item) => item.trim().slice(0, maxItemLength))
    .filter(Boolean);
  return [...new Set(normalized)].slice(0, maxItems);
}
