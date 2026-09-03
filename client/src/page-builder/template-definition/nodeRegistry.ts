import {
  DYNAMIC_TEMPLATE_NODE_TYPES,
  DYNAMIC_TEMPLATE_SLOT_TYPES,
  getDynamicTemplateNodeRegistryEntry,
  type TemplateDefinitionV2,
  type DynamicTemplateInstanceEditPolicy,
  type DynamicTemplateNode,
  type DynamicTemplateNodeType,
  type DynamicTemplateResponsiveRules,
  type DynamicTemplateSlotDefinition,
  type DynamicTemplateSlotType,
} from "./generated/templateDefinition.generated";
import { RESPONSIVE_CANVAS } from "../config/blockContracts";

export const DYNAMIC_TEMPLATE_STRUCTURE_NODE_TYPES = DYNAMIC_TEMPLATE_NODE_TYPES.filter(
  (type) => getDynamicTemplateNodeRegistryEntry(type).kind === "structure",
);

export const DYNAMIC_TEMPLATE_CONTENT_NODE_TYPES = DYNAMIC_TEMPLATE_NODE_TYPES.filter(
  (type) => getDynamicTemplateNodeRegistryEntry(type).kind === "slot",
);

function defaultInstanceEditPolicy(slot: DynamicTemplateSlotDefinition): DynamicTemplateInstanceEditPolicy {
  const image = slot.type === "image";
  return {
    position: false,
    size: false,
    zIndex: false,
    imageFit: image,
    imageFocus: image,
    typography: false,
    spacing: false,
    minWidthPercent: 25,
    maxWidthPercent: 150,
    maxOffsetPercent: 30,
    minFontSizePx: 12,
    maxFontSizePx: 96,
    maxSpacingPx: 120,
  };
}

export function getEffectiveDynamicTemplateInstanceEditPolicy(
  node: DynamicTemplateNode,
  slot?: DynamicTemplateSlotDefinition,
): DynamicTemplateInstanceEditPolicy | null {
  if (!slot?.editable || !isDynamicTemplateSlotNode(node.type)) return null;
  return {
    ...defaultInstanceEditPolicy(slot),
    ...(node.instanceEditPolicy ?? {}),
  };
}

export function isDynamicTemplateSlotNode(type: DynamicTemplateNodeType): boolean {
  return getDynamicTemplateNodeRegistryEntry(type).kind === "slot";
}

export function canNestDynamicTemplateNode(
  parentType: DynamicTemplateNodeType,
  childType: DynamicTemplateNodeType,
): boolean {
  const parent = getDynamicTemplateNodeRegistryEntry(parentType);
  const child = getDynamicTemplateNodeRegistryEntry(childType);
  return parent.canHaveChildren && !child.rootOnly && child.allowedParents.includes(parentType);
}

export function getAllowedDynamicTemplateChildTypes(
  parentType: DynamicTemplateNodeType,
): DynamicTemplateNodeType[] {
  return DYNAMIC_TEMPLATE_NODE_TYPES.filter((type) => canNestDynamicTemplateNode(parentType, type));
}

export function createDynamicTemplateStableId(prefix: "tpl" | "node" | "slot"): string {
  return `${prefix}_${globalThis.crypto.randomUUID().replace(/-/g, "")}`;
}

export function createDefaultDynamicTemplateResponsiveRules(
  type: DynamicTemplateNodeType,
): DynamicTemplateResponsiveRules {
  const isRow = type === "Row";
  const isFlex = isRow || type === "Column" || type === "Stack";
  const isGrid = type === "Grid";
  return {
    display: isGrid ? "grid" : isFlex ? "flex" : "block",
    ...(isFlex ? { direction: isRow ? "row" as const : "column" as const } : {}),
    order: 0,
    width: "fill",
    height: { mode: "auto" },
    ...(isGrid ? { columns: [1, 1] } : {}),
  };
}

export function createDynamicTemplateNode(
  type: DynamicTemplateNodeType,
  name: string,
  slotId?: string,
): DynamicTemplateNode {
  const nodeId = createDynamicTemplateStableId("node");
  const responsive = createDefaultDynamicTemplateResponsiveRules(type);
  const slotNode = isDynamicTemplateSlotNode(type);
  return {
    nodeId,
    type,
    name,
    ...(slotId ? { slotId } : {}),
    childIds: [],
    props: {},
    ...(slotNode ? {
      instanceEditPolicy: {
        position: false,
        size: false,
        zIndex: false,
        imageFit: type === "ImageSlot",
        imageFocus: type === "ImageSlot",
        typography: false,
        spacing: false,
        minWidthPercent: 25,
        maxWidthPercent: 150,
        maxOffsetPercent: 30,
        minFontSizePx: 12,
        maxFontSizePx: 96,
        maxSpacingPx: 120,
      },
    } : {}),
    responsive: {
      desktop: structuredClone(responsive),
      mobile: structuredClone(responsive),
    },
    hidden: false,
  };
}

export function createDynamicTemplateSlotDefinition(
  type: DynamicTemplateSlotType,
  label: string,
  key: string,
): DynamicTemplateSlotDefinition {
  const defaultDesktopRules = type === "image"
    ? { aspectRatio: "16:9", objectFit: "cover" as const, objectPosition: "center center" }
    : {};
  const defaultMobileRules = type === "image"
    ? { aspectRatio: "4:5", objectFit: "cover" as const, objectPosition: "center center" }
    : {};
  return {
    slotId: createDynamicTemplateStableId("slot"),
    key,
    type,
    label,
    required: false,
    editable: true,
    hideable: true,
    validation: {},
    desktopRules: defaultDesktopRules,
    mobileRules: defaultMobileRules,
  };
}

export function createBlankDynamicTemplateDefinition(
  name = "未命名模板",
): TemplateDefinitionV2 {
  const root = createDynamicTemplateNode("Section", "模板根节点");
  return {
    schemaVersion: 1,
    templateId: createDynamicTemplateStableId("tpl"),
    name,
    description: "",
    metadata: {
      category: "未分类",
      purpose: "自定义内容展示",
      layoutType: "空白结构",
      slotSummary: "暂无内容槽位",
      recommendedFor: ["home"],
      desktopRatio: "auto",
      mobileRatio: "auto",
      previewDesktopWidth: RESPONSIVE_CANVAS.desktop.width,
      previewMobileWidth: RESPONSIVE_CANVAS.mobile.width,
      mobileBreakpoint: 767,
      minViewportWidth: 320,
      maxViewportWidth: 1920,
      defaultBackgroundToken: "surface",
      visualRole: "support-stage",
      headerCompatibility: ["solid"],
      tags: [],
    },
    rootNodeId: root.nodeId,
    nodes: { [root.nodeId]: root },
    slots: {},
    defaultContent: {},
    previewContent: {},
  };
}

export function getDynamicTemplateNodeTypeForSlot(
  slotType: DynamicTemplateSlotType,
): DynamicTemplateNodeType {
  const type = DYNAMIC_TEMPLATE_NODE_TYPES.find((candidate) => (
    getDynamicTemplateNodeRegistryEntry(candidate).slotType === slotType
  ));
  if (!type) throw new Error(`未登记的母模板槽位类型：${slotType}`);
  return type;
}

export function isDynamicTemplateSlotTypeValue(value: string): value is DynamicTemplateSlotType {
  return (DYNAMIC_TEMPLATE_SLOT_TYPES as readonly string[]).includes(value);
}
