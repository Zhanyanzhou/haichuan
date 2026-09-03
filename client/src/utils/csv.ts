/**
 * 后台 CSV 导出共享转义：含逗号/引号/换行的值加引号并转义内部引号，
 * 防止商品名、客户名等字段把导出文件撕裂错列；同时前置单引号阻断
 * Excel/WPS 把以 = + - @ 开头的文本当公式执行的注入路径。
 */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** 拼接一行 CSV（各列先经 csvCell 转义）。 */
export function csvRow(cells: readonly unknown[]): string {
  return cells.map(csvCell).join(",");
}
