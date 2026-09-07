import {
  getEffectiveDynamicTemplateInstanceEditPolicy,
  validateDynamicTemplateDefinition,
  type DynamicTemplateDevice,
  type DynamicTemplateLength,
  type TemplateDefinitionV2,
  type TemplateInstanceLayoutOverride,
  type TemplateInstanceLayoutOverridesByNodeId,
} from "../template-definition";
import {
  objectPositionToPercent,
  percentToObjectPosition,
} from "../template-definition/imagePosition";
export interface PromoteDynamicTemplateInstanceRequest {
  templateId: string;
  sourceVersion: number;
  sourceDefinitionChecksum: string;
  sourceDefinition: TemplateDefinitionV2;
  layoutOverridesByNodeId: TemplateInstanceLayoutOverridesByNodeId | undefined;
}

export type PromotableInstanceField =
  | "widthPercent"
  | "zIndex"
  | "objectFit"
  | "objectPosition"
  | "fontSizePx"
  | "textAlign"
  | "marginTopPx"
  | "marginBottomPx";

export interface PromotedInstanceField {
  nodeId: string;
  nodeName: string;
  device: DynamicTemplateDevice;
  field: PromotableInstanceField;
  label: string;
}

export interface SkippedInstanceField {
  nodeId: string;
  nodeName: string;
  device: DynamicTemplateDevice;
  field: keyof TemplateInstanceLayoutOverride;
  label: string;
  reason: string;
}

export interface ConflictingInstanceField {
  nodeId: string;
  nodeName: string;
  device: DynamicTemplateDevice;
  field: PromotableInstanceField | "node";
  label: string;
  reason: string;
}

export interface PromoteInstanceOverridesResult {
  definition: TemplateDefinitionV2;
  promoted: PromotedInstanceField[];
  alreadyApplied: PromotedInstanceField[];
  skipped: SkippedInstanceField[];
  conflicts: ConflictingInstanceField[];
  blockers: string[];
}

const DEVICE_LABEL: Record<DynamicTemplateDevice, string> = {
  desktop: "桌面端",
  mobile: "移动端",
};

const FIELD_LABEL: Record<PromotableInstanceField, string> = {
  widthPercent: "区域宽度",
  zIndex: "层级",
  objectFit: "图片适配",
  objectPosition: "画面焦点",
  fontSizePx: "文字字号",
  textAlign: "文字对齐",
  marginTopPx: "上间距",
  marginBottomPx: "下间距",
};

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function px(value: number): DynamicTemplateLength {
  return { value, unit: "px" };
}

function percent(value: number): DynamicTemplateLength {
  return { value, unit: "%" };
}

function normalizedMarginValue(value: DynamicTemplateLength | undefined) {
  return value ?? px(0);
}

function isPresetFocus(value: number) {
  return value === 0 || value === 50 || value === 100;
}

function sparseOverrideEntries(value: TemplateInstanceLayoutOverride) {
  return Object.entries(value).filter((entry): entry is [keyof TemplateInstanceLayoutOverride, NonNullable<TemplateInstanceLayoutOverride[keyof TemplateInstanceLayoutOverride]>] => (
    entry[1] !== undefined
  ));
}

/**
 * 把页面实例中能够无损表示为 TemplateDefinitionV2 基线的设计覆盖提取到
 * 母模板草稿。真实内容、显隐和业务引用不在输入中，也不会进入模板定义。
 *
 * sourceDefinition 是页面实例锁定的精确正式版本；targetDefinition 是当前
 * 服务端母模板草稿。二者分开后可以执行三方冲突判断，避免用旧页面静默
 * 覆盖已经在模板设计中修改过的同一字段。
 */
