import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";

export interface WorkspaceTreeRowProps {
  rowClassName?: string;
  rowProps?: Omit<HTMLAttributes<HTMLDivElement>, "children" | "className"> & {
    [key: `data-${string}`]: string | number | undefined;
  };
  buttonClassName?: string;
  buttonProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "type">;
  selected?: boolean;
  hidden?: boolean;
  children: ReactNode;
  actions?: ReactNode;
}

/**
 * 页面模块树与模板节点树共用的行外壳。
 * 业务会话只注入选择、拖拽和动作回调；组件本身不读取或写入任何 Store。
 */
export default function WorkspaceTreeRow({
  rowClassName,
  rowProps,
  buttonClassName,
  buttonProps,
  selected,
  hidden,
  children,
  actions,
}: WorkspaceTreeRowProps) {
  const stateClassName = `${selected ? " is-active" : ""}${hidden ? " is-hidden" : ""}`;
  return (
    <div
      {...rowProps}
      role={rowProps?.role ?? "none"}
      className={`page-builder__workspace-tree-row${rowClassName ? ` ${rowClassName}` : ""}${stateClassName}`}
    >
      <button
        {...buttonProps}
        type="button"
        className={`page-builder__workspace-tree-select${buttonClassName ? ` ${buttonClassName}` : ""}`}
      >
        {children}
      </button>
      {actions}
    </div>
  );
}
