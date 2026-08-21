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
  selectNode: (selection: VisualNodeSelection) => void;
  clearNode: (blockId?: string) => void;
  setMode: (mode: VisualEditorMode) => void;
  setPanelMode: (panelMode: "content" | "design") => void;
}

export const useVisualEditorSession = create<VisualEditorSessionState>((set) => ({
  selection: null,
  mode: "select",
  panelMode: "content",
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
}));

export const CANVAS_VISUAL_EDIT_MESSAGE = "homepage-editor:visual-edit";

export interface CanvasVisualEditMessage {
  type: typeof CANVAS_VISUAL_EDIT_MESSAGE;
  blockId: string;
  moduleType: string;
  overrides: Record<string, unknown> | undefined;
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
  sourceWindow.parent.postMessage(
    { type: CANVAS_VISUAL_EDIT_MESSAGE, ...message } satisfies CanvasVisualEditMessage,
    targetOrigin,
  );
}
