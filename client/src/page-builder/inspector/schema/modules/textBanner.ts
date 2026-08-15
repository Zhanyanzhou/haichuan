/**
 * schema/modules/textBanner.ts — 「文字横幅（引导横幅）」编辑区 Schema。
 * 新编辑器框架（SchemaInspectorPanel）的首个样板模块。
 *
 * 四层结构：内容（文案+背景海报）→ 布局（对齐+留白）→ 样式（配色预设）→
 * 交互（可视化跳转）；高级设置收纳自定义色值。
 */
import { TEXT_BANNER_CONTRACT, evaluateTextBannerContract } from "../../../config/blockContracts";
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { textBannerPuckConfig } from "../../../adapters/textBanner.puck";
import type { ModuleInspectorSchema } from "../types";

/** 配色预设：一次写入 bgColor + textColor；不匹配任何预设时（自定义色）不高亮 */
const COLOR_PRESETS = [
  {
    label: "米白经典",
    value: "classic",
    patch: { bgColor: "#FBF9F6", textColor: "#2C2C2C" },
  },
  {
    label: "暖金高级",
    value: "warm",
    patch: { bgColor: "#F5EDE0", textColor: "#2C2C2C" },
  },
  {
    label: "深色典雅",
    value: "dark",
    patch: { bgColor: "#211D19", textColor: "#FFFFFF" },
  },
] as const;

export const textBannerSchema: ModuleInspectorSchema = {
  moduleType: "文字横幅",
  displayName: "品牌宣言",
  purpose: TEXT_BANNER_CONTRACT.purpose,
  evaluate: evaluateTextBannerContract,
  // 恢复默认以 adapter defaultProps 为准（引用而非复写），并补齐三件套初始键
  defaults: {
    ...textBannerPuckConfig.defaultProps,
    targetType: "none",
    productId: 0,
  },
  sections: [
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
          placeholder: "默认使用引导横幅",
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
        {
          key: "buttonText",
          label: "按钮文字",
          control: "text",
          maxLength: TEXT_BANNER_CONTRACT.content.limits.buttonText,
          hint: "留空不显示按钮",
          placeholder: "如 立即选购",
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
      id: "text-banner-media",
      title: "媒体",
      layer: "media",
      description: "背景海报留空使用纯色；设置后文字自动切白保证可读",
      fields: [
        {
          key: "backgroundImage",
          label: "背景海报",
          control: "media",
          spec: IMAGE_SPECS.textBanner.bgImage,
          placeholder: "上传背景海报（21:6，可选）",
          showSpecCheck: true,
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
      ],
    },
    {
      id: "text-banner-style",
      title: "样式",
      layer: "style",
      description: "设置背景海报后建议使用深色典雅或保持白色文字",
      fields: [
        {
          key: "bgColor",
          label: "配色方案",
          control: "preset",
          hint: "品牌调性预设；需要精确色值时展开高级设置",
          options: COLOR_PRESETS.map((preset) => ({
            ...preset,
            isActive: (ctx) => ctx.props.bgColor === preset.patch.bgColor,
          })),
        },
      ],
    },
    {
      id: "text-banner-advanced",
      title: "高级设置",
      layer: "style",
      description: "覆盖配色预设的精确色值",
      fields: [
        {
          key: "bgColor",
          label: "自定义背景色",
          control: "color",
        },
        {
          key: "textColor",
          label: "自定义文字色",
          control: "color",
          hint: "设置背景海报后建议保持白色",
        },
      ],
    },
  ],
};
