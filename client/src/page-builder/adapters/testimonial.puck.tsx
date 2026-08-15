import TestimonialBlock from "@/components/blocks/TestimonialBlock";
import MediaPickerField from "../fields/MediaPickerField";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { colorPuckField } from "../fields/ColorField";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface TestimonialPuckProps {
  title: string;
  subtitle: string;
  testimonials: Array<{ name: string; meta: string; content: string; image: string }>;
  bgColor: string;
  locked?: boolean;
}

export const testimonialPuckConfig = {
  render: (props: TestimonialPuckProps) => {
    const module = convertPuckProps("真实评价与实拍", props as any);
    return <TestimonialBlock module={module as NonNullable<typeof module>} editMode />;
  },
  defaultProps: {
    title: "来自顾客的真实分享",
    subtitle: "每一份选择，都成为值得被珍藏的故事。",
    testimonials: [
      { name: "林女士", meta: "订制钻戒", content: "从选石到设计都很细致，成品比想象中更有光泽。", image: "" },
      { name: "周先生", meta: "周年纪念礼物", content: "门店顾问很专业，包装和仪式感都让人满意。", image: "" },
      { name: "陈女士", meta: "翡翠吊坠", content: "实物温润通透，证书齐全，佩戴后很喜欢。", image: "" },
    ],
    bgColor: "#FBF9F6",
    locked: false,
  } satisfies TestimonialPuckProps,
  fields: {
    title: { type: "text" as const, label: "标题" },
    subtitle: { type: "textarea" as const, label: "副标题" },
    testimonials: { type: "array" as const, label: "评价列表", arrayFields: {
      name: { type: "text" as const, label: "顾客称呼" },
      meta: { type: "text" as const, label: "购买信息" },
      content: { type: "textarea" as const, label: "评价内容" },
      image: { type: "custom" as const, label: "实拍图（可选）", render: ({ value, onChange, readOnly }: { value?: string; onChange: (value: string) => void; readOnly?: boolean }) => <MediaPickerField fieldKey="image" device="shared" value={value} onChange={onChange} readOnly={readOnly} spec={IMAGE_SPECS.testimonial.image} placeholder="上传顾客实拍图" /> },
    } } as any,
    bgColor: colorPuckField("背景色"),
  },
  resolvePermissions: (data: any) => data.props?.locked ? { delete: false, drag: false } : {},
};
