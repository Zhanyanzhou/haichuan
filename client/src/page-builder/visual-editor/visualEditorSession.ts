import { create } from "zustand";

export type VisualEditorMode = "select" | "adjust-media" | "adjust-layout";
export type VisualNodeKind = "media" | "text" | "action" | "product" | "structured";
export type VisualEditorWorkspace = "page" | "template";

export interface VisualNodeSelection {
  blockId: string;
  moduleType: string;
  nodeId: string;
  kind: VisualNodeKind;
  canAdjustLayout?: boolean;
  canAdjustMedia?: boolean;
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
  workspace: VisualEditorWorkspace;
  workspaceSnapshots: Record<VisualEditorWorkspace, VisualWorkspaceSnapshot>;
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
  clearCanvasGeometry: (blockId: string) => void;
  activateWorkspace: (workspace: VisualEditorWorkspace) => void;
  resetWorkspaceContext: (workspace: VisualEditorWorkspace) => void;
}

interface VisualWorkspaceSnapshot {
  selection: VisualNodeSelection | null;
  mode: VisualEditorMode;
  panelMode: "content" | "design";
}

const PAGE_VISUAL_WORKSPACE: VisualWorkspaceSnapshot = {
  selection: null,
  mode: "select",
  panelMode: "content",
};

const TEMPLATE_VISUAL_WORKSPACE: VisualWorkspaceSnapshot = {
  selection: null,
  mode: "adjust-layout",
  panelMode: "design",
};

export const useVisualEditorSession = create<VisualEditorSessionState>((set) => ({
  workspace: "page",
  workspaceSnapshots: {
    page: PAGE_VISUAL_WORKSPACE,
    template: TEMPLATE_VISUAL_WORKSPACE,
  },
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
        state.selection?.kind === selection.kind &&
        state.selection?.canAdjustLayout === selection.canAdjustLayout &&
        state.selection?.canAdjustMedia === selection.canAdjustMedia;
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
        ? {
            selection: null,
            mode: "select",
            layerCommand: null,
            contentActionRequest: null,
          }
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
  clearCanvasGeometry: (blockId) =>
    set((state) => {
      if (!state.canvasGeometryByBlock[blockId]) return state;
      const nextGeometry = { ...state.canvasGeometryByBlock };
      delete nextGeometry[blockId];
      return { canvasGeometryByBlock: nextGeometry };
    }),
  activateWorkspace: (workspace) =>
    set((state) => {
      if (state.workspace === workspace) return state;
      const currentSnapshot: VisualWorkspaceSnapshot = {
        selection: state.selection,
        mode: state.mode,
        panelMode: state.panelMode,
      };
      const nextSnapshot = state.workspaceSnapshots[workspace];
      return {
        workspace,
        workspaceSnapshots: {
          ...state.workspaceSnapshots,
          [state.workspace]: currentSnapshot,
        },
        ...nextSnapshot,
        layerCommand: null,
        contentActionRequest: null,
      };
    }),
  resetWorkspaceContext: (workspace) =>
    set((state) => {
      const resetSnapshot = workspace === "template"
        ? TEMPLATE_VISUAL_WORKSPACE
        : PAGE_VISUAL_WORKSPACE;
      if (state.workspace === workspace) {
        return {
          ...resetSnapshot,
          layerCommand: null,
          contentActionRequest: null,
        };
      }
      return {
        workspaceSnapshots: {
          ...state.workspaceSnapshots,
          [workspace]: resetSnapshot,
        },
      };
    }),
}));

export const CANVAS_VISUAL_EDIT_MESSAGE = "homepage-editor:visual-edit";
export const CANVAS_SHARED_VISUAL_PREVIEW_MESSAGE = "homepage-editor:shared-visual-preview";
export const CANVAS_DYNAMIC_LAYOUT_EDIT_MESSAGE = "homepage-editor:dynamic-layout-edit";
export const CANVAS_TEMPLATE_HISTORY_MESSAGE = "homepage-editor:template-history";

export interface CanvasSharedVisualPreviewMessage {
  type: typeof CANVAS_SHARED_VISUAL_PREVIEW_MESSAGE;
  moduleType: string;
  overrides?: Record<string, unknown>;
}

export interface CanvasVisualEditMessage {
  type: typeof CANVAS_VISUAL_EDIT_MESSAGE;
  workspace: VisualEditorWorkspace;
  templateSessionId?: string;
  blockId: string;
  moduleType: string;
  overrides: Record<string, unknown> | undefined;
  /** 拖动中的实时预览；外层应更新画布但不写入独立撤销记录。 */
  transient?: boolean;
  /** 取消当前手势；外层应恢复该手势开始时的完整 PageDocument。 */
  cancelled?: boolean;
}

export interface CanvasDynamicLayoutEditMessage {
  type: typeof CANVAS_DYNAMIC_LAYOUT_EDIT_MESSAGE;
  workspace: "page";
  instanceId: string;
  nodeId: string;
  device: "desktop" | "mobile";
  override?: {
    offsetXPercent?: number;
    offsetYPercent?: number;
    widthPercent?: number;
    zIndex?: number;
  };
}

export interface CanvasTemplateHistoryMessage {
  type: typeof CANVAS_TEMPLATE_HISTORY_MESSAGE;
  workspace: "template";
  templateSessionId: string;
  blockId: string;
  direction: "back" | "forward";
}

export function sendCanvasTemplateHistory(
  message: Omit<CanvasTemplateHistoryMessage, "type" | "workspace" | "templateSessionId">,
  sourceWindow: Window = window,
) {
  if (!message.blockId.startsWith("template-editor:")) return;
  let targetOrigin = sourceWindow.location.origin;
  if (!targetOrigin || targetOrigin === "null") {
    try {
      targetOrigin = sourceWindow.parent.location.origin;
    } catch {
      return;
    }
  }
  const data = {
    type: CANVAS_TEMPLATE_HISTORY_MESSAGE,
    workspace: "template",
    templateSessionId: message.blockId.slice("template-editor:".length),
    ...message,
  } satisfies CanvasTemplateHistoryMessage;
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
    // 跨源隔离画布不能读取 parent.location；继续使用原生 postMessage。
  }
  parentWindow.postMessage(data, targetOrigin);
}

export function sendCanvasVisualEdit(
  message: Omit<CanvasVisualEditMessage, "type" | "workspace" | "templateSessionId">,
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
  const templateSessionId = message.blockId.startsWith("template-editor:")
    ? message.blockId.slice("template-editor:".length)
    : undefined;
  const data = {
    type: CANVAS_VISUAL_EDIT_MESSAGE,
    workspace: templateSessionId ? "template" : "page",
    ...(templateSessionId ? { templateSessionId } : {}),
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

/** V2 页面实例的几何提交；只写 layoutOverridesByNodeId，不复用旧视觉覆盖字段。 */
export function sendDynamicTemplateLayoutEdit(
  message: Omit<CanvasDynamicLayoutEditMessage, "type" | "workspace">,
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
    type: CANVAS_DYNAMIC_LAYOUT_EDIT_MESSAGE,
    workspace: "page",
    ...message,
  } satisfies CanvasDynamicLayoutEditMessage;
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
    // 跨源画布继续使用浏览器原生 postMessage。
  }
  parentWindow.postMessage(data, targetOrigin);
}
