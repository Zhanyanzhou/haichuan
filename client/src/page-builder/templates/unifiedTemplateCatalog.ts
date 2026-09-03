import type { SystemContentTemplateCurrent } from "@/services/api";
import type {
  DynamicTemplateResource,
  PublishedDynamicTemplateResource,
  TemplateCatalogItemResource,
  TemplateCatalogPersonalCompatibilityResource,
} from "@/services/clients/dynamicTemplateClient";
import { adaptLegacyTemplateSource } from "../template-editor/legacyTemplateConversion";
import { createSystemTemplateDraft } from "../template-editor/templateDraftAdapter";
import type { TemplateDefinitionV2 } from "../template-definition";
import {
  getContentTemplateModuleTypeForSlotType,
  validateDynamicTemplateDefinition,
} from "../template-definition/validateTemplateDefinition";

export interface UnifiedTemplateCatalogEntry {
  key: string;
  sourceReference: string | null;
  editable?: DynamicTemplateResource;
  published?: PublishedDynamicTemplateResource;
  systemCompatibility?: SystemContentTemplateCurrent;
  personalCompatibility?: TemplateCatalogPersonalCompatibilityResource;
}

export type UnifiedTemplateCatalogPresentation =
  | {
      source: "published";
      templateId: string;
      name: string;
      category: string;
      description: string;
      definition: PublishedDynamicTemplateResource["definition"];
      published: PublishedDynamicTemplateResource;
    }
  | {
      source: "draft";
      templateId: string;
      name: string;
      category: string;
      description: string;
      definition: NonNullable<DynamicTemplateResource["draft"]>["definition"];
      editable: DynamicTemplateResource;
    }
  | {
      source: "system-compatibility";
      name: string;
      category: null;
      description: string;
      current: SystemContentTemplateCurrent;
    }
  | {
      source: "personal-compatibility";
      name: string;
      category: null;
      description: string;
      personal: TemplateCatalogPersonalCompatibilityResource;
    };

function systemSourceReference(template: SystemContentTemplateCurrent) {
  return `legacy_system_${template.contractKey}`;
}

function personalSourceReference(template: TemplateCatalogPersonalCompatibilityResource) {
  return `legacy_personal_${template.id}`;
}

function hasRenderableDraftStructure(definition: unknown) {
  const validation = validateDynamicTemplateDefinition(definition);
  if (!validation.valid || !validation.definition) return false;
  const normalized = validation.definition;
  const root = normalized.nodes[normalized.rootNodeId];
  if (!root || root.childIds.length === 0 || Object.keys(normalized.slots).length === 0) return false;
  return Object.values(normalized.nodes).some((node) => Boolean(
    node.slotId && normalized.slots[node.slotId],
  ));
}

function hasCompatibleSystemDraftStructure(
  definition: unknown,
  moduleType: string,
) {
  if (!hasRenderableDraftStructure(definition)) return false;
  const validation = validateDynamicTemplateDefinition(definition);
  if (!validation.valid || !validation.definition) return false;
  const normalized = validation.definition;
  return Object.values(normalized.nodes).some((node) => {
    const slot = node.slotId ? normalized.slots[node.slotId] : undefined;
    return slot
      ? getContentTemplateModuleTypeForSlotType(slot.type) === moduleType
      : false;
  });
}

export function createSystemCompatibilityRecoveryDefinition(
  template: DynamicTemplateResource,
  current: SystemContentTemplateCurrent,
): TemplateDefinitionV2 | undefined {
  if (
    !template.draft
    || hasCompatibleSystemDraftStructure(template.draft.definition, current.moduleType)
  ) return undefined;
  try {
    const source = createSystemTemplateDraft(current.moduleType, current);
    if (!source) return undefined;
    const definition = structuredClone(adaptLegacyTemplateSource(source).draft.definition);
    definition.templateId = template.templateId;
    definition.name = template.name;
    if (template.description) definition.description = template.description;
    else delete definition.description;
    definition.metadata.category = template.category;
    definition.metadata.purpose = template.purpose;
    definition.metadata.layoutType = template.layoutType;
    definition.metadata.recommendedFor = structuredClone(template.recommendedFor);
    definition.metadata.tags = structuredClone(template.tags);
    return definition;
  } catch {
    return undefined;
  }
}

