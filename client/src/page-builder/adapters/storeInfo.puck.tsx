/**
 * storeInfo.puck.ts — 门店信息专属适配器（地址/营业/电话/地图分字段）
 */

import StoreInfoBlock from "@/components/blocks/StoreInfoBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface StoreInfoPuckProps {
  useSiteSettings: boolean;
  storeName: string;
  address: string;
  hours: string;
  phone: string;
  mapUrl: string;
  image: string;
  bgColor: string;
  locked?: boolean;
}

export const storeInfoPuckConfig = {
  render: (props: StoreInfoPuckProps) => (
    <StoreInfoBlock module={convertPuckProps("门店信息", props as any) as any} editMode />
  ),
  defaultProps: {
    useSiteSettings: true,
    storeName: "海川珠宝",
    address: "",
    hours: "",
    phone: "",
    mapUrl: "",
    image: "",
    bgColor: "#FFFFFF",
    locked: false,
  } satisfies StoreInfoPuckProps,
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
