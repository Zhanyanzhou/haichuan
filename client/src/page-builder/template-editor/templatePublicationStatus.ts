export type TemplatePublicationStatus =
  | "draft"
  | "published-current"
  | "published-with-unpublished-changes"
  | "archived";

export type TemplatePublicationFilter = "all" | "draft" | "published";

export interface TemplatePublicationFacts {
  status: "ACTIVE" | "ARCHIVED";
  publishedVersion: number;
  draftDefinitionChecksum: string | null;
  publishedDefinitionChecksum: string | null;
}

/**
 * 目录和当前模板摘要共用的生命周期派生。
 * checksum 分别来自服务端草稿与当前不可变正式版本；缺失时返回 null，
 * 调用方必须显示无法核对状态，不能用时间或 revision 猜测。
 */
export function resolveTemplatePublicationStatus({
  status,
  publishedVersion,
  draftDefinitionChecksum,
  publishedDefinitionChecksum,
}: TemplatePublicationFacts): TemplatePublicationStatus | null {
  if (status === "ARCHIVED") return "archived";
  if (publishedVersion <= 0) return "draft";
  if (!draftDefinitionChecksum || !publishedDefinitionChecksum) return null;
  return draftDefinitionChecksum === publishedDefinitionChecksum
    ? "published-current"
    : "published-with-unpublished-changes";
}

/**
 * 正式版本已经包含当前设计时，再发下一版会被服务端拒绝。
 * 有未保存修改、检查过期后的新输入，或校验值对不上时，不把这次发布当成重复。
 */
export function templateContentMatchesPublishedVersion({
  dirty,
  currentInputChanged = false,
  publishedDefinitionChecksum,
  draftDefinitionChecksum,
  reviewedBaselineChecksum,
  savedChecksum,
}: {
  dirty: boolean;
  currentInputChanged?: boolean;
  publishedDefinitionChecksum: string | null | undefined;
  draftDefinitionChecksum?: string | null;
  reviewedBaselineChecksum?: string | null;
  savedChecksum?: string | null;
}) {
  if (!publishedDefinitionChecksum || dirty || currentInputChanged) return false;
  if (savedChecksum) return savedChecksum === publishedDefinitionChecksum;
  if (!draftDefinitionChecksum || draftDefinitionChecksum !== publishedDefinitionChecksum) return false;
  return !reviewedBaselineChecksum || reviewedBaselineChecksum === publishedDefinitionChecksum;
}

export function getTemplatePublicationLabel(status: TemplatePublicationStatus | null) {
  if (status === "draft") return "草稿";
  if (status === "published-current") return "已发布";
  if (status === "published-with-unpublished-changes") return "已发布 · 有未发布修改";
  if (status === "archived") return "已移入回收站";
  return "发布状态不可用";
}

export function matchesTemplatePublicationFilter(
  status: TemplatePublicationStatus | null,
  filter: TemplatePublicationFilter,
) {
  if (filter === "all") return status !== "archived";
  if (filter === "draft") return status === "draft";
  return status === "published-current"
    || status === "published-with-unpublished-changes";
}
