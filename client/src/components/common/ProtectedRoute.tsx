import { Navigate, useLocation } from 'react-router-dom';
import { Result, Button, Spin } from 'antd';
import { useAuthStore } from '@/store/authStore';
import { useEffect } from 'react';
import { authApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import type { User } from '@/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
}

/** 路由守卫：检查登录态和角色权限 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, roles }) => {
  const { status, isLoggedIn, user, setAuth, markAnonymous } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (status !== 'unknown') return;
    authApi.getProfile()
      .then((response) => setAuth(unwrapResponse<User>(response)))
      .catch(() => markAnonymous());
  }, [markAnonymous, setAuth, status]);

  if (status === 'unknown') {
    return <div className="flex min-h-screen items-center justify-center"><Spin size="large" /></div>;
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
            <Button type="primary" onClick={() => window.history.back()}>
              返回上一页
            </Button>
          }
        />
      );
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
