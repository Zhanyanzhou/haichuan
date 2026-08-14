/**
 * navigationConfig.ts — 海川珠宝后台 12 域导航配置
 *
 * 层级：Domain → Group → Item → Route
 * 原则：URL 是唯一真相来源，导航状态从当前路由反向推导
 * 未实现模块保留架构位置，标记 disabled，不创建假页面
 */

export interface NavItem {
  key: string;
  label: string;
  route: string;
  featureFlag?: string;
  disabled?: boolean;
}

export interface NavGroup {
  key: string;
  label: string;
  labelEn?: string;
  collapsible: boolean;
  defaultOpen: boolean;
  items: NavItem[];
}

/** 侧边栏功能分区 */
export type NavSection =
  | "overview" // 今日概览
  | "ops" // 日常运营
  | "customers" // 客户服务
  | "store" // 店铺装修
  | "growth" // 营销增长
  | "assets" // 数据资产
  | "system"; // 系统

export interface NavSectionMeta {
  key: NavSection;
  label: string;
  order: number;
}

/** 侧边栏 7 大功能分区（按运营场景分层） */
export const navSections: NavSectionMeta[] = [
  { key: "overview", label: "总览", order: 1 },
  { key: "ops", label: "核心经营", order: 2 },
  { key: "customers", label: "客户关系", order: 3 },
  { key: "store", label: "店铺体验", order: 4 },
  { key: "growth", label: "营销增长", order: 5 },
  { key: "assets", label: "经营支撑", order: 6 },
  { key: "system", label: "系统", order: 7 },
];

export interface NavDomain {
  key: string;
  label: string;
  icon: string;
  order: number;
  groups: NavGroup[];
  /** 点击一级入口后直接进入的页面，不展开二级菜单 */
  directRoute?: string;
  separator?: boolean;
  disabled?: boolean;
  /** 所属功能分区 */
  section: NavSection;
  /** 沉浸式页面（脱离 AdminLayout 全屏渲染） */
  immersive?: boolean;
}

export interface NavContext {
  domain: NavDomain;
  group?: NavGroup;
  item?: NavItem;
}

