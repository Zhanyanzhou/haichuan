import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import type { PageModule } from "@/types/pageModule";
import { resolveLinkTargetUrl } from "@/page-builder/utils/linkTarget";
import { RESPONSIVE_CANVAS } from "@/page-builder/config/blockContracts";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { DesignSystemStyles } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import {
  CONTENT_TEMPLATE_LAYOUTS,
  ContentTemplateLayoutStyles,
  templateLayoutVars,
} from "@/page-builder/layout/contentTemplateLayouts";
import { hasRenderableImageDimensions } from "@/utils/imageLoad";

interface Props {
  module?: PageModule;
  editMode?: boolean;
  headingLevel?: 1 | 2;
}

/**
 * Hero 模块 — 全屏首屏主视觉
 */
export default function HeroSection({
  module,
  editMode,
  headingLevel = 1,
}: Props) {
  const rm = useReducedMotion();

  const c = module?.content;
  const s = module?.styleConfig;
  const l = module?.layoutConfig;

  // 未上传某一端时复用另一端已配置图片，不再引入活动素材兜底。
  const desktopImg = c?.desktopImage || c?.mobileImage || "";
  const mobileImg = c?.mobileImage || c?.desktopImage || "";
  const imageSourceKey = `${desktopImg}\u0000${mobileImg}`;
  const [failedImageSourceKey, setFailedImageSourceKey] = useState<string | null>(null);
  const imageFailed = failedImageSourceKey === imageSourceKey;

  // 已配置的装修区块没有素材时，不能回退到活动默认图，避免前台或画布闪出陌生图片。
  if (!desktopImg && !mobileImg && !editMode) return null;
  // 文案不再回退营销默认值:未填写即为空,公开态对应节点不渲染(编辑态有占位引导)
  const eyebrow = typeof c?.eyebrow === "string" ? c.eyebrow : "";
  const title = typeof c?.title === "string" ? c.title : "";
  const subtitle = typeof c?.subtitle === "string" ? c.subtitle : "";
  const actionText = typeof c?.actionText === "string" ? c.actionText : "";
  const Heading = headingLevel === 2 ? "h2" : "h1";
  const linkUrl = typeof c?.linkUrl === "string" ? c.linkUrl : "";
  const targetUrl = resolveLinkTargetUrl({
    targetType: c?.targetType,
    productCode: c?.productCode,
    productId: c?.productId,
    categorySlug: c?.categorySlug,
    linkUrl,
  });
  const legacyFocusX = s?.focusX ?? 50;
  const legacyFocusY = s?.focusY ?? 50;
  const desktopFocusX = s?.desktopFocusX ?? legacyFocusX;
  const desktopFocusY = s?.desktopFocusY ?? legacyFocusY;
  const mobileFocusX = s?.mobileFocusX ?? legacyFocusX;
  const mobileFocusY = s?.mobileFocusY ?? legacyFocusY;
  // 沉浸式画册：桌面支持左下叙事束，移动端由共享布局恢复为图下文案。
  // 链路修复:编辑器字段为 alignment(旧数据为 template),统一兼容读取
  const rawAlign = l?.alignment || l?.template || "center";
  const alignment = rawAlign === "left" ? "left" : "center";
  const hasConfiguredImage = Boolean(desktopImg || mobileImg);
  const useNeutralMediaFallback = Boolean(editMode && (!hasConfiguredImage || imageFailed));
  const textTone = useNeutralMediaFallback ? "dark" : "light";
  const heroStyle = {
    background: "#F7F8F8",
    outline: editMode ? "2px solid rgba(24,26,27,0.48)" : undefined,
    outlineOffset: -2,
    position: "relative",
    "--hc-hero-focus-desktop": `${desktopFocusX}% ${desktopFocusY}%`,
    "--hc-hero-focus-mobile": `${mobileFocusX}% ${mobileFocusY}%`,
    ...templateLayoutVars(CONTENT_TEMPLATE_LAYOUTS.hero),
  } as CSSProperties &
    Record<"--hc-hero-focus-desktop" | "--hc-hero-focus-mobile", string>;

  return (
    <section
      className={`hc-content-template hc-phase1-hero${editMode ? " hc-phase1-hero--edit" : ""} relative w-full overflow-hidden hc-section`}
      data-content-template={CONTENT_TEMPLATE_LAYOUTS.hero.key}
      data-visual-role={CONTENT_TEMPLATE_LAYOUTS.hero.visualRole}
      data-height-mode-desktop={
        CONTENT_TEMPLATE_LAYOUTS.hero.heightModeByViewport.desktop
      }
      data-height-mode-mobile={
        CONTENT_TEMPLATE_LAYOUTS.hero.heightModeByViewport.mobile
      }
      data-mobile-order={CONTENT_TEMPLATE_LAYOUTS.hero.mobile.order.join(",")}
      data-flow={CONTENT_TEMPLATE_LAYOUTS.hero.flow}
      data-density="brand"
      data-spacing="normal"
      data-visual-direction="immersive-editorial"
      style={heroStyle}
    >
      <DesignSystemStyles />
      <ContentTemplateLayoutStyles />
      <div
        className="hc-content-template__media hc-phase1-hero__media"
        data-content-role-desktop="desktopImage"
        data-content-role-mobile="mobileImage"
      >
        {desktopImg && !imageFailed ? (
          <picture data-editor-field="desktopImage mobileImage">
            <source
              media={RESPONSIVE_CANVAS.mobileMediaQuery}
              srcSet={mobileImg}
            />
            <img
              src={desktopImg}
              alt={c?.altText || title}
              loading="eager"
              decoding="async"
              onLoad={(event) => {
                const renderable = hasRenderableImageDimensions(event.currentTarget);
                setFailedImageSourceKey(renderable ? null : imageSourceKey);
              }}
              onError={() => {
                setFailedImageSourceKey(imageSourceKey);
              }}
              width={3360}
              height={1470}
              className="hc-hero__image absolute inset-0 h-full w-full object-cover"
              style={{
                opacity: imageFailed ? 0 : 1,
              }}
            />
          </picture>
        ) : !desktopImg || (imageFailed && editMode) ? (
          <BlockEmptyPlaceholder
            assetSlots={[
              { templateKey: "hero", roleId: "desktopImage" },
              { templateKey: "hero", roleId: "mobileImage" },
            ]}
            hint={CONTENT_TEMPLATE_LAYOUTS.hero.displayName}
            spec={IMAGE_SPECS.hero.desktop.label}
            tone="neutral"
            height="100%"
          />
        ) : null}
        {imageFailed && !editMode ? (
          <div
            className="absolute inset-0 grid place-items-center text-xs tracking-[.08em]"
            role="img"
            aria-label={c?.altText || "主视觉图片暂不可用"}
            style={{ color: "#DDE1E2", background: "#181A1B" }}
          >
            主视觉图片暂不可用
          </div>
        ) : null}
      </div>

      {!useNeutralMediaFallback && (title || subtitle || (actionText && targetUrl) || editMode) ? (
        <div
          aria-hidden="true"
          className="hc-phase1-hero__copy-shade"
          data-align={alignment}
        />
      ) : null}

      {/* 桌面位于图片安全区；平板和手机由共享布局移到图片下方。 */}
      {title || subtitle || (actionText && targetUrl) || editMode ? (
        <div className="hc-phase1-hero__copy-band">
          <div
            className="hc-content-template__copy hc-phase1-hero__copy"
            data-content-role="copy"
            data-align={alignment}
            data-tone={textTone}
          >
            {eyebrow || editMode ? (
              <p
                data-editor-field="eyebrow"
                data-hc-editor-placeholder={!eyebrow && editMode ? "true" : undefined}
                className={`hc-content-template__eyebrow hc-hero__reveal${!eyebrow && editMode ? " hc-visual-empty-role" : ""}`}
                style={{
                  fontFamily: `var(--hc-font-sans, ${FONT_SANS})`,
                  opacity: 1,
                  transform: "none",
                  animation: rm
                    ? "none"
                    : "hcHeroFadeUp 0.7s 0.3s cubic-bezier(0.22,1,0.36,1) both",
                }}
              >
                {eyebrow || "点击添加眉题"}
              </p>
            ) : null}
            {title || editMode ? (
              <Heading
                data-editor-field="title"
                data-hc-editor-placeholder={!title && editMode ? "true" : undefined}
                className={`hc-content-template__title hc-hero__reveal whitespace-pre-line${!title && editMode ? " hc-visual-empty-role" : ""}`}
                style={{
                  fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
                  fontSize: "var(--hc-hero-title-size, clamp(42px, 4.4vw, 76px))",
                  opacity: 1,
                  transform: "none",
                  animation: rm
                    ? "none"
                    : "hcHeroFadeUp 0.7s 0.28s cubic-bezier(0.22,1,0.36,1) both",
                }}
              >
                {title || "点击添加主标题"}
              </Heading>
            ) : null}
            {subtitle || editMode ? (
              <p
                data-editor-field="subtitle"
                data-hc-editor-placeholder={!subtitle && editMode ? "true" : undefined}
                className={`hc-content-template__body hc-hero__reveal${!subtitle && editMode ? " hc-visual-empty-role" : ""}`}
                style={{
                  fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
                  fontStyle: "italic",
                  opacity: 1,
                  transform: "none",
                  animation: rm
                    ? "none"
                    : "hcHeroFadeUp 0.7s 0.34s cubic-bezier(0.22,1,0.36,1) both",
                }}
              >
                {subtitle || "点击添加副标题"}
              </p>
            ) : null}
            {editMode ? (
              <span
                data-content-role="action"
                data-editor-field="actionText"
                data-hc-editor-placeholder={!actionText ? "true" : undefined}
                className={`hc-content-template__action${!actionText ? " hc-visual-empty-role" : ""}`}
                style={{
                  fontFamily: `var(--hc-font-sans, ${FONT_SANS})`,
                }}
              >
                {actionText || "点击添加行动文字"} <span>→</span>
              </span>
            ) : actionText && targetUrl ? (
              <Link
                data-content-role="action"
                data-editor-field="actionText linkUrl productId"
                to={targetUrl}
                className="hc-content-template__action hc-hero__reveal transition-opacity duration-300 hover:opacity-60"
                style={{
                  fontFamily: `var(--hc-font-sans, ${FONT_SANS})`,
                  opacity: 1,
                  transform: "none",
                  animation: rm
                    ? "none"
                    : "hcHeroFadeUp 0.7s 0.38s cubic-bezier(0.22,1,0.36,1) both",
                }}
              >
                {actionText} <span>→</span>
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
      {/* 静态下滑线：保留方向提示，不用持续动画干扰珠宝影像。 */}
      {desktopImg ? (
        <span
          aria-hidden="true"
          className="absolute bottom-[22px] left-1/2 -translate-x-1/2 w-8 h-px opacity-40"
          style={{ background: "rgba(255,255,255,0.5)" }}
        />
      ) : null}
      <style>{`
        @keyframes hcHeroFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hc-hero__image { object-position: var(--hc-hero-focus-desktop); }
        .hc-phase1-hero__copy-band {
          z-index: 3;
        }
        .hc-phase1-hero__copy-shade {
          position: absolute;
          inset: 0;
          z-index: 2;
          pointer-events: none;
          background: linear-gradient(90deg, rgba(16, 18, 19, 0.58) 0%, rgba(16, 18, 19, 0.26) 38%, rgba(16, 18, 19, 0) 68%);
        }
        .hc-phase1-hero__copy-shade[data-align="center"] {
          background: linear-gradient(0deg, rgba(16, 18, 19, 0.54) 0%, rgba(16, 18, 19, 0.12) 38%, rgba(16, 18, 19, 0) 68%);
        }
        .hc-phase1-hero__copy[data-tone="dark"] {
          color: #181A1B;
          text-shadow: none;
        }
        .hc-phase1-hero__copy[data-tone="dark"] .hc-content-template__title,
        .hc-phase1-hero__copy[data-tone="dark"] .hc-content-template__action {
          color: #181A1B;
        }
        .hc-phase1-hero__copy[data-tone="dark"] .hc-content-template__body,
        .hc-phase1-hero__copy[data-tone="dark"] .hc-content-template__eyebrow {
          color: #5F6568;
        }
        .hc-phase1-hero__copy[data-tone="dark"] .hc-content-template__action {
          border-color: #181A1B;
        }
        .hc-phase1-hero__copy[data-tone="dark"] .hc-content-template__action:focus-visible {
          outline-color: #181A1B;
        }
        .hc-phase1-hero--edit .hc-phase1-hero__copy-band {
          pointer-events: auto;
        }
        .hc-visual-empty-role {
          display: block;
          width: fit-content;
          max-width: min(100%, 18rem);
          min-width: 0;
          min-height: 0;
          margin-block: 0 8px;
          border: 1px dashed currentColor;
          padding: 6px 10px;
          font-family: var(--hc-font-sans, ${FONT_SANS}) !important;
          font-size: 14px !important;
          font-style: normal !important;
          font-weight: 500 !important;
          line-height: 20px !important;
          letter-spacing: 0 !important;
          white-space: nowrap;
          opacity: 0.9;
          cursor: pointer;
        }
        .hc-content-template__action.hc-visual-empty-role {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        @media ${RESPONSIVE_CANVAS.mobileMediaQuery} {
          .hc-hero__image { object-position: var(--hc-hero-focus-mobile); }
        }
        @media (max-width: 1023px) {
          .hc-phase1-hero__copy-shade { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hc-hero__reveal {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </section>
  );
}
