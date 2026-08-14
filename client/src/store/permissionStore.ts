/**
 * 海川珠宝 RBAC 权限定义
 * 
 * 角色-权限映射。当前无完整权限表时使用此映射。
 */

export type PermissionKey =
  | 'dashboard.read'
  | 'products.read' | 'products.create' | 'products.update' | 'products.publish'
  | 'content.read' | 'content.update' | 'content.publish'
  | 'leads.read' | 'leads.update'
  | 'admins.read' | 'admins.manage'
  | 'logs.read'
  | 'system.read' | 'system.manage'
  // 交易中心
  | 'orders.read' | 'orders.manage'
  | 'quotations.read' | 'quotations.manage'
  | 'payments.read' | 'payments.manage'
  | 'refunds.read' | 'refunds.manage'
  | 'fulfillment.read' | 'fulfillment.manage'
  | 'after-sales.read' | 'after-sales.manage'
  | 'trade.analytics';

export type RoleKey = 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR' | 'CUSTOMER_SERVICE' | 'WAREHOUSE' | 'SALES_CONSULTANT' | 'FINANCE';

const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  SUPER_ADMIN: [
    'dashboard.read',
    'products.read', 'products.create', 'products.update', 'products.publish',
    'content.read', 'content.update', 'content.publish',
    'leads.read', 'leads.update',
    'admins.read', 'admins.manage',
    'logs.read',
    'system.read', 'system.manage',
    // 交易中心：完整权限
    'orders.read', 'orders.manage',
    'quotations.read', 'quotations.manage',
    'payments.read', 'payments.manage',
    'refunds.read', 'refunds.manage',
    'fulfillment.read', 'fulfillment.manage',
    'after-sales.read', 'after-sales.manage',
    'trade.analytics',
  ],
  ADMIN: [
    'dashboard.read',
    'products.read', 'products.create', 'products.update', 'products.publish',
    'content.read', 'content.update', 'content.publish',
    'leads.read', 'leads.update',
    'admins.read',
    'logs.read',
    'system.read',
    // 交易中心：完整权限（不含系统级）
    'orders.read', 'orders.manage',
    'quotations.read', 'quotations.manage',
    'payments.read', 'payments.manage',
    'refunds.read', 'refunds.manage',
    'fulfillment.read', 'fulfillment.manage',
    'after-sales.read', 'after-sales.manage',
    'trade.analytics',
  ],
  EDITOR: [
    'dashboard.read',
    'products.read', 'products.create', 'products.update', 'products.publish',
    'content.read', 'content.update', 'content.publish',
    'leads.read',
    // 交易中心：只读订单与报价
    'orders.read', 'quotations.read',
  ],
  CUSTOMER_SERVICE: [
    'dashboard.read',
    'products.read',
    'content.read',
    'leads.read', 'leads.update',
    // 交易中心：看订单 + 处理售后 + 改备注
    'orders.read', 'orders.manage',
    'quotations.read',
    'after-sales.read', 'after-sales.manage',
  ],
  WAREHOUSE: [
    'dashboard.read',
    'products.read',
    // 交易中心：看订单 + 发货履约
    'orders.read',
    'fulfillment.read', 'fulfillment.manage',
  ],
  // 销售顾问：看订单（聚焦自己客户）+ 管理报价
  SALES_CONSULTANT: [
    'dashboard.read',
    'products.read',
    'leads.read',
    'orders.read',
    'quotations.read', 'quotations.manage',
  ],
  // 财务：看订单 + 收款 + 退款
  FINANCE: [
    'dashboard.read',
    'orders.read',
    'payments.read', 'payments.manage',
    'refunds.read', 'refunds.manage',
    'trade.analytics',
  ],
};

export function getPermissionsForRole(role: string): PermissionKey[] {
  return ROLE_PERMISSIONS[role as RoleKey] ?? [];
}

export function hasPermission(role: string, permission: PermissionKey): boolean {
  return getPermissionsForRole(role).includes(permission);
}
