import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "antd";
import { canNestDynamicTemplateNode, getDynamicTemplateStructureLockOwnerId, type DynamicTemplateNodeType, type TemplateDefinitionV2 } from "../template-definition";
import { resolveTemplateNodeRules } from "../template-definition/responsive";
import { useTemplateEditorSession } from "./templateEditorSession";
import { insertTemplateAuthoringNode } from "./insertTemplateAuthoringNode";
import { crossesCanvasDragThreshold } from "./templateCanvasInteraction";

type Drop = { parentId?: string; index?: number; label: string; bounds?: { left: number; top: number; width: number; height: number }; line?: { left: number; top: number; width: number; height: number } };

/** 从真实内容视口读取落点；只接受同源编辑画布，不猜测另一个容器或改变既有布局。 */
function locateDrop(root: HTMLElement, definition: TemplateDefinitionV2, type: DynamicTemplateNodeType, x: number, y: number): Drop {
  const breakpoint = useTemplateEditorSession.getState().breakpoint;
  for (const frame of root.querySelectorAll<HTMLIFrameElement>("iframe")) {
    const box = frame.getBoundingClientRect();
    if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue;
    let surface: Document | null = null;
    try { surface = frame.contentDocument; } catch { continue; }
    if (!surface || !frame.clientWidth || !frame.clientHeight) continue;
    const sx = box.width / frame.clientWidth;
    const sy = box.height / frame.clientHeight;
    const localX = (x - box.left) / sx;
    const localY = (y - box.top) / sy;
    const hit = surface.elementFromPoint(localX, localY)?.closest<HTMLElement>("[data-template-node-id]");
    if (!hit) continue;
    let parent: HTMLElement | null = hit;
    while (parent) {
      const id = parent.dataset.templateNodeId;
      const node = id ? definition.nodes[id] : undefined;
      if (!node) break;
      if (getDynamicTemplateStructureLockOwnerId(definition, node.nodeId)) return { label: "不允许放置：目标容器已锁定" };
      const rules = resolveTemplateNodeRules(definition, node.nodeId, breakpoint);
      if (node.hidden || rules.hidden || rules.display === "none") return { label: "不允许放置：目标容器已隐藏" };
      if (canNestDynamicTemplateNode(node.type, type)) {
        const rect = parent.getBoundingClientRect();
        const bounds = { left: box.left + rect.left * sx, top: box.top + rect.top * sy, width: rect.width * sx, height: rect.height * sy };
        const child = hit === parent ? null : Array.from(parent.children).find((element) => element === hit || element.contains(hit)) as HTMLElement | undefined;
        const childId = child?.dataset.templateNodeId;
        const childIndex = childId ? node.childIds.indexOf(childId) : -1;
        const horizontal = rules.direction === "row" || rules.display === "grid";
        const childBox = child?.getBoundingClientRect();
        const before = childBox ? (horizontal ? localX < childBox.left + childBox.width / 2 : localY < childBox.top + childBox.height / 2) : false;
        const index = childIndex >= 0 ? childIndex + (before ? 0 : 1) : node.childIds.length;
        const line = childBox && rules.layoutMode !== "free" ? horizontal
          ? { left: box.left + (before ? childBox.left : childBox.right) * sx, top: box.top + childBox.top * sy, width: 2, height: childBox.height * sy }
          : { left: box.left + childBox.left * sx, top: box.top + (before ? childBox.top : childBox.bottom) * sy, width: childBox.width * sx, height: 2 } : undefined;
        return { parentId: node.nodeId, index, bounds, line, label: `添加到「${node.name}」第 ${index + 1} 项${rules.layoutMode === "free" ? "，沿用自由布局初始位置" : rules.display === "grid" ? "，网格自动回流" : "，其余对象自动回流"}` };
      }
      parent = parent.parentElement?.closest<HTMLElement>("[data-template-node-id]") ?? null;
    }
    return { label: "不允许放置：当前容器不接受此类对象" };
  }
  return { label: "请拖到画布内的合法容器；Esc 取消" };
}

