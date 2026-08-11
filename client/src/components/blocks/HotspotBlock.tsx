import { Link } from "react-router-dom";
import { useState, useCallback, useRef, useEffect } from "react";

interface HotspotItem {
  x: number; // 左边距百分比
  y: number; // 上边距百分比
  width: number; // 宽度百分比
  height: number; // 高度百分比
  link: string;
  label?: string;
}

interface HotspotBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
  /** 编辑模式下，热区变更回调（可选，供 Puck 字段绑定） */
  onHotspotsChange?: (hotspots: HotspotItem[]) => void;
}

/**
 * HotspotBlock — 热区图 + 编辑模式可视化拖拽
 *
 * 前台：渲染固定热区覆盖层，点击跳转
 * 编辑器（editMode）：在背景图上渲染可拖拽调整的热区框，支持
 *   拖动移动、四角缩放手柄、点击选中
 */
export default function HotspotBlock({
  module,
  editMode,
  onHotspotsChange,
}: HotspotBlockProps) {
  const { content = {} } = module;
  const { image, mobileImage, hotspots = [] } = content;
  const validHotspots: HotspotItem[] = (
    Array.isArray(hotspots) ? hotspots : []
  ).filter((h: any) => h?.link);

  /* ── 编辑模式：选中与拖拽状态 ── */
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [dragState, setDragState] = useState<{
    index: number;
    handle: "move" | "nw" | "ne" | "sw" | "se";
    startX: number;
    startY: number;
    startHotspot: HotspotItem;
  } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const getRelativePos = useCallback(
    (clientX: number, clientY: number) => {
      const img = imgRef.current;
      if (!img) return { xPct: 0, yPct: 0 };
      const rect = img.getBoundingClientRect();
      return {
        xPct: ((clientX - rect.left) / rect.width) * 100,
        yPct: ((clientY - rect.top) / rect.height) * 100,
      };
    },
    [],
  );

  /* ── 拖拽事件 ── */
  const onPointerDown = useCallback(
    (index: number, handle: "move" | "nw" | "ne" | "sw" | "se", e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setSelectedIndex(index);
      setDragState({
        index,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startHotspot: { ...validHotspots[index] },
      });
    },
    [validHotspots],
  );

  useEffect(() => {
    if (!dragState) return;

    const onMove = (e: PointerEvent) => {
      const { xPct, yPct } = getRelativePos(e.clientX, e.clientY);
      const dx = xPct - getRelativePos(dragState.startX, dragState.startY).xPct;
      const dy = yPct - getRelativePos(dragState.startX, dragState.startY).yPct;
      const h = dragState.startHotspot;

      const next = [...validHotspots];
      const current = { ...h };

      if (dragState.handle === "move") {
        current.x = Math.max(0, Math.min(100 - current.width, h.x + dx));
        current.y = Math.max(0, Math.min(100 - current.height, h.y + dy));
      } else {
        if (dragState.handle.includes("n")) {
          current.y = Math.max(0, Math.min(h.y + h.height - 2, h.y + dy));
          current.height = Math.max(2, h.height - dy);
        }
        if (dragState.handle.includes("s")) {
          current.height = Math.max(2, Math.min(100 - h.y, h.height + dy));
        }
        if (dragState.handle.includes("w")) {
          current.x = Math.max(0, Math.min(h.x + h.width - 2, h.x + dx));
          current.width = Math.max(2, h.width - dx);
        }
        if (dragState.handle.includes("e")) {
          current.width = Math.max(2, Math.min(100 - h.x, h.width + dx));
        }
      }

      next[dragState.index] = current;
      onHotspotsChange?.(next);
    };

    const onUp = () => setDragState(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragState, getRelativePos, validHotspots, onHotspotsChange]);

  const desktopImg = image || mobileImage;
  const mobileImg = mobileImage || image;

  if (!desktopImg) {
    return editMode ? (
      <section
        style={{
          padding: "120px 0",
          background: "#F0EDE6",
          textAlign: "center",
          color: "#B8944E",
          fontSize: 14,
        }}
      >
        🖱️ 热区图 — 请上传背景图并配置热区
      </section>
    ) : null;
  }

  return (
    <section
      style={{
        position: "relative",
        width: "100%",
        overflow: "hidden",
        background: "#F5F2ED",
      }}
    >
      <picture data-editor-field="image mobileImage">
        <source media="(max-width:767px)" srcSet={mobileImg} />
        <img
          ref={imgRef}
          src={desktopImg}
          alt=""
          style={{ width: "100%", display: "block", userSelect: "none" }}
          draggable={false}
        />
      </picture>

      {/* 热区叠加层 */}
      {validHotspots.map((h, i) => (
        <Link
          key={i}
          to={editMode ? "#" : h.link}
          onClick={(e) => {
            if (editMode) {
              e.preventDefault();
              setSelectedIndex(i);
            }
          }}
          style={{
            position: "absolute",
            left: `${h.x}%`,
            top: `${h.y}%`,
            width: `${h.width}%`,
            height: `${h.height}%`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            cursor: editMode ? "move" : "pointer",
            outline:
              editMode && selectedIndex === i
                ? "2px solid #4D68F7"
                : "1px dashed rgba(184,148,78,0.4)",
            background:
              editMode && selectedIndex === i
                ? "rgba(77,104,247,0.08)"
                : "transparent",
            transition: editMode ? "none" : "background 0.2s",
          }}
          onPointerDown={
            editMode ? (e) => onPointerDown(i, "move", e) : undefined
          }
          onMouseEnter={(e) => {
            if (!editMode) e.currentTarget.style.background = "rgba(184,148,78,0.15)";
          }}
          onMouseLeave={(e) => {
            if (!editMode) e.currentTarget.style.background = "transparent";
          }}
        >
          {h.label && (
            <span
              style={{
                padding: "4px 12px",
                borderRadius: 2,
                background: "rgba(0,0,0,0.5)",
                color: "#fff",
                fontSize: 11,
                letterSpacing: "0.08em",
                opacity: 0.85,
                pointerEvents: "none",
              }}
            >
              {h.label}
            </span>
          )}

          {/* 编辑模式缩放手柄 */}
          {editMode && selectedIndex === i && (
            <>
              {(["nw", "ne", "sw", "se"] as const).map((pos) => {
                const isN = pos.includes("n");
                const isW = pos.includes("w");
                return (
                  <div
                    key={pos}
                    onPointerDown={(e) => onPointerDown(i, pos, e)}
                    style={{
                      position: "absolute",
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "#4D68F7",
                      border: "2px solid #fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                      cursor: `${pos}-resize`,
                      [isN ? "top" : "bottom"]: -5,
                      [isW ? "left" : "right"]: -5,
                      zIndex: 2,
                    }}
                  />
                );
              })}
            </>
          )}
        </Link>
      ))}

      {/* 编辑模式空状态 */}
      {editMode && validHotspots.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.06)",
          }}
        >
          <span
            style={{
              padding: "8px 20px",
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            热区已配置，请在右侧「热区列表」中添加坐标
          </span>
        </div>
      )}
    </section>
  );
}
