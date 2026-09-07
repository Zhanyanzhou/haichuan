import {
  getEffectiveDynamicTemplateInstanceEditPolicy,
  validateDynamicTemplateDefinition,
  type TemplateDefinitionV2,
  type DynamicTemplateSlotDefinition,
  type TemplateInstanceLayoutOverride,
} from "../template-definition";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  dynamicTemplateVersionKey,
  readResolvedDynamicTemplateDefinitions,
  type DynamicTemplateInstanceProps,
  type ResolvedDynamicTemplateDefinition,
  type ResolvedDynamicTemplateDefinitionMap,
} from "./types";

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
  pendingRequiredSlots: DynamicTemplatePendingRequiredSlot[];
  preservedChanges: DynamicTemplatePreservedChange[];
  destructiveBlockers: DynamicTemplateDestructiveBlocker[];
  blockers: string[];
  warnings: string[];
  nextProps: DynamicTemplateInstanceProps;
}

export interface DynamicTemplatePendingRequiredSlot {
  slotId: string;
  label: string;
  nodeId?: string;
}

export interface DynamicTemplatePreservedChange {
  kind: "content" | "hidden" | "layout";
  key: string;
  label: string;
  device?: "desktop" | "mobile";
}

export interface DynamicTemplateDestructiveBlocker {
  kind: "content" | "hidden" | "layout";
  reason: string;
  slotId?: string;
  nodeId?: string;
  device?: "desktop" | "mobile";
  field?: keyof TemplateInstanceLayoutOverride;
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

function hasMeaningfulContent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasMeaningfulContent);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasMeaningfulContent);
  }
  return true;
}

function findSlotNodeId(definition: TemplateDefinitionV2, slotId: string) {
  return Object.values(definition.nodes).find((node) => node.slotId === slotId)?.nodeId;
}

