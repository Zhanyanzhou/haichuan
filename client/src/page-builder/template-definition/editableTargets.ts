import type {
  ContentTemplateContract,
  ContentTemplateEditableCapability,
  ContentTemplateEditableObject,
  ContentTemplateSkeletonRole,
} from "../generated/contentTemplates.generated";
import { getTemplateContractNodeLabel } from "../runtime/contentTemplateRolePresentation";
import type {
  DynamicTemplateSlotDefinition,
  TemplateDefinitionV2,
} from "./generated/templateDefinition.generated";
import type {
  DynamicTemplateRenderPlan,
  DynamicTemplateRenderPlanNode,
} from "./renderPlan";
import { getContentTemplateModuleTypeForSlotType } from "./validateTemplateDefinition";
import { getDynamicTemplateStructureProtectedNodeIds } from "./validateTemplateDefinition";

export type EditableTargetSource = "definition-node" | "builtin-contract-role";

export type EditableTargetKind =
  | "media"
  | "title"
  | "description"
  | "text"
  | "action"
  | "product"
  | "collection"
  | "business"
  | "structured";

export type EditableTargetCapability =
  | "select"
  | "structure"
  | ContentTemplateEditableCapability;

export type EditableTargetLocatorAttribute =
  | "data-template-node-id"
  | "data-template-slot-id"
  | "data-content-role"
  | "data-content-role-desktop"
  | "data-content-role-mobile"
  | "data-editor-field";

export interface EditableTargetDescriptor {
  targetId: string;
  source: EditableTargetSource;
  ownerNodeId: string;
  parentTargetId?: string;
  slotId?: string;
  contractRoleId?: string;
  kind: EditableTargetKind;
  label: string;
  capabilities: readonly EditableTargetCapability[];
  locator: {
    attributes: readonly EditableTargetLocatorAttribute[];
    value: string;
  };
}

export type ExplicitCompatibilityContractResolver = (
  moduleType: string,
) => ContentTemplateContract | undefined;

const STRUCTURE_LOCKED_CAPABILITIES = new Set<EditableTargetCapability>([
  "structure",
  "layout",
  "layer",
  "visibility",
  "ratio",
  "size",
  "position",
  "fit",
  "zoom",
  "typography",
]);

function slotKind(slot: DynamicTemplateSlotDefinition | undefined): EditableTargetKind {
  if (!slot) return "structured";
  if (["image", "video", "carousel", "hotspot", "beforeAfter"].includes(slot.type)) {
    return "media";
  }
  if (slot.type === "heading") return "title";
  if (["text", "richText"].includes(slot.type)) return "description";
  if (["badge", "icon"].includes(slot.type)) return "text";
  if (["button", "link", "appointment"].includes(slot.type)) return "action";
  if (["product", "productCard", "productCollection"].includes(slot.type)) return "product";
  if (["collection", "categoryCollection"].includes(slot.type)) return "collection";
  return "structured";
}

function contractRoleKind(
  object: ContentTemplateEditableObject,
  role: ContentTemplateSkeletonRole | undefined,
): EditableTargetKind {
  if (object.kind === "media" || object.kind === "video") return "media";
  if (object.kind === "action") return "action";
  if (object.kind === "product") return "product";
  if (object.kind === "collection") return "collection";
  if (role === "title") return "title";
  if (role === "subtitle") return "description";
  return object.kind === "text" ? "text" : "structured";
}

export function getExplicitContractRolePresentation(
  contract: ContentTemplateContract | undefined,
  roleId: string,
) {
  const object = contract?.editorCapabilities.editableObjects.find((candidate) =>
    candidate.roleId === roleId || candidate.nodeIds?.includes(roleId),
  );
  if (!object || !contract) return undefined;
  const contractRole = contract.roles.find((candidate) => candidate.id === roleId)
    ?? contract.roles.find((candidate) => candidate.id === object.roleId);
  const geometryRole = (["desktop", "mobile"] as const)
    .flatMap((viewport) => contract.defaultGeometryByViewport[viewport].zones)
    .find((zone) => zone.nodeId === roleId)?.role;
  return {
    kind: contractRoleKind(object, geometryRole ?? contractRole?.role),
    label: object.kind === "video"
      ? "视频槽位"
      : getTemplateContractNodeLabel(roleId, object.roleId),
    object,
  };
}

