import type { Product } from "./catalog";

export interface Order {
  id: number;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerId?: number | null;
  address: string;
  totalAmount: number;
  discountAmount: number;
  finalAmount: number;
  status: OrderStatus;
  paymentMethod?: string;
  logisticsCompany?: string;
  logisticsNo?: string;
  internalNote?: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt?: string;
  reservedAt?: string;
  paymentConfirmedAt?: string;
  shippedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  orderType?: OrderType;
  salesConsultantId?: number | null;
  source?: string | null;
  adjustmentAmount?: number;
  depositAmount?: number;
  paidDeposit?: number;
  balanceAmount?: number;
  paidBalance?: number;
  paidAmount?: number;
  refundedAmount?: number;
  customStage?: CustomStage | null;
  deliveryStatus?: DeliveryStatus;
  receivedAt?: string | null;
  payments?: Payment[];
  refunds?: Refund[];
  tradeEvents?: TradeEvent[];
  fulfillments?: Fulfillment[];
  afterSalesCases?: AfterSalesCase[];
  customer?: {
    id: number;
    name?: string;
    phone: string;
    email?: string;
  } | null;
  salesConsultant?: { id: number; realName?: string; username: string } | null;
  quotationSource?: Quotation | null;
  /** 报价成交订单的渠道快照；历史零售订单可能为空。 */
  quoteChannel?: QuoteChannel | null;
  quotedLines?: QuotedOrderLine[];
  resourceReservations?: OrderResourceReservation[];
  quotationVersion?: {
    id: number;
    quotationId: number;
    version: number;
    status: string;
    snapshotSchemaVersion?: number | null;
    contentHash?: string | null;
  } | null;
  quotationConversion?: {
    id: number;
    quotationVersionId: number;
    customerId: number;
    createdAt: string;
  } | null;
}

export type OrderStatus =
  "PENDING_PAYMENT" | "PENDING_SHIP" | "SHIPPED" | "COMPLETED" | "CANCELLED";

/** 订单类型：现货 / 定制 / 预订 / 线下（不同类型走不同流程） */
export type OrderType = "SPOT" | "CUSTOM" | "RESERVATION" | "OFFLINE";

/** 发货维度独立状态（与 OrderStatus 主流程解耦） */
export type DeliveryStatus =
  "NONE" | "PENDING_SHIP" | "SHIPPED" | "RECEIVED" | "ABNORMAL";

/** 定制订单专属阶段（仅 orderType=CUSTOM 时使用） */
export type CustomStage =
  | "NEED_CONFIRM"
  | "QUOTE_CONFIRM"
  | "PENDING_DEPOSIT"
  | "DEPOSIT_PAID"
  | "DESIGN_CONFIRM"
  | "IN_PRODUCTION"
  | "QC_PASSED"
  | "PENDING_BALANCE"
  | "BALANCE_PAID"
  | "PENDING_DELIVERY"
  | "DELIVERED"
  | "COMPLETED";

/** 支付状态（前端从 paidAmount/finalAmount 派生） */
export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export interface OrderItem {
  id: number;
  productId: number;
  skuId: number;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  product?: Product;
  sku?: { skuCode: string; material: string; size?: string };
  productNameSnapshot?: string;
  productImageSnapshot?: string | null;
  productCodeSnapshot?: string;
  skuSnapshot?: string;
  actualWeight?: number;
  certNumber?: string;
}

/** 非标准 SKU 报价成交行。客户响应不包含内部目标金重或重量推导值。 */
export interface QuotedOrderLine {
  id: number;
  productId?: number | null;
  skuId?: number | null;
  description: string;
  quantity: number | string;
  unitAmount: number | string;
  lineAmount: number | string;
  pricingSnapshot?: Record<string, unknown> | null;
}

export interface OrderResourceReservation {
  id: number;
  quotationRequirementId: number;
  resourceBucketId: number;
  quantity: number | string;
  status: "RESERVED" | "CONSUMED" | "RELEASED";
  reservedAt: string;
  consumedAt?: string | null;
  releasedAt?: string | null;
  resourceBucket?: {
    id: number;
    channel: "CUSTOM" | "PARTNER_WAX";
    kind: "CAPACITY" | "MATERIAL";
    code: string;
    bucketKey: string;
    displayName: string;
    unit: string;
  };
}

