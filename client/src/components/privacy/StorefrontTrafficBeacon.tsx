import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { reportStorefrontTraffic } from "@/hooks/storefrontTraffic";

export default function StorefrontTrafficBeacon() {
  const { pathname } = useLocation();
  useEffect(() => {
    reportStorefrontTraffic(pathname);
    const onConsent = () => reportStorefrontTraffic(pathname);
    window.addEventListener("haichuan:analytics-consent-changed", onConsent);
    return () => window.removeEventListener("haichuan:analytics-consent-changed", onConsent);
  }, [pathname]);
  return null;
}
