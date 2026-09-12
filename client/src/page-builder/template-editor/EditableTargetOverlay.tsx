import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type {
  EditableTargetCapability,
  EditableTargetLocatorAttribute,
} from "../template-definition/editableTargets";
import type { FreePlacementResizeHandle } from "../template-definition/freePlacementGeometry";
import {
  applyHostRectGesture,
  clampGeometryValue,
  clampHostRect,
  createSourceToHostTransform,
  expandHostHitRect,
  getEditorHitSize,
  hostDeltaToSource,
  placeHostLabel,
  projectSourceRectToHost,
  rectFromBounds,
  sourceRectRelativeToParentNormalized,
  sourceRectRelativeToRoot,
  type GeometryRect,
  type SourceToHostTransform,
} from "./editableTargetGeometry";
import { findElementsByEditableTargetLocator } from "./editableTargetDomLocator";
import { useTemplateEditorSession } from "./templateEditorSession";
import CanvasInlineTextEditor from "./CanvasInlineTextEditor";
import {
  isSameTemplateEditorSelectionTarget,
  type TemplateEditorSelectionTarget,
} from "./templateEditorSelection";
import { canvasMarqueeRect, canvasRectIntersects, crossesCanvasDragThreshold, cycleCanvasHit, isCanvasTargetInScope } from "./templateCanvasInteraction";
import CanvasPropertyHandle from "./CanvasPropertyHandle";
import CanvasImageFocusEditor from "./CanvasImageFocusEditor";
import CanvasGridDividers from "./CanvasGridDividers";
import { getTemplateDesignRange } from "../template-definition/designPropertySemantics";
import { constrainTemplateResizeDelta, readTemplateResizeLimits, type TemplateResizeLimits } from "./templateResizeIntent";
import "./templateCanvasInteraction.css";

export interface OverlayTargetDescriptor {
  targetId: string;
  ownerNodeId: string;
  parentTargetId?: string;
  locked?: boolean;
  source?: "definition-node" | "builtin-contract-role";
  coordinateSpace?: "content-box";
  movementMode?: "flow" | "free";
  imageEditable?: boolean;
  imageHasContent?: boolean;
  imageContentEditLabel?: string;
  textEditable?: boolean;
  textEditLabel?: string;
  parentLayoutAxis?: "x" | "y";
  resizeHandles?: readonly FreePlacementResizeHandle[];
  resizeContextLabel?: string;
  contractRoleId?: string;
  kind: string;
  label: string;
  capabilities?: readonly EditableTargetCapability[];
  locator: {
    attributes: readonly EditableTargetLocatorAttribute[];
    value: string;
  };
  persistedLayoutRect?: { x: number; y: number; width: number; height: number };
  fallbackLayoutRect?: { x: number; y: number; width: number; height: number };
}

export interface OverlayPlacementGesture {
  target: OverlayTargetDescriptor;
  operation: "move" | "resize";
  direction?: FreePlacementResizeHandle;
  deltaSourceX: number;
  deltaSourceY: number;
  parentSourceWidth: number;
  parentSourceHeight: number;
  sourceRect: { x: number; y: number; width: number; height: number };
  dropTarget?: { nodeId: string; x: number; y: number };
}
export interface OverlayPropertyControl { key: string; label: string; value: number; axis: "x" | "y"; max?: number }
export interface OverlayInlineTextEditor { value: string; label?: string; onChange: (value: string) => void; onCommit: () => boolean; onCancel: () => void }

interface MeasuredOverlayTarget {
  key: string;
  target: OverlayTargetDescriptor;
  element: HTMLElement;
  sourceRect: GeometryRect;
  hostRect: GeometryRect;
  hitRect: GeometryRect;
  labelPoint: { x: number; y: number };
  labelVisible: boolean;
  transform: SourceToHostTransform;
  parentSourceWidth: number;
  parentSourceHeight: number;
  sourceRectInParent: { x: number; y: number; width: number; height: number };
}

interface OverlayGestureSession {
  pointerId: number;
  box: MeasuredOverlayTarget;
  operation: "move" | "resize";
  direction?: FreePlacementResizeHandle;
  startClientX: number;
  startClientY: number;
  captureTarget: HTMLButtonElement;
  previewRect: GeometryRect;
  activated: boolean;
  dropTarget?: OverlayPlacementGesture["dropTarget"];
  dropBoxes: readonly MeasuredOverlayTarget[];
  resizeLimits?: TemplateResizeLimits;
  sizeLimited?: boolean;
  projectionFrame?: number;
  projectedGesture?: OverlayPlacementGesture;
}

interface OverlaySnapGuides {
  vertical?: number;
  horizontal?: number;
}

const HOST_SNAP_DISTANCE = 10;

const RESIZE_HANDLES: readonly FreePlacementResizeHandle[] = [
  "nw", "n", "ne", "e", "se", "s", "sw", "w",
];

function measuredTargetsEqual(
  current: MeasuredOverlayTarget[],
  next: MeasuredOverlayTarget[],
) {
  if (current.length !== next.length) return false;
  return current.every((box, index) => {
    const candidate = next[index];
    if (!candidate || box.key !== candidate.key || box.element !== candidate.element) return false;
    return (["left", "top", "width", "height"] as const).every((axis) =>
      Math.abs(box.hostRect[axis] - candidate.hostRect[axis]) < 0.25
      && Math.abs(box.hitRect[axis] - candidate.hitRect[axis]) < 0.25,
    ) && box.labelVisible === candidate.labelVisible
      && box.target.locked === candidate.target.locked
      && box.target.parentTargetId === candidate.target.parentTargetId
      && box.target.label === candidate.target.label
      && box.parentSourceWidth === candidate.parentSourceWidth
      && box.parentSourceHeight === candidate.parentSourceHeight
      && (["x", "y", "width", "height"] as const).every((axis) =>
        box.sourceRectInParent[axis] === candidate.sourceRectInParent[axis]);
  });
}

function isVisibleTarget(element: HTMLElement) {
  if (element.getClientRects().length === 0 || element.closest('[aria-hidden="true"]')) return false;
  if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return style?.display !== "none" && style?.visibility !== "hidden" && style?.opacity !== "0";
}

function unionElementBounds(elements: readonly HTMLElement[]): GeometryRect | undefined {
  if (elements.length === 0) return undefined;
  const bounds = elements.map((element) => rectFromBounds(element.getBoundingClientRect()));
  const left = Math.min(...bounds.map((rect) => rect.left));
  const top = Math.min(...bounds.map((rect) => rect.top));
  const right = Math.max(...bounds.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...bounds.map((rect) => rect.top + rect.height));
  return { left, top, width: right - left, height: bottom - top };
}

function projectNormalizedRectToParent(
  rect: { x: number; y: number; width: number; height: number },
  parent: GeometryRect,
): GeometryRect {
  return {
    left: parent.left + rect.x * parent.width,
    top: parent.top + rect.y * parent.height,
    width: rect.width * parent.width,
    height: rect.height * parent.height,
  };
}

function findOwnerNodeElement(root: HTMLElement, ownerNodeId: string) {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-template-node-id]"))
    .find((element) => element.dataset.templateNodeId === ownerNodeId);
}

function findContractFrameElement(element: HTMLElement, contractRoot: HTMLElement) {
  if (element.parentElement === contractRoot) return contractRoot;
  let frameElement = element;
  while (frameElement.parentElement && frameElement.parentElement !== contractRoot) {
    frameElement = frameElement.parentElement;
  }
  return frameElement.parentElement === contractRoot ? frameElement : contractRoot;
}

