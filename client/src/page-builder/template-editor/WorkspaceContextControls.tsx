import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  AppstoreOutlined,
  LayoutOutlined,
} from "@ant-design/icons";

type WorkspaceMode = "page" | "template";

export default function WorkspaceContextControls({
  activeMode,
  canEnterTemplate = true,
  templateDisabledReason,
  onSelectPage,
  onSelectTemplate,
}: {
  activeMode: WorkspaceMode;
  canEnterTemplate?: boolean;
  templateDisabledReason?: string;
  onSelectPage?: () => void;
  onSelectTemplate?: () => void;
}) {
  const currentLabel = activeMode === "page" ? "页面装修" : "模板设计";
  const targetMode: WorkspaceMode = activeMode === "page" ? "template" : "page";
  const targetLabel = targetMode === "template" ? "模板设计" : "页面装修";
  const targetAction = targetMode === "template" ? "进入模板设计" : "返回页面装修";
  const disabled = targetMode === "template" && !canEnterTemplate;
  const onSelect = targetMode === "template" ? onSelectTemplate : onSelectPage;
  const CurrentIcon = activeMode === "page" ? LayoutOutlined : AppstoreOutlined;

  return (
    <div className="homepage-editor__toolbar-left-context">
      <div
        className="template-editor__workspace-context"
        role="group"
        aria-label="店铺装修工作模式切换"
        data-active-mode={activeMode}
      >
        <div
          className="template-editor__workspace-identity"
          data-current-mode={activeMode}
          aria-label={`当前工作区：${currentLabel}`}
        >
          <span className="template-editor__workspace-identity-icon" aria-hidden="true">
            <CurrentIcon />
          </span>
          <span className="template-editor__workspace-identity-copy">
            <small>当前工作区</small>
            <strong>{currentLabel}</strong>
          </span>
        </div>

        <span className="template-editor__workspace-context-divider" aria-hidden="true" />

        <button
          type="button"
          className="template-editor__workspace-navigation"
          data-target-mode={targetMode}
          aria-label={targetLabel}
          disabled={disabled}
          title={disabled ? templateDisabledReason : `切换到${targetLabel}`}
          onClick={onSelect}
        >
          {targetMode === "page" ? <ArrowLeftOutlined aria-hidden="true" /> : null}
          <span>{targetAction}</span>
          {targetMode === "template" ? <ArrowRightOutlined aria-hidden="true" /> : null}
        </button>
      </div>
    </div>
  );
}
