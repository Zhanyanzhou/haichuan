export function objectPositionToPercent(value: string | undefined): { x: number; y: number } {
  const [horizontal = "center", vertical = "center"] = (value ?? "center center").split(" ");
  const axis = (token: string) => /^\d+(?:\.\d+)?%$/.test(token)
    ? Math.min(100, Math.max(0, Number.parseFloat(token)))
    : token === "left" || token === "top"
    ? 0
    : token === "right" || token === "bottom"
      ? 100
      : 50;
  return { x: axis(horizontal), y: axis(vertical) };
}

/** 画布取景保存精确百分比；九宫格快捷预设继续使用关键字，不量化拖动结果。 */
export function percentToExactObjectPosition(value: { x: number; y: number }): string {
  const axis = (number: number) => Number.isFinite(number)
    ? Math.round(Math.min(100, Math.max(0, number)) * 100) / 100
    : 50;
  return `${axis(value.x)}% ${axis(value.y)}%`;
}

export function percentToObjectPosition(value: { x: number; y: number }): string {
  const horizontal = value.x <= 25 ? "left" : value.x >= 75 ? "right" : "center";
  const vertical = value.y <= 25 ? "top" : value.y >= 75 ? "bottom" : "center";
  return `${horizontal} ${vertical}`;
}
