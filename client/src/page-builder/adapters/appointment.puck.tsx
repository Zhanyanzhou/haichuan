/**
 * appointment.puck.ts — 预约入口的 Puck 适配器
 */

import AppointmentBlock from "@/components/blocks/AppointmentBlock";
import { IMAGE_SPECS } from "../config/imageSpecs";
import { convertPuckProps } from "../utils/puckPropsToModule";
import MediaPickerField from "../fields/MediaPickerField";
import { colorPuckField } from "../fields/ColorField";

export interface AppointmentPuckProps {
  backgroundImage: string;
  title: string;
  subtitle: string;
  buttonText: string;
  linkUrl: string;
  phone: string;
  altText: string;
  desktopFocusX: number;
  desktopFocusY: number;
  mobileFocusX: number;
  mobileFocusY: number;
  tone: "dark" | "ivory";
  bgColor: string;
  locked?: boolean;
}

export const appointmentPuckConfig = {
  render: (props: AppointmentPuckProps) => (
    <AppointmentBlock module={convertPuckProps("预约入口", props as any) as any} editMode />
  ),
  defaultProps: {
    backgroundImage: "",
    title: "预约鉴赏",
    subtitle: "一对一珠宝顾问，为您安排专属服务",
    buttonText: "立即预约",
    linkUrl: "/contact",
    phone: "",
    altText: "",
    desktopFocusX: 50,
    desktopFocusY: 50,
    mobileFocusX: 50,
    mobileFocusY: 50,
    tone: "dark",
    bgColor: "#1A1714",
    locked: false,
  } satisfies AppointmentPuckProps,
  fields: {
    backgroundImage: {
      type: "custom" as const,
      label: "背景图（可选）",
      render: ({
        value, onChange, readOnly,
      }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
        <MediaPickerField fieldKey="backgroundImage" device="shared" value={value} onChange={onChange} readOnly={readOnly}
          spec={IMAGE_SPECS.fullBleed.desktop} placeholder="上传背景图（21:6，留空用纯色）" />
      ),
    },
    title: { type: "text" as const, label: "主标题" },
    subtitle: { type: "textarea" as const, label: "副标题" },
    buttonText: { type: "text" as const, label: "主按钮文字" },
    linkUrl: { type: "text" as const, label: "主按钮跳转链接" },
    phone: { type: "text" as const, label: "咨询电话（可选，显示第二个按钮）" },
    altText: { type: "text" as const, label: "背景图替代文字" },
    desktopFocusX: { type: "number" as const, label: "桌面焦点 X (%)", min: 0, max: 100 },
    desktopFocusY: { type: "number" as const, label: "桌面焦点 Y (%)", min: 0, max: 100 },
    mobileFocusX: { type: "number" as const, label: "移动焦点 X (%)", min: 0, max: 100 },
    mobileFocusY: { type: "number" as const, label: "移动焦点 Y (%)", min: 0, max: 100 },
    tone: {
      type: "radio" as const,
      label: "视觉预设",
      options: [
        { label: "深色典藏", value: "dark" },
        { label: "象牙留白", value: "ivory" },
      ],
    },
    bgColor: colorPuckField("背景色（无背景图时）"),
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
