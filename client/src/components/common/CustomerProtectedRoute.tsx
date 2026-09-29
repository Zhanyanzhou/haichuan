import { Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { useCustomerAuthStore } from '@/store/customerAuthStore';
import { customerApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import type { CustomerAccount } from '@/store/customerAuthStore';
import { requestStatus } from '@/services/httpClient';

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
  const [verificationError, setVerificationError] = useState(false);
  const [verificationAttempt, setVerificationAttempt] = useState(0);

  useEffect(() => {
    if (status !== 'unknown') return;
    let active = true;
    setVerificationError(false);
    customerApi.getProfile()
      .then((response) => {
        if (active) setAuth(unwrapResponse<CustomerAccount>(response));
      })
      .catch((error: unknown) => {
        if (!active || useCustomerAuthStore.getState().status !== 'unknown') return;
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
            <p>登录状态暂时无法确认，当前页面没有加载任何账户数据。</p>
            <button
              type="button"
              className="mt-4 min-h-11 border border-brand-ink px-5"
              onClick={() => setVerificationAttempt((attempt) => attempt + 1)}
            >
              重新验证
            </button>
          </div>
        </div>
      );
    }
    return <div className="flex min-h-screen items-center justify-center" role="status">正在验证登录状态…</div>;
  }

  if (status !== 'authenticated') {
    const returnTo = location.pathname + location.search;
    return <Navigate to="/customer" state={{ returnTo }} replace />;
  }
  return <>{children}</>;
}
