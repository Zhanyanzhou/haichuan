import type {
  DragEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  PointerEventHandler,
  ReactNode,
} from "react";

export interface TemplateCatalogCardProps {
  name: string;
  description: string;
  preview: ReactNode;
  actionHint: string;
  ariaLabel: string;
  active?: boolean;
  badge?: ReactNode;
  className?: string;
  compact?: boolean;
  controlClassName?: string;
  dataTemplateIdentity?: string;
  dataTemplateName?: string;
  disabled?: boolean;
  draggable?: boolean;
  footer?: ReactNode;
  title?: string;
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

function createStaticDragImage(name: string, actionHint: string) {
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
    "border:1px solid var(--adm-line, #d9dddf)",
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

  const actionElement = document.createElement("span");
  actionElement.textContent = actionHint;
  actionElement.style.cssText = "overflow:hidden;color:var(--adm-text-secondary, #687074);font-size:11px;line-height:16px;text-overflow:ellipsis;white-space:nowrap";

  dragImage.append(nameElement, actionElement);
  document.body.appendChild(dragImage);
  return dragImage;
}

/**
 * 页面装修与模板设计共用的目录卡片外壳。
 * 组件只统一交互骨架和可访问性；具体点击、拖拽与写入目标由各模式注入。
 */
export default function TemplateCatalogCard({
  name,
  description,
  preview,
  actionHint,
  ariaLabel,
  active,
  badge,
  className,
  compact = false,
  controlClassName,
  dataTemplateIdentity,
  dataTemplateName,
  disabled = false,
  draggable = false,
  footer,
  title,
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
    // 看起来像预览图在画布上滑动。只截取静态名称和动作提示，业务 payload
    // 仍由页面装修或模板设计各自的 onDragStart 写入。
    const dragImage = createStaticDragImage(name, actionHint);
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
    >
      <div
        className={`homepage-editor__template-card-main${controlClassName ? ` ${controlClassName}` : ""}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        aria-pressed={typeof active === "boolean" ? active : undefined}
        aria-label={ariaLabel}
        draggable={draggable && !disabled}
        title={title}
        onClick={onClick}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onKeyDown={handleKeyDown}
        onMouseDown={onMouseDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <span className="homepage-editor__template-preview-wrap">
          {preview}
          {badge ? <span className="homepage-editor__template-badge">{badge}</span> : null}
          <span className="homepage-editor__template-add">{actionHint}</span>
        </span>
        <span className="homepage-editor__template-name">{name}</span>
        <span className="homepage-editor__template-description">{description}</span>
        {footer ? <div className="homepage-editor__template-footer">{footer}</div> : null}
      </div>
      {trailingAction}
    </article>
  );
}
