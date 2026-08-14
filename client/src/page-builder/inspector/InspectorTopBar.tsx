/**
 * InspectorTopBar.tsx — Schema 面板顶部上下文栏。
 * 只保留必要上下文：模块类型徽标 / 模块名（重命名）/ 设备标识 /
 * 本模块保存状态 / 关闭 / 更多菜单。
 */
import { MoreOutlined, CloseOutlined } from "@ant-design/icons";
import { Dropdown } from "antd";
import type { EditorAction } from "./InspectorFooterBar";

interface InspectorTopBarProps {
  displayName: string;
  moduleName: string;
  deviceLabel: string;
  dirty: boolean;
  onClose: () => void;
  onRename: (moduleName: string) => void;
  actions: EditorAction[];
}

export default function InspectorTopBar({
  displayName,
  moduleName,
  deviceLabel,
  dirty,
  onClose,
  onRename,
  actions,
}: InspectorTopBarProps) {
  const menuItems = [
    {
      key: "rename",
      label: "重命名模块",
      onClick: () => {
        const next = window.prompt("模块名称", moduleName || displayName);
        if (next !== null && next.trim()) onRename(next.trim());
      },
    },
    ...actions.map(({ onClick, ...action }) => ({ ...action, onClick })),
  ];

  return (
    <header className="homepage-editor__inspector-header">
      <span className="homepage-editor__inspector-eyebrow">{displayName}</span>
      <strong className="homepage-editor__inspector-title">
        {moduleName || displayName}
      </strong>
      <span
        className="homepage-editor__inspector-device"
        title={dirty ? "本模块有未保存修改" : undefined}
      >
        {dirty ? "已修改 · " : ""}
        {deviceLabel}
      </span>
      <Dropdown
        trigger={["click"]}
        placement="bottomRight"
        menu={{
          items: menuItems.map(({ onClick, ...item }) => item),
          onClick: ({ key }) =>
            menuItems.find((item) => item.key === key)?.onClick?.(),
        }}
      >
        <button
          type="button"
          className="homepage-editor__close-panel"
          aria-label="更多模块操作"
        >
          <MoreOutlined />
        </button>
      </Dropdown>
      <button
        type="button"
        className="homepage-editor__close-panel"
        aria-label="收起模块设置"
        onClick={onClose}
      >
        <CloseOutlined />
      </button>
    </header>
  );
}
