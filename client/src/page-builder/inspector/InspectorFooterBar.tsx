/**
 * InspectorFooterBar.tsx — Schema 面板底部固定操作栏。
 * 保存统一走顶栏「保存草稿」与 2 秒静默自动保存；本栏只负责撤销本模块未保存修改。
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
  dirty: boolean;
  onRevert: () => void;
}

export default function InspectorFooterBar({
  dirty,
  onRevert,
}: InspectorFooterBarProps) {
  return (
    <footer className="homepage-editor__properties-actions">
      <span>修改自动保存为草稿；正式发布在顶部工具栏</span>
      <Button size="small" disabled={!dirty} onClick={onRevert}>
        撤销修改
      </Button>
    </footer>
  );
}

