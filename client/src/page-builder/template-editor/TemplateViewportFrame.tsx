import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import WorkspaceCanvasControls from "./WorkspaceCanvasControls";
import EditableTargetOverlay, {
  type OverlayNodeAction,
  type OverlayPlacementGesture,
  type OverlayTargetDescriptor,
} from "./EditableTargetOverlay";
import {
  formatTemplateRatio,
  type TemplateDesignHeightMode,
} from "../template-definition";
import {
  calculateFitCanvasScale,
  canvasPointAtViewportCenter,
  clampCanvasScale,
  clampRoundedGeometryValue as clampDimension,
  rectCenter,
  rectFromBounds,
  scrollPositionForCanvasPoint,
} from "./editableTargetGeometry";
import { findElementsByEditableTargetLocator } from "./editableTargetDomLocator";
import { useTemplateEditorSession } from "./templateEditorSession";

export const AUTO_ARTBOARD_MIN_HEIGHT = 240;
const DIRECT_RESIZE_MIN_HEIGHT = 40;
const DIRECT_RESIZE_MAX_HEIGHT = 9999;
const MIN_CANVAS_SCALE = 0.1;
const MAX_CANVAS_SCALE = 2;

export type TemplateDirectResizeDirection = "horizontal" | "vertical" | "both";

export interface TemplateDirectResizeValue {
  direction: TemplateDirectResizeDirection;
  width: number;
  height: number;
  heightMode: TemplateDesignHeightMode;
  ratioLocked: boolean;
  snapped?: boolean;
}

interface TemplateDirectResizeSession extends TemplateDirectResizeValue {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startWidth: number;
  startHeight: number;
  startHeightMode: TemplateDesignHeightMode;
  scale: number;
  moved: boolean;
}

interface TemplatePanSession {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
}

interface TemplateViewportMeasurement {
  fitScale: number;
  naturalHeight: number;
  contentWidth: number;
  contentHeight: number;
  overflowNodeId?: string;
}

function readCanvasContentBox(stage: HTMLElement) {
  const styles = window.getComputedStyle(stage);
  const horizontalPadding = Number.parseFloat(styles.paddingLeft)
    + Number.parseFloat(styles.paddingRight);
  const verticalPadding = Number.parseFloat(styles.paddingTop)
    + Number.parseFloat(styles.paddingBottom);
  return {
    width: Math.max(1, stage.clientWidth - horizontalPadding),
    height: Math.max(1, stage.clientHeight - verticalPadding),
  };
}

function fitLockedRatio(
  startWidth: number,
  startHeight: number,
  requestedWidth: number,
  requestedHeight: number,
  direction: TemplateDirectResizeDirection,
  minWidth: number,
  maxWidth: number,
) {
  const ratio = startWidth / Math.max(startHeight, 1);
  if (direction === "horizontal") {
    const width = clampDimension(requestedWidth, minWidth, maxWidth);
    return { width, height: clampDimension(width / ratio, DIRECT_RESIZE_MIN_HEIGHT, DIRECT_RESIZE_MAX_HEIGHT) };
  }
  if (direction === "vertical") {
    const requestedLockedWidth = requestedHeight * ratio;
    const width = clampDimension(requestedLockedWidth, minWidth, maxWidth);
    return { width, height: clampDimension(width / ratio, DIRECT_RESIZE_MIN_HEIGHT, DIRECT_RESIZE_MAX_HEIGHT) };
  }
  const horizontalChange = Math.abs(requestedWidth / Math.max(startWidth, 1) - 1);
  const verticalChange = Math.abs(requestedHeight / Math.max(startHeight, 1) - 1);
  if (horizontalChange >= verticalChange) {
    const width = clampDimension(requestedWidth, minWidth, maxWidth);
    return { width, height: clampDimension(width / ratio, DIRECT_RESIZE_MIN_HEIGHT, DIRECT_RESIZE_MAX_HEIGHT) };
  }
  const requestedLockedWidth = requestedHeight * ratio;
  const width = clampDimension(requestedLockedWidth, minWidth, maxWidth);
  return { width, height: clampDimension(width / ratio, DIRECT_RESIZE_MIN_HEIGHT, DIRECT_RESIZE_MAX_HEIGHT) };
}

