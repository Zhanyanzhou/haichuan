import {
  getDynamicTemplateNodeRegistryEntry,
  type DynamicTemplateInstanceEditPolicy,
  type DynamicTemplateNode,
  type DynamicTemplateNodeType,
  type DynamicTemplateSlotDefinition,
  type DynamicTemplateSlotType,
  type TemplateInstanceLayoutOverride,
} from "./generated/templateDefinition.generated";

/** 与客户端 instanceEditPolicy 对齐：字号/间距覆盖只作用于这些槽位。 */
export const TEXT_LAYOUT_SLOT_TYPES: readonly DynamicTemplateSlotType[] = [
  "heading",
  "text",
  "richText",
  "badge",
];

export const LAYOUT_OVERRIDE_FIELDS = [
  "offsetXPercent",
  "offsetYPercent",
  "widthPercent",
  "zIndex",
  "objectFit",
  "imageScalePercent",
  "focusXPercent",
  "focusYPercent",
  "fontSizePx",
  "textAlign",
  "marginTopPx",
  "marginBottomPx",
] as const satisfies ReadonlyArray<keyof TemplateInstanceLayoutOverride>;

export function isDynamicTemplateSlotNode(type: DynamicTemplateNodeType): boolean {
  return getDynamicTemplateNodeRegistryEntry(type).kind === "slot";
}

export function defaultDynamicTemplateInstanceEditPolicy(
  slot: DynamicTemplateSlotDefinition,
): DynamicTemplateInstanceEditPolicy {
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
    ...defaultDynamicTemplateInstanceEditPolicy(slot),
    ...(node.instanceEditPolicy ?? {}),
  };
}

export function isTextLayoutSlotType(type: DynamicTemplateSlotType): boolean {
  return (TEXT_LAYOUT_SLOT_TYPES as readonly string[]).includes(type);
}

export function isLayoutOverrideCapabilityEnabled(
  policy: DynamicTemplateInstanceEditPolicy,
  slot: DynamicTemplateSlotDefinition,
  field: string,
): boolean {
  switch (field) {
    case "offsetXPercent":
    case "offsetYPercent":
      return policy.position === true;
    case "widthPercent":
      return policy.size === true;
    case "zIndex":
      return policy.zIndex === true;
    case "objectFit":
    case "imageScalePercent":
      return Boolean(policy.imageFit) && slot.type === "image";
    case "focusXPercent":
    case "focusYPercent":
      return Boolean(policy.imageFocus) && slot.type === "image";
    case "fontSizePx":
    case "textAlign":
      return Boolean(policy.typography) && isTextLayoutSlotType(slot.type);
    case "marginTopPx":
    case "marginBottomPx":
      return Boolean(policy.spacing) && isTextLayoutSlotType(slot.type);
    default:
      return false;
  }
}
