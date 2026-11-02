import type { ReactNode } from "react";
import type { PublishValidationIssue } from "./publishValidation";

type WarningModal = {
  warning: (config: {
    title: string;
    content: ReactNode;
    okText: string;
  }) => void;
};

export function formatPublishReminderLabel(warningCount: number) {
  return `${warningCount} 项提醒`;
}

export function formatPublishReminderTitle(warningCount: number) {
  return `不影响发布的提醒 · ${warningCount} 项`;
}

export function openNonBlockingPublishReminder(
  modal: WarningModal,
  issues: readonly PublishValidationIssue[],
) {
  const warnings = issues.filter((issue) => issue.severity === "warning");
  modal.warning({
    title: formatPublishReminderTitle(warnings.length),
    content: (
      <div className="homepage-editor__publish-issue-list">
        <p>这些提示不会阻止发布。</p>
        {warnings.map((issue, index) => (
          <p key={`${issue.path ?? ""}-${issue.message}-${index}`}>
            <strong>提醒：</strong>{issue.message}
          </p>
        ))}
      </div>
    ),
    okText: "知道了",
  });
}

export function resolvePublishIssueReviewAction(options: {
  errorCount: number;
  warningCount: number;
  issues: readonly PublishValidationIssue[];
  onOpenPublishReview?: () => void;
  modal: WarningModal;
}): (() => void) | undefined {
  // 无阻断项时不挂复核入口；有阻断但调用方未提供复核回调时也不伪造按钮。
  if (options.errorCount > 0) return options.onOpenPublishReview;
  if (options.warningCount > 0) {
    return () => openNonBlockingPublishReminder(options.modal, options.issues);
  }
  return undefined;
}
