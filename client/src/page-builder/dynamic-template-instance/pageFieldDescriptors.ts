import {
  getEffectiveDynamicTemplateInstanceEditPolicy,
  type DynamicTemplateInstanceEditPolicy,
  type DynamicTemplateSlotDefinition,
  type TemplateDefinitionV2,
} from "../template-definition";

export type PageFieldTask = "media" | "commerce" | "conversion" | "trust" | "content";
export type PageFieldControlKind = "image" | "text" | "link" | "product" | "structured";

export const PAGE_FIELD_TASK_LABELS: Record<PageFieldTask, string> = {
  media: "媒体与画面",
  commerce: "商品与分类",
  conversion: "行动与转化",
  trust: "服务与信任",
  content: "文字内容",
};

export const PAGE_FIELD_CONTROL_KIND_LABELS: Record<PageFieldControlKind, string> = {
  image: "图片选择",
  text: "文字输入",
  link: "行动与链接",
  product: "业务引用",
  structured: "结构化内容",
};

const SLOT_TYPE_LABELS: Partial<Record<DynamicTemplateSlotDefinition["type"], string>> = {
  image: "图片",
  heading: "标题", text: "正文", richText: "富文本", badge: "标签", icon: "图标",
  button: "按钮", link: "链接", product: "商品", collection: "商品集合",
};

export function groupDynamicTemplatePageFields(
  fields: DynamicTemplatePageFieldDescriptor[],
  selectedSlotId?: string,
) {
  const selected = fields.find((field) => field.slotId === selectedSlotId);
  const firstBusinessField = fields.find((field) => field.task !== "content");
  return {
    task: selected?.task ?? firstBusinessField?.task ?? fields[0]?.task ?? "content",
    primary: fields,
    secondary: [] as DynamicTemplatePageFieldDescriptor[],
  };
}

function controlKindForSlot(slot: DynamicTemplateSlotDefinition): PageFieldControlKind {
  if (slot.type === "image") return "image";
  if (["heading", "text", "richText", "badge", "icon"].includes(slot.type)) return "text";
  if (["button", "link"].includes(slot.type)) return "link";
  if (["product", "collection"].includes(slot.type)) return "product";
  return "structured";
}

function taskForControlKind(kind: PageFieldControlKind): PageFieldTask {
  if (kind === "image") return "media";
  if (kind === "product") return "commerce";
  if (kind === "link") return "conversion";
  return "content";
}

export interface DynamicTemplatePageFieldDescriptor {
  nodeId: string;
  slotId: string;
  stableKey: string;
  label: string;
  slotType: DynamicTemplateSlotDefinition["type"];
  slotTypeLabel: string;
  controlKind: PageFieldControlKind;
  task: PageFieldTask;
  required: boolean;
  editable: boolean;
  hideable: boolean;
  validation: DynamicTemplateSlotDefinition["validation"];
  effectiveDesignOverrideCapabilities: DynamicTemplateInstanceEditPolicy | null;
}

export function getDynamicTemplatePageFieldDataAttributes(
  field: DynamicTemplatePageFieldDescriptor,
  consumer: "full" | "simple" | "page",
) {
  return {
    "data-page-field-consumer": consumer,
    "data-page-field-label": field.label,
    "data-page-field-control-kind": field.controlKind,
    "data-page-field-required": String(field.required),
    "data-page-field-editable": String(field.editable),
    "data-page-field-hideable": String(field.hideable),
    "data-page-field-validation": JSON.stringify(field.validation),
    "data-page-field-policy": JSON.stringify(field.effectiveDesignOverrideCapabilities),
  } as const;
}

/** 模板设计与页面装修共同消费的页面字段事实：身份来自 nodeId/slotId/key，显示名来自 slot.label。 */
export function getDynamicTemplatePageFieldDescriptors(
  definition: TemplateDefinitionV2,
): DynamicTemplatePageFieldDescriptor[] {
  const result: DynamicTemplatePageFieldDescriptor[] = [];
  const seen = new Set<string>();
  const visit = (nodeId: string) => {
    const node = definition.nodes[nodeId];
    if (!node) return;
    const slot = node.slotId ? definition.slots[node.slotId] : undefined;
    if (slot && !seen.has(slot.slotId)) {
      seen.add(slot.slotId);
      const policy = getEffectiveDynamicTemplateInstanceEditPolicy(node, slot);
      const controlKind = controlKindForSlot(slot);
      result.push({
        nodeId,
        slotId: slot.slotId,
        stableKey: slot.key,
        label: slot.label,
        slotType: slot.type,
        slotTypeLabel: SLOT_TYPE_LABELS[slot.type] ?? "内容槽位",
        controlKind,
        task: taskForControlKind(controlKind),
        required: slot.required,
        editable: slot.editable,
        hideable: slot.hideable,
        validation: slot.validation,
        effectiveDesignOverrideCapabilities: policy,
      });
    }
    node.childIds.forEach(visit);
  };
  visit(definition.rootNodeId);
  return result;
}
