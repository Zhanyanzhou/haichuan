import { useEffect, useState, type CSSProperties } from "react";
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

interface Props {
  module?: PageModule;
  editMode?: boolean;
}

/**
 * Hero 模块 — 全屏首屏主视觉
 */
export default function HeroSection({ module, editMode }: Props) {
  const rm = useReducedMotion();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const c = module?.content as
    (PageModule["content"] & Record<string, any>) | undefined;
  const s = module?.styleConfig as
    (PageModule["styleConfig"] & Record<string, any>) | undefined;
  const l = module?.layoutConfig;

  useEffect(() => {
    setImageLoaded(false);
    setImageFailed(false);
  }, [c?.desktopImage, c?.mobileImage]);

  // 已配置的装修区块没有素材时，不能回退到活动默认图，避免前台或画布闪出陌生图片。
  if (!c?.desktopImage && !c?.mobileImage && !editMode) return null;

  // 未上传某一端时复用另一端已配置图片，不再引入活动素材兜底。
  const desktopImg = c?.desktopImage || c?.mobileImage || "";
  const mobileImg = c?.mobileImage || c?.desktopImage || "";
  // 文案不再回退营销默认值:未填写即为空,公开态对应节点不渲染(编辑态有占位引导)
  const title = typeof c?.title === "string" ? c.title : "";
  const subtitle = typeof c?.subtitle === "string" ? c.subtitle : "";
  const actionText = typeof c?.actionText === "string" ? c.actionText : "";
  const linkUrl = typeof c?.linkUrl === "string" ? c.linkUrl : "";
  const targetUrl = resolveLinkTargetUrl({
    targetType: c?.targetType,
    productId: c?.productId,
    linkUrl,
  });
  const legacyFocusX = s?.focusX ?? 50;
  const legacyFocusY = s?.focusY ?? 50;
  const desktopFocusX = s?.desktopFocusX ?? legacyFocusX;
  const desktopFocusY = s?.desktopFocusY ?? legacyFocusY;
  const mobileFocusX = s?.mobileFocusX ?? legacyFocusX;
  const mobileFocusY = s?.mobileFocusY ?? legacyFocusY;
  const alignment = l?.template === "center" ? "center" : "left";
  const heroStyle = {
    background: "#E4E3DF",
    outline: editMode ? "2px solid rgba(184,148,78,0.6)" : undefined,
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
      data-height-mode-tablet={
        CONTENT_TEMPLATE_LAYOUTS.hero.heightModeByViewport.tablet
      }
      data-height-mode-mobile={
        CONTENT_TEMPLATE_LAYOUTS.hero.heightModeByViewport.mobile
      }
      data-mobile-order={CONTENT_TEMPLATE_LAYOUTS.hero.mobile.order.join(",")}
      data-flow={CONTENT_TEMPLATE_LAYOUTS.hero.flow}
      data-density="brand"
      data-spacing="normal"
      style={heroStyle}
    >
      <DesignSystemStyles />
      <ContentTemplateLayoutStyles />
      {editMode && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 12,
            zIndex: 10,
            background: "#B8944E",
            color: "#fff",
            fontSize: 10,
            padding: "2px 8px",
            letterSpacing: "0.04em",
          }}
        >
          可编辑 · 首屏
        </div>
      )}
      <div className="hc-content-template__media hc-phase1-hero__media">
        {desktopImg ? (
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
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                setImageFailed(true);
                setImageLoaded(true);
              }}
              width={3360}
              height={1470}
              className="hc-hero__image absolute inset-0 h-full w-full object-cover"
              style={{
                opacity: imageLoaded && !imageFailed ? 1 : 0,
                transition: rm ? "none" : "opacity 240ms ease-out",
              }}
            />
          </picture>
        ) : (
          <BlockEmptyPlaceholder
            hint={CONTENT_TEMPLATE_LAYOUTS.hero.displayName}
            spec={IMAGE_SPECS.hero.desktop.label}
            height="100%"
          />
        )}
        {imageFailed ? (
          <div
            className="absolute inset-0 grid place-items-center text-xs tracking-[.08em]"
            role="img"
            aria-label={c?.altText || "主视觉图片暂不可用"}
            style={{ color: "#7E7468", background: "#F5F5F5" }}
          >
            主视觉图片暂不可用
          </div>
        ) : null}
        {desktopImg ? (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(to top, rgba(15,13,12,0.32), rgba(15,13,12,0.02) 44%, rgba(15,13,12,0.06))",
            }}
          />
        ) : null}
      </div>

      {/* 桌面位于图片安全区；平板和手机由共享布局移到图片下方。 */}
      {title || subtitle || (actionText && targetUrl) || editMode ? (
        <div className="hc-phase1-hero__copy-band">
          <div
            className="hc-content-template__copy hc-phase1-hero__copy"
            data-align={alignment}
          >
            {subtitle ? (
              <p
                data-editor-field="subtitle"
                className="hc-content-template__eyebrow hc-hero__reveal"
                style={{
                  fontFamily: `var(--hc-font-sans, ${FONT_SANS})`,
                  opacity: 1,
                  transform: "none",
                  animation: rm
                    ? "none"
                    : "hcHeroFadeUp 0.7s 0.18s cubic-bezier(0.22,1,0.36,1) both",
                }}
              >
                {subtitle}
              </p>
            ) : null}
            {title ? (
              <h1
                data-editor-field="title"
                className="hc-content-template__title hc-hero__reveal whitespace-pre-line"
                style={{
                  fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
                  fontSize: "var(--hc-type-hero, clamp(40px,5vw,68px))",
                  opacity: 1,
                  transform: "none",
                  animation: rm
                    ? "none"
                    : "hcHeroFadeUp 0.7s 0.28s cubic-bezier(0.22,1,0.36,1) both",
                }}
              >
                {title}
              </h1>
            ) : null}
            {actionText && targetUrl ? (
              editMode ? (
                <span
                  data-editor-field="actionText linkUrl productId"
                  className="hc-content-template__action"
                  style={{
                    fontFamily: `var(--hc-font-sans, ${FONT_SANS})`,
                  }}
                >
                  {actionText} <span>→</span>
                </span>
              ) : (
                <Link
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
              )
            ) : null}
          </div>
        </div>
      ) : null}
      {/* 底部下滑线：编辑预览中静态化，避免持续 pulse 动画拖慢画布滚动 */}
      {desktopImg ? (
        <span
          className={`absolute bottom-[22px] left-1/2 -translate-x-1/2 w-8 h-px ${editMode ? "" : "animate-pulse"} opacity-40`}
          style={{ background: "rgba(255,255,255,0.5)" }}
        />
      ) : null}
      <style>{`
        @keyframes hcHeroFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hc-hero__image { object-position: var(--hc-hero-focus-desktop); }
        @media ${RESPONSIVE_CANVAS.mobileMediaQuery} {
          .hc-hero__image { object-position: var(--hc-hero-focus-mobile); }
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
