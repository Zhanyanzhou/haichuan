import { Avatar, Dropdown } from "antd";
import {
  AccountBookOutlined,
  BarChartOutlined,
  CustomerServiceOutlined,
  HomeOutlined,
  InsuranceOutlined,
  LogoutOutlined,
  NotificationOutlined,
  PushpinFilled,
  PushpinOutlined,
  SendOutlined,
  SettingOutlined,
  ShopOutlined,
  ShoppingOutlined,
  StarOutlined,
  TransactionOutlined,
  UserOutlined,
  UsergroupAddOutlined,
  RightOutlined,
} from "@ant-design/icons";
import type { NavDomain, NavSectionMeta } from "@/config/navigationConfig";
import { canAccessAdminRoute } from "@/config/adminRouteAccess";
import type { CommonNavItem } from "@/utils/adminCommonNav";

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

type AdminNavSection = NavSectionMeta & { domains: NavDomain[] };

function SidebarDomainItem({
  domain,
  isActive,
  isExpanded,
  allItems,
  pathname,
  search,
  onDomainClick,
  onToggle,
  onItemClick,
  onTogglePin,
}: {
  domain: NavDomain;
  isActive: boolean;
  isExpanded: boolean;
  allItems: CommonNavItem[];
  pathname: string;
  search: string;
  onDomainClick: (domain: NavDomain) => void;
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
        <div
          className="admin-sidebar__subnav"
          aria-label={`${domain.label}功能菜单`}
        >
          {allItems.map((item) => {
            const [itemPath, itemQuery = ""] = item.route.split("?");
            const hasQueryMatch = allItems.some((candidate) => {
              const [candidatePath, candidateQuery = ""] =
                candidate.route.split("?");
              return (
                Boolean(candidateQuery) &&
                candidatePath === pathname &&
                `?${candidateQuery}` === search
              );
            });
            const pathMatches =
              pathname === itemPath ||
              (itemPath !== "/admin" && pathname.startsWith(`${itemPath}/`));
            const isItemActive =
              pathMatches &&
              (itemQuery ? `?${itemQuery}` === search : !hasQueryMatch);
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
                    title={
                      canPin
                        ? item.pinned
                          ? "取消固定"
                          : "固定到常用"
                        : "最多固定 2 项"
                    }
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

export function AdminSidebar({
  id,
  collapsed = false,
  sections,
  activeDomainKey,
  expandedDomains,
  commonItems,
  pathname,
  search,
  role,
  userDisplayName,
  onDomainClick,
  onToggleDomain,
  onItemClick,
  onTogglePin,
  onLogout,
}: {
  id?: string;
  collapsed?: boolean;
  sections: AdminNavSection[];
  activeDomainKey?: string;
  expandedDomains: ReadonlySet<string>;
  commonItems: CommonNavItem[];
  pathname: string;
  search: string;
  role?: string;
  userDisplayName: string;
  onDomainClick: (domain: NavDomain) => void;
  onToggleDomain: (key: string) => void;
  onItemClick: (route: string) => void;
  onTogglePin: (route: string) => void;
  onLogout: () => void;
}) {
  return (
    <aside
      id={id}
      className={`admin-sidebar${collapsed ? " is-collapsed" : ""}`}
      aria-label="后台一级导航"
      aria-hidden={collapsed || undefined}
    >
      {!collapsed ? (
        <>
          <nav className="admin-sidebar__nav" aria-label="后台导航">
            {sections.map((section) => {
              if (section.domains.length === 0) return null;
              return (
                <div
                  key={section.key}
                  className={`admin-sidebar__section admin-sidebar__section--${section.key}`}
                >
                  {section.domains.map((domain) => {
                    const allItems =
                      domain.key === "common"
                        ? commonItems.filter((item) =>
                            canAccessAdminRoute(role, item.route),
                          )
                        : domain.groups.flatMap((group) =>
                            group.items
                              .filter((item) => !item.featureFlag && !item.disabled)
                              .map((item) => ({ ...item, pinned: false })),
                          );
                    return (
                      <SidebarDomainItem
                        key={domain.key}
                        domain={domain}
                        isActive={activeDomainKey === domain.key}
                        isExpanded={expandedDomains.has(domain.key)}
                        allItems={allItems}
                        pathname={pathname}
                        search={search}
                        onDomainClick={onDomainClick}
                        onToggle={onToggleDomain}
                        onItemClick={onItemClick}
                        onTogglePin={onTogglePin}
                      />
                    );
                  })}
                </div>
              );
            })}
          </nav>

          <div className="admin-sidebar__footer">
            <Dropdown
              menu={{
                items: [
                  {
                    key: "logout",
                    icon: <LogoutOutlined />,
                    label: "退出登录",
                    danger: true,
                  },
                ],
                onClick: ({ key }) => {
                  if (key === "logout") onLogout();
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
                    color: "var(--adm-action)",
                    flexShrink: 0,
                  }}
                />
                <span className="admin-sidebar__user-name">{userDisplayName}</span>
              </div>
            </Dropdown>
          </div>
        </>
      ) : null}
    </aside>
  );
}
