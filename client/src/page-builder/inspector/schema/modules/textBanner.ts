/** 纯文字检查器：内容继续可编辑，布局只暴露对齐与留白两个受控预设；可选背景图。 */
import {
  TEXT_BANNER_CONTRACT,
  evaluateTextBannerContract,
} from "../../../config/blockContracts";
import { textBannerPuckConfig } from "../../../adapters/textBanner.puck";
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import type { ModuleInspectorSchema } from "../types";

export const textBannerSchema: ModuleInspectorSchema = {
  moduleType: "文字横幅",
  displayName: "纯文字",
  purpose: TEXT_BANNER_CONTRACT.purpose,
  evaluate: evaluateTextBannerContract,
  // 恢复默认以 adapter defaultProps 为准（引用而非复写），并补齐三件套初始键
  defaults: {
    ...textBannerPuckConfig.defaultProps,
    targetType: "none",
    productId: 0,
  },
  groupTitles: { media: "背景图（可选）" },
  sections: [
    {
      id: "text-banner-media",
      title: "素材",
      layer: "media",
      fields: [
        {
          key: "bgImage",
          label: "背景图（可选）",
          control: "media",
          spec: IMAGE_SPECS.textBanner.bgImage,
          placeholder: "上传横幅背景图（21:6）",
          showSpecCheck: true,
        },
      ],
    },
    {
      id: "text-banner-content",
      title: "内容",
      layer: "content",
      fields: [
        {
          key: "moduleName",
          label: "图层名称",
          control: "text",
          maxLength: 24,
          hint: "仅用于页面结构识别",
          placeholder: "默认使用纯文字",
        },
        {
          key: "eyebrow",
          label: "眉题",
          control: "text",
          maxLength: TEXT_BANNER_CONTRACT.content.limits.eyebrow,
          hint: "标题上方的小字引导，留空不显示",
          placeholder: "如 NEW ARRIVAL",
        },
        {
          key: "title",
          label: "标题",
          control: "text",
          required: true,
          maxLength: TEXT_BANNER_CONTRACT.content.limits.title,
          placeholder: "横幅主标题",
        },
        {
          key: "body",
          label: "正文",
          control: "textarea",
          rows: 3,
          maxLength: TEXT_BANNER_CONTRACT.content.limits.body,
          placeholder: "补充说明，留空不显示",
        },
      ],
    },
    {
      id: "text-banner-action",
      title: "行动与关联",
      layer: "interaction",
      fields: [
        {
          key: "buttonText",
          label: "按钮文字",
          control: "text",
          maxLength: TEXT_BANNER_CONTRACT.content.limits.buttonText,
          hint: "留空不显示按钮",
          placeholder: "如 了解详情",
        },
        {
          key: "targetType",
          label: "点击跳转",
          control: "linkTarget",
          linkLabel: "按钮点击后",
          hint: "按钮文字与跳转都设置后前台才显示按钮",
        },
      ],
    },
    {
      id: "text-banner-layout",
      title: "布局",
      layer: "layout",
      fields: [
        {
          key: "template",
          label: "文字对齐",
          control: "segmented",
          options: [
            { label: "居中", value: "center", diagram: "alignCenter" },
            { label: "左对齐", value: "left", diagram: "alignLeft" },
          ],
        },
        {
          key: "spacing",
          label: "上下留白",
          control: "segmented",
          options: [
            { label: "标准", value: "normal" },
            { label: "宽松", value: "spacious" },
          ],
        },
      ],
    },
  ],
};
