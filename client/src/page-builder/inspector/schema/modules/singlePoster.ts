/**
 * schema/modules/singlePoster.ts — 「单图海报(品牌故事)」编辑区 Schema。
 * Editorial Split 母版:38/62 编辑式分栏,双端独立素材与焦点。
 */
import {
  SINGLE_POSTER_CONTRACT,
  evaluateSinglePosterContract,
} from "../../../config/blockContracts";
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { singlePosterPuckConfig } from "../../../adapters/singlePoster.puck";
import {
  altTextField,
  desktopMediaField,
  linkTargetField,
  mobileMediaField,
  moduleNameField,
} from "../shared";
import type { ModuleInspectorSchema } from "../types";

export const singlePosterSchema: ModuleInspectorSchema = {
  moduleType: "单图海报",
  displayName: "单图文",
  purpose: SINGLE_POSTER_CONTRACT.purpose,
  evaluate: evaluateSinglePosterContract,
  defaults: { ...singlePosterPuckConfig.defaultProps },
  sections: [
    {
      id: "single-poster-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("单图文"),
        {
          key: "title",
          label: "标题",
          control: "text",
          required: true,
          maxLength: SINGLE_POSTER_CONTRACT.content.limits.title,
          placeholder: "如 龙纹鎏光",
        },
        {
          key: "subtitle",
          label: "副标题",
          control: "text",
          maxLength: SINGLE_POSTER_CONTRACT.content.limits.subtitle,
          hint: "一句话系列说明",
          placeholder: "如 东方金工 · 当代新境",
        },
        {
          key: "number",
          label: "编号",
          control: "text",
          maxLength: SINGLE_POSTER_CONTRACT.content.limits.number,
          hint: "章节序号，留空不显示",
          placeholder: "如 01",
        },
        {
          key: "label",
          label: "标签",
          control: "text",
          maxLength: SINGLE_POSTER_CONTRACT.content.limits.label,
          hint: "编号旁的英文小字，留空不显示",
          placeholder: "如 SIGNATURE",
        },
      ],
    },
    {
      id: "single-poster-action",
      title: "行动与关联",
      layer: "interaction",
      fields: [
        {
          key: "actionText",
          label: "引导文字",
          control: "text",
          maxLength: SINGLE_POSTER_CONTRACT.content.limits.actionText,
          hint: "底部链接文字，留空不显示",
          placeholder: "如 查看系列",
        },
        linkTargetField("引导文字点击后"),
      ],
    },
    {
      id: "single-poster-media",
      title: "媒体",
      layer: "media",
      description: "桌面 4:5 竖图占 62% 分栏；手机独立 3:4 竖图",
      fields: [
        desktopMediaField(
          "desktopImage",
          "海报主图",
          IMAGE_SPECS.singlePoster.image,
          {
            required: true,
            focusKeys: { x: "desktopFocusX", y: "desktopFocusY" },
            placeholder: "上传海报主图（4:5）",
          },
        ),
        mobileMediaField(
          "mobileImage",
          "手机端海报",
          IMAGE_SPECS.singlePoster.mobile,
          "desktopImage",
          {
            focusKeys: { x: "mobileFocusX", y: "mobileFocusY" },
            placeholder: "上传手机端海报（3:4）",
          },
        ),
      ],
    },
    {
      id: "single-poster-layout",
      title: "布局",
      layer: "layout",
      description: "桌面固定 38/62 编辑式分栏（可镜像），手机自动转为图上文下",
      fields: [
        {
          key: "template",
          label: "构图镜像",
          control: "segmented",
          options: [
            {
              label: "文左图右",
              value: "leftTextRightImage",
              diagram: "textLeftImageRight",
            },
            {
              label: "图左文右",
              value: "leftImageRightText",
              diagram: "imageLeftTextRight",
            },
          ],
        },
      ],
    },
    {
      id: "single-poster-advanced",
      title: "高级设置",
      layer: "style",
      description: "SEO 与无障碍用，不在页面显示",
      fields: [altTextField()],
    },
  ],
};
