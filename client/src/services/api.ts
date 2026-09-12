// 前端 API 层：customer(认证/收藏/找回/SMS/合规)/marketing(含可用券)/reviews/recommendation 等
import { CONTENT_TEMPLATE_PAGE_METADATA } from "@/page-builder/generated/contentTemplates.generated";
import {
  USE_MOCK,
  mockDelay,
  mockProducts,
  mockOrders,
  mockUsers,
  mockGoldPrice,
  mockGoldPriceHistory,
  paginate,
} from "./mockData";
import api, { customerAuthHeaders } from "./httpClient";
import { mockResponse as mockRes, mockRequestError } from "./mockResponse";
import {
  getBrowserPublicContentLocale,
  type PublicContentLocale,
} from "@/i18n/publicLocale";
import type {
  DeliveryStatus,
  CustomStage,
  OrderStatus,
  OrderType,
  PaymentStatus,
  QuotationStatus,
  User,
} from "@/types";

export {
  publicPageDocumentStreamUrl,
  publicProductStreamUrl,
} from "./httpClient";
export {
  categoryApi,
  type CategoryReferenceResult,
} from "./clients/categoryClient";
export {
  attributeApi,
  type AttributeCreateInput,
  type AttributeUpdateInput,
  type AttributeValueInput,
} from "./clients/attributeClient";
export {
  tagApi,
  type TagCreateInput,
  type TagUpdateInput,
} from "./clients/tagClient";
export {
  aiClassifyApi,
  type AiClassifyConfirmationInput,
  type AiClassifyRecordQuery,
  type AiDescriptionInput,
} from "./clients/aiClassifyClient";
export {
  shippingTemplateApi,
  type ShippingFeeMode,
  type ShippingTemplateCreateInput,
  type ShippingTemplateUpdateInput,
} from "./clients/shippingTemplateClient";
export {
  statisticsApi,
  type TrendMetric,
} from "./clients/statisticsClient";
export { settingsApi } from "./clients/settingsClient";
export {
  dynamicTemplateApi,
  type DynamicTemplateDraftResource,
  type DynamicTemplateResource,
  type DynamicTemplateVersionResource,
  type PublishedDynamicTemplateResource,
  type TemplateCatalogItemResource,
  type TemplateCatalogResource,
} from "./clients/dynamicTemplateClient";
export {
  type SystemContentTemplateCurrent,
} from "./clients/systemContentTemplateClient";
export { recommendationApi } from "./clients/recommendationClient";
export {
  customerAdminApi,
  type CustomerAdminListQuery,
} from "./clients/customerAdminClient";
export {
  inquiriesApi,
  type InquiryListQuery,
  type InquiryStatusUpdateInput,
  type InquirySubmitInput,
} from "./clients/inquiriesClient";
export {
  selectionInquiryApi,
  type SelectionInquiryListQuery,
  type SelectionInquiryUpdateInput,
  type SelectionInquirySubmitItem,
  type SelectionInquirySubmitInput,
} from "./clients/selectionInquiryClient";
export {
  reviewApi,
  type ReviewSubmitInput,
  type ReviewListQuery,
  type ReviewAdminListQuery,
  type ReviewModerationInput,
} from "./clients/reviewClient";

export {
  productApi,
  type ProductPublicQuery,
  type ProductAdminQuery,
  type ProductWriteInput,
  type ProductSkuWriteInput,
  type ProductReferenceResult,
} from "./clients/productClient";

export interface StaffRegisterInput {
  username: string;
  password: string;
  realName?: string;
  phone?: string;
}

// ===== Auth API =====
export const authApi = {
  login: async (data: { username: string; password: string }) => {
    if (USE_MOCK) {
      await mockDelay();
      // Mock 是显式本机模式，不模拟真实凭据校验，也不把凭据写入浏览器环境变量。
      if (data.username.trim() && data.password.trim()) {
        return mockRes({ accessToken: "mock-jwt-token", user: mockUsers[0] });
      }
      throw new Error("用户名或密码错误");
    }
    return api.post("/auth/login", data, {
      headers: { "X-Session-Mode": "cookie" },
      suppressGlobalError: true,
    });
  },
  register: (data: StaffRegisterInput) => api.post("/auth/register", data),
  logout: () => api.post("/auth/session/logout", undefined, {
    headers: { "X-Session-Mode": "cookie" },
  }),
  getProfile: async () => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes(mockUsers[0]);
    }
    return api.get("/auth/profile", { suppressGlobalError: true });
  },
};

// ===== Users API =====
export interface UserListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  role?: User["role"];
  status?: User["status"];
}

export interface CreateUserInput {
  username: string;
  password: string;
  realName?: string;
  phone?: string;
  email?: string;
  role?: User["role"];
}

export interface UpdateUserInput {
  realName?: string;
  phone?: string;
  email?: string;
  role?: User["role"];
  status?: User["status"];
  password?: string;
}

export const userApi = {
  getList: async (params: UserListQuery) => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes(
        paginate(mockUsers, params.page || 1, params.pageSize || 20),
      );
    }
    return api.get("/users", { params });
  },
  getById: (id: number) => api.get(`/users/${id}`),
  getAssignable: async () => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes(mockUsers.map((user) => ({
        id: user.id,
        name: user.realName || user.username,
        role: user.role,
      })));
    }
    return api.get("/users/assignable");
  },
  create: async (data: CreateUserInput) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({ id: Date.now(), ...data });
    }
    return api.post("/users", data);
  },
  update: async (id: number, data: UpdateUserInput) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({ id, ...data });
    }
    return api.put(`/users/${id}`, data);
  },
  delete: (id: number) => api.delete(`/users/${id}`),
};

