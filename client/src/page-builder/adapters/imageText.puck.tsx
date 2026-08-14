/**
 * imageText.puck.ts — ImageTextBlock 的 Puck 适配器
 */

import ImageTextBlock from "@/components/blocks/ImageTextBlock";
import { IMAGE_TEXT_CONTRACT } from "../config/blockContracts";
import { IMAGE_SPECS } from "../config/imageSpecs";
import { convertPuckProps } from "../utils/puckPropsToModule";
import MediaPickerField from "../fields/MediaPickerField";
import type { LinkTargetType } from "../utils/linkTarget";

export interface ImageTextPuckProps {
  label: string;
  title: string;
  body: string;
  image: string;
  imageAlt: string;
  buttonText: string;
  linkUrl: string;
  targetType: LinkTargetType;
  productId: number;
  template: string;
  spacing: string;
  focusX: number;
  focusY: number;
  locked?: boolean;
}

export const imageTextPuckConfig = {
  render: (props: ImageTextPuckProps) => (
    <ImageTextBlock module={convertPuckProps("图文混排", props as any) as any} editMode />
  ),
  defaultProps: {
    label: "",
    title: "品牌故事",
    body: "",
    image: "",
    imageAlt: "",
    buttonText: "",
    linkUrl: "",
    targetType: "none",
    productId: 0,
    template: IMAGE_TEXT_CONTRACT.defaults.template,
    spacing: IMAGE_TEXT_CONTRACT.defaults.spacing,
    focusX: 50,
    focusY: 50,
    locked: false,
  } satisfies ImageTextPuckProps,
  fields: {
    label: { type: "text" as const, label: "标签" },
    title: { type: "text" as const, label: "标题" },
    body: { type: "textarea" as const, label: "正文" },
    image: {
      type: "custom" as const,
      label: "图片侧 · 配图",
      render: ({
        value, onChange, readOnly,
      }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
        <MediaPickerField fieldKey="image" device="shared" value={value} onChange={onChange} readOnly={readOnly}
          spec={IMAGE_SPECS.imageText.image} placeholder="上传图文配图" />
      ),
    },
    imageAlt: { type: "text" as const, label: "图片替代文字" },
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
      label: "布局",
      options: [
        { label: "左文右图", value: "textLeftImageRight" },
        { label: "左图右文", value: "textRightImageLeft" },
        { label: "纯文字", value: "textOnly" },
        { label: "图片背景", value: "imageBackground" },
      ],
    },
    spacing: {
      type: "radio" as const,
      label: "内容留白",
      options: [
        { label: "紧凑", value: "compact" },
        { label: "标准", value: "normal" },
        { label: "宽松", value: "spacious" },
      ],
    },
    focusX: { type: "number" as const, label: "图片焦点 X", min: 0, max: 100 },
    focusY: { type: "number" as const, label: "图片焦点 Y", min: 0, max: 100 },
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
