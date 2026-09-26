import { useEffect, useRef } from "react";
import { publicPageDocumentStreamUrl } from "@/services/api";
import { USE_MOCK } from "@/services/mockData";
import {
  getBrowserPublicContentLocale,
  isPublicContentLocaleAvailable,
  type PublicContentLocale,
} from "@/i18n/publicLocale";

export type PagePublishEvent = {
  type:
    | "page-document-published"
    | "ready"
    | "heartbeat"
    | "unknown";
  pageKey?: string;
  version?: number;
  changedAt?: string;
  locale?: PublicContentLocale;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePublishEvent(value: unknown): PagePublishEvent {
  if (!isRecord(value)) return { type: "unknown" };
  const source = isRecord(value.data) ? value.data : value;
  const knownTypes: PagePublishEvent["type"][] = [
    "page-document-published",
    "ready",
    "heartbeat",
    "unknown",
  ];
  const type = typeof source.type === "string"
    && knownTypes.includes(source.type as PagePublishEvent["type"])
    ? source.type as PagePublishEvent["type"]
    : "unknown";
  return {
    type,
    pageKey: typeof source.pageKey === "string" ? source.pageKey : undefined,
    version: typeof source.version === "number" ? source.version : undefined,
    changedAt: typeof source.changedAt === "string" ? source.changedAt : undefined,
    locale: source.locale === "zh-CN" || source.locale === "en" ? source.locale : undefined,
  };
}

// 与 useReconnectingEventSource 保持一致的重连参数：
// 浏览器原生 EventSource 在网络抖动/服务重启后可能进入 CLOSED 不自愈，
// 导致后台发布后前台收不到通知、装修内容陈旧（需整页刷新）。
const MAX_RETRIES = 10;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;
// SSE 只负责快速通知；即使长连接看似健康，也可能因多进程/多实例错过其它进程的发布事件。
// 可见页因此独立定期回源对账（公开读取接口已 no-store），将最坏陈旧时间限制在约一分钟。
const RECONCILIATION_INTERVAL_MS = 60000;

export function usePagePublishStream(
  pageKey: string | undefined,
  onPublished: (event: PagePublishEvent) => void,
  locale: PublicContentLocale = getBrowserPublicContentLocale(),
) {
  const callbackRef = useRef(onPublished);

  useEffect(() => {
    callbackRef.current = onPublished;
  }, [onPublished]);

  useEffect(() => {
    if (!pageKey) return;
    if (!isPublicContentLocaleAvailable(locale)) return;
    if (USE_MOCK) return;
    const supportsEventSource = typeof EventSource !== "undefined";

    let stream: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let recoveryTimer: ReturnType<typeof setInterval> | null = null;
    let reconciliationTimer: ReturnType<typeof setInterval> | null = null;
    let retry = 0;
    let closed = false;

    const clearRetryTimer = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const closeStream = () => {
      if (!stream) return;
      stream.onmessage = null;
      stream.onerror = null;
      stream.close();
      stream = null;
    };

    const stopRecovery = () => {
      if (recoveryTimer) {
        clearInterval(recoveryTimer);
        recoveryTimer = null;
      }
    };

    const stopReconciliation = () => {
      if (reconciliationTimer) {
        clearInterval(reconciliationTimer);
        reconciliationTimer = null;
      }
    };

    // 重连耗尽后仍低频尝试恢复 SSE；内容对账由独立计时器负责，连接恢复不会取消它。
    const startRecovery = () => {
      if (recoveryTimer || closed) return;
      recoveryTimer = setInterval(() => {
        if (closed) return;
        retry = 0;
        open();
      }, RECONCILIATION_INTERVAL_MS);
    };

    // 消费方把合成事件当作刷新信号；实际 GET 继续复用消费方已有的 in-flight/stale 边界。
    const startReconciliation = () => {
      if (reconciliationTimer || closed || document.visibilityState === "hidden") return;
      reconciliationTimer = setInterval(() => {
        if (closed || document.visibilityState === "hidden") return;
        callbackRef.current({ type: "unknown", pageKey });
      }, RECONCILIATION_INTERVAL_MS);
    };

    const handleMessage = (event: MessageEvent<string>) => {
      let payload: PagePublishEvent;

      try {
        const parsed: unknown = JSON.parse(event.data);
        // 服务端全局 TransformInterceptor 曾把 SSE 事件包成 { code, data, message, timestamp }，
        // 导致 SseStream 输出的 data 又嵌套一层；此处兼容双层 { data: {...} } 与单层 {...} 两种格式，
        // 保证 type/pageKey 过滤正确生效（否则心跳/其它页面发布都会误触发刷新）。
        payload = normalizePublishEvent(parsed);
      } catch {
        payload = { type: "unknown" };
      }

      if (payload.type === "heartbeat") return;
      if (payload.pageKey && payload.pageKey !== pageKey) return;
      if (payload.locale && payload.locale !== locale) return;

      // ready 表示订阅已建立。此时补拉快照，覆盖断线期间错过的发布，
      // 也封闭首次读取页面与建立订阅之间的空窗；心跳不触发重复读取。
      callbackRef.current(payload);
    };

    const open = () => {
      if (!supportsEventSource || closed || document.visibilityState === "hidden" || stream) return;
      clearRetryTimer();
      stream = new EventSource(publicPageDocumentStreamUrl(locale));
      stream.onmessage = (event) => {
        retry = 0; // 成功收到消息即视为连接健康，重置退避计数
        stopRecovery(); // SSE 已恢复，退出低频恢复尝试；独立内容对账继续运行
        handleMessage(event);
      };
      stream.onerror = () => {
        closeStream();
        if (closed) return;
        if (retry >= MAX_RETRIES) {
          // 不再永久放弃：低频尝试恢复长连接，内容对账不依赖此恢复结果。
          startRecovery();
          return;
        }
        const delay = Math.min(
          BASE_RETRY_DELAY_MS * 2 ** retry,
          MAX_RETRY_DELAY_MS,
        );
        retry += 1;
        retryTimer = setTimeout(open, delay);
      };
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearRetryTimer();
        stopRecovery();
        stopReconciliation();
        closeStream();
        retry = 0;
        return;
      }

      retry = 0;
      startReconciliation();
      open();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    startReconciliation();
    open();
    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      closeStream();
      stopRecovery();
      stopReconciliation();
      clearRetryTimer();
    };
  }, [locale, pageKey]);
}
