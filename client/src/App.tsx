import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Suspense, lazy } from "react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { RequestErrorNotice } from "@/components/common/RequestErrorNotice";
import ProgressBar from "@/components/common/ProgressBar";
import RouteLoading from "@/components/common/RouteLoading";
import { rolesForAdminRoute } from "@/config/adminRouteAccess";
import { CONTENT_TEMPLATE_PAGE_PATHS } from "@/page-builder/generated/contentTemplates.generated";
import {
  type PublicContentLocale,
  resolveRetiredEnglishRedirect,
  withPublicLocalePath,
} from "@/i18n/publicLocale";
import PublicLayout from "@/components/layout/PublicLayout";
import Home from "@/pages/public/Home";

// 后台布局与后台鉴权失败页依赖 Ant Design，不应进入前台首屏依赖图。
const AdminLayout = lazy(() => import("@/components/layout/AdminLayout"));
const ProtectedRoute = lazy(() => import("@/components/common/ProtectedRoute"));
const AntdProvider = lazy(() => import("@/components/common/AntdProvider"));
const CustomerProtectedRoute = lazy(() =>
  import("@/components/common/CustomerProtectedRoute").then((module) => ({
    default: module.CustomerProtectedRoute,
  })),
);
const CommerceRoute = lazy(() => import("@/components/common/CommerceRoute"));
const AdminIndexRedirect = lazy(
  () => import("@/pages/admin/AdminIndexRedirect"),
);
// Lazy load pages
const HomePreview = lazy(() =>
  import("@/pages/public/Home/Preview").then((m) => ({ default: m.HomePreview })),
);
const PagePreview = lazy(() =>
  import("@/pages/public/Home/Preview").then((m) => ({ default: m.PagePreview })),
);
const ProductDetail = lazy(() => import("@/pages/public/ProductDetail"));
const CustomerCenter = lazy(() => import("@/pages/public/CustomerCenter"));
const ForgotPassword = lazy(
  () => import("@/pages/public/CustomerCenter/ForgotPassword"),
);
const ResetPassword = lazy(
  () => import("@/pages/public/CustomerCenter/ResetPassword"),
);
const PaymentReview = lazy(() => import("@/pages/admin/PaymentReview"));
const Contact = lazy(() => import("@/pages/public/Contact"));
const Privacy = lazy(() => import("@/pages/public/Privacy"));
const BusinessInfo = lazy(() => import("@/pages/public/BusinessInfo"));
const Cart = lazy(() => import("@/pages/public/Cart"));
const Checkout = lazy(() => import("@/pages/public/Checkout"));
const Catalog = lazy(() => import("@/pages/public/Catalog"));
const NotFound = lazy(() => import("@/pages/public/NotFound"));
// dev-only 模板台架:真实组件的占位状态设计视图(非公开页面)
const TemplateGallery = import.meta.env.DEV
  ? lazy(() => import("@/pages/dev/TemplateGallery"))
  : null;

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

/** 旧搜索链接只做参数兼容；真实查询、建议、历史与埋点统一由选款中心执行。 */
function LegacySearchRedirect({ locale }: { locale: PublicContentLocale }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const query = params.get("query") || params.get("q") || params.get("keyword") || "";
  const category = params.get("category") || params.get("categoryId") || "";
  const material = params.get("material") || params.get("materialType") || "";
  const canonical = new URLSearchParams();
  if (query) canonical.set("query", query);
  if (category) canonical.set("category", category);
  if (material) canonical.set("material", material);
  for (const key of ["subcategory", "craft", "weight", "size", "sort", "page"]) {
    const value = params.get(key);
    if (value) canonical.set(key, value);
  }
  const suffix = canonical.toString();
  const catalogPath = withPublicLocalePath("/catalog", locale);
  return <Navigate replace to={`${catalogPath}${suffix ? `?${suffix}` : ""}`} />;
}

function contentPageRoute(pageKey: keyof typeof CONTENT_TEMPLATE_PAGE_PATHS) {
  const publicPath = CONTENT_TEMPLATE_PAGE_PATHS[pageKey];
  return publicPath === "/" ? "" : publicPath.slice(1);
}

function RetiredEnglishRouteRedirect() {
  const location = useLocation();
  const chinesePath = resolveRetiredEnglishRedirect(location.pathname);
  return <Navigate replace to={`${chinesePath}${location.search}${location.hash}`} />;
}

/** 公开网站只提供中文路由；locale 参数仅保留既有接口类型兼容。 */
function publicRouteElements(locale: PublicContentLocale) {
  return (
    <>
      <Route index element={<Home />} />
      {/* /products 是品牌 PageDocument 容器；不再加载休眠商品列表。 */}
      <Route path={contentPageRoute("products")} element={null} />
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
          <CommerceRoute capability="cart" locale={locale}>
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
          <CommerceRoute capability="checkout" locale={locale}>
            <CustomerProtectedRoute>
              <AntdRoute>
                <Checkout />
              </AntdRoute>
            </CustomerProtectedRoute>
          </CommerceRoute>
        }
      />
      <Route
        path={contentPageRoute("catalog")}
        element={
          <AntdRoute>
            <Catalog />
          </AntdRoute>
        }
      />
      {/* 纯品牌页只由 PublicLayout 中的 PageDocument Renderer 提供内容。 */}
      <Route path={contentPageRoute("custom")} element={null} />
      <Route path="search" element={<LegacySearchRedirect locale={locale} />} />
      <Route
        path="partner"
        element={
          <CustomerProtectedRoute>
            <Navigate
              to={`${withPublicLocalePath("/customer", locale)}?section=partner`}
              replace
            />
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
      <Route path={contentPageRoute("about")} element={null} />
      <Route path={contentPageRoute("contact")} element={<Contact />} />
      <Route path="privacy" element={<Privacy />} />
      <Route path="business-info" element={<BusinessInfo />} />
      <Route path="*" element={<NotFound />} />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ProgressBar />
      <RequestErrorNotice />
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          {/* Public Routes — 首页和其他页面统一使用 PublicLayout */}
          <Route element={<PublicLayout />}>
            {publicRouteElements("zh-CN")}
            {TemplateGallery ? (
              <Route path="__templates" element={<TemplateGallery />} />
            ) : null}
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

          <Route path="/en/*" element={<RetiredEnglishRouteRedirect />} />

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

        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
