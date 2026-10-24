import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { reportStorefrontTraffic } from "@/hooks/storefrontTraffic";

export default function StorefrontTrafficBeacon() {
  const { pathname } = useLocation();
  useEffect(() => {
    reportStorefrontTraffic(pathname);
  }, [pathname]);
  return null;
}
