/**
 * fullBleed.puck.ts — FullBleedBlock 的 Puck 适配器
 */

import FullBleedBlock from "@/components/blocks/FullBleedBlock";

export interface FullBleedPuckProps {
  image: string;
  mobileImage: string;
  title: string;
  subtitle: string;
  buttonText: string;
  linkUrl: string;
  template: string;
  overlay: string;
  locked?: boolean;
}

function toModule(props: FullBleedPuckProps) {
  return {
    content: {
      image: props.image,
      mobileImage: props.mobileImage,
      title: props.title,
      subtitle: props.subtitle,
      buttonText: props.buttonText,
      linkUrl: props.linkUrl,
    },
    layoutConfig: { template: props.template || "textCenter" },
    styleConfig: { bgColor: props.overlay || "rgba(15,13,12,0.2)" },
  };
}

export const fullBleedPuckConfig = {
  render: (props: FullBleedPuckProps) => (
    <FullBleedBlock module={toModule(props) as any} />
  ),
  defaultProps: {
    image: "",
    mobileImage: "",
    title: "",
    subtitle: "",
    buttonText: "",
    linkUrl: "",
    template: "textCenter",
    overlay: "rgba(15,13,12,0.2)",
    locked: false,
  } satisfies FullBleedPuckProps,
  fields: {
    image: { type: "text" as const, label: "背景图 URL" },
    mobileImage: { type: "text" as const, label: "移动端图 URL" },
    title: { type: "text" as const, label: "标题" },
    subtitle: { type: "text" as const, label: "副标题" },
    buttonText: { type: "text" as const, label: "按钮文字" },
    linkUrl: { type: "text" as const, label: "按钮链接" },
    template: {
      type: "radio" as const,
      label: "文字位置",
      options: [
        { label: "居中", value: "textCenter" },
        { label: "左对齐", value: "textLeft" },
        { label: "右对齐", value: "textRight" },
        { label: "左下", value: "textBottomLeft" },
      ],
    },
    overlay: { type: "text" as const, label: "遮罩颜色" },
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
