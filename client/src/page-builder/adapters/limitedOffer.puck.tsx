import LimitedOfferBlock from "@/components/blocks/LimitedOfferBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface LimitedOfferPuckProps {
  eventImage: string;
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
    eventImage: "",
    eyebrow: "CAMPAIGN",
    title: "活动信息待配置",
    body: "请在发布前填写已确认的活动内容、结束时间与适用规则。",
    targetDate: "",
    benefits: [],
    buttonText: "",
    linkUrl: "",
    bgColor: "#FFFFFF",
    locked: false,
  } satisfies LimitedOfferPuckProps,
  resolvePermissions: (data: any) => data.props?.locked ? { delete: false, drag: false } : {},
};
