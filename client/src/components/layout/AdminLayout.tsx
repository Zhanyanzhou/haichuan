/** 普通后台由侧栏承载导航与账号；窄屏和店铺装修各自保留必要的工具栏。 */
import { useState, useEffect, useMemo, useCallback, useRef, type CSSProperties } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Button, Drawer } from "antd";
import {
  MenuOutlined,
  LeftOutlined,
} from "@ant-design/icons";
import { useAuthStore } from "@/store/authStore";
import {
  navigationConfig,
  navSections,
  findByRoute,
  getDefaultRoute,
} from "@/config/navigationConfig";
import type { NavDomain } from "@/config/navigationConfig";
import {
  getCommonNavItems,
  recordCommonNavVisit,
  toggleCommonNavPin,
  type CommonNavItem,
} from "@/utils/adminCommonNav";
import { canAccessAdminRoute } from "@/config/adminRouteAccess";
import { AdminSidebar } from "./AdminSidebar";
import { authApi } from "@/services/api";
import { PAGE_EDITOR_DESKTOP_LAYOUT_WIDTH } from "@/page-builder/workspace/pageEditorWorkspaceTiers";

/** 浏览器放大或分屏时，优先释放侧栏空间，保证主操作区可用。 */
const ADMIN_COMPACT_BREAKPOINT = 1024;
const NAVIGATION_OPEN_DELAY = 150;
const NAVIGATION_CLOSE_DELAY = 250;

export type AdminLayoutOutletContext = {
  desktopNavigationOpen: boolean;
  setDesktopNavigationSuppressed: (suppressed: boolean) => void;
};

function isCompactViewport() {
  return window.innerWidth <= ADMIN_COMPACT_BREAKPOINT;
}

/* ═══════ 按分区聚合域 ═══════ */
function useNavSections(role: string | undefined) {
  return useMemo(() => {
    return navSections.map((sec) => ({
      ...sec,
      domains: navigationConfig
        .filter((d) => d.section === sec.key)
        .map((domain) => ({
          ...domain,
          groups: domain.groups
            .map((group) => ({
              ...group,
              items: group.items.filter((item) =>
                canAccessAdminRoute(role, item.route),
              ),
            }))
            .filter((group) => group.items.length > 0),
        }))
        .filter((domain) =>
          domain.directRoute
            ? canAccessAdminRoute(role, domain.directRoute)
            : domain.groups.length > 0,
        )
        .sort((a, b) => a.order - b.order),
    }));
  }, [role]);
}

