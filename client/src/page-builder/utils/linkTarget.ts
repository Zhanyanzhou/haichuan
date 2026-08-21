export type LinkTargetType = "none" | "product" | "page";

export interface LinkTargetValue {
  targetType?: LinkTargetType | string;
  productCode?: string;
  productId?: number | string;
  linkUrl?: string;
}

export function normalizeLinkTargetType(value: LinkTargetValue): LinkTargetType {
  if (value.targetType === "none" || value.targetType === "product" || value.targetType === "page") {
    return value.targetType;
  }
  if (typeof value.productCode === "string" && value.productCode.trim()) return "product";
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
  const productCode = typeof value.productCode === "string" ? value.productCode.trim() : "";
  if (targetType === "product" && productCode) {
    return `/products/${encodeURIComponent(productCode)}`;
  }
  const productId = Number(value.productId);
  if (targetType === "product" && Number.isInteger(productId) && productId > 0) {
    return `/products/${productId}`;
  }
  if (targetType === "page" && isSafeInternalPath(value.linkUrl)) return value.linkUrl;
  return "";
}

/**
 * 条目级链接解析(轮播/图库/分类卡/热区条目):
 * 新数据为三件套(targetType/productId/linkUrl),旧草稿为裸 link 站内路径字段。
 * 仅当条目完全没有三件套痕迹(旧数据特征)时才回退裸 link,
 * 避免"切回不跳转"后残留的旧 link 字段让链接复活。
 */
export function resolveItemLinkUrl(
  item: LinkTargetValue & { link?: unknown },
): string {
  if (item.targetType != null || item.productCode != null || item.productId != null) {
    return resolveLinkTargetUrl(item);
  }
  return isSafeInternalPath(item.link) ? item.link : "";
}

/**
 * 前缀三件套解析(如 secondary*):与条目级同构的防复活语义——
 * 有三件套痕迹(用户在新面板操作过)完全信任,仅旧数据(无三件套)回退裸字段。
 */
export function resolvePrefixedLinkTarget(
  props: Record<string, any>,
  prefix: string,
  legacyKey?: string,
): string {
  const targetType = props[`${prefix}TargetType`];
  const productCode = props[`${prefix}ProductCode`];
  const productId = props[`${prefix}ProductId`];
  if (targetType != null || productCode != null || productId != null) {
    return resolveLinkTargetUrl({
      targetType,
      productCode,
      productId,
      linkUrl: props[`${prefix}LinkUrl`],
    });
  }
  return legacyKey && isSafeInternalPath(props[legacyKey])
    ? props[legacyKey]
    : "";
}
