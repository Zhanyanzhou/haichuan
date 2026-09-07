import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ImgHTMLAttributes } from "react";

interface SecureImageProps {
  /** 受控媒体端点相对路径；也兼容 http/data/其他 URL。 */
  src?: string | null;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  /** 失败时显示的占位图（可选）。 */
  fallback?: string;
  /** 是否用员工令牌而非客户令牌（后台场景）。 */
  tokenKind?: "auto" | "customer" | "staff";
  /** 进入或接近可视区后才开始请求，适合长列表缩略图。 */
  deferUntilVisible?: boolean;
  /** 唯一首屏 LCP 候选：强制 eager + high，且不受 deferUntilVisible 影响。 */
  priority?: boolean;
  /** 响应式公开图片候选；私有 Blob 媒体不会透传，避免绕过会话请求。 */
  srcSet?: string;
  /** 与 srcSet 配套的布局宽度提示。 */
  sizes?: string;
  /** 固有尺寸可建立稳定宽高比，避免图片完成后造成 CLS。 */
  width?: number;
  height?: number;
  /** 无法提供固有像素尺寸时可显式提供稳定比例，例如 "4 / 5"。 */
  aspectRatio?: CSSProperties["aspectRatio"];
  referrerPolicy?: ImgHTMLAttributes<HTMLImageElement>["referrerPolicy"];
}

type ImageStatus = "idle" | "loading" | "error" | "ready";

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

function isPublicProductMedia(src: string): boolean {
  return src.startsWith("/products/public/") && src.includes("/media/");
}

function isPrivateControlledMedia(src: string): boolean {
  return (
    (src.startsWith("/products/catalog/") && src.includes("/media/")) ||
    /^\/(payments|upload\/payment-proofs)\/\d+(\/proof)?$/.test(src)
  );
}

function resolveDirectSource(src: string): string {
  return isPublicProductMedia(src) ? `${API_BASE}${src}` : src;
}

function normalizeResponsiveSrcSet(value: string | undefined): string | undefined {
  const input = value?.trim();
  if (!input || input.length > 4096 || /[\r\n]/.test(input)) return undefined;

  const candidates = input.split(",").map((candidate) => candidate.trim());
  if (candidates.some((candidate) => !candidate)) return undefined;

  const normalized = candidates.map((candidate) => {
    const match = candidate.match(/^(\S+?)(?:\s+(\d+(?:\.\d+)?[wx]))?$/i);
    if (!match) return null;
    const [, candidateUrl, descriptor] = match;
    if (!candidateUrl || !/^(?:https?:\/\/|\/|\.\/|\.\.\/)/i.test(candidateUrl)) {
      return null;
    }
    const directUrl = resolveDirectSource(candidateUrl);
    return descriptor ? `${directUrl} ${descriptor}` : directUrl;
  });
  return normalized.every((candidate): candidate is string => Boolean(candidate))
    ? normalized.join(", ")
    : undefined;
}

function getStableAspectRatio(
  width: number | undefined,
  height: number | undefined,
  aspectRatio: CSSProperties["aspectRatio"],
): CSSProperties["aspectRatio"] {
  if (aspectRatio) return aspectRatio;
  if (
    typeof width === "number" &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === "number" &&
    Number.isFinite(height) &&
    height > 0
  ) {
    return `${width} / ${height}`;
  }
  return undefined;
}

