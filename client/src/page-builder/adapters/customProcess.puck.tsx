/**
 * customProcess.puck.ts — 定制流程的 Puck 适配器（步骤数组字段）
 */

import CustomProcessBlock from "@/components/blocks/CustomProcessBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";
import { colorPuckField } from "../fields/ColorField";
import MediaPickerField from "../fields/MediaPickerField";

export interface CustomProcessStep {
  number: string;
  name: string;
  desc: string;
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
    <CustomProcessBlock module={convertPuckProps("定制流程", props as any) as any} />
  ),
  defaultProps: {
    title: "定制流程",
    subtitle: "从选石到交付，每一步都为你",
    steps: [
      { number: "01", name: "选石", desc: "挑选心仪的宝石或原料" },
      { number: "02", name: "设计", desc: "设计师一对一沟通方案" },
      { number: "03", name: "打样", desc: "匠心制作，反复打磨" },
      { number: "04", name: "交付", desc: "权威认证，精致呈现" },
    ],
    bgColor: "#FBF9F6",
    locked: false,
  } satisfies CustomProcessPuckProps,
  fields: {
    title: { type: "text" as const, label: "标题" },
    subtitle: { type: "text" as const, label: "副标题" },
    steps: {
      type: "array" as const,
      label: "步骤列表",
      arrayFields: {
        number: { type: "text" as const, label: "序号" },
        name: { type: "text" as const, label: "步骤标题" },
        desc: { type: "textarea" as const, label: "步骤说明" },
        image: {
          type: "custom" as const,
          label: "步骤图（可选）",
          render: ({
            value, onChange, readOnly,
          }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
            <MediaPickerField fieldKey="image" device="shared" value={value} onChange={onChange} readOnly={readOnly}
              spec={{ width: 200, height: 200, ratio: "1:1", label: "步骤图（建议 200×200）" }}
              placeholder="上传步骤图（可选，替代序号圆）" />
          ),
        },
      },
    } as any,
    bgColor: colorPuckField("背景色"),
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
