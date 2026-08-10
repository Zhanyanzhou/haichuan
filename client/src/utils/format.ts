/**
 * 格式化价格为人民币字符串；无效或非正数时返回 fallback（如「询价」）。
 */
export function formatPrice(value: unknown, fallback = "—"): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return `￥${n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
