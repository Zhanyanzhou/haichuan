import type { ReactNode } from "react";

type WorkspaceMode = "page" | "template";

export default function WorkspaceContextControls({
  activeMode,
  canEnterTemplate = true,
  templateDisabledReason,
  subjectLabel,
  subjectValue,
  status,
  onSelectPage,
  onSelectTemplate,
}: {
  activeMode: WorkspaceMode;
  canEnterTemplate?: boolean;
  templateDisabledReason?: string;
  subjectLabel?: string;
  subjectValue?: string;
  status?: ReactNode;
  onSelectPage?: () => void;
  onSelectTemplate?: () => void;
}) {
  const currentLabel = activeMode === "page" ? "页面装修" : "模板设计";
  const subjectAriaLabel = subjectValue
    ? `当前工作区：${currentLabel}，${subjectLabel ?? "当前对象"}：${subjectValue}`
    : `当前工作区：${currentLabel}`;

  return (
    <div className="homepage-editor__toolbar-left-context">
      <div
        className="template-editor__workspace-context"
        role="group"
        aria-label="店铺装修工作模式切换"
        data-active-mode={activeMode}
        data-current-label={currentLabel}
      >
        <div
          className="template-editor__workspace-mode-switch"
          aria-label={subjectAriaLabel}
        >
          <button
            type="button"
            className={`template-editor__workspace-navigation${activeMode === "page" ? " is-active" : ""}`}
            data-mode="page"
            aria-pressed={activeMode === "page"}
            aria-current={activeMode === "page" ? "page" : undefined}
            title={activeMode === "page" ? "当前界面：页面装修" : "返回页面装修"}
            onClick={activeMode === "template" ? onSelectPage : undefined}
          >
            页面装修
          </button>
          <button
            type="button"
            className={`template-editor__workspace-navigation${activeMode === "template" ? " is-active" : ""}`}
            data-mode="template"
            aria-pressed={activeMode === "template"}
            aria-current={activeMode === "template" ? "page" : undefined}
            disabled={activeMode === "page" && !canEnterTemplate}
            title={activeMode === "template"
              ? "当前界面：模板设计"
              : !canEnterTemplate
                ? templateDisabledReason
                : "进入模板设计"}
            onClick={activeMode === "page" ? onSelectTemplate : undefined}
          >
            模板设计
          </button>
        </div>
        {subjectValue ? (
          <>
            <span className="template-editor__workspace-context-divider" aria-hidden="true" />
            <div className="template-editor__workspace-identity">
              <span className="template-editor__workspace-identity-subject" title={subjectValue}>
                {subjectValue}
              </span>
            </div>
          </>
        ) : null}
        {status}
      </div>
    </div>
  );
}