export type QuoteChannel = "RETAIL" | "CUSTOM" | "PARTNER_WAX";

export type QuoteVersionStatus =
  | "DRAFT"
  | "ISSUED"
  | "ACCEPTED"
  | "SUPERSEDED"
  | "EXPIRED"
  | "CANCELLED";

export type WaxType = "RED" | "PURPLE";

export type QuotationStatus =
  | "DRAFT"
  | "PENDING_CONFIRM"
  | "CONFIRMED"
  | "EXPIRED"
  | "CANCELLED"
  | "CONVERTED";

export interface QuotationItem {
  id: number;
  quotationId: number;
  productId?: number | null;
  skuId?: number | null;
  productName: string;
  /** 不绑定商品的定制/蜡模版本行使用 description。 */
  description?: string;
  productImage?: string | null;
  spec?: string;
  quantity: number;
  unitPrice: number;
  quotedPrice: number;
  subtotal: number;
  waxType?: WaxType | null;
  confirmedWaxWeight?: number | string | null;
  pricingSnapshot?: {
    source?: "SKU_FIXED_PRICE" | "CUSTOM_QUOTE" | "CUSTOMER_AGREEMENT" | "SYSTEM_DEFAULT_D19_V1";
    rate?: number | string | null;
    rateSourceLabel?: string | null;
    confirmedWaxWeight?: number | string | null;
    [key: string]: unknown;
  } | null;
}

export interface QuotationVersionFeeLine {
  id?: number;
  code: string;
  displayText: string;
  calculationMethod: "FIXED" | "PER_GRAM" | "PER_ORDER";
  rate: number | string;
  basisQuantity?: number | string | null;
  amount: number | string;
  currency: string;
}

export interface QuotationVersionResourceRequirement {
  id?: number;
  kind?: "CAPACITY" | "MATERIAL";
  code?: string;
  displayName?: string | null;
  requiredQuantity: number | string;
  unit?: string;
  readiness?: "READY" | "INSUFFICIENT" | "UNAVAILABLE";
  resourceBucket?: {
    kind: "CAPACITY" | "MATERIAL";
    code?: string;
    displayName: string;
    unit: string;
  };
}

/** 客户可见的协作设计文件版本摘要；刻意不包含内部目标金重。 */
export interface CooperationDesignFileVersionSummary {
  id?: number;
  fileId?: number;
  designFileId?: number;
  version: number;
  fileName?: string | null;
  originalName?: string | null;
  byteSize?: number;
  checksumSha256?: string;
  downloadUrl?: string;
  status: "DRAFT" | "SUBMITTED" | "CONFIRMED" | "SUPERSEDED" | "REJECTED";
  waxType?: WaxType | null;
  confirmedWaxWeight?: number | string | null;
  redWaxWeight?: number | string | null;
  purpleWaxWeight?: number | string | null;
  confirmedAt?: string | null;
  confirmedByCustomerId?: number | null;
}

export interface QuotationVersion {
  id: number;
  version: number;
  status: QuoteVersionStatus;
  currency: string;
  subtotal: number | string;
  discountAmount: number | string;
  feeAmount: number | string;
  totalAmount: number | string;
  validUntil?: string | null;
  issuedAt?: string | null;
  acceptedAt?: string | null;
  snapshotSchemaVersion?: number;
  items?: Array<{
    id: number;
    productId?: number | null;
    skuId?: number | null;
    waxType?: WaxType | null;
    description: string;
    quantity: number;
    unitPrice: number | string;
    subtotal: number | string;
    pricingSnapshot?: {
      source?: "SKU_FIXED_PRICE" | "CUSTOM_QUOTE" | "CUSTOMER_AGREEMENT" | "SYSTEM_DEFAULT_D19_V1";
      rate?: number | string | null;
      confirmedWaxWeight?: number | string | null;
      rateSourceLabel?: string | null;
      [key: string]: unknown;
    } | null;
    pricingSource?: string | null;
    rate?: number | string | null;
    confirmedWaxWeight?: number | string | null;
  }>;
  feeLines?: QuotationVersionFeeLine[];
  resourceRequirements?: QuotationVersionResourceRequirement[];
  designFileVersion?: CooperationDesignFileVersionSummary | null;
  pricingSource?: {
    code: "SKU_FIXED_PRICE" | "CUSTOM_QUOTE" | "CUSTOMER_AGREEMENT" | "SYSTEM_DEFAULT_D19_V1";
    label: string;
  } | null;
}

