/**
 * textBanner.puck.ts — TextBannerBlock 的 Puck 适配器
 */

import TextBannerBlock from "@/components/blocks/TextBannerBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";
import { colorPuckField } from "../fields/ColorField";

export interface TextBannerPuckProps {
  eyebrow: string;
  title: string;
  body: string;
  buttonText: string;
  linkUrl: string;
  template: string;
  bgColor: string;
  textColor: string;
  spacing: string;
  locked?: boolean;
}

export const textBannerPuckConfig = {
  render: (props: TextBannerPuckProps) => (
    <TextBannerBlock module={convertPuckProps("文字横幅", props as any) as any} />
  ),
  defaultProps: {
    eyebrow: "",
    title: "",
    body: "",
    buttonText: "",
    linkUrl: "",
    template: "center",
    bgColor: "#FBF9F6",
    textColor: "#2C2C2C",
    spacing: "normal",
    locked: false,
  } satisfies TextBannerPuckProps,
  fields: {
    eyebrow: { type: "text" as const, label: "眉题" },
    title: { type: "text" as const, label: "标题" },
    body: { type: "textarea" as const, label: "正文" },
    buttonText: { type: "text" as const, label: "按钮文字" },
    linkUrl: { type: "text" as const, label: "按钮链接" },
    template: {
      type: "radio" as const,
      label: "对齐",
      options: [
        { label: "居中", value: "center" },
        { label: "左对齐", value: "left" },
      ],
    },
    bgColor: colorPuckField("背景色"),
    textColor: colorPuckField("文字色"),
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
