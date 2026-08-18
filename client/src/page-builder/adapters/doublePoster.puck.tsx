/**
 * doublePoster.puck.ts — DoublePosterSection 的 Puck 适配器
 */

import DoublePosterSection from "@/components/blocks/DoublePosterSection";
import { IMAGE_SPECS } from "../config/imageSpecs";
import { convertPuckProps } from "../utils/puckPropsToModule";
import MediaPickerField from "../fields/MediaPickerField";
import type { LinkTargetType } from "../utils/linkTarget";
import {
  createContentTemplateMarker,
  type ContentTemplateMarker,
} from "../generated/contentTemplates.generated";

export interface DoublePosterPuckProps {
  number: string;
  label: string;
  title: string;
  description: string;
  mainImage: string;
  detailImage: string;
  actionText: string;
  targetType: LinkTargetType;
  productId: number;
  linkUrl: string;
  mainAltText: string;
  detailAltText: string;
  mainFocusX: number;
  mainFocusY: number;
  detailFocusX: number;
  detailFocusY: number;
  /** 系统保留：区块级内容模板合同印记，不在 Inspector 中展示。 */
  __contentTemplate?: ContentTemplateMarker;
  locked?: boolean;
}

export const doublePosterPuckConfig = {
  render: (props: DoublePosterPuckProps) => (
    <DoublePosterSection module={convertPuckProps("双图海报", props as any)!} editMode />
  ),
  defaultProps: {
    number: "",
    label: "",
    title: "",
    description: "",
    mainImage: "",
    detailImage: "",
    actionText: "",
    targetType: "none",
    productId: 0,
    linkUrl: "",
    mainAltText: "",
    detailAltText: "",
    mainFocusX: 50,
    mainFocusY: 50,
    detailFocusX: 50,
    detailFocusY: 50,
    __contentTemplate: createContentTemplateMarker("双图海报"),
    locked: false,
  } satisfies DoublePosterPuckProps,
  fields: {
    mainImage: {
      type: "custom" as const,
      label: "主海报 · 画布左侧大图",
      render: ({
        value, onChange, readOnly,
      }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
        <MediaPickerField fieldKey="mainImage" device="shared" value={value} onChange={onChange} readOnly={readOnly}
          spec={IMAGE_SPECS.doublePoster.main} required placeholder="拖入或上传主海报图片" />
      ),
    },
    detailImage: {
      type: "custom" as const,
      label: "细节海报 · 画布右侧竖图",
      render: ({
        value, onChange, readOnly,
      }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
        <MediaPickerField fieldKey="detailImage" device="shared" value={value} onChange={onChange} readOnly={readOnly}
          spec={IMAGE_SPECS.doublePoster.detail} required placeholder="拖入或上传细节海报图片" />
      ),
    },
    number: { type: "text" as const, label: "编号" },
    label: { type: "text" as const, label: "标签" },
    title: { type: "text" as const, label: "标题" },
    description: { type: "textarea" as const, label: "介绍文字" },
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
    linkUrl: { type: "text" as const, label: "站内页面" },
    mainAltText: { type: "text" as const, label: "主图替代文字" },
    detailAltText: { type: "text" as const, label: "细节图替代文字" },
    mainFocusX: {
      type: "number" as const,
      label: "主图焦点 X (%)",
      min: 0,
      max: 100,
    },
    mainFocusY: {
      type: "number" as const,
      label: "主图焦点 Y (%)",
      min: 0,
      max: 100,
    },
    detailFocusX: {
      type: "number" as const,
      label: "细节焦点 X (%)",
      min: 0,
      max: 100,
    },
    detailFocusY: {
      type: "number" as const,
      label: "细节焦点 Y (%)",
      min: 0,
      max: 100,
    },
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
