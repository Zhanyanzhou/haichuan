import { Link } from "react-router-dom";

interface TextBannerBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
}

/**
 * 纯文字横幅 — 大标题 + 描述 + CTA
 * content: { eyebrow, title, body, buttonText, linkUrl }
 * layoutConfig.template: 'center' | 'left'
 * styleConfig: { bgColor, textColor, spacing }
 */
export default function TextBannerBlock({
  module,
  editMode,
}: TextBannerBlockProps) {
  const { content = {}, layoutConfig = {}, styleConfig = {} } = module;
  const { eyebrow, title, body, buttonText, linkUrl } = content;
  const template = layoutConfig.template || "center";
  const bg = styleConfig.bgColor || "#FBF9F6";
  const textColor = styleConfig.textColor || "#2C2C2C";
  const spacing = styleConfig.spacing || "normal";

  const padMap: Record<string, string> = {
    compact: "60px 0",
    normal: "100px 0",
    spacious: "140px 0",
  };

  if (!title && !body && !editMode) return null;

  return (
    <section
      style={{ padding: padMap[spacing] || padMap.normal, background: bg }}
    >
      <div
        style={{
          maxWidth: template === "left" ? 1080 : 640,
          margin: "0 auto",
          padding: "0 clamp(20px,4vw,60px)",
          textAlign:
            template === "left" ? ("left" as const) : ("center" as const),
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
              fontFamily: "Inter,system-ui,sans-serif",
            }}
          >
            {eyebrow}
          </p>
        )}
        {title && (
          <h2
            style={{
              fontSize: "clamp(28px,3.5vw,48px)",
              lineHeight: 1.15,
              marginBottom: 20,
              fontFamily: '"Cormorant Garamond","Noto Serif SC",serif',
              color: textColor,
              maxWidth: 600,
              marginLeft: template === "left" ? 0 : "auto",
              marginRight: template === "left" ? 0 : "auto",
            }}
          >
            {title}
          </h2>
        )}
        {body && (
          <p
            style={{
              fontSize: 15,
              color: textColor === "#fff" ? "rgba(255,255,255,0.7)" : "#8A7F72",
              lineHeight: 1.8,
              marginBottom: 28,
              maxWidth: template === "left" ? 520 : 480,
              marginLeft: template === "left" ? 0 : "auto",
              marginRight: template === "left" ? 0 : "auto",
            }}
          >
            {body}
          </p>
        )}
        {buttonText && linkUrl && (
          <Link
            to={linkUrl}
            style={{
              display: "inline-block",
              padding: "11px 38px",
              border: `1px solid ${textColor === "#fff" ? "rgba(255,255,255,0.5)" : "#B8944E"}`,
              color: textColor === "#fff" ? "#fff" : "#B8944E",
              fontSize: 12,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              textDecoration: "none",
              transition: "all 0.2s",
            }}
          >
            {buttonText}
          </Link>
        )}
      </div>
    </section>
  );
}
