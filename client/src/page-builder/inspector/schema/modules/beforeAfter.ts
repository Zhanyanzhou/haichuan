/**
 * schema/modules/beforeAfter.ts — 「改款对比(前后对比)」编辑区 Schema。
 * Editorial Story 母版(改款叙事变体):同比例双图滑动对比,默认使用模板画框比例,
 * 页面实例可显式选择图片裁切比例,两图各自独立焦点。
 */
import {
  BEFORE_AFTER_CONTRACT,
  evaluateBeforeAfterContract,
} from "../../../config/blockContracts";
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { beforeAfterPuckConfig } from "../../../adapters/beforeAfter.puck";
import { ADVANCED_BG_COLOR_FIELD, bgColorPresetField, linkTargetField, moduleNameField, ratioField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

/** 槽位裁切比例选项(契约派生):改款前后两图同步应用 */
const beforeAfterRatioControl = ratioField("comparison", "before", {
  label: "图片裁切比例",
  hint: "显式选择后覆盖模板默认画框；改款前后两图同步应用",
});

export const beforeAfterSchema: ModuleInspectorSchema = {
  moduleType: "改款对比",
  displayName: "前后对比",
  purpose: BEFORE_AFTER_CONTRACT.purpose,
  evaluate: evaluateBeforeAfterContract,
  defaults: { ...beforeAfterPuckConfig.defaultProps },
  groupTitles: { media: "对比图片" },
  sections: [
    {
      id: "before-after-media",
      title: "媒体",
      layer: "media",
      description: "前后两张图建议同机位、同比例，对比效果最佳",
      fields: [
        {
          key: "beforeImage",
          label: "改款前图片",
          control: "media",
          spec: IMAGE_SPECS.beforeAfter.image,
          required: true,
          focusKeys: { x: "beforeFocusX", y: "beforeFocusY" },
          placeholder: "上传改款前图片",
          showSpecCheck: true,
        },
        {
          key: "beforeLabel",
          label: "改款前标签",
          control: "text",
          maxLength: BEFORE_AFTER_CONTRACT.content.limits.label,
        },
        {
          key: "beforeAltText",
          label: "改款前替代文字",
          control: "text",
          required: true,
          maxLength: BEFORE_AFTER_CONTRACT.content.limits.altText,
        },
        {
          key: "afterImage",
          label: "改款后图片",
          control: "media",
          spec: IMAGE_SPECS.beforeAfter.image,
          required: true,
          focusKeys: { x: "afterFocusX", y: "afterFocusY" },
          placeholder: "上传改款后图片",
          showSpecCheck: true,
        },
        {
          key: "afterLabel",
          label: "改款后标签",
          control: "text",
          maxLength: BEFORE_AFTER_CONTRACT.content.limits.label,
        },
        {
          key: "afterAltText",
          label: "改款后替代文字",
          control: "text",
          required: true,
          maxLength: BEFORE_AFTER_CONTRACT.content.limits.altText,
        },
      ],
    },
    {
      id: "before-after-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("前后对比"),
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
      ],
    },
    {
      id: "before-after-action",
      title: "行动与关联",
      layer: "interaction",
      fields: [
        {
          key: "actionText",
          label: "行动入口文字",
          control: "text",
          maxLength: 12,
          hint: "留空不显示",
          placeholder: "如 预约改款",
        },
        linkTargetField("行动入口点击后"),
      ],
    },
    ...(beforeAfterRatioControl ? [{
      id: "before-after-layout",
      title: "布局",
      layer: "layout" as const,
      fields: [beforeAfterRatioControl],
    }] : []),
    {
      id: "before-after-style",
      title: "样式",
      layer: "style",
      fields: [bgColorPresetField(), ADVANCED_BG_COLOR_FIELD],
    },
  ],
};
