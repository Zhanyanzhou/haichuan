import { create } from "zustand";

export type VisualEditorMode = "select" | "adjust-media" | "adjust-layout";
export type VisualNodeKind = "media" | "text" | "action" | "product" | "structured";

export interface VisualNodeSelection {
  blockId: string;
  moduleType: string;
  nodeId: string;
  kind: VisualNodeKind;
}

interface VisualEditorSessionState {
  selection: VisualNodeSelection | null;
  mode: VisualEditorMode;
  panelMode: "content" | "design";
  layerCommand: {
    revision: number;
    blockId: string;
    nodeId: string;
    direction: -1 | 1;
  } | null;
  selectNode: (selection: VisualNodeSelection) => void;
  clearNode: (blockId?: string) => void;
  setMode: (mode: VisualEditorMode) => void;
  setPanelMode: (panelMode: "content" | "design") => void;
  requestLayerShift: (direction: -1 | 1) => void;
}

export const useVisualEditorSession = create<VisualEditorSessionState>((set) => ({
  selection: null,
  mode: "select",
  panelMode: "content",
  layerCommand: null,
  selectNode: (selection) =>
    set((state) => {
      const sameSelection =
        state.selection?.blockId === selection.blockId &&
        state.selection?.moduleType === selection.moduleType &&
        state.selection?.nodeId === selection.nodeId &&
        state.selection?.kind === selection.kind;
      return {
        selection: sameSelection ? state.selection : selection,
        // 点选只负责建立上下文，不能自动进入拖动/缩放模式。正在显式调整
        // 同一对象时保留模式；改选其他对象则退回安全的选择态。
        mode: sameSelection ? state.mode : "select",
      };
    }),
  clearNode: (blockId) =>
    set((state) =>
      !blockId || state.selection?.blockId === blockId
        ? { selection: null, mode: "select" }
        : state,
    ),
  setMode: (mode) => set({ mode }),
  // 切换“内容 / 设计”只改变属性面板，不替用户启动画布拖动。
  setPanelMode: (panelMode) => set({ panelMode, mode: "select" }),
  requestLayerShift: (direction) =>
    set((state) =>
      state.selection
        ? {
            layerCommand: {
              revision: (state.layerCommand?.revision ?? 0) + 1,
              blockId: state.selection.blockId,
              nodeId: state.selection.nodeId,
              direction,
            },
          }
        : state,
    ),
}));

export const CANVAS_VISUAL_EDIT_MESSAGE = "homepage-editor:visual-edit";

export interface CanvasVisualEditMessage {
  type: typeof CANVAS_VISUAL_EDIT_MESSAGE;
  blockId: string;
  moduleType: string;
  overrides: Record<string, unknown> | undefined;
  /** 拖动中的实时预览；外层应更新画布但不写入独立撤销记录。 */
  transient?: boolean;
}

export function sendCanvasVisualEdit(
  message: Omit<CanvasVisualEditMessage, "type">,
  sourceWindow: Window = window,
) {
  let targetOrigin = sourceWindow.location.origin;
  if (!targetOrigin || targetOrigin === "null") {
    try {
      targetOrigin = sourceWindow.parent.location.origin;
    } catch {
      return;
    }
  }
  const data = {
    type: CANVAS_VISUAL_EDIT_MESSAGE,
    ...message,
  } satisfies CanvasVisualEditMessage;
  const parentWindow = sourceWindow.parent;
  try {
    if (parentWindow !== sourceWindow && parentWindow.location.origin === targetOrigin) {
      parentWindow.dispatchEvent(new MessageEvent("message", {
        data,
        origin: targetOrigin,
        source: sourceWindow,
      }));
      return;
    }
  } catch {
    // 跨源画布不能读取 parent.location；继续使用浏览器原生 postMessage。
  }
  parentWindow.postMessage(data, targetOrigin);
}
