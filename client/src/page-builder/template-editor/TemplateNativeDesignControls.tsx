import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { formatCanvasDimension } from "./templateViewportMath";
import { resolveTemplatePreviewViewport } from "./templatePreviewModel";
import "./templateNativeDesignControls.css";
import NumberField, { focusFirstInvalidNumberField } from "../inspector/controls/NumberField";
import {
  describeTemplateFrameProportion,
  displayStandardTemplateRatio,
  formatMeasuredTemplateRatio,
  applyStandardTemplateCanvasPair,
  STANDARD_TEMPLATE_CANVAS_PAIRS,
  getDynamicTemplateNodeRegistryEntry, getDynamicTemplateStructureProtectedNodeIds, createDefaultDynamicTemplateResponsiveRules,
  type TemplateDefinitionV2, type DynamicTemplateResponsiveRules, type DynamicTemplateSlotRules,
} from "../template-definition";
import {
  resolveTemplateNodeRules, resolveTemplateSlotRules, getTemplateNodeRuleSource,
  setTemplateNodeRule, setTemplateSlotRule, resetTemplateNodeRule, resetTemplateSlotRule,
  toTemplateContentBreakpoint,
  type TemplateBreakpoint,
} from "../template-definition/responsive";
import { objectPositionToPercent, percentToExactObjectPosition } from "../template-definition/imagePosition";
import { resolveTemplateImageSource } from "../template-definition/imageContent";
import { requestTemplateCanvasSpacingEditing, useTemplateEditorSession } from "./templateEditorSession";
import TemplateAnchorControls from "./TemplateAnchorControls";
import TemplateNativeResponsiveControls from "./TemplateNativeResponsiveControls";
import TemplateDefaultContentControls from "./TemplateDefaultContentControls";
import ImageFocusField from "../inspector/controls/ImageFocusField";
import { setTemplateLogicalDesignWidth } from "./templateDesignWidth";
import { isRenderedTypographyProperty, useTemplateRenderedPropertyValues } from "./useTemplateRenderedPropertyValues";
import {
  describeTemplateEffectiveValue, getTemplateAlignmentRules, getTemplateDesignRange,
  getTemplatePropertySystemValue, getTemplateSizeOptionDisabledReason, supportsTemplateContainerAlignment,
} from "../template-definition/designPropertySemantics";
import { isSectionCopySlot } from "../template-definition/sectionCopyVisibility";
import { resolveTemplateDesignFrame } from "../template-definition/templateDimensions";
import { getTemplateVisibleLayoutChildIds, isFixedFourWorkGrid } from "../template-definition/layoutAuthoring";

type Context = { rules: DynamicTemplateResponsiveRules; slot: DynamicTemplateSlotRules; measuredSize?: { width: number; height: number }; emptyContainer?: boolean };
function fixedLength(context: Context, axis: "width" | "height") {
  // 空容器的画布最小高度只用于维持可选择性，不能变成模板输出尺寸。
  if (axis === "height" && context.emptyContainer) return { value: 1, unit: "px" as const };
  const value = context.measuredSize?.[axis];
  if (!Number.isFinite(value) || value! < 0) throw new Error("当前断点没有可测量的对象尺寸，请先聚焦该断点并显示对象。");
  return { value: Math.max(1, Math.round(value! * 1000) / 1000), unit: "px" as const };
}
export type NativeDesignProperty = {
  key: string; label: string; group: string; path: string; slot?: boolean;
  options?: readonly (readonly [string, string])[]; min?: number; max?: number; unit?: string;
  units?: readonly string[];
  /** 由专用布局控件编辑，仍参与同源分组复制与恢复。 */
  descriptorOnly?: boolean;
  read: (context: Context) => unknown;
  encode: (value: unknown, context: Context) => unknown;
};
type Property = NativeDesignProperty;
// tablet 仍可能出现在历史规则来源与合同联合类型中，UI 文案需可索引。
const BP_LABELS: Record<TemplateBreakpoint | "system", string> = {
  desktop: "桌面基础",
  tablet: "平板覆盖",
  mobile: "手机覆盖",
  system: "系统默认",
};
const DEVICE_NAMES: Record<TemplateBreakpoint, string> = {
  desktop: "桌面",
  tablet: "平板",
  mobile: "手机",
};
const BACKGROUND_COLORS: Record<string, string> = { surface: "#FFFFFF", "surface-muted": "#F4F5F5", "brand-ink": "#181A1B", "brand-soft": "#ECEEEF" };
function setNodeDesignRule(definition: TemplateDefinitionV2, nodeId: string, breakpoint: TemplateBreakpoint, path: string, value: unknown) {
  setTemplateNodeRule(definition, nodeId, breakpoint, path, value);
  if (path === "backgroundToken" && Number(definition.schemaVersion) >= 3) {
    // 次断点删除自定义色仍会继承上游色；显式解析预设以覆盖当前颜色。
    setTemplateNodeRule(definition, nodeId, breakpoint, "backgroundColor", BACKGROUND_COLORS[String(value)]);
  }
}
const RESETTABLE_NODE_PROPERTIES = new Set(["minWidth", "maxWidth", "minHeight", "maxHeight", "radius", "backgroundToken", "borderToken", "gap"]);
const RESETTABLE_TEXT_PROPERTIES = new Set(["fontSize", "fontWeight", "lineHeight", "textAlign", "fontRole", "maxLines", "overflow", "objectFit", "objectPosition"]);
const GAP_QUICK_VALUES = [12, 16, 24, 32] as const;
/** 模板整体比例预设：桌面从常用横幅 2:1 起；手机档给出对换值（2:1 对 1:2、16:9 对 9:16、4:3 对 3:4）。 */
const ROOT_RATIO_PRESETS = {
  desktop: STANDARD_TEMPLATE_CANVAS_PAIRS.map(({ desktop }) => [desktop.width, desktop.height] as const),
  mobile: STANDARD_TEMPLATE_CANVAS_PAIRS.map(({ mobile }) => [mobile.width, mobile.height] as const),
} as const;
const HERO_FRAME_PRESETS = new Set(["2:1", "16:9", "3:2"]);
const OBJECT_RATIO_PRESETS = [[1, 1], [4, 5], [16, 9]] as const;
const CONTAINER_RATIO_PRESETS = [[2, 1], [16, 9], [4, 5], [1, 1]] as const;
const canResetSystemValue = (property: Pick<Property, "slot" | "path">) => (property.slot ? RESETTABLE_TEXT_PROPERTIES : RESETTABLE_NODE_PROPERTIES).has(property.path);

