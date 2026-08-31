import { Navigate } from "react-router-dom";
import { canAccessAdminRoute } from "@/config/adminRouteAccess";
import { useAuthStore } from "@/store/authStore";

const ADMIN_LANDING: Readonly<Record<string, string>> = {
  SUPER_ADMIN: "/admin/dashboard",
  ADMIN: "/admin/dashboard",
  EDITOR: "/admin/products",
  WAREHOUSE: "/admin/inventory",
  CUSTOMER_SERVICE: "/admin/leads",
  SALES_CONSULTANT: "/admin/trade/quotations",
  FINANCE: "/admin/trade/overview",
};

export default function AdminIndexRedirect() {
  const role = useAuthStore((state) => state.user?.role);
  const preferred = role ? ADMIN_LANDING[role] : undefined;
  const target =
    preferred && canAccessAdminRoute(role, preferred)
      ? preferred
      : "/admin/dashboard";
  return <Navigate to={target} replace />;
}
