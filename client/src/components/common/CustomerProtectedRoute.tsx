import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * 前台客户路由守卫（不复用后台 ProtectedRoute，后者依赖管理员 authStore）。
 *
 * 行为：
 * - 缺少 customerToken → 跳转 /customer 并通过 location.state.returnTo 保存原地址；
 * - 登录/注册成功后由 CustomerCenter 安全恢复 returnTo（仅内部路径，防开放重定向）；
 * - token 有效性由接口 401 兜底（api.ts 对非 admin 的 401 跳 /customer）。
 */
export function CustomerProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('customerToken') : null;

  if (!token) {
    const returnTo = location.pathname + location.search;
    return <Navigate to="/customer" state={{ returnTo }} replace />;
  }
  return <>{children}</>;
}