export default function CanvasInsertButton({ type, label, parentId, disabled, onNotice }: { type: DynamicTemplateNodeType; label: string; parentId: string; disabled: boolean; onNotice: (message: string | null) => void }) {
  const drag = useRef<{ pointerId: number; x: number; y: number; root: HTMLElement; definition: TemplateDefinitionV2; sessionId: string | null; active: boolean; drop: Drop } | null>(null);
  const suppressClick = useRef(false);
  const [feedback, setFeedback] = useState<Drop | null>(null);
  const finishInsertion = (result: ReturnType<typeof insertTemplateAuthoringNode>) => {
    onNotice(result.ok ? null : result.message);
    if (!result.ok) return;
    const node = useTemplateEditorSession.getState().draft?.definition.nodes[result.nodeId];
    if (!node?.slotId) return;
    window.dispatchEvent(new CustomEvent("template-editor:open-default-content", {
      detail: { nodeId: result.nodeId, slotId: node.slotId },
    }));
  };
  const cancel = () => { if (drag.current) suppressClick.current = true; drag.current = null; setFeedback(null); };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && drag.current) { event.preventDefault(); event.stopPropagation(); cancel(); } };
    window.addEventListener("keydown", escape, true); window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("keydown", escape, true); window.removeEventListener("blur", cancel); };
  }, []);
  return <><Button size="small" disabled={disabled} title={disabled ? "当前层不接受此对象，请先进入内容区域" : "单击添加到当前层，或拖入画布选择插入位置"}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      const state = useTemplateEditorSession.getState();
      const root = event.currentTarget.closest<HTMLElement>(".template-editor__stage");
      if (!state.draft || !root || state.activeInteraction) return;
      suppressClick.current = false;
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, root, definition: state.draft.definition, sessionId: state.sessionId, active: false, drop: { label: "请选择插入容器" } };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (!current.active && !crossesCanvasDragThreshold(event.clientX - current.x, event.clientY - current.y)) return;
      current.active = true; suppressClick.current = true;
      current.drop = locateDrop(current.root, current.definition, type, event.clientX, event.clientY);
      setFeedback(current.drop);
    }}
    onPointerUp={(event) => {
      const current = drag.current; drag.current = null; setFeedback(null);
      if (!current?.active) return;
      event.preventDefault(); suppressClick.current = true;
      const state = useTemplateEditorSession.getState();
      if (state.sessionId !== current.sessionId || state.draft?.definition !== current.definition) { onNotice("模板状态已变化，本次拖入已取消。"); return; }
      if (!current.drop.parentId) { onNotice(current.drop.label); return; }
      const result = insertTemplateAuthoringNode({ source: "inline-region", nodeType: type, parentNodeId: current.drop.parentId, insertionIndex: current.drop.index });
      finishInsertion(result);
    }} onPointerCancel={cancel} onLostPointerCapture={cancel}
    onClick={() => {
      if (suppressClick.current) { suppressClick.current = false; return; }
      const result = insertTemplateAuthoringNode({ source: "inline-region", nodeType: type, parentNodeId: parentId });
      finishInsertion(result);
    }}>添加{label}</Button>
    {feedback ? createPortal(<div style={{ pointerEvents: "none", position: "fixed", inset: 0, zIndex: 1500 }}>
      {feedback.bounds ? <div data-canvas-insert-target style={{ position: "absolute", ...feedback.bounds, outline: "2px solid var(--adm-text-secondary, #6e7477)", background: "rgb(110 116 119 / 7%)" }} /> : null}
      {feedback.line ? <div data-canvas-insert-line style={{ position: "absolute", ...feedback.line, background: "var(--adm-text, #181a1b)" }} /> : null}
      <div role="status" className="template-editor__drop-feedback" style={{ left: feedback.bounds?.left ?? 24, top: Math.max(8, (feedback.bounds?.top ?? 60) - 30) }}>{feedback.label}</div>
    </div>, document.body) : null}
  </>;
}