/* ═══════ 组件 ═══════ */
export default function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(isCompactViewport);
  const [hoverNavigationOpen, setHoverNavigationOpen] = useState(false);
  const [desktopNavigationSuppressed, setNavigationSuppressed] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const hoverNavigationRef = useRef<HTMLDivElement>(null);
  const navigationTimer = useRef<number>(undefined);
  const mouseInNavigation = useRef(false);
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(
    new Set(),
  );
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isLoggedIn } = useAuthStore();
  const commonUserId = user?.id;
  const [commonItems, setCommonItems] = useState<CommonNavItem[]>(() =>
    getCommonNavItems(commonUserId),
  );
  const sections = useNavSections(user?.role);
  const isEditorWorkspace = location.pathname.startsWith("/admin/editor/");
  const hasHoverNavigation = !isCompact && !desktopNavigationSuppressed;
  const desktopSidebarCollapsed = !hoverNavigationOpen;

  const clearNavigationTimer = useCallback(() => {
    window.clearTimeout(navigationTimer.current);
  }, []);

  const setDesktopNavigationSuppressed = useCallback((suppressed: boolean) => {
    setNavigationSuppressed(suppressed);
    if (suppressed) {
      clearNavigationTimer();
      setHoverNavigationOpen(false);
    }
  }, [clearNavigationTimer]);

  const closeHoverNavigation = useCallback(() => {
    clearNavigationTimer();
    if (hoverNavigationRef.current?.contains(document.activeElement)) {
      sidebarToggleRef.current?.focus();
    }
    setAccountMenuOpen(false);
    setHoverNavigationOpen(false);
  }, [clearNavigationTimer]);

  const scheduleNavigationClose = (accountOpen: boolean) => {
    clearNavigationTimer();
    if (!hoverNavigationOpen || mouseInNavigation.current || accountOpen) return;

    navigationTimer.current = window.setTimeout(() => {
      if (hoverNavigationRef.current?.querySelector(".admin-sidebar :focus-visible")) return;
      closeHoverNavigation();
    }, NAVIGATION_CLOSE_DELAY);
  };

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [location.key]);

  useEffect(() => () => {
    mouseInNavigation.current = false;
    clearNavigationTimer();
  }, [clearNavigationTimer, hasHoverNavigation]);

  useEffect(() => {
    if (!hasHoverNavigation || !hoverNavigationOpen || accountMenuOpen) return;

    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      closeHoverNavigation();
    };
    const dismissOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && !hoverNavigationRef.current?.contains(event.target)) {
        closeHoverNavigation();
      }
    };

    window.addEventListener("keydown", dismissOnEscape);
    window.addEventListener("pointerdown", dismissOnOutsidePress);
    return () => {
      window.removeEventListener("keydown", dismissOnEscape);
      window.removeEventListener("pointerdown", dismissOnOutsidePress);
    };
  }, [accountMenuOpen, closeHoverNavigation, hoverNavigationOpen, hasHoverNavigation]);

  // 从路由反向推导当前导航上下文
  const navCtx = useMemo(
    () => findByRoute(location.pathname),
    [location.pathname],
  );
  // 直接进入业务页面时，同步展开其所属一级类目。
  useEffect(() => {
    if (!navCtx || navCtx.domain.directRoute) return;
    setExpandedDomains(new Set([navCtx.domain.key]));
  }, [navCtx]);

  // 响应式检测
  useEffect(() => {
    const compactViewport = window.matchMedia(`(max-width: ${ADMIN_COMPACT_BREAKPOINT}px)`);
    const handleChange = () => {
      setIsCompact(compactViewport.matches);
      setMobileOpen(false);
      setHoverNavigationOpen(false);
      setAccountMenuOpen(false);
    };
    compactViewport.addEventListener("change", handleChange);
    return () => compactViewport.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!isCompact || !mobileOpen || accountMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMobileOpen(false);
      requestAnimationFrame(() => menuToggleRef.current?.focus());
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCompact, mobileOpen, accountMenuOpen]);

  // 未登录跳转
  useEffect(() => {
    if (!isLoggedIn) navigate("/admin/login");
  }, [isLoggedIn, navigate]);

  // SEO：后台页面禁止搜索引擎索引（robots.txt Disallow 的补充保障）
  useEffect(() => {
    const tag = document.head.querySelector<HTMLMetaElement>(
      'meta[name="robots"]',
    );
    if (tag) tag.setAttribute("content", "noindex, nofollow");
    else {
      const el = document.createElement("meta");
      el.setAttribute("name", "robots");
      el.setAttribute("content", "noindex, nofollow");
      document.head.appendChild(el);
    }
    return () => {
      // 离开后台时移除 noindex，恢复前台页面的可索引性
      document.head
        .querySelector('meta[name="robots"]')
        ?.setAttribute("content", "index, follow");
    };
  }, []);

  useEffect(() => {
    setCommonItems(getCommonNavItems(commonUserId));
  }, [commonUserId]);

  useEffect(() => {
    recordCommonNavVisit(location.pathname, commonUserId);
  }, [location.pathname, commonUserId]);

  /* ── 交互 ── */
  const toggleDomain = useCallback((domainKey: string) => {
    setExpandedDomains((prev) => {
      return prev.has(domainKey) ? new Set() : new Set([domainKey]);
    });
  }, []);

  const closeMobileNavigation = useCallback(() => {
    setAccountMenuOpen(false);
    setMobileOpen(false);
  }, []);

  const handleDomainClick = useCallback(
    (domain: NavDomain) => {
      if (domain.disabled) return;

      // “常用”是快捷入口集合，只展开，不替用户跳转到其中的第一项。
      if (domain.key === "common") {
        toggleDomain(domain.key);
        return;
      }

      if (domain.directRoute) {
        setExpandedDomains(new Set());
        navigate(domain.directRoute);
        if (isCompact) closeMobileNavigation();
        return;
      }

      const defaultRoute = getDefaultRoute(domain);
      // 一级按钮负责进入该业务域默认页；右侧箭头才负责展开/收起。
      if (defaultRoute && navCtx?.domain.key !== domain.key) {
        setExpandedDomains(new Set([domain.key]));
        navigate(defaultRoute);
        if (isCompact) closeMobileNavigation();
        return;
      }

      if (defaultRoute) {
        toggleDomain(domain.key);
        return;
      }

      if (isCompact) closeMobileNavigation();
    },
    [closeMobileNavigation, isCompact, navCtx?.domain.key, navigate, toggleDomain],
  );

  const handleItemClick = useCallback(
    (route: string) => {
      navigate(route);
      if (isCompact) closeMobileNavigation();
    },
    [navigate, isCompact, closeMobileNavigation],
  );

  const handleToggleCommonPin = useCallback(
    (route: string) => {
      toggleCommonNavPin(route, commonUserId);
      setCommonItems(getCommonNavItems(commonUserId));
    },
    [commonUserId],
  );

  const handleLogout = useCallback(() => {
    void authApi.logout().finally(() => {
      logout();
      navigate("/admin/login");
    });
  }, [logout, navigate]);

  const account = isEditorWorkspace ? undefined : {
    name: user?.realName || user?.username || "管理员",
    open: accountMenuOpen,
    onOpenChange: (open: boolean) => {
      setAccountMenuOpen(open);
      if (hasHoverNavigation) scheduleNavigationClose(open);
    },
    onLogout: handleLogout,
  };

  const desktopNavigation = (
    <AdminSidebar
      id="admin-navigation-sidebar"
      collapsed={desktopSidebarCollapsed}
      sections={sections}
      activeDomainKey={navCtx?.domain.key}
      expandedDomains={expandedDomains}
      commonItems={commonItems}
      pathname={location.pathname}
      search={location.search}
      role={user?.role}
      account={account}
      onDomainClick={handleDomainClick}
      onToggleDomain={toggleDomain}
      onItemClick={handleItemClick}
      onTogglePin={handleToggleCommonPin}
    />
  );
  const sidebarToggleLabel = desktopSidebarCollapsed ? "展开一级导航" : "收起一级导航";
  const desktopNavigationToggle = (
    <button
      ref={sidebarToggleRef}
      type="button"
      className="admin-sidebar__collapse-handle admin-panel-collapse-toggle"
      onClick={() => {
        if (hoverNavigationOpen) {
          closeHoverNavigation();
        } else {
          clearNavigationTimer();
          setHoverNavigationOpen(true);
        }
      }}
      aria-label={sidebarToggleLabel}
      aria-controls="admin-navigation-sidebar"
      aria-expanded={!desktopSidebarCollapsed}
      title={sidebarToggleLabel}
    >
      {desktopSidebarCollapsed ? <MenuOutlined /> : <LeftOutlined />}
    </button>
  );

  return (
    <div
      style={isEditorWorkspace ? {
        "--page-editor-layout-width": `${PAGE_EDITOR_DESKTOP_LAYOUT_WIDTH}px`,
      } as CSSProperties : undefined}
      className={`admin-shell-v7${hasHoverNavigation ? " has-hover-navigation" : ""}${!isCompact && desktopSidebarCollapsed ? " is-sidebar-collapsed" : ""}`}
    >
      {(isCompact || isEditorWorkspace) && (
        <header className={`admin-header ${isEditorWorkspace ? "admin-header--editor" : "admin-header--navigation"}`}>
          <div className="admin-header__left">
            {isCompact && (
              <Button
                ref={menuToggleRef}
                type="text"
                icon={<MenuOutlined />}
                onClick={() => {
                  setAccountMenuOpen(false);
                  setMobileOpen((open) => !open);
                }}
                className="admin-header__menu-btn"
                aria-label={mobileOpen ? "关闭后台导航" : "打开后台导航"}
                aria-controls="admin-navigation-drawer"
                aria-expanded={mobileOpen}
              />
            )}
          </div>

          {isEditorWorkspace && (
            <>
              <div
                id="admin-editor-toolbar-slot"
                className="admin-header__editor-slot"
                aria-label="店铺装修工具栏"
              />
              <div className="admin-header__right" />
            </>
          )}
        </header>
      )}

      {/* ═══ Body ═══ */}
      <div className="admin-body">
        {hasHoverNavigation && (
          <div
            ref={hoverNavigationRef}
            className="admin-hover-navigation"
            onPointerEnter={(event) => {
              if (event.pointerType !== "mouse") return;
              mouseInNavigation.current = true;
              clearNavigationTimer();
            }}
            onPointerLeave={(event) => {
              if (event.pointerType !== "mouse") return;
              mouseInNavigation.current = false;
              scheduleNavigationClose(accountMenuOpen);
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                scheduleNavigationClose(accountMenuOpen);
              }
            }}
          >
            <div
              className="admin-hover-navigation__edge"
              aria-hidden="true"
              onPointerEnter={(event) => {
                if (event.pointerType !== "mouse" || hoverNavigationOpen || event.buttons) return;
                navigationTimer.current = window.setTimeout(() => {
                  const focused = document.activeElement;
                  if (focused?.matches(":focus-visible") && focused.closest("[data-admin-nav-hover-guard]")) {
                    return;
                  }
                  setHoverNavigationOpen(true);
                }, NAVIGATION_OPEN_DELAY);
              }}
              onPointerLeave={clearNavigationTimer}
            />
            {desktopNavigationToggle}
            {desktopNavigation}
          </div>
        )}

        {/* 移动端抽屉 */}
        {isCompact && (
          <Drawer
            placement="left"
            className={isEditorWorkspace ? undefined : "admin-navigation-drawer"}
            open={mobileOpen}
            keyboard={!accountMenuOpen}
            onClose={closeMobileNavigation}
            width={260}
            styles={{
              body: { padding: 0, ...(!isEditorWorkspace && { display: "flex", overflow: "hidden" }) },
              header: { display: "none" },
            }}
          >
            <AdminSidebar
              id="admin-navigation-drawer"
              sections={sections}
              activeDomainKey={navCtx?.domain.key}
              expandedDomains={expandedDomains}
              commonItems={commonItems}
              pathname={location.pathname}
              search={location.search}
              role={user?.role}
              account={account}
              onDomainClick={handleDomainClick}
              onToggleDomain={toggleDomain}
              onItemClick={handleItemClick}
              onTogglePin={handleToggleCommonPin}
            />
          </Drawer>
        )}

        {/* 内容区 */}
        <div className="admin-content">
          {/* 页面内容 */}
          <main
            className={`admin-main${isEditorWorkspace ? " admin-main--workspace" : ""}`}
          >
            <Outlet context={{
              desktopNavigationOpen: hasHoverNavigation && hoverNavigationOpen,
              setDesktopNavigationSuppressed,
            } satisfies AdminLayoutOutletContext} />
          </main>
        </div>
      </div>
    </div>
  );
}
import "@/styles/adminLuxury.css";
import "@/styles/adminDashboard.css";
import "@/styles/adminCompatibility.css";
