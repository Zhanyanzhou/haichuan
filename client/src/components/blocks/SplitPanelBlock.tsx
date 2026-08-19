import { Link } from "react-router-dom";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";

interface SplitPanelBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
}

/**
 * 左右分割面板 — 图+文 各占一半
 * content: { image, title, subtitle, body, buttonText, linkUrl }
 * layoutConfig.template: 'imageLeft' | 'imageRight'
 * layoutConfig.split: '50-50' | '60-40' | '40-60'
 */
export default function SplitPanelBlock({
  module,
  editMode,
}: SplitPanelBlockProps) {
  const { content = {}, layoutConfig = {}, styleConfig = {} } = module;
  const { image, title, subtitle, body, buttonText, linkUrl } = content;
  const template = layoutConfig.template || "imageLeft";
  const split = layoutConfig.split || "50-50";
  const bg = styleConfig.bgColor || "#FFFFFF";
  const textBg = styleConfig.textColor || "#fff";

  const [leftPct, rightPct] =
    split === "60-40" ? [60, 40] : split === "40-60" ? [40, 60] : [50, 50];
  const imageOnLeft = template === "imageLeft";

  if (!image) {
    if (!editMode) return null;
    return (
      <BlockEmptyPlaceholder
        icon="◧"
        hint="左右分割面板"
        spec={`遗留模块 · ${IMAGE_SPECS.splitPanel.image.label}`}
        bg={bg}
      />
    );
  }

  const imageCol = (
    <div data-editor-field="image"
      className="homepage-split-panel__image"
      style={{
        flex: `0 0 ${imageOnLeft ? leftPct : rightPct}%`,
        overflow: "hidden",
        position: "relative",
        minHeight: 420,
      }}
    >
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
    </div>
  );

  const textCol = (
    <div
      className="homepage-split-panel__copy"
      style={{
        flex: `0 0 ${imageOnLeft ? rightPct : leftPct}%`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(40px,6vw,100px) clamp(28px,5vw,72px)",
        background: textBg,
      }}
    >
      <div style={{ maxWidth: 440 }}>
        {subtitle ? (
          <p data-editor-field="subtitle"
            style={{
              fontSize: 10,
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "#8C8C8C",
              marginBottom: 16,
              fontFamily: "Inter,system-ui,sans-serif",
            }}
          >
            {subtitle}
          </p>
        ) : null}
        {title ? (
          <h2 data-editor-field="title"
            style={{
              fontSize: "clamp(24px,2.8vw,40px)",
              fontFamily: '"Cormorant Garamond","Noto Serif SC",serif',
              color: "#1A1A1A",
              lineHeight: 1.15,
              marginBottom: 20,
            }}
          >
            {title}
          </h2>
        ) : null}
        {body ? (
          <p data-editor-field="body"
            style={{
              fontSize: 14,
              color: "#8C8C8C",
              lineHeight: 1.8,
              marginBottom: 28,
            }}
          >
            {body}
          </p>
        ) : null}
        {buttonText && linkUrl ? (
          <Link data-editor-field="buttonText linkUrl"
            to={linkUrl}
            style={{
              display: "inline-block",
              paddingBottom: 6,
              borderBottom: "1px solid #1A1A1A",
              color: "#1A1A1A",
              fontSize: 12,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              textDecoration: "none",
              transition: "all 0.2s",
            }}
          >
            {buttonText}
          </Link>
        ) : null}
      </div>
    </div>
  );

  return (
    <section style={{ background: bg }}>
      <div className="homepage-split-panel" style={{ display: "flex", flexDirection: "row", flexWrap: "wrap" }}>
        <style>{`
          @media (max-width: 767px) {
            .homepage-split-panel { flex-direction: column; flex-wrap: nowrap !important; }
            .homepage-split-panel__image,
            .homepage-split-panel__copy { flex: 0 0 auto !important; width: 100%; }
            .homepage-split-panel__image { min-height: 360px !important; }
            .homepage-split-panel__copy { padding: 48px 24px !important; }
          }
        `}</style>
        {imageOnLeft ? (
          <>
            {imageCol}
            {textCol}
          </>
        ) : (
          <>
            {textCol}
            {imageCol}
          </>
        )}
      </div>
    </section>
  );
}
