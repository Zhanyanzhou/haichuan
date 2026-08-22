/**
 * 前端行为事件采集 Hook
 *
 * 行为分析已开启（2026-08-16，项目负责人决定取消关闭限制）。
 * 可通过 `VITE_ANALYTICS_ENABLED=false` 显式关闭（默认开启）。
 * 采集静默失败：不阻塞页面、不向用户报错、失败不重试。
 */

const ANALYTICS_ENABLED = (import.meta as any).env?.VITE_ANALYTICS_ENABLED !== "false";

// 匿名会话标识：仅用于区分会话，不关联任何个人信息
let sessionId = "";
function ensureSessionId(): string {
  if (sessionId) return sessionId;
  if (typeof window === "undefined") return "";
  try {
    sessionId = localStorage.getItem("_asid") || "";
    if (!sessionId) {
      sessionId =
        "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      localStorage.setItem("_asid", sessionId);
    }
  } catch {
    // localStorage 不可用（隐私模式等）时退化为内存会话 ID
    sessionId = "s_" + Date.now().toString(36);
  }
  return sessionId;
}

const pending = new Map<string, number>();

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
    const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || "/api";
    await fetch(`${baseUrl}/analytics/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...event,
        sessionId: ensureSessionId(),
        deviceType:
          window.innerWidth < 768
            ? "mobile"
            : window.innerWidth < 1024
              ? "tablet"
              : "desktop",
        pagePath: window.location.pathname,
      }),
    });
  } catch {
    // 采集静默失败，不打扰用户
  }
}

function fire(eventName: string, payload?: Record<string, unknown>) {
  if (!ANALYTICS_ENABLED) return;
  if (!shouldSend(eventName)) return;
  void send({ eventName, ...(payload || {}) });
}

export function trackPageView() {
  fire("page_view");
}

export function trackProductView(productId: number) {
  fire("product_view", { productId });
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

export function trackBeginCheckout(itemCount: number, amount: number) {
  fire("begin_checkout", { metadata: { itemCount, amount } });
}

export function trackOrderCreated(orderId: number, amount: number) {
  fire("order_created", { metadata: { orderId, amount } });
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
