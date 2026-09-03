import type {
  TemplateDefinitionV2,
  DynamicTemplateDevice,
  DynamicTemplateNodeType,
  DynamicTemplateResponsiveRules,
  DynamicTemplateSlotDefinition,
  TemplateInstanceLayoutOverride,
  TemplateInstanceLayoutOverridesByNodeId,
} from "./generated/templateDefinition.generated";
import {
  validateDynamicTemplateDefinition,
  type DynamicTemplateValidationIssue,
} from "./validateTemplateDefinition";
import { getEffectiveDynamicTemplateInstanceEditPolicy } from "./nodeRegistry";
import { getEffectiveTemplateRootRules } from "./templateDimensions";

export interface DynamicTemplateRenderPlanNode {
  nodeId: string;
  type: DynamicTemplateNodeType;
  name: string;
  slotId?: string;
  slot?: DynamicTemplateSlotDefinition;
  slotRules?: DynamicTemplateSlotDefinition["desktopRules"];
  content?: unknown;
  rules: DynamicTemplateResponsiveRules;
  props: TemplateDefinitionV2["nodes"][string]["props"];
  hidden: boolean;
  layoutOverride?: TemplateInstanceLayoutOverride;
  instanceEditPolicy?: NonNullable<ReturnType<typeof getEffectiveDynamicTemplateInstanceEditPolicy>>;
  children: DynamicTemplateRenderPlanNode[];
}

export interface DynamicTemplateRenderPlan {
  templateId: string;
  schemaVersion: number;
  name: string;
  metadata: TemplateDefinitionV2["metadata"];
  device: DynamicTemplateDevice;
  root: DynamicTemplateRenderPlanNode;
}

export type CompileDynamicTemplateRenderPlanResult =
  | { ok: true; plan: DynamicTemplateRenderPlan; issues: DynamicTemplateValidationIssue[] }
  | { ok: false; issues: DynamicTemplateValidationIssue[] };

export interface CompileDynamicTemplateRenderPlanOptions {
  device: DynamicTemplateDevice;
  contentBySlotId?: Record<string, unknown>;
  hiddenSlotIds?: readonly string[];
  layoutOverridesByNodeId?: TemplateInstanceLayoutOverridesByNodeId;
  /** 编辑器与预览可保留空槽位占位；公开渲染必须保持 false。 */
  showEmptySlots?: boolean;
}

function hasMeaningfulTemplateContent(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasMeaningfulTemplateContent);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasMeaningfulTemplateContent);
  }
  // 数值和布尔值通常是组件行为参数，不能单独构成可展示的业务内容。
  return false;
}

