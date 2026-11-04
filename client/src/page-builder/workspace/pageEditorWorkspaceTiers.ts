/** 页面装修侧栏档位。断点权威在 docs/UI_GUIDE.md A.5，这里只放计算。 */

export const PAGE_EDITOR_CANVAS_FLOOR = 640;
export const PAGE_EDITOR_RAIL_WIDTH = 40;
export const PAGE_EDITOR_NAVIGATION_WIDTH = 208;

export const PAGE_EDITOR_LIBRARY_DOCK_MIN_WIDTH = 1440;
export const PAGE_EDITOR_STRUCTURE_DOCK_MIN_WIDTH = 1200;

export const PAGE_EDITOR_LIBRARY_DOCK_QUERY =
  `(min-width: ${PAGE_EDITOR_LIBRARY_DOCK_MIN_WIDTH}px)`;
export const PAGE_EDITOR_STRUCTURE_DOCK_QUERY =
  `(min-width: ${PAGE_EDITOR_STRUCTURE_DOCK_MIN_WIDTH}px)`;

export type PageEditorPanelSpan = "rail" | "dock";

export type PageEditorPanelLayout = {
  library: PageEditorPanelSpan;
  structure: PageEditorPanelSpan;
  inspector: PageEditorPanelSpan;
};

const LIBRARY_DOCK = { min: 220, ratio: 0.16, max: 280 };
const STRUCTURE_DOCK = { min: 144, ratio: 0.11, max: 184 };
const INSPECTOR_DOCK = { min: 300, ratio: 0.25, max: 440 };

export function editorDockSpan(
  viewportWidth: number,
  min: number,
  ratio: number,
  max: number,
) {
  return Math.min(max, Math.max(min, viewportWidth * ratio));
}

export function pageEditorCanvasColumn(
  viewportWidth: number,
  panels: PageEditorPanelLayout,
  navigationOpen = false,
) {
  const library = panels.library === "dock"
    ? editorDockSpan(viewportWidth, LIBRARY_DOCK.min, LIBRARY_DOCK.ratio, LIBRARY_DOCK.max)
    : PAGE_EDITOR_RAIL_WIDTH;
  const structure = navigationOpen
    ? 0
    : panels.structure === "dock"
      ? editorDockSpan(viewportWidth, STRUCTURE_DOCK.min, STRUCTURE_DOCK.ratio, STRUCTURE_DOCK.max)
      : PAGE_EDITOR_RAIL_WIDTH;
  const inspector = panels.inspector === "dock"
    ? editorDockSpan(viewportWidth, INSPECTOR_DOCK.min, INSPECTOR_DOCK.ratio, INSPECTOR_DOCK.max)
    : PAGE_EDITOR_RAIL_WIDTH;
  const navigation = navigationOpen ? PAGE_EDITOR_NAVIGATION_WIDTH : 0;
  return viewportWidth - navigation - library - structure - inspector;
}

export function pageEditorDockFits(
  viewportWidth: number,
  panels: PageEditorPanelLayout,
  navigationOpen = false,
) {
  return pageEditorCanvasColumn(viewportWidth, panels, navigationOpen)
    >= PAGE_EDITOR_CANVAS_FLOOR;
}

function panelIsDocked(element: Element | null, collapsedClass: string) {
  return element !== null
    && !element.classList.contains(collapsedClass)
    && !element.classList.contains("is-dock-overlay");
}

export function readPageEditorPanelLayout(
  root: ParentNode = document,
): PageEditorPanelLayout {
  const library = root.querySelector(
    ".homepage-editor__body:not(.template-editor__body) > .homepage-editor__library",
  );
  const structure = root.querySelector(
    ".homepage-editor__body:not(.template-editor__body) > .homepage-editor__structure-workspace",
  );
  const inspector = root.querySelector(
    ".homepage-editor__body:not(.template-editor__body) > .homepage-editor__right-workspace",
  );
  return {
    library: panelIsDocked(library, "homepage-editor__library--collapsed") ? "dock" : "rail",
    structure: panelIsDocked(structure, "is-collapsed") ? "dock" : "rail",
    inspector: panelIsDocked(inspector, "is-inspector-collapsed") ? "dock" : "rail",
  };
}

export function pageEditorNavigationOpen() {
  return document.querySelector(".admin-shell-v7.is-editor-navigation-open") !== null;
}

export function pageEditorPanelWouldFit(
  panel: keyof PageEditorPanelLayout,
  viewportWidth = window.innerWidth,
) {
  const current = readPageEditorPanelLayout();
  return pageEditorDockFits(
    viewportWidth,
    { ...current, [panel]: "dock" },
    pageEditorNavigationOpen(),
  );
}
