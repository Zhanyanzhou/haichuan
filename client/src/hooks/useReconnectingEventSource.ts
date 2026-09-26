import { useEffect, useRef } from "react";

/**
 * 带自动重连 + 可选 debounce 的 EventSource（P1-35）。
 *
 * 浏览器原生 EventSource 在网络抖动 / 服务端关闭后可能进入 CLOSED 不自愈，
 * 导致前台实时刷新静默失效（用户看到陈旧数据，需整页刷新）。
 * 本 hook 在 onerror 时按指数退避重连（1s → 2s → 4s …，上限 maxDelayMs，最多 maxRetries 次）。
 * 重连耗尽后转为低频 SSE 恢复尝试；无论连接是否健康，可见页都每分钟触发一次
 * 权威回源对账，覆盖多进程/多实例下进程内事件无法跨实例传播的窗口。
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
    if (!url || typeof document === "undefined") return;
    const supportsEventSource = typeof EventSource !== "undefined";

    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let reconciliationTimer: ReturnType<typeof setInterval> | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let retry = 0;
    let closed = false;

    const clearRetryTimer = () => {
      if (!retryTimer) return;
      clearTimeout(retryTimer);
      retryTimer = null;
    };

    const stopFallback = () => {
      if (!fallbackTimer) return;
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    };

    const stopReconciliation = () => {
      if (!reconciliationTimer) return;
      clearInterval(reconciliationTimer);
      reconciliationTimer = null;
    };

    const clearDebounceTimer = () => {
      if (!debounceTimer) return;
      clearTimeout(debounceTimer);
      debounceTimer = null;
    };

    const closeSource = (source: EventSource | null = es) => {
      if (!source) return;
      source.onopen = null;
      source.onmessage = null;
      source.onerror = null;
      source.close();
      if (es === source) es = null;
    };

    const fire = () => {
      if (debounceMs > 0) {
        clearDebounceTimer();
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          callbackRef.current();
        }, debounceMs);
      } else {
        callbackRef.current();
      }
    };

    const open = () => {
      if (!supportsEventSource || closed || document.visibilityState === "hidden" || es) return;
      clearRetryTimer();
      const source = new EventSource(url);
      es = source;
      source.onopen = () => {
        if (closed || es !== source) return;
        retry = 0;
        stopFallback();
      };
      source.onmessage = () => {
        if (closed || es !== source) return;
        retry = 0; // 连接恢复（包括 ready 消息）后重置退避计数
        stopFallback();
        fire();
      };
      source.onerror = () => {
        if (closed || es !== source) return;
        closeSource(source);
        if (retry >= maxRetries) {
          startFallback();
          return;
        }
        const delay = Math.min(1000 * 2 ** retry, maxDelayMs);
        retry += 1;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          open();
        }, delay);
      };
    };

    // 重连耗尽后只负责低频恢复 SSE；权威数据对账由独立计时器负责，
    // 因此连接恢复或收到本实例消息都不会取消跨实例对账。
    const startFallback = () => {
      if (closed || fallbackTimer || document.visibilityState === "hidden") return;
      fallbackTimer = setInterval(() => {
        if (closed || document.visibilityState === "hidden") return;
        retry = 0;
        open();
      }, 60000);
    };

    const startReconciliation = () => {
      if (closed || reconciliationTimer || document.visibilityState === "hidden") return;
      reconciliationTimer = setInterval(() => {
        if (closed || document.visibilityState === "hidden") return;
        fire();
      }, 60000);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearRetryTimer();
        stopFallback();
        stopReconciliation();
        clearDebounceTimer();
        closeSource();
        retry = 0;
        return;
      }

      retry = 0;
      fire(); // 回到前台时立即补拉，覆盖隐藏期间错过的变更。
      startReconciliation();
      open();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    startReconciliation();
    open();
    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearRetryTimer();
      stopFallback();
      stopReconciliation();
      clearDebounceTimer();
      closeSource();
    };
  }, [url, maxRetries, maxDelayMs, debounceMs]);
}
