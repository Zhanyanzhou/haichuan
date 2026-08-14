/**
 * schema/modules/testimonial.ts — 「真实评价与实拍(顾客之声)」编辑区 Schema。
 * Editorial Story 母版(口碑变体):引语式排版,需顾客授权。
 */
import { testimonialPuckConfig } from "../../../adapters/testimonial.puck";
import { bgColorPresetField, moduleNameField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

export const testimonialSchema: ModuleInspectorSchema = {
  moduleType: "真实评价与实拍",
  displayName: "顾客之声",
  purpose: "以引语与授权实拍补充第三方信任证据。",
  defaults: { ...testimonialPuckConfig.defaultProps },
  sections: [
    {
      id: "testimonial-content",
      title: "内容",
      layer: "content",
      description: "真实顾客评价与实拍需取得书面授权后方可展示",
      fields: [
        moduleNameField("顾客之声"),
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
        {
          key: "testimonials",
          label: "顾客引语",
          control: "array",
          itemLabel: "引语",
          defaultItem: { name: "", meta: "", content: "", image: "" },
          itemSummary: (item) =>
            typeof item.name === "string" && item.name.trim()
              ? item.name
              : "未署名引语",
          itemFields: [
            { key: "name", label: "顾客称呼", control: "text", required: true },
            { key: "meta", label: "购买信息", control: "text", hint: "如 订制钻戒" },
            { key: "content", label: "引语内容", control: "textarea", rows: 2, required: true },
            {
              key: "image",
              label: "实拍图（可选 4:3）",
              control: "media",
              spec: { width: 1200, height: 900, ratio: "4:3", label: "实拍图（建议 1200×900，4:3）" },
              placeholder: "上传顾客授权实拍图",
            },
          ],
        },
      ],
    },
    {
      id: "testimonial-style",
      title: "样式",
      layer: "style",
      fields: [bgColorPresetField()],
    },
  ],
};
