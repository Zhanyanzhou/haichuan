import { SECTION_ROLES, type TemplateSectionRole } from "../template-creation/presets";

const ROLE_LABELS = new Map<string, string>(SECTION_ROLES);

/**
 * 目录卡片统一显示区块角色。
 * 模板不按首页、验收或自拟名称区分；已保存的名称不改。
 */
export function catalogCardName(sectionRole: string | undefined, storedName: string): string {
  const fromRole = sectionRole ? ROLE_LABELS.get(sectionRole as TemplateSectionRole) : undefined;
  if (fromRole) return fromRole;
  const compact = storedName.toLowerCase().replace(/[\s_-]/g, "");
  for (const [role, label] of SECTION_ROLES) {
    if (compact.includes(role.replace(/-/g, ""))) return label;
  }
  const trimmed = storedName.trim();
  return trimmed || "未命名模板";
}