// ===== Orders API =====
export interface OrderListQuery {
  page?: number;
  pageSize?: number;
  status?: "all" | OrderStatus;
  keyword?: string;
  productKeyword?: string;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  customerId?: number;
  orderType?: "all" | OrderType;
  deliveryStatus?: "all" | DeliveryStatus;
  salesConsultantId?: number;
  source?: string;
  paymentStatus?: "all" | PaymentStatus;
}

export interface CreateOrderInput {
  customerId?: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  address: string;
  paymentMethod?: string;
  couponId?: number;
  items: Array<{ skuId: number; quantity: number }>;
}

export interface UpdateOrderStatusInput {
  status: OrderStatus;
  internalNote?: string;
}

export const orderApi = {
  getList: async (params: OrderListQuery) => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes(
        paginate(mockOrders, params.page || 1, params.pageSize || 20),
      );
    }
    return api.get("/orders", { params });
  },
  getById: (id: number) => api.get(`/orders/${id}`),
  /** 后台人工建单（需 admin 角色） */
  create: (data: CreateOrderInput) => api.post("/orders", data),
  getAnomalies: () => api.get("/orders/anomalies"),
  getTradeOverview: () => api.get("/orders/trade-overview"),
  /** 导出订单（与当前筛选一致；仅 ADMIN） */
  exportList: (params: OrderListQuery) => api.get("/orders/export", { params }),
  updateStatus: async (id: number, data: UpdateOrderStatusInput) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({ id, ...data });
    }
    return api.put(`/orders/${id}/status`, data);
  },
  ship: (
    id: number,
    data: {
      logisticsCompany: string;
      logisticsNo: string;
      internalNote?: string;
    },
  ) => api.put(`/orders/${id}/ship`, data),
  // 交易中心：订单管理中心操作（金额/地址/备注/签收/顾问/定制阶段）
  updateAmount: (
    id: number,
    data: {
      discountAmount?: number;
      adjustmentAmount?: number;
      finalAmount?: number;
      depositAmount?: number;
      balanceAmount?: number;
      reason: string;
    },
  ) => api.put(`/orders/${id}/amount`, data),
  updateAddress: (id: number, address: string) =>
    api.put(`/orders/${id}/address`, { address }),
  updateNote: (id: number, internalNote?: string) =>
    api.put(`/orders/${id}/note`, { internalNote }),
  confirmReceive: (id: number) => api.put(`/orders/${id}/receive`),
  updateConsultant: (id: number, salesConsultantId: number | null) =>
    api.put(`/orders/${id}/consultant`, { salesConsultantId }),
  advanceCustomStage: (id: number, stage: CustomStage) =>
    api.put(`/orders/${id}/custom-stage`, { stage }),
};

// ===== 报价管理 API =====
export interface QuotationListQuery {
  page?: number;
  pageSize?: number;
  status?: "all" | QuotationStatus;
  keyword?: string;
  salesConsultantId?: number;
}

export interface QuotationItemInput {
  skuId?: number;
  productId?: number;
  productName: string;
  productImage?: string;
  spec?: string;
  quantity: number;
  unitPrice: number;
  quotedPrice: number;
}

export interface CreateQuotationInput {
  customerId?: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  salesConsultantId?: number;
  remark?: string;
  depositAmount?: number;
  validUntil?: string;
  items: QuotationItemInput[];
}

export type UpdateQuotationInput = Partial<
  Omit<CreateQuotationInput, "customerId">
>;

export const quotationApi = {
  getList: (params: QuotationListQuery) => api.get("/quotations", { params }),
  getById: (id: number) => api.get(`/quotations/${id}`),
  create: (data: CreateQuotationInput) => api.post("/quotations", data),
  update: (id: number, data: UpdateQuotationInput) =>
    api.put(`/quotations/${id}`, data),
  submit: (id: number) => api.put(`/quotations/${id}/submit`),
  confirm: (id: number) => api.put(`/quotations/${id}/confirm`),
  cancel: (id: number) => api.put(`/quotations/${id}/cancel`),
  convertToOrder: (id: number, data: { address: string; orderType?: string }) =>
    api.post(`/quotations/${id}/convert`, data),
  remove: (id: number) => api.delete(`/quotations/${id}`),
};

const CART_SESSION_STORAGE_KEY = "haichuan.cart-session-id";

// 与服务端购物车会话校验同口径：只接受标准 UUID，杜绝自报可猜测标识读到他人购物车。
const CART_SESSION_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getCartSessionId() {
  let sessionId = localStorage.getItem(CART_SESSION_STORAGE_KEY);
  if (!sessionId || !CART_SESSION_UUID_PATTERN.test(sessionId)) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(CART_SESSION_STORAGE_KEY, sessionId);
  }
  return sessionId;
}

const cartHeaders = () => ({
  ...customerAuthHeaders(),
  "x-session-id": getCartSessionId(),
});

