import {
  Component,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AUTO_ARTBOARD_MIN_HEIGHT,
  syncTemplateViewportStyles,
} from "./TemplateViewportFrame";
import EditableTargetOverlay from "./EditableTargetOverlay";
import type {
  TemplateCatalogSlotDescriptor,
} from "./templatePreviewModel";

// 同屏目录卡片会并行建立 iframe 与同步样式；低性能设备上 1.2 秒不足以区分
// “渲染器缺失”和“仍在完成首帧”。保留有限等待，避免短暂拥塞被永久误报。
const PREVIEW_RENDER_TIMEOUT_MS = 3_000;

interface TemplateCatalogViewportPreviewProps {
  children?: ReactNode;
  fallbackHeight: number;
  heightMode: "fixed" | "aspect-ratio" | "auto";
  ratioLabel: string;
  slots: TemplateCatalogSlotDescriptor[];
  sourceWidth: number;
  templateKey: string;
  title: string;
  unavailable?: boolean;
  viewport: "desktop" | "mobile";
}

class TemplateCatalogPreviewErrorBoundary extends Component<{
  children: ReactNode;
  onError: () => void;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function TemplateCatalogViewportPreview({
  children,
  fallbackHeight,
  heightMode,
  ratioLabel,
  slots,
  sourceWidth,
  templateKey,
  title,
  unavailable = false,
  viewport,
}: TemplateCatalogViewportPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);
  const portalStyleSyncDocumentRef = useRef<Document | null>(null);
  const styleSyncIdRef = useRef(0);
  const previewTimedOutRef = useRef(false);
  const initialNaturalHeight = heightMode === "auto"
    ? Math.max(AUTO_ARTBOARD_MIN_HEIGHT, fallbackHeight)
    : fallbackHeight;
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const [styleRevision, setStyleRevision] = useState(0);
  const [stylesReady, setStylesReady] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);
  const isUnavailable = unavailable || renderFailed;
  const [previewStatus, setPreviewStatus] = useState<"loading" | "ready" | "unavailable">(
    isUnavailable ? "unavailable" : "loading",
  );
  const [rendererReady, setRendererReady] = useState(false);
  const [slotBoxCount, setSlotBoxCount] = useState(0);
  const overlayTargets = useMemo(() => slots.map((slot) => ({
    ...slot,
    label: slot.compactLabel,
  })), [slots]);
  const [measurement, setMeasurement] = useState({
    naturalHeight: initialNaturalHeight,
    scale: viewport === "mobile" ? 0.25 : 0.1,
  });
  const syncFrameStyles = useCallback((nextDocument: Document) => {
    const syncId = styleSyncIdRef.current + 1;
    styleSyncIdRef.current = syncId;
    setStylesReady(false);
    previewTimedOutRef.current = false;
    syncTemplateViewportStyles(nextDocument, () => setStyleRevision((value) => value + 1));
    const ownerWindow = nextDocument.defaultView;
    const styleLinks = Array.from(nextDocument.querySelectorAll<HTMLLinkElement>(
      'link[rel="stylesheet"]',
    ));
    const waitForStyleLinks = Promise.all(styleLinks.map((link) => link.sheet
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          const finish = () => resolve();
          link.addEventListener("load", finish, { once: true });
          link.addEventListener("error", finish, { once: true });
          ownerWindow?.requestAnimationFrame(() => {
            if (link.sheet) finish();
          });
          ownerWindow?.setTimeout(finish, 800);
        })));
    void waitForStyleLinks
      .then(() => nextDocument.fonts?.ready)
      .then(() => {
        if (
          styleSyncIdRef.current === syncId
          && frameRef.current?.contentDocument === nextDocument
        ) setStylesReady(true);
      });
  }, []);

  const connectFrame = useCallback(() => {
    const nextDocument = frameRef.current?.contentDocument ?? null;
    if (!nextDocument) return;
    setFrameDocument(nextDocument);
    syncFrameStyles(nextDocument);
  }, [syncFrameStyles]);

  useLayoutEffect(() => {
    styleSyncIdRef.current += 1;
    portalStyleSyncDocumentRef.current = null;
    setFrameDocument(null);
    setStylesReady(false);
    setMeasurement((current) => ({
      ...current,
      naturalHeight: initialNaturalHeight,
    }));
    setRenderFailed(false);
    setRendererReady(false);
    setSlotBoxCount(0);
    setPreviewStatus(unavailable ? "unavailable" : "loading");
  }, [initialNaturalHeight, templateKey, unavailable, viewport]);

  useLayoutEffect(() => {
    if (!frameDocument || isUnavailable) return undefined;
    let animationFrameId: number | null = null;
    const observer = new MutationObserver(() => {
      if (animationFrameId !== null) return;
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        if (frameRef.current?.contentDocument === frameDocument) {
          syncFrameStyles(frameDocument);
        }
      });
    });
    observer.observe(document.head, { childList: true });
    return () => {
      observer.disconnect();
      if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId);
    };
  }, [frameDocument, isUnavailable, syncFrameStyles]);

  useLayoutEffect(() => {
    if (
      !frameDocument
      || isUnavailable
      || !contentElement
      || contentElement.ownerDocument !== frameDocument
      || portalStyleSyncDocumentRef.current === frameDocument
    ) return;
    // Renderer 内的 useInsertionEffect 可能在 portal 首次提交时才把共享样式
    // 注入父文档；此时重新同步一次，避免目录首帧按无样式内容误判为 240px。
    portalStyleSyncDocumentRef.current = frameDocument;
    syncFrameStyles(frameDocument);
  }, [contentElement, frameDocument, isUnavailable, syncFrameStyles]);

  useLayoutEffect(() => {
    if (!renderFailed) return;
    setRendererReady(false);
    setSlotBoxCount(0);
    setPreviewStatus("unavailable");
  }, [renderFailed]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || isUnavailable) return undefined;
    let animationFrameId: number | null = null;
    const measureWidth = () => {
      const scale = host.clientWidth > 0 ? host.clientWidth / sourceWidth : 0;
      if (scale <= 0) return;
      setMeasurement((current) => Math.abs(current.scale - scale) < 0.0001
        ? current
        : { ...current, scale });
    };
    const scheduleWidthMeasurement = () => {
      if (animationFrameId !== null) return;
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        measureWidth();
      });
    };
    const observer = new ResizeObserver(scheduleWidthMeasurement);
    observer.observe(host);
    scheduleWidthMeasurement();
    return () => {
      observer.disconnect();
      if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId);
    };
  }, [isUnavailable, sourceWidth]);

  useLayoutEffect(() => {
    const content = contentElement;
    const ownerWindow = frameDocument?.defaultView;
    if (
      isUnavailable
      || !stylesReady
      || !frameDocument
      || !content
      || !ownerWindow
      || content.ownerDocument !== frameDocument
      || !content.isConnected
      || frameRef.current?.contentDocument !== frameDocument
    ) return undefined;
    let animationFrameId: number | null = null;
    let cancelled = false;
    let lastMeasurementReady = false;

    const hasRenderedPreviewRoot = () => Boolean(content.querySelector(
      "[data-dynamic-template-id], [data-content-template-renderer], [data-template-node-id]",
    ));

    const commitMeasurements = () => {
      const contentBounds = content.getBoundingClientRect();
      const descendantBottom = Array.from(content.children).reduce((bottom, child) => (
        Math.max(bottom, child.getBoundingClientRect().bottom - contentBounds.top)
      ), 0);
      const measuredContentHeight = Math.max(
        AUTO_ARTBOARD_MIN_HEIGHT,
        Math.ceil(contentBounds.height),
        content.scrollHeight,
        Math.ceil(descendantBottom),
      );
      const naturalHeight = heightMode === "auto" ? measuredContentHeight : fallbackHeight;
      setMeasurement((current) => Math.abs(current.naturalHeight - naturalHeight) < 1
        ? current
        : { ...current, naturalHeight });
      const nextRendererReady = hasRenderedPreviewRoot();
      setRendererReady(nextRendererReady);
      const genericSlotsReady = slots.length === 0 || slotBoxCount > 0;
      lastMeasurementReady = nextRendererReady && genericSlotsReady;
      if (lastMeasurementReady) previewTimedOutRef.current = false;
      setPreviewStatus(lastMeasurementReady
        ? "ready"
        : previewTimedOutRef.current
          ? "unavailable"
          : "loading");
    };

    const scheduleMeasurements = () => {
      if (animationFrameId !== null) return;
      animationFrameId = ownerWindow.requestAnimationFrame(() => {
        animationFrameId = null;
        commitMeasurements();
      });
    };

    const resizeObserver = new ownerWindow.ResizeObserver(scheduleMeasurements);
    resizeObserver.observe(content);
    const mutationObserver = new ownerWindow.MutationObserver(scheduleMeasurements);
    mutationObserver.observe(content, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-content-role",
        "data-content-role-desktop",
        "data-content-role-mobile",
        "data-editor-field",
        "data-template-slot-id",
        "style",
      ],
    });
    ownerWindow.addEventListener("resize", scheduleMeasurements);
    scheduleMeasurements();
    const timers = [0, 50, 200, 500, 1_200, 2_000]
      .map((delay) => ownerWindow.setTimeout(scheduleMeasurements, delay));
    const unavailableTimer = ownerWindow.setTimeout(() => {
      commitMeasurements();
      if (!lastMeasurementReady) {
        previewTimedOutRef.current = true;
        setPreviewStatus("unavailable");
      }
    }, PREVIEW_RENDER_TIMEOUT_MS);
    void frameDocument.fonts?.ready.then(() => {
      if (!cancelled) scheduleMeasurements();
    });
    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      ownerWindow.removeEventListener("resize", scheduleMeasurements);
      timers.forEach((timer) => ownerWindow.clearTimeout(timer));
      ownerWindow.clearTimeout(unavailableTimer);
      if (animationFrameId !== null) ownerWindow.cancelAnimationFrame(animationFrameId);
    };
  }, [
    children,
    contentElement,
    fallbackHeight,
    frameDocument,
    heightMode,
    slotBoxCount,
    slots.length,
    sourceWidth,
    styleRevision,
    stylesReady,
    isUnavailable,
  ]);

  const deviceLabel = viewport === "desktop" ? "桌面" : "移动";
  const scaledHeight = measurement.naturalHeight * measurement.scale;

  return (
    <div
      className={`template-editor__catalog-preview-shell is-${viewport}${isUnavailable || previewStatus === "unavailable" ? " is-unavailable" : ""}`}
      data-template-catalog-preview-shell
      data-preview-status={previewStatus}
      data-preview-renderer-ready={rendererReady ? "true" : "false"}
      data-preview-styles-ready={stylesReady ? "true" : "false"}
      data-preview-slot-box-count={slotBoxCount}
    >
      <div
        ref={hostRef}
        className={`homepage-editor__template-preview-img template-editor__catalog-viewport-preview is-${viewport}`}
        data-content-template-preview={templateKey}
        data-preview-art-direction="neutral-template-preview-v1"
        data-preview-height-mode={heightMode}
        data-preview-natural-height={Math.round(measurement.naturalHeight)}
        data-preview-ratio={heightMode === "auto" ? "auto" : ratioLabel}
        data-preview-viewport={viewport}
        style={{
          height: isUnavailable ? undefined : scaledHeight,
          minHeight: previewStatus === "loading" ? 56 : undefined,
          overflow: "hidden",
          position: "relative",
          width: "100%",
        }}
      >
        {isUnavailable ? (
          <span className="template-editor__catalog-preview-state" role="status">预览不可用</span>
        ) : (
          <>
            <iframe
              key={`${templateKey}:${viewport}`}
              ref={frameRef}
              aria-hidden="true"
              className="template-editor__catalog-viewport-frame"
              data-template-catalog-viewport={viewport}
              srcDoc="<!doctype html><html><head></head><body><div id='template-viewport-root'></div></body></html>"
              tabIndex={-1}
              title={`${title}${deviceLabel}目录预览`}
              style={{
                border: 0,
                height: measurement.naturalHeight,
                left: 0,
                pointerEvents: "none",
                position: "absolute",
                top: 0,
                transform: `scale(${measurement.scale})`,
                transformOrigin: "top left",
                width: sourceWidth,
              }}
              onLoad={connectFrame}
            />
            <span className="template-editor__catalog-artboard-boundary" aria-hidden="true" />
            <EditableTargetOverlay
              sourceFrame={frameDocument ? frameRef.current : null}
              sourceRoot={contentElement}
              hostRoot={hostRef.current}
              targets={overlayTargets}
              surface="catalog"
              annotations
              onMeasurementChange={setSlotBoxCount}
            />
            {previewStatus !== "ready" ? (
              <span className="template-editor__catalog-preview-state" role="status">
                {previewStatus === "unavailable" ? "预览不可用" : "正在生成预览"}
              </span>
            ) : null}
          </>
        )}
        {frameDocument?.getElementById("template-viewport-root") && !isUnavailable
          ? createPortal(
              <TemplateCatalogPreviewErrorBoundary
                key={`${templateKey}:${viewport}`}
                onError={() => setRenderFailed(true)}
              >
                <div
                  ref={setContentElement}
                  className="template-editor__canvas-renderer template-editor__dynamic-canvas-renderer template-editor__catalog-canvas-renderer"
                  style={{
                    "--homepage-editor-viewport-height": `${fallbackHeight}px`,
                    width: sourceWidth,
                  } as CSSProperties}
                >
                  <style>{`
                    .template-editor__catalog-canvas-renderer [data-hc-editor-overlay],
                    .template-editor__catalog-canvas-renderer [data-template-selected="true"]::before {
                      display: none !important;
                    }
                    .template-editor__catalog-canvas-renderer [data-template-node-id] {
                      outline: 0 !important;
                    }
                    .template-editor__catalog-canvas-renderer :is(
                      [data-content-role],
                      [data-content-role-desktop],
                      [data-content-role-mobile],
                      [data-editor-field]
                    ) {
                      pointer-events: none !important;
                    }
                  `}</style>
                  {children}
                </div>
              </TemplateCatalogPreviewErrorBoundary>,
              frameDocument.getElementById("template-viewport-root")!,
            )
          : null}
      </div>
    </div>
  );
}
