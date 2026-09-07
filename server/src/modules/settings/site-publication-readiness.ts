import { DEFAULT_PUBLIC_CONTENT_LOCALE } from "../../common/content-locale";

export const SITE_PUBLICATION_READINESS_SCHEMA_VERSION = 2 as const;

export const SITE_PUBLICATION_READINESS_AREAS = [
  "brand",
  "contact",
  "legal",
  "seo",
  "language",
] as const;

export type SitePublicationReadinessArea =
  (typeof SITE_PUBLICATION_READINESS_AREAS)[number];

export type SitePublicationReadinessBlocker = {
  code: string;
  area: SitePublicationReadinessArea;
  field: string;
  message: string;
};

export type SitePublicationReadinessResult = {
  schemaVersion: typeof SITE_PUBLICATION_READINESS_SCHEMA_VERSION;
  status: "READY" | "BLOCKED";
  ready: boolean;
  persisted: boolean;
  areas: Record<
    SitePublicationReadinessArea,
    { ready: boolean; blockerCodes: string[] }
  >;
  blockers: SitePublicationReadinessBlocker[];
};

const CURRENTLY_PUBLISHABLE_LOCALES: ReadonlySet<string> = new Set([
  DEFAULT_PUBLIC_CONTENT_LOCALE,
]);
const LEGACY_PLACEHOLDER_LOGOS = new Set([
  "/favicon.svg",
  "/images/brand-logo.svg",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isEmail(value: unknown): boolean {
  return hasText(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function normalizeHttpsBaseUrl(value: unknown): string | null {
  if (!hasText(value)) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:"
      && Boolean(url.hostname)
      && !url.username
      && !url.password
      && (url.pathname === "/" || url.pathname === "")
      && !url.search
      && !url.hash
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export function normalizePublishedBrandLogo(
  value: unknown,
  canonicalBaseUrl?: unknown,
): string | null {
  if (!hasText(value)) return null;
  const logo = value.trim();
  let placeholderPath: string | null = null;
  try {
    const canonicalOrigin = normalizeHttpsBaseUrl(canonicalBaseUrl);
    const parsed = new URL(logo, canonicalOrigin ?? "https://site.invalid");
    const isLocalPath = !/^[a-z][a-z\d+.-]*:/i.test(logo)
      && !logo.startsWith("//");
    if (isLocalPath || (canonicalOrigin && parsed.origin === canonicalOrigin)) {
      try {
        placeholderPath = decodeURIComponent(parsed.pathname).toLowerCase();
      } catch {
        placeholderPath = parsed.pathname.toLowerCase();
      }
    }
  } catch {
    // 非标准但非空的既有 Logo 值继续保留；本函数只负责清除已知占位资源。
  }
  return placeholderPath && LEGACY_PLACEHOLDER_LOGOS.has(placeholderPath)
    ? null
    : logo;
}

export function evaluateSitePublicationReadiness(
  input: unknown,
  options: { persisted: boolean },
): SitePublicationReadinessResult {
  const settings = isRecord(input) ? input : {};
  const blockers: SitePublicationReadinessBlocker[] = [];
  const add = (
    area: SitePublicationReadinessArea,
    code: string,
    field: string,
    message: string,
  ) => blockers.push({ area, code, field, message });

  if (!options.persisted) {
    add(
      "brand",
      "SITE_SETTINGS_NOT_PERSISTED",
      "siteSettings",
      "店铺资料尚未持久化；默认回退值不能作为正式发布资料。",
    );
  }

  if (!hasText(settings.siteName)) {
    add(
      "brand",
      "SITE_NAME_MISSING",
      "siteSettings.siteName",
      "站点名称缺失；请填写经品牌负责人确认的正式名称。",
    );
  }
  if (!hasText(settings.brandReviewReference)) {
    add(
      "brand",
      "BRAND_REVIEW_MISSING",
      "siteSettings.brandReviewReference",
      "品牌名称与公开呈现方式尚无正式签认凭据。",
    );
  }
  if (
    settings.brandPresentationMode !== "logo"
    && settings.brandPresentationMode !== "text-only"
  ) {
    add(
      "brand",
      "BRAND_PRESENTATION_MODE_INVALID",
      "siteSettings.brandPresentationMode",
      "品牌呈现方式必须明确选择正式 Logo 或纯文字中性模式。",
    );
  } else if (
    settings.brandPresentationMode === "logo"
    && !normalizePublishedBrandLogo(settings.logo, settings.canonicalBaseUrl)
  ) {
    add(
      "brand",
      "BRAND_LOGO_MISSING",
      "siteSettings.logo",
      "品牌呈现方式选择了正式 Logo，但尚未配置非占位 Logo。",
    );
  }

  for (const [field, label] of [
    ["contactPhone", "联系电话"],
    ["contactEmail", "联系邮箱"],
    ["contactAddress", "联系地址"],
    ["businessHours", "营业时间"],
  ] as const) {
    if (!hasText(settings[field])) {
      add(
        "contact",
        `SITE_${field.replace(/[A-Z]/g, (match) => `_${match}`).toUpperCase()}_MISSING`,
        `siteSettings.${field}`,
        `${label}缺失；请填写经内容负责人确认的正式值。`,
      );
    }
  }
  if (hasText(settings.contactEmail) && !isEmail(settings.contactEmail)) {
    add(
      "contact",
      "SITE_CONTACT_EMAIL_INVALID",
      "siteSettings.contactEmail",
      "联系邮箱格式无效；请填写可公开使用的正式邮箱。",
    );
  }

  if (!hasText(settings.legalEntityReviewReference)) {
    add(
      "legal",
      "LEGAL_ENTITY_REVIEW_MISSING",
      "siteSettings.legalEntityReviewReference",
      "经营主体公开信息尚无复核凭据；请记录法务或内容负责人的复核编号。",
    );
  }
  if (!hasText(settings.privacyPolicyReviewReference)) {
    add(
      "legal",
      "PRIVACY_POLICY_REVIEW_MISSING",
      "siteSettings.privacyPolicyReviewReference",
      "隐私说明尚无正式签认凭据；请记录已批准版本或复核编号。",
    );
  }

  for (const [field, label] of [
    ["seoTitle", "默认 SEO 标题"],
    ["seoDescription", "默认 SEO 描述"],
  ] as const) {
    if (!hasText(settings[field])) {
      add(
        "seo",
        `SITE_${field.replace(/[A-Z]/g, (match) => `_${match}`).toUpperCase()}_MISSING`,
        `siteSettings.${field}`,
        `${label}缺失；请填写正式搜索摘要。`,
      );
    }
  }
  if (!hasText(settings.seoReviewReference)) {
    add(
      "seo",
      "SEO_REVIEW_MISSING",
      "siteSettings.seoReviewReference",
      "SEO 标题、摘要与 canonical 尚无正式复核凭据；请记录内容负责人批准的版本或复核编号。",
    );
  }
  if (!hasText(settings.canonicalBaseUrl)) {
    add(
      "seo",
      "CANONICAL_BASE_URL_MISSING",
      "siteSettings.canonicalBaseUrl",
      "正式站点 HTTPS 基础地址缺失；无法确认 canonical 与分享链接来源。",
    );
  } else if (!normalizeHttpsBaseUrl(settings.canonicalBaseUrl)) {
    add(
      "seo",
      "CANONICAL_BASE_URL_INVALID",
      "siteSettings.canonicalBaseUrl",
      "正式站点基础地址必须是包含主机名的 HTTPS URL。",
    );
  }

  if (settings.defaultLocale !== DEFAULT_PUBLIC_CONTENT_LOCALE) {
    add(
      "language",
      "DEFAULT_LOCALE_UNSUPPORTED",
      "siteSettings.defaultLocale",
      "当前公开内容事实只支持 zh-CN；默认语言必须保持 zh-CN。",
    );
  }
  const locales = settings.publishedLocales;
  if (
    !Array.isArray(locales)
    || locales.length === 0
    || locales.some((locale) => typeof locale !== "string")
  ) {
    add(
      "language",
      "PUBLISHED_LOCALES_INVALID",
      "siteSettings.publishedLocales",
      "已发布语言必须是非空字符串数组。",
    );
  } else {
    const uniqueLocales = new Set<string>(locales);
    if (uniqueLocales.size !== locales.length) {
      add(
        "language",
        "PUBLISHED_LOCALES_DUPLICATED",
        "siteSettings.publishedLocales",
        "已发布语言不能包含重复项。",
      );
    }
    if (!uniqueLocales.has(DEFAULT_PUBLIC_CONTENT_LOCALE)) {
      add(
        "language",
        "PRIMARY_LOCALE_NOT_PUBLISHED",
        "siteSettings.publishedLocales",
        "中文主站 zh-CN 尚未标记为已发布语言。",
      );
    }
    const unavailable = [...uniqueLocales].filter(
      (locale) => !CURRENTLY_PUBLISHABLE_LOCALES.has(locale),
    );
    if (unavailable.length > 0) {
      add(
        "language",
        "UNAVAILABLE_LOCALE_CONFIGURED",
        "siteSettings.publishedLocales",
        `以下语言尚无独立发布 revision 与内容哈希，不能标记为已发布：${unavailable.join("、")}。`,
      );
    }
  }

  const areas = Object.fromEntries(
    SITE_PUBLICATION_READINESS_AREAS.map((area) => {
      const blockerCodes = blockers
        .filter((blocker) => blocker.area === area)
        .map((blocker) => blocker.code);
      return [area, { ready: blockerCodes.length === 0, blockerCodes }];
    }),
  ) as SitePublicationReadinessResult["areas"];

  return {
    schemaVersion: SITE_PUBLICATION_READINESS_SCHEMA_VERSION,
    status: blockers.length === 0 ? "READY" : "BLOCKED",
    ready: blockers.length === 0,
    persisted: options.persisted,
    areas,
    blockers,
  };
}

