/**
 * 海川珠宝 前台销售模式工具
 *
 * 电商开关（FeatureFlag）当前硬编码为关闭：CUSTOMER_COMMERCE_ENABLED = false。
 * 现公开站采用“作品展示 + 顾问转化”模式，客户线上交易默认关闭。
 * 服务端守卫（CustomerCommerceGuard）是最终安全边界；本模块同步关闭前台交易 CTA，
 * 避免向访客展示不可用入口。当前消费者：MyAccountDashboard、ProductDetail。
 */

const CUSTOMER_COMMERCE_ENABLED = false;

/** 前台交易功能是否整体开放。 */
export function isCustomerCommerceEnabled(): boolean {
  return CUSTOMER_COMMERCE_ENABLED;
}

/** 统一规则：全站交易开关开启且商品为“直接购买”时，才允许加购/下单。 */
export function isCommerceAllowed(salesMode: string | undefined): boolean {
  return isCustomerCommerceEnabled() && salesMode === "DIRECT_PURCHASE";
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
