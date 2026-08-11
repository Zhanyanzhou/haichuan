import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";

interface VideoBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
}

/**
 * 视频模块 — 对标旺铺"单视频"
 * content: { videoUrl, posterUrl, autoPlay, loop, muted, showControls, aspectRatio }
 * layoutConfig: { maxHeight }
 */
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
  const maxHeight = layoutConfig.maxHeight || 720;

  if (!videoUrl) {
    if (!editMode) return null;
    return (
      <BlockEmptyPlaceholder
        icon="🎬"
        hint="视频模块"
        spec="请在右侧设置视频 URL"
      />
    );
  }

  const ratioMap: Record<string, string> = {
    "16:9": "56.25%",
    "4:3": "75%",
    "9:16": "177.78%",
  };

  return (
    <section
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "clamp(40px,5vh,80px) clamp(20px,4vw,60px)",
      }}
    >
      <div
        style={{
          position: "relative",
          paddingBottom: ratioMap[aspectRatio || "16:9"],
          maxHeight,
          overflow: "hidden",
          background: "#0F0D0C",
          borderRadius: 4,
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
    </section>
  );
}
