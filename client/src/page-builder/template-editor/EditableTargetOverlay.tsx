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

export interface OverlayTargetDescriptor {
  targetId: string;
  ownerNodeId: string;
  parentTargetId?: string;
  locked?: boolean;
  source?: "definition-node" | "builtin-contract-role";
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

export type OverlayNodeAction =
  | "duplicate"
  | "hide"
  | "delete"
  | "forward"
  | "backward"
  | "align-horizontal"
  | "align-vertical"
  | "copy-responsive";

export interface OverlayPlacementGesture {
  target: OverlayTargetDescriptor;
  operation: "move" | "resize";
  direction?: FreePlacementResizeHandle;
  deltaSourceX: number;
  deltaSourceY: number;
  parentSourceWidth: number;
  parentSourceHeight: number;
  sourceRect: { x: number; y: number; width: number; height: number };
}

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

function placeMoveControl(
  rect: GeometryRect,
  hostWidth: number,
  hostHeight: number,
): { external: boolean; style: CSSProperties } {
  const controlSize = 28;
  const handleRadius = 14;
  const gap = 4;
  if (rect.width >= 72 && rect.height >= 40) {
    return { external: false, style: { left: 4, top: 4 } };
  }
  const clearance = handleRadius + gap;
  const centeredLeft = clampGeometryValue(
    (rect.width - controlSize) / 2,
    -rect.left,
    Math.max(-rect.left, hostWidth - rect.left - controlSize),
  );
  if (rect.top >= controlSize + clearance) {
    return {
      external: true,
      style: { left: centeredLeft, top: -controlSize - clearance },
    };
  }
  if (hostHeight - rect.top - rect.height >= controlSize + clearance) {
    return {
      external: true,
      style: { left: centeredLeft, top: rect.height + clearance },
    };
  }
  const centeredTop = clampGeometryValue(
    (rect.height - controlSize) / 2,
    -rect.top,
    Math.max(-rect.top, hostHeight - rect.top - controlSize),
  );
  if (hostWidth - rect.left - rect.width >= controlSize + clearance) {
    return {
      external: true,
      style: { left: rect.width + clearance, top: centeredTop },
    };
  }
  return {
    external: true,
    style: { left: -controlSize - clearance, top: centeredTop },
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
}: {
  start: GeometryRect;
  raw: GeometryRect;
  operation: OverlayGestureSession["operation"];
  direction?: FreePlacementResizeHandle;
  hostWidth: number;
  hostHeight: number;
  xGuides: readonly number[];
  yGuides: readonly number[];
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
      left = clampGeometryValue(left, 0, right - 2);
      const match = nearestGuide(left, xGuides);
      if (match.guide !== undefined) {
        left = clampGeometryValue(match.guide, 0, right - 2);
        activeGuides.vertical = match.guide;
      }
    }
    if (direction?.includes("e")) {
      right = clampGeometryValue(right, left + 2, hostWidth);
      const match = nearestGuide(right, xGuides);
      if (match.guide !== undefined) {
        right = clampGeometryValue(match.guide, left + 2, hostWidth);
        activeGuides.vertical = match.guide;
      }
    }
    if (direction?.includes("n")) {
      top = clampGeometryValue(top, 0, bottom - 2);
      const match = nearestGuide(top, yGuides);
      if (match.guide !== undefined) {
        top = clampGeometryValue(match.guide, 0, bottom - 2);
        activeGuides.horizontal = match.guide;
      }
    }
    if (direction?.includes("s")) {
      bottom = clampGeometryValue(bottom, top + 2, hostHeight);
      const match = nearestGuide(bottom, yGuides);
      if (match.guide !== undefined) {
        bottom = clampGeometryValue(match.guide, top + 2, hostHeight);
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
  disabledNodeActions,
  copyResponsiveDestinationLabel,
  onSelectTarget,
  onNodeAction,
  onPlacementGesture,
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
  disabledNodeActions?: ReadonlyMap<string, ReadonlySet<OverlayNodeAction>>;
  copyResponsiveDestinationLabel?: string;
  onSelectTarget?: (target: OverlayTargetDescriptor) => void;
  onNodeAction?: (target: OverlayTargetDescriptor, action: OverlayNodeAction) => void;
  onPlacementGesture?: (gesture: OverlayPlacementGesture) => void;
  onMeasurementChange?: (count: number) => void;
}) {
  const [boxes, setBoxes] = useState<MeasuredOverlayTarget[]>([]);
  const [gesturePreview, setGesturePreview] = useState<GeometryRect | null>(null);
  const [snapGuides, setSnapGuides] = useState<OverlaySnapGuides>({});
  const gestureRef = useRef<OverlayGestureSession | null>(null);
  const targetSignature = useMemo(() => targets.map((target) => [
    target.targetId,
    target.locator.value,
    target.locator.attributes.join(","),
    target.capabilities?.join(",") ?? "",
    target.locked ? "locked" : "unlocked",
    target.parentTargetId ?? "",
  ].join(":" )).join("|"), [targets]);

  const cancelActiveGesture = useCallback(() => {
    const gesture = gestureRef.current;
    if (gesture?.captureTarget.isConnected) {
      try {
        if (gesture.captureTarget.hasPointerCapture(gesture.pointerId)) {
          gesture.captureTarget.releasePointerCapture(gesture.pointerId);
        }
      } catch {
        // 控件在工作区切换时可能先于清理卸载；此时浏览器已自行释放 capture。
      }
    }
    gestureRef.current = null;
    setGesturePreview(null);
    setSnapGuides({});
  }, []);

  useEffect(() => {
    const hostWindow = hostRoot?.ownerDocument.defaultView;
    if (!hostWindow) return undefined;
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || !gestureRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      cancelActiveGesture();
    };
    hostWindow.addEventListener("keydown", handleEscape, true);
    return () => hostWindow.removeEventListener("keydown", handleEscape, true);
  }, [cancelActiveGesture, hostRoot]);

  useEffect(() => () => cancelActiveGesture(), [
    cancelActiveGesture,
    hostRoot,
    selectedTargetId,
    sourceFrame,
    sourceRoot,
    targetSignature,
  ]);

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
            const parentDomRect = (target.source === "builtin-contract-role"
              ? element.closest<HTMLElement>("[data-content-template-contract]")
              : element.parentElement)?.getBoundingClientRect();
            const parentRect = parentDomRect
              ? rectFromBounds(parentDomRect)
              : targetRect;
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
  const renderedSelectionRect = gesturePreview ?? selectedBox?.hostRect;
  const moveControlPlacement = renderedSelectionRect
    ? placeMoveControl(
        renderedSelectionRect,
        hostRoot?.clientWidth ?? 0,
        hostRoot?.clientHeight ?? 0,
      )
    : null;

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
    };
    setGesturePreview(box.hostRect);
    setSnapGuides({});
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateGesture = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const raw = applyHostRectGesture({
      rect: gesture.box.hostRect,
      operation: gesture.operation,
      direction: gesture.direction,
      deltaX: event.clientX - gesture.startClientX,
      deltaY: event.clientY - gesture.startClientY,
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
    setGesturePreview(snapped.rect);
    setSnapGuides(snapped.guides);
  };

  const finishGesture = (event: PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const hostDelta = gestureDeltaFromPreview(gesture);
    cancelActiveGesture();
    if (!commit) return;
    if (Math.abs(hostDelta.x) < 0.01 && Math.abs(hostDelta.y) < 0.01) return;
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
    onPlacementGesture({
      target: box.target,
      operation,
      direction,
      deltaSourceX: axisDelta.x * step,
      deltaSourceY: axisDelta.y * step,
      parentSourceWidth: box.parentSourceWidth,
      parentSourceHeight: box.parentSourceHeight,
      sourceRect: box.sourceRectInParent,
    });
  };

  return (
    <div
      className={`template-editor__editable-overlay is-${surface}${interactive ? " is-interactive" : " is-read-only"}`}
      data-template-editor-overlay-root={surface}
      data-overlay-box-count={boxes.length}
      data-overlay-gesture-active={gesturePreview ? "true" : undefined}
      aria-hidden={interactive ? undefined : "true"}
    >
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
      {boxes.map((box, index) => (
        <div
          key={box.key}
          className="template-editor__editable-overlay-box"
          data-editable-target-id={box.target.targetId}
          data-editable-target-kind={box.target.kind}
          data-overlay-selected={box.target.targetId === selectedTargetId ? "true" : undefined}
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
        />
      ))}
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
      {interactive ? boxes.map((box, index) => (
        <button
          key={`${box.key}:hit`}
          type="button"
          className="template-editor__editable-overlay-hit"
          aria-label={`选择模板目标 ${box.target.label}`}
          data-overlay-hit-for={box.target.targetId}
          data-overlay-hit-selected={box.target.targetId === selectedTargetId ? "true" : undefined}
          style={{
            left: box.hitRect.left,
            top: box.hitRect.top,
            width: box.hitRect.width,
            height: box.hitRect.height,
            zIndex: 100 + index,
          }}
          onClick={(event) => {
            event.stopPropagation();
            onSelectTarget?.(box.target);
          }}
        />
      )) : null}
      {interactive && selectedBox && renderedSelectionRect ? (
        <div
          className="template-editor__editable-overlay-selection"
          data-overlay-selection-for={selectedBox.target.targetId}
          style={{
            left: renderedSelectionRect.left,
            top: renderedSelectionRect.top,
            width: renderedSelectionRect.width,
            height: renderedSelectionRect.height,
          }}
        >
          <span
            className="template-editor__editable-overlay-selection-label"
            style={{
              left: selectedBox.labelPoint.x - renderedSelectionRect.left,
              top: selectedBox.labelPoint.y - renderedSelectionRect.top,
            }}
          >
            {selectedBox.target.label}
            {selectedBox.target.locked ? " · 已锁定" : ""}
          </span>
          {movableTargetIds?.has(selectedBox.target.targetId) ? (
            <button
              type="button"
              className="template-editor__editable-overlay-move"
              aria-label={`拖动移动${selectedBox.target.label}`}
              aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
              data-overlay-move-external={moveControlPlacement?.external ? "true" : undefined}
              style={moveControlPlacement?.style}
              onPointerDown={(event) => beginGesture(event, selectedBox, "move")}
              onPointerMove={updateGesture}
              onPointerUp={(event) => finishGesture(event, true)}
              onPointerCancel={(event) => finishGesture(event, false)}
              onKeyDown={(event) => commitKeyboardGesture(event, selectedBox, "move")}
            >
              移动
            </button>
          ) : null}
          {selectedBox.target.source === "definition-node"
            && selectedBox.target.capabilities?.includes("structure")
            && !selectedBox.target.locked
            && onNodeAction ? (
              <details
                key={selectedBox.target.targetId}
                className="template-editor__editable-overlay-actions"
                aria-label={`${selectedBox.target.label}快捷操作`}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.open = false;
                  event.currentTarget.querySelector("summary")?.focus();
                }}
              >
                <summary>对象操作</summary>
                <div className="template-editor__editable-overlay-action-list">
                {([
                  ["duplicate", "复制节点"],
                  ["hide", "隐藏节点"],
                  ["delete", "删除节点"],
                  ...(movableTargetIds?.has(selectedBox.target.targetId) ? [
                    ["align-horizontal", "在父容器中水平居中"],
                    ["align-vertical", "在父容器中垂直居中"],
                    ["copy-responsive", `复制当前自由布局到${copyResponsiveDestinationLabel ?? "另一画布"}`],
                    ["backward", "下移一层"],
                    ["forward", "上移一层"],
                  ] as const : []),
                ] as const).map(([action, label]) => (
                  <button
                    key={action}
                    type="button"
                    disabled={disabledNodeActions?.get(selectedBox.target.targetId)?.has(action)}
                    aria-label={disabledNodeActions?.get(selectedBox.target.targetId)?.has(action)
                      ? `${label}（必填槽位不可用）`
                      : label}
                    title={disabledNodeActions?.get(selectedBox.target.targetId)?.has(action)
                      ? `必填槽位不能${action === "hide" ? "隐藏" : "删除"}`
                      : label}
                    onClick={(event) => {
                      event.stopPropagation();
                      onNodeAction(selectedBox.target, action);
                    }}
                  >
                    {label}{disabledNodeActions?.get(selectedBox.target.targetId)?.has(action) ? "（必填槽位不可用）" : ""}
                  </button>
                ))}
                </div>
              </details>
            ) : null}
          {resizeTargetIds?.has(selectedBox.target.targetId) ? RESIZE_HANDLES.map((direction) => (
            <button
              key={direction}
              type="button"
              className="template-editor__editable-overlay-resize"
              aria-label={`调整${selectedBox.target.label}大小：${direction}`}
              aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
              data-resize-direction={direction}
              style={handlePosition(direction)}
              onPointerDown={(event) => beginGesture(event, selectedBox, "resize", direction)}
              onPointerMove={updateGesture}
              onPointerUp={(event) => finishGesture(event, true)}
              onPointerCancel={(event) => finishGesture(event, false)}
              onKeyDown={(event) => commitKeyboardGesture(event, selectedBox, "resize", direction)}
            />
          )) : null}
        </div>
      ) : null}
    </div>
  );
}
