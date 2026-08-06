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

export type RoleKey = 'SUPER_ADMIN' | 'PRODUCT_OPERATOR' | 'CONTENT_OPERATOR' | 'LEAD_ADVISOR' | 'READ_ONLY';

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
  PRODUCT_OPERATOR: [
    'dashboard.read',
    'products.read', 'products.create', 'products.update', 'products.publish',
    'content.read',
    'leads.read',
  ],
  CONTENT_OPERATOR: [
    'dashboard.read',
    'products.read',
    'content.read', 'content.update', 'content.publish',
    'leads.read',
  ],
  LEAD_ADVISOR: [
    'dashboard.read',
    'products.read',
    'content.read',
    'leads.read', 'leads.update',
  ],
  READ_ONLY: [
    'dashboard.read',
    'products.read',
    'content.read',
    'leads.read',
    'logs.read',
  ],
};

export function getPermissionsForRole(role: string): PermissionKey[] {
  return ROLE_PERMISSIONS[role as RoleKey] ?? [];
}

export function hasPermission(role: string, permission: PermissionKey): boolean {
  return getPermissionsForRole(role).includes(permission);
}
