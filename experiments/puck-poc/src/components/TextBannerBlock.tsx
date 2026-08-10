import React from "react";

export interface TextBannerBlockProps {
  eyebrow: string;
  title: string;
  body: string;
  buttonText: string;
  buttonUrl: string;
  alignment: "center" | "left";
  backgroundColor: string;
  textColor: string;
  spacing: "compact" | "normal" | "spacious";
}

/**
 * TextBannerBlock — 纯文字横幅（对标旺铺"文字标题"）
 * 大标题+描述+CTA，支持明暗色背景
 */
export function TextBannerBlock({
  eyebrow,
  title,
  body,
  buttonText,
  buttonUrl,
  alignment,
  backgroundColor,
  textColor,
  spacing,
}: TextBannerBlockProps) {
  const padMap: Record<string, string> = {
    compact: "60px 0",
    normal: "100px 0",
    spacious: "140px 0",
  };
  const isDark = backgroundColor === "#1C1A18" || backgroundColor === "#0F0D0C";
  const mutedColor = isDark ? "rgba(255,255,255,0.6)" : "#8A7F72";
  const btnBorder = isDark ? "rgba(255,255,255,0.5)" : "#B8944E";
  const btnColor = isDark ? "#fff" : "#B8944E";

  if (!title && !body) {
    return (
      <section
        style={{
          padding: padMap[spacing] || padMap.normal,
          background: backgroundColor || "#FBF9F6",
          textAlign: "center",
          color: "#B8944E",
          fontSize: 14,
        }}
      >
        📝 文字横幅 — 请设置标题或正文
      </section>
    );
  }

  return (
    <section
      style={{
        padding: padMap[spacing] || padMap.normal,
        background: backgroundColor || "#FBF9F6",
      }}
    >
      <div
        style={{
          maxWidth: alignment === "left" ? 1080 : 640,
          margin: "0 auto",
          padding: "0 clamp(20px,4vw,60px)",
          textAlign: alignment,
        }}
      >
        {eyebrow && (
          <p
            style={{
              fontSize: 10,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: "#B8944E",
              marginBottom: 16,
            }}
          >
            {eyebrow}
          </p>
        )}
        {title && (
          <h2
            style={{
              fontSize: "clamp(24px,3.5vw,42px)",
              fontFamily: "serif",
              color: textColor || "#2C2C2C",
              lineHeight: 1.15,
              marginBottom: 16,
            }}
          >
            {title}
          </h2>
        )}
        {body && (
          <p
            style={{
              fontSize: 15,
              color: mutedColor,
              lineHeight: 1.8,
              marginBottom: buttonText ? 28 : 0,
              maxWidth: alignment === "left" ? 520 : 480,
              marginLeft: alignment === "left" ? 0 : "auto",
              marginRight: alignment === "left" ? 0 : "auto",
            }}
          >
            {body}
          </p>
        )}
        {buttonText && buttonUrl && (
          <a
            href={buttonUrl}
            style={{
              display: "inline-block",
              padding: "11px 38px",
              border: `1px solid ${btnBorder}`,
              color: btnColor,
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
