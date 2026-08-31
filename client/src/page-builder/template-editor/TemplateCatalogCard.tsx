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
        onDragStart={onDragStart}
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
