import { useEffect, useRef, useState } from "react";
import "./templateNativeDesignControls.css";
import { resolveTemplateNodeRules, setTemplateNodeRule } from "../template-definition/responsive";
import { type DynamicTemplateResponsiveRules, type TemplateDefinitionV2, type TemplateBreakpoint } from "../template-definition";
import NumberField from "../inspector/controls/NumberField";
import { useTemplateEditorSession } from "./templateEditorSession";

type Anchor = NonNullable<DynamicTemplateResponsiveRules["anchor"]>;
function measureLocalBox(nodeId: string, parentId: string, breakpoint: TemplateBreakpoint) {
  const documents = [document, ...Array.from(document.querySelectorAll("iframe")).flatMap((frame) => {
    try { return frame.contentDocument ? [frame.contentDocument] : []; } catch { return []; }
  })];
  for (const surface of documents) {
    const focus = surface.querySelector<HTMLElement>(`[data-canvas-focus-breakpoint="${breakpoint}"]`);
    if (!focus) continue;
    const node = focus.querySelector<HTMLElement>(`[data-template-node-id="${CSS.escape(nodeId)}"]`);
    const parent = focus.querySelector<HTMLElement>(`[data-template-node-id="${CSS.escape(parentId)}"]`);
    if (!node || !parent || !node.getClientRects().length || !parent.getClientRects().length) continue;
    const rect = node.getBoundingClientRect();
    const bounds = parent.getBoundingClientRect();
    if (!parent.offsetWidth || !parent.offsetHeight) continue;
    const scaleX = bounds.width / parent.offsetWidth;
    const scaleY = bounds.height / parent.offsetHeight;
    const computed = surface.defaultView!.getComputedStyle(parent);
    const padding = { left: parseFloat(computed.paddingLeft) || 0, right: parseFloat(computed.paddingRight) || 0, top: parseFloat(computed.paddingTop) || 0, bottom: parseFloat(computed.paddingBottom) || 0 };
    return {
      x: (rect.left - bounds.left) / scaleX - parent.clientLeft - padding.left,
      y: (rect.top - bounds.top) / scaleY - parent.clientTop - padding.top,
      width: rect.width / scaleX, height: rect.height / scaleY,
      parentWidth: parent.clientWidth - padding.left - padding.right,
      parentHeight: parent.clientHeight - padding.top - padding.bottom,
    };
  }
  return null;
}

