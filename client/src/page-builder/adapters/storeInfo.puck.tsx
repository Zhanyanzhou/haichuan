/**
 * storeInfo.puck.ts — 门店信息专属适配器（地址/营业/电话/地图分字段）
 */

import StoreInfoBlock from "@/components/blocks/StoreInfoBlock";
import { IMAGE_SPECS } from "../config/imageSpecs";
import { convertPuckProps } from "../utils/puckPropsToModule";
import MediaPickerField from "../fields/MediaPickerField";
import { colorPuckField } from "../fields/ColorField";

export interface StoreInfoPuckProps {
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
    storeName: "海川珠宝",
    address: "",
    hours: "",
    phone: "",
    mapUrl: "",
    image: "",
    bgColor: "#FBF9F6",
    locked: false,
  } satisfies StoreInfoPuckProps,
  fields: {
    storeName: { type: "text" as const, label: "门店名称" },
    address: { type: "text" as const, label: "地址" },
    hours: { type: "text" as const, label: "营业时间" },
    phone: { type: "text" as const, label: "联系电话" },
    mapUrl: { type: "text" as const, label: "地图链接（高德/百度地图链接，可选）" },
    image: {
      type: "custom" as const,
      label: "门店空间图",
      render: ({
        value, onChange, readOnly,
      }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
        <MediaPickerField fieldKey="image" device="shared" value={value} onChange={onChange} readOnly={readOnly}
          spec={IMAGE_SPECS.storeInfo.image} placeholder="上传门店空间图" />
      ),
    },
    bgColor: colorPuckField("背景色"),
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
