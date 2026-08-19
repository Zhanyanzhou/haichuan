import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { BEFORE_AFTER_CONTRACT } from "@/page-builder/config/blockContracts";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import { resolveLinkTargetUrl } from "@/page-builder/utils/linkTarget";

interface BeforeAfterBlockProps {
  module: { content: Record<string, any>; layoutConfig?: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

const INK = "#1A1A1A";
const MUTED = "#8C8C8C";
const GOLD = "#8C8C8C";

/**
 * 改款前后对比 — Editorial Story 母版(改款叙事变体)
 * 拖动分割线对比改款前/后两张同比例图(4:5);PC 与手机均为滑动交互,
 * 两图各自独立焦点;编辑态同样可拖,不影响数据。
 */
export default function BeforeAfterBlock({ module, editMode }: BeforeAfterBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const {
    title,
    subtitle,
    beforeImage,
    afterImage,
    beforeLabel,
    afterLabel,
    beforeAltText,
    afterAltText,
    actionText,
    linkUrl,
    targetType,
    productId,
  } = content;
  const bgColor = styleConfig.bgColor || "#FFFFFF";
  const targetUrl = resolveLinkTargetUrl({ targetType, productId, linkUrl });
  const beforeFocusX = Math.min(100, Math.max(0, Number(styleConfig.beforeFocusX ?? 50)));
  const beforeFocusY = Math.min(100, Math.max(0, Number(styleConfig.beforeFocusY ?? 50)));
  const afterFocusX = Math.min(100, Math.max(0, Number(styleConfig.afterFocusX ?? 50)));
  const afterFocusY = Math.min(100, Math.max(0, Number(styleConfig.afterFocusY ?? 50)));

  const trackRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);

  const updateFromPointer = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };
  const onDown = (e: ReactPointerEvent) => {
    setDragging(true);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    updateFromPointer(e.clientX);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (dragging) updateFromPointer(e.clientX);
  };
  const onUp = () => setDragging(false);

  if (!beforeImage && !afterImage) {
    if (!editMode) return null;
    return (
      <DecorSection master="editorial-story" background={bgColor}>
        <BlockEmptyPlaceholder
          hint="改款前后对比"
          spec={`请上传改款前/后两张同比例图 · ${IMAGE_SPECS.beforeAfter.image.label}`}
          ratio={BEFORE_AFTER_CONTRACT.canvas.desktopMediaAspectRatio}
        />
      </DecorSection>
    );
  }

  return (
    <DecorSection master="editorial-story" background={bgColor}>
      <style>{`
        .hc-before-after__track {
          position: relative;
          aspect-ratio: ${BEFORE_AFTER_CONTRACT.canvas.desktopMediaAspectRatio};
          overflow: hidden;
          background: #E4E3DF;
          touch-action: none;
          cursor: ${dragging ? "grabbing" : "ew-resize"};
        }
        .hc-before-after__img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          user-select: none;
          -webkit-user-drag: none;
          pointer-events: none;
        }
        .hc-before-after__divider {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 2px;
          background: #FFFFFF;
          box-shadow: 0 0 0 1px rgba(0,0,0,.12);
          transform: translateX(-1px);
        }
        .hc-before-after__handle {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 2px solid #FFFFFF;
          background: rgba(26,26,26,.92);
          color: #fff;
          display: grid;
          place-items: center;
          font-size: 14px;
          letter-spacing: -2px;
          transform: translate(-50%, -50%);
          box-shadow: 0 2px 8px rgba(0,0,0,.28);
          pointer-events: none;
        }
        .hc-before-after__tag {
          position: absolute;
          top: 14px;
          padding: 4px 10px;
          font-size: 11px;
          letter-spacing: 0.14em;
          color: #fff;
          background: rgba(15,13,12,.5);
          pointer-events: none;
        }
        .hc-before-after__tag--before { left: 14px; }
        .hc-before-after__tag--after { right: 14px; }
        @media (max-width: 767px) {
          .hc-before-after__track { aspect-ratio: ${BEFORE_AFTER_CONTRACT.canvas.mobileMediaAspectRatio}; }
        }
      `}</style>
      {(title || subtitle || editMode) && (
        <header style={{ maxWidth: 640, margin: "0 auto 40px", textAlign: "center" }}>
          {title ? (
            <h2 data-editor-field="title"
              style={{
                margin: "0 0 12px",
                fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
                fontSize: "var(--hc-type-h2, clamp(26px,3vw,38px))",
                fontWeight: 500,
                color: INK,
                lineHeight: 1.2,
              }}
            >
              {title}
            </h2>
          ) : null}
          {subtitle ? (
            <p data-editor-field="subtitle" style={{ margin: 0, fontSize: "var(--hc-type-body, 15px)", color: MUTED, lineHeight: 1.8 }}>
              {subtitle}
            </p>
          ) : null}
        </header>
      )}
      <div
        ref={trackRef}
        className="hc-before-after__track"
        data-editor-field="beforeImage afterImage"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        {beforeImage ? (
          <img
            className="hc-before-after__img"
            src={beforeImage}
            alt={beforeAltText || beforeLabel || "改款前"}
            style={{ objectPosition: `${beforeFocusX}% ${beforeFocusY}%` }}
          />
        ) : (
          <div className="hc-before-after__img" style={{ display: "grid", placeItems: "center", color: "#A89A87", fontSize: 13, background: "#EFE9E0" }}>
            改款前图片待上传
          </div>
        )}
        {afterImage ? (
          <img
            className="hc-before-after__img"
            src={afterImage}
            alt={afterAltText || afterLabel || "改款后"}
            style={{
              objectPosition: `${afterFocusX}% ${afterFocusY}%`,
              clipPath: `inset(0 0 0 ${position}%)`,
            }}
          />
        ) : null}
        <div className="hc-before-after__divider" style={{ left: `${position}%` }} />
        <div className="hc-before-after__handle" style={{ left: `${position}%` }} aria-hidden>
          ◀▶
        </div>
        {beforeLabel ? <span className="hc-before-after__tag hc-before-after__tag--before" data-editor-field="beforeLabel">{beforeLabel}</span> : null}
        {afterLabel ? <span className="hc-before-after__tag hc-before-after__tag--after" data-editor-field="afterLabel">{afterLabel}</span> : null}
      </div>
      <p
        style={{
          margin: "14px 0 0",
          textAlign: "center",
          fontSize: 11,
          letterSpacing: "0.14em",
          color: MUTED,
          fontFamily: `var(--hc-font-sans, ${FONT_SANS})`,
        }}
      >
        拖动分割线对比改款前后
      </p>
      {actionText && targetUrl ? (
        <div style={{ marginTop: 20, textAlign: "center" }}>
          {editMode ? (
            <span data-editor-field="actionText linkUrl productId" style={{ color: INK, fontSize: 13, letterSpacing: "0.04em", fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>
              {actionText} <span>→</span>
            </span>
          ) : (
            <Link to={targetUrl} data-editor-field="actionText linkUrl productId" style={{ color: INK, textDecoration: "none", fontSize: 13, letterSpacing: "0.04em", fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>
              {actionText} <span>→</span>
            </Link>
          )}
        </div>
      ) : null}
    </DecorSection>
  );
}
