/**
 * 前端行为事件采集 Hook
 *
 * 行为分析采用双门禁：构建配置显式开启 + 访客明确同意。
 * 任一条件不满足都不会创建持久会话标识或发送事件。
 * 采集静默失败：不阻塞页面、不向用户报错、失败不重试。
 */

const ANALYTICS_CONFIGURED = import.meta.env.VITE_ANALYTICS_ENABLED === "true";
const ANALYTICS_CONSENT_COOKIE = "hc_analytics_consent";
const ANALYTICS_SESSION_KEY = "hc.analytics-session";
const ANALYTICS_VISITOR_KEY = "hc.analytics-visitor";
const ANALYTICS_SOURCE_KEY = "hc.analytics-source";
const ANALYTICS_CONSENT_VERSION = "analytics-v1";
const ANALYTICS_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const ANALYTICS_VISITOR_MAX_AGE_MS = ANALYTICS_CONSENT_MAX_AGE_SECONDS * 1000;
const ANALYTICS_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export type AnalyticsConsentDecision = "granted" | "denied" | "withdrawn";

export function isAnalyticsConfigured(): boolean {
  return ANALYTICS_CONFIGURED;
}

export function getAnalyticsConsentDecision(): AnalyticsConsentDecision | null {
  if (typeof document === "undefined") return null;
  const prefix = `${ANALYTICS_CONSENT_COOKIE}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!cookie) return null;
  const value = decodeURIComponent(cookie.slice(prefix.length));
  const [version, decision] = value.split(":");
  if (version !== ANALYTICS_CONSENT_VERSION) return null;
  return decision === "granted" || decision === "denied" || decision === "withdrawn"
    ? decision
    : null;
}

export function hasAnalyticsConsent(): boolean {
  return getAnalyticsConsentDecision() === "granted";
}

export function setAnalyticsConsent(decision: AnalyticsConsentDecision) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${encodeURIComponent(
    `${ANALYTICS_CONSENT_VERSION}:${decision}`,
  )}; Path=/; Max-Age=${ANALYTICS_CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  if (decision !== "granted") {
    try {
      sessionStorage.removeItem(ANALYTICS_SESSION_KEY);
      sessionStorage.removeItem(ANALYTICS_SOURCE_KEY);
    } catch {
      // sessionStorage 不可用时仍继续清理其他标识。
    }
    try {
      localStorage.removeItem(ANALYTICS_VISITOR_KEY);
    } catch {
      // localStorage 不可用时仍以内存清空保证当前页面停止复用标识。
    }
    sessionId = "";
    visitorId = "";
  }
  window.dispatchEvent(
    new CustomEvent("haichuan:analytics-consent-changed", {
      detail: { decision },
    }),
  );
}

interface TimedAnalyticsIdentifier {
  id: string;
  createdAt: number;
  lastSeenAt?: number;
}

function createAnalyticsId(prefix: "s" | "v"): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${random}`;
}

function parseTimedIdentifier(value: string | null): TimedAnalyticsIdentifier | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<TimedAnalyticsIdentifier>;
    if (
      typeof parsed.id !== "string"
      || typeof parsed.createdAt !== "number"
      || (parsed.lastSeenAt !== undefined && typeof parsed.lastSeenAt !== "number")
    ) {
      return null;
    }
    return parsed as TimedAnalyticsIdentifier;
  } catch {
    return null;
  }
}

// 匿名访客标识仅在同意后创建，最多沿用 180 天；撤回同意时立即删除。
let visitorId = "";
function ensureVisitorId(): string {
  if (visitorId) return visitorId;
  if (typeof window === "undefined") return "";
  const now = Date.now();
  try {
    const stored = parseTimedIdentifier(localStorage.getItem(ANALYTICS_VISITOR_KEY));
    if (stored && now - stored.createdAt < ANALYTICS_VISITOR_MAX_AGE_MS) {
      visitorId = stored.id;
      return visitorId;
    }
    const next = { id: createAnalyticsId("v"), createdAt: now };
    localStorage.setItem(ANALYTICS_VISITOR_KEY, JSON.stringify(next));
    visitorId = next.id;
  } catch {
    visitorId = createAnalyticsId("v");
  }
  return visitorId;
}

// 30 分钟无活动后开始新会话；标识只用于匿名访问聚合。
let sessionId = "";
function ensureSessionId(): string {
  if (typeof window === "undefined") return "";
  const now = Date.now();
  try {
    const stored = parseTimedIdentifier(sessionStorage.getItem(ANALYTICS_SESSION_KEY));
    if (
      stored
      && typeof stored.lastSeenAt === "number"
      && now - stored.lastSeenAt < ANALYTICS_SESSION_TIMEOUT_MS
    ) {
      sessionId = stored.id;
    } else {
      sessionId = createAnalyticsId("s");
    }
    const createdAt = stored?.id === sessionId ? stored.createdAt : now;
    sessionStorage.setItem(
      ANALYTICS_SESSION_KEY,
      JSON.stringify({ id: sessionId, createdAt, lastSeenAt: now }),
    );
  } catch {
    // sessionStorage 不可用（隐私模式等）时退化为内存会话 ID
    sessionId ||= createAnalyticsId("s");
  }
  return sessionId;
}

