/**
 * schema/modules/fullBleed.ts — 「全屏出血图(沉浸视觉)」编辑区 Schema。
 * Immersive Image 母版:全宽定比 21:6 / 4:5,双端素材与双焦点。
 */
import {
  FULL_BLEED_CONTRACT,
  evaluateFullBleedContract,
} from "../../../config/blockContracts";
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { fullBleedPuckConfig } from "../../../adapters/fullBleed.puck";
import {
  altTextField,
  desktopMediaField,
  linkTargetField,
  mobileMediaField,
  moduleNameField,
} from "../shared";
import type { ModuleInspectorSchema } from "../types";

export const fullBleedSchema: ModuleInspectorSchema = {
  moduleType: "全屏出血图",
  displayName: "沉浸视觉",
  purpose: FULL_BLEED_CONTRACT.purpose,
  evaluate: evaluateFullBleedContract,
  defaults: { ...fullBleedPuckConfig.defaultProps },
  sections: [
    {
      id: "full-bleed-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("沉浸视觉"),
        {
          key: "title",
          label: "标题",
          control: "text",
          maxLength: FULL_BLEED_CONTRACT.content.limits.title,
          hint: "留空即为纯视觉章节",
          placeholder: "如 细节之中，自有秩序",
        },
        {
          key: "subtitle",
          label: "副标题",
          control: "text",
          maxLength: FULL_BLEED_CONTRACT.content.limits.subtitle,
          hint: "留空不显示",
        },
        {
          key: "buttonText",
          label: "引导文字",
          control: "text",
          maxLength: FULL_BLEED_CONTRACT.content.limits.actionText,
          hint: "留空则整图点击跳转",
          placeholder: "如 进入系列",
        },
        linkTargetField("点击后"),
      ],
    },
    {
      id: "full-bleed-media",
      title: "媒体",
      layer: "media",
      description: "桌面 21:6 超宽横幅；手机独立 4:5 竖图",
      fields: [
        desktopMediaField("image", "桌面端海报", IMAGE_SPECS.fullBleed.desktop, {
          required: true,
          focusKeys: { x: "desktopFocusX", y: "desktopFocusY" },
          placeholder: "上传桌面端海报（21:6）",
        }),
        mobileMediaField("mobileImage", "手机端海报", IMAGE_SPECS.fullBleed.mobile, "image", {
          focusKeys: { x: "mobileFocusX", y: "mobileFocusY" },
          placeholder: "上传手机端海报（4:5）",
        }),
      ],
    },
    {
      id: "full-bleed-layout",
      title: "布局",
      layer: "layout",
      fields: [
        {
          key: "template",
          label: "文字位置",
          control: "segmented",
          options: [
            { label: "居中", value: "textCenter", diagram: "textCenter" },
            { label: "左对齐", value: "textLeft", diagram: "textLeft" },
            { label: "右对齐", value: "textRight", diagram: "textRight" },
            { label: "左下", value: "textBottomLeft", diagram: "textBottomLeft" },
          ],
        },
        {
          key: "overlayPreset",
          label: "文字遮罩",
          control: "segmented",
          options: [
            { label: "无", value: "none" },
            { label: "柔和", value: "soft" },
            { label: "加强", value: "strong" },
          ],
        },
      ],
    },
    {
      id: "full-bleed-advanced",
      title: "高级设置",
      layer: "style",
      description: "SEO 与无障碍用，不在页面显示",
      fields: [altTextField(FULL_BLEED_CONTRACT.content.limits.altText)],
    },
  ],
};
