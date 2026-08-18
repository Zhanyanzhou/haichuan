/**
 * schema/modules/hotspot.ts — 「热区图(图片热区)」编辑区 Schema。
 * Commerce Campaign 母版:双端底图 + 双端热区;仅电商页使用。
 */
import {
  HOTSPOT_CONTRACT,
  evaluateHotspotContract,
} from "../../../config/blockContracts";
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { hotspotPuckConfig } from "../../../adapters/hotspot.puck";
import { moduleNameField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

const hotspotArrayFields = [
  { key: "label", label: "标签（可选）", control: "text" as const },
  {
    key: "link",
    label: "跳转链接",
    control: "text" as const,
    hint: "站内路径，如 /products",
  },
  { key: "x", label: "左边距 %", control: "text" as const },
  { key: "y", label: "上边距 %", control: "text" as const },
  { key: "width", label: "宽度 %", control: "text" as const },
  { key: "height", label: "高度 %", control: "text" as const },
];

export const hotspotSchema: ModuleInspectorSchema = {
  moduleType: "热区图",
  displayName: "图片热区",
  purpose: HOTSPOT_CONTRACT.purpose,
  evaluate: evaluateHotspotContract,
  defaults: { ...hotspotPuckConfig.defaultProps },
  groupTitles: { media: "热区底图" },
  sections: [
    {
      id: "hotspot-media",
      title: "媒体",
      layer: "media",
      description: "桌面 16:9 / 手机 3:4 底图；热区坐标按各自底图计算",
      fields: [
        moduleNameField("图片热区"),
        {
          key: "image",
          label: "桌面端底图",
          control: "media",
          spec: IMAGE_SPECS.hotspot.desktop,
          required: true,
          device: "desktop",
          placeholder: "上传桌面端底图",
          showSpecCheck: true,
        },
        {
          key: "mobileImage",
          label: "手机端底图",
          control: "media",
          spec: IMAGE_SPECS.hotspot.mobile,
          device: "mobile",
          placeholder: "上传手机端底图",
          showSpecCheck: true,
        },
      ],
    },
    {
      id: "hotspot-content",
      title: "模板专属功能",
      layer: "feature",
      description: "热区在画布上可直接拖拽定位；此处可精确核对数值",
      fields: [
        {
          key: "hotspots",
          label: "桌面端热区",
          control: "array",
          itemLabel: "热区",
          maxItems: HOTSPOT_CONTRACT.content.maxHotspots,
          itemSummary: (item) =>
            typeof item.label === "string" && item.label.trim()
              ? item.label
              : `热区 (${item.x}%, ${item.y}%)`,
          itemFields: hotspotArrayFields,
        },
        {
          key: "mobileHotspots",
          label: "手机端热区",
          control: "array",
          itemLabel: "热区",
          maxItems: HOTSPOT_CONTRACT.content.maxHotspots,
          itemSummary: (item) =>
            typeof item.label === "string" && item.label.trim()
              ? item.label
              : `手机热区 (${item.x}%, ${item.y}%)`,
          itemFields: hotspotArrayFields,
        },
      ],
    },
  ],
};
