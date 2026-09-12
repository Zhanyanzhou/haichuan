import type {
  DynamicTemplateResource,
  PublishedDynamicTemplateResource,
  TemplateCatalogItemResource,
} from "@/services/clients/dynamicTemplateClient";

export interface UnifiedTemplateCatalogEntry {
  key: string;
  sourceReference: string | null;
  editable?: DynamicTemplateResource;
  published?: PublishedDynamicTemplateResource;
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
    };

/**
 * 把统一 Repository 中的正式版本与可编辑草稿合并成一个母模板身份。
 * 旧系统/个人兼容来源不再属于产品目录，也不会在这里物化为可见模板。
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
      key: `template:${templateId}`,
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

  return entries;
}

/**
 * 同一母模板身份只解析一个主要目录视觉来源。正式版本存在时优先正式定义，
 * 尚未发布时优先草稿定义；只有服务端确认的正式版本才允许添加到页面。
 */
export function resolveUnifiedTemplateCatalogPresentation(
  entry: UnifiedTemplateCatalogEntry,
): UnifiedTemplateCatalogPresentation | null {
  if (entry.editable?.status === "ARCHIVED") {
    return entry.editable.draft
      ? {
          source: "draft",
          templateId: entry.editable.templateId,
          name: entry.editable.name,
          category: entry.editable.category,
          description: entry.editable.slotSummary,
          definition: entry.editable.draft.definition,
          editable: entry.editable,
        }
      : null;
  }
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
  if (entry.editable?.draft) {
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
  return null;
}
