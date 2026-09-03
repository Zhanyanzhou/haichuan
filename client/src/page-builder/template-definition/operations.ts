import {
  getDynamicTemplateNodeRegistryEntry,
  type TemplateDefinitionV2,
  type DynamicTemplateDevice,
  type DynamicTemplateNode,
  type DynamicTemplateNodeType,
  type DynamicTemplateResponsiveRules,
  type DynamicTemplateSlotDefinition,
} from "./generated/templateDefinition.generated";
import {
  canNestDynamicTemplateNode,
  createDynamicTemplateNode,
  createDynamicTemplateSlotDefinition,
} from "./nodeRegistry";
import {
  getDynamicTemplateStructureLockOwnerId,
  getDynamicTemplateStructureLockViolation,
  isDynamicTemplateStructureLocked,
  validateDynamicTemplateDefinition,
} from "./validateTemplateDefinition";

export class DynamicTemplateOperationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DynamicTemplateOperationError";
  }
}

function cloneDefinition(definition: TemplateDefinitionV2): TemplateDefinitionV2 {
  return structuredClone(definition);
}

function findParentId(definition: TemplateDefinitionV2, nodeId: string): string | null {
  for (const node of Object.values(definition.nodes)) {
    if (node.childIds.includes(nodeId)) return node.nodeId;
  }
  return null;
}

export function setDynamicTemplateNodeStructureLocked(
  definition: TemplateDefinitionV2,
  nodeId: string,
  structureLocked: boolean,
): TemplateDefinitionV2 {
  if (!definition.nodes[nodeId]) {
    throw new DynamicTemplateOperationError("NODE_NOT_FOUND", "要锁定的节点不存在。");
  }
  const next = cloneDefinition(definition);
  if (structureLocked) {
    next.nodes[nodeId].authoring = { structureLocked: true };
  } else {
    delete next.nodes[nodeId].authoring;
  }
  assertValidOperationResult(next, definition);
  return next;
}

function assertDynamicTemplateStructureLocksPreserved(
  previous: TemplateDefinitionV2,
  next: TemplateDefinitionV2,
) {
  const violation = getDynamicTemplateStructureLockViolation(previous, next);
  if (violation) {
    throw new DynamicTemplateOperationError("STRUCTURE_LOCKED", violation);
  }
}

function collectSubtreeNodeIds(
  definition: TemplateDefinitionV2,
  nodeId: string,
  result = new Set<string>(),
): Set<string> {
  if (result.has(nodeId)) return result;
  result.add(nodeId);
  for (const childId of definition.nodes[nodeId]?.childIds ?? []) {
    collectSubtreeNodeIds(definition, childId, result);
  }
  return result;
}

function toSlotKeyBase(type: DynamicTemplateNodeType): string {
  const raw = type.endsWith("Slot") ? type.slice(0, -4) : type;
  return raw.charAt(0).toLowerCase() + raw.slice(1);
}

function createUniqueSlotKey(definition: TemplateDefinitionV2, type: DynamicTemplateNodeType): string {
  const base = toSlotKeyBase(type);
  const used = new Set(Object.values(definition.slots).map((slot) => slot.key));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}

