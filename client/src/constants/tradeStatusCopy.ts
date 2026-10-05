import type { FulfillmentStatus, OrderStatus, Payment } from "@/types";

/**
 * 交易域状态的中文标签与视觉语义单一来源（ADMIN_COPY_GUIDE §3：同一业务域的
 * 列表、详情、筛选项共用同一映射）。
 */

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { color: string; label: string }
> = {
  PENDING_PAYMENT: { color: "gold", label: "待付款" },
  PENDING_SHIP: { color: "blue", label: "待发货" },
  SHIPPED: { color: "cyan", label: "已发货" },
  COMPLETED: { color: "green", label: "已完成" },
  CANCELLED: { color: "red", label: "已取消" },
};

export function orderStatusLabel(
  status: OrderStatus | string | null | undefined,
): string {
  if (!status) return "—";
  return ORDER_STATUS_META[status as OrderStatus]?.label ?? status;
}

export const FULFILLMENT_STATUS_META: Record<
  FulfillmentStatus,
  { color: string; label: string }
> = {
  PENDING_PICK: { color: "default", label: "待拣货" },
  PENDING_CHECK: { color: "gold", label: "待复核" },
  PENDING_SHIP: { color: "orange", label: "待发货" },
  SHIPPED: { color: "blue", label: "已发货" },
  DELIVERED: { color: "green", label: "已送达" },
  ABNORMAL: { color: "red", label: "物流异常" },
};

export function fulfillmentStatusLabel(
  status: FulfillmentStatus | string | null | undefined,
): string {
  if (!status) return "—";
  return FULFILLMENT_STATUS_META[status as FulfillmentStatus]?.label ?? status;
}

export const PAYMENT_STATUS_META: Record<
  Payment["status"],
  { color: string; label: string }
> = {
  PENDING: { color: "gold", label: "待确认" },
  PAID: { color: "green", label: "已收款" },
  FAILED: { color: "red", label: "收款失败" },
  REFUNDED: { color: "default", label: "已退款" },
  PARTIAL_REFUND: { color: "default", label: "部分退款" },
};

export function paymentStatusLabel(
  status: Payment["status"] | string | null | undefined,
): string {
  if (!status) return "—";
  return PAYMENT_STATUS_META[status as Payment["status"]]?.label ?? status;
}
