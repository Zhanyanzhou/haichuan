import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { registerOverlayPortal } from "@puckeditor/core";
import DynamicTemplateRenderer from "@/page-builder/template-definition/DynamicTemplateRenderer";
import { isMobileCanvasWidth, RESPONSIVE_CANVAS } from "@/page-builder/config/blockContracts";
import {
  createTemplateCatalogPreviewContentBySlotId,
  withNeutralTemplateImages,
} from "@/page-builder/template-editor/templatePreviewModel";
import type { PublishedDynamicTemplateResource } from "@/services/clients/dynamicTemplateClient";
import {
  CANVAS_HEIGHT_MESSAGE,
  useHomepagePuck,
  type CanvasHeightMessage,
} from "./editor-store";

/**
 * 页面装修的模板预览只存在于画布渲染树，不进入 Puck data。
 * 写入 data 会记历史、点亮未保存，并可能被画布同步立刻清掉。
 */
type PageCanvasTemplatePreviewState = {
  template: PublishedDynamicTemplateResource;
  name: string;
  revision: number;
  focused: boolean;
  hidden: boolean;
};

type AddHandler = (template: PublishedDynamicTemplateResource) => void;

let current: PageCanvasTemplatePreviewState | null = null;
let addHandler: AddHandler | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return current;
}

export function usePageCanvasTemplatePreview() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function showPageCanvasTemplatePreview(input: {
  template: PublishedDynamicTemplateResource;
  name: string;
}) {
  current = {
    template: input.template,
    name: input.name,
    revision: (current?.revision ?? 0) + 1,
    focused: true,
    hidden: false,
  };
  emit();
}

export function setPageCanvasTemplatePreviewFocused(focused: boolean) {
  if (!current || current.focused === focused) return;
  current = { ...current, focused };
  emit();
}

export function setPageCanvasTemplatePreviewHidden(hidden: boolean) {
  if (!current || current.hidden === hidden) return;
  current = { ...current, hidden, focused: true };
  emit();
}

export function clearPageCanvasTemplatePreview() {
  if (!current) return;
  current = null;
  emit();
}

export function pageCanvasTemplatePreviewMatches(template: { templateId: string; version: number }) {
  return current?.template.templateId === template.templateId
    && current.template.version === template.version;
}

export function setPageCanvasTemplatePreviewAddHandler(handler: AddHandler | null) {
  addHandler = handler;
}

export function commitPageCanvasTemplatePreview() {
  const preview = current;
  const handler = addHandler;
  if (!preview || !handler) return;
  const template = preview.template;
  clearPageCanvasTemplatePreview();
  handler(template);
}

/** 画布模块和临时预览共用同一套设备高度，避免预览节和已插入节比例不一致。 */
export function applyEditorCanvasMetrics(element: HTMLElement, editorViewportHeight: number) {
  const viewportHeight = Math.max(1, Math.round(editorViewportHeight));
  element.style.setProperty("--homepage-editor-viewport-height", `${viewportHeight}px`);
  element.style.setProperty("--homepage-editor-single-height", `${Math.round(viewportHeight * 1.1)}px`);
  element.style.setProperty(
    "--homepage-editor-single-image-height",
    `${Math.min(860, Math.round(viewportHeight * 0.76))}px`,
  );
  element.style.setProperty("--homepage-editor-single-copy-offset", `${Math.round(viewportHeight * 0.22)}px`);
  element.style.setProperty("--homepage-editor-double-height", `${Math.round(viewportHeight * 1.18)}px`);
  element.style.setProperty(
    "--homepage-editor-double-main-height",
    `${Math.min(900, Math.max(560, Math.round(viewportHeight * 0.8)))}px`,
  );
  element.style.setProperty(
    "--homepage-editor-double-detail-height",
    `${Math.min(520, Math.max(320, Math.round(viewportHeight * 0.48)))}px`,
  );
  element.style.setProperty("--homepage-editor-bleed-height", `${Math.round(viewportHeight * 0.9)}px`);
  element.style.setProperty(
    "--homepage-editor-bleed-bottom-padding",
    `${Math.min(80, Math.max(38, Math.round(viewportHeight * 0.07)))}px`,
  );
}

export function focusPageCanvasTemplatePreview() {
  window.requestAnimationFrame(() => {
    const frame = document.querySelector<HTMLIFrameElement>(
      ".homepage-editor__canvas-scale iframe",
    );
    const target = frame?.contentDocument?.querySelector<HTMLElement>(
      "[data-canvas-template-preview]",
    );
    if (!frame || !target) return;
    scrollCanvasPreviewIntoView(target);
  });
}

