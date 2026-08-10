/**
 * cardGrid.puck.ts — CardGridBlock 适配器（数组字段）
 */

import CardGridBlock from "@/components/blocks/CardGridBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";
import { colorPuckField } from "../fields/ColorField";

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

export const cardGridPuckConfig = {
  render: (props: CardGridPuckProps) => (
    <CardGridBlock module={convertPuckProps("卡片网格", props as any) as any} />
  ),
  defaultProps: {
    title: "品牌价值",
    subtitle: "",
    cards: [
      { icon: "", title: "匠心工艺", body: "每件作品均由资深工匠手工打造" },
      { icon: "", title: "真材实料", body: "所有材质均附国家权威检测证书" },
      { icon: "", title: "终身保养", body: "购买即享终身免费清洗保养服务" },
    ],
    layout: "grid-3",
    bgColor: "#FCFCFB",
    locked: false,
  } satisfies CardGridPuckProps,
  fields: {
    title: { type: "text" as const, label: "标题" },
    subtitle: { type: "text" as const, label: "副标题" },
    cards: {
      type: "array" as const,
      label: "卡片列表",
      arrayFields: {
        icon: { type: "text" as const, label: "图标" },
        title: { type: "text" as const, label: "卡片标题" },
        body: { type: "textarea" as const, label: "卡片正文" },
      },
    } as any,
    layout: {
      type: "radio" as const,
      label: "列数",
      options: [
        { label: "2 列", value: "grid-2" },
        { label: "3 列", value: "grid-3" },
        { label: "4 列", value: "grid-4" },
      ],
    },
    bgColor: colorPuckField("背景色"),
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
