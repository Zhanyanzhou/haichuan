import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import { Link, useLocation } from "react-router-dom";
import { usePublicSiteSettings } from "@/hooks/usePublicSiteSettings";

type PublicSiteSettings = {
  siteName?: string;
  logo?: string;
  contactPhone?: string;
  contactAddress?: string;
};

type StorefrontNavigationProps = {
  isHome?: boolean;
  headerMode?: "overlay-light" | "solid";
  siteSettings?: PublicSiteSettings | null;
  /** 装修器中只预览交互，链接不会离开当前草稿。 */
  preview?: boolean;
  /** 装修画布中点击前台菜单时，交由宿主切换后台编辑页。 */
  onPreviewNavigate?: (path: string) => void;
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
};

type StorefrontMenuDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 兼容装修预览的旧调用；联系信息已统一由全局页脚承载。 */
  contactPhone?: string;
  contactAddress?: string;
  /** 装修预览中仅演示菜单，不离开当前草稿。 */
  preview?: boolean;
  onPreviewNavigate?: (path: string) => void;
  menuId: string;
  returnFocusRef?: RefObject<HTMLButtonElement>;
};

const LEGACY_PLACEHOLDER_LOGOS = new Set([
  "/favicon.svg",
  "/images/brand-logo.svg",
]);

/** 旧版把站点图标误当作页头 Logo；这些占位资源不能进入品牌页头。 */
export function resolveSiteLogo(logo?: string | null) {
  const value = logo?.trim();
  if (!value) return null;

  try {
    const pathname = new URL(value, "https://brand.local").pathname.toLowerCase();
    return LEGACY_PLACEHOLDER_LOGOS.has(pathname) ? null : value;
  } catch {
    const pathname = value.split(/[?#]/, 1)[0].toLowerCase();
    return LEGACY_PLACEHOLDER_LOGOS.has(pathname) ? null : value;
  }
}

export const storefrontMenuLinks = [
  { label: "首页", href: "/" },
  { label: "珠宝作品", href: "/products" },
  { label: "选款中心", href: "/catalog" },
  { label: "珠宝定制", href: "/custom" },
  { label: "关于海川", href: "/about" },
] as const;

const storefrontServiceLinks = [
  { label: "预约私人珠宝顾问", href: "/contact" },
  { label: "我的账户", href: "/customer" },
] as const;

const MenuIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
    <line x1="4" y1="7" x2="26" y2="7" />
    <line x1="4" y1="15" x2="26" y2="15" />
    <line x1="4" y1="23" x2="26" y2="23" />
  </svg>
);

const CloseIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
    <line x1="4" y1="4" x2="26" y2="26" />
    <line x1="26" y1="4" x2="4" y2="26" />
  </svg>
);

const SearchIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
    <circle cx="13" cy="13" r="8" />
    <line x1="19" y1="19" x2="27" y2="27" />
  </svg>
);

const DiamondIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 3 L23 13.5 L15 27 L7 13.5 Z" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5.5" width="24" height="21" rx="2" />
    <line x1="3" y1="14" x2="27" y2="14" />
    <line x1="9" y1="2" x2="9" y2="9" />
    <line x1="21" y1="2" x2="21" y2="9" />
  </svg>
);

const AccountIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
    <circle cx="15" cy="10" r="5" />
    <path d="M5 27c.8-5.2 4.2-8 10-8s9.2 2.8 10 8" />
  </svg>
);

const MenuArrowIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 9h11" />
    <path d="m10 5 4 4-4 4" />
  </svg>
);

