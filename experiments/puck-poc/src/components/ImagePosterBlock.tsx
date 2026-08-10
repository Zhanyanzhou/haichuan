import React from "react";

export interface ImagePosterBlockProps {
  imageUrl: string;
  title: string;
  subtitle: string;
  buttonText: string;
  buttonUrl: string;
  textPosition: "left" | "center" | "right" | "bottomLeft";
  overlayOpacity: number; // 0-100
  minHeight: number;
}

/**
 * ImagePosterBlock — 单图海报 + 文字叠加（对标旺铺"单图海报"+"热区"）
 * 支持文字四角定位、遮罩透明度
 */
export function ImagePosterBlock({
  imageUrl,
  title,
  subtitle,
  buttonText,
  buttonUrl,
  textPosition,
  overlayOpacity,
  minHeight,
}: ImagePosterBlockProps) {
  if (!imageUrl) {
    return (
      <section
        style={{
          minHeight: minHeight || 480,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F0EDE6",
          color: "#B8944E",
          fontSize: 14,
        }}
      >
        🖼️ 单图海报 — 请设置图片 URL
      </section>
    );
  }

  const xMap: Record<string, string> = {
    left: "flex-start",
    center: "center",
    right: "flex-end",
    bottomLeft: "flex-start",
  };
  const yMap: Record<string, string> = {
    left: "center",
    center: "center",
    right: "center",
    bottomLeft: "flex-end",
  };
  const textAlign =
    textPosition === "left" || textPosition === "bottomLeft"
      ? "left"
      : textPosition === "right"
        ? "right"
        : "center";
  const padL =
    textPosition === "left" || textPosition === "bottomLeft"
      ? "clamp(24px,5vw,72px)"
      : "24px";
  const padR = textPosition === "right" ? "clamp(24px,5vw,72px)" : "24px";
  const padB = textPosition === "bottomLeft" ? "clamp(32px,6vh,80px)" : "0";

  return (
    <section
      style={{
        position: "relative",
        minHeight: minHeight || 480,
        overflow: "hidden",
        background: "#0F0D0C",
        display: "flex",
        alignItems: yMap[textPosition] || "center",
        justifyContent: xMap[textPosition] || "center",
        padding: `40px ${padR} ${padB} ${padL}`,
      }}
    >
      <img
        src={imageUrl}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `rgba(15,13,12,${(overlayOpacity ?? 20) / 100})`,
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 520,
          textAlign: textAlign as any,
        }}
      >
        {title && (
          <h2
            style={{
              fontSize: "clamp(28px,4vw,48px)",
              fontFamily: "serif",
              color: "#fff",
              lineHeight: 1.1,
              marginBottom: 12,
            }}
          >
            {title}
          </h2>
        )}
        {subtitle && (
          <p
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.7)",
              lineHeight: 1.6,
              marginBottom: 20,
            }}
          >
            {subtitle}
          </p>
        )}
        {buttonText && buttonUrl && (
          <a
            href={buttonUrl}
            style={{
              display: "inline-block",
              padding: "10px 32px",
              border: "1px solid rgba(255,255,255,0.5)",
              color: "#fff",
              fontSize: 12,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            {buttonText}
          </a>
        )}
      </div>
    </section>
  );
}
