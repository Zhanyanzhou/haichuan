/**
 * InspectorTopBar.tsx — Schema 面板顶部上下文栏。
 * 只保留必要上下文：模块类型徽标 / 模块名（重命名）/ 设备标识 /
 * 本模块保存状态 / 退出模块编辑 / 更多菜单。
 */
import { ArrowLeftOutlined, MoreOutlined } from "@ant-design/icons";
import { Dropdown } from "antd";
import type { EditorAction } from "./InspectorFooterBar";

interface InspectorTopBarProps {
  displayName: string;
  moduleName: string;
  deviceLabel: string;
  dirty: boolean;
  onClose: () => void;
  actions: EditorAction[];
}

export default function InspectorTopBar({
  displayName,
  moduleName,
  deviceLabel,
  dirty,
  onClose,
  actions,
}: InspectorTopBarProps) {
  // 重命名统一走「内容」区的图层名称字段,不再提供 prompt 弹窗入口
  const menuItems = actions.map(({ onClick, ...action }) => ({ ...action, onClick }));

  return (
    <header className="homepage-editor__inspector-header">
      {/* 眉标=模块类型名;仅当运营改过名(与类型名不同)时显示,避免默认态上下两行重复同一文本 */}
      {moduleName && moduleName !== displayName ? (
        <span className="homepage-editor__inspector-eyebrow">{displayName}</span>
      ) : null}
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
        className="homepage-editor__exit-module"
        aria-label="退出当前模块编辑"
        title="退出当前模块编辑"
        onClick={onClose}
      >
        <ArrowLeftOutlined />
        <span>退出</span>
      </button>
    </header>
  );
}
