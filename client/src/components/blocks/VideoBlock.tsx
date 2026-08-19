import { useState } from "react";
import { Link } from "react-router-dom";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import { getContentTemplateContract } from "@/page-builder/generated/contentTemplates.generated";
import { resolveLinkTargetUrl } from "@/page-builder/utils/linkTarget";

interface VideoBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
}

/**
 * 品牌影片模块 — Cinematic Hero 母版(视频变体)
 * 画面比例仅允许规范比例:16:9 / 16:7(宽幕) / 3:4(竖屏);
 * 旧数据中的 4:3、9:16 仍可渲染(历史兼容),但新建不可再选。
 * content: { videoUrl, posterUrl, autoPlay, loop, muted, showControls, aspectRatio, focusX, focusY }
 */
const RATIO_MAP: Record<string, string> = {
  "16:9": "16 / 9",
  "16:7": "16 / 7",
  "3:4": "3 / 4",
  // 旧数据兼容:已保存的 4:3 / 9:16 区块继续按原比例渲染
  "4:3": "4 / 3",
  "9:16": "9 / 16",
};

export default function VideoBlock({ module, editMode }: VideoBlockProps) {
  const { content = {}, layoutConfig = {} } = module;
  const {
    videoUrl,
    posterUrl,
    title,
    subtitle,
    actionText,
    linkUrl,
    targetType,
    productId,
    autoPlay,
    loop,
    muted,
    showControls,
    aspectRatio,
    focusX,
    focusY,
  } = content;
  const maxHeight = layoutConfig.maxHeight || 760;
  const contract = getContentTemplateContract("视频区块");
  const coverRole = contract?.roles.find((role) => role.id === "coverImage");
  const defaultDesktopRatio = coverRole?.defaultRatioByViewport?.desktop || "16 / 9";
  const allowedDesktopRatios = coverRole?.allowedRatioPresetsByViewport?.desktop || [defaultDesktopRatio];
  const requestedRatio = RATIO_MAP[aspectRatio];
  const desktopRatio = requestedRatio && allowedDesktopRatios.includes(requestedRatio)
    ? requestedRatio
    : defaultDesktopRatio;
  const mobileRatio = desktopRatio === "3 / 4"
    ? "3 / 4"
    : coverRole?.defaultRatioByViewport?.mobile || "4 / 5";

  const targetUrl = resolveLinkTargetUrl({ targetType, productId, linkUrl });
  const showCopy = Boolean(title || subtitle || (actionText && targetUrl));
  // 封面图焦点（0-100）：poster 作为 video 属性无法设置 objectPosition，
  // 改为独立封面层渲染，才能让「裁切与焦点」真正作用于封面图。
  const coverFocusX = Math.min(100, Math.max(0, Number(focusX ?? 50)));
  const coverFocusY = Math.min(100, Math.max(0, Number(focusY ?? 50)));
  const [playing, setPlaying] = useState(false);

  if (!videoUrl) {
    if (!editMode) return null;
    return <div className="hc-video-frame is-empty" data-content-role="coverImage">
      <style>{`
        .hc-video-frame { aspect-ratio: ${desktopRatio}; }
        @media (max-width: 767px) { .hc-video-frame { aspect-ratio: ${mobileRatio}; } }
      `}</style>
      <BlockEmptyPlaceholder hint="品牌影片" spec={`请设置视频地址 · ${IMAGE_SPECS.video.poster.label}`} height="100%" />
    </div>;
  }

  return (
    <DecorSection master="cinematic-hero" width="standard" flow="flow">
      <div
        className="hc-video-frame"
        data-content-role="coverImage"
        style={{
          position: "relative",
          maxHeight,
          width: "100%",
          overflow: "hidden",
          background: "#0F0D0C",
        }}
      >
        <style>{`
          .hc-video-frame { aspect-ratio: ${desktopRatio}; }
          @media (max-width: 767px) { .hc-video-frame { aspect-ratio: ${mobileRatio}; } }
          .hc-video__copy {
            position: absolute;
            inset: auto 0 0 0;
            z-index: 2;
            padding: clamp(24px, 4vw, 56px);
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
            color: #ffffff;
            text-shadow: 0 1px 24px rgba(0, 0, 0, 0.35);
          }
          .hc-video__copy h2 {
            margin: 0;
            color: inherit;
            font-family: var(--hc-font-display, ${FONT_DISPLAY});
            font-size: var(--hc-type-h2, clamp(26px, 3.2vw, 40px));
            font-weight: 500;
            line-height: 1.2;
          }
          .hc-video__copy p {
            margin: 0;
            color: rgba(255, 255, 255, 0.86);
            font-size: var(--hc-type-body, 14px);
            line-height: 1.8;
            max-width: 34em;
          }
          .hc-video__copy .hc-video__action {
            color: #ffffff;
            text-decoration: none;
            font-family: var(--hc-font-sans, ${FONT_SANS});
            font-size: 13px;
            letter-spacing: 0.04em;
          }
          @media (max-width: 767px) {
            .hc-video__copy {
              position: static;
              padding: 20px 0 0;
              gap: 10px;
              color: #1A1A1A;
              text-shadow: none;
            }
            .hc-video__copy p { color: #8C8C8C; }
            .hc-video__copy .hc-video__action { color: #1A1A1A; }
          }
        `}</style>
        <video
          src={videoUrl}
          autoPlay={autoPlay}
          loop={loop}
          muted={muted || autoPlay}
          controls={showControls}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 0,
          }}
        />
        {posterUrl && !playing ? (
          <div
            aria-hidden
            data-editor-field="posterUrl"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              backgroundImage: `url(${posterUrl})`,
              backgroundSize: "cover",
              backgroundPosition: `${coverFocusX}% ${coverFocusY}%`,
              pointerEvents: "none",
            }}
          />
        ) : null}
        {showCopy ? (
          <div className="hc-video__copy" data-content-role="copy">
            {title ? (
              <h2 data-editor-field="title">{title}</h2>
            ) : null}
            {subtitle ? (
              <p data-editor-field="subtitle">{subtitle}</p>
            ) : null}
            {actionText && targetUrl ? (
              editMode ? (
                <span className="hc-video__action" data-editor-field="actionText linkUrl productId">
                  {actionText} <span>→</span>
                </span>
              ) : (
                <Link
                  to={targetUrl}
                  className="hc-video__action transition-opacity duration-300 hover:opacity-70"
                  data-editor-field="actionText linkUrl productId"
                >
                  {actionText} <span>→</span>
                </Link>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </DecorSection>
  );
}
