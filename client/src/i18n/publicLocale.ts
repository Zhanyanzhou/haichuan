export const PUBLIC_CONTENT_LOCALES = ["zh-CN", "en"] as const;

export type PublicContentLocale = (typeof PUBLIC_CONTENT_LOCALES)[number];

export const DEFAULT_PUBLIC_CONTENT_LOCALE: PublicContentLocale = "zh-CN";

/**
 * EN-A 只建立不会误展示中文内容的安全轨道。英文内容、独立发布指针和内容哈希
 * 尚未完成前，这个门禁必须保持关闭，不能通过环境变量绕过内容验收。
 */
export const PUBLIC_ENGLISH_ROUTES_ENABLED = false;

export type PublicLocalePath = {
  locale: PublicContentLocale;
  pathname: string;
};

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed || trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

export function resolvePublicLocalePath(pathname: string): PublicLocalePath {
  const normalized = normalizePathname(pathname);
  if (normalized === "/en") return { locale: "en", pathname: "/" };
  if (normalized.startsWith("/en/")) {
    return { locale: "en", pathname: normalized.slice(3) || "/" };
  }
  return { locale: DEFAULT_PUBLIC_CONTENT_LOCALE, pathname: normalized };
}

export function getBrowserPublicContentLocale(): PublicContentLocale {
  if (typeof window === "undefined") return DEFAULT_PUBLIC_CONTENT_LOCALE;
  return resolvePublicLocalePath(window.location.pathname).locale;
}

export function withPublicLocalePath(
  pathname: string,
  locale: PublicContentLocale,
): string {
  const normalized = normalizePathname(pathname);
  if (locale === DEFAULT_PUBLIC_CONTENT_LOCALE) return normalized;
  return normalized === "/" ? "/en" : `/en${normalized}`;
}

export function isPublicContentLocaleAvailable(locale: PublicContentLocale) {
  return locale === DEFAULT_PUBLIC_CONTENT_LOCALE
    || (locale === "en" && PUBLIC_ENGLISH_ROUTES_ENABLED);
}
