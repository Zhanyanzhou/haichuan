import type {
  TemplateDefinitionV2,
  DynamicTemplateSlotDefinition,
} from "../template-definition";
import type { DynamicTemplateInstanceProps } from "./types";

export interface DynamicTemplateUpgradeDiff {
  addedNodeIds: string[];
  removedNodeIds: string[];
  changedNodeIds: string[];
  addedSlotIds: string[];
  removedSlotIds: string[];
  changedSlotIds: string[];
}

export interface DynamicTemplateUpgradeAnalysis {
  fromVersion: number;
  toVersion: number;
  diff: DynamicTemplateUpgradeDiff;
  preservedContentSlotIds: string[];
  discardedContentSlotIds: string[];
  preservedHiddenSlotIds: string[];
  blockers: string[];
  warnings: string[];
  nextProps: DynamicTemplateInstanceProps;
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function slotCompatible(
  current: DynamicTemplateSlotDefinition,
  target: DynamicTemplateSlotDefinition,
) {
  return current.type === target.type && target.editable;
}

function diffRecord<T>(current: Record<string, T>, target: Record<string, T>) {
  const currentIds = Object.keys(current);
  const targetIds = Object.keys(target);
  const currentSet = new Set(currentIds);
  const targetSet = new Set(targetIds);
  return {
    added: targetIds.filter((id) => !currentSet.has(id)),
    removed: currentIds.filter((id) => !targetSet.has(id)),
    changed: currentIds.filter((id) => targetSet.has(id) && !sameJson(current[id], target[id])),
  };
}

export function analyzeDynamicTemplateUpgrade(input: {
  currentDefinition: TemplateDefinitionV2;
  targetDefinition: TemplateDefinitionV2;
  targetVersion: number;
  instance: DynamicTemplateInstanceProps;
}): DynamicTemplateUpgradeAnalysis {
  const {
    currentDefinition,
    targetDefinition,
    targetVersion,
    instance,
  } = input;
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (currentDefinition.templateId !== instance.templateId
    || targetDefinition.templateId !== instance.templateId) {
    blockers.push("目标版本与当前页面实例不属于同一个 templateId。");
  }
  if (!Number.isInteger(targetVersion) || targetVersion <= instance.templateVersion) {
    blockers.push("目标版本必须高于页面当前锁定版本。");
  }

  const nodeDiff = diffRecord(currentDefinition.nodes, targetDefinition.nodes);
  const slotDiff = diffRecord(currentDefinition.slots, targetDefinition.slots);
  const currentContent = instance.contentBySlotId && typeof instance.contentBySlotId === "object"
    ? instance.contentBySlotId
    : {};
  const nextContent: Record<string, unknown> = {};
  const preservedContentSlotIds: string[] = [];
  const discardedContentSlotIds: string[] = [];
  for (const [slotId, value] of Object.entries(currentContent)) {
    const currentSlot = currentDefinition.slots[slotId];
    const targetSlot = targetDefinition.slots[slotId];
    if (currentSlot && targetSlot && slotCompatible(currentSlot, targetSlot)) {
      nextContent[slotId] = structuredClone(value);
      preservedContentSlotIds.push(slotId);
    } else {
      discardedContentSlotIds.push(slotId);
    }
  }
  if (discardedContentSlotIds.length > 0) {
    warnings.push(`升级会移除 ${discardedContentSlotIds.length} 个不再兼容的页面填写值。`);
  }

  const currentHidden = Array.isArray(instance.hiddenSlotIds) ? instance.hiddenSlotIds : [];
  const preservedHiddenSlotIds = currentHidden.filter((slotId) => {
    const slot = targetDefinition.slots[slotId];
    return Boolean(slot?.hideable && !slot.required);
  });
  if (preservedHiddenSlotIds.length !== currentHidden.length) {
    warnings.push("新版中不再允许隐藏的槽位会恢复显示。");
  }
  const currentLayoutOverrides = instance.layoutOverridesByNodeId ?? {};
  const nextLayoutOverrides = Object.fromEntries(
    Object.entries(currentLayoutOverrides).filter(([nodeId]) => {
      const node = targetDefinition.nodes[nodeId];
      return Boolean(node);
    }),
  );
  if (Object.keys(nextLayoutOverrides).length !== Object.keys(currentLayoutOverrides).length) {
    warnings.push("新版中未继续开放的实例构图调整会恢复模板默认值。");
  }

  for (const slotId of slotDiff.added) {
    const slot = targetDefinition.slots[slotId];
    if (slot.required) {
      blockers.push(`新版新增必填槽位“${slot.label}”，需先由当前页面填写真实内容后再升级。`);
    }
  }
  for (const slotId of slotDiff.changed) {
    const previous = currentDefinition.slots[slotId];
    const target = targetDefinition.slots[slotId];
    if (previous.type !== target.type && Object.prototype.hasOwnProperty.call(currentContent, slotId)) {
      warnings.push(`槽位“${target.label}”类型已从 ${previous.type} 改为 ${target.type}，原页面值不会带入。`);
    }
  }

  return {
    fromVersion: instance.templateVersion,
    toVersion: targetVersion,
    diff: {
      addedNodeIds: nodeDiff.added,
      removedNodeIds: nodeDiff.removed,
      changedNodeIds: nodeDiff.changed,
      addedSlotIds: slotDiff.added,
      removedSlotIds: slotDiff.removed,
      changedSlotIds: slotDiff.changed,
    },
    preservedContentSlotIds,
    discardedContentSlotIds,
    preservedHiddenSlotIds,
    blockers,
    warnings,
    nextProps: {
      ...instance,
      templateVersion: targetVersion,
      moduleName: targetDefinition.name,
      contentBySlotId: nextContent,
      hiddenSlotIds: preservedHiddenSlotIds,
      layoutOverridesByNodeId: nextLayoutOverrides,
    },
  };
}
