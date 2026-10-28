import {
  hasAnalyticsConsent,
  isAnalyticsConfigured,
  isTrackableAnalyticsPath,
} from "@/hooks/useAnalytics";

const VISIT_DAY_KEY = "hc.storefront-visit-day";
let lastPath = "";
let lastSentAt = 0;

function shanghaiDateStamp(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** 正式页面进入时上报一次浏览。同一浏览器当天只再报一次访客，本地只存日期。 */
export function reportStorefrontTraffic(pathname: string) {
  if (typeof window === "undefined") return;
  // 与行为分析同一双门禁：未开启或访客尚未同意时，不写本地标记，也不发送计数。
  if (!isAnalyticsConfigured() || !hasAnalyticsConsent()) return;
  if (!isTrackableAnalyticsPath(pathname)) return;
  const now = Date.now();
  if (lastPath === pathname && now - lastSentAt < 1000) return;
  lastPath = pathname;
  lastSentAt = now;

  const today = shanghaiDateStamp();
  let visitor = false;
  try {
    if (window.localStorage.getItem(VISIT_DAY_KEY) !== today) {
      window.localStorage.setItem(VISIT_DAY_KEY, today);
      visitor = true;
    }
  } catch {
    visitor = false;
  }

  const baseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
  void fetch(`${baseUrl}/statistics/traffic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify({
      pagePath: pathname.slice(0, 300),
      visitor,
    }),
  }).catch(() => {
    // 计数失败不影响浏览。
  });
}
