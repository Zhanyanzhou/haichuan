import { useEffect, useMemo, useState } from "react";
import { Modal } from "antd";
import {
  getDynamicTemplateStructureProtectedNodeIds,
  type TemplateDefinitionV2,
} from "../template-definition";
import {
  resolveTemplateNodeRules, resolveTemplateSlotRules,
  setTemplateNodeRule, setTemplateSlotRule,
  type TemplateBreakpoint,
} from "../template-definition/responsive";
import { useTemplateEditorSession } from "./templateEditorSession";
import "./templateNativeResponsiveControls.css";

/** 属性目录由原生控件提供；响应式工具不维护另一份字段或分组清单。 */
type ResponsiveProperty = { key: string; label: string; group: string; path: string; slot?: boolean };
type GetProperties = (definition: TemplateDefinitionV2, nodeId: string, breakpoint: TemplateBreakpoint) => ResponsiveProperty[];
const BREAKPOINTS = ["desktop", "tablet", "mobile"] as const;
const LABELS = { desktop: "桌面", tablet: "平板", mobile: "手机" };
const same = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && same(a[key], b[key]));
};
function localRules(definition: TemplateDefinitionV2, nodeId: string, breakpoint: TemplateBreakpoint, slot: boolean): Record<string, unknown> {
  const node = definition.nodes[nodeId];
  if (!slot) return (node.responsive[breakpoint] ?? {}) as unknown as Record<string, unknown>;
  const field = definition.slots[node.slotId!];
  return (breakpoint === "desktop" ? field.desktopRules : breakpoint === "tablet" ? field.tabletRules ?? {} : field.mobileRules) as Record<string, unknown>;
}
function effectiveRules(definition: TemplateDefinitionV2, nodeId: string, breakpoint: TemplateBreakpoint, slot: boolean): Record<string, unknown> {
  return (slot ? resolveTemplateSlotRules(definition, definition.nodes[nodeId].slotId!, breakpoint) : resolveTemplateNodeRules(definition, nodeId, breakpoint)) as unknown as Record<string, unknown>;
}
function formatValue(value: unknown): string {
  if (value === undefined) return "未单独设置";
  if (value === null) return "取消设置";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value !== "object") return String(value);
  if ("value" in value && "unit" in value) return `${value.value} ${value.unit}`;
  return JSON.stringify(value);
}
type Change = { nodeId: string; name: string; label: string; group: string; path: string; slot: boolean; before: unknown; after: unknown };
export type NativeResponsivePlan = {
  definition: TemplateDefinitionV2;
  changes: Change[];
  excludedIds: string[];
};

/** 投影只存在于确认窗口中；保存时由同一 update-definition 命令验证并一次写入历史。 */
export function createNativeResponsivePlan({ definition, source, nodeIds, sourceBreakpoint, targetBreakpoint, groups, mode, getProperties }: {
  definition: TemplateDefinitionV2; source: TemplateDefinitionV2; nodeIds: string[];
  sourceBreakpoint: TemplateBreakpoint; targetBreakpoint: TemplateBreakpoint;
  groups: string[]; mode: "copy" | "restore"; getProperties: GetProperties;
}): NativeResponsivePlan {
  if (definition.templateId !== source.templateId) throw new Error("来源属于另一模板，请重新打开属性面板。");
  if (definition.schemaVersion < 2 || source.schemaVersion < 2) throw new Error("当前模板需先完成三断点兼容恢复。");
  if (!groups.length) throw new Error("请先选择需要复制或恢复的设计组。");
  const next = structuredClone(definition);
  const protectedIds = getDynamicTemplateStructureProtectedNodeIds(definition);
  const plan: NativeResponsivePlan = { definition: next, changes: [], excludedIds: [] };
  for (const nodeId of [...new Set(nodeIds)]) {
    const node = definition.nodes[nodeId], sourceNode = source.nodes[nodeId];
    if (!node || protectedIds.has(nodeId) || !sourceNode || sourceNode.type !== node.type || sourceNode.slotId !== node.slotId) {
      plan.excludedIds.push(nodeId); continue;
    }
    // 原子长度/高度与成员组都按顶层属性复制，避免把数值与其模式、单位拆开。
    const properties = [...getProperties(source, nodeId, sourceBreakpoint), ...getProperties(definition, nodeId, targetBreakpoint)];
    const selected = new Map<string, ResponsiveProperty>();
    for (const property of properties) {
      if (!groups.includes(property.group)) continue;
      // 局部位置跟随各端父区域；跨端复制保持位置，基线恢复可还原原有矩形。
      if (mode === "copy" && property.path.startsWith("placement.")) continue;
      const path = property.path.split(".")[0];
      const key = `${property.slot ? "slot" : "node"}.${path}`;
      if (!selected.has(key)) selected.set(key, { ...property, path });
    }
    for (const property of selected.values()) {
      const slot = Boolean(property.slot);
      const from = mode === "restore" ? localRules(source, nodeId, targetBreakpoint, slot) : effectiveRules(source, nodeId, sourceBreakpoint, slot);
      const before = mode === "restore" ? localRules(definition, nodeId, targetBreakpoint, slot)[property.path] : effectiveRules(definition, nodeId, targetBreakpoint, slot)[property.path];
      const after = from[property.path];
      if (same(before, after)) continue;
      if (property.path === "layoutMode" && (before === "free" || after === "free")) {
        throw new Error(`“${node.name}”涉及局部叠放转换，请先使用布局转换检查对象位置，再复制其他设计组。`);
      }
      if (after === undefined) {
        // 基线恢复保留稀疏继承意图；删除当前组的局部属性，不动其他设备和字段。
        delete localRules(next, nodeId, targetBreakpoint, slot)[property.path];
        if (mode === "copy" && effectiveRules(next, nodeId, targetBreakpoint, slot)[property.path] !== undefined) {
          throw new Error(`“${node.name}”的${property.label}无法通过当前继承关系清空，请先单独调整该属性。`);
        }
      } else if (slot) setTemplateSlotRule(next, node.slotId!, targetBreakpoint, property.path, after);
      else setTemplateNodeRule(next, nodeId, targetBreakpoint, property.path, after);
      plan.changes.push({ nodeId, name: node.name, label: property.label, group: property.group, path: property.path, slot, before, after });
    }
  }
  return plan;
}

