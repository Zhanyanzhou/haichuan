import { useEffect, useRef } from "react";
import { publicPageDocumentStreamUrl } from "@/services/api";
import { USE_MOCK } from "@/services/mockData";

export type PagePublishEvent = {
  type:
    | "page-document-published"
    | "ready"
    | "heartbeat"
    | "unknown";
  pageKey?: string;
  version?: number;
  changedAt?: string;
};

// 与 useReconnectingEventSource 保持一致的重连参数：
// 浏览器原生 EventSource 在网络抖动/服务重启后可能进入 CLOSED 不自愈，
// 导致后台发布后前台收不到通知、装修内容陈旧（需整页刷新）。
const MAX_RETRIES = 10;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;

export function usePagePublishStream(
  pageKey: string | undefined,
  onPublished: (event: PagePublishEvent) => void,
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
    let retry = 0;
    let closed = false;

    const handleMessage = (event: MessageEvent) => {
      let payload: PagePublishEvent;

      try {
        const parsed = JSON.parse(event.data) as any;
        // 服务端全局 TransformInterceptor 曾把 SSE 事件包成 { code, data, message, timestamp }，
        // 导致 SseStream 输出的 data 又嵌套一层；此处兼容双层 { data: {...} } 与单层 {...} 两种格式，
        // 保证 type/pageKey 过滤正确生效（否则心跳/其它页面发布都会误触发刷新）。
        const inner =
          parsed &&
          typeof parsed === "object" &&
          parsed.data &&
          typeof parsed.data === "object"
            ? parsed.data
            : parsed;
        payload = inner as PagePublishEvent;
      } catch {
        payload = { type: "unknown" };
      }

      if (payload.type === "ready" || payload.type === "heartbeat") return;
      if (payload.pageKey && payload.pageKey !== pageKey) return;

      callbackRef.current(payload);
    };

    const open = () => {
      if (closed) return;
      stream = new EventSource(publicPageDocumentStreamUrl);
      stream.onmessage = (event) => {
        retry = 0; // 成功收到消息即视为连接健康，重置退避计数
        handleMessage(event);
      };
      stream.onerror = () => {
        stream?.close();
        stream = null;
        if (closed) return;
        if (retry >= MAX_RETRIES) return; // 达上限停止，避免无限重试
        const delay = Math.min(
          BASE_RETRY_DELAY_MS * 2 ** retry,
          MAX_RETRY_DELAY_MS,
        );
        retry += 1;
        retryTimer = setTimeout(open, delay);
      };
    };

    open();
    return () => {
      closed = true;
      stream?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [pageKey]);
}
