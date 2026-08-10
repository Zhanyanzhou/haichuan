/**
 * fullBleed.puck.ts — FullBleedBlock 的 Puck 适配器
 */

import FullBleedBlock from "@/components/blocks/FullBleedBlock";
import { IMAGE_SPECS } from "../config/imageSpecs";
import { convertPuckProps } from "../utils/puckPropsToModule";
import MediaPickerField from "../fields/MediaPickerField";
import { colorPuckField } from "../fields/ColorField";

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

export const fullBleedPuckConfig = {
  render: (props: FullBleedPuckProps) => (
    <FullBleedBlock module={convertPuckProps("全屏出血图", props as any) as any} />
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
    image: {
      type: "custom" as const,
      label: "桌面端图片",
      render: ({
        value, onChange, readOnly,
      }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
        <MediaPickerField value={value} onChange={onChange} readOnly={readOnly}
          spec={IMAGE_SPECS.fullBleed.desktop} placeholder="上传通栏桌面大图" />
      ),
    },
    mobileImage: {
      type: "custom" as const,
      label: "手机端图片",
      render: ({
        value, onChange, readOnly,
      }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
        <MediaPickerField value={value} onChange={onChange} readOnly={readOnly}
          spec={IMAGE_SPECS.fullBleed.mobile} placeholder="上传通栏手机端图（可选）" />
      ),
    },
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
    overlay: colorPuckField("遮罩颜色"),
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
