/**
 * schema/modules/lookbook.ts — 「佩戴灵感(佩戴展示)」编辑区 Schema。
 * Hero Piece 母版(场景变体):4:5 佩戴大片 + 关联作品。
 */
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { lookbookPuckConfig } from "../../../adapters/lookbook.puck";
import { ADVANCED_BG_COLOR_FIELD, altTextField, bgColorPresetField, linkTargetField, moduleNameField, ratioField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

/** 槽位比例选项(契约派生):佩戴大片全端统一 */
const wearingRatioControl = ratioField("wearingInspiration", "wearingImage", { label: "大片比例" });

export const lookbookSchema: ModuleInspectorSchema = {
  moduleType: "佩戴灵感",
  displayName: "佩戴展示",
  purpose: "以 4:5 佩戴大片串联可直接查看的关联作品。",
  defaults: { ...lookbookPuckConfig.defaultProps },
  groupTitles: { media: "佩戴素材", product: "关联作品" },
  sections: [
    {
      id: "lookbook-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("佩戴展示"),
        {
          key: "title",
          label: "标题",
          control: "text",
          maxLength: 24,
          placeholder: "如 佩戴展示",
        },
        {
          key: "subtitle",
          label: "副标题",
          control: "text",
          maxLength: 60,
          hint: "留空不显示",
        },
      ],
    },
    {
      id: "lookbook-product",
      title: "商品关联",
      layer: "product",
      description: "关联可直接查看的站内作品",
      fields: [
        {
          key: "productCodes",
          label: "关联作品（建议 2–4 件）",
          control: "productReferences",
          legacyKey: "productIds",
          minItems: 1,
          maxItems: 4,
        },
      ],
    },
    {
      id: "lookbook-media",
      title: "媒体",
      layer: "media",
      description: "桌面大片占 58% 分栏；手机全宽；比例可在「布局」区调整",
      fields: [
        {
          key: "image",
          label: "佩戴大片",
          control: "media",
          spec: IMAGE_SPECS.lookbook.image,
          required: true,
          focusKeys: { x: "focusX", y: "focusY" },
          placeholder: "上传佩戴大片",
          showSpecCheck: true,
        },
        altTextField(),
      ],
    },
    {
      id: "lookbook-action",
      title: "行动与关联",
      layer: "interaction",
      fields: [
        {
          key: "actionText",
          label: "行动入口文字",
          control: "text",
          maxLength: 12,
          hint: "留空不显示",
          placeholder: "如 查看全部佩戴灵感",
        },
        linkTargetField("行动入口点击后"),
      ],
    },
    ...(wearingRatioControl ? [{
      id: "lookbook-layout",
      title: "布局",
      layer: "layout" as const,
      fields: [wearingRatioControl],
    }] : []),
    {
      id: "lookbook-style",
      title: "样式",
      layer: "style",
      fields: [bgColorPresetField(), ADVANCED_BG_COLOR_FIELD],
    },
  ],
};
