export const PUBLIC_CONTENT_LOCALES = ["zh-CN", "en"] as const;

export type PublicContentLocale = (typeof PUBLIC_CONTENT_LOCALES)[number];

export const DEFAULT_PUBLIC_CONTENT_LOCALE: PublicContentLocale = "zh-CN";

/** D.35：公开英文站已退役；类型与解析只保留历史数据和旧链接兼容。 */
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
  if (/^\/en$/i.test(normalized)) return { locale: "en", pathname: "/" };
  if (/^\/en\//i.test(normalized)) {
    const contentPathname = normalized.slice(3) || "/";
    const staticContentRoute = contentPathname.match(/^\/(products|about|custom)\/?$/i);
    return {
      locale: "en",
      pathname: staticContentRoute
        ? `/${staticContentRoute[1]!.toLowerCase()}`
        : contentPathname,
    };
  }
  return { locale: DEFAULT_PUBLIC_CONTENT_LOCALE, pathname: normalized };
}

/** 旧英文站链接只允许回到同源中文路径；危险或歧义路径统一回首页。 */
export function resolveRetiredEnglishRedirect(pathname: string): string {
  const remainder = pathname.replace(/^\/en(?=\/|$)/i, "") || "/";
  if (
    !remainder.startsWith("/")
    || remainder.startsWith("//")
    || remainder.includes("\\")
    || /%(?:2f|5c)/i.test(remainder)
  ) return "/";
  return remainder;
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
