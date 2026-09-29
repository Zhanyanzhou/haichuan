/**
 * AdminLayout v7 — 单栏分层侧边栏
 *
 * ┌──────────────────────────────────────────────────────┐
 * │  ◈ HAI CHUAN                         预览  🔔  ● AC │  ← Header 48px
 * ├────────────┬─────────────────────────────────────────┤
 * │  侧边栏    │  📍 面包屑                             │
 * │  240px     ├─────────────────────────────────────────┤
 * │            │                                         │
 * │  7 分区    │              内容区                     │
 * │  12 域     │              <Outlet />                 │
 * │            │                                         │
 * │            │                                         │
 * │  👤 用户   │                                         │
 * └────────────┴─────────────────────────────────────────┘
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { Button, Dropdown, Avatar, Drawer } from "antd";
import {
  UserOutlined,
  LogoutOutlined,
  MenuOutlined,
  LeftOutlined,
  RightOutlined,
  ExportOutlined,
  DownOutlined,
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

/** 浏览器放大或分屏时，优先释放侧栏空间，保证主操作区可用。 */
const ADMIN_COMPACT_BREAKPOINT = 1024;
const ADMIN_SIDEBAR_STORAGE_KEY = "admin-primary-sidebar-collapsed";

function isCompactViewport() {
  return window.innerWidth <= ADMIN_COMPACT_BREAKPOINT;
}

