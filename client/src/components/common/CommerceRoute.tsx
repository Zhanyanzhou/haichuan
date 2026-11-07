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
 * 结算在交易或支付关闭时仍回到咨询页。
 * 购物袋保持可打开：开关关闭时展示已选作品并交给顾问，不进入结算。
 * 服务端 CustomerCommerceGuard 仍拒绝加购、改数量和结算写入。
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
