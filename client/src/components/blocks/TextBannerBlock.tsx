import { Link } from "react-router-dom";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { SecureImage } from "@/components/common/SecureImage";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import { resolveLinkTargetUrl } from "@/page-builder/utils/linkTarget";
import {
  CONTENT_TEMPLATE_LAYOUTS,
  ContentTemplateLayoutStyles,
  templateLayoutVars,
} from "@/page-builder/layout/contentTemplateLayouts";
import type { RenderablePageModule } from "@/types/pageModule";

interface TextBannerBlockProps {
  module: RenderablePageModule;
  editMode?: boolean;
}

/** 纯文字 — 固定语义对象可在模板编辑模式中自由布局，内容仍按实例维护。 */
export default function TextBannerBlock({
  module,
  editMode,
}: TextBannerBlockProps) {
  const { content, layoutConfig, styleConfig } = module;
  const { eyebrow, title, body, buttonText, bgImage } = content;
  const targetUrl = resolveLinkTargetUrl({
    targetType: content.targetType,
    productCode: content.productCode,
    productId: content.productId,
    categorySlug: content.categorySlug,
    linkUrl: content.linkUrl,
  });
  const template = layoutConfig.template || "center";
  // 白盒画册(2026-08-19):纯白底、近黑字;金色废除
  const bg = styleConfig.bgColor || "#FFFFFF";
  const textColor = styleConfig.textColor || "#181A1B";
  const spacing =
    styleConfig.spacing === "spacious" || styleConfig.spacing === "grand"
      ? styleConfig.spacing
      : "normal";
  const centered = template !== "left";
  // 双细线仪式(宣言屏标志性语言):上下两根 32px 发丝线
  const renderHair = (margin: React.CSSProperties) => (
    <div
      aria-hidden="true"
      style={{
        width: 32,
        height: 1,
        background: textColor,
        marginLeft: centered ? "auto" : 0,
        marginRight: centered ? "auto" : 0,
        ...margin,
      }}
    />
  );

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
      data-height-mode-mobile={
        CONTENT_TEMPLATE_LAYOUTS.textBanner.heightModeByViewport.mobile
      }
      data-mobile-order={CONTENT_TEMPLATE_LAYOUTS.textBanner.mobile.order.join(
        ",",
      )}
      style={{
        color: textColor,
        position: "relative",
        overflow: "hidden",
        ...templateLayoutVars(CONTENT_TEMPLATE_LAYOUTS.textBanner),
      }}
    >
      <ContentTemplateLayoutStyles />
      <div
        data-content-role="bgImage"
        data-editor-field="bgImage"
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: bgImage || editMode ? undefined : "none",
        }}
      >
        {bgImage ? (
          <SecureImage
            src={bgImage}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : null}
      </div>
      <div
        className="hc-content-template__copy hc-phase1-text"
        data-content-role="copy"
        data-align={template === "left" ? "left" : "center"}
        data-spacing={spacing}
        style={{
          position: "relative",
          zIndex: 1,
        }}
      >
        {renderHair({ marginBottom: "clamp(28px, 3vw, 58px)" })}
        {eyebrow && (
          <p
            data-editor-field="eyebrow"
            style={{
              fontSize: "var(--hc-type-caption, 12px)",
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "var(--hc-muted, #6E7477)",
              marginBottom: 16,
              fontFamily: `var(--hc-font-sans, ${FONT_SANS})`,
            }}
          >
            {eyebrow}
          </p>
        )}
        {title ? (
          <h2
            data-editor-field="title"
            className="hc-content-template__title"
            style={{
              fontSize: "var(--hc-type-h2, clamp(28px,1.9vw,54px))",
              lineHeight: 1.4,
              marginBottom: 20,
              fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
              color: "var(--hc-ink, #181A1B)",
              maxWidth: 680,
              marginLeft: centered ? "auto" : 0,
              marginRight: centered ? "auto" : 0,
            }}
          >
            {title}
          </h2>
        ) : null}
        {body ? (
          <p
            data-editor-field="body"
            className="hc-content-template__body"
            style={{
              fontSize: "var(--hc-type-body, 15px)",
              color: "var(--hc-muted, #6E7477)",
              lineHeight: 1.9,
              marginBottom: 28,
              maxWidth: template === "left" ? 520 : 480,
              marginLeft: centered ? "auto" : 0,
              marginRight: centered ? "auto" : 0,
            }}
          >
            {body}
          </p>
        ) : null}
        {buttonText &&
          targetUrl &&
          (editMode ? (
            <span
              data-content-role="action"
              data-editor-field="buttonText targetType productId linkUrl"
              className="hc-content-template__action"
              style={{ color: "var(--hc-ink, #181A1B)" }}
            >
              {buttonText}
            </span>
          ) : (
            <Link
              data-content-role="action"
              data-editor-field="buttonText targetType productId linkUrl"
              className="hc-content-template__action"
              to={targetUrl}
              style={{ color: "var(--hc-ink, #181A1B)" }}
            >
              {buttonText}
            </Link>
          ))}
        {renderHair({ marginTop: "clamp(36px, 4vw, 76px)" })}
      </div>
    </DecorSection>
  );
}
