import { Link } from "react-router-dom";
import { useState, useCallback, useRef, useEffect } from "react";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { HOTSPOT_CONTRACT } from "@/page-builder/config/blockContracts";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { resolveItemLinkUrl } from "@/page-builder/utils/linkTarget";

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
  onHotspotsChange?: (hotspots: HotspotItem[], device: "desktop" | "mobile") => void;
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
  const { image, mobileImage, hotspots = [], mobileHotspots = [] } = content;
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia(`(max-width:${HOTSPOT_CONTRACT.canvas.mobileBreakpoint}px)`).matches);
  useEffect(() => {
    const media = window.matchMedia(`(max-width:${HOTSPOT_CONTRACT.canvas.mobileBreakpoint}px)`);
    const syncDevice = () => setIsMobile(media.matches);
    syncDevice();
    media.addEventListener("change", syncDevice);
    return () => media.removeEventListener("change", syncDevice);
  }, []);
  const desktopHotspots: HotspotItem[] = Array.isArray(hotspots) ? hotspots : [];
  const configuredMobileHotspots: HotspotItem[] = Array.isArray(mobileHotspots) ? mobileHotspots : [];
  // schema 文本控件可能写入字符串数字,统一在入口归一为数值再参与几何校验
  const normalizeGeometry = (list: HotspotItem[]): HotspotItem[] =>
    list.map((item) => ({
      ...item,
      x: Number(item.x),
      y: Number(item.y),
      width: Number(item.width),
      height: Number(item.height),
    }));
  const usesDesktopFallback =
    isMobile && normalizeGeometry(configuredMobileHotspots).length === 0;
  const rawHotspots = isMobile && !usesDesktopFallback
    ? normalizeGeometry(configuredMobileHotspots)
    : normalizeGeometry(desktopHotspots);
  const activeDevice = isMobile && !usesDesktopFallback ? "mobile" : "desktop";
  const visibleHotspots = rawHotspots
    .map((item, sourceIndex) => ({ item, sourceIndex }))
    .filter(({ item }) => (
      [item?.x, item?.y, item?.width, item?.height].every(Number.isFinite)
      && item.width > 0
      && item.height > 0
      && (editMode || Boolean(resolveItemLinkUrl(item)))
    ));

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
    (sourceIndex: number, handle: "move" | "nw" | "ne" | "sw" | "se", e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setSelectedIndex(sourceIndex);
      setDragState({
        index: sourceIndex,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startHotspot: { ...rawHotspots[sourceIndex] },
      });
    },
    [rawHotspots],
  );

  useEffect(() => {
    if (!dragState) return;

    const onMove = (e: PointerEvent) => {
      const { xPct, yPct } = getRelativePos(e.clientX, e.clientY);
      const dx = xPct - getRelativePos(dragState.startX, dragState.startY).xPct;
      const dy = yPct - getRelativePos(dragState.startX, dragState.startY).yPct;
      const h = dragState.startHotspot;

      const next = [...rawHotspots];
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
      onHotspotsChange?.(next, activeDevice);
    };

    const onUp = () => setDragState(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [activeDevice, dragState, getRelativePos, rawHotspots, onHotspotsChange]);

  const desktopImg = image || mobileImage;
  const mobileImg = mobileImage || image;

  if (!desktopImg && editMode) {
    return (
      <section className="homepage-hotspot is-empty" style={{ maxWidth: HOTSPOT_CONTRACT.canvas.maxWidth, margin: "0 auto", aspectRatio: HOTSPOT_CONTRACT.canvas.desktopMediaAspectRatio }}>
        <style>{`
          @media (max-width:${HOTSPOT_CONTRACT.canvas.mobileBreakpoint}px) {
            .homepage-hotspot.is-empty { aspect-ratio: ${HOTSPOT_CONTRACT.canvas.mobileMediaAspectRatio} !important; }
          }
        `}</style>
        <BlockEmptyPlaceholder
          hint="热区图"
          spec={`先上传底图，再添加点击热区 · 桌面 ${IMAGE_SPECS.hotspot.desktop.label}`}
          height="100%"
        />
      </section>
    );
  }

  if (!desktopImg) return null;

  return (
    <section
      className="homepage-hotspot"
      data-content-role="sceneImage"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: HOTSPOT_CONTRACT.canvas.maxWidth,
        margin: "0 auto",
        aspectRatio: HOTSPOT_CONTRACT.canvas.desktopMediaAspectRatio,
        overflow: "hidden",
        background: "#F4F5F5",
      }}
    >
      <style>{`
        @media (max-width:${HOTSPOT_CONTRACT.canvas.mobileBreakpoint}px) {
          .homepage-hotspot { aspect-ratio: ${HOTSPOT_CONTRACT.canvas.mobileMediaAspectRatio} !important; }
        }
      `}</style>
      <picture data-editor-field="image mobileImage" style={{ display: "block", width: "100%", height: "100%" }}>
        <source media={`(max-width:${HOTSPOT_CONTRACT.canvas.mobileBreakpoint}px)`} srcSet={mobileImg} />
        <img
          ref={imgRef}
          src={desktopImg}
          alt="热区导购场景"
          style={{ width: "100%", height: "100%", display: "block", objectFit: "cover", userSelect: "none" }}
          draggable={false}
        />
      </picture>

      {/* 热区叠加层 */}
      <div data-content-role="hotspots" style={{ display: "contents" }}>
          {visibleHotspots.map(({ item: h, sourceIndex }) => (
        <Link
          key={sourceIndex}
          to={editMode ? "#" : resolveItemLinkUrl(h) || "#"}
          onClick={(e) => {
            if (editMode) {
              e.preventDefault();
              setSelectedIndex(sourceIndex);
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
              editMode && selectedIndex === sourceIndex
                ? "2px solid #181A1B"
                : "1px dashed rgba(24,26,27,0.4)",
            background:
              editMode && selectedIndex === sourceIndex
                ? "rgba(24,26,27,0.08)"
                : "transparent",
            transition: editMode ? "none" : "background 0.2s",
          }}
          onPointerDown={
            editMode ? (e) => onPointerDown(sourceIndex, "move", e) : undefined
          }
          onMouseEnter={(e) => {
            if (!editMode) e.currentTarget.style.background = "rgba(24,26,27,0.12)";
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
          {editMode && selectedIndex === sourceIndex && (
            <>
              {(["nw", "ne", "sw", "se"] as const).map((pos) => {
                const isN = pos.includes("n");
                const isW = pos.includes("w");
                return (
                  <div
                    key={pos}
                    onPointerDown={(e) => onPointerDown(sourceIndex, pos, e)}
                    style={{
                      position: "absolute",
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "#181A1B",
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
      </div>

      {/* 编辑模式空状态 */}
      {editMode && visibleHotspots.length === 0 && (
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
            尚未添加热区，请在右侧「热区列表」中创建导购入口
          </span>
        </div>
      )}
    </section>
  );
}
