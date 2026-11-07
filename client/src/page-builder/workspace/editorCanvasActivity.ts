import { createContext, useContext } from "react";

/** 画布保留挂载时，后台读取/切页必须暂停其事件和外置 portal。 */
export const EditorCanvasActivityContext = createContext(true);

/** 实际画布与目录缩略图提供缩放值，独立大图预览与裁剪不受影响。 */
export const PageEditorMediaScaleContext = createContext<number | null>(null);

export function useEditorCanvasActive() {
  return useContext(EditorCanvasActivityContext);
}
