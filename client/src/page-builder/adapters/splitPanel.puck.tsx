/**
 * splitPanel.puck.ts — SplitPanelBlock 适配器
 */

import SplitPanelBlock from "@/components/blocks/SplitPanelBlock";

export interface SplitPanelPuckProps {
  image: string;
  title: string;
  subtitle: string;
  body: string;
  buttonText: string;
  linkUrl: string;
  template: string;
  split: string;
  bgColor: string;
  textBg: string;
  locked?: boolean;
}

function toModule(props: SplitPanelPuckProps) {
  return {
    content: {
      image: props.image,
      title: props.title,
      subtitle: props.subtitle,
      body: props.body,
      buttonText: props.buttonText,
      linkUrl: props.linkUrl,
    },
    layoutConfig: {
      template: props.template || "imageLeft",
      split: props.split || "50-50",
    },
    styleConfig: {
      bgColor: props.bgColor || "#FCFCFB",
      textColor: props.textBg || "#fff",
    },
  };
}

export const splitPanelPuckConfig = {
  render: (props: SplitPanelPuckProps) => (
    <SplitPanelBlock module={toModule(props) as any} />
  ),
  defaultProps: {
    image: "",
    title: "",
    subtitle: "",
    body: "",
    buttonText: "",
    linkUrl: "",
    template: "imageLeft",
    split: "50-50",
    bgColor: "#FCFCFB",
    textBg: "#fff",
    locked: false,
  } satisfies SplitPanelPuckProps,
  fields: {
    image: { type: "text" as const, label: "图片 URL" },
    title: { type: "text" as const, label: "标题" },
    subtitle: { type: "text" as const, label: "副标题" },
    body: { type: "textarea" as const, label: "正文" },
    buttonText: { type: "text" as const, label: "按钮文字" },
    linkUrl: { type: "text" as const, label: "按钮链接" },
    template: {
      type: "radio" as const,
      label: "图片位置",
      options: [
        { label: "图左文右", value: "imageLeft" },
        { label: "图右文左", value: "imageRight" },
      ],
    },
    split: {
      type: "radio" as const,
      label: "分割比例",
      options: [
        { label: "50:50", value: "50-50" },
        { label: "60:40", value: "60-40" },
        { label: "40:60", value: "40-60" },
      ],
    },
    bgColor: { type: "text" as const, label: "背景色" },
    textBg: { type: "text" as const, label: "文字区背景" },
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