export const cartApi = {
  get: () => api.get("/cart", { headers: cartHeaders() }),
  add: (data: { productId: number; skuId: number; quantity: number }) =>
    api.post("/cart", data, { headers: cartHeaders() }),
  updateQuantity: (id: number, quantity: number) =>
    api.put(`/cart/${id}`, { quantity }, { headers: cartHeaders() }),
  remove: (id: number) => api.delete(`/cart/${id}`, { headers: cartHeaders() }),
  clear: () => api.delete("/cart", { headers: cartHeaders() }),
};

export type CustomerCheckoutRequest = {
  address: string;
  customerEmail?: string;
  couponId?: number;
  items: Array<{ skuId: number; quantity: number }>;
};

export type CustomerAddressInput = {
  recipientName: string;
  recipientPhone: string;
  province: string;
  city: string;
  district: string;
  detailAddress: string;
  postalCode?: string;
  isDefault?: boolean;
};

export type LeadReplyRequest = {
  reply: string;
  expectedUpdatedAt: string;
};

export type LeadReplyResult = {
  leadId: number;
  status: string;
  updatedAt: string;
  reply: {
    id: number;
    content: string;
    createdAt: string;
  };
};

export const leadApi = {
  reply: (
    type: "inquiry" | "selection",
    leadId: number,
    data: LeadReplyRequest,
    idempotencyKey: string,
  ) => api.post(`/leads/${type}/${leadId}/reply`, data, {
    headers: { "Idempotency-Key": idempotencyKey },
    suppressGlobalError: true,
  }),
};

export const customerApi = {
  register: (data: {
    phone: string;
    password: string;
    name: string;
    email?: string;
    smsCode?: string;
  }) => api.post("/customers/register", data, {
    headers: { ...customerAuthHeaders(), "X-Session-Mode": "cookie" },
  }),
  login: (data: {
    phone: string;
    password: string;
    captchaId?: string;
    captchaCode?: string;
    smsCode?: string;
  }) =>
    api.post("/customers/login", data, {
      headers: { ...customerAuthHeaders(), "X-Session-Mode": "cookie" },
    }),
  logout: () => api.post("/customers/session/logout", undefined, {
    headers: { ...customerAuthHeaders(), "X-Session-Mode": "cookie" },
  }),
  wechatConfig: (origin?: string) =>
    api.get("/customers/wechat/config", { params: origin ? { origin } : {} }),
  wechatBind: (data: {
    bindToken: string;
    phone: string;
    password: string;
    name?: string;
    smsCode?: string;
  }) => api.post("/customers/wechat/bind", data, {
    headers: { ...customerAuthHeaders(), "X-Session-Mode": "cookie" },
  }),
  smsRequirements: () => api.get("/customers/sms-requirements"),
  // 结算可用券试算（只读；折扣与资格在订单事务内最终校验）
  usableCoupons: (amountCents: number) =>
    api.get("/customers/me/coupons/usable", { params: { amountCents } }),
  requestSmsCode: (data: { phone: string }) =>
    api.post("/customers/sms-code", data),
  // 登录分级挑战：查询等级 / 图形验证码 / 登录短信验证码
  loginChallenge: (phone: string) =>
    api.get("/customers/login/challenge", { params: { phone } }),
  loginCaptcha: () => api.get("/customers/login/captcha"),
  requestLoginSmsCode: (data: { phone: string }) =>
    api.post("/customers/login/sms-code", data),
  forgotPassword: (data: { email: string }) =>
    api.post("/customers/forgot-password", data),
  resetPassword: (data: { token: string; password: string }) =>
    api.post("/customers/reset-password", data),
  checkout: (data: CustomerCheckoutRequest) =>
    api.post("/customers/checkout", data, {
      headers: customerAuthHeaders(),
    }),
  getPaymentChannels: () =>
    api.get("/customers/me/payment-channels", {
      headers: customerAuthHeaders(),
    }),
  createOrderPayment: (orderId: number) =>
    api.post(
      `/customers/me/orders/${orderId}/payment`,
      {},
      { headers: customerAuthHeaders() },
    ),
  getOrderPayment: (orderId: number) =>
    api.get(`/customers/me/orders/${orderId}/payment`, {
      headers: customerAuthHeaders(),
    }),
  closeOrderPayment: (orderId: number) =>
    api.post(
      `/customers/me/orders/${orderId}/payment/close`,
      {},
      { headers: customerAuthHeaders() },
    ),
  // 客户自助取消未付款订单（存在待处理支付时被服务端拒绝）
  cancelOrder: (orderId: number) =>
    api.post(
      `/customers/me/orders/${orderId}/cancel`,
      {},
      { headers: customerAuthHeaders() },
    ),
  getProfile: () =>
    api.get("/customers/me", { headers: customerAuthHeaders(), suppressGlobalError: true }),
  getOrders: () =>
    api.get("/customers/me/orders", { headers: customerAuthHeaders() }),
  getNotifications: (params?: { page?: number; pageSize?: number; unreadOnly?: boolean }) =>
    api.get("/customers/me/notifications", {
      headers: customerAuthHeaders(),
      params: {
        page: params?.page,
        pageSize: params?.pageSize,
        unreadOnly: params?.unreadOnly === undefined
          ? undefined
          : String(params.unreadOnly),
      },
      suppressGlobalError: true,
    }),
  markNotificationRead: (id: number) =>
    api.put(
      `/customers/me/notifications/${id}/read`,
      {},
      { headers: customerAuthHeaders(), suppressGlobalError: true },
    ),
  markAllNotificationsRead: () =>
    api.put(
      "/customers/me/notifications/read-all",
      {},
      { headers: customerAuthHeaders(), suppressGlobalError: true },
    ),
  createAfterSales: (
    orderId: number,
    data: {
      orderItemId: number;
      type: "REFUND" | "EXCHANGE" | "REPAIR";
      reason: string;
    },
  ) =>
    api.post(`/customers/me/orders/${orderId}/after-sales`, data, {
      headers: customerAuthHeaders(),
    }),
  cancelAfterSales: (caseId: number) =>
    api.post(
      `/customers/me/after-sales/${caseId}/cancel`,
      {},
      { headers: customerAuthHeaders() },
    ),
  getOrderTracking: (orderId: number) =>
    api.get(`/customers/me/orders/${orderId}/tracking`, {
      headers: customerAuthHeaders(),
    }),
  getSelectionInquiries: () =>
    api.get("/customers/me/selection-inquiries", {
      headers: customerAuthHeaders(),
      suppressGlobalError: true,
    }),
  getConsultation: (leadId: number) =>
    api.get(`/customers/me/consultations/${leadId}`, {
      headers: customerAuthHeaders(),
      suppressGlobalError: true,
    }),
  getInquiries: (params?: { page?: number; pageSize?: number }) =>
    api.get("/customers/me/inquiries", {
      params,
      headers: customerAuthHeaders(),
      suppressGlobalError: true,
    }),
  getAddresses: () =>
    api.get("/customers/me/addresses", { headers: customerAuthHeaders() }),
  createAddress: (data: CustomerAddressInput) =>
    api.post("/customers/me/addresses", data, {
      headers: customerAuthHeaders(),
    }),
  updateAddress: (id: number, data: CustomerAddressInput) =>
    api.put(`/customers/me/addresses/${id}`, data, {
      headers: customerAuthHeaders(),
    }),
  deleteAddress: (id: number) =>
    api.delete(`/customers/me/addresses/${id}`, {
      headers: customerAuthHeaders(),
    }),
  getFavorites: () =>
    api.get("/customers/me/favorites", { headers: customerAuthHeaders() }),
  exportMyData: () =>
    api.get("/customers/me/data-export", { headers: customerAuthHeaders() }),
  closeAccount: (data: { password: string }) =>
    api.post("/customers/me/close", data, { headers: customerAuthHeaders() }),
  toggleFavorite: (productId: number) =>
    api.post(
      `/customers/me/favorites/${productId}/toggle`,
      {},
      {
        headers: customerAuthHeaders(),
      },
    ),
  submitPaymentProof: (orderId: number, proofKey: string) =>
    api.post(
      `/customers/me/orders/${orderId}/payment-proof`,
      { proofKey },
      { headers: customerAuthHeaders() },
    ),
  uploadPaymentProof: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/upload/payment-proof", formData, {
      headers: {
        ...customerAuthHeaders(),
        "Content-Type": "multipart/form-data",
      },
    });
  },
};

