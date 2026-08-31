import { BLOCK_CATEGORIES } from "../config/blockMeta";

export interface TemplateCatalogGroup<T> {
  group: string;
  entries: T[];
}

export function groupTemplateCatalogEntries<T>(
  entries: readonly T[],
  readGroup: (entry: T) => string,
): TemplateCatalogGroup<T>[] {
  const grouped = entries.reduce((groups, entry) => {
    const group = readGroup(entry).trim() || "其他用途";
    groups.set(group, [...(groups.get(group) ?? []), entry]);
    return groups;
  }, new Map<string, T[]>());

  return Array.from(grouped)
    .map(([group, groupEntries]) => ({ group, entries: groupEntries }))
    .sort((left, right) => {
      const leftIndex = BLOCK_CATEGORIES.indexOf(left.group as (typeof BLOCK_CATEGORIES)[number]);
      const rightIndex = BLOCK_CATEGORIES.indexOf(right.group as (typeof BLOCK_CATEGORIES)[number]);
      if (leftIndex >= 0 || rightIndex >= 0) {
        return (leftIndex >= 0 ? leftIndex : Number.MAX_SAFE_INTEGER)
          - (rightIndex >= 0 ? rightIndex : Number.MAX_SAFE_INTEGER);
      }
      return left.group.localeCompare(right.group, "zh-CN");
    });
}
