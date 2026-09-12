import type { TemplateDefinitionV2 } from "../template-definition/generated/templateDefinition.generated";
import { getDynamicTemplateStructureLockOwnerId } from "../template-definition/validateTemplateDefinition";

export interface TemplateEditorSelectionTarget {
  targetId: string;
  roleId?: string;
}

export interface TemplateEditorSelectionSnapshot {
  targets: readonly TemplateEditorSelectionTarget[];
  primaryTarget: TemplateEditorSelectionTarget | null;
  anchorTarget: TemplateEditorSelectionTarget | null;
}

export type TemplateEditorSelectionIntent =
  | "exclusive"
  | "toggle"
  | "range"
  | "additive-range";

export type TemplateEditorSelectionExclusionCode =
  | "TARGET_NOT_FOUND"
  | "TARGET_NOT_VISIBLE"
  | "ROOT_TARGET_NOT_BATCH_EDITABLE"
  | "TARGET_LOCKED"
  | "TARGET_INCOMPATIBLE";

export interface TemplateEditorSelectionExclusion {
  code: TemplateEditorSelectionExclusionCode;
  target: TemplateEditorSelectionTarget;
  reason: string;
  lockOwnerId?: string;
}

export type TemplateEditorSelectionCompatibilityResolver = (
  target: TemplateEditorSelectionTarget,
  context: {
    definition: TemplateDefinitionV2;
    mode: "view" | "batch";
  },
) => { compatible: true } | { compatible: false; reason: string };

export interface TemplateEditorSelectionTransitionInput {
  definition: TemplateDefinitionV2;
  snapshot: TemplateEditorSelectionSnapshot;
  target: TemplateEditorSelectionTarget;
  visibleTargets: readonly TemplateEditorSelectionTarget[];
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  resolveCompatibility?: TemplateEditorSelectionCompatibilityResolver;
}

export interface TemplateEditorSelectionTransitionResult {
  ok: boolean;
  changed: boolean;
  intent: TemplateEditorSelectionIntent;
  snapshot: TemplateEditorSelectionSnapshot;
  exclusions: readonly TemplateEditorSelectionExclusion[];
  rangeResolution: "not-requested" | "anchored" | "anchor-missing-target-only";
}

export interface TemplateEditorSelectionRepairOptions {
  fallbackTarget?: TemplateEditorSelectionTarget | null;
  visibleTargets?: readonly TemplateEditorSelectionTarget[];
  repairTarget?: (
    target: TemplateEditorSelectionTarget,
    definition: TemplateDefinitionV2,
  ) => TemplateEditorSelectionTarget | null;
}

function cloneTarget(target: TemplateEditorSelectionTarget): TemplateEditorSelectionTarget {
  return {
    targetId: target.targetId,
    ...(target.roleId !== undefined ? { roleId: target.roleId } : {}),
  };
}

export function isSameTemplateEditorSelectionTarget(
  left: TemplateEditorSelectionTarget | null | undefined,
  right: TemplateEditorSelectionTarget | null | undefined,
) {
  if (!left || !right) return left === right;
  return left.targetId === right.targetId && left.roleId === right.roleId;
}

function targetKey(target: TemplateEditorSelectionTarget) {
  return JSON.stringify([target.targetId, target.roleId ?? null]);
}

function uniqueTargets(targets: readonly TemplateEditorSelectionTarget[]) {
  const seen = new Set<string>();
  return targets.flatMap((target) => {
    const key = targetKey(target);
    if (seen.has(key)) return [];
    seen.add(key);
    return [cloneTarget(target)];
  });
}

function orderTargets(
  targets: readonly TemplateEditorSelectionTarget[],
  visibleTargets: readonly TemplateEditorSelectionTarget[],
) {
  const candidates = new Map(uniqueTargets(targets).map((target) => [targetKey(target), target]));
  const ordered = uniqueTargets(visibleTargets).flatMap((visibleTarget) => {
    const key = targetKey(visibleTarget);
    const target = candidates.get(key);
    if (!target) return [];
    candidates.delete(key);
    return [target];
  });
  // 调用方可能在两个表面切换时暂时不再呈现旧目标；保留它们，但绝不把数组下标当身份。
  return [...ordered, ...candidates.values()];
}

