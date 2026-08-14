import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { resolveLinkTargetUrl } from "@/page-builder/utils/linkTarget";
import { FULL_BLEED_CONTRACT, RESPONSIVE_CANVAS } from "@/page-builder/config/blockContracts";

interface FullBleedBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
}

/**
 * 单张海报 — 固定比例大图 + 可选文字 + 整张点击
 * content: { image, mobileImage, title, subtitle, buttonText, targetType, productId, linkUrl }
 * layoutConfig.template: 'textCenter' | 'textLeft' | 'textRight' | 'textBottomLeft'
 */
export default function FullBleedBlock({
  module,
  editMode,
}: FullBleedBlockProps) {
  const { content = {}, layoutConfig = {}, styleConfig = {} } = module;
  const {
    image,
    mobileImage,
    title,
    subtitle,
    buttonText,
    linkUrl,
    targetType,
    productId,
    altText,
  } = content;
  const template = layoutConfig.template || "textCenter";
  const overlayPreset = styleConfig.overlayPreset || "soft";
  const overlay = overlayPreset === "none"
    ? "transparent"
    : overlayPreset === "strong"
      ? "rgba(15,13,12,0.38)"
      : targetType === undefined && styleConfig.bgColor
        ? styleConfig.bgColor
        : "rgba(15,13,12,0.2)";
  const desktopFocusX = Math.min(100, Math.max(0, Number(styleConfig.desktopFocusX ?? 50)));
  const desktopFocusY = Math.min(100, Math.max(0, Number(styleConfig.desktopFocusY ?? 50)));
  const mobileFocusX = Math.min(100, Math.max(0, Number(styleConfig.mobileFocusX ?? desktopFocusX)));
  const mobileFocusY = Math.min(100, Math.max(0, Number(styleConfig.mobileFocusY ?? desktopFocusY)));
  const targetUrl = resolveLinkTargetUrl({ targetType, productId, linkUrl });
  const [imageFailed, setImageFailed] = useState(false);

  const desktopImg = image || mobileImage;
  const mobileImg = mobileImage || image;

  useEffect(() => {
    setImageFailed(false);
  }, [desktopImg, mobileImg]);

  if (!desktopImg) {
    if (!editMode) return null;
    return (
      <BlockEmptyPlaceholder
        hint="请上传单张海报"
        spec="桌面 3840×1600（12:5）· 移动 1500×1800（5:6）"
      />
    );
  }

  const textX =
    template === "textLeft" || template === "textBottomLeft"
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

  const posterStyle = {
    "--hc-poster-focus-desktop": `${desktopFocusX}% ${desktopFocusY}%`,
    "--hc-poster-focus-mobile": `${mobileFocusX}% ${mobileFocusY}%`,
  } as CSSProperties & Record<"--hc-poster-focus-desktop" | "--hc-poster-focus-mobile", string>;

  const poster = (
    <section
      className="hc-single-poster"
      data-text-position={template}
      style={{
        ...posterStyle,
        position: "relative",
        width: "100%",
        overflow: "hidden",
        background: "#E7DDCE",
      }}
    >
      {!imageFailed ? (
        <picture data-editor-field="image mobileImage">
          <source media={RESPONSIVE_CANVAS.mobileMediaQuery} srcSet={mobileImg} />
          <img
            className="hc-single-poster__image"
            src={desktopImg}
            alt={altText || ""}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        </picture>
      ) : (
        <div className="hc-single-poster__image-error" role="img" aria-label={altText || "海报图片暂不可用"}>
          海报图片暂不可用
        </div>
      )}
      <div style={{ position: "absolute", inset: 0, background: overlay }} />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: textY,
          justifyContent: textX,
          padding: `${template === "textBottomLeft" ? "0 0 clamp(28px,5vw,72px)" : "0"} ${padRight} 0 ${padLeft}`,
          textAlign: textAlign as any,
        }}
      >
        <div className="hc-single-poster__copy" style={{ maxWidth: 520 }}>
          {title && (
            <h2 data-editor-field="title"
              style={{
                fontSize: "clamp(28px,4vw,56px)",
                lineHeight: 1.1,
                margin: 0,
                fontFamily: '"Cormorant Garamond","Noto Serif SC",serif',
                color: "#fff",
                fontWeight: 500,
                letterSpacing: ".04em",
              }}
            >
              {title}
            </h2>
          )}
          {subtitle && (
            <p data-editor-field="subtitle"
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.82)",
                lineHeight: 1.6,
                margin: "14px 0 0",
                maxWidth: 400,
              }}
            >
              {subtitle}
            </p>
          )}
          {buttonText && targetUrl && (
            <span data-editor-field="buttonText linkUrl productId"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                marginTop: 22,
                paddingBottom: 5,
                borderBottom: "1px solid rgba(255,255,255,0.64)",
                color: "#fff",
                fontSize: 12,
                letterSpacing: "0.12em",
              }}
            >
              {buttonText}<span aria-hidden>→</span>
            </span>
          )}
        </div>
      </div>
      <style>{`
        .hc-single-poster { aspect-ratio: ${FULL_BLEED_CONTRACT.canvas.desktopMediaAspectRatio}; }
        .hc-single-poster__image,
        .hc-single-poster__image-error {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        .hc-single-poster__image {
          object-fit: cover;
          object-position: var(--hc-poster-focus-desktop);
          transition: transform 700ms cubic-bezier(.22,.61,.36,1);
        }
        .hc-single-poster__image-error {
          display: grid;
          place-items: center;
          color: #7E7468;
          background: linear-gradient(135deg, #EDE6DC, #D9CDBD);
          font-size: 13px;
          letter-spacing: .08em;
        }
        .hc-single-poster-link {
          display: block;
          color: inherit;
          text-decoration: none;
        }
        .hc-single-poster-link:hover .hc-single-poster__image { transform: scale(1.012); }
        .hc-single-poster-link:focus-visible { outline: 2px solid #B8944E; outline-offset: 3px; }
        @media ${RESPONSIVE_CANVAS.mobileMediaQuery} {
          .hc-single-poster { aspect-ratio: ${FULL_BLEED_CONTRACT.canvas.mobileMediaAspectRatio}; }
          .hc-single-poster__image { object-position: var(--hc-poster-focus-mobile); }
          .hc-single-poster__copy { max-width: min(78vw, 420px) !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hc-single-poster__image { transition: none; }
          .hc-single-poster-link:hover .hc-single-poster__image { transform: none; }
        }
      `}</style>
    </section>
  );

  if (!targetUrl || editMode) return poster;
  return (
    <Link className="hc-single-poster-link" to={targetUrl} aria-label={title || altText || "查看海报详情"}>
      {poster}
    </Link>
  );
}
