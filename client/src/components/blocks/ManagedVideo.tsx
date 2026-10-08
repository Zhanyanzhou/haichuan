import { resolveMediaSlotVideo, type MediaSlotContract } from "@/page-builder/config/mediaSlotContract";

export interface ManagedVideoProps {
  /** 视频源（/uploads 受控素材或外链）；公开态无源不渲染，编辑态渲染空占位。 */
  src?: string;
  /** 媒体槽契约：ratio/viewport/referenceWidth + poster/preload/autoplay/loop。 */
  contract: MediaSlotContract;
  /** 无障碍替代文本。 */
  ariaLabel?: string;
  className?: string;
  editMode?: boolean;
}

/**
 * 公开视频块 —— 奢侈品牌视频运行时：点播（不自动播放）、preload=none、
 * poster 首帧走 /uploads 响应式派生（单 URL）、固有 width/height 保证零 CLS。
 * 运行时属性由 resolveMediaSlotVideo 统一派生，调用方只声明契约，不手写这些属性。
 */
export default function ManagedVideo({
  src,
  contract,
  ariaLabel,
  className,
  editMode = false,
}: ManagedVideoProps) {
  const media = resolveMediaSlotVideo(contract, src);
  const source = typeof media.src === "string" ? media.src.trim() : "";

  if (!source) {
    if (!editMode) return null;
    return (
      <div
        role="status"
        aria-label={ariaLabel ?? "视频槽位待上传"}
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 320,
          aspectRatio: media.aspectRatio,
          border: "1px dashed #DDE1E2",
          color: "#5F6568",
          fontSize: 14,
          letterSpacing: "0.08em",
          boxSizing: "border-box",
        }}
      >
        视频首帧待上传
      </div>
    );
  }

  return (
    <video
      className={className}
      src={source}
      poster={media.poster}
      preload={media.preload}
      autoPlay={media.autoPlay}
      loop={media.loop}
      muted={media.muted}
      playsInline={media.playsInline}
      controls={media.controls}
      width={media.width}
      height={media.height}
      aria-label={ariaLabel}
      style={media.aspectRatio ? { aspectRatio: media.aspectRatio } : undefined}
    />
  );
}
