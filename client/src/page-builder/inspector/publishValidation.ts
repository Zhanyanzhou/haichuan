import { BLOCK_META } from "../config/blockMeta";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  dynamicTemplateVersionKey,
  getDynamicTemplateInstanceEditorBlockId,
  type ResolvedDynamicTemplateDefinitionMap,
} from "../dynamic-template-instance/types";
import {
  getContentTemplateContract,
  type ContentTemplateEditableObjectKind,
} from "../generated/contentTemplates.generated";
import { getTemplateContractRoleLabel } from "../runtime/contentTemplateRolePresentation";
import {
  getEffectiveDynamicTemplateInstanceEditPolicy,
  type DynamicTemplateNode,
  type DynamicTemplateSlotDefinition,
} from "../template-definition";
import type { PuckDocument, PuckProps } from "../types";
import { getInspectorSchema } from "./schema/registry";

export type PublishValidationStatus =
  | "idle"
  | "validating"
  | "valid"
  | "invalid"
  | "unverified"
  | "unavailable";

export interface PublishValidationIssue {
  blockId?: string;
  field?: string;
  index?: number;
  code?: string;
  message: string;
  severity: "error" | "warning" | "info";
  path?: string;
}

export type PagePublishIssueDevice = "desktop" | "mobile" | "shared";
export type PagePublishIssueDestination =
  | "inspector-field"
  | "page-settings"
  | "structure"
  | "retry-validation"
  | "unavailable";

export interface PagePublishIssueTarget {
  key: string;
  blockId?: string;
  blockIndex?: number;
  zone: string;
  moduleType?: string;
  blockLabel: string;
  objectId?: string;
  objectKind?: ContentTemplateEditableObjectKind;
  objectLabel: string;
  device: PagePublishIssueDevice;
  group: string;
  groupLabel: string;
  field?: string;
  fieldLabel: string;
  destination: PagePublishIssueDestination;
  access: "editable" | "managed" | "read-only" | "unavailable";
  reason?: string;
}

interface LocatedPageBlock {
  block: { type?: string; props?: PuckProps };
  blockIndex: number;
  zone: string;
}

function collectPageBlocks(document: PuckDocument): LocatedPageBlock[] {
  const result: LocatedPageBlock[] = (document.content ?? []).map((block, blockIndex) => ({
    block,
    blockIndex,
    zone: "root:default-zone",
  }));
  for (const [zone, blocks] of Object.entries(document.zones ?? {})) {
    if (!Array.isArray(blocks)) continue;
    blocks.forEach((block, blockIndex) => {
      if (block && typeof block === "object" && !Array.isArray(block)) {
        result.push({
          block: block as LocatedPageBlock["block"],
          blockIndex,
          zone,
        });
      }
    });
  }
  return result;
}

function locatePageBlock(
  document: PuckDocument,
  issue: PublishValidationIssue,
): LocatedPageBlock | undefined {
  const blocks = collectPageBlocks(document);
  if (issue.blockId) {
    const byIdentity = blocks.find(({ block }) => (
      String(block.props?.id ?? "") === issue.blockId
      || String(block.props?.instanceId ?? "") === issue.blockId
    ));
    if (byIdentity) return byIdentity;
  }
  const rootMatch = issue.path?.match(/^content\[(\d+)\]/);
  if (rootMatch) {
    const blockIndex = Number(rootMatch[1]);
    return blocks.find((candidate) => (
      candidate.zone === "root:default-zone" && candidate.blockIndex === blockIndex
    ));
  }
  const zoneMatch = issue.path?.match(/^zones\.([^.[\]]+)\[(\d+)\]/);
  if (zoneMatch) {
    const blockIndex = Number(zoneMatch[2]);
    return blocks.find((candidate) => (
      candidate.zone === zoneMatch[1] && candidate.blockIndex === blockIndex
    ));
  }
  if (Number.isInteger(issue.index) && (issue.index ?? -1) >= 0) {
    return blocks.find((candidate) => (
      candidate.zone === "root:default-zone" && candidate.blockIndex === issue.index
    ));
  }
  return undefined;
}