export function promoteInstanceOverridesToTemplateDraft(input: {
  sourceDefinition: TemplateDefinitionV2;
  targetDefinition: TemplateDefinitionV2;
  layoutOverridesByNodeId: TemplateInstanceLayoutOverridesByNodeId | undefined;
}): PromoteInstanceOverridesResult {
  const { sourceDefinition, targetDefinition } = input;
  const nextDefinition = structuredClone(targetDefinition);
  const promoted: PromotedInstanceField[] = [];
  const alreadyApplied: PromotedInstanceField[] = [];
  const skipped: SkippedInstanceField[] = [];
  const conflicts: ConflictingInstanceField[] = [];
  const blockers: string[] = [];

  if (sourceDefinition.templateId !== targetDefinition.templateId) {
    blockers.push("页面实例与母模板草稿不属于同一个 templateId，已拒绝提取。");
    return { definition: nextDefinition, promoted, alreadyApplied, skipped, conflicts, blockers };
  }

  const addCandidate = ({
    nodeId,
    nodeName,
    device,
    field,
    sourceValue,
    targetValue,
    desiredValue,
    apply,
  }: {
    nodeId: string;
    nodeName: string;
    device: DynamicTemplateDevice;
    field: PromotableInstanceField;
    sourceValue: unknown;
    targetValue: unknown;
    desiredValue: unknown;
    apply: () => void;
  }) => {
    const item = {
      nodeId,
      nodeName,
      device,
      field,
      label: `${DEVICE_LABEL[device]} · ${FIELD_LABEL[field]}`,
    } satisfies PromotedInstanceField;
    if (sameValue(targetValue, desiredValue)) {
      alreadyApplied.push(item);
      return;
    }
    if (!sameValue(targetValue, sourceValue)) {
      conflicts.push({
        ...item,
        reason: "母模板草稿已修改同一字段，不能用旧页面覆盖静默替换。",
      });
      return;
    }
    apply();
    promoted.push(item);
  };

  const layoutOverrides = input.layoutOverridesByNodeId ?? {};
  for (const [nodeId, overridesByDevice] of Object.entries(layoutOverrides)) {
    const sourceNode = sourceDefinition.nodes[nodeId];
    const targetNode = targetDefinition.nodes[nodeId];
    const nextNode = nextDefinition.nodes[nodeId];
    if (!sourceNode || !targetNode || !nextNode) {
      conflicts.push({
        nodeId,
        nodeName: sourceNode?.name ?? targetNode?.name ?? nodeId,
        device: "desktop",
        field: "node",
        label: "模板节点",
        reason: "当前母模板草稿已删除该页面覆盖所引用的节点。",
      });
      continue;
    }
    if (sourceNode.type !== targetNode.type || sourceNode.slotId !== targetNode.slotId) {
      conflicts.push({
        nodeId,
        nodeName: sourceNode.name,
        device: "desktop",
        field: "node",
        label: "模板节点",
        reason: "当前母模板草稿已改变节点类型或槽位绑定，无法安全提取。",
      });
      continue;
    }

    const sourceSlot = sourceNode.slotId ? sourceDefinition.slots[sourceNode.slotId] : undefined;
    const targetSlot = targetNode.slotId ? targetDefinition.slots[targetNode.slotId] : undefined;
    const nextSlot = nextNode.slotId ? nextDefinition.slots[nextNode.slotId] : undefined;
    const sourcePolicy = getEffectiveDynamicTemplateInstanceEditPolicy(sourceNode, sourceSlot);

    for (const device of ["desktop", "mobile"] as const) {
      const override = overridesByDevice?.[device];
      if (!override || sparseOverrideEntries(override).length === 0) continue;
      const sourceRules = sourceNode.responsive[device];
      const targetRules = targetNode.responsive[device];
      const nextRules = nextNode.responsive[device];

      if (override.widthPercent !== undefined && sourcePolicy?.size) {
        addCandidate({
          nodeId,
          nodeName: sourceNode.name,
          device,
          field: "widthPercent",
          sourceValue: sourceRules.width,
          targetValue: targetRules.width,
          desiredValue: percent(override.widthPercent),
          apply: () => { nextRules.width = percent(override.widthPercent!); },
        });
      }

      if (override.marginTopPx !== undefined && sourcePolicy?.spacing) {
        addCandidate({
          nodeId,
          nodeName: sourceNode.name,
          device,
          field: "marginTopPx",
          sourceValue: normalizedMarginValue(sourceRules.margin?.top),
          targetValue: normalizedMarginValue(targetRules.margin?.top),
          desiredValue: px(override.marginTopPx),
          apply: () => {
            nextRules.margin ??= { top: px(0), right: px(0), bottom: px(0), left: px(0) };
            nextRules.margin.top = px(override.marginTopPx!);
          },
        });
      }
      if (override.marginBottomPx !== undefined && sourcePolicy?.spacing) {
        addCandidate({
          nodeId,
          nodeName: sourceNode.name,
          device,
          field: "marginBottomPx",
          sourceValue: normalizedMarginValue(sourceRules.margin?.bottom),
          targetValue: normalizedMarginValue(targetRules.margin?.bottom),
          desiredValue: px(override.marginBottomPx),
          apply: () => {
            nextRules.margin ??= { top: px(0), right: px(0), bottom: px(0), left: px(0) };
            nextRules.margin.bottom = px(override.marginBottomPx!);
          },
        });
      }

      if (override.zIndex !== undefined && sourcePolicy?.zIndex) {
        if (sourceRules.placement && targetRules.placement && nextRules.placement) {
          addCandidate({
            nodeId,
            nodeName: sourceNode.name,
            device,
            field: "zIndex",
            sourceValue: sourceRules.placement.zIndex,
            targetValue: targetRules.placement.zIndex,
            desiredValue: override.zIndex,
            apply: () => { nextRules.placement!.zIndex = override.zIndex!; },
          });
        } else {
          skipped.push({
            nodeId,
            nodeName: sourceNode.name,
            device,
            field: "zIndex",
            label: `${DEVICE_LABEL[device]} · 层级`,
            reason: "流式节点没有可无损写回的模板层级字段，请在模板设计中调整。",
          });
        }
      }

      if (override.objectFit !== undefined && sourcePolicy?.imageFit && sourceSlot?.type === "image" && targetSlot?.type === "image" && nextSlot) {
        const sourceSlotRules = device === "desktop" ? sourceSlot.desktopRules : sourceSlot.mobileRules;
        const targetSlotRules = device === "desktop" ? targetSlot.desktopRules : targetSlot.mobileRules;
        const nextSlotRules = device === "desktop" ? nextSlot.desktopRules : nextSlot.mobileRules;
        addCandidate({
          nodeId,
          nodeName: sourceNode.name,
          device,
          field: "objectFit",
          sourceValue: sourceSlotRules.objectFit ?? "cover",
          targetValue: targetSlotRules.objectFit ?? "cover",
          desiredValue: override.objectFit,
          apply: () => { nextSlotRules.objectFit = override.objectFit; },
        });
      }

      if ((override.focusXPercent !== undefined || override.focusYPercent !== undefined)
        && sourcePolicy?.imageFocus && sourceSlot?.type === "image" && targetSlot?.type === "image" && nextSlot) {
        const sourceSlotRules = device === "desktop" ? sourceSlot.desktopRules : sourceSlot.mobileRules;
        const targetSlotRules = device === "desktop" ? targetSlot.desktopRules : targetSlot.mobileRules;
        const nextSlotRules = device === "desktop" ? nextSlot.desktopRules : nextSlot.mobileRules;
        const sourceFocus = objectPositionToPercent(sourceSlotRules.objectPosition);
        const desiredFocus = {
          x: override.focusXPercent ?? sourceFocus.x,
          y: override.focusYPercent ?? sourceFocus.y,
        };
        if (isPresetFocus(desiredFocus.x) && isPresetFocus(desiredFocus.y)) {
          addCandidate({
            nodeId,
            nodeName: sourceNode.name,
            device,
            field: "objectPosition",
            sourceValue: percentToObjectPosition(sourceFocus),
            targetValue: percentToObjectPosition(objectPositionToPercent(targetSlotRules.objectPosition)),
            desiredValue: percentToObjectPosition(desiredFocus),
            apply: () => { nextSlotRules.objectPosition = percentToObjectPosition(desiredFocus); },
          });
        } else {
          skipped.push({
            nodeId,
            nodeName: sourceNode.name,
            device,
            field: override.focusXPercent !== undefined ? "focusXPercent" : "focusYPercent",
            label: `${DEVICE_LABEL[device]} · 画面焦点`,
            reason: "精确百分比焦点不能无损写入当前母模板九宫格焦点，请在模板设计中重新确认。",
          });
        }
      }

      if (override.fontSizePx !== undefined && sourcePolicy?.typography && sourceSlot && targetSlot && nextSlot) {
        const sourceSlotRules = device === "desktop" ? sourceSlot.desktopRules : sourceSlot.mobileRules;
        const targetSlotRules = device === "desktop" ? targetSlot.desktopRules : targetSlot.mobileRules;
        const nextSlotRules = device === "desktop" ? nextSlot.desktopRules : nextSlot.mobileRules;
        addCandidate({
          nodeId,
          nodeName: sourceNode.name,
          device,
          field: "fontSizePx",
          sourceValue: sourceSlotRules.fontSize,
          targetValue: targetSlotRules.fontSize,
          desiredValue: px(override.fontSizePx),
          apply: () => { nextSlotRules.fontSize = px(override.fontSizePx!); },
        });
      }
      if (override.textAlign !== undefined && sourcePolicy?.typography && sourceSlot && targetSlot && nextSlot) {
        const sourceSlotRules = device === "desktop" ? sourceSlot.desktopRules : sourceSlot.mobileRules;
        const targetSlotRules = device === "desktop" ? targetSlot.desktopRules : targetSlot.mobileRules;
        const nextSlotRules = device === "desktop" ? nextSlot.desktopRules : nextSlot.mobileRules;
        addCandidate({
          nodeId,
          nodeName: sourceNode.name,
          device,
          field: "textAlign",
          sourceValue: sourceSlotRules.textAlign,
          targetValue: targetSlotRules.textAlign,
          desiredValue: override.textAlign,
          apply: () => { nextSlotRules.textAlign = override.textAlign; },
        });
      }

      for (const [field] of sparseOverrideEntries(override)) {
        if (field !== "offsetXPercent" && field !== "offsetYPercent" && field !== "imageScalePercent") continue;
        skipped.push({
          nodeId,
          nodeName: sourceNode.name,
          device,
          field,
          label: `${DEVICE_LABEL[device]} · ${field === "imageScalePercent" ? "图片缩放" : field === "offsetXPercent" ? "水平偏移" : "垂直偏移"}`,
          reason: "当前母模板合同没有可无损表达该页面覆盖的基础字段，请在模板设计中调整。",
        });
      }
    }
  }

  if (conflicts.length === 0 && promoted.length > 0) {
    const validation = validateDynamicTemplateDefinition(nextDefinition);
    if (!validation.valid || !validation.definition) {
      blockers.push(validation.issues.find((issue) => issue.level === "error")?.message
        ?? "提取后的母模板草稿未通过结构校验。");
    } else {
      return {
        definition: validation.definition,
        promoted,
        alreadyApplied,
        skipped,
        conflicts,
        blockers,
      };
    }
  }

  return { definition: nextDefinition, promoted, alreadyApplied, skipped, conflicts, blockers };
}
