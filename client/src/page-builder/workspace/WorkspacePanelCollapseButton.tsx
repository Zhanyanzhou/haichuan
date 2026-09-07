import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { forwardRef } from "react";

const WorkspacePanelCollapseButton = forwardRef<HTMLButtonElement, {
  action: "collapse" | "expand";
  panel: "structure" | "inspector";
  panelLabel: string;
  compactLabel?: string;
  onClick: () => void;
}>(function WorkspacePanelCollapseButton({
  action,
  panel,
  panelLabel,
  compactLabel,
  onClick,
}, ref) {
  const expanding = action === "expand";
  const pointsRight = panel === "structure" ? expanding : !expanding;
  const actionLabel = expanding ? "展开" : "收起";
  return (
    <button
      ref={ref}
      type="button"
      className={`homepage-editor__${panel}-${action}-btn admin-panel-collapse-toggle`}
      onClick={onClick}
      title={`${actionLabel}${panelLabel}`}
      aria-label={`${actionLabel}${panelLabel}`}
      data-workspace-panel-collapse="shared"
      data-panel={panel}
      data-action={action}
    >
      {pointsRight ? <RightOutlined /> : <LeftOutlined />}
      {compactLabel ? (
        <span className="homepage-editor__compact-panel-label">{compactLabel}</span>
      ) : null}
    </button>
  );
});

export default WorkspacePanelCollapseButton;
