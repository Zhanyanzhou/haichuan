import type { PublishValidationIssue } from "../inspector/publishValidation";
import type { TemplateDefinitionV2 } from "../template-definition";
import { validateDynamicTemplateDefinition } from "../template-definition/validateTemplateDefinition";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  dynamicTemplateVersionKey,
  type ResolvedDynamicTemplateDefinitionMap,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** 来自文档/接口的母模板定义按不可信输入校验，避免结构断言掩盖坏数据。 */
function asTemplateDefinition(value: unknown): TemplateDefinitionV2 | undefined {
  const validation = validateDynamicTemplateDefinition(value);
  return validation.valid && validation.definition ? validation.definition : undefined;
}

/** 页面实例不得保留母模板已锁定槽位上的覆盖值。 */
export function stripNonEditableSlotContent(
  contentBySlotId: unknown,
  definition: TemplateDefinitionV2,
): Record<string, unknown> {
  if (!isRecord(contentBySlotId)) return {};
  const next: Record<string, unknown> = {};
  for (const [slotId, value] of Object.entries(contentBySlotId)) {
    if (definition.slots[slotId]?.editable) next[slotId] = value;
  }
  return next;
}

export function countNonEditableSlotContent(
  contentBySlotId: unknown,
  definition: TemplateDefinitionV2,
): number {
  if (!isRecord(contentBySlotId)) return 0;
  return Object.keys(contentBySlotId).filter((slotId) => {
    const slot = definition.slots[slotId];
    return !slot || !slot.editable;
  }).length;
}

function definitionFor(
  resolved: ResolvedDynamicTemplateDefinitionMap,
  rawResolved: unknown,
  templateId: string,
  templateVersion: number,
): TemplateDefinitionV2 | undefined {
  const key = dynamicTemplateVersionKey(templateId, templateVersion);
  if (resolved[key]?.definition) return resolved[key].definition;
  if (!isRecord(rawResolved)) return undefined;
  const record = rawResolved[key];
  if (!isRecord(record)) return undefined;
  return asTemplateDefinition(record.definition);
}

function mapDocumentBlocks(
  blocks: unknown,
  resolved: ResolvedDynamicTemplateDefinitionMap,
  rawResolved: unknown,
): unknown {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map((block) => {
    if (!isRecord(block) || block.type !== DYNAMIC_TEMPLATE_BLOCK_TYPE || !isRecord(block.props)) {
      return block;
    }
    const props = block.props;
    const templateId = typeof props.templateId === "string" ? props.templateId : "";
    const templateVersion = Number(props.templateVersion);
    const definition = definitionFor(resolved, rawResolved, templateId, templateVersion);
    if (!definition) return block;
    const current = props.contentBySlotId;
    const next = stripNonEditableSlotContent(current, definition);
    if (isRecord(current) && Object.keys(current).length === Object.keys(next).length) {
      const unchanged = Object.keys(next).every((slotId) => current[slotId] === next[slotId]);
      if (unchanged) return block;
    }
    return {
      ...block,
      props: {
        ...props,
        contentBySlotId: next,
      },
    };
  });
}

function visitDocumentBlocks(
  document: Record<string, unknown>,
  visit: (block: Record<string, unknown>, pathPrefix: string, index: number) => void,
) {
  const visitBlocks = (blocks: unknown, pathPrefix: string) => {
    if (!Array.isArray(blocks)) return;
    blocks.forEach((block, index) => {
      if (isRecord(block)) visit(block, pathPrefix, index);
    });
  };
  visitBlocks(document.content, "content");
  if (isRecord(document.zones)) {
    for (const [zone, blocks] of Object.entries(document.zones)) {
      visitBlocks(blocks, `zones.${zone}`);
    }
  }
}

/** 收集页面草稿里仍覆盖已锁定槽位的发布阻断，供保存/发布前明确处理。 */
export function collectLockedLeftoverPublishIssues(
  document: unknown,
  resolved: ResolvedDynamicTemplateDefinitionMap,
): PublishValidationIssue[] {
  if (!isRecord(document)) return [];
  const issues: PublishValidationIssue[] = [];
  visitDocumentBlocks(document, (block, pathPrefix, index) => {
    if (block.type !== DYNAMIC_TEMPLATE_BLOCK_TYPE || !isRecord(block.props)) return;
    const props = block.props;
    const templateId = typeof props.templateId === "string" ? props.templateId : "";
    const templateVersion = Number(props.templateVersion);
    const definition = definitionFor(
      resolved,
      document.resolvedDynamicTemplates,
      templateId,
      templateVersion,
    );
    if (!definition || !isRecord(props.contentBySlotId)) return;
    const blockId = typeof props.id === "string" ? props.id : undefined;
    for (const slotId of Object.keys(props.contentBySlotId)) {
      const slot = definition.slots[slotId];
      if (slot?.editable) continue;
      issues.push({
        code: "locked-slot-page-value",
        message: `${slot?.label ?? slotId}不允许在页面中修改`,
        severity: "error",
        blockId,
        field: slotId,
        path: `${pathPrefix}[${index}].props.contentBySlotId.${slotId}`,
      });
    }
  });
  return issues;
}

/** 从整页草稿中去掉锁定槽位上的页面覆盖，不改母模板、不推进发布指针。 */
export function stripNonEditableSlotContentFromPageDocument<T extends Record<string, unknown>>(
  document: T,
  resolved: ResolvedDynamicTemplateDefinitionMap,
): T {
  const zones = isRecord(document.zones) ? document.zones : undefined;
  const rawResolved = document.resolvedDynamicTemplates;
  return {
    ...document,
    content: mapDocumentBlocks(document.content, resolved, rawResolved),
    ...(zones
      ? {
          zones: Object.fromEntries(
            Object.entries(zones).map(([zone, blocks]) => [zone, mapDocumentBlocks(blocks, resolved, rawResolved)]),
          ),
        }
      : {}),
  };
}