/**
 * 把服务端统一目录中的正式版本、草稿和兼容来源合并成一个母模板身份。
 * 页面装修与模板设计必须共同消费该投影，不能各自重新拼一套目录。
 */
export function unifyTemplateCatalogItems(
  items: readonly TemplateCatalogItemResource[],
): UnifiedTemplateCatalogEntry[] {
  const entriesByTemplateId = new Map<string, UnifiedTemplateCatalogEntry>();
  const entries: UnifiedTemplateCatalogEntry[] = [];

  const ensureDynamicEntry = (templateId: string, sourceReference: string | null) => {
    const existing = entriesByTemplateId.get(templateId);
    if (existing) {
      if (!existing.sourceReference && sourceReference) existing.sourceReference = sourceReference;
      return existing;
    }
    const entry: UnifiedTemplateCatalogEntry = {
      key: sourceReference?.startsWith("legacy_")
        ? `source:${sourceReference}`
        : `template:${templateId}`,
      sourceReference,
    };
    entriesByTemplateId.set(templateId, entry);
    entries.push(entry);
    return entry;
  };

  for (const item of items) {
    if (item.kind === "published") {
      ensureDynamicEntry(item.template.templateId, item.template.sourceReference).published = item.template;
    } else if (item.kind === "editable") {
      ensureDynamicEntry(item.template.templateId, item.template.sourceReference).editable = item.template;
    }
  }

  const entryBySourceReference = () => {
    const result = new Map<string, UnifiedTemplateCatalogEntry>();
    for (const entry of entries) {
      if (entry.sourceReference && !result.has(entry.sourceReference)) {
        result.set(entry.sourceReference, entry);
      }
    }
    return result;
  };

  for (const item of items) {
    if (item.kind !== "system-compatibility" && item.kind !== "personal-compatibility") continue;
    const sourceReference = item.kind === "system-compatibility"
      ? systemSourceReference(item.template)
      : personalSourceReference(item.template);
    let entry = entryBySourceReference().get(sourceReference);
    if (!entry) {
      entry = {
        key: `source:${sourceReference}`,
        sourceReference,
      };
      entries.push(entry);
    }
    if (item.kind === "system-compatibility") entry.systemCompatibility = item.template;
    else entry.personalCompatibility = item.template;
  }

  return entries;
}

/**
 * 同一母模板身份只解析一个主要目录视觉来源。正式版本存在时优先正式定义，
 * 尚未发布时优先草稿定义。页面装修不得直接插入草稿；若同一身份仍有系统
 * 兼容基线，页面目录可以明确使用该最后可用版本作为添加动作，直到 V2 发布。
 */
export function resolveUnifiedTemplateCatalogPresentation(
  entry: UnifiedTemplateCatalogEntry,
): UnifiedTemplateCatalogPresentation | null {
  if (entry.published) {
    return {
      source: "published",
      templateId: entry.published.templateId,
      name: entry.published.name,
      category: entry.published.category,
      description: entry.published.slotSummary,
      definition: entry.published.definition,
      published: entry.published,
    };
  }
  if (
    entry.editable?.draft
    && (
      !entry.systemCompatibility
      || hasCompatibleSystemDraftStructure(
        entry.editable.draft.definition,
        entry.systemCompatibility.moduleType,
      )
    )
  ) {
    return {
      source: "draft",
      templateId: entry.editable.templateId,
      name: entry.editable.name,
      category: entry.editable.category,
      description: entry.editable.slotSummary,
      definition: entry.editable.draft.definition,
      editable: entry.editable,
    };
  }
  if (entry.systemCompatibility) {
    return {
      source: "system-compatibility",
      name: entry.systemCompatibility.displayName,
      category: null,
      description: entry.systemCompatibility.displayName,
      current: entry.systemCompatibility,
    };
  }
  if (entry.personalCompatibility) {
    return {
      source: "personal-compatibility",
      name: entry.personalCompatibility.name,
      category: null,
      description: entry.personalCompatibility.name,
      personal: entry.personalCompatibility,
    };
  }
  return null;
}
