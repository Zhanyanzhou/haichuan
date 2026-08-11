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

    const stream = new EventSource(publicPageDocumentStreamUrl);
    stream.onmessage = (event) => {
      let payload: PagePublishEvent;

      try {
        payload = JSON.parse(event.data) as PagePublishEvent;
      } catch {
        payload = { type: "unknown" };
      }

      if (payload.type === "ready" || payload.type === "heartbeat") return;
      if (payload.pageKey && payload.pageKey !== pageKey) return;

      callbackRef.current(payload);
    };

    return () => stream.close();
  }, [pageKey]);
}