// ===== Partner Applications API（合作申请）=====
export interface PartnerApplicationInput {
  applicantName: string;
  applicantPhone: string;
  companyName?: string;
  city?: string;
  businessType?: string;
  channelType?: string;
  businessDescription?: string;
  expectedPurchaseRange?: string;
  contactWechat?: string;
  agreementAccepted: boolean;
}

export type PartnerApplicationStatus =
  | "PENDING"
  | "NEEDS_SUPPLEMENT"
  | "APPROVED"
  | "REJECTED"
  | "SUSPENDED";

export interface PartnerApplicationListQuery {
  page?: number;
  pageSize?: number;
  status?: PartnerApplicationStatus;
  keyword?: string;
}

export const partnerApi = {
  // 客户侧（用客户令牌）
  getMine: () =>
    api.get("/partner-applications/me", { headers: customerAuthHeaders() }),
  submit: (data: PartnerApplicationInput) =>
    api.post("/partner-applications", data, { headers: customerAuthHeaders() }),
  resubmit: (data: PartnerApplicationInput) =>
    api.put("/partner-applications/me", data, {
      headers: customerAuthHeaders(),
    }),
  // 后台（员工令牌，全局 interceptor 自动注入 Authorization）
  adminGetList: (params: PartnerApplicationListQuery) =>
    api.get("/partner-applications", { params }),
  adminGetById: (id: number) => api.get(`/partner-applications/${id}`),
  adminReview: (
    id: number,
    data: {
      action: PartnerApplicationStatus;
      reviewNote?: string;
    },
  ) =>
    api.put(`/partner-applications/${id}/review`, data),
};

interface BaseTradeListQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  keyword?: string;
}

export interface PaymentListQuery extends BaseTradeListQuery {
  type?: string;
  method?: string;
  startDate?: string;
  endDate?: string;
}

export type FulfillmentListQuery = BaseTradeListQuery;
export type RefundListQuery = BaseTradeListQuery;

export interface AfterSalesListQuery extends BaseTradeListQuery {
  type?: string;
}

