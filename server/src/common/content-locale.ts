import { BadRequestException, NotFoundException } from "@nestjs/common";

export const PUBLIC_CONTENT_LOCALES = ["zh-CN", "en"] as const;
export type PublicContentLocale = (typeof PUBLIC_CONTENT_LOCALES)[number];
export const DEFAULT_PUBLIC_CONTENT_LOCALE: PublicContentLocale = "zh-CN";

export function parsePublicContentLocale(value: unknown): PublicContentLocale {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_PUBLIC_CONTENT_LOCALE;
  }
  if (typeof value !== "string" || !PUBLIC_CONTENT_LOCALES.includes(value as PublicContentLocale)) {
    throw new BadRequestException({
      code: "UNSUPPORTED_CONTENT_LOCALE",
      message: "Unsupported content locale",
    });
  }
  return value as PublicContentLocale;
}

/**
 * D.35：公网只发布中文；所有公开内容接口必须在查询事实源之前拒绝英文请求。
 */
export function requirePublishedPublicContentLocale(
  value: unknown,
): PublicContentLocale {
  const locale = parsePublicContentLocale(value);
  if (locale !== DEFAULT_PUBLIC_CONTENT_LOCALE) {
    throw new NotFoundException({
      code: "CONTENT_LOCALE_UNAVAILABLE",
      message: "Requested locale is not published",
      locale,
    });
  }
  return locale;
}

/** D.35：后台只允许继续编辑和推进中文；英文仅保留受保护的历史只读能力。 */
export function requireEditablePublicContentLocale(
  value: unknown,
): PublicContentLocale {
  const locale = parsePublicContentLocale(value);
  if (locale !== DEFAULT_PUBLIC_CONTENT_LOCALE) {
    throw new BadRequestException({
      code: "CONTENT_LOCALE_RETIRED",
      message: "This content locale is retired",
      locale,
    });
  }
  return locale;
}
