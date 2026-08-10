import React from "react";

export interface HeroBlockProps {
  title: string;
  subtitle: string;
  imageUrl: string;
  buttonText: string;
  buttonUrl: string;
  alignment: "left" | "center" | "right";
}

/**
 * HeroBlock — 首屏主视觉
 * PoC 中不依赖 Tailwind，用内联样式演示
 */
export function HeroBlock({
  title,
  subtitle,
  imageUrl,
  buttonText,
  buttonUrl,
  alignment,
}: HeroBlockProps) {
  const textAlign =
    alignment === "center"
      ? "center"
      : alignment === "right"
        ? "right"
        : "left";
  const flexDir: React.CSSProperties["flexDirection"] =
    alignment === "right" ? "row-reverse" : "row";

  return (
    <section
      style={{
        display: "flex",
        flexDirection: flexDir,
        alignItems: "center",
        minHeight: 420,
        gap: 40,
        padding: "40px 5vw",
        background: "#1C1A18",
        color: "#F3F0E9",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ flex: 1, textAlign }}>
        <h1
          style={{
            fontSize: "clamp(24px,5vw,48px)",
            fontWeight: 700,
            margin: "0 0 12px",
            lineHeight: 1.2,
          }}
        >
          {title || "标题待设置"}
        </h1>
        {subtitle && (
          <p
            style={{
              fontSize: 18,
              opacity: 0.78,
              margin: "0 0 24px",
              lineHeight: 1.6,
            }}
          >
            {subtitle}
          </p>
        )}
        {buttonText && (
          <a
            href={buttonUrl || "#"}
            style={{
              display: "inline-block",
              padding: "12px 32px",
              background: "#B8944E",
              color: "#fff",
              textDecoration: "none",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {buttonText}
          </a>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            style={{
              width: "100%",
              maxHeight: 380,
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: 300,
              background: "#2A2825",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#8A7F72",
              fontSize: 14,
            }}
          >
            图片占位（设置 imageUrl）
          </div>
        )}
      </div>
    </section>
  );
}
