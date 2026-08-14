/**
 * schema/shared.ts — 模块 Schema 的共享字段构造器。
 *
 * 全部模块 Schema 从这里取字段,保证:
 * - 图层名/替代文字/跳转/留白/配色预设等通用字段在所有面板中表现一致;
 * - 焦点一律通过 MediaField 的 focusKeys 呈现(不再暴露裸数字输入);
 * - 背景色只允许预设(Advanced 折叠区内保留自定义色逃生舱)。
 */
import { TONE_PRESETS } from "../../designSystem/tokens";
import { SPACING_OPTIONS } from "../../config/layoutFields";
import type {
  FieldDef,
  LinkTargetFieldDef,
  MediaFieldDef,
  SegmentedFieldDef,
  TextFieldDef,
} from "./types";

/** 图层名称(仅页面结构识别,不进前台) */
export function moduleNameField(defaultName: string): TextFieldDef {
  return {
    key: "moduleName",
    label: "图层名称",
    control: "text",
    maxLength: 24,
    hint: "仅用于页面结构识别",
    placeholder: `默认使用${defaultName}`,
  };
}

/** 图片替代文字 */
export function altTextField(limit = 80): TextFieldDef {
  return {
    key: "altText",
    label: "图片替代文字",
    control: "text",
    maxLength: limit,
    hint: "提升无障碍与搜索表现",
    placeholder: "如 足金镯面錾刻细节",
  };
}

/** 可视化跳转三件套(不暴露裸 URL 输入) */
export function linkTargetField(
  label = "点击跳转",
  hint?: string,
): LinkTargetFieldDef {
  return {
    key: "targetType",
    label,
    control: "linkTarget",
    hint: hint ?? "一个模块只设置一个明确去向",
  };
}

/** 纵向留白三档(映射 Canvas 节奏 token) */
export function spacingField(): SegmentedFieldDef {
  return {
    key: "spacing",
    label: "上下留白",
    control: "segmented",
    options: SPACING_OPTIONS,
  };
}

/** 背景配色预设(一次写 bgColor;与 TONE_PRESETS 单一来源) */
export function bgColorPresetField(): FieldDef {
  return {
    key: "bgColor",
    label: "配色方案",
    control: "preset",
    hint: "品牌调性预设;需要精确色值时展开高级设置",
    options: Object.values(TONE_PRESETS).map((preset) => ({
      label: preset.label,
      value: preset.key,
      patch: { bgColor: preset.bg },
      isActive: (ctx) => ctx.props.bgColor === preset.bg,
    })),
  };
}

/** 高级折叠区:自定义背景色(受控逃生舱) */
export const ADVANCED_BG_COLOR_FIELD: FieldDef = {
  key: "bgColor",
  label: "自定义背景色",
  control: "color",
};

/** Desktop 媒体字段 */
export function desktopMediaField(
  key: string,
  label: string,
  spec: MediaFieldDef["spec"],
  opts: Partial<MediaFieldDef> = {},
): MediaFieldDef {
  return {
    key,
    label,
    control: "media",
    spec,
    device: "desktop",
    showSpecCheck: true,
    ...opts,
  };
}

/**
 * Mobile 媒体字段——带「继承/覆盖」模型:
 * 空值即继承桌面图(渲染层自动回退),覆盖后可单独上传并独立调焦点。
 */
export function mobileMediaField(
  key: string,
  label: string,
  spec: MediaFieldDef["spec"],
  inheritKey: string,
  opts: Partial<MediaFieldDef> = {},
): MediaFieldDef {
  return {
    key,
    label,
    control: "media",
    spec,
    device: "mobile",
    showSpecCheck: true,
    inheritFrom: { key: inheritKey, label: "继承电脑端图片" },
    ...opts,
  };
}
