/**
 * 作品网格的标题、说明和区块链接默认不占画面。
 * 只有桌面规则显式写成 hidden: false 才显示；不改已存模板 JSON。
 * 品名、卖点、价格仍按各自槽位处理，不在这组里。
 */
const SECTION_COPY_IDENTITIES = new Set([
  "title",
  "subtitle",
  "description",
  "cta",
  "brandName",
  "sectionLink",
  "secondaryLink",
]);

export function isSectionCopySlot(slot: { semanticRole?: string; key?: string } | undefined): boolean {
  if (!slot) return false;
  return SECTION_COPY_IDENTITIES.has(slot.semanticRole ?? "") || SECTION_COPY_IDENTITIES.has(slot.key ?? "");
}

export function sectionCopyHiddenByDefault(
  sectionRole: string | undefined,
  slot: { semanticRole?: string; key?: string } | undefined,
  rulesHidden: boolean | undefined,
): boolean {
  return sectionRole === "creation-grid" && isSectionCopySlot(slot) && rulesHidden !== false;
}
