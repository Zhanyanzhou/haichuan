/** 材质编码 → 中文名称映射 */
export const materialLabels: Record<string, string> = {
  GOLD_999: '足金999',
  GOLD_9999: '足金9999',
  AU750: '18K金',
  PT950: '铂金950',
  S925: '银925',
  DIAMOND: '镶钻',
  JADE: '玉石',
  PEARL: '珍珠',
  GEMSTONE: '宝石',
  COLOR_GEM: '彩宝',
};

const materialCodesByLabel = new Map(
  Object.entries(materialLabels).map(([code, label]) => [label, code]),
);

export function getMaterialLabel(code: string): string {
  return materialLabels[code] || code;
}

export function getMaterialCode(label: string): string | undefined {
  return materialCodesByLabel.get(label);
}
