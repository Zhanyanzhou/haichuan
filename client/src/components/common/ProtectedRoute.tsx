import { Navigate, useLocation } from 'react-router-dom';
import { Result, Button } from 'antd';
import { useAuthStore } from '@/store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
}

/** 路由守卫：检查登录态和角色权限 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, roles }) => {
  const { isLoggedIn, user } = useAuthStore();
  const location = useLocation();

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
