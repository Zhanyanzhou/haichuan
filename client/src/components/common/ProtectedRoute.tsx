import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Result, Button, Spin } from 'antd';
import { useAuthStore } from '@/store/authStore';
import { useEffect } from 'react';
import { authApi } from '@/services/api';
import { requestStatus } from '@/services/httpClient';
import { unwrapResponse } from '@/utils/unwrap';
import { adminLandingRoute } from '@/config/adminRouteAccess';
import type { User } from '@/types';
import { useState } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
}

/** 路由守卫：检查登录态和角色权限 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, roles }) => {
  const { status, isLoggedIn, user, setAuth, markAnonymous } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [verificationError, setVerificationError] = useState(false);
  const [verificationAttempt, setVerificationAttempt] = useState(0);

  useEffect(() => {
    if (status !== 'unknown') return;
    let active = true;
    setVerificationError(false);
    authApi.getProfile()
      .then((response) => {
        if (active && useAuthStore.getState().status === 'unknown') {
          setAuth(unwrapResponse<User>(response));
        }
      })
      .catch((error: unknown) => {
        if (!active || useAuthStore.getState().status !== 'unknown') return;
        if (requestStatus(error) === 401) {
          markAnonymous();
          return;
        }
        setVerificationError(true);
      });
    return () => {
      active = false;
    };
  }, [markAnonymous, setAuth, status, verificationAttempt]);

  if (status === 'unknown') {
    if (verificationError) {
      return (
        <div className="flex min-h-screen items-center justify-center px-5">
          <div className="max-w-md text-center" role="alert">
            <p>后台登录状态暂时无法确认，当前页面没有加载任何运营数据。</p>
            <Button
              type="primary"
              className="mt-4"
              onClick={() => setVerificationAttempt((attempt) => attempt + 1)}
            >
              重新验证
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center gap-3" role="status">
        <Spin size="large" />
        <span>正在验证后台登录状态…</span>
      </div>
    );
  }

  // 未登录 → 跳转登录页
  if (!isLoggedIn) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  // 角色检查
  if (roles && roles.length > 0) {
    if (!user?.role || !roles.includes(user.role)) {
      return (
        <Result
          status="403"
          title="403"
          subTitle="抱歉，您没有访问此页面的权限"
          extra={
            <Button type="primary" onClick={() => navigate(adminLandingRoute(user?.role), { replace: true })}>
              返回工作首页
            </Button>
          }
        />
      );
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
