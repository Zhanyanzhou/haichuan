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
      module={convertPuckProps("文字横幅", props as any) as any}
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
  fields: {
    eyebrow: { type: "text" as const, label: "眉题" },
    title: { type: "text" as const, label: "标题" },
    body: { type: "textarea" as const, label: "正文" },
    buttonText: { type: "text" as const, label: "按钮文字" },
    linkUrl: { type: "text" as const, label: "按钮跳转链接" },
    targetType: {
      type: "radio" as const,
      label: "按钮跳转",
      options: [
        { label: "不跳转", value: "none" },
        { label: "商品详情", value: "product" },
        { label: "站内页面", value: "page" },
      ],
    },
    productId: { type: "number" as const, label: "商品 ID" },
    template: {
      type: "radio" as const,
      label: "对齐",
      options: [
        { label: "居中", value: "center" },
        { label: "左对齐", value: "left" },
      ],
    },
    spacing: {
      type: "radio" as const,
      label: "间距",
      options: [
        { label: "标准", value: "normal" },
        { label: "宽松", value: "spacious" },
      ],
    },
    bgImage: { type: "text" as const, label: "背景图 URL" },
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
