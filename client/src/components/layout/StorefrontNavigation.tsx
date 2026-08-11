import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import { Link } from "react-router-dom";
import { settingsApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";

type PublicSiteSettings = {
  siteName?: string;
  logo?: string;
  contactPhone?: string;
  contactAddress?: string;
};

type StorefrontNavigationProps = {
  isHome?: boolean;
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
  { label: "关于海川", description: "认识海川珠宝与东方工艺", href: "/about" },
  { label: "珠宝作品", description: "浏览黄金珠宝作品", href: "/products" },
  { label: "选款中心", description: "按品类与货号快速选款", href: "/catalog" },
  { label: "珠宝定制", description: "了解专属定制流程", href: "/custom" },
  { label: "预约咨询", description: "一对一顾问服务", href: "/contact" },
];

const MenuIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
    <line x1="4" y1="7" x2="26" y2="7" />
    <line x1="4" y1="15" x2="26" y2="15" />
    <line x1="4" y1="23" x2="26" y2="23" />
  </svg>
);

const CloseIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
    <line x1="7" y1="7" x2="23" y2="23" />
    <line x1="23" y1="7" x2="7" y2="23" />
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

const ContactSearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
    <circle cx="6.5" cy="6.5" r="5" />
    <line x1="10" y1="10" x2="15" y2="15" />
  </svg>
);

const PhoneIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14.5 11.5v2a1.33 1.33 0 01-1.45 1.33A11.8 11.8 0 011.5 3.45 1.33 1.33 0 012.83 2h2a1.33 1.33 0 011.33 1.15c.08.63.23 1.24.43 1.82a1.33 1.33 0 01-.3 1.4L5.13 7.54a10.67 10.67 0 004 4l1.17-1.17a1.33 1.33 0 011.4-.3c.58.2 1.19.35 1.82.43a1.33 1.33 0 011.15 1.33z" />
  </svg>
);

const LocationIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 1.5a5.5 5.5 0 00-5.5 5.5c0 4.13 5.5 9.5 5.5 9.5s5.5-5.37 5.5-9.5A5.5 5.5 0 008 1.5z" />
    <circle cx="8" cy="7" r="2" />
  </svg>
);

