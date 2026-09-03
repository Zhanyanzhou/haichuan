import {
  EyeOutlined,
  MoreOutlined,
  RedoOutlined,
  SaveOutlined,
  SendOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { Button, Dropdown, type MenuProps } from "antd";
import type { ReactNode } from "react";

export type WorkspaceStatusMode =
  | "saving"
  | "dirty"
  | "pending"
  | "clean"
  | "readonly"
  | "error"
  | "conflict";

export function WorkspaceStatusBadge({
  mode,
  label,
  detail,
  ariaLabel,
  className,
}: {
  mode: WorkspaceStatusMode;
  label: string;
  detail?: string | null;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      className={`homepage-editor__workspace-status${className ? ` ${className}` : ""}`}
      data-mode={mode}
      role="status"
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      {mode === "dirty" ? (
        <i className="homepage-editor__draft-status-dot" aria-hidden="true" />
      ) : null}
      <span>{label}</span>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export interface WorkspaceDeviceOption<TValue extends string> {
  value: TValue;
  label: string;
  detail: string;
  icon: ReactNode;
  ariaLabel: string;
  title?: string;
}

export function WorkspaceDeviceSwitcher<TValue extends string>({
  ariaLabel,
  title,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  title?: string;
  value: TValue;
  options: WorkspaceDeviceOption<TValue>[];
  onChange: (value: TValue) => void;
}) {
  return (
    <div
      className="homepage-editor__viewport-switcher"
      aria-label={ariaLabel}
      title={title}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? "is-active" : ""}
          aria-pressed={value === option.value}
          aria-label={option.ariaLabel}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span>
            {option.label}
            <small>{option.detail}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

interface ToolbarButtonConfig {
  label: string;
  ariaLabel: string;
  title?: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  icon?: ReactNode;
}

interface PreviewButtonConfig extends ToolbarButtonConfig {
  active: boolean;
}

interface MoreButtonConfig {
  items: MenuProps["items"];
  onClick: NonNullable<MenuProps["onClick"]>;
  ariaLabel: string;
  title?: string;
  danger?: boolean;
  disabled?: boolean;
}

export function WorkspaceToolbarActions({
  leading,
  history,
  preview,
  save,
  more,
  publish,
}: {
  leading?: ReactNode;
  history: {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
  };
  preview: PreviewButtonConfig;
  save: ToolbarButtonConfig;
  more: MoreButtonConfig;
  publish: ToolbarButtonConfig;
}) {
  return (
    <div className="homepage-editor__toolbar-actions">
      {leading}
      <div className="homepage-editor__toolbar-history" role="group" aria-label="撤销与重做">
        <Button
          size="small"
          icon={<UndoOutlined />}
          disabled={!history.canUndo}
          onClick={history.onUndo}
          aria-label="撤销"
          title="撤销（Ctrl+Z）"
        />
        <Button
          size="small"
          icon={<RedoOutlined />}
          disabled={!history.canRedo}
          onClick={history.onRedo}
          aria-label="重做"
          title="重做（Ctrl+Shift+Z）"
        />
      </div>
      <Button
        className="homepage-editor__toolbar-preview"
        size="small"
        type={preview.active ? "primary" : "default"}
        icon={preview.icon ?? <EyeOutlined />}
        loading={preview.loading}
        disabled={preview.disabled}
        onClick={preview.onClick}
        aria-pressed={preview.active}
        aria-label={preview.ariaLabel}
        title={preview.title}
      >
        {preview.label}
      </Button>
      <div className="homepage-editor__toolbar-secondary-actions">
        <Button
          size="small"
          icon={save.icon ?? <SaveOutlined />}
          loading={save.loading}
          disabled={save.disabled}
          onClick={save.onClick}
          aria-label={save.ariaLabel}
          title={save.title}
        >
          {save.label}
        </Button>
      </div>
      <Dropdown
        trigger={["click"]}
        placement="bottomRight"
        disabled={more.disabled}
        menu={{ items: more.items, onClick: more.onClick }}
      >
        <Button
          className="homepage-editor__toolbar-more"
          size="small"
          danger={more.danger}
          disabled={more.disabled}
          icon={<MoreOutlined />}
          aria-label={more.ariaLabel}
          title={more.title}
        >
          更多
        </Button>
      </Dropdown>
      <Button
        className="homepage-editor__toolbar-publish"
        size="small"
        type="primary"
        icon={publish.icon ?? <SendOutlined />}
        loading={publish.loading}
        disabled={publish.disabled}
        onClick={publish.onClick}
        aria-label={publish.ariaLabel}
        title={publish.title}
      >
        {publish.label}
      </Button>
    </div>
  );
}
