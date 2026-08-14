/**
 * schema/types.ts — 模块编辑区（Inspector）的声明式 Schema 类型。
 *
 * 四层信息架构：内容(content) → 布局(layout) → 样式(style) → 交互(interaction)。
 * Schema 是纯 TS 常量：类型安全、可跳转定义、无运行时表单引擎依赖。
 * 字段的 key 即 Puck props 键名（持久化格式），面板只负责呈现与写入。
 */
import type { ReactNode } from "react";
import type { MediaSpec } from "../../fields/MediaPickerField";
import type { ModuleContractStatus } from "../../config/blockContracts";

export type InspectorLayer = "content" | "layout" | "style" | "interaction";

/** 层的固定排序（渲染顺序）与业务展示名 */
export const INSPECTOR_LAYER_ORDER: InspectorLayer[] = [
  "content",
  "layout",
  "style",
  "interaction",
];

export const INSPECTOR_LAYER_TITLES: Record<InspectorLayer, string> = {
  content: "内容",
  layout: "布局",
  style: "样式",
  interaction: "交互",
};

export type InspectorDevice = "desktop" | "mobile";

/** 传给 visibleWhen / isActive / custom render 的编辑上下文 */
export interface InspectorContext {
  props: Record<string, any>;
  device: InspectorDevice;
  viewportWidth: number | "100%";
}

/* ═══════ 字段定义 ═══════ */

interface FieldBase {
  /** Puck props 键名（写入路径）；preset/linkTarget 等组合控件可填主要键 */
  key: string;
  label: string;
  /** 业务语言说明，展示在 label 右侧 */
  hint?: string;
  /** 必填标记；影响样式与契约联动 */
  required?: boolean;
  /** 与服务端 PUCK_TEXT_FIELD_LIMITS 对齐的长度上限 */
  maxLength?: number;
  placeholder?: string;
  /** 条件显示：返回 false 时该字段不渲染 */
  visibleWhen?: (ctx: InspectorContext) => boolean;
  /**
   * 响应式归属：
   * - shared：全设备共用一份
   * - desktop / mobile：仅在对应设备档编辑（配合「继承/覆盖」UI）
   */
  device?: "shared" | "desktop" | "mobile";
}

export interface TextFieldDef extends FieldBase {
  control: "text" | "textarea";
  rows?: number;
  /** 显示字数计数（默认 text/textarea 且有 maxLength 时开启） */
  showCount?: boolean;
}

export interface SegmentedFieldDef extends FieldBase {
  control: "segmented";
  options: ReadonlyArray<{ label: string; value: string }>;
}

export interface SwitchFieldDef extends FieldBase {
  control: "switch";
}

export interface SelectFieldDef extends FieldBase {
  control: "select";
  options: ReadonlyArray<{ label: string; value: string }>;
}

export interface ColorFieldDef extends FieldBase {
  control: "color";
}

export interface MediaFieldDef extends FieldBase {
  control: "media";
  spec: MediaSpec;
  /** 需要焦点裁切时的焦点键名（如 { x: "focusX", y: "focusY" }） */
  focusKeys?: { x: string; y: string };
  /** 裁切预览比例（CSS aspect-ratio 语法） */
  previewAspectRatio?: string;
  /** 是否内嵌图片规格检查（ImageStatus） */
  showSpecCheck?: boolean;
}

/** 链接三件套：一次写入 { targetType, productId?, linkUrl? } */
export interface LinkTargetFieldDef extends FieldBase {
  control: "linkTarget";
  /** 覆盖默认 label（“点击后跳转”） */
  linkLabel?: string;
  /** 覆盖默认说明 */
  linkDescription?: string;
}

/** 设计预设：一次写入多个键（patch），如配色方案同时写 bgColor+textColor */
export interface PresetFieldDef extends FieldBase {
  control: "preset";
  options: ReadonlyArray<{
    label: string;
    value: string;
    /** 点击预设时写入 props 的键值组 */
    patch: Record<string, any>;
    /** 判断当前 props 是否命中该预设（高亮） */
    isActive?: (ctx: InspectorContext) => boolean;
  }>;
}

/** 逃生舱：热区编辑器等无法声明化的复杂交互 */
export interface CustomFieldDef extends FieldBase {
  control: "custom";
  render: (
    ctx: InspectorContext & {
      update: (patch: Record<string, any>) => void;
    },
  ) => ReactNode;
}

/** 条目列表：卡片/证书/步骤等一对多内容（一层，与 Puck arrayFields 深度一致） */
export interface ArrayFieldDef extends FieldBase {
  control: "array";
  /** 条目业务名，如 "卡片" */
  itemLabel: string;
  /** 新增条目的初始值 */
  defaultItem?: Record<string, any>;
  maxItems?: number;
  /** 条目字段（复用 FieldDef；条目内不可再嵌套 array） */
  itemFields: FieldDef[];
  /** 条目导航摘要（如卡片标题） */
  itemSummary?: (item: Record<string, any>) => string;
}

export type FieldDef =
  | TextFieldDef
  | SegmentedFieldDef
  | SwitchFieldDef
  | SelectFieldDef
  | ColorFieldDef
  | MediaFieldDef
  | LinkTargetFieldDef
  | PresetFieldDef
  | CustomFieldDef
  | ArrayFieldDef;

/* ═══════ 分区定义 ═══════ */

export interface SectionDef {
  id: string;
  title: string;
  layer: InspectorLayer;
  /** 折叠分区（如高级设置）；defaultCollapsed 默认收起 */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  description?: string;
  visibleWhen?: (ctx: InspectorContext) => boolean;
  fields: FieldDef[];
}

/* ═══════ 模块 Schema ═══════ */

export interface ModuleInspectorSchema {
  /** Puck 组件类型中文名（与 puckConfig.components 的 key 一致），如 "文字横幅" */
  moduleType: string;
  /** 业务展示名（BLOCK_META.name），如 "引导横幅" */
  displayName: string;
  /** 模块用途一句话，展示在面板顶部 */
  purpose?: string;
  /** 完成度横幅；无契约的模块可省略 */
  evaluate?: (props: Record<string, any>) => ModuleContractStatus;
  /** 「恢复默认」使用；缺省时取 adapter defaultProps */
  defaults?: Record<string, any>;
  sections: SectionDef[];
}