/** 前台与装修画布共用的菜单抽屉，统一关闭、键盘和焦点行为。 */
export function StorefrontMenuDrawer({
  open,
  onOpenChange,
  contactPhone,
  contactAddress,
  preview = false,
  onPreviewNavigate,
  menuId,
  returnFocusRef,
}: StorefrontMenuDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const drawer = drawerRef.current;
    const ownerDocument = drawer?.ownerDocument;
    const ownerWindow = ownerDocument?.defaultView;
    if (!ownerDocument || !ownerWindow) return;

    ownerDocument.body.classList.toggle("nav-locked", open);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        returnFocusRef?.current?.focus();
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
      ownerDocument.body.classList.remove("nav-locked");
      ownerWindow.removeEventListener("keydown", onKeyDown);
    };
  }, [onOpenChange, open, returnFocusRef]);

  const handleLink = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!preview) return;
    event.preventDefault();
    onPreviewNavigate?.(event.currentTarget.getAttribute("href") || "/");
    onOpenChange(false);
    returnFocusRef?.current?.focus();
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onOpenChange(false);
  };

  const handlePhoneLink = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (preview) {
      event.preventDefault();
      returnFocusRef?.current?.focus();
    }
    onOpenChange(false);
  };

  return (
    <div
      id={menuId}
      className={`brand-menu${open ? " is-open" : ""}`}
      aria-hidden={!open}
      onClick={handleBackdropClick}
    >
      <div ref={drawerRef} className="brand-menu__inner" role="dialog" aria-modal="true" aria-label="品牌菜单">
        <nav className="brand-menu__primary" aria-label="品牌菜单">
          {storefrontMenuLinks.map((item) => (
            <Link key={item.href} to={item.href} tabIndex={open ? 0 : -1} onClick={handleLink}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="brand-menu__footer">
          <div className="brand-menu__contact">
            <Link to="/search" tabIndex={open ? 0 : -1} onClick={handleLink}><ContactSearchIcon />货号搜索</Link>
            {contactPhone && (
              <a href={`tel:${contactPhone}`} tabIndex={open ? 0 : -1} onClick={handlePhoneLink}><PhoneIcon />{contactPhone}</a>
            )}
            {contactAddress && <span><LocationIcon />{contactAddress}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StorefrontNavigation({
  isHome = false,
  siteSettings,
  preview = false,
  menuOpen,
  onMenuOpenChange,
  onPreviewNavigate,
}: StorefrontNavigationProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [fetchedSettings, setFetchedSettings] = useState<PublicSiteSettings | null>(null);
  const [uncontrolledMenuOpen, setUncontrolledMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const isControlled = menuOpen !== undefined;
  const isMenuOpen = isControlled ? menuOpen : uncontrolledMenuOpen;
  const resolvedSettings = siteSettings ?? fetchedSettings;
  const siteName = resolvedSettings?.siteName || "海川珠宝";
  const contactPhone = resolvedSettings?.contactPhone?.trim() || "";
  const contactAddress = resolvedSettings?.contactAddress?.trim() || "";
  const logoUrl = resolveSiteLogo(resolvedSettings?.logo);
  const navColor = "rgba(41,36,31,0.78)";
  const isTransparent = isHome && !scrolled && !isMenuOpen;

  const setMenuOpen = useCallback((open: boolean) => {
    if (!isControlled) setUncontrolledMenuOpen(open);
    onMenuOpenChange?.(open);
  }, [isControlled, onMenuOpenChange]);

  useEffect(() => {
    if (siteSettings) return;
    let cancelled = false;
    settingsApi.getPublicSettings()
      .then((res) => {
        if (!cancelled) setFetchedSettings(unwrapResponse<PublicSiteSettings>(res));
      })
      .catch(() => {
        // 设置接口不可用时保留品牌默认值，避免导航阻断首页预览。
      });
    return () => {
      cancelled = true;
    };
  }, [siteSettings]);

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
    <div ref={rootRef} className={`storefront-navigation${preview ? " storefront-navigation--preview" : ""}`}>
      <header
        className={`site-header${isTransparent ? " is-transparent" : ""}`}
        style={{
          background: isTransparent ? "transparent" : "rgba(255,255,255,0.92)",
          borderBottomColor: isTransparent ? "transparent" : "rgba(41,36,31,0.06)",
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
            <Link to="/catalog" aria-label="选款中心" className="site-header__nav-item" style={{ color: navColor }} onClick={handlePreviewLink}>
              <DiamondIcon /><span className="site-header__nav-label hidden sm:inline">选款</span>
            </Link>
            <Link to="/contact" aria-label="预约咨询" className="site-header__nav-item" style={{ color: navColor }} onClick={handlePreviewLink}>
              <CalendarIcon /><span className="site-header__nav-label hidden sm:inline">预约</span>
            </Link>
            <Link to="/customer" aria-label="我的账户" className="site-header__nav-item" style={{ color: navColor }} onClick={handlePreviewLink}>
              <AccountIcon /><span className="site-header__nav-label hidden sm:inline">我的账户</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="site-header__left-group">
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
        <Link to="/search" aria-label="搜索" className="site-header__nav-item" style={{ color: navColor }} onClick={handlePreviewLink}>
          <SearchIcon /><span className="site-header__nav-label hidden sm:inline">搜索</span>
        </Link>
      </div>

      <StorefrontMenuDrawer
        open={isMenuOpen}
        onOpenChange={setMenuOpen}
        contactPhone={contactPhone}
        contactAddress={contactAddress}
        preview={preview}
        onPreviewNavigate={onPreviewNavigate}
        menuId={menuId}
        returnFocusRef={menuToggleRef}
      />
    </div>
  );
}
