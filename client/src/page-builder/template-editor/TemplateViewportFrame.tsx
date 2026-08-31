import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import WorkspaceCanvasControls from "./WorkspaceCanvasControls";

function syncHostStyles(targetDocument: Document, onStylesChanged: () => void) {
  targetDocument.head.replaceChildren();
  document.head
    .querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style')
    .forEach((node) => {
      const clone = node.cloneNode(true) as HTMLLinkElement | HTMLStyleElement;
      if (clone instanceof HTMLLinkElement) {
        clone.addEventListener("load", onStylesChanged, { once: true });
        clone.addEventListener("error", onStylesChanged, { once: true });
      }
      targetDocument.head.appendChild(clone);
    });
  const baseStyle = targetDocument.createElement("style");
  baseStyle.textContent = `
    :root { color-scheme: light; }
    html, body { width: 100%; min-height: 0; margin: 0; padding: 0; overflow: hidden; }
    body { background: #fff; }
    #template-viewport-root { width: 100%; min-height: 1px; }
    #template-viewport-root > .template-editor__canvas-renderer {
      position: relative !important;
      inset: auto !important;
      transform: none !important;
    }
  `;
  targetDocument.head.appendChild(baseStyle);
}

export default function TemplateViewportFrame({
  children,
  fallbackHeight,
  sourceWidth,
  title,
  onScaleChange,
}: {
  children: ReactNode;
  fallbackHeight: number;
  sourceWidth: number;
  title: string;
  onScaleChange?: (scale: number) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const [styleRevision, setStyleRevision] = useState(0);
  const [isFitView, setIsFitView] = useState(true);
  const [manualScale, setManualScale] = useState(1);
  const [measurement, setMeasurement] = useState({
    fitScale: 1,
    naturalHeight: fallbackHeight,
  });

  const connectFrame = useCallback(() => {
    const nextDocument = frameRef.current?.contentDocument ?? null;
    if (!nextDocument) return;
    syncHostStyles(nextDocument, () => setStyleRevision((value) => value + 1));
    setFrameDocument(nextDocument);
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const measureWidth = () => {
      const fitScale = Math.min(1, Math.max(0.16, (stage.clientWidth - 48) / sourceWidth));
      setMeasurement((current) => Math.abs(current.fitScale - fitScale) < 0.001
        ? current
        : { ...current, fitScale });
    };
    const observer = new ResizeObserver(measureWidth);
    observer.observe(stage);
    measureWidth();
    return () => observer.disconnect();
  }, [sourceWidth]);

  useEffect(() => {
    setIsFitView(true);
  }, [sourceWidth]);

  const scale = isFitView ? measurement.fitScale : manualScale;

  useEffect(() => {
    onScaleChange?.(scale);
  }, [onScaleChange, scale]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!frameDocument || !content) return undefined;
    const measureHeight = () => {
      const naturalHeight = Math.max(
        fallbackHeight,
        Math.ceil(content.getBoundingClientRect().height),
        content.scrollHeight,
        frameDocument.body.scrollHeight,
        frameDocument.documentElement.scrollHeight,
      );
      setMeasurement((current) => Math.abs(current.naturalHeight - naturalHeight) < 1
        ? current
        : { ...current, naturalHeight });
    };
    const observer = new ResizeObserver(measureHeight);
    observer.observe(content);
    measureHeight();
    const ownerWindow = frameDocument.defaultView;
    const timers = ownerWindow
      ? [0, 50, 200, 500].map((delay) => ownerWindow.setTimeout(measureHeight, delay))
      : [];
    return () => {
      observer.disconnect();
      if (ownerWindow) timers.forEach((timer) => ownerWindow.clearTimeout(timer));
    };
  }, [children, fallbackHeight, frameDocument, sourceWidth, styleRevision]);

  const scaledHeight = measurement.naturalHeight * scale;
  const adjustScale = (delta: number) => {
    setIsFitView(false);
    setManualScale((current) => Math.min(1, Math.max(0.16, current + delta)));
  };
  return (
    <>
      <WorkspaceCanvasControls
        isFitView={isFitView}
        zoom={scale}
        viewportLabel={`${sourceWidth} × ${Math.round(fallbackHeight)}`}
        onFit={() => setIsFitView(true)}
        onActualSize={() => {
          setManualScale(1);
          setIsFitView(false);
        }}
        onZoomOut={() => adjustScale(-0.1)}
        onZoomIn={() => adjustScale(0.1)}
      />
      <div
        ref={stageRef}
        className="homepage-editor__canvas-scroll template-editor__canvas-scroll"
      >
        <div
          className="homepage-editor__canvas-document template-editor__canvas-document"
          style={{ width: sourceWidth * scale, height: scaledHeight }}
        >
          <iframe
            ref={frameRef}
            title={title}
            className="template-editor__viewport-frame"
            srcDoc="<!doctype html><html><head></head><body><div id='template-viewport-root'></div></body></html>"
            style={{
              width: sourceWidth,
              height: measurement.naturalHeight,
              transform: `scale(${scale})`,
            }}
            onLoad={connectFrame}
          />
          {frameDocument?.getElementById("template-viewport-root")
            ? createPortal(
                <div
                  ref={contentRef}
                  className="template-editor__viewport-content"
                  style={{ "--homepage-editor-viewport-height": `${fallbackHeight}px` } as CSSProperties}
                >
                  {children}
                </div>,
                frameDocument.getElementById("template-viewport-root")!,
              )
            : null}
        </div>
      </div>
    </>
  );
}
