/** 页面装修四列工作台的逻辑宽度。 */
export const PAGE_EDITOR_DESKTOP_LAYOUT_WIDTH = 1440;

export function readPageEditorWorkspaceScale(element: Element) {
  const shell = element.closest(".admin-shell-v7");
  return shell ? Number(getComputedStyle(shell).zoom) || 1 : 1;
}
