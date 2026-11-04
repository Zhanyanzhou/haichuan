import type { TemplateBreakpoint } from "../template-definition/responsive";
import type { TemplateEditorDevice } from "./types";

/** 画布查看的设备必须和正在写入的一端相同。平板不是内容端点，按桌面写入。 */
export function editingGeometryDiverged(
  device: TemplateEditorDevice,
  breakpoint: TemplateBreakpoint,
): boolean {
  return device !== (breakpoint === "mobile" ? "mobile" : "desktop");
}

/** 退出预览时原样放回进入前的设备、断点和观察宽度，不经过会改写断点的设备切换。 */
export function previewExitGeometry(snapshot: {
  device: TemplateEditorDevice;
  breakpoint: TemplateBreakpoint;
  previewWidth: number | null;
}) {
  return {
    device: snapshot.device,
    breakpoint: snapshot.breakpoint,
    previewWidth: snapshot.previewWidth,
  };
}
