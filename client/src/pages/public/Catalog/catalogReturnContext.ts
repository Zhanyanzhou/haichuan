export type CatalogReturnContext = {
  catalogUrl: string;
  productReference: string;
  productId: number;
  productIndex: number;
  focusTarget: "detail" | "quick-view";
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
