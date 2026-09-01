/**
 * InspectorFooterBar.tsx — 属性面板底部固定状态栏。
 * 整页保存与发布统一留在编辑器顶部；此处只反馈草稿同步状态。
 */

import type { PublishValidationStatus } from "./publishValidation";

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
  errorCount?: number;
  warningCount?: number;
  onReviewIssues?: () => void;
  validationStatus?: PublishValidationStatus;
  onRetryValidation?: () => void;
}

export default function InspectorFooterBar({
  hasUnsavedChanges,
  saving,
  errorCount = 0,
  warningCount = 0,
  onReviewIssues,
  validationStatus = "idle",
  onRetryValidation,
}: InspectorFooterBarProps) {
  // 草稿持久化与发布资格是两条独立状态流。保存中的反馈不能被发布提醒覆盖。
  const status = saving ? "saving" : hasUnsavedChanges ? "dirty" : "saved";
  const statusTitle = saving
    ? "正在保存页面草稿"
    : hasUnsavedChanges
      ? "修改已更新，尚未保存页面草稿"
      : "页面草稿已保存";
  const statusDescription = saving
    ? "完成后可在预览中检查结果"
    : hasUnsavedChanges
      ? "请在顶部工具栏保存整页草稿"
      : "预览可查看当前草稿结果";
  const issueCount = errorCount + warningCount;
  const validationLabel = validationStatus === "validating"
    ? "正在检查发布资格…"
    : validationStatus === "unverified"
      ? "Mock 模式 · 发布资格未验证"
    : validationStatus === "unavailable"
      ? "发布检查不可用 · 重试"
      : errorCount > 0
        ? `${errorCount} 项发布阻断`
        : warningCount > 0
          ? `${warningCount} 项待检查`
          : validationStatus === "valid"
            ? "发布检查已通过"
            : null;

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
      {validationLabel ? (
        validationStatus === "unavailable" && onRetryValidation ? (
          <button type="button" onClick={onRetryValidation} data-validation-status="unavailable">
            {validationLabel}
          </button>
        ) : issueCount > 0 && onReviewIssues ? (
          <button type="button" onClick={onReviewIssues} data-validation-status={validationStatus}>
            {validationLabel}
          </button>
        ) : (
          <span className="homepage-editor__properties-validation" data-validation-status={validationStatus}>
            {validationLabel}
          </span>
        )
      ) : null}
    </footer>
  );
}
