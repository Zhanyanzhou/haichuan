/**
 * schema/modules/hero.ts — 「首屏主视觉(品牌电影首屏)」编辑区 Schema。
 * 五层结构:内容(文案+跳转) → 媒体(双端图+双焦点+alt) → 布局(文字位)。
 */
import {
  HERO_CONTRACT,
  evaluateHeroContract,
} from "../../../config/blockContracts";
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { heroPuckConfig } from "../../../adapters/hero.puck";
import {
  altTextField,
  desktopMediaField,
  linkTargetField,
  mobileMediaField,
  moduleNameField,
} from "../shared";
import type { ModuleInspectorSchema } from "../types";

export const heroSchema: ModuleInspectorSchema = {
  moduleType: "首屏主视觉",
  displayName: "首屏",
  purpose: HERO_CONTRACT.purpose,
  evaluate: evaluateHeroContract,
  defaults: { ...heroPuckConfig.defaultProps },
  sections: [
    {
      id: "hero-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("首屏"),
        {
          key: "title",
          label: "主标题",
          control: "text",
          required: true,
          maxLength: HERO_CONTRACT.content.limits.title,
          placeholder: "如 东方之形，自有光华",
        },
        {
          key: "subtitle",
          label: "眉题",
          control: "text",
          maxLength: HERO_CONTRACT.content.limits.subtitle,
          hint: "标题上方的小字引导，留空不显示",
          placeholder: "如 CAMPAIGN / NEW COLLECTION",
        },
      ],
    },
    {
      id: "hero-action",
      title: "行动与关联",
      layer: "interaction",
      fields: [
        {
          key: "actionText",
          label: "行动入口文字",
          control: "text",
          maxLength: HERO_CONTRACT.content.limits.actionText,
          hint: "留空不显示；品牌页建议不超过一个行动入口",
          placeholder: "如 探索系列",
        },
        linkTargetField("行动入口点击后"),
      ],
    },
    {
      id: "hero-media",
      title: "媒体",
      layer: "media",
      description: "首屏按视口裁切；素材建议 桌面 16:7 / 手机 4:5",
      fields: [
        desktopMediaField(
          "desktopImage",
          "桌面端主视觉",
          IMAGE_SPECS.hero.desktop,
          {
            required: true,
            focusKeys: { x: "desktopFocusX", y: "desktopFocusY" },
            placeholder: "上传桌面端主视觉（16:7）",
          },
        ),
        mobileMediaField(
          "mobileImage",
          "手机端主视觉",
          IMAGE_SPECS.hero.mobile,
          "desktopImage",
          {
            focusKeys: { x: "mobileFocusX", y: "mobileFocusY" },
            placeholder: "上传手机端主视觉（4:5）",
          },
        ),
      ],
    },
    {
      id: "hero-layout",
      title: "布局",
      layer: "layout",
      fields: [
        {
          key: "alignment",
          label: "文字位置",
          control: "segmented",
          options: [
            {
              label: "左下（电影式）",
              value: "left",
              diagram: "textBottomLeft",
            },
            { label: "居中", value: "center", diagram: "textCenter" },
          ],
        },
      ],
    },
    {
      id: "hero-advanced",
      title: "高级设置",
      layer: "style",
      description: "SEO 与无障碍用，不在页面显示",
      fields: [altTextField(HERO_CONTRACT.content.limits.altText)],
    },
  ],
};
