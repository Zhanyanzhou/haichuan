import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { getContentTemplateContract } from "@/page-builder/generated/contentTemplates.generated";

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
        `}</style>
        <video
          src={videoUrl}
          poster={posterUrl || undefined}
          autoPlay={autoPlay}
          loop={loop}
          muted={muted || autoPlay}
          controls={showControls}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: `${Number(focusX ?? 50)}% ${Number(focusY ?? 50)}%`,
          }}
        />
      </div>
    </DecorSection>
  );
}
