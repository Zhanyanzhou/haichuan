/**
 * schema/types.ts — 模块编辑区（Inspector）的声明式 Schema 类型。
 *
 * 七层信息架构：媒体(media) → 商品(product) → 内容(content) → 交互(interaction) → 布局(layout) → 样式(style) → 专属(feature)。
 * 面板分组顺序与展示名由 SchemaInspectorPanel 的 TASK_GROUP_ORDER / TASK_GROUP_META 单一决定。
 * media 层集中管理双端图片/焦点/alt；product 层仅商品选择；interaction 仅保留跳转类字段。
 * Schema 是纯 TS 常量：类型安全、可跳转定义、无运行时表单引擎依赖。
 * 字段的 key 即 Puck props 键名（持久化格式），面板只负责呈现与写入。
 *
 * ── 编写约定（新增模板必读，2026-08-19 定） ────────────────────────────────
 * 1. 分组的显示顺序与名称由 SchemaInspectorPanel 唯一决定，不依赖这里的书写顺序；
 *    section 的 `title` 仅作源码可读性标注，不参与面板渲染。因此：
 *    - sections 建议按七层顺序书写（media → product → content → interaction → layout → style → feature），
 *      同一层只保留一个 section，字段顺序即同组内字段的展示顺序；
 *    - 若某层无字段则整节省略，不要保留空 section。
 * 2. 字段归属由 layer + control 双重决定（getTaskGroup），layer 为主、control 兜底；
 *    因此 linkTarget 字段无论放在哪个 section，都会被归入「行动与关联」组。
 *    写 schema 时 layer 必须与字段语义一致，不得依赖 control 兜底来掩盖 layer 标错。
 * 3. groupTitles 用于「模板专属分组命名」（如商品模板把「图片素材」改为「选择商品」）；
 *    仅在默认分组名会误导运营时才覆盖，能用默认名就不要覆盖。
 * 4. 通用字段一律从 shared.ts 取构造器（moduleName/altText/linkTarget/spacing/bgColor/media），
 *    不要在本文件内重复手写同语义字段，保证跨模板表现一致。
 */
import type { ReactNode } from "react";
import type { MediaSpec } from "../../fields/MediaPickerField";
import type { ModuleContractStatus } from "../../config/blockContracts";
import type { PuckProps } from "../../types";

export type InspectorLayer =
  | "content"
  | "media"
  | "product"
  | "layout"
  | "style"
  | "interaction"
  | "feature";

export type InspectorDevice = "desktop" | "mobile";

/** 传给 visibleWhen / isActive / custom render 的编辑上下文 */
export interface InspectorContext {
  props: PuckProps;
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
  /** diagram: 选项的微缩构图示意键（2026-08-16 布局图示化），由 SegmentedField 内置渲染 */
  options: ReadonlyArray<{ label: string; value: string; diagram?: string }>;
}

/** 数值字段：百分比坐标等（min/max/step 校验） */
export interface NumberFieldDef extends FieldBase {
  control: "number";
  min?: number;
  max?: number;
  step?: number;
  /** 数值单位后缀（如 "%"） */
  unit?: string;
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
  /** 裁切预览比例（CSS aspect-ratio 语法）；缺省按 spec 推导 */
  previewAspectRatio?: string;
  /** 是否内嵌图片规格检查（ImageStatus） */
  showSpecCheck?: boolean;
  /**
   * 移动端「继承/覆盖」模型（空值即继承）：
   * 设置后 mobile 档渲染 DeviceOverrideBadge——
   * 空值显示“继承电脑端”(可拷贝初值),非空显示“恢复继承”(清空回退桌面图)。
   */
  inheritFrom?: { key: string; label: string };
}

/** 视频字段：上传(/upload/video,≤100MB)或粘贴地址,带预览与替换/删除 */
export interface VideoFieldDef extends FieldBase {
  control: "video";
}

/** 链接字段（紧凑一行式）：一次写入 { targetType, productId?, linkUrl? } */
export interface LinkTargetFieldDef extends FieldBase {
  control: "linkTarget";
  /** 覆盖默认 label（“点击后跳转”） */
  linkLabel?: string;
  /** 覆盖默认说明 */
  linkDescription?: string;
  /**
   * 属性键前缀（如 "secondary" → secondaryTargetType/secondaryProductId/secondaryLinkUrl）。
   * 条目级链接（轮播/图库等 arrayFields 内）不需要前缀——键直接落在条目对象上。
   */
  keyPrefix?: string;
  /** 条目内嵌的紧凑形态：省略标题与说明行 */
  compact?: boolean;
}

export interface ProductReferencesFieldDef extends FieldBase {
  control: "productReferences";
  legacyKey?: string;
  multiple?: boolean;
  minItems: number;
  maxItems: number;
}

export interface CategoryReferencesFieldDef extends FieldBase {
  control: "categoryReferences";
  legacyKey?: string;
  minItems: number;
  maxItems: number;
}

/** 设计预设：一次写入多个键（patch），如配色方案同时写 bgColor+textColor */
export interface PresetFieldDef extends FieldBase {
  control: "preset";
  options: ReadonlyArray<{
    label: string;
    value: string;
    /** 点击预设时写入 props 的键值组 */
    patch: PuckProps;
    /** 判断当前 props 是否命中该预设（高亮） */
    isActive?: (ctx: InspectorContext) => boolean;
  }>;
}

/** 逃生舱：热区编辑器等无法声明化的复杂交互 */
export interface CustomFieldDef extends FieldBase {
  control: "custom";
  render: (
    ctx: InspectorContext & {
      update: (patch: PuckProps) => void;
    },
  ) => ReactNode;
}

/** 条目列表：卡片/证书/步骤等一对多内容（一层，与 Puck arrayFields 深度一致） */
export interface ArrayFieldDef extends FieldBase {
  control: "array";
  /** 条目业务名，如 "卡片" */
  itemLabel: string;
  /** 新增条目的初始值 */
  defaultItem?: PuckProps;
  /** 合同允许的最少条目数；删除按钮与发布提示共同遵守 */
  minItems?: number;
  maxItems?: number;
  /** 条目字段（复用 FieldDef；条目内不可再嵌套 array） */
  itemFields: FieldDef[];
  /** 条目导航摘要（如卡片标题） */
  itemSummary?: (item: PuckProps) => string;
}

export type FieldDef =
  | TextFieldDef
  | SegmentedFieldDef
  | NumberFieldDef
  | SwitchFieldDef
  | SelectFieldDef
  | ColorFieldDef
  | MediaFieldDef
  | VideoFieldDef
  | LinkTargetFieldDef
  | ProductReferencesFieldDef
  | CategoryReferencesFieldDef
  | PresetFieldDef
  | CustomFieldDef
  | ArrayFieldDef;

/* ═══════ 分区定义 ═══════ */

export interface SectionDef {
  id: string;
  title: string;
  layer: InspectorLayer;
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
  /** 系统区块（网站全局设置/业务功能区）：面板隐藏删除/隐藏/恢复默认等动作 */
  systemBlock?: boolean;
  /** 完成度横幅；无契约的模块可省略 */
  evaluate?: (props: PuckProps) => ModuleContractStatus;
  /** 「恢复默认」使用；缺省时取 adapter defaultProps */
  defaults?: PuckProps;
  /** 分组标题覆盖（如商品模板把「图片素材」改为「选择商品」），未覆盖时用默认标题 */
  groupTitles?: Partial<
    Record<
      | "content"
      | "media"
      | "product"
      | "link"
      | "composition"
      | "style"
      | "feature",
      string
    >
  >;
  sections: SectionDef[];
}
