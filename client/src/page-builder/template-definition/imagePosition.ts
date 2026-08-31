export function objectPositionToPercent(value: string | undefined): { x: number; y: number } {
  const [horizontal = "center", vertical = "center"] = (value ?? "center center").split(" ");
  const axis = (token: string) => token === "left" || token === "top"
    ? 0
    : token === "right" || token === "bottom"
      ? 100
      : 50;
  return { x: axis(horizontal), y: axis(vertical) };
}

export function percentToObjectPosition(value: { x: number; y: number }): string {
  const horizontal = value.x <= 25 ? "left" : value.x >= 75 ? "right" : "center";
  const vertical = value.y <= 25 ? "top" : value.y >= 75 ? "bottom" : "center";
  return `${horizontal} ${vertical}`;
}