function scrollCanvasPreviewIntoView(target: HTMLElement) {
  const frame = target.ownerDocument.defaultView?.frameElement;
  if (!(frame instanceof HTMLIFrameElement)) return;
  const scrollContainer = frame.closest<HTMLElement>(".homepage-editor__canvas-scroll")
    ?? frame.closest<HTMLElement>(".homepage-editor__stage");
  const documentElement = frame.contentDocument?.documentElement;
  if (!scrollContainer || !documentElement) return;
  const iframeRect = frame.getBoundingClientRect();
  const scrollRect = scrollContainer.getBoundingClientRect();
  const scale = iframeRect.width / Math.max(1, documentElement.clientWidth);
  const targetRect = target.getBoundingClientRect();
  const targetTop = iframeRect.top + targetRect.top * scale;
  scrollContainer.scrollBy({
    top: targetTop - (scrollRect.top + 12),
    behavior: "auto",
  });
}

export function PageCanvasTemplatePreview() {
  const preview = usePageCanvasTemplatePreview();
  const rootRef = useRef<HTMLElement>(null);
  const currentViewport = useHomepagePuck((state) => state.appState.ui.viewports.current);
  const editorViewportHeight = currentViewport.height === "auto"
    ? RESPONSIVE_CANVAS.desktop.height
    : currentViewport.height;
  const device = isMobileCanvasWidth(currentViewport.width) ? "mobile" : "desktop";
  const projected = useMemo(
    () => preview
      ? withNeutralTemplateImages(
        preview.template.definition,
        createTemplateCatalogPreviewContentBySlotId(preview.template.definition),
      )
      : null,
    [preview],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !preview) return;
    applyEditorCanvasMetrics(root, editorViewportHeight);
  }, [editorViewportHeight, preview]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !preview) return;
    return registerOverlayPortal(root, { disableDrag: true });
  }, [preview]);

  useEffect(() => {
    const root = rootRef.current;
    const frameWindow = root?.ownerDocument.defaultView;
    if (!root || !preview || !frameWindow || frameWindow === window) return;

    let animationFrameId = 0;
    const reportCanvasHeight = () => {
      const contentShell = root.closest<HTMLElement>(".homepage-editor__storefront-frame");
      const documentHeight = Math.ceil(Math.max(
        contentShell?.scrollHeight || 0,
        contentShell?.offsetHeight || 0,
      ));
      if (documentHeight <= 0) return;
      frameWindow.parent.postMessage(
        { type: CANVAS_HEIGHT_MESSAGE, height: documentHeight } satisfies CanvasHeightMessage,
        "*",
      );
    };
    const scheduleReport = () => {
      if (animationFrameId) frameWindow.cancelAnimationFrame(animationFrameId);
      animationFrameId = frameWindow.requestAnimationFrame(() => {
        animationFrameId = 0;
        reportCanvasHeight();
      });
    };
    const observer = new frameWindow.ResizeObserver(scheduleReport);
    observer.observe(root);
    scheduleReport();
    const delayedReport = frameWindow.setTimeout(scheduleReport, 80);
    return () => {
      if (animationFrameId) frameWindow.cancelAnimationFrame(animationFrameId);
      observer.disconnect();
      frameWindow.clearTimeout(delayedReport);
    };
  }, [preview]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !preview) return;
    const frameWindow = root.ownerDocument.defaultView ?? window;
    const frame = frameWindow.requestAnimationFrame(() => scrollCanvasPreviewIntoView(root));
    // 切换设备后 Puck 会异步把已选模块带回视口；预览排在该模块之前，需要再拉回第一屏。
    const delayed = frameWindow.setTimeout(() => scrollCanvasPreviewIntoView(root), 140);
    return () => {
      frameWindow.cancelAnimationFrame(frame);
      frameWindow.clearTimeout(delayed);
    };
  }, [preview, currentViewport.width, currentViewport.height]);

  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      const target = event.target;
      if (
        target instanceof HTMLElement
        && target.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")
      ) return;
      clearPageCanvasTemplatePreview();
    };
    window.addEventListener("keydown", onKey);
    const frameWindow = rootRef.current?.ownerDocument.defaultView;
    if (frameWindow && frameWindow !== window) frameWindow.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      frameWindow?.removeEventListener("keydown", onKey);
    };
  }, [preview]);

  if (!preview || preview.hidden || !projected) return null;

  return (
    <section
      ref={rootRef}
      className="homepage-editor__canvas-template-preview"
      data-canvas-template-preview="true"
      aria-label={`画布预览：${preview.name}，尚未加入页面`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <DynamicTemplateRenderer
        definition={projected.definition}
        device={device}
        contentBySlotId={projected.contentBySlotId}
        mode="preview"
        showEmptySlots={false}
      />
    </section>
  );
}
