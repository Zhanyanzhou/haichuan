import {
  normalizeContentTemplatePageTarget,
} from "@/page-builder/generated/contentTemplates.generated";

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
  if (normalizeContentTemplatePageTarget(value.linkUrl)) return "page";
  return "none";
}

export function isSafeInternalPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

/** 选款中心当前稳定支持的分类筛选入口。 */
export function createCatalogCategoryUrl(categoryId: unknown): string {
  const normalizedId = Number(categoryId);
  return Number.isInteger(normalizedId) && normalizedId > 0
    ? `/catalog?category=${encodeURIComponent(String(normalizedId))}`
    : "/catalog";
}

/** 公开运行时兼容旧分类 CTA，不改写保存中的 Puck 文档。 */
export function normalizeCatalogIntentUrl(value: string): string {
  if (!isSafeInternalPath(value)) return value;
  const url = new URL(value, "https://haichuan.invalid");
  if (url.pathname !== "/products") return value;
  const categoryId = url.searchParams.get("categoryId") || url.searchParams.get("category");
  return categoryId ? createCatalogCategoryUrl(categoryId) : "/catalog";
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
  if (targetType === "page") {
    return normalizeContentTemplatePageTarget(value.linkUrl) ?? "";
  }
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
  return normalizeContentTemplatePageTarget(item.link) ?? "";
}

/**
 * 前缀三件套解析(如 secondary*):与条目级同构的防复活语义——
 * 有三件套痕迹(用户在新面板操作过)完全信任,仅旧数据(无三件套)回退裸字段。
 */
export function resolvePrefixedLinkTarget(
  props: Record<string, unknown>,
  prefix: string,
  legacyKey?: string,
): string {
  const targetType = props[`${prefix}TargetType`];
  const productCode = props[`${prefix}ProductCode`];
  const productId = props[`${prefix}ProductId`];
  const linkUrl = props[`${prefix}LinkUrl`];
  if (targetType != null || productCode != null || productId != null) {
    return resolveLinkTargetUrl({
      targetType: typeof targetType === "string" ? targetType : undefined,
      productCode: typeof productCode === "string" ? productCode : undefined,
      productId: typeof productId === "string" || typeof productId === "number" ? productId : undefined,
      linkUrl: typeof linkUrl === "string" ? linkUrl : undefined,
    });
  }
  return legacyKey
    ? normalizeContentTemplatePageTarget(props[legacyKey]) ?? ""
    : "";
}
