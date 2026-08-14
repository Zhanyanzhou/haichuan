/**
 * schema/modules/splitPanel.ts — 「分割面板」编辑区 Schema。
 * 左图右文对称叙事区块：内容（文案+配图）→ 布局（图片位置+比例）→
 * 样式（背景双色）→ 交互（可视化跳转）。
 */
import {
  SPLIT_PANEL_CONTRACT,
  evaluateSplitPanelContract,
} from "../../../config/blockContracts";
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { splitPanelPuckConfig } from "../../../adapters/splitPanel.puck";
import type { ModuleInspectorSchema } from "../types";

export const splitPanelSchema: ModuleInspectorSchema = {
  moduleType: "分割面板",
  displayName: "分割面板",
  purpose: SPLIT_PANEL_CONTRACT.purpose,
  evaluate: evaluateSplitPanelContract,
  // 恢复默认以 adapter defaultProps 为准（引用而非复写），并补齐三件套初始键
  defaults: {
    ...splitPanelPuckConfig.defaultProps,
    targetType: "none",
    productId: 0,
  },
  sections: [
    {
      id: "split-panel-content",
      title: "内容",
      layer: "content",
      fields: [
        {
          key: "moduleName",
          label: "图层名称",
          control: "text",
          maxLength: 24,
          hint: "仅用于页面结构识别",
          placeholder: "默认使用分割面板",
        },
        {
          key: "title",
          label: "标题",
          control: "text",
          required: true,
          maxLength: SPLIT_PANEL_CONTRACT.content.limits.title,
          placeholder: "区块主标题",
        },
        {
          key: "subtitle",
          label: "副标题",
          control: "text",
          maxLength: SPLIT_PANEL_CONTRACT.content.limits.subtitle,
          hint: "留空不显示",
        },
        {
          key: "body",
          label: "正文",
          control: "textarea",
          rows: 3,
          maxLength: SPLIT_PANEL_CONTRACT.content.limits.body,
          placeholder: "品牌故事或工艺说明",
        },
        {
          key: "buttonText",
          label: "按钮文字",
          control: "text",
          maxLength: SPLIT_PANEL_CONTRACT.content.limits.buttonText,
          hint: "留空不显示按钮",
        },
        {
          key: "image",
          label: "配图",
          control: "media",
          required: true,
          spec: IMAGE_SPECS.splitPanel.image,
          placeholder: "上传分栏配图",
          showSpecCheck: true,
        },
      ],
    },
    {
      id: "split-panel-layout",
      title: "布局",
      layer: "layout",
      fields: [
        {
          key: "template",
          label: "图片位置",
          control: "segmented",
          options: [
            { label: "图左文右", value: "imageLeft" },
            { label: "图右文左", value: "imageRight" },
          ],
        },
        {
          key: "split",
          label: "分割比例",
          control: "segmented",
          options: [
            { label: "50:50", value: "50-50" },
            { label: "60:40", value: "60-40" },
            { label: "40:60", value: "40:60" },
          ],
        },
      ],
    },
    {
      id: "split-panel-style",
      title: "样式",
      layer: "style",
      fields: [
        {
          key: "bgColor",
          label: "页面背景色",
          control: "color",
        },
        {
          key: "textBg",
          label: "文字区背景",
          control: "color",
          hint: "与页面背景形成层次",
        },
      ],
    },
    {
      id: "split-panel-interaction",
      title: "交互",
      layer: "interaction",
      fields: [
        {
          key: "targetType",
          label: "点击跳转",
          control: "linkTarget",
          linkLabel: "按钮点击后",
          hint: "按钮文字与跳转都设置后前台才显示按钮",
        },
      ],
    },
  ],
};
