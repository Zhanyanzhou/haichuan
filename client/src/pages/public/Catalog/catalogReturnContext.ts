export type CatalogReturnContext = {
  catalogUrl: string;
  productReference: string;
  productId: number;
  productIndex: number;
  focusTarget: "detail" | "card";
  scrollY: number;
};

let pendingCatalogReturn: CatalogReturnContext | null = null;

/** 离开目录与作品详情组成的浏览链时立即丢弃一次性返回位置。 */
export function clearCatalogReturnContext(): void {
  pendingCatalogReturn = null;
}

/**
 * 仅保存本次 SPA 浏览链路需要的返回位置；刷新或新标签页后自然失效，
 * 避免把访客浏览轨迹写入 localStorage/sessionStorage。
 */
export function recordCatalogDeparture(context: CatalogReturnContext): void {
  if (!context.catalogUrl.startsWith("/catalog")) return;
  pendingCatalogReturn = {
    ...context,
    productReference: context.productReference.trim(),
    productId: Math.max(0, Math.trunc(context.productId)),
    productIndex: Math.max(0, Math.trunc(context.productIndex)),
    scrollY: Math.max(0, Number.isFinite(context.scrollY) ? context.scrollY : 0),
  };
}

const CATALOG_RETURN_BASE = "https://catalog-return.invalid";
const CATALOG_RETURN_MAX_LENGTH = 512;

/**
 * 只接受本次选款中心地址。筛选已经在这条地址里，刷新后仍可返回，
 * 且不把浏览轨迹写入 localStorage 或 sessionStorage。
 */
export function sanitizeCatalogReturnUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  const hasControlCharacter = Array.from(candidate).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (
    !candidate
    || candidate.length > CATALOG_RETURN_MAX_LENGTH
    || !candidate.startsWith("/catalog")
    || candidate.startsWith("//")
    || candidate.includes("\\")
    || hasControlCharacter
  ) return null;

  try {
    const parsed = new URL(candidate, CATALOG_RETURN_BASE);
    if (parsed.origin !== CATALOG_RETURN_BASE) return null;
    if (parsed.pathname !== "/catalog" && !parsed.pathname.startsWith("/catalog/")) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

/** 把当前筛选地址带到作品链接上，刷新后面包屑仍能回到同一结果。 */
export function productPathWithCatalogReturn(productPath: string, catalogUrl: string | null): string {
  const safeCatalogUrl = sanitizeCatalogReturnUrl(catalogUrl);
  if (!safeCatalogUrl) return productPath;
  const separator = productPath.includes("?") ? "&" : "?";
  return `${productPath}${separator}from=${encodeURIComponent(safeCatalogUrl)}`;
}

/** 详情页只读取来源链接，不提前消费目录恢复信息。 */
export function getCatalogReturnUrl(productReference: string | undefined): string | null {
  if (!pendingCatalogReturn || !productReference) return null;
  return pendingCatalogReturn.productReference === productReference
    ? pendingCatalogReturn.catalogUrl
    : null;
}

/**
 * 目录读取完全匹配的来源，但在焦点真正恢复前不清除。
 * Catalog 可能因页面装饰或身份投影在首帧后重挂载，新实例仍须能接续同一次恢复。
 */
export function readCatalogReturnContext(catalogUrl: string): CatalogReturnContext | null {
  if (!pendingCatalogReturn) return null;
  if (pendingCatalogReturn.catalogUrl === catalogUrl) return pendingCatalogReturn;
  pendingCatalogReturn = null;
  return null;
}

/** 仅完成当前仍匹配的恢复，避免旧实例清除较新的离开记录。 */
export function completeCatalogReturnContext(context: CatalogReturnContext): void {
  if (pendingCatalogReturn === context) pendingCatalogReturn = null;
}