function createRulerMarks(length: number, step: number) {
  const markCount = Math.min(41, Math.floor(length / step) + 1);
  return Array.from({ length: markCount }, (_, index) => index * step);
}

export function syncTemplateViewportStyles(targetDocument: Document, onStylesChanged: () => void) {
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
    @media (min-width: 768px) {
      #template-viewport-root .hc-section {
        --hc-py-brand: clamp(96px, calc(var(--homepage-editor-viewport-height, 1200px) * .12), 160px) !important;
        --hc-py-commerce: clamp(56px, calc(var(--homepage-editor-viewport-height, 1200px) * .07), 96px) !important;
      }
    }
  `;
  targetDocument.head.appendChild(baseStyle);
}

export default function TemplateViewportFrame({
  children,
  fallbackHeight,
  sourceWidth,
  autoHeight,
  heightMode,
  ratioLabel,
  minWidth,
  maxWidth,
  resizable,
  title,
  onScaleChange,
  onWidthChange,
  onHeightChange,
  onHeightModeChange,
  onRatioChange,
  canRestore,
  device,
  onRestore,
  onDirectResizePreview,
  onDirectResizeCancel,
  onDirectResizeCommit,
  hasSelection,
  onSelectNode,
  overlayTargets,
  selectedOverlayTargetId,
  movableOverlayTargetIds,
  resizeOverlayTargetIds,
  disabledOverlayNodeActions,
  copyResponsiveDestinationLabel,
  onOverlayTargetSelect,
  onOverlayNodeAction,
  onOverlayPlacementGesture,
}: {
  children: ReactNode;
  fallbackHeight: number;
  sourceWidth: number;
  autoHeight: boolean;
  heightMode: TemplateDesignHeightMode;
  ratioLabel: string;
  minWidth: number;
  maxWidth: number;
  resizable: boolean;
  title: string;
  onScaleChange?: (scale: number) => void;
  onWidthChange: (width: number) => void;
  onHeightChange: (height: number) => void;
  onHeightModeChange: (mode: TemplateDesignHeightMode) => void;
  onRatioChange: (ratio: { width: number; height: number }) => void;
  canRestore: boolean;
  device: "desktop" | "mobile";
  onRestore: () => void;
  onDirectResizePreview: (resize: TemplateDirectResizeValue) => void;
  onDirectResizeCancel: () => void;
  onDirectResizeCommit: (resize: TemplateDirectResizeValue) => void;
  hasSelection: boolean;
  onSelectNode?: (nodeId: string) => void;
  overlayTargets?: readonly OverlayTargetDescriptor[];
  selectedOverlayTargetId?: string | null;
  movableOverlayTargetIds?: ReadonlySet<string>;
  resizeOverlayTargetIds?: ReadonlySet<string>;
  disabledOverlayNodeActions?: ReadonlyMap<string, ReadonlySet<OverlayNodeAction>>;
  copyResponsiveDestinationLabel?: string;
  onOverlayTargetSelect?: (target: OverlayTargetDescriptor) => void;
  onOverlayNodeAction?: (target: OverlayTargetDescriptor, action: OverlayNodeAction) => void;
  onOverlayPlacementGesture?: (gesture: OverlayPlacementGesture) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const directResizeRef = useRef<TemplateDirectResizeSession | null>(null);
  const panSessionRef = useRef<TemplatePanSession | null>(null);
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);
  const [styleRevision, setStyleRevision] = useState(0);
  const canvasZoom = useTemplateEditorSession((state) => state.canvasZoom);
  const setCanvasZoom = useTemplateEditorSession((state) => state.setCanvasZoom);
  const isFitView = canvasZoom === null;
  const manualScale = canvasZoom ?? 1;
  const [panMode, setPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showCenterGuides, setShowCenterGuides] = useState(false);
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const canvasContractRef = useRef(`${sourceWidth}:${fallbackHeight}:${autoHeight}`);
  const [measurement, setMeasurement] = useState<TemplateViewportMeasurement>({
    fitScale: 1,
    // 自动高度仍有当前设备的合同基线。首帧先使用该基线，避免真实
    // Renderer 尚未完成测量时把画布短暂显示成通用 240px 空画板。
    naturalHeight: autoHeight ? Math.max(AUTO_ARTBOARD_MIN_HEIGHT, fallbackHeight) : fallbackHeight,
    contentWidth: sourceWidth,
    contentHeight: autoHeight ? Math.max(AUTO_ARTBOARD_MIN_HEIGHT, fallbackHeight) : fallbackHeight,
  });
  const [directResizeStatus, setDirectResizeStatus] = useState<TemplateDirectResizeValue | null>(null);

  const connectFrame = useCallback(() => {
    const nextDocument = frameRef.current?.contentDocument ?? null;
    if (!nextDocument) return;
    syncTemplateViewportStyles(nextDocument, () => setStyleRevision((value) => value + 1));
    setFrameDocument(nextDocument);
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const measureWidth = () => {
      const viewport = readCanvasContentBox(stage);
      const fitScale = calculateFitCanvasScale({
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        contentWidth: sourceWidth,
        contentHeight: measurement.naturalHeight,
        inset: 0,
        minimumScale: MIN_CANVAS_SCALE,
        maximumScale: 1,
      });
      // 只跳过完全相同的测量，保留 dock 动画收尾时不足 0.001 的比例变化。
      setMeasurement((current) => current.fitScale === fitScale
        ? current
        : { ...current, fitScale });
    };
    const observer = new ResizeObserver(measureWidth);
    observer.observe(stage);
    measureWidth();
    return () => observer.disconnect();
  }, [measurement.naturalHeight, sourceWidth]);

  useEffect(() => {
    if (directResizeRef.current) return;
    const nextContract = `${sourceWidth}:${fallbackHeight}:${autoHeight}`;
    if (canvasContractRef.current === nextContract) return;
    canvasContractRef.current = nextContract;
    setCanvasZoom(null);
  }, [autoHeight, fallbackHeight, setCanvasZoom, sourceWidth]);

  useLayoutEffect(() => {
    if (directResizeRef.current) return;
    const baselineHeight = autoHeight
      ? Math.max(AUTO_ARTBOARD_MIN_HEIGHT, fallbackHeight)
      : fallbackHeight;
    setMeasurement((current) => (
      Math.abs(current.naturalHeight - baselineHeight) < 1
      && Math.abs(current.contentHeight - baselineHeight) < 1
      && Math.abs(current.contentWidth - sourceWidth) < 1
      && !current.overflowNodeId
    ) ? current : {
      ...current,
      naturalHeight: baselineHeight,
      contentHeight: baselineHeight,
      contentWidth: sourceWidth,
      overflowNodeId: undefined,
    });
  }, [autoHeight, fallbackHeight, sourceWidth]);

  const baseScale = isFitView ? measurement.fitScale : manualScale;
  const scale = directResizeRef.current?.scale ?? baseScale;
  const rulerStep = sourceWidth <= 480 ? 100 : 200;
  const horizontalRulerMarks = createRulerMarks(sourceWidth, rulerStep);
  const verticalRulerMarks = createRulerMarks(measurement.naturalHeight, rulerStep);

  useEffect(() => {
    onScaleChange?.(scale);
  }, [onScaleChange, scale]);

  useLayoutEffect(() => {
    const content = contentElement;
    if (!frameDocument || !content) return undefined;
    const ownerWindow = frameDocument.defaultView;
    let animationFrameId: number | null = null;
    const commitMeasuredHeight = () => {
      const contentRect = content.getBoundingClientRect();
      const measurableNodes = Array.from(new Set([
        ...Array.from(content.children),
        ...Array.from(content.querySelectorAll<HTMLElement>("[data-template-node-id], [data-content-role]")),
      ]));
      const bounds = measurableNodes.reduce((current, child) => {
        const rect = child.getBoundingClientRect();
        return {
          left: Math.min(current.left, rect.left - contentRect.left),
          right: Math.max(current.right, rect.right - contentRect.left),
          top: Math.min(current.top, rect.top - contentRect.top),
          bottom: Math.max(current.bottom, rect.bottom - contentRect.top),
        };
      }, { left: 0, right: contentRect.width, top: 0, bottom: 0 });
      let overflowNodeId: string | undefined;
      let largestOverflow = 0;
      if (!autoHeight) {
        content.querySelectorAll<HTMLElement>("[data-template-node-id]").forEach((node) => {
          const rect = node.getBoundingClientRect();
          const left = rect.left - contentRect.left;
          const right = rect.right - contentRect.left;
          const top = rect.top - contentRect.top;
          const bottom = rect.bottom - contentRect.top;
          const overflowAmount = Math.max(0, -left, right - sourceWidth)
            + Math.max(0, -top, bottom - fallbackHeight);
          if (overflowAmount > largestOverflow) {
            largestOverflow = overflowAmount;
            overflowNodeId = node.dataset.templateNodeId;
          }
        });
      }
      const measuredContentHeight = Math.max(
        AUTO_ARTBOARD_MIN_HEIGHT,
        Math.ceil(contentRect.height),
        content.scrollHeight,
        Math.ceil(bounds.bottom - Math.min(0, bounds.top)),
      );
      const measuredContentWidth = Math.max(
        sourceWidth,
        content.scrollWidth,
        Math.ceil(bounds.right - Math.min(0, bounds.left)),
      );
      const naturalHeight = autoHeight ? measuredContentHeight : fallbackHeight;
      setMeasurement((current) => (
        Math.abs(current.naturalHeight - naturalHeight) < 1
        && Math.abs(current.contentHeight - measuredContentHeight) < 1
        && Math.abs(current.contentWidth - measuredContentWidth) < 1
        && current.overflowNodeId === overflowNodeId
      ) ? current : {
        ...current,
        naturalHeight,
        contentHeight: measuredContentHeight,
        contentWidth: measuredContentWidth,
        overflowNodeId,
      });
    };
    const measureHeight = () => {
      if (!ownerWindow) {
        commitMeasuredHeight();
        return;
      }
      if (animationFrameId !== null) return;
      // ResizeObserver 回调中同步改变 iframe 高度会让依赖视口尺寸的模板
      // 在同一帧反向触发观察器。延迟到下一动画帧提交，保留实时测量，
      // 同时切断浏览器报告的 undelivered notifications 循环。
      animationFrameId = ownerWindow.requestAnimationFrame(() => {
        animationFrameId = null;
        commitMeasuredHeight();
      });
    };
    const observer = new ResizeObserver(measureHeight);
    observer.observe(content);
    // iframe 文档本身至少与当前 viewport 等高，读取 body/documentElement.scrollHeight
    // 会让随内容画布只能增高、无法在比例或内容缩短后回落。只测量真实渲染子树，
    // 并补充直接子项的可见底边以覆盖绝对定位或变换后的溢出内容。
    Array.from(content.children).forEach((child) => observer.observe(child));
    content.querySelectorAll<HTMLElement>("[data-template-node-id], [data-content-role]")
      .forEach((node) => observer.observe(node));
    measureHeight();
    const timers = ownerWindow
      ? [0, 50, 200, 500].map((delay) => ownerWindow.setTimeout(measureHeight, delay))
      : [];
    return () => {
      observer.disconnect();
      if (ownerWindow) {
        timers.forEach((timer) => ownerWindow.clearTimeout(timer));
        if (animationFrameId !== null) ownerWindow.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [autoHeight, children, contentElement, fallbackHeight, frameDocument, sourceWidth, styleRevision]);

  const scaledHeight = measurement.naturalHeight * scale;
  const setCanvasScale = (nextScale: number) => {
    const clampedScale = clampCanvasScale(nextScale, MIN_CANVAS_SCALE, MAX_CANVAS_SCALE);
    const stage = stageRef.current;
    const board = boardRef.current;
    const canvasCenter = stage && board ? canvasPointAtViewportCenter({
      scrollLeft: stage.scrollLeft,
      scrollTop: stage.scrollTop,
      viewportWidth: stage.clientWidth,
      viewportHeight: stage.clientHeight,
      boardLeft: board.offsetLeft,
      boardTop: board.offsetTop,
      scale,
    }) : null;
    setCanvasZoom(clampedScale);
    if (stage && canvasCenter) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const nextBoard = boardRef.current;
          if (!nextBoard) return;
          const position = scrollPositionForCanvasPoint({
            point: canvasCenter,
            viewportWidth: stage.clientWidth,
            viewportHeight: stage.clientHeight,
            boardLeft: nextBoard.offsetLeft,
            boardTop: nextBoard.offsetTop,
            scale: clampedScale,
          });
          stage.scrollTo({ left: position.x, top: position.y });
        });
      });
    }
  };
  const adjustScale = (delta: number) => {
    setCanvasScale(scale + delta);
  };
  const findFrameTarget = (nodeId?: string) => {
    if (!frameDocument) return null;
    if (nodeId) {
      const matchingNode = Array.from(
        frameDocument.querySelectorAll<HTMLElement>("[data-template-node-id]"),
      ).find((node) => node.dataset.templateNodeId === nodeId);
      if (matchingNode) return matchingNode;
    }
    const selectedDescriptor = overlayTargets?.find(
      (target) => target.targetId === selectedOverlayTargetId,
    );
    if (selectedDescriptor && contentElement) {
      const [matchingTarget] = findElementsByEditableTargetLocator(
        contentElement,
        selectedDescriptor.locator,
      );
      if (matchingTarget) return matchingTarget;
    }
    return frameDocument.querySelector<HTMLElement>('[data-template-selected="true"]');
  };
  const centerFrameTarget = (targetScale: number, nodeId?: string, behavior: ScrollBehavior = "smooth") => {
    const stage = stageRef.current;
    const board = boardRef.current;
    const target = findFrameTarget(nodeId);
    if (!stage || !board || !target) return false;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const position = scrollPositionForCanvasPoint({
      point: rectCenter(rectFromBounds(rect)),
      viewportWidth: stage.clientWidth,
      viewportHeight: stage.clientHeight,
      boardLeft: board.offsetLeft,
      boardTop: board.offsetTop,
      scale: targetScale,
    });
    stage.scrollTo({
      left: position.x,
      top: position.y,
      behavior,
    });
    return true;
  };
  const scheduleCenterFrameTarget = (targetScale: number, nodeId?: string) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => centerFrameTarget(targetScale, nodeId));
    });
  };
  const locateSelection = () => {
    centerFrameTarget(scale);
  };
  const fitSelection = () => {
    const stage = stageRef.current;
    const target = findFrameTarget();
    if (!stage || !target) return;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nextScale = calculateFitCanvasScale({
      viewportWidth: stage.clientWidth,
      viewportHeight: stage.clientHeight,
      contentWidth: rect.width,
      contentHeight: rect.height,
      inset: 48,
      minimumAvailableSize: 120,
      minimumScale: MIN_CANVAS_SCALE,
      maximumScale: MAX_CANVAS_SCALE,
    });
    setCanvasScale(nextScale);
    scheduleCenterFrameTarget(nextScale);
  };
  const locateOverflow = () => {
    const nodeId = measurement.overflowNodeId;
    if (!nodeId) return;
    onSelectNode?.(nodeId);
    scheduleCenterFrameTarget(scale, nodeId);
  };
  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!panMode || !stage || event.button !== 0) return;
    event.preventDefault();
    stage.focus({ preventScroll: true });
    panSessionRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: stage.scrollLeft,
      startScrollTop: stage.scrollTop,
    };
    setIsPanning(true);
    stage.setPointerCapture(event.pointerId);
  };
  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    const session = panSessionRef.current;
    if (!stage || !session || event.pointerId !== session.pointerId) return;
    event.preventDefault();
    stage.scrollLeft = session.startScrollLeft - (event.clientX - session.startClientX);
    stage.scrollTop = session.startScrollTop - (event.clientY - session.startClientY);
  };
  const finishPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    const session = panSessionRef.current;
    if (!stage || !session || event.pointerId !== session.pointerId) return;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    panSessionRef.current = null;
    setIsPanning(false);
  };
  const panWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!panMode || !stage) return;
    const distance = event.shiftKey ? 80 : 24;
    const delta = {
      ArrowLeft: [-distance, 0],
      ArrowRight: [distance, 0],
      ArrowUp: [0, -distance],
      ArrowDown: [0, distance],
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    stage.scrollBy({ left: delta[0], top: delta[1] });
  };
  const beginDirectResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    direction: TemplateDirectResizeDirection,
  ) => {
    if (!resizable || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const start: TemplateDirectResizeSession = {
      pointerId: event.pointerId,
      direction,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: sourceWidth,
      startHeight: Math.round(measurement.naturalHeight),
      startHeightMode: heightMode,
      width: sourceWidth,
      height: Math.round(measurement.naturalHeight),
      heightMode,
      ratioLocked: heightMode === "aspect-ratio",
      scale: Math.max(scale, 0.01),
      moved: false,
    };
    directResizeRef.current = start;
    setDirectResizeStatus(start);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDirectResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = directResizeRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    event.preventDefault();
    const horizontalDelta = (event.clientX - session.startClientX) / session.scale;
    const verticalDelta = (event.clientY - session.startClientY) / session.scale;
    const requestedWidth = session.direction === "vertical"
      ? session.startWidth
      : session.startWidth + horizontalDelta;
    const requestedHeight = session.direction === "horizontal"
      ? session.startHeight
      : session.startHeight + verticalDelta;
    const ratioLocked = session.startHeightMode === "aspect-ratio" || event.shiftKey;
    const shouldSnap = snapToGrid && !event.altKey;
    const snappedWidth = shouldSnap && session.direction !== "vertical"
      ? Math.round(requestedWidth / 10) * 10
      : requestedWidth;
    const snappedHeight = shouldSnap && session.direction !== "horizontal"
      ? Math.round(requestedHeight / 10) * 10
      : requestedHeight;
    const dimensions = ratioLocked
      ? fitLockedRatio(
          session.startWidth,
          session.startHeight,
          snappedWidth,
          snappedHeight,
          session.direction,
          minWidth,
          maxWidth,
        )
      : {
          width: session.direction === "vertical"
            ? session.startWidth
            : clampDimension(snappedWidth, minWidth, maxWidth),
          height: session.direction === "horizontal"
            ? session.startHeight
            : clampDimension(snappedHeight, DIRECT_RESIZE_MIN_HEIGHT, DIRECT_RESIZE_MAX_HEIGHT),
        };
    const next: TemplateDirectResizeValue = {
      direction: session.direction,
      ...dimensions,
      heightMode: session.direction === "horizontal"
        ? session.startHeightMode
        : session.startHeightMode === "fixed"
          ? "fixed"
          : "aspect-ratio",
      ratioLocked,
      snapped: shouldSnap
        && (Math.round(requestedWidth) !== Math.round(snappedWidth)
          || Math.round(requestedHeight) !== Math.round(snappedHeight)),
    };
    session.width = next.width;
    session.height = next.height;
    session.heightMode = next.heightMode;
    session.ratioLocked = next.ratioLocked;
    session.moved = session.moved
      || next.width !== session.startWidth
      || next.height !== session.startHeight;
    setDirectResizeStatus(next);
    onDirectResizePreview(next);
  };
  const finishDirectResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    commit: boolean,
  ) => {
    const session = directResizeRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    directResizeRef.current = null;
    setDirectResizeStatus(null);
    if (commit && session.moved) {
      onDirectResizeCommit({
        direction: session.direction,
        width: session.width,
        height: session.height,
        heightMode: session.heightMode,
        ratioLocked: session.ratioLocked,
      });
    } else {
      onDirectResizeCancel();
    }
  };
  const resizeWithKeyboard = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    direction: TemplateDirectResizeDirection,
  ) => {
    if (event.key === "Escape" && directResizeRef.current) {
      event.preventDefault();
      directResizeRef.current = null;
      setDirectResizeStatus(null);
      onDirectResizeCancel();
      return;
    }
    const step = event.shiftKey ? 1 : 10;
    let width = sourceWidth;
    let height = Math.round(measurement.naturalHeight);
    let handled = false;
    if (direction !== "vertical" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      width = clampDimension(
        width + (event.key === "ArrowRight" ? step : -step),
        minWidth,
        maxWidth,
      );
      handled = true;
    }
    if (direction !== "horizontal" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      height = clampDimension(
        height + (event.key === "ArrowDown" ? step : -step),
        DIRECT_RESIZE_MIN_HEIGHT,
        DIRECT_RESIZE_MAX_HEIGHT,
      );
      handled = true;
    }
    if (!handled) return;
    event.preventDefault();
    const ratioLocked = heightMode === "aspect-ratio" || event.shiftKey;
    const dimensions = ratioLocked
      ? fitLockedRatio(
          sourceWidth,
          Math.round(measurement.naturalHeight),
          width,
          height,
          direction,
          minWidth,
          maxWidth,
        )
      : { width, height };
    onDirectResizeCommit({
      direction,
      ...dimensions,
      heightMode: direction === "horizontal"
        ? heightMode
        : heightMode === "fixed"
          ? "fixed"
          : "aspect-ratio",
      ratioLocked,
    });
  };
  const overflow = autoHeight ? undefined : {
    horizontal: Math.max(0, Math.round(measurement.contentWidth - sourceWidth)),
    vertical: Math.max(0, Math.round(measurement.contentHeight - measurement.naturalHeight)),
    nodeId: measurement.overflowNodeId,
  };
  return (
    <>
      <WorkspaceCanvasControls
        isFitView={isFitView}
        zoom={scale}
        viewportLabel={`${sourceWidth} × ${Math.round(measurement.naturalHeight)}`}
        editableSize={{
          width: sourceWidth,
          height: Math.round(measurement.naturalHeight),
          heightMode,
          ratioLabel,
          device,
          minWidth,
          maxWidth,
          canRestore,
          overflow,
          onWidthChange,
          onHeightChange,
          onHeightModeChange,
          onRatioChange,
          onRestore,
          onLocateOverflow: locateOverflow,
        }}
        onFit={() => setCanvasZoom(null)}
        onActualSize={() => {
          setCanvasZoom(1);
        }}
        onZoomChange={setCanvasScale}
        onZoomOut={() => adjustScale(-0.1)}
        onZoomIn={() => adjustScale(0.1)}
        panMode={panMode}
        showGrid={showGrid}
        showCenterGuides={showCenterGuides}
        showSafeArea={showSafeArea}
        snapToGrid={snapToGrid}
        canLocateSelection={hasSelection}
        onPanModeChange={() => setPanMode((current) => !current)}
        onGridChange={() => setShowGrid((current) => !current)}
        onCenterGuidesChange={() => setShowCenterGuides((current) => !current)}
        onSafeAreaChange={() => setShowSafeArea((current) => !current)}
        onSnapToGridChange={() => setSnapToGrid((current) => !current)}
        onLocateSelection={locateSelection}
        onFitSelection={fitSelection}
      />
      <div
        ref={stageRef}
        className={`homepage-editor__canvas-scroll template-editor__canvas-scroll${panMode ? " is-pan-mode" : ""}${isPanning ? " is-panning" : ""}`}
        tabIndex={panMode ? 0 : -1}
        aria-label={panMode ? "模板画布平移区域；使用方向键平移" : undefined}
        onPointerDown={beginPan}
        onPointerMove={movePan}
        onPointerUp={finishPan}
        onPointerCancel={finishPan}
        onKeyDown={panWithKeyboard}
      >
        <div
          ref={boardRef}
          className={`template-editor__canvas-board${directResizeStatus ? " is-direct-resizing" : ""}`}
          data-direct-resizing={directResizeStatus?.direction}
          style={{ width: sourceWidth * scale, height: scaledHeight }}
        >
          <div className="template-editor__canvas-ruler template-editor__canvas-ruler--horizontal" aria-hidden="true">
            {horizontalRulerMarks.map((value) => (
              <span key={value} style={{ left: value * scale }}>{value}</span>
            ))}
          </div>
          <div className="template-editor__canvas-ruler template-editor__canvas-ruler--vertical" aria-hidden="true">
            {verticalRulerMarks.map((value) => (
              <span key={value} style={{ top: value * scale }}>{value}</span>
            ))}
          </div>
          {showGrid ? (
            <div
              className="template-editor__canvas-grid"
              aria-hidden="true"
              style={{
                "--template-canvas-grid-step": `${20 * scale}px`,
                "--template-canvas-grid-major-step": `${100 * scale}px`,
              } as CSSProperties}
            />
          ) : null}
          {showCenterGuides ? (
            <div className="template-editor__canvas-center-guides" aria-hidden="true">
              <i />
              <i />
            </div>
          ) : null}
          {showSafeArea ? (
            <div className="template-editor__canvas-safe-area" aria-hidden="true">
              <span>安全区 5%</span>
            </div>
          ) : null}
          <div
            ref={documentRef}
            className="homepage-editor__canvas-document template-editor__canvas-document"
          >
            <span className="template-editor__artboard-boundary-label" aria-hidden="true">
              模板边界
            </span>
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
                    ref={setContentElement}
                    className="template-editor__viewport-content"
                    style={{
                      "--homepage-editor-viewport-height": `${fallbackHeight}px`,
                      "--template-editor-overlay-scale": `${1 / Math.max(scale, 0.01)}`,
                    } as CSSProperties}
                  >
                    {children}
                  </div>,
                  frameDocument.getElementById("template-viewport-root")!,
                )
              : null}
            {overlayTargets && overlayTargets.length > 0 && !panMode ? (
              <EditableTargetOverlay
                sourceFrame={frameDocument ? frameRef.current : null}
                sourceRoot={contentElement}
                hostRoot={documentRef.current}
                targets={overlayTargets}
                surface="template-definition"
                selectedTargetId={selectedOverlayTargetId}
                interactive
                snapEnabled={snapToGrid}
                movableTargetIds={movableOverlayTargetIds}
                resizeTargetIds={resizeOverlayTargetIds}
                disabledNodeActions={disabledOverlayNodeActions}
                copyResponsiveDestinationLabel={copyResponsiveDestinationLabel}
                onSelectTarget={onOverlayTargetSelect}
                onNodeAction={onOverlayNodeAction}
                onPlacementGesture={onOverlayPlacementGesture}
              />
            ) : null}
          </div>
          {resizable ? (
            <div className="template-editor__canvas-resize-handles" role="group" aria-label="直接调整模板整体比例">
              {([
                ["horizontal", "拖动调整模板宽度"],
                ["vertical", "拖动调整模板高度与整体比例"],
                ["both", "拖动调整模板整体比例"],
              ] as const).map(([direction, label]) => (
                <button
                  key={direction}
                  type="button"
                  className={`template-editor__canvas-resize-handle template-editor__canvas-resize-handle--${direction}`}
                  aria-label={`${label}，当前 ${sourceWidth} × ${Math.round(measurement.naturalHeight)}`}
                  aria-keyshortcuts={direction === "horizontal"
                    ? "ArrowLeft ArrowRight"
                    : direction === "vertical"
                      ? "ArrowUp ArrowDown"
                      : "ArrowLeft ArrowRight ArrowUp ArrowDown"}
                  title={`${label}；固定比例会联动宽高，其他模式按 Shift 可临时锁定比例；方向键 10px，Shift + 方向键 1px`}
                  onPointerDown={(event) => beginDirectResize(event, direction)}
                  onPointerMove={moveDirectResize}
                  onPointerUp={(event) => finishDirectResize(event, true)}
                  onPointerCancel={(event) => finishDirectResize(event, false)}
                  onKeyDown={(event) => resizeWithKeyboard(event, direction)}
                />
              ))}
            </div>
          ) : null}
          {directResizeStatus ? (
            <output className="template-editor__canvas-direct-resize-readout" aria-live="polite">
              {directResizeStatus.width} × {directResizeStatus.height}
              {directResizeStatus.direction === "horizontal"
                ? ""
                : ` · ${formatTemplateRatio(directResizeStatus.width, directResizeStatus.height)}`}
              {` · ${directResizeStatus.heightMode === "fixed" ? "固定高度" : directResizeStatus.heightMode === "aspect-ratio" ? "固定比例" : "随内容"}`}
              {directResizeStatus.ratioLocked ? " · 比例已锁定" : ""}
              {directResizeStatus.snapped ? " · 已吸附 10px" : ""}
            </output>
          ) : null}
        </div>
      </div>
    </>
  );
}
