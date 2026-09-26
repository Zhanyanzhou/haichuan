import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { App as AntdApp } from "antd";
import { customerApi } from "@/services/api";
import { getRequestErrorMessage } from "@/services/httpClient";
import type { CustomerPaymentOrder } from "@/components/commerce/CustomerPaymentDialog";
import { unwrapResponse } from "@/utils/unwrap";
import { getRequestableAfterSalesItems } from "./CustomerAfterSalesDialog";
import type {
  CustomerAfterSalesCase,
  CustomerOrder,
  CustomerReviewOrder,
} from "./types";
import { trackRefund } from "@/hooks/useAnalytics";

const orderStatus: Record<string, string> = {
  PENDING_PAYMENT: "待付款",
  PENDING_SHIP: "待发货",
  SHIPPED: "已发货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

const fulfillmentStatus: Record<string, string> = {
  PENDING_PICK: "待拣货",
  PENDING_CHECK: "待复核",
  PENDING_SHIP: "待发货",
  SHIPPED: "已发货",
  DELIVERED: "已送达",
  ABNORMAL: "物流异常",
};

const customStageStatus: Record<string, string> = {
  NEED_CONFIRM: "需求确认",
  QUOTE_CONFIRM: "报价确认",
  PENDING_DEPOSIT: "待付定金",
  DEPOSIT_PAID: "已付定金",
  DESIGN_CONFIRM: "设计确认",
  IN_PRODUCTION: "制作中",
  QC_PASSED: "质检完成",
  PENDING_BALANCE: "待付尾款",
  BALANCE_PAID: "尾款完成",
  PENDING_DELIVERY: "待交付",
  DELIVERED: "已交付",
  COMPLETED: "已完成",
};

const refundStatus: Record<string, string> = {
  PENDING: "待审核",
  APPROVED: "审核通过",
  PROCESSING: "原路退款处理中",
  COMPLETED: "退款已完成",
  REJECTED: "退款未通过",
  FAILED: "退款待核对",
};

const afterSalesType: Record<string, string> = {
  REFUND: "退款",
  EXCHANGE: "换货",
  REPAIR: "维修",
};

const afterSalesStatus: Record<string, string> = {
  REQUESTED: "待受理",
  APPROVED: "已通过",
  REJECTED: "未通过",
  RETURNING: "退回处理中",
  QC_PASSED: "质检通过",
  QC_FAILED: "质检待沟通",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

type CustomerServiceGuidance = {
  owner: string;
  nextStep: string;
};

const refundGuidance: Record<string, CustomerServiceGuidance> = {
  PENDING: {
    owner: "海川财务",
    nextStep: "等待审核，无需重复提交。",
  },
  APPROVED: {
    owner: "海川财务",
    nextStep: "等待按原付款渠道或已确认的线下方式发起退款。",
  },
  PROCESSING: {
    owner: "支付渠道与海川财务",
    nextStep: "系统会继续查询渠道结果；异常时由财务核对，请勿重复申请。",
  },
  COMPLETED: {
    owner: "客户",
    nextStep: "请核对原付款账户；如有差异，请联系顾问并提供退款单号。",
  },
  REJECTED: {
    owner: "客户",
    nextStep: "可联系顾问核对未通过原因，请勿重复提交同一退款。",
  },
  FAILED: {
    owner: "海川财务",
    nextStep: "需按原退款单核对渠道或重新建单，请勿重复申请。",
  },
};

const afterSalesGuidance: Record<string, CustomerServiceGuidance> = {
  REQUESTED: {
    owner: "海川售后",
    nextStep: "等待受理；如提交有误，可在当前订单撤销后重新申请。",
  },
  APPROVED: {
    owner: "海川售后",
    nextStep: "等待售后团队确认后续安排，请勿重复提交同一商品。",
  },
  REJECTED: {
    owner: "客户",
    nextStep: "可联系顾问核对未通过原因。",
  },
  RETURNING: {
    owner: "客户与海川售后",
    nextStep: "按已确认的退回安排处理，并在当前订单关注质检结果。",
  },
  QC_PASSED: {
    owner: "海川售后",
    nextStep: "等待完成处理；如涉及退款，结果会回到当前订单。",
  },
  QC_FAILED: {
    owner: "海川售后",
    nextStep: "售后团队需与您核对质检差异，请留意联系信息。",
  },
  COMPLETED: {
    owner: "已完成",
    nextStep: "无需操作；如对结果有疑问，请联系顾问并提供售后单号。",
  },
  CANCELLED: {
    owner: "已结束",
    nextStep: "如仍需服务，可在订单当前可申请范围内重新提交。",
  },
};

export function getCustomerRefundGuidance(status: string) {
  return refundGuidance[status];
}

export function getCustomerAfterSalesGuidance(status: string) {
  return afterSalesGuidance[status];
}

const customerTimelineLabel: Record<string, string> = {
  ORDER_CREATED: "订单已提交",
  ORDER_CANCELLED: "订单已取消",
  ORDER_COMPLETED: "订单已完成",
  ORDER_CUSTOM_STAGE_CHANGED: "定制进度已更新",
  PAYMENT_APPROVED: "付款已确认",
  FULFILLMENT_CREATED: "订单进入履约",
  SHIPMENT_DISPATCHED: "订单已发货",
  FULFILLMENT_DELIVERED: "订单已送达",
  FULFILLMENT_ABNORMAL: "物流状态待处理",
  AFTER_SALES_REQUESTED: "售后申请已登记",
  AFTER_SALES_APPROVED: "售后申请已通过",
  AFTER_SALES_REJECTED: "售后申请未通过",
  AFTER_SALES_STATUS_CHANGED: "售后状态已更新",
  REFUND_REQUESTED: "退款申请已登记",
  REFUND_APPROVED: "退款申请已通过",
  REFUND_REJECTED: "退款申请未通过",
  REFUND_PROCESSING: "原路退款处理中",
  REFUND_ATTENTION: "退款状态待核对",
  REFUND_COMPLETED: "退款已完成",
  REFUND_EXECUTE_FAILED: "退款执行未完成",
};

const trackingState: Record<string, string> = {
  "0": "在途",
  "1": "已揽收",
  "2": "疑难",
  "3": "已签收",
  "4": "退签",
  "5": "派件中",
  "6": "退回",
  "10": "待揽收",
};

type TrackingData = {
  carrier: string;
  trackingNo: string;
  state: string;
  events: Array<{ time: string; context: string }>;
};

type CustomerOrdersPanelProps = {
  orders: CustomerOrder[];
  commerceEnabled: boolean;
  paymentEnabled: boolean;
  uploadingProof: boolean;
  cancellingAfterSalesId: number | null;
  onOpenReview: (order: CustomerReviewOrder) => void;
  onOpenAfterSales: (order: CustomerOrder) => void;
  onCancelAfterSales: (caseRecord: CustomerAfterSalesCase, orderId: number) => void;
  onOpenProof: (orderId: number) => void;
  onOpenPayment: (order: CustomerPaymentOrder) => void;
  onRefresh?: () => void;
  targetOrderId: number | null;
  invalidTargetOrderId: boolean;
  targetOrderLoading: boolean;
  targetOrderError: "not-found" | "error" | null;
  onRetryTargetOrder: () => void;
  onOrderLocated: (orderId: number) => void;
  onClearOrderTarget: () => void;
};

export default function CustomerOrdersPanel({
  orders,
  commerceEnabled,
  paymentEnabled,
  uploadingProof,
  cancellingAfterSalesId,
  onOpenReview,
  onOpenAfterSales,
  onCancelAfterSales,
  onOpenProof,
  onOpenPayment,
  onRefresh,
  targetOrderId,
  invalidTargetOrderId,
  targetOrderLoading,
  targetOrderError,
  onRetryTargetOrder,
  onOrderLocated,
  onClearOrderTarget,
}: CustomerOrdersPanelProps) {
  const { message } = AntdApp.useApp();
  const [trackingOrderId, setTrackingOrderId] = useState<number | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<number | null>(null);
  const [showAllOrders, setShowAllOrders] = useState(false);

  // 客户自助取消未付款订单；存在待处理支付时服务端拒绝并给出明确指引
  const handleCancelOrder = async (order: CustomerOrder) => {
    if (!window.confirm(`确定取消订单 ${order.orderNo} 吗？取消后库存与优惠券将即时释放。`)) {
      return;
    }
    setCancellingOrderId(order.id);
    try {
      await customerApi.cancelOrder(order.id);
      message.success("订单已取消");
      onRefresh?.();
    } catch (error: unknown) {
      const status = (error as { status?: unknown; response?: { status?: unknown } })?.response?.status
        ?? (error as { status?: unknown })?.status;
      if (typeof status !== "number" || status >= 500) {
        try {
          const response = await customerApi.getOrder(order.id);
          const authoritative = unwrapResponse<CustomerOrder>(response);
          onRefresh?.();
          if (authoritative.status === "CANCELLED") {
            message.success("订单已取消并完成权威核验");
            return;
          }
          if (authoritative.status === "PENDING_PAYMENT") {
            message.warning("取消结果未确认，已刷新权威状态，可以安全重试。");
            return;
          }
          message.warning("订单状态已变化，已刷新权威状态。");
          return;
        } catch {
          message.warning("取消结果待确认，暂未读取到权威订单，可以安全重试。");
          return;
        }
      }
      message.error(getRequestErrorMessage(error, "订单取消未完成，请稍后重试。"));
    } finally {
      setCancellingOrderId(null);
    }
  };

  useEffect(() => {
    for (const order of orders) {
      for (const refund of order.refunds ?? []) {
        if (refund.status === "COMPLETED") {
          trackRefund(refund.id);
        }
      }
    }
  }, [orders]);
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const trackingRequestRef = useRef(0);
  const visibleOrders = showAllOrders ? orders : orders.slice(0, 4);
  const targetOrderMissing = targetOrderId !== null && targetOrderError === "not-found";
  const targetOrderUnavailable = targetOrderId !== null && targetOrderError === "error";

  useEffect(() => {
    if (targetOrderId === null) return;
    const targetIndex = orders.findIndex((order) => order.id === targetOrderId);
    if (targetIndex < 0) return;
    if (targetIndex >= 4 && !showAllOrders) {
      setShowAllOrders(true);
      return;
    }

    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(`customer-order-${targetOrderId}`);
      if (!target) return;
      target.scrollIntoView({ block: "center" });
      target.focus({ preventScroll: true });
      onOrderLocated(targetOrderId);
    });
    return () => cancelAnimationFrame(frame);
  }, [onOrderLocated, orders, showAllOrders, targetOrderId]);

  const loadTracking = async (orderId: number) => {
    const requestId = ++trackingRequestRef.current;
    setTrackingData(null);
    setTrackingError(null);
    setTrackingLoading(true);
    try {
      const response = await customerApi.getOrderTracking(orderId);
      if (trackingRequestRef.current !== requestId) return;
      setTrackingData(unwrapResponse<TrackingData>(response) || null);
    } catch {
      if (trackingRequestRef.current !== requestId) return;
      setTrackingData(null);
      setTrackingError("物流信息暂时无法查询，请稍后重试。");
    } finally {
      if (trackingRequestRef.current === requestId) setTrackingLoading(false);
    }
  };

  const toggleTracking = (orderId: number) => {
    if (trackingOrderId === orderId) {
      trackingRequestRef.current += 1;
      setTrackingOrderId(null);
      setTrackingData(null);
      setTrackingError(null);
      setTrackingLoading(false);
      return;
    }
    setTrackingOrderId(orderId);
    void loadTracking(orderId);
  };

  return (
    <section
      id="my-orders"
      className="my-account__panel my-account__panel--wide"
      tabIndex={-1}
    >
      <div className="my-account__panel-head">
        <div>
          <p>ORDER ARCHIVE</p>
          <h2>我的订单</h2>
        </div>
      </div>
      {targetOrderLoading ? (
        <div className="my-account__quote-state" role="status">
          <span>正在安全定位本人订单…</span>
        </div>
      ) : null}
      {invalidTargetOrderId || targetOrderMissing || targetOrderUnavailable ? (
        <div
          className="my-account__quote-state"
          role="alert"
          style={{ flexWrap: "wrap" }}
        >
          <span>
            {invalidTargetOrderId
              ? "订单定位信息无效，系统未发起订单详情请求。您仍可查看本人订单列表。"
              : targetOrderMissing
                ? "未找到这笔订单，或者它不属于当前账户。系统未返回其他客户数据。"
                : "订单定位暂时失败，请重试；本人订单列表仍可继续查看。"}
          </span>
          {targetOrderUnavailable ? (
            <button
              type="button"
              className="my-account__inline-retry"
              onClick={onRetryTargetOrder}
            >
              重新定位
            </button>
          ) : null}
          <button
            type="button"
            className="my-account__inline-retry"
            onClick={onClearOrderTarget}
          >
            查看本人订单列表
          </button>
        </div>
      ) : null}
      {orders.length ? (
        <div className="my-account__records">
          {visibleOrders.map((order) => {
            const cancelled = order.status === "CANCELLED";
            const steps = [
              { label: "下单", done: true },
              { label: "收款", done: Boolean(order.paymentConfirmedAt) },
              { label: "发货", done: Boolean(order.shippedAt) },
              { label: "完成", done: Boolean(order.completedAt) },
            ];
            const latestFulfillment = order.fulfillments?.[0];
            const latestRefund = order.refunds?.[0];
            const customStageLabel = order.customStage
              ? customStageStatus[order.customStage] || order.customStage
              : null;
            const latestRefundGuidance = latestRefund
              ? getCustomerRefundGuidance(latestRefund.status)
              : undefined;
            const visibleAfterSales = order.afterSalesCases || [];
            const canRequestAfterSales =
              (order.orderType ?? "SPOT") === "SPOT" &&
              ["PENDING_SHIP", "SHIPPED", "COMPLETED"].includes(order.status) &&
              getRequestableAfterSalesItems(order).length > 0;
            const hasPendingProof = order.payments?.some(
              (payment) => payment.status === "PENDING" && payment.hasProof,
            );

            return (
              <article
                key={order.id}
                id={`customer-order-${order.id}`}
                tabIndex={-1}
                aria-label={`订单 ${order.orderNo}`}
              >
                <div>
                  <small>
                    {order.orderNo} ·{" "}
                    {new Date(order.createdAt).toLocaleDateString("zh-CN")}
                  </small>
                  <h3>{order.items?.[0]?.product?.name || order.quotedLines?.[0]?.description || "珠宝作品"}</h3>
                  {order.quoteChannel ? (
                    <small>
                      报价渠道：{{ RETAIL: "标准零售", CUSTOM: "高级定制", PARTNER_WAX: "合作蜡模" }[order.quoteChannel]}
                    </small>
                  ) : null}
                  {(latestFulfillment ||
                    customStageLabel ||
                    latestRefund ||
                    visibleAfterSales.length > 0) && (
                    <div
                      className="my-account__service-status"
                      aria-label="订单服务状态"
                    >
                      {latestFulfillment ? (
                        <span>
                          履约 ·{" "}
                          {fulfillmentStatus[latestFulfillment.status] ||
                            latestFulfillment.status}
                        </span>
                      ) : null}
                      {customStageLabel ? (
                        <span>定制进度 · {customStageLabel}</span>
                      ) : null}
                      {visibleAfterSales.map((caseRecord) => {
                        const item = order.items?.find(
                          (candidate) => candidate.id === caseRecord.orderItemId,
                        );
                        const guidance = getCustomerAfterSalesGuidance(
                          caseRecord.status,
                        );
                        return (
                          <span
                            key={caseRecord.id}
                            className="my-account__service-case"
                          >
                            <span>
                              <span>
                                售后 · {item?.product?.name || "订单商品"} ·{" "}
                                {afterSalesType[caseRecord.type] || caseRecord.type} ·{" "}
                                {afterSalesStatus[caseRecord.status] ||
                                  caseRecord.status}
                              </span>
                              {guidance ? (
                                <small>
                                  当前责任：{guidance.owner} · 下一步：
                                  {guidance.nextStep}
                                </small>
                              ) : null}
                            </span>
                            {caseRecord.status === "REQUESTED" ? (
                              <button
                                type="button"
                                onClick={() => onCancelAfterSales(caseRecord, order.id)}
                                disabled={
                                  cancellingAfterSalesId === caseRecord.id
                                }
                              >
                                {cancellingAfterSalesId === caseRecord.id
                                  ? "撤销中…"
                                  : "撤销申请"}
                              </button>
                            ) : null}
                          </span>
                        );
                      })}
                      {latestRefund ? (
                        <span>
                          <span>
                            退款 ¥
                            {Number(latestRefund.amount).toLocaleString("zh-CN")} ·{" "}
                            {refundStatus[latestRefund.status] || latestRefund.status}
                          </span>
                          {latestRefundGuidance ? (
                            <small>
                              当前责任：{latestRefundGuidance.owner} · 下一步：
                              {latestRefundGuidance.nextStep}
                            </small>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  )}
                  {order.timeline?.length ? (
                    <details className="my-account__timeline">
                      <summary>查看处理记录</summary>
                      <ol>
                        {order.timeline.slice(0, 6).map((event) => (
                          <li key={event.id}>
                            <time dateTime={event.createdAt}>
                              {new Date(event.createdAt).toLocaleString("zh-CN", {
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                            <span>
                              {customerTimelineLabel[event.eventType] ||
                                "订单状态已更新"}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  ) : null}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 4,
                    alignItems: "center",
                    margin: "10px 0 6px",
                  }}
                  aria-label="订单进度"
                >
                  {cancelled ? (
                    <span style={{ fontSize: 11, color: "#8C3F3B" }}>
                      ✕ 订单已取消
                    </span>
                  ) : (
                    steps.map((step, index) => (
                      <span
                        key={step.label}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                          color: step.done ? "#181a1b" : "#6e7477",
                        }}
                      >
                        {index > 0 && (
                          <span
                            style={{
                              width: 18,
                              height: 1,
                              background: step.done ? "#181a1b" : "#dde1e2",
                              display: "inline-block",
                            }}
                          />
                        )}
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: step.done ? "#181a1b" : "#dde1e2",
                            display: "inline-block",
                          }}
                        />
                        {step.label}
                      </span>
                    ))
                  )}
                </div>
                {order.logisticsCompany && order.logisticsNo ? (
                  <p
                    style={{
                      fontSize: 11,
                      color: "#5f6568",
                      margin: "0 0 6px",
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <span>
                      物流：{order.logisticsCompany} · 运单号 {order.logisticsNo}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleTracking(order.id)}
                      style={{
                        fontSize: 11,
                        color: "#181a1b",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      {trackingOrderId === order.id ? "收起轨迹" : "查看轨迹"}
                    </button>
                  </p>
                ) : null}
                {trackingOrderId === order.id && (
                  <div
                    style={{
                      background: "#f4f5f5",
                      padding: 12,
                      marginBottom: 8,
                      fontSize: 12,
                    }}
                  >
                    {trackingLoading ? (
                      <p style={{ color: "#5f6568", margin: 0 }}>
                        轨迹查询中…
                      </p>
                    ) : trackingError ? (
                      <div role="alert">
                        <p style={{ color: "#8a2c2c", margin: "0 0 8px" }}>
                          {trackingError}
                        </p>
                        <button
                          type="button"
                          className="my-account__inline-retry"
                          onClick={() => void loadTracking(order.id)}
                        >
                          重新查询物流
                        </button>
                      </div>
                    ) : trackingData && trackingData.events.length ? (
                      <>
                        <p style={{ color: "#335f7d", margin: "0 0 8px" }}>
                          {trackingState[trackingData.state] || "运输中"}
                          {trackingData.carrier
                            ? ` · ${trackingData.carrier}`
                            : ""}
                        </p>
                        {trackingData.events.map((event, index) => (
                          <p
                            key={index}
                            style={{ margin: "0 0 6px", color: "#5f6568" }}
                          >
                            <span style={{ marginRight: 8 }}>{event.time}</span>
                            {event.context}
                          </p>
                        ))}
                      </>
                    ) : (
                      <p style={{ color: "#5f6568", margin: 0 }}>
                        暂无轨迹数据（物流查询服务可能未接入，请联系顾问）
                      </p>
                    )}
                  </div>
                )}
                <div className="my-account__order-meta">
                  <em>
                    {customStageLabel || orderStatus[order.status] || order.status}
                  </em>
                  <strong>
                    ¥{Number(order.finalAmount).toLocaleString("zh-CN")}
                  </strong>
                  {order.status === "COMPLETED" && order.items?.length ? (
                    <button
                      type="button"
                      className="my-account__order-action"
                      onClick={() =>
                        onOpenReview({ id: order.id, items: order.items || [] })
                      }
                    >
                      评价作品
                    </button>
                  ) : null}
                  {canRequestAfterSales ? (
                    <button
                      type="button"
                      className="my-account__service-action"
                      onClick={() => onOpenAfterSales(order)}
                    >
                      {order.status === "PENDING_SHIP" ? "申请退款" : "申请售后"}
                    </button>
                  ) : null}
                  {order.status === "PENDING_PAYMENT" &&
                    (order.paymentMethod === "bank_transfer" && commerceEnabled ? (
                        hasPendingProof ? (
                          <span style={{ fontSize: 11, color: "#7a531a" }}>
                            特殊线下凭证已提交·待审核
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="my-account__order-action"
                            onClick={() => onOpenProof(order.id)}
                            disabled={uploadingProof}
                          >
                            上传线下付款凭证
                          </button>
                        )
                      ) : paymentEnabled ? (
                        <button
                          type="button"
                          className="my-account__order-action"
                          onClick={() =>
                            onOpenPayment({
                              id: order.id,
                              orderNo: order.orderNo,
                              finalAmount: order.finalAmount,
                            })
                          }
                        >
                          继续微信支付
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: "#5f6568" }}>
                          线上付款暂未开放·顾问将联系您
                        </span>
                      ))}
                  {order.status === "PENDING_PAYMENT" && !hasPendingProof ? (
                    <button
                      type="button"
                      className="my-account__order-action"
                      disabled={cancellingOrderId === order.id}
                      onClick={() => void handleCancelOrder(order)}
                    >
                      {cancellingOrderId === order.id ? "取消中…" : "取消订单"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
          {orders.length > 4 ? (
            <button
              type="button"
              className="my-account__inline-retry"
              aria-expanded={showAllOrders}
              onClick={() => setShowAllOrders((current) => !current)}
            >
              {showAllOrders
                ? "收起较早订单"
                : `查看全部 ${orders.length} 笔订单`}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="my-account-empty">
          暂未有订单记录。<Link to="/catalog">浏览珠宝作品 →</Link>
        </p>
      )}
    </section>
  );
}