export const paymentApi = {
  getList: (params: PaymentListQuery) => api.get("/payments", { params }),
  getById: (id: number) => api.get(`/payments/${id}`),
  approve: (id: number, reviewNote?: string) =>
    api.put(`/payments/${id}/approve`, { reviewNote }),
  reject: (id: number, reviewNote?: string) =>
    api.put(`/payments/${id}/reject`, { reviewNote }),
  // 主动向渠道查单并按回调同源管线核销（掉单与对账工具）。
  queryChannel: (id: number) => api.post(`/payments/${id}/query-channel`),
  // 异常线下实收；微信/支付宝到账只由服务端验签回调确认。
  createReceipt: (data: {
    orderId: number;
    amount: number;
    method: "bank_transfer" | "store";
    type: "DEPOSIT" | "BALANCE" | "FULL" | "SUPPLEMENT";
    paidAt?: string;
    gatewayTradeNo?: string;
    reviewNote?: string;
  }) => api.post("/payments/receipt", data),
};

// ===== 履约 API =====
export const fulfillmentApi = {
  getList: (params: FulfillmentListQuery) => api.get("/fulfillments", { params }),
  getById: (id: number) => api.get(`/fulfillments/${id}`),
  dispatch: (
    id: number,
    data: { carrier: string; trackingNo: string; internalNote?: string },
  ) => api.put(`/fulfillments/${id}/dispatch`, data),
  updateStatus: (
    id: number,
    data: {
      status: "DELIVERED" | "ABNORMAL";
      abnormalReason?: string;
      internalNote?: string;
    },
  ) => api.put(`/fulfillments/${id}/status`, data),
};

// ===== 退款 API =====
export const refundApi = {
  getList: (params: RefundListQuery) => api.get("/refunds", { params }),
  getById: (id: number) => api.get(`/refunds/${id}`),
  create: (data: {
    orderId: number;
    paymentId?: number;
    amount: number;
    reason: string;
    idempotencyKey: string;
    afterSalesCaseId?: number;
  }) => api.post("/refunds", data),
  review: (
    id: number,
    data: { action: "APPROVED" | "REJECTED"; reviewNote?: string },
  ) => api.put(`/refunds/${id}/review`, data),
  execute: (
    id: number,
    data: {
      action: "COMPLETED" | "FAILED";
      gatewayRefundNo?: string;
      reviewNote?: string;
    },
  ) => api.put(`/refunds/${id}/execute`, data),
  startChannel: (id: number) => api.put(`/refunds/${id}/channel`),
  queryChannel: (id: number) => api.get(`/refunds/${id}/channel`),
};

// ===== 售后 API =====
export const afterSalesApi = {
  getList: (params: AfterSalesListQuery) => api.get("/after-sales-cases", { params }),
  getById: (id: number) => api.get(`/after-sales-cases/${id}`),
  create: (data: {
    orderId: number;
    orderItemId: number;
    customerId: number;
    type: "REFUND" | "EXCHANGE" | "REPAIR";
    reason: string;
    evidenceUrls?: string[];
    customerNote?: string;
    requestedRefundAmount?: number;
  }) => api.post("/after-sales-cases", data),
  review: (
    id: number,
    data: {
      action: "APPROVED" | "REJECTED";
      approvedRefundAmount?: number;
      adminNote?: string;
    },
  ) => api.put(`/after-sales-cases/${id}/review`, data),
  updateStatus: (id: number, data: { status: string; adminNote?: string }) =>
    api.put(`/after-sales-cases/${id}/status`, data),
};

// ===== Gold Price API =====
export interface GoldPriceHistoryQuery {
  days?: number;
}

export interface ManualGoldPriceInput {
  price: number;
  remark?: string;
}

export const goldPriceApi = {
  getLatest: async () => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes(mockGoldPrice);
    }
    return api.get("/gold-price/latest");
  },
  getHistory: async (params: GoldPriceHistoryQuery) => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes(mockGoldPriceHistory);
    }
    return api.get("/gold-price/history", { params });
  },
  getAutomationStatus: async () => {
    if (USE_MOCK) return mockRes({ autoFetchConfigured: false });
    return api.get("/gold-price/automation-status");
  },
  updateManually: async (data: ManualGoldPriceInput) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({ ...mockGoldPrice, price: data.price, source: "MANUAL" });
    }
    return api.post("/gold-price/manual", data);
  },
};

// ===== Inventory API =====
type InventoryStockUpdateInput = {
  type: "in" | "out" | "adjust";
  quantity: number;
  remark?: string;
};

export interface InventoryListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  warehouseId?: number;
}

export const inventoryApi = {
  getList: async (params: InventoryListQuery) => {
    if (USE_MOCK) {
      await mockDelay();
      const items = mockProducts.flatMap((p) =>
        (p.skus || []).map((sku) => {
          const quantity = sku.stock ?? 0;
          const safetyStock = sku.safetyStock ?? 0;
          return {
            id: sku.id,
            skuCode: sku.skuCode,
            productName: p.name,
            warehouse: ["深圳展厅", "广州工厂", "北京门店"][
              Math.floor(Math.random() * 3)
            ],
            material: sku.material,
            quantity,
            safetyStock,
            status:
              quantity <= 0
                ? "out"
                : quantity <= safetyStock
                  ? "low"
                  : "normal",
          };
        }),
      );
      return mockRes(paginate(items, params.page || 1, params.pageSize || 20));
    }
    return api.get("/inventory", { params });
  },
  update: (id: number, data: InventoryStockUpdateInput) =>
    api.put(`/inventory/${id}`, data),
};

// ===== Warehouse API（仓库管理）=====
export type WarehouseType = "SHOWROOM" | "FACTORY" | "STORE";

export interface CreateWarehouseInput {
  name: string;
  type?: WarehouseType;
  address?: string;
  contact?: string;
  phone?: string;
}