function freezeSnapshot(
  targets: readonly TemplateEditorSelectionTarget[],
  primaryTarget: TemplateEditorSelectionTarget | null,
  anchorTarget: TemplateEditorSelectionTarget | null,
): TemplateEditorSelectionSnapshot {
  const frozenTargets = uniqueTargets(targets).map((target) => Object.freeze(target));
  const findTarget = (candidate: TemplateEditorSelectionTarget | null) => (
    candidate
      ? frozenTargets.find((target) => isSameTemplateEditorSelectionTarget(target, candidate)) ?? null
      : null
  );
  return Object.freeze({
    targets: Object.freeze(frozenTargets),
    primaryTarget: findTarget(primaryTarget),
    anchorTarget: findTarget(anchorTarget),
  });
}

export function createTemplateEditorSelectionSnapshot(
  target: TemplateEditorSelectionTarget | null = null,
): TemplateEditorSelectionSnapshot {
  return target ? freezeSnapshot([target], target, target) : freezeSnapshot([], null, null);
}

export function resolveTemplateEditorSelectionIntent(modifiers: {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}): TemplateEditorSelectionIntent {
  const toggle = modifiers.ctrlKey === true || modifiers.metaKey === true;
  if (modifiers.shiftKey === true) return toggle ? "additive-range" : "range";
  return toggle ? "toggle" : "exclusive";
}

function sameSnapshot(
  left: TemplateEditorSelectionSnapshot,
  right: TemplateEditorSelectionSnapshot,
) {
  return left.targets.length === right.targets.length
    && left.targets.every((target, index) => (
      isSameTemplateEditorSelectionTarget(target, right.targets[index])
    ))
    && isSameTemplateEditorSelectionTarget(left.primaryTarget, right.primaryTarget)
    && isSameTemplateEditorSelectionTarget(left.anchorTarget, right.anchorTarget);
}

function resolveBatchExclusions(
  definition: TemplateDefinitionV2,
  targets: readonly TemplateEditorSelectionTarget[],
  resolveCompatibility?: TemplateEditorSelectionCompatibilityResolver,
) {
  return targets.flatMap((target): TemplateEditorSelectionExclusion[] => {
    const node = definition.nodes[target.targetId];
    if (!node) {
      return [{
        code: "TARGET_NOT_FOUND",
        target: cloneTarget(target),
        reason: "目标不存在，批量选择未改变。",
      }];
    }
    if (target.targetId === definition.rootNodeId) {
      return [{
        code: "ROOT_TARGET_NOT_BATCH_EDITABLE",
        target: cloneTarget(target),
        reason: "模板根节点只可单独查看，不能加入批量选择。",
      }];
    }
    const lockOwnerId = getDynamicTemplateStructureLockOwnerId(definition, target.targetId);
    if (lockOwnerId) {
      return [{
        code: "TARGET_LOCKED",
        target: cloneTarget(target),
        lockOwnerId,
        reason: lockOwnerId === target.targetId
          ? "目标已锁定，不能加入批量选择。"
          : "目标的上级已锁定，不能加入批量选择。",
      }];
    }
    const compatibility = resolveCompatibility?.(target, { definition, mode: "batch" });
    if (compatibility?.compatible === false) {
      return [{
        code: "TARGET_INCOMPATIBLE",
        target: cloneTarget(target),
        reason: compatibility.reason,
      }];
    }
    return [];
  });
}

function rejectedTransition(
  input: TemplateEditorSelectionTransitionInput,
  intent: TemplateEditorSelectionIntent,
  exclusions: readonly TemplateEditorSelectionExclusion[],
  rangeResolution: TemplateEditorSelectionTransitionResult["rangeResolution"] = "not-requested",
): TemplateEditorSelectionTransitionResult {
  return {
    ok: false,
    changed: false,
    intent,
    snapshot: input.snapshot,
    exclusions,
    rangeResolution,
  };
}

