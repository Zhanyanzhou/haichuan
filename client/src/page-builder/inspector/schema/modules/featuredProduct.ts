/**
 * schema/modules/featuredProduct.ts — 「单品焦点推荐(代表作品)」编辑区 Schema。
 * Hero Piece 母版:品牌页隐藏价格(默认),仅电商页开启。
 */
import {
  FEATURED_PRODUCT_CONTRACT,
  evaluateFeaturedProductContract,
} from "../../../config/blockContracts";
import { featuredProductPuckConfig } from "../../../adapters/featuredProduct.puck";
import { bgColorPresetField, moduleNameField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

export const featuredProductSchema: ModuleInspectorSchema = {
  moduleType: "单品焦点推荐",
  displayName: "代表作品",
  purpose: FEATURED_PRODUCT_CONTRACT.purpose,
  evaluate: evaluateFeaturedProductContract,
  defaults: { ...featuredProductPuckConfig.defaultProps },
  sections: [
    {
      id: "featured-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("代表作品"),
        {
          key: "eyebrow",
          label: "眉题",
          control: "text",
          maxLength: FEATURED_PRODUCT_CONTRACT.content.limits.eyebrow,
          hint: "留空不显示",
          placeholder: "如 SIGNATURE PIECE",
        },
        {
          key: "title",
          label: "标题",
          control: "text",
          required: true,
          maxLength: FEATURED_PRODUCT_CONTRACT.content.limits.title,
          placeholder: "如 代表作品",
        },
        {
          key: "summary",
          label: "作品叙事",
          control: "textarea",
          rows: 3,
          maxLength: FEATURED_PRODUCT_CONTRACT.content.limits.summary,
          hint: "设计、材质或工艺的一两句表达",
        },
        {
          key: "primaryText",
          label: "主行动文字",
          control: "text",
          required: true,
          maxLength: FEATURED_PRODUCT_CONTRACT.content.limits.actionText,
          placeholder: "如 查看作品",
        },
        {
          key: "secondaryText",
          label: "次行动文字",
          control: "text",
          maxLength: FEATURED_PRODUCT_CONTRACT.content.limits.actionText,
          hint: "留空不显示；品牌页建议用「预约鉴赏」",
          placeholder: "如 预约鉴赏",
        },
        {
          key: "secondaryLink",
          label: "次行动链接",
          control: "select",
          options: [
            { label: "预约咨询页 /contact", value: "/contact" },
            { label: "珠宝作品页 /products", value: "/products" },
            { label: "选款中心 /catalog", value: "/catalog" },
            { label: "珠宝定制 /custom", value: "/custom" },
          ],
        },
      ],
    },
    {
      id: "featured-layout",
      title: "布局",
      layer: "layout",
      description: "作品图固定 4:5，请在商品管理维护作品图片",
      fields: [
        {
          key: "layout",
          label: "桌面版式",
          control: "segmented",
          options: [
            { label: "作品图在左", value: "imageLeft", diagram: "imageLeftTextRight" },
            { label: "作品图在右", value: "imageRight", diagram: "textLeftImageRight" },
          ],
        },
      ],
    },
    {
      id: "featured-style",
      title: "样式",
      layer: "style",
      description: "品牌叙事页保持价格隐藏；仅电商选款场景开启",
      fields: [
        { key: "showPrice", label: "显示价格（仅电商页）", control: "switch" },
        bgColorPresetField(),
      ],
    },
  ],
};
