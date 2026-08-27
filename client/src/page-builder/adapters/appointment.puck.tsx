/**
 * appointment.puck.ts — 预约入口的 Puck 适配器
 */

import AppointmentBlock from "@/components/blocks/AppointmentBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface AppointmentPuckProps {
  backgroundImage: string;
  title: string;
  subtitle: string;
  buttonText: string;
  linkUrl: string;
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
    <AppointmentBlock module={convertPuckProps("预约入口", props)!} editMode />
  ),
  defaultProps: {
    backgroundImage: "",
    title: "预约鉴赏",
    subtitle: "一对一珠宝顾问，为您安排专属服务",
    buttonText: "立即预约",
    linkUrl: "/contact",
    altText: "",
    desktopFocusX: 50,
    desktopFocusY: 50,
    mobileFocusX: 50,
    mobileFocusY: 50,
    tone: "ivory",
    bgColor: "#FFFFFF",
    locked: false,
  } satisfies AppointmentPuckProps,
  resolvePermissions: (data: { props?: AppointmentPuckProps }) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
