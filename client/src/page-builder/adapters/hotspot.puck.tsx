/** hotspot.puck.ts — HotspotBlock 的 Puck 适配器 */
import HotspotBlock from "@/components/blocks/HotspotBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";

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
  mobileHotspots: HotspotItem[];
  locked?: boolean;
}

export const hotspotPuckConfig = {
  label: "热区图",
  render: (props: HotspotPuckProps) => (
    <HotspotBlock module={convertPuckProps("热区图", props as any) as any} editMode />
  ),
  defaultProps: {
    image: "",
    mobileImage: "",
    hotspots: [],
    mobileHotspots: [],
    locked: false,
  } satisfies HotspotPuckProps,
  resolvePermissions: (data: any) =>
    data.props?.locked ? { delete: false, drag: false } : {},
};
