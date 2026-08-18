/**
 * schema/modules/fullBleed.ts — 「全屏出血图(沉浸视觉)」编辑区 Schema。
 * Immersive Image 母版:全宽定比 21:9 / 4:5,双端素材与双焦点。
 */
import {
  FULL_BLEED_CONTRACT,
  evaluateFullBleedContract,
} from "../../../config/blockContracts";
import { IMAGE_SPECS, ratioLabelOf } from "../../../config/imageSpecs";
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
  displayName: "通栏图",
  purpose: FULL_BLEED_CONTRACT.purpose,
  evaluate: evaluateFullBleedContract,
  defaults: { ...fullBleedPuckConfig.defaultProps },
  sections: [
    {
      id: "full-bleed-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("通栏图"),
        {
          key: "eyebrow",
          label: "眉题",
          control: "text",
          maxLength: FULL_BLEED_CONTRACT.content.limits.eyebrow,
          hint: "标题上方的小字引导，留空不显示",
          placeholder: "如 COLLECTION",
        },
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
      ],
    },
    {
      id: "full-bleed-action",
      title: "行动与关联",
      layer: "interaction",
      fields: [
        {
          key: "buttonText",
          label: "引导文字",
          control: "text",
          maxLength: FULL_BLEED_CONTRACT.content.limits.buttonText,
          hint: "留空不显示行动入口",
          placeholder: "如 进入系列",
        },
        linkTargetField("点击后"),
      ],
    },
    {
      id: "full-bleed-media",
      title: "媒体",
      layer: "media",
      description: `桌面 ${ratioLabelOf(IMAGE_SPECS.fullBleed.desktop)} 超宽横幅；手机独立 ${ratioLabelOf(IMAGE_SPECS.fullBleed.mobile)} 竖图`,
      fields: [
        desktopMediaField(
          "image",
          "桌面端海报",
          IMAGE_SPECS.fullBleed.desktop,
          {
            required: true,
            focusKeys: { x: "desktopFocusX", y: "desktopFocusY" },
            placeholder: "上传桌面端海报",
          },
        ),
        mobileMediaField(
          "mobileImage",
          "手机端海报",
          IMAGE_SPECS.fullBleed.mobile,
          "image",
          {
            focusKeys: { x: "mobileFocusX", y: "mobileFocusY" },
            placeholder: "上传手机端海报",
          },
        ),
        altTextField(FULL_BLEED_CONTRACT.content.limits.altText),
      ],
    },
  ],
};
