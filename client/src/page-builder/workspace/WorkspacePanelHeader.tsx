import type { ReactNode } from "react";

export default function WorkspacePanelHeader({
  actions,
  icon,
  title,
}: {
  actions?: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="homepage-editor__panel-header" data-workspace-panel-header="shared">
      <span className="homepage-editor__region-title">
        {icon}
        {title}
      </span>
      {actions}
    </div>
  );
}