function handlePosition(direction: FreePlacementResizeHandle) {
  const horizontal = direction.includes("w") ? "0%" : direction.includes("e") ? "100%" : "50%";
  const vertical = direction.includes("n") ? "0%" : direction.includes("s") ? "100%" : "50%";
  return { left: horizontal, top: vertical };
}

function placeSelectionToolbar(
  rect: GeometryRect,
  hostWidth: number,
): CSSProperties {
  const toolbarWidth = Math.min(460, Math.max(280, hostWidth - 24));
  const hostLeft = clampGeometryValue(
    rect.left,
    12,
    Math.max(12, hostWidth - toolbarWidth - 12),
  );
  return {
    left: hostLeft - rect.left,
    top: rect.top >= 48 ? -42 : rect.height + 8,
    maxWidth: toolbarWidth,
  };
}

function nearestGuide(value: number, guides: readonly number[]) {
  return guides.reduce<{ distance: number; guide?: number }>((nearest, guide) => {
    const distance = Math.abs(value - guide);
    return distance <= HOST_SNAP_DISTANCE && distance < nearest.distance
      ? { distance, guide }
      : nearest;
  }, { distance: Number.POSITIVE_INFINITY });
}

function snapHostGestureRect({
  start,
  raw,
  operation,
  direction,
  hostWidth,
  hostHeight,
  xGuides,
  yGuides,
  minimumWidth = 2,
  minimumHeight = 2,
}: {
  start: GeometryRect;
  raw: GeometryRect;
  operation: OverlayGestureSession["operation"];
  direction?: FreePlacementResizeHandle;
  hostWidth: number;
  hostHeight: number;
  xGuides: readonly number[];
  yGuides: readonly number[];
  minimumWidth?: number;
  minimumHeight?: number;
}) {
  let left = raw.left;
  let top = raw.top;
  let right = raw.left + raw.width;
  let bottom = raw.top + raw.height;
  const activeGuides: OverlaySnapGuides = {};

  if (operation === "move") {
    left = clampGeometryValue(left, 0, Math.max(0, hostWidth - start.width));
    top = clampGeometryValue(top, 0, Math.max(0, hostHeight - start.height));
    right = left + start.width;
    bottom = top + start.height;
    const xSnap = [left, left + start.width / 2, right]
      .map((edge) => ({ edge, ...nearestGuide(edge, xGuides) }))
      .reduce((nearest, candidate) => candidate.distance < nearest.distance ? candidate : nearest);
    if (xSnap.guide !== undefined) {
      left = clampGeometryValue(left + xSnap.guide - xSnap.edge, 0, Math.max(0, hostWidth - start.width));
      right = left + start.width;
      activeGuides.vertical = xSnap.guide;
    }
    const ySnap = [top, top + start.height / 2, bottom]
      .map((edge) => ({ edge, ...nearestGuide(edge, yGuides) }))
      .reduce((nearest, candidate) => candidate.distance < nearest.distance ? candidate : nearest);
    if (ySnap.guide !== undefined) {
      top = clampGeometryValue(top + ySnap.guide - ySnap.edge, 0, Math.max(0, hostHeight - start.height));
      bottom = top + start.height;
      activeGuides.horizontal = ySnap.guide;
    }
  } else {
    if (direction?.includes("w")) {
      left = clampGeometryValue(left, 0, right - minimumWidth);
      const match = nearestGuide(left, xGuides);
      if (match.guide !== undefined) {
        left = clampGeometryValue(match.guide, 0, right - minimumWidth);
        activeGuides.vertical = match.guide;
      }
    }
    if (direction?.includes("e")) {
      right = clampGeometryValue(right, left + minimumWidth, hostWidth);
      const match = nearestGuide(right, xGuides);
      if (match.guide !== undefined) {
        right = clampGeometryValue(match.guide, left + minimumWidth, hostWidth);
        activeGuides.vertical = match.guide;
      }
    }
    if (direction?.includes("n")) {
      top = clampGeometryValue(top, 0, bottom - minimumHeight);
      const match = nearestGuide(top, yGuides);
      if (match.guide !== undefined) {
        top = clampGeometryValue(match.guide, 0, bottom - minimumHeight);
        activeGuides.horizontal = match.guide;
      }
    }
    if (direction?.includes("s")) {
      bottom = clampGeometryValue(bottom, top + minimumHeight, hostHeight);
      const match = nearestGuide(bottom, yGuides);
      if (match.guide !== undefined) {
        bottom = clampGeometryValue(match.guide, top + minimumHeight, hostHeight);
        activeGuides.horizontal = match.guide;
      }
    }
  }

  return {
    rect: { left, top, width: right - left, height: bottom - top },
    guides: activeGuides,
  };
}

function gestureDeltaFromPreview(session: OverlayGestureSession) {
  const start = session.box.hostRect;
  const preview = session.previewRect;
  if (session.operation === "move") {
    return { x: preview.left - start.left, y: preview.top - start.top };
  }
  return {
    x: session.direction?.includes("w")
      ? preview.left - start.left
      : session.direction?.includes("e")
        ? preview.left + preview.width - start.left - start.width
        : 0,
    y: session.direction?.includes("n")
      ? preview.top - start.top
      : session.direction?.includes("s")
        ? preview.top + preview.height - start.top - start.height
        : 0,
  };
}

