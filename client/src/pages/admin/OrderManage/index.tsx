import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SecureImage } from "@/components/common/SecureImage";
import AdminPageHeader from "@/components/common/AdminPageHeader";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/common/AdminDataStates";
import {
  App as AntdApp,
  Button,
  Card,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
} from "antd";
import {
  EyeOutlined,
  ExportOutlined,
  ReloadOutlined,
  TruckOutlined,
} from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import {
  orderApi,
  userApi,
  productApi,
  marketingApi,
  type CreateOrderInput,
  type OrderListQuery,
} from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { csvRow } from "@/utils/csv";
import {
  ADMIN_COPY,
  getAdminEmptyText,
  getSafeAdminErrorMessage,
} from "@/constants/adminCopy";
import { useAuthStore } from "@/store/authStore";
import type {
  Order,
  OrderItem,
  OrderStatus,
  PaginatedResult,
  TradeEvent,
  User,
  Product,
  ProductSKU,
  DeliveryStatus,
  OrderType,
  PaymentStatus,
  CustomStage,
  Payment,
} from "@/types";
import {
  PAYMENT_STATUS_META,
  fulfillmentStatusLabel,
  paymentStatusLabel,
} from "@/constants/tradeStatusCopy";

const { RangePicker } = DatePicker;
const { Text } = Typography;

function isMultiPackageShipConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const { status, message } = error as { status?: unknown; message?: unknown };
  return status === 409 &&
    typeof message === "string" &&
    message.includes("多包裹订单请前往履约中心");
}

// 订单状态映射（颜色 + 中文）
const STATUS_META: Record<OrderStatus, { c: string; t: string }> = {
  PENDING_PAYMENT: { c: "gold", t: "待付款" },
  PENDING_SHIP: { c: "blue", t: "待发货" },
  SHIPPED: { c: "cyan", t: "已发货" },
  COMPLETED: { c: "green", t: "已完成" },
  CANCELLED: { c: "red", t: "已取消" },
};

const STATUS_TABS: Array<{ k: "all" | OrderStatus; l: string }> = [
  { k: "all", l: "全部" },
  { k: "PENDING_PAYMENT", l: "待付款" },
  { k: "PENDING_SHIP", l: "待发货" },
  { k: "SHIPPED", l: "已发货" },
  { k: "COMPLETED", l: "已完成" },
  { k: "CANCELLED", l: "已取消" },
];

function isOrderStatusFilter(value: string): value is "all" | OrderStatus {
  return value === "all" || Object.prototype.hasOwnProperty.call(STATUS_META, value);
}

type OrderOperationType =
  | "amount"
  | "address"
  | "note"
  | "consultant"
  | "custom-stage";

interface OrderOperationValues {
  discountAmount?: number;
  adjustmentAmount?: number;
  finalAmount?: number;
  depositAmount?: number;
  balanceAmount?: number;
  reason?: string;
  address?: string;
  internalNote?: string;
  salesConsultantId?: number;
  stage?: CustomStage;
}

// 交易事件类型中文映射（时间线展示）
const EVENT_LABEL: Record<string, string> = {
  ORDER_CREATED: "订单创建",
  ORDER_CANCELLED: "订单取消",
  ORDER_COMPLETED: "订单完成",
  STOCK_RESERVED: "库存预占",
  STOCK_RELEASED: "库存释放",
  STOCK_CONSUMED: "库存确认扣减",
  PAYMENT_PROOF_SUBMITTED: "付款凭证提交",
  PAYMENT_APPROVED: "付款审核通过",
  PAYMENT_REJECTED: "付款审核驳回",
  FULFILLMENT_CREATED: "履约单创建",
  SHIPMENT_DISPATCHED: "已发货",
  FULFILLMENT_DELIVERED: "已送达",
  FULFILLMENT_ABNORMAL: "物流异常",
  AFTER_SALES_REQUESTED: "售后申请",
  AFTER_SALES_APPROVED: "售后通过",
  AFTER_SALES_REJECTED: "售后驳回",
  REFUND_REQUESTED: "退款申请",
  REFUND_APPROVED: "退款审核通过",
  REFUND_REJECTED: "退款驳回",
  REFUND_PROCESSING: "原路退款处理中",
  REFUND_ATTENTION: "退款待人工核对",
  REFUND_EXECUTE_FAILED: "退款执行失败",
  REFUND_COMPLETED: "退款完成",
  ORDER_AMOUNT_EDITED: "修改金额",
  ORDER_ADDRESS_EDITED: "修改地址",
  ORDER_NOTE_EDITED: "修改备注",
  ORDER_RECEIVED: "确认签收",
  ORDER_CUSTOM_STAGE_CHANGED: "定制阶段推进",
  ORDER_CONSULTANT_CHANGED: "修改销售顾问",
};

const OPERATOR_LABEL: Record<string, string> = {
  CUSTOMER: "客户",
  ADMIN: "管理员",
  SYSTEM: "系统",
};

// 订单类型映射（交易中心）
const ORDER_TYPE_META: Record<string, { c: string; t: string }> = {
  SPOT: { c: "blue", t: "现货" },
  CUSTOM: { c: "purple", t: "定制" },
  RESERVATION: { c: "cyan", t: "预订" },
  OFFLINE: { c: "default", t: "线下" },
};

// 发货维度映射（独立于订单主状态）
const DELIVERY_STATUS_META: Record<string, { c: string; t: string }> = {
  NONE: { c: "default", t: "无需发货" },
  PENDING_SHIP: { c: "blue", t: "待发货" },
  SHIPPED: { c: "cyan", t: "已发货" },
  RECEIVED: { c: "green", t: "已签收" },
  ABNORMAL: { c: "red", t: "物流异常" },
};

