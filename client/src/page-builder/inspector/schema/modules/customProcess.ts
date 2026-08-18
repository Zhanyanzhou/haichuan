/**
 * schema/modules/customProcess.ts — 「定制流程(内容流程)」编辑区 Schema。
 * Journey 母版:01–05 大字叙事,不用步骤圆/连线流程图。
 */
import { customProcessPuckConfig } from "../../../adapters/customProcess.puck";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { bgColorPresetField, moduleNameField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

export const customProcessSchema: ModuleInspectorSchema = {
  moduleType: "定制流程",
  displayName: "内容流程",
  purpose: "以 01–05 大字叙事呈现定制旅程：编号 + 英文题 + 中文一句。",
  defaults: { ...customProcessPuckConfig.defaultProps },
  groupTitles: { media: "旅程节点" },
  sections: [
    {
      id: "custom-process-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("内容流程"),
        {
          key: "title",
          label: "标题",
          control: "text",
          required: true,
          maxLength: 24,
          placeholder: "如 内容流程",
        },
        {
          key: "subtitle",
          label: "副标题",
          control: "text",
          maxLength: 60,
          hint: "留空不显示",
          placeholder: "如 一件珠宝如何为一个人诞生",
        },
      ],
    },
    {
      id: "custom-process-media",
      title: "素材",
      layer: "media",
      fields: [
        {
          key: "steps",
          label: "旅程节点",
          control: "array",
          itemLabel: "节点",
          defaultItem: { number: "", en: "", name: "", desc: "", image: "" },
          itemSummary: (item) =>
            `${item.number || ""} ${item.name || item.en || ""}`.trim() ||
            "新节点",
          itemFields: [
            { key: "number", label: "编号（如 01）", control: "text" },
            { key: "en", label: "英文题（如 DISCOVERY）", control: "text" },
            { key: "name", label: "中文题", control: "text", required: true },
            { key: "desc", label: "一句话说明", control: "textarea", rows: 2 },
            {
              key: "image",
              label: "节点图（可选）",
              control: "media",
              spec: IMAGE_SPECS.customProcess.node,
              placeholder: "上传节点图，可选",
            },
          ],
        },
      ],
    },
    {
      id: "custom-process-style",
      title: "样式",
      layer: "style",
      fields: [bgColorPresetField()],
    },
  ],
};