function getIssueDevice(
  issue: PublishValidationIssue,
  schemaDevice?: "desktop" | "mobile" | "shared",
): PagePublishIssueDevice {
  const source = `${issue.path ?? ""}.${issue.field ?? ""}`;
  if (/(?:^|[._])mobile(?:[A-Z]|\[|[._]|$)/.test(source) || /mobile[A-Z]/.test(source)) {
    return "mobile";
  }
  if (/(?:^|[._])desktop(?:[A-Z]|\[|[._]|$)/.test(source) || /desktop[A-Z]/.test(source)) {
    return "desktop";
  }
  return schemaDevice ?? "shared";
}

function linkTargetKeys(fieldKey: string, prefix = "") {
  return prefix
    ? ["TargetType", "ProductCode", "ProductId", "CategorySlug", "LinkUrl"]
        .map((suffix) => `${prefix}${suffix}`)
    : [fieldKey, "targetType", "productCode", "productId", "categorySlug", "linkUrl"];
}

function resolveSchemaField(moduleType: string, rawField: string | undefined) {
  const schema = getInspectorSchema(moduleType);
  if (!schema || !rawField) return undefined;
  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (field.key === rawField) return { field, section };
      if (
        field.control === "linkTarget"
        && linkTargetKeys(field.key, field.keyPrefix ?? "").includes(rawField)
      ) {
        return { field, section };
      }
    }
  }
  return undefined;
}

const DYNAMIC_LAYOUT_FIELD_LABELS = {
  offsetXPercent: "水平偏移",
  offsetYPercent: "垂直偏移",
  widthPercent: "区域宽度",
  zIndex: "层级",
  objectFit: "图片适配",
  imageScalePercent: "图片缩放",
  focusXPercent: "水平焦点",
  focusYPercent: "垂直焦点",
  fontSizePx: "字号",
  textAlign: "文字对齐",
  marginTopPx: "上间距",
  marginBottomPx: "下间距",
} as const;

type DynamicLayoutField = keyof typeof DYNAMIC_LAYOUT_FIELD_LABELS;

function parseDynamicLayoutPath(path: string | undefined) {
  const match = path?.match(
    /(?:^|\.)layoutOverridesByNodeId\.([^.[\]]+)\.(desktop|mobile)\.([^.[\]]+)/,
  );
  if (!match) return undefined;
  const rawField = match[3];
  return {
    nodeId: match[1],
    device: match[2] as "desktop" | "mobile",
    field: Object.prototype.hasOwnProperty.call(DYNAMIC_LAYOUT_FIELD_LABELS, rawField)
      ? rawField as DynamicLayoutField
      : undefined,
    rawField,
  };
}

function isDynamicLayoutFieldEditable(
  field: DynamicLayoutField,
  node: DynamicTemplateNode,
  slot: DynamicTemplateSlotDefinition | undefined,
) {
  const policy = getEffectiveDynamicTemplateInstanceEditPolicy(node, slot);
  if (!policy || slot?.editable === false) return false;
  const textSlot = slot && ["heading", "text", "richText", "badge"].includes(slot.type);
  if (field === "offsetXPercent" || field === "offsetYPercent") return policy.position;
  if (field === "widthPercent") return policy.size;
  if (field === "zIndex") return policy.zIndex;
  if (field === "objectFit" || field === "imageScalePercent") {
    return slot?.type === "image" && policy.imageFit;
  }
  if (field === "focusXPercent" || field === "focusYPercent") {
    return slot?.type === "image" && policy.imageFocus;
  }
  if (field === "fontSizePx" || field === "textAlign") {
    return Boolean(textSlot && policy.typography);
  }
  return Boolean(textSlot && policy.spacing);
}

