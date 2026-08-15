import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { RATIOS } from "@/page-builder/designSystem/tokens";

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
 * content: { videoUrl, posterUrl, autoPlay, loop, muted, showControls, aspectRatio }
 */
const RATIO_MAP: Record<string, string> = {
  "16:9": RATIOS["16:9"],
  "16:7": RATIOS["16:7"],
  "3:4": RATIOS["3:4"],
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
  } = content;
  const maxHeight = layoutConfig.maxHeight || 760;
  const ratio = RATIO_MAP[aspectRatio] || RATIOS["16:9"];

  if (!videoUrl) {
    if (!editMode) return null;
    return (
      <BlockEmptyPlaceholder
        icon="🎬"
        hint="品牌影片"
        spec={`请设置视频地址 · ${IMAGE_SPECS.video.poster.label}`}
      />
    );
  }

  return (
    <DecorSection master="cinematic-hero" width="standard" flow="flow">
      <div
        style={{
          position: "relative",
          aspectRatio: ratio,
          maxHeight,
          width: "100%",
          overflow: "hidden",
          background: "#0F0D0C",
        }}
      >
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
          }}
        />
      </div>
    </DecorSection>
  );
}
