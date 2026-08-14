export type AdminRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "EDITOR"
  | "CUSTOMER_SERVICE"
  | "WAREHOUSE";

type RouteRule = { prefix: string; roles: readonly AdminRole[] };

const ADMIN_ONLY: readonly AdminRole[] = ["SUPER_ADMIN", "ADMIN"];
const CONTENT_EDITORS: readonly AdminRole[] = ["SUPER_ADMIN", "ADMIN", "EDITOR"];
const CUSTOMER_SERVICE: readonly AdminRole[] = ["SUPER_ADMIN", "ADMIN", "CUSTOMER_SERVICE"];
const WAREHOUSE: readonly AdminRole[] = ["SUPER_ADMIN", "ADMIN", "WAREHOUSE"];
// 交易域订单查看：客服跟进订单、仓储发货都需要看订单；EDITOR 不含交易权限。
const TRADE_VIEW: readonly AdminRole[] = ["SUPER_ADMIN", "ADMIN", "CUSTOMER_SERVICE", "WAREHOUSE"];

// 路由、侧边栏共用此表；服务端 @Roles + RolesGuard 仍是最终授权边界。
// 说明：此表控制的是“能否进入该后台页面”，写操作（审核/发货/退款等）由后端 @Roles 最终拦截。
// 因此查看类页面对客服/仓储放开，但对应的后端写接口仍只允许 ADMIN。
const ROUTE_RULES: RouteRule[] = [
  { prefix: "/admin/users", roles: ADMIN_ONLY },
  { prefix: "/admin/settings", roles: ADMIN_ONLY },
  { prefix: "/admin/audit-logs", roles: ADMIN_ONLY },
  { prefix: "/admin/analytics", roles: ADMIN_ONLY },
  { prefix: "/admin/marketing", roles: ADMIN_ONLY },
  { prefix: "/admin/ai-classify", roles: ADMIN_ONLY },
  { prefix: "/admin/gold-price", roles: ADMIN_ONLY },
  { prefix: "/admin/finance", roles: ADMIN_ONLY },
  { prefix: "/admin/fintech", roles: ADMIN_ONLY },
  { prefix: "/admin/promotion", roles: ADMIN_ONLY },
  { prefix: "/admin/inventory", roles: WAREHOUSE },
  // 交易域：订单中心对所有交易角色可见（查看）；EDITOR 无权限
  { prefix: "/admin/orders", roles: TRADE_VIEW },
  // 交易域子页面（放于 orders 之后，避免前缀误匹配——它们以 /admin/trade/ 开头，互不冲突）
  { prefix: "/admin/trade/payments", roles: TRADE_VIEW },
  { prefix: "/admin/trade/fulfillment", roles: WAREHOUSE },
  { prefix: "/admin/trade/refunds", roles: CUSTOMER_SERVICE },
  { prefix: "/admin/trade/after-sales", roles: CUSTOMER_SERVICE },
  // 内容编辑
  { prefix: "/admin/products", roles: CONTENT_EDITORS },
  { prefix: "/admin/categories", roles: CONTENT_EDITORS },
  { prefix: "/admin/attributes", roles: CONTENT_EDITORS },
  { prefix: "/admin/editor", roles: CONTENT_EDITORS },
  { prefix: "/admin/site-content", roles: CONTENT_EDITORS },
  { prefix: "/admin/media", roles: CONTENT_EDITORS },
  // 客服域
  { prefix: "/admin/leads", roles: CUSTOMER_SERVICE },
  { prefix: "/admin/partner-applications", roles: CUSTOMER_SERVICE },
];

export function rolesForAdminRoute(route: string): readonly AdminRole[] | undefined {
  const pathname = route.split("?")[0];
  return ROUTE_RULES.find((rule) => pathname.startsWith(rule.prefix))?.roles;
}

export function canAccessAdminRoute(role: string | undefined, route: string): boolean {
  const roles = rolesForAdminRoute(route);
  return !roles || Boolean(role && roles.includes(role as AdminRole));
}
