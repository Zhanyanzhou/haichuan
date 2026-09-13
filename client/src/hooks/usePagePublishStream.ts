import { useEffect, useRef } from "react";
import { publicPageDocumentStreamUrl } from "@/services/api";
import { USE_MOCK } from "@/services/mockData";
import {
  getBrowserPublicContentLocale,
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
// SSE 重连耗尽后的兜底轮询间隔：直接回源拉取已发布文档（接口已 no-store），
// 保证长连接长期不可用时前台内容至多滞后约一分钟，而不是永远停在旧快照。
const POLLING_FALLBACK_MS = 60000;

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
    if (USE_MOCK) return;
    if (typeof EventSource === "undefined") return;

    let stream: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
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

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    // 兜底轮询：消费方只把回调当"刷新信号"使用，合成事件与真实发布事件等效。
    // 轮询期间每个周期也顺带重试一次 SSE；一旦 SSE 恢复（收到消息）即停止轮询。
    const startPolling = () => {
      if (pollTimer || closed) return;
      pollTimer = setInterval(() => {
        if (closed) return;
        retry = 0;
        open();
        callbackRef.current({ type: "unknown", pageKey });
      }, POLLING_FALLBACK_MS);
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
      if (closed || document.visibilityState === "hidden" || stream) return;
      clearRetryTimer();
      stream = new EventSource(publicPageDocumentStreamUrl(locale));
      stream.onmessage = (event) => {
        retry = 0; // 成功收到消息即视为连接健康，重置退避计数
        stopPolling(); // SSE 已恢复，退出兜底轮询
        handleMessage(event);
      };
      stream.onerror = () => {
        closeStream();
        if (closed) return;
        if (retry >= MAX_RETRIES) {
          // 不再永久放弃：降级为 60 秒轮询兜底，避免前台停在旧快照。
          startPolling();
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
        stopPolling();
        closeStream();
        retry = 0;
        return;
      }

      retry = 0;
      open();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    open();
    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      closeStream();
      stopPolling();
      clearRetryTimer();
    };
  }, [locale, pageKey]);
}
