import { useEffect, useRef } from "react";
import { resolveTemplateNodeRules } from "../template-definition/responsive";
import { useTemplateEditorSession } from "./templateEditorSession";
import { createTemplateColumnResizeCommand } from "./templateLayoutIntent";
import { crossesCanvasDragThreshold } from "./templateCanvasInteraction";

export default function CanvasGridDividers({ nodeId, sourceElement, scale }: { nodeId: string; sourceElement: HTMLElement; scale: number }) {
  const definition = useTemplateEditorSession((state) => state.previewDocument ?? state.draft?.definition);
  const breakpoint = useTemplateEditorSession((state) => state.breakpoint);
  const gesture = useRef<{ x: number; index: number; pointerId: number; element: HTMLElement; token: string | null; width: number; definition: NonNullable<typeof definition> } | null>(null);
  const finish = (commit: boolean) => {
    const current = gesture.current; gesture.current = null;
    if (!current) return;
    if (current.element.hasPointerCapture(current.pointerId)) current.element.releasePointerCapture(current.pointerId);
    if (current.token) { const session = useTemplateEditorSession.getState(); if (commit) session.commitInteraction(current.token); else session.cancelInteraction(current.token); }
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && gesture.current) { event.preventDefault(); event.stopImmediatePropagation(); finish(false); } };
    const blur = () => finish(false);
    window.addEventListener("keydown", escape, true); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", escape, true); window.removeEventListener("blur", blur); finish(false); };
  }, [nodeId, breakpoint]);
  if (!definition || Number(definition.schemaVersion) < 2) return null;
  const rules = resolveTemplateNodeRules(definition, nodeId, breakpoint);
  if (rules.display !== "grid" || !rules.columns || rules.columns.length < 2) return null;
  const style = sourceElement.ownerDocument.defaultView!.getComputedStyle(sourceElement);
  const left = parseFloat(style.paddingLeft) || 0, right = parseFloat(style.paddingRight) || 0, gap = parseFloat(style.columnGap) || 0;
  const available = sourceElement.clientWidth - left - right - gap * (rules.columns.length - 1);
  if (available <= 0) return null;
  const sum = rules.columns.reduce((total, value) => total + value, 0);
  let used = 0;
  return <>{rules.columns.slice(0, -1).map((column, index) => {
    used += column;
    const ratio = `${Math.round(column / sum * 100)}% / ${Math.round(rules.columns![index + 1] / sum * 100)}%`;
    return <button key={index} type="button" className="template-editor__grid-divider" aria-label={`拖动调整第${index + 1}与${index + 2}列比例`} title={`第 ${index + 1} / ${index + 2} 列：${ratio}；左右拖动调整列宽，父组宽度和间距不变；方向键微调，Esc 取消`}
      data-active={gesture.current?.index === index && Boolean(gesture.current.token)}
      style={{ left: (left + used / sum * available + gap * (index + .5)) * scale - 14 }}
      onPointerDown={(event) => {
        if (event.button !== 0) return; event.preventDefault(); event.stopPropagation();
        event.currentTarget.focus();
        const committed = useTemplateEditorSession.getState().draft?.definition; if (!committed) return;
        gesture.current = { x: event.clientX, index, pointerId: event.pointerId, element: event.currentTarget, token: null, width: available, definition: committed };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = gesture.current; if (!current || current.pointerId !== event.pointerId) return;
        const delta = event.clientX - current.x;
        if (!current.token) { if (!crossesCanvasDragThreshold(delta, 0)) return; current.token = useTemplateEditorSession.getState().beginInteraction("调整网格列比例"); }
        if (current.token) useTemplateEditorSession.getState().previewInteraction(current.token, createTemplateColumnResizeCommand(current.definition, nodeId, breakpoint, current.index, delta / scale, current.width));
      }}
      onPointerUp={() => finish(true)} onPointerCancel={() => finish(false)} onLostPointerCapture={() => finish(false)}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault(); event.stopPropagation();
        useTemplateEditorSession.getState().executeCommand(createTemplateColumnResizeCommand(definition, nodeId, breakpoint, index, (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 10 : 1), available));
      }} ><span className="template-editor__grid-divider-value">{ratio}</span><span className="template-editor__grid-divider-grip" aria-hidden="true">↔</span></button>;
  })}</>;
}
