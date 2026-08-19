/**
 * schema/modules/featuredProduct.ts — 「单品焦点推荐(单品展示)」编辑区 Schema。
 * Hero Piece 母版:品牌页隐藏价格(默认),仅电商页开启。
 */
import {
  FEATURED_PRODUCT_CONTRACT,
  evaluateFeaturedProductContract,
} from "../../../config/blockContracts";
import { createElement } from "react";
import { featuredProductPuckConfig } from "../../../adapters/featuredProduct.puck";
import ProductIdsField from "../../../fields/ProductIdsField";
import { bgColorPresetField, moduleNameField, ratioField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

/** 槽位比例选项(契约派生):作品图全端一致 */
const featuredProductRatioControl = ratioField("featuredProduct", "product", { label: "作品图比例" });

export const featuredProductSchema: ModuleInspectorSchema = {
  moduleType: "单品焦点推荐",
  displayName: "单品展示",
  purpose: FEATURED_PRODUCT_CONTRACT.purpose,
  evaluate: evaluateFeaturedProductContract,
  defaults: { ...featuredProductPuckConfig.defaultProps },
  groupTitles: { product: "选择作品" },
  sections: [
    {
      id: "featured-product",
      title: "商品关联",
      layer: "product",
      description: "从商品系统选择主推作品，作品图固定 4:5，不重复上传",
      fields: [
        {
          key: "productId",
          label: "选择作品",
          control: "custom",
          render: ({ props, update }) =>
            createElement(ProductIdsField, {
              value:
                Number(props.productId) > 0 ? [Number(props.productId)] : [],
              onChange: (ids: number[]) => update({ productId: ids[0] ?? 0 }),
              maxProducts: 1,
            }),
        },
      ],
    },
    {
      id: "featured-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("单品展示"),
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
          placeholder: "如 单品展示",
        },
        {
          key: "summary",
          label: "作品叙事",
          control: "textarea",
          rows: 3,
          maxLength: FEATURED_PRODUCT_CONTRACT.content.limits.summary,
          hint: "设计、材质或工艺的一两句表达",
        },
      ],
    },
    {
      id: "featured-action",
      title: "行动与关联",
      layer: "interaction",
      fields: [
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
          key: "secondaryLinkTarget",
          label: "次行动点击后",
          control: "linkTarget",
          keyPrefix: "secondary",
        },
      ],
    },
    {
      id: "featured-layout",
      title: "布局",
      layer: "layout",
      description: "作品图默认 4:5，可在下方调整；请在商品管理维护作品图片",
      fields: [
        {
          key: "layout",
          label: "桌面版式",
          control: "segmented",
          options: [
            {
              label: "作品图在左",
              value: "imageLeft",
              diagram: "imageLeftTextRight",
            },
            {
              label: "作品图在右",
              value: "imageRight",
              diagram: "textLeftImageRight",
            },
          ],
        },
        ...(featuredProductRatioControl ? [featuredProductRatioControl] : []),
      ],
    },
    {
      id: "featured-style",
      title: "样式",
      layer: "style",
      fields: [bgColorPresetField()],
    },
    {
      id: "featured-feature",
      title: "模板专属功能",
      layer: "feature",
      description: "品牌叙事页保持价格隐藏；仅电商选款场景开启",
      fields: [
        { key: "showPrice", label: "显示价格（仅电商页）", control: "switch" },
      ],
    },
  ],
};
