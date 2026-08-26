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
 * EN-A 安全门禁：英文修订、发布指针与内容哈希尚未形成同语言事实前，
 * 所有公开内容接口必须在查询中文事实源之前拒绝英文请求。
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