export function transitionTemplateEditorSelection(
  input: TemplateEditorSelectionTransitionInput,
): TemplateEditorSelectionTransitionResult {
  const intent = resolveTemplateEditorSelectionIntent(input);
  const target = cloneTarget(input.target);
  const node = input.definition.nodes[target.targetId];
  if (!node) {
    return rejectedTransition(input, intent, [{
      code: "TARGET_NOT_FOUND",
      target,
      reason: "目标不存在，选择未改变。",
    }]);
  }

  if (intent === "exclusive") {
    const compatibility = input.resolveCompatibility?.(target, {
      definition: input.definition,
      mode: "view",
    });
    if (compatibility?.compatible === false) {
      return rejectedTransition(input, intent, [{
        code: "TARGET_INCOMPATIBLE",
        target,
        reason: compatibility.reason,
      }]);
    }
    const snapshot = freezeSnapshot([target], target, target);
    return {
      ok: true,
      changed: !sameSnapshot(snapshot, input.snapshot),
      intent,
      snapshot,
      exclusions: [],
      rangeResolution: "not-requested",
    };
  }

  if (intent === "toggle") {
    const selected = input.snapshot.targets.some((candidate) => (
      isSameTemplateEditorSelectionTarget(candidate, target)
    ));
    const candidates = selected
      ? input.snapshot.targets.filter((candidate) => (
        !isSameTemplateEditorSelectionTarget(candidate, target)
      ))
      : [...input.snapshot.targets, target];
    if (!selected) {
      const exclusions = resolveBatchExclusions(
        input.definition,
        candidates,
        input.resolveCompatibility,
      );
      if (exclusions.length > 0) return rejectedTransition(input, intent, exclusions);
    }
    const targets = orderTargets(candidates, input.visibleTargets);
    const primaryTarget = selected
      ? targets[targets.length - 1] ?? null
      : target;
    const snapshot = freezeSnapshot(targets, primaryTarget, primaryTarget);
    return {
      ok: true,
      changed: !sameSnapshot(snapshot, input.snapshot),
      intent,
      snapshot,
      exclusions: [],
      rangeResolution: "not-requested",
    };
  }

  const visibleTargets = uniqueTargets(input.visibleTargets);
  const targetIndex = visibleTargets.findIndex((candidate) => (
    isSameTemplateEditorSelectionTarget(candidate, target)
  ));
  if (targetIndex < 0) {
    return rejectedTransition(input, intent, [{
      code: "TARGET_NOT_VISIBLE",
      target,
      reason: "范围终点不在当前可见顺序中，选择未改变。",
    }]);
  }
  const anchorIndex = input.snapshot.anchorTarget
    ? visibleTargets.findIndex((candidate) => (
      isSameTemplateEditorSelectionTarget(candidate, input.snapshot.anchorTarget)
    ))
    : -1;
  const rangeResolution = anchorIndex < 0 ? "anchor-missing-target-only" : "anchored";
  const rangeTargets = anchorIndex < 0
    ? [target]
    : visibleTargets.slice(
      Math.min(anchorIndex, targetIndex),
      Math.max(anchorIndex, targetIndex) + 1,
    );
  const candidates = intent === "additive-range"
    ? [...input.snapshot.targets, ...rangeTargets]
    : rangeTargets;
  const targets = orderTargets(candidates, visibleTargets);
  const exclusions = resolveBatchExclusions(
    input.definition,
    targets,
    input.resolveCompatibility,
  );
  if (exclusions.length > 0) {
    return rejectedTransition(input, intent, exclusions, rangeResolution);
  }
  const anchorTarget = anchorIndex < 0 ? target : input.snapshot.anchorTarget;
  const snapshot = freezeSnapshot(targets, target, anchorTarget);
  return {
    ok: true,
    changed: !sameSnapshot(snapshot, input.snapshot),
    intent,
    snapshot,
    exclusions: [],
    rangeResolution,
  };
}

