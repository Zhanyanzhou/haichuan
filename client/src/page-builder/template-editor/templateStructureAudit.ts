import { getContentTemplateContract } from "../generated/contentTemplates.generated";
import {
  getDynamicTemplateNodeRegistryEntry,
  type TemplateDefinitionV2,
} from "../template-definition";
import {
  getContentTemplateModuleTypeForSlotType,
  validateDynamicTemplateDefinition,
} from "../template-definition/validateTemplateDefinition";
import { resolveVisualNode } from "../runtime/visualLayout";
import { resolveTemplateNodeRules, type TemplateBreakpoint } from "../template-definition/responsive";

export type TemplateStructureIssueLevel = "error" | "warning";

export interface TemplateStructureIssue {
  code: string;
  level: TemplateStructureIssueLevel;
  message: string;
  nodeId?: string;
  roleId?: string;
  device?: TemplateBreakpoint;
  repair?: "add-region" | "add-slot" | "restore-required-slot" | "restore-required-slot-device" | "disable-required-slot-page-hide" | "enable-required-slot-page-edit" | "restore-required-role";
}

export interface TemplateStructureAudit {
  issues: TemplateStructureIssue[];
  errorCount: number;
  warningCount: number;
  requiredComplete: number;
  requiredTotal: number;
  regionCount: number;
  slotCount: number;
}

function isRoleRemoved(
  definition: TemplateDefinitionV2,
  nodeId: string,
  roleId: string,
) {
  const layoutData = definition.nodes[nodeId]?.props.contentTemplateLayoutData;
  return resolveVisualNode({ __instanceOverrides: layoutData }, roleId, "desktop").enabled === false;
}

export function buildTemplateStructureAudit(
  definition: TemplateDefinitionV2,
): TemplateStructureAudit {
  const validation = validateDynamicTemplateDefinition(definition);
  const nodeIdBySlotId = new Map(Object.values(definition.nodes).flatMap((node) => (
    node.slotId ? [[node.slotId, node.nodeId] as const] : []
  )));
  const issues: TemplateStructureIssue[] = validation.issues.flatMap((issue) => {
    if (issue.level !== "error" && issue.level !== "warning") return [];
    return [{
      code: issue.code,
      level: issue.level,
      message: issue.message,
      nodeId: issue.nodeId ?? (issue.slotId ? nodeIdBySlotId.get(issue.slotId) : undefined),
      repair: issue.code === "REQUIRED_SLOT_MUST_BE_EDITABLE"
        ? "enable-required-slot-page-edit" as const
        : undefined,
    }];
  });
  const root = definition.nodes[definition.rootNodeId];
  const breakpoints: TemplateBreakpoint[] = definition.schemaVersion === 1
    ? ["desktop", "mobile"] : ["desktop", "tablet", "mobile"];
  const parentByNodeId = new Map(Object.values(definition.nodes).flatMap((node) => (
    node.childIds.map((childId) => [childId, node.nodeId] as const)
  )));
  const ancestorChain = (nodeId: string) => {
    const result: string[] = [];
    const visited = new Set<string>();
    let current: string | undefined = nodeId;
    while (current && definition.nodes[current] && !visited.has(current)) {
      visited.add(current);
      result.unshift(current);
      current = parentByNodeId.get(current);
    }
    return result;
  };
  let requiredComplete = 0;
  let requiredTotal = 0;
  let slotCount = 0;

  for (const node of Object.values(definition.nodes)) {
    const registry = getDynamicTemplateNodeRegistryEntry(node.type);
    if (registry.kind === "structure" && node.nodeId !== definition.rootNodeId && node.childIds.length === 0) {
      issues.push({
        code: "EMPTY_STRUCTURE_NODE",
        level: "warning",
        message: `“${node.name}”还没有内容，请添加槽位或删除空结构。`,
        nodeId: node.nodeId,
      });
    }
    if (registry.kind !== "slot") continue;
    slotCount += 1;
    const slot = node.slotId ? definition.slots[node.slotId] : undefined;
    if (slot?.required) {
      requiredTotal += 1;
      let requiredSlotComplete = slot.editable;
      if (slot.hideable) {
        requiredSlotComplete = false;
        issues.push({
          code: "REQUIRED_SLOT_PAGE_HIDE_CONFLICT",
          level: "error",
          message: `必填槽位“${slot.label}”同时允许页面隐藏。`,
          nodeId: node.nodeId,
          repair: "disable-required-slot-page-hide",
        });
      }
      const ancestors = ancestorChain(node.nodeId);
      const globallyHiddenId = ancestors.find((id) => definition.nodes[id].hidden);
      if (globallyHiddenId) {
        requiredSlotComplete = false;
        issues.push({
          code: "REQUIRED_SLOT_HIDDEN",
          level: "error",
          message: globallyHiddenId === node.nodeId ? `必填槽位“${slot.label}”已隐藏。`
            : `必填槽位“${slot.label}”因上级“${definition.nodes[globallyHiddenId].name}”全局隐藏而不可见。`,
          nodeId: globallyHiddenId,
          repair: "restore-required-slot",
        });
      } else {
        for (const device of breakpoints) {
          const hiddenNodeId = ancestors.find((id) => {
            const rules = resolveTemplateNodeRules(definition, id, device);
            return rules.hidden || rules.display === "none";
          });
          if (!hiddenNodeId) continue;
          requiredSlotComplete = false;
          issues.push({
            code: "REQUIRED_SLOT_DEVICE_HIDDEN",
            level: "error",
            message: `必填槽位“${slot.label}”在${({ desktop: "桌面", tablet: "平板", mobile: "手机" })[device]}不可见${hiddenNodeId === node.nodeId ? "" : `，隐藏来源为上级“${definition.nodes[hiddenNodeId].name}”`}。`,
            nodeId: hiddenNodeId,
            device,
            repair: "restore-required-slot-device",
          });
        }
      }
      if (requiredSlotComplete) requiredComplete += 1;
    }

    const moduleType = slot ? getContentTemplateModuleTypeForSlotType(slot.type) : undefined;
    const contract = moduleType ? getContentTemplateContract(moduleType) : undefined;
    if (!contract) continue;
    for (const object of contract.editorCapabilities.editableObjects) {
      const role = contract.roles.find((candidate) => candidate.id === object.roleId);
      if (!role?.required) continue;
      requiredTotal += 1;
      if (!node.hidden && !isRoleRemoved(definition, node.nodeId, object.roleId)) {
        requiredComplete += 1;
        continue;
      }
      issues.push({
        code: "REQUIRED_CONTRACT_ROLE_REMOVED",
        level: "error",
        message: `“${contract.displayName}”缺少必填内容“${role.semantic ?? role.id}”。`,
        nodeId: node.nodeId,
        roleId: object.roleId,
        repair: "restore-required-role",
      });
    }
  }

  if (!root || root.childIds.length === 0) {
    issues.push({
      code: "MISSING_REGION",
      level: "error",
      message: "模板还没有内容区域，请先添加区域。",
      nodeId: definition.rootNodeId,
      repair: "add-region",
    });
  }
  if (slotCount === 0) {
    issues.push({
      code: "MISSING_SLOT",
      level: "error",
      message: "模板还没有内容槽位，请添加图片、文字、商品或行动槽位。",
      nodeId: definition.rootNodeId,
      repair: "add-slot",
    });
  }

  return {
    issues,
    errorCount: issues.filter((issue) => issue.level === "error").length,
    warningCount: issues.filter((issue) => issue.level === "warning").length,
    requiredComplete,
    requiredTotal,
    regionCount: root?.childIds.length ?? 0,
    slotCount,
  };
}
