/**
 * schema/modules/productRow.ts — 「产品展示行(商品列表)」编辑区 Schema。
 * Commerce Grid 母版:商品图默认竖版 4:5,比例可在竖版/方形间切换(契约派生)。
 */
import {
  PRODUCT_ROW_CONTRACT,
  evaluateProductRowContract,
} from "../../../config/blockContracts";
import { createElement } from "react";
import { productRowPuckConfig } from "../../../adapters/productRow.puck";
import ProductIdsField from "../../../fields/ProductIdsField";
import { bgColorPresetField, moduleNameField, ratioField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

/** 商品图比例选项由契约预设派生;锁定时控件自动消失 */
const productRowRatioControl = ratioField("productRow", "productCards", {
  key: "imageRatio",
  label: "商品图比例",
  hint: "商品图从商品系统读取，按所选比例自动焦点裁切",
});

export const productRowSchema: ModuleInspectorSchema = {
  moduleType: "产品展示行",
  displayName: "商品列表",
  purpose: PRODUCT_ROW_CONTRACT.purpose,
  evaluate: evaluateProductRowContract,
  defaults: { ...productRowPuckConfig.defaultProps },
  groupTitles: { product: "选择商品" },
  sections: [
    {
      id: "product-row-product",
      title: "商品关联",
      layer: "product",
      description: "从商品系统选择商品，商品图默认竖版 4:5，不重复上传",
      fields: [
        {
          key: "productIds",
          label: "选择商品",
          control: "custom",
          render: ({ props, update }) =>
            createElement(ProductIdsField, {
              value: Array.isArray(props.productIds) ? props.productIds : [],
              onChange: (ids: number[]) => update({ productIds: ids }),
            }),
        },
      ],
    },
    {
      id: "product-row-content",
      title: "内容",
      layer: "content",
      description: "商品图默认竖版 4:5，请在商品管理维护作品图片",
      fields: [
        moduleNameField("商品列表"),
        {
          key: "title",
          label: "标题",
          control: "text",
          maxLength: PRODUCT_ROW_CONTRACT.content.limits.title,
          hint: "留空则直接展示商品",
          placeholder: "如 本季精选",
        },
        {
          key: "subtitle",
          label: "副标题",
          control: "text",
          maxLength: PRODUCT_ROW_CONTRACT.content.limits.subtitle,
          hint: "留空不显示",
        },
      ],
    },
    {
      id: "product-row-layout",
      title: "布局",
      layer: "layout",
      fields: [
        {
          key: "layout",
          label: "电脑端列数",
          control: "segmented",
          options: [
            { label: "2 列", value: "grid-2" },
            { label: "3 列", value: "grid-3" },
            { label: "4 列", value: "grid-4" },
          ],
        },
        {
          key: "mobileColumns",
          label: "手机端列数",
          control: "segmented",
          options: [
            { label: "1 列", value: "1" },
            { label: "2 列", value: "2" },
          ],
        },
        {
          key: "displayMode",
          label: "展示模式",
          control: "segmented",
          options: [
            { label: "标准选款", value: "standard" },
            { label: "画册展示", value: "album" },
          ],
        },
        ...(productRowRatioControl ? [productRowRatioControl] : []),
        {
          key: "actionStyle",
          label: "操作样式",
          control: "segmented",
          options: [
            { label: "整卡点击", value: "none" },
            { label: "文字链接", value: "text" },
            { label: "描边按钮", value: "button" },
          ],
        },
        {
          key: "showPrice",
          label: "显示价格",
          control: "switch",
          visibleWhen: (ctx) => ctx.props.displayMode !== "album",
        },
      ],
    },
    {
      id: "product-row-style",
      title: "样式",
      layer: "style",
      fields: [bgColorPresetField()],
    },
  ],
};
