import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getAnalyticsConsentDecision,
  isAnalyticsConfigured,
  setAnalyticsConsent,
  trackPageView,
  type AnalyticsConsentDecision,
} from "@/hooks/useAnalytics";

const CONSENT_EVENT = "haichuan:analytics-consent-changed";

export default function AnalyticsConsentBanner() {
  const location = useLocation();
  const [decision, setDecision] = useState<AnalyticsConsentDecision | null>(() =>
    getAnalyticsConsentDecision(),
  );
  const [choosing, setChoosing] = useState(() => decision === null);

  useEffect(() => {
    const sync = () => setDecision(getAnalyticsConsentDecision());
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);

  useEffect(() => {
    if (decision !== "granted") return;
    trackPageView();
  }, [decision, location.pathname]);

  if (!isAnalyticsConfigured()) return null;

  const choose = (next: AnalyticsConsentDecision) => {
    setAnalyticsConsent(next);
    setDecision(next);
    setChoosing(false);
  };

  if (!choosing && decision !== null) {
    return (
      <button
        type="button"
        className="fixed bottom-3 left-3 z-[90] rounded-full border border-black/15 bg-white/95 px-3 py-2 text-xs text-neutral-700 shadow-sm backdrop-blur"
        onClick={() => setChoosing(true)}
        aria-label="打开分析数据偏好设置"
      >
        分析偏好
      </button>
    );
  }

  return (
    <section
      className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-w-3xl rounded-2xl border border-black/10 bg-white/95 p-4 text-neutral-800 shadow-xl backdrop-blur sm:p-5"
      aria-label="分析数据偏好"
      role="region"
    >
      <div className="sm:flex sm:items-center sm:gap-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-wide">分析数据偏好</h2>
          <p className="mt-1 text-xs leading-5 text-neutral-600 sm:text-sm">
            经您同意后，我们仅使用匿名会话数据改进页面体验；拒绝或撤回不会影响网站使用。
            数据按环境隔离并受保留期限控制。
          </p>
        </div>
        <div className="mt-4 flex shrink-0 flex-wrap gap-2 sm:mt-0 sm:justify-end">
          <button
            type="button"
            className="rounded-full border border-black/20 px-4 py-2 text-xs font-medium hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={() => choose(decision === "granted" ? "withdrawn" : "denied")}
          >
            {decision === "granted" ? "撤回同意" : "拒绝"}
          </button>
          <button
            type="button"
            className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={() => choose("granted")}
          >
            同意匿名分析
          </button>
        </div>
      </div>
    </section>
  );
}
