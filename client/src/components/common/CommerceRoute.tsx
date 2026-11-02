import { useEffect, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { useCommerceFlags } from "@/store/featureFlags";
import {
  type PublicContentLocale,
  withPublicLocalePath,
} from "@/i18n/publicLocale";
import RouteLoading from "./RouteLoading";

/**
 * 结算在交易或支付关闭时仍回到咨询页。
 * 购物车页保持可打开：开关关闭时只说明购买尚未开放，不把购物袋点击变成咨询页。
 * 服务端 CustomerCommerceGuard 仍拒绝加购、改数量和结算写入。
 */
function CartClosedNotice() {
  return (
    <div className="cart-page flex min-h-screen items-center justify-center bg-brand-bg px-6">
      <div className="max-w-md text-center">
        <h1 className="mb-4 font-display text-2xl text-brand-text">购物车</h1>
        <p className="mb-6 leading-7 text-brand-muted">
          线上购买尚未开放。您可以先去选款，或把需求交给顾问。
        </p>
        <Link to="/catalog" className="btn btn-primary">去选款</Link>
      </div>
    </div>
  );
}
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
    if (capability === "cart") return <CartClosedNotice />;
    return <Navigate to={withPublicLocalePath("/contact", locale)} replace />;
  }
  return <>{children}</>;
}
