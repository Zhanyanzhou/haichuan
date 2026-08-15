/**
 * schema/modules/lookbook.ts — 「佩戴灵感(佩戴大片)」编辑区 Schema。
 * Hero Piece 母版(场景变体):4:5 佩戴大片 + 关联作品。
 */
import { createElement } from "react";
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { lookbookPuckConfig } from "../../../adapters/lookbook.puck";
import ProductIdsField from "../../../fields/ProductIdsField";
import { altTextField, bgColorPresetField, moduleNameField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

export const lookbookSchema: ModuleInspectorSchema = {
  moduleType: "佩戴灵感",
  displayName: "佩戴大片",
  purpose: "以 4:5 佩戴大片串联可直接查看的关联作品。",
  defaults: { ...lookbookPuckConfig.defaultProps },
  sections: [
    {
      id: "lookbook-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("佩戴大片"),
        {
          key: "title",
          label: "标题",
          control: "text",
          maxLength: 24,
          placeholder: "如 佩戴灵感",
        },
        {
          key: "subtitle",
          label: "副标题",
          control: "text",
          maxLength: 60,
          hint: "留空不显示",
        },
        {
          key: "productIds",
          label: "关联作品（建议 2–4 件）",
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
      id: "lookbook-media",
      title: "媒体",
      layer: "media",
      description: "桌面 4:5 大片占 58% 分栏；手机全宽",
      fields: [
        {
          key: "image",
          label: "佩戴大片",
          control: "media",
          spec: IMAGE_SPECS.lookbook.image,
          required: true,
          focusKeys: { x: "focusX", y: "focusY" },
          placeholder: "上传佩戴大片（4:5）",
          showSpecCheck: true,
        },
      ],
    },
    {
      id: "lookbook-advanced",
      title: "高级设置",
      layer: "style",
      description: "SEO 与无障碍用，不在页面显示",
      fields: [altTextField()],
    },
    {
      id: "lookbook-style",
      title: "样式",
      layer: "style",
      fields: [bgColorPresetField()],
    },
  ],
};