/** 前台与装修画布共用的菜单抽屉，统一关闭、键盘和焦点行为。 */
export function StorefrontMenuDrawer({
  open,
  onOpenChange,
  preview = false,
  onPreviewNavigate,
  menuId,
  returnFocusRef,
}: StorefrontMenuDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();

  const restoreTriggerFocus = useCallback(() => {
    const ownerWindow = drawerRef.current?.ownerDocument.defaultView;
    if (!ownerWindow) {
      returnFocusRef?.current?.focus();
      return;
    }
    ownerWindow.setTimeout(() => {
      returnFocusRef?.current?.focus({ preventScroll: true });
    }, 0);
  }, [returnFocusRef]);

  useEffect(() => {
    const drawer = drawerRef.current;
    const ownerDocument = drawer?.ownerDocument;
    const ownerWindow = ownerDocument?.defaultView;
    if (!ownerDocument || !ownerWindow) return;

    ownerDocument.body.classList.toggle("nav-locked", open);
    const focusTimer = open
      ? ownerWindow.setTimeout(() => {
          closeButtonRef.current?.focus({ preventScroll: true });
        }, 80)
      : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!open) return;
        event.preventDefault();
        onOpenChange(false);
        restoreTriggerFocus();
        return;
      }
      if (event.key !== "Tab" || !open) return;
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const items = Array.from(focusable);
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && ownerDocument.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && ownerDocument.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    ownerWindow.addEventListener("keydown", onKeyDown);
    return () => {
      if (focusTimer !== null) ownerWindow.clearTimeout(focusTimer);
      ownerDocument.body.classList.remove("nav-locked");
      ownerWindow.removeEventListener("keydown", onKeyDown);
    };
  }, [onOpenChange, open, restoreTriggerFocus]);

  const handleLink = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!preview) {
      onOpenChange(false);
      return;
    }
    event.preventDefault();
    onPreviewNavigate?.(event.currentTarget.getAttribute("href") || "/");
    onOpenChange(false);
    restoreTriggerFocus();
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    onOpenChange(false);
    restoreTriggerFocus();
  };

  const handleClose = () => {
    onOpenChange(false);
    restoreTriggerFocus();
  };

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div
      id={menuId}
      className={`brand-menu${open ? " is-open" : ""}`}
      aria-hidden={!open}
      onClick={handleBackdropClick}
    >
      <div ref={drawerRef} className="brand-menu__inner" role="dialog" aria-modal="true" aria-label="品牌菜单">
        <div className="brand-menu__top">
          <button
            ref={closeButtonRef}
            type="button"
            data-menu-close
            tabIndex={open ? 0 : -1}
            className="brand-menu__top-action"
            aria-label="关闭菜单"
            onClick={handleClose}
          >
            <CloseIcon />
            <span>关闭</span>
          </button>
          <Link
            to="/catalog#catalog-search-input"
            tabIndex={open ? 0 : -1}
            className="brand-menu__top-action"
            onClick={handleLink}
          >
            <SearchIcon />
            <span>搜索</span>
          </Link>
        </div>

        <p className="brand-menu__eyebrow">Explore / 探索</p>
        <nav className="brand-menu__primary" aria-label="品牌菜单">
          {storefrontMenuLinks.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              tabIndex={open ? 0 : -1}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={isActive(item.href) ? "is-active" : undefined}
              onClick={handleLink}
            >
              <span className="brand-menu__label">{item.label}</span>
              <span className="brand-menu__arrow" aria-hidden="true">
                <MenuArrowIcon />
              </span>
            </Link>
          ))}
        </nav>

        <div className="brand-menu__footer">
          <nav className="brand-menu__service-links" aria-label="客户服务">
            {storefrontServiceLinks.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                tabIndex={open ? 0 : -1}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={isActive(item.href) ? "is-active" : undefined}
                onClick={handleLink}
              >
                <span>{item.label}</span>
                <span className="brand-menu__arrow" aria-hidden="true">
                  <MenuArrowIcon />
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

export default function StorefrontNavigation({
  isHome = false,
  headerMode = isHome ? "overlay-light" : "solid",
  siteSettings,
  preview = false,
  menuOpen,
  onMenuOpenChange,
  onPreviewNavigate,
}: StorefrontNavigationProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const sharedSettingsResource = usePublicSiteSettings(!siteSettings);
  const [uncontrolledMenuOpen, setUncontrolledMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const isControlled = menuOpen !== undefined;
  const isMenuOpen = isControlled ? menuOpen : uncontrolledMenuOpen;
  const resolvedSettings = siteSettings ?? sharedSettingsResource.settings;
  const siteName = resolvedSettings?.siteName || "海川珠宝";
  const logoUrl = resolveSiteLogo(resolvedSettings?.logo);
  const isTransparent = !scrolled && !isMenuOpen;
  const usesLightHeaderText = headerMode === "overlay-light" && isTransparent;

  const setMenuOpen = useCallback((open: boolean) => {
    if (!isControlled) setUncontrolledMenuOpen(open);
    onMenuOpenChange?.(open);
  }, [isControlled, onMenuOpenChange]);

  useEffect(() => {
    const root = rootRef.current;
    const ownerWindow = root?.ownerDocument.defaultView;
    if (!ownerWindow) return;
    const onScroll = () => setScrolled(ownerWindow.scrollY > 40);
    onScroll();
    ownerWindow.addEventListener("scroll", onScroll, { passive: true });
    return () => ownerWindow.removeEventListener("scroll", onScroll);
  }, []);

  const handlePreviewLink = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!preview) return;
    event.preventDefault();
    onPreviewNavigate?.(event.currentTarget.getAttribute("href") || "/");
    setMenuOpen(false);
    menuToggleRef.current?.focus();
  };

  return (
    <div
      ref={rootRef}
      className={`storefront-navigation${preview ? " storefront-navigation--preview" : ""}`}
      data-page-header-mode={headerMode}
      data-page-header-surface={isTransparent ? "transparent" : "solid"}
    >
      <header
        className={`site-header${isTransparent ? " is-transparent" : ""}${usesLightHeaderText ? " is-overlay-light" : ""}`}
        style={{
          background: isTransparent ? "transparent" : "rgba(255,255,255,0.92)",
          borderBottomColor: isTransparent ? "transparent" : "rgba(24,26,27,0.06)",
          backdropFilter: isTransparent ? "none" : "blur(8px)",
          WebkitBackdropFilter: isTransparent ? "none" : "blur(8px)",
        }}
      >
        <div className="site-header__inner">
          <div className="site-header__left" />
          <Link to="/" className="site-header__brand" aria-label={`${siteName}首页`} onClick={handlePreviewLink}>
            {logoUrl && (
              <img
                src={logoUrl}
                alt=""
                aria-hidden="true"
                className="site-header__logo"
                decoding="async"
                onError={(event) => { event.currentTarget.style.display = "none"; }}
              />
            )}
            <span className="site-header__brand-text">{siteName}</span>
          </Link>
          <div className="site-header__right">
            <Link to="/catalog" aria-label="选款中心" className="site-header__nav-item site-header__nav-item--catalog" onClick={handlePreviewLink}>
              <DiamondIcon />
              <span className="site-header__nav-label hidden sm:inline">选款</span>
            </Link>
            <Link to="/contact" aria-label="预约咨询" className="site-header__nav-item" onClick={handlePreviewLink}>
              <CalendarIcon />
              <span className="site-header__nav-label hidden sm:inline">预约</span>
            </Link>
            <Link to="/customer" aria-label="我的账户" className="site-header__nav-item" onClick={handlePreviewLink}>
              <AccountIcon />
              <span className="site-header__nav-label hidden sm:inline">我的账户</span>
            </Link>
          </div>
        </div>
      </header>

      <div className={`site-header__left-group${isTransparent ? " is-transparent" : ""}${usesLightHeaderText ? " is-overlay-light" : ""}`}>
        <button
          ref={menuToggleRef}
          type="button"
          className="site-menu-toggle"
          onClick={() => setMenuOpen(!isMenuOpen)}
          aria-expanded={isMenuOpen}
          aria-controls={menuId}
          aria-label={isMenuOpen ? "关闭菜单" : "打开菜单"}
        >
          {isMenuOpen ? <><CloseIcon /><span className="site-menu-toggle__label">关闭</span></> : <><MenuIcon /><span className="site-menu-toggle__label">菜单</span></>}
        </button>
        <Link to="/catalog#catalog-search-input" aria-label="搜索" className="site-header__nav-item site-header__nav-item--search" onClick={handlePreviewLink}>
          <SearchIcon /><span className="site-header__nav-label hidden sm:inline">搜索</span>
        </Link>
      </div>

      <StorefrontMenuDrawer
        open={isMenuOpen}
        onOpenChange={setMenuOpen}
        preview={preview}
        onPreviewNavigate={onPreviewNavigate}
        menuId={menuId}
        returnFocusRef={menuToggleRef}
      />
    </div>
  );
}
