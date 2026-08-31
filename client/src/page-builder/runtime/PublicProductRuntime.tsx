import { useEffect, useState } from "react";
import { publicProductStreamUrl } from "@/services/api";
import { USE_MOCK } from "@/services/mockData";

type ProductStreamHandle = {
  stream: EventSource | null;
  listeners: Set<() => void>;
  retry: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
};

let productStreamHandle: ProductStreamHandle | null = null;

function subscribeProductStream(onTick: () => void): () => void {
  if (!productStreamHandle) {
    const handle: ProductStreamHandle = {
      stream: null,
      listeners: new Set(),
      retry: 0,
      retryTimer: null,
    };
    const open = () => {
      const stream = new EventSource(publicProductStreamUrl());
      stream.onmessage = () => {
        handle.retry = 0;
        handle.listeners.forEach((callback) => callback());
      };
      stream.onerror = () => {
        stream.close();
        if (handle.retry >= 10) return;
        const delay = Math.min(1000 * 2 ** handle.retry, 30_000);
        handle.retry += 1;
        handle.retryTimer = setTimeout(open, delay);
      };
      handle.stream = stream;
    };
    productStreamHandle = handle;
    open();
  }
  productStreamHandle.listeners.add(onTick);
  return () => {
    if (!productStreamHandle) return;
    productStreamHandle.listeners.delete(onTick);
    if (productStreamHandle.listeners.size === 0) {
      productStreamHandle.stream?.close();
      if (productStreamHandle.retryTimer) clearTimeout(productStreamHandle.retryTimer);
      productStreamHandle = null;
    }
  };
}

/** 多个商品型模板共享同一条可重连的公开商品变更流。 */
export function usePublicProductRevision(active: boolean) {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (USE_MOCK || !active) return;
    return subscribeProductStream(() => setRevision((value) => value + 1));
  }, [active]);

  return revision;
}

export function ProductRowState({
  title,
  subtitle,
  bgColor,
  message,
}: {
  title?: string;
  subtitle?: string;
  bgColor?: string;
  message: string;
}) {
  return (
    <section
      style={{
        padding: "clamp(60px,8vh,120px) 0",
        background: bgColor || "#FFFFFF",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "0 clamp(20px,4vw,60px)",
          textAlign: "center",
        }}
      >
        {(title || subtitle) && (
          <div style={{ marginBottom: 28 }}>
            {title && (
              <h2
                style={{
                  margin: "0 0 12px",
                  color: "#181A1B",
                  fontFamily: '"Cormorant Garamond","Noto Serif SC",serif',
                  fontSize: "clamp(24px,2.8vw,38px)",
                  lineHeight: 1.2,
                }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p
                style={{
                  margin: "0 auto",
                  maxWidth: 480,
                  color: "#5F6568",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
        )}
        <p style={{ color: "#6E7477", fontSize: 13 }}>{message}</p>
      </div>
    </section>
  );
}
