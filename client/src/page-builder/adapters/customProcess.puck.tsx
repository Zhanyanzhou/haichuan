/**
 * customProcess.puck.ts — 定制流程的 Puck 适配器（步骤数组字段）
 */

import CustomProcessBlock from "@/components/blocks/CustomProcessBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";
import { colorPuckField } from "../fields/ColorField";
import MediaPickerField from "../fields/MediaPickerField";

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
    bgColor: "#FBF9F6",
    locked: false,
  } satisfies CustomProcessPuckProps,
  fields: {
    title: { type: "text" as const, label: "标题" },
    subtitle: { type: "text" as const, label: "副标题" },
    steps: {
      type: "array" as const,
      label: "旅程节点",
      getItemSummary: (item: any) => `${item.number || ""} ${item.name || item.en || ""}`.trim() || "新节点",
      arrayFields: {
        number: { type: "text" as const, label: "编号（如 01）" },
        en: { type: "text" as const, label: "英文题（如 DISCOVERY）" },
        name: { type: "text" as const, label: "中文题" },
        desc: { type: "textarea" as const, label: "一句话说明" },
        image: {
          type: "custom" as const,
          label: "节点图（可选）",
          render: ({
            value, onChange, readOnly,
          }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
            <MediaPickerField fieldKey="image" device="shared" value={value} onChange={onChange} readOnly={readOnly}
              spec={{ width: 2000, height: 2000, ratio: "1:1", label: "节点图（建议 2000×2000，1:1）" }}
              placeholder="上传节点图（可选）" />
          ),
        },
      },
      defaultItemProps: { number: "", en: "", name: "", desc: "", image: "" },
    } as any,
    bgColor: colorPuckField("背景色"),
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
