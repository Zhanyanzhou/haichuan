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
  | 'system.read' | 'system.manage';

export type RoleKey = 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR' | 'CUSTOMER_SERVICE' | 'WAREHOUSE';

const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  SUPER_ADMIN: [
    'dashboard.read',
    'products.read', 'products.create', 'products.update', 'products.publish',
    'content.read', 'content.update', 'content.publish',
    'leads.read', 'leads.update',
    'admins.read', 'admins.manage',
    'logs.read',
    'system.read', 'system.manage',
  ],
  ADMIN: [
    'dashboard.read',
    'products.read', 'products.create', 'products.update', 'products.publish',
    'content.read', 'content.update', 'content.publish',
    'leads.read', 'leads.update',
    'admins.read',
    'logs.read',
    'system.read',
  ],
  EDITOR: [
    'dashboard.read',
    'products.read', 'products.create', 'products.update', 'products.publish',
    'content.read', 'content.update', 'content.publish',
    'leads.read',
  ],
  CUSTOMER_SERVICE: [
    'dashboard.read',
    'products.read',
    'content.read',
    'leads.read', 'leads.update',
  ],
  WAREHOUSE: [
    'dashboard.read',
    'products.read',
  ],
};

export function getPermissionsForRole(role: string): PermissionKey[] {
  return ROLE_PERMISSIONS[role as RoleKey] ?? [];
}

export function hasPermission(role: string, permission: PermissionKey): boolean {
  return getPermissionsForRole(role).includes(permission);
}
