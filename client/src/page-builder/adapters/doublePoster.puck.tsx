/**
 * doublePoster.puck.ts — DoublePosterSection 的 Puck 适配器
 */

import DoublePosterSection from "@/components/blocks/DoublePosterSection";
import { convertPuckProps } from "../utils/puckPropsToModule";
import type { LinkTargetType } from "../utils/linkTarget";
import {
  createContentTemplateMarker,
  type ContentTemplateMarker,
} from "../generated/contentTemplates.generated";

export interface DoublePosterPuckProps {
  number: string;
  label: string;
  title: string;
  description: string;
  mainImage: string;
  detailImage: string;
  actionText: string;
  targetType: LinkTargetType;
  productId: number;
  linkUrl: string;
  mainAltText: string;
  detailAltText: string;
  mainFocusX: number;
  mainFocusY: number;
  detailFocusX: number;
  detailFocusY: number;
  /** 区块背景色（对齐其余 16 个内容模板的 bgColor 约定） */
  bgColor: string;
  /** 系统保留：区块级内容模板合同印记，不在 Inspector 中展示。 */
  __contentTemplate?: ContentTemplateMarker;
  locked?: boolean;
}

export const doublePosterPuckConfig = {
  render: (props: DoublePosterPuckProps) => (
    <DoublePosterSection module={convertPuckProps("双图海报", props)!} editMode />
  ),
  defaultProps: {
    number: "",
    label: "",
    title: "",
    description: "",
    mainImage: "",
    detailImage: "",
    actionText: "",
    targetType: "none",
    productId: 0,
    linkUrl: "",
    mainAltText: "",
    detailAltText: "",
    mainFocusX: 50,
    mainFocusY: 50,
    detailFocusX: 50,
    detailFocusY: 50,
    bgColor: "#FFFFFF",
    __contentTemplate: createContentTemplateMarker("双图海报"),
    locked: false,
  } satisfies DoublePosterPuckProps,
  resolvePermissions: (data: { props?: DoublePosterPuckProps }) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
