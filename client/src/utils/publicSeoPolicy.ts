const NON_INDEXABLE_PUBLIC_ROUTE_PREFIXES = [
  "/customer",
  "/cart",
  "/checkout",
  "/partner",
  "/preview",
  "/__templates",
] as const;

/**
 * 账户、交易、受控预览与开发页面不是公开内容落地页。
 * React Router 默认大小写不敏感，因此这里同步按小写判断。
 */
export function isNonIndexablePublicRoute(pathname: string): boolean {
  const localized = resolvePublicLocalePath(pathname);
  if (localized.locale === "en" && !PUBLIC_ENGLISH_ROUTES_ENABLED) return true;
  const normalizedPath = localized.pathname.toLowerCase();
  return NON_INDEXABLE_PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );
}
import {
  PUBLIC_ENGLISH_ROUTES_ENABLED,
  resolvePublicLocalePath,
} from "@/i18n/publicLocale";
