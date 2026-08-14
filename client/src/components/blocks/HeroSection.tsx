import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { homeCampaign } from "@/data/homeCampaign";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import type { PageModule } from "@/types/pageModule";
import { resolveLinkTargetUrl } from "@/page-builder/utils/linkTarget";
import { RESPONSIVE_CANVAS } from "@/page-builder/config/blockContracts";

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

  const defaults = homeCampaign.heroFilm;
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
        spec="请上传桌面端主视觉图 · 建议 1920×1080 (16:9)"
        height="var(--homepage-editor-viewport-height, 900px)"
      />
    );
  }

  // 未上传某一端时复用另一端已配置图片，不再引入活动素材兜底。
  const desktopImg = c.desktopImage || c.mobileImage;
  const mobileImg = c.mobileImage || c.desktopImage;
  const title = c?.title ?? defaults.title;
  const subtitle = c?.subtitle ?? defaults.eyebrow;
  const actionText = c?.actionText ?? defaults.action;
  const linkUrl = c?.linkUrl ?? defaults.href;
  const targetUrl = resolveLinkTargetUrl({
    targetType: c?.targetType,
    productId: c?.productId,
    linkUrl,
  });
  const legacyFocusX = s?.focusX ?? defaults.focusX;
  const legacyFocusY = s?.focusY ?? defaults.focusY;
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
    <section className="relative w-full overflow-hidden" style={heroStyle}>
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
        <p
          data-editor-field="subtitle"
          className="text-[10px] md:text-[11px] tracking-[.2em] uppercase mb-4 font-sans"
          style={{
            color: "rgba(255,255,255,0.6)",
            fontFamily: "Inter,system-ui,sans-serif",
            opacity: rm ? 1 : 0,
            transform: rm ? "none" : "translateY(12px)",
            animation: rm
              ? "none"
              : "fadeUp 0.7s 0.18s cubic-bezier(0.22,1,0.36,1) forwards",
          }}
        >
          {subtitle}
        </p>
        <h1
          data-editor-field="title"
          className="text-[clamp(40px,5vw,68px)] leading-[1.1] tracking-[.02em] mb-6 whitespace-pre-line"
          style={{
            fontFamily: '"Cormorant Garamond","Noto Serif SC",serif',
            color: LT,
            opacity: rm ? 1 : 0,
            transform: rm ? "none" : "translateY(12px)",
            animation: rm
              ? "none"
              : "fadeUp 0.7s 0.28s cubic-bezier(0.22,1,0.36,1) forwards",
          }}
        >
          {title}
        </h1>
        {actionText && targetUrl ? (
          editMode ? (
            <span
              data-editor-field="actionText linkUrl productId"
              className="inline-flex items-center gap-2 text-[10px] md:text-[11px] tracking-[.14em] uppercase"
              style={{
                color: "rgba(255,255,255,0.7)",
                fontFamily: "Inter,system-ui,sans-serif",
              }}
            >
              {actionText} <span>→</span>
            </span>
          ) : (
            <Link
              data-editor-field="actionText linkUrl productId"
              to={targetUrl}
              className="inline-flex items-center gap-2 text-[10px] md:text-[11px] tracking-[.14em] uppercase transition-opacity duration-300 hover:opacity-60"
              style={{
                color: "rgba(255,255,255,0.7)",
                fontFamily: "Inter,system-ui,sans-serif",
                opacity: rm ? 1 : 0,
                transform: rm ? "none" : "translateY(12px)",
                animation: rm
                  ? "none"
                  : "fadeUp 0.7s 0.38s cubic-bezier(0.22,1,0.36,1) forwards",
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
        .hc-hero__image { object-position: var(--hc-hero-focus-desktop); }
        @media ${RESPONSIVE_CANVAS.mobileMediaQuery} {
          .hc-hero__image { object-position: var(--hc-hero-focus-mobile); }
        }
      `}</style>
    </section>
  );
}