export function repairTemplateEditorSelectionSnapshot(
  definition: TemplateDefinitionV2,
  snapshot: TemplateEditorSelectionSnapshot,
  options: TemplateEditorSelectionRepairOptions = {},
) {
  const repairTarget = options.repairTarget ?? ((target: TemplateEditorSelectionTarget) => (
    definition.nodes[target.targetId] ? cloneTarget(target) : null
  ));
  const repairedByOriginalKey = new Map<string, TemplateEditorSelectionTarget>();
  const repairedTargets = snapshot.targets.flatMap((target) => {
    const repaired = repairTarget(target, definition);
    if (!repaired || !definition.nodes[repaired.targetId]) return [];
    repairedByOriginalKey.set(targetKey(target), repaired);
    return [repaired];
  });
  const fallbackTarget = options.fallbackTarget === undefined
    ? { targetId: definition.rootNodeId }
    : options.fallbackTarget;
  const nonEmptyTargets = repairedTargets.length > 0
    ? repairedTargets
    : fallbackTarget && definition.nodes[fallbackTarget.targetId]
      ? [fallbackTarget]
      : [];
  const orderedTargets = options.visibleTargets
    ? orderTargets(nonEmptyTargets, options.visibleTargets)
    : uniqueTargets(nonEmptyTargets);
  const repairedPrimary = snapshot.primaryTarget
    ? repairedByOriginalKey.get(targetKey(snapshot.primaryTarget)) ?? null
    : null;
  const repairedAnchor = snapshot.anchorTarget
    ? repairedByOriginalKey.get(targetKey(snapshot.anchorTarget)) ?? null
    : null;
  const primaryTarget = repairedPrimary
    && orderedTargets.some((target) => isSameTemplateEditorSelectionTarget(target, repairedPrimary))
    ? repairedPrimary
    : orderedTargets[orderedTargets.length - 1] ?? null;
  const anchorTarget = repairedAnchor
    && orderedTargets.some((target) => isSameTemplateEditorSelectionTarget(target, repairedAnchor))
    ? repairedAnchor
    : primaryTarget;
  return freezeSnapshot(orderedTargets, primaryTarget, anchorTarget);
}

export function projectTemplateEditorSelectionSnapshot(
  snapshot: TemplateEditorSelectionSnapshot,
) {
  const primaryTarget = snapshot.primaryTarget;
  return {
    selectedObjectId: primaryTarget?.targetId ?? null,
    selectedContractRole: primaryTarget?.roleId !== undefined
      ? { nodeId: primaryTarget.targetId, roleId: primaryTarget.roleId }
      : null,
  };
}

/** 框选一次产生一个选择快照，排除锁定目标并去掉重复的祖先/后代。 */
export function selectTemplateEditorTargets(input: {
  definition: TemplateDefinitionV2;
  snapshot: TemplateEditorSelectionSnapshot;
  targets: readonly TemplateEditorSelectionTarget[];
  additive?: boolean;
}): TemplateEditorSelectionTransitionResult {
  const candidates = uniqueTargets(input.additive
    ? [...input.snapshot.targets, ...input.targets]
    : input.targets);
  const exclusions = resolveBatchExclusions(input.definition, candidates);
  const excludedKeys = new Set(exclusions.map((item) => targetKey(item.target)));
  const eligible = candidates.filter((target) => !excludedKeys.has(targetKey(target)));
  const selectedNodeIds = new Set(eligible.filter((target) => target.roleId === undefined).map((target) => target.targetId));
  const parentByNodeId = new Map<string, string>();
  Object.values(input.definition.nodes).forEach((node) => node.childIds.forEach((childId) => parentByNodeId.set(childId, node.nodeId)));
  const targets = eligible.filter((target) => {
    if (target.roleId !== undefined && selectedNodeIds.has(target.targetId)) return false;
    const visited = new Set<string>();
    let ancestor = parentByNodeId.get(target.targetId);
    while (ancestor && !visited.has(ancestor)) {
      if (selectedNodeIds.has(ancestor)) return false;
      visited.add(ancestor);
      ancestor = parentByNodeId.get(ancestor);
    }
    return true;
  });
  const primary = targets[targets.length - 1] ?? null;
  const snapshot = freezeSnapshot(targets, primary, primary);
  return {
    ok: true,
    changed: !sameSnapshot(snapshot, input.snapshot),
    intent: input.additive ? "additive-range" : "range",
    snapshot,
    exclusions,
    rangeResolution: "not-requested",
  };
}