function dynamicObjectForIssue(
  block: LocatedPageBlock["block"],
  issue: PublishValidationIssue,
  resolvedDefinitions: ResolvedDynamicTemplateDefinitionMap | undefined,
) {
  const props = block.props ?? {};
  const templateId = typeof props.templateId === "string" ? props.templateId : "";
  const version = Number(props.templateVersion);
  const definition = resolvedDefinitions?.[
    dynamicTemplateVersionKey(templateId, version)
  ]?.definition;
  if (!definition) return undefined;
  const layout = parseDynamicLayoutPath(issue.path);
  const layoutNodeId = layout?.nodeId;
  const rawField = issue.field ?? issue.path?.match(/contentBySlotId\.([^.[]+)/)?.[1];
  const node = layoutNodeId
    ? definition.nodes?.[layoutNodeId]
    : Object.values(definition.nodes ?? {}).find((candidate) => candidate.slotId === rawField);
  const slot = node?.slotId ? definition.slots?.[node.slotId] : undefined;
  if (!node) return undefined;
  const slotType = slot?.type;
  const objectKind: ContentTemplateEditableObjectKind = slotType === "image"
    ? "media"
    : slotType === "video"
      ? "video"
      : slotType === "button" || slotType === "link"
        ? "action"
        : slotType === "product"
          ? "product"
          : slotType === "collection"
            ? "collection"
            : "text";
  if (layout) {
    const editable = layout.field
      ? isDynamicLayoutFieldEditable(layout.field, node, slot)
      : false;
    return {
      objectId: node.nodeId,
      objectKind,
      objectLabel: slot?.label ?? node.name ?? node.nodeId ?? "模板实例对象",
      device: layout.device,
      field: editable ? layout.field : undefined,
      fieldLabel: layout.field
        ? DYNAMIC_LAYOUT_FIELD_LABELS[layout.field]
        : layout.rawField,
      group: "instance-layout",
      groupLabel: "实例构图",
      access: editable ? "editable" as const : "read-only" as const,
      ...(editable ? {} : {
        reason: layout.field
          ? "此实例构图属性由母模板控制，当前页面没有可编辑控件。"
          : `服务端返回的实例构图属性“${layout.rawField}”没有稳定的 Inspector 控件。`,
      }),
    };
  }
  return {
    objectId: node.nodeId,
    objectKind,
    objectLabel: slot?.label ?? node.name ?? node.nodeId ?? "模板实例对象",
    device: undefined,
    field: slot?.slotId ?? rawField,
    fieldLabel: slot?.label ?? node.name ?? rawField ?? "实例设置",
    group: `slot-${slotType ?? "content"}`,
    groupLabel: "页面内容",
    access: slot && slot.editable === false ? "read-only" as const : "editable" as const,
    reason: undefined,
  };
}

export function getPagePublishIssueKey(issue: PublishValidationIssue): string {
  return [
    issue.code ?? "page-validation",
    issue.blockId ?? "page",
    issue.path ?? "",
    issue.field ?? "",
    issue.index ?? "",
    issue.path || issue.blockId || issue.field ? "" : issue.message,
  ].join("|");
}

/** 重验后保留当前问题；若已解决，则继续原列表中下一条仍存在的问题。 */
export function reconcilePagePublishIssueKey(
  previous: readonly PublishValidationIssue[],
  currentKey: string | null,
  next: readonly PublishValidationIssue[],
): string | null {
  if (next.length === 0) return null;
  const currentIndex = Math.max(0, previous.findIndex(
    (issue) => getPagePublishIssueKey(issue) === currentKey,
  ));
  const nextKeys = new Set(next.map(getPagePublishIssueKey));
  for (const candidate of previous.slice(currentIndex)) {
    const key = getPagePublishIssueKey(candidate);
    if (nextKeys.has(key)) return key;
  }
  for (const candidate of previous.slice(0, currentIndex).reverse()) {
    const key = getPagePublishIssueKey(candidate);
    if (nextKeys.has(key)) return key;
  }
  return getPagePublishIssueKey(next[0]);
}

/**
 * 页面发布问题的唯一目标解析入口。服务端未提供可验证身份时保留通用恢复入口，
 * 不从错误文案猜测区块或字段。
 */
export function resolvePagePublishIssueTarget(
  issue: PublishValidationIssue,
  document: PuckDocument,
  resolvedDefinitions?: ResolvedDynamicTemplateDefinitionMap,
): PagePublishIssueTarget {
  const key = getPagePublishIssueKey(issue);
  if (issue.path?.startsWith("metadata.")) {
    const field = issue.field ?? issue.path.slice("metadata.".length).split(".")[0];
    return {
      key,
      zone: "page",
      blockLabel: "当前页面",
      objectLabel: "页面展示设置",
      device: "shared",
      group: "page-settings",
      groupLabel: "页面展示",
      field,
      fieldLabel: field || "页面设置",
      destination: "page-settings",
      access: "editable",
    };
  }
  if (issue.code === "publish-validation-unavailable" || issue.code === "publish-request-conflict") {
    return {
      key,
      zone: "page",
      blockLabel: "当前页面",
      objectLabel: "发布流程",
      device: "shared",
      group: "publish-lifecycle",
      groupLabel: "发布状态",
      fieldLabel: "发布资格",
      destination: "retry-validation",
      access: "managed",
      reason: "当前错误没有可安全映射的页面字段；请重新检查发布资格，草稿不会自动发布。",
    };
  }

  const located = locatePageBlock(document, issue);
  if (!located) {
    return {
      key,
      zone: "page",
      blockLabel: "当前页面",
      objectLabel: "发布检查",
      device: "shared",
      group: "unmapped",
      groupLabel: "通用问题",
      fieldLabel: issue.field ?? "未提供字段",
      destination: "unavailable",
      access: "unavailable",
      reason: "服务端未提供可验证的区块与字段身份；已保留原错误，请先重新检查或核对页面结构。",
    };
  }

  const props = located.block.props ?? {};
  const blockId = located.block.type === DYNAMIC_TEMPLATE_BLOCK_TYPE
    ? getDynamicTemplateInstanceEditorBlockId(props as unknown as {
        id: string;
        instanceId: string;
      })
    : String(props.id ?? issue.blockId ?? "");
  const moduleType = located.block.type ?? "";
  const blockLabel = BLOCK_META[moduleType]?.name
    ?? (moduleType || `第 ${located.blockIndex + 1} 个区块`);
  const rawField = issue.field ?? issue.path?.match(/\.props\.([^.[]+)/)?.[1];
  const dynamic = dynamicObjectForIssue(located.block, issue, resolvedDefinitions);
  if (dynamic) {
    const device = dynamic.device ?? getIssueDevice(issue);
    return {
      key,
      blockId,
      blockIndex: located.blockIndex,
      zone: located.zone,
      moduleType,
      blockLabel,
      ...dynamic,
      device,
      destination: dynamic.field ? "inspector-field" : "structure",
      ...(dynamic.reason ? { reason: dynamic.reason } : dynamic.access === "read-only"
        ? { reason: "此对象由母模板控制；请使用实例允许的恢复操作或升级模板版本。" }
        : {}),
    };
  }

  const schemaMatch = resolveSchemaField(moduleType, rawField);
  const contract = getContentTemplateContract(moduleType);
  const object = contract?.editorCapabilities.editableObjects.find((candidate) => (
    candidate.roleId === rawField
    || candidate.contentFieldKeys.includes(rawField ?? "")
    || candidate.contentFieldKeys.includes(schemaMatch?.field.key ?? "")
  ));
  if (schemaMatch) {
    return {
      key,
      blockId,
      blockIndex: located.blockIndex,
      zone: located.zone,
      moduleType,
      blockLabel,
      objectId: object?.roleId,
      objectKind: object?.kind,
      objectLabel: object
        ? getTemplateContractRoleLabel(object.roleId)
        : blockLabel,
      device: getIssueDevice(issue, schemaMatch.field.device),
      group: schemaMatch.section.id,
      groupLabel: schemaMatch.section.title,
      field: schemaMatch.field.key,
      fieldLabel: schemaMatch.field.label,
      destination: "inspector-field",
      access: "editable",
    };
  }

  return {
    key,
    blockId,
    blockIndex: located.blockIndex,
    zone: located.zone,
    moduleType,
    blockLabel,
    objectId: object?.roleId,
    objectKind: object?.kind,
    objectLabel: object ? getTemplateContractRoleLabel(object.roleId) : "页面结构",
    device: getIssueDevice(issue),
    group: "structure",
    groupLabel: "图层与结构",
    field: rawField,
    fieldLabel: rawField ?? "区块结构",
    destination: "structure",
    access: "managed",
    reason: rawField
      ? `当前字段“${rawField}”没有可安全直接编辑的 Inspector 控件；已定位所属区块。`
      : "此问题属于页面结构；已定位所属区块，请从图层操作或页面结构调整。",
  };
}

export function isPagePublishIssue(issue: PublishValidationIssue): boolean {
  return !issue.blockId || issue.path?.startsWith("metadata.") === true;
}

export function getInspectorPublishIssues(
  issues: readonly PublishValidationIssue[],
  blockId: unknown,
  alternateBlockIds: readonly unknown[] = [],
): PublishValidationIssue[] {
  const normalizedBlockId = blockId == null ? "" : String(blockId);
  const acceptedBlockIds = new Set([
    normalizedBlockId,
    ...alternateBlockIds.map((candidate) => candidate == null ? "" : String(candidate)),
  ]);
  return issues.filter(
    (issue) =>
      issue.severity !== "info"
      && (
        issue.severity === "error"
        || isPagePublishIssue(issue)
        || (issue.blockId !== undefined && acceptedBlockIds.has(issue.blockId))
      ),
  );
}
