import React, { useState, useEffect, useCallback } from "react";

export interface CarouselBlockProps {
  images: { url: string; link?: string; alt?: string }[];
  autoPlay: boolean;
  interval: number; // ms
  showDots: boolean;
  showArrows: boolean;
  height: number; // px
}

/**
 * CarouselBlock — 图片轮播（对标旺铺"海报动效轮播"）
 * 支持自动播放、指示点、左右箭头、点击跳转
 */
export function CarouselBlock({
  images,
  autoPlay,
  interval,
  showDots,
  showArrows,
  height,
}: CarouselBlockProps) {
  const [current, setCurrent] = useState(0);
  const validImages = (images || []).filter((img) => img.url);

  const next = useCallback(() => {
    setCurrent((c) => (c + 1) % validImages.length);
  }, [validImages.length]);

  const prev = useCallback(() => {
    setCurrent((c) => (c - 1 + validImages.length) % validImages.length);
  }, [validImages.length]);

  useEffect(() => {
    if (!autoPlay || validImages.length <= 1) return;
    const timer = setInterval(next, interval || 3000);
    return () => clearInterval(timer);
  }, [autoPlay, interval, next, validImages.length]);

  if (validImages.length === 0) {
    return (
      <section
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F0EDE6",
          color: "#B8944E",
          fontSize: 14,
        }}
      >
        🖼️ 轮播图 — 请添加图片
      </section>
    );
  }

  const img = validImages[current];

  return (
    <section
      style={{
        position: "relative",
        height,
        overflow: "hidden",
        background: "#0F0D0C",
      }}
    >
      {/* 图片 */}
      {img.link ? (
        <a
          href={img.link}
          target={img.link.startsWith("http") ? "_blank" : undefined}
          rel="noopener noreferrer"
        >
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
        </a>
      ) : (
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
      )}

      {/* 左右箭头 */}
      {showArrows && validImages.length > 1 && (
        <>
          <button
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

      {/* 指示点 */}
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
          {validImages.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
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
