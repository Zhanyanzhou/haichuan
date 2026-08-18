/**
 * schema/modules/categoryCards.ts — 「分类卡片/按场景选购(入口卡组)」编辑区 Schema 工厂。
 * Commerce Entry 母版:1:1(品类)或 4:5(场景),Mobile 两列。
 */
import {
  CATEGORY_CARDS_CONTRACT,
  evaluateCategoryCardsContract,
} from "../../../config/blockContracts";
import { IMAGE_SPECS, ratioLabelOf } from "../../../config/imageSpecs";
import { categoryCardsPuckConfig } from "../../../adapters/categoryCards.puck";
import { puckConfig } from "../../../config/puckConfig";
import { bgColorPresetField, moduleNameField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

interface CategoryCardsVariant {
  moduleType: "分类卡片" | "按场景选购";
  displayName: string;
  purpose: string;
  defaults?: Record<string, any>;
}

export function makeCategoryCardsSchema(
  variant: CategoryCardsVariant,
): ModuleInspectorSchema {
  const defaults =
    variant.defaults ??
    puckConfig.components[variant.moduleType]?.defaultProps ??
    categoryCardsPuckConfig.defaultProps;
  // 分类卡片与按场景选购同用本 schema,素材比例按契约分形态派生(1:1 / 4:5)
  const isScene = variant.moduleType === "按场景选购";
  const entrySpec = isScene
    ? IMAGE_SPECS.sceneShopping.image
    : IMAGE_SPECS.categoryCards.image;
  const entryRatioLabel = ratioLabelOf(entrySpec);
  return {
    moduleType: variant.moduleType,
    displayName: variant.displayName,
    purpose: variant.purpose,
    evaluate: evaluateCategoryCardsContract,
    defaults: { ...defaults },
    groupTitles: { media: "卡片素材" },
    sections: [
      {
        id: `${variant.moduleType}-content`,
        title: "内容",
        layer: "content",
        fields: [
          moduleNameField(variant.displayName),
          {
            key: "title",
            label: "标题",
            control: "text",
            required: true,
            maxLength: CATEGORY_CARDS_CONTRACT.content.limits.title,
            placeholder:
              variant.moduleType === "分类卡片"
                ? "如 按品类探索"
                : "如 按场景选购",
          },
          {
            key: "subtitle",
            label: "副标题",
            control: "text",
            maxLength: CATEGORY_CARDS_CONTRACT.content.limits.subtitle,
            hint: "留空不显示",
          },
        ],
      },
      {
        id: `${variant.moduleType}-media`,
        title: "素材",
        layer: "media",
        fields: [
          {
            key: "categories",
            label: "入口卡片",
            control: "array",
            itemLabel: "入口",
            maxItems: CATEGORY_CARDS_CONTRACT.content.maxItems,
            defaultItem: {
              name: "新入口",
              image: "",
              link: "/products",
              count: "",
              description: "",
              altText: "",
              focusX: 50,
              focusY: 50,
            },
            itemSummary: (item) =>
              typeof item.name === "string" && item.name.trim()
                ? item.name
                : "未命名入口",
            itemFields: [
              {
                key: "name",
                label: "名称",
                control: "text",
                required: true,
                maxLength: CATEGORY_CARDS_CONTRACT.content.limits.name,
              },
              {
                key: "image",
                label: "卡片图片",
                control: "media",
                spec: entrySpec,
                required: true,
                placeholder: `上传入口图（${entryRatioLabel}）`,
                showSpecCheck: true,
              },
              {
                key: "description",
                label: "一句话提示",
                control: "text",
                maxLength: CATEGORY_CARDS_CONTRACT.content.limits.description,
                hint: "显示在名称下方",
              },
              {
                key: "link",
                label: "跳转链接",
                control: "text",
                hint: "站内路径",
              },
              {
                key: "altText",
                label: "替代文字",
                control: "text",
                maxLength: CATEGORY_CARDS_CONTRACT.content.limits.altText,
              },
            ],
          },
        ],
      },
      {
        id: `${variant.moduleType}-layout`,
        title: "布局",
        layer: "layout",
        fields: [
          {
            key: "layout",
            label: "电脑端列数",
            control: "segmented",
            options: [
              { label: "2 列（3:2 横幅）", value: "grid-2" },
              { label: "3 列", value: "grid-3" },
              { label: "4 列", value: "grid-4" },
            ],
          },
        ],
      },
      {
        id: `${variant.moduleType}-style`,
        title: "样式",
        layer: "style",
        fields: [bgColorPresetField()],
      },
    ],
  };
}

/** 分类卡片（品类入口） */
export const categoryCardsSchema = makeCategoryCardsSchema({
  moduleType: "分类卡片",
  displayName: "品类入口",
  purpose: CATEGORY_CARDS_CONTRACT.purpose,
});

/** 按场景选购（场景入口,含礼赠等运营预设） */
export const occasionGuideSchema = makeCategoryCardsSchema({
  moduleType: "按场景选购",
  displayName: "场景入口",
  purpose: "按佩戴场景或送礼对象快速进入选购；卡片承担导航不承载商品信息。",
});
