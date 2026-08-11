/**
 * doublePoster.puck.ts — DoublePosterSection 的 Puck 适配器
 */

import DoublePosterSection from "@/components/blocks/DoublePosterSection";
import { IMAGE_SPECS } from "../config/imageSpecs";
import { convertPuckProps } from "../utils/puckPropsToModule";
import MediaPickerField from "../fields/MediaPickerField";

export interface DoublePosterPuckProps {
  number: string;
  label: string;
  title: string;
  description: string;
  mainImage: string;
  detailImage: string;
  linkUrl: string;
  mainFocusX: number;
  mainFocusY: number;
  detailFocusX: number;
  detailFocusY: number;
  locked?: boolean;
}

export const doublePosterPuckConfig = {
  render: (props: DoublePosterPuckProps) => (
    <DoublePosterSection module={convertPuckProps("双图海报", props as any)!} />
  ),
  defaultProps: {
    number: "02",
    label: "COLLECTION",
    title: "新品系列",
    description: "",
    mainImage: "",
    detailImage: "",
    linkUrl: "",
    mainFocusX: 50,
    mainFocusY: 50,
    detailFocusX: 50,
    detailFocusY: 50,
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
    number: { type: "text" as const, label: "细节图下方 · 编号" },
    label: { type: "text" as const, label: "细节图下方 · 标签" },
    title: { type: "text" as const, label: "细节图下方 · 主标题" },
    description: { type: "textarea" as const, label: "细节图下方 · 介绍文字" },
    linkUrl: { type: "text" as const, label: "链接" },
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
