import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { App as AntdApp, Alert, Button, Spin } from "antd";
import { customerApi, partnerApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import AccountExperience from "./AccountExperience";
import MyAccountDashboard from "./MyAccountDashboard";
import PartnerApplication from "@/pages/public/PartnerApplication";
import type {
  CustomerAddress,
  CustomerConsultationDetail,
  CustomerInquiryPage,
  CustomerNotificationPage,
  CustomerOrder,
  CustomerPartnerState,
  CustomerProfile,
  CustomerSelectionInquiry,
} from "./types";
import { useCustomerAuthStore } from "@/store/customerAuthStore";
import type { CustomerAccount } from "@/store/customerAuthStore";
import { getRequestErrorMessage } from "@/services/httpClient";
import {
  currentSessionEpoch,
  isCurrentSessionEpoch,
} from "@/services/sessionEpoch";

const EMPTY_NOTIFICATIONS: CustomerNotificationPage = {
  list: [],
  total: 0,
  unreadCount: 0,
  page: 1,
  pageSize: 20,
};

const INQUIRY_PAGE_SIZE = 3;
const CUSTOMER_RETURN_PATH_MAX_LENGTH = 2048;
const CUSTOMER_RETURN_PATH_BASE = "https://customer-return.invalid";
const EMPTY_INQUIRIES: CustomerInquiryPage = {
  list: [],
  total: 0,
  page: 1,
  pageSize: INQUIRY_PAGE_SIZE,
};

export function normalizeCustomerReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  const hasControlCharacter = Array.from(candidate).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (
    !candidate
    || candidate.length > CUSTOMER_RETURN_PATH_MAX_LENGTH
    || !candidate.startsWith("/")
    || candidate.startsWith("//")
    || candidate.includes("\\")
    || hasControlCharacter
  ) return null;

  try {
    const parsed = new URL(candidate, CUSTOMER_RETURN_PATH_BASE);
    if (parsed.origin !== CUSTOMER_RETURN_PATH_BASE) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function normalizeInquiryPage(
  value: unknown,
  requestedPage: number,
): CustomerInquiryPage {
  // 兼容前后端滚动发布期间的旧数组响应；新接口始终返回分页对象。
  if (Array.isArray(value)) {
    return {
      list: value,
      total: value.length,
      page: requestedPage,
      pageSize: INQUIRY_PAGE_SIZE,
    } as CustomerInquiryPage;
  }
  const page = value as Partial<CustomerInquiryPage> | null;
  return {
    list: Array.isArray(page?.list) ? page.list : [],
    total: typeof page?.total === "number" ? page.total : 0,
    page: typeof page?.page === "number" ? page.page : requestedPage,
    pageSize:
      typeof page?.pageSize === "number" ? page.pageSize : INQUIRY_PAGE_SIZE,
  };
}

function getRequestStatus(error: unknown): number | undefined {
  const candidate = error as {
    response?: { status?: unknown };
    status?: unknown;
  };
  const status = candidate.response?.status ?? candidate.status;
  return typeof status === "number" ? status : undefined;
}

function parseCanonicalConsultationTarget(search: string): {
  leadId: number | null;
  invalid: boolean;
} {
  const params = new URLSearchParams(search);
  const leadIds = params.getAll("leadId");
  if (leadIds.length === 0) return { leadId: null, invalid: false };

  const keys = Array.from(params.keys());
  const sections = params.getAll("section");
  const hasExactShape = keys.length === 2
    && new Set(keys).size === 2
    && keys.includes("section")
    && keys.includes("leadId")
    && sections.length === 1
    && leadIds.length === 1
    && sections[0] === "consultations";
  const rawLeadId = leadIds[0];
  if (!hasExactShape || !/^[1-9]\d*$/.test(rawLeadId)) {
    return { leadId: null, invalid: true };
  }

  const leadId = Number(rawLeadId);
  return Number.isSafeInteger(leadId)
    ? { leadId, invalid: false }
    : { leadId: null, invalid: true };
}

export default function CustomerCenter() {
  const { message } = AntdApp.useApp();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [selectionInquiries, setSelectionInquiries] = useState<CustomerSelectionInquiry[]>([]);
  const [selectionInquiryLoading, setSelectionInquiryLoading] = useState(false);
  const [selectionInquiryError, setSelectionInquiryError] = useState<string | null>(null);
  const [consultationDetail, setConsultationDetail] = useState<CustomerConsultationDetail | null>(null);
  const [consultationLoading, setConsultationLoading] = useState(false);
  const [consultationError, setConsultationError] = useState<"not-found" | "error" | null>(null);
  const [inquiries, setInquiries] = useState<CustomerInquiryPage>(EMPTY_INQUIRIES);
  const [inquiryLoading, setInquiryLoading] = useState(false);
  const [inquiryError, setInquiryError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [partner, setPartner] = useState<CustomerPartnerState>(null);
  const [partnerError, setPartnerError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<CustomerNotificationPage>(EMPTY_NOTIFICATIONS);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasSuccessfulSnapshotRef = useRef(false);
  const snapshotRequestRef = useRef(0);
  const identityReloadRef = useRef<number | null>(null);
  const consultationRequestRef = useRef(0);
  const authAttemptRef = useRef(0);
  const mountedRef = useRef(true);

  const location = useLocation();
  const consultationTarget = parseCanonicalConsultationTarget(location.search);
  const requestedLeadId = consultationTarget.leadId;
  const invalidConsultationTarget = consultationTarget.invalid;
  const navigate = useNavigate();
  const authStatus = useCustomerAuthStore((state) => state.status);
  const customerIdentityId = useCustomerAuthStore(
    (state) => state.customer?.id ?? null,
  );
  const setCustomerAuth = useCustomerAuthStore((state) => state.setAuth);
  const updateCustomerAuth = useCustomerAuthStore((state) => state.updateCustomer);
  const markCustomerAnonymous = useCustomerAuthStore((state) => state.markAnonymous);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      authAttemptRef.current += 1;
    };
  }, []);

  // 安全恢复来源路径：仅允许内部路径（/开头且非 //），防开放重定向
  const consumeReturnTo = (): string | null => {
    const locationState =
      typeof location.state === "object" && location.state !== null
        ? (location.state as Record<string, unknown>)
        : null;
    const raw = locationState?.returnTo
      ?? new URLSearchParams(location.search).get("returnTo");
    return normalizeCustomerReturnPath(raw);
  };

  const resetPrivateState = useCallback(() => {
    setOrders([]);
    setSelectionInquiries([]);
    setSelectionInquiryLoading(false);
    setSelectionInquiryError(null);
    consultationRequestRef.current += 1;
    setConsultationDetail(null);
    setConsultationLoading(false);
    setConsultationError(null);
    setInquiries(EMPTY_INQUIRIES);
    setInquiryLoading(false);
    setInquiryError(null);
    setAddresses([]);
    setProfile(null);
    setPartner(null);
    setPartnerError(null);
    setNotifications(EMPTY_NOTIFICATIONS);
    setNotificationLoading(false);
    setNotificationError(null);
    hasSuccessfulSnapshotRef.current = false;
  }, []);

  const clearSession = useCallback(() => {
    markCustomerAnonymous();
    resetPrivateState();
  }, [markCustomerAnonymous, resetPrivateState]);

  const loadNotifications = useCallback(async () => {
    const requestEpoch = currentSessionEpoch("customer");
    setNotificationLoading(true);
    try {
      const response = await customerApi.getNotifications({ pageSize: 20 });
      if (!isCurrentSessionEpoch("customer", requestEpoch)) return;
      setNotifications(
        unwrapResponse<CustomerNotificationPage>(response) || EMPTY_NOTIFICATIONS,
      );
      setNotificationError(null);
    } catch (error) {
      if (!isCurrentSessionEpoch("customer", requestEpoch)) return;
      if (getRequestStatus(error) === 401) {
        clearSession();
        return;
      }
      setNotificationError(
        getRequestStatus(error) === 403
          ? "你没有查看服务通知的权限。"
          : "服务通知暂时无法加载，订单和账户功能不受影响。",
      );
    } finally {
      if (isCurrentSessionEpoch("customer", requestEpoch)) {
        setNotificationLoading(false);
      }
    }
  }, [clearSession]);

  const loadInquiryPage = useCallback(async (page: number) => {
    const requestEpoch = currentSessionEpoch("customer");
    setInquiryLoading(true);
    try {
      const response = await customerApi.getInquiries({
        page,
        pageSize: INQUIRY_PAGE_SIZE,
      });
      if (!isCurrentSessionEpoch("customer", requestEpoch)) return;
      setInquiries(normalizeInquiryPage(unwrapResponse<unknown>(response), page));
      setInquiryError(null);
    } catch (error) {
      if (!isCurrentSessionEpoch("customer", requestEpoch)) return;
      if (getRequestStatus(error) === 401) {
        clearSession();
        return;
      }
      setInquiryError(
        getRequestStatus(error) === 403
          ? "你没有查看预约咨询的权限。如需帮助，请联系顾问。"
          : "预约记录暂时无法加载，请稍后重试。",
      );
    } finally {
      if (isCurrentSessionEpoch("customer", requestEpoch)) {
        setInquiryLoading(false);
      }
    }
  }, [clearSession]);

  const loadSelectionInquiries = useCallback(async () => {
    const requestEpoch = currentSessionEpoch("customer");
    setSelectionInquiryLoading(true);
    try {
      const response = await customerApi.getSelectionInquiries();
      if (!isCurrentSessionEpoch("customer", requestEpoch)) return;
      setSelectionInquiries(
        unwrapResponse<CustomerSelectionInquiry[]>(response) || [],
      );
      setSelectionInquiryError(null);
    } catch (error) {
      if (!isCurrentSessionEpoch("customer", requestEpoch)) return;
      if (getRequestStatus(error) === 401) {
        clearSession();
        return;
      }
      setSelectionInquiryError(
        getRequestStatus(error) === 403
          ? "你没有查看选款咨询的权限。如需帮助，请联系顾问。"
          : "选款咨询暂时无法加载，请稍后重试。",
      );
    } finally {
      if (isCurrentSessionEpoch("customer", requestEpoch)) {
        setSelectionInquiryLoading(false);
      }
    }
  }, [clearSession]);

  const loadConsultation = useCallback(async (leadId: number) => {
    const requestVersion = ++consultationRequestRef.current;
    const requestEpoch = currentSessionEpoch("customer");
    setConsultationLoading(true);
    setConsultationError(null);
    setConsultationDetail((current) =>
      current?.leadId === leadId ? current : null,
    );
    try {
      const response = await customerApi.getConsultation(leadId);
      if (
        consultationRequestRef.current !== requestVersion
        || !isCurrentSessionEpoch("customer", requestEpoch)
      ) return;
      const detail = unwrapResponse<CustomerConsultationDetail>(response);
      if (!detail || detail.leadId !== leadId) {
        throw new Error("咨询详情响应不完整");
      }
      setConsultationDetail(detail);
    } catch (error) {
      if (
        consultationRequestRef.current !== requestVersion
        || !isCurrentSessionEpoch("customer", requestEpoch)
      ) return;
      if (getRequestStatus(error) === 401) {
        clearSession();
        return;
      }
      setConsultationDetail(null);
      setConsultationError(
        getRequestStatus(error) === 404 ? "not-found" : "error",
      );
    } finally {
      if (
        consultationRequestRef.current === requestVersion
        && isCurrentSessionEpoch("customer", requestEpoch)
      ) {
        setConsultationLoading(false);
      }
    }
  }, [clearSession]);

  const load = useCallback(async () => {
    const requestVersion = ++snapshotRequestRef.current;
    if (useCustomerAuthStore.getState().status === 'anonymous') {
      setLoadError(null);
      setLoading(false);
      return;
    }
    if (!hasSuccessfulSnapshotRef.current) setLoading(true);
    setLoadError(null);
    let requestEpoch = currentSessionEpoch("customer");
    const isCurrentRequest = () =>
      snapshotRequestRef.current === requestVersion
      && isCurrentSessionEpoch("customer", requestEpoch);
    try {
      const profileRes = await customerApi.getProfile();
      if (!isCurrentRequest()) return;
      const nextProfile = unwrapResponse<CustomerProfile>(profileRes);
      // 身份恢复与业务快照分开提交：profile 已确认后即可保持登录态；
      // 订单等核心资源仍需全部成功才写入，避免失败被伪装成空数据。
      const currentAuth = useCustomerAuthStore.getState();
      identityReloadRef.current = nextProfile.id;
      if (
        currentAuth.status === "authenticated"
        && currentAuth.customer?.id === nextProfile.id
      ) {
        // 同一客户的权威 profile 回读只刷新资料，不应推进会话代次；否则从咨询
        // 回执 SPA 跳入本页时，并发的 canonical Lead 详情会被误判为旧身份响应。
        updateCustomerAuth(nextProfile);
      } else {
        if (
          currentAuth.status === "authenticated"
          && currentAuth.customer?.id !== nextProfile.id
        ) {
          // Cookie 会话可能在另一个标签页切换客户。权威 profile 已确认身份变化后，
          // 必须在读取新客户订单前丢弃上一客户的全部私有快照；若后续请求失败，
          // 页面只能显示“尚无可确认数据”，不能继续渲染旧账户记录。
          resetPrivateState();
          setLoading(true);
        }
        setCustomerAuth(nextProfile);
      }
      requestEpoch = currentSessionEpoch("customer");
      const [ordersRes, addressesRes] =
        await Promise.all([
          customerApi.getOrders(),
          customerApi.getAddresses(),
        ]);
      if (!isCurrentRequest()) return;
      setProfile(nextProfile);
      setOrders(unwrapResponse<CustomerOrder[]>(ordersRes) || []);
      setAddresses(unwrapResponse<CustomerAddress[]>(addressesRes) || []);
      hasSuccessfulSnapshotRef.current = true;
      await Promise.all([loadInquiryPage(1), loadSelectionInquiries()]);
      if (
        !isCurrentRequest()
        || useCustomerAuthStore.getState().status === "anonymous"
      ) return;
      void loadNotifications();
      // 合作商家状态独立容错：接口不可用（如后端未部署）时不影响账号页整体加载
      try {
        const partnerRes = await partnerApi.getMine();
        if (!isCurrentRequest()) return;
        setPartner(unwrapResponse<CustomerPartnerState>(partnerRes) || null);
        setPartnerError(null);
      } catch {
        if (!isCurrentRequest()) return;
        setPartnerError("合作状态暂时无法确认，请重新加载后再继续。");
      }
    } catch (error) {
      if (!isCurrentRequest()) return;
      if (getRequestStatus(error) === 401) {
        clearSession();
      } else {
        setLoadError("账户数据暂时无法加载，请稍后重试。");
      }
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, [
    clearSession,
    loadInquiryPage,
    loadNotifications,
    loadSelectionInquiries,
    resetPrivateState,
    setCustomerAuth,
    updateCustomerAuth,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  // refresh 可能在当前页面存活期间确认 Cookie 已切换到另一客户。状态仍是
  // authenticated，不能因此继续展示上一客户已经加载的报价、订单或弹窗。
  useEffect(() => {
    if (authStatus !== "authenticated" || customerIdentityId === null) return;
    if (profile?.id === customerIdentityId) {
      identityReloadRef.current = customerIdentityId;
      return;
    }
    if (identityReloadRef.current === customerIdentityId) return;
    identityReloadRef.current = customerIdentityId;
    resetPrivateState();
    setLoading(true);
    void load();
  }, [
    authStatus,
    customerIdentityId,
    load,
    profile?.id,
    resetPrivateState,
  ]);

  // 共享 HTTP 层会在真实 401 时先推进会话代次并清空认证状态；此时原请求会被
  // 判定为旧代次，不能再依赖它的 catch/finally 收尾，否则页面可能永久停在 loading。
  useEffect(() => {
    if (authStatus !== "anonymous") return;
    identityReloadRef.current = null;
    resetPrivateState();
    setLoadError(null);
    setLoading(false);
  }, [authStatus, resetPrivateState]);

  useEffect(() => {
    if (authStatus !== "authenticated" || requestedLeadId === null) {
      consultationRequestRef.current += 1;
      setConsultationDetail(null);
      setConsultationLoading(false);
      setConsultationError(null);
      return;
    }
    void loadConsultation(requestedLeadId);
  }, [authStatus, loadConsultation, requestedLeadId]);

  const signOut = () => {
    // 本地身份和私有快照必须先失效；远端注销是随后立即发起的 best-effort
    // 清理，不能让网络挂起继续暴露客户私有界面。
    clearSession();
    void customerApi.logout().catch(() => undefined);
  };

  const completeAuth = async (request: Promise<unknown>) => {
    const attempt = authAttemptRef.current + 1;
    authAttemptRef.current = attempt;
    setAuthLoading(true);
    try {
      const result = unwrapResponse<{ customer: CustomerAccount }>(
        await request,
      );
      if (!mountedRef.current || authAttemptRef.current !== attempt) return;
      if (!result?.customer) throw new Error("账户认证失败");
      identityReloadRef.current = result.customer.id;
      setCustomerAuth(result.customer);
      setLoading(true);
      await load();
      if (!mountedRef.current || authAttemptRef.current !== attempt) return;
      const currentAuth = useCustomerAuthStore.getState();
      if (
        currentAuth.status !== "authenticated"
        || currentAuth.customer?.id !== result.customer.id
      ) return;
      message.success("已登录您的会员账户");
      // 登录/注册成功后恢复来源路径（安全：仅内部路径）
      const returnTo = consumeReturnTo();
      if (returnTo) {
        navigate(returnTo, { replace: true });
        return;
      }
    } catch (error: unknown) {
      if (!mountedRef.current || authAttemptRef.current !== attempt) return;
      message.error(getRequestErrorMessage(error, "账户认证失败，请稍后重试"));
    } finally {
      if (mountedRef.current && authAttemptRef.current === attempt) {
        setAuthLoading(false);
      }
    }
  };

  // 微信回调只回传非敏感账户摘要；真实会话已由回调响应写入 HttpOnly Cookie。
  const applyWechatAuth = (result: { customer: CustomerAccount }) => {
    authAttemptRef.current += 1;
    setAuthLoading(false);
    identityReloadRef.current = result.customer.id;
    setCustomerAuth(result.customer);
    setLoading(true);
    void load();
    message.success("已通过微信登录您的会员账户");
    const returnTo = consumeReturnTo();
    if (returnTo) navigate(returnTo, { replace: true });
  };

  if (loading)
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <Spin size="large" />
      </div>
    );

  const isSignedIn = authStatus === 'authenticated';
  const privateSnapshotMatchesIdentity =
    profile?.id === customerIdentityId;
  const accountSection = new URLSearchParams(location.search).get("section");

  if (isSignedIn && !privateSnapshotMatchesIdentity && !loadError) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (isSignedIn) {
    if (accountSection === "partner") {
      return <PartnerApplication />;
    }
    if (loadError && !hasSuccessfulSnapshotRef.current) {
      return (
        <div className="mx-auto flex min-h-[60vh] max-w-[720px] items-center px-4">
          <Alert
            className="w-full"
            showIcon
            type="error"
            message={loadError}
            description="当前没有可确认的账户数据，因此不会把请求失败显示成空订单或空记录。"
            action={
              <Button size="small" onClick={() => void load()}>
                重新加载
              </Button>
            }
          />
        </div>
      );
    }
    return (
      <>
        {loadError && (
          <div className="mx-auto max-w-[1200px] px-4 pt-6">
            <Alert
              showIcon
              type="error"
              message={loadError}
              action={
                <Button size="small" onClick={() => void load()}>
                  重新加载
                </Button>
              }
            />
          </div>
        )}
        <MyAccountDashboard
          key={`customer-${customerIdentityId}`}
          profile={profile}
          partner={partner}
          partnerError={partnerError}
          orders={orders}
          addresses={addresses}
          selectionInquiries={selectionInquiries}
          selectionInquiryLoading={selectionInquiryLoading}
          selectionInquiryError={selectionInquiryError}
          onRetrySelectionInquiries={loadSelectionInquiries}
          selectedLeadId={requestedLeadId}
          invalidSelectedLeadTarget={invalidConsultationTarget}
          consultationDetail={consultationDetail}
          consultationLoading={consultationLoading}
          consultationError={consultationError}
          onRetryConsultation={requestedLeadId === null
            ? undefined
            : () => loadConsultation(requestedLeadId)}
          inquiryPage={inquiries}
          inquiryLoading={inquiryLoading}
          inquiryError={inquiryError}
          onInquiryPageChange={loadInquiryPage}
          notifications={notifications}
          notificationLoading={notificationLoading}
          notificationError={notificationError}
          onRetryNotifications={loadNotifications}
          onReadNotification={async (id) => {
            const requestEpoch = currentSessionEpoch("customer");
            try {
              await customerApi.markNotificationRead(id);
              if (!isCurrentSessionEpoch("customer", requestEpoch)) return;
              await loadNotifications();
            } catch {
              if (!isCurrentSessionEpoch("customer", requestEpoch)) return;
              message.error("通知状态更新失败，请稍后重试");
            }
          }}
          onReadAllNotifications={async () => {
            const requestEpoch = currentSessionEpoch("customer");
            try {
              await customerApi.markAllNotificationsRead();
              if (!isCurrentSessionEpoch("customer", requestEpoch)) return;
              await loadNotifications();
            } catch {
              if (!isCurrentSessionEpoch("customer", requestEpoch)) return;
              message.error("通知状态更新失败，请稍后重试");
            }
          }}
          onSignOut={signOut}
          onRefresh={load}
        />
      </>
    );
  }

  return (
    <AccountExperience
      authLoading={authLoading}
      onLogin={(values) => completeAuth(customerApi.login(values))}
      onRegister={(values) => completeAuth(customerApi.register(values))}
      onWechatAuth={applyWechatAuth}
    />
  );
}
