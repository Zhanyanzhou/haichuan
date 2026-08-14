export type LinkTargetType = "none" | "product" | "page";

export interface LinkTargetValue {
  targetType?: LinkTargetType | string;
  productId?: number | string;
  linkUrl?: string;
}

export function normalizeLinkTargetType(value: LinkTargetValue): LinkTargetType {
  if (value.targetType === "none" || value.targetType === "product" || value.targetType === "page") {
    return value.targetType;
  }
  const productId = Number(value.productId);
  if (Number.isInteger(productId) && productId > 0) return "product";
  if (isSafeInternalPath(value.linkUrl)) return "page";
  return "none";
}

export function isSafeInternalPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

/** 统一解析装修模板的点击目标；旧草稿未保存 targetType 时仍兼容 productId/linkUrl。 */
export function resolveLinkTargetUrl(value: LinkTargetValue): string {
  const targetType = normalizeLinkTargetType(value);
  const productId = Number(value.productId);
  if (targetType === "product" && Number.isInteger(productId) && productId > 0) {
    return `/products/${productId}`;
  }
  if (targetType === "page" && isSafeInternalPath(value.linkUrl)) return value.linkUrl;
  return "";
}
