/** hotspot.puck.ts — HotspotBlock 的 Puck 适配器 */
import HotspotBlock from "@/components/blocks/HotspotBlock";

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

function toModule(props: HotspotPuckProps) {
  return {
    content: {
      image: props.image,
      mobileImage: props.mobileImage,
      hotspots: props.hotspots || [],
    },
    layoutConfig: {},
    styleConfig: {},
  };
}

export const hotspotPuckConfig = {
  label: "热区图",
  render: (props: HotspotPuckProps) => (
    <HotspotBlock module={toModule(props) as any} />
  ),
  defaultProps: {
    image: "",
    mobileImage: "",
    hotspots: [],
    locked: false,
  } satisfies HotspotPuckProps,
  fields: {
    image: { type: "text" as const, label: "背景图 URL" },
    mobileImage: { type: "text" as const, label: "移动端图 URL（可选）" },
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
