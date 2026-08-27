/**
 * customProcess.puck.ts — 定制流程的 Puck 适配器（步骤数组字段）
 */

import CustomProcessBlock from "@/components/blocks/CustomProcessBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface CustomProcessStep {
  number: string;
  en: string;
  name: string;
  desc: string;
  image?: string;
}

export interface CustomProcessPuckProps {
  title: string;
  subtitle: string;
  steps: CustomProcessStep[];
  bgColor: string;
  locked?: boolean;
}

export const customProcessPuckConfig = {
  render: (props: CustomProcessPuckProps) => (
    <CustomProcessBlock module={convertPuckProps("定制流程", props)!} editMode />
  ),
  defaultProps: {
    title: "定制旅程",
    subtitle: "一件珠宝如何为一个人诞生。",
    steps: [
      { number: "01", en: "STEP 01", name: "步骤一待确认", desc: "请填写经业务确认的流程说明。", image: "" },
      { number: "02", en: "STEP 02", name: "步骤二待确认", desc: "请填写经业务确认的流程说明。", image: "" },
      { number: "03", en: "STEP 03", name: "步骤三待确认", desc: "请填写经业务确认的流程说明。", image: "" },
      { number: "04", en: "STEP 04", name: "步骤四待确认", desc: "请填写经业务确认的流程说明。", image: "" },
      { number: "05", en: "STEP 05", name: "步骤五待确认", desc: "请填写经业务确认的流程说明。", image: "" },
    ],
    bgColor: "#FFFFFF",
    locked: false,
  } satisfies CustomProcessPuckProps,
  resolvePermissions: (data: { props?: CustomProcessPuckProps }) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
