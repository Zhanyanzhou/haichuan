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
  QuoteChannel,
  QuotationStatus,
  User,
  WaxType,
} from "@/types";
import type { CustomerNotificationPreference } from "@/pages/public/CustomerCenter/types";

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
  customerQuotationApi,
  parseCustomerDesignFilesResponse,
  type ConfirmQuotationOrderInput,
  type ConfirmQuotationOrderResult,
  type CustomerCooperationDesignFileResource,
  type CustomerQuotationPage,
} from "./clients/customerQuotationClient";
export {
  quotationConfigurationApi,
  type CooperationDesignFileResource,
  type CreatePartnerPriceAgreementInput,
  type CreateQuotationFeeRuleInput,
  type CreateTradeResourceBucketInput,
  type PartnerPriceAgreementResource,
  type QuotationFeeRuleResource,
  type TradeResourceBucketResource,
} from "./clients/quotationConfigurationClient";
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
  channel?: "all" | QuoteChannel;
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
  waxType?: WaxType;
}

export interface CreateQuotationInput {
  customerId?: number;
  channel?: QuoteChannel;
  sourceLeadId?: number;
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

export interface IssueQuotationInput {
  designFileVersionId?: number;
  waxType?: WaxType;
  feeRuleIds?: number[];
  resourceRequirements?: Array<{
    resourceBucketId: number;
    requiredQuantity: number;
  }>;
}

export interface QuotationIssueFeeRule {
  id: number;
  code: string;
  version: number;
  channel: QuoteChannel;
  waxType?: WaxType | null;
  calculationMethod: "FIXED" | "PER_GRAM" | "PER_ORDER";
  unitAmount: number | string;
  currency: string;
  displayText: string;
}

export interface QuotationIssueResourceBucket {
  id: number;
  channel: "CUSTOM" | "PARTNER_WAX";
  kind: "CAPACITY" | "MATERIAL";
  code: string;
  bucketKey: string;
  displayName: string;
  unit: string;
  availableQuantity: number | string;
  reservedQuantity: number | string;
  version: number;
  bucketStart?: string | null;
  bucketEnd?: string | null;
}

export interface QuotationIssueDesignFile {
  id: number;
  referenceNo: string;
  currentVersion: number;
  versions?: Array<{
    id: number;
    designFileId: number;
    version: number;
    status: "DRAFT" | "SUBMITTED" | "CONFIRMED" | "SUPERSEDED" | "REJECTED";
    redWaxWeight?: number | string | null;
    purpleWaxWeight?: number | string | null;
    confirmedAt?: string | null;
  }>;
}

export interface QuotationIssueOptions {
  feeRules: QuotationIssueFeeRule[];
  resourceBuckets: QuotationIssueResourceBucket[];
  designFiles: QuotationIssueDesignFile[];
}

export interface QuotationIssueCustomer {
  id: number;
  name?: string | null;
  phone: string;
  email?: string | null;
  accountType: "MEMBER" | "PARTNER";
  partnerStatus: string;
  status: string;
}

export interface QuotationIssueCustomerPage {
  list: QuotationIssueCustomer[];
}

export const quotationApi = {
  getList: (params: QuotationListQuery) => api.get("/quotations", { params }),
  searchIssueCustomers: (params: { keyword: string; pageSize?: number }) =>
    api.get("/quotations/issue-customers", { params }),
  getById: (id: number) => api.get(`/quotations/${id}`),
  getIssueOptions: (id: number) =>
    api.get(`/quotations/${id}/issue-options`),
  create: (data: CreateQuotationInput) => api.post("/quotations", data),
  update: (id: number, data: UpdateQuotationInput) =>
    api.put(`/quotations/${id}`, data),
  submit: (id: number) => api.put(`/quotations/${id}/submit`),
  /** v2 发出报价：服务端冻结费用、资源、文件与价格来源快照。 */
  issue: (id: number, data: IssueQuotationInput = {}) =>
    api.post(`/quotations/${id}/issue`, data),
  /** 已发出版本只能追加修订，不能原地覆盖。 */
  revise: (id: number) => api.post(`/quotations/${id}/revisions`),
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

export type LeadClaimResult = {
  id: number;
  assignedTo: number;
  status: string;
  updatedAt: string;
};

export const leadApi = {
  claim: (type: "inquiry" | "selection", leadId: number) =>
    api.post(`/leads/${type}/${leadId}/claim`, undefined, {
      suppressGlobalError: true,
    }),
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
  getNotificationPreferences: () =>
    api.get("/customers/me/notification-preferences", {
      headers: customerAuthHeaders(),
      suppressGlobalError: true,
    }),
  updateNotificationPreference: (data: {
    channel: "EMAIL" | "SMS";
    topic: CustomerNotificationPreference["topic"];
    enabled: boolean;
    expectedUpdatedAt: string | null;
  }) =>
    api.patch("/customers/me/notification-preferences", data, {
      headers: customerAuthHeaders(),
      suppressGlobalError: true,
    }),
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
export type MediaAssetSourceType =
  | "BRAND_OWNED"
  | "COMMISSIONED"
  | "LICENSED_THIRD_PARTY"
  | "PUBLIC_DOMAIN"
  | "CUSTOMER_SUPPLIED"
  | "AI_GENERATED"
  | "LEGACY_UNVERIFIED"
  | "OTHER";

export type MediaAuthorizationReviewStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "REJECTED";

export type MediaAuthorizationRevocationStatus = "ACTIVE" | "REVOKED";

export type MediaAuthorizationSummary = {
  revision: number;
  publicUseEpoch: number;
  sourceType: MediaAssetSourceType;
  publicWebUseAllowed?: boolean;
  reviewStatus: MediaAuthorizationReviewStatus;
  revocationStatus: MediaAuthorizationRevocationStatus;
  validFrom?: string | null;
  validUntil?: string | null;
};

export type MediaPublicEligibility = {
  eligible: boolean;
  reasons: string[];
};

export type MediaAuthorizationDetail = MediaAuthorizationSummary & {
  mediaAssetId: number;
  authorizationBasis?: string | null;
  evidenceReference?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  revokedAt?: string | null;
  revocationReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PageMediaAsset = {
  id: number;
  url: string;
  name: string;
  type: "image" | "video";
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  createdAt: string;
  status: "PENDING" | "READY" | "QUARANTINED" | "ARCHIVED";
  available: boolean;
  previewUrl?: string;
  publicUrl?: string | null;
  lifecycleRevision?: number;
  integrityCheckedAt?: string;
  quarantineReason?: string;
  authorization?: MediaAuthorizationSummary | null;
  publicEligibility?: MediaPublicEligibility;
};

export type StoredPageMediaAsset = PageMediaAsset & {
  filename: string;
  format?: string;
  deduplicated: boolean;
};

export type MediaAuthorizationResource = {
  asset: Pick<PageMediaAsset, 'id' | 'name' | 'mimeType' | 'status'>
    & Partial<PageMediaAsset>
    & { accessLevel?: string };
  authorization: MediaAuthorizationDetail | null;
  publicEligibility: MediaPublicEligibility;
  proof?: {
    authorizationBasis?: string | null;
    evidenceReference?: string | null;
    reviewNote?: string | null;
    revocationReason?: string | null;
    events?: unknown[];
  } | null;
};

export type MediaAuthorizationImpactPreview = {
  complete: boolean;
  reason?: string;
  items: Array<{
    assetId: number;
    eligibleForPublic: boolean;
    blockingReasons: string[];
    affectedPublishedPages: Array<{ pageKey: string; locale?: string }>;
    affectedDraftPages: Array<{ pageKey: string; locale?: string }>;
  }>;
  summary: {
    total: number;
    eligible: number;
    blocked: number;
    publishedAffected: number;
    draftAffected: number;
  };
};

export type SaveMediaAuthorizationDraftInput = {
  expectedRevision: number;
  sourceType: MediaAssetSourceType;
  authorizationBasis?: string;
  evidenceReference?: string;
  publicWebUseAllowed: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
};

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
  listPageMedia: (params?: {
    page?: number;
    pageSize?: number;
    type?: "image" | "video";
    includeArchived?: boolean;
    status?: "READY" | "ARCHIVED" | "QUARANTINED";
    keyword?: string;
  }) => api.get("/upload/media", {
    params: {
      ...params,
      includeArchived: params?.includeArchived ? "true" : undefined,
    },
  }),
  archivePageMedia: (id: number) => api.delete(`/upload/media/${id}`),
  restorePageMedia: (id: number) => api.post(`/upload/media/${id}/restore`),
  getMediaAuthorization: (id: number) =>
    api.get(`/upload/media/${id}/authorization`),
  saveMediaAuthorizationDraft: (id: number, data: SaveMediaAuthorizationDraftInput) =>
    api.put(`/upload/media/${id}/authorization/draft`, data),
  submitMediaAuthorization: (id: number, expectedRevision: number) =>
    api.post(`/upload/media/${id}/authorization/submit`, { expectedRevision }),
  approveMediaAuthorization: (id: number, expectedRevision: number, reviewNote?: string) =>
    api.post(`/upload/media/${id}/authorization/approve`, { expectedRevision, reviewNote }),
  rejectMediaAuthorization: (id: number, expectedRevision: number, reviewNote: string) =>
    api.post(`/upload/media/${id}/authorization/reject`, { expectedRevision, reviewNote }),
  revokeMediaAuthorization: (id: number, expectedRevision: number, reason: string) =>
    api.post(`/upload/media/${id}/authorization/revoke`, { expectedRevision, reason }),
  renewMediaAuthorization: (
    id: number,
    expectedRevision: number,
    validUntil: string,
    evidenceReference?: string,
  ) => api.post(`/upload/media/${id}/authorization/renew`, {
    expectedRevision,
    validUntil,
    evidenceReference,
  }),
  previewMediaAuthorizationImpact: (assetIds: number[]) =>
    api.post("/upload/media/authorization/impact-preview", { assetIds }),
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
  locale?: PublicContentLocale;
  reviewStatus?: "DRAFT" | "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "PUBLISHED" | "ARCHIVED";
  contentHash?: string;
  publishedHash?: string | null;
  submittedAt?: string | null;
  submittedBy?: number | null;
  reviewedAt?: string | null;
  reviewedBy?: number | null;
  reviewNote?: string | null;
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

function nextMockDocumentVersion(pageKey: string, locale: PublicContentLocale = "zh-CN") {
  const store = loadMockPageDocuments();
  const storeKey = pageLocaleStoreKey(pageKey, locale);
  const versions = [
    store.drafts[storeKey]?.version || 0,
    store.published[storeKey]?.version || 0,
    ...(store.revisions[storeKey] || []).map(
      (revision) => revision.version || 0,
    ),
  ];
  return Math.max(0, ...versions) + 1;
}

function pageLocaleStoreKey(pageKey: string, locale: PublicContentLocale) {
  return locale === "zh-CN" ? pageKey : `${locale}:${pageKey}`;
}

function createMockContentHash(puckData: unknown, metadata: unknown) {
  const source = JSON.stringify({ puckData, metadata });
  let value = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    value ^= source.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (Math.abs(value).toString(16).padStart(8, "0")).repeat(8).slice(0, 64);
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
  locale?: PublicContentLocale;
}): PageDocumentResource {
  const now = new Date().toISOString();
  return {
    id: Date.now(),
    pageKey: data.pageKey,
    puckData: cloneMockDocument(data.puckData),
    metadata: data.metadata,
    editorVersion: data.editorVersion,
    status: data.status || "DRAFT",
    locale: data.locale ?? "zh-CN",
    reviewStatus: data.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    contentHash: createMockContentHash(data.puckData, data.metadata),
    version: data.version || nextMockDocumentVersion(data.pageKey, data.locale),
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
      const store = loadMockPageDocuments();
      return mockRes(getMockPublicPageDocument(store.published[pageLocaleStoreKey(pageKey, locale)]));
    }
    return api.get("/page-modules/document/published", {
      params: { pageKey, locale },
      suppressGlobalError: true,
    });
  },
  getPublishedAdmin: async (
    pageKey = "home",
    locale: PublicContentLocale = "zh-CN",
  ) => {
    if (USE_MOCK) {
      await mockDelay(120);
      const store = loadMockPageDocuments();
      return mockRes(store.published[pageLocaleStoreKey(pageKey, locale)] || null);
    }
    return api.get("/page-modules/document/published/admin", {
      params: { pageKey, locale },
      suppressGlobalError: true,
    });
  },
  getAdmin: async (
    pageKey = "home",
    locale: PublicContentLocale = "zh-CN",
  ) => {
    if (USE_MOCK) {
      await mockDelay(120);
      const store = loadMockPageDocuments();
      const storeKey = pageLocaleStoreKey(pageKey, locale);
      return mockRes(store.drafts[storeKey] || store.published[storeKey] || null);
    }
    return api.get("/page-modules/document/admin", {
      params: { pageKey, locale },
      suppressGlobalError: true,
    });
  },
  discardDraft: async (
    pageKey: string,
    locale: PublicContentLocale,
    expectedUpdatedAt: string,
  ) => {
    if (USE_MOCK) {
      await mockDelay(160);
      const store = loadMockPageDocuments();
      const storeKey = pageLocaleStoreKey(pageKey, locale);
      const current = store.drafts[storeKey] || store.published[storeKey];
      if (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt))) {
        throw mockRequestError("放弃草稿时缺少页面版本标识", 400);
      }
      if (!current || current.updatedAt !== expectedUpdatedAt) {
        throw mockRequestError("草稿已被其他编辑保存，请刷新页面后重试", 409);
      }
      delete store.drafts[storeKey];
      persistMockPageDocuments();
      return mockRes({ discarded: true });
    }
    return api.delete("/page-modules/document/draft", {
      params: { pageKey, locale, expectedUpdatedAt },
      suppressGlobalError: true,
    });
  },
  save: async (data: {
    pageKey: string;
    puckData: unknown;
    metadata?: Record<string, unknown>;
    editorVersion?: string;
    expectedUpdatedAt?: string;
    locale?: PublicContentLocale;
  }) => {
    if (USE_MOCK) {
      await mockDelay(160);
      const store = loadMockPageDocuments();
      const locale = data.locale ?? "zh-CN";
      const storeKey = pageLocaleStoreKey(data.pageKey, locale);
      const previous = store.drafts[storeKey] || store.published[storeKey];
      if (previous && (!data.expectedUpdatedAt || Number.isNaN(Date.parse(data.expectedUpdatedAt)))) {
        throw mockRequestError("保存已有页面时缺少页面版本标识", 400);
      }
      if (previous && previous.updatedAt !== data.expectedUpdatedAt) {
        throw mockRequestError("该页面已被其他编辑者更新，请重新加载后再保存", 409);
      }
      const now = new Date().toISOString();
      const document: PageDocumentResource = {
        ...(previous || createMockPageDocument({ ...data, locale })),
        puckData: cloneMockDocument(data.puckData),
        metadata: data.metadata,
        editorVersion: data.editorVersion,
        status: "DRAFT",
        locale,
        reviewStatus: previous?.contentHash === createMockContentHash(data.puckData, data.metadata)
          ? previous.reviewStatus ?? "DRAFT"
          : "DRAFT",
        contentHash: createMockContentHash(data.puckData, data.metadata),
        publishedAt: previous?.publishedAt ?? null,
        publishedBy: previous?.publishedBy ?? null,
        updatedAt: now,
      };
      store.drafts[storeKey] = document;
      persistMockPageDocuments();
      return mockRes(cloneMockDocument(document));
    }
    return api.put("/page-modules/document", data, {
      suppressGlobalError: true,
    });
  },
  publish: async (
    pageKey: string,
    locale: PublicContentLocale,
    expectedUpdatedAt: string,
    expectedContentHash: string,
  ) => {
    if (USE_MOCK) {
      await mockDelay(180);
      const store = loadMockPageDocuments();
      const storeKey = pageLocaleStoreKey(pageKey, locale);
      const draft = store.drafts[storeKey];
      if (!draft) throw new Error("请先保存页面草稿");
      if (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt))) {
        throw mockRequestError("发布页面时缺少页面版本标识", 400);
      }
      if (draft.updatedAt !== expectedUpdatedAt) {
        throw mockRequestError("该页面已被其他编辑者更新，请重新加载后再发布", 409);
      }
      if (draft.contentHash !== expectedContentHash) {
        throw mockRequestError("页面内容已变化，请重新加载后再发布", 409);
      }
      if (draft.reviewStatus !== "APPROVED") {
        throw mockRequestError("页面尚未通过审核，不能发布", 409);
      }
      const now = new Date().toISOString();
      const published: PageDocumentResource = {
        ...cloneMockDocument(draft),
        status: "PUBLISHED",
        locale,
        reviewStatus: "PUBLISHED",
        version: nextMockDocumentVersion(pageKey, locale),
        publishedAt: now,
        publishedBy: 1,
        publishedHash: draft.contentHash,
        updatedAt: now,
      };
      const revision = {
        ...cloneMockDocument(published),
        id: Date.now(),
        isPublished: true,
      };
      published.publishedRevisionId = revision.id;
      store.published[storeKey] = published;
      store.revisions[storeKey] = [
        revision,
        ...(store.revisions[storeKey] || []).map((item) => ({
          ...item,
          isPublished: false,
        })),
      ].slice(0, 20);
      persistMockPageDocuments();
      return mockRes(cloneMockDocument(published));
    }
    return api.put("/page-modules/document/publish", {
      pageKey,
      locale,
      expectedUpdatedAt,
      expectedContentHash,
    }, {
      suppressGlobalError: true,
    });
  },
  validate: async (
    pageKey = "home",
    puckData?: unknown,
    metadata?: Record<string, unknown>,
    signal?: AbortSignal,
    locale: PublicContentLocale = "zh-CN",
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
      { pageKey, puckData, metadata, locale },
      { signal, suppressGlobalError: true },
    );
  },
  getRevisions: async (
    pageKey = "home",
    locale: PublicContentLocale = "zh-CN",
    options: { beforeVersion?: number; limit?: number } = {},
  ) => {
    if (USE_MOCK) {
      await mockDelay(120);
      const store = loadMockPageDocuments();
      const storeKey = pageLocaleStoreKey(pageKey, locale);
      const pointer = store.published[storeKey]?.publishedRevisionId;
      const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
      const eligible = (store.revisions[storeKey] || [])
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
      params: { pageKey, locale, ...options },
      suppressGlobalError: true,
    });
  },
  getRevision: async (
    pageKey: string,
    locale: PublicContentLocale,
    version: number,
    signal?: AbortSignal,
  ) => {
    if (USE_MOCK) {
      await mockDelay(120);
      const store = loadMockPageDocuments();
      const storeKey = pageLocaleStoreKey(pageKey, locale);
      const revision = (store.revisions[storeKey] || []).find(
        (item) => item.version === version,
      );
      if (!revision) throw mockRequestError("指定版本不存在", 404);
      return mockRes(cloneMockDocument({
        ...revision,
        isPublished: revision.id === store.published[storeKey]?.publishedRevisionId,
      }));
    }
    return api.get(`/page-modules/document/revisions/${version}`, {
      params: { pageKey, locale },
      signal,
      suppressGlobalError: true,
    });
  },
  rollbackPublication: async (
    pageKey: string,
    locale: PublicContentLocale,
    revisionId: number,
    expectedPublishedRevisionId: number,
  ) => {
    if (USE_MOCK) {
      await mockDelay(160);
      const store = loadMockPageDocuments();
      const storeKey = pageLocaleStoreKey(pageKey, locale);
      const published = store.published[storeKey];
      if (!published || published.publishedRevisionId !== expectedPublishedRevisionId) {
        throw mockRequestError("线上版本已变化，请重新加载版本记录后再回滚", 409);
      }
      const revision = (store.revisions[storeKey] || []).find((item) => item.id === revisionId);
      if (!revision) throw mockRequestError("指定发布版本不属于当前页面", 400);
      published.publishedRevisionId = revisionId;
      published.puckData = cloneMockDocument(revision.puckData);
      published.metadata = cloneMockDocument(revision.metadata);
      published.version = revision.version;
      published.publishedAt = revision.publishedAt;
      published.publishedBy = revision.publishedBy;
      const updatedAt = new Date().toISOString();
      published.updatedAt = updatedAt;
      const draft = store.drafts[storeKey];
      if (draft) {
        draft.publishedRevisionId = revisionId;
        draft.updatedAt = updatedAt;
      }
      store.revisions[storeKey] = (store.revisions[storeKey] || []).map((item) => ({
        ...item,
        isPublished: item.id === revisionId,
      }));
      persistMockPageDocuments();
      return mockRes(cloneMockDocument(draft || published));
    }
    return api.put(
      `/page-modules/document/revisions/${revisionId}/rollback-publication`,
      { pageKey, locale, expectedPublishedRevisionId },
      { suppressGlobalError: true },
    );
  },
  submitReview: async (
    pageKey: string,
    locale: PublicContentLocale,
    expectedUpdatedAt: string,
    expectedContentHash: string,
  ) => {
    if (USE_MOCK) {
      await mockDelay(140);
      const store = loadMockPageDocuments();
      const storeKey = pageLocaleStoreKey(pageKey, locale);
      const draft = store.drafts[storeKey];
      if (!draft || draft.updatedAt !== expectedUpdatedAt || draft.contentHash !== expectedContentHash) {
        throw mockRequestError("页面内容已变化，请重新加载后再提交审核", 409);
      }
      if (!["DRAFT", "CHANGES_REQUESTED"].includes(draft.reviewStatus ?? "DRAFT")) {
        throw mockRequestError("当前审核状态不允许再次提交", 409);
      }
      draft.reviewStatus = "IN_REVIEW";
      draft.submittedAt = new Date().toISOString();
      draft.submittedBy = 1;
      draft.reviewNote = null;
      persistMockPageDocuments();
      return mockRes(cloneMockDocument(draft));
    }
    return api.post("/page-modules/document/review/submit", {
      pageKey,
      locale,
      expectedUpdatedAt,
      expectedContentHash,
    }, { suppressGlobalError: true });
  },
  review: async (
    pageKey: string,
    locale: PublicContentLocale,
    expectedUpdatedAt: string,
    expectedContentHash: string,
    action: "APPROVE" | "REQUEST_CHANGES",
    note?: string,
    selfReviewAcknowledged = false,
  ) => {
    if (USE_MOCK) {
      await mockDelay(140);
      const store = loadMockPageDocuments();
      const draft = store.drafts[pageLocaleStoreKey(pageKey, locale)];
      if (!draft || draft.updatedAt !== expectedUpdatedAt || draft.contentHash !== expectedContentHash) {
        throw mockRequestError("页面内容已变化，请重新加载后再审核", 409);
      }
      if (draft.reviewStatus !== "IN_REVIEW") throw mockRequestError("页面不在待审核状态", 409);
      if (draft.submittedBy === 1 && !selfReviewAcknowledged) {
        throw mockRequestError("页面内容提交人与审核人必须分离；超级管理员自审须单独明确确认", 400);
      }
      if (action === "REQUEST_CHANGES" && !note?.trim()) throw mockRequestError("退回修改必须填写原因", 400);
      draft.reviewStatus = action === "APPROVE" ? "APPROVED" : "CHANGES_REQUESTED";
      draft.reviewedAt = new Date().toISOString();
      draft.reviewedBy = 1;
      draft.reviewNote = note?.trim() || null;
      persistMockPageDocuments();
      return mockRes(cloneMockDocument(draft));
    }
    return api.put("/page-modules/document/review", {
      pageKey,
      locale,
      expectedUpdatedAt,
      expectedContentHash,
      action,
      reviewNote: note,
      selfReviewAcknowledged,
    }, { suppressGlobalError: true });
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