/* ═══════ 全量导航 — 12 域 ═══════ */
export const navigationConfig: NavDomain[] = [
  /* 1. 首页 — 经营工作台的直接入口 */
  {
    key: "home",
    label: "首页",
    icon: "home",
    order: 1,
    section: "overview",
    directRoute: "/admin/dashboard",
    groups: [],
  },
  /* 2. 常用 — 快捷入口聚合，不承载独立业务 */
  {
    key: "common",
    label: "常用",
    icon: "star",
    order: 2,
    section: "overview",
    groups: [
      {
        key: "quick",
        label: "快捷入口",
        collapsible: false,
        defaultOpen: true,
        items: [
          {
            key: "quick-products",
            label: "商品管理",
            route: "/admin/products",
          },
          { key: "quick-orders", label: "订单中心", route: "/admin/orders" },
          {
            key: "quick-inquiries",
            label: "预约咨询",
            route: "/admin/inquiries",
          },
          {
            key: "quick-homepage",
            label: "店铺装修",
            route: "/admin/editor/home",
          },
        ],
      },
    ],
  },
  /* 2. 交易 */
  {
    key: "trade",
    label: "交易",
    icon: "transaction",
    order: 1,
    section: "ops",
    groups: [
      {
        key: "order-center",
        label: "订单履约",
        collapsible: false,
        defaultOpen: true,
        items: [
          { key: "orders-list", label: "订单中心", route: "/admin/orders" },
          {
            key: "orders-pending-ship",
            label: "待发货",
            route: "/admin/orders?status=PENDING_SHIP",
          },
          {
            key: "orders-shipped",
            label: "已发货",
            route: "/admin/orders?status=SHIPPED",
          },
          {
            key: "trade-fulfillment",
            label: "履约中心",
            route: "/admin/trade/fulfillment",
          },
        ],
      },
      {
        key: "trade-quotation",
        label: "报价管理",
        collapsible: false,
        defaultOpen: false,
        items: [
          {
            key: "trade-quotations",
            label: "报价单",
            route: "/admin/trade/quotations",
          },
        ],
      },
      {
        key: "trade-finance",
        label: "收款与退款",
        collapsible: false,
        defaultOpen: false,
        items: [
          {
            key: "trade-payments",
            label: "付款审核",
            route: "/admin/trade/payments",
          },
          {
            key: "trade-refunds",
            label: "退款中心",
            route: "/admin/trade/refunds",
          },
        ],
      },
      {
        key: "trade-service",
        label: "售后服务",
        collapsible: false,
        defaultOpen: false,
        items: [
          {
            key: "trade-after-sales",
            label: "售后中心",
            route: "/admin/trade/after-sales",
          },
        ],
      },
      {
        key: "trade-data",
        label: "交易数据",
        collapsible: false,
        defaultOpen: false,
        items: [
          {
            key: "trade-overview",
            label: "交易概览",
            route: "/admin/trade/overview",
          },
          {
            key: "trade-anomalies",
            label: "异常订单",
            route: "/admin/trade/anomalies",
          },
        ],
      },
    ],
  },
  /* 3. 商品 */
  {
    key: "product",
    label: "商品",
    icon: "shopping",
    order: 2,
    section: "ops",
    groups: [
      {
        key: "product-assets",
        label: "商品资产",
        collapsible: true,
        defaultOpen: true,
        items: [
          { key: "products", label: "商品管理", route: "/admin/products" },
          {
            key: "categories",
            label: "类目与属性",
            route: "/admin/categories",
          },
          {
            key: "attributes",
            label: "属性字典",
            route: "/admin/attributes",
          },
        ],
      },
      {
        key: "product-reviews",
        label: "评价与口碑",
        collapsible: true,
        defaultOpen: false,
        items: [
          {
            key: "reviews",
            label: "评价管理",
            route: "/admin/reviews",
          },
        ],
      },
      {
        key: "inventory-control",
        label: "库存控制",
        collapsible: true,
        defaultOpen: false,
        items: [
          {
            key: "inventory-page",
            label: "库存管理",
            route: "/admin/inventory",
          },
        ],
      },
      {
        key: "pricing",
        label: "价格维护",
        collapsible: true,
        defaultOpen: false,
        items: [
          { key: "gold-price", label: "金价管理", route: "/admin/gold-price" },
        ],
      },
      {
        key: "smart-tools",
        label: "智能工具",
        collapsible: true,
        defaultOpen: false,
        items: [
          {
            key: "ai-classify",
            label: "智能分类",            route: "/admin/ai-classify",
          },
        ],
      },
    ],
  },
  /* 4. 营销 */
  {
    key: "marketing",
    label: "营销",
    icon: "notification",
    order: 1,
    section: "growth",
    groups: [
      {
        key: "campaigns",
        label: "营销活动",
        collapsible: false,
        defaultOpen: true,
        items: [
          {
            key: "campaigns-list",
            label: "活动中心",
            route: "/admin/marketing?tab=promotions",
          },
        ],
      },
      {
        key: "coupons",
        label: "优惠券管理",
        collapsible: false,
        defaultOpen: false,
        items: [
          {
            key: "coupons-list",
            label: "优惠券",
            route: "/admin/marketing?tab=coupons",
          },
        ],
      },
    ],
  },
  /* 6. 客服 */
  {
    key: "service",
    label: "客服",
    icon: "customer-service",
    order: 1,
    section: "customers",
    groups: [
      {
        key: "consultations",
        label: "咨询接待",
        collapsible: false,
        defaultOpen: true,
        items: [
          {
            key: "inquiry-list",
            label: "预约咨询",
            route: "/admin/leads?type=inquiry",
          },
          {
            key: "inquiry-pending",
            label: "待处理预约",
            route: "/admin/leads?type=inquiry&status=PENDING",
          },
          {
            key: "selection-list",
            label: "选款咨询",
            route: "/admin/leads?type=selection",
          },
          {
            key: "selection-pending",
            label: "待处理选款",
            route: "/admin/leads?type=selection&status=PENDING",
          },
          {
            key: "partner-applications",
            label: "合作申请",
            route: "/admin/partner-applications",
          },
        ],
      },
    ],
  },
  /* 7. 店铺 */
  {
    key: "store",
    label: "店铺",
    icon: "shop",
    order: 1,
    section: "store",
    groups: [
      {
        key: "store-pages",
        label: "店铺装修",
        collapsible: false,
        defaultOpen: true,
        items: [
          {
            key: "homepage-editor",
            label: "店铺装修",
            route: "/admin/editor/home",
          },
        ],
      },
      {
        key: "store-profile",
        label: "店铺资料",
        collapsible: false,
        defaultOpen: true,
        items: [
          {
            key: "site-content",
            label: "店铺资料",
            route: "/admin/site-content",
          },
        ],
      },
      {
        key: "media-assets",
        label: "素材资产",
        collapsible: false,
        defaultOpen: false,
        items: [{ key: "media-lib", label: "页面素材", route: "/admin/media" }],
      },
    ],
  },
  /* 8. 私域 */
  {
    key: "crm",
    label: "私域",
    icon: "usergroup-add",
    order: 2,
    section: "customers",
    groups: [
      {
        key: "leads",
        label: "客户线索",
        collapsible: false,
        defaultOpen: true,
        items: [
          { key: "customer-leads", label: "客户线索", route: "/admin/leads" },
          {
            key: "customer-leads-pending",
            label: "待处理线索",
            route: "/admin/leads?status=PENDING",
          },
          {
            key: "customer-leads-following",
            label: "跟进中",
            route: "/admin/leads?status=PROCESSING",
          },
        ],
      },
    ],
  },
  /* 12. 服务 */
  {
    key: "system",
    label: "服务",
    icon: "setting",
    order: 1,
    section: "system",
    groups: [
      {
        key: "user-mgmt",
        label: "用户与权限",
        collapsible: false,
        defaultOpen: true,
        items: [{ key: "user-list", label: "用户管理", route: "/admin/users" }],
      },
      {
        key: "audit",
        label: "操作日志",
        collapsible: false,
        defaultOpen: true,
        items: [
          { key: "audit-logs", label: "操作日志", route: "/admin/audit-logs" },
        ],
      },
      {
        key: "sys-settings",
        label: "系统设置",
        collapsible: false,
        defaultOpen: false,
        items: [
          {
            key: "sys-settings-page",
            label: "系统设置",
            route: "/admin/settings",
          },
        ],
      },
    ],
  },
];

