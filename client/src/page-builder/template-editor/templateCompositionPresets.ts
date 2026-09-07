import { getContentTemplateContract, getContentTemplateDefaultRect } from "../generated/contentTemplates.generated";
import { getDynamicTemplateStructureLockOwnerId, type TemplateDefinitionV2 } from "../template-definition";
import { getContentTemplateModuleTypeForSlotType } from "../template-definition/validateTemplateDefinition";
import { resolveVisualNode, setVisualOverridePath, type VisualRect } from "../runtime/visualLayout";

export type CompositionLayout = "text-left" | "media-left" | "media-top" | "text-top";
export type CompositionAlignment = "start" | "center" | "end";
export type CompositionSpacing = "compact" | "standard" | "spacious";
type Device = "desktop" | "mobile";

/** 快捷选择只生成现有合同的几何覆盖，不保存另一份预设状态。 */
export function getTemplateComposition(definition: TemplateDefinitionV2, selectedId: string, device: Device) {
  const candidates = Object.values(definition.nodes).filter((node) => {
    let current: string | undefined = node.nodeId;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      if (current === selectedId) return true;
      visited.add(current);
      const child: string = current;
      current = Object.values(definition.nodes).find((parent) => parent.childIds.includes(child))?.nodeId;
    }
    return false;
  }).flatMap((node) => {
    const slot = node.slotId ? definition.slots[node.slotId] : undefined;
    const moduleType = slot ? getContentTemplateModuleTypeForSlotType(slot.type) : undefined;
    const contract = moduleType ? getContentTemplateContract(moduleType) : undefined;
    if (!contract || !moduleType) return [];
    const objects = contract.editorCapabilities.editableObjects.filter((object) => {
      const role = contract.roles.find((item) => item.id === object.roleId);
      return !role?.appliesTo || role.appliesTo.includes(device);
    });
    const media = objects.filter((object) => object.kind === "media" || object.kind === "video");
    const copy = objects.filter((object) => object.kind === "text");
    // 只对单媒体和单文案构图显示快捷入口，多图与复杂叙事继续使用其原有控件。
    if (media.length !== 1 || copy.length !== 1) return [];
    if (objects.some((object) => object.kind === "action"
      && contract.roles.find((role) => role.id === object.roleId)?.parentRole !== copy[0].roleId)) return [];
    const participants = [media[0], copy[0]];
    if (participants.some((object) => !object.capabilities.includes("layout")
      || (object.capabilityViewports?.layout && !object.capabilityViewports.layout.includes(device)))) return [];
    const rect = (roleId: string) => resolveVisualNode({ __instanceOverrides: node.props.contentTemplateLayoutData }, roleId, device).rect
      ?? getContentTemplateDefaultRect(moduleType, roleId, device);
    const mediaRect = rect(media[0].roleId);
    const copyRect = rect(copy[0].roleId);
    if (!mediaRect || !copyRect) return [];
    let layout: CompositionLayout | "custom" = "custom";
    const tolerance = 0.002;
    if (copyRect.x + copyRect.width <= mediaRect.x + tolerance) layout = "text-left";
    else if (mediaRect.x + mediaRect.width <= copyRect.x + tolerance) layout = "media-left";
    else if (mediaRect.y + mediaRect.height <= copyRect.y + tolerance) layout = "media-top";
    else if (copyRect.y + copyRect.height <= mediaRect.y + tolerance) layout = "text-top";
    const ratio = copyRect.width / (copyRect.width + mediaRect.width);
    return [{ node, contract, moduleType, media: media[0], copy: copy[0], mediaRect, copyRect, layout, ratio,
      locked: getDynamicTemplateStructureLockOwnerId(definition, node.nodeId) !== null }];
  });
  return candidates.length === 1 ? candidates[0] : null;
}

export type TemplateComposition = NonNullable<ReturnType<typeof getTemplateComposition>>;

