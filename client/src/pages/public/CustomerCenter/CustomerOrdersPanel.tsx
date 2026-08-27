import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { App as AntdApp } from "antd";
import { customerApi } from "@/services/api";
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

const customerTimelineLabel: Record<string, string> = {
  ORDER_CREATED: "订单已提交",
  ORDER_CANCELLED: "订单已取消",
  ORDER_COMPLETED: "订单已完成",
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
  uploadingProof: boolean;
  cancellingAfterSalesId: number | null;
  onOpenReview: (order: CustomerReviewOrder) => void;
  onOpenAfterSales: (order: CustomerOrder) => void;
  onCancelAfterSales: (caseRecord: CustomerAfterSalesCase) => void;
  onOpenProof: (orderId: number) => void;
  onOpenPayment: (order: CustomerPaymentOrder) => void;
};

export default function CustomerOrdersPanel({
  orders,
  commerceEnabled,
  uploadingProof,
  cancellingAfterSalesId,
  onOpenReview,
  onOpenAfterSales,
  onCancelAfterSales,
  onOpenProof,
  onOpenPayment,
}: CustomerOrdersPanelProps) {
  const { message } = AntdApp.useApp();
  const [trackingOrderId, setTrackingOrderId] = useState<number | null>(null);

  useEffect(() => {
    for (const order of orders) {
      for (const refund of order.refunds ?? []) {
        if (refund.status === "COMPLETED") {
          trackRefund(refund.id, order.id, Number(refund.amount));
        }
      }
    }
  }, [orders]);
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  const toggleTracking = async (orderId: number) => {
    if (trackingOrderId === orderId) {
      setTrackingOrderId(null);
      setTrackingData(null);
      return;
    }
    setTrackingOrderId(orderId);
    setTrackingData(null);
    setTrackingLoading(true);
    try {
      const response = await customerApi.getOrderTracking(orderId);
      setTrackingData(unwrapResponse<TrackingData>(response) || null);
    } catch (error) {
      const candidate = error as {
        message?: string;
        response?: { data?: { message?: string } };
      };
      const errorMessage =
        candidate.response?.data?.message ||
        candidate.message ||
        "轨迹查询失败";
      setTrackingData({ carrier: "", trackingNo: "", state: "", events: [] });
      message.error(errorMessage);
    } finally {
      setTrackingLoading(false);
    }
  };

  return (
    <section
      id="my-orders"
      className="my-account__panel my-account__panel--wide"
    >
      <div className="my-account__panel-head">
        <div>
          <p>ORDER ARCHIVE</p>
          <h2>我的订单</h2>
        </div>
      </div>
      {orders.length ? (
        <div className="my-account__records">
          {orders.slice(0, 4).map((order) => {
            const cancelled = order.status === "CANCELLED";
            const steps = [
              { label: "下单", done: true },
              { label: "收款", done: Boolean(order.paymentConfirmedAt) },
              { label: "发货", done: Boolean(order.shippedAt) },
              { label: "完成", done: Boolean(order.completedAt) },
            ];
            const latestFulfillment = order.fulfillments?.[0];
            const latestRefund = order.refunds?.[0];
            const visibleAfterSales = order.afterSalesCases || [];
            const canRequestAfterSales =
              (order.orderType ?? "SPOT") === "SPOT" &&
              ["PENDING_SHIP", "SHIPPED", "COMPLETED"].includes(order.status) &&
              getRequestableAfterSalesItems(order).length > 0;
            const hasPendingProof = order.payments?.some(
              (payment) => payment.status === "PENDING" && payment.hasProof,
            );

            return (
              <article key={order.id}>
                <div>
                  <small>
                    {order.orderNo} ·{" "}
                    {new Date(order.createdAt).toLocaleDateString("zh-CN")}
                  </small>
                  <h3>{order.items?.[0]?.product?.name || "珠宝作品"}</h3>
                  {(latestFulfillment ||
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
                      {visibleAfterSales.map((caseRecord) => {
                        const item = order.items?.find(
                          (candidate) => candidate.id === caseRecord.orderItemId,
                        );
                        return (
                          <span
                            key={caseRecord.id}
                            className="my-account__service-case"
                          >
                            <span>
                              售后 · {item?.product?.name || "订单商品"} ·{" "}
                              {afterSalesType[caseRecord.type] || caseRecord.type} ·{" "}
                              {afterSalesStatus[caseRecord.status] ||
                                caseRecord.status}
                            </span>
                            {caseRecord.status === "REQUESTED" ? (
                              <button
                                type="button"
                                onClick={() => onCancelAfterSales(caseRecord)}
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
                          退款 ¥
                          {Number(latestRefund.amount).toLocaleString("zh-CN")} ·{" "}
                          {refundStatus[latestRefund.status] || latestRefund.status}
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
                  <em>{orderStatus[order.status] || order.status}</em>
                  <strong>
                    ¥{Number(order.finalAmount).toLocaleString("zh-CN")}
                  </strong>
                  {order.status === "COMPLETED" && order.items?.length ? (
                    <button
                      type="button"
                      className="my-account__summary-action"
                      style={{ padding: "6px 12px", fontSize: 12, minHeight: 0 }}
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
                    (commerceEnabled ? (
                      order.paymentMethod === "bank_transfer" ? (
                        hasPendingProof ? (
                          <span style={{ fontSize: 11, color: "#7a531a" }}>
                            特殊线下凭证已提交·待审核
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="my-account__summary-action"
                            style={{
                              padding: "6px 12px",
                              fontSize: 12,
                              minHeight: 0,
                            }}
                            onClick={() => onOpenProof(order.id)}
                            disabled={uploadingProof}
                          >
                            上传线下付款凭证
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          className="my-account__summary-action"
                          style={{
                            padding: "6px 12px",
                            fontSize: 12,
                            minHeight: 0,
                          }}
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
                      )
                    ) : (
                      <span style={{ fontSize: 11, color: "#5f6568" }}>
                        线上付款暂未开放·顾问将联系您
                      </span>
                    ))}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="my-account-empty">
          暂未有订单记录。<Link to="/catalog">浏览珠宝作品 →</Link>
        </p>
      )}
    </section>
  );
}