function hexLuminance(color: string): number | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return undefined;
  const value = Number.parseInt(match[1], 16);
  const channel = (shift: number) => {
    const part = ((value >> shift) & 255) / 255;
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

function contrastRatio(foreground: string, background: string): number | undefined {
  const left = hexLuminance(foreground);
  const right = hexLuminance(background);
  if (left === undefined || right === undefined) return undefined;
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}
const TEXT_PRIMARY_PATHS = new Set(["fontSize", "fontWeight", "textAlign", "color"]);
const TEXT_DETAIL_PATHS = new Set(["lineHeight", "fontRole", "overflow", "maxLines", "fontFamily", "letterSpacing"]);
const resizeGridColumns = (columns: readonly number[] | undefined, count: number) => {
  const current = columns?.length ? [...columns] : [1];
  if (count <= current.length) return current.slice(0, count);
  return [...current, ...Array.from({ length: count - current.length }, () => 1)];
};
const OBJECT_RATIO_PROPERTY: Property = {
  key: "node.height", path: "height", label: "对象外框比例", group: "尺寸与位置",
  read: ({ rules }) => rules.height.ratio,
  encode: (ratio) => ({ mode: "aspect-ratio", ratio }),
};
const DESIGN_WIDTH_PROPERTY: Property = {
  key: "metadata.canvasSize.width", path: "metadata.canvasSize.width", label: "设计宽度", group: "尺寸与位置",
  read: () => undefined, encode: (value) => value,
};
const readPath = (value: unknown, path: string): unknown => path.split(".").reduce<unknown>((result, key) => (
  result && typeof result === "object" ? (result as Record<string, unknown>)[key] : undefined
), value);
const scalar = (path: string, label: string, group: string, min: number, max: number, slot = false): Property => ({
  key: `${slot ? "slot" : "node"}.${path}`, path, label, group,
  min: getTemplateDesignRange(path, [min, max])[0], max: getTemplateDesignRange(path, [min, max])[1], slot,
  read: (context) => readPath(slot ? context.slot : context.rules, path), encode: (value) => value,
});
const length = (path: string, label: string, group = "尺寸与位置", slot = false): Property => ({
  ...scalar(path, label, group, 0, 10000, slot), unit: "px",
  read: (context) => readPath(slot ? context.slot : context.rules, `${path}.value`),
  encode: (value, context) => value && typeof value === "object" ? value : ({ value, unit: readPath(slot ? context.slot : context.rules, `${path}.unit`) ?? "px" }),
});
const choice = (path: string, label: string, group: string, options: Property["options"], slot = false): Property => ({
  ...scalar(path, label, group, 0, 0, slot), options,
  read: (context) => readPath(slot ? context.slot : context.rules, path) ?? getTemplatePropertySystemValue(path, slot),
});

/** 同一描述用于控件显示、批量交集、来源和命令；不维护另一个属性草稿。 */
export function getNativeDesignProperties(definition: TemplateDefinitionV2, nodeId: string, breakpoint: TemplateBreakpoint): Property[] {
  const node = definition.nodes[nodeId];
  if (!node) return [];
  const rules = resolveTemplateNodeRules(definition, nodeId, breakpoint);
  const container = getDynamicTemplateNodeRegistryEntry(node.type).canHaveChildren;
  const fixedWorkGrid = isFixedFourWorkGrid(definition, nodeId);
  const hasLayoutPeers = getTemplateVisibleLayoutChildIds(definition, nodeId, breakpoint).length >= 2;
  const slot = node.slotId ? definition.slots[node.slotId] : undefined;
  const parent = Object.values(definition.nodes).find((candidate) => candidate.childIds.includes(nodeId));
  const positioned = Boolean(parent && rules.placement && resolveTemplateNodeRules(definition, parent.nodeId, breakpoint).layoutMode === "free");
  const fields: Property[] = [];
  if (container) {
    fields.push(...["display", "direction", "layoutMode"].map((path) => ({ ...scalar(path, { display: "排列类型", direction: "排列方向", layoutMode: "布局模式" }[path]!, "布局", 0, 0), descriptorOnly: true })));
    if (!fixedWorkGrid && hasLayoutPeers && rules.display === "flex" && rules.layoutMode !== "free") fields.push(
      choice("wrap", "自动换行", "布局", [["nowrap", "不换行"], ["wrap", "允许换行"]]),
    );
    if (!fixedWorkGrid && hasLayoutPeers && rules.display === "grid" && rules.layoutMode !== "free") fields.push({
      ...scalar("columns", "网格列数", "布局", 1, 12),
      read: ({ rules: value }) => value.columns?.length,
      encode: (value, context) => resizeGridColumns(context.rules.columns, Number(value)),
    });
  }
  if (positioned) {
    for (const [axis, label] of [["x", "水平位置"], ["y", "垂直位置"], ["width", "宽度"], ["height", "高度"]] as const) fields.push({
      ...scalar(`placement.${axis}`, label, "尺寸与位置", axis === "width" || axis === "height" ? 0.01 : 0, 100), unit: "%",
      read: ({ rules: current }) => current.placement![axis] * 100,
      encode: (value) => Number(value) / 100,
    });
  } else {
  if (nodeId !== definition.rootNodeId) fields.push({
    ...choice("width", "宽度方式", "尺寸与位置", [["fill", "填满可用空间"], ["fit", "适应内容"], ["auto", "自动"], ["fixed", "固定尺寸"]]),
    key: "node.width.mode",
    read: ({ rules: value }) => typeof value.width === "object" ? "fixed" : value.width,
    encode: (value, context) => value === "fixed" ? typeof context.rules.width === "object" ? context.rules.width : fixedLength(context, "width") : value,
  });
  if (typeof rules.width === "object") fields.push(length("width", "宽度"));
  const mobilePreview = nodeId === definition.rootNodeId && breakpoint === "mobile"
    ? resolveTemplatePreviewViewport(definition, "mobile")
    : undefined;
  const followsDesktopPair = Boolean(mobilePreview?.pairedCanvas);
  fields.push({
    ...choice("height", "高度方式", "尺寸与位置", [["auto", followsDesktopPair ? (mobilePreview?.frameNote ? "沿用桌面横图（本次未对换）" : "跟随桌面比例（自动对换）") : "随内容变化"], ["fit", "适应内容"], ["fill", "填满可用空间"], ["fixed", "固定高度"], ["min-height", "最小高度"], ["aspect-ratio", nodeId === definition.rootNodeId && (definition.metadata.geometryPolicy === "paired-canvas" || followsDesktopPair) ? "标准比例（固定画幅）" : "按比例（内容可增高）"]]),
    read: ({ rules: value }) => value.height.mode,
    encode: (value, context) => value === "fixed" || value === "min-height"
      ? { mode: value, value: context.rules.height.mode === value ? context.rules.height.value : fixedLength(context, "height") }
      : value === "aspect-ratio" ? { mode: value, ratio: context.rules.height.ratio ?? { width: 16, height: 9 } } : { mode: value },
  });
  if (rules.height.mode === "fixed" || rules.height.mode === "min-height") fields.push(length("height.value", "高度"));
  if (rules.height.mode === "viewport") fields.push({ ...length("height.value", "视口相对高度"), units: ["vh", "vw"] });
  if (rules.height.mode === "aspect-ratio" && nodeId !== definition.rootNodeId) {
    fields.push(scalar("height.ratio.width", "比例宽", "尺寸与位置", 1, 1000), scalar("height.ratio.height", "比例高", "尺寸与位置", 1, 1000));
  }
  }
  fields.push(length("minWidth", "最小宽度", "尺寸限制"), length("maxWidth", "最大宽度", "尺寸限制"), length("minHeight", "最小高度", "尺寸限制"), length("maxHeight", "最大高度", "尺寸限制"));
  if (container && supportsTemplateContainerAlignment(rules)) {
    const verticalCrossAxis = rules.display === "grid" || (rules.direction ?? "row") === "row";
    const alignmentOptions = (vertical: boolean): NonNullable<Property["options"]> => [["start", vertical ? "靠上" : "靠左"], ["center", "居中"], ["end", vertical ? "靠下" : "靠右"]];
    fields.push(
      length("gap", "对象间距", "间距与对齐"),
      choice("alignItems", verticalCrossAxis ? "垂直对齐" : "水平对齐", "间距与对齐", [...alignmentOptions(verticalCrossAxis), ["stretch", verticalCrossAxis ? "拉伸高度" : "拉伸宽度"]]),
      choice("justifyContent", verticalCrossAxis ? "水平对齐" : "垂直对齐", "间距与对齐", [...alignmentOptions(!verticalCrossAxis), ...(rules.display === "grid" ? [] : [["space-between", "两端对齐"] as [string, string]])]),
    );
  }
  if (container || slot?.type === "button") for (const [side, label] of [["top", "上"], ["right", "右"], ["bottom", "下"], ["left", "左"]]) fields.push(length(`padding.${side}`, `${label}内边距`, "间距与对齐"));
  if (parent && !rules.anchor && resolveTemplateNodeRules(definition, parent.nodeId, breakpoint).layoutMode !== "free") {
    for (const [side, label] of [["top", "上"], ["right", "右"], ["bottom", "下"], ["left", "左"]]) fields.push(length(`margin.${side}`, `${label}外边距`, "间距与对齐"));
  }
  fields.push(
    choice("backgroundToken", "背景预设", "外观", [["surface", "白色"], ["surface-muted", "浅灰"], ["brand-ink", "石墨"], ["brand-soft", "柔灰"]]),
    choice("borderToken", "边框预设", "外观", [["subtle", "细边框"], ["strong", "深边框"], ["accent", "强调边框"]]),
    length("radius", "圆角", "外观"),
    choice("overflow", "容器裁剪", "外观", [["visible", "允许越界显示"], ["hidden", "裁剪越界内容"]]),
  );
  if (Number(definition.schemaVersion) >= 3) {
    // 专用控件与跨端复制/基线恢复共享同一属性清单，避免只复制旧版令牌。
    for (const [path, label] of [["backgroundColor", "背景颜色"], ["backgroundImage", "背景图片"], ["backgroundGradient", "背景渐变"], ["opacity", "不透明度"]]) {
      fields.push({ ...scalar(path, label, "外观", 0, 0), descriptorOnly: true });
    }
    if (slot && ["heading", "text", "richText", "badge", "icon", "button", "link"].includes(slot.type)) {
      for (const [path, label] of [["color", "文字颜色"], ["fontFamily", "字体"], ["letterSpacing", "字间距"]]) {
        fields.push({ ...scalar(path, label, "文字或媒体", 0, 0, true), descriptorOnly: true });
      }
    }
  }
  if (slot?.type === "image") {
    fields.push(choice("objectFit", "图片适配", "文字或媒体", [["cover", "裁切填满"], ["contain", "完整显示"]], true));
    const slotRules = resolveTemplateSlotRules(definition, slot.slotId, breakpoint);
    if ((slotRules.objectFit ?? "cover") === "cover") for (const axis of ["x", "y"] as const) fields.push({
      ...scalar("objectPosition", axis === "x" ? "水平焦点" : "垂直焦点", "文字或媒体", 0, 100, true), key: `focus.${axis}`, unit: "%",
      read: ({ slot: current }) => objectPositionToPercent(current.objectPosition)[axis],
      encode: (value, { slot: current }) => percentToExactObjectPosition({ ...objectPositionToPercent(current.objectPosition), [axis]: Number(value) }),
    });
  }
  if (slot && ["heading", "text", "richText", "badge", "button", "link"].includes(slot.type)) fields.push(
    length("fontSize", "字号", "文字或媒体", true),
    {
      ...choice("fontWeight", "字重", "文字或媒体", [["300", "300"], ["400", "400"], ["500", "500"]], true),
      read: (context) => {
        const weight = readPath(context.slot, "fontWeight");
        return typeof weight === "number" ? String(weight) : undefined;
      },
      encode: (value) => Number(value),
    },
    choice("textAlign", "文字对齐", "文字或媒体", [["left", "左对齐"], ["center", "居中"], ["right", "右对齐"]], true),
    scalar("lineHeight", "行高", "文字或媒体", 0.8, 3, true),
    choice("fontRole", "字体角色", "文字或媒体", [["display", "展示标题"], ["heading", "标题"], ["body", "正文"], ["caption", "说明"], ["action", "行动"]], true),
    choice("overflow", "文字溢出", "文字或媒体", [["wrap", "自动换行"], ["ellipsis", "超出省略"], ["clip", "超出裁剪"]], true),
    scalar("maxLines", "最大行数", "文字或媒体", 1, 20, true),
  );
  return fields;
}

const WEIGHT_LABELS: Record<string, string> = { "300": "细", "400": "常规", "500": "中等" };

function PropertyInput({ property, value, mixed, disabled, preview, commit, cancel, unit, optionDisabledReason, interactionStartValue, compact = false, visual = false, titleWeight = false }: {
  property: Property; value: unknown; mixed: boolean; disabled: boolean;
  preview: (value: unknown) => unknown; commit: (value: unknown) => unknown; cancel: () => void;
  unit?: string;
  optionDisabledReason: (value: string) => string | undefined;
  interactionStartValue: number;
  compact?: boolean;
  visual?: boolean;
  titleWeight?: boolean;
}) {
  if (visual && property.options) {
    const fit = property.path === "objectFit";
    const weight = property.path === "fontWeight";
    const current = value === undefined ? (fit ? "cover" : undefined) : String(value);
    const choices = titleWeight && weight ? property.options.filter(([key]) => Number(key) <= 400) : property.options;
    const historical = current !== undefined && !choices.some(([key]) => key === current);
    return <div className="template-native__visual-property" role="group" aria-label={property.label}>
      <span>{property.label}</span>
      <div className="template-native__visual-options">
        {choices.map(([key, label]) => {
          const reason = optionDisabledReason(key);
          return <button key={key} type="button" aria-pressed={key === current} disabled={disabled || Boolean(reason)}
            title={reason} onClick={() => {
              if (key !== current && !focusFirstInvalidNumberField()) commit(key);
            }}>
            {fit ? <svg aria-hidden="true" viewBox="0 0 48 30" width="48" height="30">
              <rect x="8" y="3" width="32" height="24" rx="2" />
              {key === "cover" ? <path d="M8 23l10-10 7 7 5-4 10 9M30 9h3" /> : <path d="M12 9h24v12H12zM12 20l7-6 5 4 3-3 9 5" />}
            </svg> : weight ? <span aria-hidden="true" className="template-native__weight-sample" style={{ fontWeight: Number(key) }}>字</span> : (
              <svg aria-hidden="true" viewBox="0 0 28 22" width="28" height="22">
                <path d={key === "left" ? "M4 5h20M4 11h13M4 17h17" : key === "right" ? "M4 5h20M11 11h13M7 17h17" : "M4 5h20M8 11h12M6 17h16"} />
              </svg>
            )}
            {weight ? WEIGHT_LABELS[key] : label}
          </button>;
        })}
      </div>
      {historical ? <small>当前为{fit && current === "fill" ? "拉伸填满" : `已有值 ${current}`}</small> : current === undefined ? <small>沿用页面样式</small> : null}
    </div>;
  }
  if (property.options) return <label className="template-editor__simple-select">{property.label}
    <select aria-label={property.label} disabled={disabled} value={mixed ? "mixed" : value === undefined ? "" : String(value)} onChange={(event) => commit(event.target.value)}>
      {mixed ? <option value="mixed" disabled>混合值</option> : null}
      <option value="" disabled>未显式设置</option>
      {!mixed && value !== undefined && !property.options.some(([key]) => key === String(value)) ? <option value={String(value)} disabled>{property.path === "height" && value === "viewport" ? "随视口高度（已有值）" : property.path === "objectFit" && value === "fill" ? "拉伸填满（已有值）" : `当前值：${String(value)}（保留）`}</option> : null}
      {property.options.map(([key, label]) => <option value={key} key={key} disabled={Boolean(optionDisabledReason(key))}>{label}{optionDisabledReason(key) ? `（${optionDisabledReason(key)}）` : ""}</option>)}
    </select>
    {!compact && property.options.some(([key]) => optionDisabledReason(key)) ? <details className="template-native__unavailable-options"><summary>查看尺寸方式限制</summary>{property.options.flatMap(([key, label]) => optionDisabledReason(key) ? [<small key={key}>{label}不可用：{optionDisabledReason(key)}</small>] : [])}</details> : null}
  </label>;
  return <NumberField label={property.label} value={mixed ? undefined : value as number | undefined}
    placeholder={mixed ? "混合值" : "未显式设置"} disabled={disabled} min={property.min} max={property.max}
    unit={property.path === "lineHeight" ? "倍" : unit ?? property.unit} step={property.path === "lineHeight" || property.path.startsWith("placement.") ? 0.1 : property.path === "fontWeight" ? 100 : 1} onPreview={preview} onCancel={cancel}
    onChange={commit} commitUnchanged interactionStartValue={interactionStartValue} displayPrecision={2}
    unitOptions={property.unit === "px" ? property.units ?? ["px", "%", "rem", "vw", "vh"] : undefined}
    onUnitChange={property.unit === "px" && !mixed ? (nextUnit, nextValue) => commit({ value: nextValue, unit: nextUnit }) : undefined} />;
}

function PropertyGroup({ name, title, summary, children }: {
  name: string; title: string; summary: string; children: ReactNode;
}) {
  const className = `template-editor__settings-section template-native__section ${name === "尺寸与位置" ? "template-native__dimensions" : ""}`;
  return <section className={className} data-template-property-group={name}>
    <h3 aria-label={title}>{title}{summary ? <small>{summary}</small> : null}</h3>
    {children}
  </section>;
}

export default function TemplateNativeDesignControls({ nodeIds, layoutControls, onOpenPageScope, onStartCanvasEdit, showIssueControls = false }: {
  nodeIds: string[];
  layoutControls?: (context: { disabled: boolean; presetsOnly?: boolean }) => ReactNode;
  onOpenPageScope?: () => void;
  onStartCanvasEdit?: () => void;
  showIssueControls?: boolean;
}) {
  const draft = useTemplateEditorSession((state) => state.draft);
  const baseline = useTemplateEditorSession((state) => state.baseline);
  const previewDocument = useTemplateEditorSession((state) => state.previewDocument);
  const activeInteraction = useTemplateEditorSession((state) => state.activeInteraction);
  const sessionBreakpoint = useTemplateEditorSession((state) => state.breakpoint);
  const breakpoint = toTemplateContentBreakpoint(sessionBreakpoint);
  const previewWidth = useTemplateEditorSession((state) => state.previewWidth);
  const device = useTemplateEditorSession((state) => state.device);
  const renderedValues = useTemplateRenderedPropertyValues(nodeIds, breakpoint, previewDocument ?? draft?.definition, previewWidth);
  const [scope, setScope] = useState<"current" | "base">("current");
  const [pendingAll, setPendingAll] = useState<Property | null>(null);
  const [pendingLayout, setPendingLayout] = useState<{ property: Property; value: unknown } | null>(null);
  const [pendingRatio, setPendingRatio] = useState<{ width: number; height: number } | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [linkPadding, setLinkPadding] = useState(false);
  const token = useRef<string | null>(null);
  const ratioParentSizes = useRef<Record<string, { width: number; height: number }>>({});
  const cancel = () => { if (token.current) useTemplateEditorSession.getState().cancelInteraction(token.current); token.current = null; ratioParentSizes.current = {}; };
  const selectionKey = nodeIds.join(":");
  const interactionResetKey = `${selectionKey}:${breakpoint}:${scope}`;
  const [seenInteractionResetKey, setSeenInteractionResetKey] = useState(interactionResetKey);
  if (seenInteractionResetKey !== interactionResetKey) {
    setSeenInteractionResetKey(interactionResetKey);
    setPendingAll(null);
    setPendingLayout(null);
    setPendingRatio(null);
    setOperationError(null);
    setLinkPadding(false);
  }
  useEffect(() => () => {
    if (token.current) useTemplateEditorSession.getState().cancelInteraction(token.current);
    token.current = null;
    ratioParentSizes.current = {};
  }, [selectionKey, breakpoint, scope]);
  useEffect(() => {
    if (!pendingRatio && !pendingLayout) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      cancel(); setPendingRatio(null); setPendingLayout(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingRatio, pendingLayout]);
  if (!draft) return null;
  const original = draft.definition;
  const effective = previewDocument ?? original;
  const protectedIds = getDynamicTemplateStructureProtectedNodeIds(original);
  const ids = nodeIds.filter((id) => original.nodes[id] && !protectedIds.has(id));
  const firstId = ids[0] ?? nodeIds[0];
  if (!firstId || !original.nodes[firstId]) return null;
  const sectionRole = original.metadata.sectionRole ?? original.templateRecipe?.sectionRole;
  const heroPresetView = sectionRole === "page-hero" && !showIssueControls;
  const targetBreakpoint = !heroPresetView && scope === "base" ? "desktop" : breakpoint;
  const positionedIds = ids.filter((id) => getNativeDesignProperties(original, id, targetBreakpoint).some((property) => property.path.startsWith("placement.")));
  const ratioMeasurementMissing = positionedIds.some((id) => renderedValues[id]?.breakpoint !== targetBreakpoint || !(Number(renderedValues[id]?.borderWidth) > 0 && Number(renderedValues[id]?.borderHeight) > 0));
  const foreignInteraction = Boolean(activeInteraction && activeInteraction.token !== token.current);
  const descriptors = getNativeDesignProperties(original, firstId, targetBreakpoint).filter((property) => !property.descriptorOnly && (
    ids.every((id) => getNativeDesignProperties(original, id, targetBreakpoint).some((candidate) => candidate.key === property.key))
  ));
  const allProperties = new Map(ids.flatMap((id) => getNativeDesignProperties(original, id, targetBreakpoint).filter((property) => !property.descriptorOnly).map((property) => [property.key, property] as const)));
  const unavailableProperties = [...allProperties.values()].filter((property) => !descriptors.some((candidate) => candidate.key === property.key));
  const context = (definition: TemplateDefinitionV2, id: string): Context => ({
    rules: resolveTemplateNodeRules(definition, id, targetBreakpoint),
    slot: definition.nodes[id].slotId ? resolveTemplateSlotRules(definition, definition.nodes[id].slotId!, targetBreakpoint) : {},
    measuredSize: renderedValues[id]?.breakpoint === targetBreakpoint ? { width: Number(renderedValues[id].width), height: Number(renderedValues[id].height) } : undefined,
    emptyContainer: !definition.nodes[id].childIds.length && !definition.nodes[id].slotId,
  });
  const command = (property: Property, value: unknown) => ({
    type: "update-definition" as const, label: `${ids.length > 1 ? "批量" : ""}调整${property.label}`,
    update: (next: TemplateDefinitionV2) => { for (const id of ids) {
      if (property === DESIGN_WIDTH_PROPERTY) {
        if (id !== next.rootNodeId || targetBreakpoint !== "desktop") throw new Error("设计宽度仅作用于模板整体的桌面基础。");
        next.metadata = setTemplateLogicalDesignWidth(next, Number(value)).metadata;
        continue;
      }
      if (property === OBJECT_RATIO_PROPERTY && id === next.rootNodeId) {
        const ratio = value as { width: number; height: number };
        const paired = applyStandardTemplateCanvasPair(next, targetBreakpoint === "mobile"
          ? { width: ratio.height, height: ratio.width }
          : ratio);
        next.metadata = paired.metadata;
        next.nodes = paired.nodes;
        next.slots = paired.slots;
        continue;
      }
      if (property === OBJECT_RATIO_PROPERTY && positionedIds.includes(id)) {
        const parentSize = ratioParentSizes.current[id];
        if (!parentSize) throw new Error("请先聚焦此断点并显示对象，再调整外框比例。");
        const placement = resolveTemplateNodeRules(next, id, targetBreakpoint).placement!;
        const ratio = value as { width: number; height: number };
        const width = placement.width * parentSize.width;
        const height = width * ratio.height / ratio.width;
        // 保持左上位置；空间不足时等比缩小，不能越界或调整图片焦点。
        const scale = Math.min(1, (1 - placement.x) * parentSize.width / width, (1 - placement.y) * parentSize.height / height);
        setTemplateNodeRule(next, id, targetBreakpoint, "placement", { ...placement, width: width * scale / parentSize.width, height: height * scale / parentSize.height });
        continue;
      }
      const encoded = property.encode(value, context(next, id));
      if (property.path.startsWith("placement.")) {
        const placement = { ...resolveTemplateNodeRules(next, id, targetBreakpoint).placement!, [property.path.split(".")[1]]: encoded };
        if (placement.x + placement.width > 1.000001 || placement.y + placement.height > 1.000001) throw new Error("位置与尺寸不能超出父区域，请先缩小尺寸或调整位置。");
      }
      if (property.slot) setTemplateSlotRule(next, next.nodes[id].slotId!, targetBreakpoint, property.path, encoded);
      else if (linkPadding && property.path.startsWith("padding.")) for (const side of ["top", "right", "bottom", "left"]) setTemplateNodeRule(next, id, targetBreakpoint, `padding.${side}`, encoded);
      else setNodeDesignRule(next, id, targetBreakpoint, property.path, encoded);
    } },
  });
  const edit = (property: Property, value: unknown, preview: boolean) => {
    const state = useTemplateEditorSession.getState();
    if (property.path === "columns" && !Number.isInteger(Number(value))) {
      cancel();
      const message = "网格列数必须是 1 至 12 的整数";
      setOperationError(message);
      return { ok: false as const, message };
    }
    if (preview) {
      token.current ??= state.beginInteraction(`调整${property.label}`, { source: "field" });
      if (token.current) {
        const result = state.previewInteraction(token.current, command(property, value));
        if (!result.ok) token.current = null;
        return result;
      }
    } else if (token.current) {
      const current = token.current;
      token.current = null;
      const result = state.previewInteraction(current, command(property, value));
      return result.ok ? state.commitInteraction(current) : result;
    } else return state.executeCommand(command(property, value));
  };
  const reset = (property: Pick<Property, "label" | "path" | "slot">) => {
    cancel();
    const isSystemReset = targetBreakpoint === "desktop";
    if (isSystemReset && !canResetSystemValue(property)) return;
    const result = useTemplateEditorSession.getState().executeCommand({ type: "update-definition", label: isSystemReset ? `${property.label}恢复系统默认` : `恢复${property.label}继承`, update: (next) => {
      for (const id of ids) {
        if (isSystemReset) {
          // 白名单仅含可选顶层字段；删除主值不触碰 Mobile 的有意覆盖。
          const rules = property.slot ? next.slots[next.nodes[id].slotId!].desktopRules : next.nodes[id].responsive.desktop;
          delete (rules as unknown as Record<string, unknown>)[property.path];
        } else if (property.slot) resetTemplateSlotRule(next, next.nodes[id].slotId!, targetBreakpoint, property.path);
        else resetTemplateNodeRule(next, id, targetBreakpoint, property.path);
        if (property.path === "backgroundToken" && Number(next.schemaVersion) >= 3) {
          if (isSystemReset) delete next.nodes[id].responsive.desktop.backgroundColor;
          else resetTemplateNodeRule(next, id, targetBreakpoint, "backgroundColor");
        }
      }
    } });
    setOperationError(result.ok ? null : result.message);
  };
  const source = (property: Property, id: string) => {
    if (!property.slot) return getTemplateNodeRuleSource(original, id, targetBreakpoint, property.path);
    const slot = original.slots[original.nodes[id].slotId!];
    const candidates: TemplateBreakpoint[] = targetBreakpoint === "mobile" ? ["mobile", "desktop"] : ["desktop"];
    return candidates.find((bp) => readPath(bp === "desktop" ? slot.desktopRules : slot.mobileRules, property.path) !== undefined) ?? "system";
  };
  const changeVisibility = (hidden?: boolean) => {
    cancel();
    const result = useTemplateEditorSession.getState().executeCommand({ type: "update-definition", label: hidden === undefined ? "切换当前断点显示" : hidden ? "所选对象在当前断点全部隐藏" : "所选对象在当前断点全部显示", update: (next) => {
      // 可见性按钮明确操作正在查看的设备，不借用设计属性的基础值作用域。
      for (const id of ids) {
        const rules = resolveTemplateNodeRules(next, id, breakpoint);
        const hide = hidden ?? !(rules.hidden || rules.display === "none");
        if (!hide && next.nodes[id].hidden) throw new Error("对象在结构中隐藏，请先取消结构隐藏；该操作影响所有设备。");
        setTemplateNodeRule(next, id, breakpoint, "hidden", hide);
        if (!hide && rules.display === "none") {
          const upstream: TemplateBreakpoint[] = breakpoint === "mobile" ? ["desktop"] : [];
          const display = upstream.map((bp) => resolveTemplateNodeRules(next, id, bp).display).find((value) => value !== "none")
            ?? createDefaultDynamicTemplateResponsiveRules(next.nodes[id].type).display;
          setTemplateNodeRule(next, id, breakpoint, "display", display);
        }
      }
    } });
    setOperationError(result.ok ? null : result.message);
  };
  const sizeLabel = (axis: "borderWidth" | "borderHeight") => {
    const values = nodeIds.map((id) => Number(renderedValues[id]?.[axis]));
    if (values.some((value) => !Number.isFinite(value))) return "未呈现";
    return values.every((value) => Math.abs(value - values[0]) < 0.05) ? `${formatCanvasDimension(values[0])} px` : "混合尺寸";
  };
  const selectedNodes = nodeIds.map((id) => original.nodes[id]).filter(Boolean);
  const allContainers = selectedNodes.every((node) => getDynamicTemplateNodeRegistryEntry(node.type).canHaveChildren);
  const allText = selectedNodes.every((node) => node.slotId && ["heading", "text", "richText", "badge", "button", "link"].includes(original.slots[node.slotId]?.type));
  const allImages = selectedNodes.every((node) => node.slotId && original.slots[node.slotId]?.type === "image");
  const imageShapeRoles = allImages
    ? nodeIds.flatMap((id) => {
      const slotId = original.nodes[id]?.slotId;
      return slotId ? [original.slots[slotId]?.semanticRole ?? ""] : [];
    })
    : [];
  const allowsCircle = imageShapeRoles.length > 0 && imageShapeRoles.every((role) => /avatar|logo/i.test(role));
  const isRootSelection = nodeIds.length === 1 && firstId === original.rootNodeId;
  const overallFrame = isRootSelection ? resolveTemplateDesignFrame(effective, targetBreakpoint) : undefined;
  const previewFrame = isRootSelection ? resolveTemplatePreviewViewport(effective, device === "mobile" ? "mobile" : "desktop") : undefined;
  const sectionCopyNodeIds = isRootSelection && Number(original.schemaVersion) >= 2
    ? Object.values(original.nodes).flatMap((node) => {
      const slot = node.slotId ? original.slots[node.slotId] : undefined;
      return !node.hidden && isSectionCopySlot(slot) ? [node.nodeId] : [];
    })
    : [];
  const sectionCopyState = (() => {
    if (!sectionCopyNodeIds.length) return null;
    const states = sectionCopyNodeIds.map((id) => {
      const hidden = resolveTemplateNodeRules(original, id, "desktop").hidden;
      const shown = sectionRole === "creation-grid" ? hidden === false : hidden !== true;
      return shown ? "shown" as const : "hidden" as const;
    });
    return states.every((state) => state === states[0]) ? states[0] : "mixed" as const;
  })();
  const setSectionCopyVisibility = (shown: boolean) => {
    cancel();
    const result = useTemplateEditorSession.getState().executeCommand({
      type: "update-definition",
      label: shown ? "显示标题与说明" : "不显示标题与说明",
      update: (next) => {
        const role = next.metadata.sectionRole ?? next.templateRecipe?.sectionRole;
        for (const node of Object.values(next.nodes)) {
          const slot = node.slotId ? next.slots[node.slotId] : undefined;
          if (node.hidden || !isSectionCopySlot(slot)) continue;
          if (Object.prototype.hasOwnProperty.call(node.responsive.mobile, "hidden")) delete node.responsive.mobile.hidden;
          if (shown) setTemplateNodeRule(next, node.nodeId, "desktop", "hidden", false);
          else if (role === "creation-grid") delete node.responsive.desktop.hidden;
          else setTemplateNodeRule(next, node.nodeId, "desktop", "hidden", true);
        }
      },
    });
    setOperationError(result.ok ? null : result.message);
  };
  const emptyContainerSelection = ids.length > 0 && ids.every((id) => !original.nodes[id].childIds.length && !original.nodes[id].slotId);
  const groupOrder = isRootSelection ? ["尺寸与位置", "间距与对齐", "外观", "布局", "尺寸限制"]
    : allText ? ["文字或媒体", "尺寸与位置", "文字细节", "间距与对齐", "布局", "尺寸限制", "外观"]
    : allImages ? ["文字或媒体", "尺寸与位置", "间距与对齐", "布局", "尺寸限制", "外观"]
    : allContainers ? ["布局", "尺寸与位置", "间距与对齐", "文字或媒体", "尺寸限制", "外观"]
      : ["尺寸与位置", "文字或媒体", "间距与对齐", "布局", "尺寸限制", "外观"];
  const propertiesForGroup = (group: string) => {
    if (isRootSelection && group === "间距与对齐") return descriptors.filter((property) => property.path.startsWith("padding."));
    if (isRootSelection && group === "布局") return descriptors.filter((property) =>
      property.group === "布局" || (property.group === "间距与对齐" && !property.path.startsWith("padding."))
    );
    if (group === "文字细节") return allText ? descriptors.filter((property) => property.group === "文字或媒体" && TEXT_DETAIL_PATHS.has(property.path)) : [];
    if (group === "文字或媒体" && allText) return descriptors.filter((property) => property.group === "文字或媒体" && TEXT_PRIMARY_PATHS.has(property.path));
    // 单选图片：焦点改由拖点控件承担，不再并排两行百分比。
    if (group === "文字或媒体" && allImages && nodeIds.length === 1) {
      return descriptors.filter((property) => property.group === group && !property.key.startsWith("focus."));
    }
    return descriptors.filter((property) => property.group === group);
  };
  const imageFocusEnabled = allImages && nodeIds.length === 1 && descriptors.some((property) => property.key.startsWith("focus."));
  const imageFocusValue = imageFocusEnabled
    ? objectPositionToPercent(context(effective, firstId).slot.objectPosition)
    : null;
  const imagePreviewSrc = (() => {
    if (!imageFocusEnabled) return undefined;
    const slotId = original.nodes[firstId]?.slotId;
    if (!slotId) return undefined;
    return resolveTemplateImageSource(original.defaultContent[slotId], targetBreakpoint) || undefined;
  })();
  const imagePreviewFit = imageFocusEnabled
    ? ((context(effective, firstId).slot.objectFit ?? "cover") as "cover" | "contain" | "fill")
    : undefined;
  const storedValue = (definition: TemplateDefinitionV2, id: string, property: Property) => {
    const node = definition.nodes[id];
    if (!node) return undefined;
    const slot = node.slotId ? definition.slots[node.slotId] : undefined;
    return readPath(property.slot ? targetBreakpoint === "desktop" ? slot?.desktopRules : slot?.mobileRules : node.responsive[targetBreakpoint], property.path);
  };
  const changedSinceSave = (property: Property) => Boolean(baseline && ids.some((id) => JSON.stringify(storedValue(original, id, property)) !== JSON.stringify(storedValue(baseline.definition, id, property))));
  const groupSummary = (group: string) => {
    const changed = propertiesForGroup(group).filter(changedSinceSave).length;
    return changed ? `${changed} 项未保存` : "";
  };
  const frameRules = context(effective, firstId).rules;
  const lockedFrameRatio = nodeIds.length === 1 && (overallFrame?.pairedCanvas || frameRules.height.mode === "aspect-ratio")
    ? overallFrame?.ratioLabel && overallFrame.ratioLabel !== "auto"
      ? overallFrame.ratioLabel
      : frameRules.height.ratio
        ? `${frameRules.height.ratio.width}:${frameRules.height.ratio.height}`
        : undefined
    : undefined;
  const standardRatioLabel = nodeIds.length === 1
    ? displayStandardTemplateRatio(
      Number(renderedValues[firstId]?.borderWidth),
      Number(renderedValues[firstId]?.borderHeight),
      lockedFrameRatio,
    )
    : "";
  const controlsDisabled = !ids.length || Boolean(pendingRatio || pendingLayout) || foreignInteraction;
  const canDragPadding = allContainers && nodeIds.length === 1 && descriptors.some((property) => {
    if (!property.path.startsWith("padding.")) return false;
    const edge = readPath(context(original, firstId).rules, property.path) as { unit: string } | undefined;
    return !edge || edge.unit === "px";
  });
  const layoutScopeMismatch = allContainers && nodeIds.length === 1 && targetBreakpoint !== breakpoint;
  const layoutDisabled = !ids.length || Boolean(pendingRatio || pendingLayout) || layoutScopeMismatch;
  const layoutScopeNotice = layoutScopeMismatch ? <p className="template-native__scope-notice" role="status">
    当前查看{DEVICE_NAMES[breakpoint]}画布，但修改范围是桌面基础。排列转换需要在目标画布预览。
    <button type="button" onClick={() => { if (!focusFirstInvalidNumberField()) useTemplateEditorSession.getState().setBreakpoint("desktop"); }}>切换到桌面画布</button>
  </p> : null;
  const ratioPresets = <div className="template-native__ratio" role="group" aria-label={isRootSelection ? "模板整体比例预设" : "对象外框比例预设"} data-template-shared-scope={isRootSelection ? "frame" : undefined} data-template-design-property={isRootSelection ? "node.height.ratio" : undefined}>
    <span title="调整对象高度与宽度的关系，不修改图片内容焦点">{isRootSelection ? "标准双端画幅" : "外框比例"}</span>
    {isRootSelection && !heroPresetView ? <small>先在画布预览。确认后，桌面和手机一起应用所选画幅。</small> : null}
    {ratioMeasurementMissing ? <small>请先聚焦修改范围对应的设备并显示对象，才能按实际尺寸调整比例。</small> : null}
    {(isRootSelection ? ROOT_RATIO_PRESETS[targetBreakpoint === "mobile" ? "mobile" : "desktop"] : allContainers ? CONTAINER_RATIO_PRESETS : OBJECT_RATIO_PRESETS)
      .filter(([width, height]) => !heroPresetView || HERO_FRAME_PRESETS.has(targetBreakpoint === "mobile" ? `${height}:${width}` : `${width}:${height}`))
      .map(([width, height]) => <button type="button" key={`${width}:${height}`} aria-label={`${width}:${height}`} aria-pressed={ids.length > 0 && ids.every((id) => {
      if (isRootSelection) {
        if (effective.metadata.geometryPolicy !== "paired-canvas") return false;
        const desktopFrame = resolveTemplateDesignFrame(effective, "desktop");
        const mobileFrame = resolveTemplateDesignFrame(effective, "mobile");
        return Boolean(mobileFrame.pairedCanvas && desktopFrame.heightMode === "aspect-ratio"
          && desktopFrame.ratioLabel === (targetBreakpoint === "mobile" ? `${height}:${width}` : `${width}:${height}`)
          && mobileFrame.ratioLabel === (targetBreakpoint === "mobile" ? `${width}:${height}` : `${height}:${width}`));
      }
      if (positionedIds.includes(id)) return renderedValues[id]?.breakpoint === targetBreakpoint && Math.abs(Number(renderedValues[id]?.borderWidth) / Number(renderedValues[id]?.borderHeight) - width / height) < .001;
      const rule = context(effective, id).rules.height; return rule.mode === "aspect-ratio" && Boolean(rule.ratio && rule.ratio.width * height === rule.ratio.height * width);
    })} disabled={!ids.length || Boolean(pendingLayout) || foreignInteraction || ratioMeasurementMissing} onClick={() => {
      if (focusFirstInvalidNumberField()) return;
      if (!pendingRatio) for (const id of positionedIds) {
        const placement = context(original, id).rules.placement!;
        ratioParentSizes.current[id] = { width: Number(renderedValues[id].borderWidth) / placement.width, height: Number(renderedValues[id].borderHeight) / placement.height };
      }
      const value = { width, height };
      const result = edit(OBJECT_RATIO_PROPERTY, value, true);
      setPendingAll(null); setOperationError(result && !result.ok ? result.message : null);
      setPendingRatio(result?.ok ? value : null);
    }}><svg aria-hidden="true" data-template-ratio-shape={`${width}:${height}`} viewBox="0 0 48 42" focusable="false"><rect x={(48 - 34 * width / Math.max(width, height)) / 2} y={(42 - 34 * height / Math.max(width, height)) / 2} width={34 * width / Math.max(width, height)} height={34 * height / Math.max(width, height)} /></svg><span>{width}:{height}</span>{isRootSelection ? <small>{targetBreakpoint === "mobile" ? "桌面" : "手机"} {height}:{width}</small> : null}</button>)}
    {pendingRatio ? <div role="group" aria-label="确认对象比例"><p>{heroPresetView
      ? "确认后应用到桌面和手机，手机恢复跟随画幅。可撤销。"
      : isRootSelection
      ? `正在预览标准双端画幅：桌面 ${targetBreakpoint === "mobile" ? `${pendingRatio.height}:${pendingRatio.width}` : `${pendingRatio.width}:${pendingRatio.height}`}，手机 ${targetBreakpoint === "mobile" ? `${pendingRatio.width}:${pendingRatio.height}` : `${pendingRatio.height}:${pendingRatio.width}`}。确认会替换两端整体高度/比例，并让原先跟随整节的舞台和图片槽位改到新画幅。手机恢复自动跟随。文字、链接和独立比例（作品卡 4:5、Logo）保留，可一次撤销。`
      : `画布正在预览 ${pendingRatio.width}:${pendingRatio.height}；确认后写入${targetBreakpoint === "desktop" ? "桌面基础" : "手机覆盖"}，可一次撤销。`}</p>
      <button type="button" onClick={() => {
        const result = edit(OBJECT_RATIO_PROPERTY, pendingRatio, false);
        ratioParentSizes.current = {};
        setOperationError(result && !result.ok ? result.message : null); setPendingRatio(null);
      }}>确认对象比例</button>
      <button type="button" onClick={() => { cancel(); setPendingRatio(null); }}>取消比例预览</button>
    </div> : null}
  </div>;
  if (heroPresetView) {
    const children = allContainers && nodeIds.length === 1 ? getTemplateVisibleLayoutChildIds(original, firstId, breakpoint) : [];
    const layoutChildId = isRootSelection && children.length === 1
      && getTemplateVisibleLayoutChildIds(original, children[0], breakpoint).length >= 2
      ? children[0] : null;
    const hiddenOnDevice = frameRules.display === "none" || frameRules.hidden;
    return <section className="template-editor__native-design template-native__hero-presets" data-template-overall-design={isRootSelection || undefined} aria-label="首屏常用属性">
      {operationError ? <p role="alert">{operationError}</p> : null}
      {isRootSelection ? <section className="template-editor__settings-section template-native__section">
        <h3>首屏画幅</h3>
        <div className="template-native__hero-frames" role="group" aria-label="当前双端画幅">
          {(["desktop", "mobile"] as const).map((screen) => {
            const frame = resolveTemplateDesignFrame(effective, screen);
            return <span key={screen}>{DEVICE_NAMES[screen]} <strong>{frame.ratioLabel === "auto" ? "随内容" : frame.ratioLabel}</strong></span>;
          })}
        </div>
        {ratioPresets}
      </section> : null}
      {layoutChildId ? <button type="button" disabled={controlsDisabled} onClick={() => {
        if (!focusFirstInvalidNumberField()) useTemplateEditorSession.getState().selectObject(layoutChildId);
      }}>查看图文排列</button> : null}
      {children.length >= 2 ? layoutControls?.({ disabled: layoutDisabled, presetsOnly: true }) : null}
      {sectionCopyState ? <div className="template-native__copy-visibility" data-template-section-copy={sectionCopyState} data-template-shared-scope="copy">
        <strong>双端标题与说明</strong>
        <div role="group" aria-label="标题与说明">
          <button type="button" aria-pressed={sectionCopyState === "hidden"} disabled={controlsDisabled} onClick={() => setSectionCopyVisibility(false)}>不显示</button>
          <button type="button" aria-pressed={sectionCopyState === "shown"} disabled={controlsDisabled} onClick={() => setSectionCopyVisibility(true)}>显示</button>
        </div>
        {sectionCopyState === "mixed" ? <small>当前部分显示</small> : null}
      </div> : null}
      {nodeIds.length === 1 && hiddenOnDevice ? <button type="button" data-template-inspector-field="responsive.*.display" disabled={controlsDisabled || selectedNodes.some((node) => node.hidden)} onClick={() => changeVisibility(false)}>在当前设备显示</button> : null}
    </section>;
  }
  return <section className="template-editor__native-design" data-template-overall-design={isRootSelection || undefined} aria-label={nodeIds.length > 1 ? "多选设计属性" : "对象设计属性"}>
    {operationError ? <p role="alert">{operationError}</p> : null}
    <div className="template-native__editing-context" aria-label="当前编辑范围">
    <p className="template-native__context" role="status"><span>当前设备</span><strong>{DEVICE_NAMES[breakpoint]}</strong>{nodeIds.length > 1 ? <small>已选 {nodeIds.length} 个 · 可改 {ids.length} 个</small> : null}{ids.length < nodeIds.length ? <small>{nodeIds.length - ids.length} 个锁定对象不参与修改</small> : null}</p>
    {breakpoint === "desktop" ? <p className="template-native__scope-summary" role="status">正在修改桌面基础，保留手机的独立设置。</p> : <label className="template-editor__simple-select template-native__scope"><span>修改范围</span><select aria-label="修改作用域" value={scope} disabled={Boolean(pendingRatio || pendingLayout) || foreignInteraction} onChange={(event) => { if (focusFirstInvalidNumberField()) return; cancel(); setScope(event.target.value as "current" | "base"); }}>
      <option value="current">仅{DEVICE_NAMES[breakpoint]}独立设置</option><option value="base">桌面基础（保留各端覆盖）</option>
    </select></label>}
    </div>
    {nodeIds.length === 1 && !isRootSelection ? <TemplateDefaultContentControls key={`${firstId}:${targetBreakpoint}`} section="content" nodeId={firstId} breakpoint={targetBreakpoint} disabled={controlsDisabled} onOpenPageScope={onOpenPageScope} /> : null}
    {nodeIds.length === 1 && !isRootSelection && !descriptors.some((property) => property.group === "文字或媒体") ? <TemplateDefaultContentControls key={`text:${firstId}:${targetBreakpoint}`} section="text-style" nodeId={firstId} breakpoint={targetBreakpoint} disabled={controlsDisabled} /> : null}
    {unavailableProperties.length ? <details><summary>不适用于全部所选对象的属性（不参与批量修改）</summary>{unavailableProperties.map((property) => <p key={property.key}>{property.label}：{ids.filter((id) => !getNativeDesignProperties(original, id, targetBreakpoint).some((candidate) => candidate.key === property.key)).map((id) => original.nodes[id].name).join("、")} 不支持当前属性或布局上下文</p>)}</details> : null}
    {selectedNodes.some((node) => node.hidden) ? <p role="status">所选对象存在结构级隐藏，作用于所有设备。<button type="button" disabled={controlsDisabled} onClick={() => {
      cancel(); const result = useTemplateEditorSession.getState().executeCommand({ type: "update-definition", label: "取消所选对象结构隐藏", update: (next) => { for (const id of ids) next.nodes[id].hidden = false; } });
      setOperationError(result.ok ? null : result.message);
    }}>取消结构隐藏（所有设备）</button></p> : null}
    {(resolveTemplateNodeRules(original, firstId, breakpoint).display === "none" || resolveTemplateNodeRules(original, firstId, breakpoint).hidden) ? <p role="status">此对象在当前断点隐藏，可恢复显示或选择父级。<button type="button" data-template-inspector-field="responsive.*.display" disabled={controlsDisabled || selectedNodes.some((node) => node.hidden)} onClick={() => changeVisibility(false)}>在当前设备显示</button></p> : null}
    {allContainers && nodeIds.length === 1 && !isRootSelection ? <>{layoutScopeNotice}{layoutControls?.({ disabled: layoutDisabled })}</> : null}
    {groupOrder.filter((group) => propertiesForGroup(group).length > 0 || (group === "布局" && isRootSelection && layoutControls)).map((group) => <PropertyGroup key={`${selectionKey}:${group}`} name={isRootSelection && group === "布局" ? "排列与分栏" : group}
      title={isRootSelection && group === "尺寸与位置" ? "模板整体尺寸与比例" : isRootSelection && group === "间距与对齐" ? "整体留白" : group === "文字或媒体" ? allImages ? "图片适配与焦点" : allText ? "文字排版" : "文字或媒体" : group === "文字细节" ? "字体与换行" : group === "外观" ? "背景与边框" : group === "布局" && allContainers ? "排列与分栏" : group}
      summary={groupSummary(group)}>
      {isRootSelection && group === "布局" ? <>{layoutScopeNotice}{layoutControls?.({ disabled: layoutDisabled })}</> : null}
      {group === "文字细节" && nodeIds.length === 1 ? <TemplateDefaultContentControls section="text-font" embedded key={`font:${firstId}:${targetBreakpoint}`} nodeId={firstId} breakpoint={targetBreakpoint} disabled={controlsDisabled} /> : null}
      {group === "外观" && nodeIds.length === 1 ? <TemplateDefaultContentControls section="background" embedded key={`${firstId}:${targetBreakpoint}`} nodeId={firstId} breakpoint={targetBreakpoint} disabled={controlsDisabled} /> : null}
      {group === "尺寸与位置" ? <div className="template-native__measured" aria-label="当前画布对象外框尺寸"><small className="template-native__measurement-label">{isRootSelection ? "本节当前尺寸 · 只读" : "当前预览尺寸 · 只读"}</small><span>{isRootSelection ? "本节宽度" : "实际宽"} <strong>{sizeLabel("borderWidth")}</strong></span><span>{emptyContainerSelection ? "画布占位高" : isRootSelection ? "本节高度" : "实际高"} <strong>{sizeLabel("borderHeight")}</strong>{emptyContainerSelection ? <small>（非输出高度）</small> : null}</span>{nodeIds.length === 1 ? <span className="template-native__proportion">有效外框 <strong>{previewFrame?.frameNote
        ? previewFrame.ratioLabel
        : isRootSelection
          ? standardRatioLabel
          : formatMeasuredTemplateRatio(Number(renderedValues[firstId]?.borderWidth), Number(renderedValues[firstId]?.borderHeight))}</strong>{previewFrame?.frameNote ? <small>{previewFrame.frameNote}</small> : null}</span> : null}
        {isRootSelection && !previewFrame?.frameNote && overallFrame?.pairedCanvas ? <small data-template-mobile-frame-source="adapted">手机画幅跟随桌面比例对换</small> : null}
        {isRootSelection && !overallFrame?.pairedCanvas && frameRules.height.mode === "aspect-ratio" && frameRules.height.ratio && lockedFrameRatio !== standardRatioLabel
          ? <small>设定比例 {frameRules.height.ratio.width}:{frameRules.height.ratio.height}</small> : null}
        {nodeIds.length === 1 && !allContainers ? <details className="template-native__proportion-source"><summary>比例来源</summary>
        <span className="template-native__proportion">高度规则 <strong>{describeTemplateFrameProportion(
          frameRules.height.mode,
          Number(renderedValues[firstId]?.borderWidth),
          Number(renderedValues[firstId]?.borderHeight),
          lockedFrameRatio,
        )}</strong></span>
        <span className="template-native__proportion" title="实际宽度与高度收成最近的标准比例，不会自动改写图片。">{allImages ? "图片框实测比例" : "外框实测比例"} <strong>{formatMeasuredTemplateRatio(Number(renderedValues[firstId]?.borderWidth), Number(renderedValues[firstId]?.borderHeight))}</strong></span>
        <span className="template-native__proportion">设定比例 <strong>{lockedFrameRatio ? standardRatioLabel : "未固定"}</strong></span>
      </details> : null}</div> : null}
      {group === "尺寸与位置" && isRootSelection ? ratioPresets : null}
      {group === "尺寸与位置" && descriptors.some((property) => property.path.startsWith("placement.")) ? <p>位置与尺寸按父区域可用宽高的百分比设置；上方显示画布实际像素尺寸。</p> : null}
      {group === "尺寸与位置" && ids.some((id) => !original.nodes[id].childIds.length && !original.nodes[id].slotId) ? <p className="template-native__measured" role="status">当前为空，画布使用编辑占位；模板仍按所选高度规则输出，添加内容后按实际内容重测。</p> : null}
      {group === "间距与对齐" && canDragPadding && targetBreakpoint === breakpoint ? <button type="button" className="template-native__spacing-action" disabled={controlsDisabled} onClick={() => {
        if (focusFirstInvalidNumberField()) return;
        const accepted = requestTemplateCanvasSpacingEditing(firstId, targetBreakpoint);
        setOperationError(accepted ? null : "请先在当前画布显示这个对象，再拖动调整留白。");
        if (accepted) onStartCanvasEdit?.();
      }}>在画布调整留白</button> : null}
      {group === (isRootSelection ? "布局" : "间距与对齐") && ids.length > 0 && ids.every((id) => supportsTemplateContainerAlignment(context(original, id).rules)) ? <div role="group" aria-label="容器内容对齐九宫格">
        <p>按画面方向对齐；网格作用于单元内对象，已填满的轴没有可见位移。</p>
        <div className="template-editor__composition" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4 }}>
          {(["start", "center", "end"] as const).flatMap((vertical, row) => (["start", "center", "end"] as const).map((horizontal, column) => {
            const label = `${["上", "中", "下"][row]}${["左", "中", "右"][column]}对齐`;
            const selected = ids.every((id) => { const rules = context(effective, id).rules; const value = getTemplateAlignmentRules(rules, horizontal, vertical); return rules.alignItems === value.alignItems && rules.justifyContent === value.justifyContent; });
            return <button type="button" key={label} aria-label={label} aria-pressed={selected} style={{ minHeight: 32 }} disabled={Boolean(pendingRatio || pendingLayout) || foreignInteraction} onClick={() => {
              cancel();
              const result = useTemplateEditorSession.getState().executeCommand({ type: "update-definition", label: `容器内容${label}`, update: (next) => {
                for (const id of ids) for (const [path, value] of Object.entries(getTemplateAlignmentRules(context(next, id).rules, horizontal, vertical))) setTemplateNodeRule(next, id, targetBreakpoint, path, value);
              } });
              setOperationError(result.ok ? null : result.message);
            }}>{["↖", "↑", "↗", "←", "·", "→", "↙", "↓", "↘"][row * 3 + column]}</button>;
          }))}
        </div>
      </div> : null}
      {(() => {
        const renderProperty = (property: Property) => {
        const values = (ids.length ? ids : [firstId]).map((id) => property.read(context(effective, id)));
        // 长度相同但单位不同仍是混合值；否则 1px 与 1rem 会被错误当成共同值。
        const comparableValues = property.unit === "px" ? (ids.length ? ids : [firstId]).map((id) => readPath(property.slot ? context(effective, id).slot : context(effective, id).rules, property.path)) : values;
        const mixed = comparableValues.some((value) => JSON.stringify(value) !== JSON.stringify(comparableValues[0]));
        const sources = (ids.length ? ids : [firstId]).map((id) => source(property, id));
        const actionLabel = property.path === "objectPosition" ? "图片焦点" : property.label;
        const hasOwnValue = sources.includes(targetBreakpoint);
        const uniqueSources = new Set(sources);
        const inheritance = uniqueSources.size !== 1
          ? "mixed"
          : sources[0] === "system"
            ? "system"
            : targetBreakpoint === "mobile" && sources[0] === "mobile"
              ? "override"
              : targetBreakpoint === "mobile" && sources[0] === "desktop"
                ? "inherited"
                : "explicit";
        const sourceLabel = inheritance === "mixed"
          ? "多个来源"
          : inheritance === "system"
            ? "系统默认"
            : inheritance === "override"
              ? "手机覆盖"
              : inheritance === "inherited"
                ? "继承桌面"
                : sources[0] !== "system" && sources[0] !== targetBreakpoint
                  ? `继承自${DEVICE_NAMES[sources[0]]}`
                  : sources[0] === "desktop"
                    ? "桌面基础"
                    : `${BP_LABELS[sources[0]]}独立设置`;
        const measuredValues = (ids.length ? ids : [firstId]).map((id) => renderedValues[id]?.[property.path]);
        const measuredMixed = measuredValues.some((value) => value !== measuredValues[0]);
        let interactionStartValue = Number.NaN;
        if (!mixed && !measuredMixed) {
          if (property.slot && ["fontSize", "fontWeight"].includes(property.path)) interactionStartValue = Number.parseFloat(measuredValues[0] ?? "");
          else if (property.slot && property.path === "lineHeight") {
            const ratios = (ids.length ? ids : [firstId]).map((id) => Number.parseFloat(renderedValues[id]?.lineHeight ?? "") / Number.parseFloat(renderedValues[id]?.fontSize ?? ""));
            if (ratios.every((ratio) => ratio === ratios[0])) interactionStartValue = ratios[0];
          } else if (!property.slot && (["gap", "radius", "minWidth"].includes(property.path) || property.path.startsWith("padding.") || property.path.startsWith("margin."))) interactionStartValue = 0;
        }
        const propertyDisabled = !ids.length || Boolean(pendingRatio) || Boolean(pendingLayout && pendingLayout.property.key !== property.key) || foreignInteraction;
        const visualChoice = nodeIds.length === 1 && (
          (allImages && property.path === "objectFit") || (allText && ["fontWeight", "textAlign"].includes(property.path))
        );
        const compactProperty = visualChoice || (isRootSelection && (property.group === "尺寸与位置" || property.path.startsWith("padding.")));
        const titleWeight = selectedNodes[0]?.slotId
          ? original.slots[selectedNodes[0].slotId]?.type === "heading" || ["display", "heading"].includes(context(effective, firstId).slot.fontRole ?? "")
          : false;
        const quickValues = property.path === "gap" ? GAP_QUICK_VALUES : null;
        const radiusRaw = property.path === "radius" && !mixed ? comparableValues[0] : undefined;
        const radiusValue = radiusRaw && typeof radiusRaw === "object"
          ? radiusRaw as { value?: unknown; unit?: unknown }
          : undefined;
        const radiusPressed = (amount: number) => comparableValues.length > 0 && comparableValues.every((current) => current && typeof current === "object"
          && (current as { value?: unknown }).value === amount && (current as { unit?: unknown }).unit === "px");
        const radiusHistorical = property.path === "radius" && !mixed && radiusValue
          && radiusValue.unit === "px" && radiusValue.value !== 0 && radiusValue.value !== 9999;
        return <Fragment key={property.key}>
          {group === "文字或媒体" && property.path === "textAlign" && allText && nodeIds.length === 1 && !isRootSelection
            ? <TemplateDefaultContentControls section="text-color" embedded nodeId={firstId} breakpoint={targetBreakpoint} disabled={controlsDisabled} />
            : null}
          <div className={`template-native__property ${property.group === "尺寸与位置" ? "template-native__size-property" : ""} ${property.path.startsWith("padding.") ? "template-native__pad" : ""}`} data-template-spacing-side={/^(padding|margin)\./.test(property.path) ? property.path.split(".")[1] : undefined} data-template-design-property={property.key} data-template-inheritance={targetBreakpoint === "mobile" ? inheritance : undefined}>
          <PropertyInput property={property} value={values[0]} mixed={mixed} disabled={propertyDisabled}
            interactionStartValue={interactionStartValue}
            compact={compactProperty || (allContainers && property.path === "width")}
            visual={visualChoice}
            titleWeight={titleWeight}
            optionDisabledReason={(value) => isRootSelection && property.path === "height" && value === "aspect-ratio" && values[0] !== value
              ? "请使用上方画幅预设"
              : ids.map((id) => getTemplateSizeOptionDisabledReason(original, id, targetBreakpoint, property.path, value)
              ?? ((property.path === "width" && value === "fixed" && typeof context(original, id).rules.width !== "object") || (property.path === "height" && ["fixed", "min-height"].includes(value) && context(original, id).rules.height.mode !== value)
                ? !context(original, id).measuredSize || !Number.isFinite(context(original, id).measuredSize?.[property.path as "width" | "height"]) ? "请先聚焦此断点并显示对象" : undefined : undefined)).find(Boolean)}
            unit={property.unit === "px" ? readPath(property.slot ? context(effective, firstId).slot : context(effective, firstId).rules, `${property.path}.unit`) as string | undefined : undefined}
            preview={(value) => edit(property, value, true)} commit={(value) => {
              if (["display", "direction"].includes(property.path)) { const result = edit(property, value, true); setPendingAll(null); setOperationError(result && !result.ok ? result.message : null); setPendingLayout(result?.ok ? { property, value } : null); }
              else {
                const result = edit(property, value, false);
                // 数值控件就近呈现合同错误，避免顶部重复播报；成功后清除旧操作错误。
                setOperationError(property.options && result && !result.ok ? result.message : null);
                return result;
              }
            }} cancel={cancel} />
          {quickValues ? <div className="template-editor__composition-segments" role="group" aria-label={`${property.label}快捷值`}>
            {quickValues.map((quickValue) => <button type="button" key={quickValue} disabled={propertyDisabled}
              aria-pressed={comparableValues.length > 0 && comparableValues.every((current) => current && typeof current === "object"
                && (current as { value?: unknown }).value === quickValue && (current as { unit?: unknown }).unit === "px")}
              onClick={() => {
                const result = edit(property, { value: quickValue, unit: "px" }, false);
                setOperationError(result && !result.ok ? result.message : null);
              }}>{quickValue} px</button>)}
          </div> : null}
          {property.path === "radius" ? <div>
            <div className="template-editor__composition-segments" role="group" aria-label={allImages ? "图片形状" : "圆角形状"}>
              <button type="button" disabled={propertyDisabled} aria-pressed={radiusPressed(0)} onClick={() => {
                const result = edit(property, { value: 0, unit: "px" }, false);
                setOperationError(result && !result.ok ? result.message : null);
              }}>直角</button>
              {allowsCircle ? <button type="button" disabled={propertyDisabled} aria-pressed={radiusPressed(9999)} onClick={() => {
                const result = edit(property, { value: 9999, unit: "px" }, false);
                setOperationError(result && !result.ok ? result.message : null);
              }}>圆形</button> : null}
            </div>
            {radiusHistorical ? <small data-template-radius-historical="true">当前圆角不是现行推荐（直角或圆形）。历史值仍保留，不会自动改掉。</small> : null}
          </div> : null}
          {property.path === "color" && typeof values[0] === "string" ? (() => {
            const ink = values[0];
            const ownBackground = context(effective, firstId).rules.backgroundColor;
            const pageHero = sectionRole === "page-hero";
            const inkLuminance = hexLuminance(ink);
            const surface = typeof ownBackground === "string" && /^#[0-9a-f]{6}$/i.test(ownBackground)
              ? ownBackground
              : pageHero && inkLuminance !== undefined && inkLuminance < 0.25
                ? "#111315"
                : undefined;
            const ratio = surface ? contrastRatio(ink, surface) : undefined;
            if (ratio === undefined || ratio >= 4.5) return null;
            return <div>
              <p role="status" data-template-contrast-note="true">当前文字颜色在深色画面上对比不足。这个按钮只改选中文字在当前设备上的颜色，可撤销。画面本身是浅色时不要用。</p>
              <button type="button" disabled={propertyDisabled} onClick={() => {
                const result = edit(property, "#F7F8F8", false);
                setOperationError(result && !result.ok ? result.message : null);
              }}>改为浅色文字</button>
            </div>;
          })() : null}
          {property.path === "columns" ? <small>列数不变时保留全部列比例；增加列时在末尾补 1；减少列时从末尾移除，其余比例不变。</small> : null}
          {pendingLayout?.property.key === property.key ? <div role="group" aria-label="确认布局转换"><p>画布正在预览布局变化。确认后写入当前作用域，可一次撤销。</p>
            <button type="button" onClick={() => { edit(property, pendingLayout.value, false); setPendingLayout(null); }}>确认布局</button>
            <button type="button" onClick={() => { cancel(); setPendingLayout(null); }}>取消转换</button>
          </div> : null}
          <div className="template-native__property-status">
          {property.key !== "focus.y" && hasOwnValue && (targetBreakpoint !== "desktop" || canResetSystemValue(property)) ? <button type="button" aria-label={targetBreakpoint === "desktop" ? `${actionLabel}恢复系统默认` : "恢复继承"} title={`${actionLabel}：${targetBreakpoint === "desktop" ? "移除此项显式值，保留手机覆盖" : "移除此项当前设备覆盖，重新使用上级值"}`} disabled={controlsDisabled} onClick={() => reset(property)}>{targetBreakpoint === "desktop" ? "恢复系统默认" : "恢复继承"}</button> : null}</div>
          {compactProperty ? (
            targetBreakpoint === "mobile" || changedSinceSave(property)
              ? <small>{targetBreakpoint === "mobile" ? sourceLabel : ""}{changedSinceSave(property) ? (targetBreakpoint === "mobile" ? " · 未保存" : "未保存") : ""}</small>
              : null
          ) : <div className="template-native__property-metadata">
          <small>来源：{new Set(sources).size === 1 ? BP_LABELS[sources[0]] : "多个来源"}{sources.every((item) => item === "desktop") ? (targetBreakpoint === "desktop" ? " · 对象显式值" : " · 继承桌面") : sources.every((item) => item === targetBreakpoint) ? " · 当前断点显式覆盖" : sources.every((item) => item !== targetBreakpoint && item !== "system") ? " · 继承值" : ""}{mixed ? " · 混合值" : ""}{changedSinceSave(property) ? " · 未保存" : ""}</small>
          <small data-template-effective-value>实际生效：{property.slot && isRenderedTypographyProperty(property.path)
            ? measuredMixed ? "多个画布计算值" : measuredValues[0] ? `${measuredValues[0]}（当前画布计算值）` : "未取得文字渲染值；隐藏或空内容时不推测数值"
            : mixed ? "多个有效值" : property.key.startsWith("focus.") ? `${values[0]}%` : property.options?.find(([key]) => key === String(values[0]))?.[1] ?? describeTemplateEffectiveValue(readPath(property.slot ? context(effective, firstId).slot : context(effective, firstId).rules, property.path), property.path, context(effective, firstId).rules, Boolean(property.slot), context(effective, firstId).slot)}</small>
          {["backgroundToken", "borderToken"].includes(property.path) ? <small>预设固定保存于当前对象；重开后沿用已选值。</small> : null}
          {property.key === "focus.x" ? <small>图片焦点为一项设计值；重置或恢复继承会同时处理横纵焦点。</small> : null}
          {property.key !== "focus.y" ? <>
          <button type="button" disabled={!ids.length || mixed || values[0] === undefined || Boolean(pendingRatio || pendingLayout) || foreignInteraction} onClick={() => setPendingAll(property)}>应用到电脑与手机</button></> : null}
          {pendingAll?.key === property.key ? <div role="group" aria-label={`确认统一${property.label}`}><p>将当前有效值写入桌面，并清除手机的此项覆盖。可撤销。</p>
            <button type="button" onClick={() => { cancel(); const result = useTemplateEditorSession.getState().executeCommand({ type: "update-definition", label: `电脑与手机统一${property.label}`, update: (next) => {
              for (const id of ids) {
                const encoded = property.encode(property.read(context(next, id)), context(next, id));
                if (property.slot) { const slotId = next.nodes[id].slotId!; setTemplateSlotRule(next, slotId, "desktop", property.path, encoded); resetTemplateSlotRule(next, slotId, "mobile", property.path); }
                else {
                  setNodeDesignRule(next, id, "desktop", property.path, encoded);
                  resetTemplateNodeRule(next, id, "mobile", property.path);
                  if (property.path === "backgroundToken" && Number(next.schemaVersion) >= 3) resetTemplateNodeRule(next, id, "mobile", "backgroundColor");
                }
              }
            } }); setOperationError(result.ok ? null : result.message); if (result.ok) setPendingAll(null); }}>确认统一</button><button type="button" onClick={() => setPendingAll(null)}>取消</button>
          </div> : null}
          </div>}
          </div>
        </Fragment>;
        };
        const properties = propertiesForGroup(group);
        if (group !== "间距与对齐") return properties.map(renderProperty);
        return <>
          {properties.filter((property) => !/^(padding|margin)\./.test(property.path)).map(renderProperty)}
          {(["padding", "margin"] as const).map((kind) => {
            const edges = properties.filter((property) => property.path.startsWith(`${kind}.`));
            if (!edges.length) return null;
            const fieldset = <fieldset key={kind} className="template-native__spacing-model" data-template-spacing-model={kind}>
              <legend>{kind === "padding" ? "内部留白" : "外部间距"}</legend>
              {!isRootSelection ? <small>前台间距优先使用 4 的倍数。已保存的 rem 或 vw 会保留，不会改写。</small> : null}
              {kind === "padding" ? <label className="template-native__spacing-link"><input type="checkbox" checked={linkPadding} disabled={controlsDisabled} onChange={(event) => setLinkPadding(event.target.checked)} />四边内边距联动</label> : null}
              <span className="template-native__spacing-center" aria-hidden="true">{kind === "padding" ? "内容区域" : "所选对象"}</span>
              {edges.map(renderProperty)}
            </fieldset>;
            if (!isRootSelection) return fieldset;

            const padding = context(effective, firstId).rules.padding;
            const hasMobilePadding = targetBreakpoint === "mobile"
              && edges.some((property) => source(property, firstId) === "mobile");
            return <div key={kind} className="template-native__overall-padding" role="group" aria-label="整体留白">
              <div className="template-native__padding-values">
                {(["top", "right", "bottom", "left"] as const).map((side, index) => {
                  const edge = padding?.[side];
                  return <span key={side}>{["上", "右", "下", "左"][index]} <strong>{edge ? `${edge.value}${edge.unit}` : "未设置"}</strong></span>;
                })}
              </div>
              {hasMobilePadding ? <button type="button" disabled={controlsDisabled} onClick={() => {
                if (!focusFirstInvalidNumberField()) reset({ label: "留白", path: "padding" });
              }}>恢复留白继承</button> : null}
              <section className="template-native__custom-padding">
                <h4>自定义留白</h4>
                {fieldset}
              </section>
            </div>;
          })}
        </>;
      })()}
      {group === "文字或媒体" && allImages && imageFocusValue ? <>
        <ImageFocusField
          key={`focus:${selectionKey}:${targetBreakpoint}`}
          label="画面焦点"
          value={imageFocusValue}
          disabled={controlsDisabled}
          previewSrc={imagePreviewSrc}
          previewFit={imagePreviewFit}
          onRequestCanvasAdjust={imagePreviewSrc && targetBreakpoint === breakpoint ? () => {
            if (focusFirstInvalidNumberField()) return;
            useTemplateEditorSession.getState().setImageFocusEditing(firstId);
            onStartCanvasEdit?.();
          } : undefined}
          onChange={(focus) => {
            cancel();
            const result = useTemplateEditorSession.getState().executeCommand({
              type: "update-definition",
              label: "调整图片焦点",
              update: (next) => {
                const slotId = next.nodes[firstId]?.slotId;
                if (!slotId) return;
                setTemplateSlotRule(next, slotId, targetBreakpoint, "objectPosition", percentToExactObjectPosition(focus));
              },
            });
            setOperationError(result.ok ? null : result.message);
          }}
        />
        {(() => {
          const focusProperty = descriptors.find((property) => property.key === "focus.x");
          if (!focusProperty) return null;
          const hasOwnValue = ids.some((id) => source(focusProperty, id) === targetBreakpoint);
          if (!hasOwnValue || (targetBreakpoint === "desktop" && !canResetSystemValue(focusProperty))) return null;
          return <button type="button" aria-label={targetBreakpoint === "desktop" ? "图片焦点恢复系统默认" : "恢复继承"} disabled={controlsDisabled} onClick={() => reset(focusProperty)}>
            {targetBreakpoint === "desktop" ? "恢复系统默认" : "恢复继承"}
          </button>;
        })()}
      </> : null}
      {group === "尺寸与位置" && !allText && !isRootSelection ? ratioPresets : null}
      {group === "文字或媒体" && !allText && nodeIds.length === 1 && !isRootSelection ? <TemplateDefaultContentControls section="text-style" key={`${firstId}:${targetBreakpoint}`} nodeId={firstId} breakpoint={targetBreakpoint} disabled={controlsDisabled} /> : null}
      {group === "尺寸与位置" && isRootSelection ? <div className="template-native__overall">
        {original.metadata.canvasSize ? <section className="template-native__design-width">
          <h4>设计基准宽度</h4>
          {targetBreakpoint === "desktop" ? <NumberField key={`${selectionKey}:design-width:${targetBreakpoint}`} label="设计宽度"
            value={effective.metadata.canvasSize?.width} min={1} max={4096} step={1} unit="px" disabled={controlsDisabled}
            onPreview={(value) => edit(DESIGN_WIDTH_PROPERTY, value, true)}
            onChange={(value) => edit(DESIGN_WIDTH_PROPERTY, value, false)} onCancel={cancel} commitUnchanged />
            : <p>当前设计基准宽度为 {original.metadata.canvasSize.width} px。手机默认预览宽度为 390 px，可在画布顶部调整；本节高度按所选高度方式计算。</p>}
          {targetBreakpoint === "desktop" ? <p>设计宽度是模板的坐标基准。只想换屏幕尺寸查看时，请在画布顶部调整预览宽度。</p> : null}
        </section> : null}
      </div> : null}
    </PropertyGroup>)}
    {sectionCopyState ? <div className="template-native__copy-visibility" data-template-section-copy={sectionCopyState} data-template-shared-scope="copy">
      <strong>标题与说明</strong>
      <p>以下两项两端一起生效，不随当前查看的手机或桌面改变。</p>
      <p>{sectionRole === "creation-grid"
        ? "作品图默认只显示画面。需要标题、说明或区块链接时再打开。桌面和手机一起生效。这项会清掉只在手机上的显示或隐藏，让手机与桌面一致。"
        : "关闭后，主标题、说明和区块链接在桌面和手机都不显示。这项会清掉只在手机上的显示或隐藏，让手机与桌面一致。"}</p>
      {sectionCopyState === "mixed" ? <p role="status">这组文字有的单独设置过，打开或关闭会一起改。</p> : null}
      <div role="group" aria-label="标题与说明">
        <button type="button" aria-pressed={sectionCopyState === "hidden"} disabled={controlsDisabled} onClick={() => setSectionCopyVisibility(false)}>不显示</button>
        <button type="button" aria-pressed={sectionCopyState === "shown"} disabled={controlsDisabled} onClick={() => setSectionCopyVisibility(true)}>显示</button>
      </div>
    </div> : null}
    <section className="template-native__breakpoint-actions"><h3>设备覆盖</h3>
    <p>{targetBreakpoint === "desktop" ? "无独立覆盖的手机会跟随基础值。" : "修改只作用于手机，不改变桌面。"}</p>
    {nodeIds.length > 1 ? <div role="group" aria-label="多选断点可见性"><button type="button" disabled={controlsDisabled} onClick={() => changeVisibility(false)}>当前断点全部显示</button><button type="button" disabled={controlsDisabled} onClick={() => changeVisibility(true)}>当前断点全部隐藏</button></div> : !isRootSelection ? <button type="button" disabled={controlsDisabled} onClick={() => changeVisibility()}>显示／隐藏当前断点</button> : <small>模板整体在所有设备保留；可分别调整内部区域的显示。</small>}
    {targetBreakpoint !== "desktop" ? <button type="button" disabled={controlsDisabled} onClick={() => { cancel(); const result = useTemplateEditorSession.getState().executeCommand({ type: "update-definition", label: "恢复所选对象全部继承", update: (next) => {
      for (const id of ids) { next.nodes[id].responsive[targetBreakpoint] = {}; const slotId = next.nodes[id].slotId; if (slotId) next.slots[slotId].mobileRules = {}; }
    } }); setOperationError(result.ok ? null : result.message); }}>全部恢复继承</button> : null}
    {nodeIds.length === 1 ? <TemplateAnchorControls nodeId={firstId} disabled={controlsDisabled || targetBreakpoint !== breakpoint} /> : null}
    <TemplateNativeResponsiveControls nodeIds={nodeIds} breakpoint={targetBreakpoint} disabled={controlsDisabled} getProperties={getNativeDesignProperties} />
    </section>
  </section>;
}
