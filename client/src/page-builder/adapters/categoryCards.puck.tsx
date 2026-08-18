/**
 * categoryCards.puck.ts — CategoryCardsBlock 适配器
 */

import CategoryCardsBlock from "@/components/blocks/CategoryCardsBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface CategoryCardItem {
  name: string;
  image: string;
  link: string;
  count?: string;
  description?: string;
  altText?: string;
  focusX?: number;
  focusY?: number;
}

export interface CategoryCardsPuckProps {
  title: string;
  subtitle?: string;
  /**
   * 分类卡片数据（P1-42：原仅录入 categoryId，但渲染端期望 categories 数组，
   * 导致区块恒空不可用。改为直接配置 categories，每项含 name/image/link/count。
   * 每项均独立维护名称、图片、跳转与辅助信息。）
   */
  categories: CategoryCardItem[];
  layout: string;
  bgColor: string;
  locked?: boolean;
}

export const categoryCardsPuckConfig = {
  render: (props: CategoryCardsPuckProps) => (
    <CategoryCardsBlock module={convertPuckProps("分类卡片", props as any) as any} editMode />
  ),
  defaultProps: {
    title: "探索分类",
    subtitle: "按品类、系列或主题，找到适合你的珠宝作品。",
    categories: [
      { name: "手镯", image: "", link: "/products", count: "" },
      { name: "吊坠", image: "", link: "/products", count: "" },
      { name: "戒指", image: "", link: "/products", count: "" },
    ],
    layout: "grid-3",
    bgColor: "#FFFFFF",
    locked: false,
  } satisfies CategoryCardsPuckProps,
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
