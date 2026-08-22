import { useState } from "react";
import { Link } from "react-router-dom";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS, type WidthToken } from "@/page-builder/designSystem/tokens";
import { resolveContractAspectRatio } from "@/page-builder/config/blockContracts";
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
 * 画面比例仅允许合同规范比例:16:9(宽屏) / 21:6(宽幕);移动端另有 4:5、9:16。
 * 历史数据中的 16:7、3:4、21:9、4:3 仍可渲染，但新建不可再选；
 * 9:16 是仅移动端合法预设，桌面自动回退 16:9。
 * content: { videoUrl, posterUrl, autoPlay, loop, muted, showControls, aspectRatio, focusX, focusY }
 */
const RATIO_MAP: Record<string, string> = {
  "16:9": "16 / 9",
  "21:9": "21 / 9",
  "9:16": "9 / 16",
  "4:3": "4 / 3",
  // 旧数据兼容：已保存的退役比例继续按原比例渲染
  "16:7": "16 / 7",
  "3:4": "3 / 4",
  "21:6": "21 / 6",
};
const LEGACY_RATIOS = new Set(["16 / 7", "3 / 4", "21 / 9", "4 / 3"]);

export default function VideoBlock({ module, editMode }: VideoBlockProps) {
  const { content = {}, layoutConfig = {}, styleConfig = {} } = module;
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
  const videoWidth = (layoutConfig.videoWidth || "standard") as WidthToken;
  const bgColor = styleConfig.bgColor || "#FFFFFF";
  const requestedRatio = RATIO_MAP[aspectRatio] ?? "";
  // 历史比例原样渲染;规范比例经契约白名单校验,越界值回退契约默认
  const desktopRatio = LEGACY_RATIOS.has(requestedRatio)
    ? requestedRatio
    : resolveContractAspectRatio("video", "coverImage", aspectRatio, "desktop");
  const mobileRatio =
    requestedRatio === "3 / 4"
      ? "3 / 4"
      : resolveContractAspectRatio("video", "coverImage", aspectRatio, "mobile");

  const targetUrl = resolveLinkTargetUrl({ targetType, productCode: content.productCode, productId, linkUrl });
  const showCopy = Boolean(title || subtitle || (actionText && targetUrl));
  // 封面图焦点（0-100）：poster 作为 video 属性无法设置 objectPosition，
  // 改为独立封面层渲染，才能让「裁切与焦点」真正作用于封面图。
  const coverFocusX = Math.min(100, Math.max(0, Number(focusX ?? 50)));
  const coverFocusY = Math.min(100, Math.max(0, Number(focusY ?? 50)));
  const [playing, setPlaying] = useState(false);

  if (!videoUrl) {
    if (!editMode) return null;
    return <div className="hc-video-frame is-empty" data-content-role="coverImage" style={{ background: bgColor }}>
      <style>{`
        .hc-video-frame { aspect-ratio: ${desktopRatio}; }
        @media (max-width: 767px) { .hc-video-frame { aspect-ratio: ${mobileRatio}; } }
      `}</style>
      <BlockEmptyPlaceholder
        assetSlot={{ templateKey: "video", roleId: "coverImage" }}
        hint="品牌影片"
        spec={`请设置视频地址 · ${IMAGE_SPECS.video.poster.label}`}
        height="100%"
      />
    </div>;
  }

  return (
    <DecorSection master="cinematic-hero" width={videoWidth} flow={videoWidth === "full" ? "bleed" : "flow"} background={bgColor}>
      <div
        className="hc-video-frame"
        data-content-role="coverImage"
        style={{
          position: "relative",
          // 铺满(full)时放开最大高度,让画面按比例通栏撑满;其余宽度档保留 maxHeight 防超宽屏撑高
          maxHeight: videoWidth === "full" ? undefined : maxHeight,
          width: "100%",
          overflow: "hidden",
          background: bgColor,
        }}
      >
        <style>{`
          .hc-video-frame { aspect-ratio: ${desktopRatio}; }
          /* maxHeight 只为防桌面超宽屏撑高;移动端放开(inline style 优先,须 !important),
             让 9:16 全屏竖版完整呈现 */
          @media (max-width: 767px) {
            .hc-video-frame { aspect-ratio: ${mobileRatio}; max-height: none !important; }
          }
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
              color: #181A1B;
              text-shadow: none;
            }
            .hc-video__copy p { color: #6E7477; }
            .hc-video__copy .hc-video__action { color: #181A1B; }
          }
        `}</style>
        <video
          data-content-role="playControl"
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
                <span data-content-role="action" className="hc-video__action" data-editor-field="actionText linkUrl productId">
                  {actionText} <span>→</span>
                </span>
              ) : (
                <Link
                  data-content-role="action"
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
