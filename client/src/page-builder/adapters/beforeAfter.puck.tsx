/**
 * beforeAfter.puck.ts — 改款前后对比的 Puck 适配器
 */
import BeforeAfterBlock from "@/components/blocks/BeforeAfterBlock";
import { IMAGE_SPECS } from "../config/imageSpecs";
import { convertPuckProps } from "../utils/puckPropsToModule";
import MediaPickerField from "../fields/MediaPickerField";
import { colorPuckField } from "../fields/ColorField";

export interface BeforeAfterPuckProps {
  title: string;
  subtitle: string;
  beforeImage: string;
  afterImage: string;
  beforeLabel: string;
  afterLabel: string;
  beforeAltText: string;
  afterAltText: string;
  beforeFocusX: number;
  beforeFocusY: number;
  afterFocusX: number;
  afterFocusY: number;
  bgColor: string;
  locked?: boolean;
}

export const beforeAfterPuckConfig = {
  render: (props: BeforeAfterPuckProps) => (
    <BeforeAfterBlock
      module={convertPuckProps("改款对比", props as any) as any}
      editMode
    />
  ),
  defaultProps: {
    title: "珠宝改款",
    subtitle: "旧物的情感,以新的形态延续。",
    beforeImage: "",
    afterImage: "",
    beforeLabel: "改款前",
    afterLabel: "改款后",
    beforeAltText: "",
    afterAltText: "",
    beforeFocusX: 50,
    beforeFocusY: 50,
    afterFocusX: 50,
    afterFocusY: 50,
    bgColor: "#F7F4EE",
    locked: false,
  } satisfies BeforeAfterPuckProps,
  fields: {
    title: { type: "text" as const, label: "标题" },
    subtitle: { type: "text" as const, label: "副标题（可选）" },
    beforeImage: {
      type: "custom" as const,
      label: "改款前图片",
      render: ({
        value,
        onChange,
        readOnly,
      }: {
        value?: string;
        onChange: (v: string) => void;
        readOnly?: boolean;
      }) => (
        <MediaPickerField
          fieldKey="beforeImage"
          device="shared"
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          spec={IMAGE_SPECS.beforeAfter.image}
          placeholder="上传改款前图片（4:5）"
        />
      ),
    },
    afterImage: {
      type: "custom" as const,
      label: "改款后图片",
      render: ({
        value,
        onChange,
        readOnly,
      }: {
        value?: string;
        onChange: (v: string) => void;
        readOnly?: boolean;
      }) => (
        <MediaPickerField
          fieldKey="afterImage"
          device="shared"
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          spec={IMAGE_SPECS.beforeAfter.image}
          placeholder="上传改款后图片（4:5）"
        />
      ),
    },
    beforeLabel: { type: "text" as const, label: "改款前标签" },
    afterLabel: { type: "text" as const, label: "改款后标签" },
    beforeAltText: { type: "text" as const, label: "改款前替代文字" },
    afterAltText: { type: "text" as const, label: "改款后替代文字" },
    beforeFocusX: { type: "number" as const, label: "改款前焦点 X" },
    beforeFocusY: { type: "number" as const, label: "改款前焦点 Y" },
    afterFocusX: { type: "number" as const, label: "改款后焦点 X" },
    afterFocusY: { type: "number" as const, label: "改款后焦点 Y" },
    bgColor: colorPuckField("背景色"),
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
