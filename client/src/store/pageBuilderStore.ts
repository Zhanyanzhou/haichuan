/**
 * 页面构建器 Zustand Store
 * — 统一管理 selectedModuleId / hoveredModuleId / modules / viewport / dirty 状态
 */
import { create } from 'zustand';
import type { PageModule } from '@/types/pageModule';

export type Device = 'desktop' | 'tablet' | 'mobile';
export type EditorMode = 'edit' | 'preview';

interface PageBuilderState {
  pageKey: string;
  modules: PageModule[];
  selectedModuleId: number | null;
  hoveredModuleId: number | null;
  viewport: Device;
  editorMode: EditorMode;
  isDirty: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  lastSavedAt: string | null;
  saveError: string | null;
  publishError: string | null;
  history: PageModule[][];
  historyIndex: number;

  // actions
  setPageKey: (key: string) => void;
  setModules: (modules: PageModule[]) => void;
  selectModule: (id: number | null) => void;
  hoverModule: (id: number | null) => void;
  patchModule: (id: number, patch: Partial<PageModule>) => void;
  addModule: (module: PageModule) => void;
  removeModule: (id: number) => void;
  moveModule: (id: number, direction: 'up' | 'down') => void;
  toggleModuleVisible: (id: number) => void;
  setViewport: (vp: Device) => void;
  setEditorMode: (mode: EditorMode) => void;
  markDirty: () => void;
  markClean: () => void;
  setSaving: (v: boolean) => void;
  setPublishing: (v: boolean) => void;
  setSaveError: (e: string | null) => void;
  setPublishError: (e: string | null) => void;
  setLastSavedAt: (t: string | null) => void;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  resetStore: () => void;
}

const initialState = {
  pageKey: 'home',
  modules: [] as PageModule[],
  selectedModuleId: null as number | null,
  hoveredModuleId: null as number | null,
  viewport: 'desktop' as Device,
  editorMode: 'edit' as EditorMode,
  isDirty: false,
  isSaving: false,
  isPublishing: false,
  lastSavedAt: null as string | null,
  saveError: null as string | null,
  publishError: null as string | null,
  history: [] as PageModule[][],
  historyIndex: -1,
};

const MAX_HISTORY = 50;

export const usePageBuilderStore = create<PageBuilderState>((set, get) => ({
  ...initialState,

  pushHistory: () => {
    const { modules, history, historyIndex } = get();
    const snapshot = JSON.parse(JSON.stringify(modules));
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(snapshot);
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIdx = historyIndex - 1;
    set({ modules: JSON.parse(JSON.stringify(history[newIdx])), historyIndex: newIdx, isDirty: true });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIdx = historyIndex + 1;
    set({ modules: JSON.parse(JSON.stringify(history[newIdx])), historyIndex: newIdx, isDirty: true });
  },

  setPageKey: (key) => set({ pageKey: key }),
  setModules: (modules) => {
    const snapshot = JSON.parse(JSON.stringify(modules));
    set({ modules, history: [snapshot], historyIndex: 0, isDirty: false });
  },

  selectModule: (id) => set({ selectedModuleId: id }),

  hoverModule: (id) => set({ hoveredModuleId: id }),

  patchModule: (id, patch) => {
    get().pushHistory();
    set(state => ({
      modules: state.modules.map(m => m.id === id ? { ...m, ...patch } : m),
      isDirty: true,
    }));
  },

  addModule: (module) => {
    get().pushHistory();
    set(state => ({
      modules: [...state.modules, module],
      selectedModuleId: module.id,
      isDirty: true,
    }));
  },

  removeModule: (id) => {
    get().pushHistory();
    set(state => ({
      modules: state.modules.filter(m => m.id !== id),
      selectedModuleId: state.selectedModuleId === id ? null : state.selectedModuleId,
      isDirty: true,
    }));
  },

  moveModule: (id, direction) => {
    get().pushHistory();
    set(state => {
      const idx = state.modules.findIndex(m => m.id === id);
      if (idx < 0) return state;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= state.modules.length) return state;
      const arr = [...state.modules];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return { modules: arr, isDirty: true };
    });
  },

  toggleModuleVisible: (id) => {
    get().pushHistory();
    set(state => ({
      modules: state.modules.map(m => m.id === id ? { ...m, isVisible: !m.isVisible } : m),
      isDirty: true,
    }));
  },

  setViewport: (vp) => set({ viewport: vp }),
  setEditorMode: (mode) => set({ editorMode: mode }),

  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false, lastSavedAt: new Date().toISOString() }),
  setSaving: (v) => set({ isSaving: v }),
  setPublishing: (v) => set({ isPublishing: v }),
  setSaveError: (e) => set({ saveError: e }),
  setPublishError: (e) => set({ publishError: e }),
  setLastSavedAt: (t) => set({ lastSavedAt: t }),

  resetStore: () => set(initialState),
}));
