/**
 * fullBleed.puck.ts — FullBleedBlock 的 Puck 适配器
 */

import FullBleedBlock from "@/components/blocks/FullBleedBlock";
import type { LinkTargetType } from "@/page-builder/utils/linkTarget";
import { IMAGE_SPECS } from "../config/imageSpecs";
import { convertPuckProps } from "../utils/puckPropsToModule";
import MediaPickerField from "../fields/MediaPickerField";
import {
  createContentTemplateMarker,
  type ContentTemplateMarker,
} from "../generated/contentTemplates.generated";

export type FullBleedOverlayPreset = "none" | "soft" | "strong";

export interface FullBleedPuckProps {
  image: string;
  mobileImage: string;
  title: string;
  subtitle: string;
  buttonText: string;
  linkUrl: string;
  targetType: LinkTargetType;
  productId: number;
  template: string;
  overlayPreset: FullBleedOverlayPreset;
  altText: string;
  desktopFocusX: number;
  desktopFocusY: number;
  mobileFocusX: number;
  mobileFocusY: number;
  /** 系统保留：区块级内容模板合同印记，不在 Inspector 中展示。 */
  __contentTemplate?: ContentTemplateMarker;
  locked?: boolean;
}

export const fullBleedPuckConfig = {
  render: (props: FullBleedPuckProps) => (
    <FullBleedBlock module={convertPuckProps("全屏出血图", props as any) as any} editMode />
  ),
  defaultProps: {
    image: "",
    mobileImage: "",
    title: "",
    subtitle: "",
    buttonText: "",
    linkUrl: "",
    targetType: "none",
    productId: 0,
    template: "captionBelow",
    overlayPreset: "none",
    altText: "",
    desktopFocusX: 50,
    desktopFocusY: 50,
    mobileFocusX: 50,
    mobileFocusY: 50,
    __contentTemplate: createContentTemplateMarker("全屏出血图"),
    locked: false,
  } satisfies FullBleedPuckProps,
  fields: {
    image: {
      type: "custom" as const,
      label: "全屏主视觉",
      render: ({
        value, onChange, readOnly,
      }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
        <MediaPickerField fieldKey="image" device="desktop" value={value} onChange={onChange} readOnly={readOnly}
          spec={IMAGE_SPECS.fullBleed.desktop} placeholder="上传通栏桌面大图" />
      ),
    },
    mobileImage: {
      type: "custom" as const,
      label: "移动端适配图（可选）",
      render: ({
        value, onChange, readOnly,
      }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
        <MediaPickerField fieldKey="mobileImage" device="mobile" value={value} onChange={onChange} readOnly={readOnly}
          spec={IMAGE_SPECS.fullBleed.mobile} placeholder="上传通栏手机端图（可选）" />
      ),
    },
    title: { type: "text" as const, label: "标题" },
    subtitle: { type: "text" as const, label: "副标题" },
    buttonText: { type: "text" as const, label: "引导文字" },
    targetType: {
      type: "radio" as const,
      label: "点击后跳转",
      options: [
        { label: "不跳转", value: "none" },
        { label: "商品详情", value: "product" },
        { label: "站内页面", value: "page" },
      ],
    },
    productId: { type: "number" as const, label: "商品 ID" },
    linkUrl: { type: "text" as const, label: "站内页面" },
    template: {
      type: "radio" as const,
      label: "文字位置",
      options: [{ label: "图片下方", value: "captionBelow" }],
    },
    overlayPreset: {
      type: "radio" as const,
      label: "文字遮罩",
      options: [{ label: "无", value: "none" }],
    },
    altText: { type: "text" as const, label: "图片替代文字" },
    desktopFocusX: { type: "number" as const, label: "桌面焦点 X" },
    desktopFocusY: { type: "number" as const, label: "桌面焦点 Y" },
    mobileFocusX: { type: "number" as const, label: "移动焦点 X" },
    mobileFocusY: { type: "number" as const, label: "移动焦点 Y" },
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
