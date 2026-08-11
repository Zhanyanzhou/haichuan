import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";

interface CarouselBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
}

/**
 * 轮播图模块 — 对标旺铺"轮播图海报"
 * content: { images: [{url,link,alt}], autoPlay, interval, showDots, showArrows }
 * layoutConfig: { height }
 */
export default function CarouselBlock({
  module,
  editMode,
}: CarouselBlockProps) {
  const { content = {}, layoutConfig = {} } = module;
  const images = content.images || [];
  const autoPlay = content.autoPlay !== false;
  const interval = content.interval || 4000;
  const showDots = content.showDots !== false;
  const showArrows = content.showArrows !== false;
  const height = layoutConfig.height || 500;
  const mobileHeight = layoutConfig.mobileHeight || 640;

  const [current, setCurrent] = useState(0);
  const validImages = (Array.isArray(images) ? images : []).filter(
    (img: any) => img?.url,
  );

  const next = useCallback(() => {
    if (validImages.length <= 1) return;
    setCurrent((c) => (c + 1) % validImages.length);
  }, [validImages.length]);

  const prev = useCallback(() => {
    if (validImages.length <= 1) return;
    setCurrent((c) => (c - 1 + validImages.length) % validImages.length);
  }, [validImages.length]);

  useEffect(() => {
    if (!autoPlay || validImages.length <= 1) return;
    const timer = setInterval(next, interval);
    return () => clearInterval(timer);
  }, [autoPlay, interval, next, validImages.length]);

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
        icon="🖼️"
        hint="轮播图"
        spec="请添加轮播图片 · 建议 1920×600"
        height={height}
      />
    );
  }

  const img = validImages[current];
  const imageContent = (
    <picture data-editor-field="images">
      {img.mobileUrl && <source media="(max-width: 1023px) and (orientation: portrait)" srcSet={img.mobileUrl} />}
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
      style={{
        position: "relative",
        "--homepage-carousel-height": `${height}px`,
        "--homepage-carousel-mobile-height": `${mobileHeight}px`,
        overflow: "hidden",
        background: "#E7DDCE",
      } as CSSProperties}
    >
      <style>{`
        .homepage-carousel { height: var(--homepage-carousel-height); }
        @media (max-width: 1023px) and (orientation: portrait) {
          .homepage-carousel { height: var(--homepage-carousel-mobile-height); }
        }
        .homepage-carousel picture { display: block; width: 100%; height: 100%; }
      `}</style>
      {img.link ? (
        <Link to={img.link}>{imageContent}</Link>
      ) : (
        imageContent
      )}
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
              width: 40,
              height: 40,
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
              width: 40,
              height: 40,
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
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 8,
          }}
        >
          {validImages.map((_: any, i: number) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              type="button"
              aria-label={`切换到第 ${i + 1} 张轮播图`}
              aria-current={i === current ? "true" : undefined}
              style={{
                width: i === current ? 20 : 8,
                height: 8,
                borderRadius: 4,
                border: "none",
                cursor: "pointer",
                background: i === current ? "#B8944E" : "rgba(255,255,255,0.5)",
                transition: "all 0.3s",
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
