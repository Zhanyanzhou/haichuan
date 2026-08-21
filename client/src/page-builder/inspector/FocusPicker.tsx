/**
 * FocusPicker — 视觉焦点拖拽器
 * 在图片缩略图上拖拽圆点 → 回写 focusX/focusY（0-100）。
 * 下方直接展示「快速定位」九宫格。所见即所得，不暴露数字。
 */
import { useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

interface FocusPickerProps {
  src: string;
  focusX: number;
  focusY: number;
  onChange: (x: number, y: number) => void;
  /** 缩略图比例（CSS aspect-ratio），如 "16 / 9" */
  aspectRatio?: string;
  /** 是否显示安全区参考框 */
  safeArea?: boolean;
}

const QUICK: { x: number; y: number; label: string }[] = [
  { x: 16, y: 16, label: "左上" }, { x: 50, y: 16, label: "中上" }, { x: 84, y: 16, label: "右上" },
  { x: 16, y: 50, label: "左中" }, { x: 50, y: 50, label: "居中" }, { x: 84, y: 50, label: "右中" },
  { x: 16, y: 84, label: "左下" }, { x: 50, y: 84, label: "中下" }, { x: 84, y: 84, label: "右下" },
];

export default function FocusPicker({ src, focusX, focusY, onChange, aspectRatio, safeArea }: FocusPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const update = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
    onChange(Math.round(x), Math.round(y));
  };

  const onDown = (e: ReactPointerEvent) => {
    setDragging(true);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    update(e.clientX, e.clientY);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (dragging) update(e.clientX, e.clientY);
  };
  const onUp = () => setDragging(false);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2;
    const next = { x: focusX, y: focusY };
    if (event.key === "ArrowLeft") next.x -= step;
    else if (event.key === "ArrowRight") next.x += step;
    else if (event.key === "ArrowUp") next.y -= step;
    else if (event.key === "ArrowDown") next.y += step;
    else if (event.key === "Home") {
      next.x = 50;
      next.y = 50;
    } else return;
    event.preventDefault();
    onChange(Math.min(100, Math.max(0, next.x)), Math.min(100, Math.max(0, next.y)));
  };

  return (
    <div className="homepage-editor__focus-picker">
      <div
        ref={ref}
        className="homepage-editor__focus-picker-img"
        style={{ aspectRatio: aspectRatio, cursor: dragging ? "grabbing" : "crosshair" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        tabIndex={0}
        role="img"
        aria-label={`图片焦点 ${Math.round(focusX)}% × ${Math.round(focusY)}%；方向键微调，Shift 加方向键大幅调整，Home 居中`}
        onKeyDown={onKeyDown}
      >
        <img src={src} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${focusX}% ${focusY}%`, pointerEvents: "none" }} />
        <span className="homepage-editor__focus-point" style={{ left: `${focusX}%`, top: `${focusY}%` }} aria-hidden />
        {safeArea && <span className="homepage-editor__safe-area" aria-hidden />}
      </div>
      <div className="homepage-editor__focus-quick">
        <span>快速定位</span>
        <div className="homepage-editor__focus-grid">
          {QUICK.map((q) => (
            <button
              key={q.label}
              type="button"
              title={q.label}
              aria-label={q.label}
              className={focusX === q.x && focusY === q.y ? "is-active" : ""}
              onClick={() => onChange(q.x, q.y)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
