export const PRODUCT_CODE_REDIRECT_KEY = "product-code-redirects";

export interface ProductCodeRedirect {
  productId: number;
  code: string;
}

export function readProductCodeRedirectMap(value: unknown): Record<string, ProductCodeRedirect> {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const entries = (parsed as { codes?: unknown }).codes;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) return {};
  const map: Record<string, ProductCodeRedirect> = {};
  for (const [former, entry] of Object.entries(entries)) {
    if (!former.trim() || !entry || typeof entry !== "object") continue;
    const productId = (entry as { productId?: unknown }).productId;
    const code = (entry as { code?: unknown }).code;
    if (!Number.isInteger(productId) || (productId as number) < 1) continue;
    if (typeof code !== "string" || !code.trim() || code.trim().length > 50) continue;
    map[former] = { productId: productId as number, code: code.trim() };
  }
  return map;
}

/** 把这件商品的旧款号都指到新款号，并允许收回自己曾经用过的款号。 */
export function retargetProductCodeRedirects(
  map: Record<string, ProductCodeRedirect>,
  productId: number,
  from: string,
  to: string,
): Record<string, ProductCodeRedirect> {
  const next: Record<string, ProductCodeRedirect> = {};
  for (const [former, target] of Object.entries(map)) {
    if (former === to) continue;
    next[former] = target.productId === productId
      ? { productId, code: to }
      : target;
  }
  if (from && from !== to) next[from] = { productId, code: to };
  delete next[to];
  return next;
}
