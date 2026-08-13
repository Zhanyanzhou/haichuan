import { useEffect, useRef, useState } from "react";
import { REQUEST_ERROR_EVENT } from "@/services/requestErrorEvents";

type RequestErrorDetail = {
  message?: string;
};

/**
 * 集中显示接口层派发的可理解错误，不依赖 Ant Design 的静态消息 API。
 * 页面自身已处理的错误仍可保留各自的就地提示。
 */
export function RequestErrorNotice() {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<RequestErrorDetail>).detail;
      if (!detail?.message) return;

      setMessage(detail.message);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        setMessage(null);
        timeoutRef.current = null;
      }, 5000);
    };

    window.addEventListener(REQUEST_ERROR_EVENT, show);
    return () => {
      window.removeEventListener(REQUEST_ERROR_EVENT, show);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed right-4 top-4 z-[1000] max-w-sm rounded border border-red-200 bg-white px-4 py-3 text-sm text-red-700 shadow-lg"
    >
      {message}
    </div>
  );
}
