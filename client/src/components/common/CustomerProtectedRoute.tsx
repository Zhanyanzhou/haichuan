import { Navigate, useLocation } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import { useCustomerAuthStore } from '@/store/customerAuthStore';
import { customerApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import type { CustomerAccount } from '@/store/customerAuthStore';

/**
 * 前台客户路由守卫（不复用后台 ProtectedRoute，后者依赖管理员 authStore）。
 *
 * 行为：
 * - 服务端 Cookie 会话无效 → 跳转 /customer 并通过 location.state.returnTo 保存原地址；
 * - 登录/注册成功后由 CustomerCenter 安全恢复 returnTo（仅内部路径，防开放重定向）；
 * - token 有效性由接口 401 兜底（api.ts 对非 admin 的 401 跳 /customer）。
 */
export function CustomerProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { status, setAuth, markAnonymous } = useCustomerAuthStore();

  useEffect(() => {
    if (status !== 'unknown') return;
    customerApi.getProfile()
      .then((response) => setAuth(unwrapResponse<CustomerAccount>(response)))
      .catch(() => markAnonymous());
  }, [markAnonymous, setAuth, status]);

  if (status === 'unknown') {
    return <div className="flex min-h-screen items-center justify-center" role="status">正在验证登录状态…</div>;
  }

  if (status !== 'authenticated') {
    const returnTo = location.pathname + location.search;
    return <Navigate to="/customer" state={{ returnTo }} replace />;
  }
  return <>{children}</>;
}
