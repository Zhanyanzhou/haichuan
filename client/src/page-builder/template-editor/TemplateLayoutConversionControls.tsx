import { useEffect, useRef, useState } from "react";
import "./templateNativeDesignControls.css";
import NumberField from "../inspector/controls/NumberField";
import { getDynamicTemplateNodeRegistryEntry, type TemplateBreakpoint } from "../template-definition";
import { resolveTemplateNodeRules, setTemplateNodeRule } from "../template-definition/responsive";
import type { DynamicTemplateDefinitionCommand } from "../template-definition/operations";
import { useTemplateEditorSession } from "./templateEditorSession";
import { measureTemplateContainerLayout } from "./templateLayoutIntent";
import { getTemplateLayoutPresentation } from "./templateLayoutPresentation";

type Layout = Extract<DynamicTemplateDefinitionCommand, { type: "convert-layout" }>["layout"];
const names: Record<Layout, string> = { vertical: "上下排列", horizontal: "左右排列", wrap: "自动换行", grid: "网格排列", free: "自由排列" };
const breakpoints: TemplateBreakpoint[] = ["desktop", "tablet", "mobile"];
function label(rules: ReturnType<typeof resolveTemplateNodeRules>) {
  return getTemplateLayoutPresentation(rules).label;
}

export default function TemplateLayoutConversionControls({ nodeId, disabled = false }: { nodeId: string; disabled?: boolean }) {
  const draft = useTemplateEditorSession((state) => state.draft);
  const preview = useTemplateEditorSession((state) => state.previewDocument);
  const breakpoint = useTemplateEditorSession((state) => state.breakpoint);
  const active = useTemplateEditorSession((state) => state.activeInteraction);
  const token = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const blockedByOtherInteraction = Boolean(active && active.token !== token.current);
  const cancel = () => { if (token.current) useTemplateEditorSession.getState().cancelInteraction(token.current); token.current = null; setPending(false); };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.isComposing && token.current) { event.preventDefault(); event.stopPropagation(); cancel(); setNotice("已取消，排列规则未改变。"); } };
    window.addEventListener("keydown", escape, true);
    return () => { window.removeEventListener("keydown", escape, true); if (token.current) useTemplateEditorSession.getState().cancelInteraction(token.current); token.current = null; };
  }, [nodeId, breakpoint]);
  useEffect(() => { if (!active || (token.current && active.token !== token.current)) { token.current = null; setPending(false); } }, [active]);
  useEffect(() => { if (disabled && token.current) { cancel(); setNotice("修改作用域或对象状态已改变，本次排列预览已取消。"); } }, [disabled]);
  if (!draft || draft.definition.schemaVersion < 2 || !draft.definition.nodes[nodeId] || !getDynamicTemplateNodeRegistryEntry(draft.definition.nodes[nodeId].type).canHaveChildren) return null;
  const definition = preview ?? draft.definition;
  const node = definition.nodes[nodeId];
  const rules = resolveTemplateNodeRules(definition, nodeId, breakpoint);
  const currentLayout = getTemplateLayoutPresentation(rules).layout;
  const start = (layout: Layout) => {
    if (blockedByOtherInteraction) { setNotice("请先完成或取消当前画布操作，再转换排列。"); return; }
    cancel(); setNotice("");
    try {
      const state = useTemplateEditorSession.getState();
      const source = state.draft!.definition;
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
  return <section className="template-editor__settings-section template-native__layout" aria-label="容器排列转换"><h3>容器排列</h3>
    <div className="template-native__layout-choices" role="group" aria-label="选择容器排列方式">{(Object.keys(names) as Layout[]).filter((layout) => layout !== "free" || node.type === "Stack").map((layout) => <button type="button" key={layout} aria-label={`预览${names[layout]}`} aria-pressed={currentLayout === layout} title={`预览${names[layout]}，确认后应用`} disabled={disabled || pending || blockedByOtherInteraction} onClick={() => start(layout)}><span aria-hidden="true">{{ vertical: "↕", horizontal: "↔", wrap: "↵", grid: "▦", free: "⤢" }[layout]}</span>{names[layout]}</button>)}</div>
    {pending && preview ? <><table aria-label="布局转换断点影响"><thead><tr><th>断点</th><th>原排列</th><th>预览排列与子项变化</th></tr></thead><tbody>{breakpoints.map((bp) => {
      const changedChildren = node.childIds.filter((id) => JSON.stringify(resolveTemplateNodeRules(draft.definition, id, bp)) !== JSON.stringify(resolveTemplateNodeRules(preview, id, bp)));
      const changed = changedChildren.length > 0 || JSON.stringify(resolveTemplateNodeRules(draft.definition, nodeId, bp)) !== JSON.stringify(resolveTemplateNodeRules(preview, nodeId, bp));
      return <tr key={bp}><th>{bp}</th><td>{label(resolveTemplateNodeRules(draft.definition, nodeId, bp))}</td><td>{label(resolveTemplateNodeRules(preview, nodeId, bp))}{changed ? "（有变化）" : "（不变）"}{changedChildren.length ? <span> · {changedChildren.length} 个对象定位/尺寸变化：{changedChildren.map((id) => preview.nodes[id].name).join("、")}</span> : null}</td></tr>;
    })}</tbody></table><p>仅写入当前断点规则；下级继承会随之变化，已有覆盖保留。对象定位和尺寸也可能变化，请核对各断点画布。</p>
      <button type="button" onClick={() => { const current = token.current; token.current = null; const result = current ? useTemplateEditorSession.getState().commitInteraction(current) : null; setPending(false); setNotice(result?.ok ? "排列已更新，可撤销。" : result?.message ?? "操作已取消，请重新预览。"); }}>确认排列转换</button><button type="button" onClick={() => { cancel(); setNotice("已取消，排列规则未改变。"); }}>取消排列转换</button></> : null}
    {rules.display === "grid" && rules.layoutMode !== "free" ? <fieldset disabled={disabled || pending || blockedByOtherInteraction}><legend>网格列比例</legend><p>比例分配扣除间距后的可用宽度，不改变列数。</p>{(rules.columns ?? [1]).map((value, index) => <NumberField key={index} label={`第 ${index + 1} 列比例`} value={value} min={0.01} max={1000} step={0.1} onPreview={(value) => {
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