function validateLayoutOverride(input: {
  definition: TemplateDefinitionV2;
  nodeId: string;
  device: "desktop" | "mobile";
  override: TemplateInstanceLayoutOverride;
}): DynamicTemplateDestructiveBlocker[] {
  const { definition, nodeId, device, override } = input;
  const node = definition.nodes[nodeId];
  const slot = node?.slotId ? definition.slots[node.slotId] : undefined;
  const policy = node ? getEffectiveDynamicTemplateInstanceEditPolicy(node, slot) : null;
  const blockers: DynamicTemplateDestructiveBlocker[] = [];
  const add = (field: keyof TemplateInstanceLayoutOverride, reason: string) => blockers.push({
    kind: "layout",
    nodeId,
    device,
    field,
    reason,
  });
  if (!node || !policy) {
    for (const field of Object.keys(override) as Array<keyof TemplateInstanceLayoutOverride>) {
      add(field, `${device === "desktop" ? "桌面端" : "移动端"}节点“${node?.name ?? nodeId}”已不再允许页面构图调整。`);
    }
    return blockers;
  }
  const finiteInRange = (value: unknown, min: number, max: number) => (
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
  );
  for (const field of Object.keys(override) as Array<keyof TemplateInstanceLayoutOverride>) {
    const value = override[field];
    const valid = field === "offsetXPercent" || field === "offsetYPercent"
      ? policy.position && finiteInRange(value, -policy.maxOffsetPercent, policy.maxOffsetPercent)
      : field === "widthPercent"
        ? policy.size && finiteInRange(value, policy.minWidthPercent, policy.maxWidthPercent)
        : field === "zIndex"
          ? policy.zIndex && Number.isInteger(value) && Number(value) >= -10 && Number(value) <= 10
          : field === "objectFit"
            ? policy.imageFit && slot?.type === "image" && ["cover", "contain", "fill"].includes(String(value))
            : field === "imageScalePercent"
              ? policy.imageFit && slot?.type === "image" && finiteInRange(value, 100, 200)
              : field === "focusXPercent" || field === "focusYPercent"
                ? policy.imageFocus && slot?.type === "image" && finiteInRange(value, 0, 100)
                : field === "fontSizePx"
                  ? policy.typography && finiteInRange(value, policy.minFontSizePx ?? 12, policy.maxFontSizePx ?? 96)
                  : field === "textAlign"
                    ? policy.typography && ["left", "center", "right"].includes(String(value))
                    : field === "marginTopPx" || field === "marginBottomPx"
                      ? policy.spacing && finiteInRange(value, 0, policy.maxSpacingPx ?? 120)
                      : false;
    if (!valid) {
      add(field, `${device === "desktop" ? "桌面端" : "移动端"}节点“${node.name}”的 ${field} 无法由目标版本完整表达。`);
    }
  }
  return blockers;
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
  const destructiveBlockers: DynamicTemplateDestructiveBlocker[] = [];
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
      if (hasMeaningfulContent(value)) {
        destructiveBlockers.push({
          kind: "content",
          slotId,
          nodeId: findSlotNodeId(currentDefinition, slotId),
          reason: targetSlot
            ? `槽位“${targetSlot.label}”已改型或不再允许编辑，原页面内容无法无损保留。`
            : `槽位“${currentSlot?.label ?? slotId}”已被删除，原页面内容无法无损保留。`,
        });
      }
    }
  }

  const currentHidden = Array.isArray(instance.hiddenSlotIds) ? instance.hiddenSlotIds : [];
  const preservedHiddenSlotIds = currentHidden.filter((slotId) => {
    const slot = targetDefinition.slots[slotId];
    return Boolean(slot?.hideable && !slot.required);
  });
  if (preservedHiddenSlotIds.length !== currentHidden.length) {
    currentHidden.filter((slotId) => !preservedHiddenSlotIds.includes(slotId)).forEach((slotId) => {
      const slot = currentDefinition.slots[slotId] ?? targetDefinition.slots[slotId];
      destructiveBlockers.push({
        kind: "hidden",
        slotId,
        nodeId: findSlotNodeId(currentDefinition, slotId),
        reason: `槽位“${slot?.label ?? slotId}”的隐藏状态无法由目标版本表达。`,
      });
    });
  }
  const currentLayoutOverrides = instance.layoutOverridesByNodeId ?? {};
  const nextLayoutOverrides = structuredClone(currentLayoutOverrides);
  for (const [nodeId, byDevice] of Object.entries(currentLayoutOverrides)) {
    for (const device of ["desktop", "mobile"] as const) {
      const override = byDevice?.[device];
      if (!override) continue;
      destructiveBlockers.push(...validateLayoutOverride({
        definition: targetDefinition,
        nodeId,
        device,
        override,
      }));
    }
  }

  const addedSlotIds = new Set(slotDiff.added);
  const pendingRequiredSlots = Object.values(targetDefinition.slots).flatMap((slot) => {
    if (!addedSlotIds.has(slot.slotId) || !slot.required || hasMeaningfulContent(nextContent[slot.slotId])) return [];
    return [{
      slotId: slot.slotId,
      label: slot.label,
      nodeId: findSlotNodeId(targetDefinition, slot.slotId),
    }];
  });
  for (const slotId of slotDiff.added) {
    const slot = targetDefinition.slots[slotId];
    if (slot.required) warnings.push(`新版新增必填槽位“${slot.label}”，升级后需在发布前完成填写。`);
  }
  for (const slotId of slotDiff.changed) {
    const previous = currentDefinition.slots[slotId];
    const target = targetDefinition.slots[slotId];
    if (previous.type !== target.type && Object.prototype.hasOwnProperty.call(currentContent, slotId)) {
      warnings.push(`槽位“${target.label}”类型已从 ${previous.type} 改为 ${target.type}。`);
    }
  }

  blockers.push(...destructiveBlockers.map((item) => item.reason));
  const preservedChanges: DynamicTemplatePreservedChange[] = [
    ...preservedContentSlotIds.map((slotId) => ({
      kind: "content" as const,
      key: slotId,
      label: currentDefinition.slots[slotId]?.label ?? slotId,
    })),
    ...preservedHiddenSlotIds.map((slotId) => ({
      kind: "hidden" as const,
      key: slotId,
      label: currentDefinition.slots[slotId]?.label ?? slotId,
    })),
    ...Object.entries(nextLayoutOverrides).flatMap(([nodeId, byDevice]) => (
      (["desktop", "mobile"] as const).flatMap((device) => byDevice?.[device]
        ? [{
            kind: "layout" as const,
            key: nodeId,
            label: targetDefinition.nodes[nodeId]?.name ?? nodeId,
            device,
          }]
        : [])
    )),
  ];

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
    pendingRequiredSlots,
    preservedChanges,
    destructiveBlockers,
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

