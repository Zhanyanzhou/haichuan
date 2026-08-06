/**
 * 海川珠宝 Feature Flags
 * 
 * 功能开关统一管理。
 * 关 → 菜单隐藏 + 前台按钮隐藏 + API 拒绝 + 无假数据。
 * 
 * 当前阶段: 电商功能全部关闭 (commerceEnabled = false)
 */

export type FeatureFlag = 
  | 'commerceEnabled'
  | 'cartEnabled'
  | 'paymentEnabled'
  | 'analyticsDashboardEnabled';

// 当前阶段默认值
const defaults: Record<FeatureFlag, boolean> = {
  commerceEnabled: false,
  cartEnabled: false,
  paymentEnabled: false,
  analyticsDashboardEnabled: false,
};

// 可从 settings API 动态覆盖
let overrides: Partial<Record<FeatureFlag, boolean>> = {};

export function getFeatureFlag(flag: FeatureFlag): boolean {
  if (flag in overrides) return overrides[flag]!;
  return defaults[flag];
}

export function setFeatureFlag(flag: FeatureFlag, value: boolean) {
  overrides[flag] = value;
}

export function isCommerceAllowed(salesMode: string): boolean {
  if (!getFeatureFlag('commerceEnabled')) return false;
  return salesMode === 'DIRECT_PURCHASE';
}