export interface UpdateWarehouseInput extends Partial<CreateWarehouseInput> {
  isActive?: boolean;
}

export const warehouseApi = {
  list: () => api.get("/warehouses"),
  create: (data: CreateWarehouseInput) => api.post("/warehouses", data),
  update: (id: number, data: UpdateWarehouseInput) =>
    api.put(`/warehouses/${id}`, data),
};

// ===== Upload API =====
export const uploadApi = {
  uploadImage: async (file: File) => {
    if (USE_MOCK) {
      await mockDelay(500);
      return mockRes({
        url: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=400",
        filename: file.name,
        size: file.size,
      });
    }
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/upload/image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  // 受控产品库：商品图片上传到私有存储（返回 storageKey，不返回公开 url）
  uploadProductImage: async (file: File) => {
    const formData = new FormData();
    formData.append("files", file);
    return api.post("/upload/product-images", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  uploadVideo: async (file: File) => {
    if (USE_MOCK) {
      await mockDelay(800);
      return mockRes({
        url: URL.createObjectURL(file),
        filename: file.name,
        size: file.size,
      });
    }
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/upload/video", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    });
  },
};

// contentSlotsApi 已删除（2026-08-15 ContentSlot 死资产清退）：
// 插槽写侧从未有入口、HOME_HERO 永远为空，首页统一走 Puck PageDocument。

// ===== Puck PageDocument API =====
export type PageDocumentResource = {
  id: number;
  pageKey: string;
  puckData: unknown;
  metadata?: Record<string, unknown>;
  editorVersion?: string;
  status: "DRAFT" | "PUBLISHED";
  version: number;
  publishedRevisionId?: number | null;
  isPublished?: boolean;
  publishedAt?: string | null;
  publishedBy?: number | null;
  createdAt: string;
  updatedAt: string;
  publicationAttested?: boolean;
};

type MockPageDocumentStore = {
  drafts: Record<string, PageDocumentResource>;
  published: Record<string, PageDocumentResource>;
  revisions: Record<string, PageDocumentResource[]>;
};

const MOCK_PAGE_DOCUMENTS_STORAGE_KEY = "haichuan.mock-page-documents";

const _mockPageDocuments: MockPageDocumentStore = {
  drafts: {},
  published: {},
  revisions: {},
};

function cloneMockDocument<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function loadMockPageDocuments() {
  if (typeof window === "undefined") return _mockPageDocuments;
  try {
    const saved = window.localStorage.getItem(MOCK_PAGE_DOCUMENTS_STORAGE_KEY);
    if (!saved) return _mockPageDocuments;
    const parsed = JSON.parse(saved) as Partial<MockPageDocumentStore>;
    _mockPageDocuments.drafts = parsed.drafts || {};
    _mockPageDocuments.published = parsed.published || {};
    _mockPageDocuments.revisions = parsed.revisions || {};
  } catch {
    // mock 持久化只是本地开发兜底，损坏时回到内存态。
  }
  return _mockPageDocuments;
}

function persistMockPageDocuments() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      MOCK_PAGE_DOCUMENTS_STORAGE_KEY,
      JSON.stringify(_mockPageDocuments),
    );
  } catch {
    // 忽略本地存储不可用，当前内存态仍可继续编辑。
  }
}

function nextMockDocumentVersion(pageKey: string) {
  const store = loadMockPageDocuments();
  const versions = [
    store.drafts[pageKey]?.version || 0,
    store.published[pageKey]?.version || 0,
    ...(store.revisions[pageKey] || []).map(
      (revision) => revision.version || 0,
    ),
  ];
  return Math.max(0, ...versions) + 1;
}

