/**
 * schema/modules/limitedOffer.ts — 「限时活动」编辑区 Schema。
 * Commerce Campaign 母版:仅电商/活动页使用。
 */
import { limitedOfferPuckConfig } from "../../../adapters/limitedOffer.puck";
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { bgColorPresetField, moduleNameField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

export const limitedOfferSchema: ModuleInspectorSchema = {
  moduleType: "限时活动",
  displayName: "限时活动",
  purpose: "展示真实倒计时与活动权益，承接限时礼遇转化（仅电商页使用）。",
  defaults: { ...limitedOfferPuckConfig.defaultProps },
  sections: [
    {
      id: "limited-offer-media",
      title: "素材",
      layer: "media",
      fields: [
        {
          key: "eventImage",
          label: "活动视觉",
          control: "media",
          spec: IMAGE_SPECS.limitedOffer.event,
          placeholder: "上传活动视觉",
          showSpecCheck: true,
        },
      ],
    },
    {
      id: "limited-offer-content",
      title: "内容",
      layer: "content",
      description: "占位文案（待确认/待配置）无法通过发布校验",
      fields: [
        moduleNameField("限时活动"),
        {
          key: "eyebrow",
          label: "眉题",
          control: "text",
          maxLength: 60,
          placeholder: "如 CAMPAIGN",
        },
        {
          key: "title",
          label: "活动标题",
          control: "text",
          required: true,
          maxLength: 60,
        },
        { key: "body", label: "活动说明", control: "textarea", rows: 2 },
      ],
    },
    {
      id: "limited-offer-feature",
      title: "模板专属功能",
      layer: "feature",
      fields: [
        {
          key: "targetDate",
          label: "结束时间",
          control: "text",
          required: true,
          hint: "发布前按实际活动填写，如 2026-12-31 20:00",
        },
        {
          key: "benefits",
          label: "活动权益",
          control: "array",
          itemLabel: "权益",
          defaultItem: { value: "" },
          itemSummary: (item) =>
            typeof item.value === "string" && item.value.trim()
              ? item.value
              : "新权益",
          itemFields: [{ key: "value", label: "权益文案", control: "text" }],
        },
      ],
    },
    {
      id: "limited-offer-action",
      title: "行动与关联",
      layer: "interaction",
      fields: [
        { key: "buttonText", label: "按钮文字", control: "text" },
        {
          key: "linkUrl",
          label: "按钮链接",
          control: "text",
          hint: "站内路径",
        },
      ],
    },
    {
      id: "limited-offer-style",
      title: "样式",
      layer: "style",
      fields: [bgColorPresetField()],
    },
  ],
};
