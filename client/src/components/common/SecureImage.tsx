import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

interface SecureImageProps {
  /** 受控媒体端点相对路径；也兼容 http/data/其他 URL */
  src?: string | null;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  /** 失败时显示的占位图（可选） */
  fallback?: string;
  /** 是否用员工令牌而非客户令牌（后台场景） */
  tokenKind?: "auto" | "customer" | "staff";
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(
  /\/$/,
  "",
);

function pickToken(kind: SecureImageProps["tokenKind"]): string | null {
  if (kind === "staff") return localStorage.getItem("token");
  if (kind === "customer") return localStorage.getItem("customerToken");
  // auto：客户页优先客户令牌，后台页回退员工令牌
  return localStorage.getItem("customerToken") || localStorage.getItem("token");
}

/**
 * 受控媒体图片：用 Bearer 令牌拉取 Blob 显示，覆盖商品媒体和付款凭证。
 * - 组件卸载或 src 替换时 URL.revokeObjectURL，避免内存泄漏；
 * - loading 显示骨架占位，失败显示"图片暂不可用"，不白屏；
 * - 不把媒体二进制或真实存储路径写进持久化状态。
 */
export function SecureImage({
  src,
  alt = "",
  className,
  style,
  fallback,
  tokenKind = "auto",
}: SecureImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const revokeRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // 非受控媒体端点（http/data/相对静态资源）：直接用 src
    const isPublicProductMedia =
      typeof src === "string" &&
      src.startsWith("/products/public/") &&
      src.includes("/media/");
    const isControlledMedia =
      typeof src === "string" &&
      (isPublicProductMedia ||
        (src.startsWith("/products/catalog/") && src.includes("/media/")) ||
        /^\/(payments|upload\/payment-proofs)\/\d+(\/proof)?$/.test(src));
    if (!isControlledMedia) {
      setBlobUrl(src || null);
      setStatus(src ? "ready" : "error");
      return;
    }

    setStatus("loading");
    // 公开商品媒体不发送任何令牌，避免把客户身份无意义地带到可缓存资源请求。
    const token = isPublicProductMedia ? null : pickToken(tokenKind);
    const fullUrl = `${API_BASE}${src}`;
    fetch(fullUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revokeRef.current = url;
        setBlobUrl(url);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });

    return () => {
      cancelled = true;
      if (revokeRef.current) {
        URL.revokeObjectURL(revokeRef.current);
        revokeRef.current = null;
      }
    };
  }, [src, tokenKind]);

  const placeholderStyle: CSSProperties = {
    background: "#f3f4f6",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#9ca3af",
    fontSize: 12,
    textAlign: "center",
    padding: 8,
    ...style,
  };

  if (status === "loading") {
    return (
      <div className={className} style={{ ...placeholderStyle }}>
        加载中…
      </div>
    );
  }

  if (status === "error" || !blobUrl) {
    if (fallback) {
      return (
        <img src={fallback} alt={alt} className={className} style={style} />
      );
    }
    return (
      <div className={className} style={{ ...placeholderStyle }}>
        图片暂不可用
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt}
      className={className}
      style={
        {
          userSelect: "none",
          WebkitUserDrag: "none",
          WebkitTouchCallout: "none",
          ...style,
        } as CSSProperties
      }
      loading="lazy"
      draggable={false}
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}