type DynamicTemplateDocumentBlock = {
  type?: unknown;
  props?: unknown;
  [key: string]: unknown;
};

export interface DynamicTemplateDocumentUpgradeTarget
  extends ResolvedDynamicTemplateDefinition {
  name: string;
}

export interface DynamicTemplateDocumentUpgradePlan<T extends Record<string, unknown>> {
  document: T;
  upgradedCount: number;
  blockers: string[];
  instancePlans: DynamicTemplateUpgradeInstancePlan[];
  pendingRequiredSlots: DynamicTemplatePendingRequiredSlot[];
  destructiveBlockers: DynamicTemplateDestructiveBlocker[];
}

export interface DynamicTemplateUpgradeInstancePlan {
  blockId: string;
  instanceId: string;
  currentProps: DynamicTemplateInstanceProps;
  currentDefinition?: TemplateDefinitionV2;
  targetDefinition: TemplateDefinitionV2;
  analysis: DynamicTemplateUpgradeAnalysis;
}

function createBlockedDynamicTemplateUpgradeAnalysis(input: {
  instance: DynamicTemplateInstanceProps;
  targetDefinition: TemplateDefinitionV2;
  targetVersion: number;
  reason: string;
}): DynamicTemplateUpgradeAnalysis {
  const { instance, targetDefinition, targetVersion, reason } = input;
  return {
    fromVersion: instance.templateVersion,
    toVersion: targetVersion,
    diff: {
      addedNodeIds: [],
      removedNodeIds: [],
      changedNodeIds: [],
      addedSlotIds: [],
      removedSlotIds: [],
      changedSlotIds: [],
    },
    preservedContentSlotIds: [],
    discardedContentSlotIds: [],
    preservedHiddenSlotIds: [],
    pendingRequiredSlots: [],
    preservedChanges: [],
    destructiveBlockers: [],
    blockers: [reason],
    warnings: [],
    nextProps: structuredClone(instance),
  };
}

function mapDynamicTemplateDocumentBlocks<T extends Record<string, unknown>>(
  document: T,
  mapBlock: (block: DynamicTemplateDocumentBlock) => DynamicTemplateDocumentBlock,
): T {
  const mapList = (value: unknown) => Array.isArray(value)
    ? value.map((block) => (
        block && typeof block === "object" && !Array.isArray(block)
          ? mapBlock(block as DynamicTemplateDocumentBlock)
          : block
      ))
    : value;
  const zones = document.zones && typeof document.zones === "object" && !Array.isArray(document.zones)
    ? Object.fromEntries(Object.entries(document.zones as Record<string, unknown>)
      .map(([key, blocks]) => [key, mapList(blocks)]))
    : document.zones;
  return {
    ...document,
    ...(Array.isArray(document.content) ? { content: mapList(document.content) } : {}),
    ...(zones !== undefined ? { zones } : {}),
  } as T;
}

/**
 * 为目录中的正式动态母模板生成一次原子 PageDocument 草稿升级计划。
 * 任一旧实例缺少精确版本或存在兼容 blocker 时整批关闭，避免部分升级。
 */