function createMockPageDocument(data: {
  pageKey: string;
  puckData: unknown;
  metadata?: Record<string, unknown>;
  editorVersion?: string;
  status?: "DRAFT" | "PUBLISHED";
  version?: number;
  publishedAt?: string | null;
  publishedBy?: number | null;
}): PageDocumentResource {
  const now = new Date().toISOString();
  return {
    id: Date.now(),
    pageKey: data.pageKey,
    puckData: cloneMockDocument(data.puckData),
    metadata: data.metadata,
    editorVersion: data.editorVersion,
    status: data.status || "DRAFT",
    version: data.version || nextMockDocumentVersion(data.pageKey),
    publishedAt: data.publishedAt ?? null,
    publishedBy: data.publishedBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export type PersonalContentTemplate = {
  id: number;
  name: string;
  moduleType: string;
  contractKey: string;
  contractVersion: number;
  layoutData: Record<string, unknown>;
  revision: number;
  contentDefaults: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type MockPublicPageDocument = Pick<
  PageDocumentResource,
  "pageKey" | "puckData" | "metadata" | "status" | "version" | "publishedAt" | "updatedAt"
>;

function getMockPublicPageDocument(
  document: PageDocumentResource | null | undefined,
): MockPublicPageDocument | null {
  if (!document) return null;
  const metadata = document.metadata;
  const publicMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? Object.fromEntries(
        CONTENT_TEMPLATE_PAGE_METADATA.publicFields.flatMap((field) => {
          const value = metadata[field];
          return typeof value === "string" && value.trim()
            ? [[field, value.trim()]]
            : [];
        }),
      )
    : {};
  return {
    pageKey: document.pageKey,
    puckData: cloneMockDocument(document.puckData),
    metadata: publicMetadata,
    status: document.status,
    version: document.version,
    publishedAt: document.publishedAt,
    updatedAt: document.updatedAt,
  };
}

export const pageDocumentApi = {
  getPublished: async (
    pageKey = "home",
    locale: PublicContentLocale = getBrowserPublicContentLocale(),
  ) => {
    if (USE_MOCK) {
      await mockDelay(120);
      if (locale === "en") return mockRes(null);
      const store = loadMockPageDocuments();
      return mockRes(getMockPublicPageDocument(store.published[pageKey]));
    }
    return api.get("/page-modules/document/published", {
      params: { pageKey, locale },
      suppressGlobalError: true,
    });
  },
  getPublishedAdmin: async (pageKey = "home") => {
    if (USE_MOCK) {
      await mockDelay(120);
      const store = loadMockPageDocuments();
      return mockRes(store.published[pageKey] || null);
    }
    return api.get("/page-modules/document/published/admin", {
      params: { pageKey },
      suppressGlobalError: true,
    });
  },
  getAdmin: async (pageKey = "home") => {
    if (USE_MOCK) {
      await mockDelay(120);
      const store = loadMockPageDocuments();
      return mockRes(store.drafts[pageKey] || store.published[pageKey] || null);
    }
    return api.get("/page-modules/document/admin", {
      params: { pageKey },
      suppressGlobalError: true,
    });
  },
  discardDraft: async (pageKey: string, expectedUpdatedAt: string) => {
    if (USE_MOCK) {
      await mockDelay(160);
      const store = loadMockPageDocuments();
      const current = store.drafts[pageKey] || store.published[pageKey];
      if (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt))) {
        throw mockRequestError("放弃草稿时缺少页面版本标识", 400);
      }
      if (!current || current.updatedAt !== expectedUpdatedAt) {
        throw mockRequestError("草稿已被其他编辑保存，请刷新页面后重试", 409);
      }
      delete store.drafts[pageKey];
      persistMockPageDocuments();
      return mockRes({ discarded: true });
    }
    return api.delete("/page-modules/document/draft", {
      params: { pageKey, expectedUpdatedAt },
      suppressGlobalError: true,
    });
  },
  save: async (data: {
    pageKey: string;
    puckData: unknown;
    metadata?: Record<string, unknown>;
    editorVersion?: string;
    expectedUpdatedAt?: string;
  }) => {
    if (USE_MOCK) {
      await mockDelay(160);
      const store = loadMockPageDocuments();
      const previous =
        store.drafts[data.pageKey] || store.published[data.pageKey];
      if (previous && (!data.expectedUpdatedAt || Number.isNaN(Date.parse(data.expectedUpdatedAt)))) {
        throw mockRequestError("保存已有页面时缺少页面版本标识", 400);
      }
      if (previous && previous.updatedAt !== data.expectedUpdatedAt) {
        throw mockRequestError("该页面已被其他编辑者更新，请重新加载后再保存", 409);
      }
      const now = new Date().toISOString();
      const document: PageDocumentResource = {
        ...(previous || createMockPageDocument(data)),
        puckData: cloneMockDocument(data.puckData),
        metadata: data.metadata,
        editorVersion: data.editorVersion,
        status: "DRAFT",
        publishedAt: previous?.publishedAt ?? null,
        publishedBy: previous?.publishedBy ?? null,
        updatedAt: now,
      };
      store.drafts[data.pageKey] = document;
      persistMockPageDocuments();
      return mockRes(cloneMockDocument(document));
    }
    return api.put("/page-modules/document", data, {
      suppressGlobalError: true,
    });
  },
  publish: async (
    pageKey: string,
    userId: number | undefined,
    expectedUpdatedAt: string,
  ) => {
    if (USE_MOCK) {
      await mockDelay(180);
      const store = loadMockPageDocuments();
      const draft = store.drafts[pageKey];
      if (!draft) throw new Error("请先保存页面草稿");
      if (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt))) {
        throw mockRequestError("发布页面时缺少页面版本标识", 400);
      }
      if (draft.updatedAt !== expectedUpdatedAt) {
        throw mockRequestError("该页面已被其他编辑者更新，请重新加载后再发布", 409);
      }
      const now = new Date().toISOString();
      const published: PageDocumentResource = {
        ...cloneMockDocument(draft),
        status: "PUBLISHED",
        version: nextMockDocumentVersion(pageKey),
        publishedAt: now,
        publishedBy: userId ?? 1,
        updatedAt: now,
      };
      const revision = {
        ...cloneMockDocument(published),
        id: Date.now(),
        isPublished: true,
      };
      published.publishedRevisionId = revision.id;
      store.published[pageKey] = published;
      store.revisions[pageKey] = [
        revision,
        ...(store.revisions[pageKey] || []).map((item) => ({
          ...item,
          isPublished: false,
        })),
      ].slice(0, 20);
      persistMockPageDocuments();
      return mockRes(cloneMockDocument(published));
    }
    return api.put("/page-modules/document/publish", {
      pageKey,
      userId,
      expectedUpdatedAt,
    }, {
      suppressGlobalError: true,
    });
  },
  validate: async (
    pageKey = "home",
    puckData?: unknown,
    metadata?: Record<string, unknown>,
    signal?: AbortSignal,
  ) => {
    if (USE_MOCK) {
      await mockDelay(100);
      return mockRes({
        valid: false,
        errors: ["Mock 模式未连接服务端发布检查，不能确认真实发布资格"],
        issues: [],
        unverified: true,
      });
    }
    return api.post(
      "/page-modules/document/validate",
      { pageKey, puckData, metadata },
      { signal, suppressGlobalError: true },
    );
  },
  getRevisions: async (
    pageKey = "home",
    options: { beforeVersion?: number; limit?: number } = {},
  ) => {
    if (USE_MOCK) {
      await mockDelay(120);
      const store = loadMockPageDocuments();
      const pointer = store.published[pageKey]?.publishedRevisionId;
      const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
      const eligible = (store.revisions[pageKey] || [])
        .filter((revision) => options.beforeVersion === undefined || revision.version < options.beforeVersion)
        .sort((left, right) => right.version - left.version);
      const page = eligible.slice(0, limit);
      return mockRes(cloneMockDocument({
        items: page.map((revision) => ({
          id: revision.id,
          version: revision.version,
          status: revision.status,
          publishedAt: revision.publishedAt,
          publishedBy: revision.publishedBy,
          createdAt: revision.createdAt,
          isPublished: revision.id === pointer,
        })),
        nextBeforeVersion: eligible.length > limit ? page[page.length - 1]?.version ?? null : null,
      }));
    }
    return api.get("/page-modules/document/revisions", {
      params: { pageKey, ...options },
      suppressGlobalError: true,
    });
  },
  getRevision: async (
    pageKey: string,
    version: number,
    signal?: AbortSignal,
  ) => {
    if (USE_MOCK) {
      await mockDelay(120);
      const store = loadMockPageDocuments();
      const revision = (store.revisions[pageKey] || []).find(
        (item) => item.version === version,
      );
      if (!revision) throw mockRequestError("指定版本不存在", 404);
      return mockRes(cloneMockDocument({
        ...revision,
        isPublished: revision.id === store.published[pageKey]?.publishedRevisionId,
      }));
    }
    return api.get(`/page-modules/document/revisions/${version}`, {
      params: { pageKey },
      signal,
      suppressGlobalError: true,
    });
  },
  rollbackPublication: async (
    pageKey: string,
    revisionId: number,
    expectedPublishedRevisionId: number,
  ) => {
    if (USE_MOCK) {
      await mockDelay(160);
      const store = loadMockPageDocuments();
      const published = store.published[pageKey];
      if (!published || published.publishedRevisionId !== expectedPublishedRevisionId) {
        throw mockRequestError("线上版本已变化，请重新加载版本记录后再回滚", 409);
      }
      const revision = (store.revisions[pageKey] || []).find((item) => item.id === revisionId);
      if (!revision) throw mockRequestError("指定发布版本不属于当前页面", 400);
      published.publishedRevisionId = revisionId;
      published.puckData = cloneMockDocument(revision.puckData);
      published.metadata = cloneMockDocument(revision.metadata);
      published.version = revision.version;
      published.publishedAt = revision.publishedAt;
      published.publishedBy = revision.publishedBy;
      const updatedAt = new Date().toISOString();
      published.updatedAt = updatedAt;
      const draft = store.drafts[pageKey];
      if (draft) {
        draft.publishedRevisionId = revisionId;
        draft.updatedAt = updatedAt;
      }
      store.revisions[pageKey] = (store.revisions[pageKey] || []).map((item) => ({
        ...item,
        isPublished: item.id === revisionId,
      }));
      persistMockPageDocuments();
      return mockRes(cloneMockDocument(draft || published));
    }
    return api.put(
      `/page-modules/document/revisions/${revisionId}/rollback-publication`,
      { pageKey, expectedPublishedRevisionId },
      { suppressGlobalError: true },
    );
  },
};

