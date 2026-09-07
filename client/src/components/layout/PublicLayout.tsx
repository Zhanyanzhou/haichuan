import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { getPageDocumentMeta, usePageMetaStore } from "@/store/pageMetaStore";
import {
  PublicSiteSettingsProvider,
  usePublicSiteSettingsResource,
} from "@/hooks/usePublicSiteSettings";
import AnalyticsConsentBanner from "@/components/privacy/AnalyticsConsentBanner";
import {
  buildPublicUrl,
  normalizePublicSiteOrigin,
} from "@/utils/publicSiteUrl";
import {
  getEditorPage,
  getEditorPageByPath,
  isEditorPageKey,
  resolvePageHeaderMode,
} from "@/page-builder/config/editorPages";
import PublishedPageDecoration from "@/page-builder/runtime/PublishedPageDecoration";
import { usePublishedPageDocument } from "@/page-builder/runtime/usePublishedPageDocument";
import { getPublishedPageReadiness } from "@/page-builder/runtime/publishedPageReadiness";
import { resolveSiteLogo, StorefrontMenuDrawer } from "./StorefrontNavigation";
import StorefrontFooter from "./StorefrontFooter";
import { normalizePublicProductReference } from "@/utils/publicProductPath";
import { isNonIndexablePublicRoute } from "@/utils/publicSeoPolicy";
import {
  DEFAULT_PUBLIC_CONTENT_LOCALE,
  PUBLIC_ENGLISH_ROUTES_ENABLED,
  resolvePublicLocalePath,
  withPublicLocalePath,
} from "@/i18n/publicLocale";
import { useCustomerAuthStore, type CustomerAccount } from "@/store/customerAuthStore";
import { customerApi } from "@/services/api";
import { USE_MOCK } from "@/services/mockData";
import { unwrapResponse } from "@/utils/unwrap";
import { useStructuredData } from "@/hooks/useStructuredData";
import { LEGAL_ENTITY } from "@/config/legalEntity";