function getInitialSidebarCollapsed() {
  try {
    return window.localStorage.getItem(ADMIN_SIDEBAR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    getInitialSidebarCollapsed,
  );
  const [editorSidebarCollapsed, setEditorSidebarCollapsed] = useState(true);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
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
  const desktopSidebarCollapsed = isEditorWorkspace
    ? editorSidebarCollapsed
    : sidebarCollapsed;

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
    const h = () => setIsCompact(isCompactViewport());
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        ADMIN_SIDEBAR_STORAGE_KEY,
        String(sidebarCollapsed),
      );
    } catch {
      // 隐私模式或存储受限时仅保留当前会话状态。
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!isCompact || !mobileOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMobileOpen(false);
      requestAnimationFrame(() => menuToggleRef.current?.focus());
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCompact, mobileOpen]);

  useEffect(() => {
    if (!isEditorWorkspace || isCompact || desktopSidebarCollapsed) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setEditorSidebarCollapsed(true);
      requestAnimationFrame(() => sidebarToggleRef.current?.focus());
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [desktopSidebarCollapsed, isCompact, isEditorWorkspace]);

  useEffect(() => {
    if (!isEditorWorkspace || isCompact) return;

    window.dispatchEvent(
      new CustomEvent("homepage-editor-primary-navigation-change", {
        detail: { open: !editorSidebarCollapsed },
      }),
    );
  }, [editorSidebarCollapsed, isCompact, isEditorWorkspace]);

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
        if (isCompact) setMobileOpen(false);
        return;
      }

      const defaultRoute = getDefaultRoute(domain);
      // 一级按钮负责进入该业务域默认页；右侧箭头才负责展开/收起。
      if (defaultRoute && navCtx?.domain.key !== domain.key) {
        setExpandedDomains(new Set([domain.key]));
        navigate(defaultRoute);
        if (isCompact) setMobileOpen(false);
        return;
      }

      if (defaultRoute) {
        toggleDomain(domain.key);
        return;
      }

      if (isCompact) setMobileOpen(false);
    },
    [isCompact, navCtx?.domain.key, navigate, toggleDomain],
  );

  const handleItemClick = useCallback(
    (route: string) => {
      navigate(route);
      if (isCompact) setMobileOpen(false);
    },
    [navigate, isCompact],
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

  /* ── 用户菜单 ── */
  const userMenuItems = [
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "退出登录",
      danger: true,
    },
  ];

  return (
    <div
      className={`admin-shell-v7${!isCompact && desktopSidebarCollapsed ? " is-sidebar-collapsed" : ""}${isEditorWorkspace && !isCompact && !desktopSidebarCollapsed ? " is-editor-navigation-open" : ""}`}
    >
      {/* ═══ Header ═══ */}
      <header
        className={`admin-header${isEditorWorkspace ? " admin-header--editor" : ""}`}
      >
        <div className="admin-header__left">
          {isCompact && (
            <Button
              ref={menuToggleRef}
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setMobileOpen((open) => !open)}
              className="admin-header__menu-btn"
              aria-label={mobileOpen ? "关闭后台导航" : "打开后台导航"}
              aria-controls="admin-navigation-drawer"
              aria-expanded={mobileOpen}
            />
          )}
        </div>

        {isEditorWorkspace ? (
          <div
            id="admin-editor-toolbar-slot"
            className="admin-header__editor-slot"
            aria-label="店铺装修工具栏"
          />
        ) : null}

        <div className="admin-header__right">
          {!isEditorWorkspace ? (
            <Link
              to="/"
              target="_blank"
              rel="noopener noreferrer"
              className="admin-header__site-link"
              aria-label="查看网站，在新标签页打开"
            >
              <ExportOutlined aria-hidden="true" />
              <span className="admin-header__site-label">查看网站</span>
            </Link>
          ) : null}
          {!isEditorWorkspace ? (
            <div className="admin-header__account-group">
              <Dropdown
                open={accountMenuOpen}
                onOpenChange={setAccountMenuOpen}
                trigger={["click"]}
                menu={{
                  items: userMenuItems,
                  onClick: ({ key }) => {
                    setAccountMenuOpen(false);
                    if (key === "logout") handleLogout();
                  },
                }}
              >
                <button
                  type="button"
                  className="admin-header__account"
                  aria-label={`账户菜单，当前用户${user?.realName || user?.username || "管理员"}`}
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                >
                  <Avatar
                    size={28}
                    icon={<UserOutlined />}
                    style={{
                      backgroundColor: "var(--adm-gold-soft)",
                      color: "var(--adm-action)",
                    }}
                  />
                  <span className="admin-header__account-name">
                    {user?.realName || user?.username || "管理员"}
                  </span>
                  <DownOutlined
                    className="admin-header__account-chevron"
                    aria-hidden="true"
                  />
                </button>
              </Dropdown>
            </div>
          ) : null}
        </div>
      </header>

      {/* ═══ Body ═══ */}
      <div className="admin-body">
        {/* 桌面端侧边栏 */}
        {!isCompact && (
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
            userDisplayName={user?.realName || "管理员"}
            onDomainClick={handleDomainClick}
            onToggleDomain={toggleDomain}
            onItemClick={handleItemClick}
            onTogglePin={handleToggleCommonPin}
            onLogout={handleLogout}
          />
        )}

        {!isCompact && (
          <button
            ref={sidebarToggleRef}
            type="button"
            className="admin-sidebar__collapse-handle admin-panel-collapse-toggle"
            onClick={() => {
              if (isEditorWorkspace) {
                setEditorSidebarCollapsed((collapsed) => !collapsed);
                return;
              }
              setSidebarCollapsed((collapsed) => !collapsed);
            }}
            aria-label={desktopSidebarCollapsed ? "展开一级导航" : "收起一级导航"}
            aria-controls="admin-navigation-sidebar"
            aria-expanded={!desktopSidebarCollapsed}
            title={desktopSidebarCollapsed ? "展开一级导航" : "收起一级导航"}
          >
            {desktopSidebarCollapsed ? <RightOutlined /> : <LeftOutlined />}
          </button>
        )}

        {/* 移动端抽屉 */}
        {isCompact && (
          <Drawer
            placement="left"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            width={260}
            styles={{ body: { padding: 0 }, header: { display: "none" } }}
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
              userDisplayName={user?.realName || "管理员"}
              onDomainClick={handleDomainClick}
              onToggleDomain={toggleDomain}
              onItemClick={handleItemClick}
              onTogglePin={handleToggleCommonPin}
              onLogout={handleLogout}
            />
          </Drawer>
        )}

        {/* 内容区 */}
        <div className="admin-content">
          {/* 页面内容 */}
          <main
            className={`admin-main${isEditorWorkspace ? " admin-main--workspace" : ""}`}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
import "@/styles/adminLuxury.css";
import "@/styles/adminDashboard.css";
import "@/styles/adminCompatibility.css";
