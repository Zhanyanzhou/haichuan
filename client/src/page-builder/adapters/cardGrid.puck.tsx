/**
 * cardGrid.puck.ts — CardGridBlock 适配器（数组字段）
 */

import CardGridBlock from "@/components/blocks/CardGridBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface CardItem {
  icon?: string;
  title: string;
  body: string;
}

export interface CardGridPuckProps {
  title: string;
  subtitle: string;
  cards: CardItem[];
  layout: string;
  bgColor: string;
  locked?: boolean;
}

export function renderCardGridPuck(
  props: CardGridPuckProps,
  contentTemplateKey: "brandPoints" | "servicePromises" = "brandPoints",
) {
  return (
    <CardGridBlock
      module={convertPuckProps(
        contentTemplateKey === "servicePromises" ? "服务承诺" : "卡片网格",
        props as any,
      ) as any}
      contentTemplateKey={contentTemplateKey}
    />
  );
}

export const cardGridPuckConfig = {
  render: (props: CardGridPuckProps) => renderCardGridPuck(props),
  defaultProps: {
    title: "品牌要点待确认",
    subtitle: "请填写经品牌确认的真实信息。",
    cards: [
      { icon: "", title: "要点一待确认", body: "请填写经品牌确认的要点说明。" },
      { icon: "", title: "要点二待确认", body: "请填写经品牌确认的要点说明。" },
      { icon: "", title: "要点三待确认", body: "请填写经品牌确认的要点说明。" },
    ],
    layout: "grid-3",
    bgColor: "#FFFFFF",
    locked: false,
  } satisfies CardGridPuckProps,
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
