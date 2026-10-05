import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { resolveManagedTemplateMediaPreviewUrl } from "../../template-definition/managedMediaPreview";
import "./imageFocusPad.css";

export interface ImageFocusValue {
  x: number;
  y: number;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 50));
}

function pointFromPointer(event: { clientX: number; clientY: number }, surface: HTMLElement): ImageFocusValue {
  const bounds = surface.getBoundingClientRect();
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  return {
    x: clampPercent(((event.clientX - bounds.left) / width) * 100),
    y: clampPercent(((event.clientY - bounds.top) / height) * 100),
  };
}

export default function ImageFocusPad({
  value,
  disabled,
  previewSrc,
  previewAlt = "",
  previewFit = "cover",
  previewZoom = 1,
  previewAspectRatio,
  ariaLabel = "画面焦点",
  onChange,
}: {
  value: ImageFocusValue;
  disabled?: boolean;
  previewSrc?: string;
  previewAlt?: string;
  previewFit?: "cover" | "contain" | "fill";
  previewZoom?: number;
  previewAspectRatio?: string;
  ariaLabel?: string;
  onChange: (next: ImageFocusValue) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; moved: boolean } | null>(null);
  const liveRef = useRef<ImageFocusValue | null>(null);
  const [live, setLive] = useState<ImageFocusValue | null>(null);
  const focus = {
    x: clampPercent(live?.x ?? value.x),
    y: clampPercent(live?.y ?? value.y),
  };
  const src = previewSrc ? resolveManagedTemplateMediaPreviewUrl(previewSrc) : "";
  const commit = (next: ImageFocusValue, persist: boolean) => {
    const normalized = { x: clampPercent(next.x), y: clampPercent(next.y) };
    liveRef.current = persist ? null : normalized;
    setLive(persist ? null : normalized);
    if (persist) onChange(normalized);
  };
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current = { pointerId: event.pointerId, moved: false };
    surface.setPointerCapture(event.pointerId);
    commit(pointFromPointer(event, surface), false);
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    const surface = surfaceRef.current;
    if (!current || current.pointerId !== event.pointerId || !surface) return;
    current.moved = true;
    commit(pointFromPointer(event, surface), false);
  };
  const finish = (event: ReactPointerEvent<HTMLDivElement>, persist: boolean) => {
    const current = drag.current;
    const surface = surfaceRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (surface?.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
    if (persist) commit(liveRef.current ?? (surface ? pointFromPointer(event, surface) : { x: 50, y: 50 }), true);
    else {
      liveRef.current = null;
      setLive(null);
    }
  };
  return (
    <div
      ref={surfaceRef}
      className="image-focus-pad"
      role="slider"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(focus.x)}
      aria-valuetext={`横向 ${Math.round(focus.x * 100) / 100}%，纵向 ${Math.round(focus.y * 100) / 100}%`}
      tabIndex={disabled ? -1 : 0}
      data-image-focus-pad="true"
      data-disabled={disabled ? "true" : undefined}
      style={previewAspectRatio ? { aspectRatio: previewAspectRatio } : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finish(event, true)}
      onPointerCancel={(event) => finish(event, false)}
      onKeyDown={(event) => {
        if (disabled || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        onChange({
          x: clampPercent(focus.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0)),
          y: clampPercent(focus.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0)),
        });
      }}
    >
      {src ? (
        <img
          src={src}
          alt={previewAlt}
          draggable={false}
          style={{
            objectFit: previewFit,
            objectPosition: `${focus.x}% ${focus.y}%`,
            transform: `scale(${Math.min(2, Math.max(1, previewZoom))})`,
            transformOrigin: `${focus.x}% ${focus.y}%`,
          }}
        />
      ) : (
        <span className="image-focus-pad__empty">没有图片时仍可设定焦点，画布有图后才会看到裁切结果</span>
      )}
      <span
        className="image-focus-pad__handle"
        aria-hidden="true"
        style={{ left: `${focus.x}%`, top: `${focus.y}%` }}
      >
        +
      </span>
    </div>
  );
}
