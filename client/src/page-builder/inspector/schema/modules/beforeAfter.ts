/**
 * schema/modules/beforeAfter.ts — 「改款对比(改款前后)」编辑区 Schema。
 * Editorial Story 母版(改款叙事变体):4:5 同比例双图滑动对比,两图独立焦点。
 */
import {
  BEFORE_AFTER_CONTRACT,
  evaluateBeforeAfterContract,
} from "../../../config/blockContracts";
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { beforeAfterPuckConfig } from "../../../adapters/beforeAfter.puck";
import { bgColorPresetField, moduleNameField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

export const beforeAfterSchema: ModuleInspectorSchema = {
  moduleType: "改款对比",
  displayName: "改款前后",
  purpose: BEFORE_AFTER_CONTRACT.purpose,
  evaluate: evaluateBeforeAfterContract,
  defaults: { ...beforeAfterPuckConfig.defaultProps },
  sections: [
    {
      id: "before-after-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("改款前后"),
        {
          key: "title",
          label: "标题",
          control: "text",
          required: true,
          maxLength: BEFORE_AFTER_CONTRACT.content.limits.title,
          placeholder: "如 珠宝改款",
        },
        {
          key: "subtitle",
          label: "改款说明",
          control: "textarea",
          rows: 2,
          maxLength: BEFORE_AFTER_CONTRACT.content.limits.subtitle,
          hint: "一两句情感或工艺说明,留空不显示",
          placeholder: "如 旧物的情感，以新的形态延续。",
        },
        {
          key: "beforeLabel",
          label: "改款前标签",
          control: "text",
          maxLength: BEFORE_AFTER_CONTRACT.content.limits.label,
        },
        {
          key: "afterLabel",
          label: "改款后标签",
          control: "text",
          maxLength: BEFORE_AFTER_CONTRACT.content.limits.label,
        },
      ],
    },
    {
      id: "before-after-media",
      title: "媒体",
      layer: "media",
      description: "前后两张图建议同机位、同比例（4:5），对比效果最佳",
      fields: [
        {
          key: "beforeImage",
          label: "改款前图片",
          control: "media",
          spec: IMAGE_SPECS.beforeAfter.image,
          required: true,
          focusKeys: { x: "beforeFocusX", y: "beforeFocusY" },
          placeholder: "上传改款前图片（4:5）",
          showSpecCheck: true,
        },
        {
          key: "beforeAltText",
          label: "改款前替代文字",
          control: "text",
          maxLength: BEFORE_AFTER_CONTRACT.content.limits.altText,
        },
        {
          key: "afterImage",
          label: "改款后图片",
          control: "media",
          spec: IMAGE_SPECS.beforeAfter.image,
          required: true,
          focusKeys: { x: "afterFocusX", y: "afterFocusY" },
          placeholder: "上传改款后图片（4:5）",
          showSpecCheck: true,
        },
        {
          key: "afterAltText",
          label: "改款后替代文字",
          control: "text",
          maxLength: BEFORE_AFTER_CONTRACT.content.limits.altText,
        },
      ],
    },
    {
      id: "before-after-style",
      title: "样式",
      layer: "style",
      fields: [bgColorPresetField()],
    },
  ],
};
