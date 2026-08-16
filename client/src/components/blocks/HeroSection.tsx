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

const LT = "#F1ECE3";

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
  if (!c?.desktopImage && !c?.mobileImage) {
    if (!editMode) return null;
    return (
      <BlockEmptyPlaceholder
        icon="🖼️"
        hint="首屏主视觉"
        spec={`请上传桌面端主视觉图 · ${IMAGE_SPECS.hero.desktop.label}`}
        height="var(--homepage-editor-viewport-height, 900px)"
      />
    );
  }

  // 未上传某一端时复用另一端已配置图片，不再引入活动素材兜底。
  const desktopImg = c.desktopImage || c.mobileImage;
  const mobileImg = c.mobileImage || c.desktopImage;
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
    height: editMode
      ? "var(--homepage-editor-viewport-height, 900px)"
      : "100svh",
    minHeight: editMode ? undefined : "680px",
    background: "#E7DDCE",
    outline: editMode ? "2px solid rgba(184,148,78,0.6)" : undefined,
    outlineOffset: -2,
    position: "relative",
    "--hc-hero-focus-desktop": `${desktopFocusX}% ${desktopFocusY}%`,
    "--hc-hero-focus-mobile": `${mobileFocusX}% ${mobileFocusY}%`,
  } as CSSProperties &
    Record<"--hc-hero-focus-desktop" | "--hc-hero-focus-mobile", string>;

  return (
    <section
      className="relative w-full overflow-hidden hc-section"
      data-flow="bleed"
      data-density="brand"
      style={heroStyle}
    >
      <DesignSystemStyles />
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
          可编辑 · Hero
        </div>
      )}
      <picture data-editor-field="desktopImage mobileImage">
        <source media={RESPONSIVE_CANVAS.mobileMediaQuery} srcSet={mobileImg} />
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
          width={3840}
          height={2160}
          className="hc-hero__image absolute inset-0 w-full h-full object-cover"
          style={{
            opacity: imageLoaded && !imageFailed ? 1 : 0,
            transition: rm ? "none" : "opacity 240ms ease-out",
          }}
        />
      </picture>
      {imageFailed ? (
        <div
          className="absolute inset-0 grid place-items-center text-xs tracking-[.08em]"
          role="img"
          aria-label={c?.altText || "主视觉图片暂不可用"}
          style={{
            color: "#7E7468",
            background: "linear-gradient(135deg,#EDE6DC,#D9CDBD)",
          }}
        >
          主视觉图片暂不可用
        </div>
      ) : null}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, rgba(15,13,12,0.32), rgba(15,13,12,0.02) 44%, rgba(15,13,12,0.06))",
        }}
      />
      {/* 顶部安全区渐变 */}
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none"
        style={{
          height: "140px",
          background:
            "linear-gradient(to bottom, rgba(246,243,237,0.22) 0%, rgba(246,243,237,0.08) 52%, rgba(246,243,237,0) 100%)",
        }}
      />

      {/* 左下文案 */}
      <div
        className="absolute bottom-[clamp(38px,7vh,76px)] z-10"
        style={{
          maxWidth: "520px",
          left: alignment === "center" ? "50%" : "clamp(28px,4.2vw,72px)",
          transform: alignment === "center" ? "translateX(-50%)" : undefined,
          textAlign: alignment,
        }}
      >
        {subtitle ? (
        <p
          data-editor-field="subtitle"
          className="hc-hero__reveal text-[10px] md:text-[11px] tracking-[.2em] uppercase mb-4 font-sans"
          style={{
            color: "rgba(255,255,255,0.6)",
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
          className="hc-hero__reveal leading-[1.1] tracking-[.02em] mb-6 whitespace-pre-line"
          style={{
            fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
            fontSize: "var(--hc-type-hero, clamp(40px,5vw,68px))",
            color: LT,
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
              className="inline-flex items-center gap-2 text-[10px] md:text-[11px] tracking-[.14em] uppercase"
              style={{
                color: "rgba(255,255,255,0.7)",
                fontFamily: `var(--hc-font-sans, ${FONT_SANS})`,
              }}
            >
              {actionText} <span>→</span>
            </span>
          ) : (
            <Link
              data-editor-field="actionText linkUrl productId"
              to={targetUrl}
              className="hc-hero__reveal inline-flex items-center gap-2 text-[10px] md:text-[11px] tracking-[.14em] uppercase transition-opacity duration-300 hover:opacity-60"
              style={{
                color: "rgba(255,255,255,0.7)",
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
      {/* 底部下滑线：编辑预览中静态化，避免持续 pulse 动画拖慢画布滚动 */}
      <span
        className={`absolute bottom-[22px] left-1/2 -translate-x-1/2 w-8 h-px ${editMode ? "" : "animate-pulse"} opacity-40`}
        style={{ background: "rgba(255,255,255,0.5)" }}
      />
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
