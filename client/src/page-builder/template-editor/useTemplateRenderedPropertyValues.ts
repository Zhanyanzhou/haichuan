import { useEffect, useState } from "react";
import type { TemplateDefinitionV2 } from "../template-definition";
import type { TemplateBreakpoint } from "../template-definition/responsive";

type RenderedPropertyValues = Record<string, Record<string, string>>;
const TYPOGRAPHY_FIELDS = { fontSize: "font-size", fontWeight: "font-weight", lineHeight: "line-height", textAlign: "text-align", fontRole: "font-family" } as const;
export const isRenderedTypographyProperty = (path: string) => path in TYPOGRAPHY_FIELDS;

/** 仅测当前渲染面，不写样式、不回填文档；没有 DOM 时不猜测最终像素。 */
export function useTemplateRenderedPropertyValues(nodeIds: readonly string[], breakpoint: TemplateBreakpoint, definition: TemplateDefinitionV2 | undefined, previewWidth: number | null) {
  const [values, setValues] = useState<RenderedPropertyValues>({});
  const selectionKey = JSON.stringify(nodeIds);
  useEffect(() => {
    const selectedNodeIds = JSON.parse(selectionKey) as string[];
    let disposed = false;
    let frame = 0;
    // 每个源文档独立交付尺寸通知，不能把 iframe 后代挂到宿主 RO 深度队列。
    const observers = new Map<Document, ResizeObserver>();
    const contentObservers = new Map<Document, MutationObserver>();
    const observed = new Set<Element>();
    const disconnectObservers = () => {
      observers.forEach((observer) => observer.disconnect());
      observers.clear();
      contentObservers.forEach((observer) => observer.disconnect());
      contentObservers.clear();
      observed.clear();
    };
    const observeNode = (element: Element) => {
      if (observed.has(element) || !element.isConnected) return;
      const sourceDocument = element.ownerDocument;
      const ownerWindow = sourceDocument.defaultView;
      if (!ownerWindow) return;
      let observer = observers.get(sourceDocument);
      if (!observer) {
        observer = new ownerWindow.ResizeObserver(() => schedule());
        observers.set(sourceDocument, observer);
      }
      observer.observe(element);
      observed.add(element);
    };
    const frameSelector = "iframe.template-editor__viewport-frame, .template-breakpoint-comparison__card iframe";
    let frames = Array.from(document.querySelectorAll<HTMLIFrameElement>(frameSelector));
    // 有隔离画布时绝不采样宿主模板库缩略图；它可能含相同节点 ID。
    const documents: Document[] = frames.length ? [] : [document];
    const collectDocuments = () => {
      documents.length = 0;
      if (!frames.length) documents.push(document);
      for (const element of frames) {
        const frameBreakpoint = element.closest<HTMLElement>("[data-comparison-breakpoint]")?.dataset.comparisonBreakpoint;
        if (frameBreakpoint && frameBreakpoint !== breakpoint) continue;
        try {
          const doc = element.contentDocument;
          if (!doc || documents.includes(doc)) continue;
          documents.push(doc);
          if (!contentObservers.has(doc) && doc.documentElement && doc.defaultView) {
            // load 早于 React Portal 提交时还没有目标可订阅尺寸，需要监听帧内挂载。
            // 只监听同源画布文档的结构，不监听宿主属性面板的回显属性。
            const observer = new doc.defaultView.MutationObserver(schedule);
            observer.observe(doc.documentElement, { childList: true, subtree: true });
            contentObservers.set(doc, observer);
            void doc.fonts?.ready.then(schedule);
          }
        } catch { /* 不读取跨域预览。 */ }
      }
    };
    const measure = () => {
      frame = 0;
      if (disposed) return;
      collectDocuments();
      const next: RenderedPropertyValues = {};
      const renderedNodes = documents.flatMap((doc) => Array.from(doc.querySelectorAll<HTMLElement>("[data-template-node-id]")))
        .filter((element) => !element.closest("[data-unified-template-library]"));
      for (const id of selectedNodeIds) {
        const node = definition?.nodes[id];
        if (!node) continue;
        const nodeElement = renderedNodes.find((element) => {
          if (element.dataset.templateNodeId !== id || !element.isConnected || !element.getClientRects().length) return false;
          const focus = element.closest<HTMLElement>("[data-canvas-focus-breakpoint]");
          if (focus && focus.dataset.canvasFocusBreakpoint !== breakpoint) return false;
          // 空容器可以真实为零高；隐藏必须按渲染状态判断，不能将零高当作隐藏。
          for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
            const style = ancestor.ownerDocument.defaultView?.getComputedStyle(ancestor);
            if (!style || style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
          }
          return element.getBoundingClientRect().width > 0;
        });
        if (!nodeElement) continue;
        const boxStyle = nodeElement.ownerDocument.defaultView?.getComputedStyle(nodeElement);
        if (!boxStyle) continue;
        // CSS used width/height 使用当前 box-sizing，回写固定值时不重复加 padding/border；
        // 外框显示单独计算，不使用受画布 transform 影响的屏幕坐标。
        const width = parseFloat(boxStyle.width);
        const height = parseFloat(boxStyle.height);
        const contentBox = boxStyle.boxSizing !== "border-box";
        const borderWidth = width + (contentBox ? [boxStyle.paddingLeft, boxStyle.paddingRight, boxStyle.borderLeftWidth, boxStyle.borderRightWidth].reduce((sum, value) => sum + (parseFloat(value) || 0), 0) : 0);
        const borderHeight = height + (contentBox ? [boxStyle.paddingTop, boxStyle.paddingBottom, boxStyle.borderTopWidth, boxStyle.borderBottomWidth].reduce((sum, value) => sum + (parseFloat(value) || 0), 0) : 0);
        next[id] = { width: String(width), height: String(height), borderWidth: String(borderWidth), borderHeight: String(borderHeight), breakpoint };
        observeNode(nodeElement);
        const type = node.slotId ? definition?.slots[node.slotId]?.type : undefined;
        if (!type || !["heading", "text", "richText", "badge", "button", "link"].includes(type)) continue;
        // 空槽位占位不是最终文字样式，不拿它冒充真实文字测量。
        const textElement = nodeElement?.querySelector<HTMLElement>("h1, h2, h3, h4, p, span:not(.hc-dynamic-template__empty-slot)");
        if (!nodeElement || !textElement) continue;
        const style = textElement.ownerDocument.defaultView?.getComputedStyle(textElement);
        if (!style) continue;
        Object.assign(next[id], Object.fromEntries(Object.entries(TYPOGRAPHY_FIELDS).map(([key, css]) => [key, style.getPropertyValue(css)])));
      }
      setValues((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    function schedule() { if (!disposed && !frame) frame = window.requestAnimationFrame(measure); }
    const handleFrameLoad = () => { disconnectObservers(); schedule(); };
    frames.forEach((element) => element.addEventListener("load", handleFrameLoad));
    // 聚焦/并排切换不一定改变断点，监听帧挂载而非依赖模板写入来重新取样。
    const frameObserver = new MutationObserver((mutations) => {
      const containsFrame = (node: Node) => node instanceof Element && (node.matches("iframe") || Boolean(node.querySelector("iframe")));
      if (!mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some(containsFrame))) return;
      disconnectObservers();
      frames.forEach((element) => element.removeEventListener("load", handleFrameLoad));
      frames = Array.from(document.querySelectorAll<HTMLIFrameElement>(frameSelector));
      frames.forEach((element) => element.addEventListener("load", handleFrameLoad));
      schedule();
    });
    frameObserver.observe(document.body, { childList: true, subtree: true });
    collectDocuments();
    documents.forEach((doc) => { void doc.fonts?.ready.then(schedule); });
    schedule();
    return () => { disposed = true; window.cancelAnimationFrame(frame); disconnectObservers(); frameObserver.disconnect(); frames.forEach((element) => element.removeEventListener("load", handleFrameLoad)); };
  }, [selectionKey, breakpoint, definition, previewWidth]);
  return values;
}
