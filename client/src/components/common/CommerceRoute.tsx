import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useCommerceFlags } from "@/store/featureFlags";
import {
  type PublicContentLocale,
  withPublicLocalePath,
} from "@/i18n/publicLocale";
import RouteLoading from "./RouteLoading";

const SelectionBag = lazy(() => import("@/pages/public/Cart/SelectionBag"));

/**
 * 购物车和结算核对跟随购物车准备开关。
 * 准备关闭时，购物车展示本地选款，结算回到咨询页。
 * 提交订单和支付仍由成交开关与服务端守卫拦截。
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
  if (!flags.cartEnabled) {
    if (capability === "cart") {
      return (
        <Suspense fallback={<RouteLoading />}>
          <SelectionBag />
        </Suspense>
      );
    }
    return (
      <>
        <RouteLoading surface="public" />
        <Navigate to={withPublicLocalePath("/contact", locale)} replace />
      </>
    );
  }
  return <>{children}</>;
}
