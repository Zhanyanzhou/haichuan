/**
 * fullBleed.puck.ts — FullBleedBlock 的 Puck 适配器
 */

import FullBleedBlock from "@/components/blocks/FullBleedBlock";
import type { LinkTargetType } from "@/page-builder/utils/linkTarget";
import { convertPuckProps } from "../utils/puckPropsToModule";
import {
  createContentTemplateMarker,
  type ContentTemplateMarker,
} from "../generated/contentTemplates.generated";

export type FullBleedOverlayPreset = "none" | "soft" | "strong";

export interface FullBleedPuckProps {
  image: string;
  mobileImage: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  buttonText: string;
  linkUrl: string;
  targetType: LinkTargetType;
  productId: number;
  template: string;
  overlayPreset: FullBleedOverlayPreset;
  altText: string;
  desktopFocusX: number;
  desktopFocusY: number;
  mobileFocusX: number;
  mobileFocusY: number;
  /** 系统保留：区块级内容模板合同印记，不在 Inspector 中展示。 */
  __contentTemplate?: ContentTemplateMarker;
  locked?: boolean;
}

export const fullBleedPuckConfig = {
  render: (props: FullBleedPuckProps) => (
    <FullBleedBlock module={convertPuckProps("全屏出血图", props)!} editMode />
  ),
  defaultProps: {
    image: "",
    mobileImage: "",
    eyebrow: "",
    title: "",
    subtitle: "",
    buttonText: "",
    linkUrl: "",
    targetType: "none",
    productId: 0,
    template: "captionBelow",
    overlayPreset: "none",
    altText: "",
    desktopFocusX: 50,
    desktopFocusY: 50,
    mobileFocusX: 50,
    mobileFocusY: 50,
    __contentTemplate: createContentTemplateMarker("全屏出血图"),
    locked: false,
  } satisfies FullBleedPuckProps,
  resolvePermissions: (data: { props?: FullBleedPuckProps }) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
