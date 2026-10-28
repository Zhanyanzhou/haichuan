const MAX_PRODUCT_IDS = 50;

/** 把库存列表的 productIds 查询解析成正整数。空白表示不筛选；有内容但没有有效编号时返回空数组，避免退回全库。 */
export function parseInventoryProductIds(value?: string): number[] | undefined {
  if (value == null || value.trim() === "") return undefined;
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const part of value.split(/[\s,]+/)) {
    if (!part) continue;
    if (!/^[1-9]\d*$/.test(part)) continue;
    const id = Number(part);
    if (!Number.isSafeInteger(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_PRODUCT_IDS) break;
  }
  return ids;
}
