export type AdminRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "EDITOR"
  | "CUSTOMER_SERVICE"
  | "WAREHOUSE"
  | "SALES_CONSULTANT"
  | "FINANCE";

type RouteRule = { prefix: string; roles: readonly AdminRole[] };

const ADMIN_ONLY: readonly AdminRole[] = ["SUPER_ADMIN", "ADMIN"];
const CONTENT_EDITORS: readonly AdminRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "EDITOR",
];
const CUSTOMER_SERVICE: readonly AdminRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "CUSTOMER_SERVICE",
];
// 付款审核查看：与 payments.controller 类级 @Roles 一致；仓库角色无权进入。
const PAYMENT_REVIEW: readonly AdminRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "CUSTOMER_SERVICE",
];
const WAREHOUSE: readonly AdminRole[] = ["SUPER_ADMIN", "ADMIN", "WAREHOUSE"];
// 交易域订单查看：客服跟进订单；仓储仅进入履约中心，不读取通用订单与财务信息。
const TRADE_VIEW: readonly AdminRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "CUSTOMER_SERVICE",
];
// 销售顾问：报价管理（与服务端 quotations.controller @Roles 同口径）
const SALES_CONSULTANT: readonly AdminRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "SALES_CONSULTANT",
];
// 财务：交易概览/异常订单（与服务端 orders.controller @Roles 同口径）
const FINANCE: readonly AdminRole[] = ["SUPER_ADMIN", "ADMIN", "FINANCE"];

// 路由、侧边栏共用此表；服务端 @Roles + RolesGuard 仍是最终授权边界。
// 说明：此表控制的是“能否进入该后台页面”，写操作（审核/发货/退款等）由后端 @Roles 最终拦截。
// 因此查看类页面对客服/仓储放开，但对应的后端写接口仍只允许 ADMIN。
const ROUTE_RULES: RouteRule[] = [
  // 工作台消费的 /statistics/dashboard、/statistics/trend 在服务端类级
  // @Roles("SUPER_ADMIN", "ADMIN")（statistics.controller），其余角色的落点见 adminLandingRoute。
  { prefix: "/admin/dashboard", roles: ADMIN_ONLY },
  { prefix: "/admin/users", roles: ADMIN_ONLY },
  { prefix: "/admin/settings", roles: ADMIN_ONLY },
  { prefix: "/admin/audit-logs", roles: ADMIN_ONLY },
  { prefix: "/admin/analytics", roles: ADMIN_ONLY },
  { prefix: "/admin/marketing", roles: ADMIN_ONLY },
  { prefix: "/admin/ai-classify", roles: ADMIN_ONLY },
  { prefix: "/admin/gold-price", roles: ADMIN_ONLY },
  { prefix: "/admin/finance", roles: ADMIN_ONLY },
  { prefix: "/admin/inventory", roles: WAREHOUSE },
  { prefix: "/admin/warehouses", roles: WAREHOUSE },
  // 交易域：订单中心对管理员与客服可见；仓储使用履约中心的最小数据投影
  { prefix: "/admin/orders", roles: TRADE_VIEW },
  // 交易域子页面（放于 orders 之后，避免前缀误匹配——它们以 /admin/trade/ 开头，互不冲突）
  { prefix: "/admin/trade/payments", roles: PAYMENT_REVIEW },
  { prefix: "/admin/trade/fulfillment", roles: WAREHOUSE },
  { prefix: "/admin/trade/refunds", roles: CUSTOMER_SERVICE },
  { prefix: "/admin/trade/after-sales", roles: CUSTOMER_SERVICE },
  { prefix: "/admin/trade/quotations", roles: SALES_CONSULTANT },
  { prefix: "/admin/trade/overview", roles: FINANCE },
  { prefix: "/admin/trade/anomalies", roles: FINANCE },
  // 内容编辑
  { prefix: "/admin/products", roles: CONTENT_EDITORS },
  { prefix: "/admin/categories", roles: CONTENT_EDITORS },
  { prefix: "/admin/attributes", roles: CONTENT_EDITORS },
  { prefix: "/admin/tags", roles: CONTENT_EDITORS },
  // 评价管理：客服可看列表跟进，审核写操作由后端 @Roles 限定 ADMIN（与服务端 reviews.controller 同口径）
  { prefix: "/admin/reviews", roles: CUSTOMER_SERVICE },
  { prefix: "/admin/editor", roles: CONTENT_EDITORS },
  // 店铺资料读写与 settings.controller 类级 @Roles 保持一致。
  { prefix: "/admin/site-content", roles: ADMIN_ONLY },
  { prefix: "/admin/media", roles: CONTENT_EDITORS },
  // 客服域
  { prefix: "/admin/leads", roles: CUSTOMER_SERVICE },
  { prefix: "/admin/partner-applications", roles: CUSTOMER_SERVICE },
  // 客户档案：客服可查看（跟进客户），写操作由后端 @Roles 限定（与服务端 customers.controller 同口径）
  { prefix: "/admin/customers", roles: CUSTOMER_SERVICE },
];

export function rolesForAdminRoute(
  route: string,
): readonly AdminRole[] | undefined {
  const pathname = route.split("?")[0];
  return ROUTE_RULES.find((rule) => pathname.startsWith(rule.prefix))?.roles;
}

export function canAccessAdminRoute(
  role: string | undefined,
  route: string,
): boolean {
  const roles = rolesForAdminRoute(route);
  return !roles || Boolean(role && roles.includes(role as AdminRole));
}

// 各角色登录后的默认落点：工作台统计仅管理员可读，其余角色进入各自职责首页。
const ADMIN_LANDING: Readonly<Record<AdminRole, string>> = {
  SUPER_ADMIN: "/admin/dashboard",
  ADMIN: "/admin/dashboard",
  EDITOR: "/admin/products",
  WAREHOUSE: "/admin/inventory",
  CUSTOMER_SERVICE: "/admin/leads",
  SALES_CONSULTANT: "/admin/trade/quotations",
  FINANCE: "/admin/trade/overview",
};

export function adminLandingRoute(role: string | undefined): string {
  const typedRole = role as AdminRole | undefined;
  const preferred = typedRole ? ADMIN_LANDING[typedRole] : undefined;
  if (preferred && canAccessAdminRoute(typedRole, preferred)) return preferred;
  // 防御映射漂移：回退到该角色第一个可访问路由，避免把无权限角色送进 403 页。
  const fallback = ROUTE_RULES.find((rule) =>
    typedRole ? rule.roles.includes(typedRole) : false,
  );
  return fallback?.prefix ?? "/admin/login";
}