export interface Quotation {
  id: number;
  quoteNo: string;
  customerId?: number | null;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  salesConsultantId?: number | null;
  status: QuotationStatus;
  channel?: QuoteChannel;
  currentVersion?: number;
  totalAmount: number;
  discountAmount: number;
  finalAmount: number;
  depositAmount: number;
  validUntil?: string | null;
  remark?: string;
  convertedOrderId?: number | null;
  convertedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  items?: QuotationItem[];
  versions?: QuotationVersion[];
  currentVersionRecord?: QuotationVersion | null;
  customer?: { id: number; name?: string; phone: string } | null;
  salesConsultant?: { id: number; realName?: string; username: string } | null;
  convertedOrder?: Order | null;
}

export interface OrderFilterParams {
  page?: number;
  pageSize?: number;
  status?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
}

/** 交易事件（不可变时间线） */
export interface TradeEvent {
  id: number;
  orderId: number;
  entityType:
    | "ORDER"
    | "PAYMENT"
    | "REFUND"
    | "FULFILLMENT"
    | "AFTER_SALES"
    | "INVENTORY";
  entityId: number;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  operatorType: "CUSTOMER" | "ADMIN" | "SYSTEM";
  operatorId?: number | null;
  operatorName?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

/** 履约单 */
export interface Fulfillment {
  id: number;
  fulfillmentNo: string;
  orderId: number;
  status: FulfillmentStatus;
  carrier?: string | null;
  trackingNo?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  abnormalReason?: string | null;
  internalNote?: string | null;
  createdBy?: number | null;
  createdAt: string;
  updatedAt: string;
  order?: Order;
  creator?: { id: number; realName?: string; username: string } | null;
}

export type FulfillmentStatus =
  | "PENDING_PICK"
  | "PENDING_CHECK"
  | "PENDING_SHIP"
  | "SHIPPED"
  | "DELIVERED"
  | "ABNORMAL";

/** 退款 */
export interface Refund {
  id: number;
  refundNo: string;
  orderId: number;
  paymentId?: number | null;
  amount: number | string;
  reason?: string | null;
  status: RefundStatus;
  gatewayRefundNo?: string | null;
  processedAt?: string | null;
  requestedBy?: number | null;
  reviewedBy?: number | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  processedBy?: number | null;
  completedAt?: string | null;
  idempotencyKey?: string | null;
  afterSalesCaseId?: number | null;
  createdAt: string;
  order?: Order;
  requester?: { id: number; realName?: string; username: string } | null;
  reviewer?: { id: number; realName?: string; username: string } | null;
  processor?: { id: number; realName?: string; username: string } | null;
}

export type RefundStatus =
  "PENDING" | "APPROVED" | "PROCESSING" | "COMPLETED" | "REJECTED" | "FAILED";

/** 售后工单 */
export interface AfterSalesCase {
  id: number;
  caseNo: string;
  orderId: number;
  orderItemId?: number | null;
  customerId?: number | null;
  type: AfterSalesType;
  status: AfterSalesStatus;
  reason: string;
  evidenceUrls?: string[] | null;
  customerNote?: string | null;
  adminNote?: string | null;
  requestedRefundAmount?: number | string | null;
  approvedRefundAmount?: number | string | null;
  handledBy?: number | null;
  handledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  order?: Order;
  customer?: { id: number; name?: string; phone: string } | null;
  handler?: { id: number; realName?: string; username: string } | null;
}

export type AfterSalesType = "REFUND" | "EXCHANGE" | "REPAIR";

export type AfterSalesStatus =
  | "REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "RETURNING"
  | "QC_PASSED"
  | "QC_FAILED"
  | "COMPLETED"
  | "CANCELLED";

/** 付款记录（含审核人信息） */
export interface Payment {
  id: number;
  paymentNo: string;
  orderId: number;
  amount: number | string;
  method: string;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "PARTIAL_REFUND";
  type: string;
  proofUrl?: string | null;
  reviewedBy?: number | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  paidAt?: string | null;
  createdAt: string;
  order?: Order;
  reviewer?: { id: number; realName?: string; username: string } | null;
}
