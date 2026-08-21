import { Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import PublicLayout from "@/components/layout/PublicLayout";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { RequestErrorNotice } from "@/components/common/RequestErrorNotice";
import { CustomerProtectedRoute } from "@/components/common/CustomerProtectedRoute";
import ProgressBar from "@/components/common/ProgressBar";
import {
  rolesForAdminRoute,
  canAccessAdminRoute,
} from "@/config/adminRouteAccess";
import { useAuthStore } from "@/store/authStore";
import { useCommerceFlags } from "@/store/featureFlags";

// 后台布局与后台鉴权失败页依赖 Ant Design，不应进入前台首屏依赖图。
const AdminLayout = lazy(() => import("@/components/layout/AdminLayout"));
const ProtectedRoute = lazy(() => import("@/components/common/ProtectedRoute"));
const AntdProvider = lazy(() => import("@/components/common/AntdProvider"));
// Lazy load pages
const Home = lazy(() => import("@/pages/public/Home"));
const HomePreview = lazy(() =>
  import("@/pages/public/Home").then((m) => ({ default: m.HomePreview })),
);
const PagePreview = lazy(() =>
  import("@/pages/public/Home").then((m) => ({ default: m.PagePreview })),
);
const ProductList = lazy(() => import("@/pages/public/ProductList"));
const ProductDetail = lazy(() => import("@/pages/public/ProductDetail"));
const CustomerCenter = lazy(() => import("@/pages/public/CustomerCenter"));
const ForgotPassword = lazy(
  () => import("@/pages/public/CustomerCenter/ForgotPassword"),
);
const ResetPassword = lazy(
  () => import("@/pages/public/CustomerCenter/ResetPassword"),
);
const PaymentReview = lazy(() => import("@/pages/admin/PaymentReview"));
const About = lazy(() => import("@/pages/public/About"));
const Contact = lazy(() => import("@/pages/public/Contact"));
const Privacy = lazy(() => import("@/pages/public/Privacy"));
const BusinessInfo = lazy(() => import("@/pages/public/BusinessInfo"));
const Cart = lazy(() => import("@/pages/public/Cart"));
const Checkout = lazy(() => import("@/pages/public/Checkout"));
const Catalog = lazy(() => import("@/pages/public/Catalog"));
const Custom = lazy(() => import("@/pages/public/Custom"));
const Search = lazy(() => import("@/pages/public/Search"));
const PartnerApplication = lazy(
  () => import("@/pages/public/PartnerApplication"),
);
// dev-only 模板台架:真实组件的占位状态设计视图(非公开页面)
const TemplateGallery = lazy(() => import("@/pages/dev/TemplateGallery"));

const Login = lazy(() => import("@/pages/admin/Login"));
const Dashboard = lazy(() => import("@/pages/admin/Dashboard"));
const ProductManage = lazy(() => import("@/pages/admin/ProductManage"));
const ProductEditor = lazy(() => import("@/pages/admin/ProductEditor/ProfessionalProductEditor"));
const CategoryManage = lazy(() => import("@/pages/admin/CategoryManage"));
const AttributeManage = lazy(() => import("@/pages/admin/AttributeManage"));
const TagManage = lazy(() => import("@/pages/admin/TagManage"));
const AIClassify = lazy(() => import("@/pages/admin/AIClassify"));
const AnalyticsView = lazy(() => import("@/pages/admin/AnalyticsView"));
const GoldPrice = lazy(() => import("@/pages/admin/GoldPrice"));
const Inventory = lazy(() => import("@/pages/admin/Inventory"));
const WarehouseManage = lazy(() => import("@/pages/admin/WarehouseManage"));
const OrderManage = lazy(() => import("@/pages/admin/OrderManage"));
const QuotationManage = lazy(() => import("@/pages/admin/QuotationManage"));
const TradeOverview = lazy(() => import("@/pages/admin/TradeOverview"));
const AnomalyOrders = lazy(() => import("@/pages/admin/AnomalyOrders"));
const FulfillmentCenter = lazy(() => import("@/pages/admin/FulfillmentCenter"));
const RefundManage = lazy(() => import("@/pages/admin/RefundManage"));
const AfterSalesManage = lazy(() => import("@/pages/admin/AfterSalesManage"));
const UserManage = lazy(() => import("@/pages/admin/UserManage"));
const Settings = lazy(() => import("@/pages/admin/Settings"));
const EditorWorkbench = lazy(() => import("@/pages/admin/EditorWorkbench"));

const MediaLibrary = lazy(() => import("@/pages/admin/MediaLibrary"));
const AuditLogs = lazy(() => import("@/pages/admin/AuditLogs"));
const SiteContent = lazy(() => import("@/pages/admin/SiteContent"));
const LeadManage = lazy(() => import("@/pages/admin/LeadManage"));
const MarketingManage = lazy(() => import("@/pages/admin/MarketingManage"));
const PartnerApplications = lazy(
  () => import("@/pages/admin/PartnerApplications"),
);
const ReviewManage = lazy(() => import("@/pages/admin/ReviewManage"));
const CustomerManage = lazy(() => import("@/pages/admin/CustomerManage"));

const Loading = () => (
  <div
    className="flex min-h-screen items-center justify-center bg-brand-bg"
    role="status"
    aria-live="polite"
  >
    <span
      className="h-10 w-10 animate-spin rounded-full border-4 border-brand-line border-t-brand-gold"
      aria-hidden="true"
    />
    <span className="sr-only">页面加载中</span>
  </div>
);

/**
 * 交易开关关闭或读取失败时，直接访问旧链接也不能进入购物车/结算页面。
 * 服务端 CustomerCommerceGuard 仍是写操作的最终保护；本组件只负责访客路径降级。
 */
const CommerceRoute = ({ children }: { children: React.ReactNode }) => {
  const flags = useCommerceFlags((state) => state.flags);
  const loading = useCommerceFlags((state) => state.loading);
  const load = useCommerceFlags((state) => state.load);

  useEffect(() => {
    if (!flags && !loading) void load();
  }, [flags, loading, load]);

  if (!flags) return <Loading />;
  if (!flags.commerceEnabled) return <Navigate to="/contact" replace />;
  return <>{children}</>;
};

const AdminPage = ({
  children,
  route,
}: {
  children: React.ReactNode;
  route: string;
}) => (
  <ProtectedRoute roles={[...(rolesForAdminRoute(route) || [])]}>
    {children}
  </ProtectedRoute>
);

const AntdRoute = ({ children }: { children: React.ReactNode }) => (
  <AntdProvider>{children}</AntdProvider>
);

// 各角色后台落地页（仅声明首屏偏好，权限仍由 ROUTE_RULES 最终校验）
const ADMIN_LANDING: Readonly<Record<string, string>> = {
  SUPER_ADMIN: "/admin/dashboard",
  ADMIN: "/admin/dashboard",
  EDITOR: "/admin/products",
  WAREHOUSE: "/admin/inventory",
  CUSTOMER_SERVICE: "/admin/leads",
  SALES_CONSULTANT: "/admin/trade/quotations",
  FINANCE: "/admin/trade/overview",
};

function AdminIndexRedirect() {
  const role = useAuthStore((s) => s.user?.role);
  const preferred = role ? ADMIN_LANDING[role] : undefined;
  const target =
    preferred && canAccessAdminRoute(role, preferred)
      ? preferred
      : "/admin/dashboard";
  return <Navigate to={target} replace />;
}

function App() {
  return (
    <ErrorBoundary>
      <ProgressBar />
      <RequestErrorNotice />
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Public Routes — 首页和其他页面统一使用 PublicLayout */}
          <Route element={<PublicLayout />}>
            <Route index element={<Home />} />
            <Route
              path="products"
              element={
                <AntdRoute>
                  <ProductList />
                </AntdRoute>
              }
            />
            <Route
              path="products/:id"
              element={
                <AntdRoute>
                  <ProductDetail />
                </AntdRoute>
              }
            />
            <Route
              path="cart"
              element={
                <CommerceRoute>
                  <CustomerProtectedRoute>
                    <AntdRoute>
                      <Cart />
                    </AntdRoute>
                  </CustomerProtectedRoute>
                </CommerceRoute>
              }
            />
            <Route
              path="checkout"
              element={
                <CommerceRoute>
                  <CustomerProtectedRoute>
                    <AntdRoute>
                      <Checkout />
                    </AntdRoute>
                  </CustomerProtectedRoute>
                </CommerceRoute>
              }
            />
            <Route
              path="catalog"
              element={
                <AntdRoute>
                  <Catalog />
                </AntdRoute>
              }
            />
            <Route path="custom" element={<Custom />} />
            <Route path="search" element={<Search />} />
            <Route
              path="partner"
              element={
                <CustomerProtectedRoute>
                  <AntdRoute>
                    <PartnerApplication />
                  </AntdRoute>
                </CustomerProtectedRoute>
              }
            />
            <Route
              path="customer"
              element={
                <AntdRoute>
                  <CustomerCenter />
                </AntdRoute>
              }
            />
            {/* 密码找回：邮件重置链接落地页（公开访问，令牌在链接内） */}
            <Route
              path="customer/forgot"
              element={
                <AntdRoute>
                  <ForgotPassword />
                </AntdRoute>
              }
            />
            <Route
              path="customer/reset"
              element={
                <AntdRoute>
                  <ResetPassword />
                </AntdRoute>
              }
            />
            <Route path="about" element={<About />} />
            <Route path="contact" element={<Contact />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="business-info" element={<BusinessInfo />} />
            <Route path="__templates" element={<TemplateGallery />} />
            <Route
              path="preview/home"
              element={
                <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "EDITOR"]}>
                  <AntdRoute>
                    <HomePreview />
                  </AntdRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="preview/:pageKey"
              element={
                <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "EDITOR"]}>
                  <AntdRoute>
                    <PagePreview />
                  </AntdRoute>
                </ProtectedRoute>
              }
            />
          </Route>

          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AntdRoute>
                  <AdminLayout />
                </AntdRoute>
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminIndexRedirect />} />
            <Route
              path="dashboard"
              element={
                <AdminPage route="/admin/dashboard">
                  <Dashboard />
                </AdminPage>
              }
            />
            <Route
              path="products"
              element={
                <AdminPage route="/admin/products">
                  <ProductManage />
                </AdminPage>
              }
            />
            <Route
              path="products/new"
              element={
                <AdminPage route="/admin/products">
                  <ProductEditor />
                </AdminPage>
              }
            />
            <Route
              path="products/:id/edit"
              element={
                <AdminPage route="/admin/products">
                  <ProductEditor />
                </AdminPage>
              }
            />
            <Route
              path="categories"
              element={
                <AdminPage route="/admin/categories">
                  <CategoryManage />
                </AdminPage>
              }
            />
            <Route
              path="attributes"
              element={
                <AdminPage route="/admin/attributes">
                  <AttributeManage />
                </AdminPage>
              }
            />
            <Route
              path="tags"
              element={
                <AdminPage route="/admin/tags">
                  <TagManage />
                </AdminPage>
              }
            />
            <Route
              path="ai-classify"
              element={
                <AdminPage route="/admin/ai-classify">
                  <AIClassify />
                </AdminPage>
              }
            />
            <Route
              path="analytics"
              element={
                <AdminPage route="/admin/analytics">
                  <AnalyticsView />
                </AdminPage>
              }
            />
            <Route
              path="gold-price"
              element={
                <AdminPage route="/admin/gold-price">
                  <GoldPrice />
                </AdminPage>
              }
            />
            <Route
              path="inventory"
              element={
                <AdminPage route="/admin/inventory">
                  <Inventory />
                </AdminPage>
              }
            />
            <Route
              path="warehouses"
              element={
                <AdminPage route="/admin/warehouses">
                  <WarehouseManage />
                </AdminPage>
              }
            />
            <Route
              path="orders"
              element={
                <AdminPage route="/admin/orders">
                  <OrderManage />
                </AdminPage>
              }
            />
            {/* 交易域子页面 */}
            <Route
              path="trade/payments"
              element={
                <AdminPage route="/admin/trade/payments">
                  <PaymentReview />
                </AdminPage>
              }
            />
            <Route
              path="trade/fulfillment"
              element={
                <AdminPage route="/admin/trade/fulfillment">
                  <FulfillmentCenter />
                </AdminPage>
              }
            />
            <Route
              path="trade/refunds"
              element={
                <AdminPage route="/admin/trade/refunds">
                  <RefundManage />
                </AdminPage>
              }
            />
            <Route
              path="trade/after-sales"
              element={
                <AdminPage route="/admin/trade/after-sales">
                  <AfterSalesManage />
                </AdminPage>
              }
            />
            <Route
              path="trade/quotations"
              element={
                <AdminPage route="/admin/trade/quotations">
                  <QuotationManage />
                </AdminPage>
              }
            />
            <Route
              path="trade/overview"
              element={
                <AdminPage route="/admin/trade/overview">
                  <TradeOverview />
                </AdminPage>
              }
            />
            <Route
              path="trade/anomalies"
              element={
                <AdminPage route="/admin/trade/anomalies">
                  <AnomalyOrders />
                </AdminPage>
              }
            />
            <Route
              path="users"
              element={
                <AdminPage route="/admin/users">
                  <UserManage />
                </AdminPage>
              }
            />
            <Route
              path="settings"
              element={
                <AdminPage route="/admin/settings">
                  <Settings />
                </AdminPage>
              }
            />
            <Route
              path="homepage"
              element={<Navigate to="/admin/editor/home" replace />}
            />
            <Route
              path="editor/:pageKey"
              element={
                <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "EDITOR"]}>
                  <EditorWorkbench />
                </ProtectedRoute>
              }
            />
            <Route
              path="media"
              element={
                <AdminPage route="/admin/media">
                  <MediaLibrary />
                </AdminPage>
              }
            />
            <Route
              path="audit-logs"
              element={
                <AdminPage route="/admin/audit-logs">
                  <AuditLogs />
                </AdminPage>
              }
            />
            <Route
              path="site-content"
              element={
                <AdminPage route="/admin/site-content">
                  <SiteContent />
                </AdminPage>
              }
            />
            <Route
              path="leads"
              element={
                <AdminPage route="/admin/leads">
                  <LeadManage />
                </AdminPage>
              }
            />
            <Route
              path="marketing"
              element={
                <AdminPage route="/admin/marketing">
                  <MarketingManage />
                </AdminPage>
              }
            />
            {/* 付款审核已迁移至交易域 /admin/trade/payments；旧 /admin/finance 入口重定向 */}
            <Route
              path="finance"
              element={<Navigate to="/admin/trade/payments" replace />}
            />
            <Route
              path="partner-applications"
              element={
                <AdminPage route="/admin/partner-applications">
                  <PartnerApplications />
                </AdminPage>
              }
            />
            <Route
              path="reviews"
              element={
                <AdminPage route="/admin/reviews">
                  <ReviewManage />
                </AdminPage>
              }
            />
            <Route
              path="customers"
              element={
                <AdminPage route="/admin/customers">
                  <CustomerManage />
                </AdminPage>
              }
            />
          </Route>

          {/* Login */}
          <Route
            path="/admin/login"
            element={
              <AntdRoute>
                <Login />
              </AntdRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
