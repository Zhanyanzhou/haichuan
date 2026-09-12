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

export interface SystemTemplatePublicationFacts {
  activeVersion: number;
  moduleType: string;
  source: "code" | "database";
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
 * 兼容模板只有在服务端确认存在数据库正式版本时才可作为页面目录版本。
 * 代码基线和 v0 只用于模板设计起步，不能伪装成可发布页面依赖的正式版本。
 */
export function resolveSystemTemplatePublicationStatus(
  current: SystemTemplatePublicationFacts | null | undefined,
): TemplatePublicationStatus | null {
  if (!current || !Number.isInteger(current.activeVersion)) return null;
  if (current.activeVersion <= 0) return "draft";
  return current.source === "database" ? "published-current" : null;
}

export function getSystemTemplatePublicationBlockReason(
  current: SystemTemplatePublicationFacts | null | undefined,
  expectedModuleType?: string,
) {
  if (!current || (expectedModuleType && current.moduleType !== expectedModuleType)) {
    return "模板发布身份无法核对，请重新读取目录";
  }
  const status = resolveSystemTemplatePublicationStatus(current);
  if (status === "published-current") return null;
  if (status === "draft") {
    return "当前没有可用于页面的正式版本；请先保存并发布该模板";
  }
  return "模板正式版本状态无法核对；请重新读取目录或重新发布该模板";
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