function trafficSource(): string {
  try {
    const saved = sessionStorage.getItem(ANALYTICS_SOURCE_KEY);
    if (saved) return saved;
    const campaign = new URLSearchParams(window.location.search)
      .get("utm_source")
      ?.trim()
      .slice(0, 50);
    let source = campaign || "direct";
    if (!campaign && document.referrer) {
      const referrer = new URL(document.referrer);
      if (referrer.origin !== window.location.origin) source = referrer.hostname.slice(0, 50);
    }
    sessionStorage.setItem(ANALYTICS_SOURCE_KEY, source);
    return source;
  } catch {
    return "direct";
  }
}

const pending = new Map<string, number>();
const ANALYTICS_ONCE_PREFIX = "hc.analytics-once:";

/** 同一事件 1 秒节流，避免重复埋点刷屏 */
function shouldSend(key: string, throttleMs = 1000): boolean {
  const now = Date.now();
  const last = pending.get(key);
  if (last && now - last < throttleMs) return false;
  pending.set(key, now);
  return true;
}

async function send(event: Record<string, unknown>) {
  try {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
    await fetch(`${baseUrl}/analytics/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...event,
        consentGranted: true,
        consentVersion: ANALYTICS_CONSENT_VERSION,
        sessionId: ensureSessionId(),
        visitorId: ensureVisitorId(),
        source: trafficSource(),
        deviceType:
          window.innerWidth < 768
            ? "mobile"
            : window.innerWidth < 1024
              ? "tablet"
              : "desktop",
        pagePath: window.location.pathname.slice(0, 300),
      }),
    });
  } catch {
    // 采集静默失败，不打扰用户
  }
}

function fire(
  eventName: string,
  payload?: Record<string, unknown>,
  throttleKey = eventName,
): boolean {
  if (!ANALYTICS_CONFIGURED || !hasAnalyticsConsent()) return false;
  if (!shouldSend(throttleKey)) return false;
  void send({ eventName, ...(payload || {}) });
  return true;
}

function fireOnce(
  eventName: string,
  eventKey: string,
  payload?: Record<string, unknown>,
) {
  if (!ANALYTICS_CONFIGURED || !hasAnalyticsConsent()) return;
  const storageKey = `${ANALYTICS_ONCE_PREFIX}${eventName}:${eventKey}`;
  try {
    if (sessionStorage.getItem(storageKey) === "1") return;
  } catch {
    // 存储不可用时仍允许本次事件；带业务键的节流继续防止瞬时重复。
  }
  if (!fire(eventName, payload, `${eventName}:${eventKey}`)) return;
  try {
    sessionStorage.setItem(storageKey, "1");
  } catch {
    // 请求已经发出；不因去重标记无法持久化而回退业务。
  }
}

export function isTrackableAnalyticsPath(pathname: string): boolean {
  const normalized = pathname.replace(/^\/en(?=\/|$)/, "") || "/";
  return !/^\/(?:admin|preview|customer|cart|checkout|partner)(?:\/|$)/.test(
    normalized,
  );
}

export function trackPageView() {
  const pagePath = typeof window === "undefined" ? "/" : window.location.pathname;
  if (!isTrackableAnalyticsPath(pagePath)) return;
  fire("page_view", undefined, `page_view:${pagePath}`);
}

export function trackViewItem(productId: number) {
  fire("view_item", { productId });
}

export function trackViewItemList(itemCount: number, listId = "catalog") {
  fire("view_item_list", { metadata: { itemCount, listId } });
}

export function trackSearch(term: string) {
  fire("search", { searchTerm: term });
}

export function trackFilter(filterType: string, value: string) {
  fire("filter", { metadata: { filterType, value } });
}

export function trackAddToSelection(productId: number) {
  fire("add_to_selection", { productId });
}

export function trackAddToCart(productId: number, quantity: number) {
  fire("add_to_cart", { productId, metadata: { quantity } });
}

export function trackRemoveFromCart(productId: number, quantity: number) {
  fire("remove_from_cart", { productId, metadata: { quantity } });
}

export function trackViewCart(itemCount: number, amount: number) {
  fire("view_cart", { metadata: { itemCount, amount } });
}

export function trackBeginCheckout(itemCount: number, amount: number) {
  fire("begin_checkout", { metadata: { itemCount, amount } });
}

export function trackOrderCreated(orderId: number, amount: number) {
  fire("order_created", { metadata: { orderId, amount } });
}

export function trackAddPaymentInfo(
  orderId: number,
  amount: number,
  paymentMethod: string,
) {
  fireOnce("add_payment_info", String(orderId), {
    metadata: { orderId, amount, paymentMethod },
  });
}

/** purchase 只允许在服务端已确认 PAID 后触发，不能由订单创建或前端跳转替代。 */
export function trackPurchase(orderId: number, amount: number) {
  fireOnce("purchase", String(orderId), { metadata: { orderId, amount } });
}

/** 客户看见服务端 COMPLETED 退款事实时按会话去重记录。 */
export function trackRefund(refundId: number, orderId: number, amount: number) {
  fireOnce("refund", String(refundId), {
    metadata: { refundId, orderId, amount },
  });
}

export function trackRemoveFromSelection(productId: number) {
  fire("remove_from_selection", { productId });
}

export function trackSubmitSelection(count: number) {
  fire("submit_selection", { metadata: { count } });
}

export function trackSubmitInquiry() {
  fire("submit_inquiry");
}
