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
    <CustomProcessBlock module={convertPuckProps("定制流程", props as any) as any} editMode />
  ),
  defaultProps: {
    title: "定制旅程",
    subtitle: "一件珠宝如何为一个人诞生。",
    steps: [
      { number: "01", en: "DISCOVERY", name: "理解您的故事", desc: "倾听佩戴场景、喜好与重要时刻,共同梳理创作方向。", image: "" },
      { number: "02", en: "DESIGN", name: "形成设计语言", desc: "设计师呈现方向与材质建议,反复对齐直至方案明确。", image: "" },
      { number: "03", en: "GEMSTONE", name: "甄选宝石", desc: "从光泽、颜色与纹理出发,挑选与设计呼应的宝石。", image: "" },
      { number: "04", en: "CRAFT", name: "匠心制作", desc: "从起版到镶嵌与表面处理,工坊逐步完成作品。", image: "" },
      { number: "05", en: "DELIVERY", name: "作品交付", desc: "整理作品资料,与您确认交付与后续保养安排。", image: "" },
    ],
    bgColor: "#FFFFFF",
    locked: false,
  } satisfies CustomProcessPuckProps,
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
