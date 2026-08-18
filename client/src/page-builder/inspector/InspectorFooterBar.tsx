/**
 * InspectorFooterBar.tsx — Schema 面板底部固定操作栏。
 * 右栏修改会立即同步画布，但只在用户明确点击后保存整页草稿。
 */
import { Button } from "antd";

/** 更多菜单可挂载的模块级操作（复制/隐藏/恢复默认/删除等，P5 逐步补齐） */
export interface EditorAction {
  key: string;
  label: string;
  danger?: boolean;
  onClick: () => void;
}

interface InspectorFooterBarProps {
  hasUnsavedChanges: boolean;
  saving: boolean;
  onSaveDraft: () => void;
}

export default function InspectorFooterBar({
  hasUnsavedChanges,
  saving,
  onSaveDraft,
}: InspectorFooterBarProps) {
  return (
    <footer className="homepage-editor__properties-actions">
      <span role="status" aria-live="polite">
        {saving
          ? "正在保存页面草稿…"
          : hasUnsavedChanges
            ? "已同步到画布，尚未保存草稿"
            : "页面草稿已保存"}
      </span>
      <Button
        type="primary"
        loading={saving}
        disabled={!hasUnsavedChanges}
        onClick={onSaveDraft}
      >
        保存草稿
      </Button>
    </footer>
  );
}
