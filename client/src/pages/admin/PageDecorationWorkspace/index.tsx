import { useId, type ReactNode } from "react";

import FourZoneWorkspaceShell, {
  type FourZoneCollapsibleRegion,
} from "@/page-builder/workspace/FourZoneWorkspaceShell";

export interface PageDecorationWorkspaceProps {
  pageName: string;
  pageToolbar: ReactNode;
  templateInstanceLibrary: ReactNode;
  pageLayerTree: ReactNode;
  pageCanvas: ReactNode;
  pageInspector: ReactNode;
  defaultCollapsedPanels?: readonly FourZoneCollapsibleRegion[];
}

export default function PageDecorationWorkspace({
  pageName,
  pageToolbar,
  templateInstanceLibrary,
  pageLayerTree,
  pageCanvas,
  pageInspector,
  defaultCollapsedPanels,
}: PageDecorationWorkspaceProps) {
  const titleId = useId();

  return (
    <section
      className="page-decoration-workspace"
      aria-labelledby={titleId}
      data-workspace-root="page-decoration"
    >
      <header className="page-decoration-workspace__header">
        <div className="page-decoration-workspace__identity">
          <span>页面装修</span>
          <h1 id={titleId}>{pageName}</h1>
        </div>
        <div className="page-decoration-workspace__toolbar">
          {pageToolbar}
        </div>
      </header>
      <FourZoneWorkspaceShell
        ariaLabel={`${pageName}页面装修工作区`}
        className="page-decoration-workspace__body"
        library={{
          label: "模板实例库",
          content: templateInstanceLibrary,
        }}
        tree={{
          label: "页面图层",
          content: pageLayerTree,
          collapsedSummary: "页面图层已收起",
        }}
        canvas={{
          label: "页面预览画布",
          content: pageCanvas,
        }}
        inspector={{
          label: "页面内容与实例属性",
          content: pageInspector,
          collapsedSummary: "页面属性已收起",
        }}
        defaultCollapsedRegions={defaultCollapsedPanels}
      />
    </section>
  );
}
