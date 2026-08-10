/**
 * imageText.puck.ts — ImageTextBlock 的 Puck 适配器
 */

import ImageTextBlock from "@/components/blocks/ImageTextBlock";

export interface ImageTextPuckProps {
  label: string;
  title: string;
  body: string;
  image: string;
  imagePosition: string;
  buttonText: string;
  linkUrl: string;
  template: string;
  spacing: string;
  locked?: boolean;
}

/** ImageTextBlock 接受 { module: { content, layoutConfig, styleConfig } } */
function toModule(props: ImageTextPuckProps) {
  return {
    content: {
      label: props.label,
      title: props.title,
      body: props.body,
      image: props.image,
      imagePosition: props.imagePosition,
      buttonText: props.buttonText,
      linkUrl: props.linkUrl,
    },
    layoutConfig: { template: props.template || "textLeftImageRight" },
    styleConfig: { spacing: props.spacing || "normal" },
  };
}

export const imageTextPuckConfig = {
  render: (props: ImageTextPuckProps) => (
    <ImageTextBlock module={toModule(props) as any} />
  ),
  defaultProps: {
    label: "",
    title: "品牌故事",
    body: "",
    image: "",
    imagePosition: "left",
    buttonText: "",
    linkUrl: "",
    template: "textLeftImageRight",
    spacing: "normal",
    locked: false,
  } satisfies ImageTextPuckProps,
  fields: {
    label: { type: "text" as const, label: "标签" },
    title: { type: "text" as const, label: "标题" },
    body: { type: "textarea" as const, label: "正文" },
    image: { type: "text" as const, label: "图片 URL" },
    imagePosition: {
      type: "radio" as const,
      label: "图片位置",
      options: [
        { label: "左侧", value: "left" },
        { label: "右侧", value: "right" },
      ],
    },
    buttonText: { type: "text" as const, label: "按钮文字" },
    linkUrl: { type: "text" as const, label: "按钮链接" },
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
      label: "间距",
      options: [
        { label: "紧凑", value: "compact" },
        { label: "正常", value: "normal" },
        { label: "宽松", value: "spacious" },
      ],
    },
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
