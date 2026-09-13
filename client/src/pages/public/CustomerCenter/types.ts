export type CustomerOrderItem = {
  id: number;
  productId: number;
  quantity?: number;
  product?: { name: string };
};

export type CustomerAfterSalesCase = {
  id: number;
  caseNo: string;
  orderItemId?: number | null;
  type: string;
  status: string;
  reason: string;
  requestedRefundAmount?: number | string | null;
  approvedRefundAmount?: number | string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerOrder = {
  id: number;
  orderNo: string;
  finalAmount: number | string;
  status: string;
  orderType?: string;
  paymentMethod?: string | null;
  quoteChannel?: "RETAIL" | "CUSTOM" | "PARTNER_WAX" | null;
  createdAt: string;
  paymentConfirmedAt?: string | null;
  shippedAt?: string | null;
  completedAt?: string | null;
  logisticsCompany?: string | null;
  logisticsNo?: string | null;
  items?: CustomerOrderItem[];
  quotedLines?: Array<{
    id: number;
    description: string;
    quantity: number;
    unitAmount: number | string;
    lineAmount: number | string;
    waxType?: "RED" | "PURPLE" | null;
  }>;
  payments?: Array<{
    id: number;
    status: string;
    method?: string;
    paymentNo?: string;
    hasProof?: boolean;
  }>;
  fulfillments?: Array<{
    id: number;
    status: string;
    carrier?: string | null;
    trackingNo?: string | null;
    shippedAt?: string | null;
    deliveredAt?: string | null;
  }>;
  refunds?: Array<{
    id: number;
    refundNo: string;
    amount: number | string;
    reason?: string | null;
    status: string;
    createdAt: string;
    completedAt?: string | null;
  }>;
  afterSalesCases?: CustomerAfterSalesCase[];
  timeline?: Array<{
    id: number;
    eventType: string;
    entityType: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    createdAt: string;
  }>;
};

export type CustomerReviewOrder = {
  id: number;
  items: CustomerOrderItem[];
};

export type CustomerNotification = {
  id: number;
  type: string;
  locale: "ZH_CN" | "EN";
  title: string;
  body: string;
  actionUrl?: string | null;
  status: "AVAILABLE" | "READ";
  availableAt: string;
  readAt?: string | null;
  createdAt: string;
};

export type CustomerNotificationPage = {
  list: CustomerNotification[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
};

export type CustomerNotificationPreference = {
  channel: "EMAIL" | "SMS";
  topic:
    | "SERVICE_ORDER_CREATED"
    | "SERVICE_PAYMENT_CONFIRMED"
    | "SERVICE_ORDER_SHIPPED"
    | "SERVICE_ORDER_CANCELLED"
    | "SERVICE_ORDER_COMPLETED"
    | "SERVICE_REFUND_COMPLETED"
    | "SERVICE_CONSULTATION_REPLIED"
    | "MARKETING_GENERAL";
  enabled: boolean;
  defaulted: boolean;
  updatedAt: string | null;
  requiresMarketingConsent: boolean;
};

export type CustomerNotificationPreferenceResource = {
  list: CustomerNotificationPreference[];
  marketingConsentGranted: boolean;
};

export type CustomerProfile = {
  id: number;
  name: string | null;
  phone: string;
  email: string | null;
  hasPassword?: boolean;
  avatarUrl?: string | null;
  phoneChangeAvailableAt?: string | null;
  emailChangeAvailableAt?: string | null;
  updatedAt?: string;
};

export type CustomerAddress = {
  id: number;
  recipientName: string;
  recipientPhone: string;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  detail: string;
};

export type CustomerSelectionInquiry = {
  id: number;
  leadId?: number | null;
  status: string;
  message?: string | null;
  createdAt: string;
  updatedAt?: string;
  items?: Array<{ productNameSnapshot: string }>;
  reply?: CustomerConsultationReply | null;
};

export type CustomerInquiry = {
  id: number;
  leadId?: number | null;
  status: string;
  message?: string;
  createdAt: string;
  updatedAt?: string;
  consultationType?: string | null;
  preferredContact?: string | null;
  preferredTime?: string | null;
  budgetRange?: string | null;
  product?: { name?: string | null } | null;
  reply?: CustomerConsultationReply | null;
};

export type CustomerConsultationReply = {
  id: number;
  content: string;
  createdAt: string;
};

export type CustomerConsultationDetail = {
  leadId: number;
  sourceId: number;
  type: "inquiry" | "selection";
  status: string;
  message?: string | null;
  createdAt: string;
  updatedAt: string;
  consultationType?: string | null;
  preferredContact?: string | null;
  preferredTime?: string | null;
  budgetRange?: string | null;
  product?: { name: string } | null;
  items: Array<{ productNameSnapshot: string }>;
  reply?: CustomerConsultationReply | null;
};

export type CustomerInquiryPage = {
  list: CustomerInquiry[];
  total: number;
  page: number;
  pageSize: number;
};

export type CustomerPartnerState = {
  customer?: {
    accountType?: string;
    partnerStatus?: string;
    partnerApprovedAt?: string | null;
  } | null;
  latest?: { reviewNote?: string | null } | null;
} | null;
