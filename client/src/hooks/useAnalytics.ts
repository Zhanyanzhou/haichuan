/**
 * 前端行为事件采集 Hook
 * — 采集失败不影响业务
 * — 匿名会话支持
 * — 自动去重（1s 内相同事件不重复发送）
 */

let sessionId = localStorage.getItem("_asid");
if (!sessionId) {
  sessionId =
    "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  localStorage.setItem("_asid", sessionId);
}

const pending = new Map<string, number>();

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
        sessionId,
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
    /* 采集静默失败 */
  }
}

export function trackPageView() {
  if (!shouldSend("pv", 5000)) return;
  send({ eventName: "page_view" });
}

export function trackProductView(productId: number) {
  const key = `pv_${productId}`;
  if (!shouldSend(key, 30000)) return;
  send({ eventName: "product_view", productId });
}

export function trackSearch(term: string) {
  if (!term || !shouldSend("search", 3000)) return;
  send({ eventName: "search", searchTerm: term });
}

export function trackFilter(filterType: string, value: string) {
  if (!shouldSend(`filter_${filterType}`, 3000)) return;
  send({ eventName: "filter", metadata: { filterType, value } });
}

export function trackAddToSelection(productId: number) {
  send({ eventName: "add_to_selection", productId });
}

export function trackAddToCart(productId: number, quantity: number) {
  send({ eventName: "add_to_cart", productId, metadata: { quantity } });
}

export function trackBeginCheckout(itemCount: number, amount: number) {
  send({ eventName: "begin_checkout", metadata: { itemCount, amount } });
}

export function trackOrderCreated(orderId: number, amount: number) {
  send({ eventName: "order_created", metadata: { orderId, amount } });
}

export function trackRemoveFromSelection(productId: number) {
  send({ eventName: "remove_from_selection", productId });
}

export function trackSubmitSelection(count: number) {
  send({ eventName: "submit_selection", metadata: { itemCount: count } });
}

export function trackSubmitInquiry() {
  send({ eventName: "submit_inquiry" });
}

export function trackCtaClick(label: string) {
  send({ eventName: "cta_click", metadata: { label } });
}
