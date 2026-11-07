/** 公开作品名不混入历史款号，款号由商品自身字段独立呈现。 */
export function getPublicProductTitle(name: string): string {
  return name
    .replace(/[\p{Script=Latin}\p{Nd}]+(?:[-_./][\p{Script=Latin}\p{Nd}]+)*/gu, "")
    .replace(/\(\s*\)|（\s*）|【\s*】/gu, "")
    .replace(/^[\s·:：_./-]+|[\s·:：_./-]+$/gu, "")
    .replace(/\s+/gu, " ") || "珠宝作品";
}
