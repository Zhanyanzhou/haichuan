/**
 * categoryCards.puck.ts — CategoryCardsBlock 适配器
 */

import CategoryCardsBlock from "@/components/blocks/CategoryCardsBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";
import { colorPuckField } from "../fields/ColorField";

export interface CategoryCardsPuckProps {
  title: string;
  categoryId: number;
  layout: string;
  bgColor: string;
  locked?: boolean;
}

export const categoryCardsPuckConfig = {
  render: (props: CategoryCardsPuckProps) => (
    <CategoryCardsBlock module={convertPuckProps("分类卡片", props as any) as any} />
  ),
  defaultProps: {
    title: "探索分类",
    categoryId: 1,
    layout: "grid-3",
    bgColor: "#FBF9F6",
    locked: false,
  } satisfies CategoryCardsPuckProps,
  fields: {
    title: { type: "text" as const, label: "标题" },
    categoryId: { type: "number" as const, label: "分类 ID", min: 1 },
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
