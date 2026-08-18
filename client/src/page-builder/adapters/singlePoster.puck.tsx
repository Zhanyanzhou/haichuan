/**
 * singlePoster.puck.ts — SinglePosterSection 的 Puck 适配器
 */

import SinglePosterSection from "@/components/blocks/SinglePosterSection";
import { convertPuckProps } from "../utils/puckPropsToModule";
import type { LinkTargetType } from "../utils/linkTarget";
import {
  createContentTemplateMarker,
  type ContentTemplateMarker,
} from "../generated/contentTemplates.generated";

export interface SinglePosterPuckProps {
  number: string;
  label: string;
  title: string;
  subtitle: string;
  desktopImage: string;
  mobileImage: string;
  linkUrl: string;
  actionText: string;
  targetType: LinkTargetType;
  productId: number;
  altText: string;
  template: string;
  desktopFocusX: number;
  desktopFocusY: number;
  mobileFocusX: number;
  mobileFocusY: number;
  /** 系统保留：区块级内容模板合同印记，不在 Inspector 中展示。 */
  __contentTemplate?: ContentTemplateMarker;
  locked?: boolean;
}

export const singlePosterPuckConfig = {
  render: (props: SinglePosterPuckProps) => (
    <SinglePosterSection module={convertPuckProps("单图海报", props as any)!} editMode />
  ),
  defaultProps: {
    number: "",
    label: "",
    title: "",
    subtitle: "",
    desktopImage: "",
    mobileImage: "",
    linkUrl: "",
    actionText: "",
    targetType: "none",
    productId: 0,
    altText: "",
    template: "leftTextRightImage",
    desktopFocusX: 50,
    desktopFocusY: 50,
    mobileFocusX: 50,
    mobileFocusY: 50,
    __contentTemplate: createContentTemplateMarker("单图海报"),
    locked: false,
  } satisfies SinglePosterPuckProps,
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
