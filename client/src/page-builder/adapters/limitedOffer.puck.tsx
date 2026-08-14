import LimitedOfferBlock from "@/components/blocks/LimitedOfferBlock";
import { colorPuckField } from "../fields/ColorField";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface LimitedOfferPuckProps {
  eyebrow: string;
  title: string;
  body: string;
  targetDate: string;
  benefits: Array<{ value: string }>;
  buttonText: string;
  linkUrl: string;
  bgColor: string;
  locked?: boolean;
}

export const limitedOfferPuckConfig = {
  render: (props: LimitedOfferPuckProps) => {
    const module = convertPuckProps("限时活动", props as any);
    return <LimitedOfferBlock module={module as NonNullable<typeof module>} />;
  },
  defaultProps: {
    eyebrow: "CAMPAIGN",
    title: "活动信息待配置",
    body: "请在发布前填写已确认的活动内容、结束时间与适用规则。",
    targetDate: "",
    benefits: [],
    buttonText: "",
    linkUrl: "",
    bgColor: "#211D19",
    locked: false,
  } satisfies LimitedOfferPuckProps,
  fields: {
    eyebrow: { type: "text" as const, label: "眉题" },
    title: { type: "text" as const, label: "活动标题" },
    body: { type: "textarea" as const, label: "活动说明" },
    targetDate: { type: "text" as const, label: "结束时间（发布前按实际活动填写）" },
    benefits: { type: "array" as const, label: "已确认活动权益", arrayFields: { value: { type: "text" as const, label: "权益文案" } }, defaultItemProps: { value: "待确认权益" } } as any,
    buttonText: { type: "text" as const, label: "按钮文字" },
    linkUrl: { type: "text" as const, label: "按钮链接" },
    bgColor: colorPuckField("背景色"),
  },
  resolvePermissions: (data: any) => data.props?.locked ? { delete: false, drag: false } : {},
};