/** 幂等写入/更新 <meta> 标签（按 name 或 property 选择）。 */
function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`,
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function syncMeta(attr: "name" | "property", key: string, content?: string) {
  if (content) {
    upsertMeta(attr, key, content);
    return;
  }
  document.head
    .querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
    ?.remove();
}

function syncLink(rel: string, href?: string | null) {
  const selector = `link[rel="${rel}"]`;
  const existing = document.head.querySelector<HTMLLinkElement>(selector);
  if (!href) {
    existing?.remove();
    return;
  }
  const link = existing ?? document.createElement("link");
  link.rel = rel;
  link.href = href;
  if (!existing) document.head.appendChild(link);
}

function syncAlternateLinks(entries: Array<{ hrefLang: string; href: string }>) {
  document.head
    .querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')
    .forEach((link) => link.remove());
  entries.forEach(({ hrefLang, href }) => {
    const link = document.createElement("link");
    link.rel = "alternate";
    link.hreflang = hrefLang;
    link.href = href;
    document.head.appendChild(link);
  });
}

function normalizeMetadataText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || undefined;
}

function resolvePublicSocialImage(
  origin: string | null,
  value: unknown,
): string | undefined {
  const source = normalizeMetadataText(value);
  if (!origin || !source) return undefined;
  try {
    const url = new URL(source, `${origin}/`);
    if (url.username || url.password) return undefined;
    const validProtocol = url.protocol === "https:"
      || (import.meta.env.DEV && url.protocol === "http:" && url.origin === origin);
    return validProtocol ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const SOCIAL_META_KEYS = [
  ["property", "og:type"],
  ["property", "og:site_name"],
  ["property", "og:title"],
  ["property", "og:description"],
  ["property", "og:image"],
  ["property", "og:url"],
  ["property", "og:locale"],
  ["name", "twitter:card"],
  ["name", "twitter:title"],
  ["name", "twitter:description"],
  ["name", "twitter:image"],
] as const;

function clearSocialMetadata() {
  SOCIAL_META_KEYS.forEach(([attr, key]) => syncMeta(attr, key));
}

const publicSiteOrigin = normalizePublicSiteOrigin(
  import.meta.env.VITE_PUBLIC_SITE_ORIGIN,
  { allowHttp: import.meta.env.DEV },
);

/* ═══════ 内联图标 ═══════ */
const MenuIcon = () => (
  <svg
    width="30"
    height="30"
    viewBox="0 0 30 30"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
  >
    <line x1="4" y1="7" x2="26" y2="7" />
    <line x1="4" y1="15" x2="26" y2="15" />
    <line x1="4" y1="23" x2="26" y2="23" />
  </svg>
);
const CloseIcon = () => (
  <svg
    width="30"
    height="30"
    viewBox="0 0 30 30"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
  >
    <line x1="4" y1="4" x2="26" y2="26" />
    <line x1="26" y1="4" x2="4" y2="26" />
  </svg>
);
const SearchIcon = () => (
  <svg
    width="30"
    height="30"
    viewBox="0 0 30 30"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
  >
    <circle cx="13" cy="13" r="8" />
    <line x1="19" y1="19" x2="27" y2="27" />
  </svg>
);
const DiamondIcon = () => (
  <svg
    width="30"
    height="30"
    viewBox="0 0 30 30"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinejoin="round"
  >
    <path d="M15 3 L23 13.5 L15 27 L7 13.5 Z" />
  </svg>
);
const CalendarIcon = () => (
  <svg
    width="30"
    height="30"
    viewBox="0 0 30 30"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="5.5" width="24" height="21" rx="2" />
    <line x1="3" y1="14" x2="27" y2="14" />
    <line x1="9" y1="2" x2="9" y2="9" />
    <line x1="21" y1="2" x2="21" y2="9" />
  </svg>
);
const AccountIcon = () => (
  <svg
    width="30"
    height="30"
    viewBox="0 0 30 30"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
  >
    <circle cx="15" cy="10" r="5" />
    <path d="M5 27c.8-5.2 4.2-8 10-8s9.2 2.8 10 8" />
  </svg>
);

export default function PublicLayout() {
  const location = useLocation();
  const localizedPath = resolvePublicLocalePath(location.pathname);
  const contentPathname = localizedPath.pathname;
  const mainRef = useRef<HTMLElement>(null);
  const previousPathRef = useRef(location.pathname);
  const previewPageKey = contentPathname.match(/^\/preview\/([^/]+)$/)?.[1];
  const previewPage = isEditorPageKey(previewPageKey)
    ? getEditorPage(previewPageKey)
    : undefined;
  const isHome = contentPathname === "/" || previewPage?.key === "home";
  const pageDefinition = getEditorPageByPath(contentPathname) ?? previewPage;
  const publishedHeaderDocument = usePublishedPageDocument(
    previewPage ? undefined : pageDefinition?.key,
  );
  const publishedHeaderReadiness = getPublishedPageReadiness(
    pageDefinition?.key,
    publishedHeaderDocument.pageDocument?.puckData,
  );
  const pageDocumentUnavailable = Boolean(
    !previewPage
    && pageDefinition
    && (publishedHeaderDocument.status !== "published" || !publishedHeaderReadiness?.ready),
  );
  const fallbackHasContactAction = Boolean(
    pageDocumentUnavailable
    && [
      pageDefinition?.publicFallback?.primaryAction,
      pageDefinition?.publicFallback?.secondaryAction,
    ].some((action) => action?.href.startsWith("/contact")),
  );
  const hideFooterService =
    contentPathname === "/custom"
    || contentPathname === "/contact"
    || fallbackHasContactAction;
  // 预览页由 PagePreview 读取草稿；不能再套一层公开发布文档装饰器。
  const decorationPage = previewPage ? undefined : isHome ? undefined : pageDefinition;
  const decorationFallback = (() => {
    const fallback = decorationPage?.publicFallback;
    if (!fallback || decorationPage?.key !== "custom") return fallback;
    const productRef = normalizePublicProductReference(
      new URLSearchParams(location.search).get("productRef"),
    );
    const params = new URLSearchParams({ type: "custom" });
    if (productRef) params.set("productRef", productRef);
    return {
      ...fallback,
      primaryAction: {
        ...fallback.primaryAction,
        href: `${withPublicLocalePath("/contact", localizedPath.locale)}?${params.toString()}`,
      },
    };
  })();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const siteSettingsResource = usePublicSiteSettingsResource();
  const siteSettings = siteSettingsResource.settings;
  const customerAuthStatus = useCustomerAuthStore((state) => state.status);
  const setCustomerAuth = useCustomerAuthStore((state) => state.setAuth);
  const markCustomerAnonymous = useCustomerAuthStore((state) => state.markAnonymous);
  const needsCustomerIdentity =
    contentPathname === "/catalog" || /^\/products\/[^/]+$/.test(contentPathname);
  const pageMeta = usePageMetaStore((state) => state.meta);
  const nonIndexableRoute = isNonIndexablePublicRoute(location.pathname);
  const publishedPageMeta = getPageDocumentMeta(
    publishedHeaderDocument.status === "published" && publishedHeaderReadiness?.ready
      ? publishedHeaderDocument.pageDocument?.metadata
      : undefined,
  );
  const noIndex = Boolean(
    nonIndexableRoute || previewPage || pageMeta.noIndex || pageDocumentUnavailable,
  );

  const organizationLogo = (() => {
    const logo = siteSettings?.logo?.trim();
    if (!logo) return undefined;
    if (/^https:\/\//i.test(logo)) return logo;
    return buildPublicUrl(publicSiteOrigin, logo) || undefined;
  })();
  const organizationStructuredData =
    !noIndex && publicSiteOrigin && siteSettings && siteSettingsResource.status === "loaded"
      ? {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: normalizeMetadataText(siteSettings?.siteName) || "海川珠宝",
          legalName: LEGAL_ENTITY.name,
          identifier: {
            "@type": "PropertyValue",
            propertyID: "统一社会信用代码",
            value: LEGAL_ENTITY.unifiedSocialCreditCode,
          },
          foundingDate: LEGAL_ENTITY.establishedOnIso,
          url: publicSiteOrigin,
          ...(organizationLogo ? { logo: organizationLogo } : {}),
          ...(siteSettings?.contactPhone?.trim()
            ? { telephone: siteSettings.contactPhone.trim() }
            : {}),
          ...(siteSettings?.contactEmail?.trim()
            ? { email: siteSettings.contactEmail.trim() }
            : {}),
          ...(siteSettings?.contactAddress?.trim()
            ? { address: siteSettings.contactAddress.trim() }
            : {}),
        }
      : null;
  useStructuredData("organization", organizationStructuredData);

  // 选款和作品详情会根据客户身份选择公开/会员事实。HttpOnly Cookie 无法由
  // JavaScript 自行探测，因此刷新这两类页面时通过最小 profile 请求恢复会话。
  useEffect(() => {
    if (!needsCustomerIdentity || customerAuthStatus !== "unknown") return;

    let active = true;
    customerApi.getProfile()
      .then((response) => {
        if (!active) return;
        const customer = unwrapResponse<CustomerAccount>(response);
        if (customer && Number.isInteger(customer.id)) setCustomerAuth(customer);
        else markCustomerAnonymous();
      })
      .catch(() => {
        if (active) markCustomerAnonymous();
      });

    return () => {
      active = false;
    };
  }, [customerAuthStatus, markCustomerAnonymous, needsCustomerIdentity, setCustomerAuth]);

  useEffect(() => {
    const siteName = siteSettings?.siteName || "海川珠宝";
    const routeTitle = pageDefinition && !isHome
      ? `${pageDefinition.label} | ${siteName}`
      : undefined;
    const routeDescription = pageDefinition?.publicFallback?.description
      || pageDefinition?.description;
    // 已发布 PageDocument SEO 优先；代码页面设置只在没有装修文档时作为安全回退。
    const title =
      publishedPageMeta.title || pageMeta.title || routeTitle || siteSettings?.seoTitle || siteSettings?.siteName;
    const description =
      publishedPageMeta.description ||
      pageMeta.description ||
      routeDescription ||
      siteSettings?.seoDescription ||
      siteSettings?.siteDescription;
    const keywords = siteSettings?.seoKeywords;
    const canonicalPath =
      noIndex || pageMeta.canonicalPath === null
        ? null
        : pageMeta.canonicalPath || location.pathname;
    const canonicalUrl = canonicalPath
      ? buildPublicUrl(publicSiteOrigin, canonicalPath)
      : null;
    const normalizedTitle = normalizeMetadataText(title);
    const normalizedDescription = normalizeMetadataText(description);
    const image = resolvePublicSocialImage(
      publicSiteOrigin,
      publishedPageMeta.image || pageMeta.image,
    );
    const socialMetadataReady = Boolean(
      !noIndex
      && canonicalUrl
      && normalizedTitle
      && normalizedDescription
      && siteSettings
      && siteSettingsResource.status === "loaded",
    );

    document.title = normalizedTitle || siteName;
    syncMeta("name", "description", normalizedDescription);
    syncMeta("name", "keywords", normalizeMetadataText(keywords));
    upsertMeta(
      "name",
      "robots",
      noIndex ? "noindex, nofollow" : "index, follow",
    );
    syncLink("canonical", canonicalUrl);

    if (socialMetadataReady && canonicalUrl && normalizedTitle && normalizedDescription) {
      upsertMeta("property", "og:type", "website");
      upsertMeta("property", "og:site_name", siteName);
      upsertMeta("property", "og:title", normalizedTitle);
      upsertMeta("property", "og:description", normalizedDescription);
      syncMeta("property", "og:image", image);
      upsertMeta("property", "og:url", canonicalUrl);
      upsertMeta(
        "property",
        "og:locale",
        localizedPath.locale === "en" ? "en_US" : "zh_CN",
      );
      upsertMeta("name", "twitter:card", image ? "summary_large_image" : "summary");
      upsertMeta("name", "twitter:title", normalizedTitle);
      upsertMeta("name", "twitter:description", normalizedDescription);
      syncMeta("name", "twitter:image", image);
    } else {
      clearSocialMetadata();
    }

    if (!canonicalUrl || noIndex) {
      syncAlternateLinks([]);
      return () => {
        syncLink("canonical", null);
        syncAlternateLinks([]);
        clearSocialMetadata();
        upsertMeta("name", "robots", "noindex, nofollow");
      };
    }
    const alternateBasePath = contentPathname;
    const alternateLocales = [
      {
        locale: DEFAULT_PUBLIC_CONTENT_LOCALE,
        hrefLang: "zh-CN",
      },
      ...(PUBLIC_ENGLISH_ROUTES_ENABLED
        ? [{ locale: "en" as const, hrefLang: "en" }]
        : []),
    ];
    const alternates = alternateLocales.flatMap(({ locale, hrefLang }) => {
      const href = buildPublicUrl(
        publicSiteOrigin,
        withPublicLocalePath(alternateBasePath, locale),
      );
      return href ? [{ hrefLang, href }] : [];
    });
    const defaultHref = buildPublicUrl(
      publicSiteOrigin,
      withPublicLocalePath(alternateBasePath, DEFAULT_PUBLIC_CONTENT_LOCALE),
    );
    if (defaultHref) alternates.push({ hrefLang: "x-default", href: defaultHref });
    syncAlternateLinks(alternates);
    return () => {
      syncLink("canonical", null);
      syncAlternateLinks([]);
      clearSocialMetadata();
      upsertMeta("name", "robots", "noindex, nofollow");
    };
  }, [
    siteSettings,
    siteSettingsResource.status,
    pageMeta,
    publishedPageMeta.title,
    publishedPageMeta.description,
    publishedPageMeta.image,
    location.pathname,
    pageDefinition,
    isHome,
    noIndex,
    contentPathname,
    localizedPath.locale,
  ]);

  const siteName = siteSettings?.siteName || "海川珠宝";
  const contactPhone = siteSettings?.contactPhone?.trim() || "";
  const contactAddress = siteSettings?.contactAddress?.trim() || "";
  const logoUrl = resolveSiteLogo(siteSettings?.logo);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const pathChanged = previousPathRef.current !== location.pathname;
    previousPathRef.current = location.pathname;
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });

    if (!pathChanged) return;
    const focusFrame = window.requestAnimationFrame(() => {
      mainRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [location.pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle("home-route", isHome);
    return () => {
      document.documentElement.classList.remove("home-route");
    };
  }, [isHome]);

  const resolvedHeaderMode = previewPage
    ? previewPage.headerMode
    : pageDefinition && publishedHeaderDocument.status === "published" && publishedHeaderReadiness?.ready
      ? resolvePageHeaderMode(
          pageDefinition.key,
          publishedHeaderReadiness.data,
        )
      : "solid";
  const overlaysPageContent = Boolean(pageDefinition);
  const isTransparent = !scrolled && !menuOpen;
  const usesLightHeaderText = resolvedHeaderMode === "overlay-light" && isTransparent;
  const headerBg = isTransparent ? "transparent" : "rgba(255,255,255,0.92)";
  const headerBorder = isTransparent ? "transparent" : "rgba(24,26,27,0.06)";

  const handleBrandHomeClick = () => {
    // Link 在首页内重复导航时 pathname 不变，不会再次触发路由回顶副作用。
    // 品牌字标始终承担“返回首页起点”的语义，因此同页点击也要明确回到顶部。
    if (isHome) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  };

  return (
    <PublicSiteSettingsProvider resource={siteSettingsResource}>
    <div
      className={isHome ? "editorial-shell" : `site-shell${overlaysPageContent ? " site-shell--overlay" : ""}`}
      data-page-header-mode={resolvedHeaderMode}
      data-page-header-surface={isTransparent ? "transparent" : "solid"}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-white focus:px-4 focus:py-3 focus:text-brand-text focus:shadow-lg"
      >
        跳至主内容
      </a>
      {/* ═══════ Header ═══════ */}
      <header
        className={`site-header${isTransparent ? " is-transparent" : ""}${usesLightHeaderText ? " is-overlay-light" : ""}`}
        style={{
          background: headerBg,
          borderBottomColor: headerBorder,
          backdropFilter: isTransparent ? "none" : "blur(8px)",
          WebkitBackdropFilter: isTransparent ? "none" : "blur(8px)",
        }}
      >
        <div className="site-header__inner">
          <div className="site-header__left" />

          <Link
            to="/"
            className="site-header__brand"
            aria-label={`${siteName}首页`}
            onClick={handleBrandHomeClick}
          >
            {logoUrl && (
              <img
                src={logoUrl}
                alt=""
                aria-hidden="true"
                className="site-header__logo"
                decoding="async"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <span className="site-header__brand-text">{siteName}</span>
          </Link>

          <nav className="site-header__right" aria-label="快捷入口">
            <Link
              to="/catalog"
              aria-label="选款中心"
              className="site-header__nav-item"
            >
              <DiamondIcon />
              <span className="site-header__nav-label hidden sm:inline">
                选款
              </span>
            </Link>
            <Link
              to="/contact"
              aria-label="预约咨询"
              className="site-header__nav-item"
            >
              <CalendarIcon />
              <span className="site-header__nav-label hidden sm:inline">
                预约
              </span>
            </Link>
            <Link
              to="/customer"
              aria-label="我的账户"
              className="site-header__nav-item"
            >
              <AccountIcon />
              <span className="site-header__nav-label hidden sm:inline">
                我的账户
              </span>
            </Link>
          </nav>
        </div>
      </header>

      {/* ═══════ 左侧组合：菜单 + 搜索 ═══════ */}
      <div
        className={`site-header__left-group${isTransparent ? " is-transparent" : ""}${usesLightHeaderText ? " is-overlay-light" : ""}`}
      >
        <button
          ref={menuToggleRef}
          type="button"
          className="site-menu-toggle"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-controls="brand-menu"
          aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
        >
          {menuOpen ? (
            <>
              <CloseIcon />
              <span className="site-menu-toggle__label">关闭</span>
            </>
          ) : (
            <>
              <MenuIcon />
              <span className="site-menu-toggle__label">菜单</span>
            </>
          )}
        </button>
        <Link
          to="/catalog#catalog-search-input"
          aria-label="搜索"
          className="site-header__nav-item"
        >
          <SearchIcon />
          <span className="site-header__nav-label hidden sm:inline">搜索</span>
        </Link>
      </div>

      {/* ═══════ 菜单面板 ═══════ */}
      <StorefrontMenuDrawer
        open={menuOpen}
        onOpenChange={setMenuOpen}
        contactPhone={contactPhone}
        contactAddress={contactAddress}
        menuId="brand-menu"
        returnFocusRef={menuToggleRef}
      />

      {/* ═══════ Main ═══════ */}
      <main
        ref={mainRef}
        id="main-content"
        tabIndex={-1}
        style={{ outline: "none" }}
        className={isHome
          ? `editorial-main site-main${overlaysPageContent ? " site-main--overlay" : ""}`
          : `site-main${overlaysPageContent ? " site-main--overlay" : ""}`}
      >
        {USE_MOCK && (
          <aside
            aria-label="演示数据说明"
            className={`border-b border-[#DDE1E2] bg-[#F4F5F5] px-5 py-3 text-center text-[12px] leading-5 tracking-[0.06em] text-[#5F6568]${
              overlaysPageContent ? " mt-16 md:mt-[72px] xl:mt-[108px]" : ""
            }`}
          >
            <strong className="font-medium text-[#181A1B]">演示数据</strong>
            <span aria-hidden="true"> · </span>
            当前商品、订单与账号仅用于本地功能验收，不代表真实库存、价格或服务承诺。
          </aside>
        )}
        <PublishedPageDecoration
          pageKey={decorationPage?.key}
          pageLabel={decorationPage?.label}
          documentResource={publishedHeaderDocument}
          replaceChildren={Boolean(decorationPage && !decorationPage.dynamic)}
          publicFallback={decorationFallback}
        >
          {needsCustomerIdentity && customerAuthStatus === "unknown" ? (
            <div className="flex min-h-[40vh] items-center justify-center" role="status">
              正在确认账户状态…
            </div>
          ) : (
            <Outlet context={publishedHeaderDocument} />
          )}
        </PublishedPageDecoration>
      </main>

      <StorefrontFooter siteName={siteName} showService={!hideFooterService} />
      <AnalyticsConsentBanner />
    </div>
    </PublicSiteSettingsProvider>
  );
}
