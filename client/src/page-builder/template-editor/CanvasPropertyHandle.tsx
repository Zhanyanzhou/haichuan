import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { crossesCanvasDragThreshold } from "./templateCanvasInteraction";
import { focusFirstInvalidNumberField, useCommittedNumberInput } from "../inspector/controls/NumberField";

function CanvasPropertyValueEditor({ label, value, unit, max, help, onApply, onClose }: {
  label: string; value: number; unit: string; max: number; help: string; onApply: (value: number) => void; onClose: () => void;
}) {
  const transaction = useCommittedNumberInput({ label, value, min: 0, max, step: 1, onCommit: (next) => { onApply(next); onClose(); } });
  return <form className="template-editor__property-value-editor" aria-label={`设置${label}`} style={{ left: "50%", top: "50%" }}
    onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); transaction.restore(); onClose(); } }}
    onSubmit={(event) => { event.preventDefault(); if (transaction.commit()) onClose(); }}>
    <label>{label}（{unit}）<input autoFocus ref={transaction.inputRef} type="text" role="spinbutton" inputMode="decimal" aria-label={`${label}数值`}
      data-committed-number-input="true" aria-valuemin={0} aria-valuemax={max} aria-invalid={transaction.error ? "true" : undefined}
      value={transaction.draft} onChange={(event) => transaction.setDraft(event.target.value)} /></label>
    {transaction.error ? <span role="alert">{transaction.error}</span> : <span>{help}</span>}
    <div><button type="submit">应用</button><button type="button" onClick={() => { transaction.restore(); onClose(); }}>取消</button></div>
  </form>;
}

function gapHandleGeometry(element: HTMLElement, scale: number) {
  const bounds = element.getBoundingClientRect();
  const boxes = Array.from(element.querySelectorAll<HTMLElement>("[data-template-node-id]"))
    .filter((child) => child.parentElement?.closest("[data-template-node-id]") === element && child.getClientRects().length
      && !["absolute", "fixed"].includes(element.ownerDocument.defaultView!.getComputedStyle(child).position))
    .map((child) => child.getBoundingClientRect()).sort((a, b) => a.top - b.top || a.left - b.left);
  // 依据真正相邻的可见外框确定拖动轴，不能把网格的 direction 当成实际间隙方向。
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    if (b.left >= a.right - .5 && overlapY > 0) return { axis: "x" as const, left: ((a.right + b.left) / 2 - bounds.left) * scale, top: (Math.max(a.top, b.top) + overlapY / 2 - bounds.top) * scale,
      band: { left: (a.right - bounds.left) * scale, top: (Math.max(a.top, b.top) - bounds.top) * scale, width: Math.max(2, (b.left - a.right) * scale), height: overlapY * scale } };
    if (b.top >= a.bottom - .5 && overlapX > 0) return { axis: "y" as const, left: (Math.max(a.left, b.left) + overlapX / 2 - bounds.left) * scale, top: ((a.bottom + b.top) / 2 - bounds.top) * scale,
      band: { left: (Math.max(a.left, b.left) - bounds.left) * scale, top: (a.bottom - bounds.top) * scale, width: overlapX * scale, height: Math.max(2, (b.top - a.bottom) * scale) } };
  }
  return null;
}

