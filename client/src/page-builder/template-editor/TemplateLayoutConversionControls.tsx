import { useEffect, useRef, useState } from "react";
import "./templateNativeDesignControls.css";
import NumberField from "../inspector/controls/NumberField";
import { getDynamicTemplateNodeRegistryEntry, type TemplateBreakpoint } from "../template-definition";
import { getTemplateNodeRuleSource, resolveTemplateNodeRules, setTemplateNodeRule } from "../template-definition/responsive";
import type { DynamicTemplateDefinitionCommand } from "../template-definition/operations";
import { useTemplateEditorSession } from "./templateEditorSession";
import { measureTemplateContainerLayout, measureTemplateLayoutChildren, type TemplateLayoutChildRect } from "./templateLayoutIntent";
import { getTemplateLayoutPresentation } from "./templateLayoutPresentation";
import { getTemplateVisibleLayoutChildIds, isFixedFourWorkGrid } from "../template-definition/layoutAuthoring";
import { focusFirstInvalidNumberField } from "../inspector/controls/NumberField";

type Layout = Extract<DynamicTemplateDefinitionCommand, { type: "convert-layout" }>["layout"];
const names: Record<Layout, string> = { vertical: "上下排列", horizontal: "左右排列", wrap: "自动换行", grid: "网格排列", free: "自由排列" };
const breakpoints: TemplateBreakpoint[] = ["desktop", "mobile"];
function label(rules: ReturnType<typeof resolveTemplateNodeRules>) {
  return getTemplateLayoutPresentation(rules).label;
}

function LayoutDiagram({ layout, columns }: { layout: Layout; columns: number[] }) {
  const cells = layout === "grid" ? columns.length : layout === "wrap" ? 4 : 3;
  const weights = layout === "grid" ? columns : Array.from({ length: cells }, () => 1);
  const total = weights.reduce((sum, value) => sum + value, 0);
  return <svg className="template-native__layout-diagram" viewBox="0 0 80 48" aria-hidden="true" focusable="false">
    {weights.map((weight, index) => {
      if (layout === "vertical") return <rect key={index} x="6" y={4 + index * 14} width="68" height="11" />;
      if (layout === "wrap") return <rect key={index} x={6 + index % 2 * 35} y={4 + Math.floor(index / 2) * 22} width="32" height="19" />;
      if (layout === "free") return <rect key={index} x={8 + index * 18} y={4 + index * 8} width="32" height="24" />;
      const preceding = weights.slice(0, index).reduce((sum, value) => sum + value, 0);
      const available = 68 - (cells - 1) * 3;
      return <rect key={index} x={6 + preceding / total * available + index * 3} y="4" width={weight / total * available} height="40" />;
    })}
  </svg>;
}

