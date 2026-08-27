/**
 * textBanner.puck.ts — TextBannerBlock 的 Puck 适配器
 */

import TextBannerBlock from "@/components/blocks/TextBannerBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";
import type { LinkTargetType } from "../utils/linkTarget";
import {
  createContentTemplateMarker,
  type ContentTemplateMarker,
} from "../generated/contentTemplates.generated";

export interface TextBannerPuckProps {
  eyebrow: string;
  title: string;
  body: string;
  buttonText: string;
  linkUrl: string;
  targetType: LinkTargetType;
  productId: number;
  template: string;
  spacing: string;
  /** 可选横幅背景图；留空则为纯色大留白 */
  bgImage: string;
  /** 系统保留：区块级内容模板合同印记，不在 Inspector 中展示。 */
  __contentTemplate?: ContentTemplateMarker;
  locked?: boolean;
}

export const textBannerPuckConfig = {
  render: (props: TextBannerPuckProps) => (
    <TextBannerBlock
      module={convertPuckProps("文字横幅", props)!}
      editMode
    />
  ),
  defaultProps: {
    eyebrow: "",
    title: "",
    body: "",
    buttonText: "",
    linkUrl: "",
    targetType: "none",
    productId: 0,
    template: "center",
    spacing: "normal",
    bgImage: "",
    __contentTemplate: createContentTemplateMarker("文字横幅"),
    locked: false,
  } satisfies TextBannerPuckProps,
  resolvePermissions: (data: { props?: TextBannerPuckProps }) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