/** 标量拖柄只表达累计意图，实际预览与事务交给画布统一命令链。 */
export default function CanvasPropertyHandle({ label, value, axis, scale, max = 10000, unit = "px", placement, sourceElement, onBegin, onPreview, onCommit, onCancel }: {
  label: string; value: number; axis: "x" | "y"; scale: number; max?: number; unit?: string;
  placement?: string; sourceElement?: HTMLElement;
  onBegin: () => void; onPreview: (value: number) => void;
  onCommit: (value: number) => void; onCancel: () => void;
}) {
  const gap = placement === "gap" && sourceElement ? gapHandleGeometry(sourceElement, scale) : null;
  const dragAxis = gap?.axis ?? axis;
  const direction = placement === "padding.right" || placement === "padding.bottom" ? -1 : 1;
  const [active, setActive] = useState(false);
  const [highlighted, setHighlighted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [liveValue, setLiveValue] = useState(value);
  const button = useRef<HTMLButtonElement>(null);
  const suppressClick = useRef(false);
  const displayedValue = active ? liveValue : value;
  const callbacks = useRef({ onBegin, onPreview, onCommit, onCancel });
  callbacks.current = { onBegin, onPreview, onCommit, onCancel };
  const drag = useRef<{ pointerId: number; start: number; value: number; next: number; active: boolean; element: HTMLButtonElement } | null>(null);
  const finish = (commit: boolean) => {
    const current = drag.current;
    drag.current = null;
    setActive(false);
    if (!current) return;
    suppressClick.current = current.active;
    if (current.element.hasPointerCapture(current.pointerId)) current.element.releasePointerCapture(current.pointerId);
    if (!current.active) return;
    if (commit) callbacks.current.onCommit(current.next); else callbacks.current.onCancel();
  };
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || !drag.current) return;
      event.preventDefault(); event.stopImmediatePropagation(); finish(false);
    };
    const blur = () => finish(false);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", escape, true); window.removeEventListener("blur", blur); finish(false); };
  }, []);
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const delta = ((dragAxis === "x" ? event.clientX : event.clientY) - current.start) * direction;
    if (!current.active) {
      if (!crossesCanvasDragThreshold(delta, 0)) return;
      current.active = true; setActive(true); callbacks.current.onBegin();
    }
    current.next = Math.max(0, Math.min(max, Math.round(current.value + delta / Math.max(0.01, scale))));
    setLiveValue(current.next);
    callbacks.current.onPreview(current.next);
  };
  const position: CSSProperties = { cursor: dragAxis === "x" ? "ew-resize" : "ns-resize" };
  const side = placement?.startsWith("padding.") ? placement.slice(8) : undefined;
  if (side) {
    // 间距模式中将标签留在选框内，零留白也不会被画布滚动边界裁掉。
    if (side === "top" || side === "bottom") Object.assign(position, { left: "50%", [side]: Math.max(4, displayedValue * scale / 2 - 14), transform: "translateX(-50%)" });
    else Object.assign(position, { top: "50%", [side!]: Math.max(4, displayedValue * scale / 2 - 56), transform: "translateY(-50%)" });
  } else if (placement === "gap" && sourceElement) {
    // 空容器也保留点击数值入口，待有相邻对象时才定位到真实间隙。
    Object.assign(position, gap ? { left: gap.left, top: gap.top, transform: "translate(-50%, -50%)" }
      : { left: "50%", top: 48, transform: "translateX(-50%)" });
  } else Object.assign(position, { left: "50%", top: placement?.endsWith(".y") ? 64 : 32, transform: "translateX(-50%)" });
  const help = side ? "向内拖动增加留白，仅改变这一边" : placement === "gap" ? "调整本组同级对象的间距" : "调整图片焦点";
  const band: CSSProperties | undefined = side ? { position: "absolute", [side]: 0,
    ...(dragAxis === "x" ? { top: 0, bottom: 0, width: Math.max(2, displayedValue * scale) } : { left: 0, right: 0, height: Math.max(2, displayedValue * scale) }) } : gap?.band;
  const closeEditor = () => { setEditing(false); button.current?.focus(); };
  return <>
    {band && (highlighted || active || editing) ? <span aria-hidden="true" className="template-editor__spacing-band" style={band} /> : null}
    <button ref={button} type="button" className="template-editor__property-handle" aria-label={`拖动调整${label}`} title={`${label} ${displayedValue}${unit}；${help}；单击输入数值；${dragAxis === "x" ? "左右" : "上下"}方向键微调`}
    data-spacing-position={side ?? placement} data-active={active} style={position}
    aria-expanded={editing}
    onMouseEnter={() => setHighlighted(true)} onMouseLeave={() => setHighlighted(false)}
    onFocus={() => setHighlighted(true)} onBlur={() => setHighlighted(false)}
    onClick={(event) => {
      event.stopPropagation();
      if (suppressClick.current) { suppressClick.current = false; return; }
      if (focusFirstInvalidNumberField()) return;
      setEditing(true);
    }}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      if (focusFirstInvalidNumberField()) return;
      event.currentTarget.focus(); suppressClick.current = false;
      drag.current = { pointerId: event.pointerId, start: dragAxis === "x" ? event.clientX : event.clientY, value, next: value, active: false, element: event.currentTarget };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={move}
    onPointerUp={() => finish(true)} onPointerCancel={() => finish(false)} onLostPointerCapture={() => finish(false)}
    onKeyDown={(event) => {
      if (!(dragAxis === "x" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"]).includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      callbacks.current.onBegin();
      const next = Math.max(0, Math.min(max, value + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) * direction * (event.shiftKey ? 10 : 1)));
      callbacks.current.onPreview(next); callbacks.current.onCommit(next);
    }}><span aria-hidden="true">{placement?.startsWith("imageFocus") ? `${displayedValue}${unit}` : `${dragAxis === "x" ? "↔" : "↕"} ${label} ${displayedValue} ${unit}`}</span><span className="template-editor__property-handle-label" aria-hidden="true">{active ? `${drag.current?.value} → ${displayedValue} ${unit} · Esc 取消` : `${label} · ${help} · 单击可输入`}</span></button>
    {editing ? <CanvasPropertyValueEditor label={label} value={value} unit={unit} max={max} help={help} onClose={closeEditor}
      onApply={(next) => { callbacks.current.onBegin(); callbacks.current.onPreview(next); callbacks.current.onCommit(next); }} /> : null}
  </>;
}
