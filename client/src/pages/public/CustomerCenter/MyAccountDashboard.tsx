// 客户中心登录态主面板：账户总览/心愿单/订单(可视化进度+物流轨迹+评价)/个人资料(导出与注销)/地址管理
import { useCallback, useEffect, useRef, useState } from "react";
import RouteLoading from "@/components/common/RouteLoading";
import { ListingCartButton } from "@/components/common/ListingCartButton";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRightOutlined } from "@ant-design/icons";
import {
  App as AntdApp,
  Modal,
  Upload,
  Form,
  Input,
  Button,
  Checkbox,
  Pagination,
  Radio,
  Tag,
} from "antd";
import { cartApi, customerApi, customerQuotationApi, type CustomerAddressInput } from "@/services/api";
import { clampProductTitle } from "@/utils/productTitleLength";
import {
  customerProfileApi,
  type ContactChangeChallenge,
  type ContactChangeType,
} from "@/services/clients/customerProfileClient";
import { getRequestErrorMessage } from "@/services/httpClient";
import {
  currentSessionEpoch,
  isCurrentSessionEpoch,
} from "@/services/sessionEpoch";
import { unwrapResponse } from "@/utils/unwrap";
import {
  useCommerceCapabilities,
  useCommerceEnabled,
} from "@/store/featureFlags";
import { SecureImage } from "@/components/common/SecureImage";
import { buildResponsiveUploadsDerivedUrl } from "@/utils/responsiveUploadsImage";
import { withPublicMediaWidth } from "@/utils/publicMediaWidth";
import { getListingImage } from "@/utils/productImage";
import { publicProductPath } from "@/utils/publicProductPath";
import CustomerPaymentDialog, {
  type CustomerPaymentOrder,
} from "@/components/commerce/CustomerPaymentDialog";
import CustomerAfterSalesDialog, {
  getCustomerAfterSalesError,
  getRequestableAfterSalesItems,
} from "./CustomerAfterSalesDialog";
import CustomerOrdersPanel from "./CustomerOrdersPanel";
import CustomerQuotationsPanel from "./CustomerQuotationsPanel";
import CustomerReviewDialog from "./CustomerReviewDialog";
import CustomerNotificationsPanel from "./CustomerNotificationsPanel";
import {
  ACCOUNT_PASSWORD_HINT,
  ACCOUNT_PASSWORD_MAX_LENGTH,
  EXISTING_PASSWORD_MAX_LENGTH,
  isAccountPasswordValid,
} from "@/config/accountPasswordPolicy";
import type {
  CustomerAfterSalesCase,
  CustomerConsultationDetail,
  CustomerConsultationHandlingState,
  CustomerConsultationNextAction,
  CustomerConsultationReply,
  CustomerNotificationPage,
  CustomerOrder,
  CustomerReviewOrder,
  CustomerAddress,
  CustomerInquiryPage,
  CustomerPartnerState,
  CustomerProfile,
  CustomerSelectionInquiry,
} from "./types";
import "./MyAccountDashboard.css";

type AccountDashboardProps = {
  profile: CustomerProfile | null;
  orders: CustomerOrder[];
  addresses: CustomerAddress[];
  selectionInquiries: CustomerSelectionInquiry[];
  selectionInquiryLoading: boolean;
  selectionInquiryError: string | null;
  onRetrySelectionInquiries: () => Promise<void>;
  selectedLeadId: number | null;
  invalidSelectedLeadTarget: boolean;
  consultationDetail: CustomerConsultationDetail | null;
  consultationLoading: boolean;
  consultationError: "not-found" | "error" | null;
  onRetryConsultation?: () => Promise<void>;
  inquiryPage: CustomerInquiryPage;
  inquiryLoading: boolean;
  inquiryError: string | null;
  onInquiryPageChange: (page: number) => Promise<void>;
  partner: CustomerPartnerState;
  partnerError: string | null;
  notifications: CustomerNotificationPage;
  notificationLoading: boolean;
  notificationError: string | null;
  onRetryNotifications: () => Promise<void>;
  onReadNotification: (id: number) => Promise<void>;
  onReadAllNotifications: () => Promise<void>;
  onSignOut: () => void;
  onRefresh?: () => void | Promise<void>;
};

type AccountAddress = AccountDashboardProps["addresses"][number];

const inquiryStatus: Record<string, string> = {
  PENDING: "待顾问联系",
  PROCESSING: "顾问跟进中",
  CONTACTED: "已联系",
  FOLLOWING: "持续跟进中",
  REPLIED: "已回复",
  COMPLETED: "已完成",
  INVALID: "已关闭",
  CLOSED: "已结束",
};

const consultationHandlingState: Record<CustomerConsultationHandlingState, string> = {
  WAITING_ASSIGNMENT: "当前责任：顾问团队正在接收",
  ADVISOR_ASSIGNED: "当前责任：海川顾问已接手",
  IN_PROGRESS: "当前责任：海川顾问持续跟进",
  CLOSED: "当前责任：本次咨询已结束",
};

const consultationNextAction: Record<CustomerConsultationNextAction, string> = {
  WAIT_FOR_ADVISOR: "下一步：请留意客户中心的服务通知。",
  REVIEW_ADVISOR_REPLY: "下一步：请查看最新回复，并留意后续服务通知。",
  START_NEW_CONSULTATION: "下一步：如仍需服务，请重新发起咨询。",
};

// 合作商家身份状态文案（与后端 PartnerStatus 对齐）
const PARTNER_STATUS_LABEL: Record<string, string> = {
  NONE: "尚未申请合作商家身份",
  PENDING: "合作申请审核中",
  NEEDS_SUPPLEMENT: "合作申请待补充资料",
  REJECTED: "合作申请未通过",
  SUSPENDED: "合作资格已暂停",
};

type AddressCreateAttempt = {
  fingerprint: string;
  key: string;
};

type AvatarUploadAttempt = {
  fingerprint: string;
  key: string;
};

const avatarUploadAttemptStorageKey = (customerId: number) =>
  `hc:customer-avatar-upload-attempt:${customerId}`;

async function hashAvatarUploadFile(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function readAvatarUploadAttempt(customerId: number): AvatarUploadAttempt | null {
  try {
    const raw = sessionStorage.getItem(avatarUploadAttemptStorageKey(customerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AvatarUploadAttempt>;
    return typeof parsed.fingerprint === "string" && typeof parsed.key === "string"
      ? { fingerprint: parsed.fingerprint, key: parsed.key }
      : null;
  } catch {
    return null;
  }
}

function persistAvatarUploadAttempt(
  customerId: number,
  attempt: AvatarUploadAttempt,
) {
  try {
    const serialized = JSON.stringify(attempt);
    const key = avatarUploadAttemptStorageKey(customerId);
    sessionStorage.setItem(key, serialized);
    return sessionStorage.getItem(key) === serialized;
  } catch {
    return false;
  }
}

function clearAvatarUploadAttempt(customerId: number) {
  try {
    sessionStorage.removeItem(avatarUploadAttemptStorageKey(customerId));
  } catch {
    // 已取得权威结论，不让浏览器存储清理失败覆盖业务结果。
  }
}

const addressCreateAttemptStorageKey = (customerId: number) =>
  `hc:customer-address-create-attempt:${customerId}`;

function normalizeAddressCreatePayload(values: CustomerAddressInput): CustomerAddressInput {
  return {
    recipientName: values.recipientName.trim(),
    recipientPhone: values.recipientPhone.trim(),
    province: values.province?.trim() || undefined,
    city: values.city?.trim() || undefined,
    district: values.district?.trim() || undefined,
    detail: values.detail.trim(),
    postalCode: values.postalCode?.trim() || undefined,
    isDefault: values.isDefault === true,
  };
}

async function hashAddressCreateRequest(
  customerId: number,
  payload: CustomerAddressInput,
) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify({ customerId, ...payload })),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function readAddressCreateAttempt(customerId: number): AddressCreateAttempt | null {
  try {
    const raw = sessionStorage.getItem(addressCreateAttemptStorageKey(customerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AddressCreateAttempt>;
    return typeof parsed.fingerprint === "string" && typeof parsed.key === "string"
      ? { fingerprint: parsed.fingerprint, key: parsed.key }
      : null;
  } catch {
    return null;
  }
}

function persistAddressCreateAttempt(
  customerId: number,
  attempt: AddressCreateAttempt,
) {
  try {
    const serialized = JSON.stringify(attempt);
    const key = addressCreateAttemptStorageKey(customerId);
    sessionStorage.setItem(key, serialized);
    return sessionStorage.getItem(key) === serialized;
  } catch {
    return false;
  }
}

function clearAddressCreateAttempt(customerId: number) {
  try {
    sessionStorage.removeItem(addressCreateAttemptStorageKey(customerId));
  } catch {
    // 已取得权威成功或确定拒绝，不让清理失败覆盖业务结果。
  }
}

function getAddressRequestStatus(error: unknown) {
  const candidate = error as {
    status?: unknown;
    response?: { status?: unknown };
  };
  const status = candidate?.status ?? candidate?.response?.status;
  return typeof status === "number" ? status : null;
}

type SecurityWriteReconciliation =
  | { kind: "ACTIVE"; profile: CustomerProfile }
  | { kind: "SESSION_INVALID" }
  | { kind: "UNKNOWN" }
  | { kind: "STALE" };

async function reconcileSecurityWrite(
  operationEpoch: number,
): Promise<SecurityWriteReconciliation> {
  try {
    const response = await customerApi.getProfile();
    if (!isCurrentSessionEpoch("customer", operationEpoch)) {
      return { kind: "STALE" };
    }
    return {
      kind: "ACTIVE",
      profile: unwrapResponse<CustomerProfile>(response),
    };
  } catch (error: unknown) {
    // 401 的响应拦截器会先清理失效会话并推进 epoch；先识别该确定状态，
    // 再把真正属于其他新身份的迟到响应按 STALE 丢弃。
    if (getAddressRequestStatus(error) === 401) {
      return { kind: "SESSION_INVALID" };
    }
    if (!isCurrentSessionEpoch("customer", operationEpoch)) {
      return { kind: "STALE" };
    }
    return { kind: "UNKNOWN" };
  }
}

function getAddressCreateError(error: unknown) {
  const candidate = error as {
    status?: unknown;
    response?: { status?: unknown; data?: { message?: unknown } };
  };
  const status = getAddressRequestStatus(error);
  const responseMessage = candidate?.response?.data?.message;
  return status !== null
    && status >= 400
    && status < 500
    && typeof responseMessage === "string"
    && responseMessage.trim()
    ? responseMessage
    : "地址保存结果待确认；请保持当前内容不变并重试，系统会沿用同一凭据恢复结果。";
}

function getAddressDeleteError(error: unknown) {
  const candidate = error as {
    response?: { data?: { message?: unknown } };
  };
  const status = getAddressRequestStatus(error);
  const responseMessage = candidate?.response?.data?.message;
  return status !== null
    && status >= 400
    && status < 500
    && typeof responseMessage === "string"
    && responseMessage.trim()
    ? responseMessage
    : "地址删除结果待确认；请重试，重复删除不会影响其他地址。";
}

function addressMatchesUpdate(
  address: CustomerAddress,
  payload: CustomerAddressInput,
) {
  const optionalText = (value: string | null | undefined) => value?.trim() || null;
  return address.recipientName === payload.recipientName
    && address.recipientPhone === payload.recipientPhone
    && optionalText(address.province) === optionalText(payload.province)
    && optionalText(address.city) === optionalText(payload.city)
    && optionalText(address.district) === optionalText(payload.district)
    && address.detail === payload.detail
    && optionalText(address.postalCode) === optionalText(payload.postalCode)
    && address.isDefault === (payload.isDefault === true);
}

// 合作商家区块入口动作：按状态给出可操作目标
const PARTNER_ACTION: Record<string, { label: string; to: string }> = {
  NONE: { label: "申请合作商家", to: "/customer?section=partner" },
  PENDING: { label: "查看进度", to: "/customer?section=partner" },
  NEEDS_SUPPLEMENT: { label: "补充资料", to: "/customer?section=partner" },
  REJECTED: { label: "重新申请", to: "/customer?section=partner" },
  SUSPENDED: { label: "联系顾问", to: "/contact" },
  APPROVED: { label: "查看合作作品", to: "/catalog" },
};

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="my-account-empty">{children}</p>;
}

const NAV_ICON_PATHS = {
  overview: "M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z",
  selections: "M4 7h16M4 12h16M4 17h10",
  appointments: "M7 3.5v3M17 3.5v3M4.5 8.5h15M6 5h12a1.5 1.5 0 0 1 1.5 1.5V19H4.5V6.5A1.5 1.5 0 0 1 6 5z",
  favorites: "M12 19.2s-6.5-4.1-6.5-8.2A3.6 3.6 0 0 1 12 8.2a3.6 3.6 0 0 1 6.5 2.8c0 4.1-6.5 8.2-6.5 8.2z",
  quotations: "M7 3.5h7.2L18.5 8v12.5H7zM14 3.5V8h4.5M9.5 12.5h6M9.5 16h6",
  orders: "M6.5 7.5h11l-.9 12H7.4zM9 7.5V5.2h6V7.5",
  profile: "M12 12.2a3.4 3.4 0 1 0-3.4-3.4 3.4 3.4 0 0 0 3.4 3.4zM6.2 19.2a5.8 5.8 0 0 1 11.6 0",
  addresses: "M12 20.5s6-5.1 6-9.6a6 6 0 1 0-12 0c0 4.5 6 9.6 6 9.6zM12 11.2a1.6 1.6 0 1 0-1.6-1.6 1.6 1.6 0 0 0 1.6 1.6z",
  notifications: "M6 16.5h12l-1.2-2V10.2a4.8 4.8 0 0 0-9.6 0v4.3zM10 16.5a2 2 0 0 0 4 0",
} as const;

function AccountNavIcon({ name }: { name: keyof typeof NAV_ICON_PATHS }) {
  return (
    <svg className="my-account__nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={NAV_ICON_PATHS[name]} />
    </svg>
  );
}

function maskAccountPhone(phone: string | null | undefined) {
  const value = phone?.trim() ?? "";
  if (!value) return "—";
  if (/^1\d{10}$/.test(value)) return `${value.slice(0, 3)}****${value.slice(7)}`;
  if (value.length >= 7) return `${value.slice(0, 2)}****${value.slice(-2)}`;
  return value;
}

const accountServices = [
  { key: "selections", target: "my-selections", title: "我的选款" },
  { key: "appointments", target: "my-appointments", title: "我的预约" },
  { key: "favorites", target: "my-favorites", title: "我的心愿单" },
  { key: "quotations", target: "my-quotations", title: "我的报价" },
  { key: "orders", target: "my-orders", title: "我的订单" },
  { key: "profile", target: "my-profile", title: "个人资料" },
  { key: "addresses", target: "my-addresses", title: "收货地址" },
  { key: "notifications", target: "my-notifications", title: "服务通知" },
] as const;

const accountServiceGroups: ReadonlyArray<{
  title: string;
  services: ReadonlyArray<typeof accountServices[number]["key"]>;
}> = [
  { title: "我的珍藏", services: ["selections", "favorites"] },
  { title: "专属服务", services: ["appointments", "notifications"] },
  { title: "交易记录", services: ["quotations", "orders"] },
  { title: "账户设置", services: ["profile", "addresses"] },
];

const ACTIONABLE_ORDER_LABEL: Record<string, string> = {
  NEED_CONFIRM: "需要确认",
  QUOTE_CONFIRM: "确认报价",
  PENDING_DEPOSIT: "待付定金",
  DESIGN_CONFIRM: "确认设计",
  PENDING_PAYMENT: "待付款",
  SHIPPED: "已发货",
};

type WatchedBagItem = {
  id: number;
  productId: number;
  name: string;
  code?: string | null;
  image: string;
};

function readBagPreview(response: unknown): WatchedBagItem[] {
  const payload = unwrapResponse<unknown>(response);
  const list = Array.isArray(payload) ? payload : [];
  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as {
      id?: unknown;
      productId?: unknown;
      product?: { name?: unknown; code?: unknown; images?: unknown; listingImage?: unknown; primaryImage?: unknown };
    };
    if (typeof row.id !== "number" || typeof row.productId !== "number") return [];
    const name = typeof row.product?.name === "string" ? row.product.name : "作品";
    const code = typeof row.product?.code === "string" ? row.product.code : null;
    return [{
      id: row.id,
      productId: row.productId,
      name,
      code,
      image: getListingImage(
        row.product && typeof row.product === "object"
          ? row.product as Parameters<typeof getListingImage>[0]
          : null,
      ),
    }];
  });
}

function readPendingQuotes(response: unknown): Array<{ id: number; quoteNo: string }> {
  const payload = unwrapResponse<unknown>(response);
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { list?: unknown }).list)
      ? (payload as { list: unknown[] }).list
      : [];
  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const quote = item as { id?: unknown; quoteNo?: unknown; status?: unknown };
    if (quote.status !== "PENDING_CONFIRM" || typeof quote.id !== "number" || typeof quote.quoteNo !== "string") return [];
    return [{ id: quote.id, quoteNo: quote.quoteNo }];
  });
}

