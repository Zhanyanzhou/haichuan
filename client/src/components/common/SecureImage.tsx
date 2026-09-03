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
  /** 进入或接近可视区后才请求受控媒体，适合长列表缩略图 */
  deferUntilVisible?: boolean;
  /** 首屏主图（LCP 候选）：eager + fetchpriority=high，跳过懒加载延迟 */
  priority?: boolean;
}

// Vite 会在构建和测试时注入类型化 env；未配置时安全降级到同源 /api。
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(
  /\/$/,
  "",
);

function pickSessionDomain(kind: SecureImageProps["tokenKind"]): "admin" | "customer" {
  if (kind === "staff") return "admin";
  if (kind === "customer") return "customer";
  return typeof window !== "undefined" && window.location.pathname.startsWith("/admin")
    ? "admin"
    : "customer";
}

/**
 * 受控媒体图片：用 HttpOnly Cookie 会话拉取 Blob 显示，覆盖商品媒体和付款凭证。
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
  deferUntilVisible = false,
  priority = false,
}: SecureImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const revokeRef = useRef<string | null>(null);
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(!deferUntilVisible);

  useEffect(() => {
    if (!deferUntilVisible) {
      setShouldLoad(true);
      return;
    }

    setShouldLoad(false);
    setStatus("loading");
    let observer: IntersectionObserver | null = null;
    const frame = window.requestAnimationFrame(() => {
      const target = placeholderRef.current;
      if (!target || typeof IntersectionObserver === "undefined") {
        setShouldLoad(true);
        return;
      }
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          setShouldLoad(true);
          observer?.disconnect();
        },
        { rootMargin: "200px 0px" },
      );
      observer.observe(target);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [deferUntilVisible, src]);

  useEffect(() => {
    let cancelled = false;
    setFallbackFailed(false);

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
    if (isControlledMedia && !shouldLoad) return;
    if (!isControlledMedia) {
      setBlobUrl(src || null);
      setStatus(src ? "ready" : "error");
      return;
    }

    setStatus("loading");
    // 公开商品媒体不发送身份域标记；受控媒体显式选择员工或客户 Cookie，
    // 避免同一浏览器同时登录两种身份时发生歧义。
    const sessionDomain = pickSessionDomain(tokenKind);
    const fullUrl = `${API_BASE}${src}`;
    fetch(fullUrl, {
      credentials: "include",
      headers: isPublicProductMedia ? {} : { "X-Session-Domain": sessionDomain },
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
  }, [fallback, shouldLoad, src, tokenKind]);

  const placeholderStyle: CSSProperties = {
    background: "#F4F5F5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6E7477",
    fontSize: 12,
    textAlign: "center",
    padding: 8,
    ...style,
  };

  if (status === "loading") {
    return (
      <div ref={placeholderRef} className={className} style={{ ...placeholderStyle }}>
        正在加载图片…
      </div>
    );
  }

  if (status === "error" || !blobUrl) {
    if (fallback && !fallbackFailed && fallback !== blobUrl) {
      return (
        <img
          src={fallback}
          alt={alt}
          className={className}
          style={style}
          onLoad={(event) => {
            if (event.currentTarget.naturalWidth === 0) setFallbackFailed(true);
          }}
          onError={() => setFallbackFailed(true)}
        />
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
      loading={priority ? "eager" : "lazy"}
      {...(priority ? { fetchpriority: "high" } : {})}
      draggable={false}
      onLoad={(event) => {
        if (event.currentTarget.naturalWidth === 0) setStatus("error");
      }}
      onError={() => setStatus("error")}
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}
