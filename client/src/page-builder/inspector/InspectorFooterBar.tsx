/**
 * InspectorFooterBar.tsx — 属性面板底部固定状态栏。
 * 整页保存与发布统一留在编辑器顶部；此处只反馈草稿同步状态。
 */

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
  issueCount?: number;
  onReviewIssues?: () => void;
}

export default function InspectorFooterBar({
  hasUnsavedChanges,
  saving,
  issueCount = 0,
  onReviewIssues,
}: InspectorFooterBarProps) {
  const status = issueCount > 0
    ? "blocked"
    : saving
      ? "saving"
      : hasUnsavedChanges
        ? "dirty"
        : "saved";
  const statusTitle = saving
    ? "正在保存本地草稿"
    : issueCount > 0
      ? `当前模板有 ${issueCount} 项发布阻断`
      : hasUnsavedChanges
        ? "修改已更新，尚未保存本地草稿"
        : "已保存到本地草稿";
  const statusDescription = issueCount > 0
    ? "修复后由服务端重新核对发布资格"
    : saving
      ? "完成后可在本地预览检查结果"
      : hasUnsavedChanges
        ? "请在顶部工具栏保存整页草稿"
        : "本地预览可查看当前结果";

  return (
    <footer className="homepage-editor__properties-actions">
      <div
        className="homepage-editor__properties-status"
        data-status={status}
        role="status"
        aria-live="polite"
        aria-label={`${statusTitle}。${statusDescription}`}
        title={statusDescription}
      >
        <span aria-hidden="true" />
        <span>
          <strong>{statusTitle}</strong>
          <small>{statusDescription}</small>
        </span>
      </div>
      {issueCount > 0 && onReviewIssues ? (
        <button type="button" onClick={onReviewIssues}>
          查看阻断项
        </button>
      ) : null}
    </footer>
  );
}