/** 从当前路由反向查找导航上下文
 *  优先匹配非"常用"域，避免快捷入口覆盖业务域 */
export function findByRoute(pathname: string): NavContext | null {
  // 一级直达页优先匹配，避免首页工作台被“数据”等二级菜单重复认领。
  const directDomain = navigationConfig.find(
    (domain) => domain.directRoute?.split("?")[0] === pathname,
  );
  if (directDomain) return { domain: directDomain };

  let commonMatch: NavContext | null = null;
  for (const domain of navigationConfig) {
    for (const group of domain.groups) {
      for (const item of group.items) {
        const itemPath = item.route?.split("?")[0];
        const matchesRoute =
          itemPath === pathname ||
          (itemPath !== "/admin" && pathname.startsWith(`${itemPath}/`));
        if (!itemPath || item.disabled || !matchesRoute) continue;
        if (domain.key === "common") {
          commonMatch ??= { domain, group, item };
        } else {
          return { domain, group, item };
        }
      }
    }
  }
  return commonMatch;
}

/** 获取 Domain 的默认路由（第一个可用项） */
export function getDefaultRoute(domain: NavDomain): string | null {
  for (const group of domain.groups) {
    for (const item of group.items) {
      if (item.route && !item.disabled && !item.featureFlag) return item.route;
    }
  }
  return null;
}
