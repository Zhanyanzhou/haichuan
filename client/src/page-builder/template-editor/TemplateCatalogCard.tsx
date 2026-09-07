import type {
  DragEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  PointerEventHandler,
  ReactNode,
} from "react";
import { useEffect, useRef, useState } from "react";

export interface TemplateCatalogCardProps {
  name: string;
  preview: ReactNode;
  ariaLabel: string;
  active?: boolean;
  className?: string;
  compact?: boolean;
  controlClassName?: string;
  dataTemplateIdentity?: string;
  dataTemplateName?: string;
  disabled?: boolean;
  draggable?: boolean;
  statusLabel?: ReactNode;
  metadata?: ReactNode;
  actionLabel?: string;
  disabledReason?: string;
  trailingAction?: ReactNode;
  onClick?: MouseEventHandler<HTMLDivElement>;
  onDragEnd?: DragEventHandler<HTMLDivElement>;
  onDragStart?: DragEventHandler<HTMLDivElement>;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onMouseDown?: MouseEventHandler<HTMLDivElement>;
  onPointerCancel?: PointerEventHandler<HTMLDivElement>;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPointerUp?: PointerEventHandler<HTMLDivElement>;
}

function createStaticDragImage(name: string) {
  const dragImage = document.createElement("div");
  dragImage.dataset.templateCatalogDragImage = "static";
  dragImage.setAttribute("aria-hidden", "true");
  dragImage.style.cssText = [
    "position:fixed",
    "left:-1000px",
    "top:-1000px",
    "display:grid",
    "gap:3px",
    "width:220px",
    "max-width:220px",
    "padding:10px 12px",
    "border:1px solid var(--adm-line, #dde1e2)",
    "border-radius:8px",
    "background:var(--adm-content-bg, #fff)",
    "color:var(--adm-text, #181a1b)",
    "box-shadow:0 8px 24px rgba(24, 26, 27, 0.18)",
    "font-family:inherit",
    "pointer-events:none",
  ].join(";");

  const nameElement = document.createElement("strong");
  nameElement.textContent = name;
  nameElement.style.cssText = "overflow:hidden;font-size:13px;line-height:18px;text-overflow:ellipsis;white-space:nowrap";

  dragImage.append(nameElement);
  document.body.appendChild(dragImage);
  return dragImage;
}

/**
 * 页面装修与模板设计共用的目录卡片外壳。
 * 组件只统一交互骨架和可访问性；具体点击、拖拽与写入目标由各模式注入。
 */
export default function TemplateCatalogCard({
  name,
  preview,
  ariaLabel,
  active,
  className,
  compact = false,
  controlClassName,
  dataTemplateIdentity,
  dataTemplateName,
  disabled = false,
  draggable = false,
  statusLabel,
  metadata,
  actionLabel,
  disabledReason,
  trailingAction,
  onClick,
  onDragEnd,
  onDragStart,
  onKeyDown,
  onMouseDown,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: TemplateCatalogCardProps) {
  const previewHostRef = useRef<HTMLSpanElement>(null);
  const [previewMounted, setPreviewMounted] = useState(Boolean(active));

  useEffect(() => {
    if (active) setPreviewMounted(true);
  }, [active]);

  useEffect(() => {
    if (previewMounted) return undefined;
    const target = previewHostRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      setPreviewMounted(true);
      return undefined;
    }
    const root = target.closest<HTMLElement>(".homepage-editor__template-scroll");
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setPreviewMounted(true);
      observer.disconnect();
    }, {
      root,
      rootMargin: "180px 0px",
      threshold: 0.01,
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [previewMounted]);

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || disabled || event.repeat) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.currentTarget.click();
    }
  };

  const handleDragStart: DragEventHandler<HTMLDivElement> = (event) => {
    onDragStart?.(event);
    if (event.defaultPrevented || disabled || !draggable) return;

    // 浏览器默认会把整个卡片（包括真实 Renderer、轮播和视频）作为拖拽影像，
    // 看起来像预览图在画布上滑动。拖拽影像只保留模板名称，业务 payload
    // 仍由页面装修或模板设计各自的 onDragStart 写入。
    const dragImage = createStaticDragImage(name);
    try {
      event.dataTransfer.setDragImage(dragImage, 18, 18);
    } catch {
      dragImage.remove();
      return;
    }
    window.setTimeout(() => dragImage.remove(), 0);
  };

  return (
    <article
      className={`homepage-editor__template-card${className ? ` ${className}` : ""}${active ? " is-active" : ""}${disabled ? " is-disabled" : ""}${compact ? " is-compact" : ""}`}
      data-template-catalog-card="shared"
      data-template-identity={dataTemplateIdentity}
      data-template-name={dataTemplateName}
      onMouseEnter={() => setPreviewMounted(true)}
      onFocusCapture={() => setPreviewMounted(true)}
    >
      <div
        className={`homepage-editor__template-card-main${controlClassName ? ` ${controlClassName}` : ""}`}
        role="button"
        tabIndex={0}
        aria-disabled={disabled || undefined}
        aria-pressed={typeof active === "boolean" ? active : undefined}
        aria-label={disabledReason ? `${ariaLabel}，${disabledReason}` : ariaLabel}
        draggable={draggable && !disabled}
        onClick={disabled ? undefined : onClick}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onKeyDown={handleKeyDown}
        onMouseDown={onMouseDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <span ref={previewHostRef} className="homepage-editor__template-preview-wrap">
          {previewMounted ? preview : (
            <span
              className="template-editor__catalog-preview-placeholder"
              data-preview-status="deferred"
              aria-hidden="true"
            />
          )}
        </span>
        <span className="homepage-editor__template-name">{name}</span>
        {metadata ? <span className="unified-template-library__metadata">{metadata}</span> : null}
        {statusLabel ? (
          <span className="homepage-editor__template-card-status">{statusLabel}</span>
        ) : null}
        {actionLabel ? <span className="unified-template-library__primary-action">{actionLabel}</span> : null}
        {disabledReason ? <span className="unified-template-library__disabled-reason">{disabledReason}</span> : null}
      </div>
      {trailingAction ? (
        <span className="template-editor__catalog-card-action">
          {trailingAction}
        </span>
      ) : null}
    </article>
  );
}