// 定制订单阶段中文（详情展示）
const CUSTOM_STAGE_LABEL: Record<string, string> = {
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

/** 由 paidAmount / finalAmount 派生支付状态（列表与详情复用） */
function derivePaymentStatus(
  paid: number | undefined | null,
  final: number | undefined | null,
): { key: "UNPAID" | "PARTIAL" | "PAID"; label: string; color: string } {
  const p = Number(paid) || 0;
  const f = Number(final) || 0;
  if (p <= 0) return { key: "UNPAID", label: "未收款", color: "gold" };
  if (f > 0 && p >= f) return { key: "PAID", label: "已收齐", color: "green" };
  return { key: "PARTIAL", label: "部分收款", color: "orange" };
}

type OrderDetail = Order & {
  customerEmail?: string;
  internalNote?: string;
  paymentConfirmedAt?: string;
  shippedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  payments?: Array<{
    id: number;
    paymentNo: string;
    method: string;
    status: string;
    amount: number | string;
    proofUrl?: string | null;
    reviewedAt?: string | null;
    reviewNote?: string | null;
    reviewer?: { realName?: string; username: string } | null;
  }>;
  reservations?: Array<{
    id: number;
    skuId: number;
    quantity: number;
    releasedAt?: string | null;
    consumedAt?: string | null;
    expiresAt: string;
  }>;
  fulfillments?: Array<{
    id: number;
    fulfillmentNo: string;
    status: string;
    carrier?: string | null;
    trackingNo?: string | null;
    shippedAt?: string | null;
  }>;
  tradeEvents?: TradeEvent[];
  customer?: {
    id: number;
    name?: string;
    phone: string;
    email?: string;
  } | null;
};

type OrderCapabilities = Readonly<{
  canExport: boolean;
  canCreate: boolean;
  canShip: boolean;
  canComplete: boolean;
  canCancel: boolean;
  canEditAmount: boolean;
  canEditAddress: boolean;
  canEditNote: boolean;
  canEditConsultant: boolean;
  canAdvanceCustomStage: boolean;
  canReceive: boolean;
}>;

/** 与 orders.controller.ts 当前 @Roles 严格对齐；服务端仍是最终权限边界。 */
function getOrderCapabilities(role: User["role"] | undefined): OrderCapabilities {
  const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN";
  const isCustomerService = role === "CUSTOMER_SERVICE";

  return {
    canExport: isAdmin,
    canCreate: isAdmin,
    canShip: isAdmin,
    canComplete: isAdmin,
    canCancel: isAdmin,
    canEditAmount: isAdmin,
    canEditAddress: isAdmin,
    canEditNote: isAdmin || isCustomerService,
    canEditConsultant: isAdmin,
    canAdvanceCustomStage: isAdmin,
    canReceive: isAdmin,
  };
}

export default function OrderManage() {
  const { message, modal } = AntdApp.useApp();
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const capabilities = getOrderCapabilities(role);
  const [searchParams, setSearchParams] = useSearchParams();
  const [list, setList] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<unknown | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 筛选状态
  const requestedStatus = searchParams.get("status") || "all";
  const statusFilter: "all" | OrderStatus = isOrderStatusFilter(requestedStatus)
    ? requestedStatus
    : "all";
  const [keyword, setKeyword] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [productKeyword, setProductKeyword] = useState("");
  const [productKeywordInput, setProductKeywordInput] = useState("");
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);
  const [amountRange, setAmountRange] = useState<{
    min?: number;
    max?: number;
  }>({});
  // 交易中心多维筛选
  const [orderTypeFilter, setOrderTypeFilter] = useState<"all" | OrderType>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<"all" | PaymentStatus>("all");
  const [deliveryStatusFilter, setDeliveryStatusFilter] =
    useState<"all" | DeliveryStatus>("all");

  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<unknown | null>(null);
  const [shippingOrder, setShippingOrder] = useState<Order | null>(null);
  const detailHasBlockingPayment =
    detail?.payments?.some((payment) => payment.status !== "FAILED") ?? false;
  const canEditDetailAmount = Boolean(
    capabilities.canEditAmount &&
      detail?.status === "PENDING_PAYMENT" &&
      !detailHasBlockingPayment,
  );
  const canEditDetailAddress = Boolean(
    capabilities.canEditAddress &&
      detail &&
      ["PENDING_PAYMENT", "PENDING_SHIP"].includes(detail.status),
  );
  const canReceiveDetail = Boolean(
    capabilities.canReceive &&
      detail?.status === "SHIPPED" &&
      ["SHIPPED", "ABNORMAL"].includes(detail.deliveryStatus || "") &&
      detail.fulfillments?.length === 1 &&
      detail.fulfillments.some((fulfillment) =>
        ["SHIPPED", "ABNORMAL"].includes(fulfillment.status),
      ),
  );
  const requiresFulfillmentCenter = Boolean(
    capabilities.canReceive &&
      detail?.fulfillments &&
      detail.fulfillments.length > 1 &&
      detail.fulfillments.some((fulfillment) =>
        ["PENDING_PICK", "PENDING_CHECK", "PENDING_SHIP", "SHIPPED", "ABNORMAL"].includes(
          fulfillment.status,
        ),
      ),
  );
  const [shipping, setShipping] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [opModal, setOpModal] = useState<{
    type: OrderOperationType | null;
    open: boolean;
  }>({
    type: null,
    open: false,
  });
  const [consultants, setConsultants] = useState<User[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createForm] = Form.useForm<Omit<CreateOrderInput, "items">>();
  const [itemRows, setItemRows] = useState<
    Array<{ key: number; productId?: number; skuId?: number; quantity: number }>
  >([{ key: 1, quantity: 1 }]);
  const [productOptions, setProductOptions] = useState<
    Array<{ value: number; label: string }>
  >([]);
  const [skuOptionsMap, setSkuOptionsMap] = useState<
    Record<number, Array<{ value: number; label: string }>>
  >({});
  // 建单试算：skuId → 售价（元），用于优惠券门槛判断与券后合计展示
  const [skuPriceMap, setSkuPriceMap] = useState<Record<number, number>>({});
  const [couponOptions, setCouponOptions] = useState<
    Array<{
      value: number;
      label: string;
      discount: number;
    }>
  >([]);
  const handleStatusFilter = (status: string) => {
    setSearchParams(status === "all" ? {} : { status });
    setPage(1);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params: OrderListQuery = {
        page,
        pageSize,
        status: statusFilter !== "all" ? statusFilter : undefined,
        keyword: keyword || undefined,
        productKeyword: productKeyword || undefined,
        startDate: dateRange?.[0]?.format("YYYY-MM-DD"),
        endDate: dateRange?.[1]?.format("YYYY-MM-DD"),
        minAmount: amountRange.min,
        maxAmount: amountRange.max,
        orderType: orderTypeFilter !== "all" ? orderTypeFilter : undefined,
        paymentStatus:
          paymentStatusFilter !== "all" ? paymentStatusFilter : undefined,
        deliveryStatus:
          deliveryStatusFilter !== "all" ? deliveryStatusFilter : undefined,
      };
      const res = await orderApi.getList(params);
      const data = unwrapResponse<PaginatedResult<Order>>(res);
      setList(data?.list || []);
      setTotal(data?.total || 0);
    } catch (error: unknown) {
      setLoadError(error);
      setList([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    statusFilter,
    keyword,
    productKeyword,
    dateRange,
    amountRange.min,
    amountRange.max,
    orderTypeFilter,
    paymentStatusFilter,
    deliveryStatusFilter,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (orderId: number) => {
    setDetailId(orderId);
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await orderApi.getById(orderId);
      setDetail(unwrapResponse<OrderDetail>(res));
    } catch (e: unknown) {
      setDetailError(e);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleShip = async (
    id: number,
    values: {
      logisticsCompany: string;
      logisticsNo: string;
      internalNote?: string;
    },
  ) => {
    if (!capabilities.canShip) return;
    setShipping(true);
    try {
      await orderApi.ship(id, values);
      message.success("发货信息已登记，订单状态已更新为“已发货”。");
      setShippingOrder(null);
      void load();
      if (detail?.id === id) void openDetail(id);
    } catch (e: unknown) {
      const errorMessage = getSafeAdminErrorMessage(
        e,
        "发货登记失败，请核对物流信息后重试。",
      );
      message.error(errorMessage);
      if (isMultiPackageShipConflict(e)) {
        modal.confirm({
          title: "多包裹订单请逐包发货",
          content: "当前填写内容已保留。请前往履约中心，按履约单分别登记物流信息。",
          okText: "前往履约中心",
          cancelText: "留在当前页面",
          onOk: () => navigate("/admin/trade/fulfillment"),
        });
      }
    } finally {
      setShipping(false);
    }
  };

  const handleComplete = (record: Order) => {
    if (!capabilities.canComplete) return;
    modal.confirm({
      title: "确认完成该订单？",
      content: "订单完成后进入终态，不可再变更。",
      okText: "确认完成",
      cancelText: ADMIN_COPY.actions.cancel,
      onOk: async () => {
        try {
          await orderApi.updateStatus(record.id, { status: "COMPLETED" });
          message.success("订单已完成");
          void load();
        } catch (e: unknown) {
          message.error(getSafeAdminErrorMessage(e, "订单完成状态更新失败，请重新加载后重试。"));
        }
      },
    });
  };

  const handleCancel = (record: Order) => {
    if (!capabilities.canCancel) return;
    let internalNote = "";
    modal.confirm({
      title: "确认取消该订单？",
      content: (
        <Input.TextArea
          placeholder="取消原因（将记录到交易事件）"
          rows={3}
          onChange={(e) => {
            internalNote = e.target.value;
          }}
        />
      ),
      okText: "确认取消",
      cancelText: ADMIN_COPY.actions.cancel,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await orderApi.updateStatus(record.id, {
            status: "CANCELLED",
            internalNote: internalNote || undefined,
          });
          message.success("订单已取消");
          void load();
        } catch (e: unknown) {
          message.error(getSafeAdminErrorMessage(e, "订单取消失败，请重新加载后确认当前状态。"));
        }
      },
    });
  };

  const handleExport = async () => {
    if (!capabilities.canExport) return;
    setExporting(true);
    try {
      const res = await orderApi.exportList({
        status: statusFilter !== "all" ? statusFilter : undefined,
        keyword: keyword || undefined,
        productKeyword: productKeyword || undefined,
        startDate: dateRange?.[0]?.format("YYYY-MM-DD"),
        endDate: dateRange?.[1]?.format("YYYY-MM-DD"),
        minAmount: amountRange.min,
        maxAmount: amountRange.max,
        orderType: orderTypeFilter !== "all" ? orderTypeFilter : undefined,
        paymentStatus:
          paymentStatusFilter !== "all" ? paymentStatusFilter : undefined,
        deliveryStatus:
          deliveryStatusFilter !== "all" ? deliveryStatusFilter : undefined,
      });
      const rows =
        unwrapResponse<
          Array<{
            orderNo: string;
            customerName: string;
            customerPhone: string;
            finalAmount: number | string;
            status: string;
            createdAt: string;
            paymentConfirmedAt?: string | null;
          }>
        >(res) || [];
      const csv = ["订单号,客户,手机号,金额,状态,创建时间,收款时间"]
        .concat(
          rows.map((r) =>
            csvRow([
              r.orderNo,
              r.customerName,
              r.customerPhone,
              `¥${r.finalAmount}`,
              STATUS_META[r.status as OrderStatus]?.t || r.status,
              r.createdAt,
              r.paymentConfirmedAt || "",
            ]),
          ),
        )
        .join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `订单报表_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(`已导出 ${rows.length} 条订单（与当前筛选一致）`);
    } catch (e: unknown) {
      message.error(getSafeAdminErrorMessage(e, "订单导出失败，请检查筛选条件后重试。"));
    } finally {
      setExporting(false);
    }
  };

  const loadConsultants = async () => {
    try {
      const res = await userApi.getAssignable();
      const users = unwrapResponse<Array<{ id: number; name: string; role: User['role'] }>>(res) || [];
      setConsultants(
        users.filter(
          (u) =>
            u.role === "SALES_CONSULTANT" ||
            u.role === "ADMIN" ||
            u.role === "SUPER_ADMIN",
        ).map((user) => ({
          id: user.id,
          username: user.name,
          realName: user.name,
          role: user.role,
        } as User)),
      );
    } catch {
      setConsultants([]);
    }
  };

  const openOp = (type: OrderOperationType) => {
    const allowed =
      (type === "amount" && canEditDetailAmount) ||
      (type === "address" && canEditDetailAddress) ||
      (type === "note" && capabilities.canEditNote) ||
      (type === "consultant" && capabilities.canEditConsultant) ||
      (type === "custom-stage" && capabilities.canAdvanceCustomStage);
    if (!allowed) return;
    if (type === "consultant" && consultants.length === 0)
      void loadConsultants();
    setOpModal({ type, open: true });
  };

  const submitOp = async (values: OrderOperationValues) => {
    if (!detail) return;
    const allowed =
      (opModal.type === "amount" && canEditDetailAmount) ||
      (opModal.type === "address" && canEditDetailAddress) ||
      (opModal.type === "note" && capabilities.canEditNote) ||
      (opModal.type === "consultant" && capabilities.canEditConsultant) ||
      (opModal.type === "custom-stage" && capabilities.canAdvanceCustomStage);
    if (!allowed) return;
    try {
      if (opModal.type === "amount") {
        if (!values.reason?.trim()) return;
        await orderApi.updateAmount(detail.id, {
          discountAmount: values.discountAmount,
          adjustmentAmount: values.adjustmentAmount,
          finalAmount: values.finalAmount,
          depositAmount: values.depositAmount,
          balanceAmount: values.balanceAmount,
          reason: values.reason,
        });
      } else if (opModal.type === "address") {
        if (!values.address?.trim()) return;
        await orderApi.updateAddress(detail.id, values.address);
      }
      else if (opModal.type === "note")
        await orderApi.updateNote(detail.id, values.internalNote);
      else if (opModal.type === "consultant")
        await orderApi.updateConsultant(
          detail.id,
          values.salesConsultantId ?? null,
        );
      else if (opModal.type === "custom-stage" && values.stage)
        await orderApi.advanceCustomStage(detail.id, values.stage);
      message.success("订单信息已更新");
      setOpModal({ type: null, open: false });
      void openDetail(detail.id);
      void load();
    } catch (e: unknown) {
      message.error(getSafeAdminErrorMessage(e, "订单信息更新失败，请检查填写内容后重试。"));
    }
  };

  const handleReceive = () => {
    if (!detail || !canReceiveDetail) return;
    modal.confirm({
      title: "确认签收？",
      content: "确认后，订单的发货状态将更新为“已签收”。",
      okText: "确认签收",
      cancelText: ADMIN_COPY.actions.cancel,
      onOk: async () => {
        try {
          await orderApi.confirmReceive(detail.id);
          message.success("订单已签收");
          void openDetail(detail.id);
          void load();
        } catch (e: unknown) {
          message.error(getSafeAdminErrorMessage(e, "签收状态更新失败，请重新加载后重试。"));
        }
      },
    });
  };

  const searchProducts = async (kw: string) => {
    try {
      const res = await productApi.getList({
        keyword: kw || undefined,
        pageSize: 30,
      });
      const list = unwrapResponse<PaginatedResult<Product>>(res)?.list || [];
      setProductOptions(
        list.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` })),
      );
    } catch {
      setProductOptions([]);
    }
  };

  const loadSkus = async (productId: number) => {
    if (skuOptionsMap[productId]) return;
    try {
      const res = await productApi.getSkus(productId);
      const list = unwrapResponse<ProductSKU[]>(res) || [];
      setSkuOptionsMap((m) => ({
        ...m,
        [productId]: list.map((s) => ({ value: s.id, label: s.skuCode })),
      }));
      // 同步记录售价，供建单优惠券试算（服务端仍会强校验，此处仅为展示）
      setSkuPriceMap((m) => {
        const next = { ...m };
        for (const s of list) next[s.id] = Number(s.price) || 0;
        return next;
      });
    } catch {
      setSkuOptionsMap((m) => ({ ...m, [productId]: [] }));
    }
  };

  // 当前商品明细合计（分）——优惠券可用性与券后金额的计算依据
  const createTotalCents = useMemo(
    () =>
      itemRows.reduce(
        (sum, row) =>
          row.skuId
            ? sum +
              Math.round((skuPriceMap[row.skuId] || 0) * 100) * row.quantity
            : sum,
        0,
      ),
    [itemRows, skuPriceMap],
  );

  // 合计变化时重拉可用券（服务端按金额试算，前端不复制门槛规则）
  useEffect(() => {
    if (!createOpen || createTotalCents <= 0) {
      setCouponOptions([]);
      return;
    }
    let cancelled = false;
    marketingApi
      .listUsableCoupons(createTotalCents)
      .then((res: unknown) => {
        if (cancelled) return;
        const list =
          unwrapResponse<
            Array<{ id: number; name: string; estimatedDiscount: number }>
          >(res) || [];
        setCouponOptions(
          list.map((c) => ({
            value: c.id,
            label: `${c.name}（立减 ¥${c.estimatedDiscount}）`,
            discount: c.estimatedDiscount,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setCouponOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [createOpen, createTotalCents]);

  const submitCreate = async (values: Omit<CreateOrderInput, "items">) => {
    if (!capabilities.canCreate) return;
    const items: CreateOrderInput["items"] = itemRows.flatMap((row) =>
      row.skuId ? [{ skuId: row.skuId, quantity: row.quantity }] : [],
    );
    if (items.length === 0) {
      message.error("请至少选择一个商品 SKU");
      return;
    }
    setCreateSaving(true);
    try {
      await orderApi.create({ ...values, items });
      message.success("订单已创建");
      setCreateOpen(false);
      createForm.resetFields();
      setItemRows([{ key: 1, quantity: 1 }]);
      setProductOptions([]);
      setSkuOptionsMap({});
      void load();
    } catch (e: unknown) {
      message.error(getSafeAdminErrorMessage(e, "订单创建失败，请核对必填信息和商品明细后重试。"));
    } finally {
      setCreateSaving(false);
    }
  };

  const resetFilters = () => {
    setKeyword("");
    setKeywordInput("");
    setProductKeyword("");
    setProductKeywordInput("");
    setDateRange(null);
    setAmountRange({});
    setOrderTypeFilter("all");
    setPaymentStatusFilter("all");
    setDeliveryStatusFilter("all");
    setPage(1);
  };

  const hasOrderFilters = Boolean(
    statusFilter !== "all" ||
      keyword ||
      productKeyword ||
      dateRange ||
      amountRange.min !== undefined ||
      amountRange.max !== undefined ||
      orderTypeFilter !== "all" ||
      paymentStatusFilter !== "all" ||
      deliveryStatusFilter !== "all",
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="订单中心"
        subtitle="查看订单、收款、库存占用、履约与交易事件。"
        extra={(
          <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            刷新
          </Button>
          {capabilities.canExport && (
            <Button
              icon={<ExportOutlined />}
              loading={exporting}
              onClick={handleExport}
            >
              导出
            </Button>
          )}
          {capabilities.canCreate && (
            <Button
              type="primary"
              onClick={() => {
                void searchProducts("");
                setCreateOpen(true);
              }}
            >
              人工建单
            </Button>
          )}
          </Space>
        )}
      />

      {/* 状态标签 */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map((s) => (
          <button
            key={s.k}
            onClick={() => handleStatusFilter(s.k)}
            className={`px-4 py-2 text-sm border transition-all ${statusFilter === s.k ? "border-brand-gold text-brand-gold" : "border-brand-line text-brand-muted hover:text-brand-text hover:border-brand-gold"}`}
          >
            {s.l}
          </button>
        ))}
      </div>

      {/* 高级筛选 */}
      <Card className="!bg-white !border-brand-line" size="small">
        <div className="flex flex-wrap gap-3 items-center">
          <Input.Search
            placeholder="订单号 / 客户 / 手机号"
            value={keywordInput}
            onChange={(e) => {
              setKeywordInput(e.target.value);
              // allowClear 清空时同步重置已应用关键词，避免界面清空但列表仍按旧词过滤
              if (e.target.value === "" && keyword) {
                setKeyword("");
                setPage(1);
              }
            }}
            onSearch={(v) => {
              setKeyword(v);
              setPage(1);
            }}
            className="w-56"
            allowClear
          />
          <Input.Search
            placeholder="商品名 / 货号"
            value={productKeywordInput}
            onChange={(e) => setProductKeywordInput(e.target.value)}
            onSearch={(v) => {
              setProductKeyword(v);
              setPage(1);
            }}
            className="w-44"
            allowClear
          />
          <RangePicker
            value={dateRange as [Dayjs, Dayjs] | null}
            onChange={(range) => {
              setDateRange(range as [Dayjs, Dayjs] | null);
              setPage(1);
            }}
          />
          <Space.Compact>
            <InputNumber
              placeholder="最低金额"
              min={0}
              prefix="¥"
              value={amountRange.min}
              onChange={(v) =>
                setAmountRange((prev) => ({ ...prev, min: v ?? undefined }))
              }
              className="w-32"
            />
            <InputNumber
              placeholder="最高金额"
              min={0}
              prefix="¥"
              value={amountRange.max}
              onChange={(v) =>
                setAmountRange((prev) => ({ ...prev, max: v ?? undefined }))
              }
              className="w-32"
            />
          </Space.Compact>
          <Select
            value={orderTypeFilter}
            onChange={(v) => {
              setOrderTypeFilter(v);
              setPage(1);
            }}
            className="w-28"
            options={[
              { value: "all", label: "全部类型" },
              { value: "SPOT", label: "现货" },
              { value: "CUSTOM", label: "定制" },
              { value: "RESERVATION", label: "预订" },
              { value: "OFFLINE", label: "线下" },
            ]}
          />
          <Select
            value={paymentStatusFilter}
            onChange={(v) => {
              setPaymentStatusFilter(v);
              setPage(1);
            }}
            className="w-28"
            options={[
              { value: "all", label: "全部支付" },
              { value: "UNPAID", label: "未收款" },
              { value: "PARTIAL", label: "部分收款" },
              { value: "PAID", label: "已收齐" },
            ]}
          />
          <Select
            value={deliveryStatusFilter}
            onChange={(v) => {
              setDeliveryStatusFilter(v);
              setPage(1);
            }}
            className="w-28"
            options={[
              { value: "all", label: "全部发货" },
              { value: "NONE", label: "无需发货" },
              { value: "PENDING_SHIP", label: "待发货" },
              { value: "SHIPPED", label: "已发货" },
              { value: "RECEIVED", label: "已签收" },
              { value: "ABNORMAL", label: "物流异常" },
            ]}
          />
          <Button onClick={resetFilters}>重置</Button>
        </div>
      </Card>

      {loadError ? (
        <AdminErrorState
          subject="订单"
          error={loadError}
          onRetry={() => void load()}
        />
      ) : loading && list.length === 0 ? (
        <AdminLoadingState subject="订单" />
      ) : (
        <Card className="!bg-white !border-brand-line">
          <Table
            dataSource={list}
            rowKey="id"
            loading={loading}
            size="middle"
            scroll={{ x: 1200 }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
            locale={{ emptyText: getAdminEmptyText("订单", hasOrderFilters) }}
            columns={[
              {
                title: "订单号",
                dataIndex: "orderNo",
                render: (v: string) => (
                  <code className="text-xs text-brand-gold">{v}</code>
                ),
              },
              {
                title: "客户",
                dataIndex: "customerName",
                render: (v: string, r: Order) => (
                  <div>
                    <p>{v}</p>
                    <p className="text-xs text-brand-muted">
                      {r.customerPhone}
                    </p>
                  </div>
                ),
              },
              {
                title: "类型",
                dataIndex: "orderType",
                width: 70,
                render: (v: string) => {
                  const m = ORDER_TYPE_META[v || "SPOT"];
                  return <Tag color={m?.c}>{m?.t || "现货"}</Tag>;
                },
              },
              {
                title: "订单金额",
                dataIndex: "finalAmount",
                width: 110,
                render: (v: number) => (
                  <span className="text-brand-gold font-medium">
                    ¥{Number(v).toLocaleString()}
                  </span>
                ),
              },
              {
                title: "已收",
                dataIndex: "paidAmount",
                width: 100,
                render: (v: number) => (
                  <span className="text-xs">
                    ¥{Number(v || 0).toLocaleString()}
                  </span>
                ),
              },
              {
                title: "支付状态",
                width: 90,
                render: (_v: unknown, r: Order) => {
                  const ps = derivePaymentStatus(r.paidAmount, r.finalAmount);
                  return <Tag color={ps.color}>{ps.label}</Tag>;
                },
              },
              {
                title: "订单状态",
                dataIndex: "status",
                width: 90,
                render: (v: OrderStatus) => (
                  <Tag color={STATUS_META[v]?.c}>{STATUS_META[v]?.t}</Tag>
                ),
              },
              {
                title: "发货状态",
                dataIndex: "deliveryStatus",
                width: 90,
                render: (v: string) => {
                  const m = DELIVERY_STATUS_META[v || "NONE"];
                  return <Tag color={m?.c}>{m?.t || "—"}</Tag>;
                },
              },
              {
                title: "下单时间",
                dataIndex: "createdAt",
                render: (v: string) => (
                  <span className="text-brand-muted text-xs">
                    {v ? dayjs(v).format("YYYY-MM-DD HH:mm") : ""}
                  </span>
                ),
              },
              {
                title: "操作",
                render: (_: unknown, r: Order) => (
                  <Space>
                    <Button
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => openDetail(r.id)}
                    >
                      详情
                    </Button>
                    {capabilities.canShip && r.status === "PENDING_SHIP" && (
                      <Button
                        size="small"
                        type="primary"
                        icon={<TruckOutlined />}
                        onClick={() => setShippingOrder(r)}
                      >
                        发货
                      </Button>
                    )}
                    {capabilities.canComplete &&
                      r.status === "SHIPPED" &&
                      r.deliveryStatus === "RECEIVED" && (
                      <Button
                        size="small"
                        type="primary"
                        onClick={() => handleComplete(r)}
                      >
                        完成
                      </Button>
                    )}
                    {capabilities.canCancel && r.status === "PENDING_PAYMENT" && (
                        <Button
                          size="small"
                          danger
                          onClick={() => handleCancel(r)}
                        >
                          取消
                        </Button>
                      )}
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      )}

      {/* 订单详情抽屉 */}
      <Drawer
        open={detailId !== null}
        onClose={() => {
          setDetailId(null);
          setDetail(null);
          setDetailError(null);
        }}
        width="min(720px, calc(100vw - 16px))"
        title="订单详情"
      >
        {detailLoading && !detail ? (
          <AdminLoadingState subject="订单详情" compact />
        ) : detailError ? (
          <AdminErrorState
            subject="订单详情"
            error={detailError}
            onRetry={detailId === null ? undefined : () => void openDetail(detailId)}
          />
        ) : detail ? (
          <div className="space-y-6">
            {/* 基本信息 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">订单摘要</h3>
                <Tag color={STATUS_META[detail.status]?.c}>
                  {STATUS_META[detail.status]?.t}
                </Tag>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <Text type="secondary">订单号：</Text>
                  <code className="text-brand-gold">{detail.orderNo}</code>
                </div>
                <div>
                  <Text type="secondary">订单类型：</Text>
                  {(() => {
                    const m = ORDER_TYPE_META[detail.orderType || "SPOT"];
                    return <Tag color={m?.c}>{m?.t || "现货"}</Tag>;
                  })()}
                </div>
                <div>
                  <Text type="secondary">应收：</Text>
                  <span className="text-brand-gold font-medium">
                    ¥{Number(detail.finalAmount).toLocaleString()}
                  </span>
                </div>
                <div>
                  <Text type="secondary">销售顾问：</Text>
                  {detail.salesConsultant?.realName ||
                    detail.salesConsultant?.username ||
                    "—"}
                </div>
                {detail.orderType === "CUSTOM" && detail.customStage && (
                  <div>
                    <Text type="secondary">定制阶段：</Text>
                    {CUSTOM_STAGE_LABEL[detail.customStage] ||
                      detail.customStage}
                  </div>
                )}
                {detail.source && (
                  <div>
                    <Text type="secondary">来源渠道：</Text>
                    {detail.source}
                  </div>
                )}
                <div>
                  <Text type="secondary">客户：</Text>
                  {detail.customerName}
                </div>
                <div>
                  <Text type="secondary">手机号：</Text>
                  {detail.customerPhone}
                </div>
                <div>
                  <Text type="secondary">邮箱：</Text>
                  {detail.customerEmail || "—"}
                </div>
                <div>
                  <Text type="secondary">支付方式：</Text>
                  {detail.paymentMethod || "—"}
                </div>
                <div className="col-span-2">
                  <Text type="secondary">收货地址：</Text>
                  {detail.address}
                </div>
                <div>
                  <Text type="secondary">创建时间：</Text>
                  {detail.createdAt
                    ? dayjs(detail.createdAt).format("YYYY-MM-DD HH:mm")
                    : "—"}
                </div>
                <div>
                  <Text type="secondary">收款时间：</Text>
                  {detail.paymentConfirmedAt
                    ? dayjs(detail.paymentConfirmedAt).format(
                        "YYYY-MM-DD HH:mm",
                      )
                    : "—"}
                </div>
                <div>
                  <Text type="secondary">发货时间：</Text>
                  {detail.shippedAt
                    ? dayjs(detail.shippedAt).format("YYYY-MM-DD HH:mm")
                    : "—"}
                </div>
                <div>
                  <Text type="secondary">完成时间：</Text>
                  {detail.completedAt
                    ? dayjs(detail.completedAt).format("YYYY-MM-DD HH:mm")
                    : "—"}
                </div>
                {detail.internalNote && (
                  <div className="col-span-2">
                    <Text type="secondary">内部备注：</Text>
                    {detail.internalNote}
                  </div>
                )}
              </div>
            </div>

            {/* 金额信息（商品金额/优惠/调整/应收/已收/待收/定金/尾款/已退/净收） */}
            <div>
              <h3 className="font-semibold mb-2">金额信息</h3>
              <div className="grid grid-cols-2 gap-2 text-sm border border-brand-line p-3 rounded">
                <div>
                  <Text type="secondary">商品金额：</Text>¥
                  {Number(detail.totalAmount || 0).toLocaleString()}
                </div>
                <div>
                  <Text type="secondary">优惠金额：</Text>¥
                  {Number(detail.discountAmount || 0).toLocaleString()}
                </div>
                <div>
                  <Text type="secondary">订单调整：</Text>¥
                  {Number(detail.adjustmentAmount || 0).toLocaleString()}
                </div>
                <div>
                  <Text type="secondary">应收金额：</Text>
                  <span className="text-brand-gold font-medium">
                    ¥{Number(detail.finalAmount || 0).toLocaleString()}
                  </span>
                </div>
                <div>
                  <Text type="secondary">已收金额：</Text>
                  <span style={{ color: "var(--adm-success)" }}>
                    ¥{Number(detail.paidAmount || 0).toLocaleString()}
                  </span>
                </div>
                <div>
                  <Text type="secondary">待收金额：</Text>
                  <span style={{ color: "var(--adm-warning)" }}>
                    ¥
                    {Math.max(
                      0,
                      Number(detail.finalAmount || 0) -
                        Number(detail.paidAmount || 0),
                    ).toLocaleString()}
                  </span>
                </div>
                <div>
                  <Text type="secondary">应付定金：</Text>¥
                  {Number(detail.depositAmount || 0).toLocaleString()}
                </div>
                <div>
                  <Text type="secondary">已付定金：</Text>¥
                  {Number(detail.paidDeposit || 0).toLocaleString()}
                </div>
                <div>
                  <Text type="secondary">应付尾款：</Text>¥
                  {Number(detail.balanceAmount || 0).toLocaleString()}
                </div>
                <div>
                  <Text type="secondary">已付尾款：</Text>¥
                  {Number(detail.paidBalance || 0).toLocaleString()}
                </div>
                <div>
                  <Text type="secondary">已退款：</Text>
                  <span style={{ color: "var(--adm-error)" }}>
                    ¥{Number(detail.refundedAmount || 0).toLocaleString()}
                  </span>
                </div>
                <div>
                  <Text type="secondary">实际净收：</Text>
                  <span className="text-brand-gold font-medium">
                    ¥
                    {Math.max(
                      0,
                      Number(detail.paidAmount || 0) -
                        Number(detail.refundedAmount || 0),
                    ).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* 商品快照 */}
            <div>
              <h3 className="font-semibold mb-2">商品成交快照</h3>
              <Table
                rowKey="id"
                dataSource={detail.items || []}
                pagination={false}
                size="small"
                locale={{ emptyText: "无商品" }}
                columns={[
                  {
                    title: "商品",
                    dataIndex: "productNameSnapshot",
                    render: (name: string, r: OrderItem) => (
                      <div className="flex items-center gap-2">
                        {r.productImageSnapshot && (
                          <SecureImage
                            src={r.productImageSnapshot}
                            alt=""
                            className="w-10 h-10 object-cover rounded"
                            tokenKind="staff"
                          />
                        )}
                        <div>
                          <p className="text-sm">{name}</p>
                          <p className="text-xs text-brand-muted">
                            {r.productCodeSnapshot} · {r.skuSnapshot}
                          </p>
                        </div>
                      </div>
                    ),
                  },
                  { title: "数量", dataIndex: "quantity", width: 60 },
                  {
                    title: "单价",
                    dataIndex: "unitPrice",
                    width: 100,
                    render: (v: number) => `¥${Number(v).toLocaleString()}`,
                  },
                  {
                    title: "小计",
                    dataIndex: "subtotal",
                    width: 100,
                    render: (v: number) => (
                      <span className="text-brand-gold">
                        ¥{Number(v).toLocaleString()}
                      </span>
                    ),
                  },
                ]}
              />
            </div>

            {/* 收款信息 */}
            <div>
              <h3 className="font-semibold mb-2">收款信息</h3>
              {detail.payments && detail.payments.length > 0 ? (
                <div className="space-y-2">
                  {detail.payments.map((p) => (
                    <div
                      key={p.id}
                      className="border border-brand-line p-3 text-sm"
                    >
                      <div className="flex justify-between mb-1">
                        <span>
                          <Text type="secondary">付款单号：</Text>
                          <code className="text-xs text-brand-gold">
                            {p.paymentNo}
                          </code>
                        </span>
                        <Tag color={PAYMENT_STATUS_META[p.status as Payment["status"]]?.color}>
                          {paymentStatusLabel(p.status)}
                        </Tag>
                      </div>
                      <div className="flex justify-between">
                        <Text type="secondary">金额：</Text>
                        <span className="text-brand-gold">
                          ¥{Number(p.amount).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <Text type="secondary">方式：</Text>
                        {p.method}
                      </div>
                      {p.proofUrl && (
                        <div className="mt-1">
                          <SecureImage
                            src={`/payments/${p.id}/proof`}
                            alt="付款凭证"
                            className="max-h-32 rounded border border-brand-line"
                            tokenKind="staff"
                          />
                        </div>
                      )}
                      {p.reviewedAt && (
                        <div className="flex justify-between">
                          <Text type="secondary">审核：</Text>
                          {p.reviewer?.realName ||
                            p.reviewer?.username ||
                            "—"}{" "}
                          · {dayjs(p.reviewedAt).format("YYYY-MM-DD HH:mm")}
                        </div>
                      )}
                      {p.reviewNote && (
                        <div className="text-xs text-brand-muted">
                          备注：{p.reviewNote}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-brand-muted text-sm">暂无收款记录</p>
              )}
            </div>

            {/* 库存预占 */}
            <div>
              <h3 className="font-semibold mb-2">库存预占 / 实扣</h3>
              {detail.reservations && detail.reservations.length > 0 ? (
                <div className="space-y-1 text-sm">
                  {detail.reservations.map((r) => (
                    <div
                      key={r.id}
                      className="flex justify-between border-b border-brand-line pb-1"
                    >
                      <span>
                        SKU #{r.skuId} × {r.quantity}
                      </span>
                      <span className="text-xs">
                        {r.consumedAt ? (
                          <Tag color="green">已扣减</Tag>
                        ) : r.releasedAt ? (
                          <Tag color="orange">已释放</Tag>
                        ) : (
                          <Tag color="blue">
                            预占中（{dayjs(r.expiresAt).format("MM-DD HH:mm")}{" "}
                            到期）
                          </Tag>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-brand-muted text-sm">无库存预占记录</p>
              )}
            </div>

            {/* 履约 */}
            <div>
              <h3 className="font-semibold mb-2">履约信息</h3>
              {detail.logisticsCompany ||
              detail.logisticsNo ||
              (detail.fulfillments && detail.fulfillments.length > 0) ? (
                <div className="text-sm space-y-1">
                  <div>
                    <Text type="secondary">承运商：</Text>
                    {detail.logisticsCompany ||
                      detail.fulfillments?.[0]?.carrier ||
                      "—"}
                  </div>
                  <div>
                    <Text type="secondary">运单号：</Text>
                    {detail.logisticsNo ||
                      detail.fulfillments?.[0]?.trackingNo ||
                      "—"}
                  </div>
                  {detail.fulfillments?.map((f) => (
                    <div key={f.id} className="text-xs text-brand-muted">
                      履约单 {f.fulfillmentNo} · {fulfillmentStatusLabel(f.status)}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-brand-muted text-sm">暂无履约信息</p>
              )}
            </div>

            {/* 操作权限与订单状态分别判断；服务端 @Roles 仍是最终边界。 */}
            {(canEditDetailAmount ||
              canEditDetailAddress ||
              capabilities.canEditNote ||
              capabilities.canEditConsultant ||
              (capabilities.canAdvanceCustomStage && detail.orderType === "CUSTOM") ||
              canReceiveDetail ||
              requiresFulfillmentCenter) && (
              <div>
                <h3 className="font-semibold mb-2">订单操作</h3>
                <Space wrap>
                  {canEditDetailAmount && (
                    <Button size="small" onClick={() => openOp("amount")}>
                      修改金额
                    </Button>
                  )}
                  {canEditDetailAddress && (
                    <Button size="small" onClick={() => openOp("address")}>
                      修改地址
                    </Button>
                  )}
                  {capabilities.canEditNote && (
                    <Button size="small" onClick={() => openOp("note")}>
                      修改备注
                    </Button>
                  )}
                  {capabilities.canEditConsultant && (
                    <Button size="small" onClick={() => openOp("consultant")}>
                      修改顾问
                    </Button>
                  )}
                  {capabilities.canAdvanceCustomStage && detail.orderType === "CUSTOM" && (
                    <Button size="small" onClick={() => openOp("custom-stage")}>
                      推进定制阶段
                    </Button>
                  )}
                  {canReceiveDetail && (
                    <Button size="small" type="primary" onClick={handleReceive}>
                      确认签收
                    </Button>
                  )}
                  {requiresFulfillmentCenter && (
                    <Button
                      size="small"
                      onClick={() => navigate("/admin/trade/fulfillment")}
                    >
                      前往履约中心逐包处理
                    </Button>
                  )}
                </Space>
              </div>
            )}

            {/* 交易事件时间线 */}
            <div>
              <h3 className="font-semibold mb-2">交易事件时间线</h3>
              {detail.tradeEvents && detail.tradeEvents.length > 0 ? (
                <Timeline
                  items={detail.tradeEvents.map((ev) => ({
                    color:
                      ev.eventType.includes("REJECTED") ||
                      ev.eventType.includes("CANCELLED") ||
                      ev.eventType.includes("RELEASED") ||
                      ev.eventType.includes("ABNORMAL")
                        ? "red"
                        : ev.eventType.includes("COMPLETED") ||
                            ev.eventType.includes("APPROVED")
                          ? "green"
                          : "blue",
                    children: (
                      <div className="text-sm">
                        <div className="flex justify-between">
                          <span className="font-medium">
                            {EVENT_LABEL[ev.eventType] || ev.eventType}
                          </span>
                          <span className="text-xs text-brand-muted">
                            {dayjs(ev.createdAt).format("YYYY-MM-DD HH:mm:ss")}
                          </span>
                        </div>
                        {ev.fromStatus && ev.toStatus && (
                          <div className="text-xs text-brand-muted">
                            {ev.fromStatus} → {ev.toStatus}
                          </div>
                        )}
                        <div className="text-xs text-brand-muted">
                          操作人：
                          {OPERATOR_LABEL[ev.operatorType] || ev.operatorType}
                          {ev.operatorName ? `（${ev.operatorName}）` : ""}
                        </div>
                        {ev.reason && (
                          <div className="text-xs">原因：{ev.reason}</div>
                        )}
                      </div>
                    ),
                  }))}
                />
              ) : (
                <p className="text-brand-muted text-sm">暂无交易事件</p>
              )}
            </div>
          </div>
        ) : (
          <AdminEmptyState subject="订单详情" />
        )}
      </Drawer>

      {/* 发货弹窗 */}
      <Modal
        title="登记发货物流"
        open={!!shippingOrder}
        onCancel={() => setShippingOrder(null)}
        footer={null}
        destroyOnHidden
      >
        {shippingOrder && (
          <Form
            layout="vertical"
            onFinish={(values) => handleShip(shippingOrder.id, values)}
          >
            <div className="mb-3 text-sm text-brand-muted">
              订单：{shippingOrder.orderNo} · ¥
              {Number(shippingOrder.finalAmount).toLocaleString()}
            </div>
            <Form.Item
              name="logisticsCompany"
              label="物流公司"
              rules={[{ required: true, message: "请填写物流公司" }]}
            >
              <Select
                placeholder="选择承运商"
                showSearch
                options={[
                  { value: "顺丰速运", label: "顺丰速运" },
                  { value: "京东物流", label: "京东物流" },
                  { value: "德邦快递", label: "德邦快递" },
                  { value: "EMS", label: "EMS" },
                  { value: "其他", label: "其他" },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="logisticsNo"
              label="物流单号"
              rules={[
                { required: true, message: "请填写物流单号" },
                {
                  pattern: /^[A-Za-z0-9][A-Za-z0-9-]{4,29}$/,
                  message: "物流单号应为 5-30 位字母或数字（可含连字符）",
                },
              ]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="internalNote" label="内部备注">
              <Input.TextArea rows={3} />
            </Form.Item>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setShippingOrder(null)}>{ADMIN_COPY.actions.cancel}</Button>
              <Button type="primary" htmlType="submit" loading={shipping}>
                确认发货
              </Button>
            </div>
          </Form>
        )}
      </Modal>

      {/* 订单操作弹窗（金额/地址/备注/顾问/定制阶段） */}
      <Modal
        title={
          opModal.type === "amount"
            ? "修改金额"
            : opModal.type === "address"
              ? "修改地址"
              : opModal.type === "note"
                ? "修改备注"
                : opModal.type === "consultant"
                  ? "修改顾问"
                  : "推进定制阶段"
        }
        open={opModal.open}
        onCancel={() => setOpModal({ type: null, open: false })}
        footer={null}
        destroyOnHidden
      >
        <Form layout="vertical" onFinish={submitOp}>
          {opModal.type === "amount" && (
            <>
              <Form.Item name="discountAmount" label="优惠金额">
                <InputNumber className="w-full" min={0} />
              </Form.Item>
              <Form.Item name="adjustmentAmount" label="订单调整">
                <InputNumber className="w-full" />
              </Form.Item>
              <Form.Item name="finalAmount" label="应收金额">
                <InputNumber className="w-full" min={0} />
              </Form.Item>
              <Form.Item
                name="reason"
                label="调整原因"
                rules={[{ required: true, whitespace: true, message: "请填写调整原因" }]}
              >
                <Input.TextArea rows={2} />
              </Form.Item>
            </>
          )}
          {opModal.type === "address" && (
            <Form.Item
              name="address"
              label="收货地址"
              rules={[{ required: true, message: "请填写收货地址" }]}
            >
              <Input.TextArea rows={3} />
            </Form.Item>
          )}
          {opModal.type === "note" && (
            <Form.Item name="internalNote" label="内部备注">
              <Input.TextArea rows={3} />
            </Form.Item>
          )}
          {opModal.type === "consultant" && (
            <Form.Item name="salesConsultantId" label="销售顾问">
              <Select
                allowClear
                placeholder="选择销售顾问"
                options={consultants.map((u) => ({
                  value: u.id,
                  label: u.realName || u.username,
                }))}
              />
            </Form.Item>
          )}
          {opModal.type === "custom-stage" && (
            <Form.Item
              name="stage"
              label="定制阶段"
              rules={[{ required: true, message: "请选择定制阶段" }]}
            >
              <Select
                options={Object.entries(CUSTOM_STAGE_LABEL).map(([k, v]) => ({
                  value: k,
                  label: v,
                }))}
              />
            </Form.Item>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpModal({ type: null, open: false })}>
              {ADMIN_COPY.actions.cancel}
            </Button>
            <Button type="primary" htmlType="submit">
              {ADMIN_COPY.actions.confirm}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* 人工建单弹窗 */}
      <Modal
        title="人工建单"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        destroyOnHidden
        width={680}
      >
        <Form layout="vertical" form={createForm} onFinish={submitCreate}>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="customerName"
              label="客户姓名"
              rules={[{ required: true, message: "请填写客户姓名" }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="customerPhone"
              label="手机号"
              rules={[
                {
                  required: true,
                  pattern: /^1\d{10}$/,
                  message: "请填写有效手机号",
                },
              ]}
            >
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="customerEmail" label="邮箱">
            <Input />
          </Form.Item>
          <Form.Item
            name="address"
            label="收货地址"
            rules={[{ required: true, message: "请填写收货地址" }]}
          >
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="paymentMethod"
            label="付款方式"
            initialValue="bank_transfer"
          >
            <Select
              options={[
                { value: "bank_transfer", label: "银行转账" },
                { value: "offline", label: "线下收款" },
                { value: "other", label: "其他" },
              ]}
            />
          </Form.Item>
          <Form.Item label="商品明细" required>
            {itemRows.map((row) => (
              <Space
                key={row.key}
                style={{ display: "flex", marginBottom: 8 }}
                align="baseline"
              >
                <Select
                  showSearch
                  placeholder="搜索并选择商品"
                  style={{ width: 260 }}
                  onSearch={searchProducts}
                  filterOption={false}
                  options={productOptions}
                  value={row.productId}
                  onChange={(pid: number) => {
                    setItemRows((rs) =>
                      rs.map((r) =>
                        r.key === row.key
                          ? { ...r, productId: pid, skuId: undefined }
                          : r,
                      ),
                    );
                    if (pid) void loadSkus(pid);
                  }}
                />
                <Select
                  placeholder="SKU"
                  style={{ width: 170 }}
                  disabled={!row.productId}
                  options={skuOptionsMap[row.productId || 0] || []}
                  value={row.skuId}
                  onChange={(sid: number) =>
                    setItemRows((rs) =>
                      rs.map((r) =>
                        r.key === row.key ? { ...r, skuId: sid } : r,
                      ),
                    )
                  }
                />
                <InputNumber
                  min={1}
                  max={99}
                  value={row.quantity}
                  style={{ width: 80 }}
                  onChange={(q) =>
                    setItemRows((rs) =>
                      rs.map((r) =>
                        r.key === row.key ? { ...r, quantity: q || 1 } : r,
                      ),
                    )
                  }
                />
                <Button
                  danger
                  size="small"
                  disabled={itemRows.length <= 1}
                  onClick={() =>
                    setItemRows((rs) => rs.filter((r) => r.key !== row.key))
                  }
                >
                  删除
                </Button>
              </Space>
            ))}
            <Button
              type="dashed"
              onClick={() =>
                setItemRows((rs) => [...rs, { key: Date.now(), quantity: 1 }])
              }
            >
              + 添加商品
            </Button>
          </Form.Item>
          {/* 营销生效：优惠券由服务端按合计金额试算（可用性/门槛以后端为准） */}
          {createTotalCents > 0 && (
            <>
              <div className="text-right text-sm text-brand-muted">
                商品合计：¥{(createTotalCents / 100).toLocaleString()}
              </div>
              <Form.Item
                name="couponId"
                label="优惠券（可选）"
                extra="折扣金额以创建订单时服务端核销为准"
              >
                <Select
                  allowClear
                  placeholder={
                    couponOptions.length
                      ? "选择优惠券抵扣"
                      : "当前金额暂无可用优惠券"
                  }
                  options={couponOptions}
                  disabled={couponOptions.length === 0}
                />
              </Form.Item>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setCreateOpen(false)}>{ADMIN_COPY.actions.cancel}</Button>
            <Button type="primary" htmlType="submit" loading={createSaving}>
              创建订单
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
