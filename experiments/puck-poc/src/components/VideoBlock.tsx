import React from "react";

export interface VideoBlockProps {
  videoUrl: string;
  posterUrl: string;
  autoPlay: boolean;
  loop: boolean;
  muted: boolean;
  showControls: boolean;
  aspectRatio: "16:9" | "4:3" | "9:16";
  maxHeight: number;
}

/**
 * VideoBlock — 视频模块（对标旺铺"单视频"）
 * 支持自动播放、循环、静音、封面图
 */
export function VideoBlock({
  videoUrl,
  posterUrl,
  autoPlay,
  loop,
  muted,
  showControls,
  aspectRatio,
  maxHeight,
}: VideoBlockProps) {
  if (!videoUrl) {
    return (
      <section
        style={{
          padding: "80px 0",
          background: "#F0EDE6",
          textAlign: "center",
          color: "#B8944E",
          fontSize: 14,
        }}
      >
        🎬 视频模块 — 请设置视频 URL
      </section>
    );
  }

  const ratioMap: Record<string, string> = {
    "16:9": "56.25%",
    "4:3": "75%",
    "9:16": "177.78%",
  };

  return (
    <section
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "clamp(40px,5vh,80px) clamp(20px,4vw,60px)",
      }}
    >
      <div
        style={{
          position: "relative",
          paddingBottom: ratioMap[aspectRatio] || "56.25%",
          maxHeight,
          overflow: "hidden",
          background: "#0F0D0C",
          borderRadius: 4,
        }}
      >
        <video
          src={videoUrl}
          poster={posterUrl || undefined}
          autoPlay={autoPlay}
          loop={loop}
          muted={muted || autoPlay}
          controls={showControls}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </div>
    </section>
  );
}