export default function TemplateNativeResponsiveControls({ nodeIds, disabled = false, breakpoint: overrideBreakpoint, getProperties }: {
  nodeIds: string[]; disabled?: boolean; breakpoint?: TemplateBreakpoint; getProperties: GetProperties;
}) {
  const draft = useTemplateEditorSession((state) => state.draft);
  const baseline = useTemplateEditorSession((state) => state.baseline);
  const sessionBreakpoint = useTemplateEditorSession((state) => state.breakpoint);
  const targetBreakpoint = overrideBreakpoint ?? sessionBreakpoint;
  const [mode, setMode] = useState<"copy" | "restore">("copy");
  const [preferredSource, setPreferredSource] = useState<TemplateBreakpoint>("desktop");
  const sourceBreakpoint = preferredSource === targetBreakpoint ? (targetBreakpoint === "desktop" ? "tablet" : "desktop") : preferredSource;
  const [groups, setGroups] = useState<{ context: string; values: string[] }>({ context: "", values: [] });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<{ plan: NativeResponsivePlan; original: TemplateDefinitionV2; baseline: TemplateDefinitionV2 | undefined } | null>(null);
  const selectionKey = nodeIds.join(":");
  const contextKey = `${selectionKey}:${targetBreakpoint}:${sourceBreakpoint}:${mode}`;
  const definition = draft?.definition;
  const availableGroups = useMemo(() => {
    if (!definition) return [];
    const source = mode === "restore" ? baseline?.definition : definition;
    const protectedIds = getDynamicTemplateStructureProtectedNodeIds(definition);
    return [...new Set(nodeIds.filter((id) => definition.nodes[id] && !protectedIds.has(id)).flatMap((id) => [
      ...getProperties(definition, id, targetBreakpoint),
      ...(source?.nodes[id] ? getProperties(source, id, mode === "restore" ? targetBreakpoint : sourceBreakpoint) : []),
    ]).map((property) => property.group))];
  }, [definition, baseline?.definition, selectionKey, targetBreakpoint, sourceBreakpoint, mode, getProperties]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setReview(null); setError(null); setNotice(null); }, [contextKey]);
  useEffect(() => {
    if (!review) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault(); event.stopPropagation(); setReview(null); setError(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [review]);
  if (!definition) return null;
  const selectedGroups = (groups.context === contextKey ? groups.values : []).filter((group) => availableGroups.includes(group));
  const unavailable = disabled || !availableGroups.length || definition.schemaVersion < 2 || (mode === "restore" && !baseline);
  const prepare = () => {
    const state = useTemplateEditorSession.getState();
    if (!state.draft || unavailable) return;
    const source = mode === "restore" ? state.baseline?.definition : state.draft.definition;
    if (!source) return;
    try {
      const plan = createNativeResponsivePlan({ definition: state.draft.definition, source, nodeIds, sourceBreakpoint: mode === "restore" ? targetBreakpoint : sourceBreakpoint, targetBreakpoint, groups: selectedGroups, mode, getProperties });
      setReview({ plan, original: state.draft.definition, baseline: state.baseline?.definition }); setError(null); setNotice(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法检查差异，请重试。"); }
  };
  const apply = () => {
    const state = useTemplateEditorSession.getState();
    if (!review || !state.draft || unavailable) return;
    if (state.draft.definition !== review.original || (mode === "restore" && state.baseline?.definition !== review.baseline)) {
      setError("来源或目标已变化，请取消并重新检查差异。"); return;
    }
    const label = mode === "copy" ? `复制${LABELS[sourceBreakpoint]}设计到${LABELS[targetBreakpoint]}` : `恢复${LABELS[targetBreakpoint]}所选组的最近保存设置`;
    const result = state.executeCommand({ type: "update-definition", label, update: (next) => {
      for (const change of review.plan.changes) {
        if (change.after === undefined) delete localRules(next, change.nodeId, targetBreakpoint, change.slot)[change.path];
        else if (change.slot) setTemplateSlotRule(next, next.nodes[change.nodeId].slotId!, targetBreakpoint, change.path, change.after);
        else setTemplateNodeRule(next, change.nodeId, targetBreakpoint, change.path, change.after);
      }
    } });
    if (!result.ok) { setError(result.message); return; }
    setReview(null); setError(null); setNotice(`${label}，${review.plan.changes.length} 项变化。可撤销。`);
  };
  return <details className="template-native-responsive">
    <summary>复制与恢复设计组</summary>
    <div role="group" aria-label="设计组操作" className="template-native-responsive__actions">
      <button type="button" aria-pressed={mode === "copy"} onClick={() => setMode("copy")}>复制其他设备</button>
      <button type="button" aria-pressed={mode === "restore"} onClick={() => setMode("restore")}>恢复最近保存</button>
    </div>
    {mode === "copy" ? <label className="template-editor__simple-select">复制来源<select aria-label="复制设计的来源设备" value={sourceBreakpoint} onChange={(event) => setPreferredSource(event.target.value as TemplateBreakpoint)}>
      {BREAKPOINTS.filter((bp) => bp !== targetBreakpoint).map((bp) => <option key={bp} value={bp}>{LABELS[bp]}</option>)}
    </select></label> : !baseline ? <p>模板尚未保存，没有可恢复的保存基线。</p> : <p>恢复所选组在最近保存时的设置，保留其他组及其他设备的独立设置。</p>}
    <p>目标：{LABELS[targetBreakpoint]}{targetBreakpoint === "desktop" ? "基础；无独立覆盖的设备会跟随" : targetBreakpoint === "tablet" ? "覆盖；无手机独立覆盖的字段会跟随" : "覆盖"}。局部叠放位置不参与复制。</p>
    <fieldset disabled={unavailable}>
      <legend>选择设计组</legend>
      {availableGroups.map((group) => <label key={group}><input type="checkbox" checked={selectedGroups.includes(group)} onChange={(event) => setGroups({ context: contextKey, values: event.target.checked ? [...selectedGroups, group] : selectedGroups.filter((value) => value !== group) })} />{group}</label>)}
    </fieldset>
    {!availableGroups.length ? <p>当前对象已锁定或没有可操作的设计组。</p> : null}
    <button type="button" disabled={unavailable || !selectedGroups.length} onClick={prepare}>检查所选组差异</button>
    {error && !review ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    <Modal title={mode === "copy" ? "确认复制设计组" : "确认恢复最近保存的设计组"} open={Boolean(review)} onCancel={() => { setReview(null); setError(null); }} onOk={apply} okText="确认应用" cancelText="取消" cancelButtonProps={{ "aria-label": "取消" }} okButtonProps={{ disabled: unavailable || !review?.plan.changes.length }} width={600}>
      <div className="template-native-responsive__review">
        <p>{selectedGroups.join("、")} · {review?.plan.changes.length ?? 0} 项变化。只调整所选对象的这些设计属性。</p>
        <p>目标：{LABELS[targetBreakpoint]}{targetBreakpoint !== "mobile" ? "；下级设备未独立设置的属性会随之变化" : ""}。内容、字段身份与页面开放范围保持原值。</p>
        {mode === "restore" ? <p>恢复时保留保存基线中的继承状态；“未单独设置”表示移除该属性的局部设置。</p> : null}
        {review?.plan.excludedIds.length ? <p>{review.plan.excludedIds.length} 个锁定对象或在来源中不存在的对象不参与修改。</p> : null}
        {!review?.plan.changes.length ? <p>所选范围没有差异。</p> : <ul>{review.plan.changes.map((change) => <li key={`${change.nodeId}:${change.slot}:${change.path}`}>
          <strong>{change.name} · {change.label}</strong><span>当前：{formatValue(change.before)}</span><span>应用后：{formatValue(change.after)}</span>
        </li>)}</ul>}
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </Modal>
  </details>;
}
