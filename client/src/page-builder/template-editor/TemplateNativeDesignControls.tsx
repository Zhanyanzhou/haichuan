import { useEffect, useRef, useState, type ReactNode } from "react";
import "./templateNativeDesignControls.css";
import NumberField, { focusFirstInvalidNumberField } from "../inspector/controls/NumberField";
import {
  getDynamicTemplateNodeRegistryEntry, getDynamicTemplateStructureProtectedNodeIds, createDefaultDynamicTemplateResponsiveRules,
  type TemplateDefinitionV2, type DynamicTemplateResponsiveRules, type DynamicTemplateSlotRules,
} from "../template-definition";
import {
  resolveTemplateNodeRules, resolveTemplateSlotRules, getTemplateNodeRuleSource,
  setTemplateNodeRule, setTemplateSlotRule, resetTemplateNodeRule, resetTemplateSlotRule,
  type TemplateBreakpoint,
} from "../template-definition/responsive";
import { objectPositionToPercent, percentToExactObjectPosition } from "../template-definition/imagePosition";
import { useTemplateEditorSession } from "./templateEditorSession";
import TemplateAnchorControls from "./TemplateAnchorControls";
import TemplateNativeResponsiveControls from "./TemplateNativeResponsiveControls";
import TemplateDefaultContentControls from "./TemplateDefaultContentControls";
import { setTemplateLogicalDesignWidth } from "./templateDesignWidth";
import { isRenderedTypographyProperty, useTemplateRenderedPropertyValues } from "./useTemplateRenderedPropertyValues";
import {
  describeTemplateEffectiveValue, getTemplateAlignmentRules, getTemplateDesignRange,
  getTemplatePropertySystemValue, getTemplateSizeOptionDisabledReason, supportsTemplateContainerAlignment,
} from "../template-definition/designPropertySemantics";

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
  ratio?: boolean;
  read: (context: Context) => unknown;
  encode: (value: unknown, context: Context) => unknown;
};
type Property = NativeDesignProperty;
const BP_LABELS = { desktop: "Desktop 主值", tablet: "Tablet 覆盖", mobile: "Mobile 覆盖", system: "系统默认" };
const DEVICE_NAMES = { desktop: "桌面", tablet: "平板", mobile: "手机" };
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
const canResetSystemValue = (property: Property) => (property.slot ? RESETTABLE_TEXT_PROPERTIES : RESETTABLE_NODE_PROPERTIES).has(property.path);
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
  const slot = node.slotId ? definition.slots[node.slotId] : undefined;
  const parent = Object.values(definition.nodes).find((candidate) => candidate.childIds.includes(nodeId));
  const positioned = Boolean(parent && rules.placement && resolveTemplateNodeRules(definition, parent.nodeId, breakpoint).layoutMode === "free");
  const fields: Property[] = [];
  if (container) {
    fields.push(...["display", "direction", "layoutMode"].map((path) => ({ ...scalar(path, { display: "排列类型", direction: "排列方向", layoutMode: "布局模式" }[path]!, "布局", 0, 0), descriptorOnly: true })));
    if (rules.display === "flex" && rules.layoutMode !== "free") fields.push(
      choice("wrap", "自动换行", "布局", [["nowrap", "不换行"], ["wrap", "允许换行"]]),
    );
    if (rules.display === "grid" && rules.layoutMode !== "free") fields.push({
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
  fields.push({
    ...choice("height", "高度方式", "尺寸与位置", [["auto", "随内容变化"], ["fit", "适应内容"], ["fill", "填满可用空间"], ["fixed", "固定高度"], ["min-height", "最小高度"], ["aspect-ratio", "按比例（内容可增高）"]]),
    read: ({ rules: value }) => value.height.mode,
    encode: (value, context) => value === "fixed" || value === "min-height"
      ? { mode: value, value: context.rules.height.mode === value ? context.rules.height.value : fixedLength(context, "height") }
      : value === "aspect-ratio" ? { mode: value, ratio: context.rules.height.ratio ?? { width: 16, height: 9 } } : { mode: value },
  });
  if (rules.height.mode === "fixed" || rules.height.mode === "min-height") fields.push(length("height.value", "高度"));
  if (rules.height.mode === "viewport") fields.push({ ...length("height.value", "视口相对高度"), units: ["vh", "vw"] });
  if (rules.height.mode === "aspect-ratio") {
    if (nodeId === definition.rootNodeId) fields.push({ ...scalar("height.ratio", "整体比例", "尺寸与位置", 1, 1000), ratio: true });
    else fields.push(scalar("height.ratio.width", "比例宽", "尺寸与位置", 1, 1000), scalar("height.ratio.height", "比例高", "尺寸与位置", 1, 1000));
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
    fields.push(choice("objectFit", "图片适配", "文字或媒体", [["cover", "裁切填满"], ["contain", "完整显示"], ["fill", "拉伸填满"]], true));
    const slotRules = resolveTemplateSlotRules(definition, slot.slotId, breakpoint);
    if ((slotRules.objectFit ?? "cover") === "cover") for (const axis of ["x", "y"] as const) fields.push({
      ...scalar("objectPosition", axis === "x" ? "水平焦点" : "垂直焦点", "文字或媒体", 0, 100, true), key: `focus.${axis}`, unit: "%",
      read: ({ slot: current }) => objectPositionToPercent(current.objectPosition)[axis],
      encode: (value, { slot: current }) => percentToExactObjectPosition({ ...objectPositionToPercent(current.objectPosition), [axis]: Number(value) }),
    });
  }
  if (slot && ["heading", "text", "richText", "badge", "button", "link"].includes(slot.type)) fields.push(
    length("fontSize", "字号", "文字或媒体", true),
    scalar("fontWeight", "字重", "文字或媒体", 100, 900, true),
    choice("textAlign", "文字对齐", "文字或媒体", [["left", "左对齐"], ["center", "居中"], ["right", "右对齐"]], true),
    scalar("lineHeight", "行高", "文字或媒体", 0.8, 3, true),
    choice("fontRole", "字体角色", "文字或媒体", [["display", "展示标题"], ["heading", "标题"], ["body", "正文"], ["caption", "说明"], ["action", "行动"]], true),
    choice("overflow", "文字溢出", "文字或媒体", [["wrap", "自动换行"], ["ellipsis", "超出省略"], ["clip", "超出裁剪"]], true),
    scalar("maxLines", "最大行数", "文字或媒体", 1, 20, true),
  );
  return fields;
}

function PropertyInput({ property, value, mixed, disabled, preview, commit, cancel, unit, optionDisabledReason, interactionStartValue }: {
  property: Property; value: unknown; mixed: boolean; disabled: boolean;
  preview: (value: unknown) => unknown; commit: (value: unknown) => unknown; cancel: () => void;
  unit?: string;
  optionDisabledReason: (value: string) => string | undefined;
  interactionStartValue: number;
}) {
  if (property.ratio) {
    const ratio = value as { width: number; height: number };
    return <fieldset className="template-native__ratio-input" aria-label={property.label}>
      <legend>{property.label} · 宽 : 高</legend>
      {(["width", "height"] as const).map((axis) => <NumberField key={axis} label={axis === "width" ? "比例宽" : "比例高"}
        value={mixed ? undefined : ratio?.[axis]} min={1} max={1000} disabled={disabled} step={1}
        onPreview={(next) => preview({ ...ratio, [axis]: next })} onCancel={cancel}
        onChange={(next) => commit({ ...ratio, [axis]: next })} commitUnchanged displayPrecision={2} />)}
    </fieldset>;
  }
  if (property.options) return <label className="template-editor__simple-select">{property.label}
    <select aria-label={property.label} disabled={disabled} value={mixed ? "mixed" : value === undefined ? "" : String(value)} onChange={(event) => commit(event.target.value)}>
      {mixed ? <option value="mixed" disabled>混合值</option> : null}
      <option value="" disabled>未显式设置</option>
      {!mixed && value !== undefined && !property.options.some(([key]) => key === String(value)) ? <option value={String(value)} disabled>{property.path === "height" && value === "viewport" ? "随视口高度（已有值）" : `当前值：${String(value)}（保留）`}</option> : null}
      {property.options.map(([key, label]) => <option value={key} key={key} disabled={Boolean(optionDisabledReason(key))}>{label}{optionDisabledReason(key) ? `（${optionDisabledReason(key)}）` : ""}</option>)}
    </select>
    {property.options.some(([key]) => optionDisabledReason(key)) ? <details className="template-native__unavailable-options"><summary>查看尺寸方式限制</summary>{property.options.flatMap(([key, label]) => optionDisabledReason(key) ? [<small key={key}>{label}不可用：{optionDisabledReason(key)}</small>] : [])}</details> : null}
  </label>;
  return <NumberField label={property.label} value={mixed ? undefined : value as number | undefined}
    placeholder={mixed ? "混合值" : "未显式设置"} disabled={disabled} min={property.min} max={property.max}
    unit={property.path === "lineHeight" ? "倍" : unit ?? property.unit} step={property.path === "lineHeight" || property.path.startsWith("placement.") ? 0.1 : property.path === "fontWeight" ? 100 : 1} onPreview={preview} onCancel={cancel}
    onChange={commit} commitUnchanged interactionStartValue={interactionStartValue} displayPrecision={2}
    unitOptions={property.unit === "px" ? property.units ?? ["px", "%", "rem", "vw", "vh"] : undefined}
    onUnitChange={property.unit === "px" && !mixed ? (nextUnit, nextValue) => commit({ value: nextValue, unit: nextUnit }) : undefined} />;
}

function PropertyMetadata({ label, children }: { label: string; children: ReactNode }) {
  return <details className="template-native__property-metadata"><summary title="来源与跨设备操作">{label}</summary>{children}</details>;
}

function PropertyGroup({ name, title, summary, secondary, children }: {
  name: string; title: string; summary: string; secondary: boolean; children: ReactNode;
}) {
  const className = `template-editor__settings-section template-native__section ${name === "尺寸与位置" ? "template-native__dimensions" : ""}`;
  return secondary ? <details className="template-native__secondary-group" data-template-property-group={name}
    onToggle={(event) => {
      if (!event.currentTarget.open && event.currentTarget.querySelector('[aria-invalid="true"]')) {
        event.currentTarget.open = true;
        focusFirstInvalidNumberField();
      }
    }}>
    <summary><span>{title}</span>{summary ? <small>{summary}</small> : null}</summary>
    <section className={className}>{children}</section>
  </details> : <section className={className} data-template-property-group={name}><h3>{title}</h3>{children}</section>;
}

export default function TemplateNativeDesignControls({ nodeIds, layoutControls, onOpenPageScope }: { nodeIds: string[]; layoutControls?: (context: { disabled: boolean }) => ReactNode; onOpenPageScope?: () => void }) {
  const draft = useTemplateEditorSession((state) => state.draft);
  const baseline = useTemplateEditorSession((state) => state.baseline);
  const previewDocument = useTemplateEditorSession((state) => state.previewDocument);
  const activeInteraction = useTemplateEditorSession((state) => state.activeInteraction);
  const breakpoint = useTemplateEditorSession((state) => state.breakpoint);
  const previewWidth = useTemplateEditorSession((state) => state.previewWidth);
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
  useEffect(() => { setPendingAll(null); setPendingLayout(null); setPendingRatio(null); setOperationError(null); setLinkPadding(false); return cancel; }, [selectionKey, breakpoint, scope]);
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
  const targetBreakpoint = scope === "base" ? "desktop" : breakpoint;
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
  const reset = (property: Property) => {
    cancel();
    const isSystemReset = targetBreakpoint === "desktop";
    if (isSystemReset && !canResetSystemValue(property)) return;
    const result = useTemplateEditorSession.getState().executeCommand({ type: "update-definition", label: isSystemReset ? `${property.label}恢复系统默认` : `恢复${property.label}继承`, update: (next) => {
      for (const id of ids) {
        if (isSystemReset) {
          // 白名单仅含可选顶层字段；删除主值不触碰 Tablet/Mobile 的有意覆盖。
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
    const candidates: TemplateBreakpoint[] = targetBreakpoint === "mobile" ? ["mobile", "tablet", "desktop"] : targetBreakpoint === "tablet" ? ["tablet", "desktop"] : ["desktop"];
    return candidates.find((bp) => readPath(bp === "desktop" ? slot.desktopRules : bp === "tablet" ? slot.tabletRules : slot.mobileRules, property.path) !== undefined) ?? "system";
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
          const upstream: TemplateBreakpoint[] = breakpoint === "mobile" ? ["tablet", "desktop"] : breakpoint === "tablet" ? ["desktop"] : [];
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
    return values.every((value) => Math.abs(value - values[0]) < 0.05) ? `${Number(values[0].toFixed(1))} px` : "混合尺寸";
  };
  const selectedNodes = nodeIds.map((id) => original.nodes[id]).filter(Boolean);
  const allContainers = selectedNodes.every((node) => getDynamicTemplateNodeRegistryEntry(node.type).canHaveChildren);
  const allText = selectedNodes.every((node) => node.slotId && ["heading", "text", "richText", "badge", "button", "link"].includes(original.slots[node.slotId]?.type));
  const allImages = selectedNodes.every((node) => node.slotId && original.slots[node.slotId]?.type === "image");
  const isRootSelection = nodeIds.length === 1 && firstId === original.rootNodeId;
  const emptyContainerSelection = ids.length > 0 && ids.every((id) => !original.nodes[id].childIds.length && !original.nodes[id].slotId);
  const groupOrder = isRootSelection ? ["尺寸与位置", "间距与对齐", "布局", "尺寸限制", "外观"]
    : allText || allImages ? ["文字或媒体", "尺寸与位置", "间距与对齐", "布局", "尺寸限制", "外观"]
    : allContainers ? ["布局", "尺寸与位置", "间距与对齐", "文字或媒体", "尺寸限制", "外观"]
      : ["尺寸与位置", "文字或媒体", "间距与对齐", "布局", "尺寸限制", "外观"];
  const storedValue = (definition: TemplateDefinitionV2, id: string, property: Property) => {
    const node = definition.nodes[id];
    if (!node) return undefined;
    const slot = node.slotId ? definition.slots[node.slotId] : undefined;
    return readPath(property.slot ? targetBreakpoint === "desktop" ? slot?.desktopRules : targetBreakpoint === "tablet" ? slot?.tabletRules : slot?.mobileRules : node.responsive[targetBreakpoint], property.path);
  };
  const changedSinceSave = (property: Property) => Boolean(baseline && ids.some((id) => JSON.stringify(storedValue(original, id, property)) !== JSON.stringify(storedValue(baseline.definition, id, property))));
  const groupSummary = (group: string) => {
    const properties = descriptors.filter((property) => property.group === group);
    const configured = properties.filter((property) => ids.some((id) => storedValue(original, id, property) !== undefined)).length;
    const changed = properties.filter(changedSinceSave).length;
    return [configured ? `${configured} 项已设置` : "未单独设置", changed ? `${changed} 项未保存` : !baseline ? "新草稿" : ""].filter(Boolean).join(" · ");
  };
  const controlsDisabled = !ids.length || Boolean(pendingRatio || pendingLayout) || foreignInteraction;
  const layoutScopeMismatch = allContainers && nodeIds.length === 1 && targetBreakpoint !== breakpoint;
  const layoutDisabled = !ids.length || Boolean(pendingRatio || pendingLayout) || layoutScopeMismatch;
  const layoutScopeNotice = layoutScopeMismatch ? <p className="template-native__scope-notice" role="status">
    当前查看{DEVICE_NAMES[breakpoint]}画布，但修改范围是桌面基础。排列转换需要在目标画布预览。
    <button type="button" onClick={() => { if (!focusFirstInvalidNumberField()) useTemplateEditorSession.getState().setBreakpoint("desktop"); }}>切换到桌面画布</button>
  </p> : null;
  return <section className="template-editor__native-design" data-template-overall-design={isRootSelection || undefined} aria-label={nodeIds.length > 1 ? "多选设计属性" : "对象设计属性"}>
    {operationError ? <p role="alert">{operationError}</p> : null}
    <div className="template-native__editing-context" aria-label="当前编辑范围">
    <p className="template-native__context" role="status"><span>当前设备</span><strong>{DEVICE_NAMES[breakpoint]}</strong>{nodeIds.length > 1 ? <small>已选 {nodeIds.length} 个 · 可改 {ids.length} 个</small> : null}{ids.length < nodeIds.length ? <small>{nodeIds.length - ids.length} 个锁定对象不参与修改</small> : null}</p>
    {breakpoint === "desktop" ? <p className="template-native__scope-summary" role="status">正在修改桌面基础，保留手机和平板的独立设置。</p> : <label className="template-editor__simple-select template-native__scope"><span>修改范围</span><select aria-label="修改作用域" value={scope} disabled={Boolean(pendingRatio || pendingLayout) || foreignInteraction} onChange={(event) => { if (focusFirstInvalidNumberField()) return; cancel(); setScope(event.target.value as "current" | "base"); }}>
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
    {(resolveTemplateNodeRules(original, firstId, breakpoint).display === "none" || resolveTemplateNodeRules(original, firstId, breakpoint).hidden) ? <p role="status">此对象在当前断点隐藏，可恢复显示或选择父级。<button type="button" disabled={controlsDisabled || selectedNodes.some((node) => node.hidden)} onClick={() => changeVisibility(false)}>在当前设备显示</button></p> : null}
    {allContainers && nodeIds.length === 1 && !isRootSelection ? <>{layoutScopeNotice}{layoutControls?.({ disabled: layoutDisabled })}</> : null}
    {groupOrder.filter((group) => descriptors.some((property) => property.group === group)).map((group) => <PropertyGroup key={`${selectionKey}:${group}`} name={group}
      title={isRootSelection && group === "尺寸与位置" ? "模板整体尺寸与比例" : group === "文字或媒体" ? allImages ? "图片适配与焦点" : allText ? "文字排版" : "文字或媒体" : group === "外观" ? "背景与边框" : group}
      summary={groupSummary(group)} secondary={group === "尺寸限制" || group === "外观" || (group === "间距与对齐" && !allContainers)}>
      {group === "外观" && nodeIds.length === 1 && !isRootSelection ? <TemplateDefaultContentControls section="background" key={`${firstId}:${targetBreakpoint}`} nodeId={firstId} breakpoint={targetBreakpoint} disabled={controlsDisabled} /> : null}
      {group === "尺寸与位置" ? <div className="template-native__measured" aria-label="当前画布对象外框尺寸"><span>实际宽 <strong>{sizeLabel("borderWidth")}</strong></span><span>{emptyContainerSelection ? "画布占位高" : "实际高"} <strong>{sizeLabel("borderHeight")}</strong>{emptyContainerSelection ? <small>（非输出高度）</small> : null}</span></div> : null}
      {group === "尺寸与位置" && descriptors.some((property) => property.path.startsWith("placement.")) ? <p>位置与尺寸按父区域可用宽高的百分比设置；上方显示画布实际像素尺寸。</p> : null}
      {group === "尺寸与位置" && isRootSelection ? <div className="template-native__overall-explanation">
        {original.metadata.canvasSize ? <div className="template-native__design-width">
          {targetBreakpoint === "desktop" ? <NumberField key={`${selectionKey}:design-width:${targetBreakpoint}`} label="设计宽度"
            value={effective.metadata.canvasSize?.width} min={1} max={4096} step={1} unit="px" disabled={controlsDisabled}
            onPreview={(value) => edit(DESIGN_WIDTH_PROPERTY, value, true)}
            onChange={(value) => edit(DESIGN_WIDTH_PROPERTY, value, false)} onCancel={cancel} commitUnchanged />
            : <p>设计宽度：{original.metadata.canvasSize.width} px，属于桌面基础；可切换修改范围后调整。</p>}
          <p>设计宽度会保存并可撤销，保留内部对象及各端独立设置；画布工具中的预览宽度仅用于观察。</p>
          {breakpoint === "desktop" && previewWidth !== null ? <p>当前画布仍以 {previewWidth} px 观察。
            <button type="button" disabled={controlsDisabled} onClick={() => useTemplateEditorSession.getState().setPreviewWidth(null)}>按设计宽度查看</button>
          </p> : null}
        </div> : null}
        <p><strong>整体宽度：适应页面可用宽度</strong></p>
        <details><summary>尺寸与预览规则</summary>
        <p>预览宽度用于模拟屏幕，缩放只改变看图大小；整体高度由下面的规则决定。</p>
        <p>{["auto", "fit"].includes(context(effective, firstId).rules.height.mode)
          ? "高度随内部内容和留白增长。图片比例单独设置，不决定整个模板的比例。"
          : context(effective, firstId).rules.height.mode === "aspect-ratio"
            ? "优先按整体宽度计算比例高度；内容和最小尺寸可能撑高模板。比例不会自动让内部区域填满，需另外设置布局与对齐。"
            : "高度受指定尺寸约束。请检查长文和手机画面，超出时调整高度或内部布局，不要裁掉必要文字。"}</p>
        </details>
      </div> : null}
      {group === "尺寸与位置" && ids.some((id) => !original.nodes[id].childIds.length && !original.nodes[id].slotId) ? <p className="template-native__measured" role="status">当前为空，画布使用编辑占位；模板仍按所选高度规则输出，添加内容后按实际内容重测。</p> : null}
      {group === "尺寸与位置" ? <div className="template-native__ratio" role="group" aria-label={isRootSelection ? "模板整体比例预设" : "对象外框比例预设"}>
        <span title="调整对象高度与宽度的关系，不修改图片内容焦点">{isRootSelection ? "整体比例" : "外框比例"}</span>
        {ratioMeasurementMissing ? <small>请先聚焦修改范围对应的设备并显示对象，才能按实际尺寸调整比例。</small> : null}
        {(isRootSelection ? [[1, 1], [4, 3], [16, 9], [4, 5]] : [[1, 1], [4, 5], [16, 9]]).map(([width, height]) => <button type="button" key={`${width}:${height}`} aria-pressed={ids.length > 0 && ids.every((id) => {
          if (positionedIds.includes(id)) return renderedValues[id]?.breakpoint === targetBreakpoint && Math.abs(Number(renderedValues[id]?.borderWidth) / Number(renderedValues[id]?.borderHeight) - width / height) < .001;
          const rule = context(effective, id).rules.height; return rule.mode === "aspect-ratio" && rule.ratio?.width === width && rule.ratio?.height === height;
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
        }}>{width}:{height}</button>)}
        {pendingRatio ? <div role="group" aria-label="确认对象比例"><p>画布正在预览{isRootSelection ? "整体" : ""} {pendingRatio.width}:{pendingRatio.height}；确认后写入{targetBreakpoint === "desktop" ? " Desktop 主值" : ` ${targetBreakpoint === "tablet" ? "Tablet" : "Mobile"} 覆盖`}，可一次撤销。</p>
          <button type="button" onClick={() => {
            const result = edit(OBJECT_RATIO_PROPERTY, pendingRatio, false);
            ratioParentSizes.current = {};
            setOperationError(result && !result.ok ? result.message : null); setPendingRatio(null);
          }}>确认对象比例</button>
          <button type="button" onClick={() => { cancel(); setPendingRatio(null); }}>取消比例预览</button>
        </div> : null}
      </div> : null}
      {group === "间距与对齐" && descriptors.some((property) => property.path.startsWith("padding.")) ? <label><input type="checkbox" checked={linkPadding} onChange={(event) => setLinkPadding(event.target.checked)} />四边内边距联动</label> : null}
      {group === "间距与对齐" && ids.length > 0 && ids.every((id) => supportsTemplateContainerAlignment(context(original, id).rules)) ? <div role="group" aria-label="容器内容对齐九宫格">
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
      {descriptors.filter((property) => property.group === group).map((property) => {
        const values = (ids.length ? ids : [firstId]).map((id) => property.read(context(effective, id)));
        // 长度相同但单位不同仍是混合值；否则 1px 与 1rem 会被错误当成共同值。
        const comparableValues = property.unit === "px" ? (ids.length ? ids : [firstId]).map((id) => readPath(property.slot ? context(effective, id).slot : context(effective, id).rules, property.path)) : values;
        const mixed = comparableValues.some((value) => JSON.stringify(value) !== JSON.stringify(comparableValues[0]));
        const sources = (ids.length ? ids : [firstId]).map((id) => source(property, id));
        const actionLabel = property.path === "objectPosition" ? "图片焦点" : property.label;
        const hasOwnValue = sources.includes(targetBreakpoint);
        const sourceLabel = new Set(sources).size !== 1 ? "多个来源" : sources[0] === "system" ? "系统默认" : sources[0] !== targetBreakpoint ? `继承自${DEVICE_NAMES[sources[0]]}` : sources[0] === "desktop" ? "桌面基础" : `${DEVICE_NAMES[sources[0]]}独立设置`;
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
        return <div className={`template-native__property ${property.group === "尺寸与位置" ? "template-native__size-property" : ""}`} key={property.key} data-template-design-property={property.key}>
          <PropertyInput property={property} value={values[0]} mixed={mixed} disabled={!ids.length || Boolean(pendingRatio) || Boolean(pendingLayout && pendingLayout.property.key !== property.key) || foreignInteraction}
            interactionStartValue={interactionStartValue}
            optionDisabledReason={(value) => ids.map((id) => getTemplateSizeOptionDisabledReason(original, id, targetBreakpoint, property.path, value)
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
          {property.path === "columns" ? <small>列数不变时保留全部列比例；增加列时在末尾补 1；减少列时从末尾移除，其余比例不变。</small> : null}
          {pendingLayout?.property.key === property.key ? <div role="group" aria-label="确认布局转换"><p>画布正在预览布局变化。确认后写入当前作用域，可一次撤销。</p>
            <button type="button" onClick={() => { edit(property, pendingLayout.value, false); setPendingLayout(null); }}>确认布局</button>
            <button type="button" onClick={() => { cancel(); setPendingLayout(null); }}>取消转换</button>
          </div> : null}
          <div className="template-native__property-status">
          {property.key !== "focus.y" && hasOwnValue && (targetBreakpoint !== "desktop" || canResetSystemValue(property)) ? <button type="button" aria-label={targetBreakpoint === "desktop" ? `${actionLabel}恢复系统默认` : "恢复继承"} title={`${actionLabel}：${targetBreakpoint === "desktop" ? "移除此项显式值，保留下级覆盖" : "移除此项当前设备覆盖，重新使用上级值"}`} disabled={controlsDisabled} onClick={() => reset(property)}>{targetBreakpoint === "desktop" ? "恢复系统默认" : "恢复继承"}</button> : null}</div>
          <PropertyMetadata label={`${sourceLabel}${mixed ? " · 混合值" : ""}${changedSinceSave(property) ? " · 未保存" : ""}`}>
          <small>来源：{new Set(sources).size === 1 ? BP_LABELS[sources[0]] : "多个来源"}{sources.every((item) => item === "desktop") ? " · 对象显式值" : sources.every((item) => item === targetBreakpoint) ? " · 当前断点显式覆盖" : sources.every((item) => item !== targetBreakpoint && item !== "system") ? " · 继承值" : ""}{mixed ? " · 混合值" : ""}</small>
          <small data-template-effective-value>实际生效：{property.slot && isRenderedTypographyProperty(property.path)
            ? measuredMixed ? "多个画布计算值" : measuredValues[0] ? `${measuredValues[0]}（当前画布计算值）` : "未取得文字渲染值；隐藏或空内容时不推测数值"
            : mixed ? "多个有效值" : property.key.startsWith("focus.") ? `${values[0]}%` : property.options?.find(([key]) => key === String(values[0]))?.[1] ?? describeTemplateEffectiveValue(readPath(property.slot ? context(effective, firstId).slot : context(effective, firstId).rules, property.path), property.path, context(effective, firstId).rules, Boolean(property.slot), context(effective, firstId).slot)}</small>
          {["backgroundToken", "borderToken"].includes(property.path) ? <small>预设固定保存于当前对象；重开后沿用已选值。</small> : null}
          {property.key === "focus.x" ? <small>图片焦点为一项设计值；重置或恢复继承会同时处理横纵焦点。</small> : null}
          {property.key !== "focus.y" ? <>
          <button type="button" disabled={!ids.length || mixed || values[0] === undefined || Boolean(pendingRatio || pendingLayout) || foreignInteraction} onClick={() => setPendingAll(property)}>应用到所有断点</button></> : null}
          {pendingAll?.key === property.key ? <div role="group" aria-label={`确认统一${property.label}`}><p>将当前有效值写入 Desktop，并清除 Tablet、Mobile 的此项覆盖。可撤销。</p>
            <button type="button" onClick={() => { cancel(); const result = useTemplateEditorSession.getState().executeCommand({ type: "update-definition", label: `所有断点统一${property.label}`, update: (next) => {
              for (const id of ids) {
                const encoded = property.encode(property.read(context(next, id)), context(next, id));
                if (property.slot) { const slotId = next.nodes[id].slotId!; setTemplateSlotRule(next, slotId, "desktop", property.path, encoded); resetTemplateSlotRule(next, slotId, "tablet", property.path); resetTemplateSlotRule(next, slotId, "mobile", property.path); }
                else {
                  setNodeDesignRule(next, id, "desktop", property.path, encoded);
                  for (const bp of ["tablet", "mobile"] as const) {
                    resetTemplateNodeRule(next, id, bp, property.path);
                    if (property.path === "backgroundToken" && Number(next.schemaVersion) >= 3) resetTemplateNodeRule(next, id, bp, "backgroundColor");
                  }
                }
              }
            } }); setOperationError(result.ok ? null : result.message); if (result.ok) setPendingAll(null); }}>确认统一</button><button type="button" onClick={() => setPendingAll(null)}>取消</button>
          </div> : null}
          </PropertyMetadata>
        </div>;
      })}
      {group === "文字或媒体" && nodeIds.length === 1 && !isRootSelection ? <TemplateDefaultContentControls section="text-style" key={`${firstId}:${targetBreakpoint}`} nodeId={firstId} breakpoint={targetBreakpoint} disabled={controlsDisabled} /> : null}
      {group === "尺寸与位置" && isRootSelection ? <div className="template-native__layout-after-size">{layoutScopeNotice}{layoutControls?.({ disabled: layoutDisabled })}</div> : null}
      {group === "尺寸与位置" && isRootSelection ? <TemplateDefaultContentControls key={`${firstId}:${targetBreakpoint}`} nodeId={firstId} breakpoint={targetBreakpoint} disabled={controlsDisabled} /> : null}
    </PropertyGroup>)}
    <details className="template-native__breakpoint-actions"><summary><span>断点显示与继承</span><small>{targetBreakpoint === "desktop" ? "当前改桌面基础" : `当前改${DEVICE_NAMES[targetBreakpoint]}覆盖`}</small></summary>
    <p>{targetBreakpoint === "desktop" ? "无独立覆盖的平板、手机会跟随基础值。" : targetBreakpoint === "tablet" ? "修改形成平板独立设置，手机继承项可能跟随。" : "修改只作用于手机，不改变桌面和平板。"}</p>
    {nodeIds.length > 1 ? <div role="group" aria-label="多选断点可见性"><button type="button" disabled={controlsDisabled} onClick={() => changeVisibility(false)}>当前断点全部显示</button><button type="button" disabled={controlsDisabled} onClick={() => changeVisibility(true)}>当前断点全部隐藏</button></div> : !isRootSelection ? <button type="button" disabled={controlsDisabled} onClick={() => changeVisibility()}>显示／隐藏当前断点</button> : <small>模板整体在所有设备保留；可分别调整内部区域的显示。</small>}
    {targetBreakpoint !== "desktop" ? <button type="button" disabled={controlsDisabled} onClick={() => { cancel(); const result = useTemplateEditorSession.getState().executeCommand({ type: "update-definition", label: "恢复所选对象全部继承", update: (next) => {
      for (const id of ids) { next.nodes[id].responsive[targetBreakpoint] = {}; const slotId = next.nodes[id].slotId; if (slotId) { if (targetBreakpoint === "tablet") next.slots[slotId].tabletRules = {}; else next.slots[slotId].mobileRules = {}; } }
    } }); setOperationError(result.ok ? null : result.message); }}>全部恢复继承</button> : null}
    </details>
    {nodeIds.length === 1 ? <TemplateAnchorControls nodeId={firstId} disabled={controlsDisabled || targetBreakpoint !== breakpoint} /> : null}
    <TemplateNativeResponsiveControls nodeIds={nodeIds} breakpoint={targetBreakpoint} disabled={controlsDisabled} getProperties={getNativeDesignProperties} />
  </section>;
}
