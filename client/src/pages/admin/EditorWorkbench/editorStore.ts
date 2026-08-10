/**
 * editorStore.ts — 编辑器全局状态（Zustand）
 * 作为 Puck 引擎与自定义面板之间的桥梁
 */
import { create } from "zustand";

export interface EditorState {
  /** Puck 页面数据 */
  pageData: any;
  /** 当前选中的 Block ID */
  selectedItemId: string | null;
  /** 当前选中的 Block 类型 */
  selectedItemType: string | null;
  /** 草稿保存时间 */
  lastSaved: string | null;

  setPageData: (data: any) => void;
  setSelectedItem: (id: string | null, type: string | null) => void;
  setLastSaved: (time: string | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  pageData: null,
  selectedItemId: null,
  selectedItemType: null,
  lastSaved: null,

  setPageData: (data) => set({ pageData: data }),
  setSelectedItem: (id, type) =>
    set({ selectedItemId: id, selectedItemType: type }),
  setLastSaved: (time) => set({ lastSaved: time }),
}));
