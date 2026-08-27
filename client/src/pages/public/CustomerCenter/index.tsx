import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Alert, Button, Spin, message } from "antd";
import { customerApi, partnerApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import AccountExperience from "./AccountExperience";
import MyAccountDashboard from "./MyAccountDashboard";
import PartnerApplication from "@/pages/public/PartnerApplication";
import type {
  CustomerAddress,
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
  const [inquiries, setInquiries] = useState<CustomerInquiryPage>(EMPTY_INQUIRIES);
  const [inquiryLoading, setInquiryLoading] = useState(false);
  const [inquiryError, setInquiryError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [partner, setPartner] = useState<CustomerPartnerState>(null);
  const [notifications, setNotifications] = useState<CustomerNotificationPage>(EMPTY_NOTIFICATIONS);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const location = useLocation();
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
    setInquiries(EMPTY_INQUIRIES);
    setInquiryLoading(false);
    setInquiryError(null);
    setAddresses([]);
    setProfile(null);
    setPartner(null);
    setNotifications(EMPTY_NOTIFICATIONS);
    setNotificationError(null);
  }, [markCustomerAnonymous]);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await customerApi.getNotifications({ pageSize: 20 });
      setNotifications(
        unwrapResponse<CustomerNotificationPage>(response) || EMPTY_NOTIFICATIONS,
      );
      setNotificationError(null);
    } catch {
      setNotifications(EMPTY_NOTIFICATIONS);
      setNotificationError("服务通知暂时无法加载，订单和账户功能不受影响。");
    }
  }, []);

  const loadInquiryPage = useCallback(async (page: number) => {
    setInquiryLoading(true);
    try {
      const response = await customerApi.getInquiries({
        page,
        pageSize: INQUIRY_PAGE_SIZE,
      });
      setInquiries(normalizeInquiryPage(unwrapResponse<unknown>(response), page));
      setInquiryError(null);
    } catch {
      setInquiryError("预约记录暂时无法加载，请稍后重试。");
    } finally {
      setInquiryLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (useCustomerAuthStore.getState().status === 'anonymous') {
      setLoadError(null);
      setLoading(false);
      return;
    }
    setLoadError(null);
    try {
      const profileRes = await customerApi.getProfile();
      const nextProfile = unwrapResponse<CustomerProfile>(profileRes);
      setCustomerAuth(nextProfile);
      setProfile(nextProfile);
      const [ordersRes, addressesRes, selectionsRes] =
        await Promise.all([
          customerApi.getOrders(),
          customerApi.getAddresses(),
          customerApi.getSelectionInquiries(),
        ]);
      setOrders(unwrapResponse<CustomerOrder[]>(ordersRes) || []);
      setAddresses(unwrapResponse<CustomerAddress[]>(addressesRes) || []);
      setSelectionInquiries(unwrapResponse<CustomerSelectionInquiry[]>(selectionsRes) || []);
      await loadInquiryPage(1);
      void loadNotifications();
      // 合作商家状态独立容错：接口不可用（如后端未部署）时不影响账号页整体加载
      try {
        const partnerRes = await partnerApi.getMine();
        setPartner(unwrapResponse<CustomerPartnerState>(partnerRes) || null);
      } catch {
        setPartner(null);
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
  }, [clearSession, loadInquiryPage, loadNotifications, setCustomerAuth]);

  useEffect(() => {
    void load();
  }, [load]);

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
          orders={orders}
          addresses={addresses}
          selectionInquiries={selectionInquiries}
          inquiryPage={inquiries}
          inquiryLoading={inquiryLoading}
          inquiryError={inquiryError}
          onInquiryPageChange={loadInquiryPage}
          notifications={notifications}
          notificationError={notificationError}
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
