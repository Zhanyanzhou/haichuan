/**
 * 前端行为事件采集 Hook
 *
 * 当前阶段：行为分析默认关闭（见 docs/PUBLIC_ACCESS_MATRIX.md §隐私与分析）。
 * - 不创建 `_asid` 匿名会话 ID；
 * - 不发送 `/analytics/track` 请求；
 * - 保留所有导出函数签名为安全 no-op，调用方无需改动。
 *
 * 在完成独立的隐私偏好与用户授权机制之前，不得恢复真实采集。
 * 恢复方式：将 ANALYTICS_ENABLED 改为 true 并重新接入 send() 实现。
 *
 * 历史实现保留在下方注释参考，已彻底停用。
 */

// 行为分析开关：当前阶段强制关闭。
const ANALYTICS_ENABLED = false;

// 关闭状态下不读写 localStorage，避免创建 `_asid` 等追踪标识。
// 关闭状态下不发送任何网络请求。

/* 关闭前的原始实现（仅供恢复时参考，当前不执行）
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
    // 采集静默失败
  }
}
*/

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function noop(..._args: unknown[]) {
  /* 分析关闭：安全 no-op */
}

export function trackPageView() {
  if (!ANALYTICS_ENABLED) return noop();
}

export function trackProductView(productId: number) {
  if (!ANALYTICS_ENABLED) return noop(productId);
}

export function trackSearch(term: string) {
  if (!ANALYTICS_ENABLED) return noop(term);
}

export function trackFilter(filterType: string, value: string) {
  if (!ANALYTICS_ENABLED) return noop(filterType, value);
}

export function trackAddToSelection(productId: number) {
  if (!ANALYTICS_ENABLED) return noop(productId);
}

export function trackAddToCart(productId: number, quantity: number) {
  if (!ANALYTICS_ENABLED) return noop(productId, quantity);
}

export function trackBeginCheckout(itemCount: number, amount: number) {
  if (!ANALYTICS_ENABLED) return noop(itemCount, amount);
}

export function trackOrderCreated(orderId: number, amount: number) {
  if (!ANALYTICS_ENABLED) return noop(orderId, amount);
}

export function trackRemoveFromSelection(productId: number) {
  if (!ANALYTICS_ENABLED) return noop(productId);
}

export function trackSubmitSelection(count: number) {
  if (!ANALYTICS_ENABLED) return noop(count);
}

export function trackSubmitInquiry() {
  if (!ANALYTICS_ENABLED) return noop();
}

export function trackCtaClick(label: string) {
  if (!ANALYTICS_ENABLED) return noop(label);
}
