import { LeftOutlined, RightOutlined } from "@ant-design/icons";

export default function WorkspacePanelCollapseButton({
  action,
  panel,
  panelLabel,
  onClick,
}: {
  action: "collapse" | "expand";
  panel: "structure" | "inspector";
  panelLabel: string;
  onClick: () => void;
}) {
  const expanding = action === "expand";
  const pointsRight = panel === "structure" ? expanding : !expanding;
  const actionLabel = expanding ? "展开" : "收起";
  return (
    <button
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
    </button>
  );
}