// ===== Marketing API =====
export type PromotionType = "FULL_REDUCTION" | "DISCOUNT" | "GIFT";

export interface CreatePromotionInput {
  name: string;
  type: PromotionType;
  rule: Record<string, unknown>;
  startTime: string;
  endTime: string;
  description?: string;
  isActive?: boolean;
}

export type UpdatePromotionInput = Partial<CreatePromotionInput>;

export type CouponType = "fixed" | "percent";

export interface CreateCouponInput {
  name: string;
  type: CouponType;
  value: number;
  minAmount?: number;
  totalCount?: number;
  startTime: string;
  endTime: string;
  isActive?: boolean;
}

export type UpdateCouponInput = Partial<CreateCouponInput>;

export const marketingApi = {
  /* 促销活动 */
  getPromotions: () => api.get("/marketing/promotions"),
  createPromotion: (data: CreatePromotionInput) =>
    api.post("/marketing/promotions", data),
  updatePromotion: (id: number, data: UpdatePromotionInput) =>
    api.put(`/marketing/promotions/${id}`, data),
  deletePromotion: (id: number) => api.delete(`/marketing/promotions/${id}`),
  /* 优惠券 */
  getCoupons: () => api.get("/marketing/coupons"),
  createCoupon: (data: CreateCouponInput) => api.post("/marketing/coupons", data),
  updateCoupon: (id: number, data: UpdateCouponInput) =>
    api.put(`/marketing/coupons/${id}`, data),
  getCouponStats: () => api.get("/marketing/coupons/stats"),
  /* 建单可用券（按订单金额试算折扣，营销生效） */
  listUsableCoupons: (amountCents: number) =>
    api.get("/marketing/coupons/usable", { params: { amountCents } }),
};


export default api;