function contractObjectRoleIds(
  contract: ContentTemplateContract,
  object: ContentTemplateEditableObject,
) {
  if (object.nodeIds?.length) return [...object.nodeIds];
  const ids = new Set<string>();
  for (const viewport of ["desktop", "mobile"] as const) {
    contract.defaultGeometryByViewport[viewport].zones.forEach((zone) => {
      if (zone.roleId === object.roleId) ids.add(zone.nodeId);
    });
  }
  if (ids.size === 0) ids.add(object.roleId);
  return [...ids];
}

function definitionCapabilities(
  slot: DynamicTemplateSlotDefinition | undefined,
  structureProtected: boolean,
): EditableTargetCapability[] {
  const capabilities: EditableTargetCapability[] = ["select"];
  if (slot?.editable) capabilities.push("content");
  if (!structureProtected) {
    capabilities.push("layout", "structure");
    if (!slot?.required && (slot?.hideable ?? true)) capabilities.push("visibility");
  }
  return capabilities;
}

function contractCapabilities(
  object: ContentTemplateEditableObject,
  structureProtected: boolean,
): EditableTargetCapability[] {
  const capabilities: EditableTargetCapability[] = ["select", ...object.capabilities];
  return structureProtected
    ? capabilities.filter((capability) => !STRUCTURE_LOCKED_CAPABILITIES.has(capability))
    : capabilities;
}

function flattenPlan(
  node: DynamicTemplateRenderPlanNode,
  parentNodeId: string | undefined,
  result: Array<{ node: DynamicTemplateRenderPlanNode; parentNodeId?: string }> = [],
) {
  result.push({ node, ...(parentNodeId ? { parentNodeId } : {}) });
  node.children.forEach((child) => flattenPlan(child, node.nodeId, result));
  return result;
}

function canonicalSerializableValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalSerializableValue).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalSerializableValue(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function compiledSlotMatchesDefinition(
  definitionSlot: DynamicTemplateSlotDefinition | undefined,
  compiledSlot: DynamicTemplateSlotDefinition | undefined,
) {
  if (!definitionSlot || !compiledSlot) return definitionSlot === compiledSlot;
  return canonicalSerializableValue(definitionSlot) === canonicalSerializableValue(compiledSlot);
}

function compiledPlanMatchesDefinition(
  definition: TemplateDefinitionV2,
  compiledPlan: DynamicTemplateRenderPlan,
) {
  if (
    compiledPlan.templateId !== definition.templateId
    || compiledPlan.schemaVersion !== definition.schemaVersion
    || compiledPlan.name !== definition.name
    || compiledPlan.root.nodeId !== definition.rootNodeId
  ) return false;
  const visited = new Set<string>();
  const visit = (planNode: DynamicTemplateRenderPlanNode): boolean => {
    const node = definition.nodes[planNode.nodeId];
    const definitionSlot = node?.slotId ? definition.slots[node.slotId] : undefined;
    if (
      !node
      || visited.has(node.nodeId)
      || planNode.type !== node.type
      || planNode.name !== node.name
      || planNode.slotId !== node.slotId
      || Boolean(node.slotId) !== Boolean(definitionSlot)
      || Boolean(node.slotId) !== Boolean(planNode.slot)
      || !compiledSlotMatchesDefinition(definitionSlot, planNode.slot)
      || planNode.children.length !== node.childIds.length
      || planNode.children.some((child, index) => child.nodeId !== node.childIds[index])
    ) return false;
    visited.add(node.nodeId);
    return planNode.children.every(visit);
  };
  return visit(compiledPlan.root) && visited.size === Object.keys(definition.nodes).length;
}

/**
 * 从正式模板结构和当前节点显式引用的内置合同生成编辑 sidecar。
 * 本函数不读取 DOM，也不保存独立目标注册表；公开 Renderer 不需要调用它。
 */
export function resolveEditableTargets(
  definition: TemplateDefinitionV2,
  compiledPlan: DynamicTemplateRenderPlan,
  resolveCompatibilityContract?: ExplicitCompatibilityContractResolver,
): EditableTargetDescriptor[] {
  if (!compiledPlanMatchesDefinition(definition, compiledPlan)) return [];

  const protectedNodeIds = getDynamicTemplateStructureProtectedNodeIds(definition);
  const descriptors: EditableTargetDescriptor[] = [];
  const seenTargetIds = new Set<string>();

  for (const { node, parentNodeId } of flattenPlan(compiledPlan.root, undefined)) {
    const slot = node.slotId ? definition.slots[node.slotId] : undefined;
    const nodeTargetId = `node:${node.nodeId}`;
    descriptors.push({
      targetId: nodeTargetId,
      source: "definition-node",
      ownerNodeId: node.nodeId,
      ...(parentNodeId ? { parentTargetId: `node:${parentNodeId}` } : {}),
      ...(node.slotId ? { slotId: node.slotId } : {}),
      kind: slotKind(slot),
      label: definition.nodes[node.nodeId].name,
      capabilities: definitionCapabilities(slot, protectedNodeIds.has(node.nodeId)),
      locator: {
        attributes: node.slotId ? ["data-template-slot-id"] : ["data-template-node-id"],
        value: node.slotId ?? node.nodeId,
      },
    });
    seenTargetIds.add(nodeTargetId);

    const moduleType = slot ? getContentTemplateModuleTypeForSlotType(slot.type) : undefined;
    const contract = moduleType && resolveCompatibilityContract
      ? resolveCompatibilityContract(moduleType)
      : undefined;
    if (!slot || !moduleType || !contract || contract.moduleType !== moduleType) continue;

    for (const object of contract.editorCapabilities.editableObjects) {
      for (const roleId of contractObjectRoleIds(contract, object)) {
        const targetId = `role:${node.nodeId}:${roleId}`;
        if (seenTargetIds.has(targetId)) continue;
        const presentation = getExplicitContractRolePresentation(contract, roleId);
        if (!presentation) continue;
        seenTargetIds.add(targetId);
        descriptors.push({
          targetId,
          source: "builtin-contract-role",
          ownerNodeId: node.nodeId,
          parentTargetId: nodeTargetId,
          slotId: slot.slotId,
          contractRoleId: roleId,
          kind: presentation.kind,
          label: presentation.label,
          capabilities: contractCapabilities(object, protectedNodeIds.has(node.nodeId)),
          locator: {
            attributes: [
              "data-content-role",
              "data-content-role-desktop",
              "data-content-role-mobile",
              "data-editor-field",
            ],
            value: roleId,
          },
        });
      }
    }
  }

  return descriptors;
}

export function editableTargetToVisualKind(
  kind: EditableTargetKind,
): "media" | "text" | "action" | "product" | "structured" {
  if (kind === "media") return "media";
  if (["title", "description", "text"].includes(kind)) return "text";
  if (kind === "action") return "action";
  if (kind === "product") return "product";
  return "structured";
}

export function getEditableTargetCompactLabel(target: EditableTargetDescriptor): string {
  if (target.kind === "media") return target.label.includes("视频") ? "视频" : "图片";
  if (target.kind === "title") return "标题";
  if (target.kind === "description") return "描述";
  if (target.kind === "action") return "按钮";
  if (target.kind === "product") return "商品";
  if (target.kind === "collection") return "集合";
  if (target.kind === "business") return "业务";
  if (target.kind === "text") return "文字";
  return "内容";
}
