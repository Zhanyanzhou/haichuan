import { create } from "zustand";

export type VisualEditorMode = "select" | "adjust-media" | "adjust-layout";
export type VisualNodeKind = "media" | "text" | "action" | "product" | "structured";

export interface VisualNodeSelection {
  blockId: string;
  moduleType: string;
  nodeId: string;
  kind: VisualNodeKind;
}

export interface VisualCanvasGeometrySnapshot {
  blockId: string;
  moduleType: string;
  viewport: "desktop" | "mobile";
  frameAspectRatio: number;
  nodes: Record<string, {
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

function sameCanvasGeometry(
  current: VisualCanvasGeometrySnapshot | undefined,
  next: VisualCanvasGeometrySnapshot,
) {
  if (!current || current.frameAspectRatio !== next.frameAspectRatio) return false;
  const currentEntries = Object.entries(current.nodes);
  const nextEntries = Object.entries(next.nodes);
  if (currentEntries.length !== nextEntries.length) return false;
  return nextEntries.every(([nodeId, rect]) => {
    const previous = current.nodes[nodeId];
    return previous && previous.x === rect.x && previous.y === rect.y &&
      previous.width === rect.width && previous.height === rect.height;
  });
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
  contentActionRequest: {
    revision: number;
    blockId: string;
    nodeId: string;
    kind: VisualNodeKind;
  } | null;
  canvasGeometryByBlock: Record<string, Partial<Record<"desktop" | "mobile", VisualCanvasGeometrySnapshot>>>;
  selectNode: (selection: VisualNodeSelection) => void;
  clearNode: (blockId?: string) => void;
  setMode: (mode: VisualEditorMode) => void;
  setPanelMode: (panelMode: "content" | "design") => void;
  requestLayerShift: (direction: -1 | 1) => void;
  requestContentAction: (selection: VisualNodeSelection) => void;
  reportCanvasGeometry: (snapshot: VisualCanvasGeometrySnapshot) => void;
}

export const useVisualEditorSession = create<VisualEditorSessionState>((set) => ({
  selection: null,
  mode: "select",
  panelMode: "content",
  layerCommand: null,
  contentActionRequest: null,
  canvasGeometryByBlock: {},
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
        mode: sameSelection
          ? state.mode
          : state.panelMode === "design"
            ? "adjust-layout"
            : "select",
      };
    }),
  clearNode: (blockId) =>
    set((state) =>
      !blockId || state.selection?.blockId === blockId
        ? { selection: null, mode: "select" }
        : state,
    ),
  setMode: (mode) => set({ mode }),
  setPanelMode: (panelMode) => set({
    panelMode,
    mode: panelMode === "design" ? "adjust-layout" : "select",
  }),
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
  requestContentAction: (selection) =>
    set((state) => ({
      contentActionRequest: {
        revision: (state.contentActionRequest?.revision ?? 0) + 1,
        blockId: selection.blockId,
        nodeId: selection.nodeId,
        kind: selection.kind,
      },
    })),
  reportCanvasGeometry: (snapshot) =>
    set((state) => {
      const blockGeometry = state.canvasGeometryByBlock[snapshot.blockId] ?? {};
      if (sameCanvasGeometry(blockGeometry[snapshot.viewport], snapshot)) return state;
      return {
        canvasGeometryByBlock: {
          ...state.canvasGeometryByBlock,
          [snapshot.blockId]: {
            ...blockGeometry,
            [snapshot.viewport]: snapshot,
          },
        },
      };
    }),
}));

export const CANVAS_VISUAL_EDIT_MESSAGE = "homepage-editor:visual-edit";

export interface CanvasVisualEditMessage {
  type: typeof CANVAS_VISUAL_EDIT_MESSAGE;
  blockId: string;
  moduleType: string;
  overrides: Record<string, unknown> | undefined;
  /** 拖动中的实时预览；外层应更新画布但不写入独立撤销记录。 */
  transient?: boolean;
  /** 取消当前手势；外层应恢复该手势开始时的完整 PageDocument。 */
  cancelled?: boolean;
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
