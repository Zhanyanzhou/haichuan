import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DynamicTemplateRenderer, resolveTemplateDesignFrame, type TemplateDefinitionV2 } from "../template-definition";
import type { TemplateBreakpoint } from "../template-definition/responsive";
import { syncTemplateViewportStyles } from "./TemplateViewportFrame";
import "./TemplateBreakpointComparison.css";

export interface TemplateBreakpointComparisonProps {
  definition: TemplateDefinitionV2;
  contentBySlotId?: Record<string, unknown>;
  selectedNodeId?: string | null;
  onFocus: (breakpoint: TemplateBreakpoint, nodeId?: string) => void;
}

const LABELS: Record<TemplateBreakpoint, string> = { desktop: "Desktop", tablet: "Tablet", mobile: "Mobile" };

function ComparisonViewport({ definition, contentBySlotId, selectedNodeId, onFocus, breakpoint }: TemplateBreakpointComparisonProps & { breakpoint: TemplateBreakpoint }) {
  const frame = resolveTemplateDesignFrame(definition, breakpoint);
  const hostRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(300);
  const [height, setHeight] = useState(frame.fallbackHeight);
  const [selectionVisible, setSelectionVisible] = useState(false);
  const scale = Math.min(1, width / frame.sourceWidth);
  const measure = useCallback(() => {
    if (!root?.isConnected || root.ownerDocument !== iframeRef.current?.contentDocument) return;
    const nextHeight = Math.max(1, Math.ceil(root.getBoundingClientRect().height));
    setHeight((previous) => previous === nextHeight ? previous : nextHeight);
    const selected = Array.from(root.querySelectorAll<HTMLElement>("[data-template-node-id]"))
      .find((node) => node.dataset.templateNodeId === selectedNodeId);
    const visible = Boolean(selected && selected.getClientRects().length && selected.getBoundingClientRect().width && selected.getBoundingClientRect().height);
    setSelectionVisible(visible);
    root.querySelectorAll("[data-comparison-selected]").forEach((node) => node.removeAttribute("data-comparison-selected"));
    if (visible) selected?.setAttribute("data-comparison-selected", "true");
  }, [root, selectedNodeId]);

  const initialize = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    syncTemplateViewportStyles(doc, () => iframeRef.current?.dispatchEvent(new Event("comparison-styles-loaded")));
    const style = doc.createElement("style");
    style.textContent = "[data-comparison-selected] { outline: 2px solid #181A1B; outline-offset: -2px; } #template-comparison-root { width: 100%; min-height: 1px; }";
    doc.head.appendChild(style);
    const mount = doc.createElement("div");
    mount.id = "template-comparison-root";
    doc.body.replaceChildren(mount);
    setRoot(mount);
  }, []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setWidth(host.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => { measure(); }, [measure, definition, contentBySlotId]);
  useEffect(() => {
    const ownerWindow = root?.ownerDocument.defaultView;
    if (!root?.isConnected || !ownerWindow || root.ownerDocument !== iframeRef.current?.contentDocument) return;
    const observer = new ownerWindow.ResizeObserver(measure);
    observer.observe(root);
    const iframe = iframeRef.current;
    iframe?.addEventListener("comparison-styles-loaded", measure);
    root.addEventListener("load", measure, true);
    return () => {
      observer.disconnect();
      iframe?.removeEventListener("comparison-styles-loaded", measure);
      root.removeEventListener("load", measure, true);
    };
  }, [root, measure]);

  return <section className="template-breakpoint-comparison__card" aria-label={`${LABELS[breakpoint]} 并排预览`} data-comparison-breakpoint={breakpoint}>
    <header><strong>{LABELS[breakpoint]}</strong><span>{frame.sourceWidth} px</span>
      <button type="button" onClick={() => onFocus(breakpoint, selectedNodeId ?? undefined)}>聚焦 {LABELS[breakpoint]}</button>
    </header>
    <p className="template-breakpoint-comparison__selection" role="status">{selectedNodeId ? selectionVisible ? `已选：${definition.nodes[selectedNodeId]?.name ?? selectedNodeId}` : "当前选中对象在此断点隐藏或不可见" : "点击对象可选择并聚焦该断点"}</p>
    <div ref={hostRef} className="template-breakpoint-comparison__viewport">
      <div style={{ height: height * scale, position: "relative" }}>
        <iframe ref={iframeRef} title={`${LABELS[breakpoint]} 模板内容`} onLoad={initialize}
          srcDoc="<!doctype html><html><head></head><body></body></html>"
          style={{ width: frame.sourceWidth, height, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", border: 0 }} />
      </div>
    </div>
    {root && createPortal(<div onClickCapture={(event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = event.target as HTMLElement;
      const nodeId = target.closest<HTMLElement>("[data-template-node-id]")?.dataset.templateNodeId;
      if (nodeId && definition.nodes[nodeId]) onFocus(breakpoint, nodeId);
    }} onSubmitCapture={(event) => event.preventDefault()}>
      <DynamicTemplateRenderer definition={definition} device={breakpoint === "mobile" ? "mobile" : "desktop"} breakpoint={breakpoint}
        contentBySlotId={contentBySlotId} mode="preview" showEmptySlots interactionOwner="host-overlay" />
    </div>, root)}
  </section>;
}

/** 三个视口只消费同一文档；选择与退出并排查看由宿主编辑上下文负责。 */
export default function TemplateBreakpointComparison(props: TemplateBreakpointComparisonProps) {
  if (Number(props.definition.schemaVersion) < 2) return <p role="status">兼容模式暂不支持三断点并排查看。</p>;
  return <div className="template-breakpoint-comparison" aria-label="三断点并排查看">
    {(["desktop", "tablet", "mobile"] as const).map((breakpoint) => <ComparisonViewport key={breakpoint} {...props} breakpoint={breakpoint} />)}
  </div>;
}
