import { useCallback, useEffect, useRef, useState } from "react";
import { resolveTemplateSlotRules, setTemplateSlotRule } from "../template-definition/responsive";
import { objectPositionToPercent, percentToExactObjectPosition } from "../template-definition/imagePosition";
import { useTemplateEditorSession } from "./templateEditorSession";
import { crossesCanvasDragThreshold } from "./templateCanvasInteraction";

/** 取景只是样式事务；不复制图片、不改外框比例、不写入试排素材。 */
export default function CanvasImageFocusEditor({ nodeId, sourceElement, editing, onEditingChange }: {
  nodeId: string; sourceElement: HTMLElement; editing: boolean; onEditingChange: (editing: boolean) => void;
}) {
  const document = useTemplateEditorSession((state) => state.previewDocument ?? state.draft?.definition);
  const breakpoint = useTemplateEditorSession((state) => state.breakpoint);
  const active = useTemplateEditorSession((state) => state.activeInteraction);
  const token = useRef<string | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; focus: { x: number; y: number }; dx: number; dy: number; active: boolean; element: HTMLElement } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const slotId = document?.nodes[nodeId]?.slotId;
  const rules = document && slotId ? resolveTemplateSlotRules(document, slotId, breakpoint) : null;
  const focus = objectPositionToPercent(rules?.objectPosition);
  const close = useCallback((commit: boolean) => {
    const current = token.current; token.current = null; drag.current = null;
    if (current) {
      const session = useTemplateEditorSession.getState();
      if (commit) session.commitInteraction(current); else session.cancelInteraction(current);
    }
    onEditingChange(false);
  }, [onEditingChange]);
  useEffect(() => {
    if (!editing) return;
    token.current = useTemplateEditorSession.getState().beginInteraction("调整图片取景");
    if (!token.current) onEditingChange(false);
    return () => { if (token.current) useTemplateEditorSession.getState().cancelInteraction(token.current); token.current = null; };
  }, [editing, nodeId, breakpoint, onEditingChange]);
  useEffect(() => { if (editing && token.current && useTemplateEditorSession.getState().activeInteraction?.token !== token.current) { token.current = null; onEditingChange(false); } }, [active, editing, onEditingChange]);
  useEffect(() => {
    if (!editing) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault(); event.stopImmediatePropagation(); close(false);
    };
    const blur = () => close(false);
    window.addEventListener("keydown", escape, true); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", escape, true); window.removeEventListener("blur", blur); };
  }, [close, editing]);
  if (!rules || !slotId) return null;
  const preview = (position: typeof focus, fit = rules.objectFit ?? "cover") => {
    if (!token.current) return;
    const result = useTemplateEditorSession.getState().previewInteraction(token.current, { type: "update-definition", label: "调整图片取景", update: (next) => {
      setTemplateSlotRule(next, slotId, breakpoint, "objectPosition", percentToExactObjectPosition(position));
      setTemplateSlotRule(next, slotId, breakpoint, "objectFit", fit);
    } });
    setError(result.ok ? null : result.message);
  };
  if (!editing) return <button type="button" style={{ pointerEvents: "auto", position: "absolute", left: 0, bottom: 0 }} onClick={(event) => { event.stopPropagation(); setError(null); onEditingChange(true); }}>调整画面</button>;
  return <div role="group" aria-label="图片取景编辑" style={{ position: "absolute", inset: 0, pointerEvents: "auto", zIndex: 400, outline: "2px dashed #5F6568" }}>
    <div role="slider" aria-label="图片焦点" aria-valuemin={0} aria-valuemax={100} aria-valuenow={focus.x} aria-valuetext={`横向 ${focus.x}%，纵向 ${focus.y}%`} tabIndex={0}
      style={{ position: "absolute", inset: 0, cursor: rules.objectFit === "contain" ? "crosshair" : "grab", touchAction: "none" }}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? 10 : 1;
        preview({ x: focus.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0), y: focus.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0) });
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return; event.preventDefault(); event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        const image = sourceElement.querySelector("img");
        const width = sourceElement.clientWidth, height = sourceElement.clientHeight;
        const factor = image?.naturalWidth && image.naturalHeight ? (rules.objectFit === "contain" ? Math.min : Math.max)(width / image.naturalWidth, height / image.naturalHeight) : 0;
        const overflowX = image && factor ? (image.naturalWidth * factor - width) * bounds.width / width : 0;
        const overflowY = image && factor ? (image.naturalHeight * factor - height) * bounds.height / height : 0;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, focus, dx: Math.abs(overflowX) > 1 ? -overflowX : bounds.width, dy: Math.abs(overflowY) > 1 ? -overflowY : bounds.height, active: false, element: event.currentTarget };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = drag.current; if (!current || current.id !== event.pointerId) return;
        if (!current.active) { if (!crossesCanvasDragThreshold(event.clientX - current.x, event.clientY - current.y)) return; current.active = true; }
        preview({ x: current.focus.x + (event.clientX - current.x) / Math.max(1, Math.abs(current.dx)) * Math.sign(current.dx) * 100, y: current.focus.y + (event.clientY - current.y) / Math.max(1, Math.abs(current.dy)) * Math.sign(current.dy) * 100 });
      }}
      onPointerUp={(event) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => close(false)} onLostPointerCapture={() => { if (drag.current) close(false); }}>
      <span aria-hidden="true" style={{ position: "absolute", left: `${focus.x}%`, top: `${focus.y}%`, transform: "translate(-50%, -50%)", border: "2px solid white", outline: "1px solid #181A1B", borderRadius: "50%", width: 18, height: 18 }}>+</span>
    </div>
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "white", padding: 4 }} onPointerDown={(event) => event.stopPropagation()}>
      <span>取景 {focus.x}% / {focus.y}% · 不改变图片外框</span>
      <select aria-label="取景适配" value={rules.objectFit ?? "cover"} onChange={(event) => preview(focus, event.target.value as "cover" | "contain")}><option value="cover">填满并裁切</option><option value="contain">完整显示</option></select>
      <button type="button" disabled={Boolean(error)} onClick={() => close(true)}>确认取景</button><button type="button" onClick={() => close(false)}>取消取景</button>
      {error ? <span role="alert">{error}</span> : null}
    </div>
  </div>;
}
