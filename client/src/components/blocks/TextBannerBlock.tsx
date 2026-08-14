import { Link } from "react-router-dom";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";

interface TextBannerBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
}

/**
 * 品牌宣言(文字横幅)— Editorial Text 母版
 * 纯文字与大留白;可带背景海报(自动切白字)与一个 CTA。
 * 纵向节奏交给 DecorSection(brand 密度 + 三档留白)。
 */
export default function TextBannerBlock({
  module,
  editMode,
}: TextBannerBlockProps) {
  const { content = {}, layoutConfig = {}, styleConfig = {} } = module;
  const { eyebrow, title, body, backgroundImage, buttonText, linkUrl } = content;
  const template = layoutConfig.template || "center";
  const bg = styleConfig.bgColor || "#FBF9F6";
  const textColor = backgroundImage && (!styleConfig.textColor || styleConfig.textColor === "#2C2C2C")
    ? "#FFFFFF"
    : styleConfig.textColor || "#2C2C2C";
  const isLightText = textColor.toLowerCase() === "#fff" || textColor.toLowerCase() === "#ffffff";
  const spacing = styleConfig.spacing || "normal";

  if (!title && !body) {
    if (!editMode) return null;
    return (
      <BlockEmptyPlaceholder
        icon="📝"
        hint="品牌宣言"
        spec="请输入标题或正文"
        bg={bg}
      />
    );
  }

  return (
    <DecorSection
      master="editorial-text"
      width="editorial"
      spacing={spacing}
      background={bg}
      style={{ color: textColor }}
    >
      {backgroundImage && (
        <div
          data-editor-field="backgroundImage"
          style={{
            position: "absolute",
            zIndex: 0,
            inset: 0,
            backgroundImage: `linear-gradient(rgba(20, 17, 13, 0.48), rgba(20, 17, 13, 0.48)), url(${backgroundImage})`,
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        />
      )}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: template === "left" ? 720 : 640,
          margin: "0 auto",
          textAlign: template === "left" ? ("left" as const) : ("center" as const),
        }}
      >
        {eyebrow && (
          <p data-editor-field="eyebrow"
            style={{
              fontSize: "var(--hc-type-caption, 12px)",
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: "var(--hc-gold, #B8944E)",
              marginBottom: 16,
              fontFamily: `var(--hc-font-sans, ${FONT_SANS})`,
            }}
          >
            {eyebrow}
          </p>
        )}
        {title && (
          <h2 data-editor-field="title"
            style={{
              fontSize: "var(--hc-type-display, clamp(28px,3.5vw,48px))",
              lineHeight: 1.15,
              marginBottom: 20,
              fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
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
          <p data-editor-field="body"
            style={{
              fontSize: "var(--hc-type-body, 15px)",
              color: isLightText ? "rgba(255,255,255,0.78)" : "var(--hc-muted, #8A7F72)",
              lineHeight: 1.9,
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
          <Link data-editor-field="buttonText linkUrl"
            to={linkUrl}
            style={{
              display: "inline-block",
              padding: "11px 38px",
              border: `1px solid ${isLightText ? "rgba(255,255,255,0.5)" : "var(--hc-gold, #B8944E)"}`,
              color: isLightText ? "#fff" : "var(--hc-gold, #B8944E)",
              fontSize: "var(--hc-type-caption, 12px)",
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
    </DecorSection>
  );
}