/** 布局模式变化必须显式预览；绝不通过拖出容器猜测“脱离排列”。 */
export default function TemplateAnchorControls({ nodeId, disabled }: { nodeId: string; disabled: boolean }) {
  const draft = useTemplateEditorSession((state) => state.draft);
  const preview = useTemplateEditorSession((state) => state.previewDocument);
  const breakpoint = useTemplateEditorSession((state) => state.breakpoint);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const token = useRef<string | null>(null);
  const cancel = () => { if (token.current) useTemplateEditorSession.getState().cancelInteraction(token.current); token.current = null; setPending(false); };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.isComposing && token.current) { event.preventDefault(); event.stopPropagation(); cancel(); } };
    window.addEventListener("keydown", escape, true);
    return () => { window.removeEventListener("keydown", escape, true); if (token.current) useTemplateEditorSession.getState().cancelInteraction(token.current); token.current = null; };
  }, [nodeId, breakpoint]);
  if (!draft || nodeId === draft.definition.rootNodeId) return null;
  const definition = preview ?? draft.definition;
  const parent = Object.values(definition.nodes).find((node) => node.childIds.includes(nodeId));
  if (!parent) return null;
  const rules = resolveTemplateNodeRules(definition, nodeId, breakpoint);
  const parentRules = resolveTemplateNodeRules(definition, parent.nodeId, breakpoint);
  const parentHasHeight = ["fixed", "min-height", "aspect-ratio", "viewport"].includes(parentRules.height.mode) || Boolean(parentRules.minHeight?.value);
  const start = (label: string, update: (next: TemplateDefinitionV2) => void) => {
    cancel();
    const state = useTemplateEditorSession.getState();
    token.current = state.beginInteraction(label);
    if (!token.current) return;
    const result = state.previewInteraction(token.current, { type: "update-definition", label, update });
    if (!result.ok) { token.current = null; setNotice(result.message); return; }
    setNotice("画布正在预览定位变化，确认后写入当前断点；取消不会修改模板。");
    setPending(true);
  };
  const chooseAnchor = (horizontal: Anchor["horizontal"], vertical: Anchor["vertical"]) => {
    const box = measureLocalBox(nodeId, parent.nodeId, breakpoint);
    if (!box) { setNotice("当前画布中无法测量此对象，请先聚焦其所在断点并显示对象。"); return; }
    const x = horizontal === "left" ? 0 : horizontal === "center" ? 0.5 : 1;
    const y = vertical === "top" ? 0 : vertical === "center" ? 0.5 : 1;
    const anchor: Anchor = { horizontal, vertical, offsetX: { value: box.x + box.width * x - box.parentWidth * x, unit: "px" }, offsetY: { value: box.y + box.height * y - box.parentHeight * y, unit: "px" } };
    start("设置相对父级锚点", (next) => {
      setTemplateNodeRule(next, nodeId, breakpoint, "anchor", anchor);
      // 从流式转换时冻结当前测量尺寸；用户看到转换预览后才确认。
      if (!rules.anchor && !rules.placement) {
        setTemplateNodeRule(next, nodeId, breakpoint, "width", { value: box.width, unit: "px" });
        setTemplateNodeRule(next, nodeId, breakpoint, "height", { mode: "fixed", value: { value: box.height, unit: "px" } });
      }
    });
  };
  return <details key={`${nodeId}:${Boolean(rules.anchor)}`} open={Boolean(rules.anchor) || pending} className="template-editor__settings-section template-native__anchor" aria-label="局部叠放与锚点"><summary>{rules.anchor ? "局部叠放 · 锚点与偏移" : "高级定位 · 改为局部叠放"}</summary>
    <p>{rules.anchor ? "相对父容器锚定；移动父级时保持关系。" : "当前对象参与排列；可明确改为局部叠放。"}</p>
    {disabled ? <p>定位需在当前断点的实际画布中测量；请选择当前断点作用域并解锁对象。</p> : null}
    {!parentHasHeight ? <p>请先设置父容器的高度、最小高度或比例，再使用局部叠放。</p> : null}
    <div className="template-editor__focus-grid" role="group" aria-label="父容器锚点九宫格">
      {(["top", "center", "bottom"] as const).flatMap((vertical) => (["left", "center", "right"] as const).map((horizontal) => <button key={`${horizontal}-${vertical}`} type="button" disabled={disabled || !parentHasHeight || pending}
        aria-label={`锚点 ${horizontal} ${vertical}`} aria-pressed={rules.anchor?.horizontal === horizontal && rules.anchor?.vertical === vertical} onClick={() => chooseAnchor(horizontal, vertical)}>
        {{ top: "上", center: "中", bottom: "下" }[vertical]}{{ left: "左", center: "中", right: "右" }[horizontal]}
      </button>))}
    </div>
    {rules.anchor ? <>{(["offsetX", "offsetY"] as const).map((axis) => <NumberField key={axis} label={axis === "offsetX" ? "锚点水平偏移" : "锚点垂直偏移"} value={rules.anchor![axis].value} unit={rules.anchor![axis].unit} min={-10000} max={10000} disabled={disabled || pending} onChange={(value) => useTemplateEditorSession.getState().executeCommand({ type: "update-definition", label: "调整锚点偏移", update: (next) => setTemplateNodeRule(next, nodeId, breakpoint, "anchor", { ...rules.anchor!, [axis]: { ...rules.anchor![axis], value } }) })} />)}
      <button type="button" disabled={disabled || pending || parentRules.layoutMode === "free"} onClick={() => start("移回父容器排列", (next) => {
        if (breakpoint === "desktop") { delete next.nodes[nodeId].responsive.desktop.anchor; delete next.nodes[nodeId].responsive.desktop.placement; }
        else { setTemplateNodeRule(next, nodeId, breakpoint, "anchor", null); setTemplateNodeRule(next, nodeId, breakpoint, "placement", null); }
      })}>移回排列</button>
    </> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {pending ? <div><button type="button" onClick={() => { const current = token.current; token.current = null; if (current) { const result = useTemplateEditorSession.getState().commitInteraction(current); setNotice(result.ok ? "定位规则已更新，可撤销。" : result.message); } setPending(false); }}>确认定位</button><button type="button" onClick={() => { cancel(); setNotice("已取消，定位规则未改变。"); }}>取消定位</button></div> : null}
  </details>;
}
