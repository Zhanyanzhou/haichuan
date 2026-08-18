import { Link } from "react-router-dom";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import { resolveLinkTargetUrl } from "@/page-builder/utils/linkTarget";
import {
  CONTENT_TEMPLATE_LAYOUTS,
  ContentTemplateLayoutStyles,
  templateLayoutVars,
} from "@/page-builder/layout/contentTemplateLayouts";

interface TextBannerBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
}

/** 纯文字 — 无图片槽，只允许对齐和上下留白两个受控布局预设。 */
export default function TextBannerBlock({
  module,
  editMode,
}: TextBannerBlockProps) {
  const { content = {}, layoutConfig = {}, styleConfig = {} } = module;
  const { eyebrow, title, body, buttonText, bgImage } = content;
  const targetUrl = resolveLinkTargetUrl({
    targetType: content.targetType,
    productId: content.productId,
    linkUrl: content.linkUrl,
  });
  const template = layoutConfig.template || "center";
  const bg = styleConfig.bgColor || "#FBF9F6";
  const textColor = styleConfig.textColor || "#2C2C2C";
  const spacing = styleConfig.spacing === "spacious" ? "spacious" : "normal";

  if (!title && !body) {
    if (!editMode) return null;
    return (
      <BlockEmptyPlaceholder
        icon="📝"
        hint={CONTENT_TEMPLATE_LAYOUTS.textBanner.displayName}
        spec="请输入标题或正文"
        bg={bg}
      />
    );
  }

  return (
    <DecorSection
      master={CONTENT_TEMPLATE_LAYOUTS.textBanner.master}
      width={CONTENT_TEMPLATE_LAYOUTS.textBanner.width}
      flow={CONTENT_TEMPLATE_LAYOUTS.textBanner.flow}
      spacing={spacing}
      background={bg}
      className="hc-content-template"
      data-content-template={CONTENT_TEMPLATE_LAYOUTS.textBanner.key}
      data-visual-role={CONTENT_TEMPLATE_LAYOUTS.textBanner.visualRole}
      data-height-mode-desktop={
        CONTENT_TEMPLATE_LAYOUTS.textBanner.heightModeByViewport.desktop
      }
      data-height-mode-tablet={
        CONTENT_TEMPLATE_LAYOUTS.textBanner.heightModeByViewport.tablet
      }
      data-height-mode-mobile={
        CONTENT_TEMPLATE_LAYOUTS.textBanner.heightModeByViewport.mobile
      }
      data-mobile-order={CONTENT_TEMPLATE_LAYOUTS.textBanner.mobile.order.join(
        ",",
      )}
      style={{
        color: textColor,
        ...(bgImage
          ? {
              backgroundImage: `url(${bgImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : {}),
        ...templateLayoutVars(CONTENT_TEMPLATE_LAYOUTS.textBanner),
      }}
    >
      <ContentTemplateLayoutStyles />
      <div
        className="hc-content-template__copy hc-phase1-text"
        data-align={template === "left" ? "left" : "center"}
        data-spacing={spacing}
        style={{
          position: "relative",
          zIndex: 1,
        }}
      >
        {eyebrow && (
          <p
            data-editor-field="eyebrow"
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
          <h2
            data-editor-field="title"
            className="hc-content-template__title"
            style={{
              fontSize: "var(--hc-type-display, clamp(28px,3.5vw,48px))",
              lineHeight: 1.15,
              marginBottom: 20,
              fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
              color: "var(--hc-ink, #2C2C2C)",
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
            data-editor-field="body"
            className="hc-content-template__body"
            style={{
              fontSize: "var(--hc-type-body, 15px)",
              color: "var(--hc-muted, #5C5C5C)",
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
        {buttonText &&
          targetUrl &&
          (editMode ? (
            <span
              data-editor-field="buttonText targetType productId linkUrl"
              className="hc-content-template__action"
              style={{ color: "var(--hc-ink, #2C2C2C)" }}
            >
              {buttonText}
            </span>
          ) : (
            <Link
              data-editor-field="buttonText targetType productId linkUrl"
              className="hc-content-template__action"
              to={targetUrl}
              style={{ color: "var(--hc-ink, #2C2C2C)" }}
            >
              {buttonText}
            </Link>
          ))}
      </div>
    </DecorSection>
  );
}
