/**
 * singlePoster.puck.ts — SinglePosterSection 的 Puck 适配器
 */

import SinglePosterSection from "@/components/blocks/SinglePosterSection";
import { IMAGE_SPECS } from "../config/imageSpecs";
import { convertPuckProps } from "../utils/puckPropsToModule";
import MediaPickerField from "../fields/MediaPickerField";

export interface SinglePosterPuckProps {
  number: string;
  label: string;
  title: string;
  subtitle: string;
  desktopImage: string;
  mobileImage: string;
  linkUrl: string;
  template: string;
  focusX: number;
  focusY: number;
  locked?: boolean;
}

export const singlePosterPuckConfig = {
  render: (props: SinglePosterPuckProps) => (
    <SinglePosterSection module={convertPuckProps("单图海报", props as any)!} />
  ),
  defaultProps: {
    number: "01",
    label: "SIGNATURE",
    title: "经典系列",
    subtitle: "",
    desktopImage: "",
    mobileImage: "",
    linkUrl: "",
    template: "leftTextRightImage",
    focusX: 50,
    focusY: 50,
    locked: false,
  } satisfies SinglePosterPuckProps,
  fields: {
    number: { type: "text" as const, label: "海报文案区 · 编号" },
    label: { type: "text" as const, label: "海报文案区 · 标签" },
    title: { type: "text" as const, label: "海报文案区 · 主标题" },
    subtitle: { type: "text" as const, label: "海报文案区 · 副标题" },
    desktopImage: {
      type: "custom" as const,
      label: "海报主图",
      render: ({
        value, onChange, readOnly,
      }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
        <MediaPickerField fieldKey="desktopImage" device="desktop" value={value} onChange={onChange} readOnly={readOnly}
          spec={IMAGE_SPECS.singlePoster.image} placeholder="上传单海报桌面图" />
      ),
    },
    mobileImage: {
      type: "custom" as const,
      label: "移动端适配图（可选）",
      render: ({
        value, onChange, readOnly,
      }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
        <MediaPickerField fieldKey="mobileImage" device="mobile" value={value} onChange={onChange} readOnly={readOnly}
          spec={IMAGE_SPECS.singlePoster.image} placeholder="上传手机端海报图（可选）" />
      ),
    },
    linkUrl: { type: "text" as const, label: "链接" },
    template: {
      type: "radio" as const,
      label: "布局",
      options: [
        { label: "左文右图", value: "leftTextRightImage" },
        { label: "左图右文", value: "leftImageRightText" },
      ],
    },
    focusX: { type: "number" as const, label: "焦点 X (%)", min: 0, max: 100 },
    focusY: { type: "number" as const, label: "焦点 Y (%)", min: 0, max: 100 },
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
