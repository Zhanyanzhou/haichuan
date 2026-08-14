/**
 * categoryCards.puck.ts — CategoryCardsBlock 适配器
 */

import CategoryCardsBlock from "@/components/blocks/CategoryCardsBlock";
import { IMAGE_SPECS } from "../config/imageSpecs";
import { convertPuckProps } from "../utils/puckPropsToModule";
import { colorPuckField } from "../fields/ColorField";
import MediaPickerField from "../fields/MediaPickerField";

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
    bgColor: "#FBF9F6",
    locked: false,
  } satisfies CategoryCardsPuckProps,
  fields: {
    title: { type: "text" as const, label: "标题" },
    subtitle: { type: "textarea" as const, label: "副标题（可选）" },
    categories: {
      type: "array" as const,
      label: "分类卡片",
      arrayFields: {
        name: { type: "text" as const, label: "名称" },
        image: {
          type: "custom" as const,
          label: "卡片图片",
          render: ({
            value, onChange, readOnly,
          }: { value?: string; onChange: (value: string) => void; readOnly?: boolean }) => (
            <MediaPickerField
              fieldKey="image"
              device="shared"
              value={value}
              onChange={onChange}
              readOnly={readOnly}
              spec={IMAGE_SPECS.categoryCards.image}
              placeholder="上传分类卡片图片"
            />
          ),
        },
        link: { type: "text" as const, label: "跳转链接" },
        count: { type: "text" as const, label: "作品数量（可选）" },
        description: { type: "text" as const, label: "辅助文案（可选）" },
        altText: { type: "text" as const, label: "图片替代文字" },
        focusX: { type: "number" as const, label: "焦点 X", min: 0, max: 100 },
        focusY: { type: "number" as const, label: "焦点 Y", min: 0, max: 100 },
      },
      defaultItemProps: { name: "新分类", image: "", link: "/products", count: "", description: "", altText: "", focusX: 50, focusY: 50 },
    },
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