function updateSlotSummary(definition: TemplateDefinitionV2) {
  const counts = new Map<string, number>();
  for (const slot of Object.values(definition.slots)) {
    const label = {
      image: "图片",
      heading: "标题",
      text: "文字",
      richText: "富文本",
      button: "按钮",
      link: "链接",
      badge: "徽标",
      icon: "图标",
      product: "商品",
      collection: "集合",
      video: "视频",
      carousel: "轮播",
      hotspot: "热区",
      beforeAfter: "前后对比",
      appointment: "预约入口",
      productCard: "单品展示",
      productCollection: "商品集合",
      categoryCollection: "分类集合",
      heroTemplate: "首屏主视觉",
      fullBleedTemplate: "全屏出血图",
      singlePosterTemplate: "单图海报",
      doublePosterTemplate: "双图海报",
      textBannerTemplate: "文字横幅",
      journeyTemplate: "定制流程",
      galleryTemplate: "作品画廊",
      lookbookTemplate: "佩戴灵感",
      sceneShoppingTemplate: "场景选购",
      brandPointsTemplate: "品牌要点",
      servicePromisesTemplate: "服务承诺",
      certificatesTemplate: "资质证书",
      storeInfoTemplate: "门店信息",
      testimonialsTemplate: "评价实拍",
      limitedEventTemplate: "限时活动",
      craftDetailsTemplate: "工艺细节",
    }[slot.type];
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  definition.metadata.slotSummary = counts.size
    ? [...counts.entries()].map(([label, count]) => `${count} 个${label}槽位`).join("，")
    : "暂无内容槽位";
}

function assertValidOperationResult(
  definition: TemplateDefinitionV2,
  previous?: TemplateDefinitionV2,
) {
  if (previous) assertDynamicTemplateStructureLocksPreserved(previous, definition);
  const result = validateDynamicTemplateDefinition(definition);
  const firstError = result.issues.find((issue) => issue.level === "error");
  if (firstError) {
    throw new DynamicTemplateOperationError(
      "INVALID_OPERATION_RESULT",
      `操作生成了非法模板：${firstError.message}`,
    );
  }
}

function syncPlacementForParent(
  definition: TemplateDefinitionV2,
  nodeId: string,
  parentId: string,
  index: number,
) {
  const parent = definition.nodes[parentId];
  const child = definition.nodes[nodeId];
  if (!parent || !child) return;
  for (const device of ["desktop", "mobile"] as const) {
    const parentIsFree = parent.type === "Stack" && parent.responsive[device].layoutMode === "free";
    if (!parentIsFree) {
      delete child.responsive[device].placement;
      continue;
    }
    child.responsive[device].placement ??= {
      x: Math.min(0.7, 0.04 * index),
      y: Math.min(0.7, 0.04 * index),
      width: 0.5,
      height: 0.5,
      zIndex: Math.min(10, index),
    };
  }
}

export function addDynamicTemplateNode(
  definition: TemplateDefinitionV2,
  parentId: string,
  type: DynamicTemplateNodeType,
  index?: number,
): { definition: TemplateDefinitionV2; nodeId: string; slotId?: string } {
  const parent = definition.nodes[parentId];
  if (!parent) throw new DynamicTemplateOperationError("PARENT_NOT_FOUND", "目标父节点不存在。");
  if (!canNestDynamicTemplateNode(parent.type, type)) {
    throw new DynamicTemplateOperationError(
      "ILLEGAL_NESTING",
      `${getDynamicTemplateNodeRegistryEntry(type).label}不能放入${getDynamicTemplateNodeRegistryEntry(parent.type).label}。`,
    );
  }
  const next = cloneDefinition(definition);
  const registry = getDynamicTemplateNodeRegistryEntry(type);
  let slot: DynamicTemplateSlotDefinition | undefined;
  if (registry.kind === "slot" && registry.slotType) {
    slot = createDynamicTemplateSlotDefinition(
      registry.slotType,
      registry.label,
      createUniqueSlotKey(next, type),
    );
  }
  const node = createDynamicTemplateNode(type, registry.label, slot?.slotId);
  next.nodes[node.nodeId] = node;
  if (slot) next.slots[slot.slotId] = slot;
  const childIds = next.nodes[parentId].childIds;
  const targetIndex = index === undefined
    ? childIds.length
    : Math.max(0, Math.min(Math.trunc(index), childIds.length));
  childIds.splice(targetIndex, 0, node.nodeId);
  syncPlacementForParent(next, node.nodeId, parentId, targetIndex);
  updateSlotSummary(next);
  assertValidOperationResult(next, definition);
  return { definition: next, nodeId: node.nodeId, ...(slot ? { slotId: slot.slotId } : {}) };
}

export function renameDynamicTemplateNode(
  definition: TemplateDefinitionV2,
  nodeId: string,
  name: string,
): TemplateDefinitionV2 {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) {
    throw new DynamicTemplateOperationError("INVALID_NODE_NAME", "节点名称必须为 1–100 个字符。");
  }
  if (!definition.nodes[nodeId]) {
    throw new DynamicTemplateOperationError("NODE_NOT_FOUND", "要重命名的节点不存在。");
  }
  const next = cloneDefinition(definition);
  next.nodes[nodeId].name = trimmed;
  assertDynamicTemplateStructureLocksPreserved(definition, next);
  return next;
}

