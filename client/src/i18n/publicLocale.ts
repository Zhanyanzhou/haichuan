export const PUBLIC_CONTENT_LOCALES = ["zh-CN", "en"] as const;

export type PublicContentLocale = (typeof PUBLIC_CONTENT_LOCALES)[number];

export const DEFAULT_PUBLIC_CONTENT_LOCALE: PublicContentLocale = "zh-CN";

/** 英文路由已接入独立草稿、审核、发布指针与内容哈希；具体页面仍以英文发布事实为准。 */
export const PUBLIC_ENGLISH_ROUTES_ENABLED = true;

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
