import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Alert, Button, Spin, message } from "antd";
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

const EMPTY_NOTIFICATIONS: CustomerNotificationPage = {
  list: [],
  total: 0,
  unreadCount: 0,
  page: 1,
  pageSize: 20,
};

const INQUIRY_PAGE_SIZE = 3;
const EMPTY_INQUIRIES: CustomerInquiryPage = {
  list: [],
  total: 0,
  page: 1,
  pageSize: INQUIRY_PAGE_SIZE,
};

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

export default function CustomerCenter() {
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
  const consultationRequestRef = useRef(0);

  const location = useLocation();
  const requestedLeadIdValue = Number(
    new URLSearchParams(location.search).get("leadId"),
  );
  const requestedLeadId = Number.isInteger(requestedLeadIdValue)
    && requestedLeadIdValue > 0
    ? requestedLeadIdValue
    : null;
  const navigate = useNavigate();
  const authStatus = useCustomerAuthStore((state) => state.status);
  const setCustomerAuth = useCustomerAuthStore((state) => state.setAuth);
  const markCustomerAnonymous = useCustomerAuthStore((state) => state.markAnonymous);

  // 安全恢复来源路径：仅允许内部路径（/开头且非 //），防开放重定向
  const consumeReturnTo = (): string | null => {
    const locationState =
      typeof location.state === "object" && location.state !== null
        ? (location.state as Record<string, unknown>)
        : null;
    const raw = locationState?.returnTo
      ?? new URLSearchParams(location.search).get("returnTo");
    if (
      typeof raw === "string" &&
      raw.startsWith("/") &&
      !raw.startsWith("//")
    ) {
      return raw;
    }
    return null;
  };

  const clearSession = useCallback(() => {
    markCustomerAnonymous();
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
  }, [markCustomerAnonymous]);

  const loadNotifications = useCallback(async () => {
    setNotificationLoading(true);
    try {
      const response = await customerApi.getNotifications({ pageSize: 20 });
      setNotifications(
        unwrapResponse<CustomerNotificationPage>(response) || EMPTY_NOTIFICATIONS,
      );
      setNotificationError(null);
    } catch (error) {
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
      setNotificationLoading(false);
    }
  }, [clearSession]);

  const loadInquiryPage = useCallback(async (page: number) => {
    setInquiryLoading(true);
    try {
      const response = await customerApi.getInquiries({
        page,
        pageSize: INQUIRY_PAGE_SIZE,
      });
      setInquiries(normalizeInquiryPage(unwrapResponse<unknown>(response), page));
      setInquiryError(null);
    } catch (error) {
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
      setInquiryLoading(false);
    }
  }, [clearSession]);

  const loadSelectionInquiries = useCallback(async () => {
    setSelectionInquiryLoading(true);
    try {
      const response = await customerApi.getSelectionInquiries();
      setSelectionInquiries(
        unwrapResponse<CustomerSelectionInquiry[]>(response) || [],
      );
      setSelectionInquiryError(null);
    } catch (error) {
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
      setSelectionInquiryLoading(false);
    }
  }, [clearSession]);

  const loadConsultation = useCallback(async (leadId: number) => {
    const requestVersion = ++consultationRequestRef.current;
    setConsultationLoading(true);
    setConsultationError(null);
    setConsultationDetail((current) =>
      current?.leadId === leadId ? current : null,
    );
    try {
      const response = await customerApi.getConsultation(leadId);
      if (consultationRequestRef.current !== requestVersion) return;
      const detail = unwrapResponse<CustomerConsultationDetail>(response);
      if (!detail || detail.leadId !== leadId) {
        throw new Error("咨询详情响应不完整");
      }
      setConsultationDetail(detail);
    } catch (error) {
      if (consultationRequestRef.current !== requestVersion) return;
      if (getRequestStatus(error) === 401) {
        clearSession();
        return;
      }
      setConsultationDetail(null);
      setConsultationError(
        getRequestStatus(error) === 404 ? "not-found" : "error",
      );
    } finally {
      if (consultationRequestRef.current === requestVersion) {
        setConsultationLoading(false);
      }
    }
  }, [clearSession]);

  const load = useCallback(async () => {
    if (useCustomerAuthStore.getState().status === 'anonymous') {
      setLoadError(null);
      setLoading(false);
      return;
    }
    if (!hasSuccessfulSnapshotRef.current) setLoading(true);
    setLoadError(null);
    try {
      const profileRes = await customerApi.getProfile();
      const nextProfile = unwrapResponse<CustomerProfile>(profileRes);
      // 身份恢复与业务快照分开提交：profile 已确认后即可保持登录态；
      // 订单等核心资源仍需全部成功才写入，避免失败被伪装成空数据。
      setCustomerAuth(nextProfile);
      const [ordersRes, addressesRes] =
        await Promise.all([
          customerApi.getOrders(),
          customerApi.getAddresses(),
        ]);
      setProfile(nextProfile);
      setOrders(unwrapResponse<CustomerOrder[]>(ordersRes) || []);
      setAddresses(unwrapResponse<CustomerAddress[]>(addressesRes) || []);
      hasSuccessfulSnapshotRef.current = true;
      await Promise.all([loadInquiryPage(1), loadSelectionInquiries()]);
      if (useCustomerAuthStore.getState().status === "anonymous") return;
      void loadNotifications();
      // 合作商家状态独立容错：接口不可用（如后端未部署）时不影响账号页整体加载
      try {
        const partnerRes = await partnerApi.getMine();
        setPartner(unwrapResponse<CustomerPartnerState>(partnerRes) || null);
        setPartnerError(null);
      } catch {
        setPartnerError("合作状态暂时无法确认，请重新加载后再继续。");
      }
    } catch (error) {
      if (getRequestStatus(error) === 401) {
        clearSession();
      } else {
        setLoadError("账户数据暂时无法加载，请稍后重试。");
      }
    } finally {
      setLoading(false);
    }
  }, [clearSession, loadInquiryPage, loadNotifications, loadSelectionInquiries, setCustomerAuth]);

  useEffect(() => {
    void load();
  }, [load]);

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
    void customerApi.logout().finally(clearSession);
  };

  const completeAuth = async (request: Promise<unknown>) => {
    setAuthLoading(true);
    try {
      const result = unwrapResponse<{ customer: CustomerAccount }>(
        await request,
      );
      if (!result?.customer) throw new Error("账户认证失败");
      setCustomerAuth(result.customer);
      setLoading(true);
      await load();
      message.success("已登录您的会员账户");
      // 登录/注册成功后恢复来源路径（安全：仅内部路径）
      const returnTo = consumeReturnTo();
      if (returnTo) {
        navigate(returnTo, { replace: true });
        return;
      }
    } catch (error: unknown) {
      message.error(getRequestErrorMessage(error, "账户认证失败，请稍后重试"));
    } finally {
      setAuthLoading(false);
    }
  };

  // 微信回调只回传非敏感账户摘要；真实会话已由回调响应写入 HttpOnly Cookie。
  const applyWechatAuth = (result: { customer: CustomerAccount }) => {
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
  const accountSection = new URLSearchParams(location.search).get("section");

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
            try {
              await customerApi.markNotificationRead(id);
              await loadNotifications();
            } catch {
              message.error("通知状态更新失败，请稍后重试");
            }
          }}
          onReadAllNotifications={async () => {
            try {
              await customerApi.markAllNotificationsRead();
              await loadNotifications();
            } catch {
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
