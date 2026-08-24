/**
 * schema/modules/testimonial.ts — 「真实评价与实拍(顾客分享)」编辑区 Schema。
 * Editorial Story 母版(口碑变体):引语式排版,需顾客授权。
 */
import { testimonialPuckConfig } from "../../../adapters/testimonial.puck";
import { getContractRoleQuantity } from "../../../config/blockContracts";
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { ADVANCED_BG_COLOR_FIELD, bgColorPresetField, moduleNameField, ratioField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

/** 槽位比例选项(契约派生):授权实拍图统一比例 */
const testimonialRatioControl = ratioField("testimonials", "authorizedPhoto", { label: "实拍图比例" });

export const testimonialSchema: ModuleInspectorSchema = {
  moduleType: "真实评价与实拍",
  displayName: "顾客分享",
  purpose: "以引语与授权实拍补充第三方信任证据。",
  defaults: { ...testimonialPuckConfig.defaultProps },
  groupTitles: { media: "顾客引语与实拍" },
  sections: [
    {
      id: "testimonial-content",
      title: "内容",
      layer: "content",
      description: "真实顾客评价与实拍需取得书面授权后方可展示",
      fields: [
        moduleNameField("顾客分享"),
        {
          key: "title",
          label: "标题",
          control: "text",
          required: true,
          maxLength: 24,
          placeholder: "如 来自顾客的真实分享",
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
      id: "testimonial-media",
      title: "素材",
      layer: "media",
      fields: [
        {
          key: "testimonials",
          label: "顾客引语",
          control: "array",
          itemLabel: "引语",
          minItems: getContractRoleQuantity("testimonials", "authorizedPhoto").min,
          maxItems: getContractRoleQuantity("testimonials", "authorizedPhoto").max,
          defaultItem: { name: "", meta: "", content: "", image: "", authorizationConfirmed: false },
          itemSummary: (item) =>
            typeof item.name === "string" && item.name.trim()
              ? item.name
              : "未署名引语",
          itemFields: [
            {
              key: "image",
              label: "实拍图（可选 4:5）",
              control: "media",
              spec: IMAGE_SPECS.testimonial.image,
              placeholder: "上传顾客授权实拍图",
            },
            { key: "name", label: "顾客称呼", control: "text", required: true },
            {
              key: "meta",
              label: "购买信息",
              control: "text",
              hint: "如 订制钻戒",
            },
            {
              key: "content",
              label: "引语内容",
              control: "textarea",
              rows: 2,
              required: true,
            },
            {
              key: "authorizationConfirmed",
              label: "已取得书面授权",
              control: "switch",
              required: true,
              hint: "仅在已留存顾客同意公开展示的书面记录后开启；未确认无法发布。",
            },
          ],
        },
      ],
    },
    ...(testimonialRatioControl ? [{
      id: "testimonial-layout",
      title: "布局",
      layer: "layout" as const,
      fields: [testimonialRatioControl],
    }] : []),
    {
      id: "testimonial-style",
      title: "样式",
      layer: "style",
      fields: [bgColorPresetField(), ADVANCED_BG_COLOR_FIELD],
    },
  ],
};
