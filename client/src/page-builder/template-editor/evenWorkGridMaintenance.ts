/**
 * 带 even-work-grid 标记的作品陈列：新增图片时补到双数，并按张数重排桌面坐标。
 * 删除只重排剩余卡片，不替用户再删一张。
 */
import { addDynamicTemplateNode, type TemplateDefinitionV2 } from "../template-definition";
import {
  EVEN_WORK_GRID_TAG,
  findEvenWorkLayoutId,
  reflowEvenWorkGrid,
  usesEvenWorkGrid,
  type EvenWorkDefinition,
} from "../template-definition/evenWorkGridLayout";

const CAPTION_NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];

function asEvenWork(definition: TemplateDefinitionV2): EvenWorkDefinition {
  return definition as unknown as EvenWorkDefinition;
}

function workChildren(definition: TemplateDefinitionV2, layoutId: string) {
  const images: string[] = [];
  const captions: string[] = [];
  for (const childId of definition.nodes[layoutId]?.childIds ?? []) {
    const node = definition.nodes[childId];
    const slot = node?.slotId ? definition.slots[node.slotId] : undefined;
    if (slot?.type === "image" && slot.semanticRole !== "backgroundImage") images.push(childId);
    else if (slot && (slot.semanticRole === "productName" || slot.key.startsWith("caption"))) captions.push(childId);
  }
  return { images, captions };
}

function unusedKey(definition: TemplateDefinitionV2, preferred: string, ownSlotId: string): string {
  const used = new Set(Object.values(definition.slots).filter((slot) => slot.slotId !== ownSlotId).map((slot) => slot.key));
  if (!used.has(preferred)) return preferred;
  let suffix = 2;
  while (used.has(`${preferred}${suffix}`)) suffix += 1;
  return `${preferred}${suffix}`;
}

function captionName(index: number): string {
  return `作品${CAPTION_NUMERALS[index] ?? String(index + 1)}`;
}

function rememberContent(definition: TemplateDefinitionV2, slotId: string, value: unknown) {
  if (definition.schemaVersion < 3) return;
  definition.defaultContent[slotId] = value;
}

function addImage(definition: TemplateDefinitionV2, layoutId: string): TemplateDefinitionV2 {
  const { images } = workChildren(definition, layoutId);
  const sampleId = images[0];
  const added = addDynamicTemplateNode(definition, layoutId, "ImageSlot");
  const next = added.definition;
  const slotId = added.slotId;
  if (!slotId) return next;
  const slot = next.slots[slotId];
  const index = workChildren(next, layoutId).images.length - 1;
  slot.label = `自定义图片 ${index + 1}`;
  slot.key = unusedKey(next, `content${index + 1}`, slotId);
  slot.semanticRole = "custom";
  slot.desktopRules.aspectRatio = "4:5";
  slot.mobileRules.aspectRatio = "4:5";
  next.nodes[added.nodeId].name = slot.label;
  if (sampleId) {
    const sample = definition.nodes[sampleId];
    next.nodes[added.nodeId].responsive.desktop.height = structuredClone(sample.responsive.desktop.height);
    if (sample.responsive.mobile) {
      next.nodes[added.nodeId].responsive.mobile = structuredClone(sample.responsive.mobile);
      delete next.nodes[added.nodeId].responsive.mobile.placement;
    }
  }
  rememberContent(next, slotId, { src: "", alt: "" });
  return next;
}

function addCaption(definition: TemplateDefinitionV2, layoutId: string, imageIndex: number): TemplateDefinitionV2 {
  const { captions } = workChildren(definition, layoutId);
  const sampleId = captions[0];
  const added = addDynamicTemplateNode(definition, layoutId, "TextSlot");
  const next = added.definition;
  const slotId = added.slotId;
  if (!slotId) return next;
  const slot = next.slots[slotId];
  const label = captionName(imageIndex);
  slot.label = label;
  slot.key = unusedKey(next, `caption${imageIndex + 1}`, slotId);
  slot.semanticRole = "productName";
  next.nodes[added.nodeId].name = label;
  if (sampleId) {
    const sampleSlot = definition.slots[definition.nodes[sampleId].slotId ?? ""];
    if (sampleSlot) {
      slot.desktopRules = structuredClone(sampleSlot.desktopRules);
      slot.mobileRules = structuredClone(sampleSlot.mobileRules);
    }
  }
  rememberContent(next, slotId, label);
  return next;
}

/** 图片张数是奇数时再补一张图和对应品名，然后按 4 张一行、6 张上三下三重排。 */
export function settleEvenWorkGrid(definition: TemplateDefinitionV2): TemplateDefinitionV2 {
  if (!usesEvenWorkGrid(definition)) return definition;
  const layoutId = findEvenWorkLayoutId(asEvenWork(definition));
  if (!layoutId) return definition;
  let next = structuredClone(definition);
  for (let guard = 0; guard < 8; guard += 1) {
    const { images, captions } = workChildren(next, layoutId);
    if (captions.length < images.length) {
      next = addCaption(next, layoutId, captions.length);
      continue;
    }
    if (images.length % 2 === 1) {
      next = addImage(next, layoutId);
      continue;
    }
    break;
  }
  for (const [index, nodeId] of workChildren(next, layoutId).images.entries()) {
    const node = next.nodes[nodeId];
    const slot = node.slotId ? next.slots[node.slotId] : undefined;
    if (!slot) continue;
    slot.desktopRules.aspectRatio ||= "4:5";
    slot.mobileRules.aspectRatio ||= "4:5";
    if (!slot.semanticRole) slot.semanticRole = "custom";
    if (/^图片( \d+)?$/.test(slot.label)) {
      const label = `自定义图片 ${index + 1}`;
      slot.label = label;
      node.name = label;
    }
    if (/^image\d*$/.test(slot.key)) slot.key = unusedKey(next, `content${index + 1}`, slot.slotId);
  }
  reflowEvenWorkGrid(asEvenWork(next));
  return next;
}

/** 删除后只按剩余张数重排，不把删掉的槽位补回来。 */
export function reflowEvenWorkGridIfTagged(definition: TemplateDefinitionV2): TemplateDefinitionV2 {
  if (!usesEvenWorkGrid(definition)) return definition;
  const next = structuredClone(definition);
  reflowEvenWorkGrid(asEvenWork(next));
  return next;
}

export { EVEN_WORK_GRID_TAG };
