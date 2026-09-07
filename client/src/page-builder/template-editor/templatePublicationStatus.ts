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

export function getTemplatePublicationLabel(status: TemplatePublicationStatus | null) {
  if (status === "draft") return "草稿";
  if (status === "published-current") return "已发布";
  if (status === "published-with-unpublished-changes") return "已发布 · 有未发布修改";
  if (status === "archived") return "已移入回收站";
  return "已发布 · 状态待核对";
}

export function matchesTemplatePublicationFilter(
  status: TemplatePublicationStatus | null,
  filter: TemplatePublicationFilter,
) {
  if (filter === "all") return status !== "archived";
  if (filter === "draft") return status === "draft";
  return status === "published-current"
    || status === "published-with-unpublished-changes"
    || status === null;
}
