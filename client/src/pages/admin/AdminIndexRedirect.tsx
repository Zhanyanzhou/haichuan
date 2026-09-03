import { Navigate } from "react-router-dom";
import { adminLandingRoute } from "@/config/adminRouteAccess";
import { useAuthStore } from "@/store/authStore";

export default function AdminIndexRedirect() {
  const role = useAuthStore((state) => state.user?.role);
  return <Navigate to={adminLandingRoute(role)} replace />;
}
