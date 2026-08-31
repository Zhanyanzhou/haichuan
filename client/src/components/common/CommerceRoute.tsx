import { useEffect, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useCommerceFlags } from "@/store/featureFlags";
import {
  type PublicContentLocale,
  withPublicLocalePath,
} from "@/i18n/publicLocale";
import RouteLoading from "./RouteLoading";

/**
 * 交易开关关闭或读取失败时，直接访问旧链接也不能进入购物车/结算页面。
 * 服务端 CustomerCommerceGuard 仍是写操作的最终保护；本组件只负责访客路径降级。
 */
export default function CommerceRoute({
  children,
  capability,
  locale,
}: {
  children: ReactNode;
  capability: "cart" | "checkout";
  locale: PublicContentLocale;
}) {
  const flags = useCommerceFlags((state) => state.flags);
  const loading = useCommerceFlags((state) => state.loading);
  const load = useCommerceFlags((state) => state.load);

  useEffect(() => {
    if (!flags && !loading) void load();
  }, [flags, loading, load]);

  if (!flags) return <RouteLoading />;
  const allowed = capability === "cart"
    ? flags.commerceEnabled && flags.cartEnabled
    : flags.commerceEnabled && flags.cartEnabled && flags.paymentEnabled;
  if (!allowed) {
    return <Navigate to={withPublicLocalePath("/contact", locale)} replace />;
  }
  return <>{children}</>;
}