export function setDynamicTemplateNodeHidden(
  definition: TemplateDefinitionV2,
  nodeId: string,
  hidden: boolean,
): TemplateDefinitionV2 {
  if (nodeId === definition.rootNodeId) {
    throw new DynamicTemplateOperationError("ROOT_CANNOT_HIDE", "模板根节点不能隐藏。");
  }
  if (!definition.nodes[nodeId]) {
    throw new DynamicTemplateOperationError("NODE_NOT_FOUND", "要隐藏的节点不存在。");
  }
  const next = cloneDefinition(definition);
  next.nodes[nodeId].hidden = hidden;
  assertDynamicTemplateStructureLocksPreserved(definition, next);
  return next;
}

export function updateDynamicTemplateNodeRules(
  definition: TemplateDefinitionV2,
  nodeId: string,
  device: DynamicTemplateDevice,
  update: (rules: DynamicTemplateResponsiveRules) => void,
): TemplateDefinitionV2 {
  if (!definition.nodes[nodeId]) {
    throw new DynamicTemplateOperationError("NODE_NOT_FOUND", "要修改的节点不存在。");
  }
  const next = cloneDefinition(definition);
  update(next.nodes[nodeId].responsive[device]);
  assertValidOperationResult(next, definition);
  return next;
}

export function moveDynamicTemplateNode(
  definition: TemplateDefinitionV2,
  nodeId: string,
  nextParentId: string,
  index?: number,
): TemplateDefinitionV2 {
  if (nodeId === definition.rootNodeId) {
    throw new DynamicTemplateOperationError("ROOT_CANNOT_MOVE", "模板根节点不能移动。");
  }
  const node = definition.nodes[nodeId];
  const nextParent = definition.nodes[nextParentId];
  if (!node || !nextParent) {
    throw new DynamicTemplateOperationError("NODE_NOT_FOUND", "移动节点或目标父节点不存在。");
  }
  if (collectSubtreeNodeIds(definition, nodeId).has(nextParentId)) {
    throw new DynamicTemplateOperationError("MOVE_WOULD_CREATE_CYCLE", "不能把节点移动到自己的后代节点中。");
  }
  if (!canNestDynamicTemplateNode(nextParent.type, node.type)) {
    throw new DynamicTemplateOperationError("ILLEGAL_NESTING", "目标父节点不接受此节点类型。");
  }
  const currentParentId = findParentId(definition, nodeId);
  if (!currentParentId) throw new DynamicTemplateOperationError("ORPHAN_NODE", "节点没有可用父节点。");
  const next = cloneDefinition(definition);
  next.nodes[currentParentId].childIds = next.nodes[currentParentId].childIds.filter((id) => id !== nodeId);
  const targetChildren = next.nodes[nextParentId].childIds;
  const targetIndex = index === undefined
    ? targetChildren.length
    : Math.max(0, Math.min(Math.trunc(index), targetChildren.length));
  targetChildren.splice(targetIndex, 0, nodeId);
  syncPlacementForParent(next, nodeId, nextParentId, targetIndex);
  assertValidOperationResult(next, definition);
  return next;
}

export function reorderDynamicTemplateNode(
  definition: TemplateDefinitionV2,
  nodeId: string,
  nextIndex: number,
): TemplateDefinitionV2 {
  const parentId = findParentId(definition, nodeId);
  if (!parentId) throw new DynamicTemplateOperationError("ROOT_CANNOT_REORDER", "根节点不能进行同级排序。");
  const next = cloneDefinition(definition);
  const childIds = next.nodes[parentId].childIds;
  const currentIndex = childIds.indexOf(nodeId);
  if (currentIndex < 0) throw new DynamicTemplateOperationError("NODE_NOT_FOUND", "排序节点不存在。");
  childIds.splice(currentIndex, 1);
  childIds.splice(Math.max(0, Math.min(Math.trunc(nextIndex), childIds.length)), 0, nodeId);
  assertDynamicTemplateStructureLocksPreserved(definition, next);
  return next;
}

