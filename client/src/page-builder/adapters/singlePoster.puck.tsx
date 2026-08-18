/**
 * singlePoster.puck.ts — SinglePosterSection 的 Puck 适配器
 */

import SinglePosterSection from "@/components/blocks/SinglePosterSection";
import { IMAGE_SPECS } from "../config/imageSpecs";
import { convertPuckProps } from "../utils/puckPropsToModule";
import MediaPickerField from "../fields/MediaPickerField";
import type { LinkTargetType } from "../utils/linkTarget";
import {
  createContentTemplateMarker,
  type ContentTemplateMarker,
} from "../generated/contentTemplates.generated";

export interface SinglePosterPuckProps {
  number: string;
  label: string;
  title: string;
  subtitle: string;
  desktopImage: string;
  mobileImage: string;
  linkUrl: string;
  actionText: string;
  targetType: LinkTargetType;
  productId: number;
  altText: string;
  template: string;
  desktopFocusX: number;
  desktopFocusY: number;
  mobileFocusX: number;
  mobileFocusY: number;
  /** 系统保留：区块级内容模板合同印记，不在 Inspector 中展示。 */
  __contentTemplate?: ContentTemplateMarker;
  locked?: boolean;
}

export const singlePosterPuckConfig = {
  render: (props: SinglePosterPuckProps) => (
    <SinglePosterSection module={convertPuckProps("单图海报", props as any)!} editMode />
  ),
  defaultProps: {
    number: "",
    label: "",
    title: "",
    subtitle: "",
    desktopImage: "",
    mobileImage: "",
    linkUrl: "",
    actionText: "",
    targetType: "none",
    productId: 0,
    altText: "",
    template: "leftTextRightImage",
    desktopFocusX: 50,
    desktopFocusY: 50,
    mobileFocusX: 50,
    mobileFocusY: 50,
    __contentTemplate: createContentTemplateMarker("单图海报"),
    locked: false,
  } satisfies SinglePosterPuckProps,
  fields: {
    number: { type: "text" as const, label: "编号" },
    label: { type: "text" as const, label: "标签" },
    title: { type: "text" as const, label: "标题" },
    subtitle: { type: "text" as const, label: "副标题" },
    desktopImage: {
      type: "custom" as const,
      label: "海报主图",
      render: ({
        value, onChange, readOnly,
      }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
        <MediaPickerField fieldKey="desktopImage" device="desktop" value={value} onChange={onChange} readOnly={readOnly}
          spec={IMAGE_SPECS.singlePoster.image} placeholder="上传海报主图（4:5）" />
      ),
    },
    mobileImage: {
      type: "custom" as const,
      label: "移动端适配图（可选）",
      render: ({
        value, onChange, readOnly,
      }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
        <MediaPickerField fieldKey="mobileImage" device="mobile" value={value} onChange={onChange} readOnly={readOnly}
          spec={IMAGE_SPECS.singlePoster.mobile} placeholder="上传手机端海报图（可选）" />
      ),
    },
    linkUrl: { type: "text" as const, label: "链接" },
    actionText: { type: "text" as const, label: "引导文字" },
    targetType: {
      type: "radio" as const,
      label: "点击跳转",
      options: [
        { label: "不跳转", value: "none" },
        { label: "商品详情", value: "product" },
        { label: "站内页面", value: "page" },
      ],
    },
    productId: { type: "number" as const, label: "商品 ID" },
    altText: { type: "text" as const, label: "图片替代文字" },
    template: {
      type: "radio" as const,
      label: "布局",
      options: [
        { label: "左文右图", value: "leftTextRightImage" },
        { label: "左图右文", value: "leftImageRightText" },
      ],
    },
    desktopFocusX: { type: "number" as const, label: "桌面焦点 X (%)", min: 0, max: 100 },
    desktopFocusY: { type: "number" as const, label: "桌面焦点 Y (%)", min: 0, max: 100 },
    mobileFocusX: { type: "number" as const, label: "移动焦点 X (%)", min: 0, max: 100 },
    mobileFocusY: { type: "number" as const, label: "移动焦点 Y (%)", min: 0, max: 100 },
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
