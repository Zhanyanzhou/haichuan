import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
  findElementsByEditableTargetLocator,
  getEditorHitSize,
  placeHostLabel,
  projectSourceRectToHost,
  rectFromDomRect,
  sourceRectRelativeToParentNormalized,
  sourceRectRelativeToRoot,
  type GeometryRect,
  type SourceToHostTransform,
} from "./editableTargetGeometry";

export interface OverlayTargetDescriptor {
  targetId: string;
  ownerNodeId: string;
  source?: "definition-node" | "builtin-contract-role";
  contractRoleId?: string;
  kind: string;
  label: string;
  capabilities?: readonly EditableTargetCapability[];
  locator: {
    attributes: readonly EditableTargetLocatorAttribute[];
    value: string;
  };
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
}

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
    ) && box.labelVisible === candidate.labelVisible;
  });
}

function isVisibleTarget(element: HTMLElement) {
  if (element.getClientRects().length === 0 || element.closest('[aria-hidden="true"]')) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return style?.display !== "none" && style?.visibility !== "hidden";
}

function handlePosition(direction: FreePlacementResizeHandle) {
  const horizontal = direction.includes("w") ? "0%" : direction.includes("e") ? "100%" : "50%";
  const vertical = direction.includes("n") ? "0%" : direction.includes("s") ? "100%" : "50%";
  return { left: horizontal, top: vertical };
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
  const gestureRef = useRef<OverlayGestureSession | null>(null);
  const targetSignature = useMemo(() => targets.map((target) => [
    target.targetId,
    target.locator.value,
    target.locator.attributes.join(","),
    target.capabilities?.join(",") ?? "",
  ].join(":" )).join("|"), [targets]);

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
      const sourceRootRect = rectFromDomRect(sourceRoot.getBoundingClientRect());
      const sourceFrameRect = rectFromDomRect(sourceFrame.getBoundingClientRect());
      const hostRect = rectFromDomRect(hostRoot.getBoundingClientRect());
      const transform = createSourceToHostTransform({
        sourceRootRect,
        sourceFrameRect,
        sourceFrameViewport: {
          width: sourceFrame.clientWidth || sourceRoot.ownerDocument.documentElement.clientWidth,
          height: sourceFrame.clientHeight || sourceRoot.ownerDocument.documentElement.clientHeight,
        },
        hostRect,
      });
      const hostWidth = hostRoot.clientWidth;
      const hostHeight = hostRoot.clientHeight;
      const measuredElements: HTMLElement[] = [];
      const measured = targets.flatMap((target): MeasuredOverlayTarget[] =>
        findElementsByEditableTargetLocator(sourceRoot, target.locator)
          .flatMap((element, occurrence) => {
            if (!isVisibleTarget(element)) return [];
            const targetRect = rectFromDomRect(element.getBoundingClientRect());
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
              ? rectFromDomRect(parentDomRect)
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
          }),
      );
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
    };
    setGesturePreview(box.hostRect);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateGesture = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    setGesturePreview(applyHostRectGesture({
      rect: gesture.box.hostRect,
      operation: gesture.operation,
      direction: gesture.direction,
      deltaX: event.clientX - gesture.startClientX,
      deltaY: event.clientY - gesture.startClientY,
    }));
  };

  const finishGesture = (event: PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    gestureRef.current = null;
    setGesturePreview(null);
    if (!commit) return;
    onPlacementGesture?.({
      target: gesture.box.target,
      operation: gesture.operation,
      direction: gesture.direction,
      deltaSourceX: (event.clientX - gesture.startClientX) / gesture.box.transform.scaleX,
      deltaSourceY: (event.clientY - gesture.startClientY) / gesture.box.transform.scaleY,
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
      aria-hidden={interactive ? undefined : "true"}
    >
      {boxes.map((box, index) => (
        <div
          key={box.key}
          className="template-editor__editable-overlay-box"
          data-editable-target-id={box.target.targetId}
          data-editable-target-kind={box.target.kind}
          data-overlay-selected={box.target.targetId === selectedTargetId ? "true" : undefined}
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
            pointerEvents: selectedBox && (
              box.target.targetId === selectedBox.target.targetId
              || (
                selectedBox.hostRect.left + selectedBox.hostRect.width / 2 >= box.hostRect.left
                && selectedBox.hostRect.left + selectedBox.hostRect.width / 2 <= box.hostRect.left + box.hostRect.width
                && selectedBox.hostRect.top + selectedBox.hostRect.height / 2 >= box.hostRect.top
                && selectedBox.hostRect.top + selectedBox.hostRect.height / 2 <= box.hostRect.top + box.hostRect.height
              )
            ) ? "none" : undefined,
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
          </span>
          {movableTargetIds?.has(selectedBox.target.targetId) ? (
            <button
              type="button"
              className="template-editor__editable-overlay-move"
              aria-label={`拖动移动${selectedBox.target.label}`}
              aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
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
            && onNodeAction ? (
              <div
                className="template-editor__editable-overlay-actions"
                role="toolbar"
                aria-label={`${selectedBox.target.label}快捷操作`}
              >
                {([
                  ["duplicate", "复制节点"],
                  ["hide", "隐藏节点"],
                  ["delete", "删除节点"],
                  ...(movableTargetIds?.has(selectedBox.target.targetId) ? [
                    ["align-horizontal", "在父容器中水平居中"],
                    ["align-vertical", "在父容器中垂直居中"],
                    ["copy-responsive", `复制当前自由布局到${copyResponsiveDestinationLabel ?? "另一设备"}`],
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
                    {label.slice(0, 1)}
                  </button>
                ))}
              </div>
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