export default function TemplateLayoutConversionControls({ nodeId, disabled = false }: { nodeId: string; disabled?: boolean }) {
  const draft = useTemplateEditorSession((state) => state.draft);
  const preview = useTemplateEditorSession((state) => state.previewDocument);
  const breakpoint = useTemplateEditorSession((state) => state.breakpoint);
  const active = useTemplateEditorSession((state) => state.activeInteraction);
  const token = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [visualChange, setVisualChange] = useState<{ measured: number; changed: number } | null>(null);
  const beforeRects = useRef<Record<string, TemplateLayoutChildRect>>({});
  const blockedByOtherInteraction = Boolean(active && active.token !== token.current);
  const cancel = () => { if (token.current) useTemplateEditorSession.getState().cancelInteraction(token.current); token.current = null; setPending(false); };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.isComposing && token.current) { event.preventDefault(); event.stopPropagation(); cancel(); setNotice("已取消，排列规则未改变。"); } };
    window.addEventListener("keydown", escape, true);
    return () => { window.removeEventListener("keydown", escape, true); if (token.current) useTemplateEditorSession.getState().cancelInteraction(token.current); token.current = null; };
  }, [nodeId, breakpoint]);
  useEffect(() => { if (!active || (token.current && active.token !== token.current)) { token.current = null; setPending(false); } }, [active]);
  useEffect(() => { if (disabled && token.current) { cancel(); setNotice("修改作用域或对象状态已改变，本次排列预览已取消。"); } }, [disabled]);
  useEffect(() => {
    if (!pending || !preview) { setVisualChange(null); return; }
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
      const current = measureTemplateLayoutChildren(nodeId, breakpoint, Object.keys(beforeRects.current));
      const measured = Object.keys(beforeRects.current).filter((id) => current[id]);
      const changed = measured.filter((id) => (["x", "y", "width", "height"] as const).some((axis) => Math.abs(current[id][axis] - beforeRects.current[id][axis]) > 1)).length;
      setVisualChange({ measured: measured.length, changed });
    }); });
    return () => cancelAnimationFrame(frame);
  }, [pending, preview, nodeId, breakpoint]);
  if (!draft || draft.definition.schemaVersion < 2 || !draft.definition.nodes[nodeId] || !getDynamicTemplateNodeRegistryEntry(draft.definition.nodes[nodeId].type).canHaveChildren) return null;
  const definition = preview ?? draft.definition;
  const node = definition.nodes[nodeId];
  const rules = resolveTemplateNodeRules(definition, nodeId, breakpoint);
  const currentLayout = getTemplateLayoutPresentation(rules).layout;
  const layoutModeName = rules.layoutMode === "free" ? "自由叠放" : "顺序布局";
  const sourceProperties = rules.layoutMode === "free" ? ["layoutMode"]
    : rules.display === "grid" ? ["layoutMode", "display", "columns"] : ["layoutMode", "display", "direction", "wrap"];
  const layoutSources = sourceProperties.map((path) => getTemplateNodeRuleSource(definition, nodeId, breakpoint, path));
  const storedSource = layoutSources.includes("mobile") ? "mobile" : layoutSources.includes("desktop") ? "desktop" : "system";
  const inheritance = storedSource === "mobile" ? "override" : storedSource === "desktop" ? "inherited" : "system";
  const sourceName = breakpoint !== "mobile"
    ? "桌面基础"
    : inheritance === "override" ? "手机覆盖" : inheritance === "inherited" ? "继承桌面" : "系统默认";
  const visibleChildren = (id: string) => getTemplateVisibleLayoutChildIds(definition, id, breakpoint);
  const childIds = visibleChildren(nodeId);
  const fixedFour = isFixedFourWorkGrid(draft.definition, nodeId);
  let innerLayoutId: string | null = null;
  if (childIds.length === 1) {
    let candidate = childIds[0];
    const visited = new Set<string>();
    while (!visited.has(candidate) && getDynamicTemplateNodeRegistryEntry(definition.nodes[candidate].type).canHaveChildren) {
      visited.add(candidate);
      innerLayoutId = candidate;
      const inner = visibleChildren(candidate);
      if (inner.length !== 1) break;
      candidate = inner[0];
    }
  }
  const hasLayoutPeers = childIds.length >= 2;
  const start = (layout: Layout) => {
    if (focusFirstInvalidNumberField()) return;
    if (fixedFour || !hasLayoutPeers) return;
    if (blockedByOtherInteraction) { setNotice("请先完成或取消当前画布操作，再转换排列。"); return; }
    cancel(); setNotice("");
    try {
      const state = useTemplateEditorSession.getState();
      const source = state.draft!.definition;
      beforeRects.current = measureTemplateLayoutChildren(nodeId, breakpoint, childIds);
      const geometry = layout === "free" ? measureTemplateContainerLayout(source, nodeId, breakpoint) : {};
      const command: DynamicTemplateDefinitionCommand = { type: "convert-layout", label: `改为${names[layout]}`, nodeId, breakpoint, layout, ...(layout === "grid" ? { columns: resolveTemplateNodeRules(source, nodeId, breakpoint).columns ?? [1, 1, 1] } : {}), ...geometry };
      token.current = state.beginInteraction(command.label);
      if (!token.current) { setNotice("请先完成当前输入或操作，再转换排列。"); return; }
      const result = state.previewInteraction(token.current, command);
      if (!result.ok) { cancel(); setNotice(result.message); return; }
      setPending(true);
      setNotice("画布正在预览。子对象 ID、父子关系和阅读顺序不变；确认后一次撤销可恢复。");
    } catch (error) { cancel(); setNotice(error instanceof Error ? error.message : "无法转换排列，请检查容器状态。"); }
  };
  return <section className="template-editor__settings-section template-native__layout" aria-label="排列与分栏设置" data-template-layout-mode={rules.layoutMode === "free" ? "free" : "flow"} data-template-layout-inheritance={breakpoint === "mobile" ? inheritance : undefined}>
    <div className="template-native__layout-heading">
      <h3>排列与分栏</h3>
      <p>当前：{label(rules)} · {layoutModeName} · {sourceName}</p>
    </div>
    <p className="template-native__layout-help">{fixedFour ? "首发作品卡组固定四格：桌面四列，手机两列两行。可调整图片、间距和留白。" : !hasLayoutPeers ? childIds.length === 1 ? "当前对象只有一个可见的直接子项，切换排列不会重新排列内部内容。" : "当前对象没有可见的并列子项；添加内容后再调整排列。" : `${node.name} · ${childIds.length} 个子项，点选预览、确认应用。`}</p>
    {!hasLayoutPeers && innerLayoutId ? <button type="button" disabled={disabled || pending || blockedByOtherInteraction} onClick={() => { if (!focusFirstInvalidNumberField()) useTemplateEditorSession.getState().selectObject(innerLayoutId!); }}>调整{definition.nodes[innerLayoutId].name}排列</button> : null}
    <div className="template-native__layout-choices" role="group" aria-label="选择容器排列方式">{(Object.keys(names) as Layout[]).filter((layout) => layout !== "free" || node.type === "Stack").map((layout) => <button type="button" key={layout} aria-label={`预览${names[layout]}`} aria-pressed={currentLayout === layout} title={`预览${names[layout]}，确认后应用`} disabled={disabled || pending || blockedByOtherInteraction || fixedFour || !hasLayoutPeers} onClick={() => start(layout)}><LayoutDiagram layout={layout} columns={rules.columns ?? [1, 1, 1]} /><span>{names[layout]}</span></button>)}</div>
    {pending && visualChange ? <p className="template-native__layout-feedback" role="status" data-template-layout-visual-changes={visualChange.changed}>{visualChange.measured === 0 ? "当前画布尚未呈现可测量的子项，请先核对画布。" : visualChange.changed > 0 ? `画布中 ${visualChange.changed} 个子项的位置或尺寸已变化；尚未确认。` : "当前宽度下，子项位置和尺寸没有变化。请检查是否已是该排列，或子项尺寸限制了布局。"}</p> : null}
    {pending && preview ? <><table aria-label="布局转换断点影响"><thead><tr><th>断点</th><th>原排列</th><th>预览排列与子项变化</th></tr></thead><tbody>{breakpoints.map((bp) => {
      const changedChildren = node.childIds.filter((id) => JSON.stringify(resolveTemplateNodeRules(draft.definition, id, bp)) !== JSON.stringify(resolveTemplateNodeRules(preview, id, bp)));
      const changed = changedChildren.length > 0 || JSON.stringify(resolveTemplateNodeRules(draft.definition, nodeId, bp)) !== JSON.stringify(resolveTemplateNodeRules(preview, nodeId, bp));
      return <tr key={bp}><th>{bp}</th><td>{label(resolveTemplateNodeRules(draft.definition, nodeId, bp))}</td><td>{label(resolveTemplateNodeRules(preview, nodeId, bp))}{changed ? "（有变化）" : "（不变）"}{changedChildren.length ? <span> · {changedChildren.length} 个对象定位/尺寸变化：{changedChildren.map((id) => preview.nodes[id].name).join("、")}</span> : null}</td></tr>;
    })}</tbody></table><p>仅写入当前断点规则；下级继承会随之变化，已有覆盖保留。对象定位和尺寸也可能变化，请核对各断点画布。</p>
      <button type="button" onClick={() => { const current = token.current; token.current = null; const result = current ? useTemplateEditorSession.getState().commitInteraction(current) : null; setPending(false); setNotice(result?.ok ? "排列已更新，可撤销。" : result?.message ?? "操作已取消，请重新预览。"); }}>确认排列转换</button><button type="button" onClick={() => { cancel(); setNotice("已取消，排列规则未改变。"); }}>取消排列转换</button></> : null}
    {!fixedFour && hasLayoutPeers && rules.display === "grid" && rules.layoutMode !== "free" ? <fieldset disabled={disabled || pending || blockedByOtherInteraction}><legend>网格列比例</legend><div className="template-native__column-preview" role="img" aria-label={`列宽比例 ${(rules.columns ?? [1]).join(" 比 ")}`}>{(rules.columns ?? [1]).map((value, index) => <span key={index} style={{ flexGrow: value }}>{value}</span>)}</div><p>比例分配扣除间距后的可用宽度，不改变列数。</p>{(rules.columns ?? [1]).map((value, index) => <NumberField key={index} label={`第 ${index + 1} 列比例`} value={value} min={0.01} max={1000} step={0.1} onPreview={(value) => {
      const state = useTemplateEditorSession.getState();
      if (!token.current) token.current = state.beginInteraction("调整网格列比例", { source: "field" });
      if (!token.current) return;
      const columns = [...(resolveTemplateNodeRules(state.draft!.definition, nodeId, breakpoint).columns ?? [1])]; columns[index] = value;
      const result = state.previewInteraction(token.current, { type: "update-definition", label: "调整网格列比例", update: (next) => setTemplateNodeRule(next, nodeId, breakpoint, "columns", columns) });
      if (!result.ok) { cancel(); setNotice(result.message); }
    }} onChange={() => { const current = token.current; token.current = null; return current ? useTemplateEditorSession.getState().commitInteraction(current) : false; }} onCancel={cancel} />)}</fieldset> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </section>;
}
