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
import { useState, useEffect, useMemo, useCallback } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { Button, Dropdown, Avatar, Drawer } from "antd";
import {
  StarOutlined,
  TransactionOutlined,
  ShoppingOutlined,
  NotificationOutlined,
  SendOutlined,
  CustomerServiceOutlined,
  ShopOutlined,
  UsergroupAddOutlined,
  AccountBookOutlined,
  InsuranceOutlined,
  BarChartOutlined,
  SettingOutlined,
  HomeOutlined,
  ReloadOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuOutlined,
  RightOutlined,
  PushpinOutlined,
  PushpinFilled,
  GlobalOutlined,
  SearchOutlined,
  AppstoreOutlined,
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
import { hasPermission } from "@/store/permissionStore";

/* ═══════ 图标映射 ═══════ */
const domainIcons: Record<string, React.ReactNode> = {
  home: <HomeOutlined />,
  star: <StarOutlined />,
  transaction: <TransactionOutlined />,
  shopping: <ShoppingOutlined />,
  notification: <NotificationOutlined />,
  send: <SendOutlined />,
  "customer-service": <CustomerServiceOutlined />,
  shop: <ShopOutlined />,
  "usergroup-add": <UsergroupAddOutlined />,
  "account-book": <AccountBookOutlined />,
  insurance: <InsuranceOutlined />,
  "bar-chart": <BarChartOutlined />,
  setting: <SettingOutlined />,
};

/* ═══════ 按分区聚合域 ═══════ */
function canAccessAdminRoute(role: string | undefined, route: string) {
  if (route.startsWith("/admin/editor/")) {
    return Boolean(role && hasPermission(role, "content.update"));
  }
  if (route.startsWith("/admin/site-content") || route.startsWith("/admin/media")) {
    return Boolean(role && hasPermission(role, "content.read"));
  }
  return true;
}

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

/* ═══════ 域名渲染 ═══════ */
function SidebarDomainItem({
  domain,
  isActive,
  isExpanded,
  allItems,
  location,
  onDomainClick,
  onToggle,
  onItemClick,
  onTogglePin,
}: {
  domain: NavDomain;
  isActive: boolean;
  isExpanded: boolean;
  allItems: CommonNavItem[];
  location: ReturnType<typeof useLocation>;
  onDomainClick: (d: NavDomain) => void;
  onToggle: (key: string) => void;
  onItemClick: (route: string) => void;
  onTogglePin: (route: string) => void;
}) {
  const hasChildren = allItems.length > 0;
  const pinnedItemCount = allItems.filter((item) => item.pinned).length;

  return (
    <div className="admin-sidebar__domain">
      <div
        className={`admin-sidebar__domain-row${isActive ? " is-active" : ""}${domain.immersive ? " is-workspace" : ""}${domain.disabled ? " is-disabled" : ""}`}
      >
        <button
          type="button"
          className="admin-sidebar__domain-label"
          onClick={() => onDomainClick(domain)}
          disabled={domain.disabled}
          title={domain.disabled ? "功能建设中" : domain.label}
        >
          <span className="admin-sidebar__domain-content">
            <span className="admin-sidebar__domain-icon">
              {domainIcons[domain.icon]}
            </span>
            <span className="admin-sidebar__domain-text">{domain.label}</span>
          </span>
        </button>
        {hasChildren && (
          <button
            type="button"
            className={`admin-sidebar__chevron${isExpanded ? " is-open" : ""}`}
            onClick={() => onToggle(domain.key)}
            aria-label={`${isExpanded ? "收起" : "展开"}${domain.label}`}
            aria-expanded={isExpanded}
          >
            <RightOutlined />
          </button>
        )}
      </div>

      {isExpanded && allItems.length > 0 && (
        <div className="admin-sidebar__subnav" aria-label={`${domain.label}功能菜单`}>
          {allItems.map((item) => {
          const [itemPath, itemQuery = ""] = item.route.split("?");
          const hasQueryMatch = allItems.some((candidate) => {
            const [candidatePath, candidateQuery = ""] = candidate.route.split("?");
            return Boolean(candidateQuery) && candidatePath === location.pathname && `?${candidateQuery}` === location.search;
          });
          const pathMatches =
            location.pathname === itemPath ||
            (itemPath !== "/admin" && location.pathname.startsWith(`${itemPath}/`));
          const isItemActive = pathMatches && (
            itemQuery ? `?${itemQuery}` === location.search : !hasQueryMatch
          );
          const canPin = item.pinned || pinnedItemCount < 2;
          return (
            <div className="admin-sidebar__item-row" key={item.key}>
              <button
                type="button"
                className={`admin-sidebar__item${isItemActive ? " is-active" : ""}`}
                onClick={() => onItemClick(item.route)}
                title={item.label}
              >
                {item.label}
              </button>
              {domain.key === "common" && (
                <button
                  type="button"
                  className={`admin-sidebar__item-pin${item.pinned ? " is-pinned" : ""}`}
                  onClick={() => onTogglePin(item.route)}
                  aria-label={`${item.pinned ? "取消固定" : "固定"}${item.label}`}
                  aria-pressed={item.pinned}
                  title={canPin ? (item.pinned ? "取消固定" : "固定到常用") : "最多固定 2 项"}
                  disabled={!canPin}
                >
                  {item.pinned ? <PushpinFilled /> : <PushpinOutlined />}
                </button>
              )}
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════ 组件 ═══════ */
export default function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
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
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // 未登录跳转
  useEffect(() => {
    if (!isLoggedIn) navigate("/admin/login");
  }, [isLoggedIn, navigate]);

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
        if (isMobile) setMobileOpen(false);
        return;
      }

      const defaultRoute = getDefaultRoute(domain);
      // 一级按钮负责进入该业务域默认页；右侧箭头才负责展开/收起。
      if (defaultRoute && navCtx?.domain.key !== domain.key) {
        setExpandedDomains(new Set([domain.key]));
        navigate(defaultRoute);
        if (isMobile) setMobileOpen(false);
        return;
      }

      if (defaultRoute) {
        toggleDomain(domain.key);
        return;
      }

      if (isMobile) setMobileOpen(false);
    },
    [isMobile, navCtx?.domain.key, navigate, toggleDomain],
  );

  const handleItemClick = useCallback(
    (route: string) => {
      navigate(route);
      if (isMobile) setMobileOpen(false);
    },
    [navigate, isMobile],
  );

  const handleToggleCommonPin = useCallback((route: string) => {
    toggleCommonNavPin(route, commonUserId);
    setCommonItems(getCommonNavItems(commonUserId));
  }, [commonUserId]);

  /* ── 用户菜单 ── */
  const userMenuItems = [
    { key: "profile", icon: <UserOutlined />, label: "个人资料" },
    { type: "divider" as const },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "退出登录",
      danger: true,
    },
  ];

  /* ── 侧边栏渲染 ── */
  const renderSidebar = () => (
    <div className="admin-sidebar">
      {/* 导航区 */}
      <nav className="admin-sidebar__nav">
        {sections.map((section) => {
          const visibleDomains = section.domains;
          if (visibleDomains.length === 0) return null;

          return (
            <div
              key={section.key}
              className={`admin-sidebar__section admin-sidebar__section--${section.key}`}
            >
              {visibleDomains.map((domain) => {
                const isActive = navCtx?.domain.key === domain.key;
                const isExpanded = expandedDomains.has(domain.key);
                const allItems = domain.key === "common"
                  ? commonItems.filter((item) =>
                    canAccessAdminRoute(user?.role, item.route),
                  )
                  : domain.groups.flatMap((g) =>
                    g.items
                      .filter((i) => !i.featureFlag && !i.disabled)
                      .map((i) => ({ ...i, pinned: false })),
                  );

                return (
                  <SidebarDomainItem
                    key={domain.key}
                    domain={domain}
                    isActive={isActive}
                    isExpanded={isExpanded}
                    allItems={allItems}
                    location={location}
                    onDomainClick={handleDomainClick}
                    onToggle={toggleDomain}
                    onItemClick={handleItemClick}
                    onTogglePin={handleToggleCommonPin}
                  />
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* 底部用户区 */}
      <div className="admin-sidebar__footer">
        <Dropdown
          menu={{
            items: userMenuItems,
            onClick: ({ key }) => {
              if (key === "logout") {
                logout();
                navigate("/admin/login");
              }
            },
          }}
          placement="topRight"
        >
          <div className="admin-sidebar__user">
            <Avatar
              size={28}
              icon={<UserOutlined />}
              style={{
                backgroundColor: "var(--adm-gold-soft)",
                color: "var(--adm-gold)",
                flexShrink: 0,
              }}
            />
            <span className="admin-sidebar__user-name">
              {user?.realName || "管理员"}
            </span>
          </div>
        </Dropdown>
      </div>
    </div>
  );

  return (
    <div className="admin-shell-v7">
      {/* ═══ Header ═══ */}
      <header className="admin-header">
        <div className="admin-header__left">
          {isMobile && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setMobileOpen(true)}
              className="admin-header__menu-btn"
            />
          )}
        </div>

        <div className="admin-header__right">
          <Link to="/" target="_blank" className="admin-header__icon-btn" title="访问前台首页" aria-label="访问前台首页">
            <GlobalOutlined />
          </Link>
          <Link to="/search" target="_blank" className="admin-header__icon-btn" title="搜索商品" aria-label="搜索商品">
            <SearchOutlined />
          </Link>
          <Link to="/catalog" target="_blank" className="admin-header__icon-btn" title="选款中心" aria-label="选款中心">
            <AppstoreOutlined />
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="admin-header__icon-btn"
            aria-label="刷新"
            title="刷新"
          >
            <ReloadOutlined />
          </button>
          <Link to="/" target="_blank" className="admin-header__link">
            预览网站
          </Link>
          <Dropdown
            menu={{
              items: userMenuItems,
              onClick: ({ key }) => {
                if (key === "logout") {
                  logout();
                  navigate("/admin/login");
                }
              },
            }}
          >
            <div className="admin-header__avatar">
              <Avatar
                size={28}
                icon={<UserOutlined />}
                style={{
                  backgroundColor: "var(--adm-gold-soft)",
                  color: "var(--adm-gold)",
                }}
              />
            </div>
          </Dropdown>
        </div>
      </header>

      {/* ═══ Body ═══ */}
      <div className="admin-body">
        {/* 桌面端侧边栏 */}
        {!isMobile && renderSidebar()}

        {/* 移动端抽屉 */}
        {isMobile && (
          <Drawer
            placement="left"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            width={260}
            styles={{ body: { padding: 0 }, header: { display: "none" } }}
          >
            {renderSidebar()}
          </Drawer>
        )}

        {/* 内容区 */}
        <div className="admin-content">
          {/* 页面内容 */}
          <main className={`admin-main${isEditorWorkspace ? " admin-main--workspace" : ""}`}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