export function removeDynamicTemplateNode(
  definition: TemplateDefinitionV2,
  nodeId: string,
): TemplateDefinitionV2 {
  if (nodeId === definition.rootNodeId) {
    throw new DynamicTemplateOperationError("ROOT_CANNOT_DELETE", "模板根节点不能删除。");
  }
  const parentId = findParentId(definition, nodeId);
  if (!definition.nodes[nodeId] || !parentId) {
    throw new DynamicTemplateOperationError("NODE_NOT_FOUND", "要删除的节点不存在或没有父节点。");
  }
  const next = cloneDefinition(definition);
  const subtree = collectSubtreeNodeIds(next, nodeId);
  next.nodes[parentId].childIds = next.nodes[parentId].childIds.filter((id) => id !== nodeId);
  for (const childId of subtree) {
    const slotId = next.nodes[childId]?.slotId;
    if (slotId) {
      delete next.slots[slotId];
      delete next.defaultContent[slotId];
      if (next.previewContent) delete next.previewContent[slotId];
    }
    delete next.nodes[childId];
  }
  updateSlotSummary(next);
  assertValidOperationResult(next, definition);
  return next;
}

export function duplicateDynamicTemplateNode(
  definition: TemplateDefinitionV2,
  nodeId: string,
): { definition: TemplateDefinitionV2; nodeId: string } {
  if (nodeId === definition.rootNodeId) {
    throw new DynamicTemplateOperationError("ROOT_CANNOT_DUPLICATE", "模板根节点不能复制。");
  }
  const parentId = findParentId(definition, nodeId);
  if (!definition.nodes[nodeId] || !parentId) {
    throw new DynamicTemplateOperationError("NODE_NOT_FOUND", "要复制的节点不存在或没有父节点。");
  }
  const lockOwnerId = getDynamicTemplateStructureLockOwnerId(definition, nodeId);
  if (lockOwnerId) {
    throw new DynamicTemplateOperationError(
      "STRUCTURE_LOCKED",
      `“${definition.nodes[lockOwnerId].name}”已锁定，请先解除锁定。`,
    );
  }
  const next = cloneDefinition(definition);
  const sourceIds = [...collectSubtreeNodeIds(next, nodeId)];
  const nodeIdMap = new Map<string, string>();
  const slotIdMap = new Map<string, string>();

  for (const sourceId of sourceIds) {
    const sourceNode = next.nodes[sourceId];
    const clonedNode = createDynamicTemplateNode(sourceNode.type, `${sourceNode.name} 副本`);
    nodeIdMap.set(sourceId, clonedNode.nodeId);
    if (sourceNode.slotId) {
      const sourceSlot = next.slots[sourceNode.slotId];
      const clonedSlot = createDynamicTemplateSlotDefinition(
        sourceSlot.type,
        `${sourceSlot.label} 副本`,
        createUniqueSlotKey(next, sourceNode.type),
      );
      slotIdMap.set(sourceNode.slotId, clonedSlot.slotId);
      next.slots[clonedSlot.slotId] = {
        ...structuredClone(sourceSlot),
        slotId: clonedSlot.slotId,
        key: clonedSlot.key,
        label: clonedSlot.label,
      };
      if (next.slots[clonedSlot.slotId].emptyPolicy === "use-default") {
        next.slots[clonedSlot.slotId].emptyPolicy = "hide";
      }
    }
  }

  for (const sourceId of sourceIds) {
    const sourceNode = next.nodes[sourceId];
    const clonedId = nodeIdMap.get(sourceId)!;
    next.nodes[clonedId] = {
      ...structuredClone(sourceNode),
      nodeId: clonedId,
      name: `${sourceNode.name} 副本`,
      ...(sourceNode.slotId ? { slotId: slotIdMap.get(sourceNode.slotId)! } : {}),
      childIds: sourceNode.childIds.map((childId) => nodeIdMap.get(childId)!),
    };
  }

  const clonedRootId = nodeIdMap.get(nodeId)!;
  const siblings = next.nodes[parentId].childIds;
  siblings.splice(siblings.indexOf(nodeId) + 1, 0, clonedRootId);
  updateSlotSummary(next);
  assertValidOperationResult(next, definition);
  return { definition: next, nodeId: clonedRootId };
}
