import {
  normalizeContentTemplatePageTarget,
} from "@/page-builder/generated/contentTemplates.generated";

export type LinkTargetType = "none" | "product" | "category" | "page" | "external";

export interface LinkTargetValue {
  targetType?: LinkTargetType | string;
  productCode?: string;
  productId?: number | string;
  categorySlug?: unknown;
  linkUrl?: string;
}

export function normalizeLinkTargetType(value: LinkTargetValue): LinkTargetType {
  if (
    value.targetType === "none" ||
    value.targetType === "product" ||
    value.targetType === "category" ||
    value.targetType === "page" ||
    value.targetType === "external"
  ) {
    return value.targetType;
  }
  if (typeof value.productCode === "string" && value.productCode.trim()) return "product";
  const productId = Number(value.productId);
  if (Number.isInteger(productId) && productId > 0) return "product";
  if (typeof value.categorySlug === "string" && value.categorySlug.trim()) return "category";
  if (normalizeContentTemplatePageTarget(value.linkUrl)) return "page";
  return "none";
}

export function normalizeHttpsExternalTarget(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && Boolean(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function isSafeInternalPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

/** 选款中心当前稳定支持的分类筛选入口。 */
export function createCatalogCategoryUrl(categoryReference: unknown): string {
  const normalizedReference = typeof categoryReference === "string"
    ? categoryReference.trim()
    : Number.isInteger(Number(categoryReference)) && Number(categoryReference) > 0
      ? String(Number(categoryReference))
      : "";
  return normalizedReference
    ? `/catalog?category=${encodeURIComponent(normalizedReference)}`
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
  if (targetType === "category") {
    return typeof value.categorySlug === "string" && value.categorySlug.trim()
      ? createCatalogCategoryUrl(value.categorySlug)
      : "";
  }
  if (targetType === "page") {
    return normalizeContentTemplatePageTarget(value.linkUrl) ?? "";
  }
  if (targetType === "external") {
    return normalizeHttpsExternalTarget(value.linkUrl) ?? "";
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
  if (
    item.targetType != null ||
    item.productCode != null ||
    item.productId != null ||
    item.categorySlug != null ||
    item.linkUrl != null
  ) {
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
  const categorySlug = props[`${prefix}CategorySlug`];
  const linkUrl = props[`${prefix}LinkUrl`];
  if (targetType != null || productCode != null || productId != null || categorySlug != null || linkUrl != null) {
    return resolveLinkTargetUrl({
      targetType: typeof targetType === "string" ? targetType : undefined,
      productCode: typeof productCode === "string" ? productCode : undefined,
      productId: typeof productId === "string" || typeof productId === "number" ? productId : undefined,
      categorySlug: typeof categorySlug === "string" ? categorySlug : undefined,
      linkUrl: typeof linkUrl === "string" ? linkUrl : undefined,
    });
  }
  return legacyKey
    ? normalizeContentTemplatePageTarget(props[legacyKey]) ?? ""
    : "";
}
