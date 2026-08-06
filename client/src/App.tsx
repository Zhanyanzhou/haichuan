import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { Spin } from 'antd';
import PublicLayout from '@/components/layout/PublicLayout';
import AdminLayout from '@/components/layout/AdminLayout';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import ProtectedRoute from '@/components/common/ProtectedRoute';
import ProgressBar from '@/components/common/ProgressBar';

// Lazy load pages
const Home = lazy(() => import('@/pages/public/Home'));
const ProductList = lazy(() => import('@/pages/public/ProductList'));
const ProductDetail = lazy(() => import('@/pages/public/ProductDetail'));
const Cart = lazy(() => import('@/pages/public/Cart'));
const Checkout = lazy(() => import('@/pages/public/Checkout'));
const CustomerCenter = lazy(() => import('@/pages/public/CustomerCenter'));
const About = lazy(() => import('@/pages/public/About'));
const Contact = lazy(() => import('@/pages/public/Contact'));
const Catalog = lazy(() => import('@/pages/public/Catalog'));
const Custom = lazy(() => import('@/pages/public/Custom'));
const Search = lazy(() => import('@/pages/public/Search'));

const Login = lazy(() => import('@/pages/admin/Login'));
const Dashboard = lazy(() => import('@/pages/admin/Dashboard'));
const ProductManage = lazy(() => import('@/pages/admin/ProductManage'));
const CategoryManage = lazy(() => import('@/pages/admin/CategoryManage'));
const AIClassify = lazy(() => import('@/pages/admin/AIClassify'));
const GoldPrice = lazy(() => import('@/pages/admin/GoldPrice'));
const Inventory = lazy(() => import('@/pages/admin/Inventory'));
const OrderManage = lazy(() => import('@/pages/admin/OrderManage'));
const UserManage = lazy(() => import('@/pages/admin/UserManage'));
const Settings = lazy(() => import('@/pages/admin/Settings'));
const HomepageConfig = lazy(() => import('@/pages/admin/HomepageConfig'));
const InquiryManage = lazy(() => import('@/pages/admin/InquiryManage'));
const MediaLibrary = lazy(() => import('@/pages/admin/MediaLibrary'));
const AuditLogs = lazy(() => import('@/pages/admin/AuditLogs'));
const SiteContent = lazy(() => import('@/pages/admin/SiteContent'));
const SelectionInquiry = lazy(() => import('@/pages/admin/SelectionInquiry'));

const Loading = () => (
  <div className="flex items-center justify-center min-h-screen bg-brand-bg">
    <Spin size="large" />
  </div>
);

function App() {
  return (
    <ErrorBoundary>
    <ProgressBar />
    <Suspense fallback={<Loading />}>
      <Routes>
        {/* Public Routes — 首页和其他页面统一使用 PublicLayout */}
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="products" element={<ProductList />} />
          <Route path="products/:id" element={<ProductDetail />} />
          <Route path="cart" element={<Cart />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="custom" element={<Custom />} />
          <Route path="search" element={<Search />} />
          <Route path="customer" element={<CustomerCenter />} />
          <Route path="about" element={<About />} />
          <Route path="contact" element={<Contact />} />
        </Route>

        {/* Admin Routes — 需要登录 */}
        <Route path="/admin" element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="products" element={<ProductManage />} />
          <Route path="categories" element={<CategoryManage />} />
          <Route path="ai-classify" element={<AIClassify />} />
          <Route path="gold-price" element={<GoldPrice />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="orders" element={<OrderManage />} />
          <Route path="users" element={<UserManage />} />
          <Route path="settings" element={<Settings />} />
          <Route path="homepage" element={<HomepageConfig />} />
          <Route path="inquiries" element={<InquiryManage />} />
          <Route path="media" element={<MediaLibrary />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="site-content" element={<SiteContent />} />
          <Route path="selection-inquiry" element={<SelectionInquiry />} />
        </Route>

        {/* Login */}
        <Route path="/admin/login" element={<Login />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  );
}

export default App;
