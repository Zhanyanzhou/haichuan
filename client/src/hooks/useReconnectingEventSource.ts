import { useEffect, useRef } from "react";

/**
 * 带自动重连 + 可选 debounce 的 EventSource（P1-35）。
 *
 * 浏览器原生 EventSource 在网络抖动 / 服务端关闭后可能进入 CLOSED 不自愈，
 * 导致前台实时刷新静默失效（用户看到陈旧数据，需整页刷新）。
 * 本 hook 在 onerror 时按指数退避重连（1s → 2s → 4s …，上限 maxDelayMs，最多 maxRetries 次）。
 *
 * debounceMs > 0 时，连续收到多条消息只触发一次回调（trailing）——防止后端批量变更
 * 产生"消息风暴 → 全量重拉风暴"（如管理后台一次上下架 N 件商品触发 N 次 2000 条重拉）。
 *
 * 用法：useReconnectingEventSource(url, () => setRevision(v => v + 1), { debounceMs: 500 })
 *   url 传 null 时不建立连接（如 Mock 模式）。
 */
export function useReconnectingEventSource(
  url: string | null,
  onMessage: () => void,
  options?: { maxRetries?: number; maxDelayMs?: number; debounceMs?: number },
) {
  const callbackRef = useRef(onMessage);
  callbackRef.current = onMessage;

  const maxRetries = options?.maxRetries ?? 10;
  const maxDelayMs = options?.maxDelayMs ?? 30000;
  const debounceMs = options?.debounceMs ?? 0;

  useEffect(() => {
    if (!url) return;

    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let retry = 0;

    const fire = () => {
      if (debounceMs > 0) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          callbackRef.current();
        }, debounceMs);
      } else {
        callbackRef.current();
      }
    };

    const open = () => {
      es = new EventSource(url);
      es.onmessage = () => {
        retry = 0; // 连续成功收到消息后重置退避计数
        fire();
      };
      es.onerror = () => {
        es?.close();
        if (retry >= maxRetries) return; // 达上限则停止重连（避免无限重试）
        const delay = Math.min(1000 * 2 ** retry, maxDelayMs);
        retry += 1;
        retryTimer = setTimeout(open, delay);
      };
    };

    open();
    return () => {
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [url, maxRetries, maxDelayMs, debounceMs]);
}
