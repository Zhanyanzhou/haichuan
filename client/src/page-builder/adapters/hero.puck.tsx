/**
 * hero.puck.ts — HeroSection 的 Puck 适配器
 * 不包含业务渲染逻辑（HeroSection.tsx 负责）
 * 只负责 Puck 注册所需：fields、defaultProps、render、permissions
 */

import HeroSection from "@/components/blocks/HeroSection";
import { IMAGE_SPECS } from "../config/imageSpecs";
import { convertPuckProps } from "../utils/puckPropsToModule";
import MediaPickerField from "../fields/MediaPickerField";

/** Puck 扁平 props（编辑器使用） */
export interface HeroPuckProps {
  desktopImage: string;
  mobileImage: string;
  title: string;
  subtitle: string;
  actionText: string;
  linkUrl: string;
  altText: string;
  alignment: string;
  focusX: number;
  focusY: number;
  /** 模板锁定标记 */
  locked?: boolean;
}

export const heroPuckConfig = {
  render: (props: HeroPuckProps) => (
    <HeroSection module={convertPuckProps("首屏主视觉", props as any)!} editMode />
  ),

  defaultProps: {
    desktopImage: "",
    mobileImage: "",
    title: "海川珠宝",
    subtitle: "CAMPAIGN / NEW COLLECTION",
    actionText: "探索新品",
    linkUrl: "/products",
    altText: "海川珠宝 Hero",
    alignment: "center",
    focusX: 50,
    focusY: 50,
    locked: false,
  } satisfies HeroPuckProps,

  fields: {
    desktopImage: {
      type: "custom" as const,
      label: "桌面端主视觉",
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
          fieldKey="desktopImage"
          device="desktop"
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          spec={IMAGE_SPECS.hero.desktop}
          required
          placeholder="上传桌面端主视觉图"
        />
      ),
    },
    mobileImage: {
      type: "custom" as const,
      label: "手机端主视觉",
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
          fieldKey="mobileImage"
          device="mobile"
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          spec={IMAGE_SPECS.hero.mobile}
          placeholder="上传手机端主视觉图"
        />
      ),
    },
    title: { type: "text" as const, label: "标题" },
    subtitle: { type: "text" as const, label: "副标题" },
    actionText: { type: "text" as const, label: "按钮文字" },
    linkUrl: { type: "text" as const, label: "按钮链接" },
    altText: { type: "text" as const, label: "图片替代文字" },
    alignment: {
      type: "radio" as const,
      label: "对齐",
      options: [
        { label: "居中", value: "center" },
        { label: "左对齐", value: "left" },
      ],
    },
    focusX: { type: "number" as const, label: "焦点 X (%)", min: 0, max: 100 },
    focusY: { type: "number" as const, label: "焦点 Y (%)", min: 0, max: 100 },
  },

  /** 模板锁定：locked 属性为 true 时禁止删除/拖动 */
  resolvePermissions: (data: any, _params: any) => {
    if (data.props?.locked) {
      return { delete: false, drag: false, duplicate: false };
    }
    return {};
  },
};
