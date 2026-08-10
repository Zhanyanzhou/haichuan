import { Link } from "react-router-dom";

interface FullBleedBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
}

/**
 * 全屏出血图 — 大图背景 + 文字叠加
 * content: { image, mobileImage, title, subtitle, buttonText, linkUrl }
 * layoutConfig.template: 'textCenter' | 'textLeft' | 'textRight' | 'textBottomLeft'
 */
export default function FullBleedBlock({
  module,
  editMode,
}: FullBleedBlockProps) {
  const { content = {}, layoutConfig = {}, styleConfig = {} } = module;
  const { image, mobileImage, title, subtitle, buttonText, linkUrl } = content;
  const template = layoutConfig.template || "textCenter";
  const overlay = styleConfig.bgColor || "rgba(15,13,12,0.2)";

  if (!image) {
    return editMode ? (
      <section
        style={{
          padding: "120px 0",
          background: "#F0EDE6",
          textAlign: "center",
        }}
      >
        <p style={{ color: "#B8944E", fontSize: 13 }}>
          🖼️ 全屏出血图 — 请上传背景图片
        </p>
      </section>
    ) : null;
  }

  const textX =
    template === "textLeft"
      ? "flex-start"
      : template === "textRight"
        ? "flex-end"
        : "center";
  const textY = template === "textBottomLeft" ? "flex-end" : "center";
  const textAlign =
    template === "textLeft"
      ? "left"
      : template === "textRight"
        ? "right"
        : template === "textBottomLeft"
          ? "left"
          : "center";
  const padLeft =
    template === "textLeft" || template === "textBottomLeft"
      ? "clamp(28px,4.2vw,72px)"
      : "24px";
  const padRight = template === "textRight" ? "clamp(28px,4.2vw,72px)" : "24px";

  return (
    <section
      style={{
        position: "relative",
        width: "100%",
        minHeight: template === "textBottomLeft" ? "90svh" : "100svh",
        overflow: "hidden",
        background: "#0F0D0C",
      }}
    >
      <picture>
        {mobileImage && (
          <source media="(max-width: 1023px) and (orientation: portrait)" srcSet={mobileImage} />
        )}
        <img
          src={image}
          alt=""
          loading="lazy"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </picture>
      <div style={{ position: "absolute", inset: 0, background: overlay }} />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: textY,
          justifyContent: textX,
          padding: `${template === "textBottomLeft" ? "0 0 clamp(38px,7vh,80px)" : "0"} ${padRight} 0 ${padLeft}`,
          textAlign: textAlign as any,
        }}
      >
        <div style={{ maxWidth: 520 }}>
          {title && (
            <h2
              style={{
                fontSize: "clamp(32px,4.5vw,56px)",
                lineHeight: 1.1,
                marginBottom: 16,
                fontFamily: '"Cormorant Garamond","Noto Serif SC",serif',
                color: "#fff",
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
                marginBottom: 24,
                maxWidth: 400,
              }}
            >
              {subtitle}
            </p>
          )}
          {buttonText && linkUrl && (
            <Link
              to={linkUrl}
              style={{
                display: "inline-block",
                padding: "10px 32px",
                border: "1px solid rgba(255,255,255,0.5)",
                color: "#fff",
                fontSize: 12,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                textDecoration: "none",
                transition: "all 0.3s",
              }}
            >
              {buttonText}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