export function planDynamicTemplateDocumentUpgrade<T extends Record<string, unknown>>(input: {
  document: T;
  resolvedDefinitions?: ResolvedDynamicTemplateDefinitionMap;
  target: DynamicTemplateDocumentUpgradeTarget;
}): DynamicTemplateDocumentUpgradePlan<T> {
  const { document, target } = input;
  const blockers: string[] = [];
  if (
    target.definition.templateId !== target.templateId
    || target.definition.schemaVersion !== target.schemaVersion
    || typeof target.definitionChecksum !== "string"
    || target.definitionChecksum.trim().length === 0
    || !Number.isInteger(target.version)
    || target.version <= 0
  ) {
    blockers.push("正式模板版本身份无效。");
  }
  const targetValidation = validateDynamicTemplateDefinition(target.definition);
  if (!targetValidation.valid) blockers.push("正式模板布局未通过动态模板合同校验。");
  if (blockers.length > 0) return {
    document,
    upgradedCount: 0,
    blockers,
    instancePlans: [],
    pendingRequiredSlots: [],
    destructiveBlockers: [],
  };

  const persistedDefinitions = readResolvedDynamicTemplateDefinitions(
    document[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY],
  );
  const resolvedDefinitions = {
    ...persistedDefinitions,
    ...(input.resolvedDefinitions ?? {}),
  };
  const plannedProps = new WeakMap<object, DynamicTemplateInstanceProps>();
  const instancePlans: DynamicTemplateUpgradeInstancePlan[] = [];
  let upgradedCount = 0;

  mapDynamicTemplateDocumentBlocks(document, (block) => {
    if (
      block.type !== DYNAMIC_TEMPLATE_BLOCK_TYPE
      || !block.props
      || typeof block.props !== "object"
      || Array.isArray(block.props)
    ) return block;
    const instance = block.props as DynamicTemplateInstanceProps;
    if (
      instance.templateId !== target.templateId
      || !Number.isInteger(instance.templateVersion)
      || instance.templateVersion >= target.version
    ) return block;
    const current = resolvedDefinitions[
      dynamicTemplateVersionKey(instance.templateId, Number(instance.templateVersion))
    ];
    if (!current) {
      const reason = "缺少当前精确模板版本，无法可靠分析升级差异。";
      const instanceId = instance.instanceId || instance.id;
      instancePlans.push({
        blockId: typeof instance.id === "string" ? instance.id : instanceId,
        instanceId,
        currentProps: structuredClone(instance),
        targetDefinition: target.definition,
        analysis: createBlockedDynamicTemplateUpgradeAnalysis({
          instance,
          targetDefinition: target.definition,
          targetVersion: target.version,
          reason,
        }),
      });
      blockers.push(`${instanceId}：${reason}`);
      return block;
    }
    if (!validateDynamicTemplateDefinition(current.definition).valid) {
      const reason = "当前精确模板版本无效，无法可靠分析升级差异。";
      const instanceId = instance.instanceId || instance.id;
      instancePlans.push({
        blockId: typeof instance.id === "string" ? instance.id : instanceId,
        instanceId,
        currentProps: structuredClone(instance),
        targetDefinition: target.definition,
        analysis: createBlockedDynamicTemplateUpgradeAnalysis({
          instance,
          targetDefinition: target.definition,
          targetVersion: target.version,
          reason,
        }),
      });
      blockers.push(`${instanceId}：${reason}`);
      return block;
    }
    const analysis = analyzeDynamicTemplateUpgrade({
      currentDefinition: current.definition,
      targetDefinition: target.definition,
      targetVersion: target.version,
      instance,
    });
    instancePlans.push({
      blockId: typeof instance.id === "string" ? instance.id : instance.instanceId,
      instanceId: instance.instanceId,
      currentProps: structuredClone(instance),
      currentDefinition: current.definition,
      targetDefinition: target.definition,
      analysis,
    });
    if (analysis.blockers.length > 0) {
      blockers.push(...analysis.blockers.map((blocker) => (
        `${instance.instanceId || instance.id}：${blocker}`
      )));
      return block;
    }
    plannedProps.set(block, analysis.nextProps);
    upgradedCount += 1;
    return block;
  });

  if (blockers.length > 0 || upgradedCount === 0) {
    return {
      document,
      upgradedCount: 0,
      blockers,
      instancePlans,
      pendingRequiredSlots: instancePlans.flatMap((item) => item.analysis.pendingRequiredSlots),
      destructiveBlockers: instancePlans.flatMap((item) => item.analysis.destructiveBlockers),
    };
  }

  const nextDocument = mapDynamicTemplateDocumentBlocks(document, (block) => {
    const nextProps = plannedProps.get(block);
    return nextProps ? { ...block, props: nextProps } : block;
  });
  const targetKey = dynamicTemplateVersionKey(target.templateId, target.version);
  return {
    document: {
      ...nextDocument,
      [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: {
        ...persistedDefinitions,
        [targetKey]: {
          templateId: target.templateId,
          version: target.version,
          schemaVersion: target.schemaVersion,
          definitionChecksum: target.definitionChecksum,
          definition: target.definition,
        },
      },
    },
    upgradedCount,
    blockers: [],
    instancePlans,
    pendingRequiredSlots: instancePlans.flatMap((item) => item.analysis.pendingRequiredSlots),
    destructiveBlockers: [],
  } as DynamicTemplateDocumentUpgradePlan<T>;
}
