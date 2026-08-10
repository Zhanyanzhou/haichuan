/**
 * splitPanel.puck.ts — SplitPanelBlock 适配器
 */

import SplitPanelBlock from "@/components/blocks/SplitPanelBlock";
import { IMAGE_SPECS } from "../config/imageSpecs";
import { convertPuckProps } from "../utils/puckPropsToModule";
import MediaPickerField from "../fields/MediaPickerField";
import { colorPuckField } from "../fields/ColorField";

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

export const splitPanelPuckConfig = {
  render: (props: SplitPanelPuckProps) => (
    <SplitPanelBlock module={convertPuckProps("分割面板", props as any) as any} />
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
    image: {
      type: "custom" as const,
      label: "配图",
      render: ({
        value, onChange, readOnly,
      }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
        <MediaPickerField value={value} onChange={onChange} readOnly={readOnly}
          spec={IMAGE_SPECS.splitPanel.image} placeholder="上传分栏配图" />
      ),
    },
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
    bgColor: colorPuckField("背景色"),
    textBg: colorPuckField("文字区背景"),
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
