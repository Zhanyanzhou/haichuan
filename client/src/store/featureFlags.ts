import { useEffect } from "react";
import { create } from "zustand";
import { settingsApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";

/**
 * 海川珠宝 前台销售模式工具
 *
 * 电商开关（FeatureFlag）以服务端 /settings/flags 为单一来源，
 * 与 CustomerCommerceGuard 读取同一环境变量 CUSTOMER_COMMERCE_ENABLED。
 * 加载失败或未配置时安全默认关闭；服务端守卫是最终安全边界。
 * 当前消费者：ProductDetail、MyAccountDashboard。
 */

/** 前台交易开关（单一来源：后端 /settings/flags）。 */
export interface CommerceFlags {
  commerceEnabled: boolean;
  cartEnabled: boolean;
  paymentEnabled: boolean;
}

const SAFE_FLAGS: CommerceFlags = {
  commerceEnabled: false,
  cartEnabled: false,
  paymentEnabled: false,
};

interface CommerceFlagsState {
  flags: CommerceFlags | null;
  loading: boolean;
  load: () => Promise<void>;
}

export const useCommerceFlags = create<CommerceFlagsState>((set, get) => ({
  flags: null,
  loading: false,
  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const res = await settingsApi.getFlags();
      const data = unwrapResponse<Partial<CommerceFlags>>(res) || {};
      set({
        flags: {
          commerceEnabled: Boolean(data.commerceEnabled),
          cartEnabled: Boolean(data.cartEnabled),
          paymentEnabled: Boolean(data.paymentEnabled),
        },
      });
    } catch {
      // 请求失败保持关闭，避免向访客暴露不可用的交易入口
      set({ flags: SAFE_FLAGS });
    } finally {
      set({ loading: false });
    }
  },
}));

/** 组件内读取前台交易是否开放（默认关闭，加载完成后自动更新）。 */
export function useCommerceEnabled(): boolean {
  const flags = useCommerceFlags((s) => s.flags);
  const loading = useCommerceFlags((s) => s.loading);
  const load = useCommerceFlags((s) => s.load);
  useEffect(() => {
    if (!flags && !loading) void load();
  }, [flags, loading, load]);
  return flags?.commerceEnabled ?? false;
}

/** 统一规则：全站交易开关开启且商品为“直接购买”时，才允许加购/下单。 */
export function isCommerceAllowed(
  salesMode: string | undefined,
  commerceEnabled: boolean,
): boolean {
  return commerceEnabled && salesMode === "DIRECT_PURCHASE";
}

/** 非直接购买场景的咨询入口路由 */
export function salesModeRoute(salesMode?: string): string {
  switch (salesMode) {
    case "SELECTION":
      return "/catalog";
    case "APPOINTMENT":
      return "/contact";
    case "CUSTOM_INQUIRY":
      return "/custom";
    default:
      return "/contact";
  }
}

/** 非直接购买场景的按钮文案 */
export function salesModeCta(salesMode?: string): string {
  switch (salesMode) {
    case "SELECTION":
      return "去选款咨询";
    case "APPOINTMENT":
      return "预约到店";
    case "CUSTOM_INQUIRY":
      return "定制咨询";
    case "DISPLAY_ONLY":
      return "仅展示";
    default:
      return "联系我们";
  }
}