/**
 * 统一媒体图片：公开资源交给浏览器完成缓存、响应式候选与原生懒加载；
 * 私有资源仍以 HttpOnly Cookie 拉取 Blob，且在替换、卸载或取消时释放对象 URL。
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
  srcSet,
  sizes,
  width,
  height,
  aspectRatio,
  referrerPolicy = "strict-origin-when-cross-origin",
}: SecureImageProps) {
  const normalizedSrc = typeof src === "string" ? src.trim() : "";
  const privateMedia = Boolean(
    normalizedSrc && isPrivateControlledMedia(normalizedSrc),
  );
  const shouldDefer = deferUntilVisible && !priority;
  const [shouldLoad, setShouldLoad] = useState(!shouldDefer);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<ImageStatus>(
    shouldDefer ? "idle" : "loading",
  );
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const placeholderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!shouldDefer) {
      setShouldLoad(true);
      return;
    }

    setShouldLoad(false);
    setStatus("idle");
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
        { rootMargin: "240px 0px" },
      );
      observer.observe(target);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [normalizedSrc, shouldDefer]);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setResolvedSrc(null);

    if (!normalizedSrc) {
      setStatus("error");
      return () => controller.abort();
    }
    if (!shouldLoad) {
      setStatus("idle");
      return () => controller.abort();
    }

    setStatus("loading");
    if (!privateMedia) {
      setResolvedSrc(resolveDirectSource(normalizedSrc));
      return () => controller.abort();
    }

    const sessionDomain = pickSessionDomain(tokenKind);
    void fetch(`${API_BASE}${normalizedSrc}`, {
      credentials: "include",
      headers: { "X-Session-Domain": sessionDomain },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResolvedSrc(objectUrl);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setStatus("error");
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [normalizedSrc, privateMedia, shouldLoad, tokenKind]);

  useEffect(() => {
    setFallbackFailed(false);
  }, [fallback, normalizedSrc]);

  const stableAspectRatio = getStableAspectRatio(width, height, aspectRatio);
  const mediaStyle = {
    aspectRatio: stableAspectRatio,
    userSelect: "none",
    WebkitUserDrag: "none",
    WebkitTouchCallout: "none",
    ...style,
  } as CSSProperties;
  const placeholderStyle: CSSProperties = {
    aspectRatio: stableAspectRatio,
    boxSizing: "border-box",
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
  const loading = priority ? "eager" : "lazy";
  const normalizedSrcSet = normalizeResponsiveSrcSet(srcSet);
  const responsiveProps = privateMedia
    ? {}
    : {
        ...(normalizedSrcSet ? { srcSet: normalizedSrcSet } : {}),
        ...(normalizedSrcSet && sizes?.trim() && !/[\r\n]/.test(sizes)
          ? { sizes: sizes.trim().slice(0, 1024) }
          : {}),
      };

  if (status === "idle" || (status === "loading" && !resolvedSrc)) {
    return (
      <div
        ref={placeholderRef}
        className={className}
        style={placeholderStyle}
        aria-label={alt ? "正在加载图片" : undefined}
        role={alt ? "status" : undefined}
      >
        {status === "loading" ? "正在加载图片…" : null}
      </div>
    );
  }

  if (status === "error" || !resolvedSrc) {
    if (fallback && !fallbackFailed && fallback !== resolvedSrc) {
      return (
        <img
          src={resolveDirectSource(fallback.trim())}
          alt={alt}
          className={className}
          style={mediaStyle}
          width={width}
          height={height}
          loading={loading}
          decoding="async"
          {...(priority ? { fetchpriority: "high" } : {})}
          referrerPolicy={referrerPolicy}
          onLoad={(event) => {
            if (event.currentTarget.naturalWidth === 0) setFallbackFailed(true);
          }}
          onError={() => setFallbackFailed(true)}
        />
      );
    }
    return (
      <div
        className={className}
        style={placeholderStyle}
        role={alt ? "img" : undefined}
        aria-label={alt ? `${alt}（图片暂不可用）` : undefined}
      >
        图片暂不可用
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      style={mediaStyle}
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      {...(priority ? { fetchpriority: "high" } : {})}
      referrerPolicy={referrerPolicy}
      draggable={false}
      {...responsiveProps}
      onLoad={(event) => {
        if (event.currentTarget.naturalWidth === 0) {
          setStatus("error");
          return;
        }
        setStatus("ready");
      }}
      onError={() => setStatus("error")}
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}
