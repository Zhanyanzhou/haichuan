/** hotspot.puck.ts — HotspotBlock 的 Puck 适配器 */
import HotspotBlock from "@/components/blocks/HotspotBlock";
import { IMAGE_SPECS } from "../config/imageSpecs";
import { convertPuckProps } from "../utils/puckPropsToModule";
import MediaPickerField from "../fields/MediaPickerField";

interface HotspotItem {
  x: number;
  y: number;
  width: number;
  height: number;
  link: string;
  label?: string;
}

export interface HotspotPuckProps {
  image: string;
  mobileImage: string;
  hotspots: HotspotItem[];
  locked?: boolean;
}

export const hotspotPuckConfig = {
  label: "热区图",
  render: (props: HotspotPuckProps) => (
    <HotspotBlock module={convertPuckProps("热区图", props as any) as any} />
  ),
  defaultProps: {
    image: "",
    mobileImage: "",
    hotspots: [],
    locked: false,
  } satisfies HotspotPuckProps,
  fields: {
    image: {
      type: "custom" as const,
      label: "桌面端热区图",
      render: ({
        value, onChange, readOnly,
      }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
        <MediaPickerField value={value} onChange={onChange} readOnly={readOnly}
          spec={IMAGE_SPECS.hotspot.desktop} placeholder="上传桌面端热区图" />
      ),
    },
    mobileImage: {
      type: "custom" as const,
      label: "手机端热区图",
      render: ({
        value, onChange, readOnly,
      }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
        <MediaPickerField value={value} onChange={onChange} readOnly={readOnly}
          spec={IMAGE_SPECS.hotspot.mobile} placeholder="上传手机端热区图" />
      ),
    },
    hotspots: {
      type: "array" as const,
      label: "热区列表",
      getItemSummary: (item: any) =>
        item.label || `热区 (${item.x}%,${item.y}%)`,
      arrayFields: {
        label: { type: "text" as const, label: "标签（可选）" },
        x: { type: "number" as const, label: "左边距(%)", min: 0, max: 100 },
        y: { type: "number" as const, label: "上边距(%)", min: 0, max: 100 },
        width: { type: "number" as const, label: "宽度(%)", min: 1, max: 100 },
        height: { type: "number" as const, label: "高度(%)", min: 1, max: 100 },
        link: { type: "text" as const, label: "跳转链接" },
      },
    } as any,
  },
};
