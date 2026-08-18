/**
 * schema/modules/doublePoster.ts — 「双图海报(系列对照·双幅)」编辑区 Schema。
 * Editorial Story 母版:主图 3:2 + 细节 4:5 非对称双幅,两图各自焦点。
 */
import {
  DOUBLE_POSTER_CONTRACT,
  evaluateDoublePosterContract,
} from "../../../config/blockContracts";
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { doublePosterPuckConfig } from "../../../adapters/doublePoster.puck";
import { linkTargetField, moduleNameField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

export const doublePosterSchema: ModuleInspectorSchema = {
  moduleType: "双图海报",
  displayName: "双图文",
  purpose: DOUBLE_POSTER_CONTRACT.purpose,
  evaluate: evaluateDoublePosterContract,
  defaults: { ...doublePosterPuckConfig.defaultProps },
  sections: [
    {
      id: "double-poster-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("双图文"),
        {
          key: "title",
          label: "标题",
          control: "text",
          required: true,
          maxLength: DOUBLE_POSTER_CONTRACT.content.limits.title,
          placeholder: "如 金环有序",
        },
        {
          key: "description",
          label: "说明",
          control: "textarea",
          rows: 2,
          maxLength: DOUBLE_POSTER_CONTRACT.content.limits.description,
          hint: "挂在细节图下的一两句说明",
          placeholder: "如 线条、比例与轮廓的共同表达",
        },
        {
          key: "number",
          label: "编号",
          control: "text",
          maxLength: DOUBLE_POSTER_CONTRACT.content.limits.number,
          hint: "留空不显示",
          placeholder: "如 02",
        },
        {
          key: "label",
          label: "标签",
          control: "text",
          maxLength: DOUBLE_POSTER_CONTRACT.content.limits.label,
          hint: "留空不显示",
          placeholder: "如 COLLECTION",
        },
      ],
    },
    {
      id: "double-poster-action",
      title: "行动与关联",
      layer: "interaction",
      fields: [
        {
          key: "actionText",
          label: "引导文字",
          control: "text",
          maxLength: DOUBLE_POSTER_CONTRACT.content.limits.actionText,
          hint: "留空不显示",
          placeholder: "如 查看系列",
        },
        linkTargetField("引导文字点击后"),
      ],
    },
    {
      id: "double-poster-media",
      title: "媒体",
      layer: "media",
      description:
        "主图 3:2（约 2/3 宽）+ 细节图 4:5（细节下移错位）；手机上下排列",
      fields: [
        {
          key: "mainImage",
          label: "主海报",
          control: "media",
          spec: IMAGE_SPECS.doublePoster.main,
          required: true,
          focusKeys: { x: "mainFocusX", y: "mainFocusY" },
          placeholder: "上传主海报（3:2）",
          showSpecCheck: true,
        },
        {
          key: "detailImage",
          label: "细节海报",
          control: "media",
          spec: IMAGE_SPECS.doublePoster.detail,
          required: true,
          focusKeys: { x: "detailFocusX", y: "detailFocusY" },
          placeholder: "上传细节海报（4:5）",
          showSpecCheck: true,
        },
      ],
    },
    {
      id: "double-poster-advanced",
      title: "高级设置",
      layer: "style",
      description: "SEO 与无障碍用，不在页面显示",
      fields: [
        {
          key: "mainAltText",
          label: "主图替代文字",
          control: "text",
          maxLength: DOUBLE_POSTER_CONTRACT.content.limits.mainAltText,
        },
        {
          key: "detailAltText",
          label: "细节图替代文字",
          control: "text",
          maxLength: DOUBLE_POSTER_CONTRACT.content.limits.detailAltText,
        },
      ],
    },
  ],
};