function resolveAccountService(search: string, hash: string) {
  const sections = new URLSearchParams(search).getAll("section");
  const section = sections.length === 1 ? sections[0] : null;
  const legacySection = section === "quote" ? "quotations" : section === "inquiry" ? "appointments" : section;
  return accountServices.find(({ target }) => hash === `#${target}`)
    ?? accountServices.find(({ key }) => key === legacySection);
}

function parseCanonicalOrderTarget(search: string): {
  orderId: number | null;
  invalid: boolean;
} {
  const params = new URLSearchParams(search);
  const orderIds = params.getAll("orderId");
  if (orderIds.length === 0) return { orderId: null, invalid: false };

  const keys = Array.from(params.keys());
  const sections = params.getAll("section");
  const hasExactShape = keys.length === 2
    && new Set(keys).size === 2
    && keys.includes("section")
    && keys.includes("orderId")
    && sections.length === 1
    && orderIds.length === 1
    && sections[0] === "orders";
  const rawOrderId = orderIds[0];
  if (!hasExactShape || !/^[1-9]\d*$/.test(rawOrderId)) {
    return { orderId: null, invalid: true };
  }

  const orderId = Number(rawOrderId);
  return Number.isSafeInteger(orderId)
    ? { orderId, invalid: false }
    : { orderId: null, invalid: true };
}

function ConsultationProgress({
  handlingState,
  nextAction,
  restartTo,
}: {
  handlingState?: CustomerConsultationHandlingState | null;
  nextAction?: CustomerConsultationNextAction | null;
  restartTo: "/catalog" | "/contact";
}) {
  if (!handlingState || !nextAction) return null;
  return (
    <div className="my-account__service-status" aria-label="咨询处理进度">
      <span>{consultationHandlingState[handlingState]}</span>
      <span>{consultationNextAction[nextAction]}</span>
      {nextAction === "START_NEW_CONSULTATION" ? (
        <Link className="my-account__inline-retry" to={restartTo}>
          {restartTo === "/catalog" ? "重新进入选款中心" : "重新发起预约咨询"}
        </Link>
      ) : null}
    </div>
  );
}

function ConsultationDetail({
  detailId,
  message,
  reply,
  selected,
  children,
}: {
  detailId: string;
  message?: string | null;
  reply?: CustomerConsultationReply | null;
  selected: boolean;
  children?: React.ReactNode;
}) {
  return (
    <details
      id={detailId}
      className="my-account__consultation-detail"
      open={selected}
      tabIndex={-1}
    >
      <summary>查看详情</summary>
      <div className="my-account__consultation-body">
        {children}
        <div>
          <h4>我的需求</h4>
          <p>{message || "提交时未填写补充说明。"}</p>
        </div>
        <div className="my-account__consultation-reply">
          <h4>顾问回复</h4>
          {reply ? (
            <>
              <p>{reply.content}</p>
              <small>
                海川顾问 · {new Date(reply.createdAt).toLocaleString("zh-CN")}
              </small>
            </>
          ) : (
            <p>顾问尚未回复，请留意服务通知和当前处理状态。</p>
          )}
        </div>
      </div>
    </details>
  );
}

function ConsultationContext({ detail }: { detail: CustomerConsultationDetail }) {
  if (detail.type === "selection") {
    return (
      <div>
        <h4>所选作品</h4>
        <p>
          {detail.items.map((item) => clampProductTitle(item.productNameSnapshot)).join("、")
            || "历史记录未保留作品名称。"}
        </p>
      </div>
    );
  }
  return (
    <div>
      <h4>服务信息</h4>
      <p>
        {[
          detail.preferredContact
            ? `联系偏好：${detail.preferredContact}`
            : null,
          detail.preferredTime ? `方便时间：${detail.preferredTime}` : null,
          detail.budgetRange ? `预算范围：${detail.budgetRange}` : null,
        ].filter(Boolean).join("；") || "暂无补充服务信息。"}
      </p>
    </div>
  );
}

