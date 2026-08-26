/**
 * storeInfo.puck.ts — 门店信息专属适配器。
 * 门店事实统一来自 SiteSettings；PageDocument 只保存媒体与展示配置。
 */

import StoreInfoBlock from "@/components/blocks/StoreInfoBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface StoreInfoPuckProps {
  image: string;
  bgColor: string;
  locked?: boolean;
}

export const storeInfoPuckConfig = {
  render: (props: StoreInfoPuckProps) => (
    <StoreInfoBlock module={convertPuckProps("门店信息", props as any) as any} editMode />
  ),
  defaultProps: {
    image: "",
    bgColor: "#FFFFFF",
    locked: false,
  } satisfies StoreInfoPuckProps,
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