export default function EditableTargetOverlay({
  sourceFrame,
  sourceRoot,
  hostRoot,
  targets,
  surface,
  selectedTargetId,
  annotations = false,
  interactive = false,
  snapEnabled = true,
  movableTargetIds,
  resizeTargetIds,
  onSelectTarget,
  onPlacementGesture,
  onPlacementGestureBegin,
  onPlacementGesturePreview,
  onPlacementGestureCancel,
  editingScopeId,
  onEnterTarget,
  onSelectTargets,
  onSelectBackground,
  propertyControls,
  spacingEditing = false,
  onSpacingEditingChange,
  onPropertyPreview,
  onPropertyCommit,
  flowDropLabel,
  inlineTextEditor,
  onMeasurementChange,
}: {
  sourceFrame: HTMLIFrameElement | null;
  sourceRoot: HTMLElement | null;
  hostRoot: HTMLElement | null;
  targets: readonly OverlayTargetDescriptor[];
  surface: "template-definition" | "catalog";
  selectedTargetId?: string | null;
  annotations?: boolean;
  interactive?: boolean;
  snapEnabled?: boolean;
  movableTargetIds?: ReadonlySet<string>;
  resizeTargetIds?: ReadonlySet<string>;
  onSelectTarget?: (
    target: OverlayTargetDescriptor,
    modifiers?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
  ) => void;
  onPlacementGesture?: (gesture: OverlayPlacementGesture) => void;
  onPlacementGestureBegin?: () => void;
  onPlacementGesturePreview?: (gesture: OverlayPlacementGesture) => void;
  onPlacementGestureCancel?: () => void;
  editingScopeId?: string | null;
  onEnterTarget?: (target: OverlayTargetDescriptor) => void;
  onSelectTargets?: (targets: readonly OverlayTargetDescriptor[], additive: boolean) => void;
  onSelectBackground?: () => void;
  propertyControls?: readonly OverlayPropertyControl[];
  spacingEditing?: boolean;
  onSpacingEditingChange?: (editing: boolean) => void;
  onPropertyPreview?: (key: string, value: number) => void;
  onPropertyCommit?: (key: string, value: number) => void;
  flowDropLabel?: string | null;
  inlineTextEditor?: OverlayInlineTextEditor | null;
  onMeasurementChange?: (count: number) => void;
}) {
  const selectionSnapshot = useTemplateEditorSession((state) => state.selectionSnapshot);
  const [boxes, setBoxes] = useState<MeasuredOverlayTarget[]>([]);
  const [gesturePreview, setGesturePreview] = useState<GeometryRect | null>(null);
  const [snapGuides, setSnapGuides] = useState<OverlaySnapGuides>({});
  const gestureRef = useRef<OverlayGestureSession | null>(null);
  const previewCallbacks = useRef({ onPlacementGestureBegin, onPlacementGesturePreview, onPlacementGestureCancel });
  previewCallbacks.current = { onPlacementGestureBegin, onPlacementGesturePreview, onPlacementGestureCancel };
  const suppressClickRef = useRef(false);
  const marqueeRef = useRef<{ pointerId: number; start: { x: number; y: number }; end: { x: number; y: number }; additive: boolean } | null>(null);
  const [marquee, setMarquee] = useState<GeometryRect | null>(null);
  const [overlapPoint, setOverlapPoint] = useState<{ x: number; y: number } | null>(null);
  const [imageEditing, setImageEditing] = useState(false);
  const breakpoint = useTemplateEditorSession((state) => state.breakpoint);
  const overlapTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => { setOverlapPoint(null); setImageEditing(false); }, [selectedTargetId, editingScopeId, breakpoint, interactive]);
  const targetSignature = useMemo(() => targets.map((target) => [
    target.targetId,
    target.locator.value,
    target.locator.attributes.join(","),
    target.capabilities?.join(",") ?? "",
    target.locked ? "locked" : "unlocked",
    target.parentTargetId ?? "",
  ].join(":" )).join("|"), [targets]);

  const cancelActiveGesture = useCallback((cancelPreview = true) => {
    const gesture = gestureRef.current;
    // 先清理 ref，释放 capture 所触发的 lostpointercapture 不得重复结束事务。
    gestureRef.current = null;
    if (gesture?.projectionFrame !== undefined) gesture.captureTarget.ownerDocument.defaultView?.cancelAnimationFrame(gesture.projectionFrame);
    if (gesture?.captureTarget.isConnected) {
      try {
        if (gesture.captureTarget.hasPointerCapture(gesture.pointerId)) {
          gesture.captureTarget.releasePointerCapture(gesture.pointerId);
        }
      } catch {
        // 控件在工作区切换时可能先于清理卸载；此时浏览器已自行释放 capture。
      }
    }
    if (cancelPreview && gesture?.activated) previewCallbacks.current.onPlacementGestureCancel?.();
    marqueeRef.current = null;
    setMarquee(null);
    setGesturePreview(null);
    setSnapGuides({});
  }, []);

  useEffect(() => {
    const hostWindow = hostRoot?.ownerDocument.defaultView;
    if (!hostWindow) return undefined;
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || (!gestureRef.current && !marqueeRef.current)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      cancelActiveGesture();
    };
    hostWindow.addEventListener("keydown", handleEscape, true);
    const cancelOnBlur = () => cancelActiveGesture();
    hostWindow.addEventListener("blur", cancelOnBlur);
    return () => { hostWindow.removeEventListener("keydown", handleEscape, true); hostWindow.removeEventListener("blur", cancelOnBlur); };
  }, [cancelActiveGesture, hostRoot]);

  useEffect(() => () => cancelActiveGesture(), [
    cancelActiveGesture,
    hostRoot,
    selectedTargetId,
    sourceFrame,
    sourceRoot,
  ]);
  useEffect(() => {
    // 合法关系预览会改变临时父级及遍历顺序；只在已提交上下文变化时终止手势。
    if (gestureRef.current && !useTemplateEditorSession.getState().activeInteraction) cancelActiveGesture();
  }, [targetSignature, cancelActiveGesture]);

  useLayoutEffect(() => {
    if (!sourceFrame || !sourceRoot || !hostRoot || !sourceRoot.isConnected) {
      setBoxes([]);
      onMeasurementChange?.(0);
      return undefined;
    }
    const sourceWindow = sourceRoot.ownerDocument.defaultView;
    const hostWindow = hostRoot.ownerDocument.defaultView;
    if (!sourceWindow || !hostWindow) return undefined;
    const requestHostFrame = hostWindow.requestAnimationFrame.bind(hostWindow);
    const cancelHostFrame = hostWindow.cancelAnimationFrame.bind(hostWindow);
    const coarsePointer = hostWindow.matchMedia("(pointer: coarse)");
    let frameId: number | null = null;
    let cancelled = false;
    const observedSourceElements = new Set<Element>();

    const sourceResizeObserver = new sourceWindow.ResizeObserver(() => scheduleMeasure());
    const hostResizeObserver = new hostWindow.ResizeObserver(() => scheduleMeasure());

    const syncObservedTargets = (elements: readonly Element[]) => {
      const next = new Set(elements);
      observedSourceElements.forEach((element) => {
        if (next.has(element)) return;
        sourceResizeObserver.unobserve(element);
        observedSourceElements.delete(element);
      });
      next.forEach((element) => {
        if (observedSourceElements.has(element)) return;
        observedSourceElements.add(element);
        sourceResizeObserver.observe(element);
      });
    };

    const measure = () => {
      if (cancelled || !sourceRoot.isConnected || !hostRoot.isConnected) return;
      const sourceRootRect = rectFromBounds(sourceRoot.getBoundingClientRect());
      const sourceFrameRect = rectFromBounds(sourceFrame.getBoundingClientRect());
      const hostRect = rectFromBounds(hostRoot.getBoundingClientRect());
      const transform = createSourceToHostTransform({
        sourceRootRect,
        sourceFrameRect,
        sourceFrameViewport: {
          // DOMRect 是 transform 后的 border-box；用 offset 尺寸反推缩放，
          // 避免 clientWidth/clientHeight 的滚动条或边框差异把 pointer delta
          // 在提交时压缩约 1px，造成宿主预览与 Renderer 稳定态错位。
          width: sourceFrame.offsetWidth || sourceRoot.ownerDocument.documentElement.clientWidth,
          height: sourceFrame.offsetHeight || sourceRoot.ownerDocument.documentElement.clientHeight,
        },
        // 绝对定位子元素以 padding box 为包含块；DOMRect 则从 border box
        // 起算。扣除 client border，宿主选区才能与 iframe 内真实角色同点。
        hostRect: {
          ...hostRect,
          left: hostRect.left + hostRoot.clientLeft,
          top: hostRect.top + hostRoot.clientTop,
        },
      });
      const hostWidth = hostRoot.clientWidth;
      const hostHeight = hostRoot.clientHeight;
      const measuredElements: HTMLElement[] = [];
      const measured = targets.flatMap((target): MeasuredOverlayTarget[] => {
        const locatedElements = findElementsByEditableTargetLocator(sourceRoot, target.locator)
          .filter(isVisibleTarget);
        if (target.source === "builtin-contract-role") {
          const roleLocator = {
            ...target.locator,
            attributes: target.locator.attributes.filter((attribute) => attribute !== "data-editor-field"),
          };
          const roleElements = findElementsByEditableTargetLocator(sourceRoot, roleLocator)
            .filter(isVisibleTarget);
          const ownerElement = findOwnerNodeElement(sourceRoot, target.ownerNodeId);
          const anchor = roleElements[0] ?? locatedElements[0] ?? ownerElement;
          const contractRoot = roleElements[0]?.closest<HTMLElement>("[data-content-template-contract]")
            ?? locatedElements[0]?.closest<HTMLElement>("[data-content-template-contract]")
            ?? ownerElement?.querySelector<HTMLElement>("[data-content-template-contract]")
            ?? ownerElement;
          if (!anchor || !contractRoot) return [];
          const contractFrame = findContractFrameElement(anchor, contractRoot);
          const parentRect = rectFromBounds(contractFrame.getBoundingClientRect());
          const targetRect = target.persistedLayoutRect
            ? projectNormalizedRectToParent(target.persistedLayoutRect, parentRect)
            : unionElementBounds(roleElements)
              ?? (target.fallbackLayoutRect
                ? projectNormalizedRectToParent(target.fallbackLayoutRect, parentRect)
                : undefined);
          if (!targetRect || targetRect.width <= 0 || targetRect.height <= 0) return [];
          measuredElements.push(anchor, contractFrame, ...roleElements);
          const sourceRect = sourceRectRelativeToRoot(targetRect, sourceRootRect);
          const hostTargetRect = clampHostRect(
            projectSourceRectToHost(sourceRect, transform),
            hostWidth,
            hostHeight,
          );
          if (hostTargetRect.width <= 0 || hostTargetRect.height <= 0) return [];
          return [{
            key: target.targetId,
            target,
            element: anchor,
            sourceRect,
            hostRect: hostTargetRect,
            hitRect: expandHostHitRect(
              hostTargetRect,
              hostWidth,
              hostHeight,
              getEditorHitSize(coarsePointer.matches),
            ),
            labelPoint: placeHostLabel(hostTargetRect, hostWidth, hostHeight),
            labelVisible: true,
            transform,
            parentSourceWidth: Math.max(1, parentRect.width),
            parentSourceHeight: Math.max(1, parentRect.height),
            sourceRectInParent: sourceRectRelativeToParentNormalized(targetRect, parentRect),
          }];
        }
        return locatedElements.flatMap((element, occurrence) => {
            if (!isVisibleTarget(element)) return [];
            const targetRect = rectFromBounds(element.getBoundingClientRect());
            if (targetRect.width <= 0 || targetRect.height <= 0) return [];
            measuredElements.push(element);
            const sourceRect = sourceRectRelativeToRoot(targetRect, sourceRootRect);
            const projected = projectSourceRectToHost(sourceRect, transform);
            const hostTargetRect = clampHostRect(projected, hostWidth, hostHeight);
            if (hostTargetRect.width <= 0 || hostTargetRect.height <= 0) return [];
            const parentElement = (target.source === "builtin-contract-role"
              ? element.closest<HTMLElement>("[data-content-template-contract]")
              : element.parentElement);
            const parentDomRect = parentElement?.getBoundingClientRect();
            const parentRect = parentDomRect
              ? rectFromBounds(parentDomRect)
              : targetRect;
            if (parentElement && parentDomRect && target.source === "definition-node" && target.coordinateSpace === "content-box") {
              const style = parentElement.ownerDocument.defaultView!.getComputedStyle(parentElement);
              const left = parseFloat(style.paddingLeft) || 0;
              const right = parseFloat(style.paddingRight) || 0;
              const top = parseFloat(style.paddingTop) || 0;
              const bottom = parseFloat(style.paddingBottom) || 0;
              const scaleX = parentDomRect.width / (parentElement.offsetWidth || parentDomRect.width);
              const scaleY = parentDomRect.height / (parentElement.offsetHeight || parentDomRect.height);
              parentRect.left += (parentElement.clientLeft + left) * scaleX;
              parentRect.top += (parentElement.clientTop + top) * scaleY;
              parentRect.width = Math.max(1, (parentElement.clientWidth - left - right) * scaleX);
              parentRect.height = Math.max(1, (parentElement.clientHeight - top - bottom) * scaleY);
            }
            return [{
              key: `${target.targetId}:${occurrence}`,
              target,
              element,
              sourceRect,
              hostRect: hostTargetRect,
              hitRect: expandHostHitRect(
                hostTargetRect,
                hostWidth,
                hostHeight,
                getEditorHitSize(coarsePointer.matches),
              ),
              labelPoint: placeHostLabel(hostTargetRect, hostWidth, hostHeight),
              labelVisible: true,
              transform,
              parentSourceWidth: Math.max(1, parentRect?.width ?? targetRect.width),
              parentSourceHeight: Math.max(1, parentRect?.height ?? targetRect.height),
              sourceRectInParent: sourceRectRelativeToParentNormalized(targetRect, parentRect),
            }];
          });
      });
      const occupiedLabelRects: GeometryRect[] = [];
      const next = measured.map((box) => {
        const labelRect = {
          left: box.labelPoint.x,
          top: box.labelPoint.y,
          width: clampGeometryValue(box.target.label.length * 12 + 16, 32, 220),
          height: 24,
        };
        const overlaps = occupiedLabelRects.some((occupied) =>
          labelRect.left < occupied.left + occupied.width
          && labelRect.left + labelRect.width > occupied.left
          && labelRect.top < occupied.top + occupied.height
          && labelRect.top + labelRect.height > occupied.top,
        );
        if (!overlaps) occupiedLabelRects.push(labelRect);
        return { ...box, labelVisible: !overlaps };
      });
      syncObservedTargets([sourceRoot, ...measuredElements]);
      setBoxes((current) => measuredTargetsEqual(current, next) ? current : next);
      onMeasurementChange?.(next.length);
    };

    function scheduleMeasure() {
      if (frameId !== null || cancelled) return;
      frameId = requestHostFrame(() => {
        frameId = null;
        measure();
      });
    }

    const attributeFilter = Array.from(new Set([
      ...targets.flatMap((target) => target.locator.attributes),
      "class",
      "style",
      "hidden",
      "aria-hidden",
    ]));
    const mutationObserver = new sourceWindow.MutationObserver(scheduleMeasure);
    mutationObserver.observe(sourceRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter,
    });
    sourceResizeObserver.observe(sourceRoot);
    observedSourceElements.add(sourceRoot);
    hostResizeObserver.observe(hostRoot);
    hostResizeObserver.observe(sourceFrame);
    sourceWindow.addEventListener("resize", scheduleMeasure);
    sourceWindow.addEventListener("scroll", scheduleMeasure, true);
    hostWindow.addEventListener("resize", scheduleMeasure);
    hostWindow.addEventListener("scroll", scheduleMeasure, true);
    coarsePointer.addEventListener("change", scheduleMeasure);
    scheduleMeasure();

    return () => {
      cancelled = true;
      mutationObserver.disconnect();
      sourceResizeObserver.disconnect();
      hostResizeObserver.disconnect();
      sourceWindow.removeEventListener("resize", scheduleMeasure);
      sourceWindow.removeEventListener("scroll", scheduleMeasure, true);
      hostWindow.removeEventListener("resize", scheduleMeasure);
      hostWindow.removeEventListener("scroll", scheduleMeasure, true);
      coarsePointer.removeEventListener("change", scheduleMeasure);
      if (frameId !== null) cancelHostFrame(frameId);
    };
  }, [hostRoot, onMeasurementChange, sourceFrame, sourceRoot, targetSignature, targets]);

  const selectedBox = boxes.find((box) => box.target.targetId === selectedTargetId) ?? null;
  const hitBoxes = boxes.filter((box) => isCanvasTargetInScope(box.target, editingScopeId));
  // 缩放时只描绘真正渲染结果，不能用自由坐标框冒充流式布局、比例或约束后的尺寸。
  const renderedSelectionRect = gestureRef.current?.operation === "resize"
    ? selectedBox?.hostRect : gesturePreview ?? selectedBox?.hostRect;
  const getSelectionTarget = (target: OverlayTargetDescriptor): TemplateEditorSelectionTarget => (
    target.source === "builtin-contract-role" && target.contractRoleId
      ? { targetId: target.ownerNodeId, roleId: target.contractRoleId }
      : { targetId: target.ownerNodeId }
  );
  const isBoxSelected = (box: MeasuredOverlayTarget) => surface === "template-definition"
    ? selectionSnapshot.targets.some((candidate) => (
        isSameTemplateEditorSelectionTarget(candidate, getSelectionTarget(box.target))
      ))
    : box.target.targetId === selectedTargetId;
  const selectionToolbarStyle = renderedSelectionRect
    ? placeSelectionToolbar(renderedSelectionRect, hostRoot?.clientWidth ?? 0)
    : undefined;

  const beginGesture = (
    event: PointerEvent<HTMLButtonElement>,
    box: MeasuredOverlayTarget,
    operation: OverlayGestureSession["operation"],
    direction?: FreePlacementResizeHandle,
  ) => {
    if (event.button !== 0 || !onPlacementGesture) return;
    event.preventDefault();
    event.stopPropagation();
    gestureRef.current = {
      pointerId: event.pointerId,
      box,
      operation,
      direction,
      startClientX: event.clientX,
      startClientY: event.clientY,
      captureTarget: event.currentTarget,
      previewRect: box.hostRect,
      activated: false,
      dropBoxes: boxes,
      resizeLimits: operation === "resize" && box.target.source === "definition-node"
        ? readTemplateResizeLimits(box.element) : undefined,
    };
    setSnapGuides({});
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const reconcileRenderedResize = (gesture: OverlayGestureSession) => {
    const requested = gesture.projectedGesture;
    if (!requested || !gesture.box.element.isConnected || gestureRef.current !== gesture) return;
    const actual = gesture.box.element.getBoundingClientRect();
    const width = gesture.box.sourceRectInParent.width * gesture.box.parentSourceWidth;
    const height = gesture.box.sourceRectInParent.height * gesture.box.parentSourceHeight;
    const deltaSourceX = gesture.direction?.match(/[ew]/) ? (actual.width - width) * (gesture.direction.includes("w") ? -1 : 1) : 0;
    const deltaSourceY = gesture.direction?.match(/[ns]/) ? (actual.height - height) * (gesture.direction.includes("n") ? -1 : 1) : 0;
    if (Math.abs(deltaSourceX - requested.deltaSourceX) < .02 && Math.abs(deltaSourceY - requested.deltaSourceY) < .02) return;
    // 每次输入只协调一次；DOM/ResizeObserver 的测量不会再排这个任务，避免预览反馈循环。
    gesture.sizeLimited = true;
    gesture.projectedGesture = { ...requested, deltaSourceX, deltaSourceY };
    setSnapGuides({});
    setGesturePreview((current) => current ? { ...current } : current);
    previewCallbacks.current.onPlacementGesturePreview?.(gesture.projectedGesture);
  };

  const scheduleResizeReconciliation = (gesture: OverlayGestureSession, commit = false) => {
    const ownerWindow = gesture.captureTarget.ownerDocument.defaultView;
    if (!ownerWindow) return;
    if (gesture.projectionFrame !== undefined) ownerWindow.cancelAnimationFrame(gesture.projectionFrame);
    gesture.projectionFrame = ownerWindow.requestAnimationFrame(() => {
      gesture.projectionFrame = undefined;
      if (gestureRef.current !== gesture) return;
      if (!gesture.box.element.isConnected) { cancelActiveGesture(); return; }
      reconcileRenderedResize(gesture);
      if (commit && gesture.projectedGesture) {
        const projected = gesture.projectedGesture;
        cancelActiveGesture(false);
        onPlacementGesture?.(projected);
      }
    });
  };

  const updateGesture = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (!gesture.activated) {
      if (!crossesCanvasDragThreshold(event.clientX - gesture.startClientX, event.clientY - gesture.startClientY)) return;
      gesture.activated = true;
      suppressClickRef.current = true;
      previewCallbacks.current.onPlacementGestureBegin?.();
    }
    const raw = applyHostRectGesture({
      rect: gesture.box.hostRect,
      operation: gesture.operation,
      direction: gesture.direction,
      deltaX: event.clientX - gesture.startClientX,
      deltaY: event.clientY - gesture.startClientY,
      minimumSize: gesture.resizeLimits ? Math.min(gesture.box.transform.scaleX, gesture.box.transform.scaleY) : undefined,
    });
    const canSnap = snapEnabled && !event.altKey;
    const otherBoxes = canSnap
      ? boxes.filter((box) => box.target.targetId !== gesture.box.target.targetId)
      : [];
    const snapped = snapHostGestureRect({
      start: gesture.box.hostRect,
      raw,
      operation: gesture.operation,
      direction: gesture.direction,
      hostWidth: hostRoot?.clientWidth ?? 0,
      hostHeight: hostRoot?.clientHeight ?? 0,
      minimumWidth: gesture.resizeLimits ? gesture.box.transform.scaleX : undefined,
      minimumHeight: gesture.resizeLimits ? gesture.box.transform.scaleY : undefined,
      xGuides: canSnap ? [
        0,
        (hostRoot?.clientWidth ?? 0) / 2,
        hostRoot?.clientWidth ?? 0,
        ...otherBoxes.flatMap((box) => [
          box.hostRect.left,
          box.hostRect.left + box.hostRect.width / 2,
          box.hostRect.left + box.hostRect.width,
        ]),
      ] : [],
      yGuides: canSnap ? [
        0,
        (hostRoot?.clientHeight ?? 0) / 2,
        hostRoot?.clientHeight ?? 0,
        ...otherBoxes.flatMap((box) => [
          box.hostRect.top,
          box.hostRect.top + box.hostRect.height / 2,
          box.hostRect.top + box.hostRect.height,
        ]),
      ] : [],
    });
    gesture.previewRect = snapped.rect;
    const bounds = hostRoot?.getBoundingClientRect();
    const cursor = bounds ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top } : null;
    const landing = cursor ? gesture.dropBoxes.filter((box) => box.target.source === "definition-node" && box.target.targetId !== gesture.box.target.targetId
      && cursor.x >= box.hostRect.left && cursor.x <= box.hostRect.left + box.hostRect.width
      && cursor.y >= box.hostRect.top && cursor.y <= box.hostRect.top + box.hostRect.height)
      .sort((a, b) => a.hostRect.width * a.hostRect.height - b.hostRect.width * b.hostRect.height)[0] : undefined;
    gesture.dropTarget = landing && cursor ? { nodeId: landing.target.ownerNodeId,
      x: (cursor.x - landing.hostRect.left) / landing.hostRect.width, y: (cursor.y - landing.hostRect.top) / landing.hostRect.height } : undefined;
    setGesturePreview(snapped.rect);
    setSnapGuides(snapped.guides);
    let sourceDelta = hostDeltaToSource(gestureDeltaFromPreview(gesture), gesture.box.transform);
    if (gesture.resizeLimits) {
      const constrained = constrainTemplateResizeDelta(gesture.box.sourceRectInParent.width * gesture.box.parentSourceWidth,
        gesture.box.sourceRectInParent.height * gesture.box.parentSourceHeight, sourceDelta.x, sourceDelta.y, gesture.direction, gesture.resizeLimits);
      gesture.sizeLimited = constrained.limited;
      if (constrained.limited) setSnapGuides({});
      sourceDelta = constrained;
    }
    const projected: OverlayPlacementGesture = {
      target: gesture.box.target, operation: gesture.operation, direction: gesture.direction,
      deltaSourceX: sourceDelta.x, deltaSourceY: sourceDelta.y,
      parentSourceWidth: gesture.box.parentSourceWidth, parentSourceHeight: gesture.box.parentSourceHeight,
      sourceRect: gesture.box.sourceRectInParent,
      dropTarget: gesture.dropTarget,
    };
    gesture.projectedGesture = projected;
    previewCallbacks.current.onPlacementGesturePreview?.(projected);
    if (gesture.resizeLimits) scheduleResizeReconciliation(gesture);
  };

  const finishGesture = (event: PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (commit && gesture.activated && gesture.resizeLimits) reconcileRenderedResize(gesture);
    const hostDelta = gestureDeltaFromPreview(gesture);
    cancelActiveGesture(!commit);
    if (!commit || !gesture.activated) return;
    if (Math.abs(hostDelta.x) < 0.01 && Math.abs(hostDelta.y) < 0.01) {
      previewCallbacks.current.onPlacementGestureCancel?.();
      return;
    }
    const sourceDelta = hostDeltaToSource(
      hostDelta,
      gesture.box.transform,
    );
    onPlacementGesture?.({
      target: gesture.box.target,
      operation: gesture.operation,
      direction: gesture.direction,
      deltaSourceX: sourceDelta.x,
      deltaSourceY: sourceDelta.y,
      parentSourceWidth: gesture.box.parentSourceWidth,
      parentSourceHeight: gesture.box.parentSourceHeight,
      sourceRect: gesture.box.sourceRectInParent,
      dropTarget: gesture.dropTarget,
    });
  };

  const commitKeyboardGesture = (
    event: KeyboardEvent<HTMLButtonElement>,
    box: MeasuredOverlayTarget,
    operation: OverlayGestureSession["operation"],
    direction?: FreePlacementResizeHandle,
  ) => {
    const axisDelta = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    }[event.key];
    if (!axisDelta || !onPlacementGesture) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 10 : 1;
    const delta = operation === "resize" && box.target.source === "definition-node"
      ? constrainTemplateResizeDelta(box.sourceRectInParent.width * box.parentSourceWidth, box.sourceRectInParent.height * box.parentSourceHeight,
        axisDelta.x * step, axisDelta.y * step, direction, readTemplateResizeLimits(box.element))
      : { x: axisDelta.x * step, y: axisDelta.y * step };
    const projected: OverlayPlacementGesture = {
      target: box.target,
      operation,
      direction,
      deltaSourceX: delta.x,
      deltaSourceY: delta.y,
      parentSourceWidth: box.parentSourceWidth,
      parentSourceHeight: box.parentSourceHeight,
      sourceRect: box.sourceRectInParent,
    };
    if (operation === "resize" && box.target.source === "definition-node" && previewCallbacks.current.onPlacementGesturePreview && previewCallbacks.current.onPlacementGestureBegin) {
      if (!delta.x && !delta.y) return;
      if (gestureRef.current) {
        const previous = gestureRef.current;
        reconcileRenderedResize(previous);
        const previousProjection = previous.projectedGesture;
        cancelActiveGesture(false);
        if (previousProjection) onPlacementGesture(previousProjection);
      }
      const gesture: OverlayGestureSession = { pointerId: -1, box, operation, direction,
        startClientX: 0, startClientY: 0, captureTarget: event.currentTarget,
        previewRect: box.hostRect, activated: true, dropBoxes: boxes,
        resizeLimits: readTemplateResizeLimits(box.element), projectedGesture: projected };
      gestureRef.current = gesture;
      setGesturePreview(box.hostRect);
      previewCallbacks.current.onPlacementGestureBegin();
      previewCallbacks.current.onPlacementGesturePreview(projected);
      scheduleResizeReconciliation(gesture, true);
    } else onPlacementGesture(projected);
  };

  return (
    <div
      className={`template-editor__editable-overlay is-${surface}${interactive ? " is-interactive" : " is-read-only"}`}
      data-template-editor-overlay-root={surface}
      data-overlay-box-count={boxes.length}
      data-overlay-gesture-active={gesturePreview ? "true" : undefined}
      data-overlay-editing-scope={editingScopeId ?? undefined}
      aria-hidden={interactive ? undefined : "true"}
    >
      {interactive && onSelectTargets ? <button
        type="button"
        className="template-editor__marquee-surface"
        aria-label="画布空白区域，拖动框选当前层对象"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const bounds = hostRoot?.getBoundingClientRect();
          if (!bounds) return;
          event.preventDefault();
          const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
          marqueeRef.current = { pointerId: event.pointerId, start: point, end: point, additive: event.shiftKey || event.ctrlKey || event.metaKey };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = marqueeRef.current;
          const bounds = hostRoot?.getBoundingClientRect();
          if (!current || !bounds || current.pointerId !== event.pointerId) return;
          current.end = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
          if (crossesCanvasDragThreshold(current.end.x - current.start.x, current.end.y - current.start.y)) {
            setMarquee(canvasMarqueeRect(current.start, current.end));
          }
        }}
        onPointerUp={(event) => {
          const current = marqueeRef.current;
          if (!current || current.pointerId !== event.pointerId) return;
          marqueeRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          if (crossesCanvasDragThreshold(current.end.x - current.start.x, current.end.y - current.start.y)) {
            const rect = canvasMarqueeRect(current.start, current.end);
            onSelectTargets(hitBoxes.filter((box) => canvasRectIntersects(rect, box.hostRect)).map((box) => box.target), current.additive);
          } else onSelectBackground?.();
          setMarquee(null);
        }}
        onPointerCancel={() => cancelActiveGesture()}
      /> : null}
      {marquee ? <span className="template-editor__marquee" data-overlay-marquee="true" style={marquee} aria-hidden="true" /> : null}
      {gesturePreview && flowDropLabel ? <span className="template-editor__drop-feedback" role="status" style={{ left: gesturePreview.left, top: gesturePreview.top + gesturePreview.height }}>{flowDropLabel}</span> : null}
      {gesturePreview && flowDropLabel && /^(重排|跨容器移动)：/.test(flowDropLabel) ? (() => {
        const current = gestureRef.current;
        const target = current?.dropBoxes.find((box) => box.target.ownerNodeId === current.dropTarget?.nodeId);
        if (!target || !current?.dropTarget) return null;
        const rect = target.hostRect;
        const horizontal = target.target.parentLayoutAxis === "x";
        const before = (horizontal ? current.dropTarget.x : current.dropTarget.y) < .5;
        return <span data-overlay-flow-landing style={{ position: "absolute", ...rect, outline: "2px solid var(--adm-text-secondary, #6e7477)", pointerEvents: "none" }}>
          {flowDropLabel.startsWith("重排") ? <span data-overlay-flow-insertion style={{ position: "absolute", background: "var(--adm-text, #181a1b)", ...(horizontal ? { left: before ? 0 : "100%", top: 0, width: 2, height: "100%" } : { left: 0, top: before ? 0 : "100%", width: "100%", height: 2 }) }} /> : null}
        </span>;
      })() : null}
      {snapGuides.vertical !== undefined ? (
        <span
          className="template-editor__editable-overlay-snap-guide is-vertical"
          data-overlay-snap-guide="vertical"
          aria-hidden="true"
          style={{ left: snapGuides.vertical }}
        />
      ) : null}
      {snapGuides.horizontal !== undefined ? (
        <span
          className="template-editor__editable-overlay-snap-guide is-horizontal"
          data-overlay-snap-guide="horizontal"
          aria-hidden="true"
          style={{ top: snapGuides.horizontal }}
        />
      ) : null}
      {boxes.map((box, index) => {
        const selectionTarget = getSelectionTarget(box.target);
        return <div
          key={box.key}
          className="template-editor__editable-overlay-box"
          data-editable-target-id={box.target.targetId}
          data-editable-target-kind={box.target.kind}
          data-overlay-selected={isBoxSelected(box) ? "true" : undefined}
          data-selection-target-id={selectionTarget.targetId}
          data-selection-role-id={selectionTarget.roleId}
          data-selection-primary={isSameTemplateEditorSelectionTarget(
            selectionSnapshot.primaryTarget,
            selectionTarget,
          ) ? "true" : undefined}
          data-selection-anchor={isSameTemplateEditorSelectionTarget(
            selectionSnapshot.anchorTarget,
            selectionTarget,
          ) ? "true" : undefined}
          data-overlay-parent={box.target.targetId === selectedBox?.target.parentTargetId ? "true" : undefined}
          data-overlay-locked={box.target.locked ? "true" : undefined}
          data-overlay-dragging={gesturePreview && box.target.targetId === selectedTargetId ? "true" : undefined}
          data-overlay-out-of-bounds={box.sourceRectInParent.x < -0.001 || box.sourceRectInParent.y < -0.001 || box.sourceRectInParent.x + box.sourceRectInParent.width > 1.001 || box.sourceRectInParent.y + box.sourceRectInParent.height > 1.001 ? "true" : undefined}
          data-source-left={box.sourceRect.left.toFixed(3)}
          data-source-top={box.sourceRect.top.toFixed(3)}
          data-source-width={box.sourceRect.width.toFixed(3)}
          data-source-height={box.sourceRect.height.toFixed(3)}
          data-host-scale-x={box.transform.scaleX.toFixed(6)}
          data-host-scale-y={box.transform.scaleY.toFixed(6)}
          style={{
            left: box.hostRect.left,
            top: box.hostRect.top,
            width: box.hostRect.width,
            height: box.hostRect.height,
            zIndex: 10 + index,
          }}
        />;
      })}
      {annotations ? boxes.map((box) => (
        <span
          key={`${box.key}:label`}
          className="template-editor__editable-overlay-label"
          data-overlay-label-for={box.target.targetId}
          style={{
            display: box.labelVisible ? undefined : "none",
            left: box.labelPoint.x,
            top: box.labelPoint.y,
          }}
        >
          {box.target.label}
        </span>
      )) : null}
      {interactive ? hitBoxes.map((box, index) => (
        <button
          key={`${box.key}:hit`}
          type="button"
          className="template-editor__editable-overlay-hit"
          aria-label={`选择模板目标 ${box.target.label}`}
          data-overlay-hit-for={box.target.targetId}
            data-overlay-hit-selected={isBoxSelected(box) ? "true" : undefined}
          style={{
            left: box.hitRect.left,
            top: box.hitRect.top,
            width: box.hitRect.width,
            height: box.hitRect.height,
            zIndex: 100 + index,
          }}
          onClick={(event) => {
            event.stopPropagation();
            if (suppressClickRef.current) { suppressClickRef.current = false; return; }
            if (event.detail === 2 && !event.altKey) { if (box.target.imageEditable && box.target.imageHasContent !== false) setImageEditing(true); else onEnterTarget?.(box.target); return; }
            const bounds = hostRoot?.getBoundingClientRect();
            const target = event.altKey && bounds
              ? cycleCanvasHit(hitBoxes, { x: event.clientX - bounds.left, y: event.clientY - bounds.top }, selectedTargetId)?.target ?? box.target
              : box.target;
            onSelectTarget?.(target, {
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
              shiftKey: event.shiftKey,
            });
          }}
          onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); if (!event.altKey) { if (box.target.imageEditable && box.target.imageHasContent !== false) setImageEditing(true); else onEnterTarget?.(box.target); } }}
          onContextMenu={(event) => {
            event.preventDefault(); event.stopPropagation();
            const bounds = hostRoot?.getBoundingClientRect();
            if (!bounds) return;
            overlapTrigger.current = event.currentTarget;
            setOverlapPoint({
              x: (event.clientX - bounds.left) * ((hostRoot?.clientWidth ?? bounds.width) / Math.max(bounds.width, 1)),
              y: (event.clientY - bounds.top) * ((hostRoot?.clientHeight ?? bounds.height) / Math.max(bounds.height, 1)),
            });
          }}
          onPointerDown={(event) => {
            suppressClickRef.current = false;
            if (isBoxSelected(box) && movableTargetIds?.has(box.target.targetId) && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) beginGesture(event, box, "move");
          }}
          onPointerMove={updateGesture}
          onPointerUp={(event) => finishGesture(event, true)}
          onPointerCancel={(event) => finishGesture(event, false)}
          onLostPointerCapture={(event) => finishGesture(event, false)}
        />
      )) : null}
      {interactive && overlapPoint ? <div role="dialog" aria-label="选择此处对象" style={{ pointerEvents: "auto", position: "absolute", zIndex: 3000, left: Math.max(0, Math.min(overlapPoint.x, (hostRoot?.clientWidth ?? 300) - 220)), top: overlapPoint.y, width: 220, padding: 8, background: "white", border: "1px solid #B8BEC1", borderRadius: 6 }}
        onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOverlapPoint(null); overlapTrigger.current?.focus(); } }}>
        <strong>选择此处对象</strong>
        {[...hitBoxes].reverse().filter(({ hitRect }) => overlapPoint.x >= hitRect.left && overlapPoint.x <= hitRect.left + hitRect.width && overlapPoint.y >= hitRect.top && overlapPoint.y <= hitRect.top + hitRect.height).map((box, index) => <button key={box.key} autoFocus={index === 0} type="button" style={{ display: "block", width: "100%", textAlign: "left" }} onClick={(event) => { event.stopPropagation(); onSelectTarget?.(box.target); setOverlapPoint(null); overlapTrigger.current?.focus(); }}>{box.target.label} · {box.target.kind}</button>)}
        <button type="button" onClick={() => { setOverlapPoint(null); overlapTrigger.current?.focus(); }}>取消选择</button>
      </div> : null}
      {interactive && selectedBox && renderedSelectionRect ? (
        <div
          className="template-editor__editable-overlay-selection"
          data-overlay-selection-for={selectedBox.target.targetId}
          data-spacing-editing={spacingEditing}
          data-gesture-operation={gestureRef.current?.activated ? gestureRef.current.operation : undefined}
          style={{
            left: renderedSelectionRect.left,
            top: renderedSelectionRect.top,
            width: renderedSelectionRect.width,
            height: renderedSelectionRect.height,
          }}
        >
          {inlineTextEditor ? <CanvasInlineTextEditor {...inlineTextEditor} /> : null}
          {selectedBox.target.imageEditable && selectedBox.target.imageHasContent !== false && !selectedBox.target.locked && !spacingEditing ? <CanvasImageFocusEditor key={selectedBox.target.ownerNodeId} nodeId={selectedBox.target.ownerNodeId} sourceElement={selectedBox.element} editing={imageEditing} onEditingChange={setImageEditing} /> : null}
          {!selectedBox.target.locked && !spacingEditing && !imageEditing && selectedBox.target.source === "definition-node" ? <CanvasGridDividers nodeId={selectedBox.target.ownerNodeId} sourceElement={selectedBox.element} scale={selectedBox.transform.scaleX} /> : null}
          {!imageEditing ? <div
            className="template-editor__selection-toolbar"
            data-canvas-selection-toolbar
            data-spacing-editing={spacingEditing}
            style={selectionToolbarStyle}
            role="toolbar"
            aria-label={`${selectedBox.target.label}画布操作`}
          >
            <strong title={selectedBox.target.label}>{selectedBox.target.label}</strong>
            <span className="template-editor__selection-toolbar-size">{Math.round(selectedBox.sourceRect.width)} × {Math.round(selectedBox.sourceRect.height)}</span>
            {selectedBox.target.imageEditable && !selectedBox.target.locked && !spacingEditing ? <button type="button" onClick={(event) => { event.stopPropagation(); onEnterTarget?.(selectedBox.target); }}>{selectedBox.target.imageContentEditLabel ?? "设置图片"}</button> : null}
            {selectedBox.target.textEditable && !selectedBox.target.locked && !inlineTextEditor ? <button type="button" onClick={(event) => { event.stopPropagation(); onEnterTarget?.(selectedBox.target); }}>{selectedBox.target.textEditLabel ?? "编辑试排文字"}</button> : null}
            {!spacingEditing && !selectedBox.target.locked && movableTargetIds?.has(selectedBox.target.targetId) ? (
              <button
                type="button"
                className="template-editor__editable-overlay-move"
                aria-label={`拖动移动${selectedBox.target.label}`}
                title={selectedBox.target.movementMode === "flow" ? "拖动调整顺序或移入容器；方向键微调，Esc 取消" : "拖动改变父容器内的位置；方向键微调，Esc 取消"}
                aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
                onPointerDown={(event) => beginGesture(event, selectedBox, "move")}
                onPointerMove={updateGesture}
                onPointerUp={(event) => finishGesture(event, true)}
                onPointerCancel={(event) => finishGesture(event, false)}
                onLostPointerCapture={(event) => finishGesture(event, false)}
                onKeyDown={(event) => commitKeyboardGesture(event, selectedBox, "move")}
              >
                {selectedBox.target.movementMode === "flow" ? "移动 / 排序" : "移动"}
              </button>
            ) : null}
            {!selectedBox.target.locked && propertyControls?.some((control) => control.key === "gap" || control.key.startsWith("padding.")) ? (
              <button
                type="button"
                className="template-editor__selection-toolbar-spacing"
                aria-pressed={spacingEditing}
                onClick={(event) => { event.stopPropagation(); onSpacingEditingChange?.(!spacingEditing); }}
              >{spacingEditing ? "完成间距调整" : "调整间距"}</button>
            ) : null}
            {spacingEditing ? <span className="template-editor__selection-toolbar-help">拖边线调留白 · 点数值精确输入</span> : null}
            {selectedBox.target.locked ? <span>已锁定</span> : null}
          </div> : null}
          {gesturePreview && gestureRef.current?.operation === "resize" ? <span className="template-editor__resize-feedback" data-resize-feedback role="status">
            {Math.round(gestureRef.current.box.sourceRect.width)} × {Math.round(gestureRef.current.box.sourceRect.height)} → {Math.round(selectedBox.sourceRect.width)} × {Math.round(selectedBox.sourceRect.height)} px
            {` · ${gestureRef.current.direction?.match(/[ew]/) ? "宽度→固定" : ""}${gestureRef.current.direction?.match(/[ns]/) ? " 高度→固定" : ""} · ${selectedBox.target.resizeContextLabel ?? "当前对象"}`}
            {gestureRef.current.sizeLimited ? " · 已达到尺寸限制" : ""}
          </span> : null}
          {!selectedBox.target.locked && !imageEditing && propertyControls?.length ? <div className="template-editor__property-handles">
            {propertyControls.filter((control) => spacingEditing ? control.key === "gap" || control.key.startsWith("padding.") : selectedBox.target.imageHasContent !== false && control.key.startsWith("imageFocus")).map((control) => <CanvasPropertyHandle key={`${selectedBox.target.targetId}:${breakpoint}:${control.key}`} label={control.label} value={control.value} axis={control.axis} max={control.max ?? getTemplateDesignRange(control.key, [0, 10000])[1]} unit={control.key.startsWith("imageFocus") ? "%" : "px"}
              placement={control.key} sourceElement={selectedBox.element}
              scale={control.axis === "x" ? selectedBox.transform.scaleX : selectedBox.transform.scaleY}
              onBegin={() => previewCallbacks.current.onPlacementGestureBegin?.()}
              onPreview={(value) => onPropertyPreview?.(control.key, value)}
              onCommit={(value) => onPropertyCommit?.(control.key, value)}
              onCancel={() => previewCallbacks.current.onPlacementGestureCancel?.()} />)}
          </div> : null}
          {!spacingEditing && !imageEditing && resizeTargetIds?.has(selectedBox.target.targetId) ? (selectedBox.target.resizeHandles ?? RESIZE_HANDLES).map((direction) => (
            <button
              key={direction}
              type="button"
              className="template-editor__editable-overlay-resize"
              aria-label={`调整${selectedBox.target.label}大小：${direction}`}
              title={`${direction.length === 2 ? "调整宽度和高度" : /[ew]/.test(direction) ? "调整宽度" : "调整高度"}；拖动轴将使用固定尺寸；${selectedBox.target.resizeContextLabel ?? "当前对象"}；Esc 取消`}
              aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
              data-resize-direction={direction}
              style={handlePosition(direction)}
              onPointerDown={(event) => beginGesture(event, selectedBox, "resize", direction)}
              onPointerMove={updateGesture}
              onPointerUp={(event) => finishGesture(event, true)}
              onPointerCancel={(event) => finishGesture(event, false)}
              onLostPointerCapture={(event) => finishGesture(event, false)}
              onKeyDown={(event) => commitKeyboardGesture(event, selectedBox, "resize", direction)}
            ><span className="template-editor__resize-hint" aria-hidden="true">{direction.length === 2 ? "调整宽高" : /[ew]/.test(direction) ? "调整宽度" : "调整高度"} · 转为固定尺寸</span></button>
          )) : null}
        </div>
      ) : null}
    </div>
  );
}