export default function MyAccountDashboard({
  profile,
  partner,
  orders,
  addresses,
  selectionInquiries,
  selectionInquiryLoading,
  selectionInquiryError,
  onRetrySelectionInquiries,
  selectedLeadId,
  invalidSelectedLeadTarget,
  consultationDetail,
  consultationLoading,
  consultationError,
  onRetryConsultation,
  inquiryPage,
  inquiryLoading,
  inquiryError,
  onInquiryPageChange,
  notifications,
  notificationLoading,
  notificationError,
  onRetryNotifications,
  onReadNotification,
  onReadAllNotifications,
  onSignOut,
  onRefresh,
  partnerError,
}: AccountDashboardProps) {
  const { message, modal } = AntdApp.useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const name = profile?.name || "海川贵宾";
  const commerceEnabled = useCommerceEnabled();
  const { flags: commerceFlags } = useCommerceCapabilities();
  const paymentEnabled = commerceFlags?.paymentEnabled ?? false;
  const inquiries = inquiryPage.list;
  const partnerStatus = partner?.customer?.partnerStatus || "NONE";
  const partnerApprovedAt = partner?.customer?.partnerApprovedAt || null;
  const [selectionPage, setSelectionPage] = useState(1);
  const [targetOrderId, setTargetOrderId] = useState<number | null>(null);
  const [targetOrder, setTargetOrder] = useState<CustomerOrder | null>(null);
  const [targetOrderLoading, setTargetOrderLoading] = useState(false);
  const [targetOrderError, setTargetOrderError] = useState<"not-found" | "error" | null>(null);
  const targetOrderRequestRef = useRef(0);
  const canonicalOrderTarget = parseCanonicalOrderTarget(location.search);
  const canonicalOrderId = canonicalOrderTarget.orderId;
  const invalidCanonicalOrderTarget = canonicalOrderTarget.invalid;
  const requestedService = resolveAccountService(location.search, location.hash);
  const hasConsultationTarget = selectedLeadId !== null || invalidSelectedLeadTarget;
  const hasOrderTarget = canonicalOrderId !== null || invalidCanonicalOrderTarget;
  const sectionQuery = new URLSearchParams(location.search).get("section");
  const activeSection = hasConsultationTarget && (sectionQuery === "consultations" || !hasOrderTarget)
    ? "consultations"
    : hasOrderTarget
      ? "orders"
      : sectionQuery === "consultations" ? "consultations" : requestedService?.key;
  const focusTarget = activeSection === "orders" ? "my-orders" : requestedService?.target;
  const isOverview = !activeSection;

  const consultationActivity = [
    ...selectionInquiries.map((record) => ({ ...record, section: "selections" })),
    ...inquiries.map((record) => ({ ...record, section: "appointments" })),
  ].sort((left, right) => Date.parse(right.reply?.createdAt || right.createdAt) - Date.parse(left.reply?.createdAt || left.createdAt));
  const latestReply = consultationActivity.find((record) => Boolean(record.reply));
  const latestOrder = [...orders].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
  const currentConsultation = latestReply || (!latestOrder ? consultationActivity[0] : undefined);
  const consultationActivityUrl = currentConsultation?.leadId
    ? `/customer?section=consultations&leadId=${currentConsultation.leadId}`
    : `/customer?section=${currentConsultation?.section}`;
  const selectionPageSize = 3;
  const selectionPageCount = Math.max(
    1,
    Math.ceil(selectionInquiries.length / selectionPageSize),
  );
  const visibleSelectionInquiries = selectionInquiries.slice(
    (selectionPage - 1) * selectionPageSize,
    selectionPage * selectionPageSize,
  );

  useEffect(() => {
    if (selectionPage <= selectionPageCount) return;
    setSelectionPage(selectionPageCount);
  }, [selectionPage, selectionPageCount]);

  useEffect(() => {
    setTargetOrderId(canonicalOrderId);
  }, [canonicalOrderId, invalidCanonicalOrderTarget]);

  const loadCanonicalTargetOrder = useCallback(async (orderId: number) => {
    const requestVersion = ++targetOrderRequestRef.current;
    const requestEpoch = currentSessionEpoch("customer");
    setTargetOrder((current) => current?.id === orderId ? current : null);
    setTargetOrderLoading(true);
    setTargetOrderError(null);
    try {
      const response = await customerApi.getOrder(orderId);
      if (
        targetOrderRequestRef.current !== requestVersion
        || !isCurrentSessionEpoch("customer", requestEpoch)
      ) return;
      const exactOrder = unwrapResponse<CustomerOrder>(response);
      if (!exactOrder || exactOrder.id !== orderId) {
        throw new Error("订单定位响应不完整");
      }
      setTargetOrder(exactOrder);
    } catch (error) {
      if (
        targetOrderRequestRef.current !== requestVersion
        || !isCurrentSessionEpoch("customer", requestEpoch)
      ) return;
      const status = (error as { response?: { status?: unknown }; status?: unknown }).response?.status
        ?? (error as { status?: unknown }).status;
      setTargetOrder(null);
      setTargetOrderError(status === 404 ? "not-found" : "error");
    } finally {
      if (
        targetOrderRequestRef.current === requestVersion
        && isCurrentSessionEpoch("customer", requestEpoch)
      ) {
        setTargetOrderLoading(false);
      }
    }
  }, []);

  const targetOrderInList = canonicalOrderId !== null
    && orders.some((order) => order.id === canonicalOrderId);

  useEffect(() => {
    if (
      canonicalOrderId === null
      || invalidCanonicalOrderTarget
      || targetOrderInList
    ) {
      targetOrderRequestRef.current += 1;
      setTargetOrder(null);
      setTargetOrderLoading(false);
      setTargetOrderError(null);
      return;
    }
    void loadCanonicalTargetOrder(canonicalOrderId);
    return () => {
      targetOrderRequestRef.current += 1;
    };
  }, [
    canonicalOrderId,
    invalidCanonicalOrderTarget,
    loadCanonicalTargetOrder,
    targetOrderInList,
  ]);

  const locatedOrders = targetOrder && !orders.some((order) => order.id === targetOrder.id)
    ? [...orders, targetOrder]
    : orders;

  const retryCanonicalOrderTarget = useCallback(() => {
    if (canonicalOrderId !== null && !invalidCanonicalOrderTarget) {
      void loadCanonicalTargetOrder(canonicalOrderId);
    }
  }, [canonicalOrderId, invalidCanonicalOrderTarget, loadCanonicalTargetOrder]);

  const locateCanonicalOrder = useCallback((orderId: number) => {
    if (!Number.isSafeInteger(orderId) || orderId <= 0) return;
    const params = new URLSearchParams();
    params.set("section", "orders");
    params.set("orderId", String(orderId));
    setTargetOrderId(orderId);
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  }, [location.pathname, navigate]);

  const clearCanonicalOrderTarget = useCallback(() => {
    setTargetOrderId(null);
    navigate(`${location.pathname}?section=orders`, {
      replace: true,
    });
    requestAnimationFrame(() => {
      document.getElementById("my-orders")?.focus({ preventScroll: true });
    });
  }, [location.pathname, navigate]);

  const handleOrderLocated = useCallback((orderId: number) => {
    setTargetOrderId((current) => current === orderId ? null : current);
  }, []);

  useEffect(() => {
    if (selectedLeadId === null && !invalidSelectedLeadTarget) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById("consultation-focus");
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    consultationDetail,
    consultationError,
    consultationLoading,
    invalidSelectedLeadTarget,
    selectedLeadId,
  ]);

  useEffect(() => {
    if (hasConsultationTarget || canonicalOrderId !== null || !focusTarget) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(focusTarget);
      target?.scrollIntoView({ block: "start" });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [canonicalOrderId, focusTarget, hasConsultationTarget, location.key]);

  const clearConsultationUrl = (focusTargetId: string) => {
    if (!hasConsultationTarget) return;
    const service = accountServices.find(({ target }) => target === focusTargetId);
    navigate(service ? `${location.pathname}?section=${service.key}` : location.pathname, { replace: true });
  };

  const consultationTitle = consultationDetail?.type === "selection"
    ? clampProductTitle(consultationDetail.items[0]?.productNameSnapshot || "") || "选款咨询"
    : (consultationDetail?.product?.name
      ? clampProductTitle(consultationDetail.product.name)
      : consultationDetail?.consultationType)
      || "预约咨询";

  // 心愿单（组件自治拉取：CustomerCenter 无需为其扩展 props）
  const [favorites, setFavorites] = useState<
    Array<{
      id: number;
      productId: number;
      name: string;
      code?: string;
      shortDescription?: string | null;
      price?: number | string | null;
      salesMode?: string;
      image?: string | null;
      favoritedAt: string;
    }>
  >([]);
  const [favoriteStatus, setFavoriteStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");

  const loadFavorites = useCallback(async () => {
    setFavoriteStatus("loading");
    try {
      const response = await customerApi.getFavorites();
      setFavorites(unwrapResponse<typeof favorites>(response) || []);
      setFavoriteStatus("ready");
    } catch {
      setFavoriteStatus("error");
    }
  }, []);

  const removeFavorite = (productId: number) => {
    customerApi
      .setFavorite(productId, false)
      .then(() => {
        setFavorites((list) => list.filter((f) => f.productId !== productId));
      })
      .catch(() => message.error("移出失败，请稍后重试"));
  };

  useEffect(() => {
    if (activeSection === "favorites" || isOverview) void loadFavorites();
  }, [activeSection, isOverview, loadFavorites]);

  const [watchedBag, setWatchedBag] = useState<WatchedBagItem[]>([]);
  const [bagCount, setBagCount] = useState(0);
  const [bagWatchStatus, setBagWatchStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [pendingQuotes, setPendingQuotes] = useState<Array<{ id: number; quoteNo: string }>>([]);

  useEffect(() => {
    if (!isOverview) return;
    let cancelled = false;
    setBagWatchStatus("loading");
    void (async () => {
      try {
        const preview = readBagPreview(await cartApi.get());
        if (cancelled) return;
        setBagCount(preview.length);
        setWatchedBag(preview.slice(0, 4));
        setBagWatchStatus("ready");
      } catch {
        if (cancelled) return;
        setWatchedBag([]);
        setBagCount(0);
        setBagWatchStatus("error");
      }
    })();
    void (async () => {
      try {
        const pending = readPendingQuotes(await customerQuotationApi.list({ page: 1, pageSize: 20 }));
        if (!cancelled) setPendingQuotes(pending);
      } catch {
        if (!cancelled) setPendingQuotes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOverview]);

  const orderAttentionLabel = latestOrder
    ? (latestOrder.customStage ? ACTIONABLE_ORDER_LABEL[latestOrder.customStage] : undefined)
      || ACTIONABLE_ORDER_LABEL[latestOrder.status]
    : undefined;
  const attentionItems = [
    !notificationError && !notificationLoading && notifications.unreadCount > 0
      ? { key: "notifications", href: "/customer?section=notifications", title: `${notifications.unreadCount} 条未读服务通知`, detail: "查看服务消息" }
      : null,
    currentConsultation?.reply
      ? { key: "reply", href: consultationActivityUrl, title: "顾问已回复", detail: "查看最新回复" }
      : null,
    ...pendingQuotes.slice(0, 3).map((quote) => ({
      key: `quote-${quote.id}`,
      href: "/customer?section=quotations",
      title: `报价 ${quote.quoteNo} 等待确认`,
      detail: "查看报价",
    })),
    latestOrder && orderAttentionLabel
      ? { key: `order-${latestOrder.id}`, href: `/customer?section=orders&orderId=${latestOrder.id}`, title: `订单 ${latestOrder.orderNo}`, detail: orderAttentionLabel }
      : null,
  ].filter((item): item is { key: string; href: string; title: string; detail: string } => item !== null);
  const quoteOverflow = pendingQuotes.length > 3;
  const selectionPreview = [...selectionInquiries]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 3);
  const latestAppointment = [...inquiries]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
  const latestNotification = notificationError || notificationLoading ? undefined : notifications.list[0];
  const recentActivity = [
    latestAppointment
      ? {
          key: `appointment-${latestAppointment.id}`,
          href: latestAppointment.leadId
            ? `/customer?section=consultations&leadId=${latestAppointment.leadId}`
            : "/customer?section=appointments",
          label: "最近预约",
          title: latestAppointment.product?.name
            ? clampProductTitle(latestAppointment.product.name)
            : latestAppointment.consultationType || "预约咨询",
          detail: inquiryStatus[latestAppointment.status] || latestAppointment.status,
        }
      : null,
    pendingQuotes[0]
      ? {
          key: `quote-${pendingQuotes[0].id}`,
          href: "/customer?section=quotations",
          label: "最近报价",
          title: pendingQuotes[0].quoteNo,
          detail: "等待确认",
        }
      : null,
    latestOrder
      ? {
          key: `order-${latestOrder.id}`,
          href: `/customer?section=orders&orderId=${latestOrder.id}`,
          label: "最近订单",
          title: latestOrder.orderNo,
          detail: orderAttentionLabel || "查看订单",
        }
      : null,
    latestNotification
      ? {
          key: `notification-${latestNotification.id}`,
          href: latestNotification.actionUrl?.startsWith("/")
            ? latestNotification.actionUrl
            : "/customer?section=notifications",
          label: "最近服务通知",
          title: latestNotification.title,
          detail: latestNotification.status === "READ" ? "已读" : "未读",
        }
      : null,
  ].filter((item): item is { key: string; href: string; label: string; title: string; detail: string } => item !== null);
  const activitySettled = !inquiryLoading && !notificationLoading;
  const favoritePreview = favorites.slice(0, 4);

  // 特殊线下订单凭证兜底；标准零售主链使用客户本人发起的微信支付。
  const [proofOrderId, setProofOrderId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<CustomerPaymentOrder | null>(null);

  // 客户本人售后：只提交订单商品、类型和原因，不采集金额或后台字段。
  const [afterSalesOrder, setAfterSalesOrder] = useState<
    CustomerOrder | null
  >(null);
  const [cancellingAfterSalesId, setCancellingAfterSalesId] = useState<
    number | null
  >(null);

  // 个人资料编辑
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileForm] = Form.useForm();
  const [savingProfile, setSavingProfile] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm] = Form.useForm();
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordResultUncertain, setPasswordResultUncertain] = useState(false);
  const [passwordProof, setPasswordProof] = useState<"PASSWORD" | "SMS">("PASSWORD");
  const [contactOpen, setContactOpen] = useState(false);
  const [contactForm] = Form.useForm();
  const [contactType, setContactType] = useState<ContactChangeType>("PHONE");
  const [contactProof, setContactProof] = useState<"PASSWORD" | "SMS">("PASSWORD");
  const [contactChallenge, setContactChallenge] = useState<ContactChangeChallenge | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [contactResultUncertain, setContactResultUncertain] = useState(false);
  const [sendingSecurityCode, setSendingSecurityCode] = useState(false);
  const [securityCodeCooldown, setSecurityCodeCooldown] = useState(0);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deletingAvatar, setDeletingAvatar] = useState(false);
  // 地址管理
  const [addressOpen, setAddressOpen] = useState(false);
  const [addressForm] = Form.useForm();
  const [savingAddress, setSavingAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);

  // 评价（已完成订单 → 先审后展）
  const [reviewOrder, setReviewOrder] = useState<CustomerReviewOrder | null>(
    null,
  );

  // 合规：数据导出 + 注销
  const [exportingData, setExportingData] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeProof, setCloseProof] = useState<"PASSWORD" | "SMS">("PASSWORD");
  const [closePassword, setClosePassword] = useState("");
  const [closeSmsCode, setCloseSmsCode] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeResultUncertain, setCloseResultUncertain] = useState(false);

  const handleExportData = async () => {
    setExportingData(true);
    try {
      const res = await customerApi.exportMyData();
      const data = unwrapResponse<unknown>(res);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `haichuan-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      message.error(getRequestErrorMessage(error, "导出失败，请稍后重试"));
    } finally {
      setExportingData(false);
    }
  };

  const handleCloseAccount = async () => {
    if (closeResultUncertain) {
      message.warning("注销结果仍待确认，请刷新页面或重新登录确认后再操作。");
      return;
    }
    if (closeProof === "PASSWORD" && !closePassword) {
      message.warning("请输入登录密码确认");
      return;
    }
    if (closeProof === "SMS" && !/^\d{6}$/.test(closeSmsCode)) {
      message.warning("请输入 6 位当前手机号验证码");
      return;
    }
    const operationEpoch = currentSessionEpoch("customer");
    setClosing(true);
    try {
      const response = await customerProfileApi.closeAccount(
        closeProof === "PASSWORD"
          ? { password: closePassword }
          : { currentSmsCode: closeSmsCode },
      );
      const result = unwrapResponse<{ retainedUnderLegalHold?: number }>(response);
      if ((result.retainedUnderLegalHold ?? 0) > 0) {
        message.warning("账户已注销；依法需要保留的咨询记录将在保留依据结束后继续处理");
      } else {
        message.success("账户已注销，关联咨询个人信息已匿名化");
      }
      onSignOut();
    } catch (error: unknown) {
      const status = getAddressRequestStatus(error);
      if (status === 401) {
        message.warning("注销结果待确认；当前登录状态已失效，请重新登录确认账户状态。");
        setCloseOpen(false);
        onSignOut();
        return;
      }
      if (!isCurrentSessionEpoch("customer", operationEpoch)) return;
      if (status === null || status >= 500) {
        const reconciliation = await reconcileSecurityWrite(operationEpoch);
        if (reconciliation.kind === "SESSION_INVALID") {
          message.warning("注销结果待确认；当前登录状态已失效，请重新登录确认账户状态。");
          setCloseOpen(false);
          onSignOut();
          return;
        }
        if (reconciliation.kind === "ACTIVE") {
          message.warning("注销未生效，账户仍处于登录状态；您可以安全重试。");
          return;
        }
        if (reconciliation.kind === "UNKNOWN") {
          setCloseResultUncertain(true);
          message.warning("注销结果待确认；系统不会自动重复注销，请刷新页面或重新登录确认。");
        }
        return;
      }
      message.error(getRequestErrorMessage(error, "注销失败"));
    } finally {
      if (isCurrentSessionEpoch("customer", operationEpoch)) {
        setClosing(false);
      }
    }
  };

  const openAccountClosure = () => {
    setCloseProof(profile?.hasPassword === false ? "SMS" : "PASSWORD");
    setClosePassword("");
    setCloseSmsCode("");
    setCloseOpen(true);
  };

  const openReview = (order: CustomerReviewOrder) => {
    setReviewOrder(order);
  };

  const openAfterSales = (order: CustomerOrder) => {
    const requestableItems = getRequestableAfterSalesItems(order);
    if (!requestableItems.length) {
      message.info("订单商品已有进行中的售后申请");
      return;
    }
    setAfterSalesOrder(order);
  };

  const cancelAfterSales = (
    caseRecord: CustomerAfterSalesCase,
    orderId: number,
  ) => {
    modal.confirm({
      title: "撤销售后申请？",
      content: "撤销后本次申请将结束；如仍需服务，可以重新提交。",
      okText: "确认撤销",
      cancelText: "暂不撤销",
      onOk: async () => {
        setCancellingAfterSalesId(caseRecord.id);
        try {
          await customerApi.cancelAfterSales(caseRecord.id);
          message.success("售后申请已撤销");
          onRefresh?.();
        } catch (error) {
          const status = (error as { status?: unknown; response?: { status?: unknown } })?.response?.status
            ?? (error as { status?: unknown })?.status;
          if (typeof status !== "number" || status >= 500) {
            try {
              const response = await customerApi.getOrder(orderId);
              const order = unwrapResponse<CustomerOrder>(response);
              const authoritative = order.afterSalesCases?.find(
                (candidate) => candidate.id === caseRecord.id,
              );
              onRefresh?.();
              if (authoritative?.status === "CANCELLED") {
                message.success("售后申请已撤销并完成权威核验");
                return;
              }
              if (authoritative?.status === "REQUESTED") {
                message.warning("撤销结果未确认，已刷新权威状态，可以安全重试。");
                return;
              }
              message.warning("售后申请状态已变化，已刷新权威状态。");
              return;
            } catch {
              message.warning("撤销结果待确认，暂未读取到权威状态，可以安全重试。");
              return;
            }
          }
          message.error(
            getCustomerAfterSalesError(
              error,
              "售后申请暂时无法撤销，请刷新后重试。",
            ),
          );
          return Promise.reject();
        } finally {
          setCancellingAfterSalesId(null);
        }
      },
    });
  };

  const handleUploadProof = async (file: File) => {
    if (proofOrderId == null) return;
    setUploading(true);
    try {
      await customerApi.uploadAndSubmitPaymentProof(proofOrderId, file);
      message.success("付款凭证已提交，等待审核");
      setProofOrderId(null);
      onRefresh?.();
    } catch (error: unknown) {
      message.error(getRequestErrorMessage(error, "凭证上传失败"));
    } finally {
      setUploading(false);
    }
  };

  const openProfileEdit = () => {
    setProfileEditOpen(true);
  };

  const saveProfile = async () => {
    const values = await profileForm.validateFields().catch(() => null);
    if (!values) return;
    const intendedName = String(values.name).trim().replace(/\s+/g, " ");
    const operationEpoch = currentSessionEpoch("customer");
    setSavingProfile(true);
    try {
      await customerProfileApi.updateName(intendedName);
      if (!isCurrentSessionEpoch("customer", operationEpoch)) return;
      message.success("资料已更新");
      setProfileEditOpen(false);
      await onRefresh?.();
    } catch (error: unknown) {
      if (!isCurrentSessionEpoch("customer", operationEpoch)) return;
      const status = getAddressRequestStatus(error);
      if (status === null || status >= 500) {
        const reconciliation = await reconcileSecurityWrite(operationEpoch);
        if (reconciliation.kind === "STALE") return;
        if (reconciliation.kind === "SESSION_INVALID") {
          message.warning("称呼更新结果待确认；当前登录状态已失效，请重新登录核对。");
          setProfileEditOpen(false);
          onSignOut();
          return;
        }
        if (reconciliation.kind === "ACTIVE") {
          const authoritativeName = reconciliation.profile.name?.trim().replace(/\s+/g, " ") ?? "";
          if (authoritativeName === intendedName) {
            message.success("称呼已更新并完成权威核验");
            setProfileEditOpen(false);
            await onRefresh?.();
            return;
          }
          message.warning("称呼更新未生效；系统已读取权威资料，您可以安全重试。");
          return;
        }
        message.error("称呼更新结果待确认；系统不会自动重复保存，请保留当前输入并稍后重试。");
        return;
      }
      message.error(getRequestErrorMessage(error, "保存失败"));
    } finally {
      if (isCurrentSessionEpoch("customer", operationEpoch)) {
        setSavingProfile(false);
      }
    }
  };

  useEffect(() => {
    if (securityCodeCooldown <= 0) return;
    const timer = window.setTimeout(
      () => setSecurityCodeCooldown((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [securityCodeCooldown]);

  const sendCurrentPhoneCode = async () => {
    setSendingSecurityCode(true);
    try {
      await customerProfileApi.requestCurrentPhoneCode();
      setSecurityCodeCooldown(60);
      message.success("验证码已发送至当前绑定手机号");
    } catch (error: unknown) {
      message.error(getRequestErrorMessage(error, "验证码发送失败"));
    } finally {
      setSendingSecurityCode(false);
    }
  };

  const sendAccountClosureCode = async () => {
    setSendingSecurityCode(true);
    try {
      await customerProfileApi.requestAccountClosureCode();
      setSecurityCodeCooldown(60);
      message.success("注销验证码已发送至当前绑定手机号");
    } catch (error: unknown) {
      message.error(getRequestErrorMessage(error, "注销验证码发送失败"));
    } finally {
      setSendingSecurityCode(false);
    }
  };

  const savePassword = async () => {
    if (passwordResultUncertain) {
      message.warning("密码修改结果仍待确认，请刷新页面或重新登录确认后再操作。");
      return;
    }
    const values = await passwordForm.validateFields().catch(() => null);
    if (!values) return;
    const operationEpoch = currentSessionEpoch("customer");
    setSavingPassword(true);
    try {
      const verification = passwordProof === "PASSWORD"
        ? { currentPassword: values.currentPassword as string }
        : { currentSmsCode: values.currentSmsCode as string };
      await customerProfileApi.changePassword(verification, values.newPassword);
      message.success("密码已修改，请重新登录");
      passwordForm.resetFields();
      setPasswordOpen(false);
      onSignOut();
    } catch (error: unknown) {
      const status = getAddressRequestStatus(error);
      if (status === 401) {
        message.warning("密码修改结果待确认；当前登录状态已失效，请使用预期密码重新登录确认。");
        passwordForm.resetFields();
        setPasswordOpen(false);
        onSignOut();
        return;
      }
      if (!isCurrentSessionEpoch("customer", operationEpoch)) return;
      if (status === null || status >= 500) {
        const reconciliation = await reconcileSecurityWrite(operationEpoch);
        if (reconciliation.kind === "SESSION_INVALID") {
          message.warning("密码修改结果待确认；当前登录状态已失效，请使用预期密码重新登录确认。");
          passwordForm.resetFields();
          setPasswordOpen(false);
          onSignOut();
          return;
        }
        if (reconciliation.kind === "ACTIVE") {
          message.warning("密码修改未生效，当前会话仍有效；您可以安全重试。");
          return;
        }
        if (reconciliation.kind === "UNKNOWN") {
          setPasswordResultUncertain(true);
          message.warning("密码修改结果待确认；系统不会自动重复修改，请刷新页面或重新登录确认。");
        }
        return;
      }
      message.error(getRequestErrorMessage(error, "密码修改失败"));
    } finally {
      if (isCurrentSessionEpoch("customer", operationEpoch)) {
        setSavingPassword(false);
      }
    }
  };

  const openPasswordChange = () => {
    passwordForm.resetFields();
    setPasswordProof(profile?.hasPassword === false ? "SMS" : "PASSWORD");
    setPasswordOpen(true);
  };

  const openContactChange = (type: ContactChangeType) => {
    setContactType(type);
    setContactProof(profile?.hasPassword === false ? "SMS" : "PASSWORD");
    setContactChallenge(null);
    contactForm.resetFields();
    setContactOpen(true);
  };

  const submitContactChange = async () => {
    if (contactResultUncertain) {
      message.warning("换绑结果仍待确认，请刷新页面或重新登录确认后再操作。");
      return;
    }
    const values = await contactForm.validateFields().catch(() => null);
    if (!values) return;
    const operationEpoch = currentSessionEpoch("customer");
    const confirmingChallenge = contactChallenge !== null;
    const expectedValue = String(
      values.newValue ?? contactForm.getFieldValue("newValue") ?? "",
    ).trim();
    setSavingContact(true);
    try {
      if (!contactChallenge) {
        const verification = contactProof === "PASSWORD"
          ? { currentPassword: values.currentPassword as string }
          : { currentSmsCode: values.currentSmsCode as string };
        const response = await customerProfileApi.startContactChange(
          contactType,
          values.newValue,
          verification,
        );
        setContactChallenge(unwrapResponse<ContactChangeChallenge>(response));
        contactForm.setFieldsValue({ verificationCode: "" });
        message.success("新绑定验证码已发送");
        return;
      }
      await customerProfileApi.confirmContactChange(
        contactChallenge.changeId,
        values.verificationCode,
      );
      message.success("绑定信息已更新，请重新登录");
      contactForm.resetFields();
      setContactOpen(false);
      onSignOut();
    } catch (error: unknown) {
      const status = getAddressRequestStatus(error);
      if (status === 401) {
        message.warning("换绑结果待确认；当前登录状态已失效，请重新登录确认绑定信息。");
        contactForm.resetFields();
        setContactOpen(false);
        setContactChallenge(null);
        onSignOut();
        return;
      }
      if (!isCurrentSessionEpoch("customer", operationEpoch)) return;
      if (confirmingChallenge && (status === null || status >= 500)) {
        const reconciliation = await reconcileSecurityWrite(operationEpoch);
        if (reconciliation.kind === "SESSION_INVALID") {
          message.warning("换绑结果待确认；当前登录状态已失效，请重新登录确认绑定信息。");
          contactForm.resetFields();
          setContactOpen(false);
          setContactChallenge(null);
          onSignOut();
          return;
        }
        if (reconciliation.kind === "ACTIVE") {
          const authoritativeValue = contactType === "PHONE"
            ? reconciliation.profile.phone
            : reconciliation.profile.email;
          const normalizedAuthoritative = String(authoritativeValue ?? "").trim().toLowerCase();
          const normalizedExpected = expectedValue.toLowerCase();
          if (normalizedExpected && normalizedAuthoritative === normalizedExpected) {
            message.success("绑定信息已更新并完成权威核验，请重新登录。");
            contactForm.resetFields();
            setContactOpen(false);
            setContactChallenge(null);
            onSignOut();
            return;
          }
          message.warning("换绑未生效，当前绑定信息未改变；您可以安全重试验证码确认。");
          return;
        }
        if (reconciliation.kind === "UNKNOWN") {
          setContactResultUncertain(true);
          message.warning("换绑结果待确认；系统不会自动重复确认，请刷新页面或重新登录确认。");
        }
        return;
      }
      message.error(getRequestErrorMessage(error, "换绑失败"));
    } finally {
      if (isCurrentSessionEpoch("customer", operationEpoch)) {
        setSavingContact(false);
      }
    }
  };

  const uploadAvatar = async (file: File) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    if (!allowed) {
      message.error("头像仅支持 JPG、PNG 或 WebP 格式");
      return Upload.LIST_IGNORE;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error("头像图片不能超过 5MB");
      return Upload.LIST_IGNORE;
    }
    const customerId = profile?.id;
    if (!customerId) {
      message.error("客户资料尚未加载，请刷新后重试");
      return Upload.LIST_IGNORE;
    }
    const operationEpoch = currentSessionEpoch("customer");
    setUploadingAvatar(true);
    try {
      const fingerprint = await hashAvatarUploadFile(file);
      let attempt = readAvatarUploadAttempt(customerId);
      if (attempt && attempt.fingerprint !== fingerprint) {
        try {
          await customerProfileApi.getAvatarUploadStatus(attempt.key);
          if (!isCurrentSessionEpoch("customer", operationEpoch)) return Upload.LIST_IGNORE;
          clearAvatarUploadAttempt(customerId);
          attempt = null;
        } catch {
          if (!isCurrentSessionEpoch("customer", operationEpoch)) return Upload.LIST_IGNORE;
          message.warning("上次头像上传结果尚未确认；请稍后再选择其他图片，避免覆盖仍在处理的结果。");
          return Upload.LIST_IGNORE;
        }
      }
      if (!attempt) {
        attempt = { fingerprint, key: crypto.randomUUID() };
        if (!persistAvatarUploadAttempt(customerId, attempt)) {
          message.error("浏览器无法保存本次上传凭据；为避免重复写入，当前图片未上传。");
          return Upload.LIST_IGNORE;
        }
      }
      await customerProfileApi.uploadAvatar(file, attempt.key);
      if (!isCurrentSessionEpoch("customer", operationEpoch)) return Upload.LIST_IGNORE;
      clearAvatarUploadAttempt(customerId);
      message.success("头像已更新");
      await onRefresh?.();
    } catch (error: unknown) {
      if (!isCurrentSessionEpoch("customer", operationEpoch)) return Upload.LIST_IGNORE;
      const status = getAddressRequestStatus(error);
      const attempt = readAvatarUploadAttempt(customerId);
      if ((status === null || status >= 500) && attempt) {
        try {
          const response = await customerProfileApi.getAvatarUploadStatus(attempt.key);
          if (!isCurrentSessionEpoch("customer", operationEpoch)) return Upload.LIST_IGNORE;
          const result = unwrapResponse<{ status: "CURRENT" | "NOT_CURRENT" }>(response);
          if (result.status === "CURRENT") {
            clearAvatarUploadAttempt(customerId);
            message.success("头像已更新并完成权威核验");
            await onRefresh?.();
            return Upload.LIST_IGNORE;
          }
          message.warning("本次图片尚未成为当前头像；请重新选择同一图片安全重试。");
          return Upload.LIST_IGNORE;
        } catch {
          if (!isCurrentSessionEpoch("customer", operationEpoch)) return Upload.LIST_IGNORE;
          message.warning("头像上传结果待确认；系统不会自动重复上传，请稍后重新选择同一图片恢复。");
          return Upload.LIST_IGNORE;
        }
      }
      clearAvatarUploadAttempt(customerId);
      message.error(getRequestErrorMessage(error, "头像上传失败"));
    } finally {
      if (isCurrentSessionEpoch("customer", operationEpoch)) {
        setUploadingAvatar(false);
      }
    }
    return Upload.LIST_IGNORE;
  };

  const deleteAvatar = () => {
    modal.confirm({
      title: "删除当前头像？",
      content: "删除后将改为显示称呼首字；您仍可随时重新上传头像。",
      okText: "删除头像",
      cancelText: "保留头像",
      okButtonProps: { danger: true },
      onOk: async () => {
        const operationEpoch = currentSessionEpoch("customer");
        setDeletingAvatar(true);
        try {
          await customerProfileApi.deleteAvatar();
          if (!isCurrentSessionEpoch("customer", operationEpoch)) return;
          message.success("头像已删除");
          onRefresh?.();
        } catch (error: unknown) {
          if (!isCurrentSessionEpoch("customer", operationEpoch)) return;
          const status = getAddressRequestStatus(error);
          if (status === null || status >= 500) {
            try {
              const response = await customerApi.getProfile();
              if (!isCurrentSessionEpoch("customer", operationEpoch)) return;
              const authoritative = unwrapResponse<CustomerProfile>(response);
              if (authoritative.avatarUrl == null) {
                message.success("头像已删除并完成权威核验");
                onRefresh?.();
                return;
              }
              message.error("头像删除未生效，当前头像仍保留，请重试。");
              return;
            } catch {
              if (!isCurrentSessionEpoch("customer", operationEpoch)) return;
              message.error("头像删除结果待确认；系统不会自动重复删除，请稍后重试。");
              return;
            }
          }
          message.error(getRequestErrorMessage(error, "头像删除失败，请重试"));
        } finally {
          if (isCurrentSessionEpoch("customer", operationEpoch)) {
            setDeletingAvatar(false);
          }
        }
      },
    });
  };

  const cooldownLabel = (value?: string | null) => {
    if (!value || Date.parse(value) <= Date.now()) return null;
    return `可于 ${new Date(value).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })} 再次修改`;
  };

  const openAddressCreate = () => {
    addressForm.resetFields();
    addressForm.setFieldsValue({ isDefault: false });
    setEditingAddressId(null);
    setAddressOpen(true);
  };

  const openAddressEdit = (addr: AccountAddress) => {
    addressForm.resetFields();
    addressForm.setFieldsValue(addr);
    setEditingAddressId(addr.id);
    setAddressOpen(true);
  };

  const saveAddress = async () => {
    const values = await addressForm.validateFields() as CustomerAddressInput;
    const payload = normalizeAddressCreatePayload(values);
    const operationEpoch = currentSessionEpoch("customer");
    setSavingAddress(true);
    let createRequestSent = false;
    try {
      if (editingAddressId) {
        await customerApi.updateAddress(editingAddressId, payload);
      } else {
        if (!profile?.id) {
          message.error("客户身份尚未确认，系统未发送地址。请刷新后再试。");
          return;
        }
        const fingerprint = await hashAddressCreateRequest(profile.id, payload);
        const storedAttempt = readAddressCreateAttempt(profile.id);
        const attempt = storedAttempt?.fingerprint === fingerprint
          ? storedAttempt
          : { fingerprint, key: `address-create-${crypto.randomUUID()}` };
        if (
          storedAttempt?.fingerprint !== fingerprint
          && !persistAddressCreateAttempt(profile.id, attempt)
        ) {
          message.error(
            "浏览器无法安全保存新增地址的重试凭据，系统未发送地址。请恢复会话存储后再试。",
          );
          return;
        }
        createRequestSent = true;
        await customerApi.createAddress(payload, attempt.key);
        clearAddressCreateAttempt(profile.id);
      }
      if (!isCurrentSessionEpoch("customer", operationEpoch)) return;
      message.success(editingAddressId ? "地址已更新" : "地址已添加");
      setAddressOpen(false);
      onRefresh?.();
    } catch (error: unknown) {
      if (!isCurrentSessionEpoch("customer", operationEpoch)) return;
      if (!editingAddressId && profile?.id) {
        if (!createRequestSent) {
          message.error(
            "浏览器无法准备新增地址的安全重试凭据，系统未发送地址。请刷新后再试。",
          );
          return;
        }
        const status = getAddressRequestStatus(error);
        if (status !== null && status >= 400 && status < 500) {
          clearAddressCreateAttempt(profile.id);
        }
        message.error(getAddressCreateError(error));
        return;
      }
      if (editingAddressId) {
        const status = getAddressRequestStatus(error);
        if (status === null || status >= 500) {
          try {
            const response = await customerApi.getAddresses({ suppressGlobalError: true });
            if (!isCurrentSessionEpoch("customer", operationEpoch)) return;
            const authoritativeValue = unwrapResponse<unknown>(response);
            if (!Array.isArray(authoritativeValue)) {
              throw new Error("地址权威响应格式不正确");
            }
            const authoritativeAddresses = authoritativeValue as CustomerAddress[];
            const authoritative = authoritativeAddresses.find(
              (address) => address.id === editingAddressId,
            );
            if (!authoritative) {
              message.error("该地址已不存在，系统未重复保存并已刷新地址列表。");
              setAddressOpen(false);
              onRefresh?.();
              return;
            }
            const defaultStateConsistent = payload.isDefault !== true
              || authoritativeAddresses.every(
                (address) => address.id === editingAddressId || !address.isDefault,
              );
            if (addressMatchesUpdate(authoritative, payload) && defaultStateConsistent) {
              message.success("地址已更新并完成权威核验");
              setAddressOpen(false);
              onRefresh?.();
              return;
            }
            message.warning("地址更新未生效；系统已读取权威状态，请核对当前内容后重试。");
            onRefresh?.();
            return;
          } catch {
            if (!isCurrentSessionEpoch("customer", operationEpoch)) return;
            message.error("地址更新结果待确认；系统不会自动重复保存，请稍后保持当前内容并重试。");
            return;
          }
        }
      }
      message.error(getRequestErrorMessage(error, "保存失败"));
    } finally {
      setSavingAddress(false);
    }
  };

  const removeAddress = (id: number) => {
    modal.confirm({
      title: "删除这个收货地址？",
      content: "删除后，结算时将不能再选用这个地址。",
      okText: "确认删除",
      cancelText: "保留地址",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await customerApi.deleteAddress(id);
          message.success("地址已删除");
          onRefresh?.();
        } catch (error: unknown) {
          message.error(getAddressDeleteError(error));
        }
      },
    });
  };

  const showsProfileEditor = activeSection === "profile" || activeSection === "addresses";
  const avatarSrc = profile?.avatarUrl
    ? `${profile.avatarUrl}?v=${encodeURIComponent(profile.updatedAt || "current")}`
    : null;

  return (
    <>
      <div className="my-account">
        <div className="my-account__frame">
        <section className="my-account__intro">
          <div className="my-account__intro-identity">
            {!showsProfileEditor && (
              <div className="my-account__mark" aria-hidden="true">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" />
                ) : (
                  <span>{name.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
            )}
            <div>
              <h1>我的账号</h1>
              <p className="my-account__greeting">您好，{name}。您的作品、咨询与服务记录都在这里。</p>
              <p className="my-account__contact-line">
                <span>{maskAccountPhone(profile?.phone)}</span>
                <span>{profile?.email || "未绑定邮箱"}</span>
              </p>
            </div>
          </div>
          <div className="my-account__intro-actions">
            {!showsProfileEditor && (
              <Link to="/customer?section=profile" className="my-account__profile-entry">
                管理个人资料
              </Link>
            )}
            <button
              type="button"
              className="my-account__sign-out"
              onClick={onSignOut}
            >
              退出登录
            </button>
          </div>
        </section>

        <nav className="my-account__services" aria-labelledby="account-services-title">
          <h2 id="account-services-title" className="my-account__services-label">会员服务</h2>
          <div className="my-account__service-track">
            <div className={`my-account__service-group${isOverview ? " is-current" : ""}`}>
              <h3>
                <Link to="/customer" aria-current={isOverview ? "page" : undefined}>
                  <AccountNavIcon name="overview" />
                  <span>账户概览</span>
                </Link>
              </h3>
            </div>
            {accountServiceGroups.map(({ title: groupTitle, services }) => {
              const groupCurrent = services.some((key) => key === activeSection)
                || (activeSection === "consultations" && services.includes("appointments"));
              return (
                <div className={`my-account__service-group${groupCurrent ? " is-current" : ""}`} key={groupTitle}>
                  <h3>
                    <Link to={`/customer?section=${services[0]}`}>{groupTitle}</Link>
                  </h3>
                  <ul className="my-account__services-list">
                    {services.flatMap((key) => {
                      const service = accountServices.find((item) => item.key === key);
                      if (!service) return [];
                      const { target, title } = service;
                      return [(
                        <li key={key}>
                          <Link
                            to={`/customer?section=${key}`}
                            aria-current={activeSection === key ? "page" : undefined}
                            aria-labelledby={`${target}-shortcut-title`}
                            aria-describedby={
                              key === "notifications" && !notificationError && !notificationLoading && notifications.unreadCount > 0
                                ? `${target}-shortcut-description`
                                : undefined
                            }
                          >
                            <AccountNavIcon name={key} />
                            <span className="my-account__service-copy">
                              <strong id={`${target}-shortcut-title`}>{title}</strong>
                              {key === "notifications" && !notificationError && !notificationLoading && notifications.unreadCount > 0 ? (
                                <span className="my-account__services-description" id={`${target}-shortcut-description`}>
                                  {notifications.unreadCount} 条未读
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        </li>
                      )];
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </nav>

        <div className="my-account__main">
        {isOverview && attentionItems.length > 0 && (
          <section className="my-account__pending" aria-labelledby="account-attention-title">
            <h2 id="account-attention-title">重要提醒</h2>
            <ul className="my-account__attention">
              {attentionItems.map((item) => (
                <li key={item.key}>
                  <Link to={item.href}>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                    <ArrowRightOutlined aria-hidden="true" />
                  </Link>
                </li>
              ))}
              {quoteOverflow && (
                <li>
                  <Link to="/customer?section=quotations">
                    <strong>还有待确认的报价</strong>
                    <span>查看全部报价</span>
                    <ArrowRightOutlined aria-hidden="true" />
                  </Link>
                </li>
              )}
            </ul>
          </section>
        )}

        {isOverview && (selectionInquiryError || inquiryError) && (
          <p className="my-account__overview-notice" role="status">
            部分服务记录暂时无法加载，可以进入对应服务重试。
          </p>
        )}

        {isOverview && (
          <section className="my-account__overview" aria-label="账户概览">
            <div className="my-account__collection">
              <h2>我的珠宝珍藏</h2>
              <div className="my-account__collection-grid">
                <article>
                  <h3>我的选款</h3>
                  {selectionInquiryLoading ? <p role="status">正在读取选款记录</p> : null}
                  {selectionInquiryError ? <p role="alert">选款记录暂时无法读取。</p> : null}
                  {!selectionInquiryLoading && !selectionInquiryError && selectionPreview.length === 0 ? (
                    <p>还没有提交过选款。</p>
                  ) : null}
                  {selectionPreview.length > 0 ? (
                    <ul className="my-account__collection-list">
                      {selectionPreview.map((record) => {
                        const title = record.items?.[0]?.productNameSnapshot
                          ? clampProductTitle(record.items[0].productNameSnapshot)
                          : "选款咨询";
                        const href = record.leadId
                          ? `/customer?section=consultations&leadId=${record.leadId}`
                          : "/customer?section=selections";
                        return (
                          <li key={record.id}>
                            <Link to={href}>
                              <strong>{title}</strong>
                              <span>{inquiryStatus[record.status] || record.status}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  <Link to="/customer?section=selections" className="my-account__text-link">查看全部选款</Link>
                  <Link to="/catalog" className="my-account__catalog-link">
                    继续选款 <ArrowRightOutlined aria-hidden="true" />
                  </Link>
                </article>
                <article>
                  <h3>我的心愿单</h3>
                  {favoriteStatus === "loading" ? <p role="status">正在读取心愿单</p> : null}
                  {favoriteStatus === "error" ? <p role="alert">心愿单暂时无法读取。</p> : null}
                  {favoriteStatus === "ready" && favoritePreview.length === 0 ? <p>心愿单里还没有作品。</p> : null}
                  {favoritePreview.length > 0 ? (
                    <div className="my-account__watch">
                      <Link to="/customer?section=favorites" className="my-account__watch-count">心愿单 {favorites.length}</Link>
                      <ul>
                        {favoritePreview.map((item) => (
                          <li key={item.id}>
                            <Link to={publicProductPath({ id: item.productId, code: item.code })}>
                              <SecureImage
                                src={item.image ? withPublicMediaWidth(item.image, 480) : getListingImage(null)}
                                alt=""
                                width={72}
                                height={90}
                              />
                              <span>{clampProductTitle(item.name)}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <Link to="/customer?section=favorites" className="my-account__text-link">进入心愿单</Link>
                </article>
                <article>
                  <h3>最近浏览</h3>
                  <p>账户只保存选款与心愿单，没有另一份浏览清单，这里不会显示推测作品。</p>
                  <Link to="/catalog" className="my-account__text-link">去选款中心看看</Link>
                  {bagWatchStatus === "loading" ? <p role="status">正在读取购物袋</p> : null}
                  {bagWatchStatus === "error" ? <p role="alert">购物袋暂时无法读取。</p> : null}
                  {watchedBag.length > 0 ? (
                    <div className="my-account__watch">
                      <Link to="/cart" className="my-account__watch-count">购物袋 {bagCount}</Link>
                      <ul>
                        {watchedBag.map((item) => (
                          <li key={item.id}>
                            <Link to={publicProductPath({ id: item.productId, code: item.code })}>
                              <SecureImage src={item.image} alt="" width={72} height={90} />
                              <span>{clampProductTitle(item.name)}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </article>
              </div>
            </div>

            <div className="my-account__activity">
              <h2>最近账户动态</h2>
              {!activitySettled ? <p role="status">正在读取最近的服务记录</p> : null}
              {activitySettled && recentActivity.length === 0 ? (
                <p>暂时没有新的预约、报价、订单或服务通知。</p>
              ) : null}
              {recentActivity.length > 0 ? (
                <ul className="my-account__activity-list">
                  {recentActivity.map((item) => (
                    <li key={item.key}>
                      <Link to={item.href}>
                        <span>{item.label}</span>
                        <strong>{item.title}</strong>
                        <em>{item.detail}</em>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="my-account__advisor">
              <h2>专属顾问服务</h2>
              <ul>
                <li><Link to="/contact">联系专属顾问</Link></li>
                <li><Link to="/catalog">珠宝咨询</Link></li>
                <li><Link to="/customer?section=appointments">预约服务</Link></li>
                <li><Link to="/customer?section=orders">售后咨询</Link></li>
              </ul>
            </div>
          </section>
        )}

        {!isOverview && (
          <p className="my-account__return">
            <Link to="/customer">返回账户概览</Link>
          </p>
        )}

        {!isOverview && (
        <div className="my-account__grid my-account__grid--service">
          {activeSection === "consultations" && invalidSelectedLeadTarget ? (
            <section
              id="consultation-focus"
              className="my-account__panel my-account__panel--wide"
              aria-labelledby="consultation-invalid-title"
              tabIndex={-1}
            >
              <div className="my-account__panel-head">
                <div>
                  <p>咨询记录</p>
                  <h2 id="consultation-invalid-title">咨询定位无效</h2>
                </div>
              </div>
              <div className="my-account__records-state" role="alert">
                <p>咨询定位信息无效，系统未发起咨询详情请求。您仍可查看本人咨询列表。</p>
                <button
                  type="button"
                  className="my-account__inline-retry"
                  onClick={() => clearConsultationUrl("my-appointments")}
                >
                  返回咨询列表
                </button>
              </div>
            </section>
          ) : activeSection === "consultations" && selectedLeadId !== null ? (
            <section
              id="consultation-focus"
              className="my-account__panel my-account__panel--wide"
              aria-labelledby="consultation-focus-title"
              tabIndex={-1}
            >
              <div className="my-account__panel-head">
                <div>
                  <p>咨询记录</p>
                  <h2 id="consultation-focus-title">咨询详情</h2>
                </div>
                <button
                  type="button"
                  className="my-account__sign-out"
                  onClick={() => clearConsultationUrl(
                    consultationDetail?.type === "selection"
                      ? "my-selections"
                      : "my-appointments",
                  )}
                >
                  关闭详情
                </button>
              </div>
              {consultationLoading ? (
                <RouteLoading scope="panel" surface="public" label="正在加载咨询详情…" />
              ) : consultationError === "not-found" ? (
                <div className="my-account__records-state" role="alert">
                  <p>未找到这条咨询，或者它不属于当前账户。</p>
                  <button
                    type="button"
                    className="my-account__inline-retry"
                    onClick={() => clearConsultationUrl("my-appointments")}
                  >
                    返回咨询列表
                  </button>
                </div>
              ) : consultationError ? (
                <div className="my-account__records-state" role="alert">
                  <p>咨询详情暂时无法加载，已保留当前链接。</p>
                  {onRetryConsultation ? (
                    <button
                      type="button"
                      className="my-account__inline-retry"
                      onClick={() => void onRetryConsultation()}
                    >
                      重新加载
                    </button>
                  ) : null}
                </div>
              ) : consultationDetail ? (
                <article className="my-account__consultation-record">
                  <div className="my-account__consultation-row">
                    <div>
                      <small>
                        {new Date(consultationDetail.createdAt).toLocaleDateString("zh-CN")}
                      </small>
                      <h3>{consultationTitle}</h3>
                    </div>
                    <em>
                      {inquiryStatus[consultationDetail.status]
                        || consultationDetail.status}
                    </em>
                  </div>
                  <ConsultationProgress
                    handlingState={consultationDetail.handlingState}
                    nextAction={consultationDetail.nextAction}
                    restartTo={consultationDetail.type === "selection" ? "/catalog" : "/contact"}
                  />
                  <ConsultationDetail
                    detailId="consultation-focus-content"
                    message={consultationDetail.message}
                    reply={consultationDetail.reply}
                    selected
                  >
                    <ConsultationContext detail={consultationDetail} />
                  </ConsultationDetail>
                </article>
              ) : null}
            </section>
          ) : null}
          {(activeSection === "selections" || activeSection === "consultations") && (
          <section id="my-selections" className="my-account__panel" tabIndex={-1}>
            <div className="my-account__panel-head">
              <div>
                <p>选款记录</p>
                <h2>我的选款</h2>
              </div>
              {selectionInquiries.length > 0 && <Link to="/catalog">进入选款中心 →</Link>}
            </div>
            {selectionInquiryError ? (
              <p className="my-account__records-state" role="alert">
                {selectionInquiryError}
                <button
                  type="button"
                  className="my-account__inline-retry"
                  onClick={() => void onRetrySelectionInquiries()}
                >
                  重新加载
                </button>
              </p>
            ) : null}
            {selectionInquiryLoading && selectionInquiries.length === 0 ? (
              <RouteLoading scope="panel" surface="public" label="正在加载选款咨询…" />
            ) : selectionInquiryError && selectionInquiries.length === 0 ? (
              null
            ) : selectionInquiries.length ? (
              <>
                <div className="my-account__records" aria-busy={selectionInquiryLoading}>
                  {visibleSelectionInquiries.map((record) => (
                    <article key={record.id} className="my-account__consultation-record">
                      <div className="my-account__consultation-row">
                        <div>
                          <small>
                            {new Date(record.createdAt).toLocaleDateString("zh-CN")}
                          </small>
                          <h3>
                            {record.items?.[0]?.productNameSnapshot ? clampProductTitle(record.items[0].productNameSnapshot) : "选款咨询"}
                          </h3>
                        </div>
                        <em>{inquiryStatus[record.status] || record.status}</em>
                      </div>
                      <ConsultationProgress
                        handlingState={record.handlingState}
                        nextAction={record.nextAction}
                        restartTo="/catalog"
                      />
                      <ConsultationDetail
                        detailId={`consultation-${record.leadId ?? `selection-${record.id}`}`}
                        message={record.message}
                        reply={record.reply}
                        selected={false}
                      >
                        <div>
                          <h4>所选作品</h4>
                          <p>
                            {record.items?.map((item) => clampProductTitle(item.productNameSnapshot)).join("、")
                              || "历史记录未保留作品名称。"}
                          </p>
                        </div>
                      </ConsultationDetail>
                    </article>
                  ))}
                </div>
                <nav className="my-account__pagination" aria-label="选款咨询分页">
                  <Pagination
                    current={selectionPage}
                    pageSize={selectionPageSize}
                    total={selectionInquiries.length}
                    showSizeChanger={false}
                    hideOnSinglePage
                    disabled={selectionInquiryLoading}
                    onChange={(page) => {
                      setSelectionPage(page);
                      clearConsultationUrl("my-selections");
                    }}
                  />
                </nav>
              </>
            ) : (
              <Empty>
                <span>暂未提交选款咨询。</span>提交后，可以在这里查看进度与顾问回复。
                <Link to="/catalog">前往选款中心 →</Link>
              </Empty>
            )}
          </section>
          )}

          {(activeSection === "appointments" || activeSection === "consultations") && (
          <section id="my-appointments" className="my-account__panel" tabIndex={-1}>
            <div className="my-account__panel-head">
              <div>
                <p>预约记录</p>
                <h2>我的预约</h2>
              </div>
              {inquiries.length > 0 && <Link to="/contact">预约咨询 →</Link>}
            </div>
            {!inquiryLoading && !inquiryError && inquiryPage.total > 0 && (
              <p className="my-account__record-total">共 {inquiryPage.total} 条预约咨询</p>
            )}
            {inquiryError && (
              <p className="my-account__records-state" role="alert">
                {inquiryError}
                <button
                  type="button"
                  className="my-account__inline-retry"
                  onClick={() => void onInquiryPageChange(inquiryPage.page)}
                >
                  重新加载
                </button>
              </p>
            )}
            {inquiryLoading && inquiries.length === 0 ? (
              <RouteLoading scope="panel" surface="public" label="正在加载预约记录…" />
            ) : inquiryError && inquiries.length === 0 ? (
              null
            ) : inquiries.length ? (
              <>
                <div className="my-account__records" aria-busy={inquiryLoading}>
                  {inquiries.map((record) => (
                    <article key={record.id} className="my-account__consultation-record">
                      <div className="my-account__consultation-row">
                        <div>
                          <small>
                            {new Date(record.createdAt).toLocaleDateString("zh-CN")}
                          </small>
                          <h3>
                            {record.product?.name
                              ? clampProductTitle(record.product.name)
                              : record.consultationType || "预约咨询"}
                          </h3>
                        </div>
                        <em>{inquiryStatus[record.status] || record.status}</em>
                      </div>
                      <ConsultationProgress
                        handlingState={record.handlingState}
                        nextAction={record.nextAction}
                        restartTo="/contact"
                      />
                      <ConsultationDetail
                        detailId={`consultation-${record.leadId ?? `inquiry-${record.id}`}`}
                        message={record.message}
                        reply={record.reply}
                        selected={false}
                      >
                        <div>
                          <h4>服务信息</h4>
                          <p>
                            {[
                              record.preferredContact
                                ? `联系偏好：${record.preferredContact}`
                                : null,
                              record.preferredTime
                                ? `方便时间：${record.preferredTime}`
                                : null,
                              record.budgetRange
                                ? `预算范围：${record.budgetRange}`
                                : null,
                            ].filter(Boolean).join("；") || "暂无补充服务信息。"}
                          </p>
                        </div>
                      </ConsultationDetail>
                    </article>
                  ))}
                </div>
                <nav className="my-account__pagination" aria-label="预约咨询分页">
                  <Pagination
                    current={inquiryPage.page}
                    pageSize={inquiryPage.pageSize}
                    total={inquiryPage.total}
                    showSizeChanger={false}
                    hideOnSinglePage
                    disabled={inquiryLoading}
                    onChange={(page) => {
                      clearConsultationUrl("my-appointments");
                      void onInquiryPageChange(page);
                    }}
                  />
                </nav>
              </>
            ) : (
              <Empty>
                <span>还没有预约记录。</span>提交预约咨询后，可以在这里查看处理进度。
                <Link to="/contact">联系与预约 →</Link>
              </Empty>
            )}
          </section>
          )}

          {/* 心愿单：收藏的作品（商品详情页心形按钮加入） */}
          {activeSection === "favorites" && (
          <section
            id="my-favorites"
            className="my-account__panel my-account__panel--wide"
            aria-labelledby="my-favorites-title"
            tabIndex={-1}
          >
            <div className="my-account__panel-head">
              <div>
                <p>心愿记录</p>
                <h2 id="my-favorites-title">我的心愿单</h2>
              </div>
              <strong>
                {favoriteStatus === "ready"
                  ? String(favorites.length).padStart(2, "0")
                  : "—"}
              </strong>
            </div>
            {favoriteStatus === "loading" ? (
              <RouteLoading scope="panel" surface="public" label="正在加载心愿单…" />
            ) : favoriteStatus === "error" ? (
              <p className="my-account-empty" role="alert">
                心愿单暂时无法加载。
                <button
                  type="button"
                  className="my-account__summary-action"
                  onClick={() => void loadFavorites()}
                >
                  重新加载
                </button>
              </p>
            ) : favorites.length ? (
              <div className="my-account__records">
                {favorites.map((fav) => (
                  <article key={fav.id} className="my-account__favorite">
                    <Link
                      to={`/products/${fav.productId}`}
                      className="my-account__favorite-media"
                    >
                      {fav.image ? (
                        <SecureImage
                          src={
                            fav.image.includes("/media/")
                              ? withPublicMediaWidth(fav.image, 480)
                              : buildResponsiveUploadsDerivedUrl(fav.image, 480) || fav.image
                          }
                          alt={fav.name}
                        />
                      ) : (
                        <span className="my-account__favorite-fallback" aria-hidden="true" />
                      )}
                    </Link>
                    <div className="my-account__favorite-copy">
                      <Link to={`/products/${fav.productId}`}>
                        <h3 title={fav.name}>{clampProductTitle(fav.name)}</h3>
                      </Link>
                      {fav.shortDescription ? (
                        <p>{fav.shortDescription}</p>
                      ) : null}
                      {fav.price != null && Number(fav.price) > 0 ? (
                        <p className="my-account__favorite-price">
                          ¥{Number(fav.price).toLocaleString("zh-CN")}
                        </p>
                      ) : null}
                    </div>
                    <div className="my-account__favorite-actions">
                      {commerceFlags?.cartEnabled === true
                        && fav.salesMode === "DIRECT_PURCHASE"
                        && Number(fav.price) > 0 ? (
                        <ListingCartButton
                          product={{ id: fav.productId, code: fav.code }}
                          className="my-account__favorite-cart"
                        />
                      ) : null}
                      <Link to={publicProductPath({ id: fav.productId, code: fav.code })}>
                        查看作品
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeFavorite(fav.productId)}
                      >
                        移出
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty>
                <span>心愿单还是空的。</span>在作品详情页点击收藏，喜欢的作品就会保存在这里。
                <Link to="/catalog">浏览作品 →</Link>
              </Empty>
            )}
          </section>
          )}

          {activeSection === "quotations" && (
          <CustomerQuotationsPanel
            addresses={addresses}
            onOrderCreated={onRefresh}
            onLocateOrder={locateCanonicalOrder}
          />
          )}

          {activeSection === "orders" && (
          <CustomerOrdersPanel
            orders={locatedOrders}
            commerceEnabled={commerceEnabled}
            paymentEnabled={paymentEnabled}
            uploadingProof={uploading}
            cancellingAfterSalesId={cancellingAfterSalesId}
            onOpenReview={openReview}
            onOpenAfterSales={openAfterSales}
            onCancelAfterSales={cancelAfterSales}
            onOpenProof={setProofOrderId}
            onOpenPayment={setPaymentOrder}
            onRefresh={onRefresh}
            targetOrderId={targetOrderId}
            invalidTargetOrderId={invalidCanonicalOrderTarget}
            targetOrderLoading={targetOrderLoading}
            targetOrderError={targetOrderError}
            onRetryTargetOrder={retryCanonicalOrderTarget}
            onOrderLocated={handleOrderLocated}
            onClearOrderTarget={clearCanonicalOrderTarget}
          />
          )}

          {(activeSection === "profile" || activeSection === "addresses") && (
          <section
            id="my-profile"
            className="my-account__panel my-account__panel--profile my-account__panel--wide"
            tabIndex={-1}
          >
            <div className="my-account__panel-head">
              <div>
                <p>账户资料</p>
                <h2>个人资料</h2>
              </div>
            </div>
            <div className="my-account__profile-identity">
              <div className="my-account__avatar" aria-label="当前头像">
                {profile?.avatarUrl ? (
                  <img
                    src={`${profile.avatarUrl}?v=${encodeURIComponent(profile.updatedAt || "current")}`}
                    alt={`${name}的头像`}
                  />
                ) : (
                  <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div>
                <strong>{name}</strong>
                <p>{profile?.phone || "—"}</p>
                <div className="my-account__profile-actions">
                  <Button size="small" onClick={openProfileEdit}>修改称呼</Button>
                  <Upload
                    accept="image/jpeg,image/png,image/webp"
                    showUploadList={false}
                    beforeUpload={uploadAvatar}
                    disabled={uploadingAvatar || deletingAvatar}
                  >
                    <Button size="small" loading={uploadingAvatar}>更换头像</Button>
                  </Upload>
                  {profile?.avatarUrl ? (
                    <Button
                      size="small"
                      danger
                      loading={deletingAvatar}
                      disabled={uploadingAvatar}
                      onClick={deleteAvatar}
                    >
                      删除头像
                    </Button>
                  ) : null}
                </div>
                <small>JPG、PNG 或 WebP，最大 5MB；上传后由服务端裁切压缩。</small>
              </div>
            </div>
            <div className="my-account__partner">
              <p>申请合作</p>
              <div
                className={
                  partnerStatus === "APPROVED"
                    ? "my-account__partner-row my-account__partner-row--approved"
                    : "my-account__partner-row"
                }
              >
                <div>
                  <span>
                    {partnerError
                      ? partnerError
                      : partnerStatus === "APPROVED"
                      ? "已认证合作商家"
                      : PARTNER_STATUS_LABEL[partnerStatus] ||
                        "尚未申请合作商家身份"}
                    {partnerStatus === "APPROVED" && partnerApprovedAt
                      ? ` · ${new Date(partnerApprovedAt).toLocaleDateString("zh-CN")}`
                      : ""}
                  </span>
                  {!partnerError && partnerStatus !== "APPROVED" &&
                  partner?.latest?.reviewNote ? (
                    <p>审核说明：{partner.latest.reviewNote}</p>
                  ) : null}
                </div>
                {partnerError ? (
                  <button
                    type="button"
                    className="my-account__summary-action"
                    onClick={onRefresh}
                  >
                    重新加载
                  </button>
                ) : (
                  <Link
                    to={PARTNER_ACTION[partnerStatus]?.to || "/customer?section=partner"}
                  >
                    {PARTNER_ACTION[partnerStatus]?.label || "了解详情"}
                  </Link>
                )}
              </div>
            </div>
            <div className="my-account__security-settings">
              <div className="my-account__security-row">
                <div>
                  <strong>绑定手机号</strong>
                  <span>{profile?.phone || "—"}</span>
                  {cooldownLabel(profile?.phoneChangeAvailableAt) ? (
                    <small>{cooldownLabel(profile?.phoneChangeAvailableAt)}</small>
                  ) : null}
                </div>
                <Button
                  size="small"
                  disabled={Boolean(cooldownLabel(profile?.phoneChangeAvailableAt))}
                  onClick={() => openContactChange("PHONE")}
                >
                  更换手机号
                </Button>
              </div>
              <div className="my-account__security-row">
                <div>
                  <strong>绑定邮箱</strong>
                  <span>{profile?.email || "暂未绑定"}</span>
                  {cooldownLabel(profile?.emailChangeAvailableAt) ? (
                    <small>{cooldownLabel(profile?.emailChangeAvailableAt)}</small>
                  ) : null}
                </div>
                <Button
                  size="small"
                  disabled={Boolean(cooldownLabel(profile?.emailChangeAvailableAt))}
                  onClick={() => openContactChange("EMAIL")}
                >
                  {profile?.email ? "更换邮箱" : "绑定邮箱"}
                </Button>
              </div>
              <div className="my-account__security-row">
                <div>
                  <strong>密码与登录</strong>
                  <span>修改后所有设备都需要重新登录</span>
                </div>
                <Button size="small" onClick={openPasswordChange}>
                  {profile?.hasPassword === false ? "设置密码" : "修改密码"}
                </Button>
              </div>
            </div>
            <div className="my-account__privacy">
              <span>我的个人数据（资料/订单/收藏等）可随时导出或注销账户</span>
              <span className="my-account__privacy-actions">
                <Button
                  size="small"
                  onClick={handleExportData}
                  loading={exportingData}
                >
                  导出我的数据
                </Button>
                <Button size="small" danger onClick={openAccountClosure}>
                  注销账户
                </Button>
              </span>
            </div>
            <div id="my-addresses" className="my-account__address" tabIndex={-1}>
              <div className="my-account__address-head">
                <p>收货地址</p>
                <Button size="small" onClick={openAddressCreate}>新增地址</Button>
              </div>
              {addresses.length > 0 ? (
                <ul className="my-account__address-list">
                  {addresses.map((addr) => (
                    <li key={addr.id}>
                      <div>
                        <strong>
                          {addr.recipientName}
                          <span>{addr.recipientPhone}</span>
                          {addr.isDefault ? <Tag bordered={false}>默认</Tag> : null}
                        </strong>
                        <span>
                          {[addr.province, addr.city, addr.district, addr.detail]
                            .filter(Boolean)
                            .join("")}
                        </span>
                      </div>
                      <div className="my-account__address-actions">
                        <Button
                          size="small"
                          type="link"
                          onClick={() => openAddressEdit(addr)}
                        >
                          编辑
                        </Button>
                        <Button
                          size="small"
                          type="link"
                          danger
                          onClick={() => removeAddress(addr.id)}
                        >
                          删除
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <span>暂未保存收货地址</span>
              )}
            </div>
          </section>
          )}
          {activeSection === "notifications" && (
          <CustomerNotificationsPanel
            resource={notifications}
            loading={notificationLoading}
            error={notificationError}
            onRetry={onRetryNotifications}
            onRead={onReadNotification}
            onReadAll={onReadAllNotifications}
          />
          )}
        </div>
        )}
        </div>
        </div>
      </div>
      <CustomerPaymentDialog
        open={paymentOrder !== null}
        order={paymentOrder}
        onClose={() => setPaymentOrder(null)}
        onPaid={() => {
          setPaymentOrder(null);
          onRefresh?.();
        }}
      />
      <CustomerAfterSalesDialog
        order={afterSalesOrder}
        onClose={() => setAfterSalesOrder(null)}
        onSubmitted={() => {
          setAfterSalesOrder(null);
          onRefresh?.();
        }}
      />
      {commerceEnabled && (
        <Modal
          open={proofOrderId !== null}
          title="上传付款凭证"
          onCancel={() => setProofOrderId(null)}
          footer={null}
          destroyOnHidden
        >
          <p style={{ color: "#5f6568", fontSize: 13, marginBottom: 16 }}>
            此入口只用于已约定的特殊线下转账订单。请上传转账截图或凭证图片（JPG/PNG/WebP，≤10MB）；微信支付无需上传凭证。
          </p>
          <Upload
            accept="image/jpeg,image/png,image/webp,image/gif"
            maxCount={1}
            showUploadList={false}
            beforeUpload={(file) => {
              void handleUploadProof(file);
              return false;
            }}
            disabled={uploading}
          >
            <button
              type="button"
              className="my-account__button"
              disabled={uploading}
              style={{
                padding: "10px 16px",
                background: "#181a1b",
                color: "#fff",
                border: 0,
                cursor: "pointer",
              }}
            >
              {uploading ? "上传中..." : "选择图片并上传"}
            </button>
          </Upload>
        </Modal>
      )}

      <CustomerReviewDialog
        order={reviewOrder}
        onClose={() => setReviewOrder(null)}
        onSubmitted={() => setReviewOrder(null)}
      />

      <Modal
        rootClassName="customer-account-modal"
        open={closeOpen}
        title="注销账户"
        onCancel={() => {
          setCloseOpen(false);
          setClosePassword("");
          setCloseSmsCode("");
        }}
        onOk={handleCloseAccount}
        confirmLoading={closing}
        okText="确认注销"
        okButtonProps={{ danger: true, disabled: closeResultUncertain }}
        cancelText="再想想"
        destroyOnHidden
      >
        <div className="space-y-3">
          <p style={{ color: "#8C3F3B", fontSize: 13 }}>
            注销后您的姓名、邮箱、地址与收藏将被清除，账户将永久无法登录，此操作不可恢复。
          </p>
          <p style={{ color: "#5f6568", fontSize: 13 }}>
            依据法律要求，历史订单与收款记录，以及处于法律保留状态的咨询事实将继续留存；您发布且已公开展示的评价将继续匿名展示。建议先"导出我的数据"留档。
          </p>
          {closeResultUncertain ? (
            <p role="alert" className="my-account__security-note">
              上次注销结果尚未确认。为避免重复操作，请刷新页面或重新登录确认账户状态。
            </p>
          ) : null}
          {closeProof === "PASSWORD" ? (
            <Input.Password
              aria-label="登录密码"
              placeholder="输入登录密码确认注销"
              value={closePassword}
              maxLength={EXISTING_PASSWORD_MAX_LENGTH}
              onChange={(e) => setClosePassword(e.target.value)}
            />
          ) : (
            <>
              <p className="my-account__security-note">
                当前账户尚未设置密码，请使用绑定手机号验证码确认注销。
              </p>
              <div className="my-account__code-row">
                <Input
                  aria-label="当前手机号验证码"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6 位验证码"
                  value={closeSmsCode}
                  onChange={(event) => setCloseSmsCode(event.target.value)}
                />
                <Button
                  onClick={sendAccountClosureCode}
                  loading={sendingSecurityCode}
                  disabled={closeResultUncertain || securityCodeCooldown > 0}
                >
                  {securityCodeCooldown > 0 ? `${securityCodeCooldown}s` : "发送注销验证码"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        rootClassName="customer-account-modal"
        open={profileEditOpen}
        title="修改称呼"
        onCancel={() => setProfileEditOpen(false)}
        onOk={saveProfile}
        confirmLoading={savingProfile}
        okText="保存"
        cancelText="取消"
        afterOpenChange={(open) => {
          if (open) {
            profileForm.setFieldsValue({
              name: profile?.name,
            });
          }
        }}
      >
        <Form form={profileForm} layout="vertical">
          <Form.Item
            name="name"
            label="称呼"
            rules={[
              { required: true, message: "请填写称呼" },
              { min: 1, max: 50, message: "称呼长度必须为 1–50 个字符" },
              {
                pattern: /^[\p{L}\p{N}_·.\- ]+$/u,
                message: "称呼只能包含文字、数字、空格、下划线、中点和短横线",
              },
            ]}
          >
            <Input placeholder="您的称呼" maxLength={50} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        rootClassName="customer-account-modal"
        open={passwordOpen}
        title="修改登录密码"
        onCancel={() => {
          passwordForm.resetFields();
          setPasswordOpen(false);
        }}
        onOk={savePassword}
        confirmLoading={savingPassword}
        okButtonProps={{ disabled: passwordResultUncertain }}
        okText="确认修改"
        cancelText="取消"
        forceRender
      >
        <p className="my-account__security-note">
          {profile?.hasPassword === false
            ? "当前账户尚未设置密码，请先验证绑定手机号。设置成功后将退出所有设备。"
            : "修改成功后将退出所有设备上的登录会话，请使用新密码重新登录。"}
        </p>
        {passwordResultUncertain ? (
          <p role="alert" className="my-account__security-note">
            上次密码修改结果尚未确认。为避免重复修改，请刷新页面或重新登录后再操作。
          </p>
        ) : null}
        <Form form={passwordForm} layout="vertical">
          <Form.Item label="验证当前身份">
            <Radio.Group
              value={passwordProof}
              onChange={(event) => {
                setPasswordProof(event.target.value);
                passwordForm.setFieldsValue({ currentPassword: undefined, currentSmsCode: undefined });
              }}
            >
              <Radio.Button value="PASSWORD" disabled={profile?.hasPassword === false}>当前密码</Radio.Button>
              <Radio.Button value="SMS">手机验证码</Radio.Button>
            </Radio.Group>
          </Form.Item>
          {passwordProof === "PASSWORD" ? (
            <Form.Item name="currentPassword" label="当前密码" rules={[{ required: true, message: "请输入当前密码" }]}>
              <Input.Password maxLength={EXISTING_PASSWORD_MAX_LENGTH} autoComplete="current-password" />
            </Form.Item>
          ) : (
            <Form.Item label="当前手机号验证码" required>
              <div className="my-account__code-row">
                <Form.Item name="currentSmsCode" noStyle rules={[{ required: true, pattern: /^\d{6}$/, message: "请输入 6 位验证码" }]}>
                  <Input inputMode="numeric" maxLength={6} placeholder="6 位验证码" />
                </Form.Item>
                <Button
                  onClick={sendCurrentPhoneCode}
                  loading={sendingSecurityCode}
                  disabled={passwordResultUncertain || securityCodeCooldown > 0}
                >
                  {securityCodeCooldown > 0 ? `${securityCodeCooldown}s` : "发送验证码"}
                </Button>
              </div>
            </Form.Item>
          )}
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: "请输入新密码" },
              { validator: (_, value) => !value || isAccountPasswordValid(value) ? Promise.resolve() : Promise.reject(new Error(ACCOUNT_PASSWORD_HINT)) },
            ]}
            extra={ACCOUNT_PASSWORD_HINT}
          >
            <Input.Password maxLength={ACCOUNT_PASSWORD_MAX_LENGTH} autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={["newPassword"]}
            rules={[
              { required: true, message: "请再次输入新密码" },
              ({ getFieldValue }) => ({
                validator: (_, value) => !value || value === getFieldValue("newPassword")
                  ? Promise.resolve()
                  : Promise.reject(new Error("两次输入的密码不一致")),
              }),
            ]}
          >
            <Input.Password maxLength={ACCOUNT_PASSWORD_MAX_LENGTH} autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        rootClassName="customer-account-modal"
        open={contactOpen}
        title={`${profile?.[contactType === "PHONE" ? "phone" : "email"] ? "更换" : "绑定"}${contactType === "PHONE" ? "手机号" : "邮箱"}`}
        onCancel={() => {
          contactForm.resetFields();
          setContactOpen(false);
          setContactChallenge(null);
        }}
        onOk={submitContactChange}
        confirmLoading={savingContact}
        okButtonProps={{ disabled: contactResultUncertain }}
        okText={contactChallenge ? "完成换绑" : "验证并发送新验证码"}
        cancelText="取消"
        forceRender
      >
        <p className="my-account__security-note">
          {contactChallenge
            ? `验证码已发送至 ${contactChallenge.maskedTarget}，10 分钟内有效。`
            : "先验证当前身份，再验证新的联系方式。换绑成功后 7 天内不能再次修改，并会退出所有设备。"}
        </p>
        {contactResultUncertain ? (
          <p role="alert" className="my-account__security-note">
            上次换绑确认结果尚未确认。为避免重复确认，请刷新页面或重新登录后再操作。
          </p>
        ) : null}
        <Form form={contactForm} layout="vertical">
          {!contactChallenge ? (
            <>
              <Form.Item
                name="newValue"
                label={contactType === "PHONE" ? "新手机号" : "新邮箱"}
                rules={contactType === "PHONE"
                  ? [{ required: true, pattern: /^1[3-9]\d{9}$/, message: "请填写正确的手机号" }]
                  : [{ required: true, type: "email", message: "请填写正确的邮箱地址" }]}
              >
                <Input
                  inputMode={contactType === "PHONE" ? "tel" : "email"}
                  maxLength={contactType === "PHONE" ? 11 : 100}
                  autoComplete={contactType === "PHONE" ? "tel" : "email"}
                />
              </Form.Item>
              <Form.Item label="验证当前身份">
                <Radio.Group
                  value={contactProof}
                  onChange={(event) => {
                    setContactProof(event.target.value);
                    contactForm.setFieldsValue({ currentPassword: undefined, currentSmsCode: undefined });
                  }}
                >
                  <Radio.Button value="PASSWORD" disabled={profile?.hasPassword === false}>当前密码</Radio.Button>
                  <Radio.Button value="SMS">当前手机验证码</Radio.Button>
                </Radio.Group>
              </Form.Item>
              {contactProof === "PASSWORD" ? (
                <Form.Item name="currentPassword" label="当前密码" rules={[{ required: true, message: "请输入当前密码" }]}>
                  <Input.Password maxLength={EXISTING_PASSWORD_MAX_LENGTH} autoComplete="current-password" />
                </Form.Item>
              ) : (
                <Form.Item label="当前手机号验证码" required>
                  <div className="my-account__code-row">
                    <Form.Item name="currentSmsCode" noStyle rules={[{ required: true, pattern: /^\d{6}$/, message: "请输入 6 位验证码" }]}>
                      <Input inputMode="numeric" maxLength={6} placeholder="6 位验证码" />
                    </Form.Item>
                    <Button
                      onClick={sendCurrentPhoneCode}
                      loading={sendingSecurityCode}
                      disabled={contactResultUncertain || securityCodeCooldown > 0}
                    >
                      {securityCodeCooldown > 0 ? `${securityCodeCooldown}s` : "发送验证码"}
                    </Button>
                  </div>
                </Form.Item>
              )}
            </>
          ) : (
            <Form.Item
              name="verificationCode"
              label={`新${contactType === "PHONE" ? "手机号" : "邮箱"}验证码`}
              rules={[{ required: true, pattern: /^\d{6}$/, message: "请输入 6 位验证码" }]}
            >
              <Input inputMode="numeric" maxLength={6} autoFocus placeholder="6 位验证码" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 地址新增/编辑 */}
      <Modal
        rootClassName="customer-account-modal"
        open={addressOpen}
        title={editingAddressId ? "编辑地址" : "新增地址"}
        onCancel={() => setAddressOpen(false)}
        onOk={saveAddress}
        confirmLoading={savingAddress}
        okText="保存"
        cancelText="取消"
      >
        <Form form={addressForm} layout="vertical">
          <div
            className="grid grid-cols-2 gap-4"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              columnGap: 16,
            }}
          >
            <Form.Item
              name="recipientName"
              label="收件人"
              rules={[{ required: true, message: "请填写收件人" }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="recipientPhone"
              label="联系电话"
              rules={[{ required: true, message: "请填写联系电话" }]}
            >
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="province" label="省">
            <Input />
          </Form.Item>
          <Form.Item name="city" label="市">
            <Input />
          </Form.Item>
          <Form.Item name="district" label="区/县">
            <Input />
          </Form.Item>
          <Form.Item name="postalCode" label="邮政编码">
            <Input maxLength={20} />
          </Form.Item>
          <Form.Item
            name="detail"
            label="详细地址"
            rules={[{ required: true, message: "请填写详细地址" }]}
          >
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="isDefault" valuePropName="checked" initialValue={false}>
            <Checkbox>设为默认收货地址</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
