/** 首屏测试模板唯一保留的视觉母版。新模板由用户从零定义。 */
import type { DensityMode, RatioToken, WidthToken } from "./tokens";

export type MasterId = "cinematic-hero";
export type DesignMode = DensityMode;

export interface MasterMediaSpec {
  desktopRatio?: RatioToken;
  mobileRatio?: RatioToken;
  independentMobileImage: boolean;
  dualFocus: boolean;
}

export interface MasterDefinition {
  id: MasterId;
  label: string;
  mode: DesignMode;
  purpose: string;
  width: WidthToken;
  flow: "bleed" | "flow";
  media: MasterMediaSpec;
  rules: string[];
}

export const MASTERS: Record<MasterId, MasterDefinition> = {
  "cinematic-hero": {
    id: "cinematic-hero",
    label: "电影首屏",
    mode: "brand",
    purpose: "页面第一印象：大面积影像、极少文字、至多一个行动入口。",
    width: "full",
    flow: "bleed",
    media: {
      desktopRatio: "16:9",
      mobileRatio: "4:5",
      independentMobileImage: true,
      dualFocus: true,
    },
    rules: [
      "视口高度以首屏体验为准，素材采用裁切驱动。",
      "文字不超过三行，行动入口不超过一个。",
      "桌面端与移动端可分别设置素材和焦点。",
    ],
  },
};
