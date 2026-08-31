import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link } from "react-router-dom";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { resolveItemLinkUrl } from "@/page-builder/utils/linkTarget";
import {
  getCarouselAspectRatio,
  RESPONSIVE_CANVAS,
} from "@/page-builder/config/blockContracts";

interface CarouselBlockProps {
  module: {
    content: {
      images?: CarouselItem[];
      autoPlay?: boolean;
      interval?: number;
      showDots?: boolean;
      showArrows?: boolean;
    };
    layoutConfig?: { desktopRatio?: string; mobileRatio?: string };
  };
  editMode?: boolean;
}

interface CarouselItem {
  url?: string;
  mobileUrl?: string;
  alt?: string;
  link?: unknown;
  targetType?: string;
  productCode?: string;
  productId?: string | number;
  linkUrl?: string;
}

/**
 * 轮播图模块 — 对标旺铺"轮播图海报"
 * content: { images: [{url,link,alt}], autoPlay, interval, showDots, showArrows }
 * layoutConfig: { desktopRatio, mobileRatio }
 */
export default function CarouselBlock({
  module,
  editMode,
}: CarouselBlockProps) {
  const { content = {}, layoutConfig = {} } = module;
  const images = content.images || [];
  const autoPlay = content.autoPlay !== false;
  const interval = Number(content.interval) || 4000;
  const showDots = content.showDots !== false;
  const showArrows = content.showArrows !== false;
  const desktopRatio = getCarouselAspectRatio(
    "desktop",
    layoutConfig.desktopRatio,
  );
  const mobileRatio = getCarouselAspectRatio(
    "mobile",
    layoutConfig.mobileRatio,
  );

  const [current, setCurrent] = useState(0);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const swipeStartXRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const validImages = (Array.isArray(images) ? images : []).filter(
    (img) => Boolean(img.url),
  );

  const next = useCallback(() => {
    if (validImages.length <= 1) return;
    setCurrent((c) => (c + 1) % validImages.length);
  }, [validImages.length]);

  const prev = useCallback(() => {
    if (validImages.length <= 1) return;
    setCurrent((c) => (c - 1 + validImages.length) % validImages.length);
  }, [validImages.length]);

  const paused = manuallyPaused || hoverPaused || focusPaused;

  useEffect(() => {
    // 编辑预览中不自动轮播：避免周期性切换大图拖慢画布滚动，也避免干扰编辑定位。
    if (editMode || !autoPlay || paused || validImages.length <= 1) return;
    const timer = setInterval(next, interval);
    return () => clearInterval(timer);
  }, [editMode, autoPlay, interval, next, paused, validImages.length]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      prev();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      next();
    } else if (event.key === "Home") {
      event.preventDefault();
      setCurrent(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setCurrent(Math.max(0, validImages.length - 1));
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as Element).closest("button")) return;
    swipeStartXRef.current = event.clientX;
    suppressClickRef.current = false;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // 合成测试事件或旧浏览器可能不提供真实 pointer capture，手势仍可在组件内完成。
    }
  };

  const finishPointerGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const startX = swipeStartXRef.current;
    swipeStartXRef.current = null;
    if (startX === null) return;
    const distance = event.clientX - startX;
    if (Math.abs(distance) >= 40) {
      suppressClickRef.current = true;
      distance < 0 ? next() : prev();
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  // 删除当前轮播项后及时收敛索引，避免访问已不存在的图片导致画布崩溃。
  useEffect(() => {
    setCurrent((value) => {
      if (validImages.length === 0) return 0;
      return Math.min(value, validImages.length - 1);
    });
  }, [validImages.length]);

  if (validImages.length === 0) {
    if (!editMode) return null;
    return (
      <BlockEmptyPlaceholder
        assetSlot={{ templateKey: "carousel", roleId: "frames" }}
        icon="🖼️"
        hint="轮播图"
        spec={`请添加轮播图片 · 电脑端 ${IMAGE_SPECS.carousel.image.label}`}
        ratio={desktopRatio}
      />
    );
  }

  const img = validImages[current];
  const imageContent = (
    <picture data-editor-field="images">
      {img.mobileUrl && (
        <source
          media={RESPONSIVE_CANVAS.mobileMediaQuery}
          srcSet={img.mobileUrl}
        />
      )}
      <img
        src={img.url}
        alt={img.alt || ""}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
    </picture>
  );

  return (
    <section
      className="homepage-carousel"
      data-content-role="frames"
      role="region"
      aria-roledescription="轮播图"
      aria-label="图片轮播"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocusCapture={() => setFocusPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusPaused(false);
      }}
      onPointerDown={onPointerDown}
      onPointerUp={finishPointerGesture}
      onPointerCancel={() => { swipeStartXRef.current = null; }}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        suppressClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      style={
        {
          position: "relative",
          "--homepage-carousel-ratio": desktopRatio,
          "--homepage-carousel-mobile-ratio": mobileRatio,
          overflow: "hidden",
          background: "#DDE1E2",
          touchAction: "pan-y",
        } as CSSProperties
      }
    >
      <style>{`
        .homepage-carousel { aspect-ratio: var(--homepage-carousel-ratio); }
        @media ${RESPONSIVE_CANVAS.mobileMediaQuery} {
          .homepage-carousel { aspect-ratio: var(--homepage-carousel-mobile-ratio); }
        }
        .homepage-carousel picture { display: block; width: 100%; height: 100%; }
        .homepage-carousel:focus-visible { outline: 3px solid #181A1B; outline-offset: 3px; }
      `}</style>
      <span
        aria-live="polite"
        aria-atomic="true"
        style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}
      >
        第 {current + 1} 张，共 {validImages.length} 张
      </span>
      {(() => {
        const itemUrl = resolveItemLinkUrl(img);
        return itemUrl ? <Link to={itemUrl}>{imageContent}</Link> : imageContent;
      })()}
      {showArrows && validImages.length > 1 && (
        <>
          <button
            type="button"
            aria-label="上一张轮播图"
            onClick={prev}
            style={{
              position: "absolute",
              left: 16,
              top: "50%",
              transform: "translateY(-50%)",
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: "none",
              background: "rgba(0,0,0,0.3)",
              color: "#fff",
              fontSize: 18,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="下一张轮播图"
            onClick={next}
            style={{
              position: "absolute",
              right: 16,
              top: "50%",
              transform: "translateY(-50%)",
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: "none",
              background: "rgba(0,0,0,0.3)",
              color: "#fff",
              fontSize: 18,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ›
          </button>
        </>
      )}
      {showDots && validImages.length > 1 && (
        <nav
          data-content-role="pagination"
          aria-label="轮播图片"
          style={{
            position: "absolute",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 8,
          }}
        >
          {validImages.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              type="button"
              aria-label={`切换到第 ${i + 1} 张轮播图`}
              aria-current={i === current ? "true" : undefined}
              style={{
                width: 32,
                height: 32,
                border: "none",
                cursor: "pointer",
                background: "transparent",
                display: "grid",
                placeItems: "center",
                padding: 0,
              }}
            >
              <span aria-hidden style={{ width: i === current ? 20 : 8, height: 8, borderRadius: 4, background: i === current ? "#181A1B" : "rgba(255,255,255,0.7)", transition: "all 0.3s" }} />
            </button>
          ))}
        </nav>
      )}
      {autoPlay && validImages.length > 1 ? (
        <button
          type="button"
          aria-label={manuallyPaused ? "继续自动轮播" : "暂停自动轮播"}
          aria-pressed={manuallyPaused}
          onClick={() => setManuallyPaused((value) => !value)}
          style={{
            position: "absolute",
            right: 16,
            bottom: 14,
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "none",
            background: "rgba(0,0,0,0.38)",
            color: "#fff",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            fontSize: 13,
          }}
        >
          <span aria-hidden>{manuallyPaused ? "▶" : "Ⅱ"}</span>
        </button>
      ) : null}
    </section>
  );
}
