/** video.puck.ts — VideoBlock 的 Puck 适配器 */
import VideoBlock from "@/components/blocks/VideoBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";
import type { LinkTargetType } from "../utils/linkTarget";

export interface VideoPuckProps {
  videoUrl: string;
  posterUrl: string;
  title: string;
  subtitle: string;
  actionText: string;
  linkUrl: string;
  targetType: LinkTargetType;
  productId: number;
  autoPlay: boolean;
  loop: boolean;
  muted: boolean;
  showControls: boolean;
  aspectRatio: string;
  maxHeight: number;
  videoWidth: string;
  bgColor: string;
  focusX: number;
  focusY: number;
  locked?: boolean;
}

export const videoPuckConfig = {
  label: "单视频",
  render: (props: VideoPuckProps) => (
    <VideoBlock module={convertPuckProps("视频区块", props)!} />
  ),
  defaultProps: {
    videoUrl: "",
    posterUrl: "",
    title: "",
    subtitle: "",
    actionText: "",
    linkUrl: "",
    targetType: "none",
    productId: 0,
    autoPlay: false,
    loop: true,
    muted: true,
    showControls: true,
    aspectRatio: "16:9",
    maxHeight: 720,
    videoWidth: "standard",
    bgColor: "#FFFFFF",
    focusX: 50,
    focusY: 50,
    locked: false,
  } satisfies VideoPuckProps,
  resolvePermissions: (data: { props?: VideoPuckProps }) =>
    data.props?.locked ? { delete: false, drag: false } : {},
};
