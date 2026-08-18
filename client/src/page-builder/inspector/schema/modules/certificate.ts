/**
 * schema/modules/certificate.ts — 「资质证书(证书展示·画廊)」编辑区 Schema。
 * Asymmetric Gallery 母版(信任变体):1:1 图墙,无卡片边框。
 */
import { certificatePuckConfig } from "../../../adapters/certificate.puck";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { bgColorPresetField, moduleNameField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

const CERT_IMAGE_SPEC = IMAGE_SPECS.certificate.image;

export const certificateSchema: ModuleInspectorSchema = {
  moduleType: "资质证书",
  displayName: "证书展示",
  purpose: "以画廊式 3:2 图墙展示权威认证，与作品同一视觉语言。",
  defaults: { ...certificatePuckConfig.defaultProps },
  groupTitles: { media: "证书材料" },
  sections: [
    {
      id: "certificate-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("证书展示"),
        {
          key: "title",
          label: "标题",
          control: "text",
          required: true,
          maxLength: 24,
          placeholder: "如 证书展示",
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
      id: "certificate-media",
      title: "素材",
      layer: "media",
      fields: [
        {
          key: "certificates",
          label: "证书条目",
          control: "array",
          itemLabel: "证书",
          defaultItem: { name: "", desc: "", imageUrl: "" },
          itemSummary: (item) =>
            typeof item.name === "string" && item.name.trim()
              ? item.name
              : "未命名证书",
          itemFields: [
            { key: "name", label: "证书名称", control: "text", required: true },
            { key: "desc", label: "一句话说明", control: "text" },
            {
              key: "imageUrl",
              label: "证书图（可选）",
              control: "media",
              spec: CERT_IMAGE_SPEC,
              placeholder: "上传证书图（3:2）",
              showSpecCheck: true,
            },
          ],
        },
      ],
    },
    {
      id: "certificate-style",
      title: "样式",
      layer: "style",
      fields: [bgColorPresetField()],
    },
  ],
};
