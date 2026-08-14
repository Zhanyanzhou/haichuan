/**
 * schema/modules/gallery.ts — 「作品画廊」编辑区 Schema。
 * Asymmetric Gallery 母版:3–5 张多比例图按「大图+双图+大图」节奏非对称排布。
 */
import {
  GALLERY_CONTRACT,
  evaluateGalleryContract,
} from "../../../config/blockContracts";
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { galleryPuckConfig } from "../../../adapters/gallery.puck";
import { bgColorPresetField, moduleNameField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

export const gallerySchema: ModuleInspectorSchema = {
  moduleType: "作品画廊",
  displayName: "作品画廊",
  purpose: GALLERY_CONTRACT.purpose,
  evaluate: evaluateGalleryContract,
  defaults: { ...galleryPuckConfig.defaultProps },
  sections: [
    {
      id: "gallery-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("作品画廊"),
        {
          key: "title",
          label: "标题",
          control: "text",
          required: true,
          maxLength: GALLERY_CONTRACT.content.limits.title,
          placeholder: "如 本季作品",
        },
        {
          key: "subtitle",
          label: "副标题",
          control: "text",
          maxLength: GALLERY_CONTRACT.content.limits.subtitle,
          hint: "留空不显示",
        },
        {
          key: "items",
          label: "画廊图片",
          control: "array",
          itemLabel: "图片",
          maxItems: GALLERY_CONTRACT.content.maxItems,
          defaultItem: { image: "", altText: "", caption: "", link: "" },
          itemSummary: (item) =>
            typeof item.caption === "string" && item.caption.trim()
              ? item.caption
              : "未命名图片",
          itemFields: [
            {
              key: "image",
              label: "图片",
              control: "media",
              spec: IMAGE_SPECS.gallery.primary,
              required: true,
              placeholder: "上传画廊图片",
              showSpecCheck: true,
            },
            {
              key: "caption",
              label: "图注",
              control: "text",
              maxLength: GALLERY_CONTRACT.content.limits.caption,
              hint: "如 FIG. 01 · 系列名",
            },
            {
              key: "altText",
              label: "替代文字",
              control: "text",
              maxLength: GALLERY_CONTRACT.content.limits.altText,
            },
            { key: "link", label: "跳转链接（可选）", control: "text" },
          ],
        },
      ],
    },
    {
      id: "gallery-layout",
      title: "布局",
      layer: "layout",
      description: "桌面自动按「大图→小图→小图→宽图」节奏排布；手机重排为大图与双列交替",
      fields: [],
    },
    {
      id: "gallery-style",
      title: "样式",
      layer: "style",
      fields: [bgColorPresetField()],
    },
  ],
};
