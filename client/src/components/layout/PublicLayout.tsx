import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { settingsApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { usePageMetaStore } from "@/store/pageMetaStore";
import { getEditorPageByPath } from "@/page-builder/config/editorPages";
import PublishedPageDecoration from "@/page-builder/runtime/PublishedPageDecoration";
import { resolveSiteLogo, StorefrontMenuDrawer } from "./StorefrontNavigation";

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
  const isHome = location.pathname === "/";
  const decorationPage = isHome
    ? undefined
    : getEditorPageByPath(location.pathname);
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
  const contactEmail = siteSettings?.contactEmail?.trim() || "";
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

  // SEO：前台公开页确保可索引（与 AdminLayout 的 noindex 互补，防御性）
  useEffect(() => {
    const tag = document.head.querySelector<HTMLMetaElement>(
      'meta[name="robots"]',
    );
    if (tag) {
      tag.setAttribute("content", "index, follow");
      return;
    }

    const robots = document.createElement("meta");
    robots.setAttribute("name", "robots");
    robots.setAttribute("content", "index, follow");
    document.head.appendChild(robots);
  }, [location.pathname]);

  const isTransparent = isHome && !scrolled && !menuOpen;
  const headerBg = isTransparent ? "transparent" : "rgba(255,255,255,0.92)";
  const headerBorder = isTransparent ? "transparent" : "rgba(41,36,31,0.06)";
  const navColor = "rgba(41,36,31,0.78)";

  return (
    <div className={isHome ? "editorial-shell" : "site-shell"}>
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
              style={{ color: navColor }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#211E1A")}
              onMouseLeave={(e) => (e.currentTarget.style.color = navColor)}
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
              style={{ color: navColor }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#211E1A")}
              onMouseLeave={(e) => (e.currentTarget.style.color = navColor)}
            >
              <CalendarIcon />
              <span className="site-header__nav-label hidden sm:inline">
                预约
              </span>
            </Link>
            <Link
              to="/customer"
              aria-label="我的账号"
              className="site-header__nav-item"
              style={{ color: navColor }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#211E1A")}
              onMouseLeave={(e) => (e.currentTarget.style.color = navColor)}
            >
              <AccountIcon />
              <span className="site-header__nav-label hidden sm:inline">
                我的账号
              </span>
            </Link>
          </div>
        </div>
      </header>

      {/* ═══════ 左侧组合：菜单 + 搜索 ═══════ */}
      <div className="site-header__left-group">
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
          to="/search"
          aria-label="搜索"
          className="site-header__nav-item"
          style={{ color: navColor }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#211E1A")}
          onMouseLeave={(e) => (e.currentTarget.style.color = navColor)}
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
      <main className={isHome ? "editorial-main" : "site-main"}>
        <PublishedPageDecoration
          pageKey={decorationPage?.key}
          pageLabel={decorationPage?.label}
        >
          <Outlet />
        </PublishedPageDecoration>
      </main>

      {/* ═══════ Footer ═══════ */}
      {!isHome && (
        <footer className="site-footer">
          <div className="site-footer__inner">
            {/* 第一列：品牌 */}
            <div>
              <p className="site-footer__brand-label">HAICHUAN JEWELRY</p>
              <p className="site-footer__brand-name">{siteName}</p>
              <p className="site-footer__brand-desc">黄金珠宝作品与选款服务</p>
            </div>
            {/* 第二列：导航 */}
            <div>
              <p className="site-footer__col-title">探索</p>
              <nav>
                <Link to="/products">珠宝作品</Link>
                <Link to="/catalog">选款中心</Link>
                <Link to="/custom">定制服务</Link>
                <Link to="/about">品牌故事</Link>
                <Link to="/contact">预约咨询</Link>
              </nav>
            </div>
            {/* 第三列：服务入口 */}
            <div>
              <p className="site-footer__col-title">联系</p>
              {contactPhone && (
                <a href={`tel:${contactPhone}`} className="site-footer__link">
                  ☎ {contactPhone}
                </a>
              )}
              {contactEmail && (
                <a
                  href={`mailto:${contactEmail}`}
                  className="site-footer__link"
                >
                  ✉ {contactEmail}
                </a>
              )}
              {!contactPhone && !contactEmail && (
                <span className="site-footer__link">联系方式待完善</span>
              )}
              <Link to="/privacy" className="site-footer__link">
                隐私说明
              </Link>
            </div>
          </div>
          <p className="site-footer__copyright">
            © {new Date().getFullYear()} {siteName}
            <Link to="/privacy" className="site-footer__copyright-link">
              隐私说明
            </Link>
          </p>
        </footer>
      )}
    </div>
  );
}
