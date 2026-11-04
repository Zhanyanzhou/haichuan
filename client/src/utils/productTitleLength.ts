/** 与淘宝、天猫宝贝标题一致：汉字等非 ASCII 计 2，字母、数字、半角符号与空格计 1，合计不超过 60。 */
export const PRODUCT_TITLE_MAX_UNITS = 60;

export function productTitleUnits(value: string): number {
  let units = 0;
  for (const char of value) {
    units += (char.codePointAt(0) ?? 0) <= 0x7f ? 1 : 2;
  }
  return units;
}

export function clampProductTitle(value: string, maxUnits = PRODUCT_TITLE_MAX_UNITS): string {
  let units = 0;
  let visible = "";
  for (const char of value) {
    const cost = (char.codePointAt(0) ?? 0) <= 0x7f ? 1 : 2;
    if (units + cost > maxUnits) break;
    units += cost;
    visible += char;
  }
  return visible;
}
