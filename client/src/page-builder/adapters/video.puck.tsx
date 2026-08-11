/** video.puck.ts — VideoBlock 的 Puck 适配器 */
import VideoBlock from "@/components/blocks/VideoBlock";
import { IMAGE_SPECS } from "../config/imageSpecs";
import { convertPuckProps } from "../utils/puckPropsToModule";
import MediaPickerField from "../fields/MediaPickerField";

export interface VideoPuckProps {
  videoUrl: string;
  posterUrl: string;
  autoPlay: boolean;
  loop: boolean;
  muted: boolean;
  showControls: boolean;
  aspectRatio: string;
  maxHeight: number;
  locked?: boolean;
}

export const videoPuckConfig = {
  label: "单视频",
  render: (props: VideoPuckProps) => (
    <VideoBlock module={convertPuckProps("视频区块", props as any) as any} />
  ),
  defaultProps: {
    videoUrl: "",
    posterUrl: "",
    autoPlay: false,
    loop: true,
    muted: true,
    showControls: true,
    aspectRatio: "16:9",
    maxHeight: 720,
    locked: false,
  } satisfies VideoPuckProps,
  fields: {
    videoUrl: { type: "text" as const, label: "视频 URL" },
    posterUrl: {
      type: "custom" as const,
      label: "封面图",
      render: ({
        value, onChange, readOnly,
      }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
        <MediaPickerField fieldKey="posterUrl" device="shared" value={value} onChange={onChange} readOnly={readOnly}
          spec={IMAGE_SPECS.video.poster} placeholder="上传视频封面图" />
      ),
    },
    autoPlay: {
      type: "radio" as const,
      label: "自动播放",
      options: [
        { label: "开启", value: true },
        { label: "关闭", value: false },
      ],
    },
    loop: {
      type: "radio" as const,
      label: "循环播放",
      options: [
        { label: "开启", value: true },
        { label: "关闭", value: false },
      ],
    },
    muted: {
      type: "radio" as const,
      label: "静音",
      options: [
        { label: "开启", value: true },
        { label: "关闭", value: false },
      ],
    },
    showControls: {
      type: "radio" as const,
      label: "播放控件",
      options: [
        { label: "显示", value: true },
        { label: "隐藏", value: false },
      ],
    },
    aspectRatio: {
      type: "radio" as const,
      label: "画面比例",
      options: [
        { label: "16:9 横屏", value: "16:9" },
        { label: "4:3 经典", value: "4:3" },
        { label: "9:16 竖屏", value: "9:16" },
      ],
    },
    maxHeight: {
      type: "number" as const,
      label: "最大高度(px)",
      min: 300,
      max: 1080,
    },
  },
};
