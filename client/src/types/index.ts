// ===== User =====
export interface User {
  id: number;
  username: string;
  realName?: string;
  phone?: string;
  email?: string;
  avatar?: string;
  role:
    | "SUPER_ADMIN"
    | "ADMIN"
    | "EDITOR"
    | "CUSTOMER_SERVICE"
    | "WAREHOUSE"
    | "SALES_CONSULTANT"
    | "FINANCE";
  status: "ACTIVE" | "DISABLED";
  lastLoginAt?: string;
  createdAt: string;
}

// ===== Auth =====
export interface LoginParams {
  username: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  user: User;
}

// ===== Category =====
export interface Category {
  id: number;
  name: string;
  slug: string;
  level: number;
  parentId?: number;
  icon?: string;
  coverImage?: string;
  sortOrder: number;
  isActive?: boolean;
  _count?: { children: number; products: number };
  children?: Category[];
}

/** 新增/编辑分类时的输入字段。 */
export interface CategoryInput {
  name?: string;
  slug?: string;
  parentId?: number | null;
  sortOrder?: number;
  isActive?: boolean;
  icon?: string;
  coverImage?: string;
  level?: number;
}

/** 批量排序的单条项（仅同级 sortOrder 调整）。 */
export interface CategorySortItem {
  id: number;
  sortOrder: number;
}

// ===== Product =====
export interface Product {
  id: number;
  code: string;
  name: string;
  description?: string;
  shortDescription?: string;
  categoryId: number;
  category?: Category;
  materialType: MaterialType;
  goldWeight?: number;
  craftFee?: number;
  price?: number;
  /** @deprecated 价格区间已废弃,展示价统一用 price(=活跃 SKU 最低价) */
  priceMin?: number;
  priceMax?: number;
  weight?: number;
  size?: string;
  salesMode?: SalesMode;
  inventoryPolicy?: InventoryPolicy;
  /** 服务端按实时库存聚合得出的购买可用性，不暴露具体库存数量。 */
  isAvailableForPurchase?: boolean;
  sortOrder?: number;
  gemInfo?: GemInfo;
  craftTechnique?: string[];
  detailContent?: ProductDetailBlock[];
  status: ProductStatus;
  visibility?: "PUBLIC" | "MEMBER" | "PARTNER" | "INTERNAL";
  purchaseRegion?: "MAINLAND" | "CROSS_BORDER";
  publishMode?: "IMMEDIATE" | "SCHEDULED" | "WAREHOUSE";
  scheduledPublishAt?: string | null;
  scheduledPublishError?: string | null;
  fulfillmentType?: "IN_STOCK" | "PREORDER" | "CUSTOM";
  dispatchTime?: "SAME_DAY" | "WITHIN_24_HOURS" | "WITHIN_48_HOURS" | "OVER_48_HOURS" | "CUSTOM";
  shippingTemplateId?: number | null;
  deliveryMethods?: string[];
  requiresInsuredShipping?: boolean;
  requiresSignature?: boolean;
  includesCertificate?: boolean;
  packageType?: string;
  customLeadTime?: string;
  isHot: boolean;
  isNew: boolean;
  isRecommended: boolean;
  isLimited: boolean;
  isCustom: boolean;
  multiDiscount?: boolean;
  viewCount: number;
  salesCount: number;
  images: ProductImage[];
  primaryImage?: ProductImage | null;
  listingImage?: ProductImage | null;
  primaryImageId?: number | null;
  listingImageId?: number | null;
  skus?: ProductSKU[];
  certificates?: Certificate[];
  tags?: ProductTag[];
  createdAt: string;
}

export type MaterialType =
  | "GOLD_999"
  | "GOLD_9999"
  | "AU750"
  | "PT950"
  | "S925"
  | "DIAMOND"
  | "JADE"
  | "PEARL"
  | "COLOR_GEM"
  | "OTHER";
export type ProductStatus = "DRAFT" | "PUBLISHED" | "OFFLINE" | "ARCHIVED";
export type SalesMode =
  | "DISPLAY_ONLY"
  | "SELECTION"
  | "APPOINTMENT"
  | "DIRECT_PURCHASE"
  | "CUSTOM_INQUIRY";
export type InventoryPolicy = "STANDARD" | "SINGLE_UNIT";

export interface GemInfo {
  type?: string;
  carat?: number;
  clarity?: string;
  color?: string;
  cut?: string;
  quantity?: number;
}

