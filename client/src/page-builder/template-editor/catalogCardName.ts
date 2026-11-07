import { SECTION_ROLES, type TemplateSectionRole } from "../template-creation/presets";

const ROLE_LABELS = new Map<string, string>(SECTION_ROLES);
ROLE_LABELS.set("page-hero", "单图海报");
ROLE_LABELS.set("creation-grid", "宝贝推荐");

/**
 * 目录卡片统一显示区块角色。
 * 模板不按首页、验收或自拟名称区分；已保存的名称不改。
 */
export function catalogCardName(sectionRole: string | undefined, storedName: string): string {
  const fromRole = sectionRole ? ROLE_LABELS.get(sectionRole as TemplateSectionRole) : undefined;
  if (fromRole) return fromRole;
  const compact = storedName.toLowerCase().replace(/[\s_-]/g, "");
  for (const [role, label] of ROLE_LABELS) {
    if (compact.includes(role.replace(/-/g, ""))) return label;
  }
  const trimmed = storedName.trim();
  return trimmed || "未命名模板";
}

/** 角色名之外的已保存名称。目录仍以角色为主，存储名只作第二行，不改已保存的名称。 */
export function catalogStoredName(sectionRole: string | undefined, storedName: string): string {
  const roleLabel = catalogCardName(sectionRole, storedName);
  const stored = storedName.trim();
  const originalRoleLabel = SECTION_ROLES.find(([role]) => role === sectionRole)?.[1];
  if (!stored || stored === roleLabel || stored === originalRoleLabel || stored === "未命名模板") return "";
  return stored;
}