export function compileDynamicTemplateRenderPlan(
  input: unknown,
  options: CompileDynamicTemplateRenderPlanOptions,
): CompileDynamicTemplateRenderPlanResult {
  const validation = validateDynamicTemplateDefinition(input);
  if (!validation.valid || !validation.definition) {
    return { ok: false, issues: validation.issues };
  }
  const definition = validation.definition;
  const hiddenSlotIds = new Set(options.hiddenSlotIds ?? []);
  const instanceContent = options.contentBySlotId ?? {};

  const compileNode = (nodeId: string): DynamicTemplateRenderPlanNode => {
    const node = definition.nodes[nodeId];
    const slot = node.slotId ? definition.slots[node.slotId] : undefined;
    const hasInstanceContent = Boolean(node.slotId
      && Object.prototype.hasOwnProperty.call(instanceContent, node.slotId));
    const instanceValue = node.slotId && hasInstanceContent
      ? instanceContent[node.slotId]
      : undefined;
    const defaultValue = node.slotId ? definition.defaultContent[node.slotId] : undefined;
    const content = slot && hasInstanceContent
      && slot.emptyPolicy === "use-default"
      && !hasMeaningfulTemplateContent(instanceValue)
      ? defaultValue
      : hasInstanceContent
        ? instanceValue
        : defaultValue;
    const emptySlotHidden = Boolean(slot
      && !options.showEmptySlots
      && !hasMeaningfulTemplateContent(content));
    const policy = getEffectiveDynamicTemplateInstanceEditPolicy(node, slot);
    const rawLayoutOverride = options.layoutOverridesByNodeId?.[nodeId]?.[options.device];
    const layoutOverride = policy && rawLayoutOverride ? {
      ...(policy.position && typeof rawLayoutOverride.offsetXPercent === "number" && Number.isFinite(rawLayoutOverride.offsetXPercent)
        ? { offsetXPercent: Math.max(-policy.maxOffsetPercent, Math.min(policy.maxOffsetPercent, rawLayoutOverride.offsetXPercent)) }
        : {}),
      ...(policy.position && typeof rawLayoutOverride.offsetYPercent === "number" && Number.isFinite(rawLayoutOverride.offsetYPercent)
        ? { offsetYPercent: Math.max(-policy.maxOffsetPercent, Math.min(policy.maxOffsetPercent, rawLayoutOverride.offsetYPercent)) }
        : {}),
      ...(policy.size && typeof rawLayoutOverride.widthPercent === "number" && Number.isFinite(rawLayoutOverride.widthPercent)
        ? { widthPercent: Math.max(policy.minWidthPercent, Math.min(policy.maxWidthPercent, rawLayoutOverride.widthPercent)) }
        : {}),
      ...(policy.zIndex && Number.isInteger(rawLayoutOverride.zIndex)
        ? { zIndex: Math.max(-10, Math.min(10, rawLayoutOverride.zIndex!)) }
        : {}),
      ...(policy.imageFit && slot?.type === "image" && ["cover", "contain", "fill"].includes(String(rawLayoutOverride.objectFit))
        ? { objectFit: rawLayoutOverride.objectFit }
        : {}),
      ...(policy.imageFit && slot?.type === "image" && typeof rawLayoutOverride.imageScalePercent === "number" && Number.isFinite(rawLayoutOverride.imageScalePercent)
        ? { imageScalePercent: Math.max(100, Math.min(200, rawLayoutOverride.imageScalePercent)) }
        : {}),
      ...(policy.imageFocus && slot?.type === "image" && typeof rawLayoutOverride.focusXPercent === "number" && Number.isFinite(rawLayoutOverride.focusXPercent)
        ? { focusXPercent: Math.max(0, Math.min(100, rawLayoutOverride.focusXPercent)) }
        : {}),
      ...(policy.imageFocus && slot?.type === "image" && typeof rawLayoutOverride.focusYPercent === "number" && Number.isFinite(rawLayoutOverride.focusYPercent)
        ? { focusYPercent: Math.max(0, Math.min(100, rawLayoutOverride.focusYPercent)) }
        : {}),
      ...(policy.typography && slot && ["heading", "text", "richText", "badge"].includes(slot.type)
        && typeof rawLayoutOverride.fontSizePx === "number" && Number.isFinite(rawLayoutOverride.fontSizePx)
        ? { fontSizePx: Math.max(policy.minFontSizePx ?? 12, Math.min(policy.maxFontSizePx ?? 96, rawLayoutOverride.fontSizePx)) }
        : {}),
      ...(policy.typography && slot && ["heading", "text", "richText", "badge"].includes(slot.type)
        && ["left", "center", "right"].includes(String(rawLayoutOverride.textAlign))
        ? { textAlign: rawLayoutOverride.textAlign }
        : {}),
      ...(policy.spacing && slot && ["heading", "text", "richText", "badge"].includes(slot.type)
        && typeof rawLayoutOverride.marginTopPx === "number" && Number.isFinite(rawLayoutOverride.marginTopPx)
        ? { marginTopPx: Math.max(0, Math.min(policy.maxSpacingPx ?? 120, rawLayoutOverride.marginTopPx)) }
        : {}),
      ...(policy.spacing && slot && ["heading", "text", "richText", "badge"].includes(slot.type)
        && typeof rawLayoutOverride.marginBottomPx === "number" && Number.isFinite(rawLayoutOverride.marginBottomPx)
        ? { marginBottomPx: Math.max(0, Math.min(policy.maxSpacingPx ?? 120, rawLayoutOverride.marginBottomPx)) }
        : {}),
    } : undefined;
    return {
      nodeId,
      type: node.type,
      name: node.name,
      ...(node.slotId ? { slotId: node.slotId } : {}),
      ...(slot ? { slot } : {}),
      ...(slot ? { slotRules: options.device === "desktop" ? slot.desktopRules : slot.mobileRules } : {}),
      ...(node.slotId && (hasInstanceContent
        || Object.prototype.hasOwnProperty.call(definition.defaultContent, node.slotId))
        ? { content }
        : {}),
      rules: nodeId === definition.rootNodeId
        ? getEffectiveTemplateRootRules(definition, options.device)
        : node.responsive[options.device],
      props: node.props,
      hidden: node.hidden || node.responsive[options.device].display === "none"
        || Boolean(node.slotId && hiddenSlotIds.has(node.slotId))
        || emptySlotHidden,
      ...(layoutOverride && Object.keys(layoutOverride).length > 0 ? { layoutOverride } : {}),
      ...(policy ? { instanceEditPolicy: policy } : {}),
      children: node.childIds.map(compileNode),
    };
  };

  return {
    ok: true,
    issues: validation.issues,
    plan: {
      templateId: definition.templateId,
      schemaVersion: definition.schemaVersion,
      name: definition.name,
      metadata: definition.metadata,
      device: options.device,
      root: compileNode(definition.rootNodeId),
    },
  };
}
