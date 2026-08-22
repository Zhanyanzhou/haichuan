import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { settingsApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { usePageMetaStore } from "@/store/pageMetaStore";
import {
  getEditorPage,
  getEditorPageByPath,
  isEditorPageKey,
  resolvePageHeaderMode,
} from "@/page-builder/config/editorPages";
import PublishedPageDecoration from "@/page-builder/runtime/PublishedPageDecoration";
import { usePublishedPageDocument } from "@/page-builder/runtime/usePublishedPageDocument";
import { resolveSiteLogo, StorefrontMenuDrawer } from "./StorefrontNavigation";
import StorefrontFooter from "./StorefrontFooter";

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
    <line x1="7" y1="7" x2="23" y2="23" />
    <line x1="23" y1="7" x2="7" y2="23" />
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
  const previewPageKey = location.pathname.match(/^\/preview\/([^/]+)$/)?.[1];
  const previewPage = isEditorPageKey(previewPageKey)
    ? getEditorPage(previewPageKey)
    : undefined;
  const isHome = location.pathname === "/" || previewPage?.key === "home";
  const pageDefinition = getEditorPageByPath(location.pathname) ?? previewPage;
  const publishedHeaderDocument = usePublishedPageDocument(
    previewPage ? undefined : pageDefinition?.key,
  );
  // 预览页由 PagePreview 读取草稿；不能再套一层公开发布文档装饰器。
  const decorationPage = previewPage ? undefined : isHome ? undefined : pageDefinition;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [siteSettings, setSiteSettings] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    settingsApi
      .getPublicSettings()
      .then((res) => {
        if (!cancelled) setSiteSettings(unwrapResponse<any>(res));
      })
      .catch(() => {
        // 公共页面保留品牌默认值，设置接口不可用不阻断访问。
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pageMeta = usePageMetaStore((s) => s.meta);

  useEffect(() => {
    const siteName = siteSettings?.siteName || "海川珠宝";
    // 页面级 SEO 优先于站点级（装修页面可覆盖默认标题/描述）
    const title =
      pageMeta.title || siteSettings?.seoTitle || siteSettings?.siteName;
    const description =
      pageMeta.description ||
      siteSettings?.seoDescription ||
      siteSettings?.siteDescription;
    const keywords = siteSettings?.seoKeywords;
    // og:image/twitter:image 相对路径绝对化，避免社交爬虫解析失败
    let image: string | undefined;
    if (pageMeta.image) {
      if (/^https?:\/\//i.test(pageMeta.image)) {
        image = pageMeta.image;
      } else {
        try {
          image = new URL(pageMeta.image, window.location.origin).href;
        } catch {
          image = pageMeta.image;
        }
      }
    }

    document.title = title || siteName;
    syncMeta("name", "description", description);
    syncMeta("name", "keywords", keywords);

    // 社交分享卡片（微信 / 微博 / Twitter / Facebook）—— 珠宝营销分享命脉
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:site_name", siteName);
    upsertMeta("property", "og:title", title || siteName);
    syncMeta("property", "og:description", description);
    syncMeta("property", "og:image", image);
    upsertMeta(
      "name",
      "twitter:card",
      image ? "summary_large_image" : "summary",
    );
    syncMeta("name", "twitter:title", title || siteName);
    syncMeta("name", "twitter:description", description);
    syncMeta("name", "twitter:image", image);
  }, [siteSettings, pageMeta]);

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
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle("home-route", isHome);
    return () => {
      document.documentElement.classList.remove("home-route");
    };
  }, [isHome]);

  // SEO：公开页可索引；受保护的草稿预览必须保持 noindex。
  useEffect(() => {
    const content = previewPage ? "noindex, nofollow" : "index, follow";
    const tag = document.head.querySelector<HTMLMetaElement>(
      'meta[name="robots"]',
    );
    if (tag) {
      tag.setAttribute("content", content);
      return;
    }

    const robots = document.createElement("meta");
    robots.setAttribute("name", "robots");
    robots.setAttribute("content", content);
    document.head.appendChild(robots);
  }, [location.pathname, previewPage]);

  const resolvedHeaderMode = previewPage
    ? previewPage.headerMode
    : pageDefinition && publishedHeaderDocument.status === "published"
      ? resolvePageHeaderMode(
          pageDefinition.key,
          publishedHeaderDocument.pageDocument?.puckData,
        )
      : "solid";
  const isOverlayHeader = resolvedHeaderMode === "overlay-light";
  const isTransparent = isOverlayHeader && !scrolled && !menuOpen;
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
    <div
      className={isHome ? "editorial-shell" : `site-shell${isOverlayHeader ? " site-shell--overlay" : ""}`}
      data-page-header-mode={resolvedHeaderMode}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-white focus:px-4 focus:py-3 focus:text-brand-text focus:shadow-lg"
      >
        跳至主内容
      </a>
      {/* ═══════ Header ═══════ */}
      <header
        className={`site-header${isTransparent ? " is-transparent" : ""}`}
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

          <div className="site-header__right">
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
          </div>
        </div>
      </header>

      {/* ═══════ 左侧组合：菜单 + 搜索 ═══════ */}
      <div
        className={`site-header__left-group${isTransparent ? " is-transparent" : ""}`}
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
          to="/catalog"
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
        id="main-content"
        tabIndex={-1}
        className={isHome ? "editorial-main" : `site-main${isOverlayHeader ? " site-main--overlay" : ""}`}
      >
        <PublishedPageDecoration
          pageKey={decorationPage?.key}
          pageLabel={decorationPage?.label}
          replaceChildren={Boolean(decorationPage && !decorationPage.dynamic)}
        >
          <Outlet />
        </PublishedPageDecoration>
      </main>

      <StorefrontFooter siteName={siteName} />
    </div>
  );
}