export function resetTemplateComposition(definition: TemplateDefinitionV2, selectedId: string, device: Device) {
  const composition = getTemplateComposition(definition, selectedId, device);
  if (!composition || composition.locked) return;
  let data = composition.node.props.contentTemplateLayoutData;
  for (const role of [composition.media, composition.copy]) {
    data = setVisualOverridePath(data, ["nodes", role.roleId, "rectByViewport", device], undefined);
    data = setVisualOverridePath(data, ["nodes", role.roleId, "sizeCompatibilityByViewport", device], undefined);
  }
  if (data) composition.node.props.contentTemplateLayoutData = data;
  else delete composition.node.props.contentTemplateLayoutData;
}

export function applyTemplateComposition(
  definition: TemplateDefinitionV2,
  selectedId: string,
  device: Device,
  options: { layout?: CompositionLayout; ratio?: number; alignment?: CompositionAlignment; spacing?: CompositionSpacing },
) {
  const composition = getTemplateComposition(definition, selectedId, device);
  if (!composition || composition.locked) return;
  const { node, contract, media, copy, mediaRect, copyRect } = composition;
  const safe = contract.defaultGeometryByViewport[device].safeArea;
  const layout = options.layout ?? (composition.layout === "custom" ? (device === "desktop" ? "text-left" : "media-top") : composition.layout);
  const isHorizontal = layout === "text-left" || layout === "media-left";
  const ratio = options.ratio ?? (composition.layout === "custom" ? 0.4 : composition.ratio);
  const inset = options.spacing === "compact" ? 0 : options.spacing === "spacious" ? 0.05 : options.spacing === "standard" ? 0.025
    : Math.max(0, Math.min(mediaRect.x, copyRect.x) - safe.x);
  const area = { x: safe.x + inset, y: safe.y + inset, width: safe.width - inset * 2, height: safe.height - inset * 2 };
  const gap = 0.04;
  const copyHeight = Math.min(copy.constraints.maxSize.height, Math.max(copy.constraints.minSize.height, 0.3));
  let nextMedia: VisualRect;
  let nextCopy: VisualRect;
  if (isHorizontal) {
    const copyWidth = (area.width - gap) * Math.max(0.25, Math.min(0.65, ratio));
    const mediaWidth = area.width - gap - copyWidth;
    const offset = options.alignment === "start" ? 0 : options.alignment === "end" ? 1 : options.alignment === "center" ? 0.5
      : composition.layout === "custom" ? 0.5 : Math.max(0, Math.min(1, (copyRect.y - mediaRect.y) / Math.max(0.001, mediaRect.height - copyRect.height)));
    nextMedia = { x: layout === "text-left" ? area.x + copyWidth + gap : area.x, y: area.y, width: mediaWidth, height: area.height };
    nextCopy = { x: layout === "text-left" ? area.x : area.x + mediaWidth + gap, y: area.y + (area.height - copyHeight) * offset, width: copyWidth, height: copyHeight };
  } else {
    const mediaHeight = area.height - copyHeight - gap;
    nextMedia = { x: area.x, y: layout === "media-top" ? area.y : area.y + copyHeight + gap, width: area.width, height: mediaHeight };
    nextCopy = { x: area.x, y: layout === "media-top" ? area.y + mediaHeight + gap : area.y, width: area.width, height: copyHeight };
  }
  const valid = (rect: VisualRect, object: typeof media | typeof copy) => rect.width >= object.constraints.minSize.width
    && rect.width <= object.constraints.maxSize.width && rect.height >= object.constraints.minSize.height
    && rect.height <= object.constraints.maxSize.height;
  if (!valid(nextMedia, media) || !valid(nextCopy, copy)) return;
  let data = setVisualOverridePath(node.props.contentTemplateLayoutData, ["nodes", media.roleId, "rectByViewport", device], nextMedia);
  data = setVisualOverridePath(data, ["nodes", copy.roleId, "rectByViewport", device], nextCopy);
  for (const role of [media, copy]) data = setVisualOverridePath(data, ["nodes", role.roleId, "sizeCompatibilityByViewport", device], undefined);
  if (data) node.props.contentTemplateLayoutData = data;
}
