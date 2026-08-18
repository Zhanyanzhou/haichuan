/**
 * splitPanel.puck.ts — SplitPanelBlock 适配器
 */

import SplitPanelBlock from "@/components/blocks/SplitPanelBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface SplitPanelPuckProps {
  image: string;
  title: string;
  subtitle: string;
  body: string;
  buttonText: string;
  linkUrl: string;
  template: string;
  split: string;
  bgColor: string;
  textBg: string;
  locked?: boolean;
}

export const splitPanelPuckConfig = {
  render: (props: SplitPanelPuckProps) => (
    <SplitPanelBlock module={convertPuckProps("分割面板", props as any) as any} editMode />
  ),
  defaultProps: {
    image: "",
    title: "",
    subtitle: "",
    body: "",
    buttonText: "",
    linkUrl: "",
    template: "imageLeft",
    split: "50-50",
    bgColor: "#FFFFFF",
    textBg: "#fff",
    locked: false,
  } satisfies SplitPanelPuckProps,
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
