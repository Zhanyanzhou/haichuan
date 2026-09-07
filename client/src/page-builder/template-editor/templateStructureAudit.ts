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

export type TemplateStructureIssueLevel = "error" | "warning";

export interface TemplateStructureIssue {
  code: string;
  level: TemplateStructureIssueLevel;
  message: string;
  nodeId?: string;
  roleId?: string;
  device?: "desktop" | "mobile";
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
      let requiredSlotComplete = true;
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
      if (node.hidden) {
        requiredSlotComplete = false;
        issues.push({
          code: "REQUIRED_SLOT_HIDDEN",
          level: "error",
          message: `必填槽位“${slot.label}”已隐藏。`,
          nodeId: node.nodeId,
          repair: "restore-required-slot",
        });
      } else {
        const hiddenDevices = (["desktop", "mobile"] as const).filter(
          (device) => node.responsive[device].display === "none",
        );
        if (hiddenDevices.length > 0) requiredSlotComplete = false;
        for (const device of hiddenDevices) {
          issues.push({
            code: "REQUIRED_SLOT_DEVICE_HIDDEN",
            level: "error",
            message: `必填槽位“${slot.label}”在对应画布布局中已隐藏。`,
            nodeId: node.nodeId,
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
