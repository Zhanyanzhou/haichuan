/**
 * schema/modules/certificate.ts — 「资质证书(证书展示·画廊)」编辑区 Schema。
 * Asymmetric Gallery 母版(信任变体):3:2 图墙(可选),无卡片边框。
 */
import { certificatePuckConfig } from "../../../adapters/certificate.puck";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { bgColorPresetField, moduleNameField, ratioField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

const CERT_IMAGE_SPEC = IMAGE_SPECS.certificate.image;

/** 槽位比例选项(契约派生):证书图默认 3:2,信任物证偏横构图 */
const certificateRatioControl = ratioField("certificates", "certificates", { label: "证书图比例" });

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
          defaultItem: { name: "", desc: "", imageUrl: "", focusX: 50, focusY: 50 },
          itemSummary: (item) =>
            typeof item.name === "string" && item.name.trim()
              ? item.name
              : "未命名证书",
          itemFields: [
            {
              key: "imageUrl",
              label: "证书图（可选）",
              control: "media",
              spec: CERT_IMAGE_SPEC,
              focusKeys: { x: "focusX", y: "focusY" },
              placeholder: "上传证书图",
              showSpecCheck: true,
            },
            { key: "name", label: "证书名称", control: "text", required: true },
            { key: "desc", label: "一句话说明", control: "text" },
          ],
        },
      ],
    },
    ...(certificateRatioControl ? [{
      id: "certificate-layout",
      title: "布局",
      layer: "layout" as const,
      fields: [certificateRatioControl],
    }] : []),
    {
      id: "certificate-style",
      title: "样式",
      layer: "style",
      fields: [bgColorPresetField()],
    },
  ],
};