export interface ProductDetailBlock {
  type: "TEXT" | "IMAGE";
  text?: string;
  imageId?: number;
  alt?: string;
}

export interface ShippingTemplate {
  id: number;
  name: string;
  carrier?: string;
  feeMode: "FREE" | "FIXED" | "CONDITIONAL";
  baseFee: number;
  remoteSurcharge: number;
  freeShippingThreshold?: number | null;
  excludedRegions?: string[];
  insured: boolean;
  signatureRequired: boolean;
  isDefault: boolean;
  isActive: boolean;
}

export interface ProductImage {
  id: number;
  productId: number;
  url: string;
  storageKey?: string | null;
  type: "FRONT" | "SIDE" | "TOP" | "DETAIL" | "WEARING";
  sortOrder: number;
  isVideo: boolean;
  sourceImageId?: number | null;
  cropData?: { x: number; y: number; width: number; height: number } | null;
  width?: number | null;
  height?: number | null;
  mimeType?: string | null;
  fileSize?: number | null;
}

export interface ProductSKU {
  id: number;
  productId: number;
  skuCode: string;
  material: MaterialType;
  size?: string;
  goldWeight?: number;
  price: number;
  /** 仅旧 Mock 商品数据可能携带；真实库存以 Inventory 接口为准。 */
  stock?: number;
  safetyStock?: number;
  isActive: boolean;
}

export interface Certificate {
  id: number;
  productId: number;
  certType: "NATIONAL" | "PROVINCIAL" | "GIA" | "OTHER";
  certNumber: string;
  certImage?: string;
  expireDate?: string;
}

export interface ProductTag {
  id: number;
  productId: number;
  tagId?: number;
  tagName: string;
}

// ===== Order =====
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
  // 交易中心扩展字段
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
  // 详情页关联
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
  // 成交快照（商品后续修改不影响历史订单）
  productNameSnapshot?: string;
  productImageSnapshot?: string | null;
  productCodeSnapshot?: string;
  skuSnapshot?: string;
  actualWeight?: number;
  certNumber?: string;
}

// ===== 报价管理（珠宝行业核心能力）=====
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
  productImage?: string | null;
  spec?: string;
  quantity: number;
  unitPrice: number;
  quotedPrice: number;
  subtotal: number;
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
  customer?: { id: number; name?: string; phone: string } | null;
  salesConsultant?: { id: number; realName?: string; username: string } | null;
  convertedOrder?: Order | null;
}

// ===== Cart =====
export interface CartItem {
  id: number;
  productId: number;
  skuId: number;
  quantity: number;
  product?: Product;
}

// ===== Pagination =====
export interface PaginatedResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
  timestamp: string;
}

// ===== Gold Price =====
export interface GoldPrice {
  id: number;
  price: number;
  source: "AUTO" | "MANUAL";
  recordDate: string;
  createdAt: string;
}

// ===== Inventory =====
export interface Inventory {
  id: number;
  skuId: number;
  warehouseId: number;
  quantity: number;
  safetyStock: number;
  warehouse?: Warehouse;
}

export interface Warehouse {
  id: number;
  name: string;
  type: "SHOWROOM" | "FACTORY" | "STORE";
  address?: string;
}

// ===== CartItemData (统一购物车数据) =====
export interface CartItemData {
  id: number;
  productId: number;
  skuId: number;
  skuCode?: string;
  quantity: number;
  unitPrice?: number;
  product?: Product;
  productName?: string;
  productImage?: string;
  material?: string;
  size?: string;
  goldWeight?: number;
}

// ===== Inquiry (咨询/留言) =====
export interface Inquiry {
  id: number;
  productId?: number;
  productName?: string;
  customerName: string;
  customerPhone: string;
  content: string;
  status: "PENDING" | "REPLIED" | "CLOSED";
  assignedTo?: number;
  reply?: string;
  createdAt: string;
}

// ===== Product Filter Params =====
export interface ProductFilterParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  categoryId?: number;
  materialType?: string;
  status?: string;
  isHot?: string;
  isNew?: string;
  sortBy?: string;
  sortOrder?: string;
  priceMin?: number;
  priceMax?: number;
}

// ===== Order Filter Params =====
export interface OrderFilterParams {
  page?: number;
  pageSize?: number;
  status?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
}

// ===== 交易域扩展类型 =====

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
