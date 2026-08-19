import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { resolveLinkTargetUrl } from "@/page-builder/utils/linkTarget";
import { RESPONSIVE_CANVAS } from "@/page-builder/config/blockContracts";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { DesignSystemStyles } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY } from "@/page-builder/designSystem/tokens";
import {
  CONTENT_TEMPLATE_LAYOUTS,
  ContentTemplateLayoutStyles,
  templateLayoutVars,
} from "@/page-builder/layout/contentTemplateLayouts";

interface FullBleedBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
}

/** 通栏图 — 三端受控观看窗，说明和行动入口始终位于图片下方。 */
export default function FullBleedBlock({
  module,
  editMode,
}: FullBleedBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const {
    image,
    mobileImage,
    eyebrow,
    title,
    subtitle,
    buttonText,
    linkUrl,
    targetType,
    productId,
    altText,
  } = content;
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

  if (!desktopImg && !editMode) return null;

  const posterStyle = {
    "--hc-poster-focus-desktop": `${desktopFocusX}% ${desktopFocusY}%`,
    "--hc-poster-focus-mobile": `${mobileFocusX}% ${mobileFocusY}%`,
    ...templateLayoutVars(CONTENT_TEMPLATE_LAYOUTS.fullBleed),
  } as CSSProperties & Record<"--hc-poster-focus-desktop" | "--hc-poster-focus-mobile", string>;

  const poster = (
    <section
      className="hc-content-template hc-phase1-full-bleed hc-section"
      data-content-template={CONTENT_TEMPLATE_LAYOUTS.fullBleed.key}
      data-visual-role={CONTENT_TEMPLATE_LAYOUTS.fullBleed.visualRole}
      data-height-mode-desktop={CONTENT_TEMPLATE_LAYOUTS.fullBleed.heightModeByViewport.desktop}
      data-height-mode-tablet={CONTENT_TEMPLATE_LAYOUTS.fullBleed.heightModeByViewport.tablet}
      data-height-mode-mobile={CONTENT_TEMPLATE_LAYOUTS.fullBleed.heightModeByViewport.mobile}
      data-mobile-order={CONTENT_TEMPLATE_LAYOUTS.fullBleed.mobile.order.join(",")}
      data-flow={CONTENT_TEMPLATE_LAYOUTS.fullBleed.flow}
      data-density="brand"
      data-spacing="normal"
      style={{
        ...posterStyle,
        position: "relative",
        width: "100%",
        overflow: "hidden",
        background: "#FFFFFF",
      }}
    >
      <DesignSystemStyles />
      <ContentTemplateLayoutStyles />
      <div className="hc-content-template__media hc-phase1-full-bleed__media">
      {!desktopImg ? (
        <BlockEmptyPlaceholder
          hint={CONTENT_TEMPLATE_LAYOUTS.fullBleed.displayName}
          spec={`桌面 ${IMAGE_SPECS.fullBleed.desktop.label} · 移动 ${IMAGE_SPECS.fullBleed.mobile.label}`}
          height="100%"
        />
      ) : !imageFailed ? (
        <picture data-editor-field="image mobileImage">
          <source media={RESPONSIVE_CANVAS.mobileMediaQuery} srcSet={mobileImg} />
          <img
            className="hc-full-bleed__image"
            src={desktopImg}
            alt={altText || ""}
            loading="lazy"
            decoding="async"
            width={3360}
            height={960}
            onError={() => setImageFailed(true)}
          />
        </picture>
      ) : (
        <div className="hc-full-bleed__image-error" role="img" aria-label={altText || "通栏图片暂不可用"}>
          通栏图片暂不可用
        </div>
      )}
      </div>

      {(title || subtitle || (buttonText && targetUrl) || editMode) ? (
      <div className="hc-content-template__container hc-phase1-full-bleed__caption">
        <div className="hc-content-template__copy hc-phase1-full-bleed__copy">
          {eyebrow ? (
            <p data-editor-field="eyebrow" className="hc-content-template__eyebrow">
              {eyebrow}
            </p>
          ) : null}
          {title ? (
            <h2 data-editor-field="title" className="hc-content-template__title"
              style={{
                fontSize: "var(--hc-type-h2, clamp(28px,3.4vw,44px))",
                fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
              }}
            >
              {title}
            </h2>
          ) : null}
          {subtitle ? (
            <p data-editor-field="subtitle" className="hc-content-template__body"
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {buttonText && targetUrl ? (
          editMode ? (
            <span className="hc-content-template__action hc-phase1-full-bleed__action" data-editor-field="buttonText linkUrl productId">
              {buttonText}<span aria-hidden>→</span>
            </span>
          ) : (
            <Link className="hc-content-template__action hc-phase1-full-bleed__action" data-editor-field="buttonText linkUrl productId" to={targetUrl}>
              {buttonText}<span aria-hidden>→</span>
            </Link>
          )
        ) : null}
      </div>
      ) : null}
      <style>{`
        .hc-full-bleed__image,
        .hc-full-bleed__image-error {
          width: 100%;
          height: 100%;
        }
        .hc-full-bleed__image {
          object-fit: cover;
          object-position: var(--hc-poster-focus-desktop);
        }
        .hc-full-bleed__image-error {
          display: grid;
          place-items: center;
          color: #7E7468;
          background: #F5F5F5;
          font-size: 13px;
          letter-spacing: .08em;
        }
        @media ${RESPONSIVE_CANVAS.mobileMediaQuery} {
          .hc-full-bleed__image { object-position: var(--hc-poster-focus-mobile); }
        }
      `}</style>
    </section>
  );

  return poster;
}
